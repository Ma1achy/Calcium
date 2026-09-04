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
  wrapCellsParts,
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

  it("T3.10b2 (C04 I86, §5): no row could have taken the first word of the next row", () => {
    // The general property F591 is one instance of, swept rather than pinned:
    // a row breaking one word early is invisible to a per-row width assertion,
    // because a short row fits. Measured before the arm: 161 violating joins
    // over 102 of these 560 (string, width) pairs — the wrapper broke early at
    // every width where a row filled exactly and a space followed. After: 0.
    const corpus = [
      "aa bb cc dd",
      "abcdef gh",
      "abc   def",
      "ab  cd",
      "the quick brown fox jumps over the lazy dog",
      "a bb ccc dddd eeeee ffffff",
      "one two three four five six seven eight nine ten",
      "Calcium is a framework for building terminal user interfaces over JSON emitting CLIs",
      "x y z aa bbb cccc ddddd",
      "日本 語です テスト します",
      "an unbrokenwordthatisverylong indeed here",
      "i i i i i i i i i i i i i i i i i i i i",
      "tip: run make enforce before opening an MR, it is five seconds",
      "no such container: calcium-dev-probe-0001 (try docker ps -a)",
    ];

    const early: string[] = [];
    for (const text of corpus) {
      const ascii = !/[^ -~]/u.test(text);
      for (let width = 1; width <= 40; width += 1) {
        const rows = wrapCellsParts(text, width);
        // The two guards the arm must not move, over the same 560 pairs: no
        // row overflows, and every row is an exact slice from its `start`
        // (C04 I86) — asserted on the ASCII members, since a cluster too wide
        // for the row is substituted and a substituted row is not a slice.
        for (const row of rows) {
          expect(cells(row.text), `"${row.text}" at ${width}`).toBeLessThanOrEqual(width);
          if (ascii) expect(text.slice(row.start, row.start + row.text.length)).toBe(row.text); // cells-ok — a code-unit slice
        }
        for (let i = 0; i + 1 < rows.length; i += 1) {
          const row = rows[i]!;
          const next = rows[i + 1]!;
          // Only where the join is legitimate: the two rows are separated by
          // exactly one source space, the next row does not open with content
          // whitespace, and its first word is whole rather than the head of a
          // token the wrapper had to cut mid-cluster.
          if (text.slice(row.start + row.text.length, next.start) !== " ") continue; // cells-ok — a code-unit slice
          const word = next.text.split(" ")[0]!;
          if (word === "" || next.text.startsWith(" ")) continue;
          const after = next.start + word.length; // cells-ok — a code-unit cursor
          if (after < text.length && text[after] !== " ") continue; // cells-ok — a code-unit index
          if (cells(`${row.text} ${word}`) <= width) early.push(`w=${width} "${row.text}" + "${word}" of "${text}"`);
        }
      }
    }

    expect(early).toEqual([]);
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

/**
 * C09 T1.27 — the Ambiguous set is `East_Asian_Width=Ambiguous`, not a memory
 * of it (C09 §5, C09 I6, C02 I9).
 *
 * The table this pins replaced one that began at U+2010 and called the omission
 * deliberate: *the rest of the property is letters no terminal draws wide.* That
 * is a claim about fonts and the capability is a claim about a **convention**,
 * so 138,132 code points measured one cell where the property says two — and a
 * row measured at n cells that draws n+1 wraps, which scrolls the alternate
 * screen (F665).
 *
 * **The sets below are the property's, transcribed from
 * `EastAsianWidth-17.0.0.txt` (2025-07-24) and not chosen.** Latin-1 because it
 * is where the gap started and because `§` `·` `×` live there; both halves,
 * because a row asserting only the Ambiguous half passes just as well on a
 * table that says *everything* is Ambiguous.
 */
describe("cells — the Ambiguous set against its source (C09 §5)", () => {
  /** U+00A0..U+00FF with `; A` in the property — 44 of the 96. */
  const LATIN1_AMBIGUOUS = "¡¤§¨ª\u00ad®°±²³´¶·¸¹º¼½¾¿ÆÐ×ØÞßàáæèéêìíðòó÷øùúüþ";
  /** The other 52, every one Neutral. `µ` and `«` `»` are here, not above. */
  const LATIN1_NEUTRAL = "\u00a0¢£¥¦©«¬¯µ»ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝâãäåçëîïñôõöûýÿ";

  it("T1.27 (I6, C02 I9): every Latin-1 Ambiguous character is two cells at wide and one at narrow", () => {
    // **The fabricated violation.** Restoring the old table — any table whose
    // lowest range starts at U+2010 — makes every row here report 1 at wide.
    expect([...LATIN1_AMBIGUOUS].length, "the property's Latin-1 Ambiguous count").toBe(44);
    for (const c of LATIN1_AMBIGUOUS) {
      const cp = `U+${(c.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`;
      expect(cells(c, "wide"), `${cp} at ambiguousWidth "wide"`).toBe(2);
      expect(cells(c, "narrow"), `${cp} at ambiguousWidth "narrow"`).toBe(1);
    }
  });

  it("T1.27b (I6): the control — every Latin-1 Neutral character is one cell under both conventions", () => {
    // **The control the row above owes.** It passed before the fix and passes
    // after, so it is not evidence for the change; what it refuses is the
    // repair that over-shoots — a table that answers *Ambiguous* for the block
    // rather than for the property satisfies T1.27 exactly and fails here.
    expect([...LATIN1_NEUTRAL].length, "the property's Latin-1 Neutral count").toBe(52);
    for (const c of LATIN1_NEUTRAL) {
      const cp = `U+${(c.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`;
      expect(cells(c, "wide"), `${cp} at ambiguousWidth "wide"`).toBe(1);
      expect(cells(c, "narrow"), `${cp} at ambiguousWidth "narrow"`).toBe(1);
    }
  });

  it("T1.27c (I6): SS47's PROSE_MARKS, accounted one mark at a time", () => {
    // **The count is asserted because the count was wrong.** The finding said
    // four of eight, the ledger correction said five of ten, and the property
    // says **seven of ten are Ambiguous and three of those were in the gap**.
    // A row per mark rather than a total, because a total is satisfied by the
    // wrong three.
    const marks = [..."—§·×≤≥→«»⚠"];
    expect(marks.length, "SS47's PROSE_MARKS").toBe(10);
    const wide = Object.fromEntries(marks.map((m) => [m, cells(m, "wide")]));
    expect(wide, "seven Ambiguous at 2, «» Neutral at 1, ⚠ Neutral but inside the geometry deviation").toEqual({
      "—": 2, "§": 2, "·": 2, "×": 2, "≤": 2, "≥": 2, "→": 2, "«": 1, "»": 1, "⚠": 2,
    });
  });

  it("T1.27d (I6): the geometry deviation is deliberate, and it is asserted where it is claimed", () => {
    // C09 §5 keeps nine blocks Ambiguous whole even where the property says
    // Neutral, because §4c's gates read this answer. 625 code points depend on
    // that list; these are four of them, and the day a generated table is
    // dropped in without the deviation this fails here rather than in fifteen
    // golden frames.
    for (const c of "▐░▖▚") expect(cells(c, "wide"), `${c} — Neutral in the property, drawn as geometry here`).toBe(2);
    for (const c of "▐░▖▚") expect(cells(c, "narrow"), `${c} at narrow`).toBe(1);
  });

  it("T1.27e (I6): a supplementary variation selector is zero cells, not two", () => {
    // The property calls U+E0100..U+E01EF Ambiguous, so deriving the table from
    // it started measuring a combining mark at two cells under the wide
    // convention until `isZeroWidth` grew the range. A repair that introduces
    // an over-count one table over is what a generated table makes possible and
    // a hand-written one hid.
    expect(cells("\u{E0100}", "wide"), "VARIATION SELECTOR-17 at wide").toBe(0);
    expect(cells("\u{E01EF}", "narrow"), "VARIATION SELECTOR-256 at narrow").toBe(0);
    expect(cells("\u{DFFFF}", "wide"), "and the code point below the range is untouched").toBe(1);
  });
});

/**
 * C09 T1.28 — the Wide set is `East_Asian_Width` in {`W`, `F`}, and its errors
 * were in the mode everything is rendered in (C09 §5, C09 I6, C02 I9).
 *
 * The sibling of T1.27 and the more dangerous half. `isAmbiguous`'s gap only
 * showed at `ambiguousWidth: "wide"`; `isWide`'s showed at **narrow**, which is
 * the default and the convention every golden frame in the tree is rendered in.
 * Measured against `EastAsianWidth-17.0.0.txt` before the change: **8,619 code
 * points are `W` or `F` and measured one cell**, in 65 runs, every one an
 * under-count — and a row measured at n cells that draws n+1 wraps, which
 * scrolls the alternate screen (F692).
 *
 * **The sets below are the property's, transcribed and not chosen**: one
 * representative per large run, and every emoji singleton the finding named. Both
 * directions are asserted, because a row saying *these are two cells* passes just
 * as well on a table that says everything is wide.
 */
describe("cells — the Wide set against its source (C09 §5)", () => {
  /**
   * The runs of the 8,619, as `[lo, hi]` bounds — **not one representative
   * each**, which is what this list was first written as and what the mutation
   * pass refused. Collapsing `0x17000, 0x18cd5` to `0x17000, 0x17000` — 7,382
   * code points out of the table — left every row green, because every
   * representative was its run's *first* member and element zero is the one a
   * collapse keeps. Both bounds and the midpoint are asserted below, so a
   * collapse onto either end and an off-by-one at either bound all fail.
   */
  const WIDE_RUNS: readonly (readonly [number, number, string])[] = [
    [0x231a, 0x231b, "WATCH, HOURGLASS"],
    [0x23e9, 0x23ec, "black right-pointing double triangles"],
    [0x23f0, 0x23f0, "ALARM CLOCK"],
    [0x23f3, 0x23f3, "HOURGLASS WITH FLOWING SAND"],
    [0x25fd, 0x25fe, "white and black medium small squares"],
    [0x2614, 0x2615, "UMBRELLA WITH RAIN DROPS, HOT BEVERAGE"],
    [0x2630, 0x2637, "the eight trigrams"],
    [0x2648, 0x2653, "the zodiac"],
    [0x268a, 0x268f, "monogram and digram symbols"],
    [0x26aa, 0x26ab, "medium white and black circles"],
    [0x26c4, 0x26c5, "SNOWMAN WITHOUT SNOW, SUN BEHIND CLOUD"],
    [0x26f2, 0x26f3, "FOUNTAIN, FLAG IN HOLE"],
    [0x2753, 0x2755, "question and exclamation ornaments"],
    [0x2795, 0x2797, "heavy plus, minus, division"],
    [0x2b1b, 0x2b1c, "black and white large squares"],
    [0x4dc0, 0x4dff, "the Yijing hexagrams — 64"],
    [0xa960, 0xa97c, "Hangul Jamo Extended-A — 29"],
    [0x16fe0, 0x16fe4, "Tangut and Nushu iteration marks"],
    [0x16ff0, 0x16ff6, "Vietnamese alternate reading marks"],
    [0x17000, 0x18cd5, "Tangut ideographs — 7,382"],
    [0x18cff, 0x18d1e, "Khitan small script"],
    [0x18d80, 0x18df2, "Tangut components supplement"],
    [0x1b000, 0x1b122, "Kana Supplement and Extended-A"],
    [0x1b170, 0x1b2fb, "Nushu"],
    [0x1d300, 0x1d356, "Tai Xuan Jing symbols"],
    [0x1d360, 0x1d376, "counting rod numerals"],
    [0x1f210, 0x1f23b, "squared CJK ideographs"],
    [0x1f7e0, 0x1f7eb, "large coloured circles and squares"],
  ];

  /** The singletons the finding named, one code point each. */
  const WIDE_SINGLETONS = "\u{26A1}\u{26D4}\u{2705}\u{2728}\u{274C}\u{2757}\u{2B50}\u{2B55}\u{1F004}\u{1F200}";

  it("T1.28 (I6, C02 I9): every Wide code point is two cells under both conventions", () => {
    // **The fabricated violation.** Restoring the hand-written table — the
    // seventeen coarse blocks that stood here — makes every row report 1 in both
    // modes. All of these lie outside those blocks; that is what put them in the
    // 8,619.
    expect(WIDE_RUNS.length, "runs of the 8,619 named here").toBe(28);
    for (const [lo, hi, name] of WIDE_RUNS) {
      for (const cp of [lo, (lo + hi) >> 1, hi]) {
        const c = String.fromCodePoint(cp);
        const label = `U+${cp.toString(16).toUpperCase()} (${name})`;
        expect(cells(c, "narrow"), `${label} at ambiguousWidth "narrow" — the default`).toBe(2);
        expect(cells(c, "wide"), `${label} at ambiguousWidth "wide"`).toBe(2);
      }
    }
    for (const c of WIDE_SINGLETONS) {
      const label = `U+${(c.codePointAt(0) ?? 0).toString(16).toUpperCase()}`;
      expect(cells(c, "narrow"), `${label} at narrow`).toBe(2);
      expect(cells(c, "wide"), `${label} at wide`).toBe(2);
    }
  });

  it("T1.28b (I6): the control — what left the table is Neutral, and no glyph a terminal draws wide lost a cell", () => {
    // **The control T1.28 owes, and it is the row that refuses the over-shooting
    // repair.** *Wide is missing entries, so union the property onto the blocks
    // that were there* satisfies T1.28 exactly and fails here: 369 code points
    // measured two and are not `W` or `F`.
    //
    // Two shapes, because they are wrong for different reasons. The first four
    // are unassigned gaps the coarse blocks swallowed. The last is the one that
    // had to be checked rather than argued: a **text-presentation** emoji, which
    // the property calls Neutral because a terminal draws it one cell until a
    // variation selector asks for the emoji form. Of the 369, none has
    // `Emoji_Presentation=Yes` (`emoji-data.txt` 17.0.0), so nothing a terminal
    // draws double-width narrowed here.
    const NOW_NARROW = [
      ["\u{2E9A}", "unassigned, CJK radicals supplement"],
      ["\u{3097}", "unassigned, Hiragana"],
      ["\u{A48D}", "unassigned, Yi radicals"],
      ["\u{FF00}", "unassigned, halfwidth and fullwidth forms"],
      ["\u{1F321}", "THERMOMETER — text presentation"],
    ] as const;
    for (const [c, name] of NOW_NARROW) {
      const cp = `U+${(c.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")} ${name}`;
      expect(cells(c, "narrow"), `${cp} at narrow`).toBe(1);
      expect(cells(c, "wide"), `${cp} at wide`).toBe(1);
    }
    // And the half that says the narrowing is the property's rule rather than a
    // loss: the same code point asking for the emoji form is still two.
    expect(cells("\u{1F321}\u{FE0F}", "narrow"), "THERMOMETER with U+FE0F").toBe(2);
  });

  it("T1.28c (I6, C02 I9): the two tables overlap, and the property settles it — U+3248..U+324F is Ambiguous, not Wide", () => {
    // The hand-written `0x3041..0x33ff` claimed these eight, which the property
    // calls Ambiguous: they measured **two at narrow**, an over-count inside an
    // under-counting table, and the direction that no union repair fixes.
    // Deriving both tables from one file makes it impossible rather than fixed —
    // the property's classes are disjoint, so the two ranges cannot intersect.
    // A repair that adds `WIDE_RANGES` and leaves the old blocks in place keeps
    // all eight and fails here.
    for (let cp = 0x3248; cp <= 0x324f; cp += 1) {
      const c = String.fromCodePoint(cp);
      const label = `U+${cp.toString(16).toUpperCase()} CIRCLED NUMBER TEN ON BLACK SQUARE and up`;
      expect(cells(c, "narrow"), `${label} at narrow — Ambiguous, so one`).toBe(1);
      expect(cells(c, "wide"), `${label} at wide`).toBe(2);
    }
  });

  it("T1.28d (I6): where the property and the geometry deviation meet, the property wins in both modes", () => {
    // 49 code points of `DRAWN_AS_GEOMETRY` are `W` in the property.
    // `clusterCells` asks `isWide` first, so they are two cells under **both**
    // conventions — which is the ruling and not an ordering accident: the
    // deviation exists to make a geometry glyph measure two at wide, and a glyph
    // the property already calls Wide measures two at every convention. What the
    // list still governs is the 576 Neutral members, and T1.27d asserts those.
    for (const c of "\u{26C4}\u{25FD}\u{2B1B}\u{2614}") {
      expect(cells(c, "narrow"), `${c} — Wide in the property, inside a geometry block, at narrow`).toBe(2);
      expect(cells(c, "wide"), `${c} at wide`).toBe(2);
    }
    // The control: a Neutral member of the same blocks keeps the deviation's
    // answer, so this row is about the intersection and not about the blocks.
    expect(cells("\u{2591}", "narrow"), "LIGHT SHADE — Neutral, the deviation's own").toBe(1);
    expect(cells("\u{2591}", "wide"), "LIGHT SHADE at wide").toBe(2);
  });

  it("T1.28e (I6): the deliberate deviations survived the generated table", () => {
    // Swept against the property after the change, the disagreements are
    // **exactly** the three recorded deviations and nothing else: 0 under-counts
    // in either mode, 26 regional indicators, 576 geometry code points at wide,
    // and 722 zero-width. A lone regional indicator is the one asserted here
    // because it is the only non-zero-width disagreement left at narrow, and a
    // generated table dropped in over it would have made it one cell.
    expect(cells("\u{1F1E6}", "narrow"), "REGIONAL INDICATOR A alone — Neutral in the property").toBe(2);
    expect(cells("\u{1F1E6}\u{1F1E9}", "narrow"), "and a pair is one flag of two cells, not four").toBe(2);
    expect(cells("\u{0301}", "narrow"), "COMBINING ACUTE ACCENT — Ambiguous in the property, zero here").toBe(0);
  });
});
