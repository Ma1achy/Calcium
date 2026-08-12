// Group 9 — the waiter, mutated.
//
// **Every mutation here is a waiter that has existed.** The first two are the
// idiom this file replaced, the third is the overshoot the CLI showed on its
// first real run, and the last two are the two ways a report can be invented:
// claiming a run finished when the clock ran out, and handing back the waiter's
// own status instead of the run's.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/waitfor.test.ts";
const FILE = "tools/waitfor.mjs";

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
    from: "  if (m === null) return { done: false, line: null, code: null };",
    to: "  return { done: false, line: null, code: null };",
    why: "W2 asserts a log carrying `EXIT=1` is done with code 1; a reading that is never done cannot satisfy it, so a run where this survives cannot see a kill",
  },
  mutations: [
    {
      // **The measured instance.** Non-emptiness in place of the sentinel — the
      // shell idiom `[ -s "$LOG" ]`, transcribed. It fires on the load average
      // the run echoes a second in.
      name: "armed on the file being non-empty, as the idiom was",
      file: FILE,
      from: "  const m = re.exec(text);",
      to: "  const m = text.length > 0 ? /^/.exec(text) : null;",
      expect: "W1",
    },
    {
      // The subtler one. `EXIT=` unanchored matches this repository's own
      // `E2E_WITH_LOAD_EXIT=0`, so the wait ends on a line about the run rather
      // than at the end of it.
      name: "the sentinel is unanchored, so a word the run prints ends the wait",
      file: FILE,
      from: 'export const DEFAULT_SENTINEL = "^EXIT=";',
      to: 'export const DEFAULT_SENTINEL = "EXIT=";',
      expect: "W3",
    },
    {
      name: "the last sleep overshoots the deadline again",
      file: FILE,
      from: "    await sleep(Math.min(everyMs, timeoutMs - waitedMs));",
      to: "    await sleep(everyMs);",
      expect: "W4b",
    },
    {
      // **The one that matters most and looks most reasonable.** A timeout
      // reported as a completion is the whole class this instrument is in: three
      // instruments reported a completion they never observed in one session.
      name: "a timeout is reported as a finished run",
      file: FILE,
      from: "      return { done: false, line: null, code: null, timedOut: true, waitedMs };",
      to: "      return { done: true, line: null, code: 0, timedOut: true, waitedMs };",
      expect: "W4",
    },
    {
      // Reading the status off the wrong thing: the waiter's own success rather
      // than the run's. It is the pipe defect at one remove — a channel handing
      // back a plausible number that is about something else.
      name: "the run's exit code is dropped and 0 handed back",
      file: FILE,
      from: "  return { done: true, line, code: digits === null ? null : Number(digits[1]) };",
      to: "  return { done: true, line, code: 0 };",
      expect: "W2",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
