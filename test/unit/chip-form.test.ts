// C17 §5c — the chip's label and the cells it covers.
//
// **The label is C17's** (I25): the parts arrive and the form is composed here,
// so §099's spelling is not every application's to get right. **The ground comes
// off the same walk that measured the label** (I26, I18) — a span right about the
// row and wrong about the column paints the prompt's own text as a chip.
import { describe, expect, it } from "vitest";

import { chipLabel, chipSpans, createEditor, type Chip, type ChipLook } from "../../src/interaction/editor/index.js";
import { layout } from "../../src/interaction/editor/layout.js";
import { cells, sliceCells } from "../../src/presentation/text.js";

const SEP = "·";
const PAINTED: ChipLook = { separator: SEP, painted: true, unicode: "full" };
const BARE: ChipLook = { separator: SEP, painted: false, unicode: "full" };
const ASCII: ChipLook = { separator: "-", painted: true, unicode: "ascii" };
const GUTTER = { first: 0, cont: 0 } as const;

const PASTE: Chip = { ordinal: 1, kind: "paste", name: "json", lines: 47, content: "{}" };

/** An editor holding one chip, with the rung stated rather than defaulted. */
const withChip = (chip: Chip, look: ChipLook, before = "look at ", after = " then"): ReturnType<typeof createEditor> => {
  const e = createEditor({ chips: look });
  e.insert(before);
  e.insertChip(chip);
  e.insert(after);
  return e;
};

describe("C17 §5c — the chip", () => {
  it("T1.44 (C17 I25, §5c): the label is composed from the parts, and the bracket is the 1-bit rung", () => {
    // **Against literals, because this row is the form itself.** Everywhere
    // else the label is obtained from `chipLabel`; here it is written out, or
    // the row agrees with whatever the composer does.
    expect(chipLabel(PASTE, PAINTED), "painted: the ground's own space either side").toBe(` #1 json ${SEP} 47L `);
    expect(chipLabel(PASTE, BARE), "1-bit: the bracket says chip where nothing paints").toBe(`[#1 json ${SEP} 47L]`);

    // **An image has no lines**, and the absence must take the separator with
    // it — a bare `L` or a trailing separator is the shape this invites.
    //
    // **And it keeps its number** (C17 I25, §101). An image was the arm a first
    // ruling dropped by inference — *a filename identifies itself whatever it
    // holds* — and §101's `#2 loss-curve.png` is the only image chip label the
    // design draws. The rule is `file` alone, not *a name that identifies*.
    const image: Chip = { ordinal: 2, kind: "image", name: "loss-curve.png", content: "…" };
    expect(chipLabel(image, PAINTED), "no size, no separator — and the number stays").toBe(
      " #2 loss-curve.png ",
    );
    expect(chipLabel(image, BARE)).toBe("[#2 loss-curve.png]");

    // **A file drops it**, which is §011's own figure. §099 draws the contrast
    // in one row — `look at  parse.ts  and  #1 json · 47L  then` — and a paste's
    // name is its *detected kind*, so `json` twice is one word twice and the
    // number is all that separates them.
    const file: Chip = { ordinal: 3, kind: "file", name: "parse.ts", lines: 184, content: "…" };
    expect(chipLabel(file, BARE), "§011's label exactly").toBe(`[parse.ts ${SEP} 184L]`);

    // **The control is the paste beside it**, which is §099's other half: without
    // it, *a file drops the number* is satisfied by a composer that never draws
    // one at all.
    expect(chipLabel(PASTE, BARE), "a paste is told apart by its number alone").toBe(
      `[#1 json ${SEP} 47L]`,
    );

    // **The separator is the glyph table's**, so the ASCII tier is taken from
    // the same place every other separator in the frame is. Asserted by
    // substituting one rather than by naming `-`, because the point is that the
    // composer uses what it is handed and holds no copy.
    expect(chipLabel(PASTE, ASCII), "the tier's separator, whatever it is").toBe(" #1 json - 47L ");
  });

  it("T1.45 (C17 I26, §5c, §099): a chip moves whole, and no row holds a prefix of its label", () => {
    // **A watch on a property that already held**, which is why it is written
    // over the whole label rather than at one width: *a half-painted chip is
    // not a chip with a line break in it — it is two things that look like
    // chips*, and a row checking the first cell cannot tell them apart.
    const label = chipLabel(PASTE, PAINTED);
    const width = cells("look at ") + cells(label) - 2; // one short of fitting
    const rows = layout(withChip(PASTE, PAINTED).text, width, GUTTER, withChip(PASTE, PAINTED).drawAs);

    expect(rows.filter((r) => r.includes(label)).length, "drawn whole, exactly once").toBe(1);
    for (const row of rows) {
      // Every row either holds the whole label or none of it. A prefix of two
      // or more cells is the defect; one cell is a coincidence of the alphabet.
      for (let n = 2; n < cells(label); n += 1) {
        const head = sliceCells(label, 0, n);
        if (row.includes(head) && !row.includes(label)) {
          expect.fail(`a row holds ${JSON.stringify(head)} without the whole label: ${JSON.stringify(row)}`);
        }
      }
    }

    // The fixture responds to the thing under test: wide enough, it is one row.
    expect(layout(withChip(PASTE, PAINTED).text, 200, GUTTER, withChip(PASTE, PAINTED).drawAs).length).toBe(1);
  });

  it("T1.46 (C17 I26, §5c): `chipSpans` slices exactly the label out of the row `layout` returns", () => {
    const label = chipLabel(PASTE, PAINTED);
    // **Across a wrap, not at one width**, because a span that is right on a
    // first row and off by the gutter on a later one is the defect this seam
    // exists to prevent, and one width cannot see it.
    for (const width of [200, 60, cells("look at ") + cells(label) + 1, cells(label) + 4]) {
      const e = withChip(PASTE, PAINTED);
      const rows = layout(e.text, width, GUTTER, e.drawAs);
      const spans = chipSpans(e.text, width, GUTTER, e.drawAs);
      expect(spans.length, `one chip, one span at ${String(width)}`).toBe(1);
      const span = spans[0];
      if (span === undefined) continue;
      const row = rows[span.row] ?? "";
      expect(sliceCells(row, span.from, span.to), `the span is the label at ${String(width)}`).toBe(label);
    }

    // **A prompt with no chip has no spans**, which is the control: a function
    // returning every cell would satisfy every row above at width 200.
    const plain = createEditor({ chips: PAINTED });
    plain.insert("look at parse.ts then");
    expect(chipSpans(plain.text, 60, GUTTER, plain.drawAs), "no chip, no ground").toEqual([]);

    // And two chips are two spans, so the walk is not answering about the first
    // one it finds.
    const two = withChip(PASTE, PAINTED, "a ", " b ");
    two.insertChip({ kind: "file", name: "notes.md", lines: 12, content: "x" });
    expect(chipSpans(two.text, 200, GUTTER, two.drawAs).length, "two chips, two spans").toBe(2);
  });

  it("T1.47 (C17 I32, I25, §5e): a chip wider than the row is drawn at exactly the row, and its span names exactly its cells", () => {
    // **Amended — this row asserted the overflow** (I26's old last sentence).
    // *A chip is what the user pasted* is true of the content and not of the
    // label, which is C17's composition (I25); so the content is untouched and
    // the label is cut to the row it got (I32, §5e).
    const long: Chip = { ordinal: 1, kind: "paste", name: "a-very-long-detected-kind-name", lines: 4096, content: "x" };
    const label = chipLabel(long, PAINTED);
    const width = 12;
    expect(cells(label) > width, "the fixture is wider than the row").toBe(true);

    const e = withChip(long, PAINTED);
    const rows = layout(e.text, width, GUTTER, e.drawAs);
    expect(rows.every((r) => cells(r) <= width), `no row passes the width: ${JSON.stringify(rows)}`).toBe(true);
    expect(rows.some((r) => r.includes(label)), "the whole label is drawn nowhere").toBe(false);

    const spans = chipSpans(e.text, width, GUTTER, e.drawAs);
    expect(spans.length, "and it still has a ground").toBe(1);
    const span = spans[0];
    expect(span, "one span").toBeDefined();
    if (span === undefined) return;
    expect([span.from, span.to], "the ground is the whole row, and no more").toEqual([0, width]);
    expect(sliceCells(rows[span.row] ?? "", span.from, span.to), "the span is the drawn label").toBe(rows[span.row]);
    // **The content is not the label**: what leaves the prompt is all of it.
    expect(e.resolved, "submission is untouched").toBe("look at x then");
  });
});

describe("C17 §5e — a chip wider than its row", () => {
  const LONG: Chip = { ordinal: 1, kind: "paste", name: "a-very-long-detected-kind-name", lines: 4096, content: "x" };

  it("T1.54 (C17 I32, §5e, C09 I103): the label is cut in the middle to exactly the row, frame kept, at both rungs", () => {
    // **Against literals**, because the row is the form. The head keeps the
    // ordinal and the tail keeps the size — an end cut keeps `#1 a-very-long-`
    // and loses `4096L`, which is the half that says how much was pasted.
    const width = 20;
    const drawn = { painted: ` #1 a-…name ${SEP} 4096L `, bare: `[#1 a-…name ${SEP} 4096L]` } as const;
    for (const [rung, look] of [["painted", PAINTED], ["bare", BARE]] as const) {
      const e = withChip(LONG, look);
      const rows = layout(e.text, width, GUTTER, e.drawAs);
      expect(rows, `${rung}: moved to a row of its own, cut there, and the text after it on the next`).toEqual([
        "look at ",
        drawn[rung],
        " then",
      ]);
      expect(cells(drawn[rung]), "exactly the row").toBe(width);

      const spans = chipSpans(e.text, width, GUTTER, e.drawAs);
      expect(spans, `${rung}: the ground is the drawn label's cells`).toEqual([{ row: 1, from: 0, to: width }]);
      // `insertChip` leaves the caret after the chip, and `withChip` typed
      // ` then` after that — so the position after the chip is index 9.
      e.move("bufferStart");
      for (let i = 0; i < 9; i += 1) e.move("charRight");
      expect(e.cursorCell(width, GUTTER), `${rung}: after the chip, the next row's first cell`).toEqual({ row: 2, col: 0 });
    }

    // **The control: a label that fits is drawn whole**, so the cut is the
    // walk's answer to a row it does not fit and not a shorter label.
    const fits = withChip(PASTE, PAINTED);
    expect(layout(fits.text, 80, GUTTER, fits.drawAs), "a label that fits").toEqual([`look at ${chipLabel(PASTE, PAINTED)} then`]);
  });

  it("T1.55 (C17 I32, §5e): the row the chip lands on decides its width, and a partly used row is left before the cut", () => {
    // **A gutter whose two figures differ**, which is the only input where
    // the limit read before `open()` and the one read after it disagree: row 0
    // has 20 usable cells and every continuation row 14.
    const gutter = { first: 0, cont: 6 } as const;
    const e = withChip(LONG, PAINTED);
    const rows = layout(e.text, 20, gutter, e.drawAs);
    expect(rows[0], "row 0 keeps the text, and no piece of the chip").toBe("look at ");
    expect(rows[1], "cut to row 1's fourteen cells, not row 0's twenty").toBe(` #1 … ${SEP} 4096L `);
    expect(cells(rows[1] ?? ""), "exactly the continuation row").toBe(14);
    expect(chipSpans(e.text, 20, gutter, e.drawAs), "and the ground starts at the gutter").toEqual([
      { row: 1, from: 6, to: 20 },
    ]);
  });

  it("T1.56 (C17 I32, §5e): the narrow end — the marker alone, then the frame around it, and the marker is the tier's", () => {
    const only = (look: ChipLook): ReturnType<typeof createEditor> => {
      const e = createEditor({ chips: look });
      e.insertChip(LONG);
      return e;
    };
    const first = (look: ChipLook, width: number): string => {
      const e = only(look);
      return layout(e.text, width, GUTTER, e.drawAs)[0] ?? "";
    };
    // One cell: no frame fits beside the marker, at either rung.
    expect(first(PAINTED, 1)).toBe("…");
    expect(first(BARE, 1)).toBe("…");
    // Two: still no frame, and the cell the marker did not take is padding,
    // so the chip spends exactly the two cells it was given.
    expect(first(PAINTED, 2)).toBe("… ");
    expect(first(BARE, 2)).toBe("… ");
    // Three: the frame and the marker, and no text.
    expect(first(PAINTED, 3)).toBe(" … ");
    expect(first(BARE, 3)).toBe("[…]");

    // **The ASCII tier's marker is `~`**, taken through `ChipLook.unicode`: a
    // `…` here is the glyph the ASCII rung exists to avoid, and at the wide
    // rung (which is the same set) it is two cells the walk measures as one.
    expect(first(ASCII, 1), "the tier's marker").toBe("~");
    expect(first(ASCII, 3)).toBe(" ~ ");
    expect(first(ASCII, 12), "head and tail either side of it").toBe(" #1 ~ 4096L ");
  });
});

describe("C17 §5d — which chip the caret is on", () => {
  it("T1.48 (C17 I27, §5d, §101): the chip before the caret, the one after it at the head, and null between them", () => {
    const one = { ordinal: 1, kind: "paste", name: "one", lines: 6, content: "ONE" } as const;
    const two = { ordinal: 2, kind: "paste", name: "two", lines: 9, content: "TWO" } as const;
    const e = createEditor({ chips: { separator: "\u00b7", painted: true, unicode: "full" } });
    e.insertChip(one);
    e.insert("xy");
    e.insertChip(two);

    // **Read back as `content`, not as a label.** The label is composed from
    // the parts and two chips could share one; the content is what the preview
    // shows, and asserting it is what says the answer came off the editor's own
    // map rather than off a lookup that happened to agree.
    const contentAt = (cursor: number): string | null => {
      e.move("bufferStart");
      for (let i = 0; i < cursor; i += 1) e.move("charRight");
      return e.chipAt()?.content ?? null;
    };

    // Positions: 0 | chip1 | 1 x | 2 y | 3 chip2 | 4.
    expect(contentAt(4), "past the second chip, it is the second").toBe("TWO");
    expect(contentAt(1), "past the first, it is the first").toBe("ONE");
    // **The forward arm**, which exists because position 0 has nothing before
    // it — a reader that only looked backwards would answer nothing for the one
    // position `home` lands on.
    expect(contentAt(0), "at the head, the chip after it").toBe("ONE");
    // **The control.** Without it, *the caret is on a chip* is satisfied by a
    // reader answering the last chip minted wherever the caret is.
    expect(contentAt(2), "between the two characters, neither").toBe(null);
    // **The forward arm again, and it is not only position 0's.** Immediately
    // before the second chip the character behind the caret is `y`, so there is
    // no chip before and the one after answers — which is what makes the rule
    // *before, else after* rather than *before at the head and otherwise*. The
    // first draft asserted `null` here on the assumption that the character
    // behind wins, and the invariant says the opposite.
    expect(contentAt(3), "before the second chip, the one after answers").toBe("TWO");
  });
});
