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
import { columnsForAspect } from "./aspect.js";
import { baselineOf, categoricalDecisions, frameOf, gutterOf, positionalDecisions, valueAxisOf } from "./figure.js";
import { treeArea } from "./tree.js";
import { graphArea } from "./graph.js";
import { curveRows, isBlank } from "./curve.js";
import { crossRow, gridRow, xRowFor, xTitleRow } from "./furniture.js";
import type { Axis, XAxis } from "./axes.js";
import { formatReadout, labelWidth, ticksFor, yLabels, xAxis } from "./axes.js";
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
  hasYLabels,
  line,
  plotRow,
  rightGutterWidth,
  yAxisSides,
  xLabelRowFor,
  type Callout,
  type Layout,
} from "./furniture.js";
import { annotationRows } from "./annotate.js";
import { FACING_DEFAULT, facingOf, rowOf, seriesRange, type Facing, type Range } from "./scale.js";
import { bandRows, stackBands, stackRange } from "./stack.js";
import { ROW_IS_AN_IDENTITY, markOf, partSeparator, refOf as slotOf } from "./marks.js";
import { strips, tiles } from "./hierarchy.js";
import { sparkline } from "./sparkline.js";
import { bubbleRows, scatterRows, stepRows } from "./scatter.js";
import { quartileRange } from "../../data/viewmodel/distribution.js";
import { boxplotBand, boxplotColumn, bulletRow, forestRow, dumbbellRow, lagRow, timelineRow } from "./glyph-row.js";
import { barColumn, barRow, lollipopRow, dotplotRow, binValues, stackedBarRow, funnelRow, ganttRow, waterfallRow, type BandRow } from "./categorical.js";
import { pairFor } from "./ramp.js";
import { squareColumns } from "./aspect.js";
import { WAFFLE_ROWS, waffleCells } from "./waffle.js";
import { pointLabelRows } from "./pointlabels.js";
import { colormapFor, heatmapFormRows } from "./heatmap.js";
import { flatAlphabet, glyphs } from "../blocks/glyphs.js";
import { candleColumn, candleReadout, candleRows, candlesOf, hasBars } from "./candles.js";
import { brailleOutline, densityRows, rainColumns, rainRows, ridgelineArea, violinColumn, violinRows } from "./kde.js";
import { densitySeries, ecdfSeries } from "./derive.js";
import { lineDrawRows, type Interpolation } from "./linedraw.js";
import { pieRender, pieAsciiRows, radarRender, radarAsciiRows, type MarkedText, segmentLegend, LEGEND_GAP } from "./circle.js";
import { horizonGrid, horizonIsSigned, horizonLegendSpans, horizonSpans } from "./horizon.js";
import { smallMultiplesRows } from "./facet.js";
import { stripHeights } from "./strips.js";
import type { Annotation, OHLC, QuartileSummary, Plot, PlotForm, Series } from "../../data/viewmodel/index.js";
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
type Layer = Readonly<{
  glyphRows: readonly string[];
  ref: ColourRef;
  /**
   * **What the layer is**, which decides what happens where two of them ink one
   * cell (C12 I44). Required rather than defaulted, so a ninth layer says.
   *
   * | | ink | tone |
   * |---|---|---|
   * | two `"surface"`s | union | the topmost's |
   * | two `"curve"`s | union | **neutral** |
   * | anything else | the topmost's — **occlude** | the topmost's |
   *
   * A `"surface"` is part of one filled figure — a pie's wedges, a stack's
   * bands. The partition is arbitrary and the ink is not, so the union removes
   * a hole in something solid by construction, and the boundary keeps a wedge's
   * tone because a neutral there would draw a border the data does not have.
   * *Measured: at ten segments a neutral boundary greys a whole sector.*
   *
   * A `"curve"` is a series or a radar polygon — a peer, and the subject. Two
   * peers in one cell union, because deleting one answers *where did this series
   * go* with **nowhere**; and the cell goes neutral, because answering it with
   * *the other one* is worse. Neither owns the cell and the honest tone says so
   * — `tone.muted` for the same reason a doji is muted rather than green
   * (§3r): the categories do not apply here.
   *
   * `"context"` is a radar's frame, an annotation's rule — drawn *behind*, and
   * occluded by anything in front. Hiding a gridline under a line is what "in
   * front" means and no reading is lost, because the frame is a regular shape a
   * reader completes; drawing it in a series' colour is a false statement about
   * which series it is.
   *
   * `"label"` is text, which shares with nothing in either direction.
   */
  kind: "label" | "curve" | "surface" | "context";
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
/**
 * The rows a detail mode may spend inside its band (C12 §3i, I28).
 *
 * The mode never *sets* the height — rows-per-band times category count is a
 * height derived from the data, which is what I1 forbids — so it picks how many
 * of the rows the caller already declared to use. An explicit `"full"` that does
 * not fit degrades rather than overflowing its band.
 */
export type Rung = "box1" | "box3" | "rain" | "raindrop" | "violin";

/**
 * The rungs each distribution form climbs, smallest budget first (C12 I34).
 *
 * **Two ladders and not one, which the first version got wrong.** Writing the
 * four rungs of the brief as a single table and giving each form a floor into it
 * makes a boxplot's `"full"` the *third* rung of a density ladder — so a boxplot
 * with three rows drew one, because the rungs between were densities it cannot
 * draw and the loop stopped at the first. The visible half was the row count.
 * The invisible half was that the sample check underneath it was reading
 * `series` for a form whose data is `quartiles`, and fixing only the ladder
 * would have left that reading the wrong field with nothing depending on it.
 *
 * A boxplot's two rungs are the same figure at two sizes; a violin's three each
 * add something. They share a budget axis and nothing else.
 *
 * **Rows horizontally and columns vertically, and the two are not equal**,
 * because a terminal cell is about twice as tall as it is wide: four dot-columns
 * is what three cells buy sideways and one cell buys downward.
 */
type RungSpec = Readonly<{
  rung: Rung;
  /**
   * The **minimum** budget the rung needs, not the size it draws — and the
   * distinction cost a frame. `rungRows` clamped a violin to its rung's five
   * rows in a band of six, so the top rung shrank the figure it was chosen for.
   */
  rows: number;
  columns: number;
  density: boolean;
  /**
   * Whether the figure grows into the whole band or is exactly its budget.
   *
   * A box is one row or three and pads the rest; a raincloud is a density row
   * over a box row. **The mirrored violin is the only rung that scales**, which
   * is what makes it the top one: more rows buy it more outline, where more rows
   * buy the others nothing.
   */
  scales: boolean;
}>;

const RUNGS: Readonly<Record<"boxplot" | "violin", readonly RungSpec[]>> = Object.freeze({
  boxplot: Object.freeze([
    Object.freeze({ rung: "box1" as const, rows: 1, columns: 1, density: false, scales: false }),
    Object.freeze({ rung: "box3" as const, rows: 3, columns: 3, density: false, scales: false }),
  ]),
  // **A violin's floor is the raincloud rather than the box**, because a violin
  // with no density is a box plot and the field said `violin` (C04 I56).
  //
  // **Three rungs and only the last scales**, which is what makes it the last:
  // more rows buy the mirrored outline more shape, and buy the other two
  // nothing — a raincloud is a cloud, a box and a strip whatever it is given.
  violin: Object.freeze([
    Object.freeze({ rung: "rain" as const, rows: 2, columns: 3, density: true, scales: false }),
    Object.freeze({ rung: "raindrop" as const, rows: 3, columns: 4, density: true, scales: false }),
    Object.freeze({ rung: "violin" as const, rows: 5, columns: 5, density: true, scales: true }),
  ]),
});

/**
 * The forms that have a ladder, published for C12 T2.10 (F220).
 *
 * **`HAS_DETAIL_RUNGS` cannot be derived from this and this cannot be derived
 * from it** — the record is in `types.ts` (L0) and validation reads it there,
 * while `RUNGS` is here (L1) and L0 does not import upward. So the two are
 * written separately and a row asserts they agree: a `true` with no ladder is a
 * refusal that never fires, and a `false` with one is a ladder no caller reaches.
 *
 * Derived from `RUNGS`' own keys rather than restated, so the two halves of that
 * row cannot both be a copy of the same mistake.
 */
export const RUNG_FORMS: readonly string[] = Object.freeze(Object.keys(RUNGS));

/**
 * The samples a density rung needs before it is drawing an estimate rather than
 * an artefact.
 *
 * **Derived rather than chosen: it is the level count the rung draws.** Both
 * arms resolve a density into five levels — four dot-rows plus empty going up,
 * four dot-columns plus empty going sideways — and a band with fewer finite
 * samples than that cannot distinguish them. What it draws instead is a broad
 * flat shape, which reads as *this distribution is uniform* and is a statement
 * about the sample count.
 */
const DENSITY_SAMPLES = 5;

/**
 * Which rung to draw (C12 §3i, I34).
 *
 * **`"auto"` and `"full"` were the same value.** The old `detailRows` read
 * `if (compact) return 1` and then returned one expression for both of the
 * others, so three names carried two behaviours and every assertion about
 * `"full"` was satisfied by the `"auto"` branch — A03 §2's vacuity class in a
 * field rather than in a rule. With a ladder they can differ, and the difference
 * makes the names true: `"auto"` is the one that reads what there is to draw.
 *
 * **The floor is clamped rather than thrown.** I2 says no series input throws,
 * and the row floor is already refused at construction (C04 I56) — so arriving
 * here below it means the width was too narrow, which is the axis construction
 * cannot see. I18's ladder applies: draw the figure that fits.
 */
function rungFor(
  block: Plot,
  form: "boxplot" | "violin",
  budget: number,
  axis: "rows" | "columns",
  samples: number,
): RungSpec {
  const ladder = RUNGS[form];
  const mode = block.plotDetail ?? "auto";
  const floor = ladder[0]!;

  // **Below the floor the answer is the box, in either of two ways.** The width
  // could not hold the floor — the axis construction cannot see (C04 I56) — or
  // `"auto"` looked at the samples and found too few to estimate with. Both land
  // on the same figure because there is only one honest figure below a density:
  // the five-number summary, which needs no estimate.
  if (budget < floor[axis]) return BOX1;
  // Only `"auto"` asks what there is to draw, and only a density can be wrong
  // about it — a boxplot's rungs are one figure at two sizes.
  if (mode === "auto" && floor.density && samples < DENSITY_SAMPLES) return BOX1;
  if (mode === "compact") return floor;

  let best = floor;
  for (const spec of ladder) {
    if (budget < spec[axis]) break;
    best = spec;
  }
  return best;
}

/** The figure below every density: the five-number summary, which needs no estimate. */
const BOX1: RungSpec = RUNGS.boxplot[0]!;

/** The rows a rung spends of the band it was given, never more than the band has. */
function rungRows(spec: RungSpec, available: number): number {
  return spec.scales
    ? Math.max(1, available) // cells-ok — a row count
    : Math.max(1, Math.min(available, spec.rows)); // cells-ok — a row count
}

/** How many finite samples a band has — what `"auto"` reads for a density rung. */
function finiteCount(series: Series | undefined): number {
  return series === undefined
    ? 0 // cells-ok — a sample count
    : series.values.filter((v) => v !== null && Number.isFinite(v)).length; // cells-ok — a sample count
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

/** A summary with nothing in it — what a band with no samples falls back to. */
const EMPTY_SUMMARY: QuartileSummary = Object.freeze({ min: 0, q1: 0, median: 0, q3: 0, max: 0 });

/**
 * The cells every bar in a chart keeps for its number (C12 I20, §3b).
 *
 * **One allowance for the chart, because per row it inverts**: at `max: 100`
 * in 40 cells, 99 drew 37 and 100 drew 36 — a larger value, a shorter bar.
 * The widest label is what every run is then scaled against, so two equal
 * values draw equal runs whatever their neighbours are.
 */
function labelAllowance(
  values: readonly (number | null)[],
  format: Plot["yFormat"],
  caps: RenderContext["capabilities"],
): number {
  let widest = 0;
  for (const v of values) {
    if (v === null || !Number.isFinite(v)) continue;
    widest = Math.max(widest, cells(` ${formatReadout(v, format)}`, caps.ambiguousWidth)); // cells-ok — a label width
  }
  return widest;
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

/** Braille is `U+2800 + bits`, which is what makes the union below an OR. */
const BRAILLE_BASE = 0x2800;
const BRAILLE_TOP = 0x28ff;

function brailleBits(ch: string): number | null {
  const c = ch.codePointAt(0);
  if (c === undefined || c < BRAILLE_BASE || c > BRAILLE_TOP) return null;
  return c - BRAILLE_BASE;
}

/**
 * Layers to one row of spans — **per dot where the vocabulary allows it** (C12 I40, §3u).
 *
 * This took the whole cell to the first layer that inked it, and every figure
 * that composites is folded to braille *before* it arrives, so the second
 * layer's dots were dropped. A pie's disc is covered by construction and had
 * seven cells flanked by full ones that were not full; a radar's frame was drawn
 * only in the cells no polygon wanted, which reads as fragmented rings and
 * dashed strokes — and `dashFor` is solid at any depth above one bit.
 *
 * **Where every candidate is braille the bits are unioned.** Where any is not —
 * a radar's category names are text — the first-wins rule stands, because a
 * letter and a polygon cannot share a cell and one of them has to lose.
 *
 * **The colour is still the first layer's, and that is the span model's limit
 * rather than an oversight.** A `Span` carries one `ColourRef`, so two wedges
 * meeting in a cell draw both sets of dots in the first wedge's colour: the
 * union removes the *gap* and not the boundary's inexactness. The priority order
 * stays the ref's rather than becoming the densest layer's, because that order
 * is a ruling — labels over polygons over frame — that a dot count would
 * overturn wherever the frame happened to be denser.
 *
 * At `colourDepth: 1` this path is not taken at all — the plot stacks (I6).
 */
function mergedRow(
  layers: readonly Layer[],
  rowIndex: number,
  layout: Layout,
  ctx: RenderContext,
): readonly Span[] {
  const spans: Span[] = [];
  let turns = 0; // cells-ok — a contested-cell count
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
    let cellKind: Layer["kind"] | null = null;
    let bits = 0;
    /**
     * The `"curve"` layers contending for this cell, in layer order (I44).
     *
     * `ink` rather than `dots`, because MG24 matches members **by name** (F160)
     * and a local field called `dots` silently satisfies `UNCONSUMED_MEMBERS`'
     * entry for `Grid.dots` — an exemption cleared by a homonym is an exemption
     * nobody reads again.
     */
    const peers: { ref: ColourRef; ink: number }[] = [];
    for (const layer of layers) {
      const candidate = [...(layer.glyphRows[rowIndex] ?? "")][x] ?? " ";
      if (isBlank(candidate)) continue;
      const dots = brailleBits(candidate);
      if (cellRef === null) {
        cell = candidate;
        cellRef = layer.ref;
        cellKind = layer.kind;
        // A non-braille winner ends the cell: nothing may be OR-ed into a letter.
        if (dots === null) break;
        bits = dots;
      } else {
        // Past the first inking layer, only braille contributes, only to a cell
        // that is itself braille, and **only between two layers of one kind**
        // (I44). Across kinds the topmost owns the cell outright.
        if (dots === null || cellKind !== layer.kind) continue;
        bits |= dots;
        cell = String.fromCodePoint(BRAILLE_BASE + bits);
      }
      // **One site, so which layers contend is stated once.** It was said in
      // both branches, and a rule written twice is a rule half of which can be
      // changed.
      if (layer.kind === "curve") peers.push({ ref: layer.ref, ink: dots });
    }
    // **Where peers contend, the cell goes to one of them, and the turn has to
    // change along the run** (I44). Every cell then holds one series' dots in
    // that series' colour, and each line runs the overlap as a dash rather than
    // one line taking the region and the rest vanishing.
    //
    // **The turn counts contested cells rather than columns**, and that is the
    // whole of why it works. `x % peers.length` is constant down a *vertical*
    // run, which is every cell of it wherever two curves overlap on a vertical
    // stretch — two radar polygons meeting on a spoke, and at two categories
    // the entire figure: measured, one series took 9 of 9 contested cells and
    // the other none.
    //
    // No purely positional key fixes it: alternating on all of (1,0), (0,1) and
    // (1,1) modulo two is the checkerboard and has no solution. A **counter**
    // is not positional. It resets each row, so a vertical run advances on
    // `rowIndex`, a horizontal one on the counter, and a diagonal on `rowIndex`
    // with the counter back at zero — every run advances by one per cell.
    // *Measured at 2 through 10 categories: the closest split to even is 7/7
    // and the furthest 5/7, where the column key starved a series to nothing.*
    if (peers.length > 1) { // cells-ok — a layer count
      const pick = peers[(rowIndex + turns) % peers.length]!; // cells-ok — a layer count
      turns += 1; // cells-ok — a contested-cell count
      cellRef = pick.ref;
      cell = String.fromCodePoint(BRAILLE_BASE + pick.ink);
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
  xaxis: XAxis,
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
  // **Composed once**, where it used to be built twice for its two halves.
  // **Read back rather than asked again** (C12 I67, §3ak.19). `axes` gated the
  // furniture here and styled the layout twenty lines up, which was one
  // decision in two places; `frameOf` is that decision and the second arm
  // makes the same call.
  const furniture = frameOf(block) !== "none" ? furnitureFor(layout, xaxis, ctx, null, block.xTitle) : null;
  const top = furniture === null ? [] : [indent(furniture.top)];
  const bottom = furniture === null ? [] : furniture.bottom.map(indent);
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
  at: number | null,
  area: readonly string[],
  layout: Layout,
  ctx: RenderContext,
  xaxis: XAxis,
): readonly string[] {
  const furniture = furnitureFor(layout, xaxis, ctx, at);
  return composeRows(plotHeight(block), [furniture.top], area, [
    furniture.bottom[0] ?? "",
    // The readout replaces the label row and never the title: one names a
    // position the reader asked about, the other names the axis it is on.
    cursorReadout(block, cursorIdx, layout, ctx),
    ...(block.xTitle === undefined ? [] : [xTitleRow(block.xTitle, layout, ctx)]),
  ]);
}

/**
 * Which column the cursor's index is drawn in (C12 §3s, I37).
 *
 * **The index is into the data, not the area** — `cursorReadout` reads
 * `values[cursorIdx]` and always has — so the column is whatever the *form*
 * maps that index to. Two mappings, because a candlestick lays its bars out and
 * a curve places its samples, and one rule for both points at the wrong candle
 * as soon as the bars aggregate.
 */
function cursorColumn(block: Plot, cursorIdx: number, areaWidth: number): number | null {
  const facing = facingOf(block, FACING_DEFAULT);
  const bars = candlesOf(block);
  if (bars !== undefined) return candleColumn(bars, cursorIdx, areaWidth, facing);
  const n = block.series.reduce((most, sr) => Math.max(most, sr.values.length), 0); // cells-ok — a sample count
  if (n === 0 || cursorIdx < 0 || cursorIdx >= n) return null; // cells-ok — a sample count
  const w = Math.max(1, Math.floor(areaWidth)); // cells-ok — a cell width
  const span = Math.max(0, n - 1); // cells-ok — a sample count
  // `columnsOf`'s placement, which is what put the sample in that column —
  // **including its facing** (§3ac B1). A crosshair that does not flip with the
  // data points at the mirror sample and the readout beside it names a value
  // the reader is not looking at: the frame stays plausible and the number is
  // wrong, which is the worst failure available here.
  const at = facing.x === "left" ? span - cursorIdx : cursorIdx; // cells-ok — a sample index
  return span === 0 || w === 1
    ? Math.floor((w - 1) / 2) // cells-ok — a column index
    : Math.round((at / span) * (w - 1)); // cells-ok — a column index
}

/**
 * A blank area row with the cursor's column dashed, for `behind()` (C12 I37).
 *
 * **Behind the data and never over it.** `dashedVertical` is already the slot
 * for a reference line drawn beside data, and its own comment gives the reason:
 * a solid rule through a figure reads as part of it. Merged with the gridline
 * row so the two share one pass, with the gridline winning a shared cell —
 * it marks a value written in the gutter, and the cursor's column is carried by
 * the rule below in any case.
 */
function cursorRule(column: number | null, layout: Layout, ctx: RenderContext): string {
  if (column === null) return "";
  const g = glyphs(ctx.capabilities);
  return Array.from({ length: Math.max(0, layout.areaWidth) }, (_, x) =>
    x === column ? g.dashedVertical : " ").join(""); // cells-ok — a column index
}

/** First non-blank of two reference rows, so `behind()` takes one string. */
function overlay(over: string, under: string): string {
  if (under === "") return over;
  if (over.trim() === "") return under;
  return Array.from({ length: Math.max(over.length, under.length) }, (_, i) => { // cells-ok — a column index
    const a = over[i] ?? " "; // cells-ok — a column index
    return a === " " ? under[i] ?? " " : a; // cells-ok — a column index
  }).join("");
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
    // **`formatReadout`, not a hand-rolled round** (F175). The old line was
    // `String(Math.round(v * 100) / 100)` — it ignored `yFormat` entirely, so a
    // percentage, a byte count and a duration all read as bare numbers at the
    // one place a reader reads the number rather than the picture. `axes.ts`
    // records two ramps and `categorical.ts` records the bar as the fourth;
    // **this was the fifth and the last in `src/`.**
    return `${label}: ${formatReadout(v, block.yFormat)}`;
  });
  // **The candles first**, because they are what the block is about and the
  // series are the overlay — the same order the legend takes (§6b B4).
  const bars = candlesOf(block);
  const parts = bars === undefined
    ? values
    : [candleReadout(bars[cursorIdx], block.yFormat), ...values];
  const readoutText = truncate(parts.join("  "), layout.width, ctx.capabilities);
  const muted = tone("muted", ctx.theme, ctx.capabilities);
  return line([{ text: readoutText, style: muted }], layout, ctx);
}

/**
 * The last finite sample of a series, which is what a callout names (I48).
 *
 * **Finite and not merely last.** A series ending in `null` is a gap: `I4` says
 * the line breaks across it rather than spanning it, so the last thing *drawn*
 * is the last finite sample — and the number written beside it has to be the
 * same sample or the label names a value the figure does not show.
 */
function lastFinite(values: readonly (number | null)[]): number | null {
  for (let i = values.length - 1; i >= 0; i -= 1) { // cells-ok — a sample index
    const v = values[i];
    if (v !== null && v !== undefined && Number.isFinite(v)) return v;
  }
  return null;
}

/**
 * The row a series' ink ends on — read from the glyphs, never recomputed (I48).
 *
 * **`curveRows` rasterises at dot resolution and folds; `lineDrawRows` and
 * `candleRows` map at cell resolution, and the two disagree for one value in
 * six** (15.7–21.0% over heights 6, 8, 12 and 20), worst at the ends of the
 * range — which is where a live chart's newest value sits when something has
 * just gone wrong. Recomputing here would pick one of those mappings and be
 * silently wrong wherever the other drew. This is I37's ruling on the other
 * axis: the form owns which position lands where.
 *
 * **The far end of the last column's stroke, and the walk said its midpoint.**
 * The final column is rarely one cell: `drawLine` joins the previous sample to
 * this one, so the column carries the tail of that approach as well as the
 * sample itself — and the sample is at whichever end of the stroke is *further*
 * from where the line came in. Measured on a descending braille curve ending at
 * 7.2 of 0..100 in eight rows: the stroke spans rows 6 and 7, the sample's dot
 * is in 7, and the midpoint answers **6** — which is exactly the row the
 * cell-resolution shortcut gives. *A ruling that lands on the wrong answer and
 * on the shortcut's answer at once cannot be told from the shortcut*, so the
 * midpoint would have been unfalsifiable as well as wrong.
 *
 * With several samples in the last column no ink-only rule is exact — the
 * stroke is the figure's end and the number is one sample's — and the far end
 * is inside it, which is all a label needs.
 */
function inkSpanAt(rows: readonly (readonly string[])[], x: number): { top: number; bottom: number } | null {
  let top = -1, bottom = -1; // cells-ok — a row index
  for (let r = 0; r < rows.length; r += 1) { // cells-ok — a row index
    if (isBlank(rows[r]?.[x] ?? " ")) continue;
    if (top < 0) top = r; // cells-ok — a row index
    bottom = r; // cells-ok — a row index
  }
  return top < 0 ? null : { top, bottom };
}

function lastInkRow(glyphRows: readonly string[], areaWidth: number): number | null {
  const rows = glyphRows.map((r) => [...r]);
  const widest = rows.reduce((m, r) => Math.max(m, r.length), 0); // cells-ok — a column count
  const right = Math.min(Math.max(0, Math.floor(areaWidth)), widest) - 1; // cells-ok — a column index
  for (let x = right; x >= 0; x -= 1) { // cells-ok — a column index
    const here = inkSpanAt(rows, x);
    if (here === null) continue;
    if (here.top === here.bottom) return here.top; // cells-ok — a row index
    // The column the line came in from, which is what says which end is the
    // sample. Absent — a one-column series — nothing points, so the midpoint is
    // the only answer left.
    let prior: { top: number; bottom: number } | null = null;
    for (let p = x - 1; p >= 0 && prior === null; p -= 1) prior = inkSpanAt(rows, p); // cells-ok — a column index
    if (prior === null) return Math.floor((here.top + here.bottom) / 2); // cells-ok — a row index
    const from = (prior.top + prior.bottom) / 2; // cells-ok — a row index
    return Math.abs(here.top - from) >= Math.abs(here.bottom - from) ? here.top : here.bottom; // cells-ok — a row index
  }
  return null;
}

/** A layout carrying the callouts, or the same layout where there are none. */
function withCallouts(layout: Layout, callouts: ReadonlyMap<number, Callout>): Layout {
  return callouts.size === 0 ? layout : { ...layout, callouts }; // cells-ok — a callout count
}

/**
 * The cells a callout column needs, known **before** the layout exists (I48).
 *
 * The text is `formatReadout` of a sample, which is a property of the series and
 * not of the width — so the column is sized here and the *rows* are resolved
 * from the ink afterwards, and there is no second pass. The shared mark is one
 * cell and only reachable with a second series to lose one.
 */
function calloutWidth(block: Plot, ambiguous: AmbiguousWidth, stacked: boolean): number {
  if (!calloutDraws(block)) return 0;
  let widest = 0; // cells-ok — a cell width
  for (const [i, s] of block.series.entries()) { // cells-ok — a series index
    const text = calloutTextFor(block, s, i, stacked);
    if (text === null) continue;
    widest = Math.max(widest, cells(text, ambiguous)); // cells-ok — a cell width
  }
  return widest === 0 ? 0 : widest + (block.series.length > 1 ? 1 : 0); // cells-ok — a series count
}

/** Whether the field asks for anything to be written (C12 I55). */
function calloutDraws(block: Plot): boolean {
  return block.yCallout === "last" || block.yCallout === "name" || block.yCallout === "both";
}

/**
 * Whether the positional family has stopped overlaying and stacked into
 * labelled strips (I6, I7).
 *
 * **One definition, because two consumers now branch on it** — the renderer,
 * which stacks, and the callout, which must not repeat the name the stacking
 * already wrote. `legendPlacement` asks the same question of the same rung one
 * file along and suppresses the legend for the same reason.
 */
function stacksAtOneBit(block: Plot, caps: Pick<TerminalCapabilities, "colourDepth">): boolean {
  return caps.colourDepth === 1 && block.series.length > 1; // cells-ok — a series count
}

/**
 * What one series' callout says, or nothing where it has nothing to say.
 *
 * **One function for the width and the placement**, because they are the same
 * string measured and then written: `legendEntries`' own comment records what a
 * second door to the same fact cost there — a swatch drawing a colour the
 * legend did not name — and a gutter sized from one string and filled with
 * another is that defect with the cells instead of the colour.
 *
 * **A series with no finite value has no *value* and still has a name**, so
 * `"name"` answers where `"last"` does not: the row a name is written on is the
 * row that series' ink ends on, and a series with no ink is dropped by
 * `lastInkRow` rather than here.
 */
function calloutTextFor(block: Plot, s: Series, index: number, stacked: boolean): string | null {
  const name = s.label ?? `series ${String(index + 1)}`;
  // **Where the form has already labelled its own rows, an identity at the
  // line's end is the third copy of it** — found by reading the frame, not by
  // the walk. Below the colour floor the positional family stacks into strips
  // and `stackedRows` writes each series' name in the y gutter; with
  // `yAxis: "both"` I47 mirrors that name to the right as well. So `"name"`
  // wrote `alpha` into a row already reading `alpha … alpha`.
  //
  // `"name"` therefore writes nothing there and `"both"` degrades to the value,
  // which is still the one thing the strips do not say. This is exactly the
  // rung `legendPlacement` already declines at, arriving for the same reason:
  // *not where the form has already labelled its own rows*.
  if (block.yCallout === "name") return stacked ? null : name;
  const v = lastFinite(s.values);
  if (v === null) return null;
  const value = formatReadout(v, block.yFormat);
  // **The name first and the number last, and the number is what survives a
  // cut** (§3ag A1): a live chart is read for the value, which is C12 I48's own
  // argument for the field existing at all.
  return block.yCallout === "both" && !stacked ? `${name} ${value}` : value;
}

/**
 * One callout per series, at the row that series' ink ends on (I48).
 *
 * `offset` is the strip's first row for the 1-bit stacked arm, where each series
 * is rasterised into its own band — **which is the capability the field would
 * otherwise be ignored at.** A multi-series positional plot below the colour
 * floor stops overlaying and stacks, so a callout map built only in the overlaid
 * arm would accept `yCallout` and draw nothing at one bit, on the exact
 * terminals where a reader most needs the number spelled out.
 */
function calloutInto(
  into: Map<number, Callout>,
  block: Plot,
  glyphRows: readonly string[],
  seriesIndex: number,
  layout: Layout,
  stacked: boolean,
  offset = 0,
): void {
  if (!calloutDraws(block) || (layout.rightColumn ?? 0) === 0) return;
  const s = block.series[seriesIndex];
  if (s === undefined) return;
  const text = calloutTextFor(block, s, seriesIndex, stacked);
  if (text === null) return;
  const row = lastInkRow(glyphRows, layout.areaWidth);
  if (row === null) return;
  const at = row + offset; // cells-ok — a row index
  // **The later series wins and the row says so** (I8). Not two rows, which
  // would change the count and break I1, and not a count, which cannot be
  // sized before the layout it is being sized for (§3x).
  into.set(at, { text, ref: refOf(s, seriesIndex), shared: into.has(at) });
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
      // The separator degrades with the terminal (C12 I54) — `truncate` measures
      // whatever this produces, so the two cannot disagree about the width.
      `+${omitted.length} more${partSeparator(ctx.capabilities)}${omitted.join(partSeparator(ctx.capabilities))}`, // cells-ok — a series count
      layout.areaWidth,
      ctx.capabilities,
    );
    const curveHeight = Math.max(1, layout.areaRows - 1);

    if (first !== undefined) {
      const glyphRows = curveRows(first, range, layout.areaWidth, curveHeight, ctx.capabilities, facingOf(block, FACING_DEFAULT));
      const layer: Layer = { glyphRows, ref: refOf(first, 0), kind: "curve" };
      for (let i = 0; i < curveHeight; i += 1) {
        out.push(
          plotRow(
            i,
            i === 0 ? (first.label ?? "") : "",
            mergedRow([layer], i, layout, ctx),
            layout,
            ctx,
          ),
        );
      }
    }

    out.push(
      plotRow(
        curveHeight,
        "",
        [{ text: areaText(legend, layout, ctx), style: tone("warn", ctx.theme, ctx.capabilities) }],
        layout,
        ctx,
      ),
    );
    return out;
  }

  // **Rasterised first, composed second**, because the callout map has to exist
  // before the first row is drawn and a strip's callout row is only known once
  // its band is rasterised.
  const strips = series.map((s, index) => ({
    layer: {
      glyphRows: curveRows(s, range, layout.areaWidth, heights[index] ?? 0, ctx.capabilities, facingOf(block, FACING_DEFAULT)),
      ref: refOf(s, index),
      kind: "curve" as const,
    },
    // **The names reach this arm too, and the callout's own comment is why**
    // (C12 I55): *a map built only in the overlaid arm would accept the field
    // and draw nothing at one bit, on the exact terminals where a reader most
    // needs it spelled out.* A strip is one series in its own band, so it gets
    // its own collision grid — strips share no rows — and no mark prefix, since
    // the gutter beside it already names the series.
    names: s.pointLabels === undefined
      ? null
      : {
          glyphRows: pointLabelRows(
            [s], range, layout.areaWidth, heights[index] ?? 0, ctx.capabilities,
            facingOf(block, FACING_DEFAULT),
          )[0] ?? [],
          ref: refOf(s, index),
          kind: "label" as const,
        },
    rows: heights[index] ?? 0,
  }));
  const callouts = new Map<number, Callout>();
  let base = 0; // cells-ok — a row index
  strips.forEach((strip, index) => {
    calloutInto(callouts, block, strip.layer.glyphRows, index, layout, true, base);
    base += strip.rows; // cells-ok — a row count
  });
  const withRight = withCallouts(layout, callouts);

  strips.forEach((strip, index) => {
    for (let i = 0; i < strip.rows; i += 1) {
      out.push(
        plotRow(
          out.length, // cells-ok — a row index
          i === 0 ? (series[index]?.label ?? "") : "",
          mergedRow(strip.names === null ? [strip.layer] : [strip.names, strip.layer], i, withRight, ctx),
          withRight,
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
  facing: Facing,
) => readonly string[];

function styleRasteriser(
  block: Plot,
  caps: Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">,
  base: Rasteriser,
  interpolation: Interpolation = "linear",
): Rasteriser {
  const ps = block.plotStyle ?? "auto";
  if (ps === "braille") return base;
  // **`candlestick` names what the *candles* draw, and this function chooses what the
  // *overlays* draw** — so it takes `auto`'s answer rather than a third arm. A
  // moving average over candles is an ordinary curve and there is no reason for
  // it to be drawn differently from the same curve on its own.
  const auto = ps === "auto" || ps === "candlestick";
  // **`ambiguousWidth` is the right question for `auto` and the wrong one for
  // the alphabet** (C12 I54). *How wide is this glyph* is what decides whether
  // an unstyled curve prefers box drawing to braille; *can this terminal draw
  // one at all* is `unicode`, and it is asked inside `lineDrawRows` — which
  // degrades to `+ - |` rather than refusing, so an explicit `plotStyle: "line"`
  // still draws a connected line at ASCII.
  const useLineDraw = ps === "line" || (auto && caps.ambiguousWidth !== "wide");
  if (!useLineDraw) return base;
  const corners = block.plotCorners ?? "rounded";
  // **The interpolation is passed, not inferred from the base rasteriser.**
  // Swapping the whole rasteriser is what lost the step's shape: `stepRows`
  // carried the hold-then-jump and the replacement knew only how to slope, so
  // `step` and `line` drew the same frame. The form owns the rule, so the form
  // names it here.
  // **The rasteriser's own `caps` and not the closed-over one.** They are the
  // same record today; taking the parameter is what stops this becoming the
  // discarded `_caps` it used to be, which is how the capability failed to
  // reach the glyph table at all.
  return (series, range, areaWidth, areaRows, rasterCaps, facing) =>
    lineDrawRows(series, range, areaWidth, areaRows, corners, facing, interpolation, rasterCaps);
}

function overlaidRows(
  block: Plot,
  axis: Axis,
  layout: Layout,
  ctx: RenderContext,
  xaxis: XAxis,
  rasterise: Rasteriser = curveRows,
  under: readonly Layer[] = [],
  cursorAt: number | null = null,
): readonly string[] {
  // **One axis, and it arrives measured.** The scale and the capability were
  // both dropped here once — `yLabels` called without `yScale` labelled a log
  // axis linearly, and `labelWidth` measured against a default `ambiguousWidth`
  // while `gutterSpans` padded against another (§3f). Neither can recur: there
  // is nothing left here to drop, because the axis the curve is drawn against
  // is the object the gutter is labelled from (F210).
  const range = axis.range;
  const facing = facingOf(block, FACING_DEFAULT);
  const labels = hasYLabels(layout) ? yLabels(axis, layout.areaRows, block.yFormat, facing) : [];
  const byRow = new Map(labels.map((l) => [l.row, l.text]));
  // `"grid"` draws its lines where there is a value written — the rows the
  // gutter labels and the columns the bottom rule ticks (C12 I26).
  //
  // **From the axis the rule is drawn from, which it was not** (F211). This
  // reached for `xAxis(block.xLabels, …)` — the *captions* arm alone — so a plot
  // with a numeric abscissa got an empty tick set and drew no vertical
  // gridlines at all, while the rule three rows below it carried five ticks.
  // I26's horizontal half was honoured and its vertical half was blank, and the
  // one fixture the corpus renders at `grid` declares `xLabels`.
  const gridTicks = xaxis.tickColumns;

  // **The crossing axes, and the two conditions are two conditions** (§3ad A15).
  // The range must *strictly* straddle zero — `rowOf` centres a degenerate range
  // by construction, so a constant series of 5s would otherwise take a zero axis
  // through its middle — and the row must be strictly inside the area, because
  // at the edge `"zero"` and `"edge"` name the same place.
  const crossing = block.axisCross === "zero";
  const straddles = crossing && range.min < 0 && range.max > 0;
  const zeroAt = straddles ? rowOf(0, range, layout.areaRows, facing) : null;
  const zeroRow = zeroAt !== null && zeroAt > 0 && zeroAt < layout.areaRows - 1 ? zeroAt : null; // cells-ok — a row index
  const zeroColumn = crossing ? xaxis.zeroColumn : null;

  // **The names, first, because a label draws over the data** (C12 I55, §3ag
  // A11). That is the opposite of an annotation's reference line, and
  // deliberately: a line is a claim the curve is *compared against*, so hiding a
  // sample under it loses the comparison — while a name hidden by the thing it
  // names says nothing at all. `kind: "label"` already existed for the radar's
  // spoke names and shares with nothing in either direction, which is exactly
  // what text wants.
  const names = pointLabelRows(
    block.series, range, layout.areaWidth, layout.areaRows, ctx.capabilities, facing,
  );
  const layers: readonly Layer[] = [
    ...block.series.flatMap((s, index) =>
      s.pointLabels === undefined
        ? []
        : [{ glyphRows: names[index] ?? [], ref: refOf(s, index), kind: "label" as const }]),
    ...block.series.map((s, index) => ({
      glyphRows: rasterise(s, range, layout.areaWidth, layout.areaRows, ctx.capabilities, facing),
      ref: refOf(s, index),
      kind: "curve" as const,
    })),
    // **The candles sit between**, because layers resolve first-non-blank: the
    // overlay series must win a shared cell (§3r — a moving average is drawn
    // *over* the candles) and the annotations must lose it (C04 I52).
    ...under,
    ...(block.annotations ?? []).map((a) => ({
      glyphRows: annotationRows(a, range, layout.areaWidth, layout.areaRows, ctx.capabilities, facing),
      ref: `tone.${a.tone ?? "muted"}` as ColourRef,
      // An annotation is a reference drawn behind the data (C04 I52), so the
      // series occludes it rather than sharing a cell with it.
      kind: "context" as const,
    })),
  ];

  const callouts = new Map<number, Callout>();
  block.series.forEach((_s, index) => {
    const rows = layers[index]?.glyphRows;
    if (rows !== undefined) calloutInto(callouts, block, rows, index, layout, false);
  });
  const withRight = withCallouts(layout, callouts);

  const cursor = cursorRule(cursorAt, layout, ctx);
  return Array.from({ length: layout.areaRows }, (_, i) =>
    plotRow(
      i,
      byRow.get(i) ?? "",
      behind(
        // **The cross over the grid over the cursor.** The cross shares the
        // grid's alphabet and they agree in the cells they share — the grid
        // draws where a value is written and zero is a value — so the order
        // decides only the junction mark (§3ad A2). Grid-over-cursor is where
        // it was.
        overlay(
          crossRow(withRight, i, zeroRow, zeroColumn, ctx),
          overlay(gridRow(withRight, gridTicks, ctx, byRow.has(i)), cursor),
        ),
        mergedRow(layers, i, withRight, ctx),
        ctx,
      ),
      withRight,
      ctx,
    ),
  );
}

/**
 * A candlestick's two layers — rising, then falling (C12 I36, §6b B4).
 *
 * **Two, because a `Layer` carries one `ColourRef` and this has two
 * categories.** A column is rising or falling and never both, so the layers are
 * disjoint and the merge composes them with no rule about which wins.
 *
 * **Three, because a doji is neither** — see `candleRows`. It is `tone.muted`,
 * and it was `tone.ok` until a frame was read with colour on.
 *
 * **`tone.ok` and `tone.error` rather than the categorical palette**, which is
 * the one place a judgement tone is the right answer and not roadmap 51's
 * defect. That defect was *unrelated* quantities cycled through judgement
 * tones — series three reading as good because it was third. Here the tone
 * names the thing the category **is**, green up and red down is what every
 * reader of this figure expects, and the mark already carries the direction at
 * every depth (§3r), so a theme where the two tones are close still reads.
 */
function candleLayers(
  bars: readonly OHLC[] | undefined,
  range: Range,
  layout: Layout,
  ctx: RenderContext,
  facing: Facing,
): readonly Layer[] {
  if (!hasBars(bars)) return [];
  const { rising, falling, flat } = candleRows(
    bars ?? [], range, layout.areaWidth, layout.areaRows, ctx.capabilities, facing,
  );
  return [
    { glyphRows: rising, ref: "tone.ok", kind: "curve" },
    { glyphRows: falling, ref: "tone.error", kind: "curve" },
    // **A doji is neither, so it is muted rather than green.** It rode in the
    // rising layer until a golden frame was read with colour on and drew a bar
    // that did not move in the up tone (§3r).
    { glyphRows: flat, ref: "tone.muted", kind: "curve" },
  ];
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
  axis: Axis,
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
  const axed = gutterOf(block);
  if (!axed) return { ...base, gutter: 0, labelColumn: 0, areaWidth: width };

  // **What the column holds depends on the form.** A stacked plot puts series
  // names there instead of the three y-labels (§5), and sizing the column from the
  // y-labels regardless is what pushed `train │` one cell past the width and left a
  // `…` on the first row of every stacked frame. Two different sets of strings, one
  // column: it has to be measured from whichever set will be drawn.
  const sides = yAxisSides(block);
  const wanted = !sides.left && !sides.right
    ? 0 // cells-ok — a cell width
    : stacked || block.form === "heatmap"
      ? seriesLabelWidth(block.series, caps.ambiguousWidth)
      : labelWidth(yLabels(axis, areaRows, block.yFormat), caps.ambiguousWidth);
  // **One set of labels, sized once and drawn on whichever sides asked** (I47).
  // Measuring the right column separately would let `"both"` render two axes
  // that disagree about their own width.
  const left = sides.left ? wanted : 0; // cells-ok — a cell width
  // **The right column budgets for the callouts too, and the left does not.**
  // One set of *labels* is drawn on both sides (I47); a callout is written only
  // on the right, so sizing the left column for it would waste the cells at
  // every width. Same content, two widths, one measurement each.
  const right = sides.right // cells-ok — a cell width
    ? Math.max(wanted, calloutWidth(block, caps.ambiguousWidth, stacked))
    : 0;
  // **The frame's right edge is furniture and pays before the curve**, which is
  // the same rung it has always been: labels, then furniture, then the plot
  // area. A cell narrower is a curve; a cell narrower still is a `…`.
  if (width - left - AXIS_GUTTER - rightGutterWidth(right) >= MIN_AREA) {
    return {
      ...base,
      gutter: left + AXIS_GUTTER,
      labelColumn: left,
      rightColumn: right,
      areaWidth: width - left - AXIS_GUTTER - rightGutterWidth(right),
      frame: true,
    };
  }

  // **The right column goes before the left one does** (I47). At `"both"` it is
  // a copy of the left and therefore the cheapest thing in the frame to lose;
  // at `"right"` losing it lands on the unlabelled rung below, which is where a
  // left axis of the same width already sits. *So this rung changes no cell at
  // `"right"` and is named for what it does at `"both"`* (§6c.2).
  if (right > 0 && width - left - AXIS_GUTTER - FRAME_RIGHT >= MIN_AREA) {
    return {
      ...base,
      gutter: left + AXIS_GUTTER,
      labelColumn: left,
      areaWidth: width - left - AXIS_GUTTER - FRAME_RIGHT,
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
   * The row's colour, for the two forms whose rows are not plain categories.
   *
   * **A grouped bar is the case that broke the default**, and the sentence
   * written here to explain it is what C12 §3t was about. One row per
   * (category, series) pair means row 3 is *B · before*, and slot 3 named the
   * row rather than `before` — so group A drew the legend's two colours and
   * group B drew two others. Correct, and it closed with *the default stays: a
   * plain bar is one series across N categories and the category **is** what a
   * colour can name* — which was a general rule inferred from one instance,
   * held in this comment and in no file, and wrong. Colour indexes the series
   * (I38): a histogram's bins are one distribution and drew eight colours.
   *
   * Two callers pass it — the grouped bar, whose row is a *(category, series)*
   * pair, and the timeline, whose row is a track. Everything else draws one row
   * per category and takes the default's single colour.
   */
  refFor?: (rowIndex: number) => ColourRef,
): readonly string[] {
  const cats = block.categories ?? [];
  const areaRows = plotAreaRows(block);
  const labels = cats.slice(0, areaRows);
  const axedBlock = gutterOf(block);
  const layout = reserving(bandLayout(labels, usableWidth(block, width, ctx), axedBlock, areaRows, ctx.capabilities, yAxisSides(block)), block, width, ctx);

  const out: string[] = [];
  for (let i = 0; i < areaRows; i++) {
    const cat = labels[i] ?? "";
    const label = i < labels.length ? truncate(cat, layout.labelColumn, ctx.capabilities) : ""; // cells-ok — a label count
    const built = i < labels.length ? rowBuilder(cat, layout.areaWidth, i) : ""; // cells-ok — a label count
    const content = typeof built === "string" ? built : built.text;
    // **Colour names an identity** (C12 I38, §3t). A named row keeps its slot;
    // a row the renderer cut from a continuous axis — a histogram's bin, a
    // correlogram's lag — has nothing for a slot to name, and eight of them
    // drew eight colours for one distribution.
    //
    // **`block.series[i]` read a row index as a series index**, which is a
    // second thing and was invisible under the first: for every form but the
    // timeline a row is a category, and only the timeline's `series[i]` was
    // ever the right series. It says so now with `refFor`.
    const s = block.series[0];
    // **A row past the last label has nothing to name**, so it does not consult
    // `refFor` — the loop runs to `areaRows` and a timeline of three tracks in
    // four rows asked for slot 3 and painted a blank row in it. Invisible, and
    // still a fourth colour in a frame with three tracks, which is a count a
    // reader and a test would disagree about.
    const own = i < labels.length && ROW_IS_AN_IDENTITY[block.form] ? i : 0; // cells-ok — a category index
    const ref = (i < labels.length ? refFor?.(i) : undefined) ?? refOf(s ?? { values: [] }, own); // cells-ok — a category count
    const body: readonly Span[] = typeof built === "string"
      ? [{ text: areaText(content, layout, ctx), style: slot(ref, ctx.theme, ctx.capabilities) }]
      : ownedSpans(areaText(content, layout, ctx), built.owners, (k) => refOf(block.series[k] ?? { values: [] }, k), ctx);
    out.push(plotRow(i, label, body, layout, ctx));
  }
  return axed(block, out, layout, ctx, xRowFor(block, layout.areaWidth, ctx));
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
  /**
   * `narrowest` is the width of the **thinnest** band, not this one's.
   *
   * **A figure chosen from a band's own width makes the chart a function of the
   * remainder distribution.** Eighteen bands over seventy-five cells is four
   * each with three left over, so three of them are five wide — and a rung
   * ladder keyed on the band's own width drew three mirrored violins among
   * fifteen rainclouds, which a reader takes as a property of those three
   * categories. Found by reading the frame; every width sums, every band is the
   * figure its width affords, and nothing about it is arithmetically wrong.
   *
   * The *drawing* still uses the band's own `colWidth` — a five-column band
   * draws its raincloud five wide. Only the choice of figure is the chart's.
   */
  columnBuilder: (categoryIndex: number, colWidth: number, rows: number, min: number, max: number, narrowest: number) => readonly string[],
  /**
   * The column's colour, where it is not the category's — **the parameter
   * `categoricalForm` already had** (C12 I42, §3v).
   *
   * Its transpose takes one so a grouped bar's rows carry their *series'*
   * colour rather than their row's, and this never got one: N×S column bands
   * would have drawn in a single colour under a legend naming S. Two arms, one
   * statement, said the same way.
   */
  refFor?: (columnIndex: number) => ColourRef,
): readonly string[] {
  const cats = block.categories ?? [];
  const n = cats.length; // cells-ok — a category count
  const areaRows = plotAreaRows(block);
  const fallback: Layout = { gutter: 0, labelColumn: 0, areaWidth: width, areaRows, width };
  if (n === 0) return emptyRows(block, fallback, ctx);

  // **Read back rather than computed here** (C12 I59, §3ak.7). The zeroing, the
  // nicing, the tick count and the scale are one call the second arm makes too —
  // and the baseline rule it carries is the reason `[10, 25, 15]` used to draw
  // nothing at 10, which both orientations reached for separately.
  const figure = categoricalDecisions(block);
  if (figure.value === null) return emptyRows(block, fallback, ctx);
  const axis = figure.value;
  const range = axis.range;
  const layout = reserving(layoutFor(block, axis, usableWidth(block, width, ctx), false, ctx.capabilities) ?? fallback, block, width, ctx);

  // Columns divide the area, remainder distributed left to right — the same
  // arithmetic `facetWidths` uses, and for the same reason: `floor(w / n)` times
  // n leaves a ragged edge at every width the count does not divide.
  const base = Math.max(1, Math.floor(layout.areaWidth / n)); // cells-ok — a column width
  const extra = layout.areaWidth - base * n; // cells-ok — a column width
  const widths = Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0)); // cells-ok — a column width

  const columns = widths.map((cw, i) => columnBuilder(i, cw, areaRows, range.min, range.max, base));

  // The value scale in the gutter, placed exactly as `overlaidRows` places it —
  // one implementation of *which row carries which label*, and the scale and the
  // capability both passed, which is the pair §3f names.
  const byRow = new Map(
    (hasYLabels(layout)
      ? yLabels(axis, layout.areaRows, block.yFormat)
      : []
    ).map((l) => [l.row, l.text]),
  );

  const out: string[] = [];
  for (let r = 0; r < areaRows; r += 1) {
    const spans: Span[] = [];
    for (const [i, col] of columns.entries()) {
      // C12 I38 stood up: a named column keeps its slot, a vertical
      // histogram's bins are one distribution and take one colour.
      const ref = refFor?.(i)
        ?? refOf(block.series[0] ?? { values: [] }, ROW_IS_AN_IDENTITY[block.form] ? i : 0); // cells-ok — a column index
      spans.push({ text: col[r] ?? " ".repeat(widths[i]!), style: slot(ref, ctx.theme, ctx.capabilities) });
    }
    out.push(plotRow(r, byRow.get(r) ?? "", spans, layout, ctx));
  }
  if (frameOf(block) === "none") return composeRows(plotHeight(block), [], out, []);
  // The frame composed here rather than through `axed`, because `furnitureFor`
  // derives its label row from `block.xLabels` and this form's labels are one
  // per column — a shape that tuple cannot hold.
  const { row, ticks } = columnLabels(cats, widths, ctx.capabilities);
  return composeRows(
    plotHeight(block),
    [frameTop(layout, ctx)],
    out,
    [
      frameBottom(layout, ticks, ctx),
      xLabelRowFor(row, layout, ctx),
      ...(block.xTitle === undefined ? [] : [xTitleRow(block.xTitle, layout, ctx)]),
    ],
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
  const axis = valueAxisOf(rough, ticksFor(areaRows), block, block.yScale);
  const range = axis.range;
  const layout = reserving(layoutFor(block, axis, usableWidth(block, width, ctx), false, ctx.capabilities) ?? fallback, block, width, ctx);

  const bands = stackBands(block.series, layout.areaWidth, centred);
  const layers: readonly Layer[] = bands.map((band, i) => ({
    glyphRows: bandRows(
      band, range.min, range.max, layout.areaWidth, layout.areaRows,
      markOf(i, ctx.capabilities),
    ),
    ref: refOf(block.series[i]!, i),
    // A stack's bands are one filled figure cut into parts — the pie's case,
    // one form along (I44).
    kind: "surface" as const,
  }));

  const labels = hasYLabels(layout) ? yLabels(axis, layout.areaRows, block.yFormat) : [];
  const byRow = new Map(labels.map((l) => [l.row, l.text]));

  const ticks = xAxis(block.xLabels, layout.areaWidth, ctx.capabilities).tickColumns;
  const area = Array.from({ length: layout.areaRows }, (_, i) =>
    plotRow(
      i,
      byRow.get(i) ?? "",
      behind(gridRow(layout, ticks, ctx, byRow.has(i)), mergedRow(layers, i, layout, ctx), ctx),
      layout,
      ctx,
    ),
  );
  return axed(block, area, layout, ctx, xRowFor(block, layout.areaWidth, ctx));
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
    return barRow(v, baselineOf(data.min), data.max, aw, ctx.capabilities, false);
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
 *
 * **The names are read off the grid, not off the rectangle** (C12 I55, §3n,
 * F217). §3n ruled that a tile's label goes in the padding ring, on the
 * reasoning that the ring is the only part of a parent a child does not paint
 * over — and the arithmetic disagrees. `pad` is **one scalar on the unit
 * square** and the two axes have different cell counts: at 80 × 12 it is
 * `1/80`, which is `1.000` cells across and **`0.150` rows down**. So the ring
 * is one cell wide and zero rows tall, `render` and its child `curve` both
 * start at row 0, and there is no top row to write in.
 *
 * Reading the placement from the filled grid is I48's principle one label kind
 * along — *its row is read from ink rather than recomputed* — and it is total
 * where the rectangle is not: it answers for a leaf, for a parent, for the root,
 * and for either aspect, since which axis gets the ring flips when `areaRows`
 * exceeds `width`.
 *
 * **Two tiles can never both own a cell**, because ownership was already
 * resolved by the depth-ordered fill above. So the label pass cannot overwrite
 * another tile's label however it is ordered, and I55's *one pass onto free
 * cells* holds here by construction rather than by care.
 *
 * **On today's padding this names the leaves and no interior node**, measured:
 * `render` and `layout` own one cell either side of their children and `curve`
 * owns two, so none has a run wide enough. That is what the references draw —
 * an interior name wants a header row, which is a question about the *layout*
 * and is left to one (§3n). The alternative is a feature reaching back to widen
 * the geometry that serves it.
 */
/**
 * A tree — the node-link figure, in whichever of three layouts fits (C12 I57).
 *
 * **The area is geometry and the row beneath it is a claim about the data.**
 * `tree.ts` returns plain rows and the names it had to drop; the notice is I8's
 * mechanism and is toned here, because a node not drawn is data going missing —
 * the opposite of the tile whose *name* did not fit, which is still drawn, still
 * coloured and still carries its extent (§3n, §3ah.7).
 */
function treeRows(block: Plot, width: number, ctx: RenderContext): readonly string[] {
  const root = block.hierarchy;
  const areaRows = plotAreaRows(block);
  const layout: Layout = { gutter: 0, labelColumn: 0, areaWidth: width, areaRows, width };
  if (root === undefined) return emptyRows(block, layout, ctx);

  const drawn = treeArea(
    root, areaRows, width, block.treeLayout, ctx.capabilities, block.plotCorners ?? "rounded",
  );
  const out = drawn.rows.map((r) => line([{ text: r }], layout, ctx));
  if (drawn.dropped.length > 0) { // cells-ok — a node count
    const sep = partSeparator(ctx.capabilities);
    const notice = `+${String(drawn.dropped.length)} more${sep}${drawn.dropped.join(sep)}`; // cells-ok — a node count
    out.push(
      line(
        [{ text: areaText(notice, layout, ctx), style: tone("warn", ctx.theme, ctx.capabilities) }],
        layout,
        ctx,
      ),
    );
  }
  return composeRows(plotHeight(block), [], out, []);
}

/**
 * `graph` — the layered figure, and the row that says what is not in it.
 *
 * **The notice carries two counts, not one** (C12 §3ai.3). What was dropped for
 * space is the ordinary case past about a dozen nodes; what the cycle pass
 * reversed is the one thing the figure would otherwise misstate, because the
 * drawing takes its direction from the layering and a reversed edge runs against
 * it. A second row would cost a row of the drawing, so the row that already
 * exists says both.
 */
function graphRows(block: Plot, width: number, ctx: RenderContext): readonly string[] {
  const g = block.graph;
  const areaRows = plotAreaRows(block);
  const layout: Layout = { gutter: 0, labelColumn: 0, areaWidth: width, areaRows, width };
  if (g === undefined) return emptyRows(block, layout, ctx);

  const drawn = graphArea(g, areaRows, width, ctx.capabilities, block.plotCorners ?? "rounded");
  const out = drawn.rows.map((r) => line([{ text: r }], layout, ctx));
  const sep = partSeparator(ctx.capabilities);
  const parts: string[] = [];
  if (drawn.dropped.length > 0) parts.push(`+${String(drawn.dropped.length)} more`); // cells-ok — a node count
  if (drawn.reversed > 0) parts.push(`${String(drawn.reversed)} reversed`); // cells-ok — an edge count
  if (drawn.dropped.length > 0) parts.push(drawn.dropped.join(sep)); // cells-ok — a node count
  if (parts.length > 0) { // cells-ok — a part count
    out.push(
      line(
        [{ text: areaText(parts.join(sep), layout, ctx), style: tone("warn", ctx.theme, ctx.capabilities) }],
        layout,
        ctx,
      ),
    );
  }
  return composeRows(plotHeight(block), [], out, []);
}

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

  // The names, written into cells their own tile still owns. `undefined` is
  // *no label here*; `""` is the second cell of a wide codepoint and emits
  // nothing, so a two-cell character cannot leave a hole the fill walks into.
  const ambiguous = ctx.capabilities.ambiguousWidth;
  const named: (string | undefined)[][] =
    Array.from({ length: areaRows }, () => new Array<string | undefined>(width).fill(undefined));
  for (const t of placed) {
    // The blanks are `hierarchyStripRows`' convention, and they are what keeps
    // a name off its neighbour's colour rather than decoration.
    const text = ` ${t.label} `;
    const at = ownRun(grid, t.index, cells(text, ambiguous), areaRows, width); // cells-ok — a tile index
    if (at === null) continue;
    let col = at.col; // cells-ok — a column position
    for (const ch of text) {
      named[at.row]![col] = ch;
      const w = cells(ch, ambiguous);
      for (let k = 1; k < w; k += 1) named[at.row]![col + k] = ""; // cells-ok — a cell count
      col += w;
    }
  }

  const out = grid.map((row, r) => {
    const spans: Span[] = [];
    let run = "", runIdx = -2; // cells-ok — a tile index
    const flush = (): void => {
      if (run === "") return;
      spans.push(runIdx < 0 ? { text: run }
        : { text: run, style: slot(categoryRef(runIdx), ctx.theme, ctx.capabilities) });
      run = "";
    };
    for (const [c, idx] of row.entries()) { // cells-ok — a column position
      if (idx !== runIdx) { flush(); runIdx = idx; }
      // A name shares its tile's slot, so the run is unbroken and the letters
      // arrive in the colour the rectangle is already drawn in.
      const glyph = named[r]![c];
      run += glyph !== undefined ? glyph
        : idx < 0 ? " " : markOf(idx, ctx.capabilities); // cells-ok — a tile index
    }
    flush();
    return line(spans, layout, ctx);
  });
  return composeRows(plotHeight(block), [], out, []);
}

/**
 * The topmost run of `need` cells a tile still owns, or nothing (C12 I55).
 *
 * **Ownership comes from the painted grid**, so a parent covered by its children
 * has only its padding ring left and answers `null` where the ring is narrower
 * than the name — which is §3n's drop condition arriving from the ink rather
 * than from `inset`'s threshold, and correct on both aspects rather than on the
 * one the threshold was written for.
 */
function ownRun(
  grid: readonly (readonly number[])[],
  index: number,
  need: number,
  areaRows: number,
  width: number,
): { row: number; col: number } | null {
  for (let r = 0; r < areaRows; r += 1) { // cells-ok — a row index
    let start = -1; // cells-ok — a column position
    for (let c = 0; c <= width; c += 1) { // cells-ok — a column position
      const own = c < width && grid[r]![c] === index; // cells-ok — a tile index
      if (own && start < 0) start = c; // cells-ok — a column position
      if (!own && start >= 0) { // cells-ok — a column position
        if (c - start >= need) return { row: r, col: start }; // cells-ok — a cell count
        start = -1; // cells-ok — a column position
      }
    }
  }
  return null;
}

function positionalForm(
  block: Plot,
  width: number,
  ctx: RenderContext,
  rasterise: Rasteriser,
): readonly string[] {
  const stacked = stacksAtOneBit(block, ctx.capabilities); // cells-ok — a series count
  const bars = candlesOf(block);
  // **The decisions are read back rather than made here** (C12 I59, §3ak.7).
  // Everything this function used to compute above the rasteriser — the extent,
  // the nicing, the tick count, the scale, the facing — is one call, and the
  // second arm makes the same one. A renderer that computes a decision is a
  // renderer that can disagree, and this is the first of the seven families to
  // stop.
  const figure = positionalDecisions(block);
  const data = figure.extent;
  // **One nicing, taken where the data is measured** (F210). The axis the gutter
  // is labelled from must be the axis the curve is rasterised against, and the
  // only arrangement in which two of them cannot drift apart is one of them.
  // `niceAxis` is not idempotent — a second pass sees the widened span, reaches
  // for a coarser step and widens again — so the previous shape, which niced
  // here and niced again inside `yLabels`, put `15` in the gutter beside a row
  // holding `12.4`.
  //
  // **A stacked plot carries its raw bounds, and that is not an exception.** Its
  // gutter holds series names rather than a scale (§5), so nothing is ever
  // labelled against this axis; there is no scale here, only the bounds the
  // bands are cut to, and that is what the object says.
  const axis: Axis | null = data === null || figure.value === null
    ? null
    : stacked
      ? { range: data, ticks: [data.min, data.max], step: 0 }
      : figure.value;
  const usable = usableWidth(block, width, ctx);
  // **With no data the axis cannot reach the frame, and that was worth checking
  // rather than asserting.** The comment here first said a bare unit axis would
  // size the gutter from `0` and `1` and move every *No data.* frame; the
  // mutation for it survived, because this layout's only consumer is
  // `emptyRows`, which reads `layout.width` and nothing the axis influences.
  // The dependency is two functions away and the type cannot state it, so it is
  // stated here: a gutter drawn on an empty plot would make this line matter.
  const sizing = axis ?? { range: { min: 0, max: 1 }, ticks: [0, 1], step: 1 };
  const layout = reserving(
    layoutFor(block, sizing, usable, stacked, ctx.capabilities)
      ?? { areaRows: plotAreaRows(block), width: usable, gutter: 0, labelColumn: 0, areaWidth: usable },
    block, width, ctx,
  );
  // **A pinned range is not a reading.** `seriesRange` answers *what are the
  // bounds*, and with `yMin`/`yMax` given it answers even for an empty series —
  // so `ecdf`, which pins 0..1 to build its block, drew bare axes where every
  // other empty variant says *No data.* The question here is whether anything
  // was measured, and only the samples can answer it. The same defect waits on
  // any form given pinned bounds and no data; this is the one that had one.
  // **B1 — the row that would have been got wrong.** Every emptiness check in
  // this component asks about `series`, and plain candles are `series: []` with
  // a full `ohlc`: a correct block rendering *"No data."*, internally consistent
  // and about nothing. `series: []` being legal is exactly what hides it.
  if (axis === null || !(hasSamples(block.series) || hasBars(bars))) {
    return emptyRows(block, layout, ctx);
  }
  const range = axis.range;

  const cursorIdx = ctx.cursorPositions?.[block.id];
  const marked = frameOf(block) !== "none" && cursorIdx !== undefined && Number.isFinite(cursorIdx);
  const at = marked ? cursorColumn(block, cursorIdx, layout.areaWidth) : null;
  // **One x axis, computed here and handed to both halves** (§3ad B2). The
  // crossing axis's column is on it, and it is needed while the area is composed
  // — before the furniture exists. Two calls would be two chances for the
  // vertical rule and the `0` caption to land in different cells.
  const xaxis = xRowFor(block, layout.areaWidth, ctx);
  const area = stacked
    ? stackedRows(block, range, layout, ctx)
    : overlaidRows(block, axis, layout, ctx, xaxis, rasterise, candleLayers(bars, range, layout, ctx, figure.facing), at);
  if (marked) {
    return axedWithCursor(block, cursorIdx, at, area, layout, ctx, xaxis);
  }
  return axed(block, area, layout, ctx, xaxis);
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

  const layout = reserving(bandLayout(cats, usableWidth(block, width, ctx), gutterOf(block), areaRows, ctx.capabilities, yAxisSides(block)), block, width, ctx);
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
    // **The figure is centred in its band and the label follows it** (I28).
    // Drawn from row 0 with the name at `⌊rowsPer ÷ 2⌋`, a rung spending fewer
    // rows than its band put the name two rows below the figure — pointing at
    // blank space, with the box it named above it and unlabelled. Two correct
    // placements that never meet: a renderer starts at its first row, and a
    // band's name belongs at its centre. Every count was right, which is why
    // reading the frame is what found it.
    //
    // **The figure's middle row, not its geometric centre.** A box's middle row
    // is its spine and a raincloud's is its box — the *last* of its two — so
    // taking `⌊rows ÷ 2⌋` of the figure lands on both where centring the label
    // would put a raincloud's name on its density. Zero wherever the figure
    // fills its band, which is every scaling rung and every other form.
    const offset = Math.max(0, Math.floor((rowsPer - band.length) / 2)); // cells-ok — a row count
    const labelRow = offset + Math.floor(band.length / 2); // cells-ok — a row count
    // **A band is a category and not a series** (C12 I38). Its data is in
    // `quartiles`, so `sr` is absent — the palette index has to come from the
    // band rather than from a series that is not there, and `block.series[0]`
    // is what carries a caller's explicit `tone` when there is one.
    const styled = slot(
      refOf(block.series[0] ?? { values: [] }, ROW_IS_AN_IDENTITY[block.form] ? ci : 0),
      ctx.theme, ctx.capabilities,
    );

    for (let r = 0; r < rowsPer && out.length < areaRows; r += 1) { // cells-ok — a row count
      const label = r === labelRow ? truncate(cats[ci] ?? "", layout.labelColumn, ctx.capabilities) : "";
      out.push(
        plotRow(
          out.length, // cells-ok — a row index
          label,
          [{ text: areaText(band[r - offset] ?? " ".repeat(areaWidth), layout, ctx), style: styled }],
          layout,
          ctx,
        ),
      );
    }
  }

  // **The leftover rows carry a blank plot area, not nothing.** `rowsPer` is
  // `⌊areaRows ÷ n⌋`, so a height its band count does not divide leaves rows to
  // pad — and this loop wrote the gutter and the right border with no area
  // between them, putting the two borders in adjacent columns. Every banded
  // fixture in the catalogue happened to divide evenly, so the padding loop had
  // never drawn a row; the first one that did not divide showed `││` three
  // frames wide. PC12 is named for the border and checked only the left.
  while (out.length < areaRows) { // cells-ok — a row count
    out.push(plotRow(
      out.length, // cells-ok — a row index
      "",
      [{ text: areaText(" ".repeat(Math.max(0, layout.areaWidth)), layout, ctx) }],
      layout,
      ctx,
    ));
  }
  return axed(block, out, layout, ctx, xRowFor(block, layout.areaWidth, ctx));
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
    // **`overlap` with more than one series means grouped** (C12 I42, §3v).
    // Two runs superimposed in one row of cells is one run, so the name
    // describes a picture the vocabulary does not have — and falling through to
    // the single-series path drew the first while the legend named them all,
    // which is I8's rule broken in the arm beside the one whose comment records
    // being fixed for it.
    const spread = (layout === "grouped" || layout === "overlap") && block.series.length > 1; // cells-ok — a series count
    // **Vertical is tested before grouped, and the order is the ruling.** A
    // grouped *vertical* bar fell into the horizontal arm and came back as rows
    // — the orientation is what decides which renderer draws, and the layout
    // only what it draws.
    if (spread && block.orientation === "vertical") {
      const cats = block.categories ?? [];
      const per = block.series.length; // cells-ok — a series count
      const ordered = cats.flatMap((_c, i) => block.series.map((sr) => sr.values[i] ?? null));
      // **The group's name goes under its first band and the rest go blank**,
      // where the horizontal arm names every row. A gutter has room for
      // `[20.0, 25.1) · before`; a band three cells wide has room for nothing,
      // so composing the same label under a column drops **every** label and
      // the bin edges disappear from the axis entirely. The series is named by
      // the legend — which is what §3g auto-enables a legend for.
      const banded: Plot = {
        ...block,
        categories: cats.flatMap((c) => block.series.map((_sr, k) => (k === 0 ? c : ""))),
        series: [{ values: ordered }],
      };
      return categoricalColumnForm(banded, width, ctx, (i, cw, rows, lo, hi) =>
        barColumn(ordered[i] ?? null, lo, hi, cw, rows, ctx.capabilities, true, block.yFormat),
        // Bands run category-major, so band `r` is series `r % n` — which is
        // what the legend names, and what the band's own index does not.
        (r) => slotOf(r % per), // cells-ok — a series index
      );
    }
    if (spread) { // cells-ok — a series count
      // One row per (category, series), in category-major order, so a group's
      // bars sit together and the gutter names which series each one is.
      const cats = block.categories ?? [];
      const base = baselineOf(data.min);
      const ordered = cats.flatMap((_c, i) => block.series.map((sr) => sr.values[i] ?? null));
      const grouped = {
        ...block,
        categories: cats.flatMap((c) =>
          block.series.map(
            (sr, k) => `${c}${partSeparator(ctx.capabilities)}${sr.label ?? String(k + 1)}`,
          ),
        ),
      };
      let oi = 0;
      const perSeries = block.series.length; // cells-ok — a series count
      return categoricalForm(
        grouped, width, ctx,
        (_label, aw) => barRow(ordered[oi++] ?? null, base, data.max, aw, ctx.capabilities, true, block.yFormat,
          labelAllowance(ordered, block.yFormat, ctx.capabilities)),
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
        barColumn(block.series[0]?.values[i] ?? null, lo, hi, cw, rows, ctx.capabilities, true, block.yFormat),
      );
    }
    let ri = 0;
    const base = baselineOf(data.min);
    const allow = labelAllowance(block.series[0]?.values ?? [], block.yFormat, ctx.capabilities);
    return categoricalForm(block, width, ctx, (_label, aw) => {
      const v = block.series[0]?.values[ri++] ?? null;
      return barRow(v, base, data.max, aw, ctx.capabilities, true, block.yFormat, allow);
    });
  },
  histogram: (block, width, ctx) => {
    const layout: Layout = { gutter: 0, labelColumn: 0, areaWidth: width, areaRows: plotAreaRows(block), width };
    if (block.series.length === 0) return emptyRows(block, layout, ctx); // cells-ok — a series count
    // **Every series, on one edge set** (C12 I42, §3v). Binned on its own
    // extent each series fills the width, so two distributions of different
    // spreads draw the same picture and the comparison is gone — I35's argument
    // one form along.
    const { labels, counts, edges } = binValues(
      block.series.map((sr) => sr.values), block.binning ?? "sturges",
    );
    if (counts[0] === undefined || counts[0].length === 0) return emptyRows(block, layout, ctx); // cells-ok — a bin count

    // **Binned, a histogram *is* a bar chart of counts**, so the drawing is the
    // bar's and all four layouts arrive together rather than being invented
    // here. The series keep their labels and tones: the legend names them and
    // the picture has to agree with it.
    const counted: readonly Series[] = counts.map((values, i) => {
      const sr = block.series[i];
      return {
        values,
        ...(sr?.label === undefined ? {} : { label: sr.label }),
        ...(sr?.tone === undefined ? {} : { tone: sr.tone }),
      };
    });
    // **`overlap` cannot mean *draw the first one*** (C12 I42). Two runs
    // superimposed in one row of cells is one run, so the name describes a
    // picture the vocabulary does not have, and dropping the rest is what I8
    // forbids — with the legend still naming them, which makes it an assertion
    // rather than an omission.
    const many = counted.length > 1; // cells-ok — a series count
    // **`form` stays `histogram`, and the golden corpus is what said so.**
    // Rewriting it to `"bar"` made the delegation an *identity* change as well
    // as a rendering one: `ROW_IS_AN_IDENTITY` is keyed on the form, `bar`'s
    // rows are named categories and a histogram's are slices of an axis, so the
    // bins came back in eight colours — I38's defect, reintroduced by the
    // delegation that fixed I42. Four frames moved and nothing else did.
    //
    // Nothing in the bar arm branches on the form's name; the three records it
    // reads — `ROW_IS_AN_IDENTITY`, `HAS_POSITION_AXIS`, `SHARES_CELLS` — all
    // want the histogram's answers, so the delegation is a call and not a cast.
    const asBar: Plot = {
      ...block,
      categories: labels,
      series: counted,
      ...(many ? { layout: block.layout === undefined || block.layout === "overlap" ? "grouped" : block.layout } : {}),
      // The bin's **lower edge** along a bottom axis, not its interval:
      // `[18.3, 23.1)` needs twelve cells and a nine-cell column drops it.
      ...(block.orientation === "vertical"
        ? { categories: edges.slice(0, counts[0].length).map((e) => e.trim()) } // cells-ok — a bin count
        : {}),
    };
    return FORM_ROWS.bar(asBar, width, ctx);
  },
  boxplot: (block, width, ctx) => {
    const qs = block.quartiles ?? [];
    if (qs.length === 0) return emptyRows(block, { gutter: 0, labelColumn: 0, areaWidth: width, areaRows: plotAreaRows(block), width }, ctx); // cells-ok — a quartile count
    // **The family's extent** — the whiskers, plus outliers (C12 §3aj).
    const { min: lo, max: hi } = quartileRange(qs) ?? { min: 0, max: 1 };
    const cats = block.categories ?? qs.map((_q, i) => `series ${String(i + 1)}`);
    if (block.orientation === "vertical") {
      // The same figure stood up: one column band per category, the value scale
      // in the gutter, and `boxplotColumn`'s three columns where the horizontal
      // table has three rows.
      const boxed = { ...block, categories: cats, yMin: lo, yMax: hi };
      return categoricalColumnForm(boxed, width, ctx, (i, cw, rows, low, high) => {
        const q = qs[i];
        return q
          ? boxplotColumn(q, low, high, cw, rows, ctx.capabilities, block.plotBox ?? "solid")
          : Array.from({ length: rows }, () => " ".repeat(cw));
      });
    }
    return bandedForm(block, cats, width, ctx, (_sr, aw, rows, i) => {
      const q = qs[i];
      return q
        ? boxplotBand(q, lo, hi, aw, rungRows(rungFor(block, "boxplot", rows, "rows", 0), rows), ctx.capabilities, block.plotBox ?? "solid")
        : Array.from({ length: rows }, () => " ".repeat(aw));
    });
  },
  forest: (block, width, ctx) => {
    const qs = block.quartiles ?? [];
    if (qs.length === 0) return emptyRows(block, { gutter: 0, labelColumn: 0, areaWidth: width, areaRows: plotAreaRows(block), width }, ctx); // cells-ok — a quartile count
    // **The interval arm**: a confidence bound is not a whisker and can reach
    // past it, so a forest plot ranges over `lower`/`upper` where they are set.
    const { min: lo, max: hi } = quartileRange(qs, true) ?? { min: 0, max: 1 };
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
    // **A legend, because a mosaic of colour is nothing without its key**
    // (C12 I25, §3g). The pie has one and the waffle did not — the same data,
    // the same segments, and one of the two shipped a block of coloured squares
    // with no way to know which was which. It reads worse than the pie does,
    // because a waffle's whole subject is the proportion each colour holds.
    //
    // **`segmentLegend` rather than a second builder**: the pie's is capped at a
    // third of the width, drops labels before starving the figure and truncates
    // with a count, and a waffle wants all three. Two builders for one job is
    // the drift a shared one cannot have.
    const total = segs.reduce((a, sg) => a + Math.max(0, sg.value), 0);
    const legend = segmentLegend(
      segs.map((sg, i) => ({
        swatch: pairFor(ctx.capabilities).filled,
        label: sg.label,
        value: total > 0 ? `${String(Math.round((Math.max(0, sg.value) / total) * 100))}%` : "",
        index: i, // cells-ok — a segment index
      })),
      WAFFLE_ROWS,
      Math.floor(width / 3), // cells-ok — a cell width
      ctx.capabilities,
    );
    // **The gap is reserved too, which the first frame is what said.** A waffle
    // row is padded to the width it is given, so the legend begins exactly
    // where the mosaic's padding ends — and reserving only `legend.width` left
    // its own two-cell gap hanging past the frame, truncating every percentage
    // to `…`. The figure and the key are one row; the budget has to hold both.
    const reserved = legend.width === 0 ? 0 : legend.width + LEGEND_GAP; // cells-ok — a cell width
    // **The mosaic takes its natural width, not the leftover.** `waffleCells`
    // pads to whatever it is handed, so handing it the remainder put the key
    // forty-five blank cells from the squares it names. A waffle is ten rows of
    // squares and its width follows from that; the legend belongs beside it.
    const mosaic = Math.min(Math.max(1, width - reserved), squareColumns(WAFFLE_ROWS)); // cells-ok — a cell width
    const cellRows = waffleCells(segs, mosaic, ctx.capabilities);
    return cellRows.map((row, r) => {
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
      return line(
        [...spans, ...markedSpans(legend.lines[r] ?? [], (i) => slotOf(i), ctx)],
        layout,
        ctx,
      );
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
  tree: (block, width, ctx) => treeRows(block, width, ctx),
  graph: (block, width, ctx) => graphRows(block, width, ctx),

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
  slope: (block, width, ctx) => positionalForm(block, width, ctx, (sr, range, aw, rows, caps, facing) => {
    const vals = sr.values.filter((v): v is number => v !== null && Number.isFinite(v));
    const ends = vals.length >= 2 // cells-ok — a sample count
      ? { values: [vals[0]!, vals[vals.length - 1]!] } // cells-ok — a sample index
      : { values: vals };
    return curveRows(ends, range, aw, rows, caps, facing);
  }),

  /**
   * A bubble chart — scatter with a **size** channel (C04 §8).
   *
   * The fourth encoding axis, and the one a terminal has least room for: a cell
   * is the smallest mark there is, so size is spent on *how many cells* rather
   * than on a radius. Two series, read as (position, magnitude).
   */
  bubble: (block, width, ctx) => positionalForm(block, width, ctx, (sr, range, aw, rows, caps, facing) =>
    bubbleRows(sr, block.series[1], range, aw, rows, caps, facing)),

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
      timelineRow(block.series[ti++], data, aw, ctx.capabilities),
      // **The one form whose rows are series** (I38, §3t's table). Every other
      // caller draws one row per category and takes the default's one colour;
      // a track is a series, so the palette indexes it. Stated rather than
      // inherited — the old default was accidentally right here, and losing it
      // would have drawn three tracks in one colour with every count correct.
      (r) => refOf(block.series[r] ?? { values: [] }, r), // cells-ok — a track index
    );
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
    // **One predicate for the form's four call sites** (C12 I54, §3af).
    // `plotStyle` names the figure and the capability names the alphabet, and
    // each of the four routines below already holds `ctx.capabilities` — the
    // decision was simply made before it got there, so an ASCII frame came back
    // in braille. Degraded and never refused, on I18's precedent: a caller
    // cannot avoid the terminal they are on.
    //
    const brailleArm = block.plotStyle === "braille" && ctx.capabilities.unicode !== "ascii";
    // **The width arm belongs to one rung of three, and it is `brailleOutline`'s
    // to state** (I54, §3ak.25, F302). `brailleArm` above stays the author's
    // request, which is what the filled-density rungs answer to; the outline rung
    // also asks *how wide is this glyph*, and that predicate is exported beside
    // the renderers rather than written here, because a rule with two copies is
    // exactly the finding.
    const outlineInBraille = brailleOutline(block.plotStyle, ctx.capabilities);
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
      return categoricalColumnForm({ ...block, categories: cats }, width, ctx, (i, cw, rows, _lo, _hi, narrowest) => {
        const sr = block.series[i];
        if (sr === undefined) return Array.from({ length: rows }, () => " ".repeat(cw));
        // **The column floor is enforced here rather than refused**, because
        // construction cannot see a width (C04 I56, I18's ladder): below three
        // columns a violin is four dot-columns split between density and box, so
        // the honest figure is the box.
        // **The narrowest band and not this one** — one chart draws one figure,
        // and the remainder is what decides which bands are a cell wider.
        const rung = rungFor(block, "violin", narrowest, "columns", finiteCount(sr));
        if (!rung.density) {
          return boxplotColumn(qs[i] ?? summaryOf(sr) ?? EMPTY_SUMMARY, shared?.min ?? 0, shared?.max ?? 1, cw, rows, ctx.capabilities, block.plotBox ?? "solid");
        }
        if (rung.rung === "rain" || rung.rung === "raindrop") {
          return rainColumns(
            sr, qs[i] ?? summaryOf(sr), shared?.min ?? 0, shared?.max ?? 1, cw, rows,
            ctx.capabilities, i, rung.rung === "raindrop", block.bandwidth,
            brailleArm, block.plotFill === "solid",
            block.plotBox ?? "solid",
          );
        }
        return violinColumn(
          sr, cw, rows, ctx.capabilities, qs[i] ?? summaryOf(sr),
          block.plotCorners ?? "rounded", block.bandwidth, shared,
          outlineInBraille, block.plotFill === "solid",
        );
      });
    }
    // **The violin routes through the same chooser as the boxplot**, which is
    // what makes `"compact"` mean *the form's floor* rather than one row for
    // everything: a violin's floor is the raincloud, because a violin with no
    // density is a box plot and the field said `violin`.
    return bandedForm(block, cats, width, ctx, (sr, aw, rows, i) => {
      const rung = rungFor(block, "violin", rows, "rows", finiteCount(sr));
      const spent = rungRows(rung, rows);
      if (!rung.density) {
        const q = qs[i] ?? summaryOf(sr);
        return q === undefined
          ? Array.from({ length: rows }, () => " ".repeat(aw))
          : boxplotBand(q, shared?.min ?? 0, shared?.max ?? 1, aw, spent, ctx.capabilities, block.plotBox ?? "solid");
      }
      // **The rung, not the row count**, because two rungs can be handed the
      // same budget: `"compact"` takes the floor at any height, so a raincloud
      // and a mirrored violin both arrive here with rows to spare.
      if (rung.rung === "rain" || rung.rung === "raindrop") {
        return rainRows(
          sr, qs[i] ?? summaryOf(sr), shared?.min ?? 0, shared?.max ?? 1, aw,
          ctx.capabilities, i, rung.rung === "raindrop", block.bandwidth,
          brailleArm, block.plotFill === "solid",
          block.plotBox ?? "solid",
        );
      }
      // The vocabulary, not the geometry (C12 I43, §3w) — every rung, budget
      // and extent above is unchanged by which alphabet strokes the outline.
      return violinRows(
        sr, aw, spent, ctx.capabilities, qs[i] ?? summaryOf(sr),
        block.plotCorners ?? "rounded", block.bandwidth, shared,
        outlineInBraille, block.plotFill === "solid",
      );
    });
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

    const layout = reserving(bandLayout(cats, usableWidth(block, width, ctx), gutterOf(block), areaRows, ctx.capabilities, yAxisSides(block)), block, width, ctx);
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
      return plotRow(r, label, runs, layout, ctx);
    });
    return axed(block, out, layout, ctx, xRowFor(block, layout.areaWidth, ctx));
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
    // **The substitution rung is `ascii` **or** `wide`** (F293, §3ak.18). The
    // quadrant blocks are ambiguous-width throughout, so a terminal that draws
    // them wide puts two cells in each one-cell slot of a mask built in cells —
    // and the answer is the same replacement, because a shape has no coarser
    // form that is still that shape.
    if (flatAlphabet(ctx.capabilities)) {
      return pieAsciiRows(segs, width, areaRows, ctx.capabilities).map((row) =>
        line(markedSpans(row, (i) => categoryRef(i), ctx), layout, ctx),
      );
    }
    // **A solid pie degrades to braille at one bit rather than refusing**
    // (C12 I43, §3w). `CATEGORY_PATTERNS` is that depth's identity channel and
    // a block glyph has no hatch to carry, so a solid pie there is an
    // undifferentiated disc — I18's precedent: where the capability cannot
    // spare what a figure needs, the honest answer is the thing that fits and
    // not an error the caller could not have avoided.
    const solid = block.plotStyle === "solid" && ctx.capabilities.colourDepth !== 1;
    const pie = pieRender(segs, width, areaRows, ctx.capabilities, solid);
    if (pie.layers.length === 0) return emptyRows(block, layout, ctx); // cells-ok — a layer count
    const fills: readonly Layer[] = pie.layers.map((pl) => ({
      glyphRows: pl.glyphRows,
      ref: categoryRef(pl.segmentIndex),
      kind: "surface" as const,
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
    // **The substitution rung is `ascii` **or** `wide`** (F293, §3ak.18). The
    // quadrant blocks are ambiguous-width throughout, so a terminal that draws
    // them wide puts two cells in each one-cell slot of a mask built in cells —
    // and the answer is the same replacement, because a shape has no coarser
    // form that is still that shape.
    if (flatAlphabet(ctx.capabilities)) {
      return radarAsciiRows(block.series, cats, width, areaRows, ctx.capabilities).map((row) =>
        line(markedSpans(row, seriesRef, ctx), layout, ctx),
      );
    }
    const radar = radarRender(
      block.series, cats, width, areaRows, ctx.capabilities,
      block.plotStyle === "line", block.plotGrid ?? "polygon",
    );
    if (radar.polygons.length === 0) return emptyRows(block, layout, ctx); // cells-ok — a layer count
    // **Labels first, frame last, series between them.** `mergedRow` takes the
    // first layer to ink a cell, so the order is a priority: a word a polygon
    // runs through is unreadable, and the scale is context rather than a
    // reading — it may only have the cells nothing else wanted.
    const layers: readonly Layer[] = [
      { glyphRows: radar.labels, ref: "tone.muted", kind: "label" },
      ...radar.polygons.map((glyphRows, i) => ({ glyphRows, ref: seriesRef(i), kind: "curve" as const })),
      { glyphRows: radar.frame, ref: "tone.muted", kind: "context" },
    ];
    const discLayout: Layout = { ...layout, areaWidth: radar.discWidth };
    const out: string[] = [];
    // **One figure and no merge for the line arm** (C12 I43, §3w). At cell
    // resolution `mergedRow`'s layers eat each other — I40's union is
    // braille's alone — so the quadrant arm composes a single owned grid, which
    // is `ridgelineArea`'s mechanism for curves that overlap by construction.
    const figureRef = (i: number): ColourRef =>
      i >= block.series.length ? "tone.muted" : seriesRef(i); // cells-ok — a series count
    for (let r = 0; r < areaRows; r += 1) {
      const body = radar.figure !== undefined
        ? markedSpans(radar.figure[r] ?? [], figureRef, ctx)
        : mergedRow(layers, r, discLayout, ctx);
      out.push(line(
        [...body, ...markedSpans(radar.legend[r] ?? [], seriesRef, ctx)],
        layout,
        ctx,
      ));
    }
    return out;
  },
  // **Two channels, and they are resolved in two places** (I52, §3z). The grid
  // is pure geometry — band, sign and eighths per cell — and the spans are where
  // capability decides which of them a terminal can carry. Computing both
  // together is what let one alphabet carry both, which is the defect this form
  // shipped with.
  horizon: (block, width, ctx) => {
    const s = block.series[0];
    const areaRows = plotAreaRows(block);
    const layout = { gutter: 0, labelColumn: 0, areaWidth: width, areaRows, width };
    if (!s) return emptyRows(block, layout, ctx);
    const data = seriesRange(block.series, block);
    if (data === null) return emptyRows(block, layout, ctx);
    const bands = block.bands ?? 3;
    const map = colormapFor(block);
    const area = horizonGrid(s, data, bands, width, areaRows).map((row) =>
      line(horizonSpans(row, bands, map, ctx), layout, ctx));
    // **The legend is the reading and not decoration** (§3z H7): a band is an
    // ordinal index into a colour, so a horizon without the scale beside it is a
    // picture of coloured noise. I19's argument for a matrix's scale, on the one
    // other form whose channel a reader has to learn. `legend: false` is refused
    // at both gates rather than dropped here.
    const legend = line(
      horizonLegendSpans(data, bands, horizonIsSigned(s, data), map, block.yFormat, ctx),
      layout, ctx);
    return composeRows(plotHeight(block), [], area, [legend]);
  },

  heatmap: (block, width, ctx) => heatmapFormRows(block, width, ctx),
  // **The field family's second reading, on the family's own path** (I49, §3y).
  // A contour is the matrix renderer plus a glyph layer, which is why it is here
  // and not a renderer of its own: the layout, the anchor, the gutter and the
  // legend are all the matrix's, and the only new thing is what goes over the
  // cells.
  contour: (block, width, ctx) => heatmapFormRows(block, width, ctx),
  quiver: (block, width, ctx) => heatmapFormRows(block, width, ctx),
};

/**
 * The cells the figure is drawn in, which is the frame unless the caller said
 * otherwise (C04 I62, §3ab).
 *
 * **Clamped rather than refused**, because this is the first place the frame's
 * width exists: C04 has no terminal, so a gate refusing a width wider than the
 * screen would be asserting a fact it does not hold.
 */
export function drawnWidth(block: Plot, frame: number): number {
  const cap = Math.max(1, Math.floor(frame)); // cells-ok — a cell count
  if (block.width !== undefined && Number.isFinite(block.width)) {
    return Math.min(cap, Math.max(1, Math.floor(block.width))); // cells-ok — a cell count
  }
  if (block.aspect !== undefined) {
    return Math.min(cap, columnsForAspect(plotHeight(block), block.aspect)); // cells-ok
  }
  return cap;
}

/**
 * The blank columns to the left of a narrowed figure (C04 I62, §3ab).
 *
 * `"left"` is the default and is today's behaviour, so a plot that declares
 * neither `width` nor `aspect` pads by nothing and renders byte for byte as it
 * did. **The leftover cell goes right at `"centre"`**, on `facetWidths`' own
 * rule for the same arithmetic.
 */
export function alignPad(block: Plot, frame: number, drawn: number): number {
  const slack = Math.max(0, Math.floor(frame) - drawn); // cells-ok — a cell count
  if (slack === 0) return 0; // cells-ok — a cell count
  if (block.align === "right") return slack; // cells-ok — a cell count
  if (block.align === "centre") return Math.floor(slack / 2); // cells-ok — a cell count
  return 0; // cells-ok — a cell count
}

const render = (block: Plot, ctx: RenderContext): ReactElement => {
  const frame = Math.max(1, Math.floor(ctx.width));
  const drawn = drawnWidth(block, frame);
  const pad = alignPad(block, frame, drawn);
  const body = FORM_ROWS[block.form](block, drawn, ctx);
  // **A row is a string with its SGR already embedded**, so the pad is a leading
  // run of blanks and cannot disturb a colour: a blank carries none (§3ab).
  return rows(pad === 0 ? [...body] : body.map((r) => " ".repeat(pad) + r)); // cells-ok
};

export const plotDefinition: BlockDefinition<Plot> = {
  kind: "plot",
  measure,
  render,
};
