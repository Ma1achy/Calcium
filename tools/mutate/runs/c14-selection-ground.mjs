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
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/copy-freeze.test.ts";
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
    from: "  const text = sliceCells(row, 0, width);",
    to: '  const text = "";',
    expect: "T1.40b",
  },
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
