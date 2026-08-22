/**
 * The image block's two halves (C04 I73 · C09 I36, §4c).
 *
 * **The dither is the arm that runs on most terminals**, so it is the one built
 * first and the one every capability set but `kitty` reaches.
 */
import { Box, Text } from "ink";
import { createElement, type ReactElement } from "react";
import { columnsForAspect } from "../../plot/aspect.js";
import { decodePng, ditherAscii, ditherBraille, type Pixels } from "../../image/index.js";
import { imageId, placementRows } from "../../image/kitty.js";
import type { Image } from "../../../data/viewmodel/index.js";
import { truncate } from "../../text.js";
import type { BlockDefinition, RenderContext } from "../types.js";

/**
 * Decoded pixels, memoised on the block's digest.
 *
 * **On the digest and never on the data**, which is what §3g.2's identity is for:
 * `measure` and `render` both need the dimensions, and a decode per call would
 * do the expensive half twice per frame. `lowlight`'s memoisation on
 * `(text, language)` is the precedent.
 */
const DECODED = new Map<string, Pixels | null>();

function pixelsOf(block: Image): Pixels | null {
  const held = DECODED.get(block.digest);
  if (held !== undefined) return held;
  let decoded: Pixels | null = null;
  try {
    const r = decodePng(Uint8Array.from(Buffer.from(block.data, "base64")));
    decoded = r.ok ? r.pixels : null;
  } catch {
    decoded = null;
  }
  DECODED.set(block.digest, decoded);
  return decoded;
}

/**
 * The cells an image occupies at a width — **derived, then clamped** (§3g.3).
 *
 * A cell is twice as tall as it is wide (`CELL_ASPECT`), so `rows` cells of an
 * image `w` by `h` pixels is `rows · 2 · w/h` columns. **If that exceeds the
 * region the whole image scales down**, which costs rows — and `measure`
 * receives the width, so it is expressible without a second pass.
 *
 * **The geometry is the guarantee, not a clip** (C09 I35, F245): a placeholder
 * outside its rectangle addresses part of an image the terminal is not drawing
 * there, so over-drawing here is worse than wrong.
 */
export function imageCells(block: Image, width: number): { cols: number; rows: number } {
  const px = pixelsOf(block);
  const w = Math.max(1, Math.floor(width)); // cells-ok — a cell count
  const declared = Math.max(1, block.height); // cells-ok — a row count
  if (px === null) return { cols: Math.min(w, 20), rows: declared }; // cells-ok — a cell count
  const aspect = px.width / px.height;
  const natural = columnsForAspect(declared, aspect);
  if (natural <= w) return { cols: natural, rows: declared };
  // Scaled to the width, and the rows follow rather than being kept.
  const scaled = Math.max(1, Math.round(w / (2 * aspect))); // cells-ok — a row count
  return { cols: w, rows: Math.min(declared, scaled) }; // cells-ok — a row count
}

export const imageDefinition: BlockDefinition<Image> = {
  kind: "image",

  /** The clamped row count — never the declared one when the width bites. */
  measure(block: Image, width: number): number {
    return imageCells(block, width).rows;
  },

  render(block: Image, ctx: RenderContext): ReactElement {
    const { cols, rows } = imageCells(block, ctx.width);
    const px = pixelsOf(block);

    // **A block whose bytes do not decode falls back to its `alt`** rather than
    // throwing. The registry's containment would draw an error box of the
    // committed height, which is right for a renderer that gave way and wrong
    // for an image that simply is not one — and `alt` is the field that exists
    // for a reader with no pixels (C04 I73).
    if (px === null) {
      // **Truncated by C09's own function and padded with a space**, and both
      // halves were defects in the first draft. Ink's `wrap: "truncate"` emits
      // `…` at every capability, where I22 substitutes `~` under `ascii`; and an
      // empty `Text` occupies **no row**, so a three-row block drew one and I1
      // came apart on the corpus at every width.
      const alt = truncate(block.alt, cols, ctx.capabilities);
      return createElement(
        Box,
        { flexDirection: "column", width: cols },
        Array.from({ length: rows }, (_, i) =>
          createElement(Text, { key: String(i) }, i === 0 ? alt : " "),
        ),
      );
    }

    // **The protocol arm, restored now that `transmitImage` exists** (C09 §4c).
    // Only the *placeholders* travel through Ink — they are ordinary text. The
    // transmission is the shell's, prefixed to the frame's bytes, because Ink
    // strips APC escapes and a placement without one draws nothing.
    //
    // **A placement past the encoding falls back to the dither** rather than
    // wrapping a diacritic: a wrapped one addresses the wrong part of the image,
    // which is a plausible wrong picture — the failure this arm is built to
    // avoid, and the one a reader cannot diagnose.
    const placed =
      ctx.capabilities.imageProtocol === "kitty" ? placementRows(imageId(block.digest), cols, rows) : null;
    const lines =
      placed !== null && "rows" in placed
        ? placed.rows
        : ctx.capabilities.unicode === "ascii"
          ? ditherAscii(px, cols, rows)
          : ditherBraille(px, cols, rows);

    return createElement(
      Box,
      { flexDirection: "column", width: cols },
      lines.map((line, i) => createElement(Text, { key: String(i) }, line)),
    );
  },
};
