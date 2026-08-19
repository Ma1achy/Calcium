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
      name: "the radar's polygons stay braille under a line style",
      file: CIRC,
      from: "    if (lineDraw) {",
      to: "    if (false) {",
      expect: "SA6",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
