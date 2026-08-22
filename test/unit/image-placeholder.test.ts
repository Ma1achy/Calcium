/**
 * The measurement that gates images: does a kitty Unicode placeholder occupy
 * exactly one cell **as far as this framework is concerned**?
 *
 * `CALCIUM_ROADMAP.md` states *measurement is free — the placeholder grid IS
 * rows x cols of ordinary characters*. That is true of the terminal. It is a
 * claim about **three** width implementations agreeing, and only one of them is
 * the terminal's:
 *
 *   - `cells()`, which every `measure` in the tree uses (SS23);
 *   - Ink's own string width, which lays out the `Box` the placeholder sits in;
 *   - the terminal's, which is what actually draws.
 *
 * If the first two disagree with each other, the image floats and the roadmap's
 * three *free* rows are all false — before any protocol question is asked.
 */
import { describe, expect, it } from "vitest";
import { Box, Text, renderToString } from "ink";
import { createElement as h } from "react";
import { cells, truncate, stripControl } from "../../src/presentation/text.js";
import { ASCII_CAPS, FULL_CAPS } from "../support/render.js";

/** The placeholder, and the diacritics that carry row and column. */
const PH = String.fromCodePoint(0x10eeee);
const ROW0 = "̅"; // U+0305 COMBINING OVERLINE — kitty's row/column encoding
const COL0 = "̅";


/** kitty's row/column diacritics — the first of the standard table. */
const DIAC = [0x0305, 0x030d, 0x030e, 0x0310, 0x0312, 0x033d, 0x033e, 0x033f];
const cellAt = (row: number, col: number): string =>
  PH + String.fromCodePoint(DIAC[row] ?? 0x0305) + String.fromCodePoint(DIAC[col] ?? 0x0305);
const gridRow = (row: number, cols: number): string =>
  Array.from({ length: cols }, (_, c) => cellAt(row, c)).join("");

/** A cluster is intact when its base is followed by exactly its two marks. */
function clustersIntact(s: string): boolean {
  const parts = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s)].map((g) => g.segment);
  for (const g of parts) {
    const cps = [...g].map((c) => c.codePointAt(0) ?? 0);
    if (cps[0] === 0x10eeee && cps.length !== 3) return false;
    if (cps[0] !== 0x10eeee && cps.some((cp) => cp >= 0x0300 && cp <= 0x036f)) return false;
  }
  return true;
}

describe("images — the gating measurement", () => {
  it("the placeholder's width, by every implementation this framework holds", () => {
    const rows: string[] = [];
    const probe = (label: string, s: string): void => {
      const inkWidth = renderToString(h(Box, null, h(Text, null, s)), { columns: 40 }).split("\n")[0]?.length ?? 0;
      rows.push(
        `${label.padEnd(34)} cells()=${String(cells(s, "narrow"))} ` +
          `.length=${String(s.length)} codepoints=${String([...s].length)} ink=${String(inkWidth)}`,
      );
    };
    probe("one placeholder", PH);
    probe("placeholder + row/col diacritics", PH + ROW0 + COL0);
    probe("four placeholders", PH.repeat(4));
    // **A literal BEL reached this file by being typed**, and it took the width
    // table disagreeing with `.length` to notice — F236's class, in miniature.
    // Kept as the contrast row and written as an escape: a zero-width control
    // is the other way `cells()` and `.length` come apart, and it is the one
    // that has nothing to do with the placeholder.
    probe("a zero-width control", `a${String.fromCharCode(7)}b`);
    probe("a plain 4-cell run", "abcd");
    console.log(`\n${rows.join("\n")}`);

    // **The claim under test**, stated as the roadmap states it.
    expect(cells(PH, "narrow"), "one placeholder is one cell").toBe(1);
    expect(cells(PH + ROW0 + COL0, "narrow"), "and the diacritics add nothing").toBe(1);
    expect(cells(PH.repeat(4), "narrow"), "so a 4-cell tile is 4 cells").toBe(4);
  });

  it("Ink lays out the same width `cells()` measures — or the image floats", () => {
    // **The one that decides it.** `measure` uses `cells()` and Ink lays out the
    // Box; a disagreement is C09 I1 broken by the content rather than by a rule,
    // and it would be invisible to every assertion about the protocol.
    for (const n of [1, 2, 4, 8]) {
      const s = PH.repeat(n);
      const drawn = renderToString(h(Box, { width: 20 }, h(Text, null, s)), { columns: 20 });
      const line = drawn.split("\n")[0] ?? "";
      console.log(`n=${String(n)} cells()=${String(cells(s, "narrow"))} ink drew ${String([...line].length)} codepoints`);
      expect([...line].length, `${String(n)} placeholders`).toBe(cells(s, "narrow"));
    }
  });

  it("the text path survives a plane-16 character", () => {
    // A surrogate pair through the two functions every rendered run passes.
    expect(stripControl(PH), "not stripped as a control").toBe(PH);
    expect(cells(truncate(PH.repeat(8), 4, FULL_CAPS), "narrow"), "truncates to a cell budget").toBeLessThanOrEqual(4);
    expect(truncate(PH.repeat(8), 4, FULL_CAPS), "and does not split the surrogate pair").not.toMatch(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u,
    );
  });
});

describe("images S0 · probe 2 — truncation and the window", () => {
  it("a placeholder row truncated to every width keeps whole clusters", () => {
    const row = gridRow(0, 12);
    expect(cells(row, "narrow"), "twelve cells before anything happens").toBe(12);
    const broken: number[] = [];
    for (let w = 1; w <= 12; w += 1) {
      const cut = truncate(row, w, FULL_CAPS);
      if (!clustersIntact(cut)) broken.push(w);
      expect(cells(cut, "narrow"), `truncated to ${String(w)}`).toBeLessThanOrEqual(w);
    }
    console.log(`\ntruncate at widths 1..12: ${broken.length === 0 ? "no cluster split" : `SPLIT at ${broken.join(", ")}`}`);
    expect(broken, "a split cluster draws a different image cell, not a shorter row").toEqual([]);
  });

  it("the ascii arm truncates with a marker and still does not split", () => {
    const row = gridRow(0, 12);
    for (const caps of [FULL_CAPS, ASCII_CAPS]) {
      const cut = truncate(row, 6, caps);
      console.log(`unicode=${caps.unicode}: ${JSON.stringify(cut)} -> cells ${String(cells(cut, "narrow"))}`);
      expect(clustersIntact(cut.replace(/[…~]/gu, "")), `${caps.unicode} keeps clusters`).toBe(true);
    }
  });

  it("a row of the grid is self-describing, so dropping rows is lossy and not wrong", () => {
    // C14 slices whole rows. Each cell carries its own row AND column, so the
    // surviving rows still address correctly — which is why a window is safe
    // where a truncation is not.
    const rows = Array.from({ length: 6 }, (_, r) => gridRow(r, 4));
    const windowed = rows.slice(2, 5);
    for (const [i, r] of windowed.entries()) {
      const first = [...r][1]?.codePointAt(0) ?? 0;
      expect(first, `row ${String(i + 2)} still names its own row`).toBe(DIAC[i + 2]);
    }
  });
});
