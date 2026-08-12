// The waiter, verified — group 9, and the instrument that had no file.
//
// **The fabrication is today's log, byte for byte.** A `make all` was started in
// the background with its load average echoed first and `EXIT=$?` echoed last;
// the waiter was armed on the file being non-empty, so it fired on the load line
// about a second in and the run was reported complete before it had started.
import { describe, expect, it } from "vitest";

import { DEFAULT_SENTINEL, reading, waitFor } from "../../tools/waitfor.mjs";

/** The log as it actually looked at the moment the old waiter fired. */
const STARTED = "load: 23.45 26.25 22.06\n";
/** And as it looked when the run really finished. */
const FINISHED = `${STARTED}EXIT=1\n⎯⎯⎯ Failed Tests 82 ⎯⎯⎯\nload: 32.57 33.22 28.58\n`;

describe("waitfor", () => {
  it("W1: a growing log is not a finished one — the defect, restored", () => {
    // Non-emptiness cannot express completion. It returns a plausible value
    // rather than an error, which is why nothing about the report looked wrong.
    expect(STARTED.length, "the old test: is the file non-empty").toBeGreaterThan(0);
    expect(reading(STARTED).done, "the question that should have been asked").toBe(false);
  });

  it("W2: the sentinel finishes it, and hands back the run's own status", () => {
    const r = reading(FINISHED);

    expect(r.done).toBe(true);
    expect(r.line).toBe("EXIT=1");
    expect(r.code, "the run's exit code, not the waiter's").toBe(1);
  });

  it("W3: anchored — a word the run prints is not the sentinel", () => {
    // The subtler version of W1's mistake, and it lands the same way. This
    // repository's own Makefile carries `E2E_WITH_LOAD_EXIT=0` in a comment, and
    // an unanchored `EXIT=` matches it: the wait would end on a line the run
    // echoed about itself, at whatever moment it happened to be echoed.
    const noise = "make: echoing E2E_WITH_LOAD_EXIT=0 for the record\n";

    expect(reading(noise).done, "not at a line start").toBe(false);
    expect(new RegExp("EXIT=").test(noise), "the unanchored form would have").toBe(true);
    expect(DEFAULT_SENTINEL.startsWith("^"), "which is why the default is anchored").toBe(true);
  });

  it("W4: a timeout is a timeout — never a completion", async () => {
    // The direction that matters. Every other error here ends a wait early; this
    // one is the wait ending with nothing observed, and reporting *done* would be
    // the failure the file exists to prevent, one level up.
    let clock = 0;
    const r = await waitFor({
      read: () => STARTED,
      now: () => clock,
      sleep: (ms) => {
        clock += ms;
        return Promise.resolve();
      },
      timeoutMs: 30_000,
      everyMs: 5_000,
    });

    expect(r.timedOut).toBe(true);
    expect(r.done, "and it does not claim the run finished").toBe(false);
    expect(r.code, "so no status can be read off it").toBeNull();
    expect(r.waitedMs).toBe(30_000);
  });

  it("W4b: the deadline is the deadline — the last sleep is clipped to it", async () => {
    // **Found by running the CLI, not by reading it.** A six-second timeout
    // reported `TIMED OUT after 10s`: the poll slept its whole five-second
    // interval twice and then noticed. The figure was honest, which is what made
    // it worth removing — a caller that sets a deadline is about to do something
    // at it. With `everyMs` above `timeoutMs` the overshoot is unbounded.
    let clock = 0;
    const r = await waitFor({
      read: () => STARTED,
      now: () => clock,
      sleep: (ms) => {
        clock += ms;
        return Promise.resolve();
      },
      timeoutMs: 6_000,
      everyMs: 5_000,
    });

    expect(r.timedOut).toBe(true);
    expect(r.waitedMs, "6000, not 10000").toBe(6_000);
  });

  it("W5: it waits across writes and returns on the one that lands", async () => {
    // The row W1 and W4 leave open between them: a log that grows twice before
    // the sentinel arrives. A waiter that read once, or that gave up on the first
    // unmatched read, passes both of those and fails here.
    let clock = 0;
    const writes = ["", STARTED, `${STARTED}Tests 3026 passed\n`, FINISHED];
    let n = 0;
    const r = await waitFor({
      read: () => writes[Math.min(n, writes.length - 1)] as string,
      now: () => clock,
      sleep: (ms) => {
        clock += ms;
        n += 1;
        return Promise.resolve();
      },
      timeoutMs: 600_000,
      everyMs: 5_000,
    });

    expect(r.done).toBe(true);
    expect(r.code).toBe(1);
    expect(r.waitedMs, "three sleeps, not one and not the timeout").toBe(15_000);
  });

  it("W6: a log that does not exist yet is a wait, and a clean run is 0", () => {
    expect(reading("").done, "the redirect has not opened").toBe(false);
    expect(reading("EXIT=0\n").code).toBe(0);
    // A sentinel with no trailing number reports done and no code, so the caller
    // exits 0 rather than inventing one.
    expect(reading("DONE\n", "^DONE")).toEqual({ done: true, line: "DONE", code: null });
  });
});
