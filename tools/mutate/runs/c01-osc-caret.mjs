// C01 I26, ruling 86 — an OSC 2 or OSC 9 payload shows C0, DEL and C1 in
// caret form, mutated (C01 T6.26; F1458).
//
// **Three ways to lose the form and one way to lose the property.** Put back
// to deleting is the tree before ruling 86; the `M-` prefix dropped, DEL's arm
// dropped and tab and newline copied from `controlForm`'s exception are the
// restatement drifting from `data/text.ts`'s — the reason T2.13 exists; C1
// passed whole is the security property itself, which only T1.35 reads from
// the bytes. The bidi arm dropped is here as well as in c01-osc-bidi, because
// T1.35 is the second row that must see it.
//
// The control is the caret function returning its input, so the ESC itself
// is written: if that survives, the rows are not reading a payload.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const ESCAPES = "src/terminal/escapes.ts";
const FILES = [
  "test/unit/lifecycle.test.ts",
  "test/contract/lifecycle.test.ts",
  "test/revert/lifecycle.test.ts",
  "test/unit/notify.test.ts",
].join(" ");

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run --maxWorkers=3 ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 300_000 });
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
    // **A change the corpus can see** (F1254): every control written raw.
    file: ESCAPES,
    from: "const caret = (ch: string): string => {\n",
    to: "const caret = (ch: string): string => {\n  if (ch.length > 0) return ch;\n",
    why:
      "the caret function returns its input, so ESC and BEL are written inside the payload — "
      + "if this survives, the rows are not reading what the builders wrote",
  },
  mutations: [
    {
      // **What shipped until ruling 86**: `ESC [ 2 J` reached the title as `[2J`.
      name: "C01 T6.26: the OSC builder put back to deleting",
      file: ESCAPES,
      from: "    .replace(CONTROL, caret)\n",
      to: '    .replace(CONTROL, "")\n',
      expect: "T1.34 (I26",
    },
    {
      // The other arm, dropped whole: U+202E reaches the title bar raw.
      name: "C01 T6.25: the bidi arm dropped",
      file: ESCAPES,
      from: "    .replace(BIDI_FORMAT, (ch) =>",
      to: "    .replace(/(?!)/gu, (ch) =>",
      expect: "T1.35 (I26",
    },
    {
      // The restatement drifting: C1 drawn as a C0 would be.
      name: "C01 T6.26: the C1 arm's `M-` prefix dropped",
      file: ESCAPES,
      from: "  if (unit >= 0x80) return `M-^${String.fromCharCode(unit - 0x40)}`;",
      to: "  if (unit >= 0x80) return `^${String.fromCharCode(unit - 0x40)}`;",
      expect: "T2.13 (I26",
    },
    {
      // The restatement drifting: DEL falls through to the C0 arm, `^` + U+00BF.
      name: "C01 T6.26: DEL's arm dropped",
      file: ESCAPES,
      from: '  if (unit === 0x7f) return "^?";\n',
      to: "",
      expect: "T2.13 (I26",
    },
    {
      // `controlForm`'s exception copied: a block lays tab and newline out,
      // and a payload writes them.
      name: "C01 T6.26: tab and newline left as themselves",
      file: ESCAPES,
      from: "const CONTROL = /[\\u0000-\\u001f\\u007f-\\u009f]/gu;",
      to: "const CONTROL = /[\\u0000-\\u0008\\u000b-\\u001f\\u007f-\\u009f]/gu;",
      expect: "T1.34 (I26",
    },
    {
      // **The security property**: C1 passes whole, and U+009C is an 8-bit ST.
      name: "C01 T6.26: C1 passed whole",
      file: ESCAPES,
      from: "const CONTROL = /[\\u0000-\\u001f\\u007f-\\u009f]/gu;",
      to: "const CONTROL = /[\\u0000-\\u001f\\u007f]/gu;",
      expect: "T1.35 (I26",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
