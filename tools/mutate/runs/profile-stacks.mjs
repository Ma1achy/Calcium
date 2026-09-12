// C28 §3c — the sampled stack card, mutated (C28 I62, I63, I64; §9b B19–B24, S17–S20).
//
// **What this run is for.** Every claim the fold makes is about what it does
// with a shape nobody in this tree produces: V8 emits the `.cpuprofile` and the
// fold decides what is honest to draw from it. A figure built from a bad fold
// renders — that is the whole hazard — so each mutation here is one of the ways
// a tree could be self-consistent and about a different window: a partial zip,
// a dropped orphan, a tree of real names at zero, the synthetic frames left in.
//
// **Applied by hand on the day the rows landed**, and the counts in the tail are
// from that pass. The control drops the tier refusal from the capture verb,
// which T1.128 asserts at three tiers — a survivor set holding the control is a
// run that did not execute the suites.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
// **The e2e row is not in the corpus and that is a limit, not an omission.**
// T1.127 needs a real `node:inspector` and runs against `dist/`, and a build
// while a hand mutation is live compiles the mutation into `dist/` (F608). So
// the stamp's position is mutated against the unit rows here and checked by
// hand on the e2e row separately.
const CMD =
  "npx vitest run test/unit/profile-deck.test.ts test/unit/local-profile.test.ts " +
  "test/unit/profile-register.test.ts";

const STACKS = "src/shell/profiling/stacks.ts";
const KIT = "src/shell/profiling/panes/kit.ts";
const HANDLERS = "src/shell/local/handlers.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: HANDLERS,
    from: "    if (TIER_RANK[r.regime.tier] < TIER_RANK.deep) {",
    to: "    if (false) {",
    why: "the capture verb without its tier refusal answers no notice at three tiers and takes a capture at all of them; a run where this survives is not executing T1.128",
  },
  mutations: [
    {
      // §9b B22 — the zip that attributes part of a window.
      name: "unequal samples and deltas zip to the shorter",
      file: STACKS,
      from: "  if (samples.length !== deltas.length) return null;",
      to: "",
      expect: "T1.123",
    },
    {
      // §9b B21 — the orphan folded into a real frame. **The total is conserved
      // either way**, which is why T1.123 asserts the named node.
      name: "a sample no node declares is dropped",
      file: STACKS,
      from: "    else unattributed += us;",
      to: "    else { /* dropped */ }",
      expect: "T1.123",
    },
    {
      // §9b B19 — the tree of real names at zero, which is C28 I11's defect with a
      // picture on it and the one figure a reader cannot doubt.
      name: "an unsampled window still folds to a tree",
      file: STACKS,
      from: "  if (real === 0 && unattributed === 0) return null;",
      to: "",
      expect: "T1.122",
    },
    {
      // C28 I63 — the frames stay in the tree, so `(idle)` is the widest tile.
      name: "the synthetic frames are not excluded from the tree",
      file: STACKS,
      from: "    if (SYNTHETIC.includes(name)) return kids;",
      to: "",
      expect: "T1.124",
    },
    {
      // C28 I63, the other half — out of the tree and out of the record, so the
      // card draws a correct figure over a window it cannot account for.
      name: "the excluded share is not carried out with the frames",
      file: STACKS,
      from: "    if (SYNTHETIC.includes(name)) excluded[name] = (excluded[name] ?? 0) + us;",
      to: "    if (SYNTHETIC.includes(name)) { /* dropped */ }",
      expect: "T1.124",
    },
    {
      // §9b S17 — newest rather than completed, so the card blanks for the
      // length of a second capture's window.
      name: "the card takes the newest capture rather than the last completed one",
      file: KIT,
      from: "  return [...cpu].reverse().find((c) => c.stacks !== null) ?? cpu[cpu.length - 1];",
      to: "  return cpu[cpu.length - 1];",
      expect: "T1.126",
    },
  ],
});

// `report` **returns** the lines; a bare call discards them, and the exit code
// is then one bit — the same bit for *survived* and *printed nothing* (F768).
console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
