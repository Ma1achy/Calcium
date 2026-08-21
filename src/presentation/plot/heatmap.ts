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
import type { Facing, Range } from "./scale.js";
import type { ColourValue } from "../theme/types.js";
import type { Colormap } from "../theme/colormap.js";
import type { ColormapName } from "../../data/colormaps/index.js";
import { COLORMAPS, continuousColour } from "../theme/colormap.js";
import { ladderFor } from "./ramp.js";
import { cells, truncate } from "../text.js";
import { FACING_MATRIX, facingOf, seriesRange } from "./scale.js";
import { formatValue } from "./axes.js";
import { tone } from "../blocks/paint.js";
import { plotAreaRows, AXIS_GUTTER } from "./height.js";
import { xLabelRow } from "./axes.js";
import { labelColumnWidth, line, plotRow, rightGutterWidth, yAxisSides, type Layout } from "./furniture.js";
import { IS_FIELD_FORM } from "../../data/viewmodel/index.js";
import { calendarCaptions, calendarGrid } from "./calendar.js";
import { parseStartDate } from "../../data/dates.js";
import { slot } from "../blocks/paint.js";
import { partSeparator, refOf } from "./marks.js";
import {
  contourCellRows, contourDotRows, contourLevels, dimColour, dimFactorFor, fieldSampler,
  arrowsFor, fieldPaintsUnder, glyphLayerOrder, magnitudeAt, magnitudeSeries, mergeFieldLayers,
  overlayGlyphs, quiverRows,
  type FieldLayer,
} from "./field.js";

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
  // A contour interpolates across whatever the map leaves visible, so a window
  // would contour part of the field and say nothing about it (§6d.1 row 8).
  contour: "stretch",
  // The arrows resample nearest, so a window would show real readings; a
  // vector field has no time axis to anchor to and stretches like the rest.
  quiver: "stretch",
  spectrogram: "stretch",
  latency: "stretch",
  confusion: "stretch",
  correlation: "stretch",
  // **The one form whose columns have a duration** (C12 I53, §3ae.5), so the
  // one that cannot stretch: a week is a week.
  calendar: "uniform",
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
  contour: "viridis",
  // Magnitude reads as *more*, and a perceptual ramp is what says so.
  quiver: "viridis",
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
  // **Not a matrix, and the only non-matrix form with an entry** (I52, §3z).
  // A horizon's band depth *is* a colour axis — its own header called the
  // compression *paid for in a colour axis the reader has to learn* while this
  // row was `null`, so the price was charged and the goods never arrived.
  // Diverging rather than sequential because the fold has two directions and a
  // diverging map's two halves are where the sign rides; a sequential map is
  // refused on signed data rather than drawing a trough in the same ramp as a
  // peak (§3z H3).
  horizon: "coolwarm",
  // Not matrix forms.
  line: null, sparkline: null, scatter: null, step: null, ecdf: null, density: null,
  bar: null, histogram: null, boxplot: null, violin: null, ridgeline: null,
  forest: null, dumbbell: null, lollipop: null, dotplot: null, waffle: null,
  flame: null, icicle: null, treemap: null, funnel: null, gantt: null,
  waterfall: null, streamgraph: null, stackedarea: null,
  smallmultiples: null, pairplot: null, pie: null, radar: null,
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
/**
 * Which reading each column holds, **and `origin` reverses the answer rather
 * than the question** (C12 §3ac A3).
 *
 * The anchor decides *which* readings are shown — `window` keeps the last `w`,
 * `left` keeps the oldest and scrolls — and the facing decides which end they
 * are drawn from. Reversing the map composes the two correctly and needs no
 * second rule: a right-facing origin with `matrixAnchor: "left"` puts the oldest
 * reading at the right and the blank fringe on the left, which is what §3o says
 * a fringe is. **Reversing the values instead would have changed which readings
 * a window selects**, and `origin` never changes what is shown.
 */
function columnMap(
  count: number,
  width: number,
  layout: MatrixLayout,
  facing: Facing,
): readonly (number | null)[] {
  const w = Math.max(0, Math.floor(width));
  const out: (number | null)[] = [];
  if (w === 0 || count <= 0) return out;
  const faced = (m: readonly (number | null)[]): readonly (number | null)[] =>
    facing.x === "left" ? [...m].reverse() : m;

  if (layout === "stretch") {
    // Every column belongs to a reading; a reading spans as many columns as it
    // takes to fill the area, so the matrix is a grid rather than a fringe.
    for (let x = 0; x < w; x += 1) out.push(Math.min(count - 1, Math.floor((x * count) / w)));
    return faced(out);
  }

  if (layout === "left") {
    // Grows from the left and scrolls once full — a feed read as history, where
    // the *oldest* column is the fixed one.
    const from = Math.max(0, count - w);
    for (let x = 0; x < w; x += 1) out.push(x < count - from ? from + x : null); // cells-ok — a column index
    return faced(out);
  }

  if (layout === "uniform") {
    // **Every column the same width** (C12 §3ae.5, I53). `stretch` differs by one
    // cell, which is nothing at a pitch of six and a doubling at a pitch of one
    // — and a two-cell period beside a one-cell one reads as two periods holding
    // the same reading, which is §6b B15's rule about a candle wider than its
    // neighbours, on its third consumer.
    //
    // **`left`'s rule for what does not fit**: the oldest drop first. The two
    // arms are identical wherever the pitch is one, which is exactly where a
    // mutation swapping them survives — a year of twelve months is twelve cells
    // under `left` and seventy-two here.
    const pitch = Math.max(1, Math.floor(w / count)); // cells-ok — a cell width
    const shown = Math.min(count, Math.floor(w / pitch)); // cells-ok — a column count
    const from = count - shown; // cells-ok — a reading index
    for (let x = 0; x < w; x += 1) {
      const k = Math.floor(x / pitch); // cells-ok — a column index
      out.push(k < shown ? from + k : null); // cells-ok — a column count
    }
    return faced(out);
  }

  // "window": the last `w` readings, right-anchored. **Correct for a live feed
  // and the reported defect as a default** — a column a reading occupies must
  // not move every tick, which is what anchoring buys, and a matrix of
  // categories has no time axis to anchor to and loses the width instead.
  const start = Math.max(0, count - w);
  const pad = Math.max(0, w - count);
  for (let x = 0; x < w; x += 1) out.push(x < pad ? null : start + (x - pad));
  return faced(out);
}

function heatSpans(
  series: Series,
  range: Range,
  layout: Layout,
  map: Colormap | undefined,
  style: Readonly<{ ramp: string; absent: string }>,
  ctx: RenderContext,
  matrixLayout: MatrixLayout,
  dim: number,
  painted: boolean,
  facing: Facing,
): readonly Span[] {
  const w = Math.max(0, Math.floor(layout.areaWidth));
  const columns = columnMap(series.values.length, w, matrixLayout, facing); // cells-ok — a position count
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
    if (map === undefined || !painted) return undefined;
    const v = readingAt(x);
    if (v === null) return undefined;
    const c = continuousColour(map, span <= 0 ? 0.5 : (v - range.min) / span, ctx.capabilities);
    // **`fieldDim` is applied here and only here** (I51). A dimmed colour is
    // still the reading, so it belongs where the reading becomes a colour rather
    // than in a pass that would have to know which cells were painted.
    return c === undefined ? undefined : dimColour(c, dim);
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
    // **A field the caller did not ask to paint draws nothing**, not a ramp:
    // `layers: ["contour"]` means lines on an unpainted area, and a density ramp
    // there is the field drawn in the one vocabulary that was declined (I51).
    run += colour === undefined ? (painted ? glyphAt(x) : " ") : " ";
    runCells += 1;
  }
  flush();
  return out;
}

export function colormapFor(block: Plot): Colormap | undefined {
  const named = block.colormap ?? DEFAULT_COLORMAP[block.form];
  return named === null || named === undefined ? undefined : COLORMAPS[named];
}

function matrixRows(
  block: Plot,
  range: Range,
  layout: Layout,
  ctx: RenderContext,
  overlay: readonly FieldLayer[],
  matrixLayout: MatrixLayout,
): readonly string[] {
  const style = { ramp: ladderFor("density", ctx.capabilities).steps, absent: HEATMAP_ABSENT };
  const map = colormapFor(block);
  // The caller's choice wins, then the form's, then `stretch` — which is the
  // safe fallback rather than `window`: a form with no entry is one nobody
  // decided about, and blanking most of the width is not a neutral answer.
  const painted = fieldPaintsUnder(block, overlay, ctx.capabilities);
  // The second argument is *which colour the reader will see*: below 24-bit
  // `continuousColour` quantises to the 256-cube, and the factor has to clear
  // the floor against the quantised colour rather than the sampled one.
  const dim = block.fieldDim === "floor" && map !== undefined
    ? dimFactorFor(map, ctx.capabilities.colourDepth < 24)
    : 1;
  const glyphInk = block.glyphInk ?? "own";
  const out: string[] = [];

  const overflow = block.series.length > layout.areaRows; // cells-ok — a row count
  const visible = overflow ? Math.max(0, layout.areaRows - 1) : block.series.length; // cells-ok

  // **`origin` moves where a row is drawn and never which rows are shown**
  // (C12 §3ac). The visible slice is `series[0 … visible − 1]` under all four
  // corners, so a matrix too tall for its area hides the same rows whichever way
  // it faces and `+N more` names the same set — the alternative is an origin
  // that silently changes the data.
  const facing = facingOf(block, FACING_MATRIX);
  for (let r = 0; r < visible; r += 1) {
    const i = facing.y === "up" ? visible - 1 - r : r; // cells-ok — a row index
    const s = block.series[i];
    if (s === undefined) continue;
    const field = heatSpans(s, range, layout, map, style, ctx, matrixLayout, dim, painted, facing);
    // **Pass 5 then pass 6** (§6d.2). The merge cannot see the background and
    // the ink pass needs both, which is why the second one runs here rather than
    // inside either rasteriser.
    // **The field overlay is rasterised in area coordinates**, so its row index
    // is the visual one — and `contour` and `quiver` are the two forms that
    // refuse `origin` for exactly that reason (§3ac): flipping the wash without
    // re-sampling the field would draw isolines over the wrong cells, and
    // mirroring the rasterised row is the braille dot permutation probe 3 ruled
    // out. With those two refused, `r` and `i` coincide wherever `overlay` is
    // non-empty.
    const merged = overlay.length === 0 // cells-ok — a layer count
      ? null
      : mergeFieldLayers(overlay, r, layout.areaWidth);
    out.push(
      plotRow(
        r,
        s.label ?? "",
        merged === null
          ? field
          : overlayGlyphs(
              field, merged.glyphs, merged.owners,
              (owner, r, x) => {
                const layer = overlay[owner]!;
                // **The layer's own datum wins where it has one** (I50): a
                // quiver's arrow is coloured by its magnitude, a contour's
                // stroke by its level's slot.
                const c = layer.cellColour?.(r, x);
                return c === undefined
                  ? slot(layer.ref, ctx.theme, ctx.capabilities)
                  : { colour: c };
              },
              glyphInk,
              r,
            ),
        layout,
        ctx,
      ),
    );
  }

  if (overflow) {
    const omitted = block.series.slice(visible).map((s, i) => s.label ?? `row ${String(visible + i + 1)}`); // cells-ok
    // **The notice keeps the last row under all four origins**, because it is
    // furniture rather than data and furniture does not flip — the same reason
    // the bottom rule stays at the bottom and only the order of its tick labels
    // follows the facing (§3ac B3). The rows above it hold the data, growing
    // downward from the lid or upward from just above this line.
    out.push(
      plotRow(
        visible,
        "",
        [{
          text: truncate(
            // C12 I54 — the separator is a mark and degrades with the terminal.
            `+${String(omitted.length)} more${partSeparator(ctx.capabilities)}` + // cells-ok — a row count
              `${omitted.join(partSeparator(ctx.capabilities))}`,
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
  matrixLayout: MatrixLayout,
): readonly string[] {
  const muted = tone("muted", ctx.theme, ctx.capabilities);
  // **The matrix's captions come through here and not `xRowFor`**, which is a
  // third caption builder and the reason a surviving mutation was right about a
  // remedy in the wrong file: `furnitureFor` is reached from `axed`, and a
  // matrix composes its own furniture. OR12's heatmap arm is what said so.
  const facing = facingOf(block, FACING_MATRIX);
  const longest = block.series.reduce((n, s) => Math.max(n, s.values.length), 0); // cells-ok — a position count

  /**
   * **The captions span the grid and not the area** (C12 §3ae.8).
   *
   * `left` has left a fringe since it was written and `uniform` leaves a larger
   * one, so a caption placed against the area's right edge names a column that
   * is not there. The extent is read off `columnMap`'s **own output** rather
   * than recomputed — the map already says which column holds which reading, so
   * the first and last non-null positions *are* the grid's edges, and a second
   * derivation is the defect this function's own comment records.
   *
   * **`window` keeps the area**, and that is a stated limit rather than an
   * oversight: its grid begins at `w − n`, so its captions need an offset
   * `xLabelRow` does not take (§3ae.7).
   */
  const grid = columnMap(longest, layout.areaWidth, matrixLayout, facing);
  const leading = grid.findIndex((c) => c !== null); // cells-ok — a column index
  const occupied = grid.reduce<number>((n, c, x) => (c === null ? n : x + 1), 0); // cells-ok — a cell width
  const captionWidth = leading === 0 ? occupied : layout.areaWidth; // cells-ok — a cell width

  const captions = block.xLabels ?? calendarCaptions(block, grid);
  const labels = xLabelRow(captions, captionWidth, ctx.capabilities, facing);
  const labelRow =
    labels === ""
      ? ""
      : line([{ text: " ".repeat(layout.gutter) }, { text: labels, style: muted }], layout, ctx);

  const dropped = Math.max(0, longest - layout.areaWidth);

  const lo = formatValue(range.min, block.yFormat);
  const hi = formatValue(range.max, block.yFormat);
  const clause = dropped === 0 // cells-ok — a position count
    ? ""
    : `${partSeparator(ctx.capabilities)}${String(dropped)} older not shown`;

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
  // **A level is named here and never on the line** (I49, §3y). A contour label
  // sits *in* the stroke it names, in a gap cut for it, and there is no
  // gap-cutting vocabulary — a label over a contour is the contour with a hole
  // in it, and at one cell per crossing the hole *is* the crossing. A level
  // outside the range is still named: dropping it makes an empty area
  // indistinguishable from a constant field.
  const levelText = block.form === "contour"
    ? `${partSeparator(ctx.capabilities)}` +
      `${contourLevels(block, range).map((v) => formatValue(v, block.yFormat)).join(" ")}`
    : "";
  const rungs: readonly (readonly Span[])[] = [
    [muteds(`${lo} `), ...bar(), muteds(` ${hi}${levelText}${clause}`)],
    [muteds(`${lo} `), ...bar(), muteds(` ${hi}${levelText}`)],
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
 * The glyph layers a field form draws, in **priority** order (I51, §6d.2).
 *
 * `glyphLayerOrder` has already reversed the caller's draw order and dropped
 * `field`, which has no glyph to occlude with. The arm is `STYLE_ARMS`' — braille
 * by default, because that is the one where the saddle's centre-value resolution
 * is visible at all (I49).
 */
function fieldLayers(
  block: Plot,
  range: Range,
  layout: Layout,
  ctx: RenderContext,
  ownField: boolean,
): readonly FieldLayer[] {
  if (!IS_FIELD_FORM[block.form]) return [];
  const order = glyphLayerOrder(block);
  if (order.length === 0) return []; // cells-ok — a layer count

  const sample = fieldSampler(block.series);
  const columns = block.series[0]?.values.length ?? 0; // cells-ok — a column count
  const span = { from: 0, to: Math.max(0, columns - 1), rows: block.series.length }; // cells-ok — a row count
  const levels = contourLevels(block, range);
  // **The style says which figure and the capability says which alphabet**
  // (C12 I54, §3af). This read `plotStyle` alone while `contourCellRows` — the
  // other arm, one call below — already took `ctx.capabilities` and already
  // degraded correctly, so an ASCII frame came back in braille and thirty-two
  // committed catalogue files carry it.
  const braille =
    (block.plotStyle ?? "auto") !== "line" && ctx.capabilities.unicode !== "ascii";

  const out: FieldLayer[] = [];
  for (const kind of order) {
    if (kind === "quiver") {
      // **One glyph per cell, nearest-resampled** — a contour runs *between*
      // readings and an arrow *is* one, so interpolating two vectors that point
      // opposite ways gives a still cell where the field is most active (I50).
      if (block.vectors !== undefined) {
        /**
         * **One datum, one channel — and which channel depends on whether there
         * is a second datum** (I50).
         *
         * Magnitude is the arrow's colour *where the field carries something
         * else*. Where the caller named no scalar the field **is** the
         * magnitude, so colouring the arrow by it too paints the glyph in
         * exactly its own cell's background: measured on the golden frame,
         * `38;2;33;145;141` on `48;2;33;145;141`, an invisible arrow at full
         * colour depth.
         *
         * Every assertion passed — the field painted, the arrows were there,
         * and more than two distinct colours appeared. **Only the frame showed
         * it**, and it is not low contrast but zero contrast, guaranteed by
         * construction rather than by a ramp's luminance.
         */
        const mag = magnitudeSeries(block.vectors);
        const mrange = ownField ? null : seriesRange(mag, {});
        const map = colormapFor(block);
        const read = magnitudeAt(block.vectors, layout.areaWidth, layout.areaRows);
        out.push({
          glyphRows: quiverRows(block.vectors, layout.areaWidth, layout.areaRows, arrowsFor(ctx.capabilities)),
          ref: refOf(0),
          ...(map === undefined || mrange === null ? {} : {
            cellColour: (r: number, x: number): ColourValue | undefined => {
              const v = read(r, x);
              const s = mrange.max - mrange.min;
              return v === null
                ? undefined
                : continuousColour(map, s <= 0 ? 0.5 : (v - mrange.min) / s, ctx.capabilities);
            },
          }),
        });
      }
      continue;
    }
    out.push({
      glyphRows: braille
        ? contourDotRows(sample, span, layout.areaWidth, layout.areaRows, levels)
        : contourCellRows(
            sample, span, layout.areaWidth, layout.areaRows, levels,
            block.plotCorners ?? "rounded", ctx.capabilities,
          ),
      ref: refOf(0),
      ramplike: true,
    });
  }
  return out;
}

/**
 * A field's own axes, derived from the grid (C12 I49, §3y).
 *
 * **A matrix's rows are identities and a field's are positions**, which is the
 * distinction I18 draws and which `ROW_IS_AN_IDENTITY` now records for these two
 * forms. Read as a matrix, a field came out with `row0 … row5` down the gutter
 * and no x axis at all — the caller was being asked to caption a domain the
 * renderer already knows.
 *
 * So the labels are derived where the caller named none, and a caller who names
 * one still wins: an explicit `label` on a row, or an explicit `xLabels`, is a
 * caller saying their rows and columns mean something the index does not.
 *
 * The domain is `xMin`–`xMax` where declared and the sample index otherwise.
 * There is no `yMin`/`yMax` arm: on a field those two pin the **value** range —
 * the levels and the colour scale — and spending them on the ordinate as well
 * would give one pair of members two meanings on one form.
 */
function fieldAxes(block: Plot): Plot {
  if (!IS_FIELD_FORM[block.form]) return block;
  const cols = block.series.reduce((n, r) => Math.max(n, r.values.length), 0); // cells-ok
  const named = block.series.some((r) => r.label !== undefined && r.label !== "");
  const at = (i: number, n: number): number => {
    const lo = block.xMin ?? 0;
    const hi = block.xMax ?? Math.max(0, n - 1);
    return n <= 1 ? lo : lo + (i / (n - 1)) * (hi - lo);
  };
  const series = named
    ? block.series
    : block.series.map((r, i) => ({ ...r, label: formatValue(i, block.yFormat) }));
  const xLabels: readonly [string, string, string] | undefined = block.xLabels ?? (cols === 0
    ? undefined
    : [
        formatValue(at(0, cols), block.xFormat),
        formatValue(at(Math.floor((cols - 1) / 2), cols), block.xFormat),
        formatValue(at(cols - 1, cols), block.xFormat),
      ]);
  return { ...block, series, ...(xLabels === undefined ? {} : { xLabels }) };
}

/**
 * A calendar's derived grid, or the block unchanged (C12 I53, §3ae).
 *
 * **The seam is `quiver`'s, one form along**: substituted here rather than in
 * `matrixRows`, so the range, the gutter labels, the legend and the overflow row
 * all see one series list. §3ae.4 is the check that this stays true — B2 says
 * the range is invariant under the substitution because the grid holds the same
 * finite values, and B4 says the overflow notice reads `+17 more · 07 · 08 · …`
 * because it sees the derived labels rather than the caller's one.
 *
 * **Every condition is a silent fall-through and that is I11's price** (§3ae.6
 * A10). A block that reached the renderer without passing a gate renders as the
 * pre-calendar matrix — a frame that is not wrong, because it is what `calendar`
 * has always drawn, and is not a calendar. The refusals live at the gates
 * because this is the layer that cannot have one.
 *
 * `series.length === 1` and not `!== 1`, because zero is not more than one
 * (§3ae A8): an empty calendar is commitment 3's empty plot, not an error.
 */
function calendarRows(raw: Plot): Plot {
  const unit = raw.calendarUnit;
  if (raw.form !== "calendar" || unit === undefined) return raw;
  const only = raw.series.length === 1 ? raw.series[0] : undefined; // cells-ok — a series count
  if (only === undefined || only.values.length === 0) return raw; // cells-ok — a reading count
  if (raw.startDate === undefined) return raw;
  const start = parseStartDate(raw.startDate);
  if (start === null) return raw;
  return { ...raw, series: calendarGrid(unit, start, only.values) };
}

/**
 * Render a heatmap-family form. All seven forms share this path; the only
 * difference is axis semantics (handled by the caller's field choices).
 */
export function heatmapFormRows(
  raw: Plot,
  width: number,
  ctx: RenderContext,
): readonly string[] {
  // **The field under a quiver is the vectors' own magnitude** where the caller
  // named no scalar (I50). It is the only scalar a vector field has, and the
  // alternative — an unpainted area with arrows on it — throws away the channel
  // that separates a fast cell from a slow one. Substituted here rather than in
  // `matrixRows`, so the range, the gutter labels, the legend and the overflow
  // row all see one series list.
  const withField: Plot = raw.form === "quiver" && raw.series.length === 0 && raw.vectors !== undefined // cells-ok — a series count
    ? { ...raw, series: magnitudeSeries(raw.vectors) }
    : calendarRows(raw);
  const block = fieldAxes(withField);
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
  // **Resolved once and handed down**, because the furniture and the cells have
  // to agree about which columns the grid occupies (§3ae.8). Two lookups of
  // `matrixAnchor ?? MATRIX_LAYOUT[form]` would be two answers the day a third
  // caller reads one of them.
  const matrixLayout = block.matrixAnchor ?? MATRIX_LAYOUT[block.form] ?? "stretch";
  return [
    ...matrixRows(block, range, layout, ctx, fieldLayers(block, range, layout, ctx, withField !== raw), matrixLayout),
    ...matrixFurniture(block, range, layout, ctx, matrixLayout),
  ];
}
