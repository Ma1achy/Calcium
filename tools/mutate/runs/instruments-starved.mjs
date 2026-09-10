// The instruments runner's own reader, mutated — F929's misreading put back.
//
// **`tools/instruments.mjs` reported `0 rows` for a child that had run six rows
// and failed one** (F949): its reader matched `Tests N passed` with the digits
// straight after the word, and vitest writes `Tests  1 failed | 5 passed (6)`
// when a row fails. The reader is exported now and `test/unit/instruments.test.ts`
// hands it the lines vitest writes; the mutations below are the old reader and
// its neighbours, so a row that does not fail here was a citation and not a check.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/instruments.test.ts";
const RUNNER = "tools/instruments.mjs";

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
    file: RUNNER,
    from: "  const py = /— (\\d+)\\/(\\d+) rows/.exec(clean);",
    to: "  const py = /— (\\d+)\\/(\\d+) rowz/.exec(clean);",
    why: "the python counter stops matching, so IN1 reads null where it asserts 12 rows; a run where this survives is not executing the reader's rows at all",
  },
  mutations: [
    {
      // **F929's reader put back.** Rows are the passed count alone, so a summary
      // with a failure under-reports by exactly the rows that failed. IN3 asserts
      // two rows for `1 failed | 1 passed`.
      name: "F929: rows are the passed count alone",
      file: RUNNER,
      from: "    rows: passed + failed,",
      to: "    rows: passed,",
      expect: "IN3",
    },
    {
      // The failed count never read — the other half of the same reader: every
      // state collapses to ok or no-rows.
      name: "failures are not counted",
      file: RUNNER,
      from: '  const failed = count("failed");',
      to: "  const failed = 0;",
      expect: "IN3",
    },
    {
      // The exit status ignored when there is no counter, so a child that died
      // before its first row reads as a fixture that ran nothing — F929's two
      // states under one name.
      name: "did-not-run and no-rows are one state",
      file: RUNNER,
      from: '  if (counter === null || counter.rows === 0) return ok ? "no rows" : "did not run";',
      to: '  if (counter === null || counter.rows === 0) return "no rows";',
      expect: "IN4",
    },
    {
      // A failing counter believed only when the exit status agrees, so a
      // fixture whose failing row still exits 0 reads as ok.
      name: "a failure with exit 0 is ok",
      file: RUNNER,
      from: '  if (counter.failed > 0) return "diverged";',
      to: '  if (counter.failed > 0 && !ok) return "diverged";',
      expect: "IN6",
    },
    {
      // **F897's shape in this reader** (F1018). The bracket never read, so a
      // run that collected six tests and reported two sums to itself and comes
      // back as `errored after its rows` — every word of which is false.
      name: "the collected count is the reported one",
      file: RUNNER,
      from: "    collected: bracket === null ? null : Number(bracket[1]),",
      to: "    collected: passed + failed + count(\"skipped\") + count(\"todo\"),",
      expect: "IN8",
    },
    {
      // The state that makes the loss expressible, removed. `readCounter`
      // stays correct and every crashed run reads as an error after the rows.
      name: "rows lost is not a state",
      file: RUNNER,
      from: '  if (counter.collected !== null && counter.reported < counter.collected) return "lost rows";',
      to: "  if (false) return \"lost rows\";",
      expect: "IN8",
    },
    {
      // The blind spot inverted: a `Tests` line sheared before its bracket read
      // as a loss rather than as unanswerable.
      name: "a summary with no bracket is read as a lost-rows run",
      file: RUNNER,
      from: "  if (counter.collected !== null && counter.reported < counter.collected) return \"lost rows\";",
      to: '  if ((counter.collected ?? counter.reported + 1) > counter.reported) return "lost rows";',
      expect: "IN8b",
    },
    {
      // `reported` counting only what ran, so every deferred row reads as a
      // lost one — the arm IN2 exists to hold.
      name: "a todo is counted as a test that never reported",
      file: RUNNER,
      from: '    reported: passed + failed + count("skipped") + count("todo"),',
      to: "    reported: passed + failed,",
      expect: "IN8b",
    },
    {
      // The escapes left in place — the defect this file's own first run had:
      // `^\s*Tests` never matches a line that begins with ESC.
      name: "escapes are not stripped",
      file: RUNNER,
      from: '  const clean = out.replace(/\\u001b\\[[0-9;]*m/g, "");',
      to: "  const clean = out;",
      expect: "IN5",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
