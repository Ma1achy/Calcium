/**
 * Box-drawing curve renderer — connected lines using ╭╮╰╯─│ glyphs.
 *
 * **A connection mask per cell, not an enter/exit pair.** The first version
 * wrote one glyph per *sample* column and left every cell between two samples
 * blank, so a twenty-sample series across seventy-five columns drew twenty
 * marks and no line. The bug is not a missing fill step — it is the model: a
 * cell's glyph is a function of which of its four edges the curve crosses, and
 * a pair of directions cannot say *both* horizontals and a vertical, which is
 * what a T-junction and a crossing are.
 *
 * So each segment contributes edge bits, and the glyph is read off the mask at
 * the end. Corners, ends, tees and crossings all fall out of the same table
 * rather than being cases.
 */
import type { TerminalCapabilities } from "../../terminal/capabilities.js";
import type { Series } from "../../data/viewmodel/index.js";
import { finiteSamples, columnsOf, rowOf, type Range } from "./scale.js";

/** Where the curve turns between two readings. */
export type Interpolation = "linear" | "step";

/** Edge bits. A cell's glyph is a function of which edges the curve crosses. */
const UP = 1;
const DOWN = 2;
const LEFT = 4;
const RIGHT = 8;

/**
 * The two horizontal edges, published for a caller composing a **rule** into a
 * mask rather than a polyline (C12 §3i).
 *
 * A violin's spine is a full-width horizontal line across one row, and it has
 * to be in the mask rather than painted behind it: a tail returning to the axis
 * ends on that row with one bit set, and a fill that only touches blank cells
 * leaves it a stub — `╴` — a half-cell clear of the rule it belongs to.
 */
export const LINE_LEFT = LEFT;
export const LINE_RIGHT = RIGHT;
export const LINE_UP = UP;
export const LINE_DOWN = DOWN;

const ROUNDED: readonly string[] = Object.freeze([
  " ",  //  0  none
  "│",  //  1  U
  "│",  //  2  D
  "│",  //  3  UD
  "╴",  //  4  L
  "╯",  //  5  UL
  "╮",  //  6  DL
  "┤",  //  7  UDL
  "╶",  //  8  R
  "╰",  //  9  UR
  "╭",  // 10  DR
  "├",  // 11  UDR
  "─",  // 12  LR
  "┴",  // 13  ULR
  "┬",  // 14  DLR
  "┼",  // 15  UDLR
]);

const SHARP: readonly string[] = Object.freeze([
  " ", "│", "│", "│", "╴",
  "┘",  //  5  UL
  "┐",  //  6  DL
  "┤", "╶",
  "└",  //  9  UR
  "┌",  // 10  DR
  "├", "─", "┴", "┬", "┼",
]);

/**
 * Box-drawing curve renderer — one glyph per cell.
 *
 * Between two consecutive sample columns the curve runs horizontally at the
 * first row, turns once, and runs horizontally at the second. Where it turns
 * is what separates a line from a step, and it is the only difference.
 */
export function lineDrawRows(
  series: Series,
  range: Range,
  areaWidth: number,
  areaRows: number,
  corners: "rounded" | "sharp",
  interpolation: Interpolation = "linear",
): readonly string[] {
  const w = Math.max(0, Math.floor(areaWidth));
  const h = Math.max(0, Math.floor(areaRows));
  if (w === 0 || h === 0) return Array.from({ length: h }, () => "");

  const mask: number[][] = Array.from({ length: h }, () =>
    Array.from({ length: w }, () => 0),
  );

  const samples = finiteSamples(series.values);
  const columns = columnsOf(samples, series.values.length, w); // cells-ok — a sample count
  const y = (v: number): number => {
    const r = rowOf(v, range, h);
    return r < 0 ? 0 : r >= h ? h - 1 : r;
  };

  const addH = (row: number, xa: number, xb: number): void => {
    if (xb < xa || row < 0 || row >= h) return;
    for (let x = xa; x <= xb; x += 1) {
      if (x < 0 || x >= w) continue;
      if (x > xa) mask[row]![x]! |= LEFT;
      if (x < xb) mask[row]![x]! |= RIGHT;
    }
  };

  const addV = (col: number, ya: number, yb: number): void => {
    if (col < 0 || col >= w) return;
    const top = Math.min(ya, yb);
    const bottom = Math.max(ya, yb);
    for (let r = top; r <= bottom; r += 1) {
      if (r < 0 || r >= h) continue;
      if (r > top) mask[r]![col]! |= UP;
      if (r < bottom) mask[r]![col]! |= DOWN;
    }
  };

  for (let ci = 0; ci < columns.length; ci += 1) { // cells-ok — a column count
    const col = columns[ci]!;
    const rowHere = y(col.last);

    // I5: the column's own vertical extent, so a spike inside one column
    // survives the fold the same way the braille renderer keeps it.
    const spanTop = y(col.max);
    const spanBottom = y(col.min);
    if (spanTop !== spanBottom) addV(col.x, spanTop, spanBottom);

    const next = columns[ci + 1];
    if (next === undefined) break;
    // I4/I14: joined only where the samples are consecutive in the original
    // series. A filtered non-finite value leaves a hole, and the line breaks.
    if (next.iFirst !== col.iLast + 1) continue;

    const rowNext = y(next.first);
    // **The turn column is the whole difference between the two forms.** A
    // line slopes, so the staircase is centred under the slope it stands for;
    // a step holds its value until the next reading arrives and jumps there,
    // so it turns at that reading's own column (C12 §3).
    const turn =
      interpolation === "step" ? next.x : col.x + Math.floor((next.x - col.x) / 2);

    addH(rowHere, col.x, turn);
    if (rowHere !== rowNext) addV(turn, rowHere, rowNext);
    addH(rowNext, turn, next.x);
  }

  // A lone cell with no edges at all is still a reading, and a blank would say
  // there was none — give it the horizontal stub the ends already use.
  for (const col of columns) {
    const r = y(col.last);
    if (mask[r]?.[col.x] === 0) mask[r]![col.x] = LEFT | RIGHT;
  }

  const table = corners === "sharp" ? SHARP : ROUNDED;
  return mask.map((row) => row.map((m) => table[m] ?? " ").join(""));
}

/**
 * The glyph a connection mask resolves to.
 *
 * Exported because a circle's outline and a radar's polygon are the same
 * question as a curve's: which edges of this cell does the stroke cross. One
 * table answers all three, and a second copy is how the pie came to be drawn in
 * a vocabulary the line forms had already left behind.
 */
/**
 * ASCII, for `unicode: "ascii"`.
 *
 * **Every caller was emitting box-drawing regardless of capability**, which is
 * C09 I22's subject: a mark the framework draws must have a substitute. The
 * violin's outline made it visible — an ASCII frame came back full of `╭─╯` —
 * but the pie's rim and the radar's ring had the same hole and no frame showed
 * it, because both fall back to other renderers before reaching here.
 *
 * A corner is `+` in all four directions: ASCII has no rounded form, and using
 * `/` and `\\` reads as a slope rather than a join at this resolution.
 */
const ASCII: readonly string[] = Object.freeze([
  " ", "|", "|", "|", "-", "+", "+", "+", "-", "+", "+", "+", "-", "+", "+", "+",
]);

export function glyphForMask(
  mask: number,
  corners: "rounded" | "sharp",
  caps?: Pick<TerminalCapabilities, "unicode">,
): string {
  const table = caps?.unicode === "ascii" ? ASCII : corners === "sharp" ? SHARP : ROUNDED;
  return table[mask & 15] ?? " ";
}

/**
 * Stroke a polyline into a mask grid, in **cell** coordinates.
 *
 * Steps are axis-aligned — never diagonal — so every move crosses exactly one
 * edge and the mask is unambiguous. A diagonal step would have to claim two
 * edges at once, and the glyph it resolves to would depend on which of the two
 * the reader took to be the join.
 */
export function strokePolyline(
  mask: number[][],
  points: readonly (readonly [number, number])[],
  closed: boolean,
): void {
  const h = mask.length; // cells-ok — a row count
  if (h === 0 || points.length < 2) return; // cells-ok — a point count
  const w = mask[0]!.length; // cells-ok — a column count

  const inside = (x: number, y: number): boolean => x >= 0 && x < w && y >= 0 && y < h;
  const link = (x: number, y: number, bit: number): void => {
    if (inside(x, y)) mask[y]![x]! |= bit;
  };

  const stepTo = (x0: number, y0: number, x1: number, y1: number): void => {
    let x = x0;
    let y = y0;
    let guard = 0;
    const limit = (w + h) * 4;
    while ((x !== x1 || y !== y1) && guard++ < limit) {
      const dx = x1 - x;
      const dy = y1 - y;
      if (Math.abs(dx) >= Math.abs(dy)) {
        const s = dx > 0 ? 1 : -1;
        link(x, y, s > 0 ? RIGHT : LEFT);
        x += s;
        link(x, y, s > 0 ? LEFT : RIGHT);
      } else {
        const s = dy > 0 ? 1 : -1;
        link(x, y, s > 0 ? DOWN : UP);
        y += s;
        link(x, y, s > 0 ? UP : DOWN);
      }
    }
  };

  for (let i = 0; i + 1 < points.length; i += 1) { // cells-ok — a point count
    const a = points[i]!;
    const b = points[i + 1]!;
    stepTo(a[0], a[1], b[0], b[1]);
  }
  if (closed) {
    const first = points[0]!;
    const last = points[points.length - 1]!; // cells-ok — a point count
    stepTo(last[0], last[1], first[0], first[1]);
  }
}

/**
 * The quadrant alphabet — a 2×2 sub-cell mask to a glyph (C12 I43, §3w).
 *
 * **`glyphForMask`'s question in the other alphabet, and the reason it exists is
 * a measurement.** Box drawing has exactly two diagonals and neither reaches
 * its cell corners, so a run of `╱` renders as dashes and a polygon drawn from
 * them has no recoverable shape. The quadrant blocks U+2596–U+259F are *filled*
 * sub-cells: consecutive cells touch, because each is a solid rectangle rather
 * than a stroke inside a box.
 *
 * Half braille's vertical resolution and the same horizontal, traded for
 * coverage — which is the right trade for a **shape**, where braille's is right
 * for a *curve*. A radar is oblique edges that cross, and it needs the one that
 * connects.
 *
 * **Unicode only, and the caller must not reach it below that** — a radar
 * degrades to `radarAsciiRows` before this, so there is no ASCII rung to state
 * rather than one omitted.
 */
export const QUAD_TL = 1;
export const QUAD_TR = 2;
export const QUAD_BL = 4;
export const QUAD_BR = 8;

const QUADRANTS: readonly string[] = Object.freeze([
  " ", "\u2598", "\u259d", "\u2580", "\u2596", "\u258c", "\u259e", "\u259b",
  "\u2597", "\u259a", "\u2590", "\u259c", "\u2584", "\u2599", "\u259f", "\u2588",
]);

/** The glyph for a 2×2 mask of filled quadrants. */
export function quadrantGlyph(mask: number): string {
  return QUADRANTS[mask & 0xf] ?? " ";
}
