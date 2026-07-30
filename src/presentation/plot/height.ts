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
import type { Plot } from "../../data/viewmodel/index.js";

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
  if (plot.form === "sparkline") return 1;
  return Math.max(1, Math.floor(plot.height ?? 1));
}

/** The block's measured height (I1). A function of the block alone. */
export function plotHeight(plot: PlotGeometry): number {
  if (plot.form === "sparkline") return 1;
  return plotAreaRows(plot) + (plot.axes === true ? AXIS_ROWS : 0);
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
