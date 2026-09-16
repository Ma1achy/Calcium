// C23 I72 — a source's next deadline is one interval after the last deadline,
// not one interval after the fetch that settled. Mutated (T6.102, F1206).
//
// **No frame can see this**: every mutation draws the same bytes, sooner or
// later, and a duration would measure the machine. T2.48 reads the deadline
// sequence off the timer the driver arms, which is `min(dueAt)` and the thing
// the invariant is about; T1.32 reads the backoff through a rendered countdown,
// which is what the bound's arm moves.
//
// **The control doubles every step**, which T2.48's fast arm sees as 32 where
// it asserts 16 — a change the corpus can see that is not a mutation of the
// rule.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/refresh.test.ts";
const RF = "src/shell/refresh.ts";

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
    file: RF,
    from: "    src.dueAt = from + interval;",
    to: "    src.dueAt = from + interval * 2;",
    why: "every step is two intervals: T2.48's fast arm reads a 32 ms gap where it asserts 16",
  },
  mutations: [
    {
      // **Dated from the settle** — the tree before C23 I72: the wake's lateness
      // and the fetch's duration join every period and are never recovered.
      name: "SETTLE-DATED: the next deadline is one interval after the fetch that settled",
      file: RF,
      from: "    const from = behind >= 0 && behind < src.intervalMs ? src.dueAt : at;",
      to: "    const from = at;",
      expect: "T2.48",
    },
    {
      // **The clamp removed**: a far side slower than its cadence chains too,
      // so it lands three deadlines behind and fires three overdue sweeps.
      name: "CLAMP-REMOVED: a slow far side chains from a deadline it is already past",
      file: RF,
      from: "    const from = behind >= 0 && behind < src.intervalMs ? src.dueAt : at;",
      to: "    const from = src.dueAt;",
      expect: "T2.48",
    },
    {
      // **The bound measured against the backoff** rather than the declared
      // interval: a source woken a full interval late reads as current and
      // retries at half its doubled backoff.
      name: "BOUND-IS-BACKOFF: the lateness is measured against the backoff, not the declared interval",
      file: RF,
      from: "    const from = behind >= 0 && behind < src.intervalMs ? src.dueAt : at;",
      to: "    const from = behind >= 0 && behind < interval ? src.dueAt : at;",
      expect: "T1.32",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
