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
 * **And two spans that are not a stack** (§3ak.34). `waterfallBars` and
 * `ganttBars` live here because this is where a fold both arms need already
 * lived, and because F329 is the argument: a derivation with two
 * implementations is checked by nothing, since the corpus that separates them is
 * the corpus neither arm has.
 *
 * **Bands never cross, and that is the property to hold onto.** Each band's
 * lower bound is the previous band's upper bound, so the ordering is structural
 * rather than something the data can violate. A renderer that computed each
 * band's bounds independently would produce crossings for the same input and no
 * count would notice.
 */
import { normalisedOf } from "../../data/viewmodel/range.js";
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

/**
 * **A bar drawn between two values on a shared axis** — the `span` family's
 * datum (§3ak.34).
 *
 * Named for the shape rather than for the first form that needed it. A
 * waterfall's step and a gantt's task are the same mark from two different
 * arithmetics, and the emitter that draws them does not care which.
 */
export type Span = Readonly<{ from: number; to: number; drawn: boolean }>;

/**
 * A waterfall's running baseline — **the family's other cumulative fold** (I70,
 * §3ak.34, F329).
 *
 * Here rather than in `derive.ts` because it returns bars and a range rather
 * than a block, so I70's *each arm draws the derived block* has nothing to hand
 * over. It is `stackBands`' shape, and this is `stackBands`' file.
 *
 * **It existed three times and two of the three disagreed.** `definition.ts`
 * walked the series twice — once for the bounds and once for the bars — and the
 * bounds walk read `values[i] ?? 0`, which lets a total with no reading reset the
 * running sum to zero, while the drawing walk guarded the advance and let the
 * same total hold it. `waterfallFigure` was a third walk following the first. On
 * `[50, null, 30]` against `[false, true, false]` the terminal drew one cell at
 * the right edge — a bar from 50 to 80 with both ends clamped to an axis of
 * `0 … 50`, which is a bar outside its own axis — and the second arm drew three
 * fifths of the row from the origin. **No fixture has a null**, so nothing could
 * see it.
 *
 * **A null is no reading, and no reading moves no total** — which is the drawing
 * walk's convention and `stackBands`' own, one fold along: *a null is a
 * zero-width contribution, not a gap*. One walk also makes the bounds agree with
 * the bars by construction, which is the property three walks could not have.
 *
 * **`totals` restarts rather than adds**: a total bar is drawn from zero to the
 * running sum, and treating it as another step would draw the sum twice.
 *
 * The range is the **cumulative** one, anchored at zero — not `seriesRange` over
 * the steps, which answers *how big is one change* where a gutter must cover
 * *where the running total went*.
 */
/**
 * A gantt's tasks — **a start and a duration, which is a span already**
 * (§3ak.34, F329).
 *
 * Two lines, and here rather than in a renderer for exactly the reason the fold
 * beside it is: two copies of two lines is how three copies of a fold began. The
 * mechanical test F329 leaves behind is *does the other arm call the function*,
 * and a derivation small enough to inline is the one most likely to be inlined
 * twice.
 *
 * **The range has no floor**, which is the one thing that separates it from a
 * waterfall's. A bar's length is its value, so it grows from zero; a task is an
 * **interval**, and a project starting on day three starts on day three.
 *
 * **A task with no duration still has a start**, so it bounds the axis while
 * drawing nothing — the terminal's own arithmetic, where `dur` falls back to
 * zero for the bounds and the row comes out blank.
 */
export function ganttBars(
  values: readonly (number | null)[],
  offsets: readonly number[],
): Readonly<{ bars: readonly Span[]; min: number; max: number }> {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  const bars = values.map((v, i) => {
    const from = offsets[i] ?? 0;
    const drawn = v !== null && Number.isFinite(v);
    const to = from + (drawn ? v : 0);
    min = Math.min(min, from);
    max = Math.max(max, to);
    return { from, to, drawn };
  });
  return { bars, min, max };
}

export function waterfallBars(
  values: readonly (number | null)[],
  totals: readonly boolean[],
): Readonly<{ bars: readonly Span[]; min: number; max: number }> {
  let running = 0;
  let min = 0;
  let max = 0;
  const bars = values.map((v, i) => {
    const isTotal = totals[i] === true;
    const from = running;
    if (v !== null && Number.isFinite(v)) {
      running = isTotal ? v : running + v;
      min = Math.min(min, running);
      max = Math.max(max, running);
    }
    return { from: isTotal ? 0 : from, to: running, drawn: v !== null && Number.isFinite(v) };
  });
  return { bars, min, max };
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
  // Inverted: a value grows upwards and a row index grows down. **The
  // inversion and the rounding are this renderer's; the coordinate is not**
  // (C12 §3aj hazard 1, C04 §3ak). The degenerate arm read `n - 1` — a band of
  // no extent pinned to the floor, which is the answer C04's table calls wrong.
  const rowOf = (v: number): number =>
    Math.max(0, Math.min(n - 1, n - 1 - Math.round(normalisedOf(v, { min, max }, false) * (n - 1)))); // cells-ok — a row index

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
