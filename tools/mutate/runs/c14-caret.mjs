// The caret, the anchor and the granularity atomicity needs (C14 §6c).
//
// **Every mutation here leaves a mode that moves and selects.** Arrows work,
// the count climbs, `y` copies. What changes is the *rule* each motion obeys —
// touching or containing, re-derived or accumulated, moving or selecting — and
// none of it is visible from a row about the arrows being bound.
//
// The first is the section's reason for existing: with the caret and the
// selection both at the block, `R-SEL-003` is a property of the type and no
// mutation can violate it. It is violable here because the caret is a row.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/copy-freeze.test.ts test/unit/semantic-selection.test.ts";
const MODEL = "src/shell/semantic-selection.ts";

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
    // **Containment for touching** — `R-SEL-003` inverted, and the defect it was
    // written about. It returns fewer blocks and every one it returns is right,
    // so a selection over a tall table simply comes back empty and reads as the
    // extend not having reached it yet.
    name: "a block joins the selection only if the range contains it whole",
    file: MODEL,
    from: "    if (sp.to > lowRow && sp.from <= highRow) out.add(sp.key);",
    to: "    if (sp.from >= lowRow && sp.to - 1 <= highRow) out.add(sp.key);",
    expect: "T1.36",
  },
  {
    // **The range accumulated rather than re-derived** (C14 I37). Every extend
    // adds and none takes away, so an over-shoot is unrecoverable — which is
    // right for every selection made in one direction, and that is most of them.
    name: "an extend adds to the selection instead of re-deriving it",
    file: MODEL,
    from:
      "  const caret = step(mode.caret, delta, spans, order);\n  return frozen(caret, anchor, blocksTouched(anchor, caret, spans, order));",
    to:
      "  const caret = step(mode.caret, delta, spans, order);\n  return frozen(caret, anchor, new Set([...mode.blocks, ...blocksTouched(anchor, caret, spans, order)]));",
    expect: "T1.38b",
  },
  {
    // **The anchor re-planted on every step.** It reads as keeping the anchor
    // where the reader is, and turns the extend into a one-row selection that
    // never grows — caught only because the row asserts the whole set.
    name: "the anchor follows the caret rather than staying where the extend began",
    file: MODEL,
    from:
      "  const anchor = mode.anchor ?? mode.caret;\n  const caret = step(mode.caret, delta, spans, order);",
    to:
      "  const anchor = mode.caret;\n  const caret = step(mode.caret, delta, spans, order);",
    expect: "T1.38b",
  },
  {
    // **A plain arrow that also selects** (C14 I37). The pair exists so the
    // caret can be placed without selecting on the way, and one verb doing both
    // is the mode every other editor has — which is why it reads as correct.
    name: "a plain arrow extends as well as moving",
    file: MODEL,
    from: "  return frozen(step(mode.caret, delta, spans, order), mode.anchor, mode.blocks);",
    to: "  return extendCaret(mode, delta, spans, order);",
    expect: "T1.38b",
  },
  {
    // **The count as entries** (C14 I38). It is the number a reader would say
    // out loud, and it reports a half-taken entry as a whole one — the number
    // wrong in the direction `R-SEL-015` exists to prevent.
    name: "the count is entries rather than blocks",
    file: MODEL,
    from: "export const count = (mode: SemanticMode): number => mode?.blocks.size ?? 0;",
    to: "export const count = (mode: SemanticMode): number =>\n  mode === null ? 0 : new Set([...mode.blocks].map(entryOf)).size;",
    expect: "T1.39",
  },
];

const results = await runPass({
  read,
  write,
  run,
  control: {
    // **A change the run's own corpus can see** (F1254): the caret never moves,
    // so every row about a motion fails. If this survives, nothing below reaches
    // the model's motions.
    file: MODEL,
    from: "  let { entryId, row } = { entryId: caret.entryId, row: caret.row + delta };",
    to: "  let { entryId, row } = { entryId: caret.entryId, row: caret.row };",
    why:
      "the caret never moves, so every row about a motion fails — " +
      "if this survives, nothing below reaches the motions and every kill is unearned",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
