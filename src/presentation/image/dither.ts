/**
 * An ordered dither, and it is the **first** arm rather than the last (C09 I36).
 *
 * **Most terminals are `imageProtocol: "none"`**, so a feature that shows nothing
 * there is a feature most readers never see. The protocol arm is built onto this
 * one and not the other way round.
 *
 * **The matrix is designed here because it is designed nowhere.**
 * `CALCIUM_IMAGES_NOTE.md` says the braille dither is already designed as *the
 * 3D renderer's ordered-dither over a 2×4 Bayer matrix*; there is no 3D renderer,
 * no such design in any file, and the roadmap lists 3D plots under *deliberately
 * not doing*. The note's own preface records that.
 *
 * **`plot/raster.ts` is reused rather than reimplemented** — `BRAILLE_DOTS`, the
 * standard bit assignment and `foldBraille` are already there, *one grid, two
 * folders*, so no braille code is added here.
 */
import { BRAILLE_DOTS, createGrid, foldBraille, setDot } from "../plot/raster.js";
import type { Pixels } from "./codec.js";

/**
 * The ordered Bayer matrix, as thresholds in `[0, 1)`.
 *
 * **The pattern varies with position and that is the whole point.** A flat
 * threshold turns a gradient into stripes — every cell of one intensity resolves
 * the same way, so the picture bands. Offsetting by *where* a dot is breaks the
 * bands into texture, which is what makes a photograph readable at eight dots a
 * cell.
 *
 * **8×8 rather than 4×4, and the frame is what chose it** (C09 §4c). The note's
 * *2×4 Bayer matrix* was taken as a 4×4 and built, and a 4×4 has a defect only a
 * figure shows: **its y-period is 4 and a braille cell is 4 dots tall**, so a
 * flat region resolves identically in every cell row and reads as one repeated
 * glyph.
 *
 * **The upgrade was measured before it was taken, and the first measurement
 * undercut it**: on a flat field at 0.25, 0.5 and 0.75 the two frames were
 * *identical*, so the extra 48 thresholds bought nothing there. Between quadrant
 * boundaries they separate — at **0.28** the 4×4 draws one glyph everywhere and
 * this resolves two, and at 0.3 and 0.55 it varies between cell rows where the
 * 4×4 cannot.
 *
 * **Built by the standard recurrence rather than written out**, so the sixty-four
 * values cannot be mistyped and the construction is the documentation.
 */
const BAYER2: readonly (readonly number[])[] = Object.freeze([
  Object.freeze([0, 2]),
  Object.freeze([3, 1]),
]);

function grow(m: readonly (readonly number[])[]): readonly (readonly number[])[] {
  const n = m.length; // cells-ok — a matrix side
  const out: number[][] = Array.from({ length: n * 2 }, () => new Array<number>(n * 2).fill(0));
  for (let y = 0; y < n; y += 1) { // cells-ok — a matrix index
    for (let x = 0; x < n; x += 1) { // cells-ok — a matrix index
      const v = (m[y]?.[x] ?? 0) * 4;
      const rowA = out[y];
      const rowB = out[y + n];
      if (rowA !== undefined) {
        rowA[x] = v;
        rowA[x + n] = v + 2;
      }
      if (rowB !== undefined) {
        rowB[x] = v + 3;
        rowB[x + n] = v + 1;
      }
    }
  }
  return Object.freeze(out.map((r) => Object.freeze(r)));
}

const BAYER8 = grow(grow(BAYER2));

/** The ASCII arm's ramp, lightest to heaviest. Nine steps including blank. */
export const DITHER_ASCII = " .:-=+*#@";

/** `BAYER8` normalised, so a caller never divides by 64 by hand. */
export function bayer(x: number, y: number): number {
  const n = BAYER8.length; // cells-ok — a matrix side
  const row = BAYER8[((y % n) + n) % n] ?? BAYER8[0] ?? [];
  return ((row[((x % n) + n) % n] ?? 0) + 0.5) / (n * n);
}

/**
 * One pixel's luminance in `[0, 1]`, composited over black.
 *
 * **Over black rather than over the theme's background**, because this layer
 * does not know it and asking would put a colour where C10 owns one. Transparent
 * is therefore dark, which is the answer that leaves a PNG with an alpha channel
 * looking like the thing it is a picture of rather than a silhouette.
 */
export function luminance(px: Pixels, x: number, y: number): number {
  const i = (y * px.width + x) * 4; // cells-ok — a byte offset
  const a = (px.data[i + 3] ?? 255) / 255;
  const r = (px.data[i] ?? 0) / 255;
  const g = (px.data[i + 1] ?? 0) / 255;
  const b = (px.data[i + 2] ?? 0) / 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) * a;
}

/**
 * The mean luminance of the source rectangle one output sample covers.
 *
 * **Averaged rather than point-sampled**, because a dither at a fraction of the
 * source resolution is exactly where nearest-neighbour turns a photograph into
 * aliasing — and the whole argument for the dither is that it is *genuinely
 * readable* rather than merely present.
 */
function sample(px: Pixels, x0: number, y0: number, x1: number, y1: number): number {
  const lo = Math.max(0, Math.min(px.width - 1, Math.floor(x0))); // cells-ok — a pixel index
  const hi = Math.max(lo + 1, Math.min(px.width, Math.ceil(x1))); // cells-ok — a pixel index
  const top = Math.max(0, Math.min(px.height - 1, Math.floor(y0))); // cells-ok — a pixel index
  const bot = Math.max(top + 1, Math.min(px.height, Math.ceil(y1))); // cells-ok — a pixel index
  let sum = 0;
  let n = 0; // cells-ok — a sample count
  for (let y = top; y < bot; y += 1) { // cells-ok — a pixel index
    for (let x = lo; x < hi; x += 1) { // cells-ok — a pixel index
      sum += luminance(px, x, y);
      n += 1;
    }
  }
  return n === 0 ? 0 : sum / n;
}

/**
 * The braille arm: one dot per subcell, thresholded against the Bayer offset.
 *
 * Nine intensity levels per cell, because eight dots plus empty is nine — and
 * the levels are a *result* of the per-dot decision rather than a quantisation
 * applied before it, which is what keeps neighbouring cells from agreeing.
 */
export function ditherBraille(px: Pixels, cols: number, rows: number): readonly string[] {
  const dotsW = Math.max(1, cols * BRAILLE_DOTS.x); // cells-ok — a dot count
  const dotsH = Math.max(1, rows * BRAILLE_DOTS.y); // cells-ok — a dot count
  const grid = createGrid(dotsW, dotsH);
  const sx = px.width / dotsW;
  const sy = px.height / dotsH;
  for (let y = 0; y < dotsH; y += 1) { // cells-ok — a dot index
    for (let x = 0; x < dotsW; x += 1) { // cells-ok — a dot index
      if (sample(px, x * sx, y * sy, (x + 1) * sx, (y + 1) * sy) > bayer(x, y)) setDot(grid, x, y);
    }
  }
  return foldBraille(grid);
}

/**
 * The ASCII arm: one glyph per **cell**, ordered by the same matrix.
 *
 * **The offset is applied to the intensity and not to the index**, which is the
 * difference between dithering and jittering: adding to the index moves a cell
 * by whole ramp steps and reads as noise, while adding to the intensity moves it
 * across a step boundary only where it was already close to one.
 */
export function ditherAscii(px: Pixels, cols: number, rows: number, ramp = DITHER_ASCII): readonly string[] {
  const sx = px.width / Math.max(1, cols); // cells-ok — a cell count
  const sy = px.height / Math.max(1, rows); // cells-ok — a cell count
  const steps = [...ramp];
  const out: string[] = [];
  for (let r = 0; r < rows; r += 1) { // cells-ok — a row index
    let line = "";
    for (let c = 0; c < cols; c += 1) { // cells-ok — a column index
      const v = sample(px, c * sx, r * sy, (c + 1) * sx, (r + 1) * sy);
      const nudged = v + (bayer(c, r) - 0.5) / steps.length; // cells-ok — a step count
      const i = Math.max(0, Math.min(steps.length - 1, Math.round(nudged * (steps.length - 1)))); // cells-ok — a step index
      line += steps[i] ?? " ";
    }
    out.push(line);
  }
  return out;
}
