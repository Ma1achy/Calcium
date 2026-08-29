/**
 * The five figures, built through `b.plot` — the published builder, and the
 * whole point of this example.
 *
 * Every fixture in the repository builds a plot with `block({ … })`, the
 * viewmodel constructor, which is transparent to any field. So the builder is
 * the one surface no artefact exercises for these forms, and F335 measured what
 * that hid: eight of `Plot`'s 58 members are absent from it, four of them a
 * form's only datum.
 *
 * This file is written the way a consumer writes one — reach for the type, pass
 * the member, and let the compiler answer.
 */
import { b } from "@fmx/calcium";
import type { Block, Plot, Series } from "@fmx/calcium";

/**
 * **Two datum types the builder takes and the entry point does not publish**
 * (F371). `b.plot` declares `hierarchy` and `quartiles` — as `Plot["hierarchy"]`
 * and `Plot["quartiles"]`, indexed off the one type that *is* published — so a
 * literal passes and a consumer naming the type does not compile:
 *
 *     import type { HierarchyNode, QuartileSummary } from "@fmx/calcium";
 *     // TS2305: Module '"@fmx/calcium"' has no exported member 'HierarchyNode'.
 *
 * Eleven of `Plot`'s datum types are in that position. The indexed access below
 * is the workaround and it is exactly what `b.plot`'s own signature does, which
 * is why nothing inside the package could notice.
 */
type HierarchyNode = NonNullable<Plot["hierarchy"]>;
type QuartileSummary = NonNullable<Plot["quartiles"]>[number];

/** What `bin/plots` prints. */
export type Sample = Readonly<{
  latency: Readonly<{ p50: readonly number[]; p99: readonly number[] }>;
  budget: Readonly<{
    widths: readonly string[];
    stages: readonly string[];
    ms: readonly (readonly number[])[];
  }>;
  heat: Readonly<{ rows: readonly string[]; values: readonly (readonly number[])[] }>;
  frames: Readonly<{ stages: readonly string[]; quartiles: readonly QuartileSummary[] }>;
  shape: HierarchyNode;
}>;

const series = (values: readonly number[], label: string, tone?: Series["tone"]): Series => ({
  values: [...values],
  label,
  ...(tone !== undefined ? { tone } : {}),
});

/** A curve — two series against a shared ordinate, each named at the line it ends on. */
export function curve(s: Sample, height = 9): Block {
  return b.plot({
    id: "latency",
    form: "line",
    height,
    axes: true,
    yMin: 0,
    // **`duration` is seconds and these are milliseconds**, which drew a
    // 58 ms tail as `58s` and a frame budget of `1m 15s`. The formatters are
    // named for the unit *in* (C04 I41) and there is no `ms` arm, so the
    // number is plain and the unit is said in the caption above.
    yFormat: "number",
    xTitle: "frame",
    // **A callout needs a gutter to be written in** (C04 I60). `yCallout` alone
    // is refused at construction with the fix named — a pairing discoverable
    // from the validator rather than from the type, and the demo found it on
    // the first figure it drew.
    yAxis: "right",
    yCallout: "name",
    series: [series(s.latency.p50, "p50", "ok"), series(s.latency.p99, "p99", "warn")],
  });
}

/**
 * A bar — the frame budget at four widths, by stage.
 *
 * **This is where the demo refuses**, and it took a collision sweep to make the
 * refusal honest. The figure was first written `layout: "grouped"`, which reads
 * as the thing a bar chart is for — and rendering the block with the member
 * absent, `"overlap"` and `"grouped"` gives **one byte-identical frame for all
 * three**. C12 §3ak already rules why: *there is no overlapping picture a bar
 * can draw*, so `overlap` with more than one series **means grouped**, and
 * grouped is what a multi-series bar draws with nothing set. The variant would
 * have stated a claim its block does not make — F350's rule, on the figure this
 * example was built to make its point with.
 *
 * `stacked` and `normalised` are the two values that draw differently, and
 * neither is reachable: `layout` is one of the eight members F335 measured
 * absent from `b.plot`.
 *
 *     layout: "stacked",
 *     // TS2353: 'layout' does not exist in type ... 46 more ...
 *
 * So four stages of one budget are drawn side by side where they are parts of a
 * whole and belong in one column (F371).
 *
 * **`vertical` shows two stages and `horizontal` shows four**, which is not a
 * taste. The vertical arm reserves a `legend`'s width and draws nothing in it,
 * and drops a category label whose name would overlap its neighbour without
 * saying so; the horizontal arm of the same form does both correctly, and names
 * what it dropped (F374). Four unnamed colours is not a figure, so the glance
 * takes the pair it can label and `/bars` takes the arm that can carry all four.
 */
export function bars(s: Sample, height = 8): Block {
  return b.plot({
    id: "budget-by-width",
    form: "bar",
    height,
    axes: true,
    orientation: "vertical",
    categories: [...s.budget.widths],
    yFormat: "number",
    series: s.budget.ms
      .map((ms, i) => series(ms, s.budget.stages[i] ?? `stage ${String(i + 1)}`))
      .filter((_, i) => i === 1 || i === 2),
  });
}

/** The same budget, all four stages, on the arm that can name them. */
export function barsFull(s: Sample, height = 14): Block {
  return b.plot({
    id: "budget-by-width",
    form: "bar",
    height,
    axes: true,
    orientation: "horizontal",
    legend: "right",
    categories: [...s.budget.widths],
    yFormat: "number",
    series: s.budget.ms.map((ms, i) => series(ms, s.budget.stages[i] ?? `stage ${String(i + 1)}`)),
  });
}

/** A matrix — one row per core, density carrying the reading and colour joining it. */
export function heat(s: Sample, height = 6): Block {
  return b.plot({
    id: "utilisation",
    form: "heatmap",
    height,
    yMin: 0,
    yMax: 1,
    // **`fraction`, not `percent`** — the values are 0..1 and `percent` takes
    // 0..100, so a fully-loaded core was labelled `1%`. The two arms are
    // named for the unit in and both end in a per-cent sign, which is C04
    // I41 exactly, and the ramp read as a legend of nothing.
    yFormat: "fraction",
    colormap: "viridis",
    xLabels: ["-16 frames", "", "now"],
    series: s.heat.values.map((values, i) => series(values, s.heat.rows[i] ?? `core ${String(i)}`)),
  });
}

/** A distribution — four stages, each a five-number summary. */
export function distribution(s: Sample, height = 10): Block {
  return b.plot({
    id: "frames",
    form: "boxplot",
    height,
    axes: true,
    yFormat: "number",
    categories: [...s.frames.stages],
    quartiles: s.frames.quartiles,
    series: [],
  });
}

/** A hierarchy — the frame budget, nested, area by value. */
export function hierarchy(s: Sample, height = 10): Block {
  return b.plot({
    id: "budget-shape",
    form: "treemap",
    height,
    hierarchy: s.shape,
    series: [],
  });
}

/** The live one — a walk, redrawn every tick, which is the only thing here that moves. */
export function walk(values: readonly number[], height = 6): Block {
  return b.plot({
    // **Not `walk`, which is the live panel's own id** (F372, F373). A
    // `b.live` part renders a child, the shell patches it in by the panel's
    // id, and a child carrying that id makes the id ambiguous — after which
    // every later patch is rejected and the part is torn down in silence.
    // The panel keeps drawing its last child, so it looks alive and is not.
    id: "queue-depth",
    form: "line",
    height,
    axes: true,
    yFormat: "number",
    plotFill: "solid",
    yAxis: "right",
    yCallout: "last",
    series: [series(values, "queue depth", "info")],
  });
}
