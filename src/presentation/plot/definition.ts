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
import { glyphs } from "../blocks/glyphs.js";
import { clampSpans, paint, padStart, rows, slot, tone, type Span } from "../blocks/paint.js";
import { cells, truncate } from "../text.js";
import { AXIS_GUTTER, plotAreaRows, plotHeight } from "./height.js";
import { curveRows, isBlank } from "./curve.js";
import { labelWidth, ticksFor, xLabelRow, yLabels, axisFor } from "./axes.js";
import { annotationRows } from "./annotate.js";
import { seriesRange, type Range } from "./scale.js";
import { sparkline } from "./sparkline.js";
import { scatterRows, stepRows, ecdfSeries } from "./scatter.js";
import { boxplotRow, forestRow, dumbbellRow } from "./glyph-row.js";
import { barRow, lollipopRow, dotplotRow, binValues, stackedBarRow, funnelRow, ganttRow, waterfallRow } from "./categorical.js";
import { waffleRows, waffleCells } from "./waffle.js";
import { heatmapFormRows } from "./heatmap.js";
import { densitySeries, densityRows, violinRows, ridgeRows } from "./kde.js";
import { lineDrawRows, type Interpolation } from "./linedraw.js";
import { pieLayers, circleOutline, radarOutlines, radarFrame, radarAsciiRows } from "./circle.js";
import { horizonRows } from "./horizon.js";
import { smallMultiplesRows } from "./facet.js";
import { stripHeights } from "./strips.js";
import type { Plot, PlotForm, Series } from "../../data/viewmodel/index.js";
import type { ColourRef } from "../theme/index.js";
import type { BlockDefinition, RenderContext } from "../blocks/types.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";

/** The narrowest plot area worth drawing a curve in. Below it, furniture goes. */
const MIN_AREA = 4;

/** The categorical palette's slots, in order (C10, roadmap 51). */
const CATEGORY_REFS: readonly ColourRef[] = Object.freeze([
  "categorical.c1",
  "categorical.c2",
  "categorical.c3",
  "categorical.c4",
  "categorical.c5",
  "categorical.c6",
  "categorical.c7",
  "categorical.c8",
]);

/** A rasterised series and the colour it carries. */
type Layer = Readonly<{ glyphRows: readonly string[]; ref: ColourRef }>;

/** Everything the row builders need, resolved once. */
type Layout = Readonly<{
  gutter: number;
  labelColumn: number;
  areaWidth: number;
  areaRows: number;
  width: number;
}>;

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
function baselineFor(dataMin: number): number {
  return Math.min(0, dataMin);
}

function refOf(series: Series, index: number): ColourRef {
  if (series.tone !== undefined) return `tone.${series.tone}`;
  return CATEGORY_REFS[index] ?? "categorical.c1"; // cells-ok — a category index
}

/**
 * One row of spans, clamped and painted.
 *
 * **Every row in this file goes through here**, which is I10 made mechanical
 * rather than checked. A row one cell over its width is a row the terminal wraps
 * itself, adding a line no measurer counted — `paint.ts` records the argument for
 * every single-row kind, and a plot is where it bites hardest: an unclamped plot
 * of declared height 5 rendered nineteen rows at width 1.
 */
function line(spans: readonly Span[], layout: Layout, ctx: RenderContext): string {
  return paint(clampSpans(spans, layout.width, ctx.capabilities));
}

/**
 * The gutter: a right-aligned label, a space, and the `│`.
 *
 * Empty when `gutter` is 0, which is both the `axes: false` case and the
 * too-narrow one. One branch for two reasons is right here — the plot area is the
 * full width in both, and nothing downstream needs to know which.
 */
function gutterSpans(label: string, layout: Layout, ctx: RenderContext): readonly Span[] {
  if (layout.gutter === 0) return [];
  const g = glyphs(ctx.capabilities);
  const muted = tone("muted", ctx.theme, ctx.capabilities);
  return [
    { text: padStart(label, layout.labelColumn), style: muted },
    { text: ` ${g.vertical}`, style: muted },
  ];
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

/** The x-axis rule and the x-labels beneath it. */
function axisRows(block: Plot, layout: Layout, ctx: RenderContext): readonly string[] {
  const g = glyphs(ctx.capabilities);
  const muted = tone("muted", ctx.theme, ctx.capabilities);

  // The corner sits under the `│`, so the rule starts one cell left of the plot
  // area. With no gutter there is no corner to align, and the rule is the width.
  const corner = layout.gutter === 0 ? "" : g.bottomLeft;
  const rule = line(
    [
      { text: " ".repeat(Math.max(0, layout.gutter - 1)) },
      { text: corner + g.horizontal.repeat(Math.max(0, layout.areaWidth)), style: muted },
    ],
    layout,
    ctx,
  );

  const labels = xLabelRow(block.xLabels, layout.areaWidth, ctx.capabilities);
  const labelled =
    labels === ""
      ? ""
      : line([{ text: " ".repeat(layout.gutter) }, { text: labels, style: muted }], layout, ctx);

  return [rule, labelled];
}

function axisRowsWithCursor(
  block: Plot,
  cursorIdx: number,
  layout: Layout,
  ctx: RenderContext,
): readonly string[] {
  const g = glyphs(ctx.capabilities);
  const muted = tone("muted", ctx.theme, ctx.capabilities);

  const corner = layout.gutter === 0 ? "" : g.bottomLeft;
  const rule = line(
    [
      { text: " ".repeat(Math.max(0, layout.gutter - 1)) },
      { text: corner + g.horizontal.repeat(Math.max(0, layout.areaWidth)), style: muted },
    ],
    layout,
    ctx,
  );

  const readout = cursorReadout(block, cursorIdx, layout, ctx);
  return [rule, readout];
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
          { text: legend, style: tone("warn", ctx.theme, ctx.capabilities) },
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
  const labels =
    layout.labelColumn === 0 ? [] : yLabels(range, layout.areaRows, block.yFormat, block);
  const byRow = new Map(labels.map((l) => [l.row, l.text]));
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
      [...gutterSpans(byRow.get(i) ?? "", layout, ctx), ...mergedRow(layers, i, layout, ctx)],
      layout,
      ctx,
    ),
  );
}

/** The widest series label — the stacked form's label column (§5). */
function seriesLabelWidth(series: readonly Series[], ambiguous: AmbiguousWidth = "narrow"): number {
  let widest = 0;
  for (const s of series) widest = Math.max(widest, cells(s.label ?? "", ambiguous));
  return widest;
}

/**
 * The layout, and where T3.3's ordering lives.
 *
 * Three things want the width, and they lose it in this order: the **labels**
 * first, then the **axis furniture**, and the **curve** last. A plot whose label
 * column does not fit is still a plot; a plot with no plot area is a `…`.
 */
function layoutFor(block: Plot, range: Range, width: number, stacked: boolean): Layout | null {
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
    ? seriesLabelWidth(block.series)
    : labelWidth(yLabels(range, areaRows, block.yFormat, block));
  if (width - wanted - AXIS_GUTTER >= MIN_AREA) {
    return {
      ...base,
      gutter: wanted + AXIS_GUTTER,
      labelColumn: wanted,
      areaWidth: width - wanted - AXIS_GUTTER,
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

  if (width - AXIS_GUTTER >= MIN_AREA) {
    return { ...base, gutter: AXIS_GUTTER, labelColumn: 0, areaWidth: width - AXIS_GUTTER };
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
  rowBuilder: (label: string, areaWidth: number, categoryIndex: number) => string,
): readonly string[] {
  const cats = block.categories ?? [];
  const areaRows = plotAreaRows(block);
  const labels = cats.slice(0, areaRows);

  let labelWidth = 0;
  for (const l of labels) labelWidth = Math.max(labelWidth, cells(l, ctx.capabilities.ambiguousWidth));
  const axed = block.axes === true;
  const gutterWidth = axed ? Math.min(labelWidth, Math.floor(width / 3)) + AXIS_GUTTER : 0;
  const areaWidth = Math.max(1, width - gutterWidth);
  const labelCol = gutterWidth > 0 ? gutterWidth - AXIS_GUTTER : 0;
  const layout: Layout = { gutter: gutterWidth, labelColumn: labelCol, areaWidth, areaRows, width };

  const out: string[] = [];
  for (let i = 0; i < areaRows; i++) {
    const cat = labels[i] ?? "";
    const label = i < labels.length ? truncate(cat, labelCol, ctx.capabilities) : ""; // cells-ok — a label count
    const content = i < labels.length ? rowBuilder(cat, areaWidth, i) : ""; // cells-ok — a label count
    const gutter = gutterSpans(label, layout, ctx);
    const s = block.series[i] ?? block.series[0];
    const ref = s?.tone !== undefined ? `tone.${s.tone}` as ColourRef : (CATEGORY_REFS[i % CATEGORY_REFS.length] ?? "categorical.c1"); // cells-ok — a category index
    const styled = slot(ref, ctx.theme, ctx.capabilities);
    out.push(
      line(
        [...gutter, { text: truncate(content, areaWidth, ctx.capabilities), style: styled }],
        layout,
        ctx,
      ),
    );
  }
  if (axed) out.push(...axisRows(block, layout, ctx));
  return out;
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
  const layout =
    layoutFor(block, range ?? { min: 0, max: 1 }, width, stacked)
    ?? { areaRows: plotAreaRows(block), width, gutter: 0, labelColumn: 0, areaWidth: width };
  if (range === null) return emptyRows(block, layout, ctx);

  const cursorIdx = ctx.cursorPositions?.[block.id];
  const out = [
    ...(stacked
      ? stackedRows(block, range, layout, ctx)
      : overlaidRows(block, range, layout, ctx, rasterise)),
  ];
  if (block.axes === true) {
    if (cursorIdx !== undefined && Number.isFinite(cursorIdx)) {
      out.push(...axisRowsWithCursor(block, cursorIdx, layout, ctx));
    } else {
      out.push(...axisRows(block, layout, ctx));
    }
  }
  return out;
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
  bandBuilder: (series: Series, areaWidth: number, rows: number) => readonly string[],
): readonly string[] {
  const areaRows = plotAreaRows(block);
  const n = cats.length; // cells-ok — a category count
  const fallback: Layout = { gutter: 0, labelColumn: 0, areaWidth: width, areaRows, width };
  if (n === 0) return emptyRows(block, fallback, ctx);

  let maxLabel = 0;
  for (const l of cats) maxLabel = Math.max(maxLabel, cells(l, ctx.capabilities.ambiguousWidth));
  const axed = block.axes === true;
  const gutterWidth = axed ? Math.min(maxLabel, Math.floor(width / 3)) + AXIS_GUTTER : 0;
  const areaWidth = Math.max(1, width - gutterWidth);
  const labelCol = gutterWidth > 0 ? gutterWidth - AXIS_GUTTER : 0;
  const layout: Layout = { gutter: gutterWidth, labelColumn: labelCol, areaWidth, areaRows, width };

  const rowsPer = Math.max(1, Math.floor(areaRows / n));
  const out: string[] = [];

  for (let ci = 0; ci < n; ci += 1) {
    const sr = block.series[ci];
    const band = sr
      ? bandBuilder(sr, areaWidth, rowsPer)
      : Array.from({ length: rowsPer }, () => " ".repeat(areaWidth));
    const labelRow = Math.floor(rowsPer / 2);
    const styled = slot(refOf(sr ?? { values: [] }, ci), ctx.theme, ctx.capabilities);

    for (let r = 0; r < rowsPer && out.length < areaRows; r += 1) { // cells-ok — a row count
      const label = r === labelRow ? truncate(cats[ci] ?? "", labelCol, ctx.capabilities) : "";
      out.push(
        line(
          [
            ...gutterSpans(label, layout, ctx),
            { text: truncate(band[r] ?? " ".repeat(areaWidth), areaWidth, ctx.capabilities), style: styled },
          ],
          layout,
          ctx,
        ),
      );
    }
  }

  while (out.length < areaRows) out.push(line(gutterSpans("", layout, ctx), layout, ctx)); // cells-ok — a row count
  if (axed) out.push(...axisRows(block, layout, ctx));
  return out;
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
      return categoricalForm(grouped, width, ctx, (_label, aw) =>
        barRow(ordered[oi++] ?? null, base, data.max, aw, ctx.capabilities, true, block.yFormat),
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
    const { labels, counts } = binValues(s.values, block.binning ?? "sturges");
    if (counts.length === 0) return emptyRows(block, { gutter: 0, labelColumn: 0, areaWidth: width, areaRows: plotAreaRows(block), width }, ctx); // cells-ok — a bin count
    const maxCount = Math.max(...counts);
    const histBlock = { ...block, categories: labels };
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
    let qi = 0;
    return categoricalForm(block, width, ctx, (_label, aw) => {
      const q = qs[qi++];
      return q ? boxplotRow(q, lo, hi, aw, ctx.capabilities) : "";
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
    let qi = 0;
    return categoricalForm(block, width, ctx, (_label, aw) => {
      const q = qs[qi++];
      return q ? forestRow(q, lo, hi, aw, ctx.capabilities) : "";
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
          const ref = CATEGORY_REFS[runIdx % CATEGORY_REFS.length] ?? "categorical.c1"; // cells-ok — a segment index
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
  flame: (block, width, ctx) => {
    const data = seriesRange(block.series, block);
    if (data === null) return emptyRows(block, { gutter: 0, labelColumn: 0, areaWidth: width, areaRows: plotAreaRows(block), width }, ctx);
    let ri = 0;
    return categoricalForm(block, width, ctx, (_label, aw) => {
      const v = block.series[0]?.values[ri++] ?? null;
      return barRow(v, baselineFor(data.min), data.max, aw, ctx.capabilities, false);
    });
  },
  icicle: (block, width, ctx) => {
    const data = seriesRange(block.series, block);
    if (data === null) return emptyRows(block, { gutter: 0, labelColumn: 0, areaWidth: width, areaRows: plotAreaRows(block), width }, ctx);
    const cats = [...(block.categories ?? [])].reverse();
    const vals = [...(block.series[0]?.values ?? [])].reverse();
    const flipped = { ...block, categories: cats, series: [{ ...block.series[0]!, values: vals }] };
    let ri = 0;
    return categoricalForm(flipped, width, ctx, (_label, aw) => {
      const v = flipped.series[0]?.values[ri++] ?? null;
      return barRow(v, baselineFor(data.min), data.max, aw, ctx.capabilities, false);
    });
  },
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
  streamgraph: (block, width, ctx) => {
    const data = seriesRange(block.series, block);
    if (data === null) return emptyRows(block, { gutter: 0, labelColumn: 0, areaWidth: width, areaRows: plotAreaRows(block), width }, ctx);
    return positionalForm(block, width, ctx, styleRasteriser(block, ctx.capabilities, curveRows));
  },
  calendar: (block, width, ctx) => heatmapFormRows(block, width, ctx),
  correlation: (block, width, ctx) => heatmapFormRows(block, width, ctx),
  confusion: (block, width, ctx) => heatmapFormRows(block, width, ctx),
  spectrogram: (block, width, ctx) => heatmapFormRows(block, width, ctx),
  latency: (block, width, ctx) => heatmapFormRows(block, width, ctx),
  density2d: (block, width, ctx) => heatmapFormRows(block, width, ctx),
  density: (block, width, ctx) => {
    const s = block.series[0];
    if (!s) return emptyRows(block, { gutter: 0, labelColumn: 0, areaWidth: width, areaRows: plotAreaRows(block), width }, ctx);
    const { series: ds, range } = densitySeries(s);
    const densityBlock = { ...block, series: [ds], yMin: range.min, yMax: range.max };
    return positionalForm(densityBlock, width, ctx, styleRasteriser(block, ctx.capabilities, densityRows));
  },
  violin: (block, width, ctx) => {
    const cats = block.categories ?? block.series.map((sr, i) => sr.label ?? `series ${String(i + 1)}`);
    return bandedForm(block, cats, width, ctx, (sr, aw, rows) =>
      violinRows(sr, aw, rows, ctx.capabilities),
    );
  },
  ridgeline: (block, width, ctx) => {
    const cats = block.series.map((sr, i) => sr.label ?? `series ${String(i + 1)}`);
    return bandedForm(block, cats, width, ctx, (sr, aw, rows) =>
      ridgeRows(sr, aw, rows, ctx.capabilities),
    );
  },
  smallmultiples: (block, width, ctx) => {
    const facets = block.facets ?? [];
    const areaRows = plotAreaRows(block);
    if (facets.length === 0) return emptyRows(block, { gutter: 0, labelColumn: 0, areaWidth: width, areaRows, width }, ctx); // cells-ok — a facet count
    return smallMultiplesRows(facets, width, ctx, FORM_ROWS).map((r) =>
      line([{ text: r }], { gutter: 0, labelColumn: 0, areaWidth: width, areaRows, width }, ctx),
    );
  },
  pairplot: (block, width, ctx) => {
    const facets = block.facets ?? [];
    const areaRows = plotAreaRows(block);
    if (facets.length === 0) return emptyRows(block, { gutter: 0, labelColumn: 0, areaWidth: width, areaRows, width }, ctx); // cells-ok — a facet count
    return smallMultiplesRows(facets, width, ctx, FORM_ROWS).map((r) =>
      line([{ text: r }], { gutter: 0, labelColumn: 0, areaWidth: width, areaRows, width }, ctx),
    );
  },
  pie: (block, width, ctx) => {
    const segs = block.segments ?? [];
    const areaRows = plotAreaRows(block);
    const layout: Layout = { gutter: 0, labelColumn: 0, areaWidth: width, areaRows, width };
    if (segs.length === 0) return emptyRows(block, layout, ctx); // cells-ok — a segment count
    if (ctx.capabilities.unicode === "ascii") {
      return waffleRows(segs, width, ctx.capabilities).map((r) => line([{ text: r }], layout, ctx));
    }
    const fills: Layer[] = pieLayers(segs, width, areaRows).map((pl) => ({
      glyphRows: pl.glyphRows,
      ref: CATEGORY_REFS[pl.segmentIndex % CATEGORY_REFS.length] ?? "categorical.c1", // cells-ok — a segment index
    }));
    // The boundary first, so it wins the cells it occupies: `mergedRow` resolves
    // first-non-blank, and a crisp outline over a braille interior is the point.
    const outline: readonly Layer[] =
      ctx.capabilities.ambiguousWidth === "wide"
        ? []
        : [{ glyphRows: circleOutline(width, areaRows, block.plotCorners ?? "rounded"), ref: "tone.muted" }];
    const layers: readonly Layer[] = [...outline, ...fills];
    if (fills.length === 0) return emptyRows(block, layout, ctx); // cells-ok — a layer count
    const out: string[] = [];
    for (let r = 0; r < areaRows; r++) {
      out.push(line(mergedRow(layers, r, layout, ctx), layout, ctx));
    }
    return out;
  },
  radar: (block, width, ctx) => {
    const cats = block.categories ?? [];
    const areaRows = plotAreaRows(block);
    if (cats.length === 0 || block.series.length === 0) return emptyRows(block, { gutter: 0, labelColumn: 0, areaWidth: width, areaRows, width }, ctx); // cells-ok — a category count
    if (ctx.capabilities.unicode === "ascii") {
      return radarAsciiRows(block.series, cats, width).map((r) =>
        line([{ text: r }], { gutter: 0, labelColumn: 0, areaWidth: width, areaRows, width }, ctx),
      );
    }
    const layout: Layout = { gutter: 0, labelColumn: 0, areaWidth: width, areaRows, width };
    // One layer per series, each carrying its own palette slot — the radar was
    // a single braille grid, so every series in it was one colour and one shape.
    const corners = block.plotCorners ?? "rounded";
    const series: readonly Layer[] = radarOutlines(
      block.series, cats, width, areaRows, corners,
    ).map((glyphRows, i) => ({ glyphRows, ref: refOf(block.series[i] ?? { values: [] }, i) }));
    // The frame last, so a series wins any cell they share (`mergedRow` takes
    // first-non-blank) — the scale is context, never the reading.
    const layers: readonly Layer[] = [
      ...series,
      { glyphRows: radarFrame(cats, width, areaRows, corners), ref: "tone.muted" },
    ];
    if (series.length === 0) return emptyRows(block, layout, ctx); // cells-ok — a layer count
    const out: string[] = [];
    for (let r = 0; r < areaRows; r += 1) out.push(line(mergedRow(layers, r, layout, ctx), layout, ctx));
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
