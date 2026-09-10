// C09 tier 1 and 3 — cells(), truncate(), wrapCells().
//
// The single width implementation (I6). Every kind's measurer resolves width
// through these three functions, so a defect here is a defect in eighteen
// measurers at once — which is the argument for them being one implementation
// and the reason this file tests it apart from any block.
import { describe, expect, it } from "vitest";
import {
  CELL_PER_UNIT_RANGES,
  cells,
  clusterWidth,
  displayCells,
  expandTabs,
  fitStyled,
  graphemes,
  hardWrapCells,
  rowCells,
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

describe("fitStyled (C09 §5a)", () => {
  // The function every row of every frame goes through (`exact()` in
  // `shell/paint.ts`), and until F937 it had no row of its own: every caller's
  // suite exercised it and none pinned its four answers, so a change to the walk
  // had nothing to fail against but golden frames.
  const RED = "\u001b[31m";
  const SGR = /\u001b\[[0-9;]*m/g;

  /** A UTF-16 half with no partner beside it — the thing a code-unit step makes. */
  const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

  it("T1.30 (I9, §5a): the four answers — untouched, padded, cut plain, cut and closed", () => {
    // Already `width`: returned as given, styled or not, with no bytes added.
    expect(fitStyled("abc", 3, SGR_RESET)).toBe("abc");
    expect(fitStyled(`${RED}abc${SGR_RESET}`, 3, SGR_RESET)).toBe(`${RED}abc${SGR_RESET}`);

    // Short: padded with spaces to exactly `width`, and a pad is not a cut, so
    // even a styled row gains no reset beyond the ones it carried.
    expect(fitStyled("ab", 4, SGR_RESET)).toBe("ab  ");
    expect(fitStyled(`${RED}ab${SGR_RESET}`, 4, SGR_RESET)).toBe(`${RED}ab${SGR_RESET}  `);

    // Long and plain: cut, and no reset — four bytes on every plain row of every
    // frame would have every golden asserting the reset rather than the row.
    expect(fitStyled("abcdef", 3, SGR_RESET)).toBe("abc");

    // Long and styled: cut and closed with the reset it was handed, so the
    // colour cannot bleed into the rows below.
    expect(fitStyled(`${RED}abcdef${SGR_RESET}`, 3, SGR_RESET)).toBe(`${RED}abc${SGR_RESET}`);

    // A double-width glyph straddling the cut is dropped and its cell blanked,
    // never halved (I9) — and the blank counts as a cut, so a styled row closes.
    expect(fitStyled("a日b", 2, SGR_RESET)).toBe("a ");
    expect(fitStyled("a日b", 3, SGR_RESET)).toBe("a日");
    expect(fitStyled(`${RED}a日b`, 2, SGR_RESET)).toBe(`${RED}a${SGR_RESET} `);

    // Escapes are copied through whole and cost no cells.
    const fitted = fitStyled(`${RED}a${SGR_RESET}b`, 5, SGR_RESET);
    expect(displayCells(fitted)).toBe(5);
    expect(fitted.match(SGR)).toEqual([RED, SGR_RESET]);
  });

  it("T1.31 (I60, I20, I63, §5a): the cursor steps whole characters, in both walks", () => {
    // **The step is a cluster, never a code unit** (I63). An astral character
    // is two UTF-16 units and one step; a combining mark travels with its base
    // as one piece, so it stays with it at the cut; a lone surrogate is one
    // one-cell step, exactly as the string iterator walked it before the read
    // was replaced (F938). Every answer here was the code-point walk's too —
    // the rows a cluster step changes are T3.79's. The fabricated violation is
    // a code-unit step: the low half of every astral pair then re-enters the
    // walk as a character of its own, one cell wide, and lands in the output.
    expect(fitStyled("a\u{1F44D}bc", 4, SGR_RESET), "cut after an astral pair").toBe("a\u{1F44D}b");
    expect(fitStyled("\u{1F44D}", 4, SGR_RESET), "padded after an astral pair").toBe("\u{1F44D}  ");
    expect(fitStyled("e\u0301xy", 1, SGR_RESET), "the mark stays with its base").toBe("e\u0301");
    expect(fitStyled("\ud83dxy", 2, SGR_RESET), "a lone surrogate is one step of one cell").toBe("\ud83dx");
    expect(sliceCells("a\u{1F44D}bc", 1, 4), "a window over an astral pair").toBe("\u{1F44D}b");
    expect(sliceCells("a\u{1F44D}bc", 3, 4), "a window after one").toBe("b");

    // And over a corpus whose clusters are additive — every cluster's width is
    // the sum of its code points' — both walks hit `width` exactly and never
    // manufacture a lone surrogate. (The non-additive clusters are T3.79's,
    // F939.)
    const corpus = ["plain ascii", "日本語のテキスト", "a\u{1F44D}b\u{1F600}c", "e\u0301 o\u0308 u\u0300", `${RED}x\u{1F44D}${SGR_RESET}y\u{1F600}`];
    for (const line of corpus) {
      const whole = displayCells(line);
      for (let w = 0; w <= whole + 2; w += 1) {
        const fitted = fitStyled(line, w, SGR_RESET);
        expect(displayCells(fitted), `fitStyled(${JSON.stringify(line)}, ${String(w)})`).toBe(w);
        expect(LONE_SURROGATE.test(fitted), `a lone surrogate in fitStyled(${JSON.stringify(line)}, ${String(w)})`).toBe(false);
      }
      for (let a = 0; a <= whole; a += 1) {
        for (let b = a; b <= whole; b += 1) {
          const window = sliceCells(line, a, b);
          expect(displayCells(window), `sliceCells(${JSON.stringify(line)}, ${String(a)}, ${String(b)})`).toBe(b - a);
          expect(LONE_SURROGATE.test(window), `a lone surrogate in sliceCells(${JSON.stringify(line)}, ${String(a)}, ${String(b)})`).toBe(false);
        }
      }
    }
  });
});

describe("C09 §5a — the three pieces, and where the segmenter is asked (I63)", () => {
  const ESC = String.fromCharCode(27);
  const RED = `${ESC}[31m`;
  const SGR = new RegExp(`${ESC}\\[[0-9;]*m`, "g");

  it("T1.36 (I63, §5a): a row of printable ASCII and escapes is measured in one scan, and everything else is measured as it was", () => {
    // **The reference is the definition the fast path replaced** — the escapes
    // stripped and the rest handed to `cells` — not the function under test.
    // The corpus reaches both arms: rows the scan answers alone, and rows that
    // fall through at a tab, a control, a bare escape or a glyph.
    const rows = [
      "", "plain", `${RED}styled${SGR_RESET}`, `${RED}${SGR_RESET}`, "a\tb", `a${String.fromCharCode(7)}b`,
      `a${ESC}b`, `${RED}a${ESC}[b`, "日本", `${RED}│${SGR_RESET} x`, "e\u0301", "\u{1F44D}", "1\ufe0f\u20e3", "a\u0903",
    ];
    for (const row of rows) {
      expect(displayCells(row), JSON.stringify(row)).toBe(cells(row.replace(SGR, "")));
    }
    const fast = rows.filter((r) => /^[\x20-\x7e]*$/.test(r.replace(SGR, "")) && !r.includes(`${ESC}b`) && !r.includes(`${ESC}[b`));
    expect(fast.length, "rows the scan answers alone").toBeGreaterThan(3);
    expect(rows.length - fast.length, "and rows that fall through").toBeGreaterThan(5);

    // **The run gives up its last character when what follows could extend
    // it** — a keycap is a digit, a selector and an enclosing mark, two cells
    // as one cluster and one cell as a digit beside a zero-width tail; a
    // spacing mark after a letter joins the letter's cluster and takes a cell
    // of its own, as the terminal advances (I65). **The next line read `1`
    // until F978** — *a spacing mark stays with its base* — the defect written
    // into the test as its reason and green for as long as the defect was
    // (F979): `aः` is two cells to string-width 8.2.2 and to xterm, and a
    // `raw` row padded by the old answer wrapped in Ink (T2.133).
    expect(cells("1\ufe0f\u20e3"), "keycap: one cluster of two cells").toBe(2);
    expect(cells("a\u0903"), "a spacing mark joins its base's cluster and takes a cell — the terminal's answer (F978)").toBe(2);
    expect(cells("\u06001"), "a Prepend joins the digit after it").toBe(1);
    expect(fitStyled("\u06001x", 1, SGR_RESET), "and the walk keeps that cluster whole").toBe("\u06001");
  });

  it("T1.36 (I63, §5a): the corners — a control is carried at no width, and an escape is never inside a piece", () => {
    // A control character is a cluster of its own and has no width (I18): the
    // walks carry it through and the measurer strips it, so the row measures
    // what is drawn either way. A bare escape is one.
    const bel = String.fromCharCode(7);
    expect(fitStyled(`a${bel}b`, 3, SGR_RESET)).toBe(`a${bel}b `);
    expect(sliceCells(`a${bel}b`, 1, 2)).toBe(`${bel}b`);
    expect(fitStyled(`a${ESC}b`, 3, SGR_RESET)).toBe(`a${ESC}b `);
    expect(fitStyled("a\tb", 4, SGR_RESET), "a tab is one cell, as `cells` counts it").toBe("a\tb ");

    // **An escape's final `m` is a letter, and a mark placed directly after an
    // escape joins it in the segmenter's eyes.** The piece is the mark alone,
    // zero cells, and the escape is whole — never repeated, never split — so
    // the row still measures what the terminal draws. C04 I84 keeps a renderer
    // from painting an escape inside a cluster; this is the corner it leaves.
    const marked = `x${RED}\u0301y`;
    expect(displayCells(marked)).toBe(2);
    expect(fitStyled(marked, 4, SGR_RESET)).toBe(`${marked}  `);
    expect(displayCells(fitStyled(marked, 4, SGR_RESET))).toBe(4);
    expect(sliceCells(marked, 1, 2)).toBe(`${RED}\u0301y${SGR_RESET}`);

    // **A combining mark at a window's right edge stays with its base** (F956).
    // The code-point walk broke at the edge before the mark — `[0, 2)` over
    // `ae\u0301b` came back `ae` — and no width could see it, because a base
    // without its mark measures what the base does.
    expect(sliceCells("ae\u0301b", 0, 2)).toBe("ae\u0301");
    expect(sliceCells("ae\u0301b", 0, 2).length, "two cells, three code units").toBe(3); // cells-ok — a code-unit count, deliberately
    expect(sliceCells(`${RED}ae\u0301${SGR_RESET}b`, 0, 2)).toBe(`${RED}ae\u0301${SGR_RESET}${SGR_RESET}`);
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
    // U+16FE0..U+16FE4 in the property; asserted to U+16FE3 because U+16FE4,
    // the Khitan small script filler, is a nonspacing mark, and a nonspacing
    // mark is zero before it is Wide (I65, T1.37) — string-width agrees.
    [0x16fe0, 0x16fe3, "Tangut and Nushu iteration marks"],
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

/**
 * C09 T1.37–T1.39 — a cluster measures as the terminal advances, and the
 * zero-width set is the property (C09 §5, I65).
 *
 * The third table in `text.ts` written by hand and found wrong against its
 * source (F979), and the one whose errors landed on the cluster: `clusterCells`
 * gave every cluster the width of its base code point, so a spacing mark —
 * `Mc`, a cell to every terminal and to Ink — measured nothing, and a `raw`
 * row padded by that answer wrapped in Ink (F969, F978, T2.133). T1.36
 * asserted the old answer as the rule.
 *
 * **The reference is a table of measured values, not a reconstruction of the
 * walk**, as §5's fast-path rows are: `cells()` at both conventions, with
 * string-width 8.2.2 (as Ink 7.1.1 resolves it) and `@xterm/headless` 6.0.0's
 * cursor column beside each, read in the container on Unicode 17.0. Asserted
 * as one set by equality, so a member cannot be dropped to keep the row green.
 */
describe("cells — a cluster measures as the terminal advances (C09 §5, I65)", () => {
  /**
   * Name, text, `cells` at narrow, at wide — and in the comment what
   * string-width and xterm-headless answered, which the row does not assert:
   * the emulator is not a reference for a keycap, a Prepend or a lone mark
   * (C27 I6), and Ink's answer is the one T2.133 holds a frame to.
   */
  const SHAPES: readonly (readonly [string, string, number, number])[] = [
    //  name, text, narrow, wide                                                      string-width · xterm
    ["café, decomposed", "cafe\u0301", 4, 4],                                        // 4 · 4
    ["keycap 1️⃣", "1\ufe0f\u20e3", 2, 2],                                           // 2 · 1
    ["flag 🇬🇧", "\u{1F1EC}\u{1F1E7}", 2, 2],                                        // 2 · 2
    ["family 👨‍👩‍👧", "\u{1F468}\u200d\u{1F469}\u200d\u{1F467}", 2, 2],          // 2 · 3
    ["Prepend ؀1", "\u06001", 1, 1],                                                 // 1 · 2
    ["aः — a and U+0903, Mc", "a\u0903", 2, 2],                                      // 2 · 2 — read 1 before F978
    ["कि — U+0915 U+093F, Mc", "\u0915\u093f", 2, 2],                                // 2 · 2 — read 1
    ["กา — U+0E01 U+0E32, two letters", "\u0e01\u0e32", 2, 2],                       // 2 · 2 — read 1: U+0E32 sat in the hand table
    ["กำ — U+0E33, a letter with GCB SpacingMark", "\u0e01\u0e33", 2, 2],            // 1 · 2 — read 1; Ink's 1 pads short
    ["בְ — U+05D1 U+05B0, Mn", "\u05d1\u05b0", 1, 1],                                // 1 · 1
    ["a and a soft hyphen", "a\u00ad", 2, 3],                                         // 1 · 2 — U+00AD is drawn, and Ambiguous at wide
    ["lone ः", "\u0903", 1, 1],                                                       // 1 · 1
    ["lone ́ U+0301", "\u0301", 0, 0],                                                // 0 · 1
    ["a ZWSP b", "a\u200bb", 2, 2],                                                   // 2 · 2
    ["கொ — Tamil, Mc", "\u0b95\u0bca", 2, 2],                                        // 2 · 2 — read 1
    ["কা — Bengali, Mc", "\u0995\u09be", 2, 2],                                      // 2 · 2 — read 1
    ["हिन्दी", "\u0939\u093f\u0928\u094d\u0926\u0940", 5, 5],                   // 4 · 5 — read 2
    ["日 with U+0301", "\u65e5\u0301", 2, 2],                                        // 2 · 2
    ["👋🏽 — a wave and a modifier", "\u{1F44B}\u{1F3FD}", 2, 2],                      // 2 · 2
    ["England — 🏴 and six tags", "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}", 2, 2], // 2 · 1
    ["a joiner alone", "\u200d", 0, 0],                                               // 0 · 1
    ["1⃣ without the selector", "1\u20e3", 1, 1],                                     // 2 · 1
    ["a modifier alone", "\u{1F3FB}", 2, 2],                                          // 2 · 1 — the rule's reason does not reach it
    ["a and a modifier", "a\u{1F3FB}", 1, 1],                                         // 1 · 2 — the emulator draws the swatch
    ["a, a joiner, b", "a\u200db", 2, 2],                                             // 2 · 2 — two clusters
    ["Prepend and ⚠️", "\u0600\u26a0\ufe0f", 2, 2],                                  // 1 · 2
    ["が — か and U+3099", "\u304b\u3099", 2, 2],                                    // 2 · 2
    ["U+3099 alone — Mn, and Wide in the property", "\u3099", 0, 0],                  // 0 · 1 — read 2
  ];

  it("T1.37 (I65): the shapes as one set — every shape's cells at narrow and at wide equal the table", () => {
    // **Equality over the set, not a member at a time**: a table with one row
    // removed reads exactly like a table that passed. Under the base rule that
    // stood here every `Mc` shape read 1 and हिन्दी 2 (T6.111); with the joiner
    // no longer ending the sum the family reads 6 (T6.113).
    expect(SHAPES.length, "the shapes the ruling was measured on").toBe(28);
    const measured = Object.fromEntries(SHAPES.map(([name, text]) => [name, [cells(text), cells(text, "wide")]]));
    const expected = Object.fromEntries(SHAPES.map(([name, , narrow, wide]) => [name, [narrow, wide]]));
    expect(measured).toEqual(expected);
  });

  it("T1.38 (I65): the zero-width table is the property, re-derived here and compared by equality, and its two exclusions are deliberate", () => {
    // **Derived at test time, not read off the table**: every code point in
    // `Mn`, `Me` or `Cf` of the Unicode this runtime carries, minus U+00AD —
    // the rule `ZERO_WIDTH_RANGES` states — merged into `[lo, hi]` runs, beside
    // the code points `cells()` measures at zero, merged the same way. Controls
    // are set aside: `cells` strips them (I18, T1.14) and no table ever held
    // them. Measured through `clusterWidth`, which for one non-control code
    // point is the path `cells` takes without the segmenter in front of it —
    // the whole range costs 1.8 s through `cells` and a fifth of that here, so
    // the row sweeps every plane rather than the assigned ones. The day the
    // runtime's Unicode moves, this fails and the table is regenerated, which
    // is what *checked rather than recorded* means.
    const ZERO = /^[\p{Mn}\p{Me}\p{Cf}]$/u;
    const CONTROL = /^\p{Cc}$/u;
    const runs = (members: readonly number[]): number[] => {
      const out: number[] = [];
      for (const cp of members) {
        if (out.length > 0 && out[out.length - 1] === cp - 1) out[out.length - 1] = cp; // cells-ok — a run's end, not a width
        else out.push(cp, cp);
      }
      return out;
    };
    const expected: number[] = [];
    const measured: number[] = [];
    for (let cp = 0; cp <= 0x10ffff; cp += 1) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      const ch = String.fromCodePoint(cp);
      if (CONTROL.test(ch)) continue;
      if (ZERO.test(ch) && cp !== 0xad) expected.push(cp);
      if (clusterWidth(ch) === 0) measured.push(cp);
    }
    expect(expected.length, "the derivation read the property at all — 2,241 on Unicode 17.0").toBeGreaterThan(2000); // cells-ok — a count of code points
    expect(runs(measured), "what measures zero is exactly the derived set").toEqual(runs(expected));

    // **The two exclusions, asserted where they are claimed.** U+00AD is `Cf`
    // and every terminal draws it — xterm advances a cell, Kuhn's `wcwidth`
    // names it width 1 in its header — so it measures one here where
    // string-width measures none: an over-count on the Ink side, which pads
    // short and cannot wrap (T6.114 is the admission).
    expect(cells("\u00ad"), "SOFT HYPHEN alone").toBe(1);
    expect(cells("a\u00ad"), "and after a letter — two clusters, two cells").toBe(2);
    // The Hangul conjoining jamo are letters that `wcwidth` zeroes so a
    // decomposed syllable measures what the precomposed one does; this table
    // does not, and the limit is recorded rather than adopted: a decomposed 가
    // is three here against xterm's and string-width's two.
    expect(cells("\u1161"), "HANGUL JUNGSEONG A alone — a letter, one cell; wcwidth's zero is the recorded limit").toBe(1);
    expect(cells("\u1100\u1161"), "a decomposed 가 — three, an over-count of one in the safe direction").toBe(3);
    expect(cells("\uac00"), "the precomposed syllable — two").toBe(2);
  });

  it("T1.39 (I65, I19): the walks and the measurer part company nowhere — truncate, wrap, slice, fit and clusterWidth agree with cells() on a row of spacing marks", () => {
    // One implementation (I6): every walk asks `clusterCells` for a cluster's
    // width, so the sum reaches the cut, the wrap, the window and C17's cursor
    // together. Read before asserted: each answer below is what the walk gave.
    const ROW = "a\u0903 \u0915\u093f x"; // aः, a space, कि, a space, x — 2 + 1 + 2 + 1 + 1
    const ESC = String.fromCharCode(27);
    const RED = `${ESC}[31m`;
    expect(cells(ROW)).toBe(7);
    expect(clusterWidth("a\u0903"), "C17's question, the same implementation").toBe(2);
    expect(clusterWidth("\u0915\u093f")).toBe(2);

    // The cut: a cluster that would straddle it is dropped and its cells left
    // blank (I9), and every cut measures exactly its limit.
    expect(truncate(ROW, 3, FULL)).toBe("a\u0903…");
    expect(truncate(ROW, 2, FULL), "aः would straddle the cut: blank, then the marker").toBe(" …");
    expect(truncate(ROW, 6, FULL)).toBe("a\u0903 \u0915\u093f…");
    for (const w of [1, 2, 3, 4, 5, 6, 7]) expect(cells(truncate(ROW, w, FULL)), `truncate at ${String(w)}`).toBe(w);

    // The wrap: a two-cell cluster is placed whole on a row of two, and at
    // width 1 it is unplaceable — `?` (I19), as a CJK glyph is. Under the base
    // rule `aः` was one cell and was placed at 1.
    expect(wrapCells(ROW, 2)).toEqual(["a\u0903", "\u0915\u093f", "x"]);
    expect(wrapCells(ROW, 4)).toEqual(["a\u0903", "\u0915\u093f x"]);
    expect(wrapCells("a\u0903", 1), "unplaceable at 1").toEqual(["?"]);
    expect(wrapCells(ROW, 1)).toEqual(["?", "?", "x"]);

    // The window: at cluster boundaries it is the cluster; straddling one it
    // is blank, never half a cluster.
    expect(sliceCells(ROW, 0, 2)).toBe("a\u0903");
    expect(sliceCells(ROW, 3, 5)).toBe("\u0915\u093f");
    expect(sliceCells(ROW, 1, 3), "a window across aः and the space").toBe("  ");
    expect(sliceCells(ROW, 0, 1)).toBe(" ");

    // The fit, at every width from 0 to two past the row; and the styled
    // form, where the cluster and its SGR travel together.
    expect(fitStyled(ROW, 2, SGR_RESET)).toBe("a\u0903");
    expect(fitStyled(ROW, 5, SGR_RESET)).toBe("a\u0903 \u0915\u093f");
    expect(fitStyled(ROW, 9, SGR_RESET)).toBe(`${ROW}  `);
    for (let w = 0; w <= 9; w += 1) expect(displayCells(fitStyled(ROW, w, SGR_RESET)), `fit at ${String(w)}`).toBe(w);
    const styled = `${RED}a\u0903${SGR_RESET} \u0915\u093f`;
    expect(displayCells(styled)).toBe(5);
    expect(sliceCells(styled, 0, 2)).toBe(`${RED}a\u0903${SGR_RESET}${SGR_RESET}`);
    expect(sliceCells(styled, 3, 5)).toBe("\u0915\u093f");
  });
});

/**
 * C09 T1.40 — a row as the cells the terminal draws it in (C09 §5, I63, I65).
 *
 * `rowCells` is the inverse of a label writer's join, for C12's merge, which
 * read a joined cell array by code point and put a family at five columns
 * (F977, C12 I119). Two claims: the function equals the cluster walk on a
 * corpus that reaches both of its arms, and the fast set it splits without a
 * segmenter is a **checked** set — every member measures one cell at the mode
 * it is admitted in — so a table revision that made one of them wide or
 * combining fails here rather than in a frame.
 */
describe("rowCells — a row as cells, and the fast set is a checked claim (C09 §5, I63, I65)", () => {
  const FAMILY = "\u{1F468}\u200d\u{1F469}\u200d\u{1F467}";
  const KEYCAP = "1\ufe0f\u20e3";

  /**
   * The reference — `graphemes` and `cells`, the writer's own walk (C12 I118):
   * a cluster at its first cell, `""` behind a wide one, a cluster measuring
   * nothing on the cell that owns the cluster before it or dropped at the head.
   */
  const walk = (text: string, ambiguous: "narrow" | "wide"): readonly string[] => {
    const out: string[] = [];
    for (const cluster of graphemes(text)) {
      const w = cells(cluster, ambiguous);
      if (w === 0) {
        let at = out.length - 1; // cells-ok — a cell index
        while (at > 0 && out[at] === "") at -= 1; // cells-ok — a cell index
        if (at >= 0) out[at] = `${out[at] ?? ""}${cluster}`;
        continue;
      }
      out.push(cluster);
      for (let k = 1; k < w; k += 1) out.push("");
    }
    return out;
  };

  it("T1.40 (I63, I65): rowCells equals the cluster walk over a corpus reaching both arms, at narrow and at wide", () => {
    // **Both arms**: rows the per-unit split answers alone — ASCII at either
    // mode; braille, box drawing, blocks, arrows and a sextant pair at
    // narrow — and rows that walk the clusters: a family, a keycap, `図表`,
    // `aः`, a decomposed `é`, a lone leading mark, a lone joiner, and the
    // fast alphabets at wide, where box drawing measures two (I65).
    const corpus = [
      "", "abc def", "\u2801\u2802\u2800\u28ff", "\u256d\u2500\u2500\u256e\u2502", "\u2581\u2584\u2588",
      "\u2192\u2197\u2191", "\u{1FB00}\u{1FB3B}", FAMILY, KEYCAP, "図表", "a\u0903", "e\u0301",
      "\u0301ab", "\u200d", "a\u200db", "a\u200bb", "図\u200bx", "日本x", "\u2500a図", " \u2500 x ",
    ];
    for (const ambiguous of ["narrow", "wide"] as const) {
      for (const row of corpus) {
        expect(rowCells(row, ambiguous), `${JSON.stringify(row)} at ${ambiguous}`).toEqual(walk(row, ambiguous));
      }
    }
    // **The shapes, as literal cells** — the reference is a table where the
    // walk above could be wrong in the same way as the function.
    expect(rowCells("abc", "narrow")).toEqual(["a", "b", "c"]);
    expect(rowCells("\u256d\u2500", "narrow"), "box drawing, one per cell at narrow").toEqual(["\u256d", "\u2500"]);
    expect(rowCells("\u256d\u2500", "wide"), "and two at wide, where the plot has already fallen back to ASCII").toEqual(["\u256d", "", "\u2500", ""]);
    expect(rowCells("\u2801\u2800", "wide"), "braille is Neutral: one at wide too").toEqual(["\u2801", "\u2800"]);
    expect(rowCells("\u{1FB00}\u{1FB3B}", "narrow"), "a sextant is one pair, one cell").toEqual(["\u{1FB00}", "\u{1FB3B}"]);
    expect(rowCells(FAMILY, "narrow")).toEqual([FAMILY, ""]);
    expect(rowCells(KEYCAP, "narrow")).toEqual([KEYCAP, ""]);
    expect(rowCells("図表", "narrow")).toEqual(["図", "", "表", ""]);
    expect(rowCells("a\u0903", "narrow"), "a spacing mark: one cluster of two cells (I65)").toEqual(["a\u0903", ""]);
    expect(rowCells("e\u0301", "narrow")).toEqual(["e\u0301"]);
    expect(rowCells("\u0301ab", "narrow"), "a lone leading mark owns no cell").toEqual(["a", "b"]);
    expect(rowCells("\u200d", "narrow"), "a lone joiner owns no cell").toEqual([]);
    expect(rowCells("a\u200bb", "narrow"), "a zero-width cluster rides on the cell before it").toEqual(["a\u200b", "b"]);
    expect(rowCells("図\u200bx", "narrow"), "past a continuation, on the cell that owns the glyph").toEqual(["図\u200b", "", "x"]);
    expect(rowCells("\u2500a図", "narrow"), "one glyph outside the set sends the row to the walk").toEqual(["\u2500", "a", "図", ""]);
    // The count is the width, on both arms.
    for (const row of corpus) expect(rowCells(row, "narrow").length, JSON.stringify(row)).toBe(cells(row, "narrow")); // cells-ok — a cell count against the measure
  });

  it("T1.40 (I63, I65): every member of the fast set measures one cell at the mode it is admitted in, and is not zero-width", () => {
    // **Derived from the ranges the function reads**, not restated: the set is
    // admitted at `narrow` — its BMP ranges are Ambiguous in part — and
    // printable ASCII at either mode. A member measuring two or none here is a
    // member the per-unit split would put in the wrong cell, and this row
    // fails before any frame does (C12 T6.100 constructs the widened set).
    expect(CELL_PER_UNIT_RANGES.length % 2, "flat [lo, hi] pairs").toBe(0); // cells-ok — a pair count
    let members = 0; // cells-ok — a code-point count
    for (let i = 0; i < CELL_PER_UNIT_RANGES.length; i += 2) { // cells-ok — a pair index
      const lo = CELL_PER_UNIT_RANGES[i]!;
      const hi = CELL_PER_UNIT_RANGES[i + 1]!;
      expect(lo <= hi, `pair ${String(i / 2)} ascending`).toBe(true);
      for (let cp = lo; cp <= hi; cp += 1) {
        const ch = String.fromCodePoint(cp);
        expect(cells(ch, "narrow"), `U+${cp.toString(16)} at narrow`).toBe(1);
        expect(rowCells(ch, "narrow"), `U+${cp.toString(16)} as a row`).toEqual([ch]);
        members += 1;
      }
    }
    expect(members, "the set was read at all — four ranges, 784 code points").toBe(784); // cells-ok — a code-point count
    for (let cp = 0x20; cp <= 0x7e; cp += 1) {
      const ch = String.fromCharCode(cp);
      expect(cells(ch, "narrow"), `ASCII U+${cp.toString(16)}`).toBe(1);
      expect(cells(ch, "wide"), `ASCII U+${cp.toString(16)} at wide`).toBe(1);
    }
    // The control: a wide code point and a combining mark are what the check
    // refuses, so the assertion above is not one every code point satisfies.
    expect(cells("日", "narrow")).toBe(2);
    expect(cells("\u0301", "narrow")).toBe(0);
  });
});
