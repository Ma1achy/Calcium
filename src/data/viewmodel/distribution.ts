/**
 * A distribution's positions, normalised — **the distribution family's half of
 * the shared coordinate** (C12 §3aj, C04 §3ak).
 *
 * The four families phase 3 shipped spend the coordinate on a `y`, a mark, a
 * rectangle or a colour, and all four read it from `normalisedOf` directly
 * because their datum is *a value*. **A distribution's datum is a set of
 * positions derived from the samples** — five of them, plus a mean, plus
 * outliers, plus a forest plot's interval — so the shared piece is the set and
 * not the value.
 *
 * **Why it is here and not in `plot/`.** `glyph-row.ts` and `kde.ts` compute and
 * draw in one pass, and the SVG arm needs the computing half without the
 * drawing. L0 is where the two arms can both reach: `cells()` is unreachable
 * from here, which is §3aj hazard 4 as a structural fact rather than a rule.
 *
 * **What stays with each renderer: the rounding and the inversion.** Hazard 1
 * rules that the shared layer produces `[0, 1]` and each renderer rounds its
 * own, and the distribution family is where that matters twice over — a box
 * plot's column inverts by hand as `L - round(t·L)`, which is **not**
 * `round((1 - t)·L)`: at `t·L = 2.5` and `L = 6` the first is 3 and the second
 * is 4, because JavaScript rounds a half away from zero. So `invert` is left
 * alone here and every caller keeps the arithmetic it had.
 */
import { normalisedOf, type PinnedRange } from "./range.js";
import type { QuartileSummary } from "./types.js";

/**
 * Every position a distribution renderer draws, on `[0, 1]`, uninverted.
 *
 * **`lower`, `upper` and `centre` are resolved rather than passed through**,
 * because their defaults are family logic: a forest plot's interval falls back
 * to the whiskers and its estimate to the median (C12 I31), and that fallback
 * was written out at each call site.
 */
export type NormalisedSummary = Readonly<{
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  /** The confidence interval and the point estimate — a forest plot's three. */
  lower: number;
  upper: number;
  centre: number;
  /** Absent where the summary has none, so a renderer can tell *no mean* from *a mean at the median*. */
  mean?: number;
  outliers: readonly number[];
}>;

/**
 * A summary's positions in the range's coordinate.
 *
 * Non-finite members are dropped rather than normalised: `mean: NaN` would
 * otherwise place a diamond at `NaN` and every clamp downstream would pass it
 * through, which is C04 §3ak's mechanism one field along.
 */
export function normalisedSummary(q: QuartileSummary, range: PinnedRange): NormalisedSummary {
  const at = (v: number): number => normalisedOf(v, range, false);
  const mean = q.mean;
  return {
    min: at(q.min),
    q1: at(q.q1),
    median: at(q.median),
    q3: at(q.q3),
    max: at(q.max),
    lower: at(q.lower ?? q.min),
    upper: at(q.upper ?? q.max),
    centre: at(q.centre ?? q.median),
    ...(mean !== undefined && Number.isFinite(mean) ? { mean: at(mean) } : {}),
    outliers: (q.outliers ?? []).filter((o) => Number.isFinite(o)).map(at),
  };
}
