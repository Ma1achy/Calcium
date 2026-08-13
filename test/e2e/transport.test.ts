// C06 tier 5 — e2e. Real subprocesses, which means C21, which is built now.
//
// Nothing here is written against a fake: the value of this tier is entirely in
// the interaction with the OS, and a tier-5 test that mocks the process has
// moved to tier 3 without saying so.
//
// **The far side is `test/support/farside.mjs`**, a real executable answering
// the manifest the rest of the suite uses. The session arms that reach it —
// `subprocess`, `mixed`, `no-farside` — are asserted to take effect in
// `harness.test.ts` before anything here rests on them, because a variant that
// quietly fell back to the fixture corpus would make every row below pass while
// asserting nothing about a transport.
import { describe, expect, it } from "vitest";
import { DOCUMENT_BUDGET_MS } from "../support/budget.js";
import { interactivePty, PROMPT, type InteractivePty, runInPty } from "../support/pty.js";

const FIXTURE = "node test/support/fixture.mjs";

const session = (variant: string): InteractivePty =>
  interactivePty(`${FIXTURE} session ${variant}`, { cols: 100, rows: 24 });

describe("C06 e2e — I15, through a real session", () => {
  // **The substitutability claim, checked against three real transports for the
  // first time.** I15 says all three satisfy the same interface and are
  // substitutable in every test that does not concern spawning, and until now
  // that had only been asserted at tier 1 against fakes. This is one session
  // body run three ways: the same keystrokes, and the same line on the screen.
  //
  // **The emulated arm is not a D43 violation, and it looks like one.** D43
  // forbids tests *agreeing with an animated world* — asserting on values an
  // emulator invents, so drift in the world silently becomes the expected
  // result. This arm is a **fixed** handler returning a constant envelope, which
  // is what I17 permits and what C06's own T2.1 does at tier 1. Said here
  // because the alternative reading — see `emulated`, remember D43, narrow the
  // suite back to two — is the same silent narrowing that already happened once
  // to that suite, and T6.15 exists because of it.
  const rendered: Record<string, string> = {};

  it.each(["fixture", "subprocess", "emulated"])(
    "T5.1b (I15): %s answers the same verb with the same line",
    async (arm) => {
      const pty = session(arm);
      try {
        await pty.waitFor(PROMPT, 15_000);
        pty.type("/promote app.web:main\r");
        await pty.waitForFrame((f) => f.join("").includes("promoted app.web:main"), 20_000);

        const line = pty.frame.map((l) => l.trimEnd()).find((l) => l.includes("promoted"));
        expect(line, "the verb rendered").toBeDefined();
        rendered[arm] = line ?? "";

        // **And the session is still usable**, which is the half that separates
        // substitutability from "it did not crash". A transport that answered
        // and then wedged the guard satisfies the first clause exactly.
        pty.type("/guide\r");
        await pty.waitForFrame((f) => f.join("").includes("own local verb"), 15_000);
      } finally {
        pty.kill();
      }
    },
    45_000,
  );

  it("T5.1c (I15): and the three lines are identical, not merely all present", () => {
    // Ordered after the three above, and it is the assertion that makes them a
    // parity suite rather than three independent smoke tests. Three arms each
    // rendering *something* is what a per-arm assertion can show; that they
    // rendered the *same* thing is the claim I15 actually makes.
    expect(Object.keys(rendered).sort()).toEqual(["emulated", "fixture", "subprocess"]);
    const [first, ...rest] = Object.values(rendered);
    expect(first, "and it is not the empty string agreeing with itself").toContain("promoted");
    for (const other of rest) expect(other).toBe(first);
  });
});

describe("C06 e2e", () => {
  it(
    "T5.1: a real binary emitting a large document → parsed and rendered within budget",
    async () => {
      // Two thousand table rows from a spawned process: `withJson` appends the
      // flag, the far side answers one document, C07 takes the identity route,
      // C04 validates it, C14 measures it and the frame draws a window onto it.
      //
      // **The budget is asserted, not merely configured** — it is the "within
      // budget" of the row's own sentence. `DOCUMENT_BUDGET_MS` carries the
      // measurements it was derived from.
      const pty = session("subprocess");
      try {
        await pty.waitFor(PROMPT, 15_000);

        const started = Date.now();
        pty.type("/ps --limit 2000\r");
        // **Near the tail, but not at it, and both halves are deliberate.**
        // A settled entry bottom-anchors, so the visible window is the document's
        // *end* — a row from the middle is above the fold and never appears,
        // which is how the first draft of this row timed out. And the last three
        // rows cannot be reached at all: `construct.ts` resizes the viewport to
        // the *terminal* height where `#maxTop()` wants the transcript region's,
        // so the bound is short by exactly the chrome. Asserting on row 1,999
        // would fail on that and read as a transport defect. Recorded with
        // view-model T5.1, the drift row it belongs to.
        await pty.waitForFrame((f) => f.join("").includes("0001990"), 30_000);
        const elapsed = Date.now() - started;

        expect(elapsed, `spawn → parse → render of 2,000 rows`).toBeLessThan(DOCUMENT_BUDGET_MS);

        // **The far side really produced it**, rather than the fallback adapter
        // rendering a parse failure that happens to contain digits.
        expect(pty.frame.join("\n")).toContain("0001990");
      } finally {
        pty.kill();
      }
    },
    60_000,
  );

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

  it.todo(
    "T5.3: Ctrl-C during a real long-running verb → the child dies within the ladder's bounds and partial output survives — awaiting a ruling and therefore **not deferred on a component**; both components are built and both are correct. **the ladder cannot reach a subscription, and the two rules that make it so are both correct**: C23 I6 releases the guard for a `streams: true` verb so the prompt stays usable during a `--watch`, and C16 §5's rungs 1 and 2 discriminate on `C23.inFlight`, which *is* that guard. So `inFlight()` is null throughout a live stream, no rung fires, and Ctrl-C clears the prompt while the child runs on — measured: `/tail` reached line 171 after the interrupt. Neither spec says what Ctrl-C should mean here, and rung 1's *takes precedence over everything* cannot simply be widened to cover subscriptions, since one `--watch` would then swallow the key for the rest of the session. Awaiting a ruling on where a subscription sits in the ladder",
  );

  it(
    "T5.4: killing the far side externally mid-invocation → the guard is released and the session survives",
    async () => {
      // **The pid comes from the far side's own output**, and that is not a
      // convenience. The first version used `pkill -f "farside.mjs tail"`, whose
      // pattern appears in the argv of the shell running the test — so it killed
      // its own harness. A pid the child reported is evidence nothing else could
      // have produced, which is this tier's rule about observation helpers.
      const pty = session("subprocess");
      try {
        await pty.waitFor(PROMPT, 15_000);
        pty.type("/tail\r");
        await pty.waitForFrame((f) => /pid\s+\d+/.test(f.join("\n")), 25_000);

        const pid = Number(/pid\s+(\d+)/.exec(pty.frame.join("\n"))?.[1]);
        expect(pid, "the far side reported its own pid").toBeGreaterThan(0);

        // A control: the process exists before it is killed, so a row that
        // killed nothing cannot pass by asserting on a session that was never
        // disturbed.
        expect(() => process.kill(pid, 0), "alive before the kill").not.toThrow();
        process.kill(pid, "SIGKILL");

        // **Output produced before death is retained** (C06 I7) — a cancelled or
        // killed tail keeps the lines it already showed.
        await pty.waitForFrame((f) => f.join("").includes("tail 1"), 15_000);

        // **The guard was released**, which is the half that makes this more
        // than "it did not crash": a session that survived the kill and then
        // refused every later submission looks identical on the frame.
        pty.type("/guide\r");
        await pty.waitForFrame((f) => f.join("").includes("own local verb"), 15_000);
      } finally {
        pty.kill();
      }
    },
    60_000,
  );

  it(
    "T5.5: one session running one verb on fixtures and another on a real binary, interleaved",
    async () => {
      // **The router doing the job it exists for** (C06 §6). The `mixed` arm
      // overrides `ps` to the subprocess transport and leaves everything else on
      // the corpus, so this is the only configuration where two transports are
      // live at once — which makes it the only one that can show the *routing*
      // rather than the transports.
      const pty = session("mixed");
      try {
        await pty.waitFor(PROMPT, 15_000);

        // Interleaved, and alternating rather than grouped: a router that
        // latched onto the first transport it resolved would pass a grouped
        // sequence.
        for (let round = 0; round < 2; round += 1) {
          pty.type("/ps\r");
          await pty.waitForFrame((f) => f.join("").includes("far side pid="), 20_000);

          pty.type("/promote app.web:main\r");
          await pty.waitForFrame((f) => f.join("").includes("promoted app.web:main"), 20_000);
        }

        // Both are in the transcript, from one session, having taken different
        // routes out of it.
        const all = pty.output;
        expect(all, "the spawned one").toMatch(/far side pid=\d+/);
        expect(all, "and the corpus one").toContain("promoted app.web:main");
      } finally {
        pty.kill();
      }
    },
    75_000,
  );

  it(
    "T5.6: a session with the fixture transport and no far side installed — the standalone-build guarantee",
    async () => {
      // **R01 R4.4's claim, from the shell's side**: a clean clone plus
      // `npm install` gives a working shell with no container and no far side.
      // The verbs that answer from fixtures answer; the ones that would spawn
      // report a spawn failure and the session continues.
      //
      // **Its control is in `harness.test.ts`** — the same keystrokes against
      // the `subprocess` arm produce the table. Without that pair this row is
      // satisfied perfectly by a session that does nothing at all, which is the
      // inert class in its most consequential form: a whole transport arm
      // agreeing with emptiness.
      //
      // --- WHY THIS ROW CARRIES A DIAGNOSTIC NOTE, 2026-08-13 ----------------
      //
      // **It failed three of four full tier-5 runs at exactly 75 s**, passing
      // in ~1.2 s alone and 9/9 with its own file. 75 s is this row's *outer*
      // budget and its inner waits are 15/20/15/15, so the failure was a bare
      // vitest timeout with **no inner rejection at all** — which locates it:
      // the hang is at the one await with no budget, `pty.done()`.
      //
      // Two real weaknesses came out of looking, and both are fixed:
      //
      //   - `done()` was unbounded and never rejected, so a session that did
      //     not exit produced no evidence — the error pointed at the `it`. It
      //     now takes a budget and its rejection carries the last frame.
      //   - the `/help` step waited on `f.join("").length > 0`, which almost
      //     any frame satisfies, including the one already on screen. It
      //     resolved immediately, so `/exit` was typed into a session that had
      //     not finished. It now waits for a verb only `/help` puts on screen.
      //
      // **Neither is credited with the fix, and that is the point of the
      // note.** Three full runs have been green since — but the first of those
      // three was green *before* either change landed, so the sample cannot
      // distinguish the fix from the failure not recurring. Recorded with both
      // figures rather than closed: a justification the next person checks and
      // cannot reproduce is one they delete. If it returns, the rejection now
      // says what the session was doing instead of exiting.
      const pty = session("no-farside");
      try {
        await pty.waitFor(PROMPT, 15_000);

        // A verb needing the far side: reported, not fatal (C06 T3.17).
        pty.type("/ps\r");
        await pty.waitForFrame((f) => f.join("").includes("ENOENT"), 20_000);
        expect(pty.frame.join("\n"), "and it names what was missing").toContain(
          "calcium-no-such-far-side",
        );

        // Everything that does not need one still works: a local verb, the
        // prompt, and the framework's own help.
        pty.type("/guide\r");
        await pty.waitForFrame((f) => f.join("").includes("own local verb"), 15_000);

        pty.type("/help\r");
        // **`length > 0` was the predicate here, and it waited for nothing.**
        // Almost any frame satisfies it — including the one already on screen
        // from `/guide` — so it resolved before `/help` had been processed and
        // `/exit` was typed into a session still working. The wait has to name
        // something only this step produces, which is a verb the help lists.
        await pty.waitForFrame((f) => f.join("").includes("/guide"), 15_000);

        // And the shell shuts down cleanly rather than being killed, which is
        // the last thing a standalone build has to do.
        pty.type("/exit\r");
        expect(await pty.done()).toBe(0);
      } finally {
        pty.kill();
      }
    },
    75_000,
  );
});
