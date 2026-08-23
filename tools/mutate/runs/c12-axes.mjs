// The axis, mutated — C12 I22, and every row here renders a plausible plot.
//
// **An axis is the part of this component where wrong looks most like right.**
// A tick at 23.4 is a real value at a real row; a bound that did not snap is the
// data's own; a precision that trimmed its zero is the same number. None of the
// four is visible to a count, a height or a width, which is why the frames in
// `plot.test.ts`'s golden set carry them and why two rows below are about a
// range no metric produces.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/plot.test.ts test/contract/plot.test.ts test/golden/plot.test.ts";
const AXES = "src/presentation/plot/axes.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
/**
 * **A timeout, because one mutation here restores a *hang* rather than a wrong
 * answer.** `execSync` without one waits forever, so the pass that exists to
 * prove the guard is load-bearing is the thing the missing guard stops. Every
 * other run in this directory has the same exposure and no subject for it; this
 * one has the subject, so it carries the fix.
 *
 * A timed-out child is reported as a kill: the suite did not pass, which is what
 * `runPass` is asking, and a mutation that makes the renderer never return has
 * failed the suite in the most complete way available.
 */
const TIMEOUT_MS = 120_000;

const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: TIMEOUT_MS });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    // **`code`, not `killed`** — measured, because the first version read
    // `e.killed` and it is `undefined` on a timed-out `execSync`; node sets
    // `code: "ETIMEDOUT"` and `signal: "SIGTERM"`. The guard written to prove a
    // guard was checking a field that is never set, and the row went on
    // reporting NO SUMMARY: the pass is what said so, which is the argument for
    // running one over an instrument as well as over a renderer.
    return e.code === "ETIMEDOUT"
      ? `${out}\nTIMED OUT after ${TIMEOUT_MS}ms — the render did not return`
      : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: AXES,
    from: "  const step = niceNumber(span / (wanted - 1), true);",
    to: "  const step = span / (wanted - 1);",
    why: "no rounding at all — the axis divides its range into intervals, which is the thing nice numbers replaces. If this survives, nothing reads a tick value and no row below is earned",
  },
  mutations: [
    {
      // **2.5 out of the set**, which is Heckbert's original and is the one
      // omission that matters here: a span of 100 over five ticks then picks 20,
      // and `0 · 25 · 50 · 75 · 100` becomes unreachable.
      name: "2.5 leaves the admissible steps, so quarters are unreachable",
      file: AXES,
      from: "        : fraction < 3.5\n          ? 2.5",
      to: "        : fraction < 3.5\n          ? 2",
      expect: "T1.12",
    },
    {
      // **THE RULE INTERACTION** (C04 I29): the snap applied to a declared bound.
      // A pinned axis exists so two plots can be compared, and one that grew is
      // a comparison against a scale the surface did not choose — still a plot,
      // still labelled, and no longer the thing it was pinned for.
      name: "THE INTERACTION: a declared bound snaps outward like a derived one",
      file: AXES,
      from: "  const min = pin.yMin === undefined ? Math.floor(range.min / step) * step : range.min;\n  const max = pin.yMax === undefined ? Math.ceil(range.max / step) * step : range.max;",
      to: "  const min = Math.floor(range.min / step) * step;\n  const max = Math.ceil(range.max / step) * step;",
      expect: "T1.12",
    },
    {
      // The bounds not snapped at all — tight labelling. Every label is still a
      // number at its own row and the ends read `0.0874` again, which is the
      // state this step replaced.
      name: "the bounds do not snap, so the ends are the data's again",
      file: AXES,
      from: "  const min = pin.yMin === undefined ? Math.floor(range.min / step) * step : range.min;",
      to: "  const min = range.min;",
      expect: "T1.12",
    },
    {
      // **The precision from the span rather than the step**, which is the same
      // number divided by the tick count — right when there were three labels
      // and wrong the moment there are more, in the direction that drops a digit
      // two adjacent ticks differ by.
      name: "the precision comes from the span, not from the step",
      file: AXES,
      from: "  const places = axis.step > 0 ? stepDecimals(axis.step) : undefined;",
      to: "  const places = axis.step > 0 ? decimalsFor(axis.range.max - axis.range.min) : undefined;",
      expect: "T1.12",
    },
    {
      // **F177 restored**: the shared precision trimmed back out of the string,
      // so `0.20 0.15 0.10` renders as three precisions. The arithmetic still
      // shares one, which is why reading the prose agreed with the defect.
      name: "THE DEFECT: a named precision is trimmed back to three",
      file: AXES,
      from: "    const held = v.toFixed(wanted);",
      to: "    const held = String(Number(v.toFixed(wanted)));",
      expect: "T1.12",
    },
    {
      // The abut rule gone: a tick lands on the row next to a kept one and two
      // labels read as one two-line label. Measured at eight rows, where five
      // ticks put `50%` and `25%` on rows 4 and 5.
      name: "a tick that abuts its neighbour is kept",
      file: AXES,
      from: "    if (taken.some((t) => Math.abs(t - row) < MIN_LABEL_GAP)) continue;",
      to: "    if (taken.some((t) => t === row)) continue;",
      expect: "T1.12",
    },
    {
      // **F178 restored, and it does not hang** — because the second guard
      // catches what the first one now returns. Both are here: this row proves
      // the zero-step guard is load-bearing, and the next proves `niceNumber`
      // answering `1` is a defect on its own.
      name: "a step of zero is used anyway, and the range becomes NaN",
      file: AXES,
      from: "  if (!(step > 0) || !Number.isFinite(step)) {\n    return { range, ticks: [range.min, range.max], step: 0 };\n  }",
      to: "  if (false) {\n    return { range, ticks: [range.min, range.max], step: 0 };\n  }",
      expect: "T1.12",
    },
    {
      // **The plausible constant.** `1` terminates, every number is finite, and
      // a denormal range is snapped to `0 … 1` — the data swamped by three
      // hundred orders of magnitude, in a frame that looks like an idle series.
      name: "an unpickable step answers 1, which terminates and lies",
      file: AXES,
      from: "  if (!Number.isFinite(rough) || rough <= 0) return 0;",
      to: "  if (!Number.isFinite(rough) || rough <= 0) return 1;",
      expect: "T1.12",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
