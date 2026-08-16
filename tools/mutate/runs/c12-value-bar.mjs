// The value bar, mutated — and the rows are the four ways a run lies.
//
// **Every one of these renders.** A bar is the easiest thing in this component
// to get wrong invisibly: the row is the right width, the glyphs are the right
// glyphs, and only the *relationship* between the run and the number is wrong.
// That is why the frame is in `states.test.ts` and why three of these are
// asserted as a difference between two frames rather than against one.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/plot.test.ts test/golden/states.test.ts";
const BAR = "src/presentation/plot/bar.ts";
const RAMP = "src/presentation/plot/ramp.ts";

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
    file: BAR,
    from: "  const w = Math.max(0, Math.floor(width));",
    to: "  const w = 0;",
    why: "a bar of no cells at all — if this survives, nothing reads the run and no row below is earned",
  },
  mutations: [
    {
      // **THE DEFECT `progress` had**, restored here: the number read off the
      // clamped fill, so `101.2` of `100` and `100` of `100` become one picture
      // and one of them says *saturated* about something that is not.
      name: "THE DEFECT: the number is clamped with the fill",
      file: BAR,
      from: "  const number = formatReadout(spec.value, spec.format);",
      to: "  const number = formatReadout(Math.min(spec.value, spec.max), spec.format);",
      expect: "T1.25",
    },
    {
      // **Absence drawn as an empty run**, which is the one geometry where an
      // empty drawing is a legible value: a blank run reads as zero, and this is
      // the collision the mark exists to refuse.
      name: "an absent value draws an empty run, which reads as zero",
      file: BAR,
      from: "  if (spec.value === null || !Number.isFinite(spec.value)) return pad(mark.absent);",
      to: "  if (spec.value === null || !Number.isFinite(spec.value)) return pad(\"\");",
      expect: "T1.26",
    },
    {
      // The fill unclamped: a run longer than its cells, so the row runs past
      // the width and the terminal wraps a line no measurer counted.
      name: "the fill is unclamped, so the run exceeds its cells",
      file: BAR,
      from: "  const fill = Math.round(Math.min(1, Math.max(0, t)) * run);",
      to: "  const fill = Math.round(Math.max(0, t) * run);",
      expect: "T1.27",
    },
    {
      // The zero-span guard: `max === min` is a division by zero one form over,
      // and a full run for *zero of nothing* is the confident wrong answer.
      name: "a scale with no extent divides anyway",
      file: BAR,
      from: "  const t = span <= 0 ? 0 : (spec.value - min) / span;",
      to: "  const t = (spec.value - min) / span;",
      expect: "T1.27",
    },
    {
      // **The alphabet stops substituting**, which is the defect this function
      // was moved out of the app to fix: at `LANG=C` the blocks passed through
      // untouched beside a plot that had correctly degraded.
      //
      // **Re-anchored onto `pairFor`, where the capability read moved** when the
      // encoding rule landed and `ALPHABET` became the `fill` pair. Stale for a
      // commit and invisible while it was — a single-quoted anchor, F173's blind
      // spot. The mutation still kills, run rather than assumed.
      name: "the alphabet ignores the capability",
      file: RAMP,
      from: '  if (caps.unicode === "ascii") {\n',
      to: "  if (false) {\n",
      expect: "T1.27",
    },
    {
      // The number given the residual instead of the run. It reads as a tidy
      // symmetry and it inverts the encoding: the run is the axis, so the run is
      // what may shrink.
      name: "the run takes a fixed width and the number takes the residual",
      file: BAR,
      from: "  const run = w - cells(number, caps.ambiguousWidth) - 1;",
      to: "  const run = Math.min(8, Math.max(0, w - 1));",
      expect: "T1.27",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
