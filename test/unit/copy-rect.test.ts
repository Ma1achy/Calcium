// C14 §6e — the rectangular selection: cells, clipped to the block it started in.
//
// Pure, because the two clauses that land are pure: the chord is parked (the
// registry names no rectangular action and no rectangular binding) and the mode
// label is parked on the seam §6a already parks. What is here is the half a
// chord cannot decide.
import { describe, expect, it } from "vitest";

import { cellTextOf, keyOf, rectBetween } from "../../src/shell/semantic-selection.js";
import type { BlockSpan, Cursor } from "../../src/shell/semantic-selection.js";

const SPANS: readonly BlockSpan[] = Object.freeze(
  [
    { key: keyOf("e1", "a"), from: 0, to: 2 },
    { key: keyOf("e1", "b"), from: 2, to: 5 },
    { key: keyOf("e2", "a"), from: 0, to: 4 },
  ].map((sp) => Object.freeze(sp)),
);
const ORDER = Object.freeze(["e1", "e2"]);

const at = (entryId: string, row: number, column: number): Cursor =>
  Object.freeze({ entryId, row, column });

describe("C14 §6e — the rectangle clips to the anchor's block", () => {
  it("T1.42 (C14 I42): the head clips to the block's edge and the rectangle survives the boundary", () => {
    // The anchor sits in `b`, rows 2..4. The head goes two rows past its last.
    const anchor = at("e1", 3, 1);
    const past = rectBetween(anchor, at("e1", 6, 4), SPANS, ORDER);

    // **A clip, and the row says so by asserting the rectangle exists.** A
    // containment test answers `null` for this head, so every assertion about
    // the returned rows would be vacuous without this line first.
    expect(past, "extending past the block's last row still gives a rectangle").not.toBeNull();
    expect(past?.key).toBe(keyOf("e1", "b"));
    expect([past?.fromRow, past?.toRow], "clamped to the block's own rows").toEqual([3, 4]);

    // Further out is the same rectangle — the clip is a fixed point, which is
    // what *stays there* means and what a refusal cannot produce.
    expect(rectBetween(anchor, at("e1", 40, 4), SPANS, ORDER)).toEqual(past);

    // And coming back inside gives the smaller one again, so the clip is not a
    // latch. The pair is the rule: a containment test gives `null`, `null`,
    // then this — and only the third agrees.
    const back = rectBetween(anchor, at("e1", 2, 4), SPANS, ORDER);
    expect([back?.fromRow, back?.toRow]).toEqual([2, 3]);

    // A head in a **later** entry has no row in this space; the direction comes
    // from the order and it clamps to the last row. An **earlier** entry clamps
    // to the first — and the anchor's block does not start at row 0, so *the
    // first row of the block* and *row 0* are different answers here.
    const later = rectBetween(anchor, at("e2", 0, 4), SPANS, ORDER);
    expect([later?.fromRow, later?.toRow]).toEqual([3, 4]);
    const earlier = rectBetween(at("e2", 2, 1), at("e1", 0, 4), SPANS, ORDER);
    expect([earlier?.key, earlier?.fromRow, earlier?.toRow]).toEqual([keyOf("e2", "a"), 0, 2]);

    // An order that resolves neither entry clamps to the anchor's own row.
    const unknown = rectBetween(anchor, at("e9", 0, 4), SPANS, []);
    expect([unknown?.fromRow, unknown?.toRow]).toEqual([3, 3]);

    // The one refusal: the anchor is in no block, so there is no region it
    // started in to clip to.
    expect(rectBetween(at("e1", 9, 0), at("e1", 9, 4), SPANS, ORDER)).toBeNull();

    // Columns are the pair, ordered, and travel freely — the boundary rule is
    // about blocks and a block has no columns.
    expect([past?.fromColumn, past?.toColumn]).toEqual([1, 4]);
    expect(rectBetween(at("e1", 3, 7), at("e1", 3, 2), SPANS, ORDER)?.fromColumn).toBe(2);
  });
});

describe("C14 §6e — a rectangular copy is cells with the ink off", () => {
  const RED = "[31m";
  const RESET = "[0m";
  // Rows 2..4 of `e1`, as the frame drew them — row 3 carries ink opened before
  // the window and closed after it, which is the case `sliceCells` exists for.
  const PAINTED = Object.freeze([
    "zero-row",
    "one--row",
    "abcdefgh",
    `${RED}ijklmnop${RESET}`,
    "qrstuvwx",
  ]);
  const PLAIN = Object.freeze(PAINTED.map((l) => l.replace(/\[[0-9;]*m/gu, "")));

  it("T1.43 (C14 I43): the text is the windowed cells, carries no escape, and never half a cluster", () => {
    const rect = rectBetween(at("e1", 2, 2), at("e1", 4, 4), SPANS, ORDER);
    const text = cellTextOf(rect, PAINTED);

    expect(text, "three rows, columns 2..4 of each").toBe("cde\nklm\nstu");
    expect(text, "a clipboard is text").not.toContain("");

    // **The vacuity control.** The painted row's window is taken over the line
    // the frame drew; an implementation that stripped first and measured after
    // would window the *content*, and the fixture must be able to tell them
    // apart. The escape is eight units long and the window is three cells in,
    // so the two disagree on every cell.
    expect(PAINTED[3], "the fixture's ink is inside the window's reach").not.toBe(PLAIN[3]);
    expect(text.split("\n")[1], "the cells, not the first bytes").toBe("klm");
    expect(PAINTED[3]?.slice(2, 5), "a substring of the painted line is not this").not.toBe("klm");

    // A double-width cluster straddling the right edge is blanked rather than
    // halved (C09 I9): half of it is a row one cell wide, and a copy is not the
    // place to invent one.
    const wide = Object.freeze(["", "", "a中b", "", ""]);
    const cut = rectBetween(at("e1", 2, 0), at("e1", 2, 1), SPANS, ORDER);
    expect(cellTextOf(cut, wide), "the straddling half is a blank").toBe("a ");

    // Rows the lines do not reach are empty rather than absent, so the shape of
    // the copy is the shape of the rectangle.
    expect(cellTextOf(rectBetween(at("e1", 2, 0), at("e1", 4, 2), SPANS, ORDER), [])).toBe("\n\n");
    expect(cellTextOf(null, PAINTED), "no rectangle is no text").toBe("");
  });
});
