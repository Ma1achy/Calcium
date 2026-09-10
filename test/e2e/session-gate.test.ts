// C22 tier 5 — gate 3b's refusal, from the side no double can reach.
//
// **The property is *the process ends*, and that is why this is tier 5.** Every
// other row about gate 3b asserts what it threw; this one asserts what it left
// behind, and nothing in tiers 1–4 can see that. A fake transport closes when
// the test file ends, a fake clock arms nothing, and vitest's worker outlives
// every session in it — so a leaked history handle, a live store and an armed
// timer are all invisible to a suite that is itself the thing keeping the
// process alive.
//
// Measured before the fix at **6 s and counting** with the rejection caught and
// the next line already printed, and at **744 ms** after it (F140).
import { describe, expect, it } from "vitest";

import { runInPty } from "../support/pty.js";

const FIXTURE = "node test/support/fixture.mjs caught-refusal";

/** The run, and how long the whole thing took from spawn to exit. */
async function timed(env: Record<string, string>): Promise<{ bytes: string; exitCode: number; ms: number }> {
  const started = Date.now();
  const run = await runInPty(FIXTURE, { env, timeoutMs: 15_000 });
  return { bytes: run.bytes, exitCode: run.exitCode, ms: Date.now() - started };
}

describe("C22 §4 gate 3b — a caught refusal leaves nothing running", () => {
  it(
    "T5.8 (C22 I61, C22 I4; F140): a process that catches the rejection and carries on exits",
    async () => {
      // **`TERM=dumb` on the device, not in the config.** `runInPty` puts
      // `opts.env.TERM` on the pty itself, which is the only place C02 reads it
      // from — an `env` record handed to the child is silently inert there, and
      // a row that set it that way would be testing `xterm-256color` while
      // claiming to test a dumb terminal.
      const run = await timed({ TERM: "dumb" });

      // **The fixture got as far as the catch**, which is what separates this
      // row from one that passes because the program crashed on line one. Both
      // lines, because *caught* without *fell through* is a process that threw
      // inside the handler.
      expect(run.bytes, "gate 3b refused and the fixture caught it").toContain(
        "CAUGHT UnusableTerminalError",
      );
      expect(run.bytes, "and carried on past it").toContain("FELL-THROUGH");
      expect(run.bytes, "the session was never opened").not.toContain("OPENED");

      // **The assertion is the exit itself**, and `runInPty` rejects rather than
      // resolving when the program does not end — so reaching this line is
      // already most of the row. The bound is here to say that it ended *because
      // nothing was left running* rather than because something else eventually
      // gave up: three seconds is four times the measured 744 ms and a fifth of
      // the timeout the defect ran into.
      expect(run.ms, `exited in ${String(run.ms)} ms`).toBeLessThan(3_000);
      expect(run.exitCode, "and cleanly, because the rejection was handled").toBe(0);
    },
    30_000,
  );

  it(
    "T5.8b (C22 I61; F140): the control — a usable terminal reaches a session rather than the refusal",
    async () => {
      // **Without this the row above is satisfied by a gate that refuses
      // everything**, which would exit fast and print `CAUGHT` for every
      // terminal there is. The same script, the same catch, one variable
      // changed.
      const run = await timed({ TERM: "xterm-256color" });

      expect(run.bytes, "it opened a session").toContain("OPENED");
      expect(run.bytes, "nothing was refused").not.toContain("CAUGHT");
      expect(run.bytes, "and it still ended").toContain("FELL-THROUGH");
      expect(run.exitCode, "cleanly").toBe(0);
    },
    30_000,
  );
});
