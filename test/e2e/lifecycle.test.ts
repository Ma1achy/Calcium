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
  it.todo(
    "T5.6: piping the shell to `cat` emits no escape sequence at all — waits on the L4 shell's TTY gate",
  );
});
