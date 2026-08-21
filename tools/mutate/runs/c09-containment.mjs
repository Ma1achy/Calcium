// C09 I11, I29, I30 — the boundary, and the three things it owes.
//
// **The first row restores a defect that actually happened**, which is the
// strongest form a revert takes: the error path returning one row whatever
// `measure` had committed is the code as it shipped, and T3.13 asserted the
// frame that produced. Two rows must die on it — the four heights and the
// sequence — because a boundary that answers a constant satisfies any single
// height you pick.
//
// **Every anchor was checked for uniqueness before the pass** (F219), including
// the two that are the same statement twice: `return NO_ELEMENTS;` appears in
// both arms of `#elements`, and `committed.rows` in both `#errorBlock` calls, so
// each anchors on the line above it.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const REG = "src/presentation/blocks/registry.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync("npx vitest run test/edge/blocks.test.ts test/revert/blocks.test.ts 2>&1", {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 300_000,
    });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.code === "ETIMEDOUT" ? `${out}\nTIMED OUT` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: REG,
    from: "  measure = (block: Block, width: number): number => this.#measured(block, normaliseWidth(width)).rows;",
    to: "  measure = (): number => 1;",
    why: "every kind's height collapsed to one row, which T2.1 and half of tier 3 are about",
  },
  mutations: [
    {
      // **The shipped defect, restored.** `rows([paint([…])])` — one string,
      // floored at one — with `measure` never consulted. Measured at 1 against a
      // real plot's 20, and at 3 against a sequence measuring 22.
      name: "the error block is one row regardless of what measure committed",
      file: REG,
      // **Re-pointed when the boundary moved into the `status` definition.** The
      // padding loop this used to anchor on is gone; the same defect is now the
      // boundary handing the box a constant instead of the number `measure`
      // committed, which is the height it is bound by (C09 I31). The pass was
      // re-run on the commit that moved it — an anchor changed without running
      // the pass is a survivor nobody sees (F219).
      from: '      { kind: "status", id: "status", state: "error", message: text, height },',
      to: '      { kind: "status", id: "status", state: "error", message: text, height: 1 },',
      expect: "T3.33",
    },
    {
      // The same defect seen from the sequence, which is where it moves a frame
      // rather than a block: 19 rows of pad and C14 still scrolling twenty.
      name: "the render catch uses the fallback height rather than the committed one",
      file: REG,
      // Re-pointed twice: when the message lost its brackets — they were
      // annotation in a design figure marking which cells carry paint, read as
      // characters — and again when the call moved inside `#floored` and the
      // three arguments came onto one line. **Re-run on each re-anchor**, which
      // is the standing rule: an anchor moved without the pass being run is a
      // row nothing has watched since the day it was written.
      from: "this.#errorBlock(`${block.kind} failed to render: ${message}`, committed.rows, childContext)",
      to: "this.#errorBlock(`${block.kind} failed to render: ${message}`, 1, childContext)",
      expect: "T3.34",
    },
    {
      // **A measurer that gave way while the renderer succeeded.** Without the
      // branch the good render is truncated to the fallback and says nothing —
      // 4 of 5 rows dropped by the caller's own clamp.
      name: "a contained measurer lets the render through and is truncated to it",
      file: REG,
      from: "    if (!committed.ok) {",
      to: "    if (false) {",
      expect: "T3.14",
    },
    {
      // C09 I29 — the state both catches shipped in.
      name: "the render catch swallows without reporting",
      file: REG,
      from: '      this.#report(block, "render", error);',
      to: "",
      expect: "T3.35",
    },
    {
      name: "the measure catch swallows without reporting",
      file: REG,
      from: '      this.#report(block, "measure", error);',
      to: "",
      expect: "T3.14",
    },
    {
      // **C09 I30, and the anchor is the line above because `return NO_ELEMENTS;`
      // is in both arms.** Answering `owned: true` from a call that threw is
      // the shipped disagreement: *no elements* and *do not descend* at once.
      name: "a throwing `elements` still owns its children",
      file: REG,
      from: '      this.#report(block, "elements", error);\n      return NO_ELEMENTS;',
      to:
        '      this.#report(block, "elements", error);\n' +
        "      return { elements: EMPTY_ELEMENTS, owned: true };",
      expect: "T3.37",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
