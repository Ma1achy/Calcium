/**
 * **What a form draws, when that is not what it was given** (C12 I65, §3ak.7).
 *
 * `ecdf` replaces its samples with a cumulative fraction and `density` replaces
 * five of them with a hundred kernel estimates. Both answer *what is drawn* and
 * never *how*, so both belong below the two renderers rather than inside one of
 * them — and both lived inside a rasteriser, because the terminal was the only
 * arm that ever needed them. **The second arm therefore drew `series.values`
 * and produced a different chart of the same block** (F268): an ECDF that
 * descends, and a density plot with no density in it.
 *
 * **Down rather than imported up**, which is §3ak.1 finding 5's direction for
 * `FrameStyle` one seam along. The first reason given for it — that `figure.ts`
 * importing `kde.ts` would reach `cells()` — was false, and the code is what
 * said so: `figure.ts -> axes.ts -> text.ts` already exists. Hazard 3 is a rule
 * about what a shared *function* does, asserted by arity in `G1`, and a module
 * is not a function. The true reason is measured: the edge makes the SVG arm
 * load braille, the dot grid, the glyph ladder and the strips — **10 modules
 * and 3,874 lines** — to reach five lines of arithmetic over samples.
 *
 * **Nothing here is corrected on the way past.** `ecdfSeries` is a function of
 * `values.length` and of nothing else — its `sort` feeds a variable read only
 * for `.length` — so the terminal draws one fixed staircase for every dataset
 * of a given size (F269, `DS1`/`DS4`). The unification pass freezes the
 * terminal arm, and this move is an extraction: byte-identical, or it is not
 * this commit.
 */
import type { Series } from "../../data/viewmodel/index.js";
import { finiteSamples, type Range } from "./scale.js";

/**
 * ECDF: the empirical cumulative distribution function.
 *
 * Sort the values, compute the cumulative fraction as y, then draw as a step
 * function. The range is always [0, 1] — the fraction axis.
 */
export function ecdfSeries(series: Series): Series {
  const finite = finiteSamples(series.values);
  if (finite.length === 0) return { ...series, values: [] }; // cells-ok — a sample count

  const sorted = [...finite].sort((a, b) => a.v - b.v);
  const n = sorted.length; // cells-ok — a sample count
  const values: number[] = [];

  for (let i = 0; i < n; i++) {
    values.push((i + 1) / n);
  }

  return { ...series, values };
}

function gaussianKernel(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

export function silvermanBandwidth(values: readonly number[]): number {
  const n = values.length; // cells-ok — a sample count
  if (n <= 1) return 1;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  const iqr = (() => {
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(n * 0.25)] ?? 0;
    const q3 = sorted[Math.floor(n * 0.75)] ?? 0;
    return q3 - q1;
  })();
  // **0.9, not 1.06 — the constant belongs to the estimator below it.**
  // Silverman gives `1.06 · σ̂ · n^(-1/5)` for the *standard-deviation* form and
  // `0.9 · min(σ̂, IQR/1.34) · n^(-1/5)` for the robust one. This used 1.06 with
  // the robust estimator, which is neither rule and oversmooths by 18%.
  //
  // Measured on `[1,1,1,1,2,3,5,5,5,5]` — the bimodal case a violin exists to
  // show — the old constant put the normalised density's floor at **0.72**, so
  // every column saturated and the traced outline came out a rectangle. The
  // corrected constant is a real fix and not a sufficient one: a ten-point
  // sample genuinely does not support strong bimodality at any rule-of-thumb
  // bandwidth, which is why `bandwidth` is a parameter rather than only a rule.
  const spread = Math.min(sd, iqr / 1.34);
  return spread > 0 ? 0.9 * spread * Math.pow(n, -0.2) : 1;
}

/**
 * The rule of thumb, scaled by the caller's `bandwidth` (C12 §3m).
 *
 * **A multiplier, which is seaborn's `bw_adjust` and for its reason**: a
 * bandwidth in the data's own units means nothing until you know the data, so an
 * absolute field would have every caller computing Silverman themselves in order
 * to scale it.
 *
 * `undefined` and `1` are the same answer, and both leave `kde` to its own
 * default — so the adjust costs nothing where nobody asks for it.
 */
export function scaledBandwidth(data: readonly number[], adjust?: number): number | undefined {
  if (adjust === undefined || !Number.isFinite(adjust) || adjust <= 0 || adjust === 1) return undefined;
  return silvermanBandwidth(data) * adjust;
}

/**
 * Estimate the density at `points` given `data` values and a bandwidth.
 */
export function kde(
  data: readonly number[],
  points: readonly number[],
  bandwidth?: number,
): number[] {
  const h = bandwidth ?? silvermanBandwidth(data);
  const n = data.length; // cells-ok — a sample count
  if (n === 0) return points.map(() => 0);

  return points.map((x) => {
    let sum = 0;
    for (const xi of data) sum += gaussianKernel((x - xi) / h);
    return sum / (n * h);
  });
}

/**
 * Build a density series from raw data: estimate the density and return a
 * Series whose values are the density estimates, suitable for rendering as a
 * line/curve.
 */
export function densitySeries(
  series: Series,
  resolution = 100,
  adjust?: number,
): { series: Series; range: Range } {
  const finite = series.values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (finite.length === 0) return { series: { ...series, values: [] }, range: { min: 0, max: 1 } }; // cells-ok — a sample count

  const sorted = [...finite].sort((a, b) => a - b);
  const lo = sorted[0]!;
  const hi = sorted[sorted.length - 1]!; // cells-ok — a sample count
  const pad = (hi - lo) * 0.1 || 1;

  const points: number[] = [];
  for (let i = 0; i < resolution; i++) {
    points.push(lo - pad + ((hi - lo + 2 * pad) * i) / (resolution - 1));
  }

  const densities = kde(finite, points, scaledBandwidth(finite, adjust));
  const maxD = Math.max(...densities);

  return {
    series: { ...series, values: densities },
    range: { min: 0, max: maxD > 0 ? maxD : 1 },
  };
}
