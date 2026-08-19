/**
 * ONE_PER_FORM — a representative Plot for every PlotForm member.
 *
 * A `Record<PlotForm, Plot>`, so adding a member to the union forces an entry
 * here or the file does not compile. The same pattern as ONE_PER_KIND.
 */
import { block, type Plot, type PlotForm } from "../../src/data/viewmodel/index.js";

const s = (vs: number[]): { values: readonly (number | null)[] } => ({ values: vs });

export const ONE_PER_FORM: Readonly<Record<PlotForm, Plot>> = Object.freeze({
  line: block({
    kind: "plot", id: "form-line", form: "line", height: 5, axes: true,
    series: [s([1, 3, 2, 5, 4])],
  }),
  sparkline: block({
    kind: "plot", id: "form-sparkline", form: "sparkline",
    series: [s([1, 3, 2, 5, 4])],
  }),
  heatmap: block({
    kind: "plot", id: "form-heatmap", form: "heatmap", height: 3, axes: true,
    series: [
      { values: [1, 2, 3, 4], label: "a" },
      { values: [4, 3, 2, 1], label: "b" },
      { values: [2, 2, 3, 3], label: "c" },
    ],
  }),
  scatter: block({
    kind: "plot", id: "form-scatter", form: "scatter", height: 5, axes: true,
    series: [s([1, 3, 2, 5, 4])],
  }),
  step: block({
    kind: "plot", id: "form-step", form: "step", height: 5, axes: true,
    series: [s([1, 3, 2, 5, 4])],
  }),
  ecdf: block({
    kind: "plot", id: "form-ecdf", form: "ecdf", height: 5, axes: true,
    series: [s([3, 1, 4, 1, 5, 9, 2, 6])],
  }),
  bar: block({
    kind: "plot", id: "form-bar", form: "bar", height: 4, axes: true,
    series: [s([10, 25, 15, 30])],
    categories: ["alpha", "beta", "gamma", "delta"],
  }),
  histogram: block({
    kind: "plot", id: "form-histogram", form: "histogram", height: 5, axes: true,
    series: [s([1, 1, 2, 2, 2, 3, 3, 4, 5, 5, 5, 5])],
  }),
  boxplot: block({
    // **Nine rows for three categories, because a box plot is three rows each.**
    // At height 3 the form degrades to its compact spine (C12 I28) and the
    // golden corpus would be recording the fallback as though it were the
    // figure — which is how a corpus stops being evidence about the thing it
    // names.
    kind: "plot", id: "form-boxplot", form: "boxplot", height: 9, axes: true,
    categories: ["A", "B", "C"],
    series: [],
    quartiles: [
      { min: 1, q1: 3, median: 5, q3: 7, max: 9 },
      { min: 2, q1: 4, median: 6, q3: 8, max: 10 },
      { min: 0, q1: 2, median: 4, q3: 6, max: 8, outliers: [11] },
    ],
  }),
  forest: block({
    kind: "plot", id: "form-forest", form: "forest", height: 3, axes: true,
    categories: ["Study 1", "Study 2", "Study 3"],
    series: [],
    quartiles: [
      { min: 1, q1: 3, median: 5, q3: 7, max: 9, centre: 5, lower: 3, upper: 7 },
      { min: 2, q1: 4, median: 6, q3: 8, max: 10, centre: 6, lower: 4, upper: 8 },
      { min: 0, q1: 2, median: 4, q3: 6, max: 8, centre: 4, lower: 2, upper: 6 },
    ],
  }),
  dumbbell: block({
    kind: "plot", id: "form-dumbbell", form: "dumbbell", height: 3, axes: true,
    categories: ["X", "Y", "Z"],
    series: [s([10, 20, 15]), s([30, 25, 35])],
  }),
  lollipop: block({
    kind: "plot", id: "form-lollipop", form: "lollipop", height: 4, axes: true,
    categories: ["a", "b", "c", "d"],
    series: [s([10, 25, 15, 30])],
  }),
  dotplot: block({
    kind: "plot", id: "form-dotplot", form: "dotplot", height: 4, axes: true,
    categories: ["a", "b", "c", "d"],
    series: [s([10, 25, 15, 30])],
  }),
  waffle: block({
    kind: "plot", id: "form-waffle", form: "waffle",
    series: [],
    segments: [
      { label: "Yes", value: 65 },
      { label: "No", value: 25 },
      { label: "Maybe", value: 10 },
    ],
  }),
  flame: block({
    kind: "plot", id: "form-flame", form: "flame", height: 4, axes: true,
    categories: ["main", "parse", "render", "paint"],
    series: [s([100, 60, 40, 20])],
  }),
  icicle: block({
    kind: "plot", id: "form-icicle", form: "icicle", height: 4, axes: true,
    categories: ["main", "parse", "render", "paint"],
    series: [s([100, 60, 40, 20])],
  }),
  funnel: block({
    kind: "plot", id: "form-funnel", form: "funnel", height: 4, axes: true,
    categories: ["Visit", "Sign up", "Trial", "Pay"],
    series: [s([1000, 400, 200, 80])],
  }),
  gantt: block({
    kind: "plot", id: "form-gantt", form: "gantt", height: 3, axes: true,
    categories: ["Build", "Test", "Deploy"],
    series: [s([5, 3, 2])],
    offsets: [0, 5, 8],
  }),
  waterfall: block({
    kind: "plot", id: "form-waterfall", form: "waterfall", height: 5, axes: true,
    categories: ["Revenue", "COGS", "Opex", "Tax", "Net"],
    series: [s([100, -40, -25, -10, 25])],
    totals: [false, false, false, false, true],
  }),
  streamgraph: block({
    kind: "plot", id: "form-streamgraph", form: "streamgraph", height: 5, axes: true,
    series: [s([1, 3, 2, 5, 4]), s([2, 1, 4, 3, 5])],
  }),
  stackedarea: block({
    kind: "plot", id: "form-stackedarea", form: "stackedarea", height: 5, axes: true,
    series: [s([1, 3, 2, 5, 4]), s([2, 1, 4, 3, 5])],
  }),
  calendar: block({
    kind: "plot", id: "form-calendar", form: "calendar", height: 4, axes: true,
    series: [
      { values: [1, 0, 3, 2, 5, 1, 0], label: "wk1" },
      { values: [2, 1, 4, 0, 3, 2, 1], label: "wk2" },
      { values: [0, 2, 1, 3, 2, 4, 0], label: "wk3" },
      { values: [1, 1, 2, 2, 3, 3, 1], label: "wk4" },
    ],
  }),
  correlation: block({
    kind: "plot", id: "form-correlation", form: "correlation", height: 3, axes: true,
    series: [
      { values: [1, 0.8, 0.3], label: "A" },
      { values: [0.8, 1, 0.5], label: "B" },
      { values: [0.3, 0.5, 1], label: "C" },
    ],
  }),
  confusion: block({
    kind: "plot", id: "form-confusion", form: "confusion", height: 3, axes: true,
    series: [
      { values: [90, 5, 5], label: "cat" },
      { values: [10, 80, 10], label: "dog" },
      { values: [5, 15, 80], label: "bird" },
    ],
  }),
  spectrogram: block({
    kind: "plot", id: "form-spectrogram", form: "spectrogram", height: 4, axes: true,
    series: [
      { values: [1, 2, 3, 4, 5, 6, 7, 8], label: "100Hz" },
      { values: [8, 7, 6, 5, 4, 3, 2, 1], label: "200Hz" },
      { values: [2, 4, 6, 8, 6, 4, 2, 0], label: "400Hz" },
      { values: [5, 5, 5, 5, 5, 5, 5, 5], label: "800Hz" },
    ],
  }),
  latency: block({
    kind: "plot", id: "form-latency", form: "latency", height: 4, axes: true,
    series: [
      { values: [10, 20, 15, 25, 30, 20, 15, 10], label: "p50" },
      { values: [20, 40, 30, 50, 60, 40, 30, 20], label: "p90" },
      { values: [50, 80, 60, 100, 120, 80, 60, 50], label: "p99" },
      { values: [100, 150, 120, 200, 250, 150, 120, 100], label: "max" },
    ],
  }),
  density2d: block({
    kind: "plot", id: "form-density2d", form: "density2d", height: 3, axes: true,
    series: [
      { values: [1, 3, 5, 3, 1], label: "row1" },
      { values: [2, 4, 6, 4, 2], label: "row2" },
      { values: [1, 2, 3, 2, 1], label: "row3" },
    ],
  }),
  density: block({
    kind: "plot", id: "form-density", form: "density", height: 5, axes: true,
    series: [s([1, 1, 2, 2, 2, 3, 3, 4, 5, 5, 5, 5, 6, 7, 8])],
  }),
  violin: block({
    kind: "plot", id: "form-violin", form: "violin", height: 12, axes: true,
    categories: ["A", "B", "C"],
    series: [
      s([1, 1, 2, 3, 3, 3, 4, 5]),
      s([2, 3, 3, 4, 4, 4, 5, 6]),
      s([1, 2, 2, 2, 3, 4, 5, 5]),
    ],
  }),
  ridgeline: block({
    kind: "plot", id: "form-ridgeline", form: "ridgeline", height: 3, axes: true,
    series: [
      { values: [1, 1, 2, 3, 3, 3, 4, 5], label: "set1" },
      { values: [2, 3, 3, 4, 4, 4, 5, 6], label: "set2" },
      { values: [1, 2, 2, 2, 3, 4, 5, 5], label: "set3" },
    ],
  }),
  smallmultiples: block({
    kind: "plot", id: "form-smallmultiples", form: "smallmultiples", height: 5, axes: true,
    series: [s([1, 2, 3])],
    facets: [
      { kind: "plot", id: "sm-a", form: "line", height: 5, axes: true, series: [s([1, 3, 2])] } as Plot,
      { kind: "plot", id: "sm-b", form: "line", height: 5, axes: true, series: [s([3, 1, 4])] } as Plot,
    ],
  }),
  pairplot: block({
    kind: "plot", id: "form-pairplot", form: "pairplot", height: 5, axes: true,
    series: [s([1, 2, 3])],
    facets: [
      { kind: "plot", id: "pp-a", form: "scatter", height: 5, axes: true, series: [s([1, 3, 2])] } as Plot,
      { kind: "plot", id: "pp-b", form: "scatter", height: 5, axes: true, series: [s([3, 1, 4])] } as Plot,
    ],
  }),
  pie: block({
    kind: "plot", id: "form-pie", form: "pie", height: 8,
    series: [],
    segments: [
      { label: "Chrome", value: 65 },
      { label: "Firefox", value: 15 },
      { label: "Safari", value: 12 },
      { label: "Other", value: 8 },
    ],
  }),
  radar: block({
    kind: "plot", id: "form-radar", form: "radar", height: 8,
    categories: ["Speed", "Power", "Range", "Defence", "HP"],
    series: [s([80, 60, 90, 40, 70])],
  }),
  horizon: block({
    kind: "plot", id: "form-horizon", form: "horizon", height: 3,
    series: [s([1, 3, 5, 8, 12, 15, 10, 6, 3, 1])],
    bands: 3,
  }),
});

export const ALL_FORMS = Object.keys(ONE_PER_FORM) as readonly PlotForm[];
