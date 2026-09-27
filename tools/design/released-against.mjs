// Compares the released baseline with the copy on another ref — `origin/main` in
// CI (AUTHORITY.md §Release, clause 4).
//
//     node tools/design/released-against.mjs [--ref <ref>] [--repo <dir>] [--dir <dir>]
//
// **Why a second comparison, when `lint-immutable.mjs` already guards the
// baseline.** That lint compares the registry with the baseline *in the same
// tree*, so a branch that edits both — rewrites a sealed entry and recomputes
// the anchor — passes it. The anchor is a tripwire, not a seal, and the lint
// says so in its first line: *the anchor must be sealed externally*. This is
// the external seal: a copy the branch cannot edit.
//
// **What may move.** An entry on the ref is kept on the branch, with the same
// digest and the same `supersedes`. Its status moves only along the legal
// transitions — `current` or `example` to `superseded` — and its
// `supersededBy` only from empty to non-empty, and only with that transition.
// That is clause 2's *a release only adds* read as a statement about records:
// a supersession adds the successor and a link, and removes nothing.
//
// **A ref that holds no baseline passes, and says so; a ref that does not
// resolve fails.** The first is the state before the first release reaches
// main. The second is a shallow clone that never fetched the ref, and a check
// that passed there would pass on every runner that forgot the fetch.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : fallback;
};
const repo = resolve(opt("--repo", resolve(here, "../..")));
const dir = resolve(opt("--dir", join(repo, "docs/design/language")));
const ref = opt("--ref", "origin/main");
const path = relative(repo, join(dir, "released-baseline.json")).split("\\").join("/");

const git = (...a) => spawnSync("git", ["-C", repo, ...a], { encoding: "utf8" });
if (git("rev-parse", "--verify", "--quiet", `${ref}^{commit}`).status !== 0) {
  console.error(`FAIL · ${ref} does not resolve in ${repo} — fetch it; a check with nothing to compare is not a pass`);
  process.exit(1);
}
if (git("cat-file", "-e", `${ref}:${path}`).status !== 0) {
  console.log(`OK · ${ref} holds no ${path} — nothing is released there yet`);
  process.exit(0);
}
const shown = git("show", `${ref}:${path}`);
if (shown.status !== 0) {
  console.error(`FAIL · git show ${ref}:${path}: ${shown.stderr.trim()}`);
  process.exit(1);
}
const was = JSON.parse(shown.stdout);
const now = JSON.parse(readFileSync(join(dir, "released-baseline.json"), "utf8"));

let bad = 0;
const fail = (m) => { console.error(`  ${m}`); bad += 1; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const LEGAL = { current: ["current", "superseded"], example: ["example", "superseded"], superseded: ["superseded"] };

// **Both maps, one walk** (AUTHORITY §Release 5). A ref whose baseline predates
// sealed theme rules holds none, and every theme rule here is an addition.
let kept = 0;
let added = 0;
for (const map of ["rules", "themeRules"]) {
  const wasMap = was[map] ?? {};
  const nowMap = now[map] ?? {};
  for (const [id, w] of Object.entries(wasMap)) {
    const n = nowMap[id];
    if (n === undefined) { fail(`${id}: REMOVED — it is sealed on ${ref}`); continue; }
    if (n.digest !== w.digest) fail(`${id}: digest changed from ${ref}'s`);
    if (!same(n.supersedes, w.supersedes)) fail(`${id}: supersedes changed from ${ref}'s`);
    if (!(LEGAL[w.status] ?? [w.status]).includes(n.status)) fail(`${id}: status ${w.status} → ${n.status} is not a legal transition`);
    const linked = w.supersededBy.length === 0 && n.supersededBy.length > 0 && w.status !== "superseded" && n.status === "superseded";
    if (!same(n.supersededBy, w.supersededBy) && !linked) fail(`${id}: supersededBy changed from ${ref}'s`);
  }
  kept += Object.keys(wasMap).length;
  added += Object.keys(nowMap).filter((id) => !(id in wasMap)).length;
}
console.log(bad > 0
  ? `FAIL · ${String(bad)} changes to entries sealed on ${ref}`
  : `OK · ${String(kept)} entries sealed on ${ref} kept, ${String(added)} added`);
process.exit(bad > 0 ? 1 : 0);
