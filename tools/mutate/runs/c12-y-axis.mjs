// C12 I15, §3d — one axis per plot, and the second nicing that used to sit
// inside `yLabels`.
//
// **One mutation is missing from this list and the gap is the point.** *The
// empty layout is sized from a bare unit range* was written here, survived, and
// turned out to be a distinction that cannot be violated: with no data the only
// consumer of that layout is `emptyRows`, which reads `layout.width` alone. The
// survivor indicted the **comment** beside the code rather than any row in the
// suite — A03 §2's vacuity class, arriving in a justification.
//
// **Two of these are the defect being reverted rather than an invented flaw**
// (F210): the call-site mutation reintroduces the exact shipped code, and the
// stacked one reintroduces the arm that would have been swept up with it. A
// mutation whose `from` is what the tree held last week is the strongest kind,
// because nothing about it had to be imagined.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const AXES = "src/presentation/plot/axes.ts";
const DEF = "src/presentation/plot/definition.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(
      "npx vitest run test/unit/plot-axes.test.ts test/unit/plot.test.ts test/unit/plot-mutations.test.ts test/revert/plot.test.ts test/golden/plot-forms.test.ts test/golden/plot.test.ts 2>&1",
      { cwd: ROOT, encoding: "utf8", timeout: 300_000 },
    );
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.code === "ETIMEDOUT" ? `${out}\nTIMED OUT` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: AXES,
    from: "  const h = Math.max(1, Math.floor(rows));",
    to: "  const h = 1;",
    why: "every gutter collapses to one label on row 0, so every row about which value sits at which row goes; a run that cannot see that cannot see any row below",
  },
  mutations: [
    {
      // **The shipped defect, restored verbatim.** This is what `overlaidRows`
      // held: the axis niced once more on its way to the gutter.
      name: "the gutter is labelled from a second nicing of the curve's range",
      file: DEF,
      from: "  const labels = hasYLabels(layout) ? yLabels(axis, layout.areaRows, block.yFormat, facing) : [];",
      to: "  const labels = hasYLabels(layout) ? yLabels(axisFor(axis.range, ticksFor(layout.areaRows), block, block.yScale), layout.areaRows, block.yFormat, facing) : [];",
      expect: "YA1",
    },
    {
      // The same, from the other end: the *curve* drawn against the second
      // nicing while the gutter keeps the first. Symmetric, and it fails the
      // frame rows rather than the label rows.
      name: "the curve is rasterised against a range the gutter does not describe",
      file: DEF,
      from: "      : axisFor(data, ticksFor(plotAreaRows(block)), block, block.yScale);",
      to: "      : axisFor(axisFor(data, ticksFor(plotAreaRows(block)), block, block.yScale).range, ticksFor(plotAreaRows(block)), block, block.yScale);",
      expect: "YA1",
    },
    {
      // §3d's ruling that the ends are the area's ends **by definition** — asking
      // `rowOf` for them collapses a constant range onto one row, which is T1.5.
      name: "the gutter's ends are placed by `rowOf` rather than reserved",
      file: AXES,
      from: "  const taken: number[] = [0, h - 1];",
      to: "  const taken: number[] = [rowOf(axis.range.max, axis.range, h, facing), rowOf(axis.range.min, axis.range, h, facing)];",
      expect: "T1.5",
    },
    {
      // The facing swaps which value each end carries, and nothing else about
      // the gutter moves (§3ac A1).
      name: "the gutter's ends ignore the facing",
      file: AXES,
      from: '    [0, at(facing.y === "down" ? axis.range.min : axis.range.max)],',
      to: "    [0, at(axis.range.max)],",
      expect: "OR",
    },
    {
      // **A stacked plot carries bounds, not an axis** — nicing them moves the
      // ink for a scale no reader is given, because the gutter holds names.
      name: "a stacked plot nices the bounds its bands are cut to",
      file: DEF,
      from: "      ? { range: data, ticks: [data.min, data.max], step: 0 }",
      to: "      ? axisFor(data, ticksFor(plotAreaRows(block)), block, block.yScale)",
      expect: "golden",
    },
    {
      // §3d's precision rule: one per axis, from the step. Taken from the second
      // nicing's coarser step it wrote `13` on the row holding `12.5`.
      name: "the labels take the magnitude's decimals rather than the step's",
      file: AXES,
      from: "  const places = axis.step > 0 ? stepDecimals(axis.step) : undefined;",
      to: "  const places = undefined;",
      expect: "YA1",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
