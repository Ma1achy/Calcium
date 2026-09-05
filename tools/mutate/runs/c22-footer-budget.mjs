// The frame's default look, mutated — C22 §6l, I80–I83 (T6.97–T6.102).
//
// **Every mutation here leaves a frame that still sums**, or one that fails to
// sum where the assertion is on the frame rather than the sum. `heightsSum`
// compares the frame with itself, so a subtraction that uses one number and a
// painter that uses another agree with each other and disagree with the screen.
// The rows that catch these read the frame (T1.38, T1.39, T3.38) or sweep the
// footer's height (T1.40) rather than asking the sum whether it holds.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/frame-budget.test.ts test/unit/session-paint.test.ts test/integration/session.test.ts";
const FRAME = "src/shell/frame.ts";
const PAINT = "src/shell/paint.ts";
const CHROME = "src/shell/chrome.ts";
const LAYOUT = "src/shell/entry-layout.ts";
const SESSION = "src/shell/session.ts";
const CONSTRUCT = "src/shell/construct.ts";

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
    // **T6.97, first half.** The sum forgets the rules while the composer keeps
    // them: false at every size, and the fallback draws where a frame should.
    name: "heightsSum drops RULE_ROWS",
    file: FRAME,
    from: "    HEADER_ROWS + HEADER_RULE_ROWS + f.region.height + RULE_ROWS + f.promptRows + f.footerRows === f.size.rows",
    to: "    HEADER_ROWS + HEADER_RULE_ROWS + f.region.height + f.promptRows + f.footerRows === f.size.rows",
    expect: "T1.36",
  },
  {
    // **T6.97, second half.** The composer forgets the rules while the painter
    // draws them: the region is two rows too tall, the sum is false, and
    // `paint` throws `FrameError` on the frame T1.38 reads.
    name: "compose drops RULE_ROWS from the subtraction",
    file: FRAME,
    from: "  const height = Math.max(0, size.rows - HEADER_ROWS - HEADER_RULE_ROWS - RULE_ROWS - footerRows - promptRows);",
    to: "  const height = Math.max(0, size.rows - HEADER_ROWS - HEADER_RULE_ROWS - footerRows - promptRows);",
    expect: "T1.38",
  },
  {
    // **T6.98, first half.** The lower rule drawn only when there is a footer:
    // a frame with none ends on a blank row and the frame's bottom edge follows
    // content (§6l.2 row 3).
    name: "paint draws the lower rule only when footerRows > 0",
    file: PAINT,
    from: "      rule(width, deps),\n      // **The composed height, not `1`** (I80, I82).",
    to: "      ...(frame.footerRows > 0 ? [rule(width, deps)] : [exact(\"\", width)]),\n      // **The composed height, not `1`** (I80, I82).",
    expect: "T1.39",
  },
  {
    // **T6.98, second half.** The rules in the accent tone. Still an SGR, still
    // a rule — only a comparison against the muted tone's own bytes sees it.
    name: "the rules are painted in the accent tone",
    file: PAINT,
    from: '  return paintSpans([{ text, style: tone("muted", deps.theme, deps.capabilities) }]);',
    to: '  return paintSpans([{ text, style: tone("accent", deps.theme, deps.capabilities) }]);',
    expect: "T1.38",
  },
  {
    // **T6.99, first half.** The footer's height from a constant rather than
    // from the measurer: a three-row footer composes to one and two of its
    // rows are on no row.
    name: "compose takes the footer's height from a constant",
    file: FRAME,
    from: "    footer.length === 0 ? 0 : Math.min(deps.measureSequence(footer, size.columns), MAX_FOOTER_ROWS);",
    to: "    footer.length === 0 ? 0 : 1;",
    expect: "T1.40",
  },
  {
    // **T6.99, second half.** No clamp: a nine-row footer composes to nine, the
    // region at 30 rows survives, and at the size gate it would not.
    name: "compose does not clamp the footer to MAX_FOOTER_ROWS",
    file: FRAME,
    from: "    footer.length === 0 ? 0 : Math.min(deps.measureSequence(footer, size.columns), MAX_FOOTER_ROWS);",
    to: "    footer.length === 0 ? 0 : deps.measureSequence(footer, size.columns);",
    expect: "T1.40",
  },
  {
    // **T6.100, first half.** `visibleRows` windows the whole document at the
    // frame's width and draws no hook: the card's body is flush left, and the
    // rows C14 measured at `width − 2` are not the rows drawn.
    name: "visibleRows bypasses entryLayout",
    file: SESSION,
    from: "    const pieces = windowEntry(entryLayout(entry.doc.blocks, width), from, to, graph.blocks);",
    to: "    const pieces = windowEntry([{ blocks: entry.doc.blocks, width, indent: 0 }], from, to, graph.blocks);",
    expect: "T4.28",
  },
  {
    // **T6.100, second half.** The measurer wrapper measures the document flush
    // while the renderer indents it: a body that wraps at `width − 2` is one
    // row taller than C14 believes, and the row below it is the one dropped.
    name: "the measurer wrapper passes the frame's width for the body",
    file: CONSTRUCT,
    from: "      measureSequence: (blocks, width) => measureEntry(built.blocks.measureSequence, blocks, width),",
    to: "      measureSequence: (blocks, width) => built.blocks.measureSequence(blocks, width),",
    expect: "T4.62",
  },
  {
    // **T6.101.** A hook over nothing: a `step` header with no body gets a
    // second run of zero blocks, and the hook row is drawn beneath it.
    name: "a step header with no body still hangs a hook",
    file: LAYOUT,
    from: "  if (!isCard(blocks) || blocks.length < 2) {",
    to: "  if (!isCard(blocks)) {",
    expect: "T1.41",
  },
  {
    // **T6.102.** The default footer is empty again — `[]` is zero rows, so the
    // default session has no footer and nothing names `/help`.
    name: "the default footer returns []",
    file: CHROME,
    from: "  return Object.freeze({ header: header(name, binary), footer });",
    to: "  return Object.freeze({ header: header(name, binary), footer: () => [] });",
    expect: "T1.43",
  },
];

const EXPECTED_SURVIVORS = new Map([]);

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: FRAME,
    from: "  const height = Math.max(0, size.rows - HEADER_ROWS - HEADER_RULE_ROWS - RULE_ROWS - footerRows - promptRows);",
    to: "  const height = 0;",
    why:
      "the region is always empty — if this survives, no row in the set composes a frame and " +
      "every kill below is unearned",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

for (const r of results) {
  const why = EXPECTED_SURVIVORS.get(r.name);
  if (why === undefined) continue;
  console.log(
    r.killed
      ? `\nEXEMPTION IS STALE  ${r.name}\n  now caught — remove it from EXPECTED_SURVIVORS`
      : `\nEXPECTED SURVIVOR   ${r.name}\n  ${why}`,
  );
}

const unexpected = results.filter((r) => !r.killed && !EXPECTED_SURVIVORS.has(r.name));
const stale = results.filter((r) => r.killed && EXPECTED_SURVIVORS.has(r.name));
process.exit(unexpected.length + stale.length > 0 ? 1 : 0);
