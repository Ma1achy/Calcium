/**
 * The stacking fold — one piece of work, two forms.
 *
 * **`stackedarea` and `streamgraph` are the same fold with a different origin**,
 * which is the user's own framing and turns out to be exactly true: cumulative
 * offsets per column, an area filled between successive bounds, and then
 *
 * - `stackedarea` offsets the first band from **zero**, and
 * - `streamgraph` offsets it by **−total/2**, so the bands centre.
 *
 * That is the whole difference. `streamgraph` shipped as byte-for-byte the `line`
 * handler — nothing stacked, no baseline offset, no area fill — so two crossing
 * outlines were being drawn where a stream of never-crossing bands belongs. A
 * stream graph whose bands cross is not a stream graph with a rendering defect;
 * it is a line chart.
 *
 * **Bands never cross, and that is the property to hold onto.** Each band's
 * lower bound is the previous band's upper bound, so the ordering is structural
 * rather than something the data can violate. A renderer that computed each
 * band's bounds independently would produce crossings for the same input and no
 * count would notice.
 */
import type { Series } from "../../data/viewmodel/index.js";

/** One band's bounds at every column: `lower[i]` to `upper[i]`. */
export type Band = Readonly<{ lower: readonly number[]; upper: readonly number[] }>;

/**
 * The cumulative bands, bottom to top.
 *
 * `centred` picks the origin: `false` starts the first band at zero,
 * `true` starts it at half the column's total below zero.
 *
 * **A null is a zero-width contribution, not a gap.** A series with no reading
 * at column *i* still has a *position* in the stack — the bands above it sit on
 * whatever is beneath — so treating the absence as a hole would slide every band
 * above it down by that column and put a notch in a shape that has none. The
 * value is unknown; the band's thickness there is not.
 */
export function stackBands(
  series: readonly Series[],
  columns: number,
  centred: boolean,
): readonly Band[] {
  const n = Math.max(0, Math.floor(columns)); // cells-ok — a column count
  const at = (s: Series, i: number): number => {
    // Sampled across the series' own length, so bands of differing lengths
    // still line up column for column.
    const len = s.values.length; // cells-ok — a sample count
    if (len === 0 || n === 0) return 0; // cells-ok — a sample count
    const j = n === 1 ? 0 : Math.round((i / (n - 1)) * (len - 1)); // cells-ok — a sample index
    const v = s.values[Math.max(0, Math.min(len - 1, j))]; // cells-ok — a sample index
    return v === null || v === undefined || !Number.isFinite(v) ? 0 : Math.max(0, v);
  };

  const totals = Array.from({ length: n }, (_, i) => series.reduce((sum, s) => sum + at(s, i), 0));
  const cursor = totals.map((t) => (centred ? -t / 2 : 0));

  return series.map((s) => {
    const lower = [...cursor];
    for (let i = 0; i < n; i += 1) cursor[i] = cursor[i]! + at(s, i);
    return { lower, upper: [...cursor] };
  });
}

/** The bounds every band spans together — what the axis must cover. */
export function stackRange(bands: readonly Band[]): { min: number; max: number } {
  let min = 0, max = 0;
  for (const b of bands) {
    for (const v of b.lower) { if (v < min) min = v; if (v > max) max = v; }
    for (const v of b.upper) { if (v < min) min = v; if (v > max) max = v; }
  }
  return min === max ? { min, max: max + 1 } : { min, max };
}

/**
 * One band as rows of glyphs — the cells between its lower and upper bound.
 *
 * **Filled, not outlined.** A stacked area's band is a *quantity*, and the eye
 * reads thickness; an outline leaves the reader integrating two curves to find
 * it. The glyph is the caller's, which is how `markOf` reaches this without
 * `stack.ts` knowing about capabilities: at 1-bit each band gets its own mark
 * and at 24-bit they share one and differ by colour (C12 I25, I29).
 */
export function bandRows(
  band: Band,
  min: number,
  max: number,
  width: number,
  rows: number,
  mark: string,
): readonly string[] {
  const w = Math.max(1, Math.floor(width));
  const n = Math.max(1, Math.floor(rows));
  const span = max - min;
  // Inverted: a value grows upwards and a row index grows down.
  const rowOf = (v: number): number =>
    span <= 0 ? n - 1 : Math.max(0, Math.min(n - 1, n - 1 - Math.round(((v - min) / span) * (n - 1)))); // cells-ok — a row index

  const grid = Array.from({ length: n }, () => new Array<string>(w).fill(" "));
  for (let x = 0; x < w; x += 1) {
    const lo = band.lower[Math.min(x, band.lower.length - 1)] ?? 0; // cells-ok — a column index
    const hi = band.upper[Math.min(x, band.upper.length - 1)] ?? 0; // cells-ok — a column index
    if (hi <= lo) continue;
    const top = rowOf(hi);
    const bottom = rowOf(lo);
    // **At least one row of ink for a band with any thickness at all.** A band
    // thinner than a cell rounds `top` and `bottom` to the same row and would
    // otherwise vanish — a series present in the legend and absent from the
    // figure, which is C12 I8's silent drop wearing a rounding error.
    for (let r = top; r <= bottom; r += 1) grid[r]![x] = mark;
  }
  return grid.map((r) => r.join(""));
}
