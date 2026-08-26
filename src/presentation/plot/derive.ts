/**
 * **What a form draws, when that is not what it was given** (C12 I65, I70, §3ak.7,
 * §3ak.27).
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
import type { Plot, Series } from "../../data/viewmodel/index.js";
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

/**
 * Decimals for a bin edge — enough that two adjacent edges differ.
 *
 * The same argument as an axis step's precision (C12 I22): a label rounded past
 * the gap between it and its neighbour prints two identical bounds, and a bin
 * `[3, 3)` is a statement that no reading can satisfy.
 */
function binPlaces(binWidth: number): number {
  if (!Number.isFinite(binWidth) || binWidth <= 0) return 2;
  const magnitude = Math.floor(Math.log10(binWidth));
  return Math.max(0, Math.min(6, 1 - magnitude));
}

/**
 * Histogram binning: Sturges, Freedman–Diaconis, Scott.
 */
export function binValues(
  series: readonly (readonly (number | null)[])[],
  method: "sturges" | "freedman-diaconis" | "scott" = "sturges",
  maxBins = 40,
): { labels: string[]; counts: number[][]; edges: string[] } {
  // **One edge set over the union, and the strategy's inputs come from it too**
  // (C12 I42, §3v). Binned on its own extent each series fills the width, so two
  // distributions of different spreads draw the same picture — I35's argument
  // one form along. And a bin *count* chosen from one series' `n` and spread
  // would belong to edges that are not that series'.
  const per = series.map((vs) => vs.filter((v): v is number => v !== null && Number.isFinite(v)));
  const finite = per.flat();
  const empty = { labels: [], counts: series.map(() => []) as number[][], edges: [] };
  if (finite.length === 0) return empty; // cells-ok — a sample count

  const sorted = [...finite].sort((a, b) => a - b);
  const n = sorted.length; // cells-ok — a sample count
  const lo = sorted[0]!;
  const hi = sorted[n - 1]!;
  if (lo === hi) {
    return {
      labels: [String(lo)],
      counts: per.map((vs) => [vs.length]), // cells-ok — a sample count
      edges: [String(lo), String(lo)],
    };
  }

  let binCount: number;
  if (method === "freedman-diaconis") {
    const q1 = sorted[Math.floor(n * 0.25)]!;
    const q3 = sorted[Math.floor(n * 0.75)]!;
    const iqr = q3 - q1;
    const binWidth = iqr > 0 ? 2 * iqr * Math.pow(n, -1 / 3) : (hi - lo) / Math.ceil(Math.log2(n) + 1);
    binCount = Math.max(1, Math.min(maxBins, Math.ceil((hi - lo) / binWidth)));
  } else if (method === "scott") {
    const mean = finite.reduce((a, b) => a + b, 0) / n;
    const variance = finite.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    const sd = Math.sqrt(variance);
    const binWidth = sd > 0 ? 3.5 * sd * Math.pow(n, -1 / 3) : (hi - lo) / Math.ceil(Math.log2(n) + 1);
    binCount = Math.max(1, Math.min(maxBins, Math.ceil((hi - lo) / binWidth)));
  } else {
    binCount = Math.max(1, Math.min(maxBins, Math.ceil(Math.log2(n) + 1)));
  }

  const binWidth = (hi - lo) / binCount;
  const labels: string[] = [];
  // **A series with no finite values keeps its row of zeroes.** Dropping it
  // renumbers the groups, so the bin a reader is looking at would hold
  // different series in different bins (C12 I42).
  const counts: number[][] = per.map(() => new Array(binCount).fill(0) as number[]);

  // **A bin is an interval, and the label said it was a point.** The old line
  // pushed the rounded *left edge* alone — `0.03` — with no upper bound and no
  // notation saying it was a range at all, so a histogram's ordinate read as a
  // list of values rather than as bins. Half-open brackets, per YouPlot: every
  // bin takes `[lo, hi)` and the last takes `]`, because the last bin is where
  // the maximum lands and `floor((v - lo) / binWidth)` clamps it there.
  //
  // Decimal-aligned by padding the left number, so a column of intervals reads
  // down its own separator rather than ragged.
  // **The edges are returned as well as consumed** (C12 I30). A vertical
  // histogram labels its bottom axis with the *boundary* rather than the
  // interval: `[18.3, 23.1)` needs twelve cells and a nine-cell column drops it,
  // so the axis came back empty. `18.3` under the column's left edge is what
  // matplotlib draws and what the width affords.
  const places = binPlaces(binWidth);
  const edges: string[] = [];
  for (let i = 0; i <= binCount; i++) edges.push((lo + i * binWidth).toFixed(places));
  const widest = edges.reduce((m, e) => Math.max(m, e.length), 0); // cells-ok — a digit count
  for (let i = 0; i < binCount; i++) {
    const a = (edges[i] ?? "").padStart(widest);
    const b = (edges[i + 1] ?? "").padStart(widest);
    labels.push(`[${a}, ${b}${i === binCount - 1 ? "]" : ")"}`);
  }

  per.forEach((vs, si) => {
    const row = counts[si]!;
    for (const v of vs) {
      let bin = Math.floor((v - lo) / binWidth);
      if (bin >= binCount) bin = binCount - 1; // cells-ok — a bin index
      if (bin >= 0 && bin < binCount) row[bin] = (row[bin] ?? 0) + 1; // cells-ok — a bin index
    }
  });

  return { labels, counts, edges };
}

/**
 * The block a form actually draws (C12 I70, §3ak.27).
 *
 * **I65 put the derivation below both arms; this is the half that makes it
 * observable.** A pure function in the right layer draws nothing until somebody
 * applies it, and for the length of the unification pass nobody did: `derive.ts`
 * held `ecdfSeries` and `densitySeries` from the commit that ruled on them, and
 * was imported by the terminal's dispatch table and by `kde.ts` and **by nothing
 * on the second arm's side** (F317). So the SVG drew 240 raw samples where the
 * terminal drew 8 counted bins, the sorted values where the terminal drew a
 * kernel estimate, and a non-monotone staircase labelled as a cumulative
 * distribution.
 *
 * **Each arm calls this once, at its entry**, and everything below reads the
 * result — the figure *and* the furniture. Applying it deeper, inside `figureOf`
 * alone, would give a figure about the drawn block beside furniture about the
 * authored one, which is §3ak.7 C1 in miniature.
 *
 * **The three arms are the terminal's own constructions, moved.** That is what
 * makes byte-identity a property of the extraction rather than a hope, and the
 * terminal's 1810 baseline frames are what say it held.
 *
 * **Closed at three, by a sweep rather than by a walk.** §3ak.7 found the class
 * in the curve family and its artefact was bounded by that family, so `histogram`
 * — the same derivation, one family along — was never named. Ten sites in the
 * dispatch table reshape a block; three derive the series, four default
 * `categories`, one takes a range from quartiles that already crosses, and there
 * is no fourth.
 *
 * **What is not here, and the line it falls on.** `violinColumn` evaluates its
 * estimate at the renderer's row count, and `stackBands` resamples across the
 * area's columns — so those derivations are not functions of the block alone and
 * cannot be applied here. `ecdfSeries` is a function of `values.length`,
 * `densitySeries` fixes its resolution at 100, and `binValues` takes a binning
 * rule; that is the property this function requires, not *is it arithmetic*.
 */
export function drawnBlock(block: Plot): Plot {
  switch (block.form) {
    case "ecdf":
      return {
        ...block,
        series: block.series.map((s) => ecdfSeries(s)),
        yMin: block.yMin ?? 0,
        yMax: block.yMax ?? 1,
      };

    case "density": {
      const s = block.series[0];
      // The terminal's own guard: no series is an empty frame, not a derivation
      // of nothing. Returning the block unchanged leaves both arms to refuse it
      // the way they already do.
      if (!s) return block;
      const { series: ds, range } = densitySeries(s, 100, block.bandwidth);
      return { ...block, series: [ds], yMin: range.min, yMax: range.max };
    }

    case "histogram": {
      if (block.series.length === 0) return block; // cells-ok — a series count
      const { labels, counts, edges } = binValues(
        block.series.map((sr) => sr.values), block.binning ?? "sturges",
      );
      // **Binned, a histogram *is* a bar chart of counts.** The series keep
      // their labels and tones: the legend names them and the picture has to
      // agree with it.
      const counted: readonly Series[] = counts.map((values, i) => {
        const sr = block.series[i];
        return {
          values,
          ...(sr?.label === undefined ? {} : { label: sr.label }),
          ...(sr?.tone === undefined ? {} : { tone: sr.tone }),
        };
      });
      // **`overlap` cannot mean *draw the first one*** (C12 I42), so more than
      // one counted series is grouped unless the author asked for a stack.
      const many = counted.length > 1; // cells-ok — a series count
      return {
        ...block,
        categories: labels,
        series: counted,
        ...(many ? { layout: block.layout === undefined || block.layout === "overlap" ? "grouped" : block.layout } : {}),
        // The bin's **lower edge** along a bottom axis, not its interval:
        // `[18.3, 23.1)` needs twelve cells and a nine-cell column drops it.
        ...(block.orientation === "vertical"
          ? { categories: edges.slice(0, counts[0]?.length ?? 0).map((e) => e.trim()) } // cells-ok — a bin count
          : {}),
      };
    }

    default:
      return block;
  }
}
