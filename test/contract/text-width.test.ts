// C09 I65, I1 — a spacing mark is a cell to the measurer, and the height it
// gives is the height that renders.
//
// **This file was T2.16, the width two implementations compute**, and the other
// implementation is gone. `cells()` is ours, because a width library would not
// be the implementation the measurer uses (DEPENDENCIES.md, C09 I6); Ink
// measured text too, with its own, and used the answer to decide where a box
// ended and whether a line wrapped. The duplication could not be removed — only
// pinned — and F1209 removed the second copy instead.
//
// **The pair retires rather than being kept green over an absent arm** (A03 §2's
// vacuity class): with one implementation there is nothing to compare, and a row
// asserting `cells(x) === cells(x)` reads exactly like a row that is satisfied.
// The adversarial corpus it swept — CJK, ZWJ families, skin tones, regional
// indicators, the substitution table — is not lost; `cells()` is held to it by
// T1.37, T1.38 and the tier-6 reverts, and to a real terminal by the terminal
// baseline's 2,440 committed frames, which move on a width drift.
//
// What is kept here is the half that never needed Ink: a row padded to the width
// by the measurer measures and renders one row.
import { describe, expect, it } from "vitest";
import type { Block } from "../../src/data/viewmodel/index.js";
import { cells } from "../../src/presentation/text.js";
import { DARK_THEME, FULL_CAPS, QUIET, measurable } from "../support/render.js";

/**
 * C09 T2.133–T2.134 — a spacing mark is a cell to the measurer, as it is to the
 * terminal (C09 I65, I1).
 *
 * F969's own falsifier: *a `raw` block whose measured height matches Ink's row
 * count with `aः` in it*. `aः` measured 1 to `cells()`, 2 to string-width and
 * 2 to xterm, so a `raw` row padded to the width was one cell over by Ink's
 * measure and Ink wrapped it into a second row the measurer never counted —
 * I1's failure in the direction that scrolls the alternate screen (F978). The
 * row goes through the registry, as a frame does, rather than through a width
 * call alone: the number that matters is rows. Ink was the compositor when this
 * was written and the wrap was its; since F1209 an over-full row is cut by
 * `sliceCells` rather than wrapped, so the direction of the failure has changed
 * and the pair — measured against rendered — has not.
 */
describe("C09 T2.133–T2.134 — a spacing mark is a cell to the measurer and to the terminal (I65, I1)", () => {
  /** Two of F969's spacing-mark shapes: a Latin base with U+0903, and Devanagari `कि` (U+0915 U+093F). */
  const SPACING = "a\u0903 \u0915\u093f";
  /** The control's shapes: a family and a keycap, whose rules the cluster sum keeps first and unchanged. */
  const EMOJI = "\u{1F468}\u200d\u{1F469}\u200d\u{1F467} 1\ufe0f\u20e3";

  /** `text` padded to exactly `width` cells by the measurer — the row a far side hands over when it pads its own output. */
  const padded = (text: string, width: number): string => `${text}${" ".repeat(width - cells(text))}`;

  /** A `raw` block through the registry at `width`: its measured height beside the rows rendered. */
  function heights(text: string, width: number): Readonly<{ measured: number; rendered: number }> {
    const kit = measurable({ theme: DARK_THEME, capabilities: FULL_CAPS, onError: QUIET });
    const b: Block = { kind: "raw", id: "r", text };
    return { measured: kit.measure(b, width), rendered: kit.renderToLines(b, width).length }; // cells-ok — rows
  }

  for (const width of [40, 80]) {
    it(`T2.133 (I65, I1): a raw row holding aः and कि, padded to ${String(width)}, measures the rows it renders — one`, () => {
      // **Read two rows before the fix, at both widths** — run against the
      // unmodified `clusterCells`, the file restored by copy and compared by
      // digest. The measurer padded `aः कि` to 40 with 37 spaces where the
      // terminal counts the text as five cells, so the compositor of the day
      // carried the two cells over into a second row the measurer never counted.
      const text = padded(SPACING, width);
      expect(cells(text), "the row is exactly the width by the measurer").toBe(width);
      const { measured, rendered } = heights(text, width);
      expect(measured, "one row, measured").toBe(1);
      expect(rendered, "one row, rendered — two before the fix").toBe(1);
    });
  }

  for (const width of [40, 80]) {
    it(`T2.134 (I65): the control — the same row with a family and a keycap at ${String(width)} is one row before and after, because the emoji rules did not move`, () => {
      // The control T2.133 owes. A family is two cells and a keycap two, to the
      // measurer and to the terminal alike, on the rules the cluster sum asks first —
      // so this row was green on the tree that failed T2.133, and it says the
      // shapes and not the mechanism are what T2.133 measures.
      const text = padded(EMOJI, width);
      expect(cells(text), "the row is exactly the width by the measurer").toBe(width);
      const { measured, rendered } = heights(text, width);
      expect(measured, "one row, measured").toBe(1);
      expect(rendered, "one row, rendered").toBe(1);
    });
  }
});
