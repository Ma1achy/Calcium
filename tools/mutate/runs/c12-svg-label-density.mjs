// C12 I121 — the SVG arm's value labels have an abut rule of their own.
//
// **The tick budget was being read as a label count.** `ticksFor` says how fine
// a step to reach for and `yLabels` decides how many survive; this arm had the
// first and none of the second, on a canvas whose height it takes from its
// caller through a published `svgLayout`.
//
// **Two mutations here fail nothing at the shipped canvas and everything below
// it**, which is why `RC8` sweeps four heights: measured before the rule, the
// corpus had 0 overprinting pairs at 640 × 320 and 4 at 640 × 120. A run aimed
// only at the default would report both as survivors and be right about the
// frames it looked at.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const SVG = "src/presentation/plot/svg.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync('npx vitest run test/unit/plot-svg-path.test.ts 2>&1',
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
    file: SVG,
    from: "        lastLabelAt[side] = y;",
    to: "        lastLabelAt[side] = y; continue;",
    why: "an axis emitter that records a baseline and then writes nothing draws no value labels at all, which fails RC9's set and every row in the file that reads a number out of a gutter",
  },
  mutations: [
    {
      // **The shipped defect.** No abut rule at all: every tick's label drawn,
      // however short the canvas.
      name: "the abut rule is removed and every tick keeps its label",
      file: SVG,
      from: "        if (previous !== null && Math.abs(y - previous) < SVG_FONT_SIZE) continue;",
      to: "        if (false && previous !== null && Math.abs(y - previous) < SVG_FONT_SIZE) continue;",
      expect: "RC8",
    },
    {
      // **Drop against elide, in this arm's units.** Moving the edge on a
      // refusal collapses a crowded gutter onto its first reading — RC8 still
      // passes, because nothing overprints.
      name: "a suppressed label reserves its baseline anyway",
      file: SVG,
      from: "        if (previous !== null && Math.abs(y - previous) < SVG_FONT_SIZE) continue;",
      to: "        if (previous !== null && Math.abs(y - previous) < SVG_FONT_SIZE) { lastLabelAt[side] = y; continue; }",
      expect: "RC9",
    },
    {
      // The bound loosened by a third: baselines 8 px apart accepted with a
      // 12 px glyph. `RC8`'s shortest canvas is where this reaches.
      name: "the clearance is two thirds of an em",
      file: SVG,
      from: "        if (previous !== null && Math.abs(y - previous) < SVG_FONT_SIZE) continue;",
      to: "        if (previous !== null && Math.abs(y - previous) < SVG_FONT_SIZE * (2 / 3)) continue;",
      expect: "RC8",
    },
    {
      // Signed rather than absolute. The ordinate runs bottom-to-top for a
      // default facing and top-to-bottom for a flipped one, so a signed
      // comparison holds on one and refuses everything on the other.
      name: "the clearance is signed rather than absolute",
      file: SVG,
      from: "        if (previous !== null && Math.abs(y - previous) < SVG_FONT_SIZE) continue;",
      to: "        if (previous !== null && y - previous < SVG_FONT_SIZE) continue;",
      expect: "RC9",
    },
    {
      // The gridline suppressed with the label — what the decision leaves
      // behind, and it changes the figure's geometry while every text
      // assertion agrees (C12 I114's `RC4`, one writer over).
      name: "the suppressed label's gridline goes with it",
      file: SVG,
      from: "      if (gridded) {\n        parts.push(`<line x1=\"${n(box.left)}\" y1=\"${n(y)}\" x2=\"${n(box.right)}\" y2=\"${n(y)}\" ` +",
      to: "      if (gridded && (lastLabelAt.left === null || Math.abs(y - lastLabelAt.left) >= SVG_FONT_SIZE)) {\n        parts.push(`<line x1=\"${n(box.left)}\" y1=\"${n(y)}\" x2=\"${n(box.right)}\" y2=\"${n(y)}\" ` +",
      expect: "RC9",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
