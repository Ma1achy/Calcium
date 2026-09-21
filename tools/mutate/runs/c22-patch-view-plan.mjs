// C22 I41 — the pushed view holds the window plan beside its offset, a cache
// and not a cursor: keyed on the block's identity and the region's width,
// re-derived when either moves, its misses reported as absent, rev and width.
// Mutated (T6.116, F1187).
//
// **The frames are the same whether the cache is right or wrong in most
// arrangements** — a plan held across a resize is refused by window.ts and a
// plan held across a patch renders the old block — so T3.41 reads the misses
// through the probe as well as the frame, and the mutations here are cut
// against both.
//
// **The control is the store's name.** `patch-view-plans` reaches the deck
// under another label and no frame moves; T3.41 filters on the name and sees
// it.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/patch-view.test.ts";
const V = "src/shell/patch-view.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const BUFFER = 256 * 1024 * 1024;
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: BUFFER });
  } catch (e) {
    if (e.killed === true) return "the suite did not return — timed out";
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: V,
    from: "const PLAN_CACHE = \"patch-view-plan\";",
    to: "const PLAN_CACHE = \"patch-view-plans\";",
    why: "the store renamed: no frame moves and T3.41's filter on the name sees it",
  },
  mutations: [
    {
      // **Kept across a patch.** The block is a new object and the plan is not
      // re-derived; the view renders the plan's block, which is the old one.
      name: "KEPT-ACROSS-PATCH: a plan for another block is held and rendered",
      file: V,
      from: "    else if (held.patch !== patch) probe.miss(PLAN_CACHE, \"rev\");",
      to: "    else if (held.patch !== held.patch) probe.miss(PLAN_CACHE, \"rev\");",
      expect: "T3.41",
    },
    {
      // **Kept across a resize.** The plan is for the old width; window.ts
      // refuses it, so the motion throws where a frame was due.
      name: "KEPT-ACROSS-RESIZE: a plan for another width is held",
      file: V,
      from: "    else if (held.width !== width) probe.miss(PLAN_CACHE, \"width\");",
      to: "    else if (held.width !== held.width) probe.miss(PLAN_CACHE, \"width\");",
      expect: "T3.41",
    },
    {
      // **The re-derived plan not held after a motion.** Every motion at the
      // new width misses `width` again — a cache that never warms.
      name: "NOT-HELD-ON-MOVE: the motion keeps the offset and drops the plan it derived",
      file: V,
      from: "      state = { ...at, plan, offset };",
      to: "      state = { ...at, offset };",
      expect: "T3.41",
    },
    {
      // **The first derivation silent.** A store that never reports `absent`
      // reads as one that was never asked.
      name: "OPEN-SILENT: the plan derived on open reports no miss",
      file: V,
      from: "    if (held === null) probe.miss(PLAN_CACHE, \"absent\");",
      to: "    if (held === null) void 0;",
      expect: "T3.41",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
