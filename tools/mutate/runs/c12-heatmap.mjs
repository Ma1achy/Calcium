// The heatmap, mutated — and the rows are indexed by *inheritance*.
//
// **Both defects this component has had were inherited, not invented.**
// `sparkline` took `line`'s *filtered before scaling* and applied it to
// positions; the heatmap's first draft took `sparkline`'s height ramp and
// applied it to a density field. Each was a correct rule from the arm next door,
// and each produced a picture that is arithmetically right and visually
// meaningless — which no count can see.
//
// So the mutations restore the neighbour's rule rather than breaking this one:
// the wrong ramp, the wrong absence marker, the per-row range, and the two-armed
// switch that made a heatmap render as a curve in the first place.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/plot.test.ts test/contract/view-model.test.ts test/golden/states.test.ts";
const DEF = "src/presentation/plot/definition.ts";
// **The heatmap moved out of `definition.ts`.** Rebuilt as a form like every
// other in `heatmap.ts`, taking its absence marker, its layout ladder and its
// legend with it — six anchors below follow it rather than being deleted,
// because every one of them still names a live invariant.
const HEAT = "src/presentation/plot/heatmap.ts";
const RAMP = "src/presentation/plot/ramp.ts";
const HEIGHT = "src/presentation/plot/height.ts";

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
    file: DEF,
    from: "  heatmap: (block, width, ctx) => heatmapFormRows(block, width, ctx),",
    to: "  heatmap: (block, width, ctx) => (block.series.length >= 0 ? [] : heatmapFormRows(block, width, ctx)),",
    why: "a heatmap that renders nothing at all — if this survives, no row below is earned",
  },
  mutations: [
    {
      // **The inheritance, restored.** The sparkline's ramp on a grid: eight
      // narrow braille steps, monotone, correct in every count — and every cell
      // is a bar fragment, because it encodes height and a grid cell has no
      // vertical axis for height to be along.
      name: "THE INHERITANCE: the heatmap takes the sparkline's height ramp",
      file: RAMP,
      from: 'export const RAMP_DENSITY = "\\u2804\\u2814\\u2816\\u2836\\u2837\\u283f\\u287f\\u28ff";',
      to: 'export const RAMP_DENSITY = "\\u2840\\u28c0\\u28c4\\u28e4\\u28e6\\u28f6\\u28f7\\u28ff";',
      expect: "T1.20",
    },
    {
      // The other half of the same mistake: the sparkline's absence marker in a
      // grid, where there is no padding for a blank to be confused with — so
      // sixteen `?` shout over the data for the state that means nothing
      // happened.
      name: "an absent cell draws the sparkline's marker",
      file: HEAT,
      from: 'const HEATMAP_ABSENT = " ";',
      to: 'const HEATMAP_ABSENT = "?";',
      expect: "T1.21",
    },
    {
      // **The range per row rather than per matrix**, which is the difference
      // between a matrix and a stack of unrelated sparklines. Every row spans
      // the full ramp, so an idle container and a saturated one draw the same
      // picture — the comparison a heatmap exists to make, inverted.
      name: "each row normalises over itself",
      file: HEAT,
      // Re-anchored twice now: onto `heatSpans` when the colormap's second
      // channel landed, and onto the *call site* when `heatSpans` stopped
      // taking a glyph string and started reading one column map for both
      // channels. The subject has never moved — the range handed to a row is
      // the matrix's, or it is the row's own and the comparison is gone.
      // Re-anchored a third time, onto the `const field =` binding that C12
      // §3y's pass 5/6 split introduced. The subject is still the range: the
      // matrix's, or the row's own with the comparison gone.
      from: "    const field = heatSpans(s, range, layout, map, style, ctx, matrixLayout, dim, painted);",
      to: "    const field = heatSpans(s, rowRange(s), layout, map, style, ctx, matrixLayout, dim, painted);",
      expect: "T1.18",
      also: [
        {
          file: HEAT,
          from: "function heatSpans(",
          to:
            "const rowRange = (s) => {\n"
            + "  const r = s.values.filter((v) => v !== null && Number.isFinite(v));\n"
            + "  return r.length === 0 ? { min: 0, max: 0 } : { min: Math.min(...r), max: Math.max(...r) };\n"
            + "};\n"
            + "function heatSpans(",
        },
      ],
    },
    {
      // **The two-armed switch**, restored where it did the damage: a heatmap
      // falls into the line arm and renders as a curve, at exactly the right
      // height, with the right number of rows and the right width.
      name: "THE SWITCH: form dispatch falls back to the line arm",
      file: DEF,
      from: "  return rows([...FORM_ROWS[block.form](block, width, ctx)]);",
      to:
        "  return rows([\n"
        + "    ...(block.form === \"sparkline\"\n"
        + "      ? FORM_ROWS.sparkline(block, width, ctx)\n"
        + "      : FORM_ROWS.line(block, width, ctx)),\n"
        + "  ]);",
      expect: "T1.17",
    },
    {
      // The furniture, which is the height. A heatmap that spends no rows on its
      // legend measures two short and every block below it moves — and the
      // legend is the only thing that says what a cell means.
      name: "a heatmap spends no rows on its furniture",
      file: HEIGHT,
      from: "  heatmap: () => AXIS_ROWS,",
      to: "  heatmap: () => 0,",
      expect: "T1.1",
    },
    {
      // **C12 I18's ladder, put back the way round it was.** Dropping the label
      // column instead of truncating it gives a matrix with no names beside it —
      // a picture of numbers, reachable between two ordinary widths, and the
      // comment above the branch already called it that while the code produced
      // it.
      name: "THE LADDER: labels are dropped instead of truncated",
      file: HEAT,
      from: "  if (room < 1) return null;\n  return { ...base, gutter: room + AXIS_GUTTER, labelColumn: room, areaWidth: MIN_AREA };",
      to: "    if (room < 1) return { ...base, gutter: 0, labelColumn: 0, areaWidth: width };\n    return { ...base, gutter: AXIS_GUTTER, labelColumn: 0, areaWidth: width - AXIS_GUTTER };",
      expect: "T1.22",
    },
    {
      // **C12 I19, and the half that was wrong**: the legend aligned to the plot
      // area rather than the row, so a wide label column cut the range and left
      // the swatch — a key to a scale nobody named.
      name: "the legend is aligned to the plot area again",
      file: HEAT,
      // Re-anchored: C12 I29 made the legend a run of spans rather than one
      // truncated string, so aligning it to the plot area is now prepending the
      // gutter — `clampSpans` cuts the tail, which is the upper bound.
      from: "  return [labelRow, line(legend, layout, ctx)];",
      to: "  return [labelRow, line([{ text: \" \".repeat(layout.gutter) }, ...legend], layout, ctx)];",
      expect: "T1.23",
    },
    {
      // The drop order inverted: the swatch kept and the range dropped, which is
      // the wrong half by the legend's own argument.
      name: "the legend drops its range before its swatch",
      file: HEAT,
      // Re-anchored to the rung table C12 I29 replaced the string ladder with.
      // The last rung is what survives at the narrowest width, so putting the
      // swatch there is the same inversion: a key to a scale nobody named.
      from: "    [muteds(`${lo} - ${hi}`)],",
      to: "    [...bar()],",
      expect: "T1.23",
    },
    {
      // C04 I50b's ragged refusal, removed. What it lets through is the picture the
      // walk refused: a short row stretched to the common width, so column k
      // means a different instant in every row, self-consistently.
      name: "a ragged matrix is accepted",
      file: "src/data/viewmodel/construct.ts",
      from: "  const ragged = plot.series.findIndex((s) => s.values.length !== first.values.length);",
      to: "  const ragged = -1;",
      expect: "T1.19",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
