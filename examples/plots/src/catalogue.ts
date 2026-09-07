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
import { mesh } from "./meshes.ts";

export type PlotForm = Plot["form"];

/** A form the published builder cannot construct, and the reason (F335, F377). */
export type Refusal = Readonly<{ refused: string; needs: string }>;

/**
 * A named presentation of a form — **a rung, not a second form** (F396).
 *
 * The corpus carries **188 variants over 46 forms**: violin has 19, line 47,
 * boxplot 6. `/all` drew one figure per form and called itself complete, which
 * is 42 of 188 — the reader who counted was right, and the caption *Every form
 * the type declares* was true about forms and read as a claim about plots.
 *
 * **Every variant here goes through `b.plot` like everything else.** The
 * override is `Omit<PlotSpec, "form" | "height" | "id">`, so a rung that needs
 * an undeclared member does not typecheck — which is what keeps the count
 * honest rather than decorative. The rungs a form actually has are `plotStyle`,
 * `plotFill`, `plotBox`, `plotCorners`, `orientation`, `bandwidth`,
 * `plotDetail`, `height` and the frame fields, and `b.plot` declares all of
 * them.
 */
export type Variant = Readonly<{
  /** What this rung shows that the default does not. */
  says: string;
  /** The override, applied on top of the form's own spec. */
  spec: PlotOverride;
  /** Where the rung is chosen by room rather than by a field. */
  height?: number;
  /**
   * The live tick, in ms, where the default one is faster than the rung can
   * draw. **A figure that misses its own tick stutters**, and the honest remedy
   * is a tick it can keep rather than a caption apologising for one it cannot:
   * measured at this width, one bunny frame is 365 ms median against `b.live`'s
   * 200. Absent on every other rung, because every other rung is under 100.
   */
  every?: number;
}>;

export type Entry = Readonly<{
  /** One line on what the form is for — the gallery's caption. */
  says: string;
  /**
   * The block, or the reason there is none.
   *
   * **`x` is the variant's override and it is spread last**, so a rung can
   * replace a field the default set — `orientation`, `plotStyle`, `plotBox` —
   * rather than only adding to it.
   *
   * **It carries the id, and that is the whole of `AtOverride`** (F400). A
   * document holding a form's default beside its rungs holds one form many
   * times, and every one of them was `f-<form>`: `/all` put twenty `f-line`
   * blocks in one document and `/form violin` twelve `f-violin`, so C04 I14
   * refused both and neither command drew anything at all. The id is the
   * caller's to mint because only the caller knows how many of a form its
   * document holds; the *table* still cannot name one.
   */
  at: (phase: number, height: number, x?: AtOverride) => Block | Refusal;
  /** The rungs this form has beyond its default, each named. */
  variants?: Readonly<Record<string, Variant>>;
}>;

const s = (values: readonly number[], label?: string, tone?: Series["tone"]): Series => ({
  values: [...values],
  ...(label !== undefined ? { label } : {}),
  ...(tone !== undefined ? { tone } : {}),
});

const rows = (n: number, phase: number, cols = 16): Series[] =>
  field(n, cols, phase).map((v, i) => s(v, CORES[i] ?? `row ${String(i + 1)}`));

/**
 * `Camera` reached through the block that carries it, **because the published
 * surface does not name it** (F505). `@fmx/calcium` exports `Plot` and not
 * `Camera`, so a consumer writing anything typed over a camera — a helper, a
 * control, an orbit — has to index the block to get at it. Indexing works and
 * says the wrong thing: this is a type about a *view*, not about a plot.
 */
type PlotCamera = NonNullable<Plot["camera"]>;

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
export type PlotSpec = Parameters<typeof b.plot>[0];

/**
 * A variant's override — **`Partial`, and still `b.plot`'s own keys** (F396).
 *
 * `Partial` because a rung supplies only what it changes; the base spec has
 * already provided `series` and the rest. **The `Omit<PlotSpec, …>` inside is
 * what keeps the guard**: an override naming a member `b.plot` does not
 * declare — `layout`, `offsets`, `totals`, `facets` — is a compile error, so
 * the variant count cannot be inflated by rungs the published builder could
 * never build. Fabricated: adding `layout: "stacked"` to a variant fails to
 * typecheck, which is the same check the `plot` helper carries.
 *
 * **`id` is omitted here and allowed on `AtOverride`, and the split is the
 * point** (F400). A rung is a *presentation* — `plotStyle`, `orientation`,
 * `plotBox` — and a table naming block ids would be naming something it cannot
 * know: whether the document it lands in holds one of the form or twenty. So
 * the table may not set an id, and the composer must.
 */
export type PlotOverride = Partial<Omit<PlotSpec, "form" | "height" | "id">>;

/**
 * What a **caller** may set: everything a rung may, and the id (F400).
 *
 * **The guard is unchanged**, and it never came from omitting `id`: it comes
 * from `PlotSpec` being `Parameters<typeof b.plot>[0]`, so `layout`, `offsets`,
 * `totals` and `facets` are still compile errors here and the refusals below
 * stay facts rather than choices. The `id` omission read as though it were part
 * of that guard — a correct sentence justifying the wrong scope — and the two
 * commands that compose more than one figure per form were refused for it.
 */
export type AtOverride = PlotOverride & Readonly<{ id?: string }>;

/**
 * **`rest` is spread last, so a caller's id wins over the default.** `f-<form>`
 * is right for a document holding one figure per form and wrong for every
 * document holding more; the composer supplies the distinguishing name.
 */
const plot = (form: PlotForm, height: number, rest: Omit<PlotSpec, "form" | "height">): Block =>
  b.plot({ id: `f-${form}`, form, height, ...rest });

/**
 * A rung's block id — **minted here, beside the default it must differ from**
 * (F400).
 *
 * The two namings are four lines apart on purpose. `f-<form>` was written for a
 * document holding one figure per form, and stayed correct until `/all` and
 * `/form` began drawing a form's rungs beside its default; the composer then
 * needed a second name and there was nowhere that both were visible at once.
 */
export const rungId = (form: PlotForm, name: string): string => `f-${form}-${name}`;

/** The four facets both delegating forms show — one series each, named. */
const FACET_KEYS = ["cpu", "mem", "io", "net"] as const;

const refuse = (needs: string, what: string): Refusal => ({
  refused: `\`${needs}\` is not declared on \`b.plot\` — ${what}`,
  needs,
});

export const CATALOGUE: Readonly<Record<PlotForm, Entry>> = Object.freeze({
  // --- curves: a reading at a position -------------------------------------
  // **No `tone` here, and that is a taste rather than a rule.** A declared tone
  // now reaches the line *and* the swatch in both arms (F382) — it was `ok`/`warn`
  // while that was being measured. The categorical palette's orange and cyan read
  // better on a dark ground than green and amber, and `tone` is for *severity*:
  // a latency percentile is not a health state.
  line: { says: "a value over an index", at: (p, h, x) => plot("line", h, {
    axes: true, series: [s(wave(24, p, 1, 8, 20), "p50"), s(wave(24, p, 2, 14, 42), "p99")], ...x }) },
  step: { says: "a value that changes at instants", at: (p, h, x) => plot("step", h, {
    axes: true, series: [s(wave(18, p, 3, 6, 14), "depth")], ...x }) },
  scatter: { says: "two readings per point", at: (p, h, x) => plot("scatter", h, {
    axes: true, series: [s(wave(40, p, 4, 10, 20), "samples")], ...x }) },
  // **The camera is the block's and the orbit is the framework's** (F509).
  // The demo used to advance the azimuth by 0.35 per tick — a fixed angular
  // step whose rate was a function of how expensive the frame was, running at
  // 1.71 rad/s on most rungs and 0.36 on the bunny, against the framework's
  // own delta-timed 0.52. C22 I74 names that defect and solves it one layer
  // down: `ORBIT_RATE * since`, with the stamp advanced per wake. So the
  // declared camera is now where the view **starts**, and `o` turns it — at
  // one revolution in twelve seconds whatever the frame costs.
  plot3d: { says: "three coordinates — press o to orbit", at: (_p, h, x) => plot("plot3d", h, {
    series: [],
    points3: [{
      label: "helix",
      points: Array.from({ length: 120 }, (_v, i) => {
        const t = (i / 119) * Math.PI * 4;
        return { x: Math.cos(t), y: Math.sin(t), z: (i / 119) * 2 - 1, value: t };
      }),
    }],
    // **The path is the same samples, and that is the point of it being here**
    // (C04 I78): a trajectory *through* a cloud is two primitives in one plot
    // area, which is why a polyline is a carrier on this form and not a
    // `line3d` of its own.
    lines3: [{
      label: "path",
      points: Array.from({ length: 120 }, (_v, i) => {
        const t = (i / 119) * Math.PI * 4;
        return { x: Math.cos(t), y: Math.sin(t), z: (i / 119) * 2 - 1, value: t };
      }),
    }],
    // **The surface the helix runs through, as a wireframe** (C04 I79, I80).
    // Solid it would swallow the cloud the entry is about — `writeDepth` is
    // strictly nearer and a bowl through the middle of a helix hides half of
    // it — so the cage is the reading that lets a composed figure stay legible,
    // and it is the mode worth showing: the edge is the fill's own sample, so
    // the grid lines are the caller's own and nothing z-fights (C12 I95).
    //
    // **Coarse on purpose.** A wireframe needs about six samples a cell to
    // read; at this width a 9 × 9 grid leaves interior and a 28 × 28 one draws
    // solid. `light3` is named here because the shading is the picture on this
    // rung and `"headlight"` is the one arm with no terminator — it says the
    // member exists and what choosing it costs.
    surfaces3: [{
      label: "bowl",
      heights: Array.from({ length: 9 }, (_v, j) => Array.from({ length: 9 }, (_w, i) => {
        const u = (i / 4) - 1;
        const v = (j / 4) - 1;
        return (u * u + v * v) - 1.2;
      })),
      xRange: [-1.4, 1.4] as [number, number],
      yRange: [-1.4, 1.4] as [number, number],
      wireframe: true as const,
    }],
    light3: "studio" as const,
    ...x,
    // **The camera is the block's, and the spread preserves it** (F504, F509).
    // F504 was that `...x` replaced the whole object; that was fixed by putting
    // `cameraAt(phase, rung.camera)` after the spread. F509 removes the phase
    // entirely: the framework's orbit is correct, delta-timed and bound to `o`,
    // so a producer that rolls its own is reimplementing it and getting the
    // rate wrong. The rung's camera is now the framing the view starts from
    // rather than the only one it ever reaches — and the merge is still needed,
    // because `...x` still replaces an object.
    camera: { azimuth: Math.PI / 4, ...(x?.camera ?? {}) },
  }) },
  sparkline: { says: "a shape, no furniture", at: (p, h, x) => plot("sparkline", Math.min(h, 1), {
    series: [s(wave(40, p, 5, 6, 10))], ...x }) },
  ecdf: { says: "the empirical distribution", at: (p, h, x) => plot("ecdf", h, {
    axes: true, series: [s(wave(40, p, 6, 9, 18), "latency")], ...x }) },
  density: { says: "a smoothed distribution", at: (p, h, x) => plot("density", h, {
    axes: true, series: [s(wave(48, p, 7, 9, 20), "latency")], ...x }) },
  autocorrelation: { says: "correlation against lag", at: (p, h, x) => plot("autocorrelation", h, {
    axes: true, categories: ["1", "2", "3", "4", "5", "6", "7", "8"],
    series: [s(wave(8, p, 8, 0.5, 0.1), "acf")], ...x }) },
  slope: { says: "before against after", at: (p, h, x) => plot("slope", h, {
    axes: true, series: [s([12 + p % 5, 21], "north"), s([19, 9 + p % 4], "south"), s([7, 15], "east")], ...x }) },
  bubble: { says: "a third reading as area", at: (p, h, x) => plot("bubble", h, {
    axes: true, series: [s(wave(14, p, 9, 8, 16), "load"), s(magnitudes(14, p, 10, 2), "size")], ...x }) },
  stackedarea: { says: "parts of a whole over time", at: (p, h, x) => plot("stackedarea", h, {
    axes: true, series: STAGES.map((n, i) => s(magnitudes(20, p, 11 + i, 6), n)), ...x }) },
  streamgraph: { says: "the same fold, centred", at: (p, h, x) => plot("streamgraph", h, {
    axes: true, series: STAGES.map((n, i) => s(magnitudes(20, p, 21 + i, 6), n)), ...x }) },
  horizon: { says: "a band-folded curve", at: (p, h, x) => plot("horizon", h, {
    bands: 3, series: [s(wave(60, p, 12, 10, 0), "drift")], ...x }) },

  // --- categorical: a reading per named thing ------------------------------
  bar: { says: "a quantity per category", at: (p, h, x) => plot("bar", h, {
    axes: true, orientation: "vertical", categories: [...WIDTHS],
    series: [s(magnitudes(4, p, 13, 6), "layout"), s(magnitudes(4, p, 14, 9), "paint")], ...x }) },
  histogram: { says: "counts per bin", at: (p, h, x) => plot("histogram", h, {
    axes: true, series: [s(wave(120, p, 15, 10, 20), "samples")], ...x }) },
  lollipop: { says: "a bar reduced to its end", at: (p, h, x) => plot("lollipop", h, {
    axes: true, categories: [...STAGES], series: [s(magnitudes(4, p, 16, 8))], ...x }) },
  dotplot: { says: "the same, as a point", at: (p, h, x) => plot("dotplot", h, {
    axes: true, categories: [...STAGES], series: [s(magnitudes(4, p, 17, 8))], ...x }) },
  dumbbell: { says: "two readings, one row", at: (p, h, x) => plot("dumbbell", h, {
    axes: true, categories: [...STAGES],
    series: [s(magnitudes(4, p, 18, 5), "before"), s(magnitudes(4, p, 19, 9), "after")], ...x }) },
  funnel: { says: "a decreasing sequence", at: (p, h, x) => plot("funnel", h, {
    axes: true, categories: ["visited", "signed up", "activated", "retained"],
    series: [s([100, 74 - (p % 6), 48, 31], "users")], ...x }) },
  waffle: { says: "a whole, as counted squares", at: (p, h, x) => plot("waffle", h, {
    segments: STAGES.map((n, i) => ({ label: n, value: Math.round(magnitudes(1, p, 30 + i, 30)[0] ?? 10) })),
    series: [], ...x }) },
  pie: { says: "a whole, as angle", at: (p, h, x) => plot("pie", h, {
    segments: STAGES.map((n, i) => ({ label: n, value: Math.round(magnitudes(1, p, 40 + i, 30)[0] ?? 10) })),
    series: [], ...x }) },
  radar: { says: "several axes at once", at: (p, h, x) => plot("radar", h, {
    categories: ["cpu", "mem", "io", "net", "gpu"],
    series: [s(magnitudes(5, p, 22, 6), "now"), s(magnitudes(5, p, 23, 6), "baseline")], ...x }) },
  timeline: { says: "events on a shared axis", at: (p, h, x) => plot("timeline", h, {
    axes: true, categories: ["build", "test", "deploy"],
    series: [s([1 + (p % 3), 4, 9], "start"), s([3, 8, 11], "mid"), s([4, 9, 13], "end")], ...x }) },
  bullet: { says: "a reading against a target", at: (p, h, x) => plot("bullet", h, {
    categories: ["p50", "p99", "error %"], quartiles: summaries(3, p, 24),
    series: [s(magnitudes(3, p, 25, 6), "now")], ...x }) },

  // --- distributions -------------------------------------------------------
  boxplot: { says: "five numbers per category", at: (p, h, x) => plot("boxplot", h, {
    axes: true, categories: [...STAGES], quartiles: summaries(4, p, 26), series: [], ...x }) },
  violin: { says: "the density, mirrored", at: (p, h, x) => plot("violin", h, {
    axes: true, categories: [...STAGES].slice(0, 3),
    series: [0, 1, 2].map((i) => s(wave(60, p, 27 + i, 6, 14), STAGES[i])), ...x }) },
  ridgeline: { says: "distributions, stacked", at: (p, h, x) => plot("ridgeline", h, {
    axes: true, series: [0, 1, 2, 3].map((i) => s(wave(60, p, 31 + i, 5, 12), STAGES[i])), ...x }) },
  forest: { says: "estimates and their intervals", at: (p, h, x) => plot("forest", h, {
    axes: true, categories: [...STAGES], quartiles: summaries(4, p, 35), series: [], ...x }) },

  // --- matrices: a field over two axes -------------------------------------
  heatmap: { says: "a value per cell", at: (p, h, x) => plot("heatmap", h, {
    yMin: 0, yMax: 1, yFormat: "fraction", colormap: "viridis",
    xLabels: ["-16 frames", "", "now"], series: rows(6, p), ...x }) },
  // **One flat series in time order, not a grid of rows** — the builder refused
  // seven of them with the reason: *a calendar's rows are a period, so series is
  // a second period claiming the same rows* (C04 I62, C12 I53).
  calendar: { says: "a value per day", at: (p, h, x) => plot("calendar", h, {
    yMin: 0, yMax: 1, yFormat: "fraction", calendarUnit: "day", startDate: "2026-03-02",
    series: [s((field(1, 84, p, 7)[0] ?? []), "commits")], ...x }) },
  correlation: { says: "every pair, compared", at: (p, h, x) => plot("correlation", h, {
    yMin: -1, yMax: 1, colormap: "coolwarm", categories: ["cpu", "mem", "io", "net"],
    series: field(4, 4, p, 9).map((v, i) => s(v.map((x) => x * 2 - 1), ["cpu", "mem", "io", "net"][i])), ...x }) },
  confusion: { says: "predicted against actual", at: (p, h, x) => plot("confusion", h, {
    yMin: 0, categories: ["ok", "warn", "error"],
    series: field(3, 3, p, 11).map((v, i) => s(v.map((x) => Math.round(x * 40)), ["ok", "warn", "error"][i])), ...x }) },
  spectrogram: { says: "frequency over time", at: (p, h, x) => plot("spectrogram", h, {
    yMin: 0, yMax: 1, colormap: "inferno", series: rows(8, p, 24), ...x }) },
  latency: { says: "a latency distribution over time", at: (p, h, x) => plot("latency", h, {
    yMin: 0, yMax: 1, colormap: "magma", series: rows(4, p, 20), ...x }) },
  density2d: { says: "point density as a field", at: (p, h, x) => plot("density2d", h, {
    yMin: 0, yMax: 1, colormap: "viridis", series: rows(8, p, 20), ...x }) },
  utilisation: { says: "load per resource", at: (p, h, x) => plot("utilisation", h, {
    yMin: 0, yMax: 1, yFormat: "fraction", series: rows(4, p, 24), ...x }) },
  contour: { says: "the field, as level lines", at: (p, h, x) => plot("contour", h, {
    levels: [0.25, 0.4, 0.55, 0.7, 0.85], series: rows(8, p, 24), ...x }) },
  quiver: { says: "a vector per cell", at: (p, h, x) => plot("quiver", h, {
    // A vector series is `[u, v]` pairs, not two arrays — which the compiler
    // said the moment the cast came off, and would have said nothing about
    // before it.
    vectors: Array.from({ length: 6 }, (_, r) => ({
      values: (field(1, 12, p + r, 13)[0] ?? []).map(
        (u, c): readonly [number, number] => [u - 0.5, (field(1, 12, p + r, 17)[0]?.[c] ?? 0.5) - 0.5],
      ),
    })), series: [], ...x }) },

  // --- shapes: a hierarchy or a graph --------------------------------------
  treemap: { says: "area by value, nested", at: (p, h, x) => plot("treemap", h, { hierarchy: budget(p), series: [], ...x }) },
  flame: { says: "a stack, widest at the root", at: (p, h, x) => plot("flame", h, { hierarchy: budget(p), series: [], ...x }) },
  icicle: { says: "the same, growing down", at: (p, h, x) => plot("icicle", h, { hierarchy: budget(p), series: [], ...x }) },
  tree: { says: "the shape, as nodes and edges", at: (p, h, x) => plot("tree", h, { hierarchy: budget(p), series: [], ...x }) },
  // Three sources into two sinks, and the phase moves one flow so the ribbon
  // it draws — and the bar at each end of it — changes height (C12 §3ap).
  sankey: { says: "flows between nodes, ribbons by weight", at: (p, h, x) => plot("sankey", h, {
    graph: {
      nodes: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "x" }, { id: "y" }],
      edges: [
        { from: "a", to: "x", weight: 4 + (p % 3) }, { from: "a", to: "y", weight: 1 },
        { from: "b", to: "y", weight: 3 }, { from: "c", to: "x", weight: 2 },
      ],
    }, series: [], ...x }) },
  graph: { says: "nodes and the edges between", at: (p, h, x) => plot("graph", h, {
    graph: {
      nodes: [{ id: "parse" }, { id: "measure" }, { id: "layout" }, { id: "paint" }, { id: "compose" }],
      edges: [
        { from: "parse", to: "measure" }, { from: "measure", to: "layout" },
        { from: "layout", to: "paint" }, { from: "paint", to: "compose" },
        ...(p % 2 === 0 ? [{ from: "layout", to: "compose" }] : []),
      ],
    }, series: [], ...x }) },

  // --- the four that used to refuse, and no longer do (F335, F377, C24 I30) --
  //
  // **Each was a form whose *only* datum `b.plot` did not declare**, so the entry
  // named the missing field rather than being omitted — a catalogue that skips
  // what it cannot construct reports complete. The published builder takes all
  // eight now, so `refusals()` is empty and the count on screen is 46 of 46.
  //
  // **`refuse` is kept** rather than deleted with its last caller: it is the
  // shape an entry takes when the surface cannot build a form, and the next form
  // added to `PlotForm` before its builder is the reason to have it. Exercised by
  // `T-refuse` so it is not a function nothing calls.
  gantt: { says: "bars with a start per row", at: (p, h, x) => plot("gantt", h, {
    axes: true, categories: ["build", "test", "deploy", "monitor"],
    series: [s([5, 3, 2, 1 + (p % 3)])], offsets: [0, 5, 8, 10], ...x }) },
  waterfall: { says: "a running balance", at: (p, h, x) => plot("waterfall", h, {
    axes: true, categories: ["measure", "layout", "paint", "compose", "frame"],
    series: [s([100, -40 + (p % 5), -25, -10, 25])],
    totals: [false, false, false, false, true], ...x }) },
  pairplot: { says: "every variable against every other", at: (p, h, x) => plot("pairplot", h, {
    axes: true, series: [],
    facets: FACET_KEYS.map((k, i) => b.plot({
      id: `pair-${k}`, form: "scatter", height: 4, axes: true,
      series: [s(wave(30, p, 44 + i, 8, 16))],
    })), ...x }) },
  smallmultiples: { says: "the same figure, repeated", at: (p, h, x) => plot("smallmultiples", h, {
    axes: true, series: [],
    facets: FACET_KEYS.map((k, i) => b.plot({
      id: `mult-${k}`, form: "line", height: 4, axes: true,
      series: [s(wave(30, p, 48 + i, 6, 14), k)],
    })), ...x }) },
});

/** Every form, in the catalogue's order. */
/**
 * The rungs each form has beyond its default — **the other 146** (F396).
 *
 * `/all` drew 42 figures, one per form, under a caption saying *every form the
 * type declares*. True, and read as a claim about **plots**: the corpus carries
 * **188 variants**, and a violin alone has 19. A reader counted and was right.
 *
 * **A separate table rather than a field on each entry**, because the variation
 * is presentational and orthogonal: the same data at a different `plotStyle`,
 * `orientation`, `plotBox` or height. Writing it beside each form would mean
 * repeating the data setup nineteen times for the violin.
 *
 * **Every one goes through `b.plot`.** The override type is
 * `Omit<PlotSpec, …>`, so a rung needing an undeclared member is a compile
 * error rather than a silent omission — the same guard the `plot` helper
 * carries, and for the same reason.
 *
 * **`satisfies`, not an annotation, and `Object.freeze` is gone** (F397). The
 * first draft was `const VARIANTS: Partial<…> = Object.freeze({…})`, and
 * `Object.freeze` returns a value rather than a fresh literal — so excess
 * property checking never ran and `layout: "stacked"` typechecked inside a
 * variant. That is **the same hole this file's header already records catching
 * once**, in the `plot` helper, reappearing in the table added beside it: a
 * claim that the count cannot be inflated by rungs `b.plot` could not build,
 * with nothing enforcing it. `satisfies` checks the literal in place and keeps
 * the inferred keys. Fabricated after the fix, against a file that compiles —
 * the first attempt was run against one that did not, so it proved nothing.
 *
 * **A rung that draws its default is not a rung, and eight did** (F396). Every
 * variant here is compared byte-for-byte against its own form's default, and
 * the ones that matched were removed rather than kept for the count:
 * `plotCorners: "sharp"` is a **no-op for `scatter`, `boxplot`, `violin`,
 * `treemap` and `pie`** at every height tried, `bar`'s base already sets
 * `orientation: "vertical"`, and one entry was `spec: {}`. A caption promising a
 * different picture over an identical one is the collision instrument's own
 * subject (C12 I75) arriving in a demo.
 *
 * **A rung chosen by *room* carries a `height` instead of a field** — the
 * compact and raincloud forms are what a violin collapses to when the rows run
 * out, and there is no field that selects them (C12 §3i's ladder). That is why
 * `Variant` has both.
 */
/**
 * A helix at a given radius — the 3D variants' fixture (C04 I76).
 *
 * **Phase-free, like `S1` beside it.** `/all` draws every variant at a phase and
 * `/form` at zero; a fixture that moved with the phase would make the two pages
 * disagree about a figure neither is animating.
 */
const helix3d = (n: number, r: number): { x: number; y: number; z: number; value: number }[] =>
  Array.from({ length: n }, (_v, i) => {
    const t = (i / (n - 1)) * Math.PI * 4;
    return { x: Math.cos(t) * r, y: Math.sin(t) * r, z: (i / (n - 1)) * 2 - 1, value: t };
  });

/** One band's samples — the compact rungs' fixture, phase-free (C04 I56). */
const S1: Series = s(wave(60, 0, 27, 6, 14), "measure");

const VARIANTS = {
  violin: {
    "braille": { says: "the outline stroked in braille dots", spec: { plotStyle: "braille" } },
    "braille-filled": { says: "and the interior set", spec: { plotStyle: "braille", plotFill: "solid" } },
    "vertical": { says: "the conventional orientation — seaborn's default", spec: { orientation: "vertical" } },
    "vertical-braille": { says: "stood up, in dots", spec: { orientation: "vertical", plotStyle: "braille" } },
    "vertical-braille-filled": { says: "stood up, dots, filled", spec: { orientation: "vertical", plotStyle: "braille", plotFill: "solid" } },
    "line-box": { says: "the interquartile run as a rule, not a block", spec: { plotBox: "line" } },
    "bimodal-sharp": { says: "the same data at bandwidth 0.4 — both modes show", spec: { bandwidth: 0.4 } },
    // **The compact ladder needs a *single* band, and that is the form's rule
    // rather than a limitation** (C04 I56). A violin needs two rows per band, so
    // three categories cannot reach the raincloud rung at any height the
    // validator accepts — `b.plot` refuses `3 bands in 3 rows` outright. Giving
    // the rung one category is what makes the floor reachable, and the refusal
    // is what said so: four rungs were written at heights 2 and 3 and every one
    // threw. Measured, not reasoned.
    "compact": { says: "the floor — one band, a raincloud", spec: { categories: ["measure"], series: [S1] }, height: 3 },
    "compact-braille": { says: "the floor, in dots", spec: { categories: ["measure"], series: [S1], plotStyle: "braille" }, height: 3 },
    "compact-line-box": { says: "the floor with a ruled box", spec: { categories: ["measure"], series: [S1], plotBox: "line" }, height: 3 },
    "compact-vertical": { says: "the floor, stood up", spec: { categories: ["measure"], series: [S1], orientation: "vertical" }, height: 3 },
  },
  // **The three arms `plotStyle` now names on this form** (C12 I99, I100, I101).
  // `/all` and `/form` draw them beneath the default, which is the terminal's
  // own choice — so one page carries the capability arm and the three a caller
  // can ask for, at the size they are actually read at rather than as a tile.
  plot3d: {
    "marker": {
      says: "the glyph table above the colour floor — shape is identity, size is depth",
      spec: { plotStyle: "marker" },
    },
    // **The named shape needs its own cloud**, because the base entry's is one
    // series and the fallback *is* the series index: a single unnamed cloud
    // draws the same glyph either way, so a variant that only sets `plotStyle`
    // cannot show the field at all.
    "marker-named": {
      says: "two clouds, one naming its shape and one taking its index's",
      spec: {
        plotStyle: "marker",
        colourBy: "series",
        lines3: [],
        surfaces3: [],
        points3: [
          { label: "star", points: helix3d(60, 0.9), marker: "star" },
          { label: "index", points: helix3d(60, 0.4) },
        ],
      },
    },
    "braille": {
      says: "the dot grid — twice the positional resolution, one colour a cell",
      spec: { plotStyle: "braille" },
    },
    "line": {
      says: "box drawing with real joins, which C12 §3am refused and F483 re-argued",
      spec: { plotStyle: "line" },
    },
    "line-sharp": {
      says: "the same arm, square corners",
      spec: { plotStyle: "line", plotCorners: "sharp" },
    },
    // --- the surface arm ---------------------------------------------------
    //
    // **`surfaces3` is the half of this form the catalogue had no rung for**,
    // and it is the half the silhouette alphabet is about. The base entry above
    // draws a cloud with a cage through it; nothing here showed a *shaded* face
    // at all, so every ruling about how a partial cell is drawn was reachable
    // only from a spec file.
    //
    // `field` is the heatmap's own generator, so the surface breathes under
    // `/live` for nothing — and the same numbers drawn two ways is a comparison
    // a reader can make without leaving the page.
    "surface": {
      says: "a shaded face — nine levels a cell along its silhouette",
      height: 20,
      spec: {
        points3: [], lines3: [],
        surfaces3: [{ label: "field", heights: field(24, 24, 0), xRange: [-1, 1] as [number, number], yRange: [-1, 1] as [number, number] }],
      },
    },
    // **The overlap case, which is the one the depth rules exist for** (C12
    // I90). A cloud in front of a face is where a partial cell has to take its
    // background from *what is behind it* rather than from the terminal — get
    // that wrong and every silhouette cell punches a hole in the surface.
    "surface-over-cloud": {
      says: "a cloud in front of a face — the cell behind a silhouette is the surface, not the terminal",
      height: 20,
      spec: { surfaces3: [{ label: "field", heights: field(18, 18, 0), xRange: [-1, 1] as [number, number], yRange: [-1, 1] as [number, number] }] },
    },
    // **Hidden-line without a second rasteriser** (C12 I95): the edge is the
    // fill's own sample, so nothing z-fights and the cage is exact.
    "wireframe": {
      says: "the cage alone, hidden-line from the fill's own sample",
      height: 20,
      spec: {
        points3: [], lines3: [],
        surfaces3: [{ label: "field", heights: field(14, 14, 0), wireframe: true, xRange: [-1, 1] as [number, number], yRange: [-1, 1] as [number, number] }],
      },
    },
    "wireframe-over": {
      says: "and over the shaded face, at half its intensity",
      height: 20,
      spec: {
        points3: [], lines3: [],
        surfaces3: [{ label: "field", heights: field(14, 14, 0), wireframe: "over", xRange: [-1, 1] as [number, number], yRange: [-1, 1] as [number, number] }],
      },
    },

    // --- real meshes -------------------------------------------------------
    //
    // **Vendored under `assets/meshes/` and parsed by `src/meshes.ts`**, which
    // is a consumer writing its own OBJ reader against the published surface —
    // `surfaces3` takes vertices and faces and has no opinion about files.
    //
    // **`closed: true` culls back faces**, and on a mesh that is watertight it
    // changes nothing a reader can see, which is what makes it the right member
    // to name here: the claim is about cost, not about the picture.
    //
    // Measured at this width, five frames each after a warm parse: **suzanne 36
    // ms · teapot 60 ms · bunny 365 ms** (median). `b.live`'s default tick is
    // 200 ms, so two of the three orbit on it and the bunny names its own — a
    // figure that cannot keep its tick stutters, and the honest remedy is a tick
    // it can keep rather than a still under a caption saying it does not turn.
    "suzanne": {
      says: "968 faces — smooth shading over a real model",
      height: 20,
      spec: {
        points3: [], lines3: [], colourBy: "depth", colormap: "magma",
        camera: { azimuth: Math.PI / 4, elevation: 0.35, distance: 6 },
        surfaces3: [{ label: "suzanne", ...mesh("suzanne"), closed: true, shading: "smooth" }],
      },
    },
    "teapot": {
      says: "6,320 faces — the spout and the handle are the reading",
      height: 20,
      spec: {
        points3: [], lines3: [], colourBy: "depth", colormap: "viridis",
        // **The azimuth is a measurement.** Read as silhouettes, the teapot is a
        // featureless drum from most angles; at `π/2` the handle stands clear of
        // the body — `### #########` — which is the one view that says what the
        // model is.
        camera: { azimuth: Math.PI / 2, elevation: 0.3, distance: 6 },
        surfaces3: [{ label: "teapot", ...mesh("teapot"), closed: true, shading: "smooth" }],
      },
    },
    "bunny": {
      says: "69,451 faces — 365 ms a frame, so it turns on its own tick",
      height: 22,
      every: 600,
      spec: {
        points3: [], lines3: [], colourBy: "depth", colormap: "coolwarm",
        // **Read as a picture, not as a number.** At the framework fixtures'
        // own azimuth the bunny is a rounded mass with its ears edge-on and
        // reads as a boulder; at `2.2` the ears sweep clear of the head and it
        // is unmistakable. Same mesh, same rotation — the camera was the whole
        // of it, and no count of inked cells or interior holes distinguishes
        // the two.
        camera: { azimuth: 2.2, elevation: 0.25, distance: 5 },
        surfaces3: [{ label: "bunny", ...mesh("bunny"), closed: true, shading: "smooth" }],
      },
    },

    // --- the furniture -----------------------------------------------------
    //
    // **Three members with no rung between them until now** — the box, the
    // axes and their heads — and each is a member `b.plot` takes that no
    // consumer named, which is the count `publicSurfaceUseSignal` reports.
    "box-back": {
      says: "the far edges only, so the near ones do not cross the figure",
      height: 18,
      spec: { box3: "back" },
    },
    "axes-origin": {
      says: "three rules through the origin rather than a box",
      height: 18,
      spec: { box3: "none", axes3: "origin", origin3: "auto" },
    },
    "arrows": {
      says: "chevron heads, and each axis its own tone",
      height: 18,
      spec: {
        box3: "none",
        axisStyle3: {
          x: { arrow: true, tone: "accent" },
          y: { arrow: true, tone: "info" },
          z: { arrow: true, tone: "warn" },
        },
      },
    },
    // **No `distance` here, and that is F503 landing.** The rung carried
    // `distance: 4` from when the orthographic arm divided by nothing: no
    // distance framed it, so the number was chosen against a projection that
    // ignored it and the figure ran off the top and the bottom of the plot. The
    // arm now takes its scale from the distance to the target, so the default
    // frames this exactly as it frames the entry above — which is what makes
    // the two comparable, and comparing them is the whole of the rung.
    "orthographic": {
      says: "no divide by depth — parallel edges stay parallel",
      height: 18,
      spec: { camera: { projection: "orthographic" } },
    },
  },
  boxplot: {
    "vertical": { says: "columns rather than bands", spec: { orientation: "vertical" } },
    "box-line": { says: "the interquartile run ruled rather than filled", spec: { plotBox: "line" } },
    "compact": { says: "one row a category — the form's floor", spec: {}, height: 4 },
    "compact-box-line": { says: "the floor, ruled", spec: { plotBox: "line" }, height: 4 },
    "roomy": { says: "room to spare, so nothing collapses", spec: {}, height: 14 },
  },
  bar: {
    // **`horizontal`, because the base is already vertical** — the first draft
    // overrode `orientation: "vertical"` onto a spec that sets it, and drew a
    // byte-identical figure under a caption promising a different one.
    "horizontal": { says: "bars rather than columns", spec: { orientation: "horizontal" } },
    // **`layout` is `bar`'s only multi-series reading**, and for as long as
    // `b.plot` omitted it the form built `overlap` and nothing else (C24 I30,
    // F335). A member the builder takes and no consumer names is still counted
    // by `publicSurfaceUseSignal`, so these are rungs rather than a note.
    "grouped": { says: "the series side by side within each category", spec: { layout: "grouped" } },
    "stacked": { says: "the series summed, one column a category", spec: { layout: "stacked" } },
    "normalised": { says: "stacked to a shared 100%", spec: { layout: "normalised" } },
  },
  line: {
    // **`yAxis: "right"` on all three, and C04 I60 is why**: a callout is written
    // where the left gutter's labels go, so the two together are refused rather
    // than overlaid. The refusal is what said so — the first draft threw.
    "callout-last": { says: "the final reading named at the line's end", spec: { yCallout: "last", yAxis: "right" } },
    "callout-name": { says: "the series named instead", spec: { yCallout: "name", yAxis: "right" } },
    "callout-both": { says: "both", spec: { yCallout: "both", yAxis: "right" } },
    "legend-above": { says: "the key over the figure", spec: { legend: "above" } },
    "legend-below": { says: "and under it", spec: { legend: "below" } },
    "legend-off": { says: "no key at all", spec: { legend: false } },
    "frame-grid": { says: "gridlines behind the data", spec: { plotFrame: "grid" } },
    "frame-corners": { says: "corner marks rather than a box", spec: { plotFrame: "corners" } },
    "frame-rule": { says: "a single rule", spec: { plotFrame: "rule" } },
    "yaxis-right": { says: "the gutter on the right", spec: { yAxis: "right" } },
    "yaxis-both": { says: "and on both sides", spec: { yAxis: "both" } },
    "yaxis-none": { says: "no value gutter", spec: { yAxis: false } },
    "origin-top-left": { says: "the ordinate flipped", spec: { origin: "top-left" } },
    "origin-bottom-right": { says: "the abscissa mirrored", spec: { origin: "bottom-right" } },
    "origin-top-right": { says: "both", spec: { origin: "top-right" } },
    "corners-sharp": { says: "square joins on the curve", spec: { plotCorners: "sharp" } },
    "aspect-square": { says: "the area held square", spec: { aspect: 1 } },
    "align-centre": { says: "a narrow figure centred", spec: { width: 40, align: "centre" } },
    "align-right": { says: "and pushed right", spec: { width: 40, align: "right" } },
  },
  scatter: {
  },
  heatmap: {
    "palette": { says: "a different colormap", spec: { colormap: "magma" as const } },
    "captions-left": { says: "row names down the gutter", spec: { matrixAnchor: "left" } },
    // **`yScale` and `emptyMessage`, the other two of the eight** (F335). A
    // percentile spread wants a decade per gridline, and an empty plot is a
    // state every surface meets — without the member each app hand-composes it,
    // which is C24 §8d's defect one kind along.
    "log-y": { says: "a decade per gridline, which a percentile spread wants", spec: { yScale: "log" } },
    "empty": {
      says: "no data, and the message the surface chooses for it",
      spec: { series: [], emptyMessage: "no frames in this window" },
    },
  },
  histogram: {
    "vertical": { says: "columns", spec: { orientation: "vertical" } },
    // `binning` — the bin-width rule, defaulted to Sturges and distinguishable
    // in the corpus, which is the argument for a consumer being able to choose.
    "scott": { says: "Scott's rule for the bin width", spec: { binning: "scott" } },
    "freedman-diaconis": { says: "the IQR rule — robust to a long tail", spec: { binning: "freedman-diaconis" } },
  },
  tree: {
    "left-right": { says: "the layout rotated", spec: { treeLayout: "leftRight" } },
    "outline": { says: "an indented outline instead of a diagram", spec: { treeLayout: "outline" } },
  },
  ridgeline: {
    "sharp": { says: "square joins", spec: { plotCorners: "sharp" } },
    "compact": { says: "the curves crowded", spec: {}, height: 5 },
  },
  density: {
    "braille": { says: "the curve in dots", spec: { plotStyle: "braille" } },
    "filled": { says: "the area under it set", spec: { plotStyle: "braille", plotFill: "solid" } },
  },
  contour: {
    "lines-only": { says: "the iso-lines without the field behind them", spec: { layers: ["contour"] as const } },
    "levels": { says: "the iso-values named rather than chosen", spec: { levels: [-4, -2, 0, 2, 4, 6] } },
  },
  quiver: {
    "arrows-only": { says: "the vectors without the field", spec: { layers: ["quiver"] as const } },
    "with-contour": { says: "field, iso-lines and arrows together", spec: { layers: ["field", "contour", "quiver"] as const } },
  },
  pie: {
    "narrow": { says: "at twenty columns", spec: { width: 20 } },
  },
  calendar: {
    "week": { says: "a week per cell", spec: { calendarUnit: "week" } },
    "month": { says: "a month per cell", spec: { calendarUnit: "month" } },
  },
  graph: {
    // **At fourteen rows, not six** — measured: `plotCorners` changes nothing in
    // a six-row graph because no corner glyph is drawn at that size.
    "sharp": { says: "square edges on the connectors", spec: { plotCorners: "sharp" }, height: 14 },
  },
  treemap: {
  },
} satisfies Partial<Record<PlotForm, Record<string, Variant>>>;

/** The rungs a form has, or an empty record. */
export function variantsOf(form: PlotForm): Readonly<Record<string, Variant>> {
  // **Widened by assignment, never by a cast.** `satisfies` leaves `VARIANTS`
  // with only the keys it actually has, so indexing it by any `PlotForm` is an
  // error — which is the type doing its job. A checked assignment to the
  // partial record is the lookup; `as` here would undo F397's whole point.
  const table: Partial<Record<PlotForm, Readonly<Record<string, Variant>>>> = VARIANTS;
  return table[form] ?? {};
}

/** Every `form/variant` pair the demo can draw — the count `/all` reports. */
export function everyVariant(): readonly Readonly<{ form: PlotForm; name: string; variant: Variant }>[] {
  const out: { form: PlotForm; name: string; variant: Variant }[] = [];
  for (const form of Object.keys(CATALOGUE) as PlotForm[]) {
    for (const [name, variant] of Object.entries(variantsOf(form))) out.push({ form, name, variant });
  }
  return out;
}

export const FORMS = Object.keys(CATALOGUE) as readonly PlotForm[];

/** The four that refuse, measured from the table rather than restated (F377). */
export function refusals(): readonly PlotForm[] {
  return FORMS.filter((f) => "refused" in CATALOGUE[f].at(0, 8));
}
