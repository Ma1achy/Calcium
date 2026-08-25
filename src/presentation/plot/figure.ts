/**
 * The seam, one level up — **what both arms decide, decided once** (C12 §3ak,
 * I59–I64).
 *
 * §3aj built two rasterisers over one geometry. Measured against what shipped,
 * what is shared is *coordinates* — `normalisedOf`, `normalisedSummary`,
 * `flatten`, `graphLayers` — and everything above them is decided twice.
 * `test/unit/plot-arm-disagreement.test.ts` is the measurement: **73 of 135
 * cells over the 27 forms the SVG arm claims disagree, 59 of them everywhere.**
 *
 * This module is where those decisions move. It grows one family at a time, and
 * nothing lands here without a consumer — an export nothing reads is what MG25
 * refuses, and a `Figure` member no renderer takes is F84's class one type along.
 */
import type { Plot, PlotForm, ScaleType } from "../../data/viewmodel/index.js";
import { normalisedOf } from "../../data/viewmodel/range.js";
import type { ColourRef } from "../theme/types.js";
import { axisFor, tickLabels, ticksFor, type Axis } from "./axes.js";
import { candlesOf } from "./candles.js";
import { plotAreaRows } from "./height.js";
import { refOf } from "./marks.js";
import { facingOf, seriesRange, FACING_DEFAULT, FACING_MATRIX, type Facing, type Range } from "./scale.js";

/**
 * An axis, **carrying the strings it prints** (I59, §3ak.1 finding 4).
 *
 * `Axis` is `{ range, ticks, step }` and stops there; the strings came from
 * `yLabels`, which also takes a row count. So *which numbers* and *how they
 * print* were computed in different places from different inputs — and the SVG,
 * having no row count, printed `String(tick)` instead. Measured: `1` against
 * `1.0` on `autocorrelation`, and `0.6000000000000001` where the terminal's
 * uniform precision gives `0.6`.
 *
 * `labels[i]` is `ticks[i]`. The terminal picks which indices get a row; the SVG
 * takes them all. **Neither computes a string.**
 */
export type ValueAxis = Axis & Readonly<{ labels: readonly string[] }>;

/**
 * The axis both arms read — **the terminal's computation, moved rather than
 * re-derived** (§3ak, step 3's rule).
 *
 * That is what makes byte-identity a property of the extraction rather than a
 * hope: this calls `axisFor` with the arguments its callers already passed, and
 * adds the labels. A second derivation would be a second thing to keep in step,
 * which is F210's own finding one level up.
 *
 * **The two disagreements it closes are visible in its parameters.** The
 * terminal passed `ticksFor(areaRows)` and `block.yScale`; the SVG passed a
 * hardcoded `5` and no scale at all, so a log axis picked log ticks in one arm
 * and linear ticks in the other. Both are arguments here, so there is one place
 * left to get them wrong.
 */
export function valueAxisOf(
  range: Range,
  maxTicks: number,
  block: Pick<Plot, "yMin" | "yMax" | "yFormat">,
  scale?: ScaleType,
): ValueAxis {
  const axis = axisFor(range, maxTicks, block, scale);
  return { ...axis, labels: tickLabels(axis, block.yFormat) };
}

/**
 * Whether a form's **readings sit on a value scale at all** (I60, §3ak).
 *
 * *Not* whether the terminal draws a numeric gutter — that is a different
 * question with a different answer, and conflating them is how this record would
 * have been exhaustively wrong. **Measured over the catalogue before it was
 * written**: `line` draws 256 numeric gutter labels and 14 named ones, because
 * below the colour floor it stacks into labelled strips; `bar` draws 8 numeric
 * and 50 named, because the horizontal arm gutters its categories and the
 * vertical arm gutters its values. **The gutter's content is orientation and
 * capability rung, and neither is a property of the form.**
 *
 * So this answers the semantic question and `Figure.orientation` answers where
 * the axis runs. A horizontal bar chart is `true` here and still shows
 * categories in its gutter.
 *
 * **`false` is what stops a fourth false axis.** `matrix`, `tiles` and `nodes`
 * each furnished one out of `seriesRange([]) ?? {0, 1}` in three separate
 * commits — over figures whose readings are colours, areas and structure — so a
 * fourth renderer would have furnished a fourth.
 *
 * **And the record is checked rather than merely total** (F266). A
 * `satisfies Record<PlotForm, …>` forces an answer for every member and cannot
 * check one of them; `autocorrelation` sat misfiled as a curve inside exactly
 * such a record. `FV1` asserts the direction that is true — a form marked
 * `false` never draws a numeric gutter, over every variant at both widths.
 */
export const HAS_VALUE_AXIS = {
  // Readings on an axis: a position, a length, a density, an interval.
  line: true, scatter: true, step: true, ecdf: true, density: true,
  sparkline: true, slope: true, bubble: true, stackedarea: true, streamgraph: true,
  bar: true, histogram: true, lollipop: true, dotplot: true, waterfall: true,
  boxplot: true, violin: true, ridgeline: true, forest: true, dumbbell: true,
  autocorrelation: true, bullet: true, funnel: true, horizon: true,
  // **A field is sampled over a domain**, so its columns are positions and its
  // rows are a scale — `HAS_POSITION_AXIS`' own correction, one axis along.
  contour: true, quiver: true,
  // A date grid and a time span both read their cells against a scale, and the
  // calendar is the measured proof: 48 numeric gutter labels across the corpus.
  calendar: true, gantt: true, timeline: true,
  // **Readings that are not on an axis, and the three families are the point.**
  // A matrix reads its values as colour, tiles read them as area, nodes read
  // them as structure. Each furnished a false axis before this record existed.
  heatmap: false, correlation: false, confusion: false, spectrogram: false,
  latency: false, density2d: false, utilisation: false,
  flame: false, icicle: false, treemap: false,
  tree: false, graph: false,
  // Proportion: an angle, a polygon's radius, a count of squares. The reading is
  // a share of a whole, which is not a position on a scale.
  pie: false, radar: false, waffle: false,
  // **Composition: the facets' axes are in the figure, so the figure has them.**
  //
  // Written `false` first, on the sentence *each facet answers for itself and
  // the outer figure has no axis of its own to label* — which is **true**, and
  // is not the question this record asks. `FV1` failed on the commit that
  // introduced it: a small-multiples frame guttered `100 · 50 · 0` at width 40
  // and eleven labels at 80, because a facet's gutter is drawn inside the
  // composition and a reader takes readings off it.
  //
  // The measurement was in hand when the wrong value was written — 6 numeric
  // gutter labels and 0 named, for both forms. That is MG24's class rather than
  // carelessness: a correct sentence justifying the wrong decision survives
  // being read carefully, because review checks whether a justification is true
  // and this one was (F267).
  smallmultiples: true, pairplot: true,
} as const satisfies Readonly<Record<PlotForm, boolean>>;

/** A normalised point — both axes on `[0, 1]`, origin at the value axis's floor. */
export type Pt = readonly [x: number, y: number];

/** Where a text mark sits relative to its point. */
export type TextAnchor = "start" | "middle" | "end";

/**
 * **What a glyph *is*, never which character draws it** (I62, §3ak.2).
 *
 * Exhaustive, so a rung with no entry is a compile error in both arms rather
 * than a silently different character in one. `absent` is the missing-datum
 * mark — a forest plot's row with no estimate — and it is a role because the
 * terminal draws something there and the SVG must not draw a point at zero.
 */
export type GlyphRole = "point" | "median" | "mean" | "outlier" | "cap" | "target" | "absent";

/**
 * One thing to draw, in normalised space.
 *
 * **`circle` is not here and `point` carries a `size`** (§3ak.1 finding 2). A
 * terminal point is one cell and has no radius to give it, so a bubble's size —
 * which is *data* — crosses the seam normalised, while a scatter dot's radius —
 * which is the SVG's own rasterisation — does not.
 */
export type Mark =
  | Readonly<{ kind: "polyline"; points: readonly Pt[]; closed?: boolean }>
  | Readonly<{
      kind: "rect";
      x: number;
      y: number;
      w: number;
      h: number;
      fill?: boolean;
      /**
       * **The reading, where the mark's *appearance* is the datum** —
       * normalised, and `point.size`'s argument one mark along (§3ak.1
       * finding 2).
       *
       * A matrix cell has no length and no position to carry its value: the
       * coordinate is spent on the grid and the reading is spent on colour.
       * So the value crosses the seam the way a bubble's radius does, and
       * each arm turns it into a colour at its own depth — `colormapFor` in
       * the terminal, `continuousColour` in SVG, one ramp either way.
       *
       * Absent on a bar, whose reading is its `h`.
       */
      value?: number;
    }>
  | Readonly<{ kind: "point"; x: number; y: number; role: GlyphRole; size?: number }>
  | Readonly<{ kind: "text"; x: number; y: number; text: string; anchor: TextAnchor; room: number }>;

/**
 * A mark and what it belongs to.
 *
 * **`layer` rather than `role`** (§3ak.1 finding 3): the sketch put
 * `role: "series" | "furniture" | …` on this and `GlyphRole` on the glyph, which
 * is *which layer* and *which shape* wearing one name — MG24's collision class
 * inside the type built to end a class of collision.
 */
export type Drawn = Readonly<{
  mark: Mark;
  layer: "series" | "furniture" | "annotation" | "label";
  /** The categorical slot, unresolved — `refOf`'s index, not a colour. */
  seriesIndex?: number;
  /** Or an explicit slot. Each arm calls `resolve()` at its own depth (I62). */
  ref?: ColourRef;
}>;

/** Which swatch a legend slot wants, named rather than drawn (I62). */
export type LegendRole = "series" | "rising" | "falling" | "annotation";

/**
 * One legend entry **before a glyph is chosen** (§3ak.1 finding 4).
 *
 * `LegendEntry` is `{ mark, label, ref }` where `mark` is an already-resolved
 * terminal glyph — precisely what must not cross the seam, since the swatch
 * descends the capability ladder with the figure (I29) and the SVG has no
 * ladder. So the shared layer names the role and each arm draws it.
 */
export type LegendSlot = Readonly<{
  role: LegendRole;
  label: string;
  ref: ColourRef;
  /** Present for `role: "series"` — the palette slot the swatch must match. */
  seriesIndex?: number;
}>;

/**
 * Which of I26's four shapes the furniture takes.
 *
 * **Here rather than in `furniture.ts`, and the direction is the ruling**
 * (§3ak.1 finding 5). `furniture.ts` is what reads a figure back, so a figure
 * importing its `FrameStyle` while it imports the figure is a cycle inside L1 —
 * what A02 §1 forbids and MG1 and MG22 implement. The shared shape moves down
 * and the renderer imports it.
 */
export type FrameStyle = NonNullable<Plot["plotFrame"]>;

/**
 * **Everything above the shared coordinate, decided once** (I59, §3ak.2).
 *
 * Capability-independent by construction: every rung the terminal descends is a
 * decision made *on* a figure in its projection, never inside one (§3ak.3). The
 * test of a candidate member is whether a 1-bit terminal and a 24-bit SVG would
 * both want the same answer — which is why `extent` is here and the stacked
 * arm's two-tick axis object is not.
 */
export type Figure = Readonly<{
  /** The niced axis and the strings it prints, or `null` where readings are not on a scale (I60). */
  value: ValueAxis | null;
  /**
   * **What the data spans, before nicing** — and it has one consumer today.
   *
   * Below the colour floor `positionalForm` stops overlaying and stacks into
   * labelled strips, rasterising against the *raw* bounds because its gutter
   * holds names rather than a scale (§5). That is a projection decision, so the
   * bounds it needs are a figure fact and the two-tick axis object it builds
   * from them is not (§3ak.7 C2). The SVG takes `value.range` and never this,
   * which is F84's class stated rather than discovered.
   */
  extent: Range | null;
  /** Categories, rows, series or nodes — in order, and the same list the legend names. */
  identity: readonly string[];
  orientation: "horizontal" | "vertical";
  /** Decided once and applied twice (I61). */
  facing: Facing;
  frame: FrameStyle;
  legend: readonly LegendSlot[];
  /** Normalised, uninverted, refs unresolved. Empty is a refusal (I64). */
  marks: readonly Drawn[];
}>;

/**
 * The names a form's series answer to — **one list, read by the gutter, the
 * callouts and the legend** (§3ak.7 C4).
 *
 * `segments` replace the series where a form has them, which is
 * `legendEntries`' own source expression: a segmented figure is one series cut
 * into named pieces, so the pieces are the identities.
 */
export function identityOf(block: Pick<Plot, "segments" | "series">): readonly string[] {
  const segs = block.segments;
  return segs !== undefined && segs.length > 0 // cells-ok — a segment count
    ? segs.map((sg) => sg.label)
    : block.series.map((sr, i) => sr.label ?? `series ${String(i + 1)}`);
}

/**
 * The legend's entries **with the swatch left to the renderer** (I62, §3ak.7 C8).
 *
 * `legendEntries`' composition moved, minus `markOf` and `glyphs` — candles
 * first because they are what the block is about, then the series, then the
 * annotations, which are claims *about* the data and so read after it
 * (C04 I52, §3ag). The order is the order `mergedRow` draws them in.
 */
export function legendSlots(block: Plot): readonly LegendSlot[] {
  const candles: readonly LegendSlot[] =
    block.plotStyle === "candlestick" && block.ohlc !== undefined
      ? [
          { role: "rising", label: "rising", ref: "tone.ok" },
          { role: "falling", label: "falling", ref: "tone.error" },
        ]
      : [];
  const annotations: readonly LegendSlot[] = (block.annotations ?? []).flatMap((a) => {
    const label = (a as { label?: string }).label;
    if (label === undefined) return [];
    const tone = a.tone;
    const ref: ColourRef = tone === undefined ? "tone.muted" : `tone.${tone}`;
    return [{ role: "annotation" as const, label, ref }];
  });
  return [
    ...candles,
    ...identityOf(block).map((label, i) => ({
      role: "series" as const,
      label,
      ref: refOf(i),
      seriesIndex: i,
    })),
    ...annotations,
  ];
}

/**
 * One series' samples as normalised polylines — **broken where the terminal
 * breaks the line** (I4, I14).
 *
 * Two columns are joined only if their samples are consecutive in the original
 * series, so a filtered non-finite value leaves a hole in the indices and the
 * run ends there rather than spanning it. `curveRows` states that as an
 * adjacency test between columns; here it is the same test between samples, and
 * a run of one is a degenerate polyline rather than a special case.
 *
 * **`x` is the sample's index and `y` is uninverted** (I61). The terminal turns
 * `y` into a row with the facing and the SVG turns it into a pixel with the
 * same facing; neither of them decides it.
 */
function runsOf(values: readonly (number | null)[], range: Range): readonly (readonly Pt[])[] {
  const span = Math.max(1, values.length - 1); // cells-ok — a sample count
  const runs: Pt[][] = [];
  let run: Pt[] | null = null;
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) { run = null; return; }
    const pt: Pt = [i / span, normalisedOf(v, range, false)];
    if (run === null) { run = [pt]; runs.push(run); return; }
    run.push(pt);
  });
  return runs;
}

/**
 * The value axis over an extent — **one derivation, read by every family**.
 *
 * Written twice first, once per family, and the **anchor sweep is what said so**:
 * two mutations aimed at the tick count and the scale matched two places each,
 * and an ambiguous anchor reports as SURVIVED, which routes to *write a test*
 * rather than *fix the duplicate* (F219). That is `placesFor`'s lesson arriving
 * a second time in the same module, from the same instrument.
 *
 * The arguments are the ones `positionalForm` and `categoricalColumnForm` each
 * already passed — the row count for the ticks, and the block's scale — so this
 * is still the terminal's computation moved and there is one place left to get
 * it wrong.
 */
function axisOver(extent: Range | null, block: Plot): ValueAxis | null {
  return extent === null
    ? null
    : valueAxisOf(extent, ticksFor(plotAreaRows(block)), block, block.yScale);
}

/**
 * A reference line's mark — **the annotation mechanism, not a form's machinery**
 * (C04 I52, §3e).
 *
 * A reference line is a claim *about* the ordinate drawn beside the data, and it
 * is the same mechanism an autocorrelation plot's significance bounds use, which
 * is what §3ak.6 measured rather than assumed before refusing that form. Shared
 * across the families for that reason: a second copy would be a second answer to
 * *where does a reference line sit*, and the arms already had two.
 */
function annotationMarks(block: Pick<Plot, "annotations">, range: Range): readonly Drawn[] {
  return (block.annotations ?? []).flatMap((a) => {
    if (a.kind !== "line") return [];
    const y = normalisedOf(a.value, range, false);
    const ref: ColourRef = a.tone === undefined ? "tone.muted" : `tone.${a.tone}`;
    return [{ mark: { kind: "polyline" as const, points: [[0, y], [1, y]] as readonly Pt[] }, layer: "annotation" as const, ref }];
  });
}

/**
 * **Every decision the positional families share — which is all of them but the
 * marks** (§3ak.7).
 *
 * `positionalForm` draws three families: curve, scatter, and `slope`, which the
 * SVG arm refuses. They differ in *what is drawn at a point* and in nothing
 * else — the range, the ticks, the identities, the facing, the frame and the
 * legend are one computation, and this is `positionalForm`'s own, moved rather
 * than re-derived.
 *
 * **Separated from `curveFigure` so no caller ever holds a figure with the
 * wrong marks on it.** A `Figure` whose `marks` are polylines over a scatter
 * block would be internally consistent, would pass every assertion about the
 * decisions, and would be a different chart — which is the class this whole
 * pass exists to end, so it is not reintroduced at the seam that ends it.
 * `marks: []` is not the alternative: I64 makes an empty list a **refusal**,
 * and a type that says *nothing to draw* where it means *not yet decided* is a
 * lie the compiler would help tell.
 */
export function positionalDecisions(block: Plot): Omit<Figure, "marks"> {
  const extent = seriesRange(block.series, block, candlesOf(block));
  return {
    value: axisOver(extent, block),
    extent,
    identity: identityOf(block),
    // **These families run their values up the ordinate at every form.** Stated
    // rather than read from `block.orientation`, which means something else on
    // the bar and distribution families — reading it here would turn a line plot
    // on its side in one arm and not the other.
    orientation: "vertical",
    facing: facingOf(block, FACING_DEFAULT),
    frame: block.plotFrame ?? "box",
    legend: legendSlots(block),
  };
}

/**
 * The matrix family's figure — **`heatmap`, `correlation`, `confusion`,
 * `spectrogram`, `density2d`, `latency`, `utilisation`** (§3ak.7).
 *
 * **`value` is `null` and `extent` is not, and the pair is the family's whole
 * shape** (I60). A matrix reads its numbers as colours, so there is no axis to
 * tick — the ruling three renderers reached separately and got wrong three
 * times, each furnishing one out of `seriesRange([]) ?? {0, 1}`. But the *ramp*
 * still has a domain, and it is the same `seriesRange` both arms already
 * compute. So the extent is a figure fact with no axis over it.
 *
 * **The facing default is the family's, not the component's.** `heatmap.ts`
 * takes `FACING_MATRIX` where every positional form takes `FACING_DEFAULT` — a
 * matrix's first row is at the top and a curve's first value is at the bottom —
 * and that difference was reachable from two files before it was decided once.
 *
 * **`orientation` is vacuous here and is recorded as such.** A matrix has rows
 * and columns rather than a value axis to run one way or the other; what the
 * terminal calls a matrix layout — `stretch` against `anchor` — is a different
 * question, about which columns a short row occupies. Stated rather than left
 * for a reader to infer from a member that means something on three families.
 *
 * **The identity is what the *gutter* shows.** Measured while writing this: an
 * unlabelled row is `""` to `labelColumnWidth` and `row N` to the overflow
 * notice — two answers to *what is this row called* in one file, twenty-five
 * lines apart — and the positional families invent a third, `series N`. The
 * gutter's wins, because it is the one a reader sees beside the cells.
 */
export function matrixFigure(block: Plot): Figure {
  const extent = seriesRange(block.series, block);
  const marks: Drawn[] = [];
  if (extent !== null) {
    const rows = Math.max(1, block.series.length); // cells-ok — a row count
    const cols = Math.max(1, block.series.reduce((m, r) => Math.max(m, r.values.length), 0)); // cells-ok — a column count
    block.series.forEach((series, seriesIndex) => {
      series.values.forEach((v, c) => {
        if (v === null || !Number.isFinite(v)) return;
        marks.push({
          mark: {
            kind: "rect",
            x: c / cols, // cells-ok — a column count
            y: seriesIndex / rows, // cells-ok — a row count
            w: 1 / cols, // cells-ok — a column count
            h: 1 / rows, // cells-ok — a row count
            fill: true,
            // **`invert: false`, and both arms already say so**: a matrix reads
            // low-to-high up the *map* rather than up the page, which is the one
            // place the facing does not reach.
            value: normalisedOf(v, extent, false),
          },
          layer: "series",
          seriesIndex,
        });
      });
    });
  }
  return {
    value: null,
    extent,
    identity: block.series.map((sr) => sr.label ?? ""),
    orientation: "vertical",
    facing: facingOf(block, FACING_MATRIX),
    frame: block.plotFrame ?? "box",
    legend: legendSlots(block),
    marks,
  };
}

/**
 * A bar's baseline — **`min(0, dataMin)`, and it is a family decision** (§3ak.7).
 *
 * A bar's *length* is its value, so signed data grows both ways from zero and
 * unsigned data starts there; a bar chart of `[10, 25, 15]` anchored at 10 draws
 * nothing for its first category, which is what this rule was written for.
 * `definition.ts` held it and both orientations reached for it separately.
 */
export function baselineOf(dataMin: number): number {
  return Math.min(0, dataMin);
}

/**
 * **Every decision the categorical families share** — `bar`, `histogram`,
 * `lollipop`, `dotplot`, and the distribution family's column arm (§3ak.7).
 *
 * `categoricalColumnForm` draws all of them, so like `positionalDecisions` this
 * is one computation the families read and the marks are each family's own.
 *
 * **`identity` is the categories here and the series labels for a curve, and
 * both are right.** The member is *what the figure's slots are named*: a curve's
 * slots are its series, a bar's are its categories. So the legend and the
 * identity are the same list for the positional families and **different lists**
 * here — the gutter names categories, the legend names series — and conflating
 * them would give a bar chart a legend naming its own rows.
 *
 * **`extent` is zero-anchored, and it is what the horizontal arm rasterises
 * against.** The two orientations do not use the same range: `barRow` takes
 * `{ base, data.max }` raw, and `categoricalColumnForm` nices it. Both are in
 * the figure — the raw as `extent`, the niced as `value.range` — because a
 * horizontal bar's gutter holds *categories*, so there is no label for the raw
 * range to disagree with, and the asymmetry is invisible rather than absent.
 *
 * **The orientation is the block's, and that is D11.** The terminal defaults to
 * horizontal and the SVG arm defaulted to vertical — the same block drawn on its
 * side in one arm — which no rasterisation difference can account for. It is
 * decided here now, once.
 */
export function categoricalDecisions(block: Plot): Omit<Figure, "marks"> {
  const data = seriesRange(block.series, block);
  const extent = data === null ? null : { min: baselineOf(data.min), max: data.max };
  return {
    value: axisOver(extent, block),
    extent,
    identity: block.categories ?? [],
    orientation: block.orientation === "vertical" ? "vertical" : "horizontal",
    facing: facingOf(block, FACING_DEFAULT),
    frame: block.plotFrame ?? "box",
    legend: legendSlots(block),
  };
}

/**
 * The bar family's figure — **`bar`, `histogram`, `lollipop`, `dotplot`**
 * (§3ak.7).
 *
 * **The marks are in the figure's own space, not the screen's**: `x` runs along
 * the identity axis and `y` along the value axis, whatever `orientation` says.
 * That is `facing`'s arrangement one member along — decided once, applied twice —
 * and it is what stops the two arms transposing differently. A vertical renderer
 * takes them as written; a horizontal one swaps the axes on the way out.
 *
 * **A bar fills its whole slot here and each arm insets it.** The terminal fills
 * the cell column `categoricalColumnForm` allotted; the SVG takes three fifths.
 * Both are rasterisation (§3aj hazard 1), so the shared layer states the slot and
 * neither arm's inset crosses.
 *
 * **The rect runs from the range floor, and that is F272 reproduced on purpose.**
 * Both terminal arms fill from `range.min`: `barRow` and `barColumn` each compute
 * `(value - min) / span`. Read at height 7 over `[-8, 4, -2, 10]`, the horizontal
 * arm gives `-8` an empty run and `10` a full one, and the vertical arm rises
 * every bar from `-10` **through its own `0` gutter label**. A bar chart of
 * signed data draws no negative bars in either orientation.
 *
 * The SVG arm is the one that gets this right — *the baseline is zero where the
 * range contains it* — so unifying on the terminal propagates the defect, and
 * that is the tie-break's third counterexample after F269 and F271. It is still
 * what lands: the arms then draw one wrong figure and one repair fixes both,
 * where correcting it here would be a divergence no commit announced.
 *
 * `baselineOf` is not dead in the meantime — it is what puts the *floor* at zero
 * for non-negative data, which is the common case and the reason `[10, 25, 15]`
 * no longer draws nothing at 10.
 *
 * **Three ranges existed for this family and the mark takes one of them.**
 * Measured: `plotToSvg` rasterises against the **raw** range, `barRow` against
 * **raw-zeroed** `{ base, data.max }`, and `categoricalColumnForm` against the
 * **niced** one. So a bar of 25 in a set topping out at 25 fills its whole run
 * horizontally and 83% of its column vertically, in the same arm.
 *
 * The mark takes the **niced** range, which is F210's rule — *the range the
 * figure is drawn against is the range the gutter is labelled from* — and the
 * only one of the three with a labelled axis behind it. The horizontal arm's is
 * invisible rather than absent: its gutter holds categories, so there is no
 * label for the fraction to disagree with, which is exactly how a third range
 * survived in one family.
 */
export function barFigure(block: Plot): Figure {
  const decisions = categoricalDecisions(block);
  const { value } = decisions;
  const marks: Drawn[] = [];
  if (value !== null) {
    const cats = decisions.identity.length; // cells-ok — a category count
    const n = Math.max(1, cats === 0 ? block.series[0]?.values.length ?? 0 : cats); // cells-ok — a category count
    const per = Math.max(1, block.series.length); // cells-ok — a series count
    block.series.forEach((series, seriesIndex) => {
      series.values.forEach((v, i) => {
        if (v === null || !Number.isFinite(v) || i >= n) return;
        // From the floor, because that is where both terminal arms fill from
        // (F272) — `(value - min) / span` in `barRow` and in `barColumn`.
        const top = normalisedOf(v, value.range, false);
        marks.push({
          mark: {
            kind: "rect",
            x: (i + seriesIndex / per) / n,
            y: 0,
            w: 1 / (n * per),
            h: top,
            fill: true,
          },
          layer: "series",
          seriesIndex,
        });
      });
    });
    marks.push(...annotationMarks(block, value.range));
  }
  return { ...decisions, marks };
}

/**
 * The scatter family's figure — **`scatter` and `bubble`** (§3ak.7).
 *
 * **The same decisions as the curve, and that is measured rather than assumed**:
 * both families reach `positionalForm`, which computes the extent, the nicing,
 * the tick count and the facing once for all of them. So this family's emitter
 * is `positionalDecisions` and a different mark — which is what *one emitter per
 * family* is for, and why the families are the unit rather than the forms.
 *
 * **A bubble's size crosses the seam and a scatter dot's does not** (§3ak.1
 * finding 2). The radius of a bubble *is data* — `sizes` is the second series,
 * read positionally against the first — so it arrives normalised against that
 * series' own maximum, exactly as `bubbleRows` does it. A scatter dot's radius
 * is the SVG's rasterisation and the terminal's is one cell, so neither is here.
 *
 * **`maxSize` is `bubbleRows`' own**: at least 1, over the finite sizes. A
 * sample with no size gets no `size` member rather than a zero, because zero is
 * a radius the terminal draws as a single dot and *absent* is not.
 *
 * **This reproduces F271 deliberately, and the alternative was worse.** A
 * bubble's size channel is `block.series[1]` — a *member of `series`*, with
 * nothing to say it is not a series — so `overlaidRows` rasterises it like any
 * other, `seriesRange` stretches the value axis over it, and `identityOf` names
 * it in the legend. The shipped catalogue frame shows all three: a gutter
 * running `0 · 20 · 40 · 60` for data spanning 20–60, a second set of bubbles in
 * the size series' own colour, and a legend reading *value · size*.
 *
 * Emitting one series here would be **correcting the terminal inside a
 * refactor**, which is the one thing this pass forbids: no frame would move, the
 * two arms would disagree at step 4, and the correction would be announced by
 * nothing. So the figure says what the terminal draws and F271 is owed — the
 * fix is a channel that is not a member of `series`, which is a C04 ruling.
 */
export function scatterFigure(block: Plot): Figure {
  const decisions = positionalDecisions(block);
  const { value } = decisions;
  const marks: Drawn[] = [];
  if (value !== null) {
    // The second series is the size channel, and it is never a series of its own
    // — `bubbleRows` reads `block.series[1]` positionally against the first.
    const sizes = block.form === "bubble" ? block.series[1]?.values : undefined;
    const finite = (sizes ?? []).filter((v): v is number => v !== null && Number.isFinite(v));
    const maxSize = Math.max(1, ...finite);
    // Every member of `series` is drawn, because `overlaidRows` draws every
    // member of `series` — including the one that is a channel (F271).
    block.series.forEach((series, seriesIndex) => {
      const span = Math.max(1, series.values.length - 1); // cells-ok — a sample count
      series.values.forEach((v, i) => {
        if (v === null || !Number.isFinite(v)) return;
        const size = sizes?.[i];
        const scaled = size === null || size === undefined || !Number.isFinite(size)
          ? undefined
          : Math.abs(size) / maxSize;
        marks.push({
          mark: {
            kind: "point",
            x: i / span,
            y: normalisedOf(v, value.range, false),
            role: "point",
            ...(scaled === undefined ? {} : { size: scaled }),
          },
          layer: "series",
          seriesIndex,
        });
      });
    });
    marks.push(...annotationMarks(block, value.range));
  }
  return { ...decisions, marks };
}

/**
 * The curve family's figure — **`line`, `sparkline`, `step`, `ecdf`, `density`**
 * (§3ak.7).
 *
 * **This is `positionalForm`'s computation moved, not re-derived**, which is
 * what makes byte-identity a property of the extraction rather than a hope: the
 * range, the tick count and the scale are the arguments that function already
 * passed, and the terminal reads the result back rather than computing a second
 * one.
 *
 * **Total, and a refusal is a figure with no marks** (I64). A block with no
 * finite sample anywhere returns `value: null` and an empty list; how each arm
 * says so stays its own — `null` in SVG, `emptyRows` in the terminal — because
 * what must be identical is *whether there was anything to draw*.
 *
 * **The block handed here is the block that is drawn** (I65). `ecdf` and
 * `density` derive their series, and the derivation belongs above both arms —
 * so callers pass the derived block, and `derive.ts` is where the derivation
 * lives rather than inside one renderer's dispatch table.
 */
export function curveFigure(block: Plot): Figure {
  const decisions = positionalDecisions(block);
  const { value } = decisions;
  const marks: Drawn[] = [];
  if (value !== null) {
    block.series.forEach((series, seriesIndex) => {
      for (const points of runsOf(series.values, value.range)) {
        marks.push({ mark: { kind: "polyline", points }, layer: "series", seriesIndex });
      }
    });
    marks.push(...annotationMarks(block, value.range));
  }
  return { ...decisions, marks };
}
