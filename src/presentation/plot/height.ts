/**
 * A plot's height, and the reason this is a file of its own.
 *
 * **The series is not reachable from here.** `PlotGeometry` is three fields of
 * `Plot`, and the height functions take that rather than the block, so deriving
 * a height from the data is a type error rather than a test failure. C12 I1 is
 * the invariant S11's whole shape rests on — a 200-epoch run's block is the same
 * height as a 10-epoch one, which is the only reason a long run can coexist with
 * the transcript — and the failure mode it guards against is subtle: the plot
 * renders, nothing errors, and everything below it moves as data arrives.
 *
 * That is the same instinct as CLAUDE.md's rule about never letting `measure`
 * see anything that animates, one component over. Both are cases where the
 * cheapest guarantee is making the wrong thing unreachable rather than checking
 * for it afterwards.
 */
import type { Plot, PlotForm } from "../../data/viewmodel/index.js";

/** The fields a height depends on. Deliberately not `Plot`. */
// `xTitle` is a **declaration** and not data — it costs a row the caller
// stated, exactly as `legend` does — so it belongs in this Pick and the
// guarantee above is untouched: the series is still unreachable from here.
export type PlotGeometry = Pick<Plot, "form" | "height" | "axes" | "legend" | "xTitle">;

/**
 * The rows a legend costs — one for a horizontal placement, none otherwise.
 *
 * **`series` stays unreachable, which is the whole reason the field is split
 * this way** (C12 I27). A horizontal legend's cost must be known before the data
 * is, so it is a fixed row and never auto-enables; a vertical one costs width,
 * which is already data-dependent through the gutter, and is therefore allowed
 * to size itself. A legend that grew a second row for a ninth series would make
 * `plotHeight` a function of the series, which is the one thing C12 I1 forbids.
 */
export function legendRows(plot: PlotGeometry): number {
  return plot.legend === "above" || plot.legend === "below" ? 1 : 0; // cells-ok — a row count
}

/**
 * The row an x-axis title costs (C12 I56, §3ag).
 *
 * **Added centrally, on `legendRows`' recorded reason**: every form that draws
 * one pays it the same way, and a table of thirty-six entries each adding the
 * same term is thirty-six chances to forget one.
 */
export function titleRows(plot: PlotGeometry): number {
  return plot.xTitle === undefined ? 0 : 1; // cells-ok — a row count
}

/** The rows an axed plot spends below the plot area: the rule, then x-labels. */
export const AXIS_ROWS = 2;

/**
 * The row the frame's **top** edge costs, above the plot area (§3f).
 *
 * **A constant and not a derivation**, which is I1 in one line: a box has a lid
 * whatever the data does, so the row is declared here and `plotHeight` adds it
 * without ever seeing a series. Separate from `AXIS_ROWS` rather than folded
 * into a 3, because the matrix family spends `AXIS_ROWS` on x-labels and a
 * legend and has no lid to pay for — §2's *a heatmap's two rows are not the
 * line's two rows*, one row further along.
 */
export const FRAME_ROWS = 1;

/**
 * The cells the frame's **right** edge costs.
 *
 * The left edge is already paid for by `AXIS_GUTTER`; the right one is the new
 * column, and it comes out of the plot area rather than out of the labels —
 * T3.3's ladder is *labels, then furniture, then the curve*, and the curve is
 * the only one of the three that can give up a single cell and still be itself.
 */
export const FRAME_RIGHT = 1;

/**
 * The cells an axed plot spends left of the plot area, beside the y-labels: one
 * space and the `│` (C12 §2).
 *
 * **Two, not three.** An earlier version of §2 declared a trailing space as
 * well, and S04 §3 and S11 §2 both drew two — data flush against its own axis.
 * The figures were right: a margin between an axis and its data is a habit from
 * charts that have one, and in a terminal it renders as a leftmost sample
 * floating away from the line it belongs to.
 */
export const AXIS_GUTTER = 2;

/**
 * The plot area's row count, before axes.
 *
 * `height: 0` clamps to 1 (T3.1) rather than erroring: a zero-height plot is a
 * block that measures zero and renders nothing, which C09 I14's floor forbids
 * anyway, so clamping here keeps one answer instead of two.
 */
export function plotAreaRows(plot: PlotGeometry): number {
  return AREA_ROWS[plot.form](plot);
}

/** Declared rows per form. A `Record` for `FURNITURE_ROWS`' reason, below. */
const heightOrOne = (plot: PlotGeometry): number => Math.max(1, Math.floor(plot.height ?? 1));
const AREA_ROWS: Readonly<Record<PlotForm, (plot: PlotGeometry) => number>> = {
  sparkline: () => 1,
  // The declared rows are the sample grid's halves (C12 I84).
  plot3d: heightOrOne,
  waffle: () => 10,
  contour: heightOrOne, quiver: heightOrOne,
  line: heightOrOne,
  heatmap: heightOrOne,
  scatter: heightOrOne, step: heightOrOne, ecdf: heightOrOne,
  bar: heightOrOne, histogram: heightOrOne, boxplot: heightOrOne,
  forest: heightOrOne, dumbbell: heightOrOne,
  lollipop: heightOrOne, dotplot: heightOrOne,
  flame: heightOrOne, icicle: heightOrOne, funnel: heightOrOne,
  gantt: heightOrOne, waterfall: heightOrOne, streamgraph: heightOrOne,
  stackedarea: heightOrOne, treemap: heightOrOne, tree: heightOrOne, graph: heightOrOne, sankey: heightOrOne,
  slope: heightOrOne, bubble: heightOrOne, autocorrelation: heightOrOne, timeline: heightOrOne, bullet: heightOrOne, utilisation: heightOrOne,
  calendar: heightOrOne, correlation: heightOrOne, confusion: heightOrOne,
  spectrogram: heightOrOne, latency: heightOrOne, density2d: heightOrOne,
  density: heightOrOne, violin: heightOrOne, ridgeline: heightOrOne,
  smallmultiples: heightOrOne, pairplot: heightOrOne,
  pie: heightOrOne, radar: heightOrOne,
  horizon: heightOrOne,
};

/**
 * The furniture rows a form spends below its plot area.
 *
 * **A `Record` and not a switch, and that is the ruling rather than a style.**
 * A `Record<PlotForm, …>` is checked in *both* directions — a member with no
 * entry fails to compile, and an entry naming no member fails too. A switch with
 * a default is checked in neither: `form === "sparkline" ? … : …` absorbed a
 * third member in silence at three sites, and what it produced was a heatmap
 * drawn as a curve at exactly the right height. Correctly-shaped and wrong is
 * the class every frame-read this arc has caught.
 *
 * **The heatmap's two rows are not the line's two rows** (§2). The line spends
 * them on an axis rule and x-labels; the matrix has no rule to draw — its cells
 * bound themselves — so the row pays for the scale legend, which is the only
 * thing that says what a cell means.
 */
const axedFurniture = (plot: PlotGeometry): number =>
  plot.axes === true ? AXIS_ROWS + FRAME_ROWS : 0;
const FURNITURE_ROWS: Readonly<Record<PlotForm, (plot: PlotGeometry) => number>> = {
  sparkline: () => 0,
  // **No frame, no rule, no x-labels** — `axes` is refused on this form
  // (C04 I76) and its three axis names are billboarded in the scene rather
  // than written under it. A horizontal legend still costs its row, and that
  // is `legendRows`' term, added centrally.
  plot3d: () => 0,
  waffle: () => 0,
  line: axedFurniture,
  heatmap: () => AXIS_ROWS,
  scatter: axedFurniture, step: axedFurniture, ecdf: axedFurniture,
  bar: axedFurniture, histogram: axedFurniture, boxplot: axedFurniture,
  forest: axedFurniture, dumbbell: axedFurniture,
  lollipop: axedFurniture, dotplot: axedFurniture,
  flame: axedFurniture, icicle: axedFurniture, funnel: axedFurniture,
  gantt: axedFurniture, waterfall: axedFurniture, streamgraph: axedFurniture,
  stackedarea: axedFurniture, treemap: () => 0, tree: () => 0, graph: () => 0, sankey: () => 0,
  slope: axedFurniture, bubble: axedFurniture, autocorrelation: axedFurniture,
  timeline: axedFurniture, bullet: axedFurniture, utilisation: () => AXIS_ROWS,
  calendar: () => AXIS_ROWS, correlation: () => AXIS_ROWS, confusion: () => AXIS_ROWS,
  // No lid, and the row pays for the legend — which here names the levels as
  // well as the range, because a level cannot be written on its own line (I49).
  contour: () => AXIS_ROWS, quiver: () => AXIS_ROWS,
  spectrogram: () => AXIS_ROWS, latency: () => AXIS_ROWS, density2d: () => AXIS_ROWS,
  density: axedFurniture, violin: axedFurniture, ridgeline: axedFurniture,
  // **These five compose their own rows and draw no cartesian furniture** (§2's
  // height table). `pie` always said so; the other four declared a lid, an axis
  // rule and an x-label row, and drew none of them — 18 combinations across the
  // catalogue where the measured height and the rendered height disagreed, by up
  // to six rows. A radar has no cartesian axes to label and a facet grid's
  // furniture belongs to its facets, so the declaration was the wrong half.
  smallmultiples: () => 0, pairplot: () => 0,
  pie: () => 0, radar: () => 0,
  // **The one row a horizon spends, and it buys the thing the form is for**
  // (I52, §3z H7). Band depth is an ordinal index into a colour, so the scale
  // beside it is the reading rather than furniture — the matrix's argument
  // (I19) on the only other form whose channel has to be learnt. It was `0`
  // for as long as the colour axis was missing, which is consistent and was
  // consistent about the wrong thing.
  // **One row, and `AXIS_ROWS` was the wrong constant.** A matrix spends two —
  // an x-label row *and* the scale legend — and a horizon has no x labels, so
  // reaching for the same name padded a blank row and `refdiff`'s RD1 is what
  // caught it: 18 rows against a declared grid of 16. The number a form spends
  // is the rows it emits, not the rows the form beside it emits.
  horizon: () => 1,
};

/** The block's measured height (I1). A function of the block alone. */
export function plotHeight(plot: PlotGeometry): number {
  // **The legend's row is added here rather than per form**, because every form
  // pays it the same way and a table of thirty-six entries each adding the same
  // term is thirty-six chances to forget one.
  return plotAreaRows(plot) + FURNITURE_ROWS[plot.form](plot) + legendRows(plot) + titleRows(plot);
}

/**
 * The plot area's cell width.
 *
 * With `axes: false` there is no label column and the area is the full width.
 * Floored at 1 so a width narrower than the labels still renders a curve —
 * T3.3's rule is that labels are dropped before the plot area is starved, and
 * the caller decides that by passing `yLabelWidth: 0`.
 */
export function plotAreaWidth(width: number, yLabelWidth: number, axes: boolean): number {
  if (!axes) return Math.max(1, Math.floor(width));
  return Math.max(1, Math.floor(width) - yLabelWidth - AXIS_GUTTER - FRAME_RIGHT);
}

/**
 * A declared height from the region a producer was given (roadmap 38).
 *
 * **The deferral's blocker expired and nothing noticed.** Roadmap 38 blocked
 * `height: "fill"` on *the producer cannot see the height — that is F37*, and
 * `ProducerContext.height` was granted by phase 1: non-null exactly when the
 * document is bound by a region, which is exactly the case the entry named. The
 * condition was written where the deferral is and the thing that met it was
 * written somewhere else, which is that pattern's whole shape.
 *
 * **It does not weaken C12 I1, and that is why it lives here rather than in the
 * type.** The *producer* resolves the number before the block is constructed, so
 * `measure` still sees a declared height and `series` is still structurally
 * unreachable from `plotHeight`. I1 forbids the renderer deriving height from
 * data — not the number being chosen late.
 *
 * `region` is `null` for a transcript entry, which is windowed by rows and bound
 * by nothing; the fallback is the caller's own, because *how tall should this be
 * when nothing says* is a question about the surface and not about plots.
 *
 * `reserve` is what the surface spends around the plot — a title, a metrics row.
 * Floored at 1, because a plot with no rows is not a smaller plot.
 */
export function fillHeight(
  region: number | null,
  fallback: number,
  reserve = 0,
): number {
  if (region === null || !Number.isFinite(region)) return Math.max(1, Math.floor(fallback)); // cells-ok — a row count
  return Math.max(1, Math.floor(region) - Math.max(0, Math.floor(reserve))); // cells-ok — a row count
}
