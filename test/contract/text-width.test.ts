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
import { cells } from "../../src/presentation/text.js";
import { inkWidth } from "../support/ink.js";

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
    it(`T2.16 (§3): ${label}`, () => {
      expect(
        cells(text),
        `cells() and Ink disagree on ${JSON.stringify(text)} — ` +
          `report which is right before changing either (C09 §3)`,
      ).toBe(inkWidth(text));
    });
  }

  it("T2.16b (§3): the agreement holds for every glyph in the substitution table", () => {
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
