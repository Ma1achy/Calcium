// C01 I26 — an OSC 2 or OSC 9 payload shows its bidi format characters,
// mutated (C01 T6.25; ruling 71, F1407).
//
// **Two ways the arm can be lost**: whole, which is the tree before F1407 was
// closed, and by one member, which is the restated set drifting from
// `data/text.ts`'s — the reason T2.12 exists. The control is the other arm,
// the caret form, removed: T1.31 reads a title's `^[[31m` directly.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run --maxWorkers=3 test/unit/lifecycle.test.ts test/contract/lifecycle.test.ts";
const ESCAPES = "src/terminal/escapes.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const BUFFER = 256 * 1024 * 1024;
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: BUFFER });
  } catch (e) {
    if (e.killed === true) return "the suite did not return — timed out";
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: ESCAPES,
    from: "    .replace(CONTROL, caret)\n",
    to: "",
    why: "T1.31 asserts a title's `ESC [ 31 m` arrives as `^[[31m`; with the caret arm gone the ESC is written",
  },
  mutations: [
    {
      name: "C01 T6.25: `oscText`'s bidi arm removed",
      file: ESCAPES,
      from: "    .replace(BIDI_FORMAT, (ch) =>",
      to: "    .replace(/(?!)/gu, (ch) =>",
      expect: "T1.33",
    },
    {
      name: "C01 T6.25: U+2066 dropped from the restated set",
      file: ESCAPES,
      from: "\\u202a-\\u202e\\u2066-\\u2069]/gu;",
      to: "\\u202a-\\u202e\\u2067-\\u2069]/gu;",
      expect: "T2.12",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
