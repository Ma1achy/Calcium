/**
 * `plotDefinition` — the pair C09's registry holds, and the one that must agree
 * to the row (C09 I1).
 *
 * **Registered, not privileged** (I12, T2.6). Not in `blocks/defaults.ts`: it
 * reaches the registry through the same public `register` an app-defined kind
 * uses, and deleting that call removes the kind with no fallback path. C11 does
 * the same and C25 will, and three registrants is what makes the extension
 * mechanism real rather than a claim (C09 §3).
 *
 * **`measure` cannot see the series.** It takes the block, reads three fields
 * through `PlotGeometry`, and the height comes back. That is I1 — measured height
 * is a function of the block alone — and `height.ts`'s header records why the
 * guarantee is a type rather than a test.
 *
 * **One number carries the left margin**: `gutter`, the cells reserved before the
 * plot area. It is `yLabelWidth + 2` when there is room and **0** when there is
 * not, and collapsing both the labels and the `│` into one width is what makes
 * T3.3 expressible — the labels go first, then the axis furniture, and the curve
 * is the last thing to lose room. Carrying `(yLabelWidth, axed)` separately meant
 * the gutter survived at width 1 and every curve row rendered as a lone `…`.
 */
import type { AmbiguousWidth } from "../text.js";
import type { ReactElement } from "react";
import { paint, rows, slot, tone, type Span } from "../blocks/paint.js";
import { cells, fitStyled, truncate } from "../text.js";
import { SGR_RESET } from "../../terminal/escapes.js";
import { AXIS_GUTTER, FRAME_RIGHT, plotAreaRows, plotHeight } from "./height.js";
import { curveRows, isBlank } from "./curve.js";
import { gridRow } from "./furniture.js";
import { labelWidth, ticksFor, yLabels, axisFor, xAxis } from "./axes.js";
import {
  areaText,
  bandLayout,
  composeRows,
  frameBottom,
  legendColumn,
  legendEntries,
  legendPlacement,
  legendRow,
  legendWidth,
  frameTop,
  furnitureFor,
  gutterSpans,
  line,
  rightBorder,
  xLabelRowFor,
  type Layout,
} from "./furniture.js";
import { annotationRows } from "./annotate.js";
import { seriesRange, type Range } from "./scale.js";
import { bandRows, stackBands, stackRange } from "./stack.js";
import { markOf, refOf as slotOf } from "./marks.js";
import { strips, tiles } from "./hierarchy.js";
import { sparkline } from "./sparkline.js";
import { bubbleRows, scatterRows, stepRows, ecdfSeries } from "./scatter.js";
import { boxplotBand, boxplotColumn, bulletRow, forestRow, dumbbellRow, lagRow, timelineRow } from "./glyph-row.js";
import { barColumn, barRow, lollipopRow, dotplotRow, binValues, stackedBarRow, funnelRow, ganttRow, waterfallRow, type BandRow } from "./categorical.js";
import { waffleCells } from "./waffle.js";
import { heatmapFormRows } from "./heatmap.js";
import { densitySeries, densityRows, violinColumn, violinRows, ridgelineArea } from "./kde.js";
import { lineDrawRows, type Interpolation } from "./linedraw.js";
import { pieRender, pieAsciiRows, radarRender, radarAsciiRows, type MarkedText } from "./circle.js";
import { horizonRows } from "./horizon.js";
import { smallMultiplesRows } from "./facet.js";
import { stripHeights } from "./strips.js";
import type { Annotation, QuartileSummary, Plot, PlotForm, Series } from "../../data/viewmodel/index.js";
import type { ColourRef } from "../theme/index.js";
import type { BlockDefinition, RenderContext } from "../blocks/types.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";

/**
 * Spans for a row whose cells belong to different series.
 *
 * **Two forms needed this within a week of each other** — a ridgeline's curves
 * overlap by construction, and a stacked bar's segments are adjacent by
 * construction — and in both the row had been given a single colour keyed on
 * something that was not the series. The ridgeline asked
 * `baselines.indexOf(row)`, which is -1 everywhere but a baseline; the stack
 * asked the *category* index, so a two-series stack across four quarters drew
 * four colours naming the quarters. Neither could be fixed by choosing a better
 * per-row colour, because there is no per-row answer.
 */
function ownedSpans(
  text: string,
  owners: readonly number[],
  ref: (index: number) => ColourRef,
  ctx: RenderContext,
): readonly Span[] {
  const chars = [...text];
  const out: Span[] = [];
  const push = (run: string, at: number): void => {
    if (run === "") return;
    out.push(at < 0 ? { text: run } : { text: run, style: slot(ref(at), ctx.theme, ctx.capabilities) }); // cells-ok — a sentinel owner
  };
  let run = "";
  let at = -2; // cells-ok — a sentinel owner
  for (let x = 0; x < chars.length; x += 1) { // cells-ok — one code point per cell in a composed area row
    const o = owners[x] ?? -1; // cells-ok — a sentinel owner
    if (o !== at) {
      push(run, at);
      run = "";
      at = o;
    }
    run += chars[x];
  }
  push(run, at);
  return out;
}

/** Whether anything was measured at all — distinct from whether a range exists. */
function hasSamples(series: readonly Series[]): boolean {
  return series.some((sr) => sr.values.some((v) => v !== null && Number.isFinite(v)));
}

/** The narrowest plot area worth drawing a curve in. Below it, furniture goes. */
const MIN_AREA = 4;



/** A rasterised series and the colour it carries. */
type Layer = Readonly<{ glyphRows: readonly string[]; ref: ColourRef }>;

/**
 * Which colour a series carries (roadmap 51).
 *
 * **The cycle is gone rather than widened**, and that is the change. It read
 * `SERIES_TONES[index % SERIES_TONES.length]` over four *judgement* tones, so a
 * plot of four unrelated quantities said series three was good and series four
 * wanted attention — D29 inverted — and a fifth series repeated the first,
 * which is a segmentation that lies. C04 I50a refuses the ninth series at
 * construction, so there is no index here that the palette cannot answer, and
 * the modulo that used to hide that is not replaced by a wider one.
 *
 * **A declared `tone` still wins**, because naming `error` for a series *is* a
 * judgement and the app is entitled to make it. What the default may not do is
 * make one by accident.
 */
/**
 * A comparison bar's baseline.
 *
 * **Zero, not the data's minimum — and the old behaviour said the smallest
 * category was nothing.** `bar` scaled `(v - dataMin) / (dataMax - dataMin)`,
 * so the smallest value always mapped to `t = 0` and drew an empty run. The
 * shipped fixture is `[10, 25, 15, 30, 20]`: `alpha` at 10 rendered as a bar of
 * length nothing, beside a label reading `10`. Arithmetically consistent, and
 * it says the wrong thing about the data — which is the class every frame-read
 * in this component has caught.
 *
 * Negative data keeps its own floor: a waterfall's `-40` needs a scale that
 * reaches it, and clamping to zero there would put the bar off the axis.
 */
/**
 * The rows a detail mode may spend inside its band (C12 §3i, I28).
 *
 * The mode never *sets* the height — rows-per-band times category count is a
 * height derived from the data, which is what I1 forbids — so it picks how many
 * of the rows the caller already declared to use. An explicit `"full"` that does
 * not fit degrades rather than overflowing its band.
 */
function detailRows(block: Plot, available: number, full: number): number {
  const mode = block.plotDetail ?? "auto";
  if (mode === "compact") return 1;
  return available >= full ? full : available;
}

/**
 * A five-number summary derived from a series, for a violin with no explicit
 * quartiles. A violin *is* a box plot that also shows the distribution, so the
 * box is not optional — the numbers are, and they are computable.
 */
function summaryOf(series: Series): QuartileSummary | undefined {
  const v = series.values.filter((x): x is number => x !== null && Number.isFinite(x));
  if (v.length === 0) return undefined; // cells-ok — a sample count
  const sorted = [...v].sort((a, b) => a - b);
  const at = (f: number): number => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))]!; // cells-ok — a sample count
  return {
    min: sorted[0]!, q1: at(0.25), median: at(0.5), q3: at(0.75),
    max: sorted[sorted.length - 1]!, // cells-ok — a sample count
    mean: v.reduce((a, b) => a + b, 0) / v.length, // cells-ok — a sample count
  };
}

function baselineFor(dataMin: number): number {
  return Math.min(0, dataMin);
}

function refOf(series: Series, index: number): ColourRef {
  if (series.tone !== undefined) return `tone.${series.tone}`;
  return slotOf(index);
}

/**
 * A segment's palette slot, by position.
 *
 * Wrapped rather than inlined because the circle forms name it twice — once for
 * the wedge and once for the legend entry beside it — and a legend whose swatch
 * is a different colour from the thing it names is worse than none.
 */
const categoryRef = (index: number): ColourRef => slotOf(index);

/**
 * `MarkedText` runs to spans: the renderer says which slot owns a run, and this
 * side — the one that holds the theme — turns a slot into a style. `-1` is text
 * with no owner, which is a gap or a count rather than a reading.
 */
function markedSpans(
  pieces: readonly MarkedText[],
  refFor: (index: number) => ColourRef,
  ctx: RenderContext,
): readonly Span[] {
  return pieces.map((piece) =>
    piece.index < 0
      ? { text: piece.text }
      : { text: piece.text, style: slot(refFor(piece.index), ctx.theme, ctx.capabilities) },
  );
}

/**
 * Gridlines under a row of data spans (C12 I26, C12 I23).
 *
 * **Behind, never over.** A gridline drawn on top of a series is a series with a
 * hole in it, and at one cell per sample the hole *is* the sample. So the grid
 * supplies only the cells the data left blank — which is `mergedRow`'s own
 * first-non-blank rule, one layer further down.
 */
function behind(
  grid: string,
  spans: readonly Span[],
  ctx: RenderContext,
): readonly Span[] {
  if (grid.trim() === "") return spans;
  const muted = tone("muted", ctx.theme, ctx.capabilities);
  const out: Span[] = [];
  let x = 0; // cells-ok — a column index
  for (const span of spans) {
    let run = "";
    for (const ch of span.text) {
      // **U+2800 is a blank too**, and it is the one a braille raster emits — a
      // check for `" "` alone found no empty cells in a dot-grid row and the
      // gridlines never appeared, on a style whose whole difference is that they
      // do. The braille blank is a printing character that looks empty, which is
      // the same trap the ink mask in `refdiff` had to be told about.
      const empty = ch === " " || ch === "\u2800";
      run += empty ? (grid[x] ?? " ") : ch; // cells-ok — a column index
      x += 1; // cells-ok — a column index
    }
    // A run that was entirely blank now carries only gridline, so it takes the
    // muted style rather than the layer's colour.
    const wasBlank = span.text.replace(/[ \u2800]/gu, "") === "";
    out.push(wasBlank && run.trim() !== ""
      ? { text: run, style: muted }
      : span.style === undefined ? { text: run } : { text: run, style: span.style });
  }
  return out;
}

/**
 * Layers to one row of spans.
 *
 * Where two series ink the same cell the earlier one keeps it. Overlaying is lossy
 * at cell granularity and there is no version that is not; what matters is that
 * the loss is deterministic and favours the series a reader is looking at, which
 * is the first. At `colourDepth: 1` this path is not taken at all — the plot
 * stacks instead (I6).
 */
function mergedRow(
  layers: readonly Layer[],
  rowIndex: number,
  layout: Layout,
  ctx: RenderContext,
): readonly Span[] {
  const spans: Span[] = [];
  let run = "";
  let runRef: ColourRef | null = null;

  const flush = (): void => {
    if (run === "") return;
    spans.push(
      runRef === null
        ? { text: run }
        : { text: run, style: slot(runRef, ctx.theme, ctx.capabilities) },
    );
    run = "";
  };

  for (let x = 0; x < layout.areaWidth; x += 1) {
    let cell = " ";
    let cellRef: ColourRef | null = null;
    for (const layer of layers) {
      const candidate = [...(layer.glyphRows[rowIndex] ?? "")][x] ?? " ";
      if (isBlank(candidate)) continue;
      cell = candidate;
      cellRef = layer.ref;
      break;
    }
    if (cellRef !== runRef) {
      flush();
      runRef = cellRef;
    }
    run += cell;
  }
  flush();

  return spans;
}

/**
 * The empty state: the declared height, with the message on the middle row.
 *
 * Not a collapse to one row. A plot that changed height when data arrived would
 * shift everything below it mid-stream, and the case where that happens is
 * precisely a `--watch` on a run that has not reported an epoch yet.
 */
function emptyRows(block: Plot, layout: Layout, ctx: RenderContext): readonly string[] {
  const total = plotHeight(block);
  const message = truncate(block.emptyMessage ?? "No data.", layout.width, ctx.capabilities);
  const middle = Math.floor((total - 1) / 2);
  const centred =
    " ".repeat(Math.max(0, Math.floor((layout.width - cells(message, ctx.capabilities.ambiguousWidth)) / 2))) + message;
  const styled = line(
    [{ text: centred, style: tone("muted", ctx.theme, ctx.capabilities) }],
    layout,
    ctx,
  );

  return Array.from({ length: total }, (_, i) => (i === middle ? styled : ""));
}

/**
 * An axed block: the frame's lid, the area rows, the rule and the x-labels.
 *
 * **The row count is reconciled here rather than trusted** (I24). Four call
 * sites used to append their own furniture and each had to agree with
 * `FURNITURE_ROWS` by convention; `composeRows` makes the equality the thing
 * that ships.
 */
function axed(
  block: Plot,
  area: readonly string[],
  layout: Layout,
  ctx: RenderContext,
): readonly string[] {
  const placement = legendPlacement(block, ctx.capabilities);
  const entries = placement === null ? [] : legendEntries(block, ctx);
  // **The vertical legend is composited onto the rows, not appended to them.**
  // It costs width, so the rows were laid out narrower and the column goes in
  // the space that was left — appending would push each row past its own width
  // and `clampSpans` would cut whatever was at the end of it.
  //
  // **Joined as strings, never re-painted** — the facet defect, reproduced here
  // and recognised because it is written down. `line` clamps with `clampSpans`,
  // which measures span text using `cells()`, and `cells()` counts a painted
  // row's escape bytes as visible: the row measured about twice its width, was
  // truncated, and `stripControl` took the ESC and left `[38;2;98;98;98m` on
  // screen as text. Both halves are already at their own width, so concatenation
  // is the whole operation.
  const amb = ctx.capabilities.ambiguousWidth;
  // **From the layout, not recomputed.** `layout.width` is already the narrowed
  // row, so deriving the column here subtracts the legend a second time — which
  // drew the border past the plot area and under the legend.
  const colWidth = layout.reserved ?? 0; // cells-ok — a cell width
  const withColumn = (rows: readonly string[]): readonly string[] =>
    placement !== "left" && placement !== "right"
      ? rows
      : rows.map((r, i) => {
          const col = paint(legendColumn(entries, i, colWidth, ctx));
          const body = fitStyled(r, layout.width, SGR_RESET, amb);
          return placement === "right" ? body + col : col + body;
        });

  // **The frame's own rows shift with a left legend too.** They are not area
  // content, so `withColumn` does not reach them — and the first version left
  // the border drawn at column 0 while every row it was supposed to enclose
  // started eight cells in. A blank column, because the entries are already on
  // the area rows beside them.
  const indent = (r: string): string =>
    placement === "left" && r !== "" ? " ".repeat(colWidth) + r : r; // cells-ok — a cell width

  // **A horizontal legend is indented to the plot area, like the x-labels.**
  // Emitted at column 0 it hangs left of the frame's own left edge, which is
  // the one thing in the frame that does not line up with anything — and it
  // reads as the frame being broken rather than as a placement choice.
  const horizontal = placement === "above" || placement === "below"
    ? [" ".repeat(layout.gutter) + legendRow(entries, layout.areaWidth, ctx)]
    : [];
  const top = block.axes === true ? [indent(furnitureFor(block, layout, ctx).top)] : [];
  const bottom = block.axes === true
    ? furnitureFor(block, layout, ctx).bottom.map(indent)
    : [];
  return composeRows(
    plotHeight(block),
    placement === "above" ? [...horizontal, ...top] : top,
    withColumn(area),
    placement === "below" ? [...bottom, ...horizontal] : bottom,
  );
}

/**
 * The same, with the cursor's readout where the x-labels would be.
 *
 * The readout replaces the label row rather than joining it — both name the
 * abscissa, and the reader asked about one position by putting a cursor on it.
 */
function axedWithCursor(
  block: Plot,
  cursorIdx: number,
  area: readonly string[],
  layout: Layout,
  ctx: RenderContext,
): readonly string[] {
  const furniture = furnitureFor(block, layout, ctx);
  return composeRows(plotHeight(block), [furniture.top], area, [
    furniture.bottom[0] ?? "",
    cursorReadout(block, cursorIdx, layout, ctx),
  ]);
}

function cursorReadout(
  block: Plot,
  cursorIdx: number,
  layout: Layout,
  ctx: RenderContext,
): string {
  const values = block.series.map((s) => {
    const v = s.values[cursorIdx];
    const label = s.label ?? "";
    if (v === null || v === undefined || !Number.isFinite(v)) return `${label}: —`; // cells-ok — label formatting
    return `${label}: ${String(Math.round(v * 100) / 100)}`;
  });
  const readoutText = truncate(values.join("  "), layout.width, ctx.capabilities);
  const muted = tone("muted", ctx.theme, ctx.capabilities);
  return line([{ text: readoutText, style: muted }], layout, ctx);
}

/**
 * The stacked form (I6, I7). One strip per series, sharing the x-axis, with each
 * series' label in the y-label column beside its strip rather than above it — a
 * label on a row of its own would push the total past `height`, which is the trap
 * §5 exists to name.
 */
function stackedRows(
  block: Plot,
  range: Range,
  layout: Layout,
  ctx: RenderContext,
): readonly string[] {
  const series = block.series;
  const heights = stripHeights(layout.areaRows, series.length); // cells-ok — a series count
  const out: string[] = [];

  if (heights === null) {
    // I8: more series than rows. The first series plus a legend naming the rest,
    // still inside `height`, and marked as truncated — a series dropped in silence
    // is the failure this branch exists to avoid.
    const first = series[0];
    const omitted = series.slice(1).map((s, i) => s.label ?? `series ${i + 2}`);
    const legend = truncate(
      `+${omitted.length} more · ${omitted.join(" · ")}`, // cells-ok — a series count
      layout.areaWidth,
      ctx.capabilities,
    );
    const curveHeight = Math.max(1, layout.areaRows - 1);

    if (first !== undefined) {
      const glyphRows = curveRows(first, range, layout.areaWidth, curveHeight, ctx.capabilities);
      const layer: Layer = { glyphRows, ref: refOf(first, 0) };
      for (let i = 0; i < curveHeight; i += 1) {
        out.push(
          line(
            [
              ...gutterSpans(i === 0 ? (first.label ?? "") : "", layout, ctx),
              ...mergedRow([layer], i, layout, ctx),
              ...rightBorder(layout, ctx),
            ],
            layout,
            ctx,
          ),
        );
      }
    }

    out.push(
      line(
        [
          ...gutterSpans("", layout, ctx),
          { text: areaText(legend, layout, ctx), style: tone("warn", ctx.theme, ctx.capabilities) },
          ...rightBorder(layout, ctx),
        ],
        layout,
        ctx,
      ),
    );
    return out;
  }

  series.forEach((s, index) => {
    const stripRows = heights[index] ?? 0;
    const glyphRows = curveRows(s, range, layout.areaWidth, stripRows, ctx.capabilities);
    const layer: Layer = { glyphRows, ref: refOf(s, index) };
    for (let i = 0; i < stripRows; i += 1) {
      out.push(
        line(
          [
            ...gutterSpans(i === 0 ? (s.label ?? "") : "", layout, ctx),
            ...mergedRow([layer], i, layout, ctx),
            ...rightBorder(layout, ctx),
          ],
          layout,
          ctx,
        ),
      );
    }
  });

  return out;
}

/** The overlaid form: every series in one grid, distinguished by tone. */
type Rasteriser = (
  series: Series,
  range: Range,
  areaWidth: number,
  areaRows: number,
  caps: Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">,
) => readonly string[];

function styleRasteriser(
  block: Plot,
  caps: Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">,
  base: Rasteriser,
  interpolation: Interpolation = "linear",
): Rasteriser {
  const ps = block.plotStyle ?? "auto";
  if (ps === "braille") return base;
  const useLineDraw = ps === "line" || (ps === "auto" && caps.ambiguousWidth !== "wide");
  if (!useLineDraw) return base;
  const corners = block.plotCorners ?? "rounded";
  // **The interpolation is passed, not inferred from the base rasteriser.**
  // Swapping the whole rasteriser is what lost the step's shape: `stepRows`
  // carried the hold-then-jump and the replacement knew only how to slope, so
  // `step` and `line` drew the same frame. The form owns the rule, so the form
  // names it here.
  return (series, range, areaWidth, areaRows, _caps) =>
    lineDrawRows(series, range, areaWidth, areaRows, corners, interpolation);
}

function overlaidRows(
  block: Plot,
  range: Range,
  layout: Layout,
  ctx: RenderContext,
  rasterise: Rasteriser = curveRows,
): readonly string[] {
  // **The scale, and the capability.** Both were dropped here and nowhere else:
  // `yLabels` was called without `yScale`, so a log axis was labelled linearly,
  // and the labels were measured against a default `ambiguousWidth` by
  // `labelWidth` while `gutterSpans` padded against another — the two defects
  // §3f names, in one call.
  const labels =
    layout.labelColumn === 0
      ? []
      : yLabels(range, layout.areaRows, block.yFormat, block, block.yScale);
  const byRow = new Map(labels.map((l) => [l.row, l.text]));
  // `"grid"` draws its lines where there is a value written — the rows the
  // gutter labels and the columns the bottom rule ticks (C12 I26).
  const gridTicks = xAxis(block.xLabels, layout.areaWidth, ctx.capabilities).tickColumns;
  const layers: readonly Layer[] = [
    ...block.series.map((s, index) => ({
      glyphRows: rasterise(s, range, layout.areaWidth, layout.areaRows, ctx.capabilities),
      ref: refOf(s, index),
    })),
    ...(block.annotations ?? []).map((a) => ({
      glyphRows: annotationRows(a, range, layout.areaWidth, layout.areaRows, ctx.capabilities),
      ref: `tone.${a.tone ?? "muted"}` as ColourRef,
    })),
  ];

  return Array.from({ length: layout.areaRows }, (_, i) =>
    line(
      [
        ...gutterSpans(byRow.get(i) ?? "", layout, ctx),
        ...behind(gridRow(layout, gridTicks, ctx, byRow.has(i)), mergedRow(layers, i, layout, ctx), ctx),
        ...rightBorder(layout, ctx),
      ],
      layout,
      ctx,
    ),
  );
}

/**
 * The widest series label — the stacked form's label column (§5).
 *
 * **The capability is a parameter and not a default**, which is the whole of
 * `labelWidth`'s defect one file over: a default that is right on most
 * terminals is a measurement nobody notices is wrong on the rest.
 */
function seriesLabelWidth(series: readonly Series[], ambiguous: AmbiguousWidth): number {
  let widest = 0;
  for (const s of series) widest = Math.max(widest, cells(s.label ?? "", ambiguous));
  return widest;
}

/**
 * The width the plot area may use — the row's, less a vertical legend's column.
 *
 * **Reserved before the rows are laid out, not taken from them afterwards.** A
 * legend composited onto finished rows either pushes them past their own width,
 * where `clampSpans` cuts whatever was at the end, or overwrites the data it is
 * supposed to be explaining. Both look like the legend working until you read a
 * frame whose curve reaches the right edge.
 */
function reservedFor(block: Plot, width: number, ctx: RenderContext): number {
  const placement = legendPlacement(block, ctx.capabilities);
  if (placement !== "left" && placement !== "right") return 0; // cells-ok — a cell width
  return Math.min(width - 1, legendWidth(legendEntries(block, ctx), width, ctx, placement)); // cells-ok — a cell width
}

function usableWidth(block: Plot, width: number, ctx: RenderContext): number {
  return Math.max(1, width - reservedFor(block, width, ctx)); // cells-ok — a cell width
}

/** A layout, with what the legend held back recorded on it. */
function reserving(layout: Layout, block: Plot, width: number, ctx: RenderContext): Layout {
  const reserved = reservedFor(block, width, ctx);
  // The frame's shape rides along, because every layout is built by one of two
  // functions and neither takes the block — threading it here is one place
  // rather than nine.
  const styled = block.plotFrame === undefined ? layout : { ...layout, style: block.plotFrame };
  return reserved === 0 ? styled : { ...styled, reserved }; // cells-ok — a cell width
}

/**
 * The layout, and where T3.3's ordering lives.
 *
 * Three things want the width, and they lose it in this order: the **labels**
 * first, then the **axis furniture**, and the **curve** last. A plot whose label
 * column does not fit is still a plot; a plot with no plot area is a `…`.
 */
function layoutFor(
  block: Plot,
  range: Range,
  width: number,
  stacked: boolean,
  caps: Pick<TerminalCapabilities, "ambiguousWidth">,
): Layout | null {
  const areaRows = plotAreaRows(block);
  const base = { areaRows, width };
  // **A heatmap is always gutter-ed**, whatever `axes` says, because the row
  // labels *are* its ordinate — an unlabelled matrix is a picture of numbers
  // with no way to tell which row is which. `axes: false` is refused rather than
  // honoured (C04 I50b), so this reads the form and not the flag.
  const axed = block.axes === true || block.form === "heatmap";
  if (!axed) return { ...base, gutter: 0, labelColumn: 0, areaWidth: width };

  // **What the column holds depends on the form.** A stacked plot puts series
  // names there instead of the three y-labels (§5), and sizing the column from the
  // y-labels regardless is what pushed `train │` one cell past the width and left a
  // `…` on the first row of every stacked frame. Two different sets of strings, one
  // column: it has to be measured from whichever set will be drawn.
  const wanted = stacked || block.form === "heatmap"
    ? seriesLabelWidth(block.series, caps.ambiguousWidth)
    : labelWidth(
        yLabels(range, areaRows, block.yFormat, block, block.yScale),
        caps.ambiguousWidth,
      );
  // **The frame's right edge is furniture and pays before the curve**, which is
  // the same rung it has always been: labels, then furniture, then the plot
  // area. A cell narrower is a curve; a cell narrower still is a `…`.
  if (width - wanted - AXIS_GUTTER - FRAME_RIGHT >= MIN_AREA) {
    return {
      ...base,
      gutter: wanted + AXIS_GUTTER,
      labelColumn: wanted,
      areaWidth: width - wanted - AXIS_GUTTER - FRAME_RIGHT,
      frame: true,
    };
  }

  // **The heatmap's ladder is the other way up** (I18, §3a). A y-label is a
  // *scale* and a row label is an *identity*: a curve with no numbers beside it
  // is still that curve, and a matrix with no names beside it is a picture of
  // numbers. So the labels shrink rather than going, into whatever is left after
  // the axis furniture and a minimum plot area.
  //
  // The state this replaces was reachable between two ordinary widths, and the
  // comment three lines above already called it unreadable — the code produced
  // it anyway.
  if (block.form === "heatmap") {
    const room = width - AXIS_GUTTER - MIN_AREA;
    // Rung 3 is the caller's: with no cell to spare for a label, `null` says so
    // and `render` draws a notice at the declared height.
    if (room < 1) return null;
    return { ...base, gutter: room + AXIS_GUTTER, labelColumn: room, areaWidth: MIN_AREA };
  }

  if (width - AXIS_GUTTER - FRAME_RIGHT >= MIN_AREA) {
    return {
      ...base,
      gutter: AXIS_GUTTER,
      labelColumn: 0,
      areaWidth: width - AXIS_GUTTER - FRAME_RIGHT,
      frame: true,
    };
  }
  return { ...base, gutter: 0, labelColumn: 0, areaWidth: width };
}

/**
 * The height (I1). `PlotGeometry` is what this reads, so the series is not in
 * scope — see `height.ts`.
 */
const measure = (block: Plot): number => plotHeight(block);

/**
 * Form → rows. **A `Record` and not a switch**, for `height.ts`' reason: a
 * `Record<PlotForm, …>` is checked in both directions, and `form === "sparkline"
 * ? … : …` absorbed a third member in silence — a heatmap drawn as a curve, at
 * exactly the right height.
 */
function categoricalForm(
  block: Plot,
  width: number,
  ctx: RenderContext,
  rowBuilder: (label: string, areaWidth: number, categoryIndex: number) => string | BandRow,
  /**
   * The row's colour, where it is not the category's.
   *
   * **A grouped bar is the case that broke the default.** One row per
   * (category, series) pair means row 3 is *B · before*, and slot 3 named the
   * row rather than `before` — so group A drew the legend's two colours and
   * group B drew two others. The default stays: a plain bar is one series
   * across N categories and the category *is* what a colour can name.
   */
  refFor?: (rowIndex: number) => ColourRef,
): readonly string[] {
  const cats = block.categories ?? [];
  const areaRows = plotAreaRows(block);
  const labels = cats.slice(0, areaRows);
  const axedBlock = block.axes === true;
  const layout = reserving(bandLayout(labels, usableWidth(block, width, ctx), axedBlock, areaRows, ctx.capabilities), block, width, ctx);

  const out: string[] = [];
  for (let i = 0; i < areaRows; i++) {
    const cat = labels[i] ?? "";
    const label = i < labels.length ? truncate(cat, layout.labelColumn, ctx.capabilities) : ""; // cells-ok — a label count
    const built = i < labels.length ? rowBuilder(cat, layout.areaWidth, i) : ""; // cells-ok — a label count
    const content = typeof built === "string" ? built : built.text;
    const gutter = gutterSpans(label, layout, ctx);
    const s = block.series[i] ?? block.series[0];
    const ref = s?.tone !== undefined ? `tone.${s.tone}` as ColourRef : (refFor?.(i) ?? slotOf(i)); // cells-ok — a category index
    const body: readonly Span[] = typeof built === "string"
      ? [{ text: areaText(content, layout, ctx), style: slot(ref, ctx.theme, ctx.capabilities) }]
      : ownedSpans(areaText(content, layout, ctx), built.owners, (k) => refOf(block.series[k] ?? { values: [] }, k), ctx);
    out.push(
      line(
        [...gutter, ...body, ...rightBorder(layout, ctx)],
        layout,
        ctx,
      ),
    );
  }
  return axed(block, out, layout, ctx);
}

/**
 * A categorical form drawn **down the columns** — `categoricalForm` transposed.
 *
 * **A separate function rather than a flag, because almost nothing is shared.**
 * `categoricalForm` is row-major to its bones: it walks `areaRows`, takes one
 * category per row, and writes the name in the gutter. Transposing it means the
 * gutter holds the *value* scale, the names move under the columns, and the
 * builder returns a column of rows instead of a row of cells. A flag threaded
 * through that is two renderers sharing a name.
 *
 * What *is* shared is the layout: a vertical bar chart has a value axis on the
 * left exactly as a line chart does, so it takes `layoutFor` rather than
 * `bandLayout` and the y-labels come out right without a second implementation.
 *
 * `block.categories` becomes `xLabels`' job — the names run along the bottom,
 * which is C12 §3j's whole argument for the orientation existing: an ordered
 * category axis reads left-to-right and a horizontal bar chart runs it downwards.
 */
function categoricalColumnForm(
  block: Plot,
  width: number,
  ctx: RenderContext,
  columnBuilder: (categoryIndex: number, colWidth: number, rows: number, min: number, max: number) => readonly string[],
): readonly string[] {
  const cats = block.categories ?? [];
  const n = cats.length; // cells-ok — a category count
  const areaRows = plotAreaRows(block);
  const fallback: Layout = { gutter: 0, labelColumn: 0, areaWidth: width, areaRows, width };
  if (n === 0) return emptyRows(block, fallback, ctx);

  const data = seriesRange(block.series, block);
  if (data === null) return emptyRows(block, fallback, ctx);
  // A bar's baseline is zero unless the data goes below it — the same rule
  // `barRow` takes, and the reason `[10, 25, 15]` used to draw nothing at 10.
  const zeroed = { min: baselineFor(data.min), max: data.max };
  const range = axisFor(zeroed, ticksFor(areaRows), block, block.yScale).range;
  const layout = reserving(layoutFor(block, range, usableWidth(block, width, ctx), false, ctx.capabilities) ?? fallback, block, width, ctx);

  // Columns divide the area, remainder distributed left to right — the same
  // arithmetic `facetWidths` uses, and for the same reason: `floor(w / n)` times
  // n leaves a ragged edge at every width the count does not divide.
  const base = Math.max(1, Math.floor(layout.areaWidth / n)); // cells-ok — a column width
  const extra = layout.areaWidth - base * n; // cells-ok — a column width
  const widths = Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0)); // cells-ok — a column width

  const columns = widths.map((cw, i) => columnBuilder(i, cw, areaRows, range.min, range.max));

  // The value scale in the gutter, placed exactly as `overlaidRows` places it —
  // one implementation of *which row carries which label*, and the scale and the
  // capability both passed, which is the pair §3f names.
  const byRow = new Map(
    (layout.labelColumn === 0
      ? []
      : yLabels(range, layout.areaRows, block.yFormat, block, block.yScale)
    ).map((l) => [l.row, l.text]),
  );

  const out: string[] = [];
  for (let r = 0; r < areaRows; r += 1) {
    const spans: Span[] = [...gutterSpans(byRow.get(r) ?? "", layout, ctx)];
    for (const [i, col] of columns.entries()) {
      const ref = slotOf(i); // cells-ok — a category index
      spans.push({ text: col[r] ?? " ".repeat(widths[i]!), style: slot(ref, ctx.theme, ctx.capabilities) });
    }
    spans.push(...rightBorder(layout, ctx));
    out.push(line(spans, layout, ctx));
  }
  if (block.axes !== true) return composeRows(plotHeight(block), [], out, []);
  // The frame composed here rather than through `axed`, because `furnitureFor`
  // derives its label row from `block.xLabels` and this form's labels are one
  // per column — a shape that tuple cannot hold.
  const { row, ticks } = columnLabels(cats, widths, ctx.capabilities);
  return composeRows(
    plotHeight(block),
    [frameTop(layout, ctx)],
    out,
    [frameBottom(layout, ticks, ctx), xLabelRowFor(row, layout, ctx)],
  );
}

/**
 * The category names under their columns, and the ones that would collide dropped.
 *
 * **`xLabels` is the wrong shape and cannot be made right.** It is a fixed
 * three-tuple for a left/centre/right caption, so handing it one name per column
 * centres the whole composed string and truncates it — the first frame drew
 * `mon        tue      …` for seven categories. So this composes the row and
 * `categoricalColumnForm` hands it to `xLabelRowFor` directly.
 *
 * **Dropped rather than truncated, which is the part that matters.** A histogram
 * at nine cells per column cannot hold `[18.3, 23.1)`, and slicing it produced
 * `[18.3, 23[23.1, 28[28.0,` — three labels running together, each naming a bin
 * it does not describe. A label that cannot be read whole is worse than absent,
 * because absent is honest. Walking left to right and keeping a name only where
 * it fits *and* clears the last one is what every plotting library does with a
 * crowded axis, and it degrades to the two ends rather than to mush.
 *
 * Returns the row and the columns that got a tick, so the rule beneath is marked
 * where a name actually is.
 */
function columnLabels(
  cats: readonly string[],
  widths: readonly number[],
  caps: RenderContext["capabilities"],
): { readonly row: string; readonly ticks: readonly number[] } {
  const ambiguous = caps.ambiguousWidth;
  let row = "";
  const ticks: number[] = [];
  let x = 0; // cells-ok — a column position
  for (const [i, w] of widths.entries()) {
    const name = cats[i] ?? "";
    const nw = cells(name, ambiguous);
    const centre = x + Math.floor(w / 2); // cells-ok — a column position
    // Fits in its own column, and starts at or after where the row already ends.
    const start = centre - Math.floor(nw / 2); // cells-ok — a column position
    if (nw > 0 && nw <= w && start >= cells(row, ambiguous)) {
      row += " ".repeat(start - cells(row, ambiguous)) + name;
      ticks.push(centre);
    }
    x += w; // cells-ok — a column width
  }
  return { row, ticks };
}

/**
 * The stacking fold, rendered — `stackedarea` from zero and `streamgraph` centred.
 *
 * **The bands are composed as layers and merged**, which is what gives each its
 * own `ColourRef` through `mergedRow`; drawn into one grid they would share a
 * colour and the stack would be one shape. `markOf` supplies the glyph, so at
 * 1-bit the bands differ by mark and above the colour floor they share one and
 * differ by tone — I25 and I29, unchanged, reached the same way every other form
 * reaches them.
 *
 * The axis covers the *stacked* range rather than the series' own: a stream
 * graph's extent is the sum of its bands, and scaling to the tallest single
 * series would draw the stack off the top of its own frame.
 */
function stackedForm(
  block: Plot,
  width: number,
  ctx: RenderContext,
  centred: boolean,
): readonly string[] {
  const areaRows = plotAreaRows(block);
  const fallback: Layout = { gutter: 0, labelColumn: 0, areaWidth: width, areaRows, width };
  if (block.series.length === 0) return emptyRows(block, fallback, ctx); // cells-ok — a series count

  // A first pass at the full width to size the gutter, then the real one at the
  // area width the gutter leaves. Two passes because the range decides the
  // label column and the label column decides the width the bands are cut to.
  const rough = stackRange(stackBands(block.series, Math.max(1, width), centred));
  const range = axisFor(rough, ticksFor(areaRows), block, block.yScale).range;
  const layout = reserving(layoutFor(block, range, usableWidth(block, width, ctx), false, ctx.capabilities) ?? fallback, block, width, ctx);

  const bands = stackBands(block.series, layout.areaWidth, centred);
  const layers: readonly Layer[] = bands.map((band, i) => ({
    glyphRows: bandRows(
      band, range.min, range.max, layout.areaWidth, layout.areaRows,
      markOf(i, ctx.capabilities),
    ),
    ref: refOf(block.series[i]!, i),
  }));

  const labels =
    layout.labelColumn === 0
      ? []
      : yLabels(range, layout.areaRows, block.yFormat, block, block.yScale);
  const byRow = new Map(labels.map((l) => [l.row, l.text]));

  const ticks = xAxis(block.xLabels, layout.areaWidth, ctx.capabilities).tickColumns;
  const area = Array.from({ length: layout.areaRows }, (_, i) =>
    line(
      [
        ...gutterSpans(byRow.get(i) ?? "", layout, ctx),
        ...behind(gridRow(layout, ticks, ctx, byRow.has(i)), mergedRow(layers, i, layout, ctx), ctx),
        ...rightBorder(layout, ctx),
      ],
      layout,
      ctx,
    ),
  );
  return axed(block, area, layout, ctx);
}

/**
 * The pre-`hierarchy` arm, kept for a block that has only `series`.
 *
 * It is a bar chart with the labels off, which is what these two forms were and
 * is not what they are. Kept because a caller passing `series` is asking for the
 * shape it used to get and silently drawing nothing is worse; **not** kept as an
 * equal alternative, which is why it is named for what it is.
 */
function legacyDepthBars(
  block: Plot,
  width: number,
  ctx: RenderContext,
  reversed: boolean,
): readonly string[] {
  const data = seriesRange(block.series, block);
  const layout: Layout = { gutter: 0, labelColumn: 0, areaWidth: width, areaRows: plotAreaRows(block), width };
  if (data === null) return emptyRows(block, layout, ctx);
  const src = reversed
    ? {
        ...block,
        categories: [...(block.categories ?? [])].reverse(),
        series: [{ ...block.series[0]!, values: [...(block.series[0]?.values ?? [])].reverse() }],
      }
    : block;
  let ri = 0;
  return categoricalForm(src, width, ctx, (_label, aw) => {
    const v = src.series[0]?.values[ri++] ?? null;
    return barRow(v, baselineFor(data.min), data.max, aw, ctx.capabilities, false);
  });
}

/**
 * A flame graph or an icicle plot — the tree as strips, one row per depth.
 *
 * **`inverted` is the only difference**, which is what these two forms are:
 * a flame graph puts the root at the bottom and grows upward, an icicle puts it
 * at the top. Both previously dispatched to `barRow` with the labels suppressed,
 * so they were a bar chart and a reversed bar chart — correct in every count and
 * about nothing, because a bar chart cannot say that one frame *sits on*
 * another and spans a sub-range of it.
 *
 * A frame's label is written inside it where it fits and dropped where it does
 * not; a name sliced to three characters names nothing, and the strip's extent
 * is the datum either way.
 */
function hierarchyStripRows(
  block: Plot,
  width: number,
  ctx: RenderContext,
  inverted: boolean,
): readonly string[] {
  const root = block.hierarchy;
  const areaRows = plotAreaRows(block);
  const layout: Layout = { gutter: 0, labelColumn: 0, areaWidth: width, areaRows, width };
  if (root === undefined) return emptyRows(block, layout, ctx);

  const placed = strips(root);
  const maxDepth = placed.reduce((m, st) => Math.max(m, st.depth), 0); // cells-ok — a depth count
  const rowFor = (depth: number): number =>
    inverted ? depth : areaRows - 1 - depth; // cells-ok — a row index

  const out: string[] = [];
  for (let r = 0; r < areaRows; r += 1) {
    const depth = inverted ? r : areaRows - 1 - r; // cells-ok — a depth index
    const here = placed.filter((st) => st.depth === depth && rowFor(st.depth) === r);
    if (here.length === 0 || depth > maxDepth) { // cells-ok — a strip count
      out.push(line([{ text: " ".repeat(width) }], layout, ctx));
      continue;
    }
    const spans: Span[] = [];
    let cursor = 0; // cells-ok — a column position
    for (const st of here) {
      const from = Math.round(st.from * width); // cells-ok — a column position
      const to = Math.max(from + 1, Math.round(st.to * width)); // cells-ok — a column position
      if (from > cursor) spans.push({ text: " ".repeat(from - cursor) });
      const cells = Math.max(1, Math.min(to, width) - from); // cells-ok — a cell count
      // The name inside the frame where it fits, and nothing where it does not:
      // three characters of a symbol name is not a shorter name, it is a
      // different one.
      const label = st.label.length + 2 <= cells ? ` ${st.label} ` : ""; // cells-ok — a cell count
      const text = label === "" ? markOf(st.index, ctx.capabilities).repeat(cells)
        : label + markOf(st.index, ctx.capabilities).repeat(cells - label.length); // cells-ok — a cell count
      spans.push({ text, style: slot(categoryRef(st.index), ctx.theme, ctx.capabilities) });
      cursor = from + cells; // cells-ok — a column position
    }
    out.push(line(spans, layout, ctx));
  }
  return composeRows(plotHeight(block), [], out, []);
}

/**
 * A treemap — the tree as tiles, drawn as filled rectangles.
 *
 * Nesting is drawn by **depth ordering**: a parent is painted, then its children
 * over it, so a child is visibly inside the rectangle that contains it. There is
 * no border vocabulary that survives a two-cell tile, and a mark that does not
 * fit the smallest tile is a mark that lies about the ones it does fit.
 */
function treemapRows(block: Plot, width: number, ctx: RenderContext): readonly string[] {
  const root = block.hierarchy;
  const areaRows = plotAreaRows(block);
  const layout: Layout = { gutter: 0, labelColumn: 0, areaWidth: width, areaRows, width };
  if (root === undefined) return emptyRows(block, layout, ctx);

  // A cell's worth of padding in each direction, expressed on the unit square
  // so the layout stays resolution-independent.
  const placed = [...tiles(root, 1 / Math.max(width, plotAreaRows(block)))].sort((a, b) => a.depth - b.depth); // cells-ok — a depth index
  const grid = Array.from({ length: areaRows }, () => new Array<number>(width).fill(-1)); // cells-ok — a tile index
  for (const t of placed) {
    const x0 = Math.round(t.x0 * width), x1 = Math.round(t.x1 * width); // cells-ok — a column position
    const y0 = Math.round(t.y0 * areaRows), y1 = Math.round(t.y1 * areaRows); // cells-ok — a row position
    for (let r = y0; r < Math.max(y0 + 1, y1) && r < areaRows; r += 1) {
      for (let c = x0; c < Math.max(x0 + 1, x1) && c < width; c += 1) grid[r]![c] = t.index; // cells-ok — a tile index
    }
  }

  const out = grid.map((row) => {
    const spans: Span[] = [];
    let run = "", runIdx = -2; // cells-ok — a tile index
    const flush = (): void => {
      if (run === "") return;
      spans.push(runIdx < 0 ? { text: run }
        : { text: run, style: slot(categoryRef(runIdx), ctx.theme, ctx.capabilities) });
      run = "";
    };
    for (const idx of row) {
      if (idx !== runIdx) { flush(); runIdx = idx; }
      run += idx < 0 ? " " : markOf(idx, ctx.capabilities); // cells-ok — a tile index
    }
    flush();
    return line(spans, layout, ctx);
  });
  return composeRows(plotHeight(block), [], out, []);
}

function positionalForm(
  block: Plot,
  width: number,
  ctx: RenderContext,
  rasterise: Rasteriser,
): readonly string[] {
  const stacked = ctx.capabilities.colourDepth === 1 && block.series.length > 1; // cells-ok — a series count
  const data = seriesRange(block.series, block);
  const range =
    data === null || stacked
      ? data
      : axisFor(data, ticksFor(plotAreaRows(block)), block, block.yScale).range;
  const usable = usableWidth(block, width, ctx);
  const layout = reserving(
    layoutFor(block, range ?? { min: 0, max: 1 }, usable, stacked, ctx.capabilities)
      ?? { areaRows: plotAreaRows(block), width: usable, gutter: 0, labelColumn: 0, areaWidth: usable },
    block, width, ctx,
  );
  // **A pinned range is not a reading.** `seriesRange` answers *what are the
  // bounds*, and with `yMin`/`yMax` given it answers even for an empty series —
  // so `ecdf`, which pins 0..1 to build its block, drew bare axes where every
  // other empty variant says *No data.* The question here is whether anything
  // was measured, and only the samples can answer it. The same defect waits on
  // any form given pinned bounds and no data; this is the one that had one.
  if (range === null || !hasSamples(block.series)) return emptyRows(block, layout, ctx);

  const cursorIdx = ctx.cursorPositions?.[block.id];
  const area = stacked
    ? stackedRows(block, range, layout, ctx)
    : overlaidRows(block, range, layout, ctx, rasterise);
  if (block.axes === true && cursorIdx !== undefined && Number.isFinite(cursorIdx)) {
    return axedWithCursor(block, cursorIdx, area, layout, ctx);
  }
  return axed(block, area, layout, ctx);
}


/**
 * One band of rows per series, each drawn by `bandBuilder`.
 *
 * **The violin and the ridgeline are one layout and two fills.** Both allocate
 * a band of rows to a series, label it on the band's middle row, and colour it
 * from the categorical palette; only what fills the band differs. Written twice,
 * the ridgeline kept the single-row density curve the violin had already been
 * fixed away from — a smear where a profile belonged.
 */
function bandedForm(
  block: Plot,
  cats: readonly string[],
  width: number,
  ctx: RenderContext,
  bandBuilder: (series: Series, areaWidth: number, rows: number, index: number) => readonly string[],
): readonly string[] {
  const areaRows = plotAreaRows(block);
  const n = cats.length; // cells-ok — a category count
  const fallback: Layout = { gutter: 0, labelColumn: 0, areaWidth: width, areaRows, width };
  if (n === 0) return emptyRows(block, fallback, ctx);

  const layout = reserving(bandLayout(cats, usableWidth(block, width, ctx), block.axes === true, areaRows, ctx.capabilities), block, width, ctx);
  const areaWidth = layout.areaWidth;

  const rowsPer = Math.max(1, Math.floor(areaRows / n));
  const out: string[] = [];

  for (let ci = 0; ci < n; ci += 1) {
    const sr = block.series[ci];
    // **The index, and `boxplot` is why.** `bandedForm` read only
    // `block.series`, so a form whose data lives in `block.quartiles` could not
    // use it and had to hand-roll one row per category — which is exactly how
    // the box plot ended up unable to show a centre. The band is handed its
    // ordinal and fetches what it needs.
    const band = bandBuilder(sr ?? { values: [] }, areaWidth, rowsPer, ci);
    const labelRow = Math.floor(rowsPer / 2);
    const styled = slot(refOf(sr ?? { values: [] }, ci), ctx.theme, ctx.capabilities);

    for (let r = 0; r < rowsPer && out.length < areaRows; r += 1) { // cells-ok — a row count
      const label = r === labelRow ? truncate(cats[ci] ?? "", layout.labelColumn, ctx.capabilities) : "";
      out.push(
        line(
          [
            ...gutterSpans(label, layout, ctx),
            { text: areaText(band[r] ?? " ".repeat(areaWidth), layout, ctx), style: styled },
            ...rightBorder(layout, ctx),
          ],
          layout,
          ctx,
        ),
      );
    }
  }

  while (out.length < areaRows) { // cells-ok — a row count
    out.push(line([...gutterSpans("", layout, ctx), ...rightBorder(layout, ctx)], layout, ctx));
  }
  return axed(block, out, layout, ctx);
}

const FORM_ROWS: Readonly<
  Record<PlotForm, (block: Plot, width: number, ctx: RenderContext) => readonly string[]>
> = {
  sparkline: (block, width, ctx) => {
    const first = block.series[0];
    const spark = sparkline(first?.values ?? [], width, ctx.capabilities);
    const layout: Layout = { gutter: 0, labelColumn: 0, areaWidth: width, areaRows: 1, width };
    return [
      line(
        [
          {
            text: spark,
            style: slot(
              first === undefined ? "tone.default" : refOf(first, 0),
              ctx.theme,
              ctx.capabilities,
            ),
          },
        ],
        layout,
        ctx,
      ),
    ];
  },

  line: (block, width, ctx) => positionalForm(block, width, ctx, styleRasteriser(block, ctx.capabilities, curveRows)),

  scatter: (block, width, ctx) => positionalForm(block, width, ctx, scatterRows),
  step: (block, width, ctx) => positionalForm(block, width, ctx, styleRasteriser(block, ctx.capabilities, stepRows, "step")),
  ecdf: (block, width, ctx) => {
    const ecdfBlock = {
      ...block,
      series: block.series.map((s) => ecdfSeries(s)),
      yMin: block.yMin ?? 0,
      yMax: block.yMax ?? 1,
    };
    return positionalForm(ecdfBlock, width, ctx, styleRasteriser(block, ctx.capabilities, stepRows, "step"));
  },
  bar: (block, width, ctx) => {
    const data = seriesRange(block.series, block);
    if (data === null) return emptyRows(block, { gutter: 0, labelColumn: 0, areaWidth: width, areaRows: plotAreaRows(block), width }, ctx);
    const layout = block.layout ?? "overlap";
    if (layout === "stacked" || layout === "normalised") {
      let totalMax = 0;
      const cats = block.categories ?? [];
      for (let i = 0; i < cats.length; i++) { // cells-ok — a category count
        let sum = 0;
        for (const s of block.series) sum += (s.values[i] ?? 0);
        totalMax = Math.max(totalMax, sum);
      }
      let ci = 0;
      return categoricalForm(block, width, ctx, (_label, aw) =>
        stackedBarRow(block.series, ci++, totalMax, aw, ctx.capabilities, layout === "normalised"),
      );
    }
    // **`layout: "grouped"` rendered one series and dropped the rest, silently.**
    // Only "stacked" and "normalised" were handled, so a grouped block fell to
    // the single-series path below and series 2..n were never drawn — no
    // notice, no truncation mark, nothing. C12 I8 says series are never dropped
    // silently; this arm was the one place that did.
    if (layout === "grouped" && block.series.length > 1) { // cells-ok — a series count
      // One row per (category, series), in category-major order, so a group's
      // bars sit together and the gutter names which series each one is.
      const cats = block.categories ?? [];
      const base = baselineFor(data.min);
      const ordered = cats.flatMap((_c, i) => block.series.map((sr) => sr.values[i] ?? null));
      const grouped = {
        ...block,
        categories: cats.flatMap((c) =>
          block.series.map((sr, k) => `${c} · ${sr.label ?? String(k + 1)}`),
        ),
      };
      let oi = 0;
      const perSeries = block.series.length; // cells-ok — a series count
      return categoricalForm(
        grouped, width, ctx,
        (_label, aw) => barRow(ordered[oi++] ?? null, base, data.max, aw, ctx.capabilities, true, block.yFormat),
        // Rows run category-major, so row `r` is series `r % n` — which is what
        // the legend names, and what slot `r` did not.
        (r) => slotOf(r % perSeries), // cells-ok — a series index
      );
    }
    // **Vertical is a different renderer, not a flag** (C12 §3j). The gutter holds
    // the value scale instead of the names, the names run along the bottom, and
    // the eighths fill from the cell's bottom rather than its left.
    if (block.orientation === "vertical") {
      return categoricalColumnForm(block, width, ctx, (i, cw, rows, lo, hi) =>
        barColumn(block.series[0]?.values[i] ?? null, lo, hi, cw, rows, ctx.capabilities),
      );
    }
    let ri = 0;
    const base = baselineFor(data.min);
    return categoricalForm(block, width, ctx, (_label, aw) => {
      const v = block.series[0]?.values[ri++] ?? null;
      return barRow(v, base, data.max, aw, ctx.capabilities, true, block.yFormat);
    });
  },
  histogram: (block, width, ctx) => {
    const s = block.series[0];
    if (!s) return emptyRows(block, { gutter: 0, labelColumn: 0, areaWidth: width, areaRows: plotAreaRows(block), width }, ctx);
    const { labels, counts, edges } = binValues(s.values, block.binning ?? "sturges");
    if (counts.length === 0) return emptyRows(block, { gutter: 0, labelColumn: 0, areaWidth: width, areaRows: plotAreaRows(block), width }, ctx); // cells-ok — a bin count
    const maxCount = Math.max(...counts);
    const histBlock = { ...block, categories: labels, series: [{ values: counts }] };
    // **A histogram is the form vertical was asked for.** Its bins are ordered
    // and its labels are half-open intervals — `[15.4, 24.1)` reads along a
    // bottom axis and is unreadable stacked down a gutter.
    if (block.orientation === "vertical") {
      // The bin's **lower edge**, not its interval: `[18.3, 23.1)` needs twelve
      // cells and a column of a nine-bin histogram at 80 has nine, so every
      // label was dropped and the axis came back blank. The boundary is what a
      // bottom axis names.
      const edged = { ...histBlock, categories: edges.slice(0, counts.length).map((e) => e.trim()) }; // cells-ok — a bin count
      return categoricalColumnForm(edged, width, ctx, (i, cw, rows, lo, hi) =>
        barColumn(counts[i] ?? 0, lo, hi, cw, rows, ctx.capabilities),
      );
    }
    let ci = 0;
    return categoricalForm(histBlock, width, ctx, (_label, aw) =>
      barRow(counts[ci++] ?? 0, 0, maxCount, aw, ctx.capabilities, true),
    );
  },
  boxplot: (block, width, ctx) => {
    const qs = block.quartiles ?? [];
    if (qs.length === 0) return emptyRows(block, { gutter: 0, labelColumn: 0, areaWidth: width, areaRows: plotAreaRows(block), width }, ctx); // cells-ok — a quartile count
    let lo = Infinity, hi = -Infinity;
    for (const q of qs) {
      lo = Math.min(lo, q.min, ...(q.outliers ?? []));
      hi = Math.max(hi, q.max, ...(q.outliers ?? []));
    }
    const cats = block.categories ?? qs.map((_q, i) => `series ${String(i + 1)}`);
    if (block.orientation === "vertical") {
      // The same figure stood up: one column band per category, the value scale
      // in the gutter, and `boxplotColumn`'s three columns where the horizontal
      // table has three rows.
      const boxed = { ...block, categories: cats, yMin: lo, yMax: hi };
      return categoricalColumnForm(boxed, width, ctx, (i, cw, rows, low, high) => {
        const q = qs[i];
        return q
          ? boxplotColumn(q, low, high, cw, rows, ctx.capabilities)
          : Array.from({ length: rows }, () => " ".repeat(cw));
      });
    }
    return bandedForm(block, cats, width, ctx, (_sr, aw, rows, i) => {
      const q = qs[i];
      return q
        ? boxplotBand(q, lo, hi, aw, detailRows(block, rows, 3), ctx.capabilities)
        : Array.from({ length: rows }, () => " ".repeat(aw));
    });
  },
  forest: (block, width, ctx) => {
    const qs = block.quartiles ?? [];
    if (qs.length === 0) return emptyRows(block, { gutter: 0, labelColumn: 0, areaWidth: width, areaRows: plotAreaRows(block), width }, ctx); // cells-ok — a quartile count
    let lo = Infinity, hi = -Infinity;
    for (const q of qs) {
      lo = Math.min(lo, q.lower ?? q.min, ...(q.outliers ?? []));
      hi = Math.max(hi, q.upper ?? q.max, ...(q.outliers ?? []));
    }
    // A forest plot's null is an `Annotation` — C04 already means *a claim about
    // the ordinate drawn beside the data* by it, and inventing `nullValue` beside
    // that would be the second way to say one thing. The value maps to a
    // **column** here rather than a row, so `annotationRows` is the wrong helper
    // and the reference goes to the row builder.
    const refs = (block.annotations ?? [])
      .filter((a): a is Extract<Annotation, { kind: "line" }> => a.kind === "line")
      .map((a) => a.value);
    let qi = 0;
    return categoricalForm(block, width, ctx, (_label, aw) => {
      const q = qs[qi++];
      return q ? forestRow(q, lo, hi, aw, ctx.capabilities, refs) : "";
    });
  },
  dumbbell: (block, width, ctx) => {
    const s1 = block.series[0];
    const s2 = block.series[1];
    if (!s1 || !s2) return emptyRows(block, { gutter: 0, labelColumn: 0, areaWidth: width, areaRows: plotAreaRows(block), width }, ctx);
    const data = seriesRange(block.series, block);
    if (data === null) return emptyRows(block, { gutter: 0, labelColumn: 0, areaWidth: width, areaRows: plotAreaRows(block), width }, ctx);
    let ri = 0;
    return categoricalForm(block, width, ctx, (_label, aw) => {
      const v1 = s1.values[ri] ?? null;
      const v2 = s2.values[ri] ?? null;
      ri++;
      if (v1 === null || v2 === null) return " ".repeat(aw);
      return dumbbellRow(v1, v2, data.min, data.max, aw, ctx.capabilities);
    });
  },
  lollipop: (block, width, ctx) => {
    const data = seriesRange(block.series, block);
    if (data === null) return emptyRows(block, { gutter: 0, labelColumn: 0, areaWidth: width, areaRows: plotAreaRows(block), width }, ctx);
    let ri = 0;
    return categoricalForm(block, width, ctx, (_label, aw) => {
      const v = block.series[0]?.values[ri++] ?? null;
      return lollipopRow(v, data.min, data.max, aw, ctx.capabilities);
    });
  },
  dotplot: (block, width, ctx) => {
    const data = seriesRange(block.series, block);
    if (data === null) return emptyRows(block, { gutter: 0, labelColumn: 0, areaWidth: width, areaRows: plotAreaRows(block), width }, ctx);
    let ri = 0;
    return categoricalForm(block, width, ctx, (_label, aw) => {
      const v = block.series[0]?.values[ri++] ?? null;
      return dotplotRow(v, data.min, data.max, aw, ctx.capabilities);
    });
  },
  waffle: (block, width, ctx) => {
    const segs = block.segments ?? [];
    const layout: Layout = { gutter: 0, labelColumn: 0, areaWidth: width, areaRows: 10, width };
    if (segs.length === 0) return emptyRows(block, layout, ctx); // cells-ok — a segment count
    const cellRows = waffleCells(segs, width, ctx.capabilities);
    return cellRows.map((row) => {
      const spans: Span[] = [];
      let run = "";
      let runIdx = -1;
      const flush = (): void => {
        if (run === "") return;
        if (runIdx >= 0) {
          const ref = slotOf(runIdx); // cells-ok — a segment index
          spans.push({ text: run, style: slot(ref, ctx.theme, ctx.capabilities) });
        } else {
          spans.push({ text: run });
        }
        run = "";
      };
      for (const cell of row) {
        if (cell.segmentIndex !== runIdx) { flush(); runIdx = cell.segmentIndex; }
        run += cell.mark;
      }
      flush();
      return line(spans, layout, ctx);
    });
  },
  // **The tree, where these were a bar chart and a reversed bar chart** (C04 I54).
  // Both dispatched to `barRow` with labels suppressed — correct in every count
  // and about nothing, because a bar chart cannot say that one frame sits on
  // another and spans a sub-range of it. `hierarchy` absent falls back to the
  // old arm rather than drawing nothing, since a caller with only `series` is
  // asking for the shape it used to get.
  flame: (block, width, ctx) =>
    block.hierarchy !== undefined
      ? hierarchyStripRows(block, width, ctx, false)
      : legacyDepthBars(block, width, ctx, false),
  icicle: (block, width, ctx) =>
    block.hierarchy !== undefined
      ? hierarchyStripRows(block, width, ctx, true)
      : legacyDepthBars(block, width, ctx, true),
  treemap: (block, width, ctx) => treemapRows(block, width, ctx),

  // --- the six that had no renderer -------------------------------------
  //
  // Each reuses machinery that exists, which is C04 §8's claim about them and
  // is why they arrive together: what a new form usually needs is a layout, and
  // these six needed none that was not already here.

  /**
   * A slope graph: two value columns joined by a line each (C04 §8).
   *
   * The chart for *ranking change* — the lines crossing is the content, and it
   * is why this is not two bar charts side by side. Drawn on the same dot grid
   * as `line`, with the series' first and last readings as the two columns.
   */
  slope: (block, width, ctx) => positionalForm(block, width, ctx, (sr, range, aw, rows, caps) => {
    const vals = sr.values.filter((v): v is number => v !== null && Number.isFinite(v));
    const ends = vals.length >= 2 // cells-ok — a sample count
      ? { values: [vals[0]!, vals[vals.length - 1]!] } // cells-ok — a sample index
      : { values: vals };
    return curveRows(ends, range, aw, rows, caps);
  }),

  /**
   * A bubble chart — scatter with a **size** channel (C04 §8).
   *
   * The fourth encoding axis, and the one a terminal has least room for: a cell
   * is the smallest mark there is, so size is spent on *how many cells* rather
   * than on a radius. Two series, read as (position, magnitude).
   */
  bubble: (block, width, ctx) => positionalForm(block, width, ctx, (sr, range, aw, rows, caps) =>
    bubbleRows(sr, block.series[1], range, aw, rows, caps)),

  /**
   * An autocorrelation plot — one bar per lag, with a confidence band.
   *
   * `barRow` plus the band, which is an `Annotation` and not a new field: the
   * significance bounds are a claim about the ordinate drawn beside the data,
   * exactly as the forest plot's null is.
   */
  autocorrelation: (block, width, ctx) => {
    const s0 = block.series[0];
    const areaRows = plotAreaRows(block);
    const layout: Layout = { gutter: 0, labelColumn: 0, areaWidth: width, areaRows, width };
    if (!s0) return emptyRows(block, layout, ctx);
    const lags = s0.values.map((v, i) => ({ v, i }));
    const cats = block.categories ?? lags.map((l) => String(l.i));
    const mag = Math.max(1, ...s0.values.map((v) => Math.abs(v ?? 0)));
    const bounds = (block.annotations ?? [])
      .filter((a): a is Extract<Annotation, { kind: "line" }> => a.kind === "line")
      .map((a) => a.value);
    let li = 0;
    return categoricalForm({ ...block, categories: cats }, width, ctx, (_label, aw) =>
      lagRow(s0.values[li++] ?? null, mag, aw, bounds, ctx.capabilities));
  },

  /**
   * A timeline — event marks on a shared time axis, one row per track.
   *
   * The glyph-row family: each series is a track and each finite value is an
   * instant, so a series' *positions* are the data and its magnitudes are not.
   */
  timeline: (block, width, ctx) => {
    const cats = block.categories ?? block.series.map((sr, i) => sr.label ?? `track ${String(i + 1)}`);
    const data = seriesRange(block.series, block);
    const areaRows = plotAreaRows(block);
    if (data === null) return emptyRows(block, { gutter: 0, labelColumn: 0, areaWidth: width, areaRows, width }, ctx);
    let ti = 0;
    return categoricalForm({ ...block, categories: cats }, width, ctx, (_label, aw) =>
      timelineRow(block.series[ti++], data, aw, ctx.capabilities));
  },

  /**
   * A bullet graph — a measure against a target, on qualitative bands.
   *
   * Stephen Few's replacement for a gauge, and the reason it is not one: the
   * bands say what *good* is, so a reader needs no legend and no second glance
   * at a dial. `quartiles` carries the bands and `centre` the target.
   */
  bullet: (block, width, ctx) => {
    const qs = block.quartiles ?? [];
    const areaRows = plotAreaRows(block);
    const layout: Layout = { gutter: 0, labelColumn: 0, areaWidth: width, areaRows, width };
    if (qs.length === 0) return emptyRows(block, layout, ctx); // cells-ok — a measure count
    const cats = block.categories ?? qs.map((_q, i) => `measure ${String(i + 1)}`);
    let bi = 0;
    return categoricalForm({ ...block, categories: cats }, width, ctx, (_label, aw) => {
      const q = qs[bi++];
      return q ? bulletRow(q, block.series[0]?.values[bi - 1] ?? null, aw, ctx.capabilities) : "";
    });
  },

  /** A utilisation grid — one cell per unit, shaded by load. The matrix family exactly. */
  utilisation: (block, width, ctx) => heatmapFormRows(block, width, ctx),

  funnel: (block, width, ctx) => {
    const data = seriesRange(block.series, block);
    if (data === null) return emptyRows(block, { gutter: 0, labelColumn: 0, areaWidth: width, areaRows: plotAreaRows(block), width }, ctx);
    let ri = 0;
    return categoricalForm(block, width, ctx, (_label, aw) => {
      const v = block.series[0]?.values[ri++] ?? null;
      return funnelRow(v, data.max, aw, ctx.capabilities);
    });
  },
  gantt: (block, width, ctx) => {
    const offsets = block.offsets ?? [];
    const s = block.series[0];
    if (!s) return emptyRows(block, { gutter: 0, labelColumn: 0, areaWidth: width, areaRows: plotAreaRows(block), width }, ctx);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < s.values.length; i++) { // cells-ok — a sample count
      const start = offsets[i] ?? 0;
      const dur = s.values[i] ?? 0;
      lo = Math.min(lo, start);
      hi = Math.max(hi, start + dur);
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return emptyRows(block, { gutter: 0, labelColumn: 0, areaWidth: width, areaRows: plotAreaRows(block), width }, ctx);
    let ri = 0;
    return categoricalForm(block, width, ctx, (_label, aw) => {
      const start = offsets[ri] ?? 0;
      const v = s.values[ri++] ?? null;
      return ganttRow(start, v, lo, hi, aw, ctx.capabilities);
    });
  },
  waterfall: (block, width, ctx) => {
    const s = block.series[0];
    const totals = block.totals ?? [];
    if (!s) return emptyRows(block, { gutter: 0, labelColumn: 0, areaWidth: width, areaRows: plotAreaRows(block), width }, ctx);
    let cumulative = 0;
    let lo = 0, hi = 0;
    for (let i = 0; i < s.values.length; i++) { // cells-ok — a sample count
      const v = s.values[i] ?? 0;
      if (totals[i]) { cumulative = v; } else { cumulative += v; }
      lo = Math.min(lo, cumulative);
      hi = Math.max(hi, cumulative);
    }
    cumulative = 0;
    let ri = 0;
    return categoricalForm(block, width, ctx, (_label, aw) => {
      const v = s.values[ri] ?? null;
      const isTotal = totals[ri] ?? false;
      ri++;
      const baseline = cumulative;
      if (v !== null) { if (isTotal) { cumulative = v; } else { cumulative += v; } }
      return waterfallRow(v, baseline, lo, hi, aw, ctx.capabilities, isTotal);
    });
  },
  // **One fold, two origins** (C04 §8, the stacking fold). `streamgraph` was
  // byte-for-byte the `line` handler — nothing stacked, no baseline offset, no
  // area fill — so two crossing outlines were drawn where a stream of
  // never-crossing bands belongs. That is not a stream graph with a rendering
  // defect; it is a line chart under an alias.
  stackedarea: (block, width, ctx) => stackedForm(block, width, ctx, false),
  streamgraph: (block, width, ctx) => stackedForm(block, width, ctx, true),
  calendar: (block, width, ctx) => heatmapFormRows(block, width, ctx),
  correlation: (block, width, ctx) => heatmapFormRows(block, width, ctx),
  confusion: (block, width, ctx) => heatmapFormRows(block, width, ctx),
  spectrogram: (block, width, ctx) => heatmapFormRows(block, width, ctx),
  latency: (block, width, ctx) => heatmapFormRows(block, width, ctx),
  density2d: (block, width, ctx) => heatmapFormRows(block, width, ctx),
  density: (block, width, ctx) => {
    const s = block.series[0];
    if (!s) return emptyRows(block, { gutter: 0, labelColumn: 0, areaWidth: width, areaRows: plotAreaRows(block), width }, ctx);
    const { series: ds, range } = densitySeries(s, 100, block.bandwidth);
    const densityBlock = { ...block, series: [ds], yMin: range.min, yMax: range.max };
    return positionalForm(densityBlock, width, ctx, styleRasteriser(block, ctx.capabilities, densityRows));
  },
  violin: (block, width, ctx) => {
    const cats = block.categories ?? block.series.map((sr, i) => sr.label ?? `series ${String(i + 1)}`);
    const qs = block.quartiles ?? [];
    // One value axis for every band, so the categories can be compared — which
    // is what the form is for (C12 §3q).
    const shared = seriesRange(block.series, block) ?? undefined;
    if (block.orientation === "vertical") {
      // **The conventional orientation**: seaborn and matplotlib both draw a
      // violin this way and the horizontal arm is the terminal's accommodation.
      // The value axis is shared across the categories, so the gutter numbers it
      // once and each column is a distribution on that same scale — which is the
      // comparison a violin plot exists to make and the horizontal arm gives up
      // by scaling every band to itself.
      return categoricalColumnForm({ ...block, categories: cats }, width, ctx, (i, cw, rows) => {
        const sr = block.series[i];
        return sr
          ? violinColumn(sr, cw, rows, ctx.capabilities, qs[i] ?? summaryOf(sr), block.plotCorners ?? "rounded", block.bandwidth, shared)
          : Array.from({ length: rows }, () => " ".repeat(cw));
      });
    }
    return bandedForm(block, cats, width, ctx, (sr, aw, rows, i) =>
      violinRows(sr, aw, rows, ctx.capabilities, qs[i] ?? summaryOf(sr), block.plotCorners ?? "rounded", block.bandwidth, shared),
    );
  },
  ridgeline: (block, width, ctx) => {
    // **Not `bandedForm`, and that is the form rather than a refactor.** A band
    // per series is a stack of small area charts; a ridgeline's curves rise into
    // the band above and are read against their neighbours, which is the only
    // reason to prefer it over facets. The area is composed whole so the curves
    // can overlap, and the labels sit on each curve's own baseline.
    const cats = block.series.map((sr, i) => sr.label ?? `series ${String(i + 1)}`);
    const areaRows = plotAreaRows(block);
    const fallback: Layout = { gutter: 0, labelColumn: 0, areaWidth: width, areaRows, width };
    if (block.series.length === 0) return emptyRows(block, fallback, ctx); // cells-ok — a series count

    const layout = reserving(bandLayout(cats, usableWidth(block, width, ctx), block.axes === true, areaRows, ctx.capabilities), block, width, ctx);
    const { rows, baselines, owners } = ridgelineArea(
      block.series, layout.areaWidth, areaRows, ctx.capabilities, block.bandwidth, block.plotCorners ?? "rounded",
    );
    const labelAt = new Map(baselines.map((r, i) => [r, cats[i] ?? ""]));

    // **Each curve carries its own colour, so a row is more than one span.**
    // The curves overlap by construction — that is the form — so a row holds
    // cells from two or three of them and there is no per-row colour to pick.
    // Asking `baselines.indexOf(row)` gave -1 everywhere but the baselines, and
    // the whole tangle drew in the fallback tone.
    const out = rows.map((content, r) => {
      const label = truncate(labelAt.get(r) ?? "", layout.labelColumn, ctx.capabilities);
      const runs = ownedSpans(
        areaText(content, layout, ctx),
        owners[r] ?? [],
        (i) => refOf(block.series[i] ?? { values: [] }, i),
        ctx,
      );
      return line(
        [...gutterSpans(label, layout, ctx), ...runs, ...rightBorder(layout, ctx)],
        layout,
        ctx,
      );
    });
    return axed(block, out, layout, ctx);
  },
  smallmultiples: (block, width, ctx) => {
    const facets = block.facets ?? [];
    const areaRows = plotAreaRows(block);
    if (facets.length === 0) return emptyRows(block, { gutter: 0, labelColumn: 0, areaWidth: width, areaRows, width }, ctx); // cells-ok — a facet count
    // **Returned as composed, not re-painted.** `line` clamps with `clampSpans`,
    // which measures span text using `cells()` — and `cells()` counts a painted
    // row's escape bytes as visible, by its own documentation. An 80-cell row
    // carrying colour measured about 120, was truncated, and `stripControl` took
    // the ESC and left the rest on screen as literal text. Facets are the one
    // place in C12 that composes rows another renderer has already styled, so
    // the span pipeline is the wrong pipeline; `smallMultiplesRows` fits each
    // column in display cells and guarantees the width itself.
    // **Reconciled to the declared height**, like every axed form. The parent's
    // height is the contract whatever its children do: these two returned
    // whatever the facet layout produced, so a parent declaring 10 drew 7 and
    // moved everything below it. Sizing the children to *fill* the parent is a
    // different question and belongs with `height: "fill"`.
    return composeRows(areaRows, [], smallMultiplesRows(facets, width, areaRows, ctx, FORM_ROWS), []);
  },
  pairplot: (block, width, ctx) => {
    const facets = block.facets ?? [];
    const areaRows = plotAreaRows(block);
    if (facets.length === 0) return emptyRows(block, { gutter: 0, labelColumn: 0, areaWidth: width, areaRows, width }, ctx); // cells-ok — a facet count
    // **Returned as composed, not re-painted.** `line` clamps with `clampSpans`,
    // which measures span text using `cells()` — and `cells()` counts a painted
    // row's escape bytes as visible, by its own documentation. An 80-cell row
    // carrying colour measured about 120, was truncated, and `stripControl` took
    // the ESC and left the rest on screen as literal text. Facets are the one
    // place in C12 that composes rows another renderer has already styled, so
    // the span pipeline is the wrong pipeline; `smallMultiplesRows` fits each
    // column in display cells and guarantees the width itself.
    // **Reconciled to the declared height**, like every axed form. The parent's
    // height is the contract whatever its children do: these two returned
    // whatever the facet layout produced, so a parent declaring 10 drew 7 and
    // moved everything below it. Sizing the children to *fill* the parent is a
    // different question and belongs with `height: "fill"`.
    return composeRows(areaRows, [], smallMultiplesRows(facets, width, areaRows, ctx, FORM_ROWS), []);
  },
  pie: (block, width, ctx) => {
    const segs = block.segments ?? [];
    const areaRows = plotAreaRows(block);
    const layout: Layout = { gutter: 0, labelColumn: 0, areaWidth: width, areaRows, width };
    if (segs.length === 0) return emptyRows(block, layout, ctx); // cells-ok — a segment count
    if (ctx.capabilities.unicode === "ascii") {
      return pieAsciiRows(segs, width, areaRows, ctx.capabilities).map((row) =>
        line(markedSpans(row, (i) => categoryRef(i), ctx), layout, ctx),
      );
    }
    const pie = pieRender(segs, width, areaRows, ctx.capabilities);
    if (pie.layers.length === 0) return emptyRows(block, layout, ctx); // cells-ok — a layer count
    const fills: readonly Layer[] = pie.layers.map((pl) => ({
      glyphRows: pl.glyphRows,
      ref: categoryRef(pl.segmentIndex),
    }));
    // **No muted outline layer, and its absence is the finding.** `mergedRow`
    // resolves a whole cell to the first layer that inks it, and a braille rim
    // crosses about a third of the cells the disc occupies — so an outline drawn
    // over the fill did not trace the circle, it ate it. The rim is the edge of
    // each wedge's own dots now, in that wedge's own colour.
    const discLayout: Layout = { ...layout, areaWidth: pie.discWidth };
    const out: string[] = [];
    for (let r = 0; r < areaRows; r += 1) {
      out.push(line(
        [...mergedRow(fills, r, discLayout, ctx), ...markedSpans(pie.legend[r] ?? [], (i) => categoryRef(i), ctx)],
        layout,
        ctx,
      ));
    }
    return out;
  },
  radar: (block, width, ctx) => {
    const cats = block.categories ?? [];
    const areaRows = plotAreaRows(block);
    const layout: Layout = { gutter: 0, labelColumn: 0, areaWidth: width, areaRows, width };
    if (cats.length === 0 || block.series.length === 0) return emptyRows(block, layout, ctx); // cells-ok — a category count
    const seriesRef = (index: number): ColourRef => refOf(block.series[index] ?? { values: [] }, index);
    if (ctx.capabilities.unicode === "ascii") {
      return radarAsciiRows(block.series, cats, width, areaRows, ctx.capabilities).map((row) =>
        line(markedSpans(row, seriesRef, ctx), layout, ctx),
      );
    }
    const radar = radarRender(block.series, cats, width, areaRows, ctx.capabilities);
    if (radar.polygons.length === 0) return emptyRows(block, layout, ctx); // cells-ok — a layer count
    // **Labels first, frame last, series between them.** `mergedRow` takes the
    // first layer to ink a cell, so the order is a priority: a word a polygon
    // runs through is unreadable, and the scale is context rather than a
    // reading — it may only have the cells nothing else wanted.
    const layers: readonly Layer[] = [
      { glyphRows: radar.labels, ref: "tone.muted" },
      ...radar.polygons.map((glyphRows, i) => ({ glyphRows, ref: seriesRef(i) })),
      { glyphRows: radar.frame, ref: "tone.muted" },
    ];
    const discLayout: Layout = { ...layout, areaWidth: radar.discWidth };
    const out: string[] = [];
    for (let r = 0; r < areaRows; r += 1) {
      out.push(line(
        [...mergedRow(layers, r, discLayout, ctx), ...markedSpans(radar.legend[r] ?? [], seriesRef, ctx)],
        layout,
        ctx,
      ));
    }
    return out;
  },
  horizon: (block, width, ctx) => {
    const s = block.series[0];
    const areaRows = plotAreaRows(block);
    if (!s) return emptyRows(block, { gutter: 0, labelColumn: 0, areaWidth: width, areaRows, width }, ctx);
    const data = seriesRange(block.series, block);
    if (data === null) return emptyRows(block, { gutter: 0, labelColumn: 0, areaWidth: width, areaRows, width }, ctx);
    const bands = block.bands ?? 3;
    return horizonRows(s, data, bands, width, areaRows, ctx.capabilities).map((r) =>
      line([{ text: r }], { gutter: 0, labelColumn: 0, areaWidth: width, areaRows, width }, ctx),
    );
  },

  heatmap: (block, width, ctx) => heatmapFormRows(block, width, ctx),
};

const render = (block: Plot, ctx: RenderContext): ReactElement => {
  const width = Math.max(1, Math.floor(ctx.width));
  return rows([...FORM_ROWS[block.form](block, width, ctx)]);
};

export const plotDefinition: BlockDefinition<Plot> = {
  kind: "plot",
  measure,
  render,
};
