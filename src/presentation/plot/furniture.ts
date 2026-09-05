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
import { legendOf, positionAxisOf, positionDomainOf, valueLabelsOf } from "./figure.js";
import { candleColumn, candlesOf } from "./candles.js";
import { AXIS_GUTTER, FRAME_RIGHT } from "./height.js";
import { FACING_DEFAULT, facingOf } from "./scale.js";
import type { Plot } from "../../data/viewmodel/index.js";
import type { ColourRef, Style } from "../theme/index.js";
import { SHARES_CELLS, markOf } from "./marks.js";
import { seriesHidden } from "./visibility.js";
import { identityOf, legendSlots, type FrameStyle } from "./figure.js";
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
  /**
   * Whether the block this frame encloses holds a block-level focus (C26 §7,
   * C12 §3's element paragraph).
   *
   * **On the layout for `style`'s reason**: the frame's four painters take a
   * layout and not a block, and `reserving` is the one place a layout meets the
   * block and the context — so the flag is set there once rather than threaded
   * through nine call sites. What it changes is a tone on cells the frame draws
   * regardless (`frameTone`); it can change no glyph and no width, which is
   * C11 I17's rule applied to a plot.
   */
  focused?: boolean;
}>;

/**
 * The frame's ink: `accent` under block-level focus, `muted` otherwise (C26 §7).
 *
 * One function for the lid, the two side rules and the bottom rule, so the four
 * cannot disagree about whether the block is focused. At 1-bit the difference is
 * the mono class — bold where the frame was dim — a weight and not a colour (F34).
 */
function frameTone(layout: Layout, ctx: RenderContext): Style {
  return tone(layout.focused === true ? "accent" : "muted", ctx.theme, ctx.capabilities);
}

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
  // **The label is `muted` and the edge is the frame's** (C26 §7): a focus turns
  // the enclosure `accent` and leaves the scale's numbers as they were, so what
  // lights up is the box around the data and not the data's own captions.
  const muted = tone("muted", ctx.theme, ctx.capabilities);
  const edgeTone = frameTone(layout, ctx);
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
    // The blank between label and edge is nobody's: kept out of the edge's span
    // so a focus moves exactly the frame's glyphs and not the cell beside them.
    { text: " ", style: muted },
    { text: edge, style: edgeTone },
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
  const edgeTone = frameTone(layout, ctx);
  if (column === 0) {
    if (layout.frame !== true) return [];
    return [{ text: bare ? " " : glyphs(ctx.capabilities).vertical, style: edgeTone }];
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
      { text: bare ? " " : g.calloutTee, style: edgeTone },
      { text: " ", style: muted },
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
    { text: edge, style: edgeTone },
    { text: " ", style: muted },
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
export function yAxisSides(block: Pick<Plot, "axes" | "form" | "yAxis">): { left: boolean; right: boolean } {
  // **Read back** (C12 I67, §3ak.19): `false` is *no labels, keep the frame*,
  // which `frame` cannot say and `gutter` must not.
  const y = valueLabelsOf(block) ?? false;
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
// **`FrameStyle` lives in `figure.ts` now** (C12 §3ak.1 finding 5). This file
// is what reads a figure back, so the figure importing a shape from here
// while this imports the figure is a cycle inside L1 — A02 §1, MG1 and MG22.
// Re-exported rather than moved out of sight: eleven call sites name it from
// here and none of them is about where a type is declared.
export type { FrameStyle };

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
  const muted = frameTone(layout, ctx);
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
  const muted = frameTone(layout, ctx);
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

/**
 * The crossing axes' reference row for area row `i` (C12 §3ad, I23).
 *
 * **`gridRow`'s sibling, and resolved the same way** — a string of area cells
 * merged *behind* the data, so a curve keeps every cell it occupies. Where the
 * grid and the cross both claim a cell the cross wins, and it needs no rule to
 * do so: it is composed over the grid and it is solid where the grid is dashed
 * (§3ad A2).
 *
 * **Solid because it is furniture and not an annotation.** §3k's argument for
 * `dashedVertical` — *a solid rule through a figure reads as part of it* — is
 * about a claim laid over the data. An axis is the coordinate system the data
 * is drawn in, and the frame's own border is already a solid `│`.
 *
 * `row` and `column` are the area positions, already tested and already `null`
 * where there is nothing to draw. **This function does not decide** — the two
 * conditions live where the range and the domain are (§3ad A15), and a second
 * copy of them here is the divergence F210 is about.
 */
export function crossRow(
  layout: Layout,
  i: number,
  row: number | null,
  column: number | null,
  ctx: RenderContext,
): string {
  const w = Math.max(0, layout.areaWidth);
  if (row === null && column === null) return " ".repeat(w);
  const g = glyphs(ctx.capabilities);
  const on = i === row;
  return Array.from({ length: w }, (_, x) =>
    x === column ? (on ? g.crossing : g.dashedVertical) : on ? g.dashedHorizontal : " ", // cells-ok — a column index
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
export function xRowFor(block: Plot, areaWidth: number, ctx: RenderContext): XAxis {
  // **`FACING_DEFAULT` and no matrix arm, because a matrix never arrives
  // here** — `furnitureFor` is reached from `axed`, and `heatmapFormRows`
  // composes `matrixFurniture` itself. The first version branched on
  // `IS_MATRIX` and a mutation survived it: **a distinction that cannot be
  // violated reads exactly like one that is obeyed**, which is A03 §2's vacuity
  // class arriving in a guard rather than in a sentence.
  const facing = facingOf(block, FACING_DEFAULT);
  if (block.xLabels !== undefined) return xAxis(block.xLabels, areaWidth, ctx.capabilities, facing);
  // **One answer, and `xLabels` is inside it** (C12 I67, §3ak.19). The early
  // return above short-circuits on the same field, so the two clauses were one
  // condition split across four lines; `positionAxisOf` carries both.
  if (!positionAxisOf(block)) {
    return xAxis(undefined, areaWidth, ctx.capabilities);
  }
  // **`positionDomainOf` and not a second copy** (C12 I78, §3ak.44). This held
  // its own `xDomain`, and the seam's arrived beside it — two derivations of the
  // same three block fields, which is the thing the ruling is written against.
  // **The mutation pass is what said so**: `XA1` and `XA2` mutate the shared
  // one, and both survived, because the terminal was still reading its own. A
  // survivor here is not a finding about the test.
  const pos = positionDomainOf(block);
  if (pos === null) return xAxis(undefined, areaWidth, ctx.capabilities);
  const domain = pos.range;
  // **The form owns which column a position lands in** (C12 I37, §3d.1). Every
  // other row of that table is a rule meeting a boundary; this one is two
  // correct mappings from the same index, and the frame would have looked right
  // at the width the catalogue happens to use.
  const bars = candlesOf(block);
  const n = sampleCount(block);
  const columnAt = bars === undefined
    ? undefined
    : (t: number): number | null => candleColumn(bars, Math.round(t * Math.max(0, n - 1)), areaWidth, facing); // cells-ok — a bar index
  return xTickRow(domain, areaWidth, block.xFormat, ctx.capabilities, block.xScale, facing, columnAt);
}

/**
 * The three furniture rows, from an axis the caller already has.
 *
 * **The axis is a parameter and not computed here** (C12 §3ad B2). A crossing
 * axis needs the column the value 0 lands in, which is `xRowFor`'s to know, and
 * it is needed while the *area* is being composed — before this runs. One
 * computation handed to both is the only arrangement in which the vertical rule
 * and the `0` caption cannot end up in different cells, which is F210's lesson
 * on the other axis.
 */
export function furnitureFor(
  layout: Layout,
  axis: XAxis,
  ctx: RenderContext,
  cursorAt: number | null = null,
  title?: string,
): Furniture {
  return {
    top: frameTop(layout, ctx),
    bottom: [
      frameBottom(layout, axis.tickColumns, ctx, cursorAt),
      xLabelRowFor(axis.text, layout, ctx),
      ...(title === undefined ? [] : [xTitleRow(title, layout, ctx)]),
    ],
  };
}

/**
 * The abscissa's name, centred over the plot area (C12 I56, §3ag).
 *
 * **Below the labels and never above them**, because the labels are the scale
 * and a name between a scale and the thing it measures separates the two. It is
 * `tone.muted` for `xLabelRowFor`'s reason — furniture is not a series — and it
 * is centred on the **area** rather than on the row, so it sits over the figure
 * and not over the gutter.
 *
 * Truncated rather than wrapped: a second row would change a declared height
 * (I1), and every other furniture row in this file makes the same choice.
 */
export function xTitleRow(title: string, layout: Layout, ctx: RenderContext): string {
  // **`layout.gutter` is the whole left offset**, which is what `xLabelRowFor`
  // one row above uses. The first draft added `labelColumn + AXIS_GUTTER` on top
  // of it and pushed the title four cells right, off the area's centre and past
  // its right edge into `clampSpans`' ellipsis. **A row-width assertion could
  // not see it** — the row was exactly `width` either way; what separated the
  // two was a title nearly as wide as the area, measured against the frame's own
  // border columns.
  const text = truncate(title, layout.areaWidth, ctx.capabilities);
  const w = cells(text, ctx.capabilities.ambiguousWidth);
  const lead = Math.max(0, Math.floor((layout.areaWidth - w) / 2)); // cells-ok — a cell count
  return line(
    [
      { text: " ".repeat(layout.gutter + lead) },
      { text, style: tone("muted", ctx.theme, ctx.capabilities) },
    ],
    layout,
    ctx,
  );
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
  // **Read back** (C12 I67, §3ak.19). These two lines were the whole of what
  // `Figure.legend` could not express, which is why an arm consuming the old
  // member drew a legend the author had refused (F295).
  const placed = legendOf(block);
  if (placed === null) return null;
  if (placed.placement !== null) return placed.placement;
  // **The name-at-the-line's-end clause is `legendOf`'s now** (C12 I81,
  // §3ak.47). It lived here and not in the crossed resolver, which is how the
  // second arm came to draw a legend this one removes — and once `legendOf`
  // carried it, the copy here was dead: `placed` is `null` before this line is
  // reached. **The mutation pass is what said so**, by removing this clause and
  // catching nothing.
  // **Labelled annotations count, or the field lands in the state its deferral
  // refused** (C04 I52, C12 §3g). The case I52 was written about is *one line,
  // one reference line*: counting series alone answers `null` there, so the
  // member would exist and draw nowhere — which is the member-nothing-draws
  // class the deferral was avoiding, arriving by way of the arm rather than the
  // field. **And it is why `count` is not `series.length`**: two annotations on
  // a one-series plot need the row exactly as two series do.
  const labelled = (block.annotations ?? [])
    .filter((a) => (a as { label?: string }).label !== undefined).length; // cells-ok — an annotation count
  // **`identityOf` rather than a second copy of its rule** (C12 I89). This read
  // `(segments?.length ?? 0) || series.length`, which is that function's body
  // spelled again — behaviour-identical on every form that has only those two
  // carriers, and **one form short** the day a third arrived. A 3D scatter's
  // identities are its clouds and only under `colourBy: "series"`, so the
  // legend's presence and its contents now fall out of one rule and cannot
  // disagree, which is I81's mechanism avoided rather than repaired.
  const count = identityOf(block).length; // cells-ok — a series count
  // **A labelled annotation earns the row on any form that draws annotations**,
  // and it does not join `count`. `SHARES_CELLS` partitions forms by whether
  // *categories* share cells; an annotation's label is not a category, so
  // folding it into the count would give it the row on a line plot and refuse it
  // on a bar chart for a reason that is about neither.
  //
  // **This was both, and the mutation pass is what said so.** Two clauses each
  // sufficient for the one-series case mask each other perfectly: removing
  // either killed nothing, and the survivor pair was the only signal that a
  // second mechanism existed at all.
  if (labelled > 0) return "right";
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
export function legendEntries(block: Plot, ctx: Pick<RenderContext, "capabilities" | "seriesVisibility">): readonly LegendEntry[] {
  const g = glyphs(ctx.capabilities);
  // **One table, keyed by the role the shared layer named** (C12 I62, §3ak.7 C8).
  //
  // The composition — which entries, in what order, from which of the three
  // sources — is `legendSlots`', and both arms read it. What is left here is the
  // part that cannot cross the seam: **the swatch descends the capability ladder
  // with the figure** (I29), so `markOf` is uniform where colour separates the
  // categories and a distinct mark where it does not, and the SVG arm has no
  // ladder to descend.
  //
  // **The two things this file used to decide twice are now decided once.**
  // `refOf` was called here *and* by the renderer, which the mutation harness
  // caught: forcing every series to slot one left the legend drawing four
  // distinct colours, so the control survived and the harness reported itself
  // blind. The slot now arrives on the entry.
  //
  // A candlestick's swatches are the body glyphs and an annotation's is the dash
  // it is actually drawn with, at every depth (C04 I23) — a swatch naming a glyph
  // that appears nowhere is this function's own recorded defect, and it is why
  // these are roles rather than a fall-through to `markOf`.
  // **A hidden entry keeps its label and its slot and takes `hollow`** (C12
  // I116, §3aq): an outline for a curve with no ink. A mark and not a tone,
  // because colour is never the only channel (I6) and one bit is where the
  // toggle must still read — the swatch is exactly the column that survives.
  return legendSlots(block).map((slot) => ({
    mark:
      (slot.role === "series" && seriesHidden(block, slot.seriesIndex ?? 0, ctx)) || slot.hidden === true
        ? g.hollow
      : slot.role === "rising" ? g.candleHollow
      : slot.role === "falling" ? g.candleFilled
      : slot.role === "annotation" ? g.dashedHorizontal
      : markOf(slot.seriesIndex ?? 0, ctx.capabilities),
    label: slot.label,
    ref: slot.ref,
  }));
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
  ctx: Pick<RenderContext, "capabilities">,
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
