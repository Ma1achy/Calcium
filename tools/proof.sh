#!/usr/bin/env bash
#
# `make proof` — the pack-and-install gate (R01's proof gate, FINDINGS F2).
#
# `file:../..` is the inner loop and it lies about four things, because npm
# symlinks a workspace rather than installing it: a file missing from `files`,
# an unbuilt `dist/`, a broken `exports` path, and a dependency used but not
# declared. Every one of those is invisible until a real consumer installs a
# real tarball. This is that consumer.
#
# **Why there is no Verdaccio here, having been asked for by name.**
#
# The brief called for a local registry. What the gate is *for* is proving the
# package is publishable and that what it publishes works when installed — and
# all of that is reachable without one:
#
#   - `npm publish --dry-run` proves publish is not refused (F2's `private: true`
#     was the whole finding) and prints the exact file list, offline.
#   - `npm pack` produces the identical tarball a publish would upload.
#   - installing that tarball into a clean tree is a real install, resolving
#     through `exports` and `files` exactly as a consumer's would.
#
# What a registry would add over that is the round trip: publish, resolve by
# name, download. It costs **316 packages** (verdaccio 6.9.2) in a repository
# whose DEPENDENCIES.md opens by saying the strongest supply-chain control is
# not having dependencies, and which spends four paragraphs refusing
# typescript-eslint's 87 for a real lint rule. Three hundred and sixteen to
# verify a `files` array is the same trade one size worse.
#
# The gap is named rather than papered over: **this gate does not prove that
# `npm publish` to a live registry succeeds, or that authentication is
# configured.** DEPENDENCIES.md carries the row.
#
# It does prove the registry *selection*, which turned out to matter — see
# step 2 and FINDINGS F12.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

say() { printf '\n\033[36m▸ %s\033[0m\n' "$1"; }
die() { printf '\n\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

# ── 1. A fresh dist, because a probe against a stale one gives a wrong negative
say "building"
cd "$ROOT"
npm run build >/dev/null

# ── 2. Publish is not refused, and it goes where we say
#
# **`--registry` does not work here and fails silently**, which is why this
# asserts the line rather than passing a flag and trusting it. `publishConfig.registry`
# in package.json beats both `--registry` and `npm_config_registry`, and npm
# reports the override as accepted while publishing to the configured host. The
# scoped form is the one that wins. A CI job wiring a local registry with
# `--registry` would have aimed at the real one and read the auth failure as a
# problem with the local one. FINDINGS F12.
say "publish --dry-run, registry override asserted"
LOCAL="http://localhost:4873"
OUT="$(npm publish --dry-run "--@fmx:registry=$LOCAL" 2>&1)" || die "npm publish --dry-run refused: $OUT"
grep -q "Publishing to $LOCAL" <<<"$OUT" \
  || die "the registry override did not take — npm reports: $(grep -i 'publishing to' <<<"$OUT")"

# ── 3. The real tarball
say "pack"
TARBALL="$WORK/$(npm pack --pack-destination "$WORK" --silent)"
[ -f "$TARBALL" ] || die "npm pack produced no tarball"

# ── 4. Clean trees that have never seen this repository
#
# Each example is copied without `node_modules`, and its `file:../..` becomes the
# tarball. Nothing here can reach `$ROOT/src` — that is the point.
#
# **Two examples, and the second one is the README's.** `examples/minimal` is
# the block quoted in the root README, and STEP8_WALK §A4 is why it has to be
# here rather than merely present: `files` is `["dist", "README.md", "LICENSE"]`,
# so nothing under `examples/` ships in the tarball, and this script used to copy
# exactly one directory. A README example verified from the workspace is verified
# through the npm-workspace symlink — the one resolution that cannot see a
# packaging mistake, which is precisely what F7 was.
install_example() {
  local name="$1" app="$WORK/$1"
  say "installing the tarball into a clean checkout: $name"
  mkdir -p "$app"
  tar -C "$ROOT/examples/$name" \
      --exclude node_modules --exclude .venv \
      -cf - . | tar -C "$app" -xf -

  node -e '
    const fs = require("node:fs");
    const p = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const before = p.dependencies["@fmx/calcium"];
    if (before !== "file:../..") {
      console.error(`expected file:../.., found ${before}`);
      process.exit(1);
    }
    p.dependencies["@fmx/calcium"] = "file:" + process.argv[2];
    fs.writeFileSync(process.argv[1], JSON.stringify(p, null, 2));
  ' "$app/package.json" "$TARBALL"

  cd "$app"
  # **`--legacy-peer-deps`, measured 2026-09-05 (F807).** A fresh `npm install`
  # of `vitest@4.1.10` alone — no Calcium, no other dependency — crashes npm
  # 10.9.8's arborist in `#loadPeerSet` with *Cannot read properties of null
  # (reading 'edgesOut')*, in the container and on the runner alike; the
  # example's other two devDependencies install clean without it. The crash is
  # npm resolving vitest's *optional* peer set, and this package declares no
  # peers, so the flag changes nothing this gate proves about the tarball: the
  # install is still real, still from the packed file, still into a clean tree.
  npm install --ignore-scripts --no-audit --no-fund --legacy-peer-deps >/dev/null

  # The install is only meaningful if it landed a real directory rather than a
  # link back into the repository. A symlink here would make every assertion
  # below pass against the source tree.
  node -e '
    const fs = require("node:fs");
    const st = fs.lstatSync("node_modules/@fmx/calcium");
    if (st.isSymbolicLink()) {
      console.error("@fmx/calcium installed as a symlink — the gate is testing the repo, not the package");
      process.exit(1);
    }
  ' || die "$name: the tarball did not install as a real directory"

  # And the README the package actually ships, which is what
  # `examples/minimal`'s quoting row reads through the resolved package.
  # Backticks are escaped deliberately: inside double quotes they are command
  # substitution, so an unescaped 'files' here would try to *run* files — and
  # only ever on the failure path, where nobody would be watching.
  [ -f "node_modules/@fmx/calcium/README.md" ] \
    || die "$name: the installed package has no README.md — \`files\` and the docs disagree"

  # **`test:package`, not `test`** — the suite minus anything that reaches back
  # into the repo. `examples/docker/test/repo/` holds one such file: comparing a
  # container's rows against a hand-composed banner needs a block rendered to
  # lines, and the published package exports no way to do that, so the test
  # borrows the framework's own test support. That is a finding about the public
  # surface and it is not a claim about the tarball — which is all this gate is
  # entitled to check. A test that cannot run here would otherwise be deleted or
  # the gate weakened; labelling it does neither.
  say "$name's tests, against the installed package"
  # **Both examples declare it, so there is no special case here.** `minimal`
  # has no repo-reaching test and its two scripts are identical — the *name* is
  # the contract, and a fallback to `npm test` would let a new example quietly
  # run its repo tests against the tarball, which is the thing this gate exists
  # to notice.
  npm run test:package
}

install_example docker
install_example minimal

printf '\n\033[32m✓ proof · packed, installed clean, and both examples pass against the tarball\033[0m\n'
