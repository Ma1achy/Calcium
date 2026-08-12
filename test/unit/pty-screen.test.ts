// The PTY harness's screen model — F149's acceptance, and group 9's rule
// applied to the framework's own instrument rather than the demo's tooling.
//
// **Known bytes in, stated screen out.** Every row here writes the sequences
// the shell actually emits — `render-frame.ts` builds them — and asserts the
// screen a user would see. The first row is the measured defect: the frame
// reader returned everything after the last `CSI H`, the shell writes one home
// ever, and a 400-row transcript came back as a single line.
import { describe, expect, it } from "vitest";

import { atEscapeBoundary, overrun, screen } from "../support/pty.js";

const ESC = "\u001b";
const HOME = `${ESC}[H`;
/** What `cursorTo(i, 0)` puts on the wire: CUP is 1-based, the model is not. */
const at = (row: number): string => `${ESC}[${String(row + 1)};1H`;
const SGR = `${ESC}[0m`;

/**
 * The screen at a fixed width, with the padding trimmed off for comparison.
 *
 * `screen` pads every row to the screen's width — C03's T5.5 reads
 * `new Set(frame.map((r) => r.length)).size` as *the frame is whole*, so
 * trailing space is load-bearing there and invisible everywhere else. PS12
 * asserts the padding; every other row is about content and trims it.
 */
const WIDTH = 40;
const rowsOf = (bytes: string, rows: number): string[] =>
  screen(bytes, WIDTH, rows).map((r) => r.trimEnd());

describe("PS · the harness's screen", () => {
  it("PS1 (F149): a difference addressed by row lands on that row, not after the last one", () => {
    // The measured defect, at its smallest. One home, then two rows addressed
    // individually — which is C22 I55 §6b's ordinary frame. The old getter
    // sliced from the home, stripped the addresses and concatenated, so `alpha`
    // and `omega` arrived adjacent in one string and every row about a
    // position was answered by a blob.
    const bytes = `${HOME}first${at(1)}${SGR}alpha${at(4)}${SGR}omega`;
    const rows = rowsOf(bytes, 6);

    expect(rows).toEqual(["first", "alpha", "", "", "omega", ""]);
    expect(rows[4], "the address is the whole content of the assertion").toBe("omega");
  });

  it("PS2 (F149): a later write to a row replaces what was there", () => {
    // The property that makes an *absence* assertion honest. `output`
    // accumulates for ever, so `not.toContain` over the stream asserts that
    // something never appeared. A screen can say it is gone.
    const bytes = `${HOME}${"first-text".padEnd(20)}${at(0)}${SGR}${"second".padEnd(20)}`;
    const rows = rowsOf(bytes, 3);

    expect(rows[0]).toBe("second");
    expect(rows.join("\n")).not.toContain("first-text");
  });

  it("PS3 (F149): CUP is converted once", () => {
    // `cursorTo`'s own note, one layer down: *one place to be off by one, and it
    // is the place with the test*. Converting in the model as well would give a
    // screen that is entirely self-consistent and one row low — which is the
    // defect C22's T4.12 caught in the renderer, arriving in the instrument
    // that would have to find it next time.
    expect(rowsOf(`${ESC}[1;1Htop`, 3)[0]).toBe("top");
    expect(rowsOf(`${ESC}[3;1Hthird`, 3)[2]).toBe("third");
    // A default parameter is 1, not 0 — `CSI H` and `CSI 1;1H` are the same cell.
    expect(rowsOf(`${ESC}[Hhome`, 3)[0]).toBe("home");
  });

  it("PS4 (F149): a column is honoured", () => {
    // The row that a port of the old getter would have left green, because
    // nothing in it addresses a column. The strip removed column information
    // as surely as it removed row information.
    const rows = rowsOf(`${HOME}${ESC}[1;11Hright`, 2);
    expect(rows[0]).toBe("          right");
  });

  it("PS5 (F149): the whole-frame form still reads as rows", () => {
    // C22 I55's fallback — the first frame, a contaminated one, a resize —
    // joins rows with `\r\n`, and the PTY's ONLCR translates the `\n` again so
    // what arrives is `\r\r\n`. The old getter split on `/\r*\n/` for exactly
    // this reason; a model that treated `\r` as anything but a column reset
    // would leave a stray character on every row's edge.
    const rows = rowsOf(`${HOME}one\r\r\ntwo\r\r\nthree`, 4);
    expect(rows).toEqual(["one", "two", "three", ""]);
  });

  it("PS6 (F149): entering the alternate screen clears what was under it", () => {
    // The shell's first act. Without this the login shell's scrollback sits
    // beneath the application for the life of the session, and every row
    // asserting a screen is empty reads someone else's output.
    const rows = rowsOf(`shell prompt $ calcium\r\n${ESC}[?1049h${HOME}app`, 3);
    expect(rows).toEqual(["app", "", ""]);
  });

  it("PS7 (F149): styling moves no write head", () => {
    // SGR, DECSET and the synchronised-update window are presentation. They are
    // skipped rather than rendered — the failure mode being an SGR fragment
    // appearing as text exactly where content belongs, which is F79 in the
    // demo's replay parser and the reason this file exists at all.
    const rows = rowsOf(`${HOME}${ESC}[38;5;188mcolour${ESC}[39m${ESC}[?2026h${ESC}[?2026l`, 2);
    expect(rows[0]).toBe("colour");
  });

  it("PS8 (F149): a write past the last row is dropped rather than growing the screen", () => {
    // A screen has a height. Appending would make `frame.length` a count of
    // everything ever painted, which is the property the getter's own comment
    // says made four editor rows fail against `output`.
    const rows = rowsOf(`${at(0)}on${at(9)}past`, 3);
    expect(rows).toHaveLength(3);
    expect(rows.join("")).not.toContain("past");
  });

  it("PS10 (F149): a short write leaves the rest of the row standing", () => {
    // **Found by the mutation pass, not written from the design.** The model
    // began as `head + text`, which is a cell cursor indexed into a string: a
    // write truncated everything to its right, so clearing the screen and not
    // clearing it produced the same output and PS6's mutation survived a run
    // that PS6 was supposed to catch. A row is cells now, and this is what
    // makes PS6 mean anything.
    const rows = rowsOf(`${HOME}abcdefghij${at(0)}XY`, 2);
    expect(rows[0]).toBe("XYcdefghij");
  });

  it("PS11 (F149): a wide glyph occupies two cells and the column after it is right", () => {
    // The second consequence of the same conflation, and the one that stays
    // invisible until C17's CJK rows run at tier 5. `日本` is two characters and
    // four cells; a column addressed past it is off by one per glyph under any
    // model that counts characters.
    const rows = rowsOf(`${HOME}日本${ESC}[1;5Hafter`, 2);
    expect(rows[0]).toBe("日本after");

    // **A stated limit, asserted so it cannot drift silently.** Writing onto
    // the continuation half of a wide glyph takes that cell — and a real
    // terminal also blanks the orphaned lead half, which this does not. The
    // divergence is recorded rather than fixed because the shell never produces
    // it: `render-frame.ts` writes whole `exact()`-padded rows from column 0.
    // If a row ever starts asserting a partial write into a wide glyph, this is
    // the line that says the model is not the terminal there.
    expect(rowsOf(`${HOME}日本${ESC}[1;2Hx`, 2)[0]).toBe("日x本");
  });

  it("PS12 (F149): every row comes back padded to the screen's width", () => {
    // **The property this model lost and had to get back.** C03's T5.5 asserts
    // that a frame drawn after a suspend has exactly one row width — which is
    // how *the resume repainted everything rather than nothing* is observable
    // from outside the process. Trimming trailing space is invisible to a
    // reader and fatal to that row, and it is the kind of change a screen model
    // makes because the rows look tidier.
    const rows = screen(`${HOME}short${at(1)}${SGR}a bit longer`, WIDTH, 3);
    expect(new Set(rows.map((r) => r.length)).size, "one width").toBe(1);
    expect(rows[0]).toHaveLength(WIDTH);
  });

  it("PS13 (F149): a chunk ending inside an escape sequence holds it back", () => {
    // **The incremental path's own hazard, and it is the reason there is one.**
    // The frame is applied as it arrives rather than re-derived, because
    // re-deriving is quadratic in a poll loop — measured, a 2.1 MB session
    // parses in 127 ms and `waitForFrame` asks fifty times a second, which is
    // how a 3-second row became a 75-second timeout.
    //
    // What that buys has to be paid for here: a read can end anywhere. The walk
    // skips what it cannot match, so an address split across two chunks would
    // vanish and its tail would be painted as text at whatever position the
    // head was at — a plausible screen, wrong, with nothing to notice. Same
    // class as the multi-byte character the decoder already holds across reads:
    // a chunk boundary is not a delimiter.
    const split = atEscapeBoundary(`${HOME}row${ESC}[12`);
    expect(split.partial, "the address is still arriving").toBe(`${ESC}[12`);
    expect(split.ready).toBe(`${HOME}row`);

    // A complete sequence at the end is ready, and a bare trailing ESC is not.
    expect(atEscapeBoundary(`${HOME}row`).partial).toBe("");
    expect(atEscapeBoundary(`row${ESC}`).partial).toBe(ESC);

    // And the halves reassemble into the screen the whole stream would give —
    // which is the property the row is actually about.
    const whole = `${HOME}first${at(4)}${SGR}omega`;
    for (const cut of [3, 7, 12, 18]) {
      const a = atEscapeBoundary(whole.slice(0, cut));
      const b = atEscapeBoundary(a.partial + whole.slice(cut));
      expect(a.ready + b.ready, `cut at ${String(cut)}`).toBe(whole);
    }
  });

  it("PS9 (F149): overrun reports a row wider than the screen and is empty otherwise", () => {
    // The check that makes importing `cells()` from `src/` honest. The model
    // shares a measurer with the thing under test, so it cannot detect a width
    // defect by disagreeing — what it can do is report the observable
    // consequence, a row that would wrap. A wrapped line scrolls the alternate
    // screen, which is the one failure that corrupts state the application can
    // no longer see.
    expect(overrun(["ok", "fine"], 10)).toEqual([]);
    expect(overrun(["ok", "x".repeat(11)], 10)).toEqual(["1: 11"]);
    // Measured in cells, not in `.length` — the same rule as the rest of the
    // framework. Two wide glyphs are four cells and three characters is not.
    expect(overrun(["日本"], 3)).toEqual(["0: 4"]);
    expect(overrun(["abc"], 3)).toEqual([]);
  });
});
