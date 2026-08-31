/**
 * The half-block arm — two colours a cell (C09 §4c, C09 I37).
 *
 * **This is the rung between `kitty` and the dither**, and the trade it makes is
 * the opposite one. A braille cell carries eight dots at one bit, so the picture
 * is *shape*; `▀` carries **two pixels at twenty-four**, so the picture is
 * *colour*. A gradient braille can only stipple arrives here as a gradient, and
 * a photograph stops being a texture — at a quarter of the vertical resolution
 * and half the horizontal, which is what makes the dither the better rung for a
 * line drawing and the ladder a capability ladder rather than a choice.
 *
 * **The colour is the datum, which is why one is embedded here at all.** C10
 * owns every palette slot and a block names one rather than a value; an image's
 * pixels are not a slot and never were. `paint.ts`'s `wash` carries the same
 * exemption in the same words — *a run of blank cells whose background is the
 * datum* — and this is the second consumer of it. Nothing here consults a theme,
 * and there is no degradation to a slot because there is no slot to degrade to.
 */
import { nearestAnsi256 } from "../theme/colormap.js";
import type { ColourValue } from "../theme/types.js";
import type { Pixels } from "./codec.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";

/**
 * `U+2580 UPPER HALF BLOCK`. The foreground paints the top pixel and the
 * background the bottom, so one cell carries two.
 *
 * **Not a `Glyph` slot and not a ramp vocabulary.** SS39's table is the set of
 * *rôles* a block names — `ok`, `warn`, `expand` — and SS51's four are the
 * alphabets a ladder indexes. This is neither: it is a rendering primitive, the
 * same kind of thing as `raster.ts`'s braille base and `DITHER_ASCII`, and it
 * lives beside the function that emits it for the same reason they do.
 */
export const HALF_BLOCK = "▀";

/** One cell: the pixel above the midline and the pixel below it. */
export type HalfCell = Readonly<{ top: ColourValue; bottom: ColourValue }>;

/**
 * Whether the terminal **and the block** can take this rung (C09 I37, C09 §8b).
 *
 * Three gates, and none is a proxy for another.
 *
 * **`ambiguousWidth`, which is the one that would have shipped.** `▀` is
 * `East_Asian_Width=Ambiguous` — `cells()` itself answers 1 under `narrow` and 2
 * under `wide` — so a terminal declaring `wide` draws every cell of the picture
 * at double the width `imageCells` measured for it. **Braille is not ambiguous**
 * (`⣿` is 1 at both), which is exactly why the arm below has never met this.
 * `art.ts`'s `eligible` and `mermaid.ts`'s `useAscii` are the same switch; this
 * is the third consumer (C02 I9, A03 SS50).
 *
 * **`colourDepth`, because the rung's whole claim is two colours a cell.** At 4
 * there are sixteen and at 1 there are none, so below 8 this has nothing the
 * dither lacks and has paid three quarters of the resolution for it.
 *
 * **The overlay, and it is the block that decides rather than the terminal.** A
 * dithered image puts the picture in the glyph and the field in the foreground,
 * which works because those channels are independent. Here **both colour
 * channels are already the picture**, so the field has nowhere to go — and
 * unlike 1-bit, where C10 I31 draws the picture plain because the cell has
 * nothing left at all, there is a rung below that can still carry it.
 */
export function halfBlockEligible(
  caps: Pick<TerminalCapabilities, "unicode" | "ambiguousWidth" | "colourDepth">,
  hasOverlay: boolean,
): boolean {
  return (
    !hasOverlay &&
    caps.unicode !== "ascii" &&
    caps.ambiguousWidth !== "wide" &&
    caps.colourDepth >= 8
  );
}

/**
 * The mean colour of the source rectangle one sample covers, over black.
 *
 * **Averaged rather than point-sampled**, for `dither.ts`'s reason and more
 * sharply: this arm exists to draw photographs, and a 2000-pixel image
 * nearest-sampled into eighty columns is aliasing rather than a picture.
 *
 * **Over black**, which is `luminance`'s convention one file over and is stated
 * there — this layer does not know the theme's background and asking would put
 * a colour where C10 owns one.
 *
 * **The clamps are `dither.ts`'s and they are defensive rather than load-
 * bearing — measured, not assumed** (F412). The mutation pass asked: removing
 * the `Math.min(px.height - 1, …)` cap fails nothing, because it never fires.
 * Swept over every `(W, H, cols, rows)` in `1..60 x 1..60 x 1..40 x 1..20` —
 * **1.24 billion samples, and not one of the four clamps binds.** The
 * coordinates are fractions of the image's own extent, so they cannot leave it.
 *
 * **C09 §8b's G9 named the wrong mechanism** and its outcome is still right. The
 * `y * 2 + 1` that indexes off the end of a one-row image is a **point-sampling**
 * implementation's hazard; this one averages over `[(2r)·sy, (2r+1)·sy)` with
 * `sy = height / (2·rows)`, and at one pixel both halves resolve to row 0 by the
 * arithmetic rather than by a guard. The clamps stay because they are this
 * *function's* contract — it takes four numbers and must be total — but nothing
 * here depends on them, and a comment claiming otherwise is a guard that reads
 * as load-bearing and would survive being deleted.
 */
function sampleRgb(px: Pixels, x0: number, y0: number, x1: number, y1: number): string {
  const lo = Math.max(0, Math.min(px.width - 1, Math.floor(x0))); // cells-ok — a pixel index
  const hi = Math.max(lo + 1, Math.min(px.width, Math.ceil(x1))); // cells-ok — a pixel index
  const top = Math.max(0, Math.min(px.height - 1, Math.floor(y0))); // cells-ok — a pixel index
  const bot = Math.max(top + 1, Math.min(px.height, Math.ceil(y1))); // cells-ok — a pixel index
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0; // cells-ok — a sample count
  for (let y = top; y < bot; y += 1) { // cells-ok — a pixel index
    for (let x = lo; x < hi; x += 1) { // cells-ok — a pixel index
      const i = (y * px.width + x) * 4; // cells-ok — a byte offset
      const a = (px.data[i + 3] ?? 255) / 255;
      r += (px.data[i] ?? 0) * a;
      g += (px.data[i + 1] ?? 0) * a;
      b += (px.data[i + 2] ?? 0) * a;
      n += 1;
    }
  }
  if (n === 0) return "#000000";
  const hex = (v: number): string => Math.round(v / n).toString(16).padStart(2, "0"); // cells-ok — a digit count
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/**
 * The colour at the depth the terminal has.
 *
 * **At 8 both channels go through `nearestAnsi256`**, the funnel C10's colormap
 * already uses — so the 8-bit picture is the 24-bit one quantised rather than a
 * second rendering, and a fault in the sampling shows identically at both.
 */
function at(hex: string, depth: number): ColourValue {
  return depth >= 24 ? { kind: "rgb", hex } : { kind: "ansi256", index: nearestAnsi256(hex) };
}

/**
 * `rows` by `cols` cells, each carrying the two pixels it covers.
 *
 * The caller paints them: `HALF_BLOCK` with `top` as the foreground and
 * `bottom` as the background. This returns colours rather than spans because
 * `paint` lives in `blocks/`, which imports *this* module — the edge runs one
 * way and L1's acyclicity is what makes it a rule (A02 §1).
 */
export function halfBlockRows(
  px: Pixels,
  cols: number,
  rows: number,
  depth: number,
): readonly (readonly HalfCell[])[] {
  const w = Math.max(1, cols); // cells-ok — a cell count
  const h = Math.max(1, rows); // cells-ok — a cell count
  const sx = px.width / w;
  const sy = px.height / (h * 2); // cells-ok — two pixel rows a cell
  const out: HalfCell[][] = [];
  for (let r = 0; r < h; r += 1) { // cells-ok — a row index
    const line: HalfCell[] = [];
    for (let c = 0; c < w; c += 1) { // cells-ok — a column index
      const upper = (r * 2) * sy; // cells-ok — a pixel coordinate
      const mid = (r * 2 + 1) * sy; // cells-ok — a pixel coordinate
      const lower = (r * 2 + 2) * sy; // cells-ok — a pixel coordinate
      line.push({
        top: at(sampleRgb(px, c * sx, upper, (c + 1) * sx, mid), depth),
        bottom: at(sampleRgb(px, c * sx, mid, (c + 1) * sx, lower), depth),
      });
    }
    out.push(line);
  }
  return out;
}
