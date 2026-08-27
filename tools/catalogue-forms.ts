/**
 * The catalogue's fixtures — one entry per `PlotForm`, typed.
 *
 * **A `Record<PlotForm, …>`, and that is the whole reason this file exists.**
 * These specs used to be a plain object literal inside `plot-catalogue.mjs`.
 * Nothing checked it against the union, and it drifted: eight forms — `flame`,
 * `icicle`, `calendar`, `spectrogram`, `latency`, `density2d`, `smallmultiples`,
 * `pairplot` — were in no rendered frame at all, so a quarter of the component
 * was invisible to every visual review it went through. The `Record` makes a
 * missing form a type error, which is the same argument `FURNITURE_ROWS` makes
 * one file over.
 *
 * **Deterministic, and that is the second reason.** The histogram fixtures called
 * `Math.random()`, so two runs of the catalogue produced different frames and the
 * diff between them said nothing. A catalogue that cannot be diffed is a picture,
 * not an instrument. `prng` below is a fixed-seed mulberry32.
 *
 * **A fixture must be shown to respond to the thing under test** — so where a
 * form has a known defect, the variant that *exposes* it is named here rather
 * than the one that hides it. `heatmap.sparse` is the case: the `default`
 * fixture over-fills its width (90 readings into ~72 cells) and therefore cannot
 * show the right-anchoring blank fringe, which is the defect actually reported.
 */
import type { OHLC, Plot, PlotForm, Series, VectorSeries } from "../src/data/viewmodel/index.js";

/** A plot with its identity removed — the catalogue supplies `kind` and `id`. */
/**
 * A catalogue fixture — a `Plot` minus its identity, plus what only the render
 * context can carry.
 *
 * **`cursor` is not a block field and that is the point** (C12 §3s). Where a
 * crosshair points is `RenderContext.cursorPositions`, so a catalogue that only
 * knew how to build blocks could not draw the readout or the column mark at
 * all — two of this component's surfaces with no panel between them, in the
 * document whose job is to show what it draws.
 */
export type PlotSpec = Omit<Plot, "kind" | "id"> & { readonly cursor?: number };

/** Variants for one form, keyed by variant name. */
export type FormVariants = Readonly<Record<string, PlotSpec>>;

const s = (values: readonly number[], label?: string): Series =>
  label === undefined ? { values } : { values, label };

/**
 * A walk of OHLC bars — deterministic, and it contains a doji on purpose.
 *
 * **The catalogue must be byte-identical across runs**, so the steps come from a
 * fixed cycle rather than from a clock or a seed drawn at call time. Index 12's
 * step is zero, which is the flat bar: the mark that drew green until a golden
 * frame was read with colour on.
 */
function candles(n: number): readonly OHLC[] {
  const steps = [3, -2, 5, -1, -4, 6, 2, -3, 1, 4, -5, 2, 0, 3, -6, 4];
  const out: OHLC[] = [];
  let last = 100;
  for (let i = 0; i < n; i += 1) {
    const open = last;
    const close = last + (steps[i % steps.length] ?? 1);
    out.push({ open, close, high: Math.max(open, close) + 2, low: Math.min(open, close) - 2 });
    last = close;
  }
  return out;
}

/** A trailing mean, for the overlay a candlestick's `series` is for. */
function movingAverage(values: readonly number[], window: number): readonly number[] {
  return values.map((_v, i, all) => {
    const from = Math.max(0, i - window + 1);
    const slice = all.slice(from, i + 1);
    return slice.reduce((t, x) => t + x, 0) / slice.length;
  });
}

/** Fixed-seed mulberry32 — the catalogue must be byte-identical across runs. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sin = (n: number, step = 0.1): number[] =>
  Array.from({ length: n }, (_, i) => Math.sin(i * step) * 50 + 50);

const sin50 = sin(50);
const sin500 = sin(500);

const bell = (() => {
  const r = prng(0x5eed);
  return Array.from({ length: 200 }, () => {
    // Irwin–Hall n=3, scaled — a hump rather than a flat field, so a histogram
    // fixture has a shape to be wrong about.
    const u = (r() + r() + r()) / 3;
    return u * 100;
  });
})();

const matrix = (rows: number, cols: number, step = 0.3): Series[] =>
  Array.from({ length: rows }, (_, rr) =>
    s(Array.from({ length: cols }, (_, c) => Math.sin((rr + c) * step) * 50 + 50), `row${String(rr)}`),
  );

/**
 * A field with **local extrema**, which `matrix` above does not have.
 *
 * `matrix` is `sin((r + c) · step)` — a function of `r + c` alone, so it is a
 * ridge field: every iso-line is a straight diagonal and no cell can ever have
 * two opposite corners above the level with the other two below. Measured
 * against the shipped `marchingMask`, the catalogue's own fixture produces
 * **zero saddles at every level**, so the ruling C12 I49 makes about them had
 * no fixture that could respond to it.
 *
 * A separable product can, **and the level set decides whether it does.** A
 * saddle needs both factors to change sign inside the visible span *and* a level
 * at the value the surface takes there — which for `sin·sin` is exactly the mid.
 * Derived ticks over 0–100 are 20/40/60/80 and hit none of them: measured, the
 * separable field at `freq 1.0` gives **0 saddles at the derived levels and 18
 * of 185 crossings at `levels: [50]`**. So the fixture that responds declares
 * its level, and saying *use a product instead of a ridge* would have been half
 * the answer. `test/support/README.md`'s rule — a fixture is shown to respond to
 * the thing under test before it is asserted against.
 */
/**
 * **Unlabelled**, and that is the fixture responding to a second thing. A field's
 * rows are positions rather than identities (C12 I49), so the gutter derives a
 * scale — and a row carrying `row0` suppresses it, which is what these fixtures
 * did until the frame was looked at.
 */
const field = (rows: number, cols: number, freq = 0.6): Series[] =>
  Array.from({ length: rows }, (_, r) =>
    s(Array.from({ length: cols }, (_, c) => Math.sin(r * freq) * Math.sin(c * freq) * 50 + 50)),
  );

/** A rotational vector field, so all eight directions are present. */
const swirl = (rows: number, cols: number): VectorSeries[] =>
  Array.from({ length: rows }, (_v, r) => ({ // cells-ok — a row count
    values: Array.from({ length: cols }, (_w, c) => { // cells-ok — a column count
      const [dx, dy] = [c - (cols - 1) / 2, r - (rows - 1) / 2];
      return [-dy, dx] as const;
    }),
  }));

/** Every `nth` vector kept, the rest stilled — so something shows underneath. */
const sparse = (rows: readonly VectorSeries[], nth: number): VectorSeries[] =>
  rows.map((r, ri) => ({
    ...r,
    values: r.values.map((p, ci) => ((ri + ci) % nth === 0 ? p : [0, 0] as const)),
  }));

const PIE_SEGMENTS = [
  { label: "Chrome", value: 65 },
  { label: "Firefox", value: 15 },
  { label: "Safari", value: 12 },
  { label: "Other", value: 8 },
] as const;

export const CATALOGUE_FORMS: Readonly<Record<PlotForm, FormVariants>> = Object.freeze({
  line: {
    // C12 §3g — all four placements, and the default that turns itself on.
    "legend-right": {
      form: "line", height: 8, axes: true,
      series: [s(sin50, "alpha"), s(sin50.map((v) => 100 - v), "beta"), s(sin(50, 0.2), "gamma")],
    },
    // C12 I47 — the gutter on both sides, and `false` for neither.
    "yaxis-both": {
      form: "line", height: 8, axes: true, legend: false, yAxis: "both",
      series: [s(sin50, "alpha"), s(sin50.map((v) => 100 - v), "beta")],
    },
    "yaxis-right": {
      form: "line", height: 8, axes: true, legend: false, yAxis: "right",
      series: [s(sin50, "alpha"), s(sin50.map((v) => 100 - v), "beta")],
    },
    "yaxis-none": {
      form: "line", height: 8, axes: true, legend: false, yAxis: false,
      series: [s(sin50, "alpha")],
    },
    // C12 I48 — one series' last reading, and three that contend for rows.
    "callout-single": {
      form: "line", height: 8, axes: true, legend: false, yAxis: "right", yCallout: "last",
      series: [s(sin50, "alpha")],
    },
    "callout-multiseries": {
      form: "line", height: 8, axes: true, legend: "right", yAxis: "both", yCallout: "last",
      series: [s(sin50, "alpha"), s(sin50.map((v) => 100 - v), "beta"), s(sin(50, 0.2), "gamma")],
    },
    "legend-left": {
      form: "line", height: 8, axes: true, legend: "left",
      series: [s(sin50, "alpha"), s(sin50.map((v) => 100 - v), "beta"), s(sin(50, 0.2), "gamma")],
    },
    "legend-above": {
      form: "line", height: 8, axes: true, legend: "above",
      series: [s(sin50, "alpha"), s(sin50.map((v) => 100 - v), "beta"), s(sin(50, 0.2), "gamma")],
    },
    "legend-below": {
      form: "line", height: 8, axes: true, legend: "below",
      series: [s(sin50, "alpha"), s(sin50.map((v) => 100 - v), "beta"), s(sin(50, 0.2), "gamma")],
    },
    // C12 I26 — all four shapes, same geometry, same rows.
    "frame-corners": {
      form: "line", height: 8, axes: true, plotFrame: "corners", legend: false,
      series: [s(sin50, "alpha")],
    },
    // C12 I55 §3ag — the two arms that write an identity at the line's end and
    // take the automatic legend with them. `callout-last` is the value arm for
    // comparison, since the whole claim is that the three share one anchor.
    // C04 I52 §3ag — the label the deferral was waiting for a legend row to
    // hold, on the one-series case it was written about.
    "annotation-label": {
      form: "line", height: 8, axes: true,
      annotations: [
        { kind: "line", value: 80, label: "budget" },
        { kind: "band", from: 20, to: 40, label: "warm-up" },
      ],
      series: [s(sin50, "alpha")],
    },
    // C12 I56 §3ag — the abscissa named under its own scale, which is how the
    // two are read together: `epoch 0 … now` over `training step`.
    "x-title": {
      form: "line", height: 8, axes: true, legend: false,
      xLabels: ["epoch 0", "epoch 20", "now"],
      xTitle: "training step",
      series: [s(sin50, "alpha")],
    },
    "callout-last": {
      form: "line", height: 8, axes: true, yAxis: "both", yCallout: "last",
      series: [s(sin50, "alpha"), s(sin50.map((v) => 100 - v), "beta")],
    },
    "callout-name": {
      form: "line", height: 8, axes: true, yAxis: "both", yCallout: "name",
      series: [s(sin50, "alpha"), s(sin50.map((v) => 100 - v), "beta")],
    },
    "callout-both": {
      form: "line", height: 8, axes: true, yAxis: "both", yCallout: "both",
      series: [s(sin50, "alpha"), s(sin50.map((v) => 100 - v), "beta")],
    },
    "frame-grid": {
      form: "line", height: 8, axes: true, plotFrame: "grid", legend: false,
      xLabels: ["epoch 0", "epoch 20", "now"],
      series: [s(sin50, "alpha")],
    },
    "frame-rule": {
      form: "line", height: 8, axes: true, plotFrame: "rule", legend: false,
      series: [s(sin50, "alpha")],
    },
    "legend-off": {
      form: "line", height: 8, axes: true, legend: false,
      series: [s(sin50, "alpha"), s(sin50.map((v) => 100 - v), "beta"), s(sin(50, 0.2), "gamma")],
    },
    default: { form: "line", height: 8, axes: true, series: [s(sin50)] },
    minimal: { form: "line", height: 3, axes: false, series: [s([1, 3, 2, 5, 4])] },
    dense: { form: "line", height: 8, axes: true, series: [s(sin500)] },
    empty: { form: "line", height: 5, axes: true, series: [{ values: [] }] },
    annotated: {
      form: "line", height: 8, axes: true, series: [s(sin50)],
      annotations: [{ kind: "line", value: 50 }, { kind: "band", from: 30, to: 70 }],
    },
    // **The corpus had `line` and `band` and neither of the other two kinds**,
    // which is why a confidence band's edges could ink two cells across fifty
    // columns through review and commit: nothing rendered one. Twelve samples,
    // deliberately fewer than the area is wide — the defect was proportional to
    // the sample count and invisible at any fixture with more readings than
    // cells (C12 §3e).
    // **The four corners, on one series** (C12 §3ac). Read side by side these
    // are the whole member: the same eight readings, the same eight columns, and
    // the gutter and the tick row following the data rather than staying put.
    // **A crossing axis needs both halves visible**, so the ordinate straddles
    // zero and the abscissa is *declared* to (C12 §3ad). An index domain runs
    // `0 … n − 1`, and its zero is the area's first column.
    "axis-cross": {
      form: "line", height: 10, axes: true, axisCross: "zero",
      xMin: -6, xMax: 6,
      series: [s([-4, -1, 2, 6, 3, -2, -5, 1, 5, 2, -3, -1, 4], "obs")],
    },
    "axis-cross-corners": {
      form: "line", height: 10, axes: true, axisCross: "zero", plotFrame: "corners",
      xMin: -6, xMax: 6,
      series: [s([-4, -1, 2, 6, 3, -2, -5, 1, 5, 2, -3, -1, 4], "obs")],
    },
    "origin-bottom-left": {
      form: "line", height: 8, axes: true, series: [s(sin(14), "obs")],
      xLabels: ["first", "mid", "last"],
    },
    "origin-bottom-right": {
      form: "line", height: 8, axes: true, series: [s(sin(14), "obs")],
      xLabels: ["first", "mid", "last"], origin: "bottom-right",
    },
    "origin-top-left": {
      form: "line", height: 8, axes: true, series: [s(sin(14), "obs")],
      xLabels: ["first", "mid", "last"], origin: "top-left",
    },
    "origin-top-right": {
      form: "line", height: 8, axes: true, series: [s(sin(14), "obs")],
      xLabels: ["first", "mid", "last"], origin: "top-right",
    },
    confidence: {
      form: "line", height: 8, axes: true, series: [s(sin(12), "obs")],
      annotations: [{
        kind: "confidence",
        upper: sin(12).map((v, i) => v + 8 + i),
        lower: sin(12).map((v, i) => v - 8 - i),
        tone: "info",
      }],
    },
    "confidence-unfilled": {
      form: "line", height: 8, axes: true, series: [s(sin(12), "obs")],
      annotations: [{
        kind: "confidence", fill: false,
        upper: sin(12).map((v, i) => v + 8 + i),
        lower: sin(12).map((v, i) => v - 8 - i),
        tone: "info",
      }],
    },
    whiskers: {
      form: "scatter", height: 8, axes: true, series: [s(sin(12), "obs")],
      annotations: [{
        kind: "whiskers",
        points: sin(12).map((v, i) => ({ x: i, y: v, err: 4 + i })),
        tone: "info",
      }],
    },
    "multi-series": {
      form: "line", height: 8, axes: true,
      series: [s(sin50, "alpha"), s(sin50.map((v) => 100 - v), "beta"), s(sin(50, 0.2), "gamma")],
    },
    // **The candlestick lives under `line` because it is a style** (C12 I36).
    // `CATALOGUE_FORMS` is keyed by `PlotForm` and a candlestick *is*
    // `form: "line"`, which is the same reason I25's sweep cannot see it: the
    // form is the index and the style is not (§6b B14).
    // **Thirty-two bars because the comparison grid is 64 cells.** At `axes:
    // false` the area is 64, so `⌊64 ÷ 32⌋ = 2` gives a pitch of two and the
    // candles tile it exactly — a fixture that left the right third blank would
    // diff its own layout against matplotlib's full-bleed axes and report the
    // gap as error, which is the defect the extent measure was invented for one
    // form along.
    candlestick: {
      form: "line", height: 12, axes: true, plotStyle: "candlestick",
      series: [], ohlc: candles(32),
    },
    // Plain candles are `series: []`; a non-empty `series` is the overlay, and
    // the legend names all three (§6b B1, B4).
    "candlestick-overlay": {
      form: "line", height: 12, axes: true, plotStyle: "candlestick", legend: "right",
      ohlc: candles(24),
      series: [s(movingAverage(candles(24).map((b) => b.close), 3), "ma3")],
    },
    // Dense enough that every candle is one cell — the regime that drew a chart
    // of nothing but `┿` before §6b B13 was bounded by the frame.
    "candlestick-dense": {
      form: "line", height: 10, axes: true, plotStyle: "candlestick",
      series: [], ohlc: candles(160),
    },
    // **The crosshair and the readout** (C12 §3s, I37) — a dashed column behind
    // the data, `▲` on the rule, and the value at that index below it. Nothing
    // in `src/` writes `cursorPositions`, so without a fixture here these two
    // surfaces are drawn by no frame in the catalogue.
    cursor: {
      form: "line", height: 9, axes: true, cursor: 32,
      series: [s(sin50, "alpha"), s(sin(50, 0.2), "gamma")],
    },
    // The same, over candles: four values and then the overlay (§6b B6).
    "cursor-candles": {
      form: "line", height: 11, axes: true, plotStyle: "candlestick", cursor: 9,
      ohlc: candles(24),
      series: [s(movingAverage(candles(24).map((b) => b.close), 3), "ma3")],
    },
    // **`width`, `aspect` and `align` landed with no frame at all** — three of
    // the eleven `Plot` members no catalogue variant sets, and the three this
    // arc added. `align` needs a `width` narrower than the frame to have a
    // subject, so the three placements are three variants rather than one.
    "size-left": {
      form: "line", height: 8, axes: true, width: 44, align: "left",
      series: [s(sin50, "alpha")],
    },
    "size-centre": {
      form: "line", height: 8, axes: true, width: 44, align: "centre",
      series: [s(sin50, "alpha")],
    },
    "size-right": {
      form: "line", height: 8, axes: true, width: 44, align: "right",
      series: [s(sin50, "alpha")],
    },
    // `aspect` is the member that knows `CELL_ASPECT`, so its frame is the one
    // a reader checks *visually* square rather than arithmetically — which is
    // the whole reason it exists rather than a caller doing the division.
    "aspect-square": {
      form: "line", height: 12, axes: true, aspect: 1, align: "centre",
      series: [s(sin50, "alpha")],
    },
    // **`plotCorners`, which §3af makes newly worth a frame**: at ASCII both
    // arms collapse to `+`, so the pair says the member is a preference the
    // capability can flatten rather than a second figure.
    "corners-sharp": {
      form: "line", height: 8, axes: true, plotCorners: "sharp",
      series: [s(sin50, "alpha")],
    },
  },
  sparkline: {
    default: { form: "sparkline", series: [s(sin50)] },
    minimal: { form: "sparkline", series: [s([1, 3, 2])] },
    dense: { form: "sparkline", series: [s(sin500)] },
    empty: { form: "sparkline", series: [{ values: [] }] },
  },
  scatter: {
    default: { form: "scatter", height: 8, axes: true, series: [s(sin50)] },
    // C04 I63 §3ag — a name beside a sample, and the last one is at the right
    // edge, so it has to flip to the other side of its own dot rather than
    // slide over it.
    "point-labels": {
      form: "scatter", height: 9, axes: true, legend: false,
      series: [{
        values: sin50,
        label: "alpha",
        pointLabels: sin50.map((_v, i) =>
          i === 6 ? "rise" : i === 24 ? "crest" : i === 49 ? "last" : null),
      }],
    },
    minimal: { form: "scatter", height: 3, axes: false, series: [s([1, 5, 2])] },
    dense: { form: "scatter", height: 8, axes: true, series: [s(sin500)] },
    "multi-series": {
      form: "scatter", height: 10, axes: true,
      series: [s(sin50, "setosa"), s(sin(50, 0.17).map((v) => v * 0.8 + 10), "virginica")],
    },
    empty: { form: "scatter", height: 5, axes: true, series: [{ values: [] }] },
  },
  step: {
    default: { form: "step", height: 8, axes: true, series: [s(sin50)] },
    minimal: { form: "step", height: 3, axes: false, series: [s([1, 5, 2])] },
    empty: { form: "step", height: 5, axes: true, series: [{ values: [] }] },
  },
  ecdf: {
    default: { form: "ecdf", height: 8, axes: true, series: [s([3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5])] },
    empty: { form: "ecdf", height: 5, axes: true, series: [{ values: [] }] },
  },
  heatmap: {
    default: { form: "heatmap", height: 5, axes: true, series: matrix(5, 90) },
    // The reported defect's case: fewer readings than cells. `default` cannot
    // show it — it over-fills the width, so the window never pads.
    sparse: { form: "heatmap", height: 5, axes: true, series: matrix(5, 20) },
    palette: { form: "heatmap", height: 5, axes: true, colormap: "viridis", series: matrix(5, 90) },
    empty: { form: "heatmap", height: 3, axes: true, series: [s([], "empty")] },
    // **The matrix half of `origin`, and its default is the other corner**
    // (C12 §3ac): `series[0]`, `values[0]` is at the *top* left because a row
    // index grows downward. `bottom-right` is therefore both flips at once.
    origin: { form: "heatmap", height: 5, axes: true, colormap: "viridis", series: matrix(5, 20), origin: "bottom-right" },
    // **A caption over a fringe names a column that is not there** (C12 §3ae.8,
    // A13). `left` has left a fringe since it was written and no fixture ever
    // paired it with captions, so the misalignment was shipped and invisible:
    // twenty readings into an area three times as wide, with `now` against the
    // area's right edge and the newest reading forty cells to its left.
    "captions-left": {
      form: "heatmap", height: 5, axes: true, colormap: "viridis",
      matrixAnchor: "left", xLabels: ["epoch 0", "epoch 10", "now"],
      series: matrix(5, 20),
    },
  },
  contour: {
    // **The braille arm, which is the default and the one the saddle is visible
    // on** (C12 I49). A 6x24 field of sin(r+c) gives crossings in every column.
    default: { form: "contour", height: 6, axes: true, series: field(6, 24) },
    // **The saddle, and it takes both halves** (C12 I49): a separable field so
    // the surface has one, and `levels: [50]` because that is the value it takes
    // there. 18 saddle cells of 185 crossings; the derived levels give zero.
    saddle: {
      form: "contour", height: 8, axes: true, levels: [50], series: field(8, 32, 1.0),
    },
    // The ridge field kept as its own variant: every iso-line straight, which is
    // what a contour of a monotone surface looks like and is worth showing.
    ridge: { form: "contour", height: 6, axes: true, series: matrix(6, 24) },
    // The box-drawing fork: real joins, and both saddle resolutions collapse.
    "style-line": { form: "contour", height: 6, axes: true, plotStyle: "line", series: field(6, 24) },
    // Lines on an unpainted area — `field` dropped from `layers` (C12 I51).
    "lines-only": { form: "contour", height: 6, axes: true, layers: ["contour"], series: field(6, 24) },
    // The two contrast remedies, each with its own price (C12 I51).
    "dim-floor": { form: "contour", height: 6, axes: true, fieldDim: "floor", series: field(6, 24) },
    "ink-contrast": { form: "contour", height: 6, axes: true, glyphInk: "contrast", series: field(6, 24) },
    // Declared levels, including one outside the range — named, drawn nowhere.
    levels: { form: "contour", height: 6, axes: true, levels: [25, 50, 75, 500], series: field(6, 24) },
    // A constant field crosses nothing: no contour, and not a full grid.
    flat: { form: "contour", height: 4, axes: true, series: matrix(4, 16, 0) },
  },
  quiver: {
    // A rotational field — `[-sin, cos]` around the centre — so every one of the
    // eight directions appears and the picture is one a reader can check.
    default: { form: "quiver", height: 6, axes: true, series: [], vectors: swirl(6, 24) },
    // Arrows on an unpainted area (C12 I51): direction alone, no magnitude.
    "arrows-only": {
      form: "quiver", height: 6, axes: true, layers: ["quiver"], series: [], vectors: swirl(6, 24),
    },
    // **A still cell draws nothing** (C12 I50) — not an arrow of arbitrary
    // direction, which is what `atan2(0, 0) === 0` would give.
    still: {
      form: "quiver", height: 4, axes: true, series: [],
      vectors: Array.from({ length: 4 }, (_v, r) => ({ // cells-ok — a row count
        values: Array.from({ length: 12 }, (_w, c) => (c % 3 === 0 ? [0, 0] as const : [c - 6, r - 2] as const)), // cells-ok
      })),
    },
    // **The contrast remedy reaches the quiver too** (C12 I51) — `glyphInk` is a
    // field-family member, not a contour one, and an arrow over the bright end
    // of a ramp is exactly the cell it is for.
    "ink-contrast": {
      form: "quiver", height: 6, axes: true, glyphInk: "contrast", series: [], vectors: swirl(6, 24),
    },
    // And the field dimmed instead, which is the other remedy on the same frame.
    "dim-floor": {
      form: "quiver", height: 6, axes: true, fieldDim: "floor", series: [], vectors: swirl(6, 24),
    },
    // A contour and a quiver over one field: both glyph layers, and §3u decides
    // the contested cells (C12 I51).
    //
    // **The vectors are sparse and that is the fixture responding.** A dense
    // swirl fills every cell, the quiver is last in draw order and therefore
    // first in priority, and the contour beneath it is drawn nowhere — correct
    // by §3u and a picture that shows nothing about layering. LY3's claim is
    // *the contour shows wherever no arrow lands*, so the fixture has to leave
    // somewhere for it to land.
    "with-contour": {
      form: "quiver", height: 6, axes: true, layers: ["field", "contour", "quiver"],
      series: field(6, 24), vectors: sparse(swirl(6, 24), 4),
    },
  },
  bar: {
    // **C12 §3j's case for the field**: ordered categories along the bottom.
    vertical: {
      form: "bar", height: 10, axes: true, orientation: "vertical",
      categories: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      series: [s([12, 19, 15, 22, 30, 8, 4])],
    },
    default: {
      form: "bar", height: 5, axes: true,
      categories: ["alpha", "beta", "gamma", "delta", "epsilon"], series: [s([10, 25, 15, 30, 20])],
    },
    stacked: {
      form: "bar", height: 5, axes: true, categories: ["Q1", "Q2", "Q3", "Q4"], layout: "stacked",
      series: [s([10, 20, 15, 25], "direct"), s([5, 10, 8, 12], "referral")],
    },
    normalised: {
      form: "bar", height: 5, axes: true, categories: ["Q1", "Q2", "Q3", "Q4"], layout: "normalised",
      series: [s([10, 20, 15, 25], "direct"), s([5, 10, 8, 12], "referral")],
    },
    grouped: {
      form: "bar", height: 5, axes: true, categories: ["A", "B"], layout: "grouped",
      series: [s([10, 20], "before"), s([15, 25], "after")],
    },
    // YouPlot's landmasses case — a wide dynamic range with long labels.
    wide: {
      form: "bar", height: 8, axes: true,
      categories: ["Britain", "Honshu", "Sumatra", "Baffin", "Madagascar", "Borneo", "Greenland", "Australia"],
      series: [s([84, 89, 183, 184, 227, 280, 840, 2968])],
    },
    empty: { form: "bar", height: 3, axes: true, categories: ["x"], series: [{ values: [] }] },
  },
  histogram: {

    // **Two distributions on one edge set** (C12 I42, §3v). Separated on
    // purpose: binned on its own extent each would fill the width and the two
    // would draw the same picture, which is the comparison the plot exists for.
    "two-series": {
      // **Eighteen, because nine bins grouped over two series is eighteen
      // rows** and `categoricalForm` slices what does not fit *without saying
      // so* (F192). A fixture short by two would ship a frame missing a bin
      // with nothing on it to say a bin is missing.
      form: "histogram", height: 18, axes: true, legend: "right",
      series: [
        { values: Array.from({ length: 120 }, (_, i) => 20 + ((i * 37) % 23) * 0.6), label: "before" },
        { values: Array.from({ length: 120 }, (_, i) => 45 + ((i * 53) % 31) * 0.7), label: "after" },
      ],
    },
    "two-series-stacked": {
      form: "histogram", height: 14, axes: true, legend: "right", layout: "stacked",
      series: [
        { values: Array.from({ length: 120 }, (_, i) => 30 + ((i * 37) % 29) * 0.8), label: "control" },
        { values: Array.from({ length: 120 }, (_, i) => 34 + ((i * 53) % 31) * 0.8), label: "treated" },
      ],
    },
    // A histogram is what vertical was asked for — its bins are ordered and its
    // labels are half-open intervals, which read along a bottom axis.
    vertical: {
      form: "histogram", height: 10, axes: true, orientation: "vertical",
      series: [s(Array.from({ length: 200 }, (_, i) => 40 + Math.sin(i * 0.37) * 22 + prng(7)() * 14))],
    },
    default: { form: "histogram", height: 8, axes: true, series: [s(bell)] },
    "freedman-diaconis": { form: "histogram", height: 8, axes: true, binning: "freedman-diaconis", series: [s(bell)] },
    scott: { form: "histogram", height: 8, axes: true, binning: "scott", series: [s(bell)] },
  },
  boxplot: {
    // C12 §3j — the figure stood up, three columns where the band has three rows.
    vertical: {
      form: "boxplot", height: 12, axes: true, orientation: "vertical",
      categories: ["setosa", "versicolor", "virginica", "hybrid"],
      series: [],
      quartiles: [
        { min: 4.3, q1: 5.1, median: 5.8, q3: 6.4, max: 7.9, mean: 5.9 },
        { min: 2.0, q1: 2.8, median: 3.0, q3: 3.3, max: 4.4, mean: 3.1, outliers: [4.4] },
        { min: 1.0, q1: 1.6, median: 4.35, q3: 5.1, max: 6.9, mean: 3.8 },
        { min: 0.1, q1: 0.3, median: 1.3, q3: 1.8, max: 2.5, mean: 1.2 },
      ],
    },
    default: {
      form: "boxplot", height: 12, axes: true, categories: ["sepal_length", "sepal_width", "petal_length", "petal_width"],
      quartiles: [
        { min: 4.3, q1: 5.1, median: 5.8, q3: 6.4, max: 7.9 },
        { min: 2.0, q1: 2.8, median: 3.0, q3: 3.3, max: 4.4, outliers: [4.4] },
        { min: 1.0, q1: 1.6, median: 4.35, q3: 5.1, max: 6.9 },
        { min: 0.1, q1: 0.3, median: 1.3, q3: 1.8, max: 2.5 },
      ],
      series: [],
    },
    compact: {
      form: "boxplot", height: 4, axes: true, categories: ["A", "B", "C", "D"],
      quartiles: [
        { min: 1, q1: 3, median: 5, q3: 7, max: 9 },
        { min: 2, q1: 4, median: 6, q3: 8, max: 10, outliers: [12] },
        { min: 0, q1: 2, median: 4, q3: 6, max: 8 },
        { min: 3, q1: 5, median: 7, q3: 9, max: 11 },
      ],
      series: [],
    },
    // **A rung with room to spare, which no fixture had** (C12 I28, T1.90).
    // `compact` above is four categories in four rows and `default` is four in
    // twelve — one row per band and three per band, and in both the figure
    // exactly fills what it is given. So the whole corpus was blind to the case
    // where it does not, and a category's name sat two rows below the box it
    // named through every visual review the component has had. Three in twelve
    // is four rows a band against a one-row figure, which is the case.
    // **No whisker, no stub** (C12 I33). `q3 === max` on the first band and
    // `q1 === min` on the second, which is the pair that drew a stem pointing
    // at blank columns until a golden frame was read.
    "flat-whisker": {
      form: "boxplot", height: 7, axes: true, categories: ["capped", "floored", "both"],
      series: [],
      quartiles: [
        { min: 1, q1: 3, median: 5, q3: 9, max: 9 },
        { min: 1, q1: 1, median: 4, q3: 7, max: 9 },
        { min: 3, q1: 3, median: 5, q3: 7, max: 7, mean: 5 },
      ],
    },
    roomy: {
      form: "boxplot", height: 12, axes: true, plotDetail: "compact",
      categories: ["A", "B", "C"],
      quartiles: [
        { min: 1, q1: 3, median: 5, q3: 7, max: 9, mean: 5.5 },
        { min: 2, q1: 4, median: 6, q3: 8, max: 10, outliers: [12] },
        { min: 0, q1: 2, median: 4, q3: 6, max: 8 },
      ],
      series: [],
    },
  },
  forest: {
    // **The fixture set `q1`/`q3` on every entry**, which is why the box drew
    // over the interval in every rendered frame and nobody saw the interval at
    // all. Kept as `boxed` below, because a summary carrying both is a real
    // input and the row must draw the interval anyway.
    default: {
      form: "forest", height: 5, axes: true,
      categories: ["Aalborg 92", "Basel 88", "Cardiff 95", "Delft 01", "pooled"],
      quartiles: [
        { min: 0, q1: 0, median: 0, q3: 0, max: 0, centre: -0.6, lower: -1.4, upper: 0.2, weight: 0.18 },
        { min: 0, q1: 0, median: 0, q3: 0, max: 0, centre: -0.2, lower: -0.7, upper: 0.3, weight: 0.34 },
        { min: 0, q1: 0, median: 0, q3: 0, max: 0, centre: -1.1, lower: -2.4, upper: -0.1, weight: 0.09 },
        { min: 0, q1: 0, median: 0, q3: 0, max: 0, centre: -0.4, lower: -0.9, upper: 0.1, weight: 0.29 },
        { min: 0, q1: 0, median: 0, q3: 0, max: 0, centre: -0.42, lower: -0.72, upper: -0.12, weight: 0.55, pooled: true },
      ],
      series: [],
      annotations: [{ kind: "line", value: 0, tone: "muted" }],
    },
    boxed: {
      form: "forest", height: 3, axes: true, categories: ["Study A", "Study B", "Study C"],
      quartiles: [
        { min: 1, q1: 3, median: 5, q3: 7, max: 9, centre: 5, lower: 3, upper: 7 },
        { min: 2, q1: 4, median: 6, q3: 8, max: 10, centre: 6, lower: 4, upper: 8 },
        { min: 0, q1: 2, median: 4, q3: 6, max: 8, centre: 4, lower: 2, upper: 6 },
      ],
      series: [],
    },
  },
  dumbbell: {
    default: {
      form: "dumbbell", height: 4, axes: true, categories: ["2020", "2021", "2022", "2023"],
      series: [s([10, 20, 30, 25], "start"), s([30, 25, 40, 35], "end")],
    },
  },
  lollipop: {
    default: {
      form: "lollipop", height: 5, axes: true,
      categories: ["alpha", "beta", "gamma", "delta", "epsilon"], series: [s([10, 25, 15, 30, 20])],
    },
  },
  dotplot: {
    default: {
      form: "dotplot", height: 5, axes: true,
      categories: ["alpha", "beta", "gamma", "delta", "epsilon"], series: [s([10, 25, 15, 30, 20])],
    },
  },
  waffle: {
    default: {
      form: "waffle", series: [],
      segments: [{ label: "Yes", value: 65 }, { label: "No", value: 25 }, { label: "Maybe", value: 10 }],
    },
    // **The rounding, which the one existing variant could not reach** (F305).
    // 65/25/10 sums to exactly 100, so `scale === 1` and `Math.round` is the
    // identity function — the hundred-square assignment was being asserted by a
    // fixture that never asks it anything. Two directions, and they fail
    // differently:
    //
    //   under-100   1/1/1 → 33.33 each → 33/33/33 = 99. **A square is left
    //               empty**, and the grid has to say which.
    //   over-100    50/50/1 → 49.5/49.5/0.99 → 50/50/1 = 101 against a
    //               `pos < 100` guard. **The last segment receives no square at
    //               all** — it holds a share of the whole and is invisible,
    //               which is the frame worth having.
    "under-100": {
      form: "waffle", series: [],
      segments: [{ label: "One", value: 1 }, { label: "Two", value: 1 }, { label: "Three", value: 1 }],
    },
    "over-100": {
      form: "waffle", series: [],
      segments: [{ label: "Half", value: 50 }, { label: "Half again", value: 50 }, { label: "Sliver", value: 1 }],
    },
  },
  flame: {
    tree: {
      form: "flame", height: 6,
      series: [],
      hierarchy: {
        label: "root", value: 100,
        children: [
          { label: "render", value: 46, children: [
            { label: "curve", value: 21, children: [{ label: "raster", value: 12 }] },
            { label: "paint", value: 17 },
          ] },
          { label: "layout", value: 31, children: [
            { label: "measure", value: 18 }, { label: "wrap", value: 9 },
          ] },
          { label: "parse", value: 23 },
        ],
      },
    },
    default: {
      form: "flame", height: 6, axes: true,
      categories: ["main", "parse", "lex", "eval", "gc", "io"],
      series: [s([100, 60, 25, 30, 10, 8])],
    },
  },
  icicle: {
    tree: {
      form: "icicle", height: 6,
      series: [],
      hierarchy: {
        label: "root", value: 100,
        children: [
          { label: "render", value: 46, children: [
            { label: "curve", value: 21, children: [{ label: "raster", value: 12 }] },
            { label: "paint", value: 17 },
          ] },
          { label: "layout", value: 31, children: [
            { label: "measure", value: 18 }, { label: "wrap", value: 9 },
          ] },
          { label: "parse", value: 23 },
        ],
      },
    },
    default: {
      form: "icicle", height: 6, axes: true,
      categories: ["main", "parse", "lex", "eval", "gc", "io"],
      series: [s([100, 60, 25, 30, 10, 8])],
    },
  },
  funnel: {
    default: {
      form: "funnel", height: 4, axes: true,
      categories: ["Visit", "Sign up", "Trial", "Pay"], series: [s([1000, 400, 200, 80])],
    },
  },
  gantt: {
    default: {
      form: "gantt", height: 4, axes: true, categories: ["Build", "Test", "Deploy", "Monitor"],
      series: [s([5, 3, 2, 1])], offsets: [0, 5, 8, 10],
    },
  },
  waterfall: {
    default: {
      form: "waterfall", height: 5, axes: true,
      categories: ["Revenue", "COGS", "Opex", "Tax", "Net"],
      series: [s([100, -40, -25, -10, 25])], totals: [false, false, false, false, true],
    },
  },
  slope: {
    // Ranking change — the lines crossing *is* the content, which is why this is
    // not two bar charts side by side.
    default: {
      form: "slope", height: 10, axes: true,
      series: [s([12, 38], "north"), s([31, 14], "south"), s([22, 27], "east")],
    },
    // **The variant that separates `slope` from `line`** (§3ak.35, F331's lesson
    // one commit on). Every series above has exactly **two** values, so the
    // form's one distinguishing operation — take the first reading and the last,
    // and draw nothing between — is the identity on the whole corpus, and a
    // frame read against it checks the thing that is already correct.
    //
    // Six quarterly readings, drawn as two columns. `south` dips to 9 and `east`
    // peaks at 41 in between, so the samples that are **not** drawn fall outside
    // the ones that are — which is what makes the derivation visible in a frame
    // rather than merely present in the data.
    "six-readings": {
      form: "slope", height: 10, axes: true,
      series: [
        s([12, 18, 24, 29, 33, 38], "north"),
        s([31, 26, 9, 15, 12, 14], "south"),
        s([22, 30, 41, 36, 31, 27], "east"),
      ],
    },
  },
  bubble: {
    default: {
      form: "bubble", height: 10, axes: true,
      series: [
        s([20, 45, 30, 60, 38, 52, 25], "value"),
        s([2, 9, 4, 14, 6, 11, 3], "size"),
      ],
    },
  },
  autocorrelation: {
    default: {
      form: "autocorrelation", height: 9, axes: true,
      categories: ["0", "1", "2", "3", "4", "5", "6", "7", "8"],
      series: [s([1, 0.72, 0.41, 0.12, -0.18, -0.33, -0.21, 0.04, 0.19])],
      annotations: [{ kind: "line", value: 0.28 }],
    },
  },
  timeline: {
    default: {
      form: "timeline", height: 4, axes: true,
      categories: ["deploy", "incident", "rollback"],
      series: [s([2, 9, 17, 28, 41]), s([12, 23, 36]), s([13, 37])],
    },
  },
  bullet: {
    default: {
      form: "bullet", height: 4, axes: true,
      categories: ["revenue", "margin", "churn"],
      series: [s([72, 38, 21])],
      quartiles: [
        { min: 0, q1: 40, median: 65, q3: 85, max: 100, centre: 80 },
        { min: 0, q1: 20, median: 35, q3: 45, max: 60, centre: 42 },
        { min: 0, q1: 10, median: 20, q3: 30, max: 40, centre: 15 },
      ],
    },
  },
  utilisation: {
    default: {
      form: "utilisation", height: 4,
      series: [
        s(Array.from({ length: 24 }, (_, i) => 30 + Math.sin(i * 0.4) * 30), "node-1"),
        s(Array.from({ length: 24 }, (_, i) => 50 + Math.cos(i * 0.3) * 35), "node-2"),
        s(Array.from({ length: 24 }, (_, i) => 20 + Math.sin(i * 0.6) * 18), "node-3"),
        s(Array.from({ length: 24 }, (_, i) => 65 + Math.cos(i * 0.5) * 25), "node-4"),
      ],
    },
  },
  graph: {
    // Five nodes, seven edges, and each variant is chosen to make one pass
    // visible: `cache` has two parents, `parse -> cache` spans two layers so a
    // dummy is inserted, and `render`/`layout` are a two-cycle so the reversal
    // pass fires and the notice row carries a count (C12 §3ai).
    default: {
      form: "graph", height: 9, series: [],
      graph: {
        nodes: [
          { id: "parse" }, { id: "render" }, { id: "layout" },
          { id: "cache" }, { id: "paint" },
        ],
        edges: [
          { from: "parse", to: "render" },
          { from: "render", to: "layout" },
          { from: "layout", to: "render" },
          { from: "render", to: "cache" },
          { from: "layout", to: "cache" },
          { from: "parse", to: "cache" },
          { from: "layout", to: "paint" },
        ],
      },
    },
    // **Sized past what fits**, because the drop is the ordinary case past about
    // a dozen nodes (F242) and a corpus that only holds figures which fit
    // records the notice row nowhere.
    crowded: {
      form: "graph", height: 7, series: [],
      graph: {
        nodes: Array.from({ length: 14 }, (_n, i) => ({ id: `service-${String(i + 1).padStart(2, "0")}` })),
        edges: Array.from({ length: 13 }, (_n, i) => ({
          from: `service-${String(i + 1).padStart(2, "0")}`,
          to: `service-${String(i + 2).padStart(2, "0")}`,
        })),
      },
    },
  },
  tree: {
    // The catalogue's own tree, and C12 §3ah.1's measurements are taken on it:
    // 9 nodes, 5 leaves, depth 3, leaf names totalling 27 cells. **Three
    // layouts at their natural size and three overflowing**, because the
    // overflow row competes with something different in each — one more line in
    // a list, a row under a fan that could read as a child, or a row beside the
    // deepest column — and one frame cannot answer for the other two.
    default: {
      form: "tree", height: 7, series: [],
      hierarchy: {
      label: "root",
      children: [
        { label: "render", children: [
          { label: "curve", children: [{ label: "raster" }] },
          { label: "paint" },
        ] },
        { label: "layout", children: [{ label: "measure" }, { label: "wrap" }] },
        { label: "parse" },
      ],
    },
    },
    "left-right": {
      form: "tree", height: 5, series: [], treeLayout: "leftRight",
      hierarchy: {
      label: "root",
      children: [
        { label: "render", children: [
          { label: "curve", children: [{ label: "raster" }] },
          { label: "paint" },
        ] },
        { label: "layout", children: [{ label: "measure" }, { label: "wrap" }] },
        { label: "parse" },
      ],
    },
    },
    outline: {
      form: "tree", height: 9, series: [], treeLayout: "outline",
      hierarchy: {
      label: "root",
      children: [
        { label: "render", children: [
          { label: "curve", children: [{ label: "raster" }] },
          { label: "paint" },
        ] },
        { label: "layout", children: [{ label: "measure" }, { label: "wrap" }] },
        { label: "parse" },
      ],
    },
    },
    "overflow-top-down": {
      form: "tree", height: 4, series: [], treeLayout: "topDown",
      hierarchy: {
      label: "root",
      children: [
        { label: "render", children: [
          { label: "curve", children: [{ label: "raster" }] },
          { label: "paint" },
        ] },
        { label: "layout", children: [{ label: "measure" }, { label: "wrap" }] },
        { label: "parse" },
      ],
    },
    },
    "overflow-left-right": {
      form: "tree", height: 3, series: [], treeLayout: "leftRight",
      hierarchy: {
      label: "root",
      children: [
        { label: "render", children: [
          { label: "curve", children: [{ label: "raster" }] },
          { label: "paint" },
        ] },
        { label: "layout", children: [{ label: "measure" }, { label: "wrap" }] },
        { label: "parse" },
      ],
    },
    },
    "overflow-outline": {
      form: "tree", height: 6, series: [], treeLayout: "outline",
      hierarchy: {
      label: "root",
      children: [
        { label: "render", children: [
          { label: "curve", children: [{ label: "raster" }] },
          { label: "paint" },
        ] },
        { label: "layout", children: [{ label: "measure" }, { label: "wrap" }] },
        { label: "parse" },
      ],
    },
    },
  },
  treemap: {
    // One tree, three forms — C04 I54. The same fixture below under `flame` and
    // `icicle`, because what they disagree about is layout.
    default: {
      form: "treemap", height: 12,
      series: [],
      hierarchy: {
        label: "root", value: 100,
        children: [
          { label: "render", value: 46, children: [
            { label: "curve", value: 21, children: [{ label: "raster", value: 12 }] },
            { label: "paint", value: 17 },
          ] },
          { label: "layout", value: 31, children: [
            { label: "measure", value: 18 }, { label: "wrap", value: 9 },
          ] },
          { label: "parse", value: 23 },
        ],
      },
    },
  },
  stackedarea: {
    // **The fold's first origin: zero.** Three series that must never cross —
    // each band's floor is the one below it's ceiling, which is structural
    // rather than a property of the data.
    default: {
      form: "stackedarea", height: 10, axes: true,
      series: [
        s(Array.from({ length: 60 }, (_, i) => 20 + Math.sin(i * 0.18) * 12), "api"),
        s(Array.from({ length: 60 }, (_, i) => 14 + Math.cos(i * 0.11) * 9), "worker"),
        s(Array.from({ length: 60 }, (_, i) => 9 + Math.sin(i * 0.27 + 1) * 6), "cron"),
      ],
    },
  },
  streamgraph: {
    // **The old fixture could not show the form.** Two series summing to a
    // constant 100 give a stream of uniform thickness — every band correct and
    // the figure saying nothing, because a stream graph's subject is how the
    // *total* swells and shrinks. A fixture must be able to respond to the thing
    // under test.
    default: {
      form: "streamgraph", height: 10, axes: true,
      series: [
        s(Array.from({ length: 60 }, (_, i) => 6 + Math.max(0, Math.sin(i * 0.16)) * 26), "search"),
        s(Array.from({ length: 60 }, (_, i) => 10 + Math.max(0, Math.sin(i * 0.09 + 2)) * 18), "social"),
        s(Array.from({ length: 60 }, (_, i) => 4 + Math.max(0, Math.cos(i * 0.21)) * 12), "direct"),
      ],
    },
    flat: {
      // Kept, because a constant total is a real shape and the one the old
      // default drew by accident — a stream graph of a fixed-size market.
      form: "streamgraph", height: 8, axes: true,
      series: [s(sin50, "alpha"), s(sin50.map((v) => 100 - v), "beta")],
    },
    "three-band": {
      form: "streamgraph", height: 10, axes: true,
      series: [s(sin(50, 0.13), "search"), s(sin(50, 0.21), "social"), s(sin(50, 0.07), "direct")],
    },
  },
  calendar: {
    // **The pre-unit calendar, and it is the frame that must not move** (C12
    // §3ae, CL6): seven rows the *fixture* named, over a matrix that has never
    // heard of a day.
    default: {
      form: "calendar", height: 7, axes: true,
      series: Array.from({ length: 7 }, (_, d) =>
        s(Array.from({ length: 53 }, (_, w) => Math.abs(Math.sin((d * 53 + w) * 0.7)) * 12), ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d]),
      ),
    },
    // A year of daily readings from a Thursday — GitHub's contribution grid,
    // and the ragged first column is the three days that precede the start.
    day: {
      form: "calendar", height: 7, axes: true, calendarUnit: "day", startDate: "2026-01-01",
      series: [s(Array.from({ length: 365 }, (_, i) => Math.abs(Math.sin(i * 0.37)) * 12 + (i % 7 === 5 ? 6 : 0)), "commits")],
    },
    // **The same readings under the anchor the walk ruled against**, so the two
    // frames can be read side by side (§3ae.5): fifty-three weeks over
    // seventy-odd cells gives columns of one and two cells under `stretch`.
    "day-stretch": {
      form: "calendar", height: 7, axes: true, calendarUnit: "day", startDate: "2026-01-01",
      matrixAnchor: "stretch",
      series: [s(Array.from({ length: 365 }, (_, i) => Math.abs(Math.sin(i * 0.37)) * 12 + (i % 7 === 5 ? 6 : 0)), "commits")],
    },
    // A fortnight of hourly readings: twenty-four rows, a column a day, and a
    // diurnal shape that makes a wrong row obvious.
    hour: {
      form: "calendar", height: 24, axes: true, calendarUnit: "hour", startDate: "2026-03-04T09",
      series: [s(Array.from({ length: 336 }, (_, i) => 6 + 5 * Math.sin(((i + 9) % 24) * 0.26)), "load")],
    },
    // Twenty-four months of weekly readings — the unit whose grid has interior
    // holes, because a month is not a whole number of weeks.
    week: {
      form: "calendar", height: 5, axes: true, calendarUnit: "week", startDate: "2026-01-05",
      series: [s(Array.from({ length: 104 }, (_, i) => Math.abs(Math.cos(i * 0.41)) * 9), "deploys")],
    },
    // Twelve years of monthly readings, which is where `uniform` widens a column
    // to six cells and `left` would leave twelve of seventy-odd.
    month: {
      form: "calendar", height: 12, axes: true, calendarUnit: "month", startDate: "2026-01-01",
      series: [s(Array.from({ length: 144 }, (_, i) => 20 + 15 * Math.sin(i * 0.52) + (i % 12) * 0.8), "revenue")],
    },
  },
  correlation: {
    default: {
      form: "correlation", height: 4, axes: true, categories: ["A", "B", "C", "D"],
      series: [
        s([1, 0.8, -0.3, 0.5], "A"), s([0.8, 1, 0.2, 0.6], "B"),
        s([-0.3, 0.2, 1, -0.1], "C"), s([0.5, 0.6, -0.1, 1], "D"),
      ],
    },
  },
  confusion: {
    default: {
      form: "confusion", height: 3, axes: true, categories: ["cat", "dog", "bird"],
      series: [s([90, 5, 5], "cat"), s([10, 80, 10], "dog"), s([5, 15, 80], "bird")],
    },
  },
  spectrogram: {
    default: { form: "spectrogram", height: 8, axes: true, series: matrix(8, 90, 0.22) },
    sparse: { form: "spectrogram", height: 8, axes: true, series: matrix(8, 20, 0.22) },
  },
  latency: {
    default: {
      form: "latency", height: 5, axes: true,
      series: [
        s(sin(90, 0.09).map((v) => v * 0.4 + 5), "p50"),
        s(sin(90, 0.09).map((v) => v * 0.8 + 20), "p90"),
        s(sin(90, 0.09).map((v) => v * 1.4 + 60), "p99"),
      ],
    },
  },
  density2d: {
    default: { form: "density2d", height: 8, axes: true, series: matrix(8, 40, 0.35) },
  },
  density: {
    default: {
      form: "density", height: 8, axes: true,
      series: [s([1, 1, 2, 2, 2, 3, 3, 4, 5, 5, 5, 5, 6, 7, 8, 8, 8, 9, 10])],
    },
    bimodal: { form: "density", height: 8, axes: true, series: [s([1, 1, 1, 1, 2, 3, 5, 5, 5, 5])] },
  },
  violin: {
    // The three styling forks (C12 I43, §3w) — the vocabulary, not the geometry.
    braille: {
      form: "violin", height: 21, axes: true, plotStyle: "braille",
      categories: ["tight", "wide", "skewed"],
      series: [
        s(Array.from({ length: 200 }, (_, i) => 40 + Math.sin(i * 1.7) * 5 + ((i * 7) % 11) - 5)),
        s(Array.from({ length: 200 }, (_, i) => 45 + Math.sin(i * 1.7) * 12 + ((i * 7) % 11) - 5)),
        s(Array.from({ length: 200 }, (_, i) => 38 + Math.sin(i * 1.7) * 8 + ((i * 7) % 11) - 5)),
      ],
    },
    "braille-filled": {
      form: "violin", height: 21, axes: true, plotStyle: "braille", plotFill: "solid",
      categories: ["tight", "wide", "skewed"],
      series: [
        s(Array.from({ length: 200 }, (_, i) => 40 + Math.sin(i * 1.7) * 5 + ((i * 7) % 11) - 5)),
        s(Array.from({ length: 200 }, (_, i) => 45 + Math.sin(i * 1.7) * 12 + ((i * 7) % 11) - 5)),
        s(Array.from({ length: 200 }, (_, i) => 38 + Math.sin(i * 1.7) * 8 + ((i * 7) % 11) - 5)),
      ],
    },
    // **The rule of thumb's named failure**: two separated modes, which
    // Silverman widens the kernel until it fills in. The same data at
    // `bandwidth: 0.4` shows both.
    "bimodal-sharp": {
      form: "violin", height: 12, axes: true, bandwidth: 0.4,
      categories: ["measured"],
      series: [s([...Array.from({ length: 25 }, (_, i) => 10 + (i % 5) * 0.4),
                  ...Array.from({ length: 25 }, (_, i) => 30 + (i % 5) * 0.4)])],
    },
    "bimodal-default": {
      form: "violin", height: 12, axes: true,
      categories: ["measured"],
      series: [s([...Array.from({ length: 25 }, (_, i) => 10 + (i % 5) * 0.4),
                  ...Array.from({ length: 25 }, (_, i) => 30 + (i % 5) * 0.4)])],
    },
    // The vertical arm's braille fork (C12 I43, §3w). Standing the figure up
    // swaps which axis gains: the value axis is sampled at four dot rows a cell
    // instead of the width being offset at four.
    "vertical-braille": {
      form: "violin", height: 14, axes: true, orientation: "vertical", plotStyle: "braille",
      categories: ["control", "dose-a", "dose-b"],
      series: [
        s(Array.from({ length: 40 }, (_v, i) => 30 + Math.sin(i * 0.7) * 9)),
        s(Array.from({ length: 40 }, (_v, i) => 45 + Math.sin(i * 0.5) * 6)),
        s(Array.from({ length: 40 }, (_v, i) => 38 + Math.cos(i * 0.9) * 12)),
      ],
    },
    "vertical-braille-filled": {
      form: "violin", height: 14, axes: true, orientation: "vertical",
      plotStyle: "braille", plotFill: "solid",
      categories: ["control", "dose-a", "dose-b"],
      series: [
        s(Array.from({ length: 40 }, (_v, i) => 30 + Math.sin(i * 0.7) * 9)),
        s(Array.from({ length: 40 }, (_v, i) => 45 + Math.sin(i * 0.5) * 6)),
        s(Array.from({ length: 40 }, (_v, i) => 38 + Math.cos(i * 0.9) * 12)),
      ],
    },
    // C12 §3j — the conventional orientation, and one shared value axis.
    vertical: {
      form: "violin", height: 14, axes: true, orientation: "vertical",
      categories: ["control", "dose-a", "dose-b"],
      series: [
        s(Array.from({ length: 40 }, (_, i) => 30 + Math.sin(i * 0.7) * 9)),
        s(Array.from({ length: 40 }, (_, i) => 45 + Math.sin(i * 0.5) * 6)),
        s(Array.from({ length: 40 }, (_, i) => 38 + Math.cos(i * 0.9) * 12)),
      ],
    },
    default: {
      form: "violin", height: 18, axes: true, categories: ["tight", "wide", "skewed"],
      // **The count was raised from eight to thirty and the *shape* was not, so
      // the fixture still could not show the form.** A sine sampled at uniform
      // intervals is near-uniform in *value* — thirty points spread almost
      // evenly over seven buckets — and Silverman on that gives a broad flat
      // density, so the violin correctly drew a rectangle. Correct output from a
      // fixture that cannot express its subject, which is the same class the
      // eight-point version was: *a fixture must be shown to respond to the
      // thing under test*, applied to the count and not to the distribution.
      //
      // Three distributions with three different shapes, so the *default* frame
      // is the form rather than an accident of it.
      series: [
        // Tight and unimodal — a narrow waist and long thin tails.
        s(Array.from({ length: 60 }, (_, i) => {
          const u = (i + 0.5) / 60;
          return 30 + 4 * Math.tan((u - 0.5) * 2.4);
        })),
        // Wide and unimodal — the same centre, four times the spread.
        s(Array.from({ length: 60 }, (_, i) => {
          const u = (i + 0.5) / 60;
          return 30 + 15 * Math.tan((u - 0.5) * 2.4);
        })),
        // Skewed — a mass low down and a long tail up, which is what a violin
        // shows and a box plot's five numbers do not.
        s(Array.from({ length: 60 }, (_, i) => {
          const u = (i + 0.5) / 60;
          return 18 + 34 * u * u * u;
        })),
      ],
    },
    // The user's debug case: density must peak at 1 and at 5, not be flat.
    bimodal: {
      form: "violin", height: 12, axes: true, categories: ["bimodal", "uniform"],
      series: [
        // **Forty points, not ten, and the reason is measured.** The brief's
        // ten-point sample cannot show two modes at any rule-of-thumb
        // bandwidth — Silverman puts the normalised floor at 0.57 even with
        // the corrected constant, so the traced outline is a rectangle.
        // seaborn would do the same. Two clusters of eighteen with a thin
        // bridge is a sample that genuinely supports the shape.
        s([
          ...Array.from({ length: 18 }, (_, i) => 1 + (i % 3) * 0.15),
          ...Array.from({ length: 4 }, (_, i) => 2.6 + i * 0.3),
          ...Array.from({ length: 18 }, (_, i) => 4.7 + (i % 3) * 0.15),
        ]),
        s([1, 2, 3, 4, 5, 6, 7, 8]),
      ],
    },
    // **Eight samples again, carrying the defect `default` above records.** That
    // comment says a fixture must be shown to respond to the thing under test,
    // and this one was still `[1, 1, 2, 3, 3, 3, 4, 5]` — five distinct values
    // on a shared axis of five, which Silverman smooths into one broad mass. The
    // rung it exercises is the raincloud, whose whole subject is a *shape* over
    // a box, so the fixture could not show its own subject.
    //
    // The same three shapes `default` uses, so the two rungs are comparable:
    // the compact frame and the full frame are the same distributions with the
    // mirror dropped, which is the claim the ladder makes.
    compact: {
      form: "violin", height: 6, axes: true, categories: ["tight", "wide", "skewed"],
      series: [
        s(Array.from({ length: 60 }, (_v, i) => 30 + 4 * Math.tan((((i + 0.5) / 60) - 0.5) * 2.4))),
        s(Array.from({ length: 60 }, (_v, i) => 30 + 15 * Math.tan((((i + 0.5) / 60) - 0.5) * 2.4))),
        s(Array.from({ length: 60 }, (_v, i) => 18 + 34 * ((i + 0.5) / 60) ** 3)),
      ],
    },
    // The third rung: cloud, box and the raw samples as a jittered strip. Sixty
    // is deliberate and coprime to nothing — but the *frame* is what this
    // fixture is for, and the rung is reached by declaring three rows a band
    // rather than by naming it (C12 §3i, I34).
    // The compact rungs' braille arm, both orientations (C12 I43, §3w) — the
    // same eight sub-cells the ladder spends on magnitude, split two by four.
    "compact-braille": {
      form: "violin", height: 6, axes: true, plotStyle: "braille",
      categories: ["tight", "wide", "skewed"],
      series: [
        s(Array.from({ length: 200 }, (_v, i) => 40 + Math.sin(i * 1.7) * 5 + ((i * 7) % 11) - 5)),
        s(Array.from({ length: 200 }, (_v, i) => 45 + Math.sin(i * 1.7) * 12 + ((i * 7) % 11) - 5)),
        s(Array.from({ length: 200 }, (_v, i) => 38 + Math.sin(i * 1.7) * 8 + ((i * 7) % 11) - 5)),
      ],
    },
    "compact-braille-filled": {
      form: "violin", height: 6, axes: true, plotStyle: "braille", plotFill: "solid",
      categories: ["tight", "wide", "skewed"],
      series: [
        s(Array.from({ length: 200 }, (_v, i) => 40 + Math.sin(i * 1.7) * 5 + ((i * 7) % 11) - 5)),
        s(Array.from({ length: 200 }, (_v, i) => 45 + Math.sin(i * 1.7) * 12 + ((i * 7) % 11) - 5)),
        s(Array.from({ length: 200 }, (_v, i) => 38 + Math.sin(i * 1.7) * 8 + ((i * 7) % 11) - 5)),
      ],
    },
    // The box's run, filled or heavier (C12 I46) — against a filled cloud the
    // solid box competes for the same weight.
    "compact-line-box": {
      form: "violin", height: 6, axes: true, plotBox: "line",
      categories: ["tight", "wide", "skewed"],
      series: [
        s(Array.from({ length: 200 }, (_v, i) => 40 + Math.sin(i * 1.7) * 5 + ((i * 7) % 11) - 5)),
        s(Array.from({ length: 200 }, (_v, i) => 45 + Math.sin(i * 1.7) * 12 + ((i * 7) % 11) - 5)),
        s(Array.from({ length: 200 }, (_v, i) => 38 + Math.sin(i * 1.7) * 8 + ((i * 7) % 11) - 5)),
      ],
    },
    "compact-vertical-line-box": {
      form: "violin", height: 14, axes: true, orientation: "vertical",
      plotDetail: "compact", plotBox: "line",
      categories: ["control", "dose-a", "dose-b"],
      series: [
        s(Array.from({ length: 40 }, (_v, i) => 30 + Math.sin(i * 0.7) * 9)),
        s(Array.from({ length: 40 }, (_v, i) => 45 + Math.sin(i * 0.5) * 6)),
        s(Array.from({ length: 40 }, (_v, i) => 38 + Math.cos(i * 0.9) * 12)),
      ],
    },
    "compact-vertical-braille": {
      form: "violin", height: 14, axes: true, orientation: "vertical",
      plotDetail: "compact", plotStyle: "braille",
      categories: ["control", "dose-a", "dose-b"],
      series: [
        s(Array.from({ length: 40 }, (_v, i) => 30 + Math.sin(i * 0.7) * 9)),
        s(Array.from({ length: 40 }, (_v, i) => 45 + Math.sin(i * 0.5) * 6)),
        s(Array.from({ length: 40 }, (_v, i) => 38 + Math.cos(i * 0.9) * 12)),
      ],
    },
    "compact-vertical-braille-filled": {
      form: "violin", height: 14, axes: true, orientation: "vertical",
      plotDetail: "compact", plotStyle: "braille", plotFill: "solid",
      categories: ["control", "dose-a", "dose-b"],
      series: [
        s(Array.from({ length: 40 }, (_v, i) => 30 + Math.sin(i * 0.7) * 9)),
        s(Array.from({ length: 40 }, (_v, i) => 45 + Math.sin(i * 0.5) * 6)),
        s(Array.from({ length: 40 }, (_v, i) => 38 + Math.cos(i * 0.9) * 12)),
      ],
    },
    raindrop: {
      form: "violin", height: 9, axes: true, categories: ["tight", "wide", "skewed"],
      series: [
        s(Array.from({ length: 60 }, (_v, i) => 30 + 4 * Math.tan((((i + 0.5) / 60) - 0.5) * 2.4))),
        s(Array.from({ length: 60 }, (_v, i) => 30 + 15 * Math.tan((((i + 0.5) / 60) - 0.5) * 2.4))),
        s(Array.from({ length: 60 }, (_v, i) => 18 + 34 * ((i + 0.5) / 60) ** 3)),
      ],
    },
    // **The vertical arm, and eighteen bands is the fixture responding.** A
    // vertical raindrop is reachable at exactly four columns a band — three is
    // the raincloud and five is the mirrored violin, which scales from there —
    // so three categories at 80 cells gives each of them twenty-five and lands
    // on the top rung. The first draft of this fixture did, and drew a violin
    // under the name `raindrop`. Eighteen bands of seventy-five is four.
    "raindrop-vertical": {
      form: "violin", height: 14, axes: true, orientation: "vertical",
      categories: Array.from({ length: 18 }, (_v, h) => String(h + 6).padStart(2, "0")),
      series: Array.from({ length: 18 }, (_v, h) =>
        s(Array.from({ length: 30 }, (_w, i) =>
          40 + Math.sin(h * 0.6) * 14 + Math.sin(i * 0.9 + h) * (5 + Math.abs(Math.cos(h)) * 7)))),
    },
    // The vertical arm of the raincloud — the cloud as a run of dot-columns
    // rather than a ladder step, three columns a band (C12 §3i, I21).
    "compact-vertical": {
      form: "violin", height: 14, axes: true, orientation: "vertical", plotDetail: "compact",
      categories: ["control", "dose-a", "dose-b"],
      series: [
        s(Array.from({ length: 40 }, (_v, i) => 30 + Math.sin(i * 0.7) * 9)),
        s(Array.from({ length: 40 }, (_v, i) => 45 + Math.sin(i * 0.5) * 6)),
        s(Array.from({ length: 40 }, (_v, i) => 38 + Math.cos(i * 0.9) * 12)),
      ],
    },
  },
  ridgeline: {
    // **Eight samples could not show the form**, the violin's problem a second
    // time: Silverman on eight points gives a near-flat density, so three curves
    // drew as three low mounds and the shift between them — what a joyplot is
    // read for — had nothing to be visible against.
    default: {
      form: "ridgeline", height: 14, axes: true,
      series: [
        s(Array.from({ length: 60 }, (_, i) => 8 + Math.sin(i * 0.7) * 3 + prng(11)() * 2), "jan"),
        s(Array.from({ length: 60 }, (_, i) => 13 + Math.sin(i * 0.5) * 3.5 + prng(12)() * 2), "apr"),
        s(Array.from({ length: 60 }, (_, i) => 21 + Math.cos(i * 0.6) * 4 + prng(13)() * 2), "jul"),
        s(Array.from({ length: 60 }, (_, i) => 15 + Math.sin(i * 0.9) * 3 + prng(14)() * 2), "oct"),
      ],
    },
  },
  smallmultiples: {
    default: {
      form: "smallmultiples", height: 10, axes: true, series: [],
      facets: [
        { kind: "plot", id: "f1", form: "line", height: 4, axes: true, series: [s(sin(30, 0.2), "cpu")] },
        { kind: "plot", id: "f2", form: "line", height: 4, axes: true, series: [s(sin(30, 0.3), "mem")] },
        { kind: "plot", id: "f3", form: "line", height: 4, axes: true, series: [s(sin(30, 0.4), "net")] },
        { kind: "plot", id: "f4", form: "line", height: 4, axes: true, series: [s(sin(30, 0.5), "disk")] },
      ],
    },
  },
  pairplot: {
    default: {
      form: "pairplot", height: 10, axes: true, series: [],
      facets: [
        { kind: "plot", id: "p1", form: "scatter", height: 4, axes: true, series: [s(sin(30, 0.2))] },
        { kind: "plot", id: "p2", form: "scatter", height: 4, axes: true, series: [s(sin(30, 0.35))] },
        { kind: "plot", id: "p3", form: "scatter", height: 4, axes: true, series: [s(sin(30, 0.5))] },
        { kind: "plot", id: "p4", form: "scatter", height: 4, axes: true, series: [s(sin(30, 0.65))] },
      ],
    },
  },
  pie: {
    solid: {
      form: "pie", height: 18, series: [], plotStyle: "solid",
      segments: [
        { label: "Chrome", value: 65 }, { label: "Firefox", value: 15 },
        { label: "Safari", value: 12 }, { label: "Other", value: 8 },
      ],
    },
    // Same argument as the radar's — `narrow-20` below keeps the small case.
    "default-40": { form: "pie", height: 18, series: [], segments: [...PIE_SEGMENTS] },
    "narrow-20": { form: "pie", height: 5, series: [], segments: [...PIE_SEGMENTS] },
    "many-segments": {
      form: "pie", height: 10, series: [],
      segments: [
        { label: "A", value: 50 }, { label: "B", value: 20 }, { label: "C", value: 10 },
        { label: "D", value: 5 }, { label: "E", value: 5 }, { label: "F", value: 3 },
        { label: "G", value: 3 }, { label: "H", value: 2 }, { label: "I", value: 1 },
        { label: "J", value: 1 },
      ],
    },
    // **The merge, which nothing in this repository had ever made fire** (F305).
    // A slice below one dot of arc folds into `other`, and the threshold is
    // `1 / 2πr` with `r` in **dots** — so it is a resolution rule and it needs a
    // radius small enough to have one. `many-segments` above is ten slices at
    // height 10, where the threshold is 0.82% against a smallest slice of 1%:
    // correct, terminal-only and **unreachable**, and a green corpus agreed with
    // it by never asking.
    //
    // **Six segments and not ten, which the first frame settled.** The ten-slice
    // list does merge at height 8 — and its legend elides the result behind
    // `⋯ 2 more`, so the frame that exists to show a merge hides it. Measured on
    // this list, the boundary is exactly 8 against 9: at 9 `E` and `F` are two
    // rows of 1%, at 8 they are one row reading **`other  2%`**.
    "merged": {
      form: "pie", height: 8, series: [],
      segments: [
        { label: "A", value: 50 }, { label: "B", value: 25 }, { label: "C", value: 15 },
        { label: "D", value: 8 }, { label: "E", value: 1 }, { label: "F", value: 1 },
      ],
    },
  },
  radar: {
    // The line arm, in quadrant blocks (C12 I43, §3w) — connected where box
    // drawing's diagonals are not.
    line: {
      form: "radar", height: 17, plotStyle: "line",
      categories: ["Speed", "Power", "Range", "Defence", "HP"],
      series: [
        { ...s([8, 6, 7, 5, 9]), label: "alpha" },
        { ...s([5, 9, 4, 8, 6]), label: "beta" },
      ],
    },
    // **Height is what sizes a circle**, because `rx = 2 · ry` is the cell
    // aspect and nothing can widen a disc past what its rows allow. At 10 the
    // figure was 20 columns in an 80-cell frame and two braille polygons
    // sharing that raster read as a dot cloud — the fixture, not the renderer.
    default: {
      form: "radar", height: 18, categories: ["Speed", "Power", "Range", "Defence", "HP"],
      series: [s([80, 60, 90, 40, 70], "alpha"), s([50, 85, 45, 75, 55], "beta")],
    },
    // **Three axes is where the grid's shape stops being cosmetic** (C12 I45).
    // A circular ring behind a triangle is two figures in one frame; the
    // polygon is a ruler the shape can be read against along its length.
    triangle: {
      form: "radar", height: 16, categories: ["Speed", "Power", "Range"],
      series: [s([80, 60, 90], "alpha"), s([50, 85, 45], "beta")],
    },
    "triangle-circle": {
      form: "radar", height: 16, plotGrid: "circle",
      categories: ["Speed", "Power", "Range"],
      series: [s([80, 60, 90], "alpha"), s([50, 85, 45], "beta")],
    },
  },
  horizon: {
    "bands-2": { form: "horizon", height: 2, series: [s(sin50)], bands: 2 },
    "bands-3": { form: "horizon", height: 3, series: [s(sin50)], bands: 3 },
    "bands-5": { form: "horizon", height: 5, series: [s(sin50)], bands: 5 },
    // height < bands — the default interaction nothing exercised.
    "folded-1x3": { form: "horizon", height: 1, series: [s(sin50)], bands: 3 },
    // **A fixture that can respond to the mirror** (C12 I52, §3z). Every other
    // horizon fixture is `sin50`, which never goes below its own baseline — and
    // a series that never crosses zero renders *identically* whether the fold
    // mirrors or folds about the minimum. So the catalogue could not have shown
    // the defect and cannot show the fix; this one crosses.
    signed: {
      form: "horizon", height: 3, bands: 3,
      series: [s(sin50.map((v) => v - 50))],
    },
  },
});

/** Every form name, in declaration order. */
export const CATALOGUE_FORM_NAMES: readonly PlotForm[] =
  Object.freeze(Object.keys(CATALOGUE_FORMS) as PlotForm[]);
