// C10 I64 — a declared floor is finite, at least the common floor, at most 21.
// Mutated (C10 T6.115–T6.116), plus the upper bound and the finiteness term.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/theme-floor.test.ts";
const CONTRAST = "src/presentation/theme/contrast.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
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
    file: CONTRAST,
    from: "const MAX_RATIO = 21;",
    to: "const MAX_RATIO = 7;",
    why: "the ceiling at hcDark's own floor refuses 21 — T1.54 lists 21 as legal",
  },
  mutations: [
    {
      name: "NO-CHECK: validateTokens drops the floor check (T6.115)",
      file: CONTRAST,
      from: "  const errors: ThemeError[] = [...validateFloor(tokens)];",
      to: "  const errors: ThemeError[] = [];",
      expect: "T2.69",
    },
    {
      name: "ZERO: the lower bound is 0, not the common floor (T6.116)",
      file: CONTRAST,
      from: "floor >= DEFAULT_FLOOR && floor <= MAX_RATIO",
      to: "floor >= 0 && floor <= MAX_RATIO",
      expect: "T1.54",
    },
    {
      // **The shape the review's NaN came through: a refusal written as the
      // negation.** NaN fails every comparison, so a range test that *accepts*
      // on `>=` and `<=` refuses it with or without `isFinite` — the first draft
      // of this mutation dropped the term and survived, because it was the
      // equivalent program. `reject if below or above` is not: NaN is neither,
      // and passes.
      name: "NEGATED: the range written as a refusal, which NaN is never below or above",
      file: CONTRAST,
      from: "  if (Number.isFinite(floor) && floor >= DEFAULT_FLOOR && floor <= MAX_RATIO) return Object.freeze([]);",
      to: "  if (!(floor < DEFAULT_FLOOR || floor > MAX_RATIO)) return Object.freeze([]);",
      expect: "T1.54",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
