/**
 * The gutter, the frame and the x-axis — one compositor (C12 §3f, I24).
 *
 * **Four gutters is what this file replaces.** `definition.ts` had one,
 * `heatmap.ts` a near-identical copy, and `categoricalForm` and `bandedForm`
 * each an inline label-width loop. Every one of them was reasonable when it was
 * written: a form's author found the existing one did not quite fit and wrote
 * theirs, which is how the duplication arrived and how it would return.
 *
 * **The defect it produced is not aesthetic.** `labelWidth` and `padStart` both
 * default their measurement to `ambiguousWidth: "narrow"`, and only two of the
 * four copies passed the real capability. So on a terminal reporting `"wide"` a
 * label carrying an ambiguous-width character — the em dash `formatValue`
 * returns for a non-finite value is the reachable one — measured one cell and
 * drew two, and that row's `│` sat a column right of every other row's. The
 * axis was not straight, and the cause was that four things measured and two
 * were told what they were measuring against.
 *
 * Every function here therefore takes the capability rather than defaulting it,
 * which is the whole of the fix; the deduplication is what makes it stay fixed.
 *
 * ## The frame
 *
 * termplot's scheme, which is where the shape comes from: a closed border round
 * the plot area, the y-labels outside it right-aligned, and a tick on the
 * border at each labelled row. Its `character_map.rb` declares `tick_left` and
 * `tick_right` and **draws only `tick_right`** — on the histogram's *left*
 * border, where the stub points out at the label rather than in at the data.
 * That is copied rather than corrected: the stub is what joins a label to its
 * axis, and pointing it inward puts a mark in the plot area that reads as a
 * sample.
 */
import { glyphs } from "../blocks/glyphs.js";
import { clampSpans, pad, padStart, paint, tone, type Span } from "../blocks/paint.js";
import { cells, truncate, type AmbiguousWidth } from "../text.js";
import { xAxis } from "./axes.js";
import { AXIS_GUTTER, FRAME_RIGHT } from "./height.js";
import type { Plot } from "../../data/viewmodel/index.js";
import type { RenderContext } from "../blocks/types.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";

/**
 * One plot's geometry, in cells.
 *
 * **One number carries the left margin**: `gutter`, the cells reserved before
 * the plot area. It is `labelColumn + AXIS_GUTTER` when there is room and **0**
 * when there is not, and collapsing both the labels and the `│` into one width
 * is what makes T3.3 expressible — the labels go first, then the axis
 * furniture, and the curve is the last thing to lose room.
 *
 * `frame` is the **right** border, and it is optional because most of the
 * layouts in this component are the degenerate one: a form with no axes builds
 * `{ gutter: 0, … }` and wants no border on either side. The left border is
 * already inside `gutter`, so this flag governs the one column that is new.
 */
export type Layout = Readonly<{
  gutter: number;
  labelColumn: number;
  areaWidth: number;
  areaRows: number;
  width: number;
  frame?: boolean;
}>;

/**
 * One row of spans, clamped and painted.
 *
 * **Every row a plot emits goes through here**, which is I10 made mechanical
 * rather than checked. A row one cell over its width is a row the terminal
 * wraps itself, adding a line no measurer counted — `paint.ts` records the
 * argument for every single-row kind, and a plot is where it bites hardest: an
 * unclamped plot of declared height 5 rendered nineteen rows at width 1.
 */
export function line(spans: readonly Span[], layout: Layout, ctx: RenderContext): string {
  return paint(clampSpans(spans, layout.width, ctx.capabilities));
}

/**
 * The gutter: a right-aligned label, a space, and the border it sits against.
 *
 * Empty when `gutter` is 0, which is both the `axes: false` case and the
 * too-narrow one. One branch for two reasons is right here — the plot area is
 * the full width in both, and nothing downstream needs to know which.
 *
 * **A labelled row carries a tick and an unlabelled one does not**, which is
 * one rule rather than a flag at every call site. It is also termplot's
 * histogram exactly: a tick per bin row, drawn beside the value that names it.
 * The rule falls out right everywhere it is reached — three ticks on a curve's
 * scale, one per row on a categorical axis, one per band on a violin, and none
 * at all where the width left no room for labels and `labelColumn` is 0.
 */
export function gutterSpans(label: string, layout: Layout, ctx: RenderContext): readonly Span[] {
  if (layout.gutter === 0) return [];
  const g = glyphs(ctx.capabilities);
  const muted = tone("muted", ctx.theme, ctx.capabilities);
  const edge = label === "" ? g.vertical : g.teeRight;
  return [
    { text: padStart(label, layout.labelColumn, ctx.capabilities.ambiguousWidth), style: muted },
    { text: ` ${edge}`, style: muted },
  ];
}

/** The frame's right edge, on an area row. Nothing when the layout has none. */
export function rightBorder(layout: Layout, ctx: RenderContext): readonly Span[] {
  if (layout.frame !== true) return [];
  return [{ text: glyphs(ctx.capabilities).vertical, style: tone("muted", ctx.theme, ctx.capabilities) }];
}

/**
 * Area content padded to exactly `areaWidth`, so the right border lands on the
 * width and not wherever the content happened to stop.
 *
 * A rasteriser returns a full row; a `barRow` or a legend does not, and a
 * border a cell short of the edge is the kind of wrong that reads as a rounding
 * error rather than as a bug.
 */
export function areaText(text: string, layout: Layout, ctx: RenderContext): string {
  const fitted = truncate(text, layout.areaWidth, ctx.capabilities);
  return layout.frame === true
    ? pad(fitted, layout.areaWidth, ctx.capabilities.ambiguousWidth)
    : fitted;
}

/** The widest of a set of labels — the label column's width. */
export function labelColumnWidth(labels: Iterable<string>, ambiguous: AmbiguousWidth): number {
  let widest = 0;
  for (const label of labels) widest = Math.max(widest, cells(label, ambiguous));
  return widest;
}

/**
 * The layout a **row-labelled** form gets: one label per row, capped at a third
 * of the width (§3f).
 *
 * `categoricalForm` and `bandedForm` computed this inline and identically, and
 * both are correct about the capability — the copy that was not is the
 * positional one. It is here so there is one of them rather than because either
 * was wrong.
 */
export function bandLayout(
  labels: Iterable<string>,
  width: number,
  axed: boolean,
  areaRows: number,
  caps: Pick<TerminalCapabilities, "ambiguousWidth">,
): Layout {
  if (!axed) return { gutter: 0, labelColumn: 0, areaWidth: width, areaRows, width };
  const gutter = Math.min(labelColumnWidth(labels, caps.ambiguousWidth), Math.floor(width / 3)) + AXIS_GUTTER;
  const frame = width - gutter - FRAME_RIGHT >= 1;
  const areaWidth = Math.max(1, width - gutter - (frame ? FRAME_RIGHT : 0));
  return { gutter, labelColumn: gutter - AXIS_GUTTER, areaWidth, areaRows, width, frame };
}

/**
 * The frame's top edge — the row `FRAME_ROWS` declares.
 *
 * With no gutter there are no side borders to corner, and the lid is a plain
 * rule across the width. That case is reachable at width 5 and below, where
 * `layoutFor`'s last rung gives the whole width to the plot area: the row is
 * still emitted, because `plotHeight` counted it and a width cannot change a
 * declared height (I1).
 */
export function frameTop(layout: Layout, ctx: RenderContext): string {
  const g = glyphs(ctx.capabilities);
  const muted = tone("muted", ctx.theme, ctx.capabilities);
  const run = g.horizontal.repeat(Math.max(0, layout.areaWidth));
  if (layout.gutter === 0) return line([{ text: run, style: muted }], layout, ctx);
  return line(
    [
      { text: " ".repeat(Math.max(0, layout.gutter - 1)) },
      {
        text: g.topLeft + run + (layout.frame === true ? g.topRight : ""),
        style: muted,
      },
    ],
    layout,
    ctx,
  );
}

/**
 * The frame's bottom edge, with a tick under each x-label's anchor.
 *
 * The corner sits under the `│`, so the rule starts one cell left of the plot
 * area. `tickColumns` are plot-area columns — `Axis.ticks` are *values*, and
 * the two would have shared a name in a component that converts between them
 * all day. They are what `xAxis` returns and what the label row is composed
 * against, so the mark and the caption come from one placement and a label that
 * could not keep its gap takes its tick with it.
 */
export function frameBottom(
  layout: Layout,
  tickColumns: readonly number[],
  ctx: RenderContext,
): string {
  const g = glyphs(ctx.capabilities);
  const muted = tone("muted", ctx.theme, ctx.capabilities);
  const at = new Set(tickColumns);
  const run = Array.from({ length: Math.max(0, layout.areaWidth) }, (_, x) =>
    at.has(x) ? g.teeDown : g.horizontal,
  ).join("");
  if (layout.gutter === 0) return line([{ text: run, style: muted }], layout, ctx);
  return line(
    [
      { text: " ".repeat(Math.max(0, layout.gutter - 1)) },
      {
        text: g.bottomLeft + run + (layout.frame === true ? g.bottomRight : ""),
        style: muted,
      },
    ],
    layout,
    ctx,
  );
}

/** The x-labels, offset to the plot area. Empty when the block declares none. */
export function xLabelRowFor(
  labels: string,
  layout: Layout,
  ctx: RenderContext,
): string {
  if (labels === "") return "";
  return line(
    [
      { text: " ".repeat(layout.gutter) },
      { text: labels, style: tone("muted", ctx.theme, ctx.capabilities) },
    ],
    layout,
    ctx,
  );
}

/**
 * The three furniture rows an axed plot spends: the lid, the rule and the
 * x-labels — in that order, with the lid returned separately because it goes
 * above the area rather than below it.
 */
export type Furniture = Readonly<{ top: string; bottom: readonly string[] }>;

export function furnitureFor(block: Plot, layout: Layout, ctx: RenderContext): Furniture {
  const axis = xAxis(block.xLabels, layout.areaWidth, ctx.capabilities);
  return {
    top: frameTop(layout, ctx),
    bottom: [frameBottom(layout, axis.tickColumns, ctx), xLabelRowFor(axis.text, layout, ctx)],
  };
}

/**
 * The composed block: the lid, the area, and whatever goes beneath it.
 *
 * **It reconciles its own row count against `plotHeight`** (I24). That equality
 * was a convention four call sites each had to honour, and a form that added a
 * row to its furniture and forgot the declaration produced a block that
 * measures one thing and draws another — which C09 I1 catches only where a test
 * renders that form at that flag. Padding rather than throwing, because I2 says
 * no series input throws and the caller is a renderer: a short block is filled
 * with blank rows and a long one is cut, so the declared height is what ships
 * whatever a form does.
 */
export function composeRows(
  declared: number,
  top: readonly string[],
  area: readonly string[],
  bottom: readonly string[],
): readonly string[] {
  const out = [...top, ...area, ...bottom];
  while (out.length < declared) out.push(""); // cells-ok — a row count
  return out.length > declared ? out.slice(0, declared) : out; // cells-ok — a row count
}
