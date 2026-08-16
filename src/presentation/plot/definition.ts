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
import { labelWidth, xLabelRow, yLabels } from "./axes.js";
import { seriesRange, type Range } from "./scale.js";
import { densityRampFor } from "./ramp.js";
import { formatValue } from "./axes.js";
import { rampRow, sparkline } from "./sparkline.js";
import { stripHeights } from "./strips.js";
import type { Plot, PlotForm, Series } from "../../data/viewmodel/index.js";
import type { ColourRef } from "../theme/index.js";
import type { BlockDefinition, RenderContext } from "../blocks/types.js";

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
function overlaidRows(
  block: Plot,
  range: Range,
  layout: Layout,
  ctx: RenderContext,
): readonly string[] {
  // **`labelColumn`, not `gutter`.** The middle layout keeps the axis and drops
  // the labels, so it has a gutter of 2 and a label column of 0 — and asking for
  // labels there emitted a four-cell label into a zero-cell column, which the row
  // clamp then turned into `0.82 │⢣…`. The narrow case is the one where a label is
  // most obviously wrong and least obviously checked.
  const labels = layout.labelColumn === 0 ? [] : yLabels(range, layout.areaRows, block.yFormat);
  const byRow = new Map(labels.map((l) => [l.row, l.text]));
  const layers: readonly Layer[] = block.series.map((s, index) => ({
    glyphRows: curveRows(s, range, layout.areaWidth, layout.areaRows, ctx.capabilities),
    ref: refOf(s, index),
  }));

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
    : labelWidth(yLabels(range, areaRows, block.yFormat));
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

/** A grid cell is blank where nothing was reported (C12 I17, §3a). */
const HEATMAP_ABSENT = " ";

/**
 * The matrix (I17). One cell per position per row, against the range of the
 * whole matrix — which is the only thing that makes it a matrix rather than a
 * stack of unrelated sparklines, and the reason the range is computed once here
 * and passed down rather than per row.
 */
function heatmapRows(
  block: Plot,
  range: Range,
  layout: Layout,
  ctx: RenderContext,
): readonly string[] {
  const style = { ramp: densityRampFor(ctx.capabilities), absent: HEATMAP_ABSENT };
  const out: string[] = [];

  // I8, unchanged: the rows that fit, then a line naming the rest. The marker is
  // that line and there is no field — a series dropped in silence is the failure
  // the branch exists to avoid, and a matrix has more rows to drop than a plot.
  const overflow = block.series.length > layout.areaRows; // cells-ok — a row count
  const visible = overflow ? Math.max(0, layout.areaRows - 1) : block.series.length; // cells-ok

  for (let i = 0; i < visible; i += 1) {
    const s = block.series[i];
    if (s === undefined) continue;
    out.push(
      line(
        [
          ...gutterSpans(s.label ?? "", layout, ctx),
          { text: rampRow(s.values, layout.areaWidth, ctx.capabilities, range, style) },
        ],
        layout,
        ctx,
      ),
    );
  }

  if (overflow) {
    const omitted = block.series.slice(visible).map((s, i) => s.label ?? `row ${String(visible + i + 1)}`); // cells-ok
    out.push(
      line(
        [
          ...gutterSpans("", layout, ctx),
          {
            text: truncate(
              `+${String(omitted.length)} more · ${omitted.join(" · ")}`, // cells-ok — a row count
              layout.areaWidth,
              ctx.capabilities,
            ),
            style: tone("warn", ctx.theme, ctx.capabilities),
          },
        ],
        layout,
        ctx,
      ),
    );
  }

  // Fewer rows than the declared height keeps the height: I1 is about the block,
  // and a matrix that shrank when a container stopped would move everything below
  // it at exactly the moment a reader is looking at why.
  const blanks = Math.max(0, layout.areaRows - out.length); // cells-ok — a row count
  for (let i = 0; i < blanks; i += 1) out.push(line(gutterSpans("", layout, ctx), layout, ctx));
  return out;
}

/**
 * The heatmap's two rows: x-labels, then the scale legend (§2).
 *
 * **Not the line's two rows.** There is no axis rule, because a matrix's cells
 * bound themselves — and the row it would have taken pays for the legend, which
 * is the only thing that says what a cell *means*. `axes: false` is refused at
 * construction for that reason (C04 I50b).
 */
function heatmapFurniture(
  block: Plot,
  range: Range,
  layout: Layout,
  ctx: RenderContext,
): readonly string[] {
  const muted = tone("muted", ctx.theme, ctx.capabilities);
  const labels = xLabelRow(block.xLabels, layout.areaWidth, ctx.capabilities);
  const labelRow =
    labels === ""
      ? ""
      : line([{ text: " ".repeat(layout.gutter) }, { text: labels, style: muted }], layout, ctx);

  // **Dropped columns are named rather than vanishing** (§6a B3, I8's principle).
  // The window is of the last `areaWidth` positions, and a reader who cannot see
  // that some are missing reads the visible ones as the whole history.
  const longest = block.series.reduce((n, s) => Math.max(n, s.values.length), 0); // cells-ok — a position count
  const dropped = Math.max(0, longest - layout.areaWidth);

  // **The legend spans the row, and its parts drop in order** (I19). It was
  // placed at the gutter offset — borrowing the plot area's reference for a row
  // that sits below the matrix rather than inside it — so a wide label column
  // left it a fraction of the width and cut the *range*, which is the one thing
  // it exists to state and the reason `axes: false` is refused.
  //
  // The range is last to go, then the swatch: a key to a scale nobody named is
  // decoration. The clause about dropped columns goes first because it is a
  // caveat about the picture, and the picture is still there without it.
  const range_ = `${formatValue(range.min, block.yFormat)} - ${formatValue(range.max, block.yFormat)}`;
  const swatch = densityRampFor(ctx.capabilities);
  const clause = dropped === 0 ? "" : ` · ${String(dropped)} older not shown`; // cells-ok — a position count
  const fits = (t: string): boolean => cells(t, ctx.capabilities.ambiguousWidth) <= layout.width;

  const legend = [`${swatch}  ${range_}${clause}`, `${swatch}  ${range_}`, range_].find(fits) ?? "";

  return [
    labelRow,
    line([{ text: truncate(legend, layout.width, ctx.capabilities), style: muted }], layout, ctx),
  ];
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

  line: (block, width, ctx) => {
    // `stacked` is decided before the layout, because it decides what the label
    // column holds and therefore how wide it is.
    const stacked = ctx.capabilities.colourDepth === 1 && block.series.length > 1; // cells-ok — a series count
    const range = seriesRange(block.series, block);
    // Never `null` for a line: the third rung is the heatmap's, and this arm
    // still ends at the full-width fallback. Narrowed here rather than widened
    // there, so the one form that can refuse a width is the one that says so.
    const layout =
      layoutFor(block, range ?? { min: 0, max: 1 }, width, stacked)
      ?? { areaRows: plotAreaRows(block), width, gutter: 0, labelColumn: 0, areaWidth: width };
    if (range === null) return emptyRows(block, layout, ctx);

    const out = [
      ...(stacked
        ? stackedRows(block, range, layout, ctx)
        : overlaidRows(block, range, layout, ctx)),
    ];
    if (block.axes === true) out.push(...axisRows(block, layout, ctx));
    return out;
  },

  heatmap: (block, width, ctx) => {
    const range = seriesRange(block.series, block);
    const layout = layoutFor(block, range ?? { min: 0, max: 1 }, width, false);
    // **Rung 3** (I18): no cell to spare for a label beside a minimum plot area,
    // so the block says so at its declared height rather than drawing a matrix
    // nobody can read. I1 holds — a plot that shrank at a narrow width would
    // move everything below it on a resize.
    if (layout === null) {
      const flat: Layout = {
        areaRows: plotAreaRows(block),
        width,
        gutter: 0,
        labelColumn: 0,
        areaWidth: width,
      };
      return emptyRows({ ...block, emptyMessage: "Too narrow." }, flat, ctx);
    }
    // **Empty is a property of the block, not of a row** (§6a A3): a matrix every
    // one of whose rows reported nothing is empty; a *row* that reported nothing
    // is a row of blanks and keeps its place.
    if (range === null) return emptyRows(block, layout, ctx);
    return [...heatmapRows(block, range, layout, ctx), ...heatmapFurniture(block, range, layout, ctx)];
  },
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
