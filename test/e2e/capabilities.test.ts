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
import { displayCells } from "../../src/presentation/text.js";

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

  it(
    "T5.6 (C02 I12, C01 I6): the keyboard protocol forced on puts `ESC [ > 3 u` and `ESC [ < u` on the wire, in C01's positions",
    async () => {
      // **Bytes read from the PTY, not reconstructed from the record.** Every
      // tier-1 row asserts what C01 handed a fake stream; this asserts what a
      // kernel device received, which is the claim a user's terminal depends on.
      const forced = await runInPty(FIXTURE, { env: { TERM: "xterm-256color", FORCE_KEYBOARD: "kitty" } });
      const push = forced.bytes.indexOf("\x1b[>3u");
      const pop = forced.bytes.indexOf("\x1b[<u");
      const frame = forced.bytes.indexOf("FRAME-START");
      const mouseOff = forced.bytes.indexOf("\x1b[?1006l");
      expect(push, `push present in ${JSON.stringify(forced.bytes.slice(0, 80))}`).toBeGreaterThanOrEqual(0);
      expect(pop, "pop present").toBeGreaterThanOrEqual(0);
      // Pushed after the mouse pair and before the frame; popped first, before
      // the mouse leaves (C01 §5 step 7).
      expect(push).toBeGreaterThan(forced.bytes.indexOf("\x1b[?1006h"));
      expect(push).toBeLessThan(frame);
      expect(pop).toBeGreaterThan(frame);
      expect(pop).toBeLessThan(mouseOff);
      // The pop form and never a reset: no `CSI = … u` anywhere in the run.
      expect(forced.bytes).not.toMatch(/\x1b\[=[0-9;]*u/);
      // Exactly one of each — a re-push on some path would show here.
      expect(forced.bytes.match(/\x1b\[[<>][0-9;]*u/g)).toEqual(["\x1b[>3u", "\x1b[<u"]);

      // **The unforced arm**, so the bytes are attributable to the capability and
      // not to a lifecycle that pushes regardless: `xterm-256color` is unidentified
      // and the record says `none`.
      const detected = await runInPty(FIXTURE, { env: { TERM: "xterm-256color" } });
      expect(detected.bytes).not.toMatch(/\x1b\[[<>=][0-9;]*u/);
      expect(detected.bytes).toContain('"keyboardProtocol":"none"');
    },
    45_000,
  );

  // **Owed, and not faked** (C02 T5.7). The row above proves the bytes leave
  // the process; nothing here proves a terminal *answers* them — that a lone
  // `Esc` comes back as `CSI 27 u`, that Shift-Enter released carries `:3`. The
  // container has no kitty, Ghostty, WezTerm or foot to answer, and
  // `imageProtocol` shipped once having never run against a terminal. An
  // `it.todo` rather than a skip — the shape TD0–TD6 collect and can expire —
  // named so it is found by grepping the symbol or the reason, never a pass.
  it.todo(
    "T5.7 (owed, C02 I12): a real emulator receives KITTY_KEYBOARD.enter and answers `CSI 27 u` for Esc and `CSI 13;2:3 u` for Shift-Enter released — not deferred on a component: it needs kitty, Ghostty, WezTerm or foot installed in the container, and none is",
  );

  it(
    "T5.4b: inside tmux, keyboard navigation of a table works end to end",
    async () => {
      // **Three gaps deep, and each was invisible until the one in front of it
      // closed.** `enterLiveBlock` had no caller, so focus could never leave
      // the prompt (C16 I22). `table` was registered by nobody, so the block
      // drew as its own JSON through the fallback (C09 I13). And the frame
      // supplied `{theme, capabilities}` and not `focus`, so a focused row
      // rendered exactly like an unfocused one — every reference present, the
      // seam still broken (C16 §3).
      const pty = interactivePty("node test/support/fixture.mjs session", {
        cols: 100,
        rows: 24,
        env: { TERM: "screen-256color", TMUX: "/tmp/tmux-1000/default,4242,0" },
      });
      try {
        await pty.waitFor(/\u276f/, 15_000);

        // `--mine`, because the bare verb answers with a notice and a notice
        // has no rows: `↓` would correctly do nothing (C16 I22).
        pty.type("/ps --mine\r");
        await pty.waitForFrame((f) => f.join("").includes("a3f9b21"), 15_000);

        // **The raw rows, escapes and all.** C11 renders focus as a *tone* and
        // nothing else (C11 I14), so the stripped text of a focused row is
        // identical to an unfocused one — comparing `pty.frame` would assert
        // that focus is invisible, which is what it was.
        // **This used to slice `output` from the last `CSI H` and split on
        // newlines, and it counted one row where two were on the screen** — the
        // third independent copy of F149's premise. The shell writes one home
        // ever (C22 I55 §6b); two table rows are separated by an *address*, not
        // a newline, so both landed in one string.
        //
        // `styledFrame` is what the comment above was asking for and the
        // harness did not have: the screen, with the attributes each cell was
        // written under. It keeps the property this row depends on — a focused
        // row differs from an unfocused one — without re-deriving a screen from
        // a stream of edits.
        const rawRows = (): string[] =>
          pty.styledFrame.filter((r) => r.includes("a3f9b21") || r.includes("7c2d4e1"));

        // A beat before the baseline: `waitForFrame` resolves on the first poll
        // that satisfies it, which can be a frame still arriving, and a partial
        // baseline makes the comparison below meaningless in whichever
        // direction it happens to fall.
        await new Promise((r) => setTimeout(r, 300));
        const before = rawRows();
        expect(before.length, "both rows are on the screen").toBe(2);

        // `↓` at the prompt: history has nothing further to offer, so this is
        // the keystroke's second effect (C16 I22).
        pty.type("\u001b[B");
        await pty.waitForFrame(() => rawRows().join("\n") !== before.join("\n"), 15_000);

        // **The focused row looks different and nothing moved.** Focus is a
        // tone — no marker, no extra row, no width (C11 I14) — so a width that
        // changed here would be a defect in C11 rather than in the wiring.
        const after = rawRows();
        expect(after.length, "no row was added").toBe(before.length);
        for (const [i, row] of after.entries()) {
          expect(displayCells(row), `row ${String(i)} is the same width`).toBe(
            displayCells(before[i] ?? ""),
          );
        }
        expect(after.join("\n"), "and the focused row carries a tone").not.toBe(before.join("\n"));

        // Back out by the route S01's footer advertises.
        pty.type("\u001b");
        await pty.waitForFrame(() => rawRows().join("\n") === before.join("\n"), 15_000);

        // **Inside tmux throughout**, which is what makes this C02's row: the
        // navigation is keyboard-only and no mouse mode was negotiated.
        expect(pty.output, "no mouse mode under tmux").not.toContain("\u001b[?1002h");
      } finally {
        pty.kill();
      }
    },
    60_000,
  );
});
