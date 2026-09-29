// C22 I149, §6m.4 row 6 — every string linear writes is in the shown form
// (F1470, T6.151).
//
// **One filter, three ways to break it.** `clean` is the only place a string
// takes the form, and `windowLine` is the only place the draft does, so the
// mutations attack the filter itself (put back to deleting), the filter moved
// behind the dedupe it feeds, and the draft drawn raw while measured as the
// form, which is the half-fix whose caret agrees with itself.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const LINEAR = "src/shell/linear.ts";
const FILES = "test/unit/linear.test.ts";

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
    // **A change the corpus can see** (F1254): the neutraliser a no-op, so
    // linear's lines and the registry's copy all carry the characters raw.
    file: "src/data/text.ts",
    from: "export function neutraliseControl(text: string): string {",
    to: "export function neutraliseControl(text: string): string {\n  if (text.length >= 0) return text;",
    why:
      "the neutraliser returns its input, so every line linear writes carries U+202E and ESC raw — "
      + "if this survives, the rows are not reading what linear wrote",
  },
  mutations: [
    {
      // **What shipped**: deleted C0 and C1, bidi passed whole, and the
      // name stopped matching its neutralised copy.
      name: "T6.151: clean returned to stripControl",
      file: LINEAR,
      from: "const clean = (line: string): string => neutraliseControl(line).replaceAll(",
      // Inlined rather than imported, so the mutation fails on what it draws
      // and not on an unresolved name.
      to: "const clean = (line: string): string => line.replace(/[\\u0000-\\u0008\\u000b-\\u001f\\u007f-\\u009f]/gu, \"\").replaceAll(",
      expect: "T1.180",
    },
    {
      // **The draft drawn raw** — the window measures nothing new and the
      // caret stands one form short.
      name: "T6.151: windowLine keeps the raw segments",
      file: LINEAR,
      from: "    segment: neutraliseControl(g.segment),",
      to: "    segment: g.segment,",
      expect: "T1.181",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
