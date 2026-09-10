// C16 tier 5 — the mouse through a PTY. Bytes in, frame out, no fake decoder.
//
// Every other row about the pointer feeds `InputEvent`s to the router or SGR
// strings to a fake stdin (`session-mouse.test.ts`); the decoder, the router
// and the painter are each right and nothing had ever pushed the bytes a
// terminal writes through the process that reads them. That is *an instrument
// written before its subject* (F759), and the fixture lesson it carries is
// applied here in the first assertion of every row: **the first capture is
// checked for the tracking `h` sequences before a single gesture is written**,
// because a session that never negotiated the mouse consumes the bytes and
// changes nothing — which is what T5.8's control is *for*, and what T5.6 would
// pass as if it had been asserted against a working path.
//
// `/ps --mine` is the corpus entry with rows to focus — two of them — and two
// invocations give two entries, so a click on the first entry's second row has
// three rows it must *not* highlight (C16 §4a: containment is not correctness).
import { describe, expect, it } from "vitest";

import { interactivePty } from "../support/pty.js";
import { createDecoder } from "../../src/interaction/router/decode.js";
import { MOUSE, MOUSE_ANY } from "../../src/terminal/escapes.js";
import {
  captureFromEmulator,
  type Emulator,
  emulatorMissing,
  installedPrograms,
  sleep,
} from "../support/x-emulator.js";

const FIXTURE = "node test/support/fixture.mjs session";
const PROMPT = /❯/;

/** The tracking pair the lifecycle negotiates (C01 `MOUSE.enter`, as bytes). */
const TRACKING_ON = ["\u001b[?1002h", "\u001b[?1006h"];

/** SGR 1006 as a terminal sends it: `Cb` then 1-based column and row; `M` press, `m` release. */
const sgr = (cb: number, col0: number, row0: number, final: "M" | "m" = "M"): string =>
  `\u001b[<${String(cb)};${String(col0 + 1)};${String(row0 + 1)}${final}`;
const click = (col0: number, row0: number): string => sgr(0, col0, row0, "M") + sgr(0, col0, row0, "m");
const wheelUp = (col0: number, row0: number): string => sgr(64, col0, row0, "M");

/** `WHEEL_ROWS` in `construct.ts` — cited as a number so the row asserts the constant, not a move. */
const WHEEL_ROWS = 3;

/** Terminal rows carrying one of the two uuids, in screen order. */
const uuidRows = (frame: readonly string[]): number[] =>
  frame.flatMap((r, i) => (r.includes("a3f9b21") || r.includes("7c2d4e1") ? [i] : []));

const beat = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe("C16 e2e — the mouse through a PTY (I31, §4a)", () => {
  it(
    "T5.6 (C16 I31): SGR click bytes on the first entry's second row highlight that row, read from the painted frame",
    async () => {
      const pty = interactivePty(FIXTURE, { cols: 100, rows: 24 });
      try {
        await pty.waitFor(PROMPT, 15_000);

        // **The fixture responds to the thing under test, or nothing below is
        // about a click** (F759, `test/support/README.md`). Both halves of the
        // pair, because a lifecycle that took 1002 and not 1006 would be
        // reporting in the X10 encoding the decoder does not read.
        for (const seq of TRACKING_ON) {
          expect(pty.output, `the first capture negotiated ${JSON.stringify(seq)}`).toContain(seq);
        }

        pty.type("/ps --mine\r");
        await pty.waitForFrame((f) => uuidRows(f).length === 2, 15_000);
        pty.type("/ps --mine\r");
        await pty.waitForFrame((f) => uuidRows(f).length === 4, 15_000);
        // A frame can satisfy the predicate while still arriving (C02 T5.4b's
        // note); a partial baseline makes every comparison below meaningless.
        await beat(300);

        const rows = uuidRows(pty.frame);
        expect(rows, "two entries of two rows, in order").toHaveLength(4);
        const [a1, b1, a2, b2] = rows as [number, number, number, number];
        expect(pty.frame[a1], "entry 1 row 1").toContain("a3f9b21");
        expect(pty.frame[b1], "entry 1 row 2 — the target").toContain("7c2d4e1");
        expect(pty.frame[a2]).toContain("a3f9b21");
        expect(pty.frame[b2]).toContain("7c2d4e1");
        expect(b1, "the target sits directly under its first row").toBe(a1 + 1);

        const before = pty.styledFrame;
        const text = pty.frame;

        // The column is inside the uuid cell; row is 0-based here and 1-based on
        // the wire, which is the translation the decoder owns (`Number(y) - 1`).
        pty.type(click(4, b1));
        await pty.waitForFrame(() => pty.styledFrame[b1] !== before[b1], 15_000);
        await beat(200);
        const after = pty.styledFrame;

        // **Which row, not that one.** The target's pen changed; the other three
        // did not; and no stripped text moved anywhere on the screen — focus is a
        // tone and nothing else (C11 I14).
        expect(after[b1], "the clicked row carries a new tone").not.toBe(before[b1]);
        for (const other of [a1, a2, b2]) {
          expect(after[other], `row ${String(other)} is untouched`).toBe(before[other]);
        }
        // **Row 0 is chrome and carries a clock**, repainted on the click's frame;
        // whole-frame equality included it and T5.6 died once under a wheel
        // mutation that cannot touch a click (2026-09-05). The region is the subject.
        expect(pty.frame.slice(1), "the stripped region is unchanged — a highlight, not a move").toEqual(text.slice(1));
      } finally {
        pty.kill();
      }
    },
    60_000,
  );

  it(
    "T5.7 (C16 I31, §4a row i): SGR wheel-up bytes over prose move the transcript by exactly WHEEL_ROWS",
    async () => {
      const pty = interactivePty(FIXTURE, { cols: 100, rows: 24 });
      try {
        await pty.waitFor(PROMPT, 15_000);
        for (const seq of TRACKING_ON) expect(pty.output).toContain(seq);

        // Enough entries that the transcript is taller than the region — a wheel
        // over a transcript that fits scrolls nothing and the row would be
        // asserting that nothing moved because nothing could.
        for (let i = 0; i < 6; i += 1) {
          pty.type("/ps --mine\r");
          // A card entry is six rows now (command, step header, hooked header,
          // two uuid rows, the closing blank — C22 I84/I85), so at most a few fit
          // the region at once; the cap gates each submit without needing more
          // uuid rows on screen than a card-tall transcript can show.
          await pty.waitForFrame((f) => uuidRows(f).length >= Math.min(2 * (i + 1), 4), 15_000);
          await beat(100);
        }
        // The prose: the bare verb answers with a notice and no rows (C02 T5.4b).
        pty.type("/ps\r");
        await pty.waitForFrame((f) => f.some((r) => r.includes("no processes")), 15_000);
        await beat(300);

        const before = pty.frame;
        const noticeRow = before.findIndex((r) => r.includes("no processes"));
        expect(noticeRow, "the notice is on screen").toBeGreaterThan(0);
        const firstUuid = uuidRows(before)[0];
        expect(firstUuid, "an entry row above the notice to watch").toBeDefined();
        // The control for "taller than the region": twelve uuid rows exist and
        // fewer are on screen, so there is something above to scroll into.
        expect(uuidRows(before).length, "the transcript overflows the region").toBeLessThan(12);

        pty.type(wheelUp(2, noticeRow));
        await pty.waitForFrame((f) => f[noticeRow] !== before[noticeRow], 15_000);
        await beat(200);
        const after = pty.frame;

        // **By the constant, not merely moved.** Scrolling up brings earlier rows
        // in from the top, so every row that stayed on screen is WHEEL_ROWS
        // lower; the watched row is where the arithmetic says and nowhere else.
        expect(after[(firstUuid as number) + WHEEL_ROWS], "the watched row moved down by WHEEL_ROWS").toBe(
          before[firstUuid as number],
        );
        expect(after[firstUuid as number], "and is no longer where it was").not.toBe(before[firstUuid as number]);
        expect(after[noticeRow], "the pointer's row changed under it").not.toBe(before[noticeRow]);
      } finally {
        pty.kill();
      }
    },
    90_000,
  );

  it(
    "T5.8 (C16 I31, C02 I10) — the control: with `mouse` forced off, the first capture negotiates nothing and the same bytes change nothing",
    async () => {
      // **Forced on the record the lifecycle acquires from** — `FORCE_MOUSE`
      // reaches `createTui`'s `capabilities` override, the same path
      // `FORCE_DEPTH` takes (F759: forcing the renderer's copy and not the
      // lifecycle's left `1002h` on the wire while the row asserted it was off).
      const pty = interactivePty(FIXTURE, { cols: 100, rows: 24, env: { FORCE_MOUSE: "0" } });
      try {
        await pty.waitFor(PROMPT, 15_000);

        pty.type("/ps --mine\r");
        await pty.waitForFrame((f) => uuidRows(f).length === 2, 15_000);
        pty.type("/ps --mine\r");
        await pty.waitForFrame((f) => uuidRows(f).length === 4, 15_000);
        await beat(300);

        // The first assertion is about the capture, as in T5.6 — inverted.
        for (const seq of TRACKING_ON) {
          expect(pty.output, `no ${JSON.stringify(seq)} was negotiated`).not.toContain(seq);
        }

        const [, b1] = uuidRows(pty.frame) as [number, number, number, number];
        const before = pty.styledFrame;
        const beforeText = pty.frame;

        // The same bytes T5.6 and T5.7 write. The decoder consumes them under a
        // record with `mouse: false` (`decode.ts`), so nothing downstream sees a
        // gesture — and nothing lands in the prompt as text either, which is the
        // other way a control can fail while looking like "nothing happened".
        pty.type(click(4, b1));
        pty.type(wheelUp(2, b1));
        await beat(600);

        // Below the chrome row, for T5.6's reason: the header's clock is not the subject.
        expect(pty.styledFrame.slice(1), "no tone changed and no row moved").toEqual(before.slice(1));
        expect(pty.frame.slice(1), "and no byte of the gesture reached the prompt as text").toEqual(beforeText.slice(1));
      } finally {
        pty.kill();
      }
    },
    60_000,
  );
});

/**
 * **The five emulators F753 and F800 owe, and what each is here** (F1039, F1044).
 *
 * Counted rather than excluded: a row that lists only what it measured cannot
 * say whether the remainder is owed, unpayable, or forgotten.
 *
 * | | |
 * |---|---|
 * | `xterm` | **measured** — `398-1` in this container, the implementation of the document C01 §5 cites |
 * | `kitty` | **measured** — `0.41.1-2+deb13u2` |
 * | `ghostty` | no candidate in Debian trixie: a third-party repository or a source build, and a change to `.devcontainer/` |
 * | `wezterm` | no candidate in Debian trixie, as above |
 * | iTerm2 | **a permanent limit, not a deferral** — macOS-only, so it cannot run in this container ever. Its row expires on a macOS runner or never, which is why it is not in the probe below: a deferral names a condition something can watch, and there is nothing here that could ever satisfy this one |
 *
 * **Two emulators is a pair, not a survey**, and both are xterm-lineage in their
 * SGR encoding. They agree because they implement the same document; agreement
 * is evidence the decoder reads *ctlseqs* correctly and not that every terminal
 * encodes this way. The one place they differ is the one place it does not say.
 */
const OWED_EMULATORS = ["xterm", "kitty", "ghostty", "wezterm"] as const;

/** The two the rows below drive, compared against what is installed **by equality**. */
const MEASURED: readonly Emulator[] = ["kitty", "xterm"];

describe("C16 §2 / C01 I21 — the mouse modes, answered by two emulators (F808, F1039)", () => {
  // **F808's hand measurement, as a gate**, now on a second emulator (F1039).
  // Under Xvfb both answer in bytes. Three rests, a drag, a typed `k` as the
  // control in every capture. Skips by name where the emulator, Xvfb or xdotool
  // is absent.
  const gesture = async (xdo: (...a: readonly string[]) => void, w: string): Promise<void> => {
    for (const x of ["100", "130", "160"]) { xdo("mousemove", "--window", w, x, "100"); await sleep(200); }
    xdo("mousedown", "1"); await sleep(150);
    for (const x of ["200", "240"]) { xdo("mousemove", "--window", w, x, "100"); await sleep(150); }
    xdo("mouseup", "1"); await sleep(250);
    xdo("type", "k"); await sleep(200);
  };
  const count = (s: string, re: RegExp): number => (s.match(re) ?? []).length;
  const REST = /\x1b\[<35;\d+;\d+M/gu;
  const DRAG = /\x1b\[<32;\d+;\d+M/gu;

  const bothMissing = emulatorMissing("xterm") ?? emulatorMissing("kitty");

  it.skipIf(bothMissing !== null)(
    `T5.9 (C01 I21, C16 I30; F808, F1039): on XTerm(398) and kitty 0.41.1 alike, 1003 alone reports rests, 1002 alone reports none, and after \`1003l\` nothing — one tracking mode, either release clears it${bothMissing === null ? "" : ` — skipped: ${bothMissing}`}`,
    async () => {
      // **The set, by equality, before anything is driven.** A loop over
      // *whatever is installed* is the same green with one emulator as with
      // three; this makes a Ghostty arriving in `.devcontainer/` a failure that
      // names itself rather than a quietly shorter loop.
      expect(
        installedPrograms(OWED_EMULATORS).sort(),
        "the emulators this container can drive — a third one is a row to write, not a pass",
      ).toEqual([...MEASURED].sort());

      const drove: Emulator[] = [];
      for (const program of MEASURED) {
        drove.push(program);

        const only1003 = await captureFromEmulator({
          program, enter: MOUSE_ANY.enter, leave: MOUSE_ANY.leave,
          drive: async (xdo, w, phase) => { if (phase === 1) await gesture(xdo, w); },
        });
        expect(only1003.a, `${program}: the control byte`).toContain("k");
        expect(count(only1003.a, REST), `${program}: rests are reported under 1003 — \`Cb & 3 === 3\`, motion with no button`).toBeGreaterThan(0);

        const only1002 = await captureFromEmulator({
          program, enter: MOUSE.enter, leave: MOUSE.leave,
          drive: async (xdo, w, phase) => { if (phase === 1) await gesture(xdo, w); },
        });
        expect(only1002.a, `${program}: the control byte`).toContain("k");
        expect(count(only1002.a, REST), `${program}: 1002 reports no rest`).toBe(0);

        // 1002 then 1003, then 1003 released: if the terminal held two modes, 1002 would still
        // report the drag in phase b — in SGR or, with 1006 released too, in the legacy encoding;
        // either is bytes, and the assertion is that there are none but the control. The pairs
        // are composed from `escapes.ts`, the one owner of every mode literal (C01 T2.8).
        const order = await captureFromEmulator({
          program, enter: MOUSE.enter + MOUSE_ANY.enter, mid: MOUSE_ANY.leave, leave: MOUSE.leave,
          drive: async (xdo, w) => { await gesture(xdo, w); },
        });
        expect(count(order.a, REST), `${program}: 1003 in force, the later select wins`).toBeGreaterThan(0);
        expect(order.b, `${program}: after \`1003l\`, only the control byte — 1002 was not left behind`).toBe("k");

        // **The decoder, on this emulator's own rest byte** (C16 I30): `35` is
        // no button. Two emulators now write the byte the arm was built for.
        const rest = /\x1b\[<35;\d+;\d+M/u.exec(only1003.a)?.[0] ?? "";
        const d = createDecoder({ capabilities: { bracketedPaste: true, mouse: true }, now: () => 0 });
        const ev = d.push(new TextEncoder().encode(rest))[0];
        expect(ev?.kind === "mouse" ? ev.button : ev?.kind, `${program}: the rest decodes as \`button: "none"\``).toBe("none");

        // **The drag arm is xterm's alone, and the reason is the harness.** The
        // same `xdotool` gesture that gives xterm `0M 32M 32M 0m` gives kitty a
        // press and a release at every position and never a button-1 motion, so
        // `drags` is 0 and the pointer moves are `Cb=35`. The window is fine and
        // the moves are reported: the button is not held during them. Extending
        // this arm to kitty by copying the gesture fails on `xdotool`'s pointer
        // handling while reading as *kitty does not report drags* — a harness
        // defect wearing the subject's face (F1039). Holding Shift to suppress
        // `--clearmodifiers` was tried and collapsed the gesture on **both**
        // emulators to a single `35M`, so it settles nothing.
        if (program === "xterm") {
          expect(count(only1003.a, DRAG), "xterm: and the drag, under 1003").toBeGreaterThan(0);
          expect(count(only1002.a, DRAG), "xterm: and the drag, under 1002").toBeGreaterThan(0);
        }
      }
      expect(drove.sort(), "every declared emulator was driven, not merely listed").toEqual([...MEASURED].sort());
    },
    360_000,
  );

  it.skipIf(bothMissing !== null)(
    `T5.10 (C16 I30, §2; F753, F1039): the wheel is \`64 65 66 67\` on both emulators — and xterm reports the horizontal wheel twice where kitty reports it once${bothMissing === null ? "" : ` — skipped: ${bothMissing}`}`,
    async () => {
      // **F753's residue, answered on a wire.** `WHEEL_DIRECTIONS` is indexed by
      // `Cb & 3` and its order was taken from *ctlseqs*; this is the order two
      // terminals actually send. Buttons 4–7 are the wheel's four directions.
      //
      // The drive runs in **both capture phases**, so the two runs the claim
      // needs cost no extra Xvfb: phase b's byte sequence is asserted equal to
      // phase a's.
      const wheel = async (xdo: (...a: readonly string[]) => void, w: string): Promise<void> => {
        xdo("mousemove", "--window", w, "100", "100"); await sleep(250);
        for (const b of ["4", "5", "6", "7"]) { xdo("click", b); await sleep(250); }
        xdo("type", "k"); await sleep(250);
      };
      /** Every SGR report in the capture as `<Cb><final>`, wheel bit set only. */
      const wheelReports = (s: string): string[] =>
        [...s.matchAll(/\x1b\[<(\d+);\d+;\d+([Mm])/gu)]
          .filter((m) => (Number(m[1]) & 64) !== 0)
          .map((m) => `${m[1] as string}${m[2] as string}`);

      const seen = new Map<Emulator, readonly string[]>();
      for (const program of MEASURED) {
        const cap = await captureFromEmulator({
          program, enter: MOUSE_ANY.enter, leave: MOUSE_ANY.leave, drive: wheel,
        });
        expect(cap.a, `${program}: the control byte in phase a`).toContain("k");
        expect(cap.b, `${program}: the control byte in phase b`).toContain("k");
        const a = wheelReports(cap.a);
        expect(wheelReports(cap.b), `${program}: the second run is byte-identical to the first`).toEqual(a);
        seen.set(program, a);
      }
      expect([...seen.keys()].sort(), "both emulators, by equality").toEqual([...MEASURED].sort());

      // **The four presses, in the array's order, on both.** Asserted as the
      // whole press sequence rather than as membership: a decoder with the pair
      // swapped satisfies *64 and 65 are present* and fails this.
      for (const [program, reports] of seen) {
        expect(
          reports.filter((r) => r.endsWith("M")),
          `${program}: buttons 4–7 are Cb 64, 65, 66, 67 in that order`,
        ).toEqual(["64M", "65M", "66M", "67M"]);
      }

      // **The press/release asymmetry is its own assertion, not a tolerance.**
      // A row phrased as *at least the four presses* is satisfied by both
      // terminals and records nothing. xterm emits a release for buttons 6 and
      // 7 and none for 4 and 5; kitty emits none at all. Nothing masks the
      // finals, so one horizontal notch is two `wheelLeft` events on xterm and
      // one on kitty — latent while `construct.ts` acts on the vertical pair
      // only, and a scroll-speed constant to whoever binds the horizontal one.
      expect(
        (seen.get("xterm") ?? []).filter((r) => r.endsWith("m")),
        "xterm reports a release for the horizontal wheel and none for the vertical",
      ).toEqual(["66m", "67m"]);
      expect(
        (seen.get("kitty") ?? []).filter((r) => r.endsWith("m")),
        "kitty reports no wheel release at all",
      ).toEqual([]);

      // **And the decoder on those bytes** — the four names in the array's
      // order, from the emulator's own report rather than a hand-built string.
      const d = createDecoder({ capabilities: { bracketedPaste: true, mouse: true }, now: () => 0 });
      const names = ["64", "65", "66", "67"].map((cb) => {
        const [ev] = d.push(new TextEncoder().encode(`\u001b[<${cb};1;1M`));
        return ev?.kind === "mouse" ? ev.button : ev?.kind;
      });
      expect(names, "`WHEEL_DIRECTIONS` indexed by `Cb & 3`, confirmed against a wire").toEqual([
        "wheelUp", "wheelDown", "wheelLeft", "wheelRight",
      ]);
    },
    240_000,
  );
});
