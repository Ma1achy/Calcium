// C02 tier 5 — e2e, PTY harness with a controlled environment.
//
// The environment is the input. Each test sets `TERM`, `LANG` or `TMUX`, runs
// the fixture inside a real pseudo-terminal, and asserts on the bytes that
// actually reached it. Nothing here inspects the capability record directly:
// that is tier 1's job, and a tier-5 test that read the record would prove the
// record correct while proving nothing about whether anyone obeyed it.
//
// **What these tests do not prove, and it is a real bound.** C22 does not exist,
// so the fixture composes the frame itself rather than the shell composing it.
// They assert that a detected record reaches the renderer and changes what it
// emits — not that the application wires detection to rendering. That wiring is
// C22's own, and this file should not be read as covering it.
import { describe, expect, it } from "vitest";
import { interactivePty, runInPty, type PtyRun } from "../support/pty.js";

const FIXTURE = "node test/support/fixture.mjs caps";

/** Everything between the markers — the frame, and not the acquisition bytes. */
function frame(run: PtyRun): string {
  const start = run.bytes.indexOf("FRAME-START");
  const end = run.bytes.indexOf("FRAME-END");
  if (start === -1 || end === -1) {
    throw new Error(`no frame in output: ${JSON.stringify(run.bytes.slice(0, 400))}`);
  }
  return run.bytes.slice(start + "FRAME-START".length, end);
}

/** `38;2;r;g;b` — the only form a 24-bit foreground takes. */
const TRUECOLOUR = /\x1b\[[34]8;2;/;
/** `38;5;n` — 8-bit indexed. */
const INDEXED_256 = /\x1b\[[34]8;5;/;
/** `\x1b[31m`…`\x1b[97m` — the 16-colour form, which is what 4-bit emits. */
const FOUR_BIT = /\x1b\[(?:3[0-7]|9[0-7]|4[0-7]|10[0-7])m/;

describe("C02 e2e — the environment decides, and the terminal shows it", () => {
  it(
    "T5.1: under TERM=dumb no escape sequence reaches the PTY, help lands on the primary screen, exit 0",
    async () => {
      // `TERM=dumb` gives `altScreen: false`, and C02 I7 makes that the single
      // gate on whether a shell can open. The refusal has to happen *before*
      // C01 is constructed, because C01 I14 turns a record without the
      // alternate screen into a fatal error — so a caller reading `isUsable` is
      // the whole mechanism, and this is what it looks like from outside.
      const run = await runInPty(`${FIXTURE}; echo EXIT=$?`, { env: { TERM: "dumb" } });

      expect(run.bytes).toContain("cannot open an alternate screen");
      expect(run.bytes).toContain("EXIT=0");

      // "no escape sequence at all" taken literally. Not "no alternate screen"
      // — nothing. A terminal this degraded gets plain text or it gets a mess.
      expect(run.bytes, "an escape sequence reached a dumb terminal").not.toMatch(/\x1b/);

      // And the DECSET tracker agrees, which is the independent half: the
      // assertion above reads the bytes, this one reads the folded state.
      expect(run.decset).toMatchObject({ altScreen: false, cursorVisible: true });
    },
    30_000,
  );

  it(
    "T5.2: under TERM=xterm the frame renders, is readable, and carries no 24-bit sequence",
    async () => {
      const run = await runInPty(FIXTURE, { env: { TERM: "xterm" } });
      const painted = frame(run);

      // Readable: the content is there, not merely the escapes around it.
      expect(painted).toContain("capabilities");
      expect(painted).toContain("a failure");
      expect(painted).toContain("a success");

      // 4-bit is what `xterm` without `COLORTERM` detects, and the frame is
      // coloured — so the absences below are a degradation and not an absence
      // of colour altogether.
      expect(painted).toMatch(FOUR_BIT);
      expect(painted, "24-bit colour on a 16-colour terminal").not.toMatch(TRUECOLOUR);
      expect(painted, "256-colour on a 16-colour terminal").not.toMatch(INDEXED_256);
    },
    30_000,
  );

  it(
    "T5.3: under LANG=C the frame is ASCII throughout — no mojibake, no replacement characters",
    async () => {
      const run = await runInPty(FIXTURE, {
        env: { TERM: "xterm-256color", LANG: "C", LC_ALL: "C" },
      });
      const painted = frame(run);

      // Every byte in the frame is ASCII. This is the assertion the whole
      // `unicode: "ascii"` path exists for, and it is stronger than checking a
      // few known glyphs: a substitution table missing one entry fails here and
      // passes a spot check.
      const nonAscii = [...painted].filter((ch) => (ch.codePointAt(0) ?? 0) > 0x7f);
      expect(nonAscii, `non-ASCII in the frame: ${JSON.stringify(nonAscii.join(""))}`).toEqual([]);

      // Neither of the two ways this fails quietly: a replacement character
      // means the substitution ran and produced nothing, and `Â` is what a
      // UTF-8 box-drawing byte looks like decoded as latin-1.
      expect(painted).not.toContain("�");
      expect(painted).not.toContain("Â");

      // Still a frame, not an empty one — the glyphs degraded rather than
      // vanished, which C09 I5 requires to be width-preserving.
      expect(painted).toContain("a failure");
      expect(painted).toContain("a success");
    },
    30_000,
  );

  it(
    "T5.4: inside tmux no mouse sequence is emitted, in acquisition or release",
    async () => {
      const run = await runInPty(FIXTURE, {
        env: { TERM: "screen-256color", TMUX: "/tmp/tmux-1000/default,4242,0" },
      });

      for (const mode of ["\x1b[?1002h", "\x1b[?1006h", "\x1b[?1002l", "\x1b[?1006l"]) {
        expect(run.bytes, `emitted ${JSON.stringify(mode)} under tmux`).not.toContain(mode);
      }
      expect(run.decset).toMatchObject({ mouse1002: false, mouse1006: false });

      // Not vacuous: the run took the terminal and gave it back, so "no mouse"
      // is a decision rather than a program that did nothing.
      expect(run.bytes).toContain("\x1b[?1049h");
      expect(run.decset.altScreen).toBe(false);
      expect(frame(run)).toContain("capabilities");
    },
    30_000,
  );

  it(
    "T5.5: an override forcing 24-bit under TERM=xterm puts truecolour on the wire",
    async () => {
      // The point of this test is the word *renderer*. A record that carried the
      // override while the frame still emitted 4-bit would satisfy every tier-1
      // assertion C02 has — the override is applied, the record says 24 — and be
      // useless. This asserts the bytes.
      const forced = await runInPty(FIXTURE, { env: { TERM: "xterm", FORCE_DEPTH: "24" } });
      expect(frame(forced)).toMatch(TRUECOLOUR);

      // The same environment without the override, so the difference is
      // attributable to the override and not to the terminal.
      const detected = await runInPty(FIXTURE, { env: { TERM: "xterm" } });
      expect(frame(detected)).not.toMatch(TRUECOLOUR);
      expect(frame(detected)).toMatch(FOUR_BIT);
    },
    45_000,
  );

  it.todo(
    // **Two of the three blockers closed, and the third is one line of the
    // frame.** Focus can now enter the live block (C16 I22) and a table now has
    // a renderer at all — `table`, `plot` and `patch` register through C09's
    // public mechanism and no composition root called it, so a stock session
    // drew every table as its own JSON through the fallback, including the
    // framework's `/history`.
    //
    // What remains: **the frame never passes focus to the renderer.** C09's
    // `RenderContext.focus` exists and `renderSequenceToLines` takes it, and
    // the transcript path supplies `{theme, capabilities}` and nothing else —
    // so focus is stored (C16 §3), derived (`activeTarget`), routed (the
    // `liveBlock` handler) and invisible. The row waits on the frame deriving
    // C09's `FocusState` from C16's stored focus and C13's `liveId`, which is
    // the sentence C16 §3 already writes and nobody implements.
    //
    // Verified in passing on the way here: the table reaches the screen as a
    // table, and `↓` at the bottom of history enters the block.
    "T5.4b: inside tmux, keyboard navigation of a table works end to end — the routing and the renderer are done; blocked on the frame never populating C09's `RenderContext.focus`, so a focused row is indistinguishable from an unfocused one on screen",
  );
});
