// `tools/proof.sh`'s guards, verified — group 9, instrument 11 of 15.
//
// **The instrument is a shell script, so the fixture runs its actual lines.**
// Extracting the guards into a module to make them testable would have made the
// fixture agree with a copy rather than with the gate; every assertion below
// reads `proof.sh` and exercises what is in it. If a guard is reworded, this
// file fails as stale rather than passing against a line that no longer exists.
//
// **What this instrument claims**: that the package publishes, that the tarball
// installs into a tree that has never seen this repository, and that both
// examples pass against it. It is the only gate that can see a packaging
// mistake — `file:../..` symlinks a workspace, which lies about a missing
// `files` entry, an unbuilt `dist/`, a broken `exports` path and an undeclared
// dependency.
//
// **What distinguishes a broken one**: a guard that reads a plausible value.
// Both of the measured ones are that — npm reporting an override as accepted
// while publishing elsewhere (F12), and an install that resolved back into the
// repository through a symlink (F7).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const SCRIPT = readFileSync("tools/proof.sh", "utf8");
/** **Comments stripped, for the rows that ask about order.** PG8's first draft
 * read `npm pack` out of the header paragraph explaining why there is no
 * Verdaccio — thirty lines above the build — and reported the build as running
 * too late. Prose about a mechanism reads exactly like the mechanism to a
 * search, and this file is four fifths prose by design. Second instance today;
 * the probes' registry scan had the same one. */
const CODE = SCRIPT.replace(/^\s*#.*$/gm, "");

/** A line of the script, or a failure naming what moved. */
function line(pattern: RegExp, what: string): string {
  const m = pattern.exec(SCRIPT);
  if (m === null) {
    throw new Error(
      `proof-guards: ${what} not found in tools/proof.sh. The guard this fixture ` +
        "is written against has moved; the fixture is stale, not passing.",
    );
  }
  return m[0];
}

/** npm's real output, measured today, both ways. */
const LOCAL = "http://localhost:4873";
const TO_LOCAL = `npm notice Publishing to ${LOCAL} with tag latest and default access (dry-run)`;
const TO_CONFIGURED =
  "npm notice Publishing to https://npm.pkg.github.com/ with tag latest and default access (dry-run)";

/** The script's own grep, run against a recorded output. */
function guardAccepts(output: string): boolean {
  const guard = line(/grep -q "Publishing to \$LOCAL"/, "the registry assertion");
  try {
    execFileSync("bash", ["-c", `LOCAL=${LOCAL}; ${guard} <<<"$1"`, "_", output], {
      encoding: "utf8",
    });
    return true;
  } catch {
    return false;
  }
}

describe("proof.sh guards", () => {
  it("PG1: the registry assertion accepts the registry it asked for", () => {
    expect(guardAccepts(TO_LOCAL)).toBe(true);
  });

  it("PG2: and refuses the one npm would have used — the defect, restored", () => {
    // **F12.** `publishConfig.registry` beats both `--registry` and
    // `npm_config_registry`, and npm reports the override as *accepted* while
    // publishing to the configured host. A CI job wiring a local registry with
    // `--registry` would have aimed at the real one and read the auth failure as
    // a problem with the local one. The scoped form is what wins, which is why
    // the script passes `--@fmx:registry=` and then asserts the line rather than
    // trusting the flag.
    expect(guardAccepts(TO_CONFIGURED)).toBe(false);
    expect(TO_CONFIGURED, "and npm really does report it as a publish").toContain(
      "Publishing to",
    );
  });

  it("PG3: the scoped override is what is passed, not the bare flag", () => {
    expect(SCRIPT).toContain("--@fmx:registry=$LOCAL");
    // The bare `--registry` form is the one that fails silently. It must not be
    // what the gate uses.
    expect(/npm publish --dry-run --registry/.test(SCRIPT)).toBe(false);
  });

  it("PG4: the install is checked for being a real directory", () => {
    // **F7's shape.** A symlink here makes every assertion below it pass against
    // the source tree — the one resolution that cannot see a packaging mistake,
    // which is precisely what F7 was.
    const guard = line(/const st = fs\.lstatSync\([^)]*\);/, "the symlink check");
    expect(guard).toContain("lstatSync");
    expect(SCRIPT).toContain("st.isSymbolicLink()");
  });

  it("PG5: and the symlink check would actually catch one", () => {
    // The row PG4 leaves open: that the check *fires*. `lstatSync` on a symlink
    // reports the link and `statSync` follows it — one letter apart, and the
    // wrong one passes against exactly the tree the guard exists to refuse.
    const probe = [
      "d=$(mktemp -d); mkdir $d/real; ln -s $d/real $d/link;",
      `node -e 'const fs=require("node:fs");`,
      `process.exit(fs.lstatSync(process.argv[1]).isSymbolicLink()?7:0)' $d/link;`,
      "echo $?; rm -rf $d",
    ].join(" ");
    const out = execFileSync("bash", ["-c", probe], { encoding: "utf8" }).trim();

    expect(out, "the guard's own call, against a real symlink").toBe("7");
  });

  it("PG6: both examples are installed, and one of them is the README's", () => {
    // **STEP8_WALK §A4.** `files` is `["dist", "README.md", "LICENSE"]`, so
    // nothing under `examples/` ships — and this script used to copy exactly one
    // directory. A README example verified from the workspace is verified
    // through the npm-workspace symlink, which is the resolution that cannot see
    // a packaging mistake.
    expect(SCRIPT).toContain("install_example docker");
    expect(SCRIPT).toContain("install_example minimal");
    expect(SCRIPT, "and the copy excludes node_modules, or it is not a clean tree").toContain(
      "--exclude node_modules",
    );
  });

  it("PG7: the shell cannot sail past a failed step", () => {
    // Not decoration. Without `-e` a failed `npm install` continues to the
    // assertions, which then describe a tree that was never built; without
    // `pipefail` a pipeline's status is its last stage's, which is the mistake
    // this repository has made twice and merged once.
    expect(SCRIPT).toMatch(/^set -euo pipefail$/m);
  });

  it("PG8: the build runs before the pack, so nothing probes a stale dist", () => {
    const build = CODE.indexOf("npm run build");
    const pack = CODE.indexOf("npm pack");
    expect(build).toBeGreaterThan(-1);
    expect(build, "a probe against a stale build gives a wrong negative").toBeLessThan(pack);
  });
});
