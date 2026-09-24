// C19 I28 — a candidate that accepts into a chip, mutated.
//
// **The run exists because the first build was wrong in a way a green suite
// would have kept.** The chip landed, the label was C17's, the parts crossed the
// seam — and `⌃_` took back the delimiter and left the chip standing, because
// the space went in a second `insert`. The invariant says one edit and one undo
// unit, and it took an undo assertion reading the whole buffer back to see that
// the second half of the edit had its own unit. Two of the four mutations below
// are that defect and its neighbour.
//
// The command names `mention-chip.test.ts` because that is where I28's row lives
// (F1243 — a mutation reaches only as far as its run's command), and C17's two
// files beside it so a change paid for out of the editor's own chip path is seen.
//
// Anchors and expectations run by hand on 2026-09-24.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/mention-chip.test.ts test/unit/chip-form.test.ts test/unit/editor.test.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const KEYS = "src/shell/keys.ts";
const EDITOR = "src/interaction/editor/editor.ts";

const results = runPass({
  read,
  write,
  run,
  control: {
    file: KEYS,
    from: "    const chip = candidate.chip;",
    to: "    const chip: undefined = undefined;",
    why: "the tree before C19 I28 — every candidate accepts as a string, so the mention inserts a path and the buffer holds `parse.ts`; a row that cannot see that cannot see the seam",
  },
  mutations: [
    {
      // **The defect the undo assertion found, restored.** It draws identically
      // — same buffer, same label, same chip under the caret — and `⌃_` takes
      // back the space and leaves the chip.
      name: "the delimiter goes in a second edit",
      file: KEYS,
      from: "      deps.editor.insertChip(chip, {\n        replace: { start: edit.start, end: edit.end },\n        ...(whole ? { delimiter: candidate.delimiter ?? \" \" } : {}),\n      });",
      to: "      deps.editor.insertChip(chip, { replace: { start: edit.start, end: edit.end } });\n      if (whole) deps.editor.insert(candidate.delimiter ?? \" \");",
      expect: "T1.71",
    },
    {
      // The chip goes in **beside** the token rather than over it. Every count
      // taken alone still agrees: one chip, C17's label, the ordinal right.
      name: "the span the chip stands in for is not replaced",
      file: KEYS,
      from: "        replace: { start: edit.start, end: edit.end },\n",
      to: "",
      expect: "T1.71",
    },
    {
      // The token closes on nothing, so the next keystroke lands inside the
      // chip's name — C19 I16 lost at the one call site that had to keep it.
      name: "a chip does not close its token",
      file: EDITOR,
      from: "    this.insert(`${sentinel}${opts?.delimiter ?? \"\"}`, { atomic: true });",
      to: "    this.insert(sentinel, { atomic: true });",
      expect: "T1.71",
    },
    {
      // **The ordinal is minted before it is taken.** `#1` becomes `#0`, which
      // is the shape a counter read on the wrong side of its increment has —
      // and the only reader that can see it is one asserting the number the
      // source never supplied.
      name: "the ordinal is read before the counter moves",
      file: EDITOR,
      from: "    this.#nextChip += 1;",
      to: "",
      expect: "T1.71",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
