// C06 tier 5 — e2e. Real subprocesses, which means C21, which is built now.
//
// Nothing here is written against a fake: the value of this tier is entirely in
// the interaction with the OS, and a tier-5 test that mocks the process has
// moved to tier 3 without saying so.
import { describe, expect, it } from "vitest";
import { runInPty } from "../support/pty.js";

const FIXTURE = "node test/support/fixture.mjs";

describe("C06 e2e", () => {
  it.todo("T5.1: a real binary emitting a large document → parsed and rendered within budget — waits on C22");
  it(
    "T5.2 (C21 T5.4): a real streaming far side at 1,000 lines/s for sixty seconds drops nothing and grows nothing",
    async () => {
      // Deferred since C06 was written, and it named C21 alone. It is C21's T5.4
      // as well — one sixty-second test rather than two, here because the claim
      // runs through the transport and this is where the deferral was.
      //
      // Counted rather than sampled: "no dropped output" is a claim about every
      // line, and 59,999 of 60,000 is the failure this looks for.
      const run = await runInPty(`${FIXTURE} process-stream 60`, { timeoutMs: 110_000 });
      const reported = /SCHEDULER_RESULT (\{.*\})/.exec(run.bytes);

      expect(reported, run.bytes).not.toBeNull();
      const result = JSON.parse(reported![1]!) as {
        data: number;
        expected: number;
        ended: boolean;
        exitCode: number | null;
        overflowed: boolean | null;
        rssGrowthMb: number;
      };

      expect(result.data).toBe(result.expected);
      expect(result.ended).toBe(true);
      expect(result.exitCode).toBe(0);
      // Nothing was dropped, so nothing overflowed: sixty thousand short lines
      // is well inside the 8 MiB bound, and an `overflowed` here would mean the
      // reader fell behind rather than that the far side was loud.
      expect(result.overflowed).toBe(false);
      expect(result.rssGrowthMb).toBeLessThan(64);
    },
    150_000,
  );

  it.todo("T5.3: Ctrl-C during a real long-running verb → the child dies within the ladder's bounds and partial output survives — waits on L4");
  it.todo("T5.4: killing the far side externally mid-invocation → end with signal, guard released, session survives — waits on C22");
  it.todo("T5.5: one session running one verb on fixtures and another on a real binary, interleaved — waits on C22");
  it.todo("T5.6: the whole suite with the fixture transport and no far side installed — the standalone-build guarantee — waits on C22");
});
