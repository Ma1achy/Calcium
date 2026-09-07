// C09 I25a — `keyValue` windows with its key column pinned. Mutated.
//
// **The defect a pin prevents is a difference between two windows**, never a
// property of one, so every mutation here has to be killed by a row that sweeps
// rather than samples (C25 T3.20's method, one kind over). A window asserted at
// offset 0 passes against the unpinned behaviour, because offset 0 is where the
// long keys are.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/block-window.test.ts test/unit/blocks.test.ts";
const KINDS = "src/presentation/blocks/kinds/structured.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: KINDS,
    from: "const KEY_COLUMN_CAP = 20;",
    to: "const KEY_COLUMN_CAP = 3;",
    why: "the cap decides every key column; a run where this survives cannot see a kill",
  },
  mutations: [
    {
      // The window stops saying what its parent measured. Every window then
      // derives from its own slice and the values slide sideways as the reader
      // scrolls — C25 I21a's defect, one kind over.
      name: "PIN-DROPPED: the window no longer carries the block's key column",
      file: KINDS,
      from: "rows: block.rows.slice(lo, hi), keyWidth: keyColumn(block, width) }",
      to: "rows: block.rows.slice(lo, hi) }",
      expect: "T2.16",
    },
    {
      // **The pin set but not read.** Everything that inspects the block still
      // passes; only the rendered line moves. This is why T2.16 asserts where
      // the value starts rather than what the field holds.
      name: "PIN-IGNORED: the renderer derives its own column anyway",
      file: KINDS,
      from: "const keyWidth = block.keyWidth ?? keyColumn(block, width);",
      to: "const keyWidth = keyColumn(block, width);",
      expect: "T2.16",
    },
    {
      // A second expression of the same arithmetic — the drift the shared
      // helper exists to prevent, reintroduced one level down. The window pins
      // an uncapped width and the renderer caps it.
      name: "PIN-UNCAPPED: the window computes the column a second way",
      file: KINDS,
      from: "keyWidth: keyColumn(block, width) }",
      to: "keyWidth: Math.max(...block.rows.map((r) => r.label.length)) }",
      expect: "T2.16",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
