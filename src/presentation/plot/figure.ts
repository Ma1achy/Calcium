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
import { axisFor, tickLabels, type Axis } from "./axes.js";
import type { Range } from "./scale.js";

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
