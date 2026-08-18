/**
 * Heatmap and its six variants — seven forms, one module.
 *
 * Rebuilt fresh alongside the variants rather than extracted from definition.ts.
 * All share: density ramp from ramp.ts, continuous colour from colormap.ts,
 * equal-length row validation, axes required.
 */
import type { AmbiguousWidth } from "../text.js";
import type { Plot, Series } from "../../data/viewmodel/index.js";
import type { Span } from "../blocks/paint.js";
import type { RenderContext } from "../blocks/types.js";
import type { Range } from "./scale.js";
import type { ColourValue } from "../theme/types.js";
import type { Colormap } from "../theme/colormap.js";
import { COLORMAPS, continuousColour } from "../theme/colormap.js";
import { ladderFor } from "./ramp.js";
import { rampRow } from "./sparkline.js";
import { cells, truncate } from "../text.js";
import { seriesRange } from "./scale.js";
import { formatValue } from "./axes.js";
import { clampSpans, paint, padStart, tone } from "../blocks/paint.js";
import { glyphs } from "../blocks/glyphs.js";
import { plotAreaRows, AXIS_GUTTER } from "./height.js";
import { xLabelRow } from "./axes.js";

const HEATMAP_ABSENT = " ";
const MIN_AREA = 4;

type Layout = Readonly<{
  gutter: number;
  labelColumn: number;
  areaWidth: number;
  areaRows: number;
  width: number;
}>;

function linePaint(spans: readonly Span[], layout: Layout, ctx: RenderContext): string {
  return paint(clampSpans(spans, layout.width, ctx.capabilities));
}

function gutterSpans(label: string, layout: Layout, ctx: RenderContext): readonly Span[] {
  if (layout.gutter === 0) return [];
  const g = glyphs(ctx.capabilities);
  const muted = tone("muted", ctx.theme, ctx.capabilities);
  return [
    { text: padStart(label, layout.labelColumn), style: muted },
    { text: ` ${g.vertical}`, style: muted },
  ];
}

function seriesLabelWidth(series: readonly Series[], ambiguous: AmbiguousWidth = "narrow"): number {
  let widest = 0;
  for (const s of series) widest = Math.max(widest, cells(s.label ?? "", ambiguous));
  return widest;
}

function layoutFor(block: Plot, width: number): Layout | null {
  const areaRows = plotAreaRows(block);
  const base = { areaRows, width };
  const wanted = seriesLabelWidth(block.series);

  if (width - wanted - AXIS_GUTTER >= MIN_AREA) {
    return {
      ...base,
      gutter: wanted + AXIS_GUTTER,
      labelColumn: wanted,
      areaWidth: width - wanted - AXIS_GUTTER,
    };
  }

  const room = width - AXIS_GUTTER - MIN_AREA;
  if (room < 1) return null;
  return { ...base, gutter: room + AXIS_GUTTER, labelColumn: room, areaWidth: MIN_AREA };
}

function heatSpans(
  series: Series,
  range: Range,
  layout: Layout,
  map: Colormap | undefined,
  style: Readonly<{ ramp: string; absent: string }>,
  ctx: RenderContext,
): readonly Span[] {
  const glyphStr = rampRow(series.values, layout.areaWidth, ctx.capabilities, range, style);
  if (map === undefined) return [{ text: glyphStr }];

  const w = Math.max(0, Math.floor(layout.areaWidth));
  const window = series.values.slice(Math.max(0, series.values.length - w)); // cells-ok — a position count
  const pad = Math.max(0, w - window.length); // cells-ok — a position count

  const span = range.max - range.min;
  const colourAt = (index: number): ColourValue | undefined => {
    const v = window[index - pad];
    if (v === null || v === undefined || !Number.isFinite(v)) return undefined;
    return continuousColour(map, span <= 0 ? 0.5 : (v - range.min) / span, ctx.capabilities);
  };

  const out: Span[] = [];
  let run = "";
  let runColour: ColourValue | undefined;
  const flush = (): void => {
    if (run === "") return;
    out.push(runColour === undefined ? { text: run } : { text: run, style: { colour: runColour } });
    run = "";
  };

  [...glyphStr].forEach((glyph, index) => {
    const colour = colourAt(index);
    if (colour !== runColour) {
      flush();
      runColour = colour;
    }
    run += glyph;
  });
  flush();
  return out;
}

function matrixRows(
  block: Plot,
  range: Range,
  layout: Layout,
  ctx: RenderContext,
): readonly string[] {
  const style = { ramp: ladderFor("density", ctx.capabilities).steps, absent: HEATMAP_ABSENT };
  const map = block.colormap === undefined ? undefined : COLORMAPS[block.colormap];
  const out: string[] = [];

  const overflow = block.series.length > layout.areaRows; // cells-ok — a row count
  const visible = overflow ? Math.max(0, layout.areaRows - 1) : block.series.length; // cells-ok

  for (let i = 0; i < visible; i += 1) {
    const s = block.series[i];
    if (s === undefined) continue;
    out.push(
      linePaint(
        [...gutterSpans(s.label ?? "", layout, ctx), ...heatSpans(s, range, layout, map, style, ctx)],
        layout,
        ctx,
      ),
    );
  }

  if (overflow) {
    const omitted = block.series.slice(visible).map((s, i) => s.label ?? `row ${String(visible + i + 1)}`); // cells-ok
    out.push(
      linePaint(
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

  const blanks = Math.max(0, layout.areaRows - out.length); // cells-ok — a row count
  for (let i = 0; i < blanks; i += 1) {
    out.push(linePaint(gutterSpans("", layout, ctx), layout, ctx));
  }
  return out;
}

function matrixFurniture(
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
      : linePaint([{ text: " ".repeat(layout.gutter) }, { text: labels, style: muted }], layout, ctx);

  const longest = block.series.reduce((n, s) => Math.max(n, s.values.length), 0); // cells-ok — a position count
  const dropped = Math.max(0, longest - layout.areaWidth);

  const range_ = `${formatValue(range.min, block.yFormat)} - ${formatValue(range.max, block.yFormat)}`;
  const swatch = ladderFor("density", ctx.capabilities).steps;
  const clause = dropped === 0 ? "" : ` · ${String(dropped)} older not shown`; // cells-ok — a position count
  const fits = (t: string): boolean => cells(t, ctx.capabilities.ambiguousWidth) <= layout.width;
  const legend = [`${swatch}  ${range_}${clause}`, `${swatch}  ${range_}`, range_].find(fits) ?? "";

  return [
    labelRow,
    linePaint([{ text: truncate(legend, layout.width, ctx.capabilities), style: muted }], layout, ctx),
  ];
}

function emptyRows(block: Plot, layout: Layout, ctx: RenderContext): readonly string[] {
  const total = plotAreaRows(block) + 2;
  const message = truncate(block.emptyMessage ?? "No data.", layout.width, ctx.capabilities);
  const middle = Math.floor((total - 1) / 2);
  const centred =
    " ".repeat(Math.max(0, Math.floor((layout.width - cells(message, ctx.capabilities.ambiguousWidth)) / 2))) + message;
  const styled = linePaint(
    [{ text: centred, style: tone("muted", ctx.theme, ctx.capabilities) }],
    layout,
    ctx,
  );
  return Array.from({ length: total }, (_, i) => (i === middle ? styled : ""));
}

/**
 * Render a heatmap-family form. All seven forms share this path; the only
 * difference is axis semantics (handled by the caller's field choices).
 */
export function heatmapFormRows(
  block: Plot,
  width: number,
  ctx: RenderContext,
): readonly string[] {
  const range = seriesRange(block.series, block);
  const layout = layoutFor(block, width);

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

  if (range === null) return emptyRows(block, layout, ctx);
  return [...matrixRows(block, range, layout, ctx), ...matrixFurniture(block, range, layout, ctx)];
}
