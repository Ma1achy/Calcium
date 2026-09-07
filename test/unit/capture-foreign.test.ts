// `tools/capture-foreign.mjs`'s three pure functions — the fixture the whole
// family shares (F905).
//
// **Written because `make instruments` was red and nobody had run it.** The
// five `capture-foreign*` files landed inside a commit whose message is about
// `byEntry` and C28 I42, and the inventory — which compares by equality and
// exists to fail *on the day an instrument lands without a fixture* — reported
// `45 found, 40 with a fixture` from that commit onward, unread.
//
// **The three exports are where a wrong answer becomes invisible.** This tool
// captures a foreign program's raw PTY bytes and re-paints them, so its whole
// claim is *what you are looking at is what the program drew*. A boundary that
// splits an escape sequence, a strip that removes a byte the writer meant as
// ink, or a cursor translation that lands a row off all produce a picture that
// looks like a reading and is not one — the F241 failure, one layer out.
import { describe, expect, it } from "vitest";

import {
  atCsiBoundary,
  sanitizeForPainter,
  trackAndTranslateCursor,
} from "../../tools/capture-foreign.mjs";

const E = "\x1b";

describe("capture-foreign — the chunk boundary", () => {
  it("CF1: a buffer ending mid-sequence holds the partial back, and a complete one passes whole", () => {
    // The defect this prevents is a split *inside* a CSI: the ready half paints
    // an `ESC [ 3` as three characters of ink and the next chunk paints `1m` as
    // two more, so a colour change becomes five glyphs in the frame.
    expect(atCsiBoundary(`hello${E}[31`), "an incomplete CSI is held").toEqual({
      ready: "hello",
      partial: `${E}[31`,
    });
    expect(atCsiBoundary(`hello${E}[31m`), "a complete one is not").toEqual({
      ready: `hello${E}[31m`,
      partial: "",
    });
    // No escape at all is the common case and must not be held.
    expect(atCsiBoundary("plain text"), "no escape, nothing held").toEqual({
      ready: "plain text",
      partial: "",
    });
    // An OSC ends on BEL or ST, not on a final byte in `@-~` — a grammar that
    // only knew CSI would call this complete at the `]` and split the title.
    expect(atCsiBoundary(`${E}]0;title`), "an unterminated OSC is held").toEqual({
      ready: "",
      partial: `${E}]0;title`,
    });
    expect(atCsiBoundary(`${E}]0;title\x07`).partial, "a terminated OSC is not").toBe("");
  });

  it("CF2: the boundary is taken at the *last* escape, not the first", () => {
    // Two sequences in one chunk with the second incomplete. Splitting at the
    // first would hold a complete sequence back and re-emit it next chunk,
    // which paints the colour twice.
    expect(atCsiBoundary(`${E}[1ma${E}[3`), "only the trailing partial is held").toEqual({
      ready: `${E}[1ma`,
      partial: `${E}[3`,
    });
  });
});

describe("capture-foreign — the strip that counts what it removes", () => {
  it("CF3: a form the painter knows survives; one it does not is removed and counted by final byte", () => {
    const known = sanitizeForPainter(`${E}[31mred${E}[0m`);
    expect(known.clean, "SGR passes through unchanged").toBe(`${E}[31mred${E}[0m`);
    expect(known.stripped, "and nothing was removed").toEqual({});

    // `CSI ? 25 l` — hide cursor. The painter has no arm for it, so leaving it
    // in would paint `?25l` as ink. Removing it silently is the other failure.
    const unknown = sanitizeForPainter(`a${E}[?25lb`);
    expect(unknown.clean, "the form is gone").toBe("ab");
    expect(unknown.stripped, "and the report names its final byte").toEqual({ l: 1 });
  });

  it("CF4: a bare C0 byte is removed and counted under its hex name, and ESC is not one", () => {
    // SI/SO switch VT100's character set with no `ESC` at all, so the painter's
    // tokenizer reads them as ordinary text — harmless in a terminal, and fatal
    // to an SVG, whose XML forbids the byte outright.
    const si = sanitizeForPainter("a\x0eb\x0fc");
    expect(si.clean, "both are gone").toBe("abc");
    expect(si.stripped, "counted under their hex names").toEqual({ "\\x0e": 1, "\\x0f": 1 });

    // **The control that matters most**: `\x1b` is in the same numeric range and
    // must not be stripped. Stripping it leaves the payload behind as ink, which
    // is exactly the corruption the function exists to prevent — so a range
    // written as `\x0e-\x1f` is wrong the moment it includes `0x1b`.
    const withEsc = sanitizeForPainter(`a${E}[31mb`);
    expect(withEsc.clean, "ESC survives, and so does its sequence").toBe(`a${E}[31mb`);
    expect(withEsc.stripped, "and nothing is counted").toEqual({});
  });
});

describe("capture-foreign — the cursor the painter cannot follow", () => {
  it("CF5: relative moves become absolute ones, from a state the caller carries", () => {
    // `painter` reads `CUP` and not `CUD`/`CHA`, so a program that moves with
    // relative forms draws every row on top of the last. The translation is what
    // makes the re-paint a reading rather than a smear — and the state is the
    // caller's, because a chunk boundary falls anywhere.
    const state = { row: 0, col: 0 };
    const out = trackAndTranslateCursor(`${E}[5B${E}[10G`, state);

    expect(state, "row 5, column 9, zero-based").toEqual({ row: 5, col: 9 });
    expect(out, "emitted as absolute CUP, one-based").toContain(`${E}[6;10H`);
    expect(out, "and the relative form does not survive").not.toContain(`${E}[5B`);
  });

  it("CF6: an absolute move sets the state, and a second chunk moves from where the first left off", () => {
    // The fixture responds to the thing under test: the second call is given the
    // state the first left, which is the property a single-call row cannot see.
    const state = { row: 0, col: 0 };
    trackAndTranslateCursor(`${E}[3;7H`, state);
    expect(state, "CUP is one-based on the wire and zero-based here").toEqual({ row: 2, col: 6 });

    trackAndTranslateCursor(`${E}[2B`, state);
    expect(state, "and the next chunk moves from there").toEqual({ row: 4, col: 6 });
  });
});
