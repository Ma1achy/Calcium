/**
 * Every form `PlotForm` declares, built through `b.plot`.
 *
 * **The four that cannot be built are entries here, not omissions** (F377). A
 * catalogue that silently skips what it cannot construct reports 42 of 42 and
 * reads as complete — the shape F313 caught in the contact sheet and F350 in
 * the corpus. So `gantt`, `waterfall`, `pairplot` and `smallmultiples` are
 * `refused`, each naming the field the published builder does not declare, and
 * the count a reader sees is **46**.
 *
 * Measured rather than assumed: 39 forms build in full, 3 build reduced —
 * `bar` without `layout`, `histogram` without `layout`/`binning`, `line`
 * without `xScale`/`emptyMessage` — and 4 not at all.
 */
import { b } from "@fmx/calcium";
import type { Block, Plot, Series } from "@fmx/calcium";
import { CORES, STAGES, WIDTHS, budget, field, magnitudes, summaries, wave } from "./data.ts";

export type PlotForm = Plot["form"];

/** A form the published builder cannot construct, and the reason (F335, F377). */
export type Refusal = Readonly<{ refused: string; needs: string }>;

export type Entry = Readonly<{
  /** One line on what the form is for — the gallery's caption. */
  says: string;
  /** The block, or the reason there is none. */
  at: (phase: number, height: number) => Block | Refusal;
}>;

const s = (values: readonly number[], label?: string, tone?: Series["tone"]): Series => ({
  values: [...values],
  ...(label !== undefined ? { label } : {}),
  ...(tone !== undefined ? { tone } : {}),
});

const rows = (n: number, phase: number, cols = 16): Series[] =>
  field(n, cols, phase).map((v, i) => s(v, CORES[i] ?? `row ${String(i + 1)}`));

/**
 * Every form's own extras, on top of `form`, `height` and an id.
 *
 * **The parameter is `b.plot`'s own type and there is no cast**, which is the
 * whole load this helper carries. Its first form took `Record<string, unknown>`
 * and cast — and `layout: "stacked"` then typechecked, because a cast makes
 * every field passable. That would have made this example's central claim false
 * while every gate stayed green: the refusals in the table below would be
 * choices rather than facts, and F377's four would build.
 *
 * Caught by fabricating the violation on the helper — adding the field the
 * catalogue says cannot be added, and watching `tsc` accept it.
 */
type PlotSpec = Parameters<typeof b.plot>[0];

const plot = (form: PlotForm, height: number, rest: Omit<PlotSpec, "form" | "height" | "id">): Block =>
  b.plot({ id: `f-${form}`, form, height, ...rest });

const refuse = (needs: string, what: string): Refusal => ({
  refused: `\`${needs}\` is not declared on \`b.plot\` — ${what}`,
  needs,
});

export const CATALOGUE: Readonly<Record<PlotForm, Entry>> = Object.freeze({
  // --- curves: a reading at a position -------------------------------------
  line: { says: "a value over an index", at: (p, h) => plot("line", h, {
    axes: true, series: [s(wave(24, p, 1, 8, 20), "p50", "ok"), s(wave(24, p, 2, 14, 42), "p99", "warn")] }) },
  step: { says: "a value that changes at instants", at: (p, h) => plot("step", h, {
    axes: true, series: [s(wave(18, p, 3, 6, 14), "depth")] }) },
  scatter: { says: "two readings per point", at: (p, h) => plot("scatter", h, {
    axes: true, series: [s(wave(40, p, 4, 10, 20), "samples")] }) },
  sparkline: { says: "a shape, no furniture", at: (p, h) => plot("sparkline", Math.min(h, 1), {
    series: [s(wave(40, p, 5, 6, 10))] }) },
  ecdf: { says: "the empirical distribution", at: (p, h) => plot("ecdf", h, {
    axes: true, series: [s(wave(40, p, 6, 9, 18), "latency")] }) },
  density: { says: "a smoothed distribution", at: (p, h) => plot("density", h, {
    axes: true, series: [s(wave(48, p, 7, 9, 20), "latency")] }) },
  autocorrelation: { says: "correlation against lag", at: (p, h) => plot("autocorrelation", h, {
    axes: true, categories: ["1", "2", "3", "4", "5", "6", "7", "8"],
    series: [s(wave(8, p, 8, 0.5, 0.1), "acf")] }) },
  slope: { says: "before against after", at: (p, h) => plot("slope", h, {
    axes: true, series: [s([12 + p % 5, 21], "north"), s([19, 9 + p % 4], "south"), s([7, 15], "east")] }) },
  bubble: { says: "a third reading as area", at: (p, h) => plot("bubble", h, {
    axes: true, series: [s(wave(14, p, 9, 8, 16), "load"), s(magnitudes(14, p, 10, 2), "size")] }) },
  stackedarea: { says: "parts of a whole over time", at: (p, h) => plot("stackedarea", h, {
    axes: true, series: STAGES.map((n, i) => s(magnitudes(20, p, 11 + i, 6), n)) }) },
  streamgraph: { says: "the same fold, centred", at: (p, h) => plot("streamgraph", h, {
    axes: true, series: STAGES.map((n, i) => s(magnitudes(20, p, 21 + i, 6), n)) }) },
  horizon: { says: "a band-folded curve", at: (p, h) => plot("horizon", h, {
    bands: 3, series: [s(wave(60, p, 12, 10, 0), "drift")] }) },

  // --- categorical: a reading per named thing ------------------------------
  bar: { says: "a quantity per category", at: (p, h) => plot("bar", h, {
    axes: true, orientation: "vertical", categories: [...WIDTHS],
    series: [s(magnitudes(4, p, 13, 6), "layout"), s(magnitudes(4, p, 14, 9), "paint")] }) },
  histogram: { says: "counts per bin", at: (p, h) => plot("histogram", h, {
    axes: true, series: [s(wave(120, p, 15, 10, 20), "samples")] }) },
  lollipop: { says: "a bar reduced to its end", at: (p, h) => plot("lollipop", h, {
    axes: true, categories: [...STAGES], series: [s(magnitudes(4, p, 16, 8))] }) },
  dotplot: { says: "the same, as a point", at: (p, h) => plot("dotplot", h, {
    axes: true, categories: [...STAGES], series: [s(magnitudes(4, p, 17, 8))] }) },
  dumbbell: { says: "two readings, one row", at: (p, h) => plot("dumbbell", h, {
    axes: true, categories: [...STAGES],
    series: [s(magnitudes(4, p, 18, 5), "before"), s(magnitudes(4, p, 19, 9), "after")] }) },
  funnel: { says: "a decreasing sequence", at: (p, h) => plot("funnel", h, {
    axes: true, categories: ["visited", "signed up", "activated", "retained"],
    series: [s([100, 74 - (p % 6), 48, 31], "users")] }) },
  waffle: { says: "a whole, as counted squares", at: (p, h) => plot("waffle", h, {
    segments: STAGES.map((n, i) => ({ label: n, value: Math.round(magnitudes(1, p, 30 + i, 30)[0] ?? 10) })),
    series: [] }) },
  pie: { says: "a whole, as angle", at: (p, h) => plot("pie", h, {
    segments: STAGES.map((n, i) => ({ label: n, value: Math.round(magnitudes(1, p, 40 + i, 30)[0] ?? 10) })),
    series: [] }) },
  radar: { says: "several axes at once", at: (p, h) => plot("radar", h, {
    categories: ["cpu", "mem", "io", "net", "gpu"],
    series: [s(magnitudes(5, p, 22, 6), "now"), s(magnitudes(5, p, 23, 6), "baseline")] }) },
  timeline: { says: "events on a shared axis", at: (p, h) => plot("timeline", h, {
    axes: true, categories: ["build", "test", "deploy"],
    series: [s([1 + (p % 3), 4, 9], "start"), s([3, 8, 11], "mid"), s([4, 9, 13], "end")] }) },
  bullet: { says: "a reading against a target", at: (p, h) => plot("bullet", h, {
    categories: ["p50", "p99", "error %"], quartiles: summaries(3, p, 24),
    series: [s(magnitudes(3, p, 25, 6), "now")] }) },

  // --- distributions -------------------------------------------------------
  boxplot: { says: "five numbers per category", at: (p, h) => plot("boxplot", h, {
    axes: true, categories: [...STAGES], quartiles: summaries(4, p, 26), series: [] }) },
  violin: { says: "the density, mirrored", at: (p, h) => plot("violin", h, {
    axes: true, categories: [...STAGES].slice(0, 3),
    series: [0, 1, 2].map((i) => s(wave(60, p, 27 + i, 6, 14), STAGES[i])) }) },
  ridgeline: { says: "distributions, stacked", at: (p, h) => plot("ridgeline", h, {
    axes: true, series: [0, 1, 2, 3].map((i) => s(wave(60, p, 31 + i, 5, 12), STAGES[i])) }) },
  forest: { says: "estimates and their intervals", at: (p, h) => plot("forest", h, {
    axes: true, categories: [...STAGES], quartiles: summaries(4, p, 35), series: [] }) },

  // --- matrices: a field over two axes -------------------------------------
  heatmap: { says: "a value per cell", at: (p, h) => plot("heatmap", h, {
    yMin: 0, yMax: 1, yFormat: "fraction", colormap: "viridis",
    xLabels: ["-16 frames", "", "now"], series: rows(6, p) }) },
  // **One flat series in time order, not a grid of rows** — the builder refused
  // seven of them with the reason: *a calendar's rows are a period, so series is
  // a second period claiming the same rows* (C04 I62, C12 I53).
  calendar: { says: "a value per day", at: (p, h) => plot("calendar", h, {
    yMin: 0, yMax: 1, yFormat: "fraction", calendarUnit: "day", startDate: "2026-03-02",
    series: [s((field(1, 84, p, 7)[0] ?? []), "commits")] }) },
  correlation: { says: "every pair, compared", at: (p, h) => plot("correlation", h, {
    yMin: -1, yMax: 1, colormap: "coolwarm", categories: ["cpu", "mem", "io", "net"],
    series: field(4, 4, p, 9).map((v, i) => s(v.map((x) => x * 2 - 1), ["cpu", "mem", "io", "net"][i])) }) },
  confusion: { says: "predicted against actual", at: (p, h) => plot("confusion", h, {
    yMin: 0, categories: ["ok", "warn", "error"],
    series: field(3, 3, p, 11).map((v, i) => s(v.map((x) => Math.round(x * 40)), ["ok", "warn", "error"][i])) }) },
  spectrogram: { says: "frequency over time", at: (p, h) => plot("spectrogram", h, {
    yMin: 0, yMax: 1, colormap: "inferno", series: rows(8, p, 24) }) },
  latency: { says: "a latency distribution over time", at: (p, h) => plot("latency", h, {
    yMin: 0, yMax: 1, colormap: "magma", series: rows(4, p, 20) }) },
  density2d: { says: "point density as a field", at: (p, h) => plot("density2d", h, {
    yMin: 0, yMax: 1, colormap: "viridis", series: rows(8, p, 20) }) },
  utilisation: { says: "load per resource", at: (p, h) => plot("utilisation", h, {
    yMin: 0, yMax: 1, yFormat: "fraction", series: rows(4, p, 24) }) },
  contour: { says: "the field, as level lines", at: (p, h) => plot("contour", h, {
    levels: [0.25, 0.4, 0.55, 0.7, 0.85], series: rows(8, p, 24) }) },
  quiver: { says: "a vector per cell", at: (p, h) => plot("quiver", h, {
    // A vector series is `[u, v]` pairs, not two arrays — which the compiler
    // said the moment the cast came off, and would have said nothing about
    // before it.
    vectors: Array.from({ length: 6 }, (_, r) => ({
      values: (field(1, 12, p + r, 13)[0] ?? []).map(
        (u, c): readonly [number, number] => [u - 0.5, (field(1, 12, p + r, 17)[0]?.[c] ?? 0.5) - 0.5],
      ),
    })), series: [] }) },

  // --- shapes: a hierarchy or a graph --------------------------------------
  treemap: { says: "area by value, nested", at: (p, h) => plot("treemap", h, { hierarchy: budget(p), series: [] }) },
  flame: { says: "a stack, widest at the root", at: (p, h) => plot("flame", h, { hierarchy: budget(p), series: [] }) },
  icicle: { says: "the same, growing down", at: (p, h) => plot("icicle", h, { hierarchy: budget(p), series: [] }) },
  tree: { says: "the shape, as nodes and edges", at: (p, h) => plot("tree", h, { hierarchy: budget(p), series: [] }) },
  graph: { says: "nodes and the edges between", at: (p, h) => plot("graph", h, {
    graph: {
      nodes: [{ id: "parse" }, { id: "measure" }, { id: "layout" }, { id: "paint" }, { id: "compose" }],
      edges: [
        { from: "parse", to: "measure" }, { from: "measure", to: "layout" },
        { from: "layout", to: "paint" }, { from: "paint", to: "compose" },
        ...(p % 2 === 0 ? [{ from: "layout", to: "compose" }] : []),
      ],
    }, series: [] }) },

  // --- the four the published builder cannot construct (F377) --------------
  gantt: { says: "bars with a start per row", at: () =>
    refuse("offsets", "without a start per row a gantt is a bar chart") },
  waterfall: { says: "a running balance", at: () =>
    refuse("totals", "without knowing which bars are totals the running balance cannot be drawn") },
  pairplot: { says: "every variable against every other", at: () =>
    refuse("facets", "a delegating form with no children has nothing to delegate") },
  smallmultiples: { says: "the same figure, repeated", at: () =>
    refuse("facets", "a delegating form with no children has nothing to delegate") },
});

/** Every form, in the catalogue's order. */
export const FORMS = Object.keys(CATALOGUE) as readonly PlotForm[];

/** The four that refuse, measured from the table rather than restated (F377). */
export function refusals(): readonly PlotForm[] {
  return FORMS.filter((f) => "refused" in CATALOGUE[f].at(0, 8));
}
