/**
 * The overlay's two renderings (C04 I74, §3h.2 · C09 I36).
 *
 * **One field, two arms, and the split is not a preference.** At the dither this
 * framework owns the glyph and the colour: the braille cell carries the picture
 * and the foreground carries the overlay, so C10's colormap, its 8-bit floor and
 * every degradation rung apply unchanged. At `kitty` the cell's rendering is the
 * terminal's — `placeholderCell`'s own comment says why, written for the id and
 * true of the overlay: the two diacritics are spent on position and the 24-bit
 * foreground on the image id, so **anything drawn there is replaced by the image
 * tile**. The overlay therefore goes into the pixels before transmission.
 *
 * **The composited arm gives up the palette and the degradation at `kitty`
 * specifically**, and that is worth stating rather than inheriting: it cannot
 * degrade because there is nothing below `kitty` for it to degrade *to*. The
 * dither is a different rendering, not a lower rung of the same one.
 */
import { COLORMAPS, continuousColour } from "../theme/colormap.js";
import { DEFAULT_OVERLAY_COLORMAP, overlayRange } from "../../data/viewmodel/overlay.js";
import type { ImageOverlay } from "../../data/viewmodel/types.js";
import type { ColourValue } from "../theme/types.js";
import type { Pixels } from "./codec.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";

/** How much of a composited pixel is the overlay when the block declares nothing. */
export const DEFAULT_OVERLAY_ALPHA = 0.5;

/**
 * The overlay's value at a normalised cell, averaged over the source region.
 *
 * **Averaged rather than point-sampled**, and that is a defect this repository
 * has already paid for once (ID4): a point sample of a 7x7 map into a 40-cell
 * row reads seven values and repeats each of them, so a gradient becomes a
 * staircase and a single hot cell can vanish entirely between two samples.
 */
function region(
  values: readonly (readonly number[])[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const h = values.length; // cells-ok — a row count
  const w = (values[0] ?? []).length; // cells-ok — a column count
  const lo = Math.max(0, Math.min(w - 1, Math.floor(x0))); // cells-ok — a matrix index
  const hi = Math.max(lo + 1, Math.min(w, Math.ceil(x1))); // cells-ok — a matrix index
  const top = Math.max(0, Math.min(h - 1, Math.floor(y0))); // cells-ok — a matrix index
  const bot = Math.max(top + 1, Math.min(h, Math.ceil(y1))); // cells-ok — a matrix index
  let sum = 0;
  let n = 0; // cells-ok — a sample count
  for (let y = top; y < bot; y += 1) { // cells-ok — a matrix index
    for (let x = lo; x < hi; x += 1) { // cells-ok — a matrix index
      sum += values[y]?.[x] ?? 0;
      n += 1;
    }
  }
  return n === 0 ? 0 : sum / n;
}

/**
 * The overlay resampled to a `cols x rows` grid and normalised to `0..1`.
 *
 * **The resample is the renderer's and the resolution is the author's**, because
 * the cell rectangle is `imageCells(block, width)` — a function of the render
 * width, which a block cannot know at construction (C04 I74).
 */
export function overlayField(
  overlay: ImageOverlay,
  cols: number,
  rows: number,
): readonly (readonly number[])[] {
  const { min, max } = overlayRange(overlay);
  const span = max - min;
  const h = overlay.values.length; // cells-ok — a row count
  const w = (overlay.values[0] ?? []).length; // cells-ok — a column count
  const sx = w / Math.max(1, cols);
  const sy = h / Math.max(1, rows);
  const out: number[][] = [];
  for (let r = 0; r < rows; r += 1) { // cells-ok — a cell index
    const line: number[] = [];
    for (let c = 0; c < cols; c += 1) { // cells-ok — a cell index
      const v = region(overlay.values, c * sx, r * sy, (c + 1) * sx, (r + 1) * sy);
      const t = (v - min) / span;
      line.push(t < 0 ? 0 : t > 1 ? 1 : t);
    }
    out.push(line);
  }
  return out;
}

/**
 * The colour a normalised overlay value takes, or `undefined` for *no colour*.
 *
 * **The floor is C10 I31's and is inherited rather than invented.** Below 8-bit
 * a continuous map is an ordering over sixteen indices whose luminances nobody
 * reports, so `continuousColour` gives nothing — and here that means the overlay
 * does not draw. **There is no rung under it**, because the cell's other axis is
 * already spent: the glyph carries the picture. A threshold-to-tone rung would
 * put a *binary mask* on screen wearing a continuous field's clothes, which is
 * the substitution this repository refuses everywhere else.
 */
export function overlayColour(
  overlay: ImageOverlay,
  t: number,
  caps: Pick<TerminalCapabilities, "colourDepth">,
): ColourValue | undefined {
  const map = COLORMAPS[overlay.colormap ?? DEFAULT_OVERLAY_COLORMAP];
  return map === undefined ? undefined : continuousColour(map, t, caps);
}

/**
 * The pixels with the overlay blended in — the `kitty` arm's picture.
 *
 * **A new buffer rather than a mutation**, because `pixelsOf` memoises the
 * decode on the digest and two blocks may share it: compositing in place would
 * put the first block's overlay under the second block's placement, which is the
 * *wrong picture drawn* rather than nothing drawn.
 *
 * The alpha is a straight lerp toward the colormap's colour, which is
 * matplotlib's two-`imshow` idiom and the reference this form is compared
 * against. **At 24 bits and unconditionally**: the composited arm is `kitty`'s
 * and `kitty` carries truecolour, so quantising here would be answering a
 * question the terminal does not ask.
 */
export function compositeOverlay(px: Pixels, overlay: ImageOverlay): Pixels {
  const { min, max } = overlayRange(overlay);
  const span = max - min;
  const map = COLORMAPS[overlay.colormap ?? DEFAULT_OVERLAY_COLORMAP];
  if (map === undefined) return px;
  const alpha = overlay.alpha ?? DEFAULT_OVERLAY_ALPHA;
  const h = overlay.values.length; // cells-ok — a row count
  const w = (overlay.values[0] ?? []).length; // cells-ok — a column count
  const sx = w / px.width;
  const sy = h / px.height;
  const out = new Uint8Array(px.data.length); // cells-ok — a byte count
  out.set(px.data);
  for (let y = 0; y < px.height; y += 1) { // cells-ok — a pixel index
    for (let x = 0; x < px.width; x += 1) { // cells-ok — a pixel index
      const v = region(overlay.values, x * sx, y * sy, (x + 1) * sx, (y + 1) * sy);
      const t0 = (v - min) / span;
      const t = t0 < 0 ? 0 : t0 > 1 ? 1 : t0;
      const c = continuousColour(map, t, { colourDepth: 24 });
      if (c === undefined || c.kind !== "rgb") continue;
      const hex = c.hex;
      const i = (y * px.width + x) * 4; // cells-ok — a byte index
      for (let ch = 0; ch < 3; ch += 1) { // cells-ok — a channel index
        const target = Number.parseInt(hex.slice(1 + ch * 2, 3 + ch * 2), 16);
        const base = out[i + ch] ?? 0;
        out[i + ch] = Math.round(base * (1 - alpha) + target * alpha);
      }
    }
  }
  return { width: px.width, height: px.height, data: out };
}
