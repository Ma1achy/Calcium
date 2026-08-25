// The curve family's seam, mutated — C12 I59, I61, I64, I65, §3ak.7.
//
// **The pass's own claim is what is under test here.** Step 3 says `figureOf`
// is the terminal's computation *moved*, so a decision changed inside it must
// change the terminal's frame — and where it does not, the member has no
// consumer yet and that is F84's class rather than a licence.
//
// **Two rows are about the seam and not about a renderer.** The `orientation`
// and run-break rows mutate a shared decision that the terminal reads *through*
// its own rasteriser, which is the only place a shared layer can be wrong in a
// way both arms agree about.
//
// **Stated survivor, so an unrecorded limit does not read as strength.**
// `Figure.frame` is not mutated: `definition.ts` still applies `block.plotFrame`
// to the layout directly, so nothing reads the member and a mutation on it would
// fail nothing by construction. It closes when the SVG walks the figure.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/plot-curve-figure.test.ts test/unit/plot.test.ts " +
  "test/unit/plot-y-axis.test.ts test/golden/plot.test.ts";
const FIGURE = "src/presentation/plot/figure.ts";
const DEFINITION = "src/presentation/plot/definition.ts";
const FURNITURE = "src/presentation/plot/furniture.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 180_000 });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.code === "ETIMEDOUT" ? `${out}\nTIMED OUT — the render did not return` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: DEFINITION,
    from: "      : figure.value;",
    to: "      : { range: data, ticks: [data.min, data.max], step: 0 };",
    why: "the terminal stops reading the shared axis and furnishes two raw bounds instead. If this survives, nothing downstream reads the figure and every row below is a claim about a value nobody takes",
  },
  mutations: [
    {
      // **The SVG arm's old constant, moved into the shared layer.** Five ticks
      // regardless of height is what `plotToSvg` passed, and it is half of D2 —
      // so this row is the disagreement restored from the other side.
      name: "the tick count is a constant again, as the second arm had it",
      file: FIGURE,
      from: "      : valueAxisOf(extent, ticksFor(plotAreaRows(block)), block, block.yScale),",
      to: "      : valueAxisOf(extent, 5, block, block.yScale),",
      expect: "T1.12",
    },
    {
      // **D4**: the scale dropped, which is what the second arm did by never
      // passing it. A log axis then picks linear ticks and every label is a real
      // number at a real row.
      name: "the scale is not passed, so a log axis gets linear ticks",
      file: FIGURE,
      from: "      : valueAxisOf(extent, ticksFor(plotAreaRows(block)), block, block.yScale),",
      to: "      : valueAxisOf(extent, ticksFor(plotAreaRows(block)), block),",
      expect: "FC9",
    },
    {
      // **THE RULE INTERACTION** (§3ak.7 C9). `orientation` is a block member
      // that means something else on the bar and distribution families, so
      // reading it here turns a line plot on its side in the arm that takes the
      // figure and leaves it upright in the arm that does not.
      name: "THE INTERACTION: the family's orientation is read from the block",
      file: FIGURE,
      from: "    orientation: \"vertical\",",
      to: "    orientation: block.orientation === \"horizontal\" ? \"horizontal\" : \"vertical\",",
      expect: "FC7",
    },
    {
      // **C12 I4 and C12 I14**: the adjacency test gone, so a run spans the hole a
      // non-finite value leaves and the curve connects across a gap the terminal
      // breaks at. Plausible in every frame — a line where a line belongs.
      name: "a run spans the gap a non-finite sample leaves",
      file: FIGURE,
      from: "    if (v === null || !Number.isFinite(v)) { run = null; return; }",
      to: "    if (v === null || !Number.isFinite(v)) { return; }",
      expect: "FC2",
    },
    {
      // **C12 I61**: the inversion applied in the shared layer instead of by each
      // arm. Both arms then invert twice or not at all, and the figure is
      // upside down in exactly one of them.
      name: "THE INTERACTION: the marks arrive already inverted",
      file: FIGURE,
      from: "    const pt: Pt = [i / span, normalisedOf(v, range, false)];",
      to: "    const pt: Pt = [i / span, normalisedOf(v, range, true)];",
      expect: "FC1",
    },
    {
      // The legend's order, which is `mergedRow`'s: a claim about the data reads
      // after the thing it is a claim about (C04 I52, §3ag).
      name: "an annotation's entry leads the legend it is a claim about",
      file: FIGURE,
      from: "  return [\n    ...candles,\n    ...identityOf(block).map((label, i) => ({",
      to: "  return [\n    ...candles,\n    ...annotations,\n    ...identityOf(block).map((label, i) => ({",
      expect: "FC3",
    },
    {
      // **One identity list** (§3ak.7 C4): segments replace the series where a
      // form has them, so ignoring them lets the legend name a set the gutter
      // does not.
      name: "segments stop replacing the series, so two lists exist again",
      file: FIGURE,
      from: "    ? segs.map((sg) => sg.label)",
      to: "    ? block.series.map((sr, i) => sr.label ?? `series ${String(i + 1)}`)",
      expect: "FC6",
    },
    {
      // **The second door to the palette, reopened.** `legendEntries`' own
      // recorded defect: the swatch resolved from a different index than the
      // figure, so the legend named a colour nothing was drawn in.
      name: "THE DEFECT: the swatch is chosen from slot one, not the series' own",
      file: FURNITURE,
      from: "      : markOf(slot.seriesIndex ?? 0, ctx.capabilities),",
      to: "      : markOf(0, ctx.capabilities),",
      expect: "FC3",
    },
    {
      // Every series folded into one mark list with no slot, which is the
      // colour channel collapsing: one figure, one ref, and the legend still
      // naming four.
      name: "the marks carry no series slot, so every curve is series one",
      file: FIGURE,
      from: "        marks.push({ mark: { kind: \"polyline\", points }, layer: \"series\", seriesIndex });",
      to: "        marks.push({ mark: { kind: \"polyline\", points }, layer: \"series\", seriesIndex: 0 });",
      expect: "FC8",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
