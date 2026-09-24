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
const PAINTED: ChipLook = { separator: SEP, painted: true };
const BARE: ChipLook = { separator: SEP, painted: false };
const ASCII: ChipLook = { separator: "-", painted: true };
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

  it("T1.47 (C17 I25, §5c, I20): a chip wider than the row overflows, and its span still names its cells", () => {
    // **An editor never alters what the user typed**, and a chip is what the
    // user pasted (I20). A label wider than the whole row goes on one row and
    // overflows it rather than being dropped or cut.
    const long: Chip = { ordinal: 1, kind: "paste", name: "a-very-long-detected-kind-name", lines: 4096, content: "x" };
    const label = chipLabel(long, PAINTED);
    const width = 12;
    expect(cells(label) > width, "the fixture is wider than the row").toBe(true);

    const e = withChip(long, PAINTED);
    const rows = layout(e.text, width, GUTTER, e.drawAs);
    expect(rows.some((r) => r.includes(label)), "drawn whole, overflowing").toBe(true);

    const spans = chipSpans(e.text, width, GUTTER, e.drawAs);
    expect(spans.length, "and it still has a ground").toBe(1);
    // The span stops at the row's width — the same rule `selectionSpans` uses
    // for a row a region passes through. Beyond it there are no cells to paint.
    expect(spans[0]?.to, "the span stops at the row").toBe(width);
  });
});

describe("C17 §5d — which chip the caret is on", () => {
  it("T1.48 (C17 I27, §5d, §101): the chip before the caret, the one after it at the head, and null between them", () => {
    const one = { ordinal: 1, kind: "paste", name: "one", lines: 6, content: "ONE" } as const;
    const two = { ordinal: 2, kind: "paste", name: "two", lines: 9, content: "TWO" } as const;
    const e = createEditor({ chips: { separator: "\u00b7", painted: true } });
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
