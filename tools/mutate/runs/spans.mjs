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
  "npx vitest run test/unit/spans.test.ts test/contract/spans.test.ts test/edge/spans.test.ts test/revert/spans.test.ts test/unit/text.test.ts";
const RUNS = "src/presentation/runs.ts";
const PAINT = "src/presentation/blocks/paint.ts";
const VALIDATE = "src/data/viewmodel/validate.ts";
const SIMPLE = "src/presentation/blocks/kinds/simple.ts";
const TEXT = "src/presentation/text.ts";
const CELLS = "src/presentation/table/cells.ts";

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
    from: "  return wrapCellsParts(text, width, ambiguous, atomsOf(placed)).map((row) =>\n    sliceRuns(placed, row.start, row.text.length), // cells-ok — a code-unit length\n  );",
    to: "  let sum = 0;\n  return wrapCellsParts(text, width, ambiguous, atomsOf(placed)).map((row) => {\n    const out = sliceRuns(placed, sum, row.text.length);\n    sum += row.text.length;\n    return out;\n  });",
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
    from: "        return paint([\n          ...paintRuns(shown, NO_STYLE, paintCtx),\n          { text: suffix },",
    to: "        return paint([\n          ...paintRuns([...shown, { text: suffix, ...(shown[shown.length - 1]?.attrs === undefined ? {} : { attrs: shown[shown.length - 1]?.attrs }) }], NO_STYLE, paintCtx),\n          { text: \"\" },",
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
    // pair disagrees. Re-anchored when `notice` gained `noticeRows` (C04 I90).
    name: "a notice measures a row per span",
    file: SIMPLE,
    from: "  measure: (block: Notice, width: number): number => atLeastOne(noticeRows(block, width).length), // cells-ok",
    to: "  measure: (block: Notice, width: number): number => atLeastOne(noticeRows(block, width).length + (block.spans?.length ?? 0)), // cells-ok",
    expect: "T1.25",
  },
  // --- C04 §3am.1: tone and value -------------------------------------------
  {
    // The tone ignored: the run paints in the block's colour. Every attribute
    // row still passes, because the attributes still spread.
    name: "a span's tone is ignored and the block's style painted",
    file: PAINT,
    from: "  const base = run.tone === undefined ? style : resolveTone(run.tone, ctx.theme, ctx.capabilities);",
    to: "  const base = style;",
    expect: "T2.35",
  },
  {
    // Composed rather than replaced. At 24-bit the colour is the span tone's
    // either way; at 1-bit the block's `bold` survives under the run, which is
    // the one place the two readings differ (C10 T6.85).
    name: "a span's tone composes with the block's instead of replacing it",
    file: PAINT,
    from: "  const base = run.tone === undefined ? style : resolveTone(run.tone, ctx.theme, ctx.capabilities);",
    to: "  const base = run.tone === undefined ? style : { ...style, ...resolveTone(run.tone, ctx.theme, ctx.capabilities) };",
    expect: "T2.26",
  },
  {
    // The value never reaches a background. Every count is right; no `48`.
    name: "a span's value paints nothing at any depth",
    file: PAINT,
    from: "  if (run.value === undefined || ctx.colormap === undefined) return merged;",
    to: "  if (run.value === undefined || ctx.colormap === undefined || run.value >= 0) return merged;",
    expect: "T2.36",
  },
  {
    // The atoms dropped: a valued run breaks where the text would. The frame
    // still renders, the measure still equals the render — both through
    // `noticeRows` — and the token is in two rows.
    name: "wrapRuns passes no atoms to the wrapper",
    file: RUNS,
    from: "  return wrapCellsParts(text, width, ambiguous, atomsOf(placed)).map((row) =>",
    to: "  return wrapCellsParts(text, width, ambiguous).map((row) =>",
    expect: "T1.19",
  },
  {
    // The measurer back on `wrapCells`: right for every notice without a valued
    // span, one row short exactly where a token moved. The frame is drawn and
    // the count disagrees with it — C09 I1 broken by the mechanism C04 I90 admits.
    name: "notice measures through wrapCells rather than noticeRows",
    file: SIMPLE,
    from: "  measure: (block: Notice, width: number): number => atLeastOne(noticeRows(block, width).length), // cells-ok",
    to: "  measure: (block: Notice, width: number): number => atLeastOne(wrapCells(stripControl(block.text), proseWidth(width, prefixCells(block.glyph))).length), // cells-ok",
    expect: "T3.66",
  },
  {
    // A focused row keeps its span tones: a `38` inside the accent run.
    //
    // **Re-anchored when the selection joined the condition** (C11 I14, arc3
    // Lane A): the line gained `|| options.selected === true`, and the mutation
    // is unchanged — the whole condition to `false`. C11 T1.23 is the row that
    // sees the selected half; this one stays on the focused half.
    name: "a focused table row keeps a span's tone",
    file: CELLS,
    from: "    const textRuns = options.focused || options.selected === true\n      ? spanned.map((run) => {",
    to: "    const textRuns = false\n      ? spanned.map((run) => {",
    expect: "T3.66",
  },
  {
    // The break-space arm reverted: a full row followed by a space starts the
    // next row with the space (F590) and breaks a word early (F591). The old
    // anchor was `} else if (segment === " ") {` inside the no-break-point
    // branch; that arm is this one with the search's answer ignored, and the
    // two were one rule written twice.
    name: "a space after a full row is not the break",
    file: TEXT,
    from: "        if (\n          segment === \" \" &&",
    to: "        if (\n          false &&",
    // Run by hand on landing: T1.19, T3.10b2 and C04 T2.36 all fail, the
    // third because `"aa bb cc dd"` at 5 is two rows plain only with the arm.
    expect: "T3.10b2",
  },
  {
    // The first guard gone: the arm fires on the second space of a run, so a
    // row of trailing spaces breaks there and a content space is swallowed.
    name: "a row already ending in a space still breaks at the next one",
    file: TEXT,
    from: '          !line.endsWith(" ") &&',
    to: "          true &&",
    expect: "the break space is in no row",
  },
  {
    // The second guard gone: the break lands strictly inside an atom and the
    // space it drops is content inside a value (F593).
    name: "a break space inside an atom is still a break",
    file: TEXT,
    from: "          atomAround(lineStart + line.length + 1, atoms) === undefined // cells-ok — a code-unit cursor",
    to: "          true // cells-ok — a code-unit cursor",
    expect: "T1.19",
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
