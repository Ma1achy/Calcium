// C01 tier 5 — e2e. A real pseudo-terminal, a real process, a reduced final
// state compared against a control run of `true`.
//
// This is the tier that proves the component: every other test asserts what
// C01 emitted, and this one asserts what the terminal was left in.
import { beforeAll, describe, expect, it } from "vitest";
import {
  control,
  interactivePty,
  quitVi,
  runInPty,
  termiosFlags,
  trackDecset,
  trackWrap,
  type PtyRun,
} from "../support/pty.js";

const FIXTURE = "node test/support/fixture.mjs";

let baseline: PtyRun;

beforeAll(async () => {
  baseline = await control();
}, 30_000);

/** The whole comparison, in one place, so every path asserts the same thing. */
function expectCleanTerminal(run: PtyRun): void {
  expect(run.decset, "DECSET modes").toEqual(baseline.decset);
  expect(termiosFlags(run.termios), "termios").toEqual(termiosFlags(baseline.termios));
}

describe("C01 e2e — the terminal is given back", () => {
  it(
    "T5.1 (C1): every exit path C01 owns leaves the terminal as `true` left it",
    async () => {
      // The other two paths — /exit and Ctrl-D confirm — are C22 and C16
      // driving this same release(), and B01 B1.6 owns them. Two tests
      // claiming the same coverage is how one stops being maintained.
      for (const path of ["release", "sigterm", "throw"]) {
        const run = await runInPty(`${FIXTURE} ${path}`);

        // The program did take the terminal — otherwise this passes vacuously
        // by never having anything to give back.
        expect(trackDecset(run.bytes.split("FRAME-CONTENT")[0] ?? ""), path).toMatchObject({
          altScreen: true,
          cursorVisible: false,
        });

        expectCleanTerminal(run);
      }
    },
    60_000,
  );

  it(
    "T5.2: the frame leaves no trace on the primary screen",
    async () => {
      const run = await runInPty(`${FIXTURE} release`);

      // Everything painted went to the alternate screen, which was left. What
      // the primary screen keeps is the scrollback, and the frame is not in it.
      const primary = run.bytes.split("\x1b[?1049h")[0] ?? "";
      expect(primary).not.toContain("FRAME-CONTENT");
      expect(run.decset.altScreen).toBe(false);
    },
    30_000,
  );

  it(
    "T5.3: a thrown exception leaves its stack readable on the primary screen",
    async () => {
      const run = await runInPty(`${FIXTURE} throw`);

      // Release precedes printing (I4), so the stack lands after 1049l — in the
      // real scrollback rather than on a screen about to be discarded.
      const afterRelease = run.bytes.split("\x1b[?1049l").pop() ?? "";
      expect(afterRelease).toContain("DELIBERATE-CRASH");
      expectCleanTerminal(run);
    },
    30_000,
  );

  it(
    "T5.4: SIGTSTP releases the terminal fully and removes its own handler",
    async () => {
      const run = await runInPty(`${FIXTURE} tstp`);

      // Took it, gave it back — asserted on the ordered transitions rather than
      // a reduced state at an arbitrary point.
      const transitions = [...run.bytes.matchAll(/\x1b\[\?1049([hl])/g)].map((m) => m[1]);
      expect(transitions).toEqual(["h", "l"]);

      // Only its own handler, so the re-raise reaches the default disposition.
      // Disposing the rest would take SIGCONT with it, and the process would
      // resume with the terminal unrestored and nothing left to restore it.
      expect(run.bytes).toContain("TSTP-HANDLERS=0");
      expectCleanTerminal(run);

      // **The SIGCONT half is not testable in this harness**, and the reason is
      // not a shortcut. A PTY-spawned non-interactive shell leaves the process
      // group orphaned, and POSIX discards a stop signal sent to an orphaned
      // process group — verified against `sh -c`, `sh -c "set -m; …"` and
      // `bash -mc`, all of which continue rather than stop. Re-acquisition and
      // handler reinstatement are covered at tier 3 by T3.13, where the signal
      // is delivered directly to the handler.
    },
    30_000,
  );

  it(
    "T5.7: fifty mount/unmount cycles leave the PTY clean and leak no handler",
    async () => {
      const run = await runInPty(`${FIXTURE} cycles`);

      expect(run.bytes).toContain("cycle-49");
      expect(run.bytes).toContain("SIGINT-LISTENERS=0");
      expectCleanTerminal(run);
    },
    60_000,
  );

  it(
    "T5.8 (I12's boundary, §5): a frame composed at 100 and written at 80 wraps, and the wrap is a row nobody counted",
    async () => {
      // **This test asserts the hazard rather than the absence of it**, and that is
      // deliberate. C01 I12 gives a coherent `{columns, rows}` snapshot per
      // `SIGWINCH`; nothing gives one per *frame*. `writer` is a `Proxy` over the
      // real stdout whose `get` forwards to the target, so `columns` is a read the
      // consumer performs at whatever moment it performs it — and C01 exposes no
      // initial size at all, so `writer.columns` is the only route to a width there
      // is. A frame therefore *can* be composed against two widths.
      //
      // What that costs is not a wrong frame. It is a wrap, and a wrap inside the
      // alternate screen scrolls content the application has no record of and cannot
      // correct. So the assertion is on terminal state — folded from the byte stream,
      // because a PTY is a kernel device with no emulator to interrogate (see the
      // harness header) — and it is compared against a control run at a stable width.
      //
      // Forced with a handshake rather than raced: the fixture reads the width, says
      // what it read, and writes only after `GO`. A race that reproduces sometimes is
      // a test that fails sometimes for a reason nobody trusts.
      //
      // **It will fail when the gap closes, and that is the notification.** Whoever
      // adds a per-frame snapshot and an initial-size accessor (M-T6) makes the two
      // reported widths equal, and this test is where they find out that the
      // behaviour it documents is no longer the behaviour.
      const pty = interactivePty(`${FIXTURE} width-hazard`, { cols: 100, rows: 24 });
      const composed = await pty.waitFor(/COMPOSED_AT (\d+)/, 20_000);

      pty.resize(80, 24);
      // A real pause, deliberately: what is being sequenced is the kernel delivering
      // `SIGWINCH` to another process, and there is nothing to inject.
      await new Promise<void>((resolve) => void setTimeout(resolve, 200));
      pty.type("GO\n");

      const wrote = await pty.waitFor(/WROTE (\d+) (\d+)/, 20_000);
      await pty.done();

      // 1. The mechanism: one frame's lifetime, two widths, and no resize event
      //    consumed in between. The handle is live.
      expect(composed[1], "composed against the width in effect at the start").toBe("100");
      expect(wrote[2], "and the same handle reported a different width at write time").toBe("80");

      // 2. The consequence, on terminal state rather than on the string.
      const hazard = trackWrap(pty.output, 80);
      expect(hazard.widest, "a 100-cell row went into an 80-column terminal").toBe(100);
      expect(hazard.wrapped, "which the terminal wrapped").toBe(true);

      // 3. And the control, through the same tracker, so an unmodelled cursor move
      //    is a constant on both sides rather than a difference.
      const control = interactivePty(`${FIXTURE} width-hazard`, { cols: 80, rows: 24 });
      await control.waitFor(/COMPOSED_AT (\d+)/, 20_000);
      control.type("GO\n");
      await control.waitFor(/WROTE/, 20_000);
      await control.done();

      const clean = trackWrap(control.output, 80);
      expect(clean.wrapped, "the control run does not wrap").toBe(false);
      expect(hazard.rows, "the wrap costs a row nobody counted").toBeGreaterThan(clean.rows);
    },
    60_000,
  );

  it(
    "T5.5: launching vi through pass-through, quitting it, and exiting leaves the terminal clean",
    async () => {
      // Two nested alternate-screen users: C01's own, and vi's inside the
      // suspend. Deferred since C01 and writable now that `handoff` exists.
      //
      // `interactivePty` rather than `runInPty`, because vi has to be *quit* —
      // and the assertion is still made from outside, by folding the captured
      // byte stream. The fixture composes the sequence, so what this shows is
      // that the pieces work when composed; that an application composes them is
      // C22's, and this file should not be read as covering it.
      const pty = interactivePty(`${FIXTURE} process-handoff`);

      try {
        await pty.waitFor(/\[\?1049h/, 20_000);
        await quitVi(pty);
        await pty.waitFor(/HANDOFF/, 20_000);
        expect(await pty.done()).toBe(0);
      } finally {
        pty.kill();
      }

      // Folded over everything that reached the terminal, vi's own sequences
      // included: the alternate screen is off and the cursor is visible. A
      // `suspend` that did not release, or a `resume` that did not restore,
      // leaves one of those set — and a terminal a user has to `reset`.
      const final = trackDecset(pty.output);
      expect(final.altScreen).toBe(false);
      expect(final.cursorVisible).toBe(true);
    },
    60_000,
  );
  it(
    "T5.6 (C22 I36, C22 I37): piping the shell to `cat` emits no escape sequence at all",
    async () => {
      // **The gate from outside**, and the only tier where stdout is genuinely
      // not a terminal: every other harness here hands the session a PTY, which
      // is what `isTTY` is true of. The pipe is the subject.
      //
      // `sh -c '… | cat'` inside the PTY: the session's stdout is the pipe, and
      // `cat`'s is the PTY, so whatever the session writes still reaches the
      // capture — which is what makes an assertion about *absence* meaningful
      // rather than an assertion that the plumbing swallowed it.
      const piped = await runInPty(`${FIXTURE} session | cat`);

      // **The subject before the claim.** A session that failed to start writes
      // nothing, and "no escape sequence" is satisfied by no output at all —
      // the inert-subject class, and the exact shape this row would take if the
      // gate were replaced by an early `process.exit()`.
      expect(piped.bytes.length, "the gate printed something").toBeGreaterThan(0);
      expect(piped.bytes, "and it is usage, not a frame").toContain("not a TTY");

      // Folded over every byte, which is stronger than a diff: it survives a
      // harmless reordering and still fails on a mode left set.
      expect(trackDecset(piped.bytes)).toEqual({
        altScreen: false,
        cursorVisible: true,
        bracketedPaste: false,
        mouse1002: false,
        mouse1006: false,
        scrollRegion: false,
      });
      // eslint-disable-next-line no-control-regex
      expect(piped.bytes, "not one escape").not.toMatch(/\u001b/);

      // **The control, and without it this row passes against a shell that
      // failed to start.** The same fixture with the PTY as its stdout *does*
      // acquire the alternate screen, so the absence above is the gate's doing
      // and not the harness's. `interactivePty`, because a session with a
      // terminal does not exit — which is itself the difference being asserted.
      const direct = interactivePty(`${FIXTURE} session`);
      try {
        await direct.waitFor(/❯/, 20_000);
        expect(direct.output, "a TTY run does emit them").toContain("\u001b[?1049h");
      } finally {
        direct.kill();
      }
    },
    60_000,
  );
});

describe("C22 §4 gate 4 — a terminal too small (C22 I8, I9, C01 I12b, F67)", () => {
  /**
   * **A tier-5 row because both halves failed only outside a unit test**, and
   * that is the whole reason F67 existed for as long as it did.
   *
   * The unit rows hand `drawFallback` their own spy sink, so a fallback written
   * into C01's `debug` sink renders perfectly to them. And a fake lifecycle
   * delivers a resize the real one dropped. Each component was correct on its
   * own side of the seam and the pair did nothing at all: **0 bytes on stdout
   * and stderr, the process alive, for ever.**
   *
   * The width axis is swept by the golden frames at 60/80/120/160 columns. The
   * height axis has no equivalent sweep, which is F67's own closing sentence and
   * the reason it took someone wanting a smaller picture to find it.
   */
  for (const [cols, rows] of [
    [100, 12],
    [100, 15],
    [30, 16],
  ] as const) {
    it(
      `T4.21 (C22 I9): ${String(cols)}x${String(rows)} draws the fallback rather than nothing`,
      async () => {
        const pty = interactivePty(`${FIXTURE} session`, { cols, rows });
        try {
          await pty.waitFor(/Terminal too small/, 15_000);
          // The size it has and the size it needs, both — a message naming
          // neither leaves the reader to guess which axis is short, and `30x16`
          // is short on the axis the golden frames sweep.
          expect(pty.output).toContain(`${String(cols)}x${String(rows)}`);
          expect(pty.output).toContain("Needs 60x16");
          // And nothing was acquired: there is no alternate screen to draw into,
          // which is why this goes to the primary one.
          expect(pty.output, "nothing acquired").not.toContain("\u001b[?1049h");
        } finally {
          pty.kill();
        }
      },
      30_000,
    );
  }

  it(
    "T4.21b (C22 I8, C01 I12b): it opens when the terminal grows",
    async () => {
      // **The half a fake cannot fail.** C01 dropped every `SIGWINCH` outside
      // `acquired`, and gate 4 deliberately does not acquire — so the deferral
      // deferred for ever, and any harness with a fake lifecycle delivered the
      // resize anyway. Measured before the fix: 44 bytes, then zero more.
      const pty = interactivePty(`${FIXTURE} session`, { cols: 100, rows: 12 });
      try {
        await pty.waitFor(/Terminal too small/, 15_000);
        const atFallback = pty.output.length;

        pty.resize(100, 30);

        // **Waited on the alternate screen, not on the prompt glyph.** `❯` is
        // capability-dependent — this PTY carries no `LANG`, so C02 resolves the
        // ASCII pair and the prompt is `>`. A row waiting on the fancy one can
        // never match here, which is also why the pre-existing C22 T5.6 failure
        // in this file reads as *never saw /❯/*: its control has the same
        // dependency. Acquiring the alternate screen is the claim anyway.
        await pty.waitFor(/\u001b\[\?1049h/, 20_000);
        expect(
          pty.output.length,
          "the resize produced output at all",
        ).toBeGreaterThan(atFallback);
      } finally {
        pty.kill();
      }
    },
    45_000,
  );
});
