/**
 * Numbers to grid coordinates. The scaling core both forms share (C12 §1).
 *
 * Pure, total, and holding no state: every function here is a function of its
 * arguments, and there is no cache. C11's `planColumns` settled the rule and the
 * argument is stronger here — height is *declared*, so the expensive half
 * (measurement) never touches the data at all, and rasterisation happens only on
 * a render, behind C03's coalescing. If a measurement ever justifies one, the
 * shape is C05 §3a's: a `WeakMap` keyed on the `Series` object, never on the
 * content of its values.
 */
import type { Plot, Series } from "../../data/viewmodel/index.js";

/**
 * A finite value and **its position in the original series**.
 *
 * The index is kept rather than discarded because it is what makes §4's
 * non-finite rule work: filtering `[1, NaN, 3]` to `[1, 3]` loses the fact that
 * something was removed, and the line would then span the gap instead of
 * breaking across it (I4).
 */
export type Sample = Readonly<{ i: number; v: number }>;

/** The vertical range a plot is drawn against. */
export type Range = Readonly<{ min: number; max: number }>;

/**
 * One dot column's worth of samples, reduced to **four** values.
 *
 * Two would satisfy I5 alone: keep the minimum and the maximum and a spike
 * survives downsampling. But keeping only the extremes discards the order within
 * the column, and I14 needs an endpoint to join to the next column — so with two
 * values a dense series renders as a row of disconnected vertical bars. C12 §3
 * records the composition; this type is it.
 *
 * `iFirst`/`iLast` are original indices, so a caller can tell whether two
 * adjacent columns are genuinely adjacent in the data or have a filtered sample
 * between them.
 */
export type Column = Readonly<{
  x: number;
  first: number;
  min: number;
  max: number;
  last: number;
  iFirst: number;
  iLast: number;
}>;

/** The finite values of a series, with their original positions (I4). */
export function finiteSamples(values: readonly number[]): readonly Sample[] {
  const out: Sample[] = [];
  values.forEach((v, i) => {
    if (Number.isFinite(v)) out.push({ i, v });
  });
  return out;
}

/**
 * The range over every series, with either bound pinned by the block (C04 I29).
 *
 * `null` when nothing finite exists anywhere — an all-`NaN` series is treated as
 * empty (§4), and the caller renders the empty message rather than scaling
 * against a range that does not exist.
 *
 * A pinned bound **replaces** the data's rather than widening to include it, and
 * out-of-range values clamp in `rowOf` below. That is C04 I29's whole point: a
 * pinned axis exists so two plots can be compared, and a range that grew to fit
 * an outlier would defeat the only reason to pin one.
 *
 * A reversed pin (`yMin` above `yMax`) collapses to a constant range rather than
 * throwing, because I2 says no series input throws and a pin is series input by
 * another route.
 */
export function seriesRange(
  series: readonly Series[],
  pin: Pick<Plot, "yMin" | "yMax">,
): Range | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let seen = false;

  for (const s of series) {
    for (const v of s.values) {
      if (!Number.isFinite(v)) continue;
      seen = true;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }

  if (!seen && pin.yMin === undefined && pin.yMax === undefined) return null;
  if (!seen) {
    min = pin.yMin ?? pin.yMax ?? 0;
    max = pin.yMax ?? pin.yMin ?? 0;
  }

  const lo = pin.yMin ?? min;
  const hi = pin.yMax ?? max;
  if (hi < lo) return { min: lo, max: lo };
  return isNoise(lo, hi) ? { min: lo, max: lo } : { min: lo, max: hi };
}

/**
 * Whether a span is float noise rather than signal (T3.7).
 *
 * `[1, 1 + ε, 1 + 2ε]` is not constant — `min !== max`, so I3's guard does not
 * catch it — and a linear scale over a span of 4×10⁻¹⁶ amplifies the last bit of
 * three doubles into a curve that spans the plot area and looks like a trend. It
 * is the most misleading output this component can produce, because nothing about
 * it looks degenerate.
 *
 * A few ULPs of the larger magnitude is the threshold. Genuinely small ranges are
 * unaffected: a denormal span of 5×10⁻³²⁴ against a magnitude of 10⁻³²³ is many
 * orders above its own noise floor and scales normally.
 */
function isNoise(lo: number, hi: number): boolean {
  const magnitude = Math.max(Math.abs(lo), Math.abs(hi));
  return hi - lo <= 8 * Number.EPSILON * magnitude;
}

/**
 * A value's dot row, 0 at the top.
 *
 * **No division by the range** (I3). A constant or single-point series has
 * `min === max`, and the answer is the vertical centre rather than a quotient of
 * zero by zero — which is what §4's "flat line at vertical centre" means and
 * what T1.5 asserts produces no `NaN`.
 *
 * Out-of-range values clamp to the edge rather than escaping the grid (C04 I29,
 * T1.14). Dropping them would be the other option and it is worse: a pinned plot
 * of a series that briefly exceeds its ceiling should show the series pressed
 * against the ceiling, not a hole where it was.
 */
export function rowOf(v: number, range: Range, rows: number): number {
  const last = Math.max(0, rows - 1);
  if (range.max === range.min) return Math.floor(last / 2);

  const t = (v - range.min) / (range.max - range.min);
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.round((1 - clamped) * last);
}

/**
 * Samples to dot columns, preserving per-column extremes and endpoints (I5).
 *
 * Horizontal placement uses the **original** length, not the filtered count, so
 * a removed sample leaves its column empty and the curve breaks there.
 *
 * Three regimes, one expression:
 *
 *   - More samples than columns → several land in one column and reduce.
 *   - Exactly as many → one each, and all four values coincide.
 *   - Fewer → columns between them stay empty, and the caller joins across them
 *     with Bresenham, which is §4's "spread across the full width".
 *
 * A single sample sits at the horizontal centre. `first` and `last` are the same
 * sample, so the rule that maps the first to column 0 and the last to the far
 * edge has no answer, and the centre is the only placement that does not pick a
 * side.
 */
export function columnsOf(
  samples: readonly Sample[],
  originalLength: number,
  columns: number,
): readonly Column[] {
  const width = Math.max(1, Math.floor(columns));
  if (samples.length === 0) return []; // cells-ok — a sample count

  const span = Math.max(0, originalLength - 1);
  const buckets = new Map<number, Column>();

  for (const { i, v } of samples) {
    const x =
      span === 0 || width === 1
        ? Math.floor((width - 1) / 2)
        : Math.round((i / span) * (width - 1));

    const held = buckets.get(x);
    if (held === undefined) {
      buckets.set(x, { x, first: v, min: v, max: v, last: v, iFirst: i, iLast: i });
      continue;
    }
    buckets.set(x, {
      x,
      first: held.first,
      min: Math.min(held.min, v),
      max: Math.max(held.max, v),
      last: v,
      iFirst: held.iFirst,
      iLast: i,
    });
  }

  return [...buckets.values()].sort((a, b) => a.x - b.x);
}
