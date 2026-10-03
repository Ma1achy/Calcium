// C22 T1.4h — every binding in the table is consumed at its target, and the
// two rows F1457 found mis-aimed now test their own claim (ruling 88).
//
// **The binding kept, its target's handler declining it.** Before ruling 88,
// `prompt:⌥v -> valuesToggle` was pressed at `liveBlock`, where the same chord
// is bound, and `liveBlock:⌥⏎ -> rerunEntry` at the prompt, where it is
// `insertNewline`, so a target that stopped answering its own row left T1.4h
// green. Each mutation below survived the row as it stood at 0e08af20, and
// failed T2.17 alone there. **Read from the `FAIL` lines, not from this
// report**: run against the old row, the report said `caught` for both,
// because vitest lists a passing row's ✓ line under a file that failed and
// the harness's named-row test is a substring over the whole output.
//
// **Not "drop the binding from the keymap"**, which was the obvious form and
// cannot be seen: T1.4h and T2.17 both walk `defaultKeymap`, so a dropped row
// is a row neither presses. Measured, the control below written as a dropped
// `liveBlock:⌥v` survived the whole file.
//
// The control is `liveBlock`'s handler answering nothing, so every row at the
// target is passed on: if that survives, T1.4h is not reading who answered.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CONSTRUCT = "src/shell/construct.ts";
const FILES = "test/unit/session-keys.test.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 300_000 });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.killed === true ? `${out}\nTIMED OUT after 300000ms` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: CONSTRUCT,
    from: '      const effect = bound("liveBlock", e) ?? pointerEffect(e);',
    to: "      const effect = null as (() => void) | null;",
    why:
      "liveBlock's handler answers nothing, so every row at the target is passed on — "
      + "if this survives, T1.4h is not reading which rung answered",
  },
  mutations: [
    {
      // F1457's first row: answered by `liveBlock:⌥v` while it was mis-aimed.
      name: "ruling 88: the prompt declines ⌥v, and prompt:⌥v -> valuesToggle reaches nothing",
      file: CONSTRUCT,
      from: '      const effect = bound("prompt", e);',
      to: '      const effect = e.kind === "key" && e.key.meta && e.key.name === "v" ? null : bound("prompt", e);',
      expect: "T1.4h (C22",
    },
    {
      // F1457's second row: answered by the prompt's `insertNewline`. The
      // `⇧⏎` row beside it is left answered, so only `⌥⏎` can see this.
      name: "ruling 88: liveBlock declines ⌥⏎, and liveBlock:⌥⏎ -> rerunEntry reaches nothing",
      file: CONSTRUCT,
      from: '      const effect = bound("liveBlock", e) ?? pointerEffect(e);',
      to:
        '      const effect = (e.kind === "key" && e.key.meta && e.key.name === "enter" ? null : bound("liveBlock", e))'
        + " ?? pointerEffect(e);",
      expect: "T1.4h (C22",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
