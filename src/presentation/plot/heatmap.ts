/**
 * Heatmap and its six variants — seven forms, one module.
 *
 * Rebuilt fresh alongside the variants rather than extracted from definition.ts.
 * All share: density ramp from ramp.ts, continuous colour from colormap.ts,
 * equal-length row validation, axes required.
 */
import type { Plot, PlotForm, Series } from "../../data/viewmodel/index.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";
import type { Span } from "../blocks/paint.js";
import { spanCells, wash } from "../blocks/paint.js";
import type { RenderContext } from "../blocks/types.js";
import type { Range } from "./scale.js";
import type { ColourValue } from "../theme/types.js";
import type { Colormap } from "../theme/colormap.js";
import type { ColormapName } from "../../data/colormaps/index.js";
import { COLORMAPS, continuousColour } from "../theme/colormap.js";
import { ladderFor } from "./ramp.js";
import { cells, truncate } from "../text.js";
import { seriesRange } from "./scale.js";
import { formatValue } from "./axes.js";
import { tone } from "../blocks/paint.js";
import { plotAreaRows, AXIS_GUTTER } from "./height.js";
import { xLabelRow } from "./axes.js";
import { labelColumnWidth, line, plotRow, rightGutterWidth, yAxisSides, type Layout } from "./furniture.js";

const HEATMAP_ABSENT = " ";
const MIN_AREA = 4;

/** Whether a form's columns are a time window or a fixed set of categories. */
type MatrixLayout = NonNullable<Plot["matrixAnchor"]>;

/**
 * Which of the two a form is, as a table rather than a condition.
 *
 * Exhaustive over the seven forms this module renders, so a form added to the
 * family stops compiling until it says which axis its columns are — the check
 * beside the table is what let `confusion` inherit the ring's right-anchoring
 * in the first place.
 */
/**
 * Where each matrix form puts a row shorter than its width (C12 §3o).
 *
 * **Total over `PlotForm`, and `utilisation` is why.** It was
 * `Record<string, …>`, so the eighth matrix form fell through it and inherited a
 * default nobody chose — the class the four silent tables were about, found by
 * the first member added after they were closed. `null` is *not a matrix*, which
 * is a different answer from *a matrix with no preference*.
 */
const MATRIX_LAYOUT: Readonly<Record<PlotForm, MatrixLayout | null>> = Object.freeze({
  // **Every matrix stretches by default, including the feeds** — the reported
  // defect was a heatmap's blank fringe, and *the column a reading occupies must
  // not move* is a real argument that loses to it. A live feed wanting the
  // anchor now says so, which also means the caller who needs it is the one who
  // knows they do.
  heatmap: "stretch",
  spectrogram: "stretch",
  latency: "stretch",
  confusion: "stretch",
  correlation: "stretch",
  calendar: "stretch",
  density2d: "stretch",
  utilisation: "stretch",
  // Not matrix forms.
  line: null, sparkline: null, scatter: null, step: null, ecdf: null, density: null,
  bar: null, histogram: null, boxplot: null, violin: null, ridgeline: null,
  forest: null, dumbbell: null, lollipop: null, dotplot: null, waffle: null,
  flame: null, icicle: null, treemap: null, funnel: null, gantt: null,
  waterfall: null, streamgraph: null, stackedarea: null,
  smallmultiples: null, pairplot: null, pie: null, radar: null, horizon: null,
  slope: null, bubble: null, autocorrelation: null, timeline: null, bullet: null,
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
/**
 * **Total over `PlotForm`, and `utilisation` is why.**
 *
 * This was `Record<string, string>` — one of the four silent tables — so a
 * matrix form added without an entry did not fail to compile. `utilisation`
 * was, and `colormapFor` returned undefined for it at every colour depth, so a
 * 24-bit terminal drew a braille density ramp and a monochrome legend. The
 * defect is invisible in the stripped frame, because a washed heatmap is blank
 * there by construction: the colour is a background.
 *
 * `MATRIX_LAYOUT` above was closed in the same sweep and this one was not,
 * which is the argument for closing a class rather than an instance.
 */
const DEFAULT_COLORMAP: Readonly<Record<PlotForm, ColormapName | null>> = Object.freeze({
  heatmap: "viridis",
  spectrogram: "viridis",
  latency: "viridis",
  confusion: "viridis",
  calendar: "viridis",
  density2d: "viridis",
  correlation: "coolwarm",
  // Load reads as a temperature, and the convention every dashboard uses is a
  // warm ramp rather than a perceptual one — `viridis` says *more* where a
  // reader of a utilisation strip wants *hotter*.
  utilisation: "inferno",
  // Not matrix forms.
  line: null, sparkline: null, scatter: null, step: null, ecdf: null, density: null,
  bar: null, histogram: null, boxplot: null, violin: null, ridgeline: null,
  forest: null, dumbbell: null, lollipop: null, dotplot: null, waffle: null,
  flame: null, icicle: null, treemap: null, funnel: null, gantt: null,
  waterfall: null, streamgraph: null, stackedarea: null,
  smallmultiples: null, pairplot: null, pie: null, radar: null, horizon: null,
  slope: null, bubble: null, autocorrelation: null, timeline: null, bullet: null,
});

/**
 * **No frame, and §2 is why.** A matrix's cells bound themselves, so there is
 * nothing for a rule to delimit and the row a lid would take pays for the scale
 * legend instead — the only thing that says what a cell means. The left border
 * and its ticks stay: a row label *is* the ordinate here (I18), so every row is
 * a labelled row and every row gets its mark, which is termplot's histogram
 * exactly.
 */
function layoutFor(block: Plot, width: number, caps: Pick<TerminalCapabilities, "ambiguousWidth">): Layout | null {
  const areaRows = plotAreaRows(block);
  const base = { areaRows, width };
  const wanted = labelColumnWidth(block.series.map((s) => s.label ?? ""), caps.ambiguousWidth);

  // **The matrix's right gutter brings its own edge glyph** (I47). §2 says a
  // matrix has no *frame* because its cells bound themselves — the `│` in its
  // left gutter is the **axis**, not the frame, so the mirror of that axis is a
  // second `│` and not a border this form declined.
  const sides = yAxisSides(block);
  const left = sides.left ? wanted : 0; // cells-ok — a cell width
  const right = sides.right ? wanted : 0; // cells-ok — a cell width
  const rightEdge = right > 0 ? rightGutterWidth(right) : 0; // cells-ok — a cell width

  if (width - left - AXIS_GUTTER - rightEdge >= MIN_AREA) {
    return {
      ...base,
      gutter: left + AXIS_GUTTER,
      labelColumn: left,
      rightColumn: right,
      areaWidth: width - left - AXIS_GUTTER - rightEdge,
      ...(right > 0 ? { frame: true } : {}),
    };
  }

  // The right column goes whole before the left one shrinks: it is a copy, and
  // I18's ladder is about the labels a matrix cannot do without.
  if (right > 0 && width - left - AXIS_GUTTER >= MIN_AREA) {
    return {
      ...base,
      gutter: left + AXIS_GUTTER,
      labelColumn: left,
      areaWidth: width - left - AXIS_GUTTER,
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

  if (layout === "left") {
    // Grows from the left and scrolls once full — a feed read as history, where
    // the *oldest* column is the fixed one.
    const from = Math.max(0, count - w);
    for (let x = 0; x < w; x += 1) out.push(x < count - from ? from + x : null); // cells-ok — a column index
    return out;
  }

  // "window": the last `w` readings, right-anchored. **Correct for a live feed
  // and the reported defect as a default** — a column a reading occupies must
  // not move every tick, which is what anchoring buys, and a matrix of
  // categories has no time axis to anchor to and loses the width instead.
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

  /**
   * **The colour leads and the glyph is the fallback** (C12 I29, C10 §4c).
   *
   * A cell with a colour is a *painted blank* — the background is the reading,
   * which is what makes a matrix read as the continuous field it is instead of
   * as dithered speckle. A foreground glyph occupies its cell whatever colour
   * goes over it, so the old arrangement had the ramp carrying magnitude and
   * the colour decorating it; C12 I17 had ruled that way round precisely because
   * density survives 1-bit, and rendered it is speckle.
   *
   * Where `colourAt` gives nothing the density ramp takes over unchanged, which
   * is every terminal below 8-bit (C10 I31: a continuous map there is an
   * ordering over sixteen indices whose luminances nobody reports). **An absent
   * cell is never painted** — it must stay distinguishable from a minimum one
   * (C12 I17, T1.21), and a wash of the minimum colour is exactly the confusion
   * that rule forbids.
   */
  // The run's width is **counted, not measured** (SS23): one cell is appended
  // per column, so the number is known and `cells()` would be re-deriving it
  // from the string it was built from.
  let runCells = 0; // cells-ok — a cell count accumulated one column at a time
  const flush = (): void => {
    if (run === "") return;
    out.push(runColour === undefined ? { text: run } : wash(runCells, runColour));
    run = "";
    runCells = 0;
  };

  for (let x = 0; x < w; x += 1) {
    const colour = readingAt(x) === null ? undefined : colourAt(x);
    if (colour !== runColour) {
      flush();
      runColour = colour;
    }
    run += colour === undefined ? glyphAt(x) : " ";
    runCells += 1;
  }
  flush();
  return out;
}

function colormapFor(block: Plot): Colormap | undefined {
  const named = block.colormap ?? DEFAULT_COLORMAP[block.form];
  return named === null || named === undefined ? undefined : COLORMAPS[named];
}

function matrixRows(
  block: Plot,
  range: Range,
  layout: Layout,
  ctx: RenderContext,
): readonly string[] {
  const style = { ramp: ladderFor("density", ctx.capabilities).steps, absent: HEATMAP_ABSENT };
  const map = colormapFor(block);
  // The caller's choice wins, then the form's, then `stretch` — which is the
  // safe fallback rather than `window`: a form with no entry is one nobody
  // decided about, and blanking most of the width is not a neutral answer.
  const matrixLayout = block.matrixAnchor ?? MATRIX_LAYOUT[block.form] ?? "stretch";
  const out: string[] = [];

  const overflow = block.series.length > layout.areaRows; // cells-ok — a row count
  const visible = overflow ? Math.max(0, layout.areaRows - 1) : block.series.length; // cells-ok

  for (let i = 0; i < visible; i += 1) {
    const s = block.series[i];
    if (s === undefined) continue;
    out.push(
      plotRow(
        i,
        s.label ?? "",
        heatSpans(s, range, layout, map, style, ctx, matrixLayout),
        layout,
        ctx,
      ),
    );
  }

  if (overflow) {
    const omitted = block.series.slice(visible).map((s, i) => s.label ?? `row ${String(visible + i + 1)}`); // cells-ok
    out.push(
      plotRow(
        visible,
        "",
        [{
          text: truncate(
            `+${String(omitted.length)} more · ${omitted.join(" · ")}`, // cells-ok — a row count
            layout.areaWidth,
            ctx.capabilities,
          ),
          style: tone("warn", ctx.theme, ctx.capabilities),
        }],
        layout,
        ctx,
      ),
    );
  }

  const blanks = Math.max(0, layout.areaRows - out.length); // cells-ok — a row count
  for (let i = 0; i < blanks; i += 1) {
    out.push(plotRow(out.length, "", [], layout, ctx)); // cells-ok — a row index
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
      : line([{ text: " ".repeat(layout.gutter) }, { text: labels, style: muted }], layout, ctx);

  const longest = block.series.reduce((n, s) => Math.max(n, s.values.length), 0); // cells-ok — a position count
  const dropped = Math.max(0, longest - layout.areaWidth);

  const lo = formatValue(range.min, block.yFormat);
  const hi = formatValue(range.max, block.yFormat);
  const clause = dropped === 0 ? "" : ` · ${String(dropped)} older not shown`; // cells-ok — a position count

  /**
   * **The legend descends the same ladder as the cell** (C12 I29, C10 §4c).
   *
   * A colour bar where the cells are painted, and the density swatch where they
   * are not. Retiring the swatch outright is the same error one layer up: it
   * says nothing once the ramp has stopped carrying magnitude, and below 8-bit
   * it is the *only* thing that means anything — `continuousColour` returns
   * `undefined` there, because a continuous map at 4-bit is an ordering over
   * sixteen indices whose luminances the terminal never reports (C10 I31).
   *
   * Granite's `Min ▮▮▮▮▮ Max` is the shape, so the bounds bracket the bar rather
   * than trailing it: the two numbers name the two ends they sit against.
   */
  const map = colormapFor(block);
  const SWATCH = 8; // cells-ok — a swatch width, one cell per ramp step
  const bar = (): readonly Span[] => {
    // **The condition is *can colour carry it*, not *is a colormap named*.**
    // `colormapFor` answers from the block and knows nothing about the
    // terminal; `continuousColour` is what declines, returning `undefined`
    // below 8-bit (C10 I31). Asking the first question drew eight blank cells
    // at 1-bit — a legend with a hole in it where its only carrier belongs —
    // and the frame is what showed it, because both readings produce a legend
    // of the same width.
    const swatch: readonly (ColourValue | undefined)[] = map === undefined
      ? []
      : Array.from({ length: SWATCH }, (_, i) => continuousColour(map, i / (SWATCH - 1), ctx.capabilities));
    if (swatch.length === 0 || swatch.some((c) => c === undefined)) { // cells-ok — an array length
      return [{ text: ladderFor("density", ctx.capabilities).steps, style: muted }];
    }
    return swatch.map((c) => wash(1, c!));
  };

  // The drop order T1.23 asserts, unchanged in kind and now measured over spans:
  // the trailing clause goes first, then the upper bound, then everything but
  // the bar. The *range* is what the legend is for, so it outlives the swatch.
  const muteds = (t: string): Span => ({ text: t, style: muted });
  const rungs: readonly (readonly Span[])[] = [
    [muteds(`${lo} `), ...bar(), muteds(` ${hi}${clause}`)],
    [muteds(`${lo} `), ...bar(), muteds(` ${hi}`)],
    [muteds(`${lo} - ${hi}`)],
  ];
  const legend = rungs.find((r) => spanCells(r, ctx.capabilities.ambiguousWidth) <= layout.width) ?? [];

  return [labelRow, line(legend, layout, ctx)];
}

function emptyRows(block: Plot, layout: Layout, ctx: RenderContext): readonly string[] {
  const total = plotAreaRows(block) + 2;
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
 * Render a heatmap-family form. All seven forms share this path; the only
 * difference is axis semantics (handled by the caller's field choices).
 */
export function heatmapFormRows(
  block: Plot,
  width: number,
  ctx: RenderContext,
): readonly string[] {
  const range = seriesRange(block.series, block);
  const layout = layoutFor(block, width, ctx.capabilities);

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
