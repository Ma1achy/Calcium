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
    from: "  heatmap: (block, width, ctx) => {",
    to: "  heatmap: (block, width, ctx) => {\n    if (block.series.length >= 0) return [];",
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
      file: DEF,
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
      file: DEF,
      // Re-anchored onto `heatSpans`, where the row's glyphs moved when the
      // colormap's second channel landed (C10 I31). The subject is unchanged:
      // the range handed to the row is the matrix's or it is the row's own.
      from: "  const glyphs = rampRow(series.values, layout.areaWidth, ctx.capabilities, range, style);",
      to: "  const glyphs = rampRow(series.values, layout.areaWidth, ctx.capabilities, rowRange(series), style);",
      expect: "T1.18",
      also: [
        {
          file: DEF,
          from: "/** A grid cell is blank where nothing was reported (C12 I17, §3a). */",
          to:
            "const rowRange = (s) => {\n"
            + "  const r = s.values.filter((v) => v !== null && Number.isFinite(v));\n"
            + "  return r.length === 0 ? { min: 0, max: 0 } : { min: Math.min(...r), max: Math.max(...r) };\n"
            + "};\n"
            + "/** A grid cell is blank where nothing was reported (C12 I17, §3a). */",
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
      file: DEF,
      from: "    if (room < 1) return null;\n    return { ...base, gutter: room + AXIS_GUTTER, labelColumn: room, areaWidth: MIN_AREA };",
      to: "    if (room < 1) return { ...base, gutter: 0, labelColumn: 0, areaWidth: width };\n    return { ...base, gutter: AXIS_GUTTER, labelColumn: 0, areaWidth: width - AXIS_GUTTER };",
      expect: "T1.22",
    },
    {
      // **C12 I19, and the half that was wrong**: the legend aligned to the plot
      // area rather than the row, so a wide label column cut the range and left
      // the swatch — a key to a scale nobody named.
      name: "the legend is aligned to the plot area again",
      file: DEF,
      from: "    line([{ text: truncate(legend, layout.width, ctx.capabilities), style: muted }], layout, ctx),",
      to: "    line([{ text: \" \".repeat(layout.gutter) }, { text: truncate(legend, layout.areaWidth, ctx.capabilities), style: muted }], layout, ctx),",
      expect: "T1.23",
    },
    {
      // The drop order inverted: the swatch kept and the range dropped, which is
      // the wrong half by the legend's own argument.
      name: "the legend drops its range before its swatch",
      file: DEF,
      from: "  const legend = [`${swatch}  ${range_}${clause}`, `${swatch}  ${range_}`, range_].find(fits) ?? \"\";",
      to: "  const legend = [`${swatch}  ${range_}${clause}`, `${swatch}  ${range_}`, swatch].find(fits) ?? \"\";",
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
