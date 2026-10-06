// C07 I12 — a degraded stream's remainder is the run, not the patch (F1432).
//
// **The defect this closes was the one-patch lookbehind**: C06 trips at the
// tenth line of a stream that is text from its first byte, so holding only the
// line immediately before `degraded` dropped nine. T3.22 is driven through C06's
// real reader, so both mutations below meet the floor as it is rather than as a
// hand-built patch sequence restates it. The control is the shape that shipped.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/adapter-registry.test.ts";
const STREAM = "src/data/adapters/stream.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  // The kill not in doubt: the run never seeds the block, so the remainder
  // opens empty and T3.19c's first line and T3.22's twelve are both missing.
  control: {
    file: STREAM,
    from: "        remainder = pending;",
    to: "        remainder = [];",
    why: "the remainder opens empty — T3.19c and T3.22 both read its first line",
  },
  mutations: [
    {
      // T6.16, first arm — the shape that shipped: one line of lookbehind.
      name: "only the last malformed line is retained",
      file: STREAM,
      from: "          pending.push(patch.line);",
      to: "          pending = [patch.line];",
      expect: "T3.22",
    },
    {
      // T6.16, second arm — the run outlives a value, so noise among good
      // lines leads the remainder.
      name: "a data patch does not end the run",
      file: STREAM,
      from: "        // A good value after the run: the run was noise among good ones.\n        pending = [];",
      to: "        // A good value after the run: the run was noise among good ones.",
      expect: "T3.22",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
