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
import { xAxis } from "./axes.js";
import { AXIS_GUTTER, FRAME_RIGHT } from "./height.js";
import type { Plot } from "../../data/viewmodel/index.js";
import type { ColourRef } from "../theme/index.js";
import { CATEGORY_REFS, SHARES_CELLS, markOf } from "./marks.js";
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
  return source.map((label, i) => ({
    mark: markOf(i, ctx.capabilities),
    label,
    ref: CATEGORY_REFS[i % CATEGORY_REFS.length] ?? "categorical.c1", // cells-ok — a palette size
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
export function legendWidth(entries: readonly LegendEntry[], width: number, ctx: RenderContext): number {
  if (entries.length === 0) return 0; // cells-ok — an entry count
  const ambiguous = ctx.capabilities.ambiguousWidth;
  const longest = entries.reduce((m, e) => Math.max(m, cells(entryText(e), ambiguous)), 0);
  return Math.min(longest + 1, Math.floor(width / 3)); // cells-ok — a cell count
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
