// C09 tier 1 and 3 — cells(), truncate(), wrapCells().
//
// The single width implementation (I6). Every kind's measurer resolves width
// through these three functions, so a defect here is a defect in eighteen
// measurers at once — which is the argument for them being one implementation
// and the reason this file tests it apart from any block.
import { describe, expect, it } from "vitest";
import {
  cells,
  displayCells,
  expandTabs,
  hardWrapCells,
  sliceCells,
  stripControl,
  truncate,
  wrapCells,
} from "../../src/presentation/text.js";
import { SGR_RESET } from "../../src/terminal/escapes.js";

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

  it("T1.14 (I18): control characters are stripped before measuring", () => {
    // A tool's output cannot inject styling into the frame. The measured width
    // is the width of what is drawn, which is the text without the sequence.
    const injected = `red${String.fromCharCode(27)}[31mtext`;

    expect(stripControl(injected)).toBe("red[31mtext");
    expect(cells(injected)).toBe(cells("red[31mtext"));
    expect(cells(`a${String.fromCharCode(7)}b`), "BEL is not a cell").toBe(2);
  });

  it("T1.15: an empty string is zero cells — the floor is a block rule, not a width rule", () => {
    // I14 floors a *block* at one row. `cells("")` is honestly 0, and a
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

  it("T3.9d (I19): a cluster wider than the line is substituted, never dropped", () => {
    // It was dropped, silently, for the whole life of both wrappers — and both
    // `measure` and `render` call this, so they agreed and I1 held. The frame
    // was arithmetically consistent and describing content it did not hold.
    expect(wrapCells("日本語", 1)).toEqual(["?", "?", "?"]);
    expect(wrapCells("a日b", 1)).toEqual(["a", "?", "b"]);
    expect(hardWrapCells("日本語", 1)).toEqual(["?", "?", "?"]);
  });

  it("T3.9e (I19): the substitution keeps the row count equal to the glyph count", () => {
    // The property the drop broke: three glyphs are three rows at width 1,
    // whatever they are. A measurer counting rows and a renderer emitting them
    // both go through here, so this is the whole of I1 at this width.
    for (const text of ["abc", "日本語", "a日c", "🎉🎉🎉"]) {
      expect(wrapCells(text, 1), text).toHaveLength(3);
      expect(hardWrapCells(text, 1), text).toHaveLength(3);
    }
  });
});

describe("sliceCells (C09 §5a, I20)", () => {
  // The operation the compositor's ruling named, specified before the ruling
  // was written down. `fitStyled` takes cells `[0, w)`; this takes `[from, to)`,
  // and the frame cannot draw a layer over a painted row without both.
  const RED = "\u001b[31m";
  const BLUE = "\u001b[34m";

  it("T1.16 (I20): a window over a styled line measures its cells and carries the prefix's style", () => {
    const line = `${RED}abcdef${SGR_RESET}`;
    const window = sliceCells(line, 2, 5);

    expect(displayCells(window)).toBe(3);
    expect(window).toContain("cde");

    // **The carry is the half a substring cannot do.** `RED` opened before cell
    // 2 and is still in effect there; a tail that dropped it draws in the
    // terminal's default colour, which reads as the layer above having bled
    // rather than as the base having lost its style.
    expect(window.startsWith(RED), "the style in effect at `from`").toBe(true);

    // And no cut lands inside an escape — the failure that survives the frame,
    // because the SGR is never terminated and the colour bleeds down every row
    // below. Every escape in the output is a whole one.
    for (const esc of window.matchAll(/\u001b\[[0-9;]*m/g)) expect(esc[0]).toMatch(/m$/);
    expect(window.replaceAll(/\u001b\[[0-9;]*m/g, "")).toBe("cde");
  });

  it("T1.16 (I20): a reset in the skipped prefix clears the carry", () => {
    // What the terminal would actually be showing at `from`, rather than every
    // escape ever seen. Accumulating blindly puts a dead colour on the tail.
    const line = `${RED}ab${SGR_RESET}cdef`;

    expect(sliceCells(line, 3, 5).startsWith(RED)).toBe(false);
    expect(sliceCells(line, 3, 5).replaceAll(/\u001b\[[0-9;]*m/g, "")).toBe("de");
  });

  it("T1.16b (I20): a double-width cluster straddling either boundary is blanked, not halved", () => {
    // Both directions, because they are different code paths and only the right
    // one resembles `truncate`. Half a double-width glyph is a row one cell
    // wide, and a row wider than it was measured wraps into a row nobody
    // counted.
    const line = "a日b";

    expect(sliceCells(line, 2, 4), "straddling the left edge").toBe(" b");
    expect(sliceCells(line, 0, 2), "straddling the right edge").toBe("a ");
    expect(sliceCells(line, 0, 3), "and the glyph is kept when it fits").toBe("a日");
  });

  it("T1.16c (I20): the composition law, at every split point", () => {
    // A property over the splits rather than three chosen ones: the `a` that
    // breaks it is whichever lands inside a cluster, and no chosen `a` is that
    // one by construction.
    for (const line of ["abcdef", `${RED}ab${BLUE}cd${SGR_RESET}ef`, "a日本b", "x👨‍👩‍👧‍👦y"]) {
      const whole = displayCells(line);
      for (let a = 0; a <= whole; a += 1) {
        const left = displayCells(sliceCells(line, 0, a));
        const right = displayCells(sliceCells(line, a, whole));
        expect(left + right, `${line} split at ${String(a)}`).toBe(whole);
      }
    }
  });

  it("T1.16c (I20): a window past the end of the line stops there and pads nothing", () => {
    // The caller knows whether a short tail should be filled, and `paint` does.
    // A pad here would double with the one `exact` applies and put the frame a
    // cell wide.
    expect(sliceCells("abc", 1, 99)).toBe("bc");
    expect(sliceCells("abc", 5, 9)).toBe("");
    expect(sliceCells("abc", 2, 2)).toBe("");
  });
});

describe("C09 §5 — the printable-ASCII path", () => {
  // **The path is an equality, so it is tested as one.** A fast path that is
  // *nearly* right is worse than none: it puts the frame one cell into a row
  // nobody counted, and only for some strings.
  //
  // **The reference is a table of measured values, not a reconstruction of the
  // walk.** The first version rebuilt the walk with `Intl.Segmenter` and summed
  // `cells(segment)` — which calls the function under test, so a mutation that
  // widened the fast path changed both sides and survived. A fake must not
  // supply the behaviour it is standing in for.
  const EXPECTED: readonly (readonly [string, number])[] = [
    ["", 0],
    [" ", 1],
    ["plain ascii", 11],
    ["0123456789", 10],
    ["a".repeat(200), 200],
    [String.fromCharCode(0x20), 1],
    [String.fromCharCode(0x7e), 1],
    // Below and above the range: DEL and C1 are stripped, so they cost nothing.
    [String.fromCharCode(0x1f), 0],
    [String.fromCharCode(0x7f), 0],
    // Tab and newline survive `stripControl` and are excluded from the fast
    // path anyway — see T1.26.
    ["a\tb", 3],
    ["a\nb", 3],
    // The walk's own subjects.
    ["café", 4],
    ["日本語", 6],
    ["e\u0301", 1],
    ["a\u200bb", 2],
    ["🇬🇧", 2],
  ];

  it("T1.24 (I6): every string measures what it measured before the fast path", () => {
    for (const [text, width] of EXPECTED) {
      expect(cells(text), JSON.stringify(text)).toBe(width);
    }
  });

  it("T1.25 (I6): the corpus reaches both paths", () => {
    // **The subject before the claim.** A corpus of only ASCII would pass the
    // row above against a fast path wrong for everything else.
    const ascii = EXPECTED.filter(([t]) => /^[\x20-\x7e]*$/.test(t));
    expect(ascii.length, "strings on the fast path").toBeGreaterThan(4);
    expect(EXPECTED.length - ascii.length, "and strings on the walk").toBeGreaterThan(4);
  });

  it("T1.26 (I6): tab and newline are excluded, and the exclusion is conservative", () => {
    // **Recorded because a mutation said so.** Widening the range to admit tab
    // and newline changes no measurement: `stripControl` keeps them and
    // `clusterCells` already answers 1 for each, so both paths agree. The
    // exclusion is therefore not fixing a defect — it keeps the fast path's
    // equality argument true *by construction* rather than by a coincidence in
    // a function two hundred lines away. A mutation that fails nothing is a
    // finding, and this is the finding: it is behaviour-preserving today and
    // the guard is what keeps it so.
    expect(cells("\t"), "one cell, by clusterCells").toBe(1);
    expect(cells("\n"), "and so is a newline").toBe(1);
  });
});
