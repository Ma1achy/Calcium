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
import { cells, truncate } from "../text.js";
import { seriesRange } from "./scale.js";
import { formatValue } from "./axes.js";
import { clampSpans, paint, padStart, tone } from "../blocks/paint.js";
import { glyphs } from "../blocks/glyphs.js";
import { plotAreaRows, AXIS_GUTTER } from "./height.js";
import { xLabelRow } from "./axes.js";

const HEATMAP_ABSENT = " ";
const MIN_AREA = 4;

/** Whether a form's columns are a time window or a fixed set of categories. */
type MatrixLayout = "window" | "stretch";

/**
 * Which of the two a form is, as a table rather than a condition.
 *
 * Exhaustive over the seven forms this module renders, so a form added to the
 * family stops compiling until it says which axis its columns are — the check
 * beside the table is what let `confusion` inherit the ring's right-anchoring
 * in the first place.
 */
const MATRIX_LAYOUT: Readonly<Record<string, MatrixLayout>> = Object.freeze({
  // Time on the abscissa: readings arrive, newest on the right.
  heatmap: "window",
  spectrogram: "window",
  latency: "window",
  // Categories on the abscissa: a fixed grid that fills the area.
  confusion: "stretch",
  correlation: "stretch",
  calendar: "stretch",
  density2d: "stretch",
});

/**
 * The map a form draws with when the block names none.
 *
 * **Absent is a default, not an absence.** Density carries the value at every
 * depth and colour joins it above 8-bit (F34), so a heatmap with no `colormap`
 * was correct and grey — and grey is what every catalogue frame showed. The
 * kind decides: a correlation runs −1 → 0 → +1 and wants a diverging map, and
 * reading it in a sequential one is the single most common chart defect there
 * is. A declared `colormap` still wins.
 */
const DEFAULT_COLORMAP: Readonly<Record<string, string>> = Object.freeze({
  heatmap: "viridis",
  spectrogram: "viridis",
  latency: "viridis",
  confusion: "viridis",
  calendar: "viridis",
  density2d: "viridis",
  correlation: "coolwarm",
});

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

/**
 * Which reading each cell column shows, or `null` for a blank.
 *
 * **The two axes are not the same axis, and treating them as one is the
 * defect.** A `heatmap` over a ring is a *time* series — readings arrive and
 * the newest belongs on the right, so a short series is right-anchored and the
 * left is blank. A `confusion` matrix's columns are *categories*: three of
 * them, fixed, and right-anchoring them put a 3×3 matrix in the last three
 * cells of a seventy-four cell area with the labels stranded at the far left.
 * Both are heatmaps and only one of them has a window.
 *
 * **One map, read by both the glyph and the colour path.** They used to derive
 * the window separately — a mutation that left-anchored the colours failed
 * nothing, because every fixture had exactly as many readings as cells. The
 * duplication is what made that possible, so it is gone rather than guarded.
 */
function columnMap(count: number, width: number, layout: MatrixLayout): readonly (number | null)[] {
  const w = Math.max(0, Math.floor(width));
  const out: (number | null)[] = [];
  if (w === 0 || count <= 0) return out;

  if (layout === "stretch") {
    // Every column belongs to a reading; a reading spans as many columns as it
    // takes to fill the area, so the matrix is a grid rather than a fringe.
    for (let x = 0; x < w; x += 1) out.push(Math.min(count - 1, Math.floor((x * count) / w)));
    return out;
  }

  // The last `w` readings, right-anchored: fewer readings than cells reads as
  // "this many so far, growing rightward" rather than as a stretched history.
  const start = Math.max(0, count - w);
  const pad = Math.max(0, w - count);
  for (let x = 0; x < w; x += 1) out.push(x < pad ? null : start + (x - pad));
  return out;
}

function heatSpans(
  series: Series,
  range: Range,
  layout: Layout,
  map: Colormap | undefined,
  style: Readonly<{ ramp: string; absent: string }>,
  ctx: RenderContext,
  matrixLayout: MatrixLayout,
): readonly Span[] {
  const w = Math.max(0, Math.floor(layout.areaWidth));
  const columns = columnMap(series.values.length, w, matrixLayout); // cells-ok — a position count
  const ramp = [...style.ramp];
  const steps = ramp.length; // cells-ok — a ramp length
  const span = range.max - range.min;

  const readingAt = (x: number): number | null => {
    const i = columns[x];
    if (i === null || i === undefined) return null;
    const v = series.values[i];
    return v === null || v === undefined || !Number.isFinite(v) ? null : v;
  };

  const glyphAt = (x: number): string => {
    const v = readingAt(x);
    if (v === null) return style.absent;
    if (span <= 0) return ramp[Math.floor((steps - 1) / 2)] ?? style.absent;
    const t = (v - range.min) / span;
    return ramp[Math.round((t < 0 ? 0 : t > 1 ? 1 : t) * (steps - 1))] ?? style.absent;
  };

  const colourAt = (x: number): ColourValue | undefined => {
    if (map === undefined) return undefined;
    const v = readingAt(x);
    if (v === null) return undefined;
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

  for (let x = 0; x < w; x += 1) {
    const colour = colourAt(x);
    if (colour !== runColour) {
      flush();
      runColour = colour;
    }
    run += glyphAt(x);
  }
  flush();
  return out;
}

function colormapFor(block: Plot): Colormap | undefined {
  const named = block.colormap ?? DEFAULT_COLORMAP[block.form];
  return named === undefined ? undefined : COLORMAPS[named];
}

function matrixRows(
  block: Plot,
  range: Range,
  layout: Layout,
  ctx: RenderContext,
): readonly string[] {
  const style = { ramp: ladderFor("density", ctx.capabilities).steps, absent: HEATMAP_ABSENT };
  const map = colormapFor(block);
  const matrixLayout = MATRIX_LAYOUT[block.form] ?? "window";
  const out: string[] = [];

  const overflow = block.series.length > layout.areaRows; // cells-ok — a row count
  const visible = overflow ? Math.max(0, layout.areaRows - 1) : block.series.length; // cells-ok

  for (let i = 0; i < visible; i += 1) {
    const s = block.series[i];
    if (s === undefined) continue;
    out.push(
      linePaint(
        [...gutterSpans(s.label ?? "", layout, ctx), ...heatSpans(s, range, layout, map, style, ctx, matrixLayout)],
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
