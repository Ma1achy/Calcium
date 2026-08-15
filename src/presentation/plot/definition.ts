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
import { clampSpans, paint, padStart, rows, tone, type Span } from "../blocks/paint.js";
import { cells, truncate } from "../text.js";
import { AXIS_GUTTER, plotAreaRows, plotHeight } from "./height.js";
import { curveRows, isBlank } from "./curve.js";
import { labelWidth, xLabelRow, yLabels } from "./axes.js";
import { seriesRange, type Range } from "./scale.js";
import { sparkline } from "./sparkline.js";
import { stripHeights } from "./strips.js";
import type { Plot, Series, Tone } from "../../data/viewmodel/index.js";
import type { BlockDefinition, RenderContext } from "../blocks/types.js";

/** The narrowest plot area worth drawing a curve in. Below it, furniture goes. */
const MIN_AREA = 4;

/** The tones series cycle through when there is colour to distinguish them. */
const SERIES_TONES: readonly Tone[] = Object.freeze(["accent", "info", "ok", "warn"]);

/** A rasterised series and the tone it carries. */
type Layer = Readonly<{ glyphRows: readonly string[]; tone: Tone }>;

/** Everything the row builders need, resolved once. */
type Layout = Readonly<{
  gutter: number;
  labelColumn: number;
  areaWidth: number;
  areaRows: number;
  width: number;
}>;

function toneOf(series: Series, index: number): Tone {
  return series.tone ?? SERIES_TONES[index % SERIES_TONES.length] ?? "accent"; // cells-ok — a tone-cycle index
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
  let runTone: Tone | null = null;

  const flush = (): void => {
    if (run === "") return;
    spans.push(
      runTone === null
        ? { text: run }
        : { text: run, style: tone(runTone, ctx.theme, ctx.capabilities) },
    );
    run = "";
  };

  for (let x = 0; x < layout.areaWidth; x += 1) {
    let cell = " ";
    let cellTone: Tone | null = null;
    for (const layer of layers) {
      const candidate = [...(layer.glyphRows[rowIndex] ?? "")][x] ?? " ";
      if (isBlank(candidate)) continue;
      cell = candidate;
      cellTone = layer.tone;
      break;
    }
    if (cellTone !== runTone) {
      flush();
      runTone = cellTone;
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
      const layer: Layer = { glyphRows, tone: toneOf(first, 0) };
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
    const layer: Layer = { glyphRows, tone: toneOf(s, index) };
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
    tone: toneOf(s, index),
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
function layoutFor(block: Plot, range: Range, width: number, stacked: boolean): Layout {
  const areaRows = plotAreaRows(block);
  const base = { areaRows, width };
  if (block.axes !== true) return { ...base, gutter: 0, labelColumn: 0, areaWidth: width };

  // **What the column holds depends on the form.** A stacked plot puts series
  // names there instead of the three y-labels (§5), and sizing the column from the
  // y-labels regardless is what pushed `train │` one cell past the width and left a
  // `…` on the first row of every stacked frame. Two different sets of strings, one
  // column: it has to be measured from whichever set will be drawn.
  const wanted = stacked
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

const render = (block: Plot, ctx: RenderContext): ReactElement => {
  const width = Math.max(1, Math.floor(ctx.width));

  if (block.form === "sparkline") {
    const first = block.series[0];
    const spark = sparkline(first?.values ?? [], width, ctx.capabilities);
    const layout: Layout = { gutter: 0, labelColumn: 0, areaWidth: width, areaRows: 1, width };
    return rows([
      line(
        [
          {
            text: spark,
            style: tone(
              first === undefined ? "default" : toneOf(first, 0),
              ctx.theme,
              ctx.capabilities,
            ),
          },
        ],
        layout,
        ctx,
      ),
    ]);
  }

  // `stacked` is decided before the layout, because it decides what the label
  // column holds and therefore how wide it is.
  const stacked = ctx.capabilities.colourDepth === 1 && block.series.length > 1; // cells-ok — a series count
  const range = seriesRange(block.series, block);
  const layout = layoutFor(block, range ?? { min: 0, max: 1 }, width, stacked);
  if (range === null) return rows(emptyRows(block, layout, ctx));

  const out = [
    ...(stacked ? stackedRows(block, range, layout, ctx) : overlaidRows(block, range, layout, ctx)),
  ];
  if (block.axes === true) out.push(...axisRows(block, layout, ctx));

  return rows(out);
};

export const plotDefinition: BlockDefinition<Plot> = {
  kind: "plot",
  measure,
  render,
};
