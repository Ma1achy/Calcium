// C12 I52, §3z — the horizon's two channels, and the alphabet they shared.
//
// **Every mutation here restores something that shipped**, which is why this
// run exists rather than inventing faults. Band depth rode the density ramp and
// within-band height was a whole number of rows, so at `height: 1` — the
// canonical horizon — every inked column was one row and the only variation in
// the frame was the glyph. Both readings are correct sentences about a chart
// and neither is this chart.
//
// **The pair worth naming is the arm below the colour floor.** §3z chose arm A
// against the arm that resolves *more* — B gives eight levels at one row where
// A gives three — because a form that stops having bands below a colour depth
// is two forms with one name. So the mutation is not "make it worse"; it is
// "make it better at counting and wrong about what it is".
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const HORIZON = "src/presentation/plot/horizon.ts";
const HEIGHT = "src/presentation/plot/height.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync('npx vitest run test/unit/plot-mutations.test.ts -t "horizon" 2>&1',
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
    file: HORIZON,
    from: "  const grid: (HorizonCell | null)[][] = Array.from({ length: h }, () =>",
    to: "  const grid: (HorizonCell | null)[][] = Array.from({ length: 1 }, () =>",
    why: "T1.49 asserts the row count is the declared height at four band counts and three heights; a grid of one row cannot satisfy it, so a run where this survives cannot see a kill",
  },
  mutations: [
    {
      // **What shipped**: depth on the glyph, so the height alphabet is spent
      // before height is drawn. HZ1 asserts both halves — the glyphs are on the
      // height ladder *and* the colours separate the bands — because either
      // alone passes against a build that got the other right.
      name: "band depth returns to the density ramp",
      file: HORIZON,
      from: '  const steps = [...ladderFor("height", caps).steps];',
      to: '  const steps = [...ladderFor("density", caps).steps];',
      expect: "HZ1",
    },
    {
      // **The height channel collapsed to whole rows**, which is the other half
      // of what shipped: at `height: 1` every inked cell becomes the same glyph
      // and the position inside the band is gone. HZ2 is the only row that sees
      // it, because it constructs a sweep through one band — over the whole
      // range the bands change too, and eight glyphs then prove nothing about
      // eight positions.
      name: "within-band height rounds to whole rows",
      file: HORIZON,
      from: "    const total = Math.max(1, Math.min(h * EIGHTHS_PER_ROW,\n      Math.round(within * h * EIGHTHS_PER_ROW))); // cells-ok — an eighth count",
      to: "    const total = Math.max(1, Math.min(h * EIGHTHS_PER_ROW,\n      Math.round(within * h) * EIGHTHS_PER_ROW)); // cells-ok — an eighth count",
      expect: "HZ2",
    },
    {
      // **The fold about the data's minimum**, unconditionally — which is what
      // shipped and why it only ever folded one way. Invisible on any fixture
      // that never crosses zero, which is every horizon fixture the catalogue
      // had until `signed` was added.
      name: "the baseline is always the range's minimum",
      file: HORIZON,
      from: "  return range.min <= 0 && range.max >= 0 ? 0 : range.min;",
      to: "  return range.min;",
      expect: "HZ3",
    },
    {
      // **The mirror made an offset in the colour**: both directions taking the
      // same half of the map, so a trough draws as a peak. §3r's repertoire
      // finding is what forbids the glyph half of this; nothing but a test
      // forbids the colour half.
      name: "the sign stops choosing a half of the map",
      file: HORIZON,
      from: "  return 0.5 + (cell.sign * depth) / 2;",
      to: "  return 0.5 + depth / 2;",
      expect: "HZ3",
    },
    {
      // **A floor that draws nothing**, giving blank two meanings — absence and
      // the minimum — in the form whose whole subject is *how deep*. Three
      // shipped frames carried the two-cell break this leaves.
      name: "a reading at the baseline draws no ink",
      file: HORIZON,
      from: "    const total = Math.max(1, Math.min(h * EIGHTHS_PER_ROW,",
      to: "    const total = Math.max(0, Math.min(h * EIGHTHS_PER_ROW,",
      expect: "HZ5",
    },
    {
      // **Arm B below the colour floor** — the eighths over the whole range with
      // `bands` inert. It resolves *more* than arm A and is refused anyway,
      // because a caller declaring `bands: 5` would get a sparkline and nothing
      // would say so.
      name: "below the colour floor the bands go inert (arm B)",
      file: HORIZON,
      from: "      ? horizonGlyph(cell, caps)\n      : horizonDepthGlyph(cell, bands, caps);",
      to: "      ? horizonGlyph(cell, caps)\n      : horizonGlyph(cell, caps);",
      expect: "HZ4",
    },
    {
      // **The legend dropped**, which H7 refuses: a band is an ordinal index
      // into a colour, so the scale beside it is the reading rather than
      // furniture. The row it costs is what makes that expressible.
      name: "the horizon stops paying for its legend row",
      file: HEIGHT,
      from: "  horizon: () => 1,",
      to: "  horizon: () => 0,",
      expect: "HZ7",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
