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
import { normalisedSummary, quartileRange } from "../../data/viewmodel/distribution.js";
import { strips, tiles } from "./hierarchy.js";
import { flatten } from "./tree.js";
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
       * **How many rects this one sits inside** — absent where it sits inside
       * none, which is not the same as `0` (§3ak.2, F278).
       *
       * A treemap's nesting is drawn by insetting a child so its parent shows as
       * a ring, and that ring is the only thing saying which tiles belong
       * together. **The ring's width is one unit of the output and the two arms
       * have different units** — one cell against one pixel, and the terminal's
       * is a runtime width — so the pad cannot cross and a partition emitted
       * already-padded would be one arm's picture. The depth crosses; each arm
       * insets by `depth + 1` of its own smallest unit.
       *
       * **Absent means *not a partition member*, and a flame's strips carry
       * `0`** (F280). They tile the line and abut each other, so they want the
       * separating inset; they enclose nothing, so they want one unit of it.
       * What has no `depth` is a **measurement** — a bar, whose length *is* its
       * value — and it is drawn exactly, inset only across the identity axis.
       */
      depth?: number;
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
 * **The value `orientation` takes where a family has no axis to run either way.**
 *
 * `matrix`, `tiles` and `nodes` have rows and columns, areas, and structure —
 * none of them a value axis with a direction. The member is required, so it gets
 * a name rather than a bare `"vertical"` that reads as a decision.
 *
 * **The anchor sweep is what asked for this.** Three families wrote the literal
 * and a mutation aimed at the *positional* families' orientation matched all
 * four, which reports as SURVIVED rather than as a bad anchor (F219). The
 * duplication was hiding a real distinction: one of the four means *the values
 * run up the ordinate* and three mean *nothing runs anywhere*.
 */
const ORIENTATION_UNUSED = "vertical" as const;

/**
 * Which way the value axis runs, **for the families where the block decides**
 * (D11).
 *
 * The bar and distribution families both read `block.orientation` and default to
 * horizontal — the terminal's default, and the one the SVG arm got wrong by
 * writing `!== "horizontal"` so an unset member drew vertically there and
 * horizontally here. One expression now, so there is one place left to invert.
 */
function orientationOf(block: Pick<Plot, "orientation">): "horizontal" | "vertical" {
  return block.orientation === "vertical" ? "vertical" : "horizontal";
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
function annotationMarks(
  block: Pick<Plot, "annotations">,
  range: Range,
  // **A significance bound is one number and two claims** (§3ak.14). `lagRow`
  // draws every bound at `±|b|` — a correlation of `-0.4` is as significant as
  // one of `+0.4`, so a band drawn on one side only says the opposite. The
  // caller that needs it says so, rather than every annotation acquiring a
  // mirror it has no meaning for.
  mirror = false,
): readonly Drawn[] {
  return (block.annotations ?? []).flatMap((a) => {
    if (a.kind !== "line") return [];
    const ref: ColourRef = a.tone === undefined ? "tone.muted" : `tone.${a.tone}`;
    const values = mirror ? [Math.abs(a.value), -Math.abs(a.value)] : [a.value];
    return values.map((v) => {
      const y = normalisedOf(v, range, false);
      return { mark: { kind: "polyline" as const, points: [[0, y], [1, y]] as readonly Pt[] }, layer: "annotation" as const, ref };
    });
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
 * The tiles family's figure — **`flame`, `icicle`, `treemap`** (§3ak.7).
 *
 * **`value` and `extent` are BOTH `null`, and the pair is what separates this
 * family from the matrix.** A matrix reads its numbers as colours, so it has no
 * axis and its *ramp* still has a domain; a tiles figure reads them as **areas**,
 * and an area is the reading itself. There is nothing left for a domain to be
 * over — `hierarchy.ts` returns positions already on the unit interval, because
 * the division by the total happened while the tree was walked.
 *
 * That is why `extent: null` here is a statement rather than an omission: the
 * three families with `value: null` do not all have the same shape, and the one
 * that furnished a false axis three times would have furnished a false *domain*
 * here for exactly the same reason.
 *
 * **`tiles` and `strips` disagree about whether the root is a node, and both are
 * right.** Measured while writing this: `tiles` emits the *children* squarified
 * into the square — a treemap's root is the canvas rather than a tile — and
 * `strips` emits the root at depth 0, because a flame's root is its base bar.
 * Their depths are offset by one as a consequence. Two exported walks in one
 * module, reading as a matched pair and answering different questions; the
 * emitter takes each at its word rather than normalising them, since the
 * difference is the forms' and not an inconsistency.
 *
 * **The facing is live for this family**, unlike the matrix's (F273): `flame`,
 * `icicle` and `treemap` all declare `ORIGIN_DEFAULT: null`, so `facingOf`
 * reaches its fallback and the argument decides. A flame grows up from its root
 * and an icicle hangs down from it, which is one decision applied twice.
 *
 * **And for one commit that paragraph was true of a constant** (F276). Every
 * clause of it is measured and holds — the record does say `null`, the fallback
 * is reached, the argument does decide — and the argument was `FACING_DEFAULT`
 * for all three forms, so the member said `up` for an icicle and the growth
 * direction stayed written in two renderers: `rowFor = inverted ? depth :
 * areaRows - 1 - depth` and `block.form === "icicle"`. **The two copies I61
 * exists to end, under a comment asserting they had been ended.** It survived
 * review because it is not a wrong sentence; it is a correct one attached to a
 * decision it did not constrain, which is MG24's class, and it was unfalsifiable
 * while nothing read the member.
 *
 * **Two of the three face down, and it is the treemap that is easy to miss.**
 * Measured in the terminal rather than reasoned: `definition.ts` maps
 * `t.y0 * areaRows` to a **row index**, so a treemap's `y0 = 0` is the top edge
 * exactly as an icicle's depth 0 is. Only the flame grows the other way.
 *
 * **The labels are marks and are keyed to their tiles** (§3ak.12). A `text` mark
 * carries the same `seriesIndex` as the rect it names, so a renderer that has to
 * decide whether the box is big enough for the string can find the box — which
 * is the terminal's gate too, in its own units, and neither arm can measure the
 * other's.
 */
export function tilesFigure(block: Plot): Figure {
  const root = block.hierarchy;
  const marks: Drawn[] = [];
  const identity: string[] = [];
  const named = (x: number, y: number, w: number, label: string, index: number): void => {
    if (label === "") return;
    marks.push({
      mark: { kind: "text", x, y, text: label, anchor: "start", room: w },
      layer: "label",
      seriesIndex: index,
    });
  };
  if (root !== undefined) {
    if (block.form === "treemap") {
      // **Depth order, and it is the figure's rather than the renderer's**
      // (§3ak.12). A parent is painted and then its children are painted over
      // it, which is how nesting reads without a border per node — and `tiles`
      // walks depth-first, so its emission order interleaves a deep child with a
      // shallow uncle. Both arms sorted it separately before this line existed.
      for (const t of [...tiles(root)].sort((a, b) => a.depth - b.depth)) { // cells-ok — a depth
        identity.push(t.label);
        marks.push({
          // **The true partition and the depth, never a padded partition**
          // (F278). `tiles` takes a pad and insets a parent before laying its
          // children out, which is what makes nesting visible — and the pad is
          // one unit of the *output*, so it is one cell in the terminal and one
          // pixel here and cannot cross. The depth crosses instead.
          mark: { kind: "rect", x: t.x0, y: t.y0, w: t.x1 - t.x0, h: t.y1 - t.y0, fill: true, depth: t.depth },
          layer: "series",
          seriesIndex: t.index,
        });
        named(t.x0, t.y0, t.x1 - t.x0, t.label, t.index);
      }
    } else {
      // **`strips` is the line with a depth**, and the depth is a *row* rather
      // than a value — so `h` is one row of however many the renderer has, which
      // it cannot know here. `1` is the whole figure and each arm divides by its
      // own depth budget; stating a fraction would be this layer guessing at the
      // other's row count, which is §3aj hazard 3 in a number.
      const runs = strips(root);
      const deepest = runs.reduce((d, r) => Math.max(d, r.depth), 0); // cells-ok — a depth
      for (const r of runs) {
        identity.push(r.label);
        marks.push({
          mark: {
            kind: "rect",
            x: r.from,
            y: r.depth / (deepest + 1), // cells-ok — a depth
            w: r.to - r.from,
            h: 1 / (deepest + 1), // cells-ok — a depth
            fill: true,
            // **`0` and not absent, and the bar family is what settled that**
            // (F280). A strip is a member of a partition — the bands tile the
            // line and abut each other — so it wants the separating inset; it
            // encloses nothing, so it wants one unit of it rather than a depth's
            // worth. **Absent means *not a partition member at all***, which is
            // what a bar is: a length read against an axis, drawn exactly.
            depth: 0,
          },
          layer: "series",
          seriesIndex: r.index,
        });
        named(r.from, r.depth / (deepest + 1), r.to - r.from, r.label, r.index); // cells-ok — a depth
      }
    }
  }
  return {
    value: null,
    extent: null,
    identity,
    orientation: ORIENTATION_UNUSED,
    // **Only the flame grows up** (F276). `FACING_MATRIX` is named for the
    // family it was written for and holds the shape three families want — the
    // second axis running down the page — which is a treemap's `y0` and an
    // icicle's depth alike.
    facing: facingOf(block, block.form === "flame" ? FACING_DEFAULT : FACING_MATRIX),
    frame: block.plotFrame ?? "box",
    legend: legendSlots(block),
    marks,
  };
}

/**
 * The nodes family's decisions — **`tree` and `graph`, and there is no
 * `nodesFigure`** (§3ak.7, §3aj.6).
 *
 * **This is the family where the shared layer cannot carry the marks, and that
 * was ruled before the type existed.** §3aj.6: *a tree's node positions are a
 * function of its labels' widths in the terminal* — `tdWidth` measures a subtree
 * by the widest label under it — **so the topology is shared and the placement
 * is not.** The SVG arm places by slots, which is font-independent by
 * construction and is a different drawing of the same tree.
 *
 * A `Mark` is a position. So a `nodesFigure` returning marks would be returning
 * *one arm's* placement, and whichever arm it belonged to, the other would fail
 * `U1b` — each arm's output is a faithful projection of the figure — for a
 * reason the type could not express.
 *
 * **`marks: []` is not the alternative**: I64 makes an empty list a refusal, and
 * a figure saying *nothing to draw* over a tree with forty nodes is a lie. So the
 * family stops at its decisions, exactly as `positionalDecisions` and
 * `categoricalDecisions` do — and for a stronger reason, because for those two
 * the marks arrive one commit later and here they do not arrive at all.
 *
 * **What crosses is what already crossed**: `flatten` and `graphLayers`, which
 * both arms read today. This adds the decisions above them.
 */
export function nodesDecisions(block: Plot): Omit<Figure, "marks"> {
  const root = block.hierarchy;
  return {
    value: null,
    extent: null,
    identity: root === undefined
      ? (block.graph?.nodes ?? []).map((nd, i) => nd.label ?? `node ${String(i + 1)}`)
      : flatten(root).map((f) => f.label),
    orientation: ORIENTATION_UNUSED,
    facing: facingOf(block, FACING_DEFAULT),
    frame: block.plotFrame ?? "box",
    legend: legendSlots(block),
  };
}

/**
 * The distribution family's figure — **`boxplot`, `forest`, `dumbbell`**
 * (§3ak.7).
 *
 * **The datum is a *set of positions derived from the samples*, not the
 * samples**, which is what makes this a family rather than three forms. So the
 * shared piece is the set — `normalisedSummary` and `quartileRange`, which both
 * arms already read through — and this emitter is where the roles they produce
 * finally have somewhere to go.
 *
 * **`quartileRange` has two arms and the difference is deliberate**: a boxplot's
 * extent is `min … max` plus outliers, because the whiskers *are* the extent; a
 * forest plot's is `lower ?? min … upper ?? max`, because a confidence bound is
 * not a whisker and an interval can reach past the observed range. `dumbbell` is
 * the third datum — two series paired by index — and takes `seriesRange`.
 *
 * **`GlyphRole` is why a mark carries a role and never a glyph** (I62). A median
 * is `┃` at full unicode, `|` in ASCII and a distinct mark below the colour
 * floor; a mean is a different character again; an outlier a third. The terminal
 * picks all three from its own ladder and the SVG draws none of them — it draws
 * a line and two circles. **What both agree about is which of the seven things
 * this is**, and that is the whole content of the seam here.
 *
 * **`absent` is a role because the terminal draws something and the SVG must not
 * draw a point at zero.** A forest row with no estimate is a real state, and a
 * mark at the origin is the plausible wrong figure it would otherwise become.
 *
 * The marks are in the figure's own space, as the bar family's are: `x` along
 * the identity axis and `y` along the value axis, whatever `orientation` says.
 * **Three fifths of the slot is not here** — `boxplotColumn` rounds that to
 * cells and `slotOf` does not round at all, and §3aj hazard 1 makes a renderer's
 * inset its own.
 */
export function distributionFigure(block: Plot): Figure {
  const qs = block.quartiles ?? [];
  const extent = block.form === "dumbbell"
    ? seriesRange(block.series, block)
    : quartileRange(qs, block.form === "forest");
  const identity = block.categories
    ?? (qs.length > 0 // cells-ok — a summary count
      ? qs.map((_q, i) => `series ${String(i + 1)}`)
      : identityOf(block));
  const marks: Drawn[] = [];
  // **The marks are drawn against the range the gutter is labelled from**
  // (F282, F210). This normalised against the **raw** `extent` while `value`
  // below is the **niced** axis over it, so the figure carried two ranges and
  // the marks were on the one with no labels behind it — a boxplot at `2 … 9`
  // drawn against `2 … 9` and ticked `0 · 2 · 4 · 6 · 8 · 10`.
  //
  // **Nothing could see it while nothing read the marks.** Both arms rasterised
  // their own summaries and took the range from `plotToSvg`'s read of `value`,
  // so the emitter's choice reached no picture until the walk arrived — an
  // invariant is vacuous until its subject exists. It is the bar family's ruling
  // applied here rather than a new one: F272b picked the niced range for exactly
  // this reason, and this family had quietly picked the other.
  const axis = axisOver(extent, block);
  const scale = axis?.range ?? extent;
  if (extent !== null && scale !== null) {
    const n = Math.max(1, block.form === "dumbbell" ? identity.length : qs.length); // cells-ok — a slot count
    const at = (v: number): number => normalisedOf(v, scale, false);
    const dot = (x: number, y: number, role: GlyphRole, i: number): Drawn =>
      ({ mark: { kind: "point", x, y, role }, layer: "series", seriesIndex: i });

    if (block.form === "dumbbell") {
      const [a, b] = [block.series[0], block.series[1]];
      const count = Math.min(a?.values.length ?? 0, b?.values.length ?? 0); // cells-ok — a pair count
      for (let i = 0; i < count; i += 1) { // cells-ok — a pair index
        const va = a?.values[i], vb = b?.values[i];
        if (va === null || vb === null || va === undefined || vb === undefined) continue;
        const x = (i + 0.5) / n;
        // The connector first, so the two ends read over it — `mergedRow`'s own
        // order, which is the order a reader resolves an overlap in.
        marks.push({ mark: { kind: "polyline", points: [[x, at(va)], [x, at(vb)]] }, layer: "series" });
        marks.push(dot(x, at(va), "point", 0), dot(x, at(vb), "point", 1));
      }
    } else {
      qs.forEach((q, i) => {
        const sm = normalisedSummary(q, scale);
        const x = i / n;
        const centre = (i + 0.5) / n;
        if (block.form === "forest") {
          marks.push({ mark: { kind: "polyline", points: [[centre, sm.lower], [centre, sm.upper]] }, layer: "series", seriesIndex: i });
          // **A tee at each end, because a plain rule stopping is not an
          // interval ending** — `forestRow`'s own words and its own glyphs,
          // `whiskerLeft` and `whiskerRight` written over the run's two ends.
          // The figure was dropping them, so this arm drew them from its own
          // loop and the terminal from the record; one of the two was going to
          // stop.
          marks.push(dot(centre, sm.lower, "cap", i), dot(centre, sm.upper, "cap", i));
          // **`absent` where there is no estimate.** `normalisedSummary` falls
          // `centre` back to the median, so the summary cannot say *nothing was
          // reported* — the role is what says it, and it is why the SVG can
          // refuse to draw where the terminal draws a mark.
          const has = Number.isFinite(q.centre ?? q.median);
          // **`target` is the pooled estimate, and it is a role rather than a
          // second member** (I62). `forestRow` picks `g.diamond` for a pooled
          // summary and `ch.filled` for the rest — *this one is the answer* said
          // by shape, which is exactly what a `GlyphRole` is for, and the seventh
          // role had no subject until now.
          //
          // **And the weight is a size, the way a bubble's is** (C12 I31,
          // §3ak.1 finding 2). A wide interval drawn small contributed little and
          // a narrow one drawn large carried the result, which is the reading a
          // forest plot exists for — `forestRow` spends it on cells and this arm
          // on a radius, from one normalised number.
          const wt = q.weight;
          const weight = wt !== undefined && Number.isFinite(wt)
            ? Math.max(0, Math.min(1, wt))
            : undefined;
          marks.push({
            mark: {
              kind: "point",
              x: centre,
              y: sm.centre,
              role: !has ? "absent" : q.pooled === true ? "target" : "point",
              ...(weight === undefined ? {} : { size: weight }),
            },
            layer: "series",
            seriesIndex: i,
          });
          return;
        }
        // **Whiskers, then their caps, then the box over both, then the median
        // over that** — and the order is the figure's because a mark list *is* a
        // paint order (§3ak.12). It is the glyph tables' own composition, kept so
        // that a cap coincident with a box edge reads the way it reads in the
        // terminal; a degenerate summary is where the two orders differ, which is
        // what `boxplot-flat-whisker` is a fixture of.
        marks.push({ mark: { kind: "polyline", points: [[centre, sm.min], [centre, sm.q1]] }, layer: "series", seriesIndex: i });
        marks.push({ mark: { kind: "polyline", points: [[centre, sm.q3], [centre, sm.max]] }, layer: "series", seriesIndex: i });
        marks.push(dot(centre, sm.min, "cap", i), dot(centre, sm.max, "cap", i));
        marks.push({
          mark: { kind: "rect", x, y: Math.min(sm.q1, sm.q3), w: 1 / n, h: Math.abs(sm.q3 - sm.q1), fill: false },
          layer: "series",
          seriesIndex: i,
        });
        marks.push(dot(centre, sm.median, "median", i));
        if (sm.mean !== undefined) marks.push(dot(centre, sm.mean, "mean", i));
        for (const o of sm.outliers) marks.push(dot(centre, o, "outlier", i));
      });
    }
  }
  return {
    value: axis,
    extent,
    identity,
    orientation: orientationOf(block),
    facing: facingOf(block, FACING_DEFAULT),
    frame: block.plotFrame ?? "box",
    legend: legendSlots(block),
    marks,
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
    orientation: ORIENTATION_UNUSED,
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
/**
 * A lag plot's magnitude — **`lagRow`'s own, and it is not a `seriesRange`**
 * (§3ak.14).
 *
 * At least one, over the absolute values: a correlation is a number in `[-1, 1]`
 * and an axis that shrank to fit a weakly correlated series would make noise
 * look like signal. The floor is what says *this is a correlation* rather than
 * *these are the numbers I happened to get*.
 */
function lagMagnitude(block: Pick<Plot, "series">): number {
  return Math.max(1, ...(block.series[0]?.values ?? []).map((v) => Math.abs(v ?? 0)));
}

export function categoricalDecisions(block: Plot): Omit<Figure, "marks"> {
  const data = seriesRange(block.series, block);
  // **A lag plot's range is symmetric about zero and the rest of the family's is
  // not**, which is `lagRow`'s `magnitude` moved rather than re-derived: it maps
  // `value / magnitude` either side of a centre column, where every other form
  // here fills from a floor. A form branch in a family function, for the same
  // reason the stem and the head are one — the family is the unit and the forms
  // inside it differ in what is drawn at a position the shared decisions gave.
  const extent = data === null
    ? null
    : block.form === "autocorrelation"
      ? { min: -lagMagnitude(block), max: lagMagnitude(block) }
      : { min: baselineOf(data.min), max: data.max };
  return {
    value: axisOver(extent, block),
    extent,
    identity: block.categories ?? [],
    orientation: orientationOf(block),
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
    // **Two marks and a form decides which**, because the family's four forms
    // are not one figure at four resolutions (§3ak.12). Measured in the
    // terminal rather than assumed: `lollipopRow` fills `0 … pos` with `─` and
    // puts `●` at `pos`; `dotplotRow` writes `●` at `pos` and nothing else.
    // A stem is a length and a head is a position, and a renderer that drew a
    // rect for all four would turn a dot plot into a bar chart — the plausible
    // wrong figure, since both encode the same number.
    const stem = block.form !== "dotplot";
    const head = block.form === "lollipop" || block.form === "dotplot";
    // **A lag's bar grows from zero in either direction, and it is this form's
    // own behaviour rather than F272's repair** (§3ak.14). `lagRow` puts zero at
    // the centre column and runs `[zero, end]` or `[end, zero]` by sign — so a
    // negative correlation draws to the left of centre, where every other form
    // in this family fills from the range floor. Landing it here is the
    // terminal's computation moved; landing it for the *rest* of the family
    // would be correcting the terminal inside a refactor, which is the one thing
    // this pass forbids.
    const lag = block.form === "autocorrelation";
    const zero = normalisedOf(0, value.range, false);
    block.series.forEach((series, seriesIndex) => {
      series.values.forEach((v, i) => {
        if (v === null || !Number.isFinite(v) || i >= n) return;
        // From the floor, because that is where both terminal arms fill from
        // (F272) — `(value - min) / span` in `barRow` and in `barColumn`.
        const top = normalisedOf(v, value.range, false);
        const x = (i + seriesIndex / per) / n;
        const w = 1 / (n * per);
        if (stem) {
          marks.push({
            mark: lag
              ? { kind: "rect", x, y: Math.min(zero, top), w, h: Math.abs(top - zero), fill: true }
              : { kind: "rect", x, y: 0, w, h: top, fill: true },
            layer: "series",
            seriesIndex,
          });
        }
        // **The head is on the niced range like the stem, and that is F272b's
        // ruling applied rather than a fourth range invented.** `lollipopRow`
        // and `dotplotRow` scale against the **raw** `data.min … data.max`
        // where `barRow` takes the zeroed one and `categoricalColumnForm` the
        // niced — three ranges inside one family in one arm. The figure has
        // one, and it is the one with a labelled axis behind it.
        if (head) {
          marks.push({
            mark: { kind: "point", x: x + w / 2, y: top, role: "point" },
            layer: "series",
            seriesIndex,
          });
        }
      });
    });
    // **The zero rule is furniture and it is drawn under the bars** — `lagRow`
    // writes `g.vertical` at the centre column before and after the run, because
    // a lag plot with no zero marked cannot be read at all: the sign of every
    // bar is measured against it. `layer: "furniture"` rather than an annotation,
    // since it is a fact about the axis and not a claim beside the data.
    if (lag) {
      marks.unshift({
        mark: { kind: "polyline", points: [[0, zero], [1, zero]] },
        layer: "furniture",
        ref: "surface.border",
      });
    }
    marks.push(...annotationMarks(block, value.range, lag));
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
