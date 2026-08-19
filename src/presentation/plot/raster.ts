/**
 * The dot grid, Bresenham, and the two ways of folding one into cells.
 *
 * **One grid, two folders**, which is how I9 is structural rather than asserted.
 * Braille and the ASCII ramp differ only in how many dots a cell holds — 2×4
 * against 1×8 — so the rasteriser plots into a grid sized from those two numbers
 * and the folder turns it into glyphs. The cell dimensions come out identical
 * because they are the same division; nothing has to be kept in step by hand.
 */

/** Dots per cell, per mode (C12 §3, §6). */
export const BRAILLE_DOTS = Object.freeze({ x: 2, y: 4 });
export const RAMP_DOTS = Object.freeze({ x: 1, y: 8 });

/**
 * Braille bit assignment, `[dotRow][dotColumn]` (C12 §3).
 *
 * Dots 1,2,3,7 in the left column and 4,5,6,8 in the right — the standard
 * mapping, and the reason dot 7 is the *fourth* row rather than the third: the
 * original six-dot cell was extended downward, so the two added dots took the
 * high bits.
 */
const BRAILLE_BITS: readonly (readonly number[])[] = Object.freeze([
  Object.freeze([0x01, 0x08]),
  Object.freeze([0x02, 0x10]),
  Object.freeze([0x04, 0x20]),
  Object.freeze([0x40, 0x80]),
]);

/** A boolean dot bitmap, one byte per dot. */
export type Grid = Readonly<{
  dotWidth: number;
  dotHeight: number;
  dots: Uint8Array;
}>;

export function createGrid(dotWidth: number, dotHeight: number): Grid {
  const w = Math.max(1, Math.floor(dotWidth));
  const h = Math.max(1, Math.floor(dotHeight));
  return { dotWidth: w, dotHeight: h, dots: new Uint8Array(w * h) };
}

/** Set one dot. Out-of-bounds coordinates are ignored rather than throwing (I2). */
export function setDot(grid: Grid, x: number, y: number): void {
  if (x < 0 || y < 0 || x >= grid.dotWidth || y >= grid.dotHeight) return;
  grid.dots[y * grid.dotWidth + x] = 1;
}

/**
 * Bresenham between two dots (I14).
 *
 * Integer arithmetic throughout, and the reason it is here rather than
 * interpolated per column: a series that moves faster than one dot column per
 * sample plots as isolated specks, and at 2×4 subcell density a scatter of
 * specks is indistinguishable from noise. Every dot column the segment crosses
 * gets at least one dot, which is the property that makes an interior gap in a
 * rendered curve impossible — and the property that condemned two illustrated
 * figures before this file existed.
 */
export function drawLine(grid: Grid, x0: number, y0: number, x1: number, y1: number): void {
  let x = Math.round(x0);
  let y = Math.round(y0);
  const ex = Math.round(x1);
  const ey = Math.round(y1);

  const dx = Math.abs(ex - x);
  const dy = Math.abs(ey - y);
  const sx = x < ex ? 1 : -1;
  const sy = y < ey ? 1 : -1;
  let err = dx - dy;

  for (;;) {
    setDot(grid, x, y);
    if (x === ex && y === ey) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

/** A vertical run of dots in one column — a downsampled column's [min, max] span. */
export function drawColumnSpan(grid: Grid, x: number, yTop: number, yBottom: number): void {
  const from = Math.min(yTop, yBottom);
  const to = Math.max(yTop, yBottom);
  for (let y = from; y <= to; y += 1) setDot(grid, x, y);
}

/** The grid, as braille cells. */
export function foldBraille(grid: Grid): readonly string[] {
  const cellsWide = Math.ceil(grid.dotWidth / BRAILLE_DOTS.x);
  const cellsHigh = Math.ceil(grid.dotHeight / BRAILLE_DOTS.y);
  const out: string[] = [];

  for (let cy = 0; cy < cellsHigh; cy += 1) {
    let line = "";
    for (let cx = 0; cx < cellsWide; cx += 1) {
      let mask = 0;
      for (let dy = 0; dy < BRAILLE_DOTS.y; dy += 1) {
        for (let dx = 0; dx < BRAILLE_DOTS.x; dx += 1) {
          const x = cx * BRAILLE_DOTS.x + dx;
          const y = cy * BRAILLE_DOTS.y + dy;
          if (x >= grid.dotWidth || y >= grid.dotHeight) continue;
          if (grid.dots[y * grid.dotWidth + x] === 1) mask |= BRAILLE_BITS[dy]?.[dx] ?? 0;
        }
      }
      line += String.fromCodePoint(0x2800 + mask);
    }
    out.push(line);
  }

  return out;
}

/**
 * The grid, as a column ramp (C12 §6).
 *
 * A ramp glyph is a **fill height**, not a set of dots: `▁` fills the bottom
 * eighth and `█` fills the cell. So a cell showing dots at several subrows shows
 * the topmost — the tallest fill — which reads as the curve's level through that
 * cell and is monotone in the value. Taking the lowest instead would draw the
 * curve's underside, and taking a count would draw its density.
 */
/**
 * The ASCII arm: a column of dots folded to one glyph per cell (C12 §6).
 *
 * **The ramp stands in for height rather than being it, and that is the whole of
 * what to know here.** The topmost inked dot-row picks the index — bottom → the
 * ramp's first step, top → its last — so a reader sees *ink weight* where the
 * braille form gives them *position*. Monotone and legible, and the cost is that
 * at ASCII a line and a filled area are hard to tell apart: a value near a
 * cell's top draws a glyph that fills the whole cell.
 *
 * **Deliberate, because ASCII has no vertical sub-cell resolution to offer** —
 * and written here because the same substitution left unstated is what produced
 * the heatmap's first draft. A ramp encodes a value along an axis, and height,
 * density and fill are three different axes; this is the one place in C12 where
 * the axis drawn is not the axis meant.
 */
export function foldRamp(grid: Grid, ramp: string): readonly string[] {
  const glyphs = [...ramp];
  const cellsHigh = Math.ceil(grid.dotHeight / RAMP_DOTS.y);
  const out: string[] = [];

  for (let cy = 0; cy < cellsHigh; cy += 1) {
    let line = "";
    for (let cx = 0; cx < grid.dotWidth; cx += 1) {
      let topmost = -1;
      for (let dy = 0; dy < RAMP_DOTS.y; dy += 1) {
        const y = cy * RAMP_DOTS.y + dy;
        if (y >= grid.dotHeight) break;
        if (grid.dots[y * grid.dotWidth + cx] === 1) {
          topmost = dy;
          break;
        }
      }
      line += topmost < 0 ? " " : (glyphs[RAMP_DOTS.y - 1 - topmost] ?? " ");
    }
    out.push(line);
  }

  return out;
}

/**
 * A dot grid to cells of **presence** — one mark where anything is lit.
 *
 * **The third fold, and it exists because the other two both encode a
 * magnitude.** `foldBraille` puts the dots' arrangement in the glyph;
 * `foldRamp` puts the topmost dot's *height* in it. A jittered strip has
 * neither to say: its dots are raw samples, and their sub-cell position is
 * spread rather than signal (C12 §3i, I21). Folded through `foldRamp` an ASCII
 * strip would draw `.` `:` `-` `=` by where a sample happened to land inside its
 * cell — a magnitude the data does not have, which is the vocabulary mismatch
 * I21 exists to refuse, arriving on a fourth form.
 *
 * Sized on `RAMP_DOTS` because presence is what the ASCII arm needs and ASCII is
 * one dot column per cell. The unicode arm folds braille and never reaches here.
 */
export function foldPresence(grid: Grid, mark: string): readonly string[] {
  const cellsHigh = Math.ceil(grid.dotHeight / RAMP_DOTS.y);
  const out: string[] = [];

  for (let cy = 0; cy < cellsHigh; cy += 1) {
    let line = "";
    for (let cx = 0; cx < grid.dotWidth; cx += 1) {
      let lit = false;
      for (let dy = 0; dy < RAMP_DOTS.y; dy += 1) {
        const y = cy * RAMP_DOTS.y + dy;
        if (y >= grid.dotHeight) break;
        if (grid.dots[y * grid.dotWidth + cx] === 1) {
          lit = true;
          break;
        }
      }
      line += lit ? mark : " ";
    }
    out.push(line);
  }

  return out;
}
