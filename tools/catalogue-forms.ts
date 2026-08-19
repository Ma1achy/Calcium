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
import type { Plot, PlotForm, Series } from "../src/data/viewmodel/index.js";

/** A plot with its identity removed — the catalogue supplies `kind` and `id`. */
export type PlotSpec = Omit<Plot, "kind" | "id">;

/** Variants for one form, keyed by variant name. */
export type FormVariants = Readonly<Record<string, PlotSpec>>;

const s = (values: readonly number[], label?: string): Series =>
  label === undefined ? { values } : { values, label };

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

const PIE_SEGMENTS = [
  { label: "Chrome", value: 65 },
  { label: "Firefox", value: 15 },
  { label: "Safari", value: 12 },
  { label: "Other", value: 8 },
] as const;

export const CATALOGUE_FORMS: Readonly<Record<PlotForm, FormVariants>> = Object.freeze({
  line: {
    default: { form: "line", height: 8, axes: true, series: [s(sin50)] },
    minimal: { form: "line", height: 3, axes: false, series: [s([1, 3, 2, 5, 4])] },
    dense: { form: "line", height: 8, axes: true, series: [s(sin500)] },
    empty: { form: "line", height: 5, axes: true, series: [{ values: [] }] },
    annotated: {
      form: "line", height: 8, axes: true, series: [s(sin50)],
      annotations: [{ kind: "line", value: 50 }, { kind: "band", from: 30, to: 70 }],
    },
    "multi-series": {
      form: "line", height: 8, axes: true,
      series: [s(sin50, "alpha"), s(sin50.map((v) => 100 - v), "beta"), s(sin(50, 0.2), "gamma")],
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
    default: {
      form: "calendar", height: 7, axes: true,
      series: Array.from({ length: 7 }, (_, d) =>
        s(Array.from({ length: 53 }, (_, w) => Math.abs(Math.sin((d * 53 + w) * 0.7)) * 12), ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d]),
      ),
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
      form: "violin", height: 18, axes: true, categories: ["A", "B", "C"],
      // **Thirty samples, not eight, and the fixture was the third cause.**
      // Eight points cannot show a violin at any bandwidth or in any rendering
      // mode — seaborn draws something near-flat from them too — so the old
      // fixture could not verify a taper, a `bw_adjust`, or a compact form
      // even once those exist. A fixture must be able to respond to the thing
      // under test before it is asserted against.
      series: [
        s(Array.from({ length: 30 }, (_, i) => 3 + Math.sin(i * 0.7) * 1.4)),
        s(Array.from({ length: 30 }, (_, i) => 4 + Math.sin(i * 0.5) * 1.1)),
        s(Array.from({ length: 30 }, (_, i) => 3 + Math.cos(i * 0.9) * 1.6)),
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
    compact: {
      form: "violin", height: 6, axes: true, categories: ["A", "B", "C"],
      series: [
        s([1, 1, 2, 3, 3, 3, 4, 5]), s([2, 3, 3, 4, 4, 4, 5, 6]), s([1, 2, 2, 2, 3, 4, 5, 5]),
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
    "default-40": { form: "pie", height: 10, series: [], segments: [...PIE_SEGMENTS] },
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
  },
  radar: {
    default: {
      form: "radar", height: 10, categories: ["Speed", "Power", "Range", "Defence", "HP"],
      series: [s([80, 60, 90, 40, 70], "alpha"), s([50, 85, 45, 75, 55], "beta")],
    },
  },
  horizon: {
    "bands-2": { form: "horizon", height: 2, series: [s(sin50)], bands: 2 },
    "bands-3": { form: "horizon", height: 3, series: [s(sin50)], bands: 3 },
    "bands-5": { form: "horizon", height: 5, series: [s(sin50)], bands: 5 },
    // height < bands — the default interaction nothing exercised.
    "folded-1x3": { form: "horizon", height: 1, series: [s(sin50)], bands: 3 },
  },
});

/** Every form name, in declaration order. */
export const CATALOGUE_FORM_NAMES: readonly PlotForm[] =
  Object.freeze(Object.keys(CATALOGUE_FORMS) as PlotForm[]);
