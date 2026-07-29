// C09 tier 1 and 3 — cells(), truncate(), wrapCells().
//
// The single width implementation (I6). Every kind's measurer resolves width
// through these three functions, so a defect here is a defect in seventeen
// measurers at once — which is the argument for them being one implementation
// and the reason this file tests it apart from any block.
import { describe, expect, it } from "vitest";
import {
  cells,
  expandTabs,
  stripControl,
  truncate,
  wrapCells,
} from "../../src/presentation/text.js";

const FULL = { unicode: "full" } as const;
const ASCII = { unicode: "ascii" } as const;

describe("cells (C09 §5)", () => {
  it("T1.13: the five ways naïve length is wrong", () => {
    // Each row is a case that appears in real output, and each is a different
    // wrong answer from `.length` (C09 §5).
    expect(cells("abc"), "ASCII").toBe(3);
    expect(cells("日本語"), "CJK — two per glyph").toBe(6);
    expect(cells("ｆｕｌｌ"), "fullwidth forms").toBe(8);
    expect(cells("é"), "combining mark folds into the base").toBe(1);
    expect(cells("👨‍👩‍👧‍👦"), "ZWJ cluster is one glyph, not four").toBe(2);
    expect(cells("👍🏽"), "skin-tone modifier is part of the cluster").toBe(2);
    expect(cells("⚠️"), "emoji presentation selector promotes to two").toBe(2);
    expect(cells("⚠"), "the same base without it stays one").toBe(1);
    expect(cells("🇬🇧"), "a regional-indicator pair is one flag").toBe(2);
  });

  it("T1.14 (I14): control characters are stripped before measuring", () => {
    // A tool's output cannot inject styling into the frame. The measured width
    // is the width of what is drawn, which is the text without the sequence.
    const injected = `red${String.fromCharCode(27)}[31mtext`;

    expect(stripControl(injected)).toBe("red[31mtext");
    expect(cells(injected)).toBe(cells("red[31mtext"));
    expect(cells(`a${String.fromCharCode(7)}b`), "BEL is not a cell").toBe(2);
  });

  it("T1.15: an empty string is zero cells — the floor is a block rule, not a width rule", () => {
    // I17 floors a *block* at one row. `cells("")` is honestly 0, and a
    // measurer that fixed it here would hide the case the floor exists for.
    expect(cells("")).toBe(0);
  });

  it("T3.16: tabs expand to a fixed stop before measurement", () => {
    expect(expandTabs("a\tb")).toBe("a       b");
    expect(cells(expandTabs("a\tb")), "one tab, advanced to column 8").toBe(9);
    expect(expandTabs("\t")).toBe(" ".repeat(8));
    expect(expandTabs("ab\tc\td")).toBe("ab      c       d");
    expect(expandTabs("a\tb\nc\td"), "the stop restarts at each newline").toBe(
      "a       b\nc       d",
    );
  });
});

describe("truncate (I5, I9)", () => {
  it("T3.4 (I5, the classic): the ASCII marker is one cell, like the Unicode one", () => {
    // `…` is one column and `...` is three. A three-cell marker shifts every
    // log line's cut point, silently, for non-UTF-8 locales only.
    const line = "listening on port 8080 and waiting";

    expect(truncate(line, 12, FULL)).toBe("listening o…");
    expect(truncate(line, 12, ASCII)).toBe("listening o~");
    expect(cells(truncate(line, 12, FULL))).toBe(12);
    expect(cells(truncate(line, 12, ASCII))).toBe(12);
  });

  it("T3.5 (I9): a ZWJ sequence is dropped whole, never split", () => {
    const text = "ab👨‍👩‍👧‍👦cd";
    const cut = truncate(text, 4, FULL);

    expect(cut, "the family would need cells 3 and 4; the marker takes one").toBe("ab …");
    expect(cut.includes("‍"), "no joiner survives a cut").toBe(false);
    expect(cells(cut)).toBe(4);
  });

  it("T3.6 (I9): a double-width glyph straddling the boundary is dropped, and its cell blanked", () => {
    // Half a CJK glyph is not a cell the terminal can draw. Dropping it leaves
    // a hole, and the hole must still be a cell wide or the row is short.
    const cut = truncate("日本語です", 4, FULL);

    expect(cut).toBe("日 …");
    expect(cells(cut), "exactly the width asked for, not one less").toBe(4);
  });

  it("T3.7 (I9): a combining mark does not orphan onto the next base", () => {
    // `e` + U+0301 built explicitly: a decomposed \u00e9 is the case, and a
    // precomposed one would test nothing. The mark travels with the base it
    // sits on, or is dropped with it \u2014 never left behind to land on
    // whatever follows the cut.
    const acute = "\u0301";
    const cut = truncate(`ab e${acute}fg`.replace(" ", ""), 4, FULL);
    const clusters = [
      ...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(cut),
    ].map((seg) => seg.segment);

    expect(cells(cut)).toBe(4);
    expect(clusters, "three clusters then the marker, and no bare mark").toEqual([
      "a",
      "b",
      `e${acute}`,
      "\u2026",
    ]);
  });

  it("T3.8b: degenerate widths return something drawable", () => {
    expect(truncate("hello", 1, FULL), "no room for content, only the marker").toBe("…");
    expect(truncate("hello", 0, FULL), "nothing fits, and nothing throws").toBe("");
    expect(truncate("hi", 40, FULL), "shorter than the width is returned whole").toBe("hi");
  });
});

describe("wrapCells (§3)", () => {
  it("T3.10: text of exactly w, w-1 and w+1 cells wraps to 1, 1 and 2 rows", () => {
    expect(wrapCells("x".repeat(9), 10)).toHaveLength(1);
    expect(wrapCells("x".repeat(10), 10)).toHaveLength(1);
    expect(wrapCells("x".repeat(11), 10)).toHaveLength(2);
  });

  it("T3.10b: no wrapped row exceeds the width it was wrapped at", () => {
    // The row nobody counted: a line one cell over is a line the terminal wraps
    // itself, adding a row to the frame that no measurer knows about.
    const prose =
      "the resolver is not a walk and the assignment had to be solved rather than walked";

    for (const width of [7, 12, 20, 40]) {
      for (const line of wrapCells(prose, width)) {
        expect(cells(line), `"${line}" at width ${width}`).toBeLessThanOrEqual(width);
      }
    }
  });

  it("T3.10c: an unbroken token breaks mid-word rather than overflowing", () => {
    const rows = wrapCells("x".repeat(25), 10);

    expect(rows).toHaveLength(3);
    for (const row of rows) expect(cells(row)).toBeLessThanOrEqual(10);
  });

  it("T3.10d: CJK wraps on cells, not on characters", () => {
    const rows = wrapCells("日本語です", 4);

    expect(rows, "two glyphs per row at four cells").toEqual(["日本", "語で", "す"]);
  });

  it("T3.9b: an empty string is one row, and a newline is a row of its own", () => {
    expect(wrapCells("", 40)).toEqual([""]);
    expect(wrapCells("a\n\nb", 40)).toEqual(["a", "", "b"]);
  });

  it("T3.9c: width 0 is treated as 1; no division by zero, no infinite loop", () => {
    const rows = wrapCells("abc", 0);

    expect(rows).toEqual(["a", "b", "c"]);
  });
});
