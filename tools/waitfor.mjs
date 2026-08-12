// Wait for a long run to finish, and report what it finished with.
//
//     node tools/waitfor.mjs out/all.log            # default sentinel: ^EXIT=
//     node tools/waitfor.mjs out/all.log '^DONE'    # or name your own
//
// **This is a file because it kept being an idiom, and the idiom was wrong.**
// A full `make all` outlasts a single command, so the shape is: start it in the
// background writing to a log, poll the log, report when it lands. Written
// inline each time, the poll was `[ -s "$LOG" ]` — *is the file non-empty* —
// and the log's first line is the load average, written a second in. So the
// waiter fired immediately and reported a run complete that had not started.
//
// That is `VERIFYING.md`'s class again: a result read through a channel that
// cannot express it. Non-emptiness cannot express completion, and it returns a
// plausible value rather than an error. **The third instrument in one session to
// report a completion it never observed**, and the only one of the three with
// nowhere to put a fixture — so the remedy is the file before it is the logic.
//
// Two rules, and both are the same rule pointed in the safe direction:
//
//   - **Arm on a sentinel the run writes last**, never on the file existing or
//     growing. `EXIT=$?` echoed after the command is the cheapest one.
//   - **A timeout is a timeout, not a completion.** Exit 2, say so, and let the
//     caller decide. Reporting the run as done because the clock ran out is the
//     failure this file exists to prevent, one level up.

import { readFileSync } from "node:fs";

/** Anchored at a line start, so `E2E_WITH_LOAD_EXIT=0` in a comment is not the
 * sentinel. The mistake this guards is subtler than the non-empty one and lands
 * the same way: a substring match on a word that appears in the run's own
 * output finishes the wait early. */
export const DEFAULT_SENTINEL = "^EXIT=";

/**
 * @param {string} text     the log so far
 * @param {string} sentinel a regular expression, matched per line
 * @returns {{done: boolean, line: string | null, code: number | null}}
 *   `code` is the trailing integer of the matched line when there is one, so a
 *   waiter can hand back the run's own status instead of its own.
 */
export function reading(text, sentinel = DEFAULT_SENTINEL) {
  const re = new RegExp(sentinel, "m");
  const m = re.exec(text);
  if (m === null) return { done: false, line: null, code: null };
  const line = text.slice(m.index).split("\n", 1)[0] ?? "";
  const digits = /(-?\d+)\s*$/.exec(line);
  return { done: true, line, code: digits === null ? null : Number(digits[1]) };
}

/**
 * Poll until the sentinel lands or the deadline passes.
 *
 * The clock and the sleep are injected for the same reason C22 injects one: a
 * fixture that waits in real time is a fixture nobody runs in a gate. Reading is
 * injected too, so *the file grew but did not finish* is expressible.
 *
 * @param {{read: () => string, now: () => number, sleep: (ms: number) => Promise<void>,
 *          sentinel?: string, timeoutMs?: number, everyMs?: number}} opts
 */
export async function waitFor({
  read,
  now,
  sleep,
  sentinel = DEFAULT_SENTINEL,
  timeoutMs = 3_600_000,
  everyMs = 5_000,
}) {
  const start = now();
  for (;;) {
    const r = reading(read(), sentinel);
    const waitedMs = now() - start;
    if (r.done) return { ...r, timedOut: false, waitedMs };
    if (waitedMs >= timeoutMs) {
      return { done: false, line: null, code: null, timedOut: true, waitedMs };
    }
    // **The last sleep is clipped to the deadline**, and this was wrong when the
    // CLI was first run against a real log: a 6-second timeout reported `TIMED
    // OUT after 10s`, because the poll slept its full interval and then noticed.
    // The number was honest — it really had waited ten seconds — which is what
    // makes the overshoot worth removing rather than explaining. A caller that
    // sets a deadline is usually about to do something else at it.
    await sleep(Math.min(everyMs, timeoutMs - waitedMs));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const path = process.argv[2];
  const sentinel = process.argv[3] ?? DEFAULT_SENTINEL;
  const timeoutMs = Number(process.argv[4] ?? 3_600_000);
  const r = await waitFor({
    // A log that does not exist yet is a run that has not started, which is a
    // wait rather than an error — the file appears when the redirect opens.
    read: () => {
      try {
        return readFileSync(path, "utf8");
      } catch {
        return "";
      }
    },
    now: () => Date.now(),
    sleep: (ms) => new Promise((res) => setTimeout(res, ms)),
    sentinel,
    timeoutMs,
  });
  const secs = (r.waitedMs / 1000).toFixed(0);
  if (r.timedOut) {
    console.error(`waitfor: TIMED OUT after ${secs}s — ${path} never matched /${sentinel}/`);
    console.error("The run is not finished. Nothing may be reported about it.");
    process.exit(2);
  }
  console.log(`waitfor: ${path} matched after ${secs}s — ${r.line ?? ""}`);
  process.exit(r.code ?? 0);
}
