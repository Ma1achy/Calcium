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
import { KITTY_KEYBOARD } from "../../src/terminal/escapes.js";
import { createDecoder } from "../../src/interaction/router/decode.js";
import { detectCapabilities } from "../../src/terminal/capabilities.js";
import { captureFromEmulator, emulatorMissing, sleep } from "../support/x-emulator.js";

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

  // **Was an `it.todo` for want of an emulator; the container has kitty now** (C02
  // T5.7, F810). The row above proves the bytes leave the process; this one
  // proves a terminal *answers* them, in its own encoding, and that the decoder
  // reads that encoding — the wiring a graph-level row cannot see (F799). Skips
  // by name where kitty, Xvfb or xdotool is absent, never silently: the reason
  // is in the title. The `full` CI job and the devcontainer install all three.
  const kittyMissing = emulatorMissing("kitty");
  it.skipIf(kittyMissing !== null)(
    `T5.7 (C02 I12; C16 I30): kitty receives KITTY_KEYBOARD.enter and answers \`CSI 27 u\` for a lone Esc, \`CSI 13;2:3 u\` for Shift-Enter released — and the real decoder reads both${kittyMissing === null ? "" : ` — skipped: ${kittyMissing}`}`,
    async () => {
      const { a } = await captureFromEmulator({
        program: "kitty",
        enter: KITTY_KEYBOARD.enter,
        leave: KITTY_KEYBOARD.leave,
        drive: async (xdo, _window, phase) => {
          if (phase !== 1) return;
          xdo("keydown", "Escape"); await sleep(150); xdo("keyup", "Escape"); await sleep(300);
          xdo("keydown", "shift"); await sleep(100); xdo("keydown", "Return"); await sleep(150);
          xdo("keyup", "Return"); await sleep(100); xdo("keyup", "shift"); await sleep(300);
          xdo("type", "k"); // the control: a capture without it is a broken reader, not a quiet terminal
        },
      });
      expect(a, "the control byte arrived, so the capture read").toContain("k");
      expect(a, "a lone Esc is `CSI 27 u` — not a prefix").toContain("\x1b[27u");
      expect(a, "its release carries `:3`").toContain("\x1b[27;1:3u");
      expect(a, "Shift-Enter is `CSI 13;2 u`").toContain("\x1b[13;2u");
      expect(a, "released, `CSI 13;2:3 u`").toContain("\x1b[13;2:3u");

      // **The decoder, on the emulator's bytes** — the pair T4.72 could not see (F799).
      const d = createDecoder({ capabilities: { bracketedPaste: true, mouse: true }, now: () => 0 });
      const events = d.push(new TextEncoder().encode(a)).filter((e) => e.kind === "key");
      const keys = events.map((e) => (e.kind === "key" ? `${e.key.name}${e.key.shift ? "+shift" : ""}${e.event === "release" ? "/release" : ""}` : ""));
      expect(keys).toEqual(["escape", "escape/release", "enter+shift", "enter+shift/release", "k", "k/release"]);
    },
    60_000,
  );

  // **T5.8 — the identification's claims put to the terminals they are about.**
  // Every row above asserts what the framework *sends*; this asserts what a
  // terminal *answers*, which is the only thing that can tell an `inferred`
  // capability from a fact (C02 I13). kitty is the emulator the table names and
  // xterm is the one it declines to, so the two arms are a claim and its control
  // rather than one measurement read twice.
  const bothMissing = emulatorMissing("kitty") ?? emulatorMissing("xterm");
  it.skipIf(bothMissing !== null)(
    `T5.8 (C02 I13, I11): kitty answers DECRQM 2026, the graphics query and \`CSI ? u\`; XTerm answers the first as *not recognised* and the other two not at all — and the reply channel is measured beside them${bothMissing === null ? "" : ` — skipped: ${bothMissing}`}`,
    async () => {
      // Three queries in one capture per emulator: the terminal answers them in
      // order and a second Xvfb costs more than the assertions are worth.
      //
      // **The graphics query goes last, and that ordering is load-bearing.** Its
      // ST is `ESC \\`, and the fixture hands the string to `printf`, which reads
      // the `\\` as an escaped backslash and swallows the `ESC` of whatever
      // follows. Written in the reading order — DECRQM, graphics, keyboard — the
      // third query never left the shell and the row failed as *kitty does not
      // answer `CSI ? u`*, which is a harness defect wearing the subject's face.
      const DECRQM = "\x1b[?2026$p";
      const KEYBOARD = "\x1b[?u";
      // **BEL-terminated on purpose** (C16 §2a row d, F1043). XTerm mirrors the
      // query's terminator, so this is the one query in the capture whose reply
      // is `BEL`-closed on one emulator and `ST`-closed on the other — the two
      // forms in one row, which is what the arm has to read. It also carries no
      // backslash, so unlike `GRAPHICS` it can sit anywhere in the string.
      const COLOUR = "\x1b]11;?\x07";
      const GRAPHICS = "\x1b_Gi=31,s=1,v=1,a=q,t=d,f=24;AAAA\x1b\\";

      const ask = async (program: "kitty" | "xterm"): Promise<string> => {
        const { a } = await captureFromEmulator({
          program,
          enter: DECRQM + KEYBOARD + COLOUR + GRAPHICS,
          leave: "",
          seconds: 2,
          drive: async (xdo, _window, phase) => {
            if (phase !== 1) return;
            await sleep(500);
            // The control, and `z` appears in none of the replies below — the
            // first probe used `K` and ate the `K` of `OK`.
            xdo("type", "z");
          },
        });
        expect(a, `${program}: the control byte arrived, so the capture read`).toContain("z");
        return a.replace(/z/gu, "");
      };

      const kitty = await ask("kitty");
      // **DECRQM answers on a terminal that implements the mode**: `;2` is
      // reset-but-recognised, which is what `synchronisedUpdate: true` claims.
      expect(kitty, "kitty recognises 2026").toContain("\x1b[?2026;2$y");
      // **The graphics protocol, answered by the terminal rather than by a
      // name** — `imageProtocol` shipped once having never run against one.
      expect(kitty, "kitty answers the graphics query").toMatch(/\x1b_Gi=31;OK\x1b\\/u);
      // **And the keyboard protocol**, whose flags are 0 before anything pushes.
      expect(kitty, "kitty answers `CSI ? u`").toMatch(/\x1b\[\?\d+u/u);

      const xterm = await ask("xterm");
      // **`;0` is *not recognised*, and it is a reply.** That is what makes this
      // capability interrogable at all: a terminal without the mode still says
      // so, where the two queries below produce nothing and would need a window.
      expect(xterm, "XTerm answers 2026 as not recognised").toContain("\x1b[?2026;0$y");
      expect(xterm, "XTerm sends no graphics reply").not.toContain("\x1b_G");
      expect(xterm, "XTerm sends no keyboard-protocol reply").not.toMatch(/\x1b\[\?\d+u/u);

      // **All four agree with what the identification claims for each**, which
      // is the row's verdict rather than a spot check: the table is right about
      // the two emulators that can be run here, and `inferred` still names the
      // failure it always named — that this is not kitty and the name says it is.
      const claim = (env: NodeJS.ProcessEnv): unknown[] => {
        const { capabilities, sources } = detectCapabilities(env);
        return [
          capabilities.synchronisedUpdate,
          capabilities.imageProtocol,
          capabilities.keyboardProtocol,
          sources.imageProtocol,
        ];
      };
      expect(claim({ TERM: "xterm-kitty" })).toEqual([true, "kitty", "kitty", "inferred"]);
      expect(claim({ TERM: "xterm-256color" })).toEqual([false, "none", "none", "inferred"]);

      // **The reply channel, on the emulator's own bytes** (FINDINGS F414,
      // F1035, F1043). **This block used to assert the defect** — `Alt-_`
      // opening, `Alt-\` closing, `> 5` events typed into the prompt — because
      // there was an `ESC [` arm, an `ESC O` arm and nothing for a
      // string-terminated reply. A row that asserts a disagreement is green for
      // exactly as long as the defect is; the arm is C16 I32 and this now
      // asserts it.
      const decode = (bytes: string): string[] => {
        const d = createDecoder({ capabilities: { bracketedPaste: true, mouse: true }, now: () => 0 });
        return d.push(new TextEncoder().encode(bytes)).map((e) =>
          e.kind === "key" ? `${e.key.name}${e.key.meta ? "+meta" : ""}${e.key.ctrl ? "+ctrl" : ""}` : e.kind,
        );
      };
      // Located in the capture rather than reconstructed: a probe rebuilt from
      // intent agrees with itself and cannot find a transcription defect.
      const csi = /\x1b\[\?2026;\d+\$y/u.exec(kitty)?.[0] ?? "";
      const apc = /\x1b_Gi=31;[^\x1b]*\x1b\\/u.exec(kitty)?.[0] ?? "";
      // **Both terminator forms, one per emulator, from one query.** XTerm
      // mirrors the `BEL` it was asked with; kitty answers `ST` regardless.
      const oscBel = /\x1b\]11;[^\x1b\x07]*\x07/u.exec(xterm)?.[0] ?? "";
      const oscSt = /\x1b\]11;[^\x1b\x07]*\x1b\\/u.exec(kitty)?.[0] ?? "";
      expect(csi, "the DECRQM reply was located in the capture").not.toBe("");
      expect(apc, "the APC reply was located in the capture").not.toBe("");
      expect(oscBel, "XTerm's OSC reply is BEL-terminated — the query's own form").not.toBe("");
      expect(oscSt, "kitty's OSC reply is ST-terminated whatever it was asked").not.toBe("");

      // **All four reach the application as nothing.** The CSI row is the
      // control and always passed; the three string-terminated ones are what
      // F414's `q=2` deferral was waiting on, and the pair of OSC rows is the
      // reason the arm reads two terminators rather than one.
      for (const [what, bytes] of [
        ["a CSI reply", csi],
        ["kitty's APC graphics reply", apc],
        ["XTerm's BEL-terminated OSC reply", oscBel],
        ["kitty's ST-terminated OSC reply", oscSt],
      ] as const) {
        expect(decode(bytes), `${what} reaches the line editor as nothing`).toEqual([]);
      }

      // **The control that proves the fixture can still move**, because four
      // `toEqual([])` rows are also what a decoder that swallowed everything
      // would produce. `ESC Q` is not an introducer and is still Meta.
      expect(decode("\x1bQ"), "the decoder has not simply stopped emitting").toEqual(["Q+meta"]);
    },
    240_000,
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
        // the keystroke's second effect (C16 I22). It lands on the card's head
        // (C09 I47), which is not one of the two rows, so a second `↓` is what
        // reaches the table.
        pty.type("\u001b[B");
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
