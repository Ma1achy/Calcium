// C09 §2, C26 §5 (I4, I6), C14 I19 — the lifted list's origins, and the frame's
// alignment read from one function.
//
// **Every mutation here restores a measured defect** (F754–F757). The walk
// lifted rows and never columns, so two 39-wide tables in an 80-column row both
// answered `cols [0, 39)` and a click at column 50 focused the first; it reset
// each child to the container's top, so a panel's table answered one row above
// the frame and a second table in a column group overlapped the first; and the
// frame's bottom alignment was the same expression written twice, in `paint.ts`
// and in `construct.ts`. Every one of those passed the block-level sweep.
//
// **Applied by hand on landing, each restored and the tree diffed** — the
// harness was not run in the lane that wrote this (arc2 rule), so the kills
// recorded in the `expect` fields are the hand pass's. Run it before trusting
// them further: an anchor moved without the pass is a survivor nobody sees.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const REG = "src/presentation/blocks/registry.ts";
const PAINT = "src/shell/paint.ts";
const VIEWPORT = "src/viewport/viewport/viewport.ts";
const CMD =
  "npx vitest run test/contract/block-elements.test.ts test/unit/session-mouse.test.ts test/unit/viewport.test.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 300_000 });
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
    why: "every kind's height collapsed to one row, which every offset in the lifted list depends on",
  },
  mutations: [
    {
      // **F756, restored.** Rows lifted, columns not: both tables at `[0, 39)`.
      name: "the column origin is dropped — every block at column 0",
      file: REG,
      from: "cols: Object.freeze({ from: left + element.cols.from, to: left + element.cols.to }),",
      to: "cols: element.cols,",
      expect: "T2.29",
    },
    {
      // **F757, restored.** A panel's table one row above where the frame draws it.
      name: "a panel's children start on its top border",
      file: REG,
      from: "sequence(block.children, top + 1, left + rail, widths[0] ?? 1);",
      to: "sequence(block.children, top, left + rail, widths[0] ?? 1);",
      expect: "T2.31",
    },
    {
      // **F757's other half.** Every child of a sequence at the sequence's top,
      // which is what `row = before` did for a column group and a panel.
      name: "the sequence cursor does not advance",
      file: REG,
      from: "        row += this.measure(block, atWidth);\n",
      to: "",
      expect: "T2.31",
    },
    {
      // A child the renderer does not place still answers, at a column the width
      // does not have (C04 §3).
      name: "unplaced row-group children are walked",
      file: REG,
      from: "block.children.slice(0, placeable(block, atWidth)).forEach",
      to: "block.children.forEach",
      expect: "T2.31",
    },
    {
      // **The two consumers move together, and the independent `term()` in the
      // unit harness is what sees the move.** T4.62c — the frame-read row in
      // the session harness — survives this by design: it asserts the click
      // against the painted frame, and both went the same way.
      name: "the alignment is one row short — frame and click both",
      file: PAINT,
      from: "return Math.max(0, regionHeight - rows);",
      to: "return Math.max(0, regionHeight - rows - 1);",
      expect: "T4.62",
    },
    {
      // C14 I19 — the rows already scrolled past are forgotten (T3.1c's case).
      name: "entryAtRow answers offset 0 for an entry begun above the top edge",
      file: VIEWPORT,
      from: "return Object.freeze({ id: entry.id, rowOffset: offset });",
      to: "return Object.freeze({ id: entry.id, rowOffset: 0 });",
      expect: "T3.1c",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
