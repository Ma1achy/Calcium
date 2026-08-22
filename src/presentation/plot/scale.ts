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
import { ORIGIN_DEFAULT, type OHLC, type Origin, type Plot, type Series } from "../../data/viewmodel/index.js";
import { pinnedRange } from "../../data/viewmodel/range.js";

/**
 * Which way each axis runs, derived from `origin` (C12 §3ac).
 *
 * **Two independent directions rather than four corners**, because the two
 * functions below take one each: `rowOf` cannot use the horizontal half and
 * `columnsOf` cannot use the vertical, and handing each of them a corner would
 * mean each ignoring half its argument. `origin` is the caller's vocabulary and
 * this is the renderer's.
 */
export type Facing = Readonly<{ x: "right" | "left"; y: "up" | "down" }>;

/** A curve's facing: samples rightward, values upward. */
export const FACING_DEFAULT: Facing = Object.freeze({ x: "right", y: "up" });

/** A matrix's facing: readings rightward, `series[0]` at the top. */
export const FACING_MATRIX: Facing = Object.freeze({ x: "right", y: "down" });

/** `origin` as two directions. */
export function facingFor(origin: Origin): Facing {
  return Object.freeze({
    x: origin === "bottom-right" || origin === "top-right" ? "left" : "right",
    y: origin === "top-left" || origin === "top-right" ? "down" : "up",
  });
}

/**
 * The facing a block draws with (C12 §3ac).
 *
 * **`whenRefused` is a parameter and not a constant, and the golden frames are
 * why.** The first version fell through to `FACING_DEFAULT` on a `null` row,
 * with a comment saying that is what every refusing form already draws — a claim
 * written and not checked, and false for two of them. `contour` and `quiver`
 * refuse `origin` and are drawn by the **matrix** renderer, so the curve's
 * upward facing turned them upside down: eight golden frames moved under a
 * commit that was supposed to move none.
 *
 * The record answers *what may the caller ask for*; this parameter answers
 * *what does this renderer draw when the answer is nothing*. They are two
 * questions and the accident was treating them as one.
 */
export function facingOf(block: Pick<Plot, "form" | "origin">, whenRefused: Facing): Facing {
  const origin = block.origin ?? ORIGIN_DEFAULT[block.form];
  return origin === null ? whenRefused : facingFor(origin);
}

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

/**
 * The finite values of a series, with their original positions (I4).
 *
 * **`null` and `NaN` are one case here and not in a document.** A document
 * spells a gap `null` (C04 I46a); a fixture or an adapter that never met a
 * validator can still hand over `NaN`, and I2 says no series input throws. One
 * guard answers both, because `Number.isFinite(null)` is `false` — which is why
 * widening the type cost this function a signature and no logic.
 */
export function finiteSamples(values: readonly (number | null)[]): readonly Sample[] {
  const out: Sample[] = [];
  values.forEach((v, i) => {
    if (v !== null && Number.isFinite(v)) out.push({ i, v });
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
  bars?: readonly OHLC[],
): Range | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let seen = false;

  for (const s of series) {
    for (const v of s.values) {
      if (v === null || !Number.isFinite(v)) continue;
      seen = true;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  // **The union, in one scan** (C12 §6b B3). A candlestick's extremes are its
  // wicks and its overlays bound themselves, so both go in before the pin is
  // applied — folding them here rather than taking a maximum of two ranges is
  // what keeps `!seen` meaning *nothing was measured anywhere*, which is the
  // condition the empty message hangs on.
  for (const b of bars ?? []) {
    for (const v of [b.open, b.high, b.low, b.close]) {
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

  // **One resolver, two families** (C04 I74). The image overlay's colour scale
  // is this mechanism on the same kind of datum, and two computations of one
  // figure is how they would come to disagree about what a value means.
  return pinnedRange(min, max, pin);
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
export function rowOf(v: number, range: Range, rows: number, facing: Facing): number {
  const last = Math.max(0, rows - 1);
  // **A flat line has no direction to reverse** (§3ac A6/A7). The early return
  // is before the facing on purpose: the centre row is the answer under all four
  // origins, and mirroring it afterwards would move a constant series sideways
  // at an even height under a member that cannot mean anything for it.
  if (range.max === range.min) return Math.floor(last / 2);

  const t = (v - range.min) / (range.max - range.min);
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.round((facing.y === "down" ? clamped : 1 - clamped) * last);
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
  facing: Facing,
): readonly Column[] {
  const width = Math.max(1, Math.floor(columns));
  if (samples.length === 0) return []; // cells-ok — a sample count

  const span = Math.max(0, originalLength - 1);
  const buckets = new Map<number, Column>();

  // **The facing renumbers the samples, and `iFirst`/`iLast` are the new
  // numbers** (§3ac). Its three consumers all ask one question — *is the next
  // column the next sample* — and mirroring only `x` leaves the indices running
  // the other way, so `next.iFirst === column.iLast + 1` is never true and a
  // reversed curve draws as disconnected dots. Nothing maps these back to a
  // datum, so the index that means *position along the drawn axis* is the one
  // they want. **OR9 is what found this**: a constant series came back as a row
  // of dashes under a left facing and a joined rule under a right one.
  //
  // Walked in that order too, because the fold takes `first` from the sample it
  // meets first and `last` from the sample it meets last.
  const walk = facing.x === "left" ? [...samples].reverse() : samples;

  for (const { i, v } of walk) {
    const at = facing.x === "left" ? span - i : i;
    // **The facing enters the index, never the answer** (§3ac A6). A lone
    // sample sits at `floor((w − 1) / 2)`, and that column is its own mirror at
    // an odd width and one cell off at an even one — so mirroring the result
    // makes a one-sample plot twitch sideways under a member that has nothing to
    // reverse. Reversing the index leaves the degenerate branch untouched.
    const x =
      span === 0 || width === 1
        ? Math.floor((width - 1) / 2)
        : Math.round((at / span) * (width - 1));

    const held = buckets.get(x);
    if (held === undefined) {
      buckets.set(x, { x, first: v, min: v, max: v, last: v, iFirst: at, iLast: at });
      continue;
    }
    buckets.set(x, {
      x,
      first: held.first,
      min: Math.min(held.min, v),
      max: Math.max(held.max, v),
      last: v,
      iFirst: held.iFirst,
      iLast: at,
    });
  }

  return [...buckets.values()].sort((a, b) => a.x - b.x);
}
