// C04 §3am — spans, mutated.
//
// **Every mutation here leaves a renderer that still renders and a measurer
// that still agrees with it.** A span sliced one unit early, a boundary painted
// inside a cluster, a marker styled by the span it cut, an attribute resolved
// through a slot — each draws a frame of the right height with every count
// correct, which is why the rows these expect assert bytes.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/spans.test.ts test/contract/spans.test.ts test/edge/spans.test.ts test/revert/spans.test.ts";
const RUNS = "src/presentation/runs.ts";
const PAINT = "src/presentation/blocks/paint.ts";
const VALIDATE = "src/data/viewmodel/validate.ts";
const SIMPLE = "src/presentation/blocks/kinds/simple.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const MUTATIONS = [
  {
    // Prefix sums instead of the source start. Right on every row that no
    // break space precedes, which is the first row of every paragraph.
    name: "wrapped spans are sliced by prefix sums of row lengths",
    file: RUNS,
    from: "  return wrapCellsParts(text, width, ambiguous).map((row) =>\n    sliceRuns(placed, row.start, row.text.length), // cells-ok — a code-unit length\n  );",
    to: "  let sum = 0;\n  return wrapCellsParts(text, width, ambiguous).map((row) => {\n    const out = sliceRuns(placed, sum, row.text.length);\n    sum += row.text.length;\n    return out;\n  });",
    expect: "T3.62",
  },
  {
    // No snapping: an escape lands between a base and its mark.
    name: "a boundary inside a cluster is painted where it falls",
    file: RUNS,
    from: "  const ends = clusterEnds(text);\n  const out: Run[] = [];",
    to: "  const ends: readonly number[] = [];\n  const out: Run[] = [];",
    expect: "T3.64",
  },
  {
    // The overlap check gone. Every sorted document still validates.
    name: "the gate accepts overlapping spans",
    file: VALIDATE,
    from: "    if (from < previousTo) {",
    to: "    if (false) {",
    expect: "T1.24",
  },
  {
    // The surrogate check gone. Every BMP document still validates.
    name: "the gate accepts a surrogate split",
    file: VALIDATE,
    from: "    if (isString(text) && (splitsSurrogate(text, from) || splitsSurrogate(text, to))) {",
    to: "    if (false) {",
    expect: "T1.24",
  },
  {
    // `code` takes spans. Nothing draws them, and nothing says so.
    name: "code accepts a spans member",
    file: VALIDATE,
    from: '    if (b["spans"] !== undefined) {\n      e.push(`${at}: "spans" is refused on code',
    to: '    if (false) {\n      e.push(`${at}: "spans" is refused on code',
    expect: "T2.32",
  },
  {
    // The marker inherits the span it cut. Reads as the word being emphasised
    // right up to its ellipsis, which is exactly what a reader would not notice.
    name: "the truncation marker is painted inside the span",
    file: SIMPLE,
    from: "        return paint([\n          ...paintRuns(shown, NO_STYLE),\n          { text: suffix },",
    to: "        return paint([\n          ...paintRuns([...shown, { text: suffix, ...(shown[shown.length - 1]?.attrs === undefined ? {} : { attrs: shown[shown.length - 1]?.attrs }) }], NO_STYLE),\n          { text: \"\" },",
    expect: "T3.63",
  },
  {
    // The merge drops the tone. Bold survives, the colour does not — and at
    // 1-bit nothing changes at all, which is why T1.22 walks every depth.
    name: "a span's attributes replace the tone rather than joining it",
    file: PAINT,
    from: "  return attrs === undefined ? style : { ...style, ...attrs };",
    to: "  return attrs === undefined ? style : { ...attrs };",
    expect: "T1.22",
  },
  {
    // The measurer reads spans: one row per span. Every frame renders; the
    // pair disagrees.
    name: "a notice measures a row per span",
    file: SIMPLE,
    from: "      wrapCells(stripControl(block.text), proseWidth(width, prefixCells(block.glyph))).length, // cells-ok\n    ),",
    to: "      wrapCells(stripControl(block.text), proseWidth(width, prefixCells(block.glyph))).length + (block.spans?.length ?? 0), // cells-ok\n    ),",
    expect: "T1.25",
  },
];

const EXPECTED_SURVIVORS = new Map();

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: RUNS,
    from: "  return Object.keys(attrs).length === 0 ? undefined : attrs; // cells-ok — a key count",
    to: "  return undefined;",
    why:
      "no span ever reaches a style — if this survives, no row reads the bytes a span " +
      "produces and every kill below is unearned",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

const unexpected = results.filter((r) => !r.killed && !EXPECTED_SURVIVORS.has(r.name));
process.exit(unexpected.length > 0 ? 1 : 0);
