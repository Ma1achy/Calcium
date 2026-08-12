// Group 9 — the bench's liveness guard, mutated.
//
// **The guard is the instrument's instrument**, so a weak fixture here is worse
// than none: it reports that the thing standing between a timing number and a
// blank screen has been checked. The five mutations below are the five ways it
// has actually been wrong or could silently be — the hardcoded label is the
// measured one, and the other four are the readings the guard exists to refuse.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/bench-liveness.test.ts";
const FILE = "tools/bench/liveness.mjs";

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
    file: FILE,
    from: "  const dead = body < min || content < min;",
    to: "  const dead = false;",
    why: "BL3 asserts a blank screen is dead; a guard that never reports death cannot satisfy it, so a run where this survives cannot see a kill",
  },
  mutations: [
    {
      // **The measured defect.** `KIND` replaced by the word it used to be, so a
      // `logs` run says `patch lines`. BL2 exists because BL1 alone passes
      // against a label hardcoded to `logs` — the same defect, other constant.
      name: "the label hardcodes `patch` again, whatever ran",
      file: FILE,
      from: "${String(body)} of them ${kind} lines",
      to: "${String(body)} of them patch lines",
      expect: "BL1",
    },
    {
      // A frame drew, the chrome is on it, the document is not. Counting
      // non-blank rows alone calls that live — and the timings below it would be
      // the cost of rendering a border.
      name: "content alone decides, so chrome without a document reads live",
      file: FILE,
      from: "  const dead = body < min || content < min;",
      to: "  const dead = content < min;",
      expect: "BL4",
    },
    {
      name: "the floor is off by one",
      file: FILE,
      from: "  const dead = body < min || content < min;",
      to: "  const dead = body < min - 1 || content < min - 1;",
      expect: "BL5",
    },
    {
      // The pollers guard's own version of BL4: `-` is what a part that never
      // ticked prints, and two of them agree exactly.
      name: "a loading dash counts as a sample",
      file: FILE,
      from: '  const dead = ticks === 0 || samples.length !== expected || samples.includes("-");',
      to: "  const dead = ticks === 0 || samples.length !== expected;",
      expect: "BL6",
    },
    {
      // The overcorrection, and the reason BL7 is a row: F91 asks whether two
      // views of one source report *different* numbers, so a guard that called
      // agreement death would answer the question by refusing to ask it.
      name: "agreement is treated as death, which answers F91 by refusing it",
      file: FILE,
      from: '  const dead = ticks === 0 || samples.length !== expected || samples.includes("-");',
      to: '  const dead =\n    ticks === 0 ||\n    samples.length !== expected ||\n    samples.includes("-") ||\n    new Set(samples).size === 1;',
      expect: "BL7",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
