/**
 * C22 §6l.6 — the mutation pass for the indentation language: C22 I84–I86
 * (C22 T6.103–T6.105), the header's rule (I87, T6.106) and C23 I57 (C23 T6.87),
 * and the rows they name.
 *
 * Every anchor is a line the landing round wrote. The control empties the one
 * layout function both the measurer and the renderer read — a green control
 * would mean nothing in the set reaches `entryLayout`, and every kill below is
 * unearned.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/frame-budget.test.ts test/contract/tool-call.test.ts " +
  "test/integration/session.test.ts";
const LAYOUT = "src/shell/entry-layout.ts";
const CHROME = "src/shell/chrome.ts";
const PAINT = "src/shell/paint.ts";
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
  // --- C22 I88–I90 — the gutter language (T1.48–T1.50, T4.63) ------------------
  {
    // C22 T1.48 (I88) — the bar drawn on row 0 too: the hook is gone from every card.
    name: "bar on row 0",
    file: LAYOUT,
    from: "  return run.gutter.map((column) => gutterCell(row === 0 ? column.first : column.rest, options)).join(\"\");",
    to: "  return run.gutter.map((column) => gutterCell(column.rest, options)).join(\"\");",
    expect: "T1.48",
  },
  {
    // C22 T1.49 (I89) — the gutter unit drifts from the body indent: a nested head lands at five cells.
    name: "GUTTER_UNIT is not BODY_INDENT",
    file: LAYOUT,
    from: "export const GUTTER_UNIT = BODY_INDENT;",
    to: "export const GUTTER_UNIT = BODY_INDENT + 1;",
    expect: "T1.49",
  },
  {
    // C22 T1.49 (I89) — the gutter's corner taken from the plot theme's axis: the
    // elbow rounds, and the function shared by measurer and renderer depends on theme.
    name: "gutter corners are round",
    file: LAYOUT,
    from: "        : `${glyphForMask(cell === \"branch\" ? LINE_UP | LINE_DOWN | LINE_RIGHT : LINE_UP | LINE_RIGHT, \"sharp\", caps)}${glyphForMask(LINE_LEFT | LINE_RIGHT, \"sharp\", caps)}`;",
    to: "        : `${glyphForMask(cell === \"branch\" ? LINE_UP | LINE_DOWN | LINE_RIGHT : LINE_UP | LINE_RIGHT, \"round\", caps)}${glyphForMask(LINE_LEFT | LINE_RIGHT, \"round\", caps)}`;",
    expect: "T1.49",
  },
  {
    // C22 T1.50 (I90) — the head copies its own text, not the invocation.
    name: "the head's copy is its text",
    file: LAYOUT,
    from: "          ...(blockId === headId && command !== undefined ? { copy: command } : {}),",
    to: "          ...(blockId === headId && command !== undefined ? {} : {}),",
    expect: "T1.50",
  },

  {
    // C22 T6.103 (I84) — the hook back under the header's mark: two forms, two columns.
    name: "hook indent set to 0",
    file: LAYOUT,
    from: "export const HOOK_INDENT = 2;",
    to: "export const HOOK_INDENT = 0;",
    expect: "T1.44",
  },
  {
    // C22 T6.104 (I85) — the closing blank dropped from every non-card entry.
    name: "blank run dropped from a plain entry",
    file: LAYOUT,
    from: "    return [Object.freeze({ blocks, width, indent: 0, blank: false, gutter: NO_GUTTER }), gap];",
    to: "    return [Object.freeze({ blocks, width, indent: 0, blank: false, gutter: NO_GUTTER })];",
    expect: "T1.45",
  },
  {
    // C22 T6.104's other half — the blank dropped from a card while a plain entry keeps it.
    name: "blank run dropped from a card",
    file: LAYOUT,
    from: "    gap,\n  ];\n}",
    to: "  ];\n}",
    expect: "T4.63",
  },
  {
    // C22 T6.105 (I86) — the right cell two cells wider than its cluster: the clock
    // leaves the last column. The cell's width is the whole mechanism; an `align`
    // on it survived this pass because a cell its content's width has nothing to
    // align (F822).
    name: "right cell wider than its cluster",
    file: CHROME,
    from: "    flex: [1, { cells: clusterCells(right) }],",
    to: "    flex: [1, { cells: clusterCells(right) + 2 }],",
    expect: "T1.46",
  },
  {
    // C22 T6.106 (I87) — the header's rule dropped from the painter's row list.
    name: "header rule not painted",
    file: PAINT,
    from: "      rule(width, deps),\n      ...transcript(frame, deps, width),",
    to: "      ...transcript(frame, deps, width),",
    expect: "T1.47",
  },
  {
    // C23 T6.87 (I57) — the leading gap kept: the hook marks a blank row.
    name: "cardBody returns its input unconditionally",
    file: LAYOUT,
    from: "  if (first === undefined || first.gapBefore !== true) return blocks;",
    to: "  if (first === undefined || first.gapBefore !== true || true) return blocks;",
    expect: "T1.50",
  },
];

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: LAYOUT,
    from: "  const gap = Object.freeze({ blocks: [], width, indent: 0, blank: true, gutter: NO_GUTTER });",
    to: "  const gap = Object.freeze({ blocks: [], width, indent: 0, blank: true, gutter: NO_GUTTER });\n  if (width >= 0) throw new Error(\"control\");",
    why:
      "no entry can lay out at all — if this survives, nothing in the set reaches " +
      "`entryLayout` and every kill below is unearned",
  },
  mutations: MUTATIONS,
});
console.log(report(results));
const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
