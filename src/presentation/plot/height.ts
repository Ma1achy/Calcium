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
export type PlotGeometry = Pick<Plot, "form" | "height" | "axes">;

/** The rows an axed plot spends below the plot area: the rule, then x-labels. */
export const AXIS_ROWS = 2;

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
  waffle: () => 10,
  line: heightOrOne,
  heatmap: heightOrOne,
  scatter: heightOrOne, step: heightOrOne, ecdf: heightOrOne,
  bar: heightOrOne, histogram: heightOrOne, boxplot: heightOrOne,
  forest: heightOrOne, dumbbell: heightOrOne,
  lollipop: heightOrOne, dotplot: heightOrOne,
  flame: heightOrOne, icicle: heightOrOne, funnel: heightOrOne,
  gantt: heightOrOne, waterfall: heightOrOne, streamgraph: heightOrOne,
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
const axedFurniture = (plot: PlotGeometry): number => (plot.axes === true ? AXIS_ROWS : 0);
const FURNITURE_ROWS: Readonly<Record<PlotForm, (plot: PlotGeometry) => number>> = {
  sparkline: () => 0,
  waffle: () => 0,
  line: axedFurniture,
  heatmap: () => AXIS_ROWS,
  scatter: axedFurniture, step: axedFurniture, ecdf: axedFurniture,
  bar: axedFurniture, histogram: axedFurniture, boxplot: axedFurniture,
  forest: axedFurniture, dumbbell: axedFurniture,
  lollipop: axedFurniture, dotplot: axedFurniture,
  flame: axedFurniture, icicle: axedFurniture, funnel: axedFurniture,
  gantt: axedFurniture, waterfall: axedFurniture, streamgraph: axedFurniture,
  calendar: () => AXIS_ROWS, correlation: () => AXIS_ROWS, confusion: () => AXIS_ROWS,
  spectrogram: () => AXIS_ROWS, latency: () => AXIS_ROWS, density2d: () => AXIS_ROWS,
  density: axedFurniture, violin: axedFurniture, ridgeline: axedFurniture,
  smallmultiples: axedFurniture, pairplot: axedFurniture,
  pie: () => 0, radar: axedFurniture,
  horizon: axedFurniture,
};

/** The block's measured height (I1). A function of the block alone. */
export function plotHeight(plot: PlotGeometry): number {
  return plotAreaRows(plot) + FURNITURE_ROWS[plot.form](plot);
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
  return Math.max(1, Math.floor(width) - yLabelWidth - AXIS_GUTTER);
}
