// C09 T2.16 — the width two implementations compute.
//
// `cells()` is ours, because a width library would not be the implementation
// the measurer uses (DEPENDENCIES.md, C09 I6). Ink measures text too, with its
// own, and uses the answer to decide where a box ends and whether a line wraps.
// The duplication cannot be removed here — only pinned.
//
// A failure in this file is a finding about **which of the two is right**, and
// it is reported before it is worked around: `string-width` is well-travelled,
// and if it disagrees on a real cluster we may be the wrong one. Widening a
// tolerance is not among the available responses (C09 §3).
import { describe, expect, it } from "vitest";
import type { Block } from "../../src/data/viewmodel/index.js";
import { cells } from "../../src/presentation/text.js";
import { inkWidth } from "../support/ink.js";
import { DARK_THEME, FULL_CAPS, QUIET, measurable } from "../support/render.js";

/**
 * The clusters that break naïve implementations, one per failure mode. Named
 * rather than generated: a generated corpus finds the same three cases and
 * reports them as a seed nobody can read.
 */
const ADVERSARIAL: readonly Readonly<{ label: string; text: string }>[] = [
  { label: "ASCII", text: "listening on :8080" },
  { label: "CJK", text: "日本語のテキスト" },
  { label: "Hangul", text: "한국어 텍스트" },
  { label: "fullwidth forms", text: "ＦＵＬＬＷＩＤＴＨ" },
  { label: "combining acute", text: `ét́á` },
  { label: "combining stack", text: `à́̂̃` },
  { label: "ZWJ family", text: "👨‍👩‍👧‍👦" },
  { label: "ZWJ family in prose", text: "family: 👨‍👩‍👧‍👦 done" },
  { label: "skin-tone modifier", text: "👍🏽👍🏻👍🏿" },
  { label: "emoji presentation selector", text: "⚠️ warning" },
  { label: "same base, text presentation", text: "⚠ warning" },
  { label: "regional indicators", text: "🇬🇧🇯🇵" },
  { label: "zero-width space", text: "ab​c" },
  { label: "byte-order mark", text: "﻿abc" },
  { label: "mixed CJK and ASCII", text: "api 日本語 worker" },
  { label: "box-drawing glyphs", text: "├─┤ │ ┌┐└┘" },
  { label: "block-plot glyphs", text: "▁▂▃▄▅▆▇█" },
  { label: "status glyphs", text: "✓ ✗ ● ○ ◌ ⊘ ▲ ▌" },
  { label: "ASCII fallbacks", text: "+ x * o . / ! |" },
  { label: "the ellipsis", text: "truncated…" },
];

describe("C09 T2.16 — cells() and Ink agree on width", () => {
  for (const { label, text } of ADVERSARIAL) {
    it(`T2.16 (I16, §3): ${label}`, () => {
      expect(
        cells(text),
        `cells() and Ink disagree on ${JSON.stringify(text)} — ` +
          `report which is right before changing either (C09 §3)`,
      ).toBe(inkWidth(text));
    });
  }

  it("T2.16b (I16, §3): the agreement holds for every glyph in the substitution table", () => {
    // I5 says a fallback is 1:1 by cell count. That claim is made against
    // `cells()`, so it means nothing unless Ink counts the same way — a
    // fallback that is one cell to us and two to Ink shifts the layout by one
    // under ASCII only, which is the hardest kind of drift to reproduce.
    const substitutions: readonly (readonly [string, string])[] = [
      ["─", "-"],
      ["│", "|"],
      ["┌", "+"],
      ["┐", "+"],
      ["└", "+"],
      ["┘", "+"],
      ["├", "+"],
      ["┤", "+"],
      ["…", "~"],
      ["▁", "."],
      ["█", "@"],
      ["✓", "+"],
      ["✗", "x"],
      ["●", "*"],
      ["○", "o"],
      ["◌", "."],
      ["⊘", "/"],
      ["▲", "!"],
      ["▌", "|"],
    ];

    for (const [unicode, ascii] of substitutions) {
      expect(cells(unicode), `cells(${unicode})`).toBe(1);
      expect(cells(ascii), `cells(${ascii})`).toBe(1);
      expect(inkWidth(unicode), `Ink's width of ${unicode}`).toBe(1);
      expect(inkWidth(ascii), `Ink's width of ${ascii}`).toBe(1);
    }
  });
});

/**
 * C09 T2.133–T2.134 — a spacing mark is a cell to the measurer, as it is to Ink
 * and to the terminal (C09 I65, I1).
 *
 * F969's own falsifier: *a `raw` block whose measured height matches Ink's row
 * count with `aः` in it*. `aः` measured 1 to `cells()`, 2 to string-width and
 * 2 to xterm, so a `raw` row padded to the width was one cell over by Ink's
 * measure and Ink wrapped it into a second row the measurer never counted —
 * I1's failure in the direction that scrolls the alternate screen (F978). The
 * row goes through the registry and Ink, as a frame does, rather than through
 * `inkWidth` alone: the number that matters is rows.
 */
describe("C09 T2.133–T2.134 — a spacing mark is a cell to Ink and to the measurer (I65, I1)", () => {
  /** Two of F969's spacing-mark shapes: a Latin base with U+0903, and Devanagari `कि` (U+0915 U+093F). */
  const SPACING = "a\u0903 \u0915\u093f";
  /** The control's shapes: a family and a keycap, whose rules the cluster sum keeps first and unchanged. */
  const EMOJI = "\u{1F468}\u200d\u{1F469}\u200d\u{1F467} 1\ufe0f\u20e3";

  /** `text` padded to exactly `width` cells by the measurer — the row a far side hands over when it pads its own output. */
  const padded = (text: string, width: number): string => `${text}${" ".repeat(width - cells(text))}`;

  /** A `raw` block through the registry and Ink at `width`: its measured height beside the rows Ink rendered. */
  function heights(text: string, width: number): Readonly<{ measured: number; rendered: number }> {
    const kit = measurable({ theme: DARK_THEME, capabilities: FULL_CAPS, onError: QUIET });
    const b: Block = { kind: "raw", id: "r", text };
    return { measured: kit.measure(b, width), rendered: kit.renderToLines(b, width).length }; // cells-ok — rows
  }

  for (const width of [40, 80]) {
    it(`T2.133 (I65, I1): a raw row holding aः and कि, padded to ${String(width)}, measures the rows Ink renders — one`, () => {
      // **Read two rows before the fix, at both widths** — run against the
      // unmodified `clusterCells`, the file restored by copy and compared by
      // digest. The measurer padded `aः कि` to 40 with 37 spaces where Ink
      // counts the text as five cells, so Ink carried the two cells over into a
      // second row the measurer never counted.
      const text = padded(SPACING, width);
      expect(cells(text), "the row is exactly the width by the measurer").toBe(width);
      const { measured, rendered } = heights(text, width);
      expect(measured, "one row, measured").toBe(1);
      expect(rendered, "one row, rendered — two before the fix").toBe(1);
      expect(inkWidth(text, width + 8), "and Ink measures the row at the width, not past it").toBe(width);
    });
  }

  for (const width of [40, 80]) {
    it(`T2.134 (I65): the control — the same row with a family and a keycap at ${String(width)} is one row before and after, because the emoji rules did not move`, () => {
      // The control T2.133 owes. A family is two cells and a keycap two, to the
      // measurer and to Ink alike, on the rules the cluster sum asks first —
      // so this row was green on the tree that failed T2.133, and it says the
      // shapes and not the mechanism are what T2.133 measures.
      const text = padded(EMOJI, width);
      expect(cells(text), "the row is exactly the width by the measurer").toBe(width);
      const { measured, rendered } = heights(text, width);
      expect(measured, "one row, measured").toBe(1);
      expect(rendered, "one row, rendered").toBe(1);
      expect(inkWidth(text, width + 8), "and Ink agrees on the width").toBe(width);
    });
  }
});
