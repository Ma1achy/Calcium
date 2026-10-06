// The selection's ground — one row per block, painted outside the cache (C14 §6d).
//
// **Every mutation here leaves a selection that is visible.** Rows take a
// ground, the mode works, the reader can see what they have. What changes is
// *which* rows — the body as well as the head, the entry's first row rather than
// the block's — and whether the wash reaches the stored lines.
//
// The last one is the only one whose symptom is not a wrong picture: a wash
// written into the cache produces a **correct** frame, the previous one, which
// is C22 I71's *it froze*.
//
// **The rail's rows follow** (C14 I57, I58, ruling 68): column 0 reserved on
// every transcript row, the pointer translated by it, the prompt keeping the
// content width, and the rail beside the wash rather than inside it. Each is a
// frame that still shows a selection, one column off or in the wrong ink.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/copy-freeze.test.ts test/unit/selection-rail.test.ts " +
  "test/integration/selection-rail.test.ts test/revert/selection-rail.test.ts test/revert/frame.test.ts";
const PAINT = "src/shell/paint.ts";
const SESSION = "src/shell/session.ts";
const CONSTRUCT = "src/shell/construct.ts";
const CONFIG = "src/shell/config.ts";
const FRAME = "src/shell/frame.ts";

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
    // **The whole body, which is `R-SEL-003`'s third clause inverted.** It is
    // the reading every other selection in the tree has — a range of rows takes
    // a ground — and it is what the rule exists to refuse.
    name: "every row of a selected block takes the ground, not only its first",
    file: PAINT,
    from: "    const at = sp.from - from;\n    if (at >= 0 && at < lineCount) rows.add(at);",
    to: "    for (let at = sp.from - from; at < sp.to - from; at += 1) {\n      if (at >= 0 && at < lineCount) rows.add(at);\n    }",
    expect: "T1.40",
  },
  {
    // **The entry's first row rather than the block's.** Right for the first
    // block of every entry, which is most of what a reader selects with `a`.
    name: "the ground goes on the entry's first row",
    file: PAINT,
    from: "    const at = sp.from - from;\n    if (at >= 0 && at < lineCount) rows.add(at);",
    to: "    const at = 0;\n    if (at >= 0 && at < lineCount) rows.add(at);",
    expect: "T1.40",
  },
  {
    // **The entry filter dropped.** One selected block puts a ground on the
    // same row of every entry on screen — invisible whenever the selection and
    // the entry drawn are the same one, which they are for `a`.
    name: "a block selected in one entry grounds that row in every entry",
    file: PAINT,
    from: '    if (sp.key.slice(0, sp.key.indexOf("\\u0000")) !== entryId) continue;',
    to: "",
    expect: "T1.40",
  },
  {
    // **The window's offset dropped.** A scrolled entry grounds a row that is
    // not the block's, and at offset zero — the common case — nothing changes.
    name: "the row is taken without the window's offset",
    file: PAINT,
    from: "    const at = sp.from - from;",
    to: "    const at = sp.from;",
    expect: "T1.40",
  },
  {
    // **The mark dropped.** Painting blanks under the ground rather than the
    // rendered text is the reading where selection *replaces* rather than
    // *underlies*, and it takes the focus mark with it (C14 I41).
    name: "the wash paints blanks instead of the rendered row",
    file: PAINT,
    from: "  const fitted = fitStyled(row, width, SGR_RESET, capabilities.ambiguousWidth);",
    to: '  const fitted = " ".repeat(width);',
    expect: "T1.40b",
  },
  {
    // **Laid once under the row** (C14 I52). The wash as it shipped: one
    // opening before the line, so the ground lasted to the first inner reset.
    // T1.40b's row is unstyled and has no inner reset, which is why it passed.
    name: "the wash opens once and is not re-opened after an inner sequence",
    file: PAINT,
    from: "  return `${wash}${fitted.replace(sgrPattern(), (seq) => `${seq}${wash}`)}${SGR_RESET}`;",
    to: "  return `${wash}${fitted}${SGR_RESET}`;",
    expect: "T1.40d",
  },
  {
    // **`based`'s rule rather than the top ground's** (C14 I52). Re-opening
    // only after a return to the default covers every reset and yields to an
    // inner ground — a focused row's — which is the precedence inverted and
    // reads as the helper already in the file.
    name: "the wash re-opens only after a reset, so an inner ground displaces it",
    file: PAINT,
    from: "  return `${wash}${fitted.replace(sgrPattern(), (seq) => `${seq}${wash}`)}${SGR_RESET}`;",
    to: "  return `${wash}${fitted.replace(/\\x1b\\[(?:0|49)m/gu, (seq) => `${seq}${wash}`)}${SGR_RESET}`;",
    expect: "T1.40d",
  },
  {
    // **Measured by `cells`** (C09 I63). A styled row counts its escapes'
    // bytes, measures wider than it is, and gets no pad: the ground stops at
    // the text on every row that carried a colour.
    name: "the row is fitted by a count that includes its escapes",
    file: PAINT,
    from: "  const fitted = fitStyled(row, width, SGR_RESET, capabilities.ambiguousWidth);",
    to: '  const fitted = sliceCells(row, 0, width) + " ".repeat(Math.max(0, width - cells(row)));',
    expect: "T1.40d",
  },
  {
    // **The ground without its ink** (C14 I53), as it shipped: the band's
    // ground under the page's inks, 1.25–1.68 : 1 in both high-contrast
    // themes. Every theme without a band reads identically.
    name: "the wash lays the band's ground and not its ink",
    file: PAINT,
    from: '  const band = isBand(theme, "selection", capabilities) ? tone("default", theme, capabilities, "selection") : {};',
    to: "  const band = {};",
    expect: "T1.40e",
  },
  {
    // **The ink resolved on the wrong band.** Both high-contrast themes band
    // focus too, so the lookup succeeds and returns focus's ink — the page's
    // colour in `hcDark`, on the selection's bright ground.
    name: "the wash's ink is resolved against the focus band",
    file: PAINT,
    from: '  const band = isBand(theme, "selection", capabilities) ? tone("default", theme, capabilities, "selection") : {};',
    to: '  const band = isBand(theme, "selection", capabilities) ? tone("default", theme, capabilities, "focusGround") : {};',
    expect: "T1.40e",
  },
  {
    // **The rail in the selection's whole style** (C14 I58, ruling 68). At
    // 1-bit that style is `inverse`, which is the right-half block §6d refuses;
    // on every colour rung it reads as the ground it already was.
    name: "the rail takes the selection's whole style, inverse included",
    file: PAINT,
    from: "    ...(ground.background === undefined ? {} : { background: ground.background }),",
    to: "    ...ground,",
    expect: "T3.25 (C14",
  },
  {
    // **The pointer read in the terminal's columns** (C14 I57). Every element
    // is one cell right of where the click lands, so a click on a gap between
    // options focuses the one after it.
    name: "the pointer column is not translated by the region's left",
    file: CONSTRUCT,
    from: "    const col = e.col - deps.frame.region().left;",
    to: "    const col = e.col;",
    expect: "T4.39 (C14",
  },
  {
    // **The prompt laid out at the transcript's width** — the reading the
    // shared `width` variable invites, and one cell of wrap early.
    name: "the prompt takes the transcript's width, not the content width",
    file: SESSION,
    from: "    const promptWidth = regionWidth(frame.size.columns);",
    to: "    const promptWidth = transcriptWidth(frame.size.columns);",
    expect: "T4.39 (C14",
  },
  {
    // **Column 0 reserved without the width giving it back** (T6.28's revert).
    name: "the transcript is laid out at the content width, and overruns by the rail",
    file: CONFIG,
    from: "  return Math.max(1, regionWidth(columns) - RAIL_COLUMNS); // cells-ok — a column count",
    to: "  return Math.max(1, regionWidth(columns)); // cells-ok — a column count",
    expect: "T4.39 (C14",
  },
  {
    // **The frame's region at column 0**: the rows are still prefixed, so the
    // picture is right, and only the pointer reads one cell off.
    name: "the frame reports the region at column 0",
    file: FRAME,
    from: "left: RAIL_COLUMNS,",
    to: "left: 0,",
    expect: "T4.39 (C14",
  },
  {
    // **Element selection without the rail** — the pre-ruling-68 frame, where
    // `▸` was selection's only carrier on a table row.
    name: "a selected element's row takes no rail",
    file: PAINT,
    from: "  return elements.size === 0 ? washed : washed.size === 0 ? elements : new Set([...washed, ...elements]);",
    to: "  return washed;",
    expect: "T1.77 (C14",
  },
  {
    // **The chrome rows not reserved**: the head and the echo at column 0, the
    // body at column 1 — a frame whose rows disagree about where column 0 is.
    name: "the entry's chrome rows are drawn without the reserved column",
    file: SESSION,
    // The echo's rows are led by the rail's column inside `echoRows` (C22 I153).
    from: "...echoRows(keptChrome, width, graph.theme.current, graph.capabilities)",
    to: "...keptChrome",
    expect: "T4.39 (C14",
  },
  {
    // **The frame consults one set of the two** — the union computed and not
    // read, which T1.77 cannot see and the session can.
    name: "the frame leads only the washed rows, whatever the union says",
    file: SESSION,
    from: "    const led = shown.map((row, i) => (railRows.has(i) ? rail : RAIL_BLANK) + row);",
    to: "    const led = shown.map((row, i) => (washedRows.has(i) ? rail : RAIL_BLANK) + row);",
    expect: "T4.39 (C14",
  },
  // **The rail rows' `expect` is the title's opening, `T4.39 (C14`, not the bare
  // id**: T6.28 and T6.29 are titled "→ T4.39 fails" and "→ T3.25 fails", so a
  // bare id is matched by the revert row failing and the named row need not.
];

const results = await runPass({
  read,
  write,
  run,
  control: {
    // **A change the run's own corpus can see** (F1254): no row is ever washed,
    // so every row about which rows take the ground fails.
    file: PAINT,
    from: "    if (!selected.has(sp.key)) continue;",
    to: "    if (selected.has(sp.key)) continue;",
    why:
      "the selected blocks are exactly the ones not washed, so every row about " +
      "which rows take the ground fails — if this survives, nothing below reaches it",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
