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
import { clampSpans, pad, padStart, paint, slot, tone, type Span } from "../blocks/paint.js";
import { cells, truncate, type AmbiguousWidth } from "../text.js";
import { xAxis, xTickRow } from "./axes.js";
import type { XAxis } from "./axes.js";
import { HAS_POSITION_AXIS } from "./marks.js";
import { candleColumn, candlesOf } from "./candles.js";
import { AXIS_GUTTER, FRAME_RIGHT } from "./height.js";
import type { Plot } from "../../data/viewmodel/index.js";
import type { ColourRef } from "../theme/index.js";
import { SHARES_CELLS, markOf, refOf } from "./marks.js";
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
/**
 * One series' last reading, at the row its ink ends on (I48).
 *
 * `shared` is *another series ends on this row and lost it* — a single cell
 * rather than a count, because a count needs to know which rows collide, which
 * needs the rasterised ink, which needs the area width, which needs the column
 * this number is being sized for. I8 asks that the loss not be silent; it does
 * not ask how many (§3x).
 */
export type Callout = Readonly<{ text: string; ref: ColourRef; shared: boolean }>;

export type Layout = Readonly<{
  gutter: number;
  labelColumn: number;
  areaWidth: number;
  areaRows: number;
  width: number;
  frame?: boolean;
  /** Which of I26's four shapes the furniture takes. `"box"` when absent. */
  style?: FrameStyle;
  /**
   * The label cells the **right** gutter holds (I47). Absent or 0 is every
   * layout that shipped before it existed: the right edge is the frame's border
   * and nothing else.
   *
   * `labelColumn`'s mirror, and the two are sized from one set of labels — one
   * label, two consumers, so `"both"` cannot draw two axes that disagree. The
   * edge glyph is the frame's right border rather than a column beside it,
   * which is what makes the right gutter cost `AXIS_GUTTER + n` exactly as the
   * left one does.
   */
  rightColumn?: number;
  /**
   * What the right gutter writes **instead of** the mirrored label, by area row
   * (I48).
   *
   * **On the layout rather than passed per row**, so no call site can supply a
   * label to one gutter and a callout to neither. `plotRow` takes the row index
   * and looks it up here, which is the same argument that collapsed thirteen
   * row compositions into one.
   */
  callouts?: ReadonlyMap<number, Callout>;
  /**
   * Cells held back for a vertical legend, outside `width`.
   *
   * **The layout records what it reserved, because two places otherwise
   * re-derive it and disagree.** `width` here is already the narrowed row, so a
   * compositor subtracting the legend again takes it twice — which drew the
   * frame's border past where the plot area ended and under the legend. The
   * number is small and the bug it prevents is not.
   */
  reserved?: number;
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
function leftGutterSpans(label: string, layout: Layout, ctx: RenderContext): readonly Span[] {
  if (layout.gutter === 0) return [];
  const g = glyphs(ctx.capabilities);
  const muted = tone("muted", ctx.theme, ctx.capabilities);
  // `"corners"` has no side edges either — the label still sits where it does in
  // every other style, so the column the data starts in never moves with the
  // style. That is what makes these four interchangeable at a glance.
  const bare = (layout.style ?? "box") === "corners";
  // **A tick belongs to the side that draws the label** (I47). This used to
  // read `label === ""`, which was correct and untested: every caller blanked
  // the label when `labelColumn` was 0, so *a label exists* and *this column
  // draws it* were one statement. `yAxis: "right"` separates them, and the old
  // rule drew a stub here pointing out at a column zero cells wide.
  const drawsLabel = label !== "" && layout.labelColumn > 0;
  const edge = bare ? " " : drawsLabel ? g.teeRight : g.vertical;
  return [
    // **A zero-wide column draws nothing, and `padStart` will not say so.** It
    // pads a string up to a width and never cuts one down to it, so a label
    // handed to a column of 0 came out at full length and pushed the row past
    // its own width — the frame's lid sat one column left of every row it was
    // supposed to enclose. `yAxis: "right"` is the first layout that keeps a
    // label it does not draw, which is why the padding had never been asked.
    //
    // **The column, not the label** — and the first form of this line asked
    // `drawsLabel` and cost every *unlabelled* row its four spaces of column,
    // which PC12 caught as a left border sitting in column 1 where its corner
    // was at 4. Padding is a question about the column and the tick is a
    // question about the row: the same conflation, a third time, in the fix
    // for the first two.
    { text: layout.labelColumn === 0 ? "" : padStart(label, layout.labelColumn, ctx.capabilities.ambiguousWidth), style: muted },
    { text: ` ${edge}`, style: muted },
  ];
}

/**
 * The right-hand edge of an area row: the border, and the label beside it (I47).
 *
 * **The mirror is of the left gutter's shape and not of its glyphs**, which is
 * why `bare` is computed here rather than shared with `leftGutterSpans`.
 * `"rule"` has a left rule and a bottom rule and *no right one* — that is what
 * the style is — so mirroring the left edge's glyph would grow the rule this
 * style exists not to have. The *column* is still spent either way, so the plot
 * area is the same width in all four styles.
 */
function rightGutterSpans(
  row: number,
  label: string,
  layout: Layout,
  ctx: RenderContext,
): readonly Span[] {
  const column = layout.rightColumn ?? 0;
  const bare = BARE_RIGHT_EDGE.has(layout.style ?? "box");
  const muted = tone("muted", ctx.theme, ctx.capabilities);
  if (column === 0) {
    if (layout.frame !== true) return [];
    return [{ text: bare ? " " : glyphs(ctx.capabilities).vertical, style: muted }];
  }
  const g = glyphs(ctx.capabilities);
  const amb = ctx.capabilities.ambiguousWidth;
  // **A callout displaces the mirrored label and never the left gutter's**
  // (I48). *This row is 5200* and *your data is here* are both readings, and
  // the second is the more specific — but that argument reaches only the gutter
  // it is written in, so at `"both"` the tick survives on the other side.
  const callout = layout.callouts?.get(row);
  if (callout !== undefined) {
    const text = callout.shared ? `${callout.text}+` : callout.text;
    return [
      { text: `${bare ? " " : g.calloutTee} `, style: muted },
      {
        text: pad(truncate(text, column, ctx.capabilities), column, amb),
        // Bold **and** the mark, in that order of reliance: the mark is what
        // survives the colour floor and the weight is what reads above it.
        style: { ...slot(callout.ref, ctx.theme, ctx.capabilities), bold: true },
      },
    ];
  }
  // `teeLeft` and not `teeRight`: the stub points **out** at the label it joins,
  // which on this side is outward to the right. §3f's own note about termplot
  // drawing `tick_right` on a left border is this rule read from the other end.
  const edge = bare ? " " : label === "" ? g.vertical : g.teeLeft;
  return [
    { text: `${edge} `, style: muted },
    { text: pad(truncate(label, column, ctx.capabilities), column, amb), style: muted },
  ];
}

/** The two frame styles with nothing drawn at the right edge (I26). */
const BARE_RIGHT_EDGE: ReadonlySet<FrameStyle> = new Set<FrameStyle>(["corners", "rule"]);

/**
 * The cells the right gutter costs — its edge, its space and its labels (I47).
 *
 * **`AXIS_GUTTER + n`, the left gutter's own arithmetic mirrored**, because the
 * edge glyph *is* the frame's right border rather than a column beside it.
 * Where there is no right column the cost is `FRAME_RIGHT`, which is the same
 * cell doing the same job under its older name.
 *
 * That leaves the two sides costing differently for one label — `n + 2 + 1` on
 * the left against `2 + 2 + n` on the right — because an unlabelled left gutter
 * still spends the cell that separates a label from its border. Measured at a
 * four-cell label: a left axis keeps its labels from width 11 and a right one
 * from 12. Kept rather than equalised (§3x).
 */
export function rightGutterWidth(rightColumn: number): number {
  return rightColumn > 0 ? AXIS_GUTTER + rightColumn : FRAME_RIGHT;
}

/** Which sides of the plot area carry y labels (I47). */
export function yAxisSides(block: Pick<Plot, "yAxis">): { left: boolean; right: boolean } {
  const y = block.yAxis ?? "left";
  return { left: y === "left" || y === "both", right: y === "right" || y === "both" };
}

/**
 * Whether **either** gutter has room to write a y label (I47).
 *
 * The callers used to ask `layout.labelColumn === 0`, which is the same
 * conflation the tick rule carried: with the labels on the right, that test
 * computes no labels at all — and takes `"grid"`'s horizontal rules with them,
 * since those are drawn on exactly the rows the gutter labels (I26).
 */
export function hasYLabels(layout: Layout): boolean {
  return layout.labelColumn > 0 || (layout.rightColumn ?? 0) > 0;
}

/**
 * One area row: the left gutter, the body, and the right-hand edge.
 *
 * **The three were composed at thirteen call sites and the label reached one of
 * them.** That was fine while the right edge was a border — a `│` needs to know
 * nothing about the row it ends — and it stops being fine the moment the right
 * edge can hold a *reading* (I47). A thirteenth site that mirrored the label and
 * a fourteenth that did not would be the four-gutter defect this file exists
 * about, arriving on the other side of the plot area.
 *
 * So the pairing is structural rather than conventional: a row is given its
 * label once, and which sides draw it is a layout decision. `heatmap.ts` had a
 * byte-identical fourth copy of `line` for its three rows; it goes here too.
 */
export function plotRow(
  row: number,
  label: string,
  body: readonly Span[],
  layout: Layout,
  ctx: RenderContext,
): string {
  return line(
    [...leftGutterSpans(label, layout, ctx), ...body, ...rightGutterSpans(row, label, layout, ctx)],
    layout,
    ctx,
  );
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
  sides: { left: boolean; right: boolean } = { left: true, right: false },
): Layout {
  if (!axed) return { gutter: 0, labelColumn: 0, areaWidth: width, areaRows, width };
  // **The third is a cap on the pair and not one per side** (I47), or two
  // gutters at a third each leave a third for the data.
  const wanted = sides.left && sides.right
    ? Math.floor(width / 6) // cells-ok — a cell width
    : Math.floor(width / 3); // cells-ok — a cell width
  const capped = Math.min(labelColumnWidth(labels, caps.ambiguousWidth), wanted); // cells-ok — a cell width
  const gutter = (sides.left ? capped : 0) + AXIS_GUTTER; // cells-ok — a cell width
  // The right column goes before the frame's border does, so a width that
  // cannot hold both keeps the border — which is the same order `layoutFor`
  // takes and for the same reason: the right labels are the copy.
  const wide = sides.right && width - gutter - rightGutterWidth(capped) >= 1; // cells-ok — a cell width
  const rightColumn = wide ? capped : 0; // cells-ok — a cell width
  const edge = rightGutterWidth(rightColumn); // cells-ok — a cell width
  const frame = width - gutter - edge >= 1; // cells-ok — a cell width
  const areaWidth = Math.max(1, width - gutter - (frame ? edge : 0)); // cells-ok — a cell width
  return {
    gutter,
    labelColumn: gutter - AXIS_GUTTER,
    rightColumn: frame ? rightColumn : 0,
    areaWidth,
    areaRows,
    width,
    frame,
  };
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
/**
 * The four furniture shapes (C12 I26).
 *
 * **All four ship because the references disagree**, which is what makes this a
 * style field rather than a decision taken for the caller: UnicodePlots offers
 * `:solid` and `:corners`, plotext draws a closed box, kitty.r draws gridlines.
 * Each is a glyph choice over the same geometry — the rows and the columns are
 * identical in all four — so the cost is one table rather than four renderers.
 *
 * `"corners"` **suppresses the tick row's ticks** rather than drawing them
 * against an edge that is not there, which is I26's own clause and the one place
 * the styles are not interchangeable.
 */
export type FrameStyle = NonNullable<Plot["plotFrame"]>;

/** One edge's glyphs: the two corners and the run between them. */
type EdgeGlyphs = Readonly<{ left: string; run: string; right: string }>;

function topGlyphs(style: FrameStyle, g: ReturnType<typeof glyphs>): EdgeGlyphs | null {
  switch (style) {
    case "box":
    case "grid":
      return { left: g.topLeft, run: g.horizontal, right: g.topRight };
    case "corners":
      // The corner marks alone — the run is blank, so the shape is stated by
      // four glyphs and the reader's eye closes it.
      return { left: g.topLeft, run: " ", right: g.topRight };
    case "rule":
      // What shipped before `plotFrame` existed: a left rule and a bottom rule,
      // and no lid at all.
      return null;
  }
}

export function frameTop(layout: Layout, ctx: RenderContext): string {
  const g = glyphs(ctx.capabilities);
  const muted = tone("muted", ctx.theme, ctx.capabilities);
  const edge = topGlyphs(layout.style ?? "box", g);
  // **The row is still emitted when the style draws nothing in it**, because
  // `plotHeight` counted it and a style cannot change a block's height — that is
  // C12 I1, and a `"rule"` plot one row shorter than a `"box"` one would move
  // everything below it on a field the caller thought was cosmetic.
  if (edge === null) return "";
  const run = edge.run.repeat(Math.max(0, layout.areaWidth));
  if (layout.gutter === 0) return line([{ text: run, style: muted }], layout, ctx);
  return line(
    [
      { text: " ".repeat(Math.max(0, layout.gutter - 1)) },
      {
        text: edge.left + run + (layout.frame === true ? edge.right : ""),
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
  cursorAt: number | null = null,
): string {
  const g = glyphs(ctx.capabilities);
  const muted = tone("muted", ctx.theme, ctx.capabilities);
  const style = layout.style ?? "box";
  // **`"corners"` draws no ticks**, which is I26's own clause: a tick is a mark
  // *on* an edge, and there is no edge here for it to sit on. Every other style
  // has one.
  const at = style === "corners" ? new Set<number>() : new Set(tickColumns);
  const between = style === "corners" ? " " : g.horizontal;
  // **The cursor wins the cell it shares with a tick** (C12 I37). A tick says
  // *a label is written below this column* and the label is still there; the
  // cursor says *the readout on the next row is about this column*, and it is
  // the only mark on the frame that answers a question the reader just asked.
  const run = Array.from({ length: Math.max(0, layout.areaWidth) }, (_, x) =>
    x === cursorAt ? g.cursorMark : at.has(x) ? g.teeDown : between, // cells-ok — a column index
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

/**
 * The gridline row for `"grid"` — a dashed rule under the data (C12 I26).
 *
 * **Resolved *behind* the data**, which is C12 I23's rule and the reason this
 * returns a row to be merged rather than spans to be appended: a curve must win
 * its cell. A gridline drawn over a series is a series with a hole in it, and at
 * one cell per sample the hole is the sample.
 */
export function gridRow(
  layout: Layout,
  tickColumns: readonly number[],
  ctx: RenderContext,
  labelled = false,
): string {
  if ((layout.style ?? "box") !== "grid") return " ".repeat(Math.max(0, layout.areaWidth));
  const g = glyphs(ctx.capabilities);
  const at = new Set(tickColumns);
  // **Both axes, and a labelled row is the whole horizontal half.** A gridline
  // exists to carry the eye from a mark to a value, so it belongs exactly where
  // there is a value written — which is the rows the gutter labels and the
  // columns the bottom rule ticks. A grid drawn on some other spacing is a
  // texture.
  return Array.from({ length: Math.max(0, layout.areaWidth) }, (_, x) =>
    at.has(x) ? g.dashedVertical : labelled ? g.dashedHorizontal : " ",
  ).join("");
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

/**
 * The domain the samples span (C12 I41, C04 I58).
 *
 * **The index is the fallback and not a special case**, so one path serves a
 * declared domain and an undeclared one: absent `xMin`/`xMax`, a series of `n`
 * samples spans `[0, n − 1]`, which is the abscissa the data actually has and
 * what `ax.plot(y)` labels.
 *
 * `null` where there is nothing to span — no samples, or one, which has no
 * extent and would give a zero-width domain to divide by.
 */
function xDomain(block: Plot): { min: number; max: number } | null {
  const declared = block.xMin !== undefined || block.xMax !== undefined;
  const n = sampleCount(block);
  if (!declared && n < 2) return null; // cells-ok — a sample count
  const min = block.xMin ?? 0;
  const max = block.xMax ?? n - 1; // cells-ok — a sample count
  return max > min ? { min, max } : null;
}

/**
 * How many positions the abscissa has.
 *
 * **A candlestick's are in `ohlc` and its `series` is ordinarily empty** — the
 * shape C12 §3r calls *plain candles*. Reading `series` alone gives zero, and a
 * domain of nothing draws no axis at all: a silent gap under exactly the style
 * whose frame a reader most wants numbered.
 */
function sampleCount(block: Plot): number {
  const bars = candlesOf(block);
  if (bars !== undefined) return bars.length; // cells-ok — a bar count
  return block.series.reduce((most, sr) => Math.max(most, sr.values.length), 0); // cells-ok — a sample count
}

/**
 * The x row a block gets, and which of the two mechanisms writes it.
 *
 * **The caller's captions win** (C12 I41). `xLabels` is three words the caller
 * chose and the numeric axis is inferred from the data; overriding the first
 * with the second is the wrong direction, and both want the same row.
 */
function xRowFor(block: Plot, areaWidth: number, ctx: RenderContext): XAxis {
  if (block.xLabels !== undefined) return xAxis(block.xLabels, areaWidth, ctx.capabilities);
  if (block.axes !== true || !HAS_POSITION_AXIS[block.form]) {
    return xAxis(undefined, areaWidth, ctx.capabilities);
  }
  const domain = xDomain(block);
  if (domain === null) return xAxis(undefined, areaWidth, ctx.capabilities);
  // **The form owns which column a position lands in** (C12 I37, §3d.1). Every
  // other row of that table is a rule meeting a boundary; this one is two
  // correct mappings from the same index, and the frame would have looked right
  // at the width the catalogue happens to use.
  const bars = candlesOf(block);
  const n = sampleCount(block);
  const columnAt = bars === undefined
    ? undefined
    : (t: number): number | null => candleColumn(bars, Math.round(t * Math.max(0, n - 1)), areaWidth); // cells-ok — a bar index
  return xTickRow(domain, areaWidth, block.xFormat, ctx.capabilities, block.xScale, columnAt);
}

export function furnitureFor(
  block: Plot,
  layout: Layout,
  ctx: RenderContext,
  cursorAt: number | null = null,
): Furniture {
  const axis = xRowFor(block, layout.areaWidth, ctx);
  return {
    top: frameTop(layout, ctx),
    bottom: [
      frameBottom(layout, axis.tickColumns, ctx, cursorAt),
      xLabelRowFor(axis.text, layout, ctx),
    ],
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

/** One legend entry: a swatch, and what it names. */
export type LegendEntry = Readonly<{ mark: string; label: string; ref: ColourRef }>;

/**
 * Whether this block gets a legend, and where (C12 §3g, C12 I27).
 *
 * **`"right"` is the default because it is the only placement that can turn
 * itself on.** A vertical legend costs *width*, which is already data-dependent
 * through the gutter, so it may size itself to the longest label and appear
 * where a form needs one. A horizontal legend costs a *declared row*, and C12 I1
 * requires the row count to be known before the data is — so it is a fixed row
 * and only ever appears because the caller named it.
 *
 * Auto-enabled where a legend is **load-bearing**: where more than one thing is
 * drawn into shared cells with no adjacent label, which is exactly
 * `SHARES_CELLS`. A form that names each row in its gutter already tells the
 * reader what it needs, and a legend there is a second copy of the same list.
 */
export function legendPlacement(
  block: Plot,
  caps?: Pick<TerminalCapabilities, "colourDepth">,
): "above" | "below" | "left" | "right" | null {
  if (block.legend === false) return null;
  if (block.legend !== undefined) return block.legend;
  const count = (block.segments?.length ?? 0) || block.series.length; // cells-ok — a series count
  if (!SHARES_CELLS[block.form] || count <= 1) return null; // cells-ok — a series count
  // **Not where the form has already labelled its own rows.** Below the colour
  // floor `positionalForm` stops overlaying and stacks into labelled strips, so
  // an auto-enabled legend there is a second copy of the gutter — and worse than
  // redundant, because the strips are not drawn with `markOf` and the swatch
  // then names a mark that appears nowhere. An explicit `legend:` still draws.
  if (caps !== undefined && caps.colourDepth === 1 && POSITIONAL_STACKS[block.form]) return null;
  return "right";
}

/**
 * Forms that give each series its own labelled strip below the colour floor.
 *
 * `positionalForm`'s 1-bit fallback, listed rather than inferred: *the
 * positional family* is not a set this file can compute, and a form joining it
 * later must say so here or keep a legend it does not need.
 */
const POSITIONAL_STACKS: Readonly<Record<string, boolean>> = Object.freeze({
  line: true, scatter: true, step: true, ecdf: true, density: true,
  streamgraph: true, stackedarea: true, slope: true, bubble: true,
});

/**
 * The entries, in the palette's order so slot *i* is one thing in both channels.
 *
 * **The swatch descends the same ladder as the figure** (C12 I29): `markOf` is
 * uniform where colour separates the categories and a distinct mark where it
 * does not, so a 1-bit legend shows the marks the figure is actually drawn with.
 * Skipping the legend at one bit — which an earlier draft of §3g said to do — is
 * the same error one layer up: it means little where colour leads and it is the
 * *only* thing that means anything where colour does not.
 */
export function legendEntries(block: Plot, ctx: RenderContext): readonly LegendEntry[] {
  const segs = block.segments;
  const source = segs !== undefined && segs.length > 0 // cells-ok — a segment count
    ? segs.map((sg) => sg.label)
    : block.series.map((sr, i) => sr.label ?? `series ${String(i + 1)}`);
  // **Through `refOf`, not by indexing the table** — the legend was a second
  // door to the palette, and the mutation harness proved it: forcing every
  // series to slot one left the legend drawing four distinct colours, so the
  // control survived and the harness reported itself blind. A legend whose
  // swatch is a different colour from the thing it names is the exact defect
  // this function's own comment warns about.
  const g = glyphs(ctx.capabilities);
  // **A candlestick names both directions, and the candles come first**
  // (C12 §6b B4). The overlays are what `source` already holds — a moving
  // average is a series like any other — and the candles are what the block is
  // about, so they lead. Their marks are the body glyphs rather than `markOf`'s
  // ladder: a legend whose swatch is not the glyph it names is this function's
  // own recorded defect, one category along.
  const candles: readonly LegendEntry[] =
    block.plotStyle === "candlestick" && block.ohlc !== undefined
      ? [
          { mark: g.candleHollow, label: "rising", ref: "tone.ok" },
          { mark: g.candleFilled, label: "falling", ref: "tone.error" },
        ]
      : [];
  return [
    ...candles,
    ...source.map((label, i) => ({
      mark: markOf(i, ctx.capabilities),
      label,
      ref: refOf(i),
    })),
  ];
}

/** `swatch label`, measured in cells. */
function entryText(e: LegendEntry): string {
  return `${e.mark} ${e.label}`;
}

/**
 * The width a vertical legend wants, capped at a third of the row.
 *
 * **Capped, because the plot area is what the reader came for.** A twenty-cell
 * legend on a forty-column plot leaves nothing to draw in, and T3.3's ladder
 * already rules that labels are dropped before the area is starved. A third is
 * `categoricalForm`'s existing cap, so the two agree.
 */
export function legendWidth(
  entries: readonly LegendEntry[],
  width: number,
  ctx: RenderContext,
  /**
   * **A left legend needs a blank on *both* sides and a right legend on one.**
   *
   * `legendColumn` writes ` ${entry}` — the leading blank is the gap, and on the
   * right that is the gap from the frame. On the left the gap that matters is
   * the *other* one, between the entry and the y-labels, and there was none: a
   * frame with a `100` tick and an `alpha` series drew `alpha100` as one word.
   * Symmetric in the description and not in the geometry, which is why reading
   * the right placement said nothing about the left.
   */
  placement: "left" | "right" = "right",
): number {
  if (entries.length === 0) return 0; // cells-ok — an entry count
  const ambiguous = ctx.capabilities.ambiguousWidth;
  const longest = entries.reduce((m, e) => Math.max(m, cells(entryText(e), ambiguous)), 0);
  const gaps = placement === "left" ? 2 : 1; // cells-ok — a cell count
  return Math.min(longest + gaps, Math.floor(width / 3)); // cells-ok — a cell count
}

/**
 * A vertical legend's spans for one row, or nothing past its last entry.
 *
 * Truncated rather than wrapped: a legend entry running onto a second line
 * misaligns every entry below it against its own swatch, and the swatch is what
 * the row is for.
 */
export function legendColumn(
  entries: readonly LegendEntry[],
  row: number,
  columnWidth: number,
  ctx: RenderContext,
): readonly Span[] {
  if (columnWidth <= 0) return []; // cells-ok — a cell width
  const e = entries[row];
  if (e === undefined) return [{ text: " ".repeat(columnWidth) }];
  const ambiguous = ctx.capabilities.ambiguousWidth;
  const text = truncate(` ${entryText(e)}`, columnWidth, ctx.capabilities);
  const pad = Math.max(0, columnWidth - cells(text, ambiguous)); // cells-ok — a cell count
  return [
    { text, style: slot(e.ref, ctx.theme, ctx.capabilities) },
    ...(pad > 0 ? [{ text: " ".repeat(pad) }] : []),
  ];
}

/**
 * A horizontal legend — one row, the entries that fit, then a count of the rest.
 *
 * **One row and never two** (C12 I27): a second would make `plotHeight` depend on
 * how many series arrived. The overflow is C12 I8's existing pattern — *the ones
 * that fit, plus a count* — and it is safe because `CATEGORY_LIMIT` refuses a
 * ninth series at construction, so the count is small when it appears at all.
 */
export function legendRow(
  entries: readonly LegendEntry[],
  width: number,
  ctx: RenderContext,
): string {
  if (entries.length === 0) return ""; // cells-ok — an entry count
  const ambiguous = ctx.capabilities.ambiguousWidth;
  const spans: Span[] = [];
  let used = 0; // cells-ok — a cell count
  let shown = 0; // cells-ok — an entry count
  for (const e of entries) {
    const text = `${shown === 0 ? "" : "  "}${entryText(e)}`; // cells-ok — an entry count
    const w = cells(text, ambiguous);
    // Leave room for the notice, or the count itself gets truncated away.
    const reserve = shown < entries.length - 1 ? 6 : 0; // cells-ok — a cell count
    if (used + w + reserve > width) break;
    spans.push({ text, style: slot(e.ref, ctx.theme, ctx.capabilities) });
    used += w;
    shown += 1; // cells-ok — an entry count
  }
  const rest = entries.length - shown; // cells-ok — an entry count
  if (rest > 0) {
    spans.push({ text: ` +${String(rest)}`, style: tone("muted", ctx.theme, ctx.capabilities) });
  }
  return paint(clampSpans(spans, width, ctx.capabilities));
}
