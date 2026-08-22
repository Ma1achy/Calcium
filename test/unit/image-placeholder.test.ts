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
import { FULL_CAPS } from "../support/render.js";

/** The placeholder, and the diacritics that carry row and column. */
const PH = String.fromCodePoint(0x10eeee);
const ROW0 = "̅"; // U+0305 COMBINING OVERLINE — kitty's row/column encoding
const COL0 = "̅";

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
