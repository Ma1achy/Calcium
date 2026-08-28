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
import type {
  ColormapName, OHLC, Plot, PlotForm, QuartileSummary, ScaleType, Segment, Series, VectorSeries,
} from "../../data/viewmodel/index.js";
import { IS_MATRIX } from "../../data/viewmodel/index.js";
import { normalisedSummary, quartileRange } from "../../data/viewmodel/distribution.js";
import { strips, tiles } from "./hierarchy.js";
import { flatten } from "./tree.js";
import { normalisedOf } from "../../data/viewmodel/range.js";
import { COLORMAPS } from "../theme/colormap.js";
import type { ColourRef } from "../theme/types.js";
import { axisFor, formatValue, niceAxis, tickLabels, ticksFor, type Axis } from "./axes.js";
import { LINE_DOWN, LINE_LEFT, LINE_RIGHT, LINE_UP } from "./linedraw.js";
import { candlesOf } from "./candles.js";
import { ganttBars, stackBands, stackRange, waterfallBars } from "./stack.js";
import { plotAreaRows } from "./height.js";
import { partSeparator } from "./marks.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";
import { HAS_POSITION_AXIS, ROW_IS_AN_IDENTITY, refOf } from "./marks.js";
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
  autocorrelation: true,
  // **`funnel` and `bullet` are the class I73 is about, and both were `true`**
  // (F330, §3ak.34). A `Figure` holds **one** `value`, so a form whose marks
  // want more than one range — or none — cannot have a true one, and the cell
  // reads as deliberate either way because nothing had ever drawn it.
  //
  // A funnel's readings are **shares**: its bar is `v / max` wide and centred, so
  // neither end of it is the reading, which is the proportion family's own reason
  // one family along. A bullet's three rows are three quantities in three units,
  // each scaled to its own `q.min … q.max` — and the reason was already written
  // in the renderer that draws it, *the bands say what good is, so a reader needs
  // no legend and no second glance at a dial*, in a different file from this
  // record. §3q's *one axis across the bands* does not reach it: that rule is
  // scoped by purpose in its own words, and a bullet's purpose is the opposite.
  funnel: false, bullet: false,
  // **A field's readings are colours, and the sentence that made these `true`
  // was about the ordinate** (F325). *A field is sampled over a domain, so its
  // columns are positions and its rows are a scale* — true, and about the
  // **ordinate**, in a record whose own doc says it answers whether the
  // **readings** sit on a value scale. Measured on the frame: a contour's y
  // gutter reads `0 1 2 3 4 5`, which `fieldAxes` writes into `identity`, and
  // its readings are on the **ramp legend** — `1.5  99 · 20 40 60 80`, a range
  // and its levels — exactly where a heatmap's are. So this is the matrix
  // family's answer, reached by the matrix family's argument.
  //
  // **Both arms were blind to the cell**: `fieldFigure` did not exist, and FV1
  // skips every form marked `true`. A refusal is a place the instrument is not
  // being checked, and a record cell is an instrument.
  gantt: true, timeline: true,
  // **Readings that are not on an axis, and the three families are the point.**
  // A matrix reads its values as colour, tiles read them as area, nodes read
  // them as structure. Each furnished a false axis before this record existed.
  heatmap: false, correlation: false, confusion: false, spectrogram: false,
  contour: false, quiver: false,
  // **And the three that close the class** (F327). Every form with an entry in
  // `RAMP_DEFAULT` spends its readings on colour, so none of them has a value
  // axis — and after `contour` and `quiver`, `horizon` and `calendar` were the
  // last two saying otherwise. A horizon's readings are on its key,
  // `0.0038  100  3 bands`; a calendar's are on `0  12`. **The calendar's row was
  // measured from the gutter** — *48 numeric gutter labels across the corpus* —
  // which is the one reading this record's own doc rules out, and those 48 are
  // the grid's **identity**: `calendarGrid` writes the dates. `FV1c` is the
  // cross-record row, and it has no exceptions.
  horizon: false, calendar: false,
  latency: false, density2d: false, utilisation: false,
  flame: false, icicle: false, treemap: false,
  tree: false, graph: false,
  // **Proportion — and the row had three subjects with one reason** (F304,
  // §3ak.26 finding 2). *An angle, a polygon's radius, a count of squares: the
  // reading is a share of a whole, which is not a position on a scale.* An angle
  // is a share of a whole and a count of squares is a share of a whole.
  //
  // **A polygon's radius is not.** `radarCeiling` nices `{min: 0, max: top}` to
  // six ticks, every vertex is `v / ceiling` clamped, and the four value rings at
  // a fifth through four fifths of the radius **are that scale, drawn** — so a
  // radar's reading is a position on a scale by construction. `false` was right
  // about the gutter, which this record's own doc says is a different question.
  //
  // **F267 is the same defect on the row below**, and neither is carelessness:
  // three forms were bundled and the shared reason on a bundled row is rarely
  // any of the subjects'. The correction also closed what the row hid —
  // `radarCeiling` passed `{}` where every other axis passes the block, so a
  // radar's `yMin`, `yMax` and `yFormat` were read by nothing.
  pie: false, waffle: false, radar: true,
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
 * **Whether a role is a mark at a point, a run across the slot, or nothing**
 * (I68, §3ak.21 finding 2).
 *
 * Both arms already had this partition and neither said it. The terminal draws
 * a median and a cap with `runRow(…)` and everything else with a single cell;
 * this arm draws them with `across(…)` and everything else with a circle or a
 * diamond — and its own comment says so, *the two roles that are drawn across a
 * slot rather than at a point*. **One partition written twice is F289's
 * complaint one level down**, so it comes up here, where it can be
 * character-free: `span` says nothing about `┃` or about two pixels.
 *
 * `none` is `absent`, and it is a third value rather than a missing entry.
 * Before this the terminal reached the same answer by `row[NaN] = mark`, which
 * writes a **property** on an array rather than a cell — the two arms agreed and
 * one of them agreed by accident (F299).
 */
export type GlyphShape = "mark" | "span" | "none";

/** @see GlyphShape — exhaustive, so an eighth role is a compile error here first. */
export const GLYPH_SHAPE = Object.freeze({
  point: "mark",
  median: "span",
  mean: "mark",
  outlier: "mark",
  cap: "span",
  target: "mark",
  absent: "none",
} as const) satisfies Readonly<Record<GlyphRole, GlyphShape>>;

/**
 * The roles that put a single character in a cell — **derived from
 * `GLYPH_SHAPE` rather than listed again** (I68).
 *
 * A second hand-written list is what this whole section is about: the terminal's
 * alphabet is keyed by exactly these, so a role that changes shape changes which
 * keys `RoleGlyphs.of` must have, and it changes them in the compiler rather
 * than in a comment. Listing them would let a `span` keep a stale character and
 * be drawn twice — once as a run and once as a cell.
 */
export type MarkRole = { [K in GlyphRole]: (typeof GLYPH_SHAPE)[K] extends "mark" ? K : never }[GlyphRole];

/**
 * Which of the three things a forest plot's estimate is (I68).
 *
 * **The classification, not the glyph** — the emitter needs it to write the
 * mark and `forestRow` needs it to pick a character, and the two had the same
 * three-way test written out separately. `normalisedSummary` falls `centre`
 * back to the median, so *nothing was reported* is not recoverable downstream of
 * it and this is the last place that can say so (§3ak.13).
 */
export function estimateRole(q: Pick<QuartileSummary, "centre" | "median" | "pooled">): GlyphRole {
  if (!Number.isFinite(q.centre ?? q.median)) return "absent";
  return q.pooled === true ? "target" : "point";
}

/**
 * One thing to draw, in normalised space.
 *
 * **`circle` is not here and `point` carries a `size`** (§3ak.1 finding 2). A
 * terminal point is one cell and has no radius to give it, so a bubble's size —
 * which is *data* — crosses the seam normalised, while a scatter dot's radius —
 * which is the SVG's own rasterisation — does not.
 */
export type Mark =
  | Readonly<{
      kind: "polyline";
      points: readonly Pt[];
      closed?: boolean;
      /**
       * **A closed polyline that is a region rather than an outline** (§3ak.33).
       *
       * A stacked band is a **quantity** and the eye reads its thickness; an
       * outline leaves the reader integrating two curves to find it, which is
       * `stack.ts`' own argument for filling in the terminal. `arc` and `rect`
       * both carry an explicit `fill`, so this is the type's own convention on
       * the third kind rather than `closed` quietly meaning two things.
       *
       * Absent on a curve, whose datum is the path.
       */
      fill?: boolean;
      /**
       * **The reading, where the *stroke's* appearance is the datum** — the
       * same member `rect` carries, on the second kind that needs it (F323).
       *
       * `SVG_FAMILY`'s residue entry ruled that *an iso-line is a `polyline`
       * and an arrow is a `polyline` plus a `closed` triangle, so nothing in
       * `Mark` is missing.* True about **shapes**, and silent about channels:
       * C12 I50 says an arrow's colour **is** its magnitude, and `Drawn` offers
       * only `ref` and `seriesIndex`, both categorical slots. So an arrow
       * crossed as the right shape with its only data channel dropped.
       *
       * **A member and not a ninth mark kind**, which is this type's own test:
       * *does the form already have a coordinate*, never *is the type short of
       * a case*. A quiver has one — the grid.
       *
       * Absent on an iso-line, whose reading is *which level it is* and which
       * the legend names (I49).
       */
      value?: number;
    }>
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
       * each arm turns it into a colour at its own depth — `continuousColour`
       * either side, descending a capability ladder in one arm and not in the
       * other.
       *
       * **The ramp it is turned into a colour *on* is `Figure.ramp`, and this
       * sentence used to say `colormapFor` in the terminal and one ramp either
       * way** (F324). There was no one ramp: `colormapFor` read a per-form table
       * in a terminal renderer and the second arm read the literal `"viridis"`,
       * so a correlation matrix was diverging in one arm and sequential in the
       * other. Depth is the arm's; **which** map is the figure's, because it
       * varies by form and a form is not a resolution.
       *
       * Absent on a bar, whose reading is its `h`.
       */
      value?: number;
    }>
  /**
   * **A sector or a ring, in turns from twelve o'clock, clockwise** (§3ak.26
   * finding 4).
   *
   * The residue ruling refuses to widen `Mark` for `contour`, `quiver` and
   * `horizon` because *what is missing is a derivation above cells* — those
   * forms never separated their geometry from their rasterisation, so a mark
   * kind would be a hole punched for a picture. **A pie is the inverse.**
   * `sharesOf` is its geometry above cells and it already exists; what was
   * missing is a member for an angle. So the test is *does the form already have
   * a coordinate*, never *is the type short of a case*.
   *
   * **The direction is stated because a sign convention living in two files ends
   * up different in them.** `radius` is a fraction of the figure's own radius, so
   * a wedge is `1` and a radar's ring is the ring's `t`; `fill` separates a
   * sector from a ring, which is the only thing the two need to differ by.
   */
  | Readonly<{ kind: "arc"; from: number; to: number; radius: number; fill: boolean }>
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
  /**
   * **The reading beside the name** — `65%` — as a string, and `ValueAxis.labels`
   * is the precedent (§3ak.26 finding 5).
   *
   * A pie's legend is `swatch label 65%` and a radar's is `swatch label`; the
   * percentage is a formatted number derived from the data, which is the class
   * that already crosses, while the swatch is the class that must not (I62).
   *
   * **Optional, and `radar` is why.** `segmentLegend` is called by all three
   * proportion forms and the radar passes `""` — it has a name and no reading to
   * put beside it. An empty string and *no reading* are the same on the page and
   * different in the record, and F280 is the standing instance of an absent case
   * taking its meaning from the only case that had one.
   */
  value?: string;
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
 * The border a figure draws, **`"none"` included** (I67, §3ak.19).
 *
 * `axes: false` removes the border, and no value of `plotFrame` says that — C04
 * splits the two questions because an **author** has two: *is there furniture*
 * and *what shape is it*, and one enum spelling `"none"` would make
 * `axes: false, plotFrame: "box"` expressible and meaningless. After resolution
 * there is one answer, so the figure collapses what the block splits. **The
 * direction is the ruling**, and it is not a disagreement with C04.
 *
 * **`"none"` means no border and not *no furniture***, which is narrower than
 * this member was first specified as. `axes` gates three things — the reserved
 * rows, the gutter and the position axis — and each carries a per-form override,
 * so `gutter` and `positionAxis` answer separately.
 */
export type FigureFrame = FrameStyle | "none";

/**
 * Where a legend goes, or that there is none (I67, §3ak.19).
 *
 * **`null` rather than an empty slot list.** An empty list already means *this
 * figure has nothing to name* — a single-series curve — and *the author refused
 * a legend* is a different fact about a figure that has plenty. Collapsing them
 * is F280's shape one member along: an absent case given its meaning from the
 * only case that had one.
 *
 * The placement is here because `legendSlots` returned the same list for all
 * four values and for `false`, so an arm consuming the member drew a legend the
 * author suppressed, in a place nobody chose (F295).
 */
export type FigureLegend = Readonly<{
  slots: readonly LegendSlot[];
  /**
   * **The author's placement, or `null` where they said nothing** — never the
   * resolved one.
   *
   * `legendPlacement` auto-enables when a legend is load-bearing, and one of its
   * clauses reads `caps.colourDepth === 1`: below the colour floor a positional
   * stack writes its names in the gutter, so the legend it would otherwise want
   * is a second copy of that list. **A resolved placement is therefore
   * capability-dependent, and a figure is capability-independent by
   * construction** (§3ak.2's own test — would a 1-bit terminal and a 24-bit SVG
   * both want this answer). So the member carries the request and each arm
   * resolves: the terminal through `legendPlacement`, the second arm through
   * `"right"`, the placement that can size itself to its content.
   *
   * **Three facts, not two.** `false`, an explicit placement, and *nothing said*
   * are different — the outer `null` is the refusal and this one is the
   * deferral. Collapsing the second pair is what made the first read-back put a
   * legend on every plot that had not asked for one: 812 baseline frames.
   */
  placement: "above" | "below" | "left" | "right" | null;
}>;

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
  /** The border shape, `"none"` where `axes: false` removes it (I67). */
  frame: FigureFrame;
  /** Is the leading label column drawn — the heatmap's override applied (I67). */
  gutter: boolean;
  /** Is the position axis row drawn — `xLabels` short-circuits it (I67). */
  positionAxis: boolean;
  /** Which side the value labels sit on, `null` where `yAxis: false` (I67). */
  valueLabels: "left" | "right" | "both" | null;
  /** Placed, or `null` where the author refused one — never an empty list (I67). */
  legend: FigureLegend | null;
  /**
   * **Both normalised axes carry one unit, so each arm fits a centred square
   * inside its own box rather than filling it** (I69, §3ak.26 finding 1).
   *
   * Not the cell aspect, which stays a terminal fact under G2 and never crosses:
   * a braille dot is square and a pixel is square, so `squareColumns` and
   * `rx = 2·ry` are `aspect.ts`' business. **This is the other quantity that was
   * wearing its name** — `radiusFor`'s `min`, fitting an isotropic figure into
   * an anisotropic box, which the terminal does in dots and the second arm does
   * in pixels.
   *
   * Measured before the member existed: every pie and every radar in the
   * catalogue is height-bound at *every* width, so `radiusFor`'s `byWidth` arm
   * is dead across the corpus and its `min` reads as deciding nothing; the
   * second arm's plot area is 1.44× wider than tall with a right legend, which
   * makes a unit square an ellipse and a waffle's hundred squares 39.7 × 27.5 px
   * (F303).
   *
   * **A boolean and not a ratio**, deliberately — `arcDots`' own rule about a
   * knob nothing turns. The day a form wants three-by-two the member widens and
   * every call site is a compile error, which is what a premature `number` buys
   * nothing towards.
   */
  isotropic: boolean;
  /**
   * **The colormap's name, or `null` where the figure has no ramp** (I72,
   * §3ak.30).
   *
   * A name and never a colour, which is I62 one member along and for the same
   * reason: `continuousColour` descends a capability ladder in the terminal and
   * does not in the second arm, so a resolved colour is the one thing that must
   * not cross. What *does* cross is which of the ramps this figure is on — and
   * that varies by **form**, which is what makes it a figure fact rather than a
   * rasterisation one.
   *
   * *Measured before the member existed: the terminal's `DEFAULT_COLORMAP` gave
   * `correlation` a diverging map and `utilisation` a warm one, and the second
   * arm's whole ramp decision was `COLORMAPS[block.colormap ?? "viridis"]` — so
   * two forms were drawn on the wrong ramp, one of them being exactly the defect
   * the table's own comment calls the most common there is* (F324).
   */
  ramp: ColormapName | null;
  /** Normalised, uninverted, refs unresolved. Empty is a refusal (I64). */
  marks: readonly Drawn[];
}>;

/**
 * The ramp a form is on, by default — **here rather than in a renderer**
 * (I72, §3ak.30, F324).
 *
 * **Total over `PlotForm`, and `utilisation` is why.** This was
 * `Record<string, string>` — one of the four silent tables — so a matrix form
 * added without an entry did not fail to compile. `utilisation` was, and the
 * terminal's lookup returned undefined for it at every colour depth, so a
 * 24-bit terminal drew a braille density ramp and a monochrome legend. The
 * defect is invisible in the stripped frame, because a washed heatmap is blank
 * there by construction: the colour is a background.
 *
 * **A declared `colormap` still wins**, and the default is a *kind* decision: a
 * correlation runs −1 → 0 → +1 and wants a diverging map, and reading it in a
 * sequential one is the single most common chart defect there is.
 */
export const RAMP_DEFAULT: Readonly<Record<PlotForm, ColormapName | null>> = Object.freeze({
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
  horizon: "coolwarm",
  line: null, sparkline: null, scatter: null, step: null, ecdf: null, density: null,
  bar: null, histogram: null, boxplot: null, violin: null, ridgeline: null,
  forest: null, dumbbell: null, lollipop: null, dotplot: null, waffle: null,
  flame: null, icicle: null, treemap: null, tree: null, graph: null, funnel: null, gantt: null,
  waterfall: null, streamgraph: null, stackedarea: null,
  smallmultiples: null, pairplot: null, pie: null, radar: null,
  slope: null, bubble: null, autocorrelation: null, timeline: null, bullet: null,
});

/** The ramp this block's readings are on — declared, defaulted, or none (I72). */
export function rampOf(block: Pick<Plot, "form" | "colormap">): ColormapName | null {
  return block.colormap ?? RAMP_DEFAULT[block.form];
}

/**
 * The border, with `axes` applied (I67, §3ak.19).
 *
 * `definition.ts` styles its layout from `block.plotFrame` and gates the whole
 * of the furniture on `block.axes` twenty lines apart, so the two were one
 * decision in two places. This is that decision.
 */
export function frameOf(block: Pick<Plot, "axes" | "plotFrame">): FigureFrame {
  return block.axes === true ? block.plotFrame ?? "box" : "none";
}

/**
 * Whether the leading label column is drawn — **the gutter, not the labels**
 * (I67, §3ak.19).
 *
 * `definition.ts`' `axed`, moved with its override intact. **A heatmap is always
 * guttered whatever `axes` says**, because the row labels *are* its ordinate and
 * an unlabelled matrix is a picture of numbers with no way to tell which row is
 * which — `axes: false` is refused there rather than honoured (C04 I50b). That
 * override is why `frame: "none"` could not carry this: the two answers differ
 * for one form and a single member would have to pick one.
 */
export function gutterOf(block: Pick<Plot, "axes" | "form">): boolean {
  // **The override is the family and not `heatmap` alone** (F352). Keyed on the
  // one form, `utilisation/default` — a matrix with no `axes`, which C04 permits
  // and `checkHeatmap` refuses only `axes: false` for — came back `false`, so
  // the second arm drew a matrix with **no row labels** where the terminal draws
  // `node-1 … node-4`. `heatmap/default` was right by setting `axes: true`, so
  // the clause it was written for is the one case that never needed it.
  //
  // **The same form found the same narrowness in C04** (C04 I50b): *the refusal
  // reached one form of eight … found by `utilisation` accepting `axes: false`*.
  // Two functions, one override, and the narrow copy outlived the fix by the
  // width of a file.
  return block.axes === true || IS_MATRIX[block.form];
}

/**
 * Whether the position axis row is drawn (I67, §3ak.19).
 *
 * `furniture.ts`' condition, moved. **`xLabels` short-circuits it** — a caller
 * that supplied the three strings gets them drawn whatever `axes` says, which is
 * the same shape as the heatmap's gutter and the reason this is a third answer
 * rather than a second reading of `frame`.
 */
export function positionAxisOf(block: Pick<Plot, "axes" | "form" | "xLabels">): boolean {
  return block.xLabels !== undefined || (block.axes === true && HAS_POSITION_AXIS[block.form]);
}

/**
 * Which side the value labels sit on, or that there are none (I67, §3ak.19).
 *
 * `furniture.ts` reads `block.yAxis ?? "left"` and treats `false` as *no
 * labels, keep the frame and the position axis* — which `frame` cannot say and
 * `gutter` must not, because a guttered figure with `yAxis: false` still spends
 * the column on something.
 */
export function valueLabelsOf(block: Pick<Plot, "axes" | "form" | "yAxis">): "left" | "right" | "both" | null {
  // **`axes` is read here because I67 says it gates three things and this is the
  // third** (§3ak.40, F347). The `Pick` listed one field where the decision has
  // two, which is what a reviewer reads as *the inputs this depends on* — so it
  // read as deliberate, and `axes: false` drew `["0", "5"]` down three figures
  // whose terminal frames have no furniture at all. `yAxis`'s own doc had ruled
  // it from the other side before either resolver existed: *`false` removes the
  // labels and keeps the frame and the x axis, **which is what `axes: false`
  // cannot say on its own***.
  //
  // **The terminal was right by a second mechanism**, which is what hid it: its
  // labels come from `layout.labelColumn`, and `bandLayout` gets no gutter when
  // `axes` is not `true`. A decision enforced twice in one arm and once in the
  // shared layer is not enforced in the shared layer, and the arm holding the
  // redundancy is the one that looks correct.
  //
  // **An explicit `yAxis` does not override it.** `positionAxisOf`'s
  // `xLabels !== undefined` escape looks like the precedent and is not: those
  // are three captions the *author wrote*, where `yAxis` is a placement for
  // labels the figure derives. `axes: false, yAxis: "right"` asks for a side of
  // an axis that is not drawn — the reason `xTitle` is refused under
  // `axes: false` rather than honoured.
  // **The override is the matrix family, and it is I67's own** — *a heatmap
  // guts its rows whatever `axes` says, since its row labels **are** its
  // ordinate*. `gutterOf` carries the same override keyed on `heatmap` alone;
  // written for the family here because C04's `checkHeatmap` already learned
  // that lesson on this exact family and this exact form — `utilisation`
  // accepting `axes: false` is what found it (C04 I50b) — and because
  // `utilisation/default` is the one frame of 182 that moved when this rule was
  // first written without an override at all.
  if (block.axes !== true && !IS_MATRIX[block.form]) return null;
  const y = block.yAxis ?? "left";
  return y === false ? null : y;
}

/**
 * The legend, placed — or `null` where the author refused one (I67, §3ak.19).
 *
 * `furniture.ts`' first two lines and **only** those two: `false` is no legend,
 * an explicit value is where it goes. What follows them there — the auto-enable
 * — stays in that arm, because one of its clauses reads `caps.colourDepth` and a
 * figure cannot.
 */
export function legendOf(block: Plot): FigureLegend | null {
  if (block.legend === false) return null;
  return { slots: legendSlots(block), placement: block.legend ?? null };
}

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
    isotropic: false,
    ramp: rampOf(block),
    orientation: "vertical",
    facing: facingOf(block, FACING_DEFAULT),
    frame: frameOf(block),
    gutter: gutterOf(block),
    positionAxis: positionAxisOf(block),
    valueLabels: valueLabelsOf(block),
    legend: legendOf(block),
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
    isotropic: false,
    ramp: rampOf(block),
    orientation: ORIENTATION_UNUSED,
    // **Only the flame grows up** (F276). `FACING_MATRIX` is named for the
    // family it was written for and holds the shape three families want — the
    // second axis running down the page — which is a treemap's `y0` and an
    // icicle's depth alike.
    facing: facingOf(block, block.form === "flame" ? FACING_DEFAULT : FACING_MATRIX),
    // **This family draws no border, whatever `plotFrame` says** (C12 I67,
    // §3ak.19, F296). A matrix's cells bound themselves, a tiles figure's
    // rectangles do, and a tree's edges do. `height.ts` spends the matrix's
    // two furniture rows on the **ramp legend** rather than an axis rule for
    // exactly this reason, and its comment says so.
    //
    // **Found by the record widening rather than by a frame** — giving the
    // second arm `frame` turned `heatmap.interiorRules` from `agree` to
    // `8/8`, a disagreement that OPENED, because `frameOf` answers a style
    // and this is a family fact. It is the same three families `value: null`
    // names, and it is decided here for the same reason.
    frame: "none",
    gutter: gutterOf(block),
    positionAxis: positionAxisOf(block),
    valueLabels: valueLabelsOf(block),
    legend: legendOf(block),
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
    isotropic: false,
    ramp: rampOf(block),
    orientation: ORIENTATION_UNUSED,
    facing: facingOf(block, FACING_DEFAULT),
    // **This family draws no border, whatever `plotFrame` says** (C12 I67,
    // §3ak.19, F296). A matrix's cells bound themselves, a tiles figure's
    // rectangles do, and a tree's edges do. `height.ts` spends the matrix's
    // two furniture rows on the **ramp legend** rather than an axis rule for
    // exactly this reason, and its comment says so.
    //
    // **Found by the record widening rather than by a frame** — giving the
    // second arm `frame` turned `heatmap.interiorRules` from `agree` to
    // `8/8`, a disagreement that OPENED, because `frameOf` answers a style
    // and this is a family fact. It is the same three families `value: null`
    // names, and it is decided here for the same reason.
    frame: "none",
    gutter: gutterOf(block),
    positionAxis: positionAxisOf(block),
    valueLabels: valueLabelsOf(block),
    legend: legendOf(block),
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
          // reported* — the role is what says it, and it is why both arms can
          // refuse to draw at a position that is not a reading.
          //
          // **The three-way test is `estimateRole`'s and not this loop's**
          // (§3ak.22). `forestRow` had the same expression written out again, so
          // the terminal's answer for `absent` came out of a different statement
          // — and out of `row[NaN]` rather than a statement at all.
          const role = estimateRole(q);
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
              role,
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
    isotropic: false,
    ramp: rampOf(block),
    orientation: orientationOf(block),
    facing: facingOf(block, FACING_DEFAULT),
    frame: frameOf(block),
    gutter: gutterOf(block),
    positionAxis: positionAxisOf(block),
    valueLabels: valueLabelsOf(block),
    legend: legendOf(block),
    marks,
  };
}

// --- the field family's geometry (I49, I50, I71, §3ak.29) -------------------
//
// **Above the two rasterisers rather than inside one of them**, which is what
// I71 asks for and what `SVG_FAMILY`'s deferral named as its condition: no
// `areaWidth`, no `areaRows`, no `caps`, no string in the signature.
// `contourCellRows` and `contourDotRows` keep all four, because a glyph per
// cell is a raster and `glyphForMask` wants a mask per cell that no set of
// segments can supply.

/** What a field form draws, in draw order (I51). */
export function layersOf(block: Pick<Plot, "form" | "layers">): readonly ("field" | "contour" | "quiver")[] {
  if (block.layers !== undefined) return block.layers;
  if (block.form === "contour") return ["field", "contour"];
  return block.form === "quiver" ? ["field", "quiver"] : ["field"];
}

/** Whether the field itself is painted — membership, never position (I51). */
export function paintsField(block: Pick<Plot, "form" | "layers">): boolean {
  return layersOf(block).includes("field");
}

/** The mask a saddle produces — all four edges. Both resolutions give it. */
const SADDLE = LINE_UP | LINE_RIGHT | LINE_DOWN | LINE_LEFT;

/**
 * The four corners of one cell, above or below the level, as an **edge** mask.
 *
 * An edge is crossed exactly when its two corners disagree, which is the whole
 * derivation — there is no sixteen-case table here and that is deliberate.
 * `glyphForMask` takes the mask from here and so does `contourSegments`, which
 * is the point of it living above both: a second copy is how the pie came to be
 * drawn in a vocabulary the line forms had left behind.
 *
 * A corner that is `null` — a gap — makes the cell uncrossable rather than
 * counting as below: a field with a hole in it has no contour across the hole,
 * and treating absence as *below the level* draws one along the hole's rim.
 */
export function marchingMask(
  tl: number | null, tr: number | null, br: number | null, bl: number | null, level: number,
): number {
  if (tl === null || tr === null || br === null || bl === null) return 0;
  const a = tl >= level;
  const b = tr >= level;
  const c = br >= level;
  const d = bl >= level;
  return (
    (a !== b ? LINE_UP : 0) | (b !== c ? LINE_RIGHT : 0) |
    (c !== d ? LINE_DOWN : 0) | (d !== a ? LINE_LEFT : 0)
  );
}

/**
 * Which way a saddle connects, by the cell's centre value — matplotlib's rule.
 *
 * `true` joins **top→left and bottom→right**; `false` joins top→right and
 * bottom→left. The centre is the bilinear average of the four corners, so the
 * pairing follows the surface rather than a convention.
 *
 * **This has no observable consequence on the terminal's `"line"` arm** — both
 * pairings are mask 15 and render `┼` — which is why `"auto"` picks braille
 * (§3y). It is visible here, where the two segments are drawn separately.
 */
export function saddleJoinsTopLeft(
  tl: number, tr: number, br: number, bl: number, level: number,
): boolean {
  const centre = (tl + tr + br + bl) / 4;
  return (centre >= level) === (tl >= level);
}

/** Where along an edge the level falls, as a fraction from the first corner. */
export function crossing(a: number, b: number, level: number): number {
  const d = b - a;
  if (d === 0) return 0.5;
  const t = (level - a) / d;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * The levels a contour draws, declared or derived (I49).
 *
 * **The gutter's own function**, so a contour's levels and the y ticks are the
 * same numbers rather than two nice-number runs that agree at most widths. The
 * interior ticks only: a level at the field's minimum crosses nothing and a
 * level at its maximum crosses nothing, so drawing them says *no contour* where
 * the caller asked for one.
 */
export function contourLevels(block: Plot, range: Range): readonly number[] {
  if (block.levels !== undefined) return block.levels.filter((v) => Number.isFinite(v));
  return niceAxis(range, 6, block).ticks.filter((v) => v > range.min && v < range.max);
}

/**
 * The levels a key names, as the caption that trails its upper bound (I49, §3ak.38).
 *
 * **Both arms call this and neither assembles it**, which is the half F338 was
 * missing. `contourLevels` already crossed — the terminal's key called it and
 * `contourFigure` marched it — and the *caption* was built twice, which is how
 * one arm came to have it and the other not.
 *
 * **The separator is a promise about what follows.** A constant field has no
 * interior ticks, so the list is empty and the terminal drew `50          50 ·`
 * — a mark announcing a list, with nothing after it. Read off the frame when
 * the second arm reproduced the construction faithfully, which is what a second
 * arm is for (F340). Gated here, so there is one place it can be wrong.
 *
 * **The caps are the resolution and not the decision** (I72). `partSeparator`
 * descends to ` - ` on an ASCII terminal and this arm pins one rung, so which
 * mark separates them is each arm's; *which readings* is neither's.
 *
 * **Gated on the layer and not on the form**, which is the same widening
 * `paintsField` is. Both arms asked `form === "contour"`, so `quiver`'s
 * `with-contour` variant drew iso-lines off `contourLevels` and named none of
 * them — the same defect on a form the record files elsewhere. `layersOf` is
 * a strict superset here: every `contour` block without declared layers gets
 * `["field", "contour"]`, and the only fixture the widening reaches is the one
 * that was wrong. A matrix asks `niceAxis` for the same ticks and draws no
 * lines at all, which is what the gate is for.
 */
export function levelCaption(
  block: Plot,
  range: Range,
  caps: Pick<TerminalCapabilities, "unicode">,
): string {
  if (!layersOf(block).includes("contour")) return "";
  const levels = contourLevels(block, range);
  if (levels.length === 0) return ""; // cells-ok — a level count
  return `${partSeparator(caps)}${levels.map((v) => formatValue(v, block.yFormat)).join(" ")}`;
}

/**
 * The iso-line segments a field crosses, **on the data's own grid** (I49, I71).
 *
 * **The geometry, separated from the raster.** `contourCellRows` and
 * `contourDotRows` resample the field onto the cells they are about to draw and
 * march *there*, because a glyph arm has nothing finer than a cell. This marches
 * the readings themselves, which is where the crossings are: a crossing is a
 * linear interpolation between two adjacent readings and no resampling adds one.
 * It is also what the reference implementation draws.
 *
 * **Normalised to `cornerReader`'s domain**, which had to be checked rather than
 * chosen. The terminal's corner `i` of `w` reads data index `(i / w) · (cols −
 * 1)`, so reading 0 is at the area's left edge and reading `cols − 1` at its
 * right — one interval per gap between readings. This reproduces that, because
 * an arm that chose the field paint's convention instead would be two arms
 * drawing one block differently.
 *
 * A `null` corner drops its whole cell rather than interpolating across it,
 * which is `cornerReader`'s rule: a gap is a position that produced no reading
 * (C04 I46a) and averaging its neighbours invents one.
 *
 * **One polyline per segment and no chaining.** Adjacent cells share a crossing
 * point exactly — the two masks cannot disagree, which is `CN6` — so abutting
 * segments join with nothing joining them, and a chain would be a second
 * structure to keep true.
 */
export function contourSegments(
  series: readonly Series[],
  levels: readonly number[],
): readonly (readonly [Pt, Pt])[] {
  const rows = series.length; // cells-ok — a row count
  const cols = series.reduce((m, r) => Math.max(m, r.values.length), 0); // cells-ok — a column count
  if (rows < 2 || cols < 2 || levels.length === 0) return []; // cells-ok — grid extents
  const at = (i: number, j: number): number | null => {
    const v = series[j]?.values[i];
    return v === null || v === undefined || !Number.isFinite(v) ? null : v;
  };
  const px = (i: number): number => i / (cols - 1); // cells-ok — a column count
  const py = (j: number): number => j / (rows - 1); // cells-ok — a row count
  const out: (readonly [Pt, Pt])[] = [];

  for (const level of levels) {
    for (let j = 0; j < rows - 1; j += 1) { // cells-ok — a row index
      for (let i = 0; i < cols - 1; i += 1) { // cells-ok — a column index
        const tl = at(i, j);
        const tr = at(i + 1, j);
        const br = at(i + 1, j + 1);
        const bl = at(i, j + 1);
        if (tl === null || tr === null || br === null || bl === null) continue;
        const mask = marchingMask(tl, tr, br, bl, level);
        if (mask === 0) continue;
        const top: Pt = [px(i + crossing(tl, tr, level)), py(j)];
        const right: Pt = [px(i + 1), py(j + crossing(tr, br, level))];
        const bottom: Pt = [px(i + crossing(bl, br, level)), py(j + 1)];
        const left: Pt = [px(i), py(j + crossing(tl, bl, level))];

        if (mask === SADDLE) {
          // **The one place the centre value is read**, and the arm where the
          // reading is visible: the terminal's cell arm collapses both pairings
          // onto `┼`.
          if (saddleJoinsTopLeft(tl, tr, br, bl, level)) out.push([top, left], [bottom, right]);
          else out.push([top, right], [bottom, left]);
          continue;
        }
        const ends: Pt[] = [];
        if ((mask & LINE_UP) !== 0) ends.push(top);
        if ((mask & LINE_RIGHT) !== 0) ends.push(right);
        if ((mask & LINE_DOWN) !== 0) ends.push(bottom);
        if ((mask & LINE_LEFT) !== 0) ends.push(left);
        if (ends[0] !== undefined && ends[1] !== undefined) out.push([ends[0], ends[1]]);
      }
    }
  }
  return out;
}

/** How much of its own cell an arrow spans, and how long the barbs are. */
const ARROW_SPAN = 0.45;
const ARROW_BARB = 0.5;
/** 150° either side of the shaft — a chevron, not a closed triangle. */
const ARROW_ANGLE = (5 * Math.PI) / 6;

/**
 * A vector field's arrows, one per datum (I50).
 *
 * **One per datum and not one per cell**, which is the resolution difference the
 * seam exists to allow: `quiverRows` resamples onto the cells it has and draws
 * a vector two or three times over, and this draws each once.
 *
 * **A still cell draws nothing** — not an arrow of arbitrary direction, which is
 * what `atan2(0, 0) === 0` gives and what would render a still field as a field
 * of eastward flow with every magnitude assertion passing.
 *
 * **`v` is north-positive**, the data convention, and the figure's `y` runs down
 * with the matrix facing; the flip is here so no arm has to know it.
 *
 * **The barbs are a chevron, and the record predicted a `closed` triangle.**
 * Measured: `closed` on a polyline emits `Z` with `fill="none"`, so it strokes
 * an outline rather than filling one — at this size a stroked triangle *is* a
 * chevron with an extra edge, and the chevron is what a single-stroke arrow is.
 *
 * **The shaft is scaled in cell units on each axis separately**, so an arrow at
 * 45° in index space points at its own cell's corner. Any choice distorts,
 * because the figure's normalised space maps a non-square grid onto a unit
 * square; this one distorts *with* the cells the arrows sit in rather than
 * against them.
 */
function arrowMarks(
  vectors: readonly VectorSeries[],
  colourBy: Range | null,
  out: Drawn[],
): void {
  const rows = Math.max(1, vectors.length); // cells-ok — a row count
  const cols = Math.max(1, vectors.reduce((m, r) => Math.max(m, r.values.length), 0)); // cells-ok
  vectors.forEach((row, r) => {
    row.values.forEach((p, c) => {
      if (p === null) return;
      const [u, v] = p;
      if (!Number.isFinite(u) || !Number.isFinite(v)) return;
      const mag = Math.hypot(u, v);
      if (mag === 0) return;
      const ux = u / mag;
      const uy = -v / mag;
      const cx = (c + 0.5) / cols; // cells-ok — a column count
      const cy = (r + 0.5) / rows; // cells-ok — a row count
      const sx = (dx: number): number => (dx * ARROW_SPAN) / cols; // cells-ok — a column count
      const sy = (dy: number): number => (dy * ARROW_SPAN) / rows; // cells-ok — a row count
      const tip: Pt = [cx + sx(ux), cy + sy(uy)];
      const barb = (a: number): Pt => [
        tip[0] + sx((ux * Math.cos(a) - uy * Math.sin(a)) * ARROW_BARB),
        tip[1] + sy((ux * Math.sin(a) + uy * Math.cos(a)) * ARROW_BARB),
      ];
      const span = colourBy === null || colourBy.max - colourBy.min <= 0
        ? {}
        : { value: (mag - colourBy.min) / (colourBy.max - colourBy.min) };
      const tail: Pt = [cx - sx(ux), cy - sy(uy)];
      out.push({ mark: { kind: "polyline", points: [tail, tip], ...span }, layer: "series", ref: refOf(0) });
      out.push({
        mark: { kind: "polyline", points: [barb(ARROW_ANGLE), tip, barb(-ARROW_ANGLE)], ...span },
        layer: "series",
        ref: refOf(0),
      });
    });
  });
}

/**
 * Whether an arrow's colour is its magnitude — **is the field something else**
 * (I50).
 *
 * The terminal answers this by *provenance*: `drawnBlock` substitutes the
 * magnitudes where the caller named no scalar, and the renderer asks whether the
 * substitution fired. By the time a figure is built there is no provenance left,
 * so this asks the question the terminal's own comment states — *magnitude is
 * the arrow's colour where the field carries something else* — as a fact about
 * the data.
 *
 * **They differ on one input and the corpus has none of it**: a caller who
 * passes the magnitudes explicitly as `series`. The terminal would colour those
 * arrows in exactly their own background — `38;2;33;145;141` on
 * `48;2;33;145;141`, measured — and this returns `false` and does not.
 */
function fieldIsSomethingElse(series: readonly Series[], vectors: readonly VectorSeries[]): boolean {
  if (series.length !== vectors.length) return true; // cells-ok — a row count
  return !vectors.every((row, r) => {
    const got = series[r]?.values ?? [];
    return got.length === row.values.length // cells-ok — a reading count
      && row.values.every((p, c) => {
        const want = p === null ? null : Math.hypot(p[0], p[1]);
        return got[c] === want;
      });
  });
}

/**
 * The field family's figure — the grid, its iso-lines and its arrows (I49, I50,
 * I51, I71, §3ak.29).
 *
 * **Its own family, and the record predicted the matrix's.** `SVG_FAMILY`'s
 * deferral said *the day `contourFigure` exists these are `"matrix"`* — a
 * statement about resemblance, where the member decides **which emitter**.
 * `matrixFigure` emits cells and nothing else, so a contour routed through it
 * draws a heatmap with the lines missing and reports as supported: the plausible
 * wrong figure, which is what a `null` arm refuses and a wrong family would not.
 *
 * **Membership is the whole of what crosses** (I51). `paintsField` is a question
 * about `layers`; `fieldPaintsUnder`'s other half is a **colour-depth** question
 * and stays terminal, because a ramp glyph and a contour glyph competing for one
 * alphabet is a contest only a glyph arm has.
 *
 * **And `fieldDim` and `glyphInk` do not cross at all.** Both are remedies for a
 * glyph sharing a cell with its own background; a stroke sits *over* a fill and
 * shares no quantum with it, and a polyline crosses many cells with many
 * backgrounds so the per-cell remedy has no subject here. That is §3ak.26's
 * class — a resolution limit, and a resolution is a thing only a grid has.
 */
export function fieldFigure(block: Plot): Figure {
  const extent = seriesRange(block.series, block);
  const rows = Math.max(1, block.series.length); // cells-ok — a row count
  const cols = Math.max(1, block.series.reduce((m, r) => Math.max(m, r.values.length), 0)); // cells-ok
  const marks: Drawn[] = [];

  if (paintsField(block) && extent !== null) {
    block.series.forEach((series, seriesIndex) => {
      series.values.forEach((v, c) => {
        if (v === null || !Number.isFinite(v)) return;
        marks.push({
          mark: {
            kind: "rect",
            x: c / cols, // cells-ok — a column count
            y: seriesIndex / rows, // cells-ok — a row count on the field's grid
            w: 1 / cols, // cells-ok — a column count
            h: 1 / rows, // cells-ok — a row count
            fill: true,
            // The reading, spent on colour — a field cell has no length.
            value: normalisedOf(v, extent, false),
          },
          layer: "series",
          seriesIndex,
        });
      });
    });
  }

  // **Draw order, not priority order.** `glyphLayerOrder` reverses into the
  // terminal's priority — which glyph wins a contested *cell* — and a stroke
  // over a fill has no contest, so this takes the author's order as written.
  for (const layer of layersOf(block)) {
    if (layer === "contour" && extent !== null) {
      for (const [from, to] of contourSegments(block.series, contourLevels(block, extent))) {
        marks.push({ mark: { kind: "polyline", points: [from, to] }, layer: "series", ref: refOf(0) });
      }
    }
    if (layer === "quiver" && block.vectors !== undefined) {
      const vectors = block.vectors;
      arrowMarks(
        vectors,
        fieldIsSomethingElse(block.series, vectors)
          ? seriesRange(vectors.map((row) => ({
              values: row.values.map((p) => (p === null ? null : Math.hypot(p[0], p[1]))),
            })), {})
          : null,
        marks,
      );
    }
  }

  return {
    value: null,
    extent,
    // The ordinate's captions, which the second arm now draws (F325).
    identity: block.series.map((sr) => sr.label ?? ""),
    isotropic: false,
    orientation: ORIENTATION_UNUSED,
    // Rows run top to bottom, as a matrix's do.
    facing: facingOf(block, FACING_MATRIX),
    // A field's cells bound themselves, as a matrix's do (I67, §3ak.19, F296).
    frame: "none",
    gutter: gutterOf(block),
    positionAxis: positionAxisOf(block),
    valueLabels: valueLabelsOf(block),
    legend: legendOf(block),
    ramp: rampOf(block),
    marks,
  };
}

// --- the horizon's bands (I52, I71, §3z, §3ak.29) ---------------------------

/** One sample's place in the fold — **geometry, with no resolution in it**. */
export type HorizonBand = Readonly<{
  /** 0 nearest the baseline, `bands − 1` deepest. */
  band: number;
  /** `1` above the baseline, `-1` below it. */
  sign: 1 | -1;
  /** How far into the band, `0 … 1`. The raster spends this; the figure carries it. */
  within: number;
}>;

/**
 * What the fold is measured from (§3z, I52).
 *
 * **Zero where the range spans it, the minimum otherwise.** Folding about the
 * data's minimum unconditionally is what shipped, and it is why the form only
 * ever folded one way — a series that never crosses zero renders identically
 * under both rules, so the defect is invisible on exactly the fixtures a
 * catalogue carries.
 */
export function horizonBaseline(range: Range): number {
  return range.min <= 0 && range.max >= 0 ? 0 : range.min;
}

/**
 * The fold, one entry per **sample** (I52, I71, §3z).
 *
 * **`horizonGrid`'s arithmetic, above the raster.** That function took
 * `areaWidth` and `areaRows`, resampled the series onto columns, and computed
 * `within` one line before spending it on `eighths` — the geometry and the
 * rasterisation in one loop, which is why this form had no coordinate to share.
 * The split is the line between those two statements: `within` is a fraction of
 * a band and `eighths` is how many of a cell's eight sub-rows that buys, and
 * only a grid has sub-rows.
 *
 * A gap is `null` rather than a zero band: absence and the minimum are the two
 * things this form must not conflate, since its whole subject is *how deep*.
 */
export function horizonBands(
  series: Series,
  range: Range,
  bands: number,
): readonly (HorizonBand | null)[] {
  const n = Math.max(1, Math.floor(bands)); // cells-ok — a band count
  const baseline = horizonBaseline(range);
  // The deepest deviation either side, so the bands are the same size above and
  // below — a mirror whose two halves had different scales would say a shallow
  // trough is as deep as a tall peak.
  const reach = Math.max(Math.abs(range.max - baseline), Math.abs(range.min - baseline));
  const size = reach > 0 ? reach / n : 0;
  return series.values.map((v) => {
    if (v === null || !Number.isFinite(v)) return null;
    const deviation = Math.abs(v - baseline);
    const sign: 1 | -1 = v < baseline ? -1 : 1;
    const scaled = size > 0 ? deviation / size : 0;
    const band = Math.min(n - 1, Math.floor(scaled)); // cells-ok — a band index
    // **Clamped, and `G6` is what found it missing.** `band` is already pinned at
    // `n − 1`, so a sample beyond the caller's `yMin`/`yMax` lands in the last
    // band with `scaled − band > 1` — *how far into the band* exceeding the band.
    // The terminal never showed it because `horizonGrid` takes `min(h · 8, …)`
    // one line later; this arm drew a rect taller than its own plot area.
    return { band, sign, within: size > 0 ? Math.min(1, scaled - band) : 0 };
  });
}

/**
 * Where a band sits on the colormap, in `0…1` (I52, §3z).
 *
 * **A diverging map's two halves are the two directions**, deeper reading
 * further from the centre. On a sequential map — which the gates only allow
 * where nothing crosses the baseline — the whole ramp is one direction, so a
 * band indexes it directly and no half is wasted on a sign that cannot occur.
 */
export function horizonBandT(
  cell: Pick<HorizonBand, "band" | "sign">,
  bands: number,
  diverging: boolean,
): number {
  const n = Math.max(1, Math.floor(bands)); // cells-ok — a band count
  const depth = (cell.band + 1) / n;
  return diverging ? 0.5 + (cell.sign * depth) / 2 : depth;
}

/**
 * The bands a horizon folds into, declared or defaulted (§3z).
 *
 * **Three, and the default was `definition.ts`'s** — a literal in the terminal's
 * dispatch, which is the shape F322 is about: both arms need it and one held it.
 */
export const HORIZON_BANDS_DEFAULT = 3;

export function horizonBandCount(block: Pick<Plot, "bands">): number {
  return Math.max(1, Math.floor(block.bands ?? HORIZON_BANDS_DEFAULT));
}

/**
 * A horizon's figure — one rect per sample, **height and colour both** (I52,
 * I71, §3z, §3ak.29).
 *
 * **Its own family, and the record predicted `"bar"`.** *A folded band is a
 * `rect` with a `value`* is right about the mark and wrong about the emitter:
 * `barFigure` reads `categoricalDecisions`, insets each rect into a categorical
 * slot and anchors it on a niced value axis, none of which a horizon has. The
 * family names which emitter, which is the same correction `contour` and
 * `quiver` needed one form along.
 *
 * **The columns are the terminal's mapping, in fractions.** `horizonGrid` maps
 * column `c` of `w` to sample `round((c / (w − 1)) · (count − 1))` — endpoint to
 * endpoint — so sample `i` owns a band of width `1 / (count − 1)` centred on
 * `i / (count − 1)`, clipped at the two ends. Reproduced rather than tidied: a
 * cell convention here would put the two arms half a sample apart.
 *
 * **`value: null`, and the frame is why.** A horizon draws no gutter at all; its
 * readings are on its key — `0.0038  100  3 bands` — exactly where a field's and
 * a matrix's are (F327).
 */
export function horizonFigure(block: Plot): Figure {
  const series = block.series[0];
  const extent = seriesRange(block.series, block);
  const bands = horizonBandCount(block);
  const marks: Drawn[] = [];
  if (series !== undefined && extent !== null) {
    const folded = horizonBands(series, extent, bands);
    const count = folded.length; // cells-ok — a sample count
    const step = count > 1 ? 1 / (count - 1) : 1; // cells-ok — a sample count
    // **A diverging map is the signed case and the gates already decide it**
    // (§3z H3). Read off the ramp's own name rather than re-derived, so the two
    // arms cannot disagree about which half of the map a trough is on.
    const name = rampOf(block);
    const diverging = name !== null && COLORMAPS[name]?.kind === "diverging";
    folded.forEach((cell, i) => {
      if (cell === null) return;
      const x = count > 1 ? Math.max(0, i * step - step / 2) : 0; // cells-ok — a sample index
      const right = count > 1 ? Math.min(1, i * step + step / 2) : 1; // cells-ok — a sample index
      marks.push({
        mark: {
          kind: "rect",
          x,
          y: 0,
          w: right - x,
          h: cell.within,
          fill: true,
          value: horizonBandT(cell, bands, diverging),
        },
        layer: "series",
        seriesIndex: 0,
      });
    });
  }
  return {
    value: null,
    extent,
    identity: [],
    isotropic: false,
    orientation: ORIENTATION_UNUSED,
    facing: facingOf(block, FACING_DEFAULT),
    frame: "none",
    gutter: false,
    positionAxis: positionAxisOf(block),
    valueLabels: null,
    legend: legendOf(block),
    ramp: rampOf(block),
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
    isotropic: false,
    ramp: rampOf(block),
    orientation: ORIENTATION_UNUSED,
    facing: facingOf(block, FACING_MATRIX),
    // **This family draws no border, whatever `plotFrame` says** (C12 I67,
    // §3ak.19, F296). A matrix's cells bound themselves, a tiles figure's
    // rectangles do, and a tree's edges do. `height.ts` spends the matrix's
    // two furniture rows on the **ramp legend** rather than an axis rule for
    // exactly this reason, and its comment says so.
    //
    // **Found by the record widening rather than by a frame** — giving the
    // second arm `frame` turned `heatmap.interiorRules` from `agree` to
    // `8/8`, a disagreement that OPENED, because `frameOf` answers a style
    // and this is a family fact. It is the same three families `value: null`
    // names, and it is decided here for the same reason.
    frame: "none",
    gutter: gutterOf(block),
    positionAxis: positionAxisOf(block),
    valueLabels: valueLabelsOf(block),
    legend: legendOf(block),
    marks,
  };
}

/**
 * **The palette slot a categorical row takes** (C12 I38, §3ak.34, F331).
 *
 * `categoricalForm` computes exactly this — `ROW_IS_AN_IDENTITY[form] ? i : 0`,
 * where `i` is the **row**, and for every form but the timeline a row is a
 * category. Every figure emitter passed the **series** index instead, so a bar
 * chart of five categories drew five colours in one arm and one in the other,
 * and a waterfall and a gantt did the same.
 *
 * **`Drawn.seriesIndex` is where the conflation lives.** Its doc says *the
 * categorical slot, unresolved — `refOf`'s index, not a colour*, and its **name**
 * says series; every emitter read the name. MG24's collision class inside the
 * member built to carry a slot.
 *
 * **`per > 1` is the grouped bar**, whose row genuinely is a *(category,
 * series)* pair — `categoricalForm`'s own escape, and the reason this takes both
 * indices rather than replacing one with the other.
 */
export function rowSlot(form: PlotForm, category: number, seriesIndex: number, per: number): number {
  return per > 1 ? seriesIndex : ROW_IS_AN_IDENTITY[form] ? category : 0; // cells-ok — a series count
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
      // **A floor belongs to a length and not to a position** (§3ak.34, §3ak.35).
      // *A bar's length is its value, so signed data grows both ways from zero*
      // (F272) — and a task is an **interval** and an event is an **instant**,
      // neither of which is measured from anywhere. A project starting on day
      // three starts on day three, and `timelineRow` rasterises against the raw
      // `seriesRange`, so zero-anchoring here would put the figure's extent at
      // `0 … 41` against a terminal drawing on `2 … 41`.
      //
      // **Two forms and one reason, stated rather than tabulated.** A third is
      // the moment to ask for a record; two is the moment to write the rule down
      // — a 46-entry table agreeing with `baselineOf` in 44 places is a second
      // answer waiting to disagree with the first.
      : block.form === "gantt" || block.form === "timeline"
        ? data
        : { min: baselineOf(data.min), max: data.max };
  return {
    value: axisOver(extent, block),
    extent,
    identity: block.categories ?? [],
    isotropic: false,
    ramp: rampOf(block),
    orientation: orientationOf(block),
    facing: facingOf(block, FACING_DEFAULT),
    frame: frameOf(block),
    gutter: gutterOf(block),
    positionAxis: positionAxisOf(block),
    valueLabels: valueLabelsOf(block),
    legend: legendOf(block),
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
/**
 * Which arrangement a bar family block's marks take, resolved (I75, §3ak.39).
 *
 * **`overlap` with more than one series means grouped** (I42, §3v) — two runs
 * superimposed in one row of cells is one run, so the name describes a picture
 * the vocabulary has not got. The terminal's dispatch rules it that way and
 * `drawnBlock` writes it into the derived histogram; this is the same sentence
 * where the second arm can read it, which is the whole of why `layout` was
 * dropped: it was read at one site in one renderer and nowhere else.
 */
function barLayoutOf(block: Pick<Plot, "layout">): "grouped" | "stacked" | "normalised" {
  const layout = block.layout ?? "overlap";
  return layout === "stacked" || layout === "normalised" ? layout : "grouped";
}

/**
 * A stacked or normalised bar — **`stackBands`' fourth consumer** (I73, I75,
 * §3ak.39).
 *
 * `bar/stacked` and `bar/normalised` drew byte-identical documents, and the
 * terminal draws three distinct figures. **A stacked bar is not a normalised
 * bar**, and a reader given one for the other is misinformed rather than shown
 * a different idiom (F342).
 *
 * **No `Figure` member, because `layout` selects which marks exist.** It
 * changes nothing about how a rect is inked, so it crosses as the marks —
 * available only because they are in the figure's own normalised space, and a
 * member would have been needed had the arms been handed rectangles in cells
 * and pixels.
 *
 * **Padded to the category count before the fold.** `stackBands` resamples
 * across the column count it is given, which is what lets `stackedarea` call it
 * at a cell width; here the columns *are* the categories, so padding each
 * series to `n` first makes the resampler the identity and turns a missing
 * index into the fold's own null rather than a stretch. That is exactly the
 * terminal's `values[i] ?? 0`, reached by construction rather than by copying
 * the expression.
 *
 * **A category's total is the last band's upper bound**, so `normalised` needs
 * no second walk: the same bands over `bands[n - 1].upper[i]`, on `0 … 1`.
 *
 * **The axis is the totals'** (I73). `bar/stacked` tops out at `25 + 12 = 37`
 * against an axis `seriesRange` labels to 30, so a correctly stacked bar drawn
 * on the old range runs past the end of its own scale. Pinned through the block
 * on `stackedFigure`'s precedent, so an author's own bounds still win — and the
 * terminal's unniced `w / totalMax` stays where it is, which is F272b's third
 * range and `barFigure`'s own header already records why it is invisible rather
 * than absent.
 */
function stackedBarFigure(block: Plot, normalised: boolean): Figure {
  const cats = (block.categories ?? []).length; // cells-ok — a category count
  const n = Math.max(1, cats === 0 ? block.series[0]?.values.length ?? 0 : cats); // cells-ok — a category count
  const padded: readonly Series[] = block.series.map((sr) => ({
    ...sr,
    values: Array.from({ length: n }, (_v, i) => sr.values[i] ?? null), // cells-ok — a category index
  }));
  const bands = stackBands(padded, n, false); // cells-ok — a category count
  const top = bands[bands.length - 1]; // cells-ok — a band count
  const span = normalised ? { min: 0, max: 1 } : stackRange(bands);
  const decisions = categoricalDecisions(block);
  // **The extent is replaced and the block is not pinned**, which is the one
  // place this departs from `stackedFigure`. Pinning through `yMin`/`yMax` is
  // how that function gets `stackRange` into `positionalDecisions` at all, and
  // it has a second effect: `axisFor` declines to nice a bound the author
  // pinned, so the axis came back `0 20 37` — the totals' exact maximum as a
  // tick. Read on the frame, the family's other three read `0 20 40` and
  // `0 10 20 30`, and `barFigure`'s own header says the mark takes the **niced**
  // range because that is the only one with a labelled axis behind it (F210,
  // F272b). Handing the extent to `axisOver` keeps the nicing and keeps the
  // author's pin, because `axisFor` still reads `block`.
  const extent = normalised ? span : { min: baselineOf(span.min), max: span.max };
  const value = decisions.extent === null ? null : axisOver(extent, block);
  const marks: Drawn[] = [];
  if (value !== null) {
    bands.forEach((band, seriesIndex) => {
      for (let i = 0; i < n; i += 1) { // cells-ok — a category index
        // **The share is per category and the fold is not**, so a normalised
        // block divides by its own column's total rather than by the range.
        const total = top?.upper[i] ?? 0;
        if (normalised && total <= 0) continue;
        const by = normalised ? 1 / total : 1;
        const lo = normalisedOf((band.lower[i] ?? 0) * by, value.range, false);
        const hi = normalisedOf((band.upper[i] ?? 0) * by, value.range, false);
        // A layer contributing nothing draws nothing, which is `repeat(0)` in
        // the other arm: the remainder of a stack is the part nothing accounts
        // for and shading it would make it look like a layer.
        if (hi <= lo) continue;
        // **Colour indexes the series** (I38), which is `owners` in the terminal
        // — the whole row used to carry one ref keyed on the *category*, so a
        // four-quarter stack of two series drew four colours naming the quarters
        // under a legend naming `direct` and `referral`.
        marks.push({
          mark: { kind: "rect", x: i / n, y: lo, w: 1 / n, h: hi - lo, fill: true },
          layer: "series",
          seriesIndex,
        });
      }
    });
    marks.push(...annotationMarks(block, value.range, false));
  }
  return { ...decisions, ...(decisions.extent === null ? {} : { extent, value }), marks };
}

export function barFigure(block: Plot): Figure {
  // **Three layouts, three figures** (F342, §3ak.39). This arm drew grouped for
  // all four values of the field, so `bar-stacked.svg` and `bar-normalised.svg`
  // were byte-identical — the strongest agreement the disagreement record can
  // report, and here it means the field reached one arm.
  const arrangement = barLayoutOf(block);
  if (arrangement !== "grouped") return stackedBarFigure(block, arrangement === "normalised");
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
        const slotIndex = rowSlot(block.form, i, seriesIndex, per); // cells-ok — a category index
        if (stem) {
          marks.push({
            mark: lag
              ? { kind: "rect", x, y: Math.min(zero, top), w, h: Math.abs(top - zero), fill: true }
              : { kind: "rect", x, y: 0, w, h: top, fill: true },
            layer: "series",
            seriesIndex: slotIndex,
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
            seriesIndex: slotIndex,
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

// --- the aggregating forms (I70, I71, §3ak.33) ------------------------------
//
// **One fold, three consumers**, which is F314's rule at the family the plan
// named for it. A cumulative coordinate is not a function of a sample's own
// value — `SVG_FAMILY` filed these three under exactly that — and it *is* a
// function of the block, which is the property `drawnBlock` requires and the one
// the entry did not distinguish from it.

/**
 * A stacked area or a stream, as filled bands (I70, I71, §3ak.33).
 *
 * **`stackBands` at the data's own resolution**, which is I71's rule and needs
 * no second implementation: the function takes a column count, and passing the
 * longest series' length makes its resampler the identity. The terminal passes
 * `areaWidth` and gets the same fold at the resolution it draws — one function,
 * two resolutions, and the order of *resample* and *sum* is therefore the same
 * on both sides rather than agreeing by luck.
 *
 * **The axis is the fold's and not the series'.** `seriesRange` over the inputs
 * answers *how big is one band*, and what the gutter must cover is *how big are
 * they stacked* — which is `stackRange`, and which is why this cannot reuse
 * `positionalDecisions` unmodified. Pinned through the block so the caller's own
 * `yMin`/`yMax` still win, on the precedent every other family sets.
 *
 * **Filled, and that is the whole of why `Mark.polyline` grew a `fill`.** A band
 * is a quantity and the eye reads its thickness; an outline leaves the reader
 * integrating two curves, which is `stack.ts`' argument for the glyph it uses.
 */
export function stackedFigure(block: Plot, centred: boolean): Figure {
  const cols = block.series.reduce((m, r) => Math.max(m, r.values.length), 0); // cells-ok — a sample count
  const bands = cols === 0 ? [] : stackBands(block.series, cols, centred); // cells-ok — a sample count
  const span = stackRange(bands);
  const pinned: Plot = { ...block, yMin: block.yMin ?? span.min, yMax: block.yMax ?? span.max };
  const decisions = positionalDecisions(pinned);
  const { value } = decisions;
  const marks: Drawn[] = [];
  if (value !== null && cols > 1) { // cells-ok — a sample count
    const x = (i: number): number => i / (cols - 1); // cells-ok — a sample count
    bands.forEach((band, seriesIndex) => {
      const lower: Pt[] = band.lower.map((v, i) => [x(i), normalisedOf(v, value.range, false)]);
      const upper: Pt[] = band.upper.map((v, i) => [x(i), normalisedOf(v, value.range, false)]);
      // **Along the lower edge and back along the upper**, so the ring closes on
      // itself and a band with a hole in it is impossible by construction.
      marks.push({
        mark: { kind: "polyline", points: [...lower, ...upper.reverse()], closed: true, fill: true },
        layer: "series",
        seriesIndex,
      });
    });
  }
  return { ...decisions, marks };
}

/**
 * A waterfall's running baseline (I70, §3ak.33).
 *
 * **The cumulative coordinate is a function of the block and of nothing else**,
 * which is the property that separates this from `violinColumn`'s estimate: no
 * row count, no column count, no capability. `definition.ts` walked the series
 * twice for it — once for the bounds and once for the bars — inside a renderer,
 * and the second arm had neither walk.
 *
 * **`totals` restarts rather than adds**, which is the form's whole point: a
 * total bar is drawn from zero to the running sum, and treating it as another
 * step would draw the sum twice and end at double.
 *
 * **The axis is the cumulative range**, `min(0, …)` to `max(0, …)` over the
 * running values — not `seriesRange` over the steps, which answers *how big is
 * one change* where the gutter must cover *where the running total went*.
 */
export function spanFigure(block: Plot): Figure {
  const series = block.series[0];
  // **The fold is called rather than walked** (F329, §3ak.34). This function held
  // its own copy, and the copy followed the terminal's *bounds* walk where the
  // terminal *draws* from another — so a null total reset the running sum here
  // and held it there, and no fixture has a null.
  const values = series?.values ?? [];
  // **Two arithmetics, one mark** (§3ak.34). A waterfall's span runs from the
  // running total to the next; a gantt's from a start to a start plus a
  // duration. What they share is the mark and everything around it, which is
  // what makes them a family rather than two forms that resemble each other.
  const { bars, min: lo, max: hi } = block.form === "gantt"
    ? ganttBars(values, block.offsets ?? [])
    : waterfallBars(values, block.totals ?? []);
  // **Non-finite where there is nothing to bound**, which only `ganttBars` can
  // return: a waterfall's fold starts at zero and a gantt's starts at the first
  // task. The terminal answers the same case with `emptyRows`.
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    return { ...categoricalDecisions(block), marks: [] };
  }
  const pinned: Plot = { ...block, yMin: block.yMin ?? lo, yMax: block.yMax ?? hi };
  const decisions = categoricalDecisions(pinned);
  const { value } = decisions;
  const marks: Drawn[] = [];
  if (value !== null) {
    const n = Math.max(1, decisions.identity.length || bars.length); // cells-ok — a category count
    bars.forEach((bar, i) => {
      if (!bar.drawn || i >= n) return; // cells-ok — a category index
      const a = normalisedOf(bar.from, value.range, false);
      const b = normalisedOf(bar.to, value.range, false);
      marks.push({
        mark: { kind: "rect", x: i / n, y: Math.min(a, b), w: 1 / n, h: Math.abs(b - a), fill: true }, // cells-ok — a category count
        layer: "series",
        seriesIndex: rowSlot(block.form, i, 0, 1), // cells-ok — a category index
      });
    });
  }
  return { ...decisions, marks };
}

/**
 * A funnel — **a centred bar whose width is a share** (C04 §8, §3ak.34).
 *
 * **`value: null`, and it is I73's second case.** The bar runs from
 * `(1 − share) / 2` to `(1 + share) / 2`, so neither of its ends is the reading
 * and an axis under it would label positions nothing is drawn at. The reading is
 * `v / max` — a **share**, which is the proportion family's own reason for
 * having no value axis, arriving on a form that is drawn as a rectangle rather
 * than as an angle.
 *
 * **The extent is kept.** The data does have a range and `seriesRange` is what
 * the terminal measures `max` with; what it has not got is an axis to put it on.
 *
 * **The terminal's one-cell floor stays in the terminal.** `funnelRow` takes
 * `max(1, round(share · w))`, so a stage far below the first still draws — I8's
 * rule that a band thinner than a cell must not vanish, and a cell is a thing
 * only a grid has.
 */
export function funnelFigure(block: Plot): Figure {
  const decisions = categoricalDecisions(block);
  const values = block.series[0]?.values ?? [];
  const max = decisions.extent?.max ?? 0;
  const n = Math.max(1, decisions.identity.length || values.length); // cells-ok — a category count
  const marks: Drawn[] = [];
  if (max > 0) {
    values.forEach((v, i) => {
      if (v === null || !Number.isFinite(v) || i >= n) return; // cells-ok — a category index
      const share = Math.max(0, Math.min(1, v / max));
      marks.push({
        mark: { kind: "rect", x: i / n, y: (1 - share) / 2, w: 1 / n, h: share, fill: true }, // cells-ok — a category count
        layer: "series",
        seriesIndex: rowSlot(block.form, i, 0, 1), // cells-ok — a category index
      });
    });
  }
  return { ...decisions, value: null, marks };
}

/**
 * A timeline — **event marks on a shared axis, one row per track** (C04 §8,
 * §3ak.35).
 *
 * **The one form whose rows are series** (I38, §3t). Every other categorical form
 * draws one row per category and takes the palette slot the category owns; a
 * track *is* a series, so `refFor` in the terminal indexes it and `rowSlot`
 * reaches the same answer from the other side.
 *
 * **The extent is the raw range and not the zeroed one**, which is
 * `categoricalDecisions`' second form branch: `timelineRow` scales against
 * `seriesRange`'s own `min … max`, so a zero anchor would put the figure at
 * `0 … 41` and the terminal at `2 … 41` — F210's rule, where the axis the marks
 * are placed on must be the axis the labels come from.
 *
 * **The track's rule spans the whole row**, because a timeline's row is a *span
 * of time* and the events sit on it; a rule that stopped at the first and last
 * event would say the track began and ended with them.
 */
export function trackFigure(block: Plot): Figure {
  const identity = block.categories
    ?? block.series.map((sr, i) => sr.label ?? `track ${String(i + 1)}`); // cells-ok — a track index
  // **Pinned to its own range, which is F210's rule and the reason the branch
  // above exists.** Unpinned, the marks land on the raw `2 … 41` the terminal
  // rasterises against while `axisOver` nices the labels to `0 … 50` — so the
  // earliest event sits on a tick reading `0`. The axis the marks are placed on
  // must be the axis the labels come from, and the only arrangement where two of
  // them cannot drift apart is one of them.
  const range = seriesRange(block.series, block);
  const lo = block.yMin ?? range?.min;
  const hi = block.yMax ?? range?.max;
  const pinned: Plot = {
    ...block,
    categories: identity,
    ...(lo === undefined ? {} : { yMin: lo }),
    ...(hi === undefined ? {} : { yMax: hi }),
  };
  const decisions = categoricalDecisions(pinned);
  const { extent } = decisions;
  const n = Math.max(1, identity.length); // cells-ok — a track count
  const marks: Drawn[] = [];
  if (extent !== null) {
    block.series.forEach((series, track) => {
      if (track >= n) return; // cells-ok — a track index
      const centre = (track + 0.5) / n; // cells-ok — a track count
      const slot = rowSlot(block.form, track, track, 1); // cells-ok — a track index
      marks.push({
        mark: { kind: "polyline", points: [[centre, 0], [centre, 1]] },
        layer: "series",
        seriesIndex: slot,
      });
      for (const v of series.values) {
        if (v === null || !Number.isFinite(v)) continue;
        marks.push({
          mark: { kind: "point", x: centre, y: normalisedOf(v, extent, false), role: "point" },
          layer: "series",
          seriesIndex: slot,
        });
      }
    });
  }
  return { ...decisions, marks };
}

/**
 * A bullet graph — **a measure against a target, on qualitative bands** (C04 §8,
 * §3ak.35).
 *
 * **`value: null`, and it is I73's first case rather than an omission.** Three
 * rows carry three quartile summaries in three units — `0 … 100`, `0 … 60`,
 * `0 … 40` — so there is no one range for a `Figure`'s one `value` to be. §3q's
 * *one axis across the bands* is scoped by purpose in its own words, and putting
 * a revenue in pounds beside a churn in percent is what this form exists not to
 * do. The renderer that draws it has said so all along: *the bands say what good
 * is, so a reader needs no legend and no second glance at a dial.*
 *
 * **The band's ordinal crosses and the ink is the arm's** (I71, commitment 68).
 * Measured off the painted frame, the whole row is one colour — `rgb(230,159,0)`
 * for bands, measure and target alike — and only the glyph varies. So each band
 * carries `(k + 1) / edges.length` as its reading and each arm spends it at its
 * own depth: a four-step density ladder there, an opacity here.
 *
 * **The measure covers the bands it reaches, because that is what the terminal
 * draws.** Few's design insets a thinner bar so the bands show behind it, and a
 * terminal row is one cell tall and cannot; drawing the inset here would be
 * geometry one arm invented, which is the thing this pass exists to stop.
 */
export function bulletFigure(block: Plot): Figure {
  const qs = block.quartiles ?? [];
  const identity = block.categories ?? qs.map((_q, i) => `measure ${String(i + 1)}`); // cells-ok — a measure index
  const decisions = categoricalDecisions({ ...block, categories: identity });
  const n = Math.max(1, identity.length); // cells-ok — a measure count
  const marks: Drawn[] = [];
  qs.forEach((q, i) => {
    if (i >= n) return; // cells-ok — a measure index
    const own = { min: q.min, max: q.max };
    const at = (v: number): number => normalisedOf(v, own, false);
    const x = i / n; // cells-ok — a measure count
    const w = 1 / n; // cells-ok — a measure count
    const slot = rowSlot(block.form, i, 0, 1); // cells-ok — a measure index
    // The bands first, lightest to darkest, each running from the previous edge.
    const edges = [q.q1, q.median, q.q3, q.max];
    let from = 0;
    edges.forEach((edge, k) => {
      const to = at(edge);
      marks.push({
        mark: { kind: "rect", x, y: from, w, h: Math.max(0, to - from), fill: true, value: (k + 1) / edges.length }, // cells-ok — a band count
        layer: "series",
        seriesIndex: slot,
      });
      from = to;
    });
    const measure = block.series[0]?.values[i]; // cells-ok — a measure index
    if (measure !== null && measure !== undefined && Number.isFinite(measure)) {
      marks.push({
        mark: { kind: "rect", x, y: 0, w, h: at(measure), fill: true },
        layer: "series",
        seriesIndex: slot,
      });
    }
    // **The target last, over everything: it is the question the row answers.**
    if (q.centre !== undefined && Number.isFinite(q.centre)) {
      const t = at(q.centre);
      marks.push({
        mark: { kind: "polyline", points: [[x, t], [x + w, t]] },
        layer: "series",
        seriesIndex: slot,
      });
    }
  });
  return { ...decisions, value: null, marks };
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
/**
 * A candle's two marks — **a body across its slot and a wick through it**
 * (§3r, §6b B15, F259).
 *
 * **The refusal this removes was right and narrow.** `plotToSvg` returned `null`
 * for any block carrying `ohlc` because *nothing here reads it*: the curve arm
 * found `series: []`, which is legal precisely because plain candles are the
 * ordinary case, and drew a fully furnished plot with an axis running 0 to 1
 * against a terminal drawing 8 to 16. That is F259's subject exactly — a figure
 * that **cannot be drawn** from what the path reads — and the remedy is to read
 * it, which is what this does. `positionalDecisions` already ranges over
 * `candlesOf(block)` and `legendSlots` already earns the `rising`/`falling`
 * pair; the marks were the whole of the gap.
 *
 * **The body is a bar and takes the bar's device.** A rect with no `depth`, no
 * `value` and `layer: "series"` is inset by `SLOT_SHARE` at each arm's own
 * resolution — which is `candleWidth`'s `per − 1` in cells and a fraction of a
 * slot in pixels, and it is the same argument `boxplotColumn` makes at three
 * fifths: two rising candles that touch draw one six-cell body and not two
 * three-cell ones.
 *
 * **The wick is a polyline and is not inset**, so it runs through the body's
 * centre at any width. A doji — `open === close` — is a body of no height, which
 * each arm floors at its own smallest unit: `─` in a cell, half a pixel here.
 */
function candleMarks(bars: readonly OHLC[], range: Range): readonly Drawn[] {
  const n = Math.max(1, bars.length); // cells-ok — a candle count
  const out: Drawn[] = [];
  bars.forEach((bar, i) => {
    const { open, high, low, close } = bar;
    if (![open, high, low, close].every((v) => Number.isFinite(v))) return;
    // **The slot's own colour, named rather than resolved** (I62) — and the two
    // refs are the legend's, so a swatch and its candles cannot drift.
    const ref: ColourRef = close >= open ? "tone.ok" : "tone.error";
    const lo = normalisedOf(Math.min(open, close), range, false);
    const hi = normalisedOf(Math.max(open, close), range, false);
    const x = i / n; // cells-ok — a candle count
    out.push({
      mark: { kind: "polyline", points: [
        [x + 0.5 / n, normalisedOf(low, range, false)], // cells-ok — a candle count
        [x + 0.5 / n, normalisedOf(high, range, false)], // cells-ok — a candle count
      ] },
      layer: "series",
      ref,
    });
    out.push({
      mark: { kind: "rect", x, y: lo, w: 1 / n, h: hi - lo, fill: true }, // cells-ok — a candle count
      layer: "series",
      ref,
    });
  });
  return out;
}

export function curveFigure(block: Plot): Figure {
  const decisions = positionalDecisions(block);
  const { value } = decisions;
  const marks: Drawn[] = [];
  if (value !== null) {
    // **The candles first, so an overlay draws over them** — which is what the
    // terminal does and what the legend's order says: the average is a claim
    // *about* the candles (§6b B1, B4).
    const bars = candlesOf(block);
    if (bars !== undefined) marks.push(...candleMarks(bars, value.range));
    block.series.forEach((series, seriesIndex) => {
      for (const points of runsOf(series.values, value.range)) {
        marks.push({ mark: { kind: "polyline", points }, layer: "series", seriesIndex });
      }
    });
    marks.push(...annotationMarks(block, value.range));
  }
  return { ...decisions, marks };
}

// --- the proportion family (§3ak.26) ----------------------------------------

/** Twelve o'clock, clockwise — the figure's angle convention, said once. */
const TURN = Math.PI * 2;

/**
 * A point on the figure's unit circle: `turn` turns from twelve o'clock,
 * clockwise, `t` of the way out from the centre.
 *
 * **Uninverted, like every other coordinate here** (I61) — twelve o'clock is
 * `y = 1` and the projector is what decides which page edge that is. The
 * terminal's `at(d, angle, t)` is the same expression in dot space with the
 * screen's downward `y`, which is why the two agree without either converting.
 */
function polar(turn: number, t: number): Pt {
  const a = turn * TURN - Math.PI / 2;
  return [0.5 + 0.5 * t * Math.cos(a), 0.5 - 0.5 * t * Math.sin(a)];
}



/**
 * A segment's share of the whole — **before any renderer's minimum** (F305).
 *
 * This is `slicesOf`'s first half. Its second half merges everything below one
 * dot of arc into an `other` slice, and that threshold is `1 / 2πr` with `r` in
 * **dots**: a resolution limit, so it stays in the arm that has a resolution.
 * The shares crossing unmerged is what lets the second arm draw the slices the
 * terminal cannot, and it is why `identity` names every segment rather than the
 * ones one arm kept.
 */
export type Share = Readonly<{ label: string; fraction: number; index: number }>;

export function sharesOf(segments: readonly Segment[]): readonly Share[] {
  const total = segments.reduce((a, sg) => a + Math.max(0, sg.value), 0);
  if (!(total > 0)) return [];
  return segments.map((sg, i) => ({
    label: sg.label,
    fraction: Math.max(0, sg.value) / total,
    index: i, // cells-ok — a segment index
  }));
}

/** The percentage a share reads as. One derivation, three call sites. */
export function percentOf(fraction: number): string {
  return `${String(Math.round(fraction * 100))}%`;
}

/**
 * The mosaic's rows — **ten, so one square is one per cent** (C12 §3g).
 *
 * Here rather than in `waffle.ts` because the grid's shape is a property of the
 * figure and not of the renderer: an SVG waffle is ten by ten as well, and the
 * *columns* are where the arms differ — twenty of them in the terminal, because
 * `squareColumns` compensates for a cell being twice as tall as it is wide.
 */
export const WAFFLE_ROWS = 10;
const WAFFLE_SQUARES = WAFFLE_ROWS * WAFFLE_ROWS;

/**
 * Which segment owns each of the hundred squares, row-major — or `-1`.
 *
 * **The rounding is shared and it does not always sum**, which the catalogue
 * cannot say: its one fixture is `65/25/10`, summing to exactly a hundred, so
 * `scale` is 1 and `Math.round` is the identity function. `1/1/1` rounds to
 * 33/33/33 and leaves a square empty; `50/50/1` asks for 101 and the guard drops
 * the last one — **a segment holding a share of the whole and receiving no
 * square at all** (F305).
 */
export function waffleGrid(segments: readonly Segment[]): readonly number[] {
  const sum = segments.reduce((a, sg) => a + sg.value, 0);
  const scale = sum > 0 ? WAFFLE_SQUARES / sum : 0;
  const grid = new Array<number>(WAFFLE_SQUARES).fill(-1);
  let pos = 0;
  segments.forEach((sg, idx) => {
    const count = Math.round(sg.value * scale);
    for (let i = 0; i < count && pos < WAFFLE_SQUARES; i += 1) grid[pos++] = idx; // cells-ok — a square index
  });
  return grid;
}


/** The rings a radar draws inside its outer one — matplotlib's 20/40/60/80. */
const RADAR_RINGS: readonly number[] = Object.freeze([0.2, 0.4, 0.6, 0.8]);

/** The ceiling a radar is read against — a round one, so the rings are round. */
function radarRange(block: Pick<Plot, "series">): Range {
  const all = block.series.flatMap((sr) =>
    sr.values.filter((v): v is number => v !== null && Number.isFinite(v)),
  );
  const top = Math.max(...all, 0);
  return { min: 0, max: top > 0 ? top : 1 };
}

/**
 * Everything the proportion family decides, **and `marks` is not all of it**
 * (§3ak.26).
 *
 * `Omit<Figure, "marks">` for `nodesDecisions`' reason one family along: the
 * terminal reads these back and keeps its own rasterisation, because a pie is
 * filled dot by dot inside an angular range and a radar's polygon is strung
 * through a braille grid. **What crosses is the decision** — which segments,
 * what each one's share is, what the radar is read against, and what the legend
 * names — and every one of those was computed inside a renderer before this.
 */
export function proportionDecisions(block: Plot): Omit<Figure, "marks"> {
  const radar = block.form === "radar";
  const shares = sharesOf(block.segments ?? []);
  const base = legendOf(block);
  return {
    // **A radar's readings are on a scale and the record now says so** (F304).
    // `valueAxisOf` is `radarCeiling` with the pin threaded, which is the half
    // the old expression could not have: it passed `{}`, so `yMin`, `yMax` and
    // `yFormat` were read by nothing on this form alone.
    value: radar ? valueAxisOf(radarRange(block), 6, block) : null,
    extent: radar ? radarRange(block) : null,
    // **Two name lists, and the precedent already chose.** A radar's legend
    // names its *series* and the labels around its ring name its *categories*;
    // `categoricalDecisions` sets exactly this pair, and the curve family's rows
    // assert the two differ. `identity` is the figure's own names.
    identity: radar ? block.categories ?? [] : identityOf(block),
    orientation: ORIENTATION_UNUSED,
    // **`FACING_DEFAULT` and not `facingOf`**, which is a decision rather than
    // an omission. `origin` mirrors a cartesian figure; the terminal's three
    // proportion renderers do not read it, so honouring it in one arm would be
    // a new disagreement introduced by a refactor — the one thing this pass
    // forbids.
    facing: FACING_DEFAULT,
    // The terminal composes all three of these into a bare area: `layout` is
    // `{ gutter: 0, labelColumn: 0 }` and no border is drawn at any width.
    frame: "none",
    gutter: false,
    positionAxis: false,
    valueLabels: null,
    legend:
      base === null || radar
        ? base
        : {
            ...base,
            slots: base.slots.map((sl) => {
              const share = sl.seriesIndex === undefined ? undefined : shares[sl.seriesIndex];
              return share === undefined ? sl : { ...sl, value: percentOf(share.fraction) };
            }),
          },
    isotropic: true,
    ramp: rampOf(block),
  };
}

/**
 * The proportion family's marks (§3ak.26).
 *
 * **Three geometries and one of them needed a mark kind.** A pie is `arc`s
 * round a circle; a waffle is a hundred `rect`s in a ten-by-ten grid; a radar is
 * closed `polyline`s over rings and spokes, with its category names as `text`.
 *
 * **The rings are all emitted and the terminal drops the small ones.** A ring of
 * three dots' radius is five stippled dots and reads as dirt, so `MIN_RING_DOTS`
 * takes it out — a dot-grid resolution limit, which is the third of the family's
 * three compensations and stays in the arm that has a grid.
 */
export function proportionFigure(block: Plot): Figure {
  const decisions = proportionDecisions(block);
  const marks: Drawn[] = [];

  if (block.form === "pie") {
    let from = 0;
    for (const sh of sharesOf(block.segments ?? [])) {
      const to = from + sh.fraction;
      marks.push({ mark: { kind: "arc", from, to, radius: 1, fill: true }, layer: "series", seriesIndex: sh.index });
      from = to;
    }
    return { ...decisions, marks };
  }

  if (block.form === "waffle") {
    const grid = waffleGrid(block.segments ?? []);
    const side = 1 / WAFFLE_ROWS;
    grid.forEach((owner, i) => {
      const row = Math.floor(i / WAFFLE_ROWS); // cells-ok — a square index
      const col = i % WAFFLE_ROWS; // cells-ok — a square index
      // **`depth: 0` — a strip that tiles and encloses nothing** (F280). The
      // squares abut, so they want the one-unit separating inset a flame's
      // bands take; they are not a measurement, so the slot share a bar gets
      // across its identity axis would be wrong on both counts.
      const mark: Mark = { kind: "rect", x: col * side, y: 1 - (row + 1) * side, w: side, h: side, fill: true, depth: 0 };
      marks.push(
        owner >= 0
          ? { mark, layer: "series", seriesIndex: owner }
          : { mark, layer: "furniture", ref: "surface.border" },
      );
    });
    return { ...decisions, marks };
  }

  const cats = decisions.identity;
  const n = cats.length; // cells-ok — a category count
  const ceiling = decisions.value?.range.max ?? 1;
  if (n === 0 || block.series.length === 0) return { ...decisions, marks }; // cells-ok — a series count

  // **Below three axes the polygon ring is not available**, and the reason is
  // the shape rather than the renderer: two vertices are a line and one is a
  // point. `plotGrid` chooses between them above that.
  const round = (block.plotGrid ?? "polygon") === "circle" || n < 3; // cells-ok — a category count
  for (const t of [1, ...RADAR_RINGS]) {
    marks.push({
      mark: round
        ? { kind: "arc", from: 0, to: 1, radius: t, fill: false }
        : { kind: "polyline", points: cats.map((_, i) => polar(i / n, t)), closed: true },
      layer: "furniture",
      ref: "tone.muted",
    });
  }
  for (let i = 0; i < n; i += 1) {
    marks.push({
      mark: { kind: "polyline", points: [[0.5, 0.5], polar(i / n, 1)] },
      layer: "furniture",
      ref: "tone.muted",
    });
  }
  block.series.forEach((sr, si) => {
    marks.push({
      mark: {
        kind: "polyline",
        points: cats.map((_, i) => {
          const v = sr.values[i];
          const t = v !== null && v !== undefined && Number.isFinite(v) ? Math.max(0, Math.min(1, v / ceiling)) : 0;
          return polar(i / n, t);
        }),
        closed: true,
      },
      layer: "series",
      seriesIndex: si, // cells-ok — a series index
    });
  });
  cats.forEach((label, i) => {
    const [x, y] = polar(i / n, 1);
    // **The anchor follows the angle, which is `labelRows`' own rule** — a word
    // to the right of the figure starts at its spoke, one to the left ends
    // there, and one at the top or the bottom is centred. Anything else puts the
    // name across the ring it names. The thresholds are the terminal's.
    const cos = Math.cos((i / n) * TURN - Math.PI / 2);
    marks.push({
      mark: {
        kind: "text",
        x, y, text: label,
        anchor: cos > 0.25 ? "start" : cos < -0.25 ? "end" : "middle",
        // A third of the figure — `labelRows`' `budget`, in fractions.
        room: 1 / 3,
      },
      layer: "label",
      ref: "tone.muted",
    });
  });
  return { ...decisions, marks };
}
