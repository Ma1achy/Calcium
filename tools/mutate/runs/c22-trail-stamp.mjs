// C22 I131, C04 I109, C09 I133 — the trail's one-shot, stamped by the shell per
// arrival and read by the band (ruling 81; review batch 4, round 2). Mutated
// (C09 T6.188, C22 T6.134–T6.137).
//
// **Two halves, two rows, on purpose.** C09's T1.150 stamps `trailSince` by hand
// and reads the band; C22's T1.78 drives the store and reads the stamp. A row
// through the whole session would pass a store that never stamps as long as the
// band read something else that moved — so each half is asked by name.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const TRAIL = "src/presentation/blocks/kinds/simple.ts";
const STORE = "src/shell/one-shots.ts";
const GATE = "src/data/viewmodel/validate.ts";
const TYPES = "src/data/viewmodel/types.ts";
const FILES = [
  "test/unit/stream-trail.test.ts",
  "test/contract/view-model.test.ts",
].join(" ");

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 600_000 });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.killed === true ? `${out}\nTIMED OUT after 600000ms` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    // **A change both halves can see**: every stamp a thousand ticks late, so
    // T1.78's ticks are all wrong. T1.150 stamps by hand and does not see it,
    // which is the separation the header argues for.
    file: STORE,
    from: "  return { ...notice, trailSince: held.since };",
    to: "  return { ...notice, trailSince: held.since + 1000 };",
    why: "every trail stamp is a thousand ticks late, so each of T1.78's stamps is wrong",
  },
  mutations: [
    {
      // **THE DEFECT (C09 I133)**: the band's ramp carries no `since`, so the
      // ripple holds its not-started frame — what the tree drew before ruling 81.
      name: "THE DEFECT: the trail's ramp is built without since",
      file: TRAIL,
      from: "        ...(effect !== undefined && block.trailSince !== undefined && RAMP_ONE_SHOTS.has(effect) ? { since: block.trailSince } : {}),\n",
      to: "",
      expect: "T1.150",
    },
    {
      // **The form's effect not looked up**: ripple drawn as a still gradient.
      name: "TRAIL_ANIMATION leaves out ripple",
      file: TYPES,
      from: "export const TRAIL_ANIMATION: Readonly<Partial<Record<TrailForm, RampAnimation>>> = Object.freeze({\n  ripple: \"ripple\",\n});",
      to: "export const TRAIL_ANIMATION: Readonly<Partial<Record<TrailForm, RampAnimation>>> = Object.freeze({});",
      expect: "T1.150",
    },
    {
      // **THE DEFECT at the store (C22 I131)**: the trail arm never runs.
      name: "THE DEFECT: the store does not stamp the trail",
      file: STORE,
      from: "      if (next.kind === \"notice\") next = stampTrail(next as Notice, stamps, tick);",
      to: "",
      expect: "T1.78",
    },
    {
      // **The arrival dropped from the identity**: the first stamp is kept for
      // the life of the stream, so only the first arrival ripples.
      name: "the arrival dropped from the trail's identity",
      file: STORE,
      from: "  if (held === undefined || held.arrival !== arrival) {",
      to: "  if (held === undefined) {",
      expect: "T1.78",
    },
    {
      // **Re-taken on every new array** — a poll re-emitting the same text
      // restarts the ring.
      name: "the trail's stamp re-taken on every new array",
      file: STORE,
      from: "  if (held === undefined || held.arrival !== arrival) {",
      to: "  if (true) {",
      expect: "T1.78",
    },
    {
      // **A producer's stamp overwritten** (§6o.2 row 7's rule for the trail).
      name: "a producer's trailSince overwritten",
      file: STORE,
      from: "  if (notice.streaming !== true || notice.trailSince !== undefined || notice.trail === undefined) return notice;",
      to: "  if (notice.streaming !== true || notice.trail === undefined) return notice;",
      expect: "T1.78",
    },
    {
      // **A settled notice stamped** — inert on screen, and a stamp nothing reads.
      name: "a settled ripple notice is stamped",
      file: STORE,
      from: "  if (notice.streaming !== true || notice.trailSince !== undefined || notice.trail === undefined) return notice;",
      to: "  if (notice.trailSince !== undefined || notice.trail === undefined) return notice;",
      expect: "T1.78",
    },
    {
      // **The gate's form check gone**: a stamp on a still trail passes.
      name: "trailSince accepted on a trail that does not animate once",
      file: GATE,
      from: "      } else if (effect === undefined || !RAMP_ONE_SHOTS.has(effect)) {",
      to: "      } else if (false) {",
      expect: "T2.153",
    },
    {
      // **No range**: a negative tick passes.
      name: "trailSince has no lower bound",
      file: GATE,
      from: "!Number.isFinite(trailSince) || trailSince < 0) {",
      to: "!Number.isFinite(trailSince)) {",
      expect: "T2.153",
    },
  ],
});

// Printed and exited on, not merely computed (F768).
console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
