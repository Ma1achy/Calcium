// C12 I49, I50 and I51 — the two field forms, and what is layered over them.
//
// **Two rows here exist because a fixture could not respond, and one because a
// frame could not be read from the code.** CN2's saddle needs a separable field
// *and* a level at the value the surface takes there — the catalogue's ridge
// gives zero saddles at every level, and a separable one gives zero at the
// derived ticks. QV9's arrow was drawn in its own cell's background, invisible
// at 24-bit, with every assertion passing.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const FIELD = "src/presentation/plot/field.ts";
const HEAT = "src/presentation/plot/heatmap.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync('npx vitest run test/unit/plot-field.test.ts 2>&1',
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
    file: HEAT,
    from: "  if (!IS_FIELD_FORM[block.form]) return [];",
    to: "  return [];",
    why: "no field form ever composes a glyph layer, so every CN and LY row below is about an unpainted area — a run where this survives cannot see a kill on any of them",
  },
  mutations: [
    {
      // **The derivation, not the table.** An edge is crossed when its corners
      // *disagree*; reading the corner bit itself is the plausible wrong answer
      // and it is right in four of the sixteen cases by coincidence.
      name: "the mask reads the corner bit rather than the disagreement",
      file: FIELD,
      from: "    (a !== b ? LINE_UP : 0) |",
      to: "    (a ? LINE_UP : 0) |",
      expect: "CN1",
    },
    {
      // The saddle by a constant. **Fails CN2 and not CN2b**, which is the pair:
      // on the `line` arm both resolutions are `┼` and this mutation is invisible.
      name: "the saddle resolves by a constant rather than the centre value",
      file: FIELD,
      from: "  const centre = (tl + tr + br + bl) / 4;\n  return (centre >= level) === (tl >= level);",
      to: "  return true;",
      expect: "CN2",
    },
    {
      // **The union across levels**, which is the only way a tee can be emitted.
      // Invisible to CN1, which is single-level by construction.
      name: "the last level wins a cell rather than unioning",
      file: FIELD,
      from: "        masks[y]![x]! |= marchingMask(",
      to: "        masks[y]![x]! = marchingMask(",
      expect: "CN8",
    },
    {
      // A gap counted as *below the level* draws a contour along the hole's rim.
      //
      // **This survived a run of eleven against CN4**, whose field is constant
      // and therefore has no levels at all — so the mutation changed nothing
      // there. CN9 was written because of it: a hole in a uniformly-high region
      // is the only shape that separates the two readings.
      name: "an absent corner counts as below the level",
      file: FIELD,
      from: "  if (tl === null || tr === null || br === null || bl === null) return 0;",
      to: "  tl ??= 0; tr ??= 0; br ??= 0; bl ??= 0;",
      expect: "CN9",
    },
    {
      // **THE ZERO-MAGNITUDE RULE.** `atan2(0, 0)` is `0`, so the natural
      // implementation draws a field of still cells as a field of eastward flow
      // with every magnitude assertion still passing.
      name: "a still cell draws an arrow of arbitrary direction",
      file: FIELD,
      from: "  if (u === 0 && v === 0) return null;",
      to: "  if (false) return null;",
      expect: "QV3",
    },
    {
      // **The conjunct that is easy to drop** — `art.ts:eligible()`'s third
      // consumer, and the only one that leaves no visible seam.
      name: "the unicode arm is taken at ambiguousWidth wide",
      file: FIELD,
      from: '  return [...(caps.unicode === "ascii" || caps.ambiguousWidth === "wide" ? ARROWS_ASCII : ARROWS_UNICODE)];',
      to: '  return [...(caps.unicode === "ascii" ? ARROWS_ASCII : ARROWS_UNICODE)];',
      expect: "QV6",
    },
    {
      // **THE FRAME-READ DEFECT.** Colouring the arrow by magnitude over a
      // magnitude field paints it in its own background: invisible at 24-bit,
      // and every other assertion passes.
      name: "the arrow is coloured by magnitude even where the field already carries it",
      file: HEAT,
      from: "        const mrange = ownField ? null : seriesRange(mag, {});",
      to: "        const mrange = seriesRange(mag, {});",
      expect: "QV9",
    },
    {
      // **The ruling the frame corrected.** Keeping the field painted below the
      // colour floor puts the density ramp and the contour in one alphabet —
      // braille at unicode, punctuation at ASCII — and the 1-bit frame becomes an
      // even wash of speckle. No assertion saw it: LY5 as first written filtered
      // for `░▒▓█` and the ramp below the floor is braille, so it held over an
      // empty set.
      name: "the field still paints below the colour floor",
      file: FIELD,
      from: "  if (caps.colourDepth >= FIELD_COLOUR_FLOOR) return true;\n  return !layers.some((l) => l.ramplike === true);",
      to: "  return true;",
      expect: "LY5",
    },
    {
      // The other half: a quiver is *not* ramplike, so yielding for every layer
      // costs it the field it can legibly keep.
      name: "the field yields to any layer, not only a ramplike one",
      file: FIELD,
      from: "  return !layers.some((l) => l.ramplike === true);",
      to: "  return layers.length === 0;",
      expect: "LY5",
    },
    {
      // `layers` is a draw order and `mergeFieldLayers` takes a priority order.
      // **The seam, not the array**: mutating the public field's order fails
      // nothing, because the caller declared it.
      name: "layers reaches the merge unreversed",
      file: FIELD,
      from: "  return [...drawn].reverse();",
      to: "  return [...drawn];",
      expect: "LY1",
    },
    {
      // `field`'s membership is load-bearing; dropping the check paints it always.
      name: "the field paints whether or not `layers` names it",
      file: FIELD,
      from: '  return layersOf(block).includes("field");',
      to: "  return true;",
      expect: "LY2",
    },
    {
      // **Dimming by a constant** rather than per map. Fails on inferno alone,
      // which is the map 50% does not clear — the argument for LY6 enumerating.
      name: "the dim factor is a constant rather than measured per map",
      file: FIELD,
      from: "  let factor = 1;\n  for (let k = 20; k >= 1; k -= 1) { // cells-ok — a search step count",
      to: "  let factor = 0.5;\n  for (let k = 0; k >= 1; k -= 1) { // cells-ok — a search step count",
      expect: "LY6",
    },
    {
      // The contrast ink as a constant. **Satisfies *picks a contrasting
      // colour*** exactly, and is wrong on half the ramp.
      name: "the contrast ink is always white",
      file: FIELD,
      from: '  return luminance(background.hex) > 0.1833',
      to: '  return false',
      expect: "LY7",
    },
    {
      // Levels derived from the ends inward, so a level sits at the minimum and
      // crosses nothing — *no contour* where the caller asked for one.
      name: "the derived levels include the range's ends",
      file: FIELD,
      from: "  return axis.ticks.filter((v) => v > range.min && v < range.max);",
      to: "  return axis.ticks;",
      expect: "CN5",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
