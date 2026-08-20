// `origin` — C04 I62, C12 §3ac.
//
// **Every row here renders a plot that is arithmetically self-consistent.** A
// flip that reaches the data and not the axis, a gutter whose two ends disagree
// with its own ticks, a crosshair pointing at the mirror sample — each produces
// a frame a reader would accept, and the row count is untouched throughout, so
// nothing that counts rows can see any of them.
//
// **Three of these are defects this component actually had**, found by a test
// and by a golden frame rather than by review: the renumbering `columnsOf`
// needed (OR9), the gutter ends collapsing on a constant range (T1.5) and the
// facing a refused *matrix* form falls back to (eight golden frames).
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const SCALE = "src/presentation/plot/scale.ts";
const AXES = "src/presentation/plot/axes.ts";
const HEAT = "src/presentation/plot/heatmap.ts";
const DEF = "src/presentation/plot/definition.ts";
const CAND = "src/presentation/plot/candles.ts";
const ANN = "src/presentation/plot/annotate.ts";
const VAL = "src/data/viewmodel/validate.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(
      "npx vitest run test/unit/plot-mutations.test.ts test/unit/plot.test.ts test/golden/plot-forms.test.ts 2>&1",
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
    file: SCALE,
    from: `    x: origin === "bottom-right" || origin === "top-right" ? "left" : "right",`,
    to: `    x: "right",`,
    why: "the horizontal half of every origin ignored — if this survives, no row below is reading a flipped frame",
  },
  mutations: [
    {
      // **The vertical half ignored.** Every plot draws the way it always did
      // and the member reads as unimplemented on two of its four corners.
      name: "rowOf ignores the facing",
      file: SCALE,
      from: `  return Math.round((facing.y === "down" ? clamped : 1 - clamped) * last);`,
      to: "  return Math.round((1 - clamped) * last);",
      expect: "OR1",
    },
    {
      // **The answer mirrored instead of the index** (§3ac A6). Correct for
      // every sample count but one: a lone sample sits at `floor((w − 1) / 2)`,
      // which is one cell off its own mirror at an even width.
      name: "columnsOf mirrors the column rather than the index",
      file: SCALE,
      from: `    const at = facing.x === "left" ? span - i : i;`,
      to: "    const at = i;",
      expect: "OR1",
    },
    {
      // **The defect OR9 found.** `iFirst`/`iLast` keep the original numbering,
      // so `next.iFirst === column.iLast + 1` is never true under a left facing
      // and a joined curve draws as a row of disconnected dashes.
      name: "columnsOf records the original index, not the drawn one",
      file: SCALE,
      from: "      buckets.set(x, { x, first: v, min: v, max: v, last: v, iFirst: at, iLast: at });",
      to: "      buckets.set(x, { x, first: v, min: v, max: v, last: v, iFirst: i, iLast: i });",
      expect: "OR9",
    },
    {
      // **The gutter's ends written as literals again** (§3ac A1) — the
      // maximum at the top whichever way the plot faces, so the scale disagrees
      // with its own interior ticks.
      name: "the y gutter's ends do not follow the facing",
      file: AXES,
      from: `    [0, at(facing.y === "down" ? axis.range.min : axis.range.max)],`,
      to: "    [0, at(axis.range.max)],",
      expect: "OR5",
    },
    {
      // **The matrix's columns unflipped.** The wash reads left-to-right under
      // an origin that says otherwise, and the row labels are still correct.
      name: "columnMap is not reversed",
      file: HEAT,
      from: `    facing.x === "left" ? [...m].reverse() : m;`,
      to: "    m;",
      expect: "OR6",
    },
    {
      // **The matrix's rows unflipped**, which is the other half and invisible
      // to any assertion about a column.
      name: "matrixRows does not reverse its row order",
      file: HEAT,
      from: `    const i = facing.y === "up" ? visible - 1 - r : r; // cells-ok — a row index`,
      to: "    const i = r; // cells-ok — a row index",
      expect: "OR6",
    },
    {
      // **The golden-frame defect, restored.** `contour` and `quiver` refuse
      // `origin` and are drawn by the matrix renderer, so falling back to the
      // curve's facing turns them upside down — a commit that was supposed to
      // move no frames moved eight.
      name: "a refused matrix form falls back to the curve's facing",
      file: HEAT,
      from: "  const facing = facingOf(block, FACING_MATRIX);",
      to: "  const facing = facingOf(block, { x: \"right\", y: \"up\" });",
      expect: "contour",
    },
    {
      // **The crosshair does not follow** (§3ac B1). It points at the mirror
      // sample and the readout beside it names a value the reader is not
      // looking at: the frame stays plausible and the number is wrong.
      name: "cursorColumn ignores the facing",
      file: DEF,
      from: `  const at = facing.x === "left" ? span - cursorIdx : cursorIdx; // cells-ok — a sample index`,
      to: "  const at = cursorIdx; // cells-ok — a sample index",
      expect: "OR11",
    },
    {
      // **The candle's placement mirrored rather than its bucket** (§3ac B2).
      // Off by a body width, which is exactly the class §6b B15 is about.
      name: "candleColumn mirrors the column instead of the bucket",
      file: CAND,
      from: `  const faced = facing.x === "left" ? drawn - 1 - bucket : bucket; // cells-ok — a bar index`,
      to: "  const faced = bucket; // cells-ok — a bar index",
      expect: "OR11",
    },
    {
      // **The x ticks number the columns the data no longer occupies**
      // (§3ac B3) — a plot reading right-to-left under a left-to-right axis,
      // and the axis is what a reader trusts to settle it.
      name: "the x tick row ignores the facing",
      file: AXES,
      from: `    const at = columnAt?.(t) ?? Math.round((facing.x === "left" ? 1 - t : t) * (w - 1)); // cells-ok — a column index`,
      to: "    const at = columnAt?.(t) ?? Math.round(t * (w - 1)); // cells-ok — a column index",
      expect: "OR5",
    },
    {
      // **The caller's own three captions left where they were** (§3ac B4).
      // Both halves of the frame look right and only their pairing is wrong,
      // which is the one furniture defect a reader cannot detect from a frame.
      name: "the caller's x captions do not reverse",
      file: AXES,
      from: `  const faced = facing.x === "left" ? [labels[2], labels[1], labels[0]] : labels;`,
      to: "  const faced = labels;",
      expect: "OR5",
    },
    {
      // **The band's fill loop unordered** (§3ac B5). Under a downward facing
      // `rowOf(max)` is the larger row index, so `a → b` runs backwards and the
      // interior vanishes — the failure that looks like the member working.
      name: "the confidence fill loops from a to b rather than ordering them",
      file: ANN,
      from: "    for (let y = Math.min(a, b); y <= Math.max(a, b); y += 1) grid[y]![x] = shade; // cells-ok — a row index",
      to: "    for (let y = a; y <= b; y += 1) grid[y]![x] = shade; // cells-ok — a row index",
      expect: "OR10",
    },
    {
      // **The refusal dropped.** Twenty-nine forms accept a member nothing
      // honours, which is precisely what reads as *not yet implemented*.
      name: "the validator accepts origin on a form that refuses it",
      file: VAL,
      from: "  if (ORIGIN_DEFAULT[form as PlotForm] === null) {",
      to: "  if (false) {",
      expect: "OR7",
    },
    {
      // **The matrix's own caption row, which is a third caption builder.**
      // `furnitureFor` is reached from `axed` and a matrix composes its own,
      // so the first remedy for this branched on `IS_MATRIX` in a function no
      // matrix ever calls — and this mutation surviving is what said so.
      name: "the matrix's x captions do not follow the facing",
      file: HEAT,
      from: "  const labels = xLabelRow(block.xLabels, layout.areaWidth, ctx.capabilities, facingOf(block, FACING_MATRIX));",
      to: "  const labels = xLabelRow(block.xLabels, layout.areaWidth, ctx.capabilities);",
      expect: "OR12",
    },
  ],
});

console.log(report(results));
