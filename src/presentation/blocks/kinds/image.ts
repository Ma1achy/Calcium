/**
 * The image block's two halves (C04 I73 · C09 I36, §4c).
 *
 * **The dither is the arm that runs on most terminals**, so it is the one built
 * first and the one every capability set but `kitty` reaches.
 */
import { Box, Text } from "ink";
import { createElement, type ReactElement } from "react";
import { columnsForAspect } from "../../plot/aspect.js";
import {
  decodePng,
  ditherAscii,
  ditherBraille,
  HALF_BLOCK,
  halfBlockEligible,
  halfBlockRows,
  type Decoded,
  type Pixels,
} from "../../image/index.js";
import { imageId, imageKey, placementRows } from "../../image/kitty.js";
import { overlayColour, overlayField } from "../../image/overlay.js";
import { paint, type Span } from "../paint.js";
import { statusDefinition } from "./status.js";
import type { Image, Status } from "../../../data/viewmodel/index.js";
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
const DECODED = new Map<string, Decoded>();

/**
 * The decode, **kept whole** (I38, F410).
 *
 * This memoised `Pixels | null` and dropped the `fault` on the floor, so a
 * corrupt file and a format `decodePng` names as deliberately unbuilt reached
 * the reader as the same `alt`. The reason is computed for every refusal; it
 * cost nothing to keep and a reader could never see one.
 */
function decodedOf(block: Image): Decoded {
  const held = DECODED.get(block.digest);
  if (held !== undefined) return held;
  let decoded: Decoded;
  try {
    decoded = decodePng(Uint8Array.from(Buffer.from(block.data, "base64")));
  } catch {
    // **The one refusal `decodePng` cannot phrase**, because it never received
    // bytes: `Buffer.from(…, "base64")` is lenient and `Uint8Array.from` is not.
    decoded = { ok: false, fault: "the block's data is not base64" };
  }
  DECODED.set(block.digest, decoded);
  return decoded;
}

function pixelsOf(block: Image): Pixels | null {
  const decoded = decodedOf(block);
  return decoded.ok ? decoded.pixels : null;
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

/**
 * The refusal, as the block the rest of the framework draws for one (I38).
 *
 * **`error` and never `retrying`**: no attempt is coming, and the two states
 * differ by exactly that. The height is the caller's, so the box cannot argue
 * with what `measure` already returned (C09 I31).
 *
 * **The id is derived from the block's**, because C04 I14 addresses by id and two
 * images failing in one document would otherwise refuse the whole thing.
 */
function faultStatus(block: Image, fault: string, height: number): Status {
  return { kind: "status", id: `${block.id}-fault`, state: "error", message: fault, height } as Status;
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

    // **A block whose bytes do not decode draws the refusal, with the reason**
    // (I38, F410). It drew `alt` for every one of them, and the ruling that put
    // it there was right about what it rejected — *the registry's containment
    // would draw an error box of the committed height, which is right for a
    // renderer that gave way and wrong for an image that simply is not one*. The
    // third option is the one that did not exist when it was written: the
    // `status` box, whose `error` state means *an operation failed and nothing
    // more is coming* (§3a), which is exactly what a refused decode is.
    //
    // **`alt` is not displaced, it is placed under the box** — it was always the
    // caption for a reader with no pixels (C04 I73), and a caption is what it
    // still is. Where the block committed one row there is no caption, because
    // the box says which refusal and `alt` says what the picture was, and the
    // first is the one a reader cannot recover any other way.
    if (px === null) {
      const decoded = decodedOf(block);
      const fault = decoded.ok ? "" : decoded.fault;
      const boxRows = rows >= 2 ? rows - 1 : rows; // cells-ok — a row count
      const box = statusDefinition.render(faultStatus(block, fault, boxRows), ctx);
      if (rows < 2) return box;
      // **Truncated by C09's own function**, not by Ink's `wrap`, which emits
      // `…` at every capability where I22 substitutes `~` under `ascii`.
      const alt = truncate(block.alt, ctx.width, ctx.capabilities);
      return createElement(
        Box,
        { flexDirection: "column", width: ctx.width },
        createElement(Box, { key: "box" }, box),
        createElement(Text, { key: "alt", dimColor: true }, alt),
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
      ctx.capabilities.imageProtocol === "kitty"
        ? placementRows(imageId(imageKey(block)), cols, rows)
        : null;
    if (placed !== null && "rows" in placed) {
      // **The overlay is not here at `kitty` and that is the whole ruling**
      // (C04 §3h.2): the cell's rendering is the terminal's, so it is composited
      // into the pixels by `transmitImage` before the bytes ever leave L4.
      return createElement(
        Box,
        { flexDirection: "column", width: cols },
        placed.rows.map((line, i) => createElement(Text, { key: String(i) }, line)),
      );
    }

    // **The half-block rung, and the refused placement re-enters here** (I37,
    // §8b G3, F409). This read `unicode === "ascii" ? ascii : braille` and was
    // correct while the glyph ladder had two rungs; the third is what made the
    // kitty fallback a defect. `placementRows` refuses a placement past the
    // diacritic encoding's span, and **a kitty terminal is non-`ascii` and at
    // least 8-bit by construction** — so the one terminal reaching that branch
    // is the one qualifying for every rung of the ladder, and it was landing on
    // the bottom of it. Neither frame shows that: both draw a picture, and both
    // are the right size.
    if (halfBlockEligible(ctx.capabilities, block.overlay !== undefined)) {
      const cellRows = halfBlockRows(px, cols, rows, ctx.capabilities.colourDepth);
      return createElement(
        Box,
        { flexDirection: "column", width: cols },
        cellRows.map((line, i) =>
          createElement(
            Text,
            { key: String(i) },
            paint(line.map((cell) => ({ text: HALF_BLOCK, style: { colour: cell.top, background: cell.bottom } }))),
          ),
        ),
      );
    }

    const dithered =
      ctx.capabilities.unicode === "ascii" ? ditherAscii(px, cols, rows) : ditherBraille(px, cols, rows);

    // **The dither arm places the overlay** — the glyph carries the picture and
    // the foreground carries the field, so C10's colormap and its 8-bit floor
    // apply unchanged. Below the floor `overlayColour` gives nothing and the
    // picture is drawn plain, which is the honest rung: the cell's other axis is
    // already spent, so there is nothing to degrade *to* (C10 I31).
    const lines =
      block.overlay === undefined
        ? dithered
        : ((): readonly string[] => {
            const field = overlayField(block.overlay, cols, rows);
            return dithered.map((line, r) => {
              const spans: Span[] = [];
              // Split by code point: a braille cell and a ramp glyph are both
              // one cell and one code point, so the index is the column.
              for (const [c, ch] of [...line].entries()) {
                const t = field[r]?.[c] ?? 0;
                const colour = overlayColour(block.overlay as NonNullable<typeof block.overlay>, t, ctx.capabilities);
                spans.push(colour === undefined ? { text: ch } : { text: ch, style: { colour } });
              }
              return paint(spans);
            });
          })();

    return createElement(
      Box,
      { flexDirection: "column", width: cols },
      lines.map((line, i) => createElement(Text, { key: String(i) }, line)),
    );
  },
};
