// C12 I43 — the three styling forks, and the record that governs them.
//
// **What each fork does not change is the load-bearing half**, so most of these
// mutations break something that was supposed to stay still.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const TYPES = "src/data/viewmodel/types.ts";
const VAL = "src/data/viewmodel/validate.ts";
const KDE = "src/presentation/plot/kde.ts";
const CIRC = "src/presentation/plot/circle.ts";
const DEFN = "src/presentation/plot/definition.ts";
const RAST = "src/presentation/plot/raster.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync('npx vitest run test/unit/plot-style-arms.test.ts 2>&1',
      { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: TYPES,
    from: '  violin: ["braille", "line"],',
    to: '  violin: [],',
    why: "a violin with no arms refuses every style the fork rows ask for; a run that cannot see that cannot see any row below",
  },
  mutations: [
    {
      // The special case the record replaced: a clause per style.
      name: "a style a form has no arm for is accepted",
      file: VAL,
      from: "      if (arms !== undefined && !arms.includes(String(ps))) {",
      to: "      if (false) {",
      expect: "SA1",
    },
    {
      name: "a fill with a line outline is accepted",
      file: VAL,
      from: '    if (pf === "solid" && ps === "line") {',
      to: "    if (false) {",
      expect: "SA2",
    },
    {
      // **The whole point of the braille arm.** Drawing the cell-resolution
      // edges with dots is the same staircase in a finer alphabet.
      name: "the braille violin does not resample",
      file: KDE,
      from: "    const fineD = kde(finite, fine, bw);",
      to: "    const fineD = densities;",
      expect: "SA3",
    },
    {
      // The first form of the fill: one dot column per cell, a hatch.
      name: "the fill sets the edge's column and not the span",
      file: KDE,
      from: "      if (fill) for (let y = spineDot - off; y <= spineDot + off; y += 1) setDot(dots, x, y); // cells-ok — a dot row",
      to: "      if (fill) setDot(dots, x, spineDot); // cells-ok — a dot row",
      expect: "SA4",
    },
    {
      name: "the box is drawn in the braille arm's own alphabet",
      file: KDE,
      from: "    return [...gap, ...boxOnSpine(rows, spineRow, w, gl, quartiles, lo, hi, pad)];",
      to: "    return [...gap, ...rows];",
      expect: "SA3",
    },
    {
      // Half the dots, because a cell is a claim about area.
      name: "one lit dot makes a solid cell",
      file: RAST,
      from: "      line += lit >= half ? mark : \" \"; // cells-ok — a dot count",
      to: "      line += lit >= 1 ? mark : \" \"; // cells-ok — a dot count",
      expect: "SA5",
    },
    {
      // **Degrade, not refuse** — and not *ignore*, which is what this is.
      name: "a solid pie stays solid at one bit",
      file: DEFN,
      from: '    const solid = block.plotStyle === "solid" && ctx.capabilities.colourDepth !== 1;',
      to: '    const solid = block.plotStyle === "solid";',
      expect: "SA5",
    },
    {
      name: "the legend keeps its braille swatch beside a block-glyph disc",
      file: CIRC,
      from: "      swatch: solid ? pairFor(caps).filled : patternSwatch(patternFor(s.originalIndex, caps)),",
      to: "      swatch: patternSwatch(patternFor(s.originalIndex, caps)),",
      expect: "SA7",
    },
    {
      name: "the radar's line arm is not wired",
      file: DEFN,
      from: '      block.plotStyle === "line", block.plotGrid ?? "polygon",',
      to: '      false, block.plotGrid ?? "polygon",',
      expect: "SA6",
    },
    {
      // **The alphabet, which is the whole finding.** `╱` and `╲` are strokes
      // inside a box and miss their corners; a quadrant is a filled sub-cell.
      name: "the quadrant fold gives back a box-drawing stroke",
      file: "src/presentation/plot/linedraw.ts",
      from: "  return QUADRANTS[mask & 0xf] ?? \" \";",
      to: "  return mask === 0 ? \" \" : \"\\u2571\";",
      expect: "SA6",
    },
    {
      // The frame's stipple, which answered a question about weight with holes.
      // **`arcDots` is only the circle grid's mechanism now** (C12 I45), so the
      // row this kills renders `plotGrid: "circle"` on purpose — on the default
      // the rings are `strokeDashed` polygons and this mutation has no subject.
      name: "the circle grid's rings are stippled again",
      file: CIRC,
      from: "  const step = 1 / radius;",
      to: "  const step = 4 / radius;",
      expect: "SA6",
    },
    {
      // The grid fork itself: a field that is read decides nothing if the
      // branch it selects is the same either way.
      name: "the grid is a circle whatever the block asked for",
      file: CIRC,
      from: '    if (gridShape === "circle" || n < 3) { // cells-ok — a category count',
      to: "    if (true) {",
      expect: "SA9",
    },
    {
      // And the fallback below three axes, which is silent: two vertices are a
      // line and one is a point, so there is no ring to draw.
      name: "a polygon ring is attempted below three axes",
      file: CIRC,
      from: '    if (gridShape === "circle" || n < 3) { // cells-ok — a category count',
      to: '    if (gridShape === "circle") {',
      expect: "SA9",
    },
    {
      // The quadrant arm's half of the same field.
      name: "the quadrant arm ignores the grid shape",
      file: CIRC,
      from: '    if (values === undefined && gridShape === "circle") {',
      to: "    if (false) {",
      expect: "SA9",
    },
    {
      // `furniture` is `series.length`, greater than every series index, so a
      // max over a cell's owners gives the frame's tone to a polygon crossing
      // it — which is what `rank` exists to invert (C12 I44).
      name: "the cell's tone is the largest owner in it",
      file: CIRC,
      from: "  const rank = (o: number): number => (o >= furniture ? -1 : o); // cells-ok — a series index",
      to: "  const rank = (o: number): number => o; // cells-ok — a series index",
      expect: "SA6",
    },
    {
      // **The occlusion half.** The tone is chosen per cell and every other
      // layer's sub-cells are dropped; keeping them is I40 generalised past the
      // pie, and it draws the frame's quadrants in a series slot (C12 I44).
      name: "a cell keeps every layer's quadrants and only its tone is chosen",
      file: CIRC,
      from: "        if (bits[y * sx + x] === 1 && owner[y * sx + x] === who) mask |= bit; // cells-ok — a sub-cell position",
      to: "        if (bits[y * sx + x] === 1) mask |= bit; // cells-ok — a sub-cell position",
      expect: "SA6",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
