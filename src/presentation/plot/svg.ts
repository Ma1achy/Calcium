/**
 * The second renderer — **SVG, and the layout is its own** (C12 §3aj, phase 3).
 *
 * **SVG rather than PNG, and the reason is hazard 4.** A rasterised label needs
 * font metrics to be placed; an SVG label is a `<text>` element that places
 * itself. So the whole of what `cells()` does for the terminal path —
 * ambiguous width, grapheme clustering, the wide arm — has no counterpart here
 * and needs none, and `sharp` turns the result into a PNG for the kitty path
 * with no new dependency: it is already in the ledger for the catalogue's own
 * frames.
 *
 * **But that is a consequence of hazard 3, not a property of SVG**, and the two
 * are listed as independent hazards. An SVG label needs no metrics *because this
 * layout never sizes anything to fit a label* — the gutter is a fraction of the
 * width. The moment a shared layout sized a gutter to its longest label, this
 * path would need metrics to agree with it, and hazard 4 would be back. **Hazard
 * 3 is what makes hazard 4 free**, and violating either violates both.
 *
 * **And the colour is C10's, not this file's** (§3aj hazard 5). `resolve`
 * returns a `Style` and a cell renderer turns it into SGR; this one turns the
 * same `Style` into `fill` and `stroke`. **One resolution, two emitters**, which
 * is the shared coordinate's shape one channel along — and the reason the arms
 * cannot drift is that neither of them chooses.
 *
 * **What this is not: `ansiToSvg`.** `tools/catalogue-png.mjs` already writes
 * SVG, and it writes a *picture of a terminal* — `maxCols · CELL_W`, one glyph
 * per cell, every coordinate a cell coordinate scaled up. It inherits every
 * cell-shaped decision the frame made, which is exactly what this path exists
 * not to be. Two things called SVG in one repository, and only one of them is a
 * second renderer.
 */
import { flatten, type FlatNode } from "./tree.js";
import { drawnBlock } from "./derive.js";
import { graphLayers } from "./graph.js";
import { normalisedOf } from "../../data/viewmodel/range.js";

import { COLORMAPS, continuousColour } from "../theme/colormap.js";
import { resolve } from "../theme/resolve.js";
import type { ColourRef, ResolvedTheme } from "../theme/types.js";
import { ROW_IS_AN_IDENTITY, SHARES_CELLS, refOf } from "./marks.js";
import {
  barFigure,
  curveFigure,
  fieldFigure,
  horizonFigure,
  stackedFigure,
  waterfallFigure,
  distributionFigure,
  matrixFigure,
  nodesDecisions,
  proportionFigure,
  scatterFigure,
  tilesFigure,
  type Drawn,
  GLYPH_SHAPE,
  type Figure,
  type GlyphRole,
  type FigureLegend,
} from "./figure.js";
import { ORIGIN_DEFAULT } from "../../data/viewmodel/index.js";
import type { Plot, PlotForm } from "../../data/viewmodel/index.js";

/**
 * The image path's layout — **its own units, and no cells anywhere** (§3aj
 * hazard 3).
 *
 * *Anything measured in cells stays in cells; the image renderer needs its own.*
 * So this takes pixels and spends them as **fractions**: `gutter` is a share of
 * the width rather than a count of anything. That is what lets a label place
 * itself, and it is the reason `layoutFor` is not reachable from this file.
 *
 * **Fractions rather than pixels for the interior**, so the same layout serves
 * any output size — which the terminal path cannot do, because a cell is not
 * divisible and a gutter of 3.4 columns is not a gutter.
 */
export type SvgLayout = Readonly<{
  /** The viewBox, in px. The only absolute numbers here. */
  width: number;
  height: number;
  /** Shares of the width and height. `0..1`. */
  gutter: number;
  pad: number;
}>;

/**
 * Type size in px — **a constant rather than a member**, because nothing outside
 * this file names it and a member nobody sets is an export nothing consumes.
 * It sizes nothing: the label places itself, so this is the glyph height and
 * never an input to a layout (§3aj hazard 4).
 */
export const SVG_FONT_SIZE = 12;

export const SVG_DEFAULT_LAYOUT: SvgLayout = Object.freeze({
  width: 640,
  height: 320,
  // **A tenth of the width, not the widest label.** Sizing to content is what
  // would drag metrics back in, and it is `layoutFor`'s job precisely because
  // cells cannot overflow gracefully and pixels can.
  gutter: 0.1,
  pad: 0.04,
});

/** A layout at a size. Takes no capabilities, and there is nothing to give it. */
export function svgLayout(width: number, height: number): SvgLayout {
  return { ...SVG_DEFAULT_LAYOUT, width: Math.max(1, width), height: Math.max(1, height) };
}

/** `<` and `&` in a label. The whole of the escaping an SVG `<text>` needs. */
function escape(text: string): string {
  return text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
}

/**
 * Which of the three ingredients a form is made of, **exhaustively over the
 * union** (C12 §3aj.3).
 *
 * *Every other form is the same three ingredients — shared range, shared
 * coordinate, layout in fractions* is true of the forms whose datum is **a value
 * on one axis over an ordered domain**, and false of the ones that carry their
 * own geometry. Calling the second group *application* would be the claim §3h
 * made about the compositions, which measuring falsified.
 *
 * **`satisfies Record<PlotForm, …>` is the mechanism**, not the comment: adding
 * a form to the union fails to compile until someone decides, which is the same
 * enumeration the builders and the validator use. `null` is a decision with a
 * reason, never an omission.
 *
 * **The matrix family is here because the shared coordinate is `value → [0, 1]`
 * and not `value → position`.** What a renderer does with the `[0, 1]` is its
 * own: a curve spends it on a y, a matrix spends it on a colour. That is the
 * overlay's ruling from phase 2 arriving one component along (C04 §3h.2).
 */
export type SvgFamily =
  | "curve" | "scatter" | "bar" | "matrix" | "distribution" | "tiles" | "nodes" | "proportion"
  | "field" | "horizon" | "stacked" | "waterfall";

export const SVG_FAMILY = {
  // **Curve** — samples in order, joined. `step` differs only in the path
  // command, which is rasterisation and not geometry.
  line: "curve", sparkline: "curve", step: "curve", ecdf: "curve",
  density: "curve",
  // **`bar`, and F266's deferral said so before its condition could be
  // checked** (§3ak.14). The stated condition — *once the bar family walks* —
  // was met a commit ago and the real one was not: `lagRow` ranges over
  // `±max(1, |v|)`, grows its bars from a centre zero in either direction, and
  // mirrors every bound to both signs, none of which `barFigure` did. All three
  // are expressible in the marks that exist, so the escape clause held and the
  // work was an arm rather than a table entry.
  autocorrelation: "bar",

  // **Scatter** — the same points, unjoined. `bubble`'s radius is a second
  // encoding this path does not carry yet and its positions are these.
  scatter: "scatter", bubble: "scatter",

  // **Bar** — a rectangle from the range's floor to the sample.
  bar: "bar", histogram: "bar", lollipop: "bar", dotplot: "bar",

  // **Matrix** — series are rows, values are columns, and the coordinate is
  // spent on colour.
  heatmap: "matrix", correlation: "matrix", confusion: "matrix",
  spectrogram: "matrix", density2d: "matrix", latency: "matrix",
  utilisation: "matrix",

  // **Its own geometry, each with a reason.** None of these is a value on one
  // axis over an ordered domain, so none is application.
  //
  // *Cumulative*: the coordinate is a running total, so a sample's position is
  // not a function of its own value.
  // **The cumulative three, and the reason was true of a *sample* and not of the
  // *block*** (§3ak.33). *A sample's position is not a function of its own
  // value* — right, and the fold is a function of the whole series, which is
  // exactly what `drawnBlock` requires. `stackBands` already took a column count,
  // so passing the data's own length makes its resampler the identity and the
  // fold crosses at native resolution with no second implementation (I71).
  waterfall: "waterfall", streamgraph: "stacked", stackedarea: "stacked",
  // **Distribution** — the datum is a set of positions derived from the
  // samples rather than the samples, so the shared piece is the *set*:
  // `normalisedSummary` and `quartileRange`, which the terminal arm reads
  // through as well.
  boxplot: "distribution",
  // **`violin` and `ridgeline` were claimed here and gave it back**, which is
  // `G7b`'s first payment: *a claimed form must put ink on the page*. Their
  // datum is `series` — samples for a kernel estimate — and this path computes
  // no density, so both rendered **zero marks** while reporting as supported.
  // Drawing their summary alone would be a *different figure* from the
  // terminal's, which is the plausible-wrong-figure the `null` arm refuses.
  // The outline is the family's residue, not its omission.
  violin: null, ridgeline: null,
  // **Tiles** — position comes from *values* through the structure, and
  // `hierarchy.ts` already returns it on the unit interval: `tiles` in the unit
  // square, `strips` on the line with a depth. Measured: **0 `cells()` and 0
  // `caps` in that file**, which is what makes this family nearly free where
  // `tree` is not (§3aj.6).
  flame: "tiles", icicle: "tiles", treemap: "tiles",
  // **Nodes** — `tree` and `graph`, the family's other geometry. A tree's
  // node positions are a function of its labels' widths in the terminal —
  // `tdWidth` measures a subtree by the widest label under it — so **the
  // topology is shared and the placement is not** (§3aj.6). This arm places by
  // slots and clips its labels, which is font-independent by construction.
  tree: "nodes", graph: "nodes",
  // *Its own domain*: a date grid, a time span.
  // **A calendar is a matrix at a different column count, and the derivation is
  // what makes that true** (§3ak.32). Its old reason was *its own domain: a date
  // grid* — and a date grid **is** `calendarRows`, a `Plot → Plot` transform
  // that lived in a terminal renderer until F322 moved it. After `drawnBlock`
  // the block is seven weekday rows of week columns with the dates in their
  // labels, which is exactly what `matrixFigure` emits.
  calendar: "matrix",
  gantt: null, timeline: null, funnel: null,
  // **Proportion** — an angle, a polygon's radius, a count of squares, and the
  // three terminal compensations named as terminal (§3ak.26). What crosses is
  // the shares, the ceiling and the hundred-square assignment; what stays is
  // the minimum-segment merge (`1 / 2πr`, in **dots**), the twenty columns
  // `squareColumns` buys, and `MIN_RING_DOTS`. Each is a resolution limit, and a
  // resolution is a thing only a grid has.
  //
  // **The one that was misfiled is the aspect** (F303): the *cell's* really does
  // disappear here, and fitting a round figure into a rectangular box does not —
  // it is `Figure.isotropic`, and `projected` insets a centred square for it.
  pie: "proportion", radar: "proportion", waffle: "proportion",
  // *Paired or banded*: two positions per datum, or a band ladder.
  //
  // `forest` and `dumbbell` are the distribution family's other two — a forest
  // plot is an interval and an estimate, a dumbbell is two positions and a
  // connector, and both are `normalisedSummary`'s members. `slope` and `bullet`
  // are not: a slope's two positions are on **two axes**, and a bullet carries
  // qualitative bands behind its measure.
  //
  // **`horizon`'s reason was wrong and the right one is narrower** (F294). It
  // read *a band ladder folded over one row* — true, and the ladder is `band`
  // and `sign`, both of which cross a seam perfectly well. The blocker is that
  // `horizonGrid` takes `areaWidth` and `areaRows` in **cells** and returns
  // cells carrying `eighths`, a sub-cell fill: the form never separated its
  // geometry from its rasterisation, so there is no coordinate to share. The
  // condition is a symbol — **`horizonFigure`, taking a block and returning
  // normalised marks with no `areaWidth`, no `areaRows` and no `caps`** — and
  // the day it exists this is `"bar"`, because a folded band is a `rect` with a
  // `value`.
  slope: null, dumbbell: "distribution", forest: "distribution", bullet: null,
  // **`horizon`'s condition was written as a symbol and it is met** (F294,
  // §3ak.29): `horizonFigure`, a block in and normalised marks out, no
  // `areaWidth`, no `areaRows`, no `caps`. `horizonGrid` computed `within` —
  // the fraction of a band — one line before spending it on `eighths`, and
  // that line is where the geometry ends and the raster begins.
  //
  // **The family it named was `"bar"` and it is its own.** *A folded band is a
  // `rect` with a `value`* is right about the mark and wrong about the
  // emitter: `barFigure` reads `categoricalDecisions`, insets each rect into a
  // categorical slot and anchors it on a niced value axis, and a horizon has
  // none of the three. Same correction as `contour`'s, one form along.
  horizon: "horizon",
  // *A composition of other forms*, so it is whatever they are.
  smallmultiples: null, pairplot: null,
  // **A field with layers over it, and both halves of the deferral were right**
  // (F294, §3ak.29). The condition was written as a symbol — *`contourFigure`,
  // returning normalised marks with no `areaWidth`, no `areaRows`, no `caps` and
  // no string in the signature* — and that is exactly what landed: marching
  // squares over the **data's own grid**, where a crossing is a linear
  // interpolation between two adjacent readings and no resampling adds one.
  //
  // **The family it named was `"matrix"` and it is `"field"`**, which is the one
  // thing measuring moved. The prediction was about resemblance and the member
  // decides **which emitter**: `matrixFigure` emits cells and nothing else, so a
  // contour routed through it would draw a heatmap with the lines missing and
  // report as supported — the plausible wrong figure a `null` arm refuses.
  contour: "field", quiver: "field",
} satisfies Record<PlotForm, SvgFamily | null>;

/** The family, or `null` where the form carries geometry this path does not. */
export function svgFamilyOf(form: PlotForm): SvgFamily | null {
  return SVG_FAMILY[form];
}

/**
 * The figure a block draws, **by family** (C12 §3ak, I59).
 *
 * This is where the seam actually moves for this arm. Every decision below it —
 * the range, the ticks, the strings they print, whether there is an axis at all
 * — used to be made here and is now read; the emitters are the terminal's own
 * computations, moved, which is why the terminal did not move a frame while they
 * landed and this arm moves plenty.
 *
 * **`nodes` returns decisions and no marks, and that is not a refusal**
 * (§3ak.10 S3/S8). A tree's placement is a function of its labels' widths in the
 * terminal and of slots here, so the topology crosses and the placement does
 * not — `nodesDecisions` is `Omit<Figure, "marks">` for exactly that, and this
 * arm keeps its own loop over `flatten` and `graphLayers`. Giving it
 * `marks: []` would make I64 read it as *nothing to draw* and refuse two forms
 * this arm draws today.
 */
function figureFor(block: Plot): Figure | Omit<Figure, "marks"> | null {
  switch (svgFamilyOf(block.form)) {
    case "curve": return curveFigure(block);
    case "scatter": return scatterFigure(block);
    case "bar": return barFigure(block);
    case "matrix": return matrixFigure(block);
    case "distribution": return distributionFigure(block);
    case "tiles": return tilesFigure(block);
    case "nodes": return nodesDecisions(block);
    case "proportion": return proportionFigure(block);
    case "field": return fieldFigure(block);
    case "horizon": return horizonFigure(block);
    case "stacked": return stackedFigure(block, block.form === "streamgraph");
    case "waterfall": return waterfallFigure(block);
    default: return null;
  }
}

/** A number with three decimals, so the output is byte-stable across platforms. */
function n(v: number): string {
  return (Math.round(v * 1000) / 1000).toString();
}

/** The plot area in px. Never a cell count. */
type Area = Readonly<{ left: number; right: number; top: number; bottom: number }>;

/** The plot area in px, from the layout's fractions. Never a cell count. */
function area(layout: SvgLayout, legend: FigureLegend | null = null): Area {
  const box = {
    left: layout.width * (layout.gutter + layout.pad),
    right: layout.width * (1 - layout.pad),
    top: layout.height * layout.pad,
    bottom: layout.height * (1 - layout.gutter),
  };
  if (legend === null || legend.slots.length === 0) return box; // cells-ok — a legend entry count
  // **The legend costs space on the side it sits, and the two axes cost
  // differently** — C04's own asymmetry arriving in pixels. `left` and `right`
  // cost width; `above` and `below` cost a band of height, which is the terminal's
  // *declared row* with the constraint that made it declared removed.
  //
  // **A fifth of the width and not the widest entry**, on `SVG_DEFAULT_LAYOUT`'s
  // own reason: sizing to content is what drags metrics back in (§3ak.20).
  const band = layout.width * LEGEND_SHARE;
  const rows = SVG_FONT_SIZE * 1.6 * legend.slots.length; // cells-ok — a legend entry count
  const place = legend.placement ?? "right";
  if (place === "right") return { ...box, right: box.right - band };
  if (place === "left") return { ...box, left: box.left + band };
  if (place === "above") return { ...box, top: box.top + rows };
  return { ...box, bottom: box.bottom - rows };
}

/**
 * **The only rung this arm has** (§3aj hazard 5).
 *
 * The terminal path degrades through `colourDepth` and `unicode`; an SVG is
 * always truecolour, so there is no ladder to walk and nothing to fall back to.
 * That is why the two arms are **not byte-comparable below 24-bit**: a cross-arm
 * row compares at this depth or compares structure, never output.
 */
const SVG_CAPS = Object.freeze({ colourDepth: 24 as const });

/**
 * **Furniture takes the slots the terminal's furniture takes.**
 *
 * `tone.muted` for the labels is `xTitleRow`'s own reason — *furniture is not a
 * series* — and the rule and the ground are surfaces because they are drawn on
 * the page rather than said about the data.
 *
 * **These four were hex literals, and one of them was a second palette.**
 * `SERIES_INK` held five colours beside C10's eight, so a sixth series wrapped
 * to a different slot in each arm and the legend disagreed with the figure it
 * labels. A literal is a second source of truth for a colour C10 owns, and
 * nothing can assert a colour it also chose.
 */
const GROUND: ColourRef = "surface.bgDeep";
const RULE: ColourRef = "surface.border";
const LABEL: ColourRef = "tone.muted";

/**
 * A slot's ink as a hex string, or `undefined` where the theme has no such slot.
 *
 * **`undefined` rather than a default**, which is `marks`' own handling of a
 * colormap miss one function down: a default would be a literal, and a literal
 * is what this file no longer has. The caller omits the element and the rows
 * assert the elements are present — so a mistyped ref is a **missing** rectangle
 * a test counts rather than an invisible one on a page. `ColourRef` is
 * `${string}.${string}`, so a typo compiles and `resolve` is total: nothing
 * but the output can say the slot was real.
 */
function inkOf(ref: ColourRef, theme: ResolvedTheme): string | undefined {
  const { colour } = resolve(ref, theme, SVG_CAPS);
  return colour?.kind === "rgb" ? colour.hex : undefined;
}

/** The path a curve family form draws: `step` is square, everything else is straight. */
function curvePath(points: readonly (readonly [number, number] | null)[], square: boolean): string {
  const out: string[] = [];
  let open = false;
  for (const [i, p] of points.entries()) {
    if (p === null) {
      open = false;
      continue;
    }
    if (!open) {
      out.push(`M${n(p[0])} ${n(p[1])}`);
      open = true;
      continue;
    }
    // **A step's corner is two commands and not a curve.** Which command runs is
    // rasterisation; where the corner is came from the shared coordinate, so a
    // step and a line disagree about ink and agree about every sample.
    if (square) out.push(`H${n(p[0])}`, `V${n(p[1])}`);
    else out.push(`L${n(p[0])} ${n(p[1])}`);
    void i;
  }
  return out.join(" ");
}

/**
 * Figure space to page space — **the whole of what this arm does with
 * `orientation` and `facing`** (I61, §3ak.10).
 *
 * A mark is normalised and uninverted: `x` runs along the identity axis and `y`
 * along the value axis, whichever way round those two end up on the page.
 * **Which page axis each occupies is `orientation`, and which way each runs is
 * `facing`** — so this is the only place in this arm that reads either, and that
 * is what stops it drawing on its side a chart the terminal draws flat (D11).
 *
 * **`facing.y` inverts on the ordinate and does not on the abscissa**, because
 * the page's `y` grows downward and its `x` does not. One member, two
 * applications: the same `up` that makes a vertical figure's values run bottom
 * to top makes a horizontal figure's run left to right.
 */
function projected(figure: Omit<Figure, "marks">, outer: Area): (x: number, y: number) => readonly [number, number] {
  // **A figure whose two axes carry one unit gets a centred square, not the
  // box** (I69, §3ak.26 finding 1). The terminal does this in dots and calls it
  // `radiusFor`'s `min`; here it is the same decision in pixels, and it is here
  // rather than in each family's renderer because an inset written per arm is
  // written twice and drifts — which is exactly the defect `aspect.ts` exists to
  // have ended.
  //
  // **This is not the cell aspect.** That one really does disappear: a braille
  // dot is square and a pixel is square. What does not disappear is fitting an
  // isotropic figure into an anisotropic box, and the plan retired the second
  // under the first one's name (F303).
  const box = boxFor(figure, outer);
  const wide = box.right - box.left;
  const tall = box.bottom - box.top;
  const sideways = figure.orientation === "horizontal";
  const up = figure.facing.y === "up";
  const mirrored = figure.facing.x === "left";
  return (x, y) => {
    const along = mirrored ? 1 - x : x;
    return sideways
      ? ([box.left + wide * (up ? y : 1 - y), box.top + tall * along] as const)
      : ([box.left + wide * along, box.top + tall * (up ? 1 - y : y)] as const);
  };
}

/** The square a `isotropic` figure draws inside, centred — or the box itself. */
function boxFor(figure: Omit<Figure, "marks">, box: Area): Area {
  if (!figure.isotropic) return box;
  const side = Math.min(box.right - box.left, box.bottom - box.top);
  const dx = (box.right - box.left - side) / 2;
  const dy = (box.bottom - box.top - side) / 2;
  return { left: box.left + dx, right: box.right - dx, top: box.top + dy, bottom: box.bottom - dy };
}

/**
 * A figure's marks as SVG elements — **the walk that replaces a loop per
 * family** (§3ak.10).
 *
 * **Nothing here reads the form to decide *what* is drawn**, which is the whole
 * of the change: a rect is a rect whether it came from a bar, a heatmap cell or
 * a treemap tile, and the two members that vary its appearance — a `value` to
 * spend on the ramp, a `size` to spend on a radius — are on the mark rather than
 * in a table keyed by form. The form is read **once** below and it is
 * rasterisation (§3aj hazard 1): which polyline joint a step takes.
 *
 * **It used to be read twice, and the second was not rasterisation** (F324).
 * *Which ramp a matrix reads* was called one, and the sentence licensed exactly
 * what the rule above forbids: the ramp came from `block.colormap ?? "viridis"`
 * while the terminal read a per-form table, so a correlation matrix was
 * diverging in one arm and sequential in the other. The **depth** is this arm's
 * — `continuousColour(map, t, caps)` — and *which* map varies by form, which is
 * not a resolution. It is `figure.ramp`.
 *
 * **A colour is resolved here and never crosses the seam** (I62). `ref` is an
 * explicit slot and `seriesIndex` is the categorical ladder's; a mark with
 * neither is furniture, which is `xTitleRow`'s own reason — *furniture is not a
 * series*.
 */
function walk(figure: Figure, block: Plot, box: Area, theme: ResolvedTheme, out: string[]): readonly string[] {
  const at = projected(figure, box);
  const map = figure.ramp === null ? undefined : COLORMAPS[figure.ramp];
  const furniture = inkOf(LABEL, theme);
  const ground = inkOf(GROUND, theme);
  // **Where each slot's rectangle landed, so a label can find the box it
  // names** (§3ak.12). A `text` mark and the `rect` it belongs to carry the same
  // `seriesIndex`, which is a key rather than a position — the pairing survives
  // a reordering, and the walk needs it because *is there room for this string*
  // is a question each arm answers in its own units and neither can answer in
  // the other's (§3aj hazard 4).
  const boxes = new Map<number, Area>();
  // **How many slots the categorical axis has, taken from the marks** — needed
  // by the two roles that are drawn *across* a slot rather than at a point, and
  // by nothing else. The emitter numbers a summary's every part with its own
  // slot index, so the count falls out of the marks and this arm does not have
  // to be told it twice (§3ak.13).
  const slots = Math.max(1, ...figure.marks.map((d) => (d.seriesIndex ?? 0) + 1)); // cells-ok — a slot count
  const halfSlot = SLOT_SHARE / slots / 2;

  /**
   * A bar **across** the identity axis at a value — a median, a cap, a tee.
   *
   * The two ends differ only along the identity axis, so whichever page axis
   * that turned out to be is the long one and the other takes the thickness.
   * **The first draft of the arm this replaces passed the slot's two edges as
   * the value pair**, so every cap came out rotated ninety degrees: inside the
   * area, inside its own category, and a caps-and-whiskers figure with the caps
   * running the wrong way. That is what a containment assertion agrees with.
   */
  const across = (x: number, y: number, half: number, thick: number, colour: string): void => {
    const a = at(x - half, y);
    const b = at(x + half, y);
    const w = Math.max(Math.abs(b[0] - a[0]), thick);
    const h = Math.max(Math.abs(b[1] - a[1]), thick);
    const x0 = Math.min(a[0], b[0]) - (a[0] === b[0] ? thick / 2 : 0);
    const y0 = Math.min(a[1], b[1]) - (a[1] === b[1] ? thick / 2 : 0);
    out.push(`<rect x="${n(x0)}" y="${n(y0)}" width="${n(w)}" height="${n(h)}" fill="${colour}"/>`);
  };

  /** A diamond, which is what says *this one is the answer*. */
  const diamond = (cx: number, cy: number, r: number, colour: string, edge?: string): void => {
    out.push(
      `<polygon points="${n(cx)},${n(cy - r)} ${n(cx + r)},${n(cy)} ${n(cx)},${n(cy + r)} ${n(cx - r)},${n(cy)}" ` +
        `fill="${colour}"${edge === undefined ? "" : ` stroke="${edge}" stroke-width="0.75"`}/>`,
    );
  };
  // **A step holds its value until the next sample, and that is *which
  // rasteriser* rather than *where the samples are*.** The terminal picks
  // `stepRows` off the same member — `styleRasteriser(block, caps, stepRows,
  // "step")` — and the points it rasterises are the figure's either way, so the
  // joint is this arm's and the polyline is shared (§3aj hazard 1).
  const square = block.form === "step" || block.form === "ecdf";

  const inkFor = (d: Drawn): string | undefined =>
    d.ref !== undefined
      ? inkOf(d.ref, theme)
      : d.seriesIndex !== undefined
        ? inkOf(refOf(d.seriesIndex), theme)
        : furniture;

  for (const d of figure.marks) {
    const ink = inkFor(d);
    if (ink === undefined) continue;
    const m = d.mark;

    if (m.kind === "polyline") {
      const annotation = d.layer === "annotation";
      const path = curvePath(m.points.map((pt) => at(pt[0], pt[1])), square && !annotation);
      if (path === "") continue;
      // **A stroke carrying a `value` is coloured by the ramp rather than by its
      // slot**, which is the rect branch's rule on the second kind that needs it
      // (F323). An arrow's colour *is* its magnitude (C12 I50), and the mark is
      // a polyline because an arrow is a shaft and a chevron.
      let stroke = ink;
      if (m.value !== undefined && map !== undefined) {
        const colour = continuousColour(map, m.value, SVG_CAPS);
        if (colour === undefined || colour.kind !== "rgb") continue;
        stroke = colour.hex;
      }
      // **Dashed, for `annotate.ts`' own reason**: a reference line is a claim
      // *about* the ordinate drawn beside the data, and a solid rule crossing
      // five series reads as a sixth. The terminal draws `┄` and the legend
      // swatch it already shares says the same thing (C04 I52).
      // **A filled region reads as a quantity and a stroked one as a boundary**
      // (§3ak.33). A stacked band is the first; every curve this arm drew before
      // it is the second, and `fill` is what says which. The stroke stays on a
      // filled band so its own edge is visible against its neighbour, which is
      // the terminal's `markOf` glyph doing the same job one alphabet along.
      out.push(
        `<path d="${path}${m.closed === true ? " Z" : ""}" ` +
          `fill="${m.fill === true ? stroke : "none"}"${m.fill === true ? ' fill-opacity="0.85"' : ""} ` +
          `stroke="${stroke}" ` +
          `stroke-width="${annotation ? "1" : "2"}"${annotation ? ' stroke-dasharray="4 3"' : ""}/>`,
      );
      continue;
    }

    if (m.kind === "arc") {
      // **A sector and a ring from one mark kind, and `fill` is what separates
      // them** (§3ak.26 finding 4). A pie's wedge runs from the centre; a
      // radar's circular ring does not, and drawing the second as a degenerate
      // first would put a spike from the middle of every radar to twelve
      // o'clock.
      //
      // **The turn convention is the figure's and the arithmetic is this
      // arm's.** `from` and `to` are turns from twelve o'clock clockwise, which
      // is the terminal's `START_ANGLE` said out loud rather than kept in one
      // file's head.
      const [cx, cy] = at(0.5, 0.5);
      const rx = Math.abs(at(1, 0.5)[0] - cx);
      const ry = Math.abs(at(0.5, 1)[1] - cy);
      const rad = Math.min(rx, ry) * m.radius;
      const pt = (turn: number): readonly [number, number] => {
        const a = turn * Math.PI * 2 - Math.PI / 2;
        return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)] as const;
      };
      const span = m.to - m.from;
      if (span <= 0) continue;
      // **A full turn has no arc, because its two ends are the same point.** An
      // `A` command between coincident points draws nothing at all, which is how
      // a single-segment pie and every radar ring would have come out blank.
      if (span >= 1) {
        out.push(
          `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(rad)}" ` +
            (m.fill ? `fill="${ink}"/>` : `fill="none" stroke="${ink}" stroke-width="1.5"/>`),
        );
        continue;
      }
      const a0 = pt(m.from);
      const a1 = pt(m.to);
      const large = span > 0.5 ? 1 : 0;
      const sweep = `A${n(rad)} ${n(rad)} 0 ${String(large)} 1 ${n(a1[0])} ${n(a1[1])}`;
      out.push(
        m.fill
          ? `<path d="M${n(cx)} ${n(cy)} L${n(a0[0])} ${n(a0[1])} ${sweep} Z" fill="${ink}"/>`
          : `<path d="M${n(a0[0])} ${n(a0[1])} ${sweep}" fill="none" stroke="${ink}" stroke-width="1.5"/>`,
      );
      continue;
    }

    if (m.kind === "point") {
      // **`absent` draws nothing, and that is the role's entire content here**
      // (I62, §3ak.22). A forest row with no estimate is a real state; a circle
      // at the fallback position is the plausible wrong figure the role exists
      // to refuse. The terminal reached the same answer through `row[NaN]` until
      // it read `GLYPH_SHAPE` too, so the two arms agreed and one agreed by
      // accident (F299).
      if (GLYPH_SHAPE[m.role] === "none") continue;
      const [cx, cy] = at(m.x, m.y);
      // **A bubble's radius is data and this scale is not** (§3aj hazard 1,
      // §3ak.1 finding 2). The size arrives normalised against its own series'
      // maximum — `bubbleRows`' own figure — and the terminal spends it on 0 to
      // 2 dots. The floor of 2 px is what its radius-0 single dot is: a sample
      // with no size still draws. A forest estimate's weight is the same number
      // spent the same way (C12 I31).
      const r = m.size === undefined ? 3 : 2 + 5 * m.size;
      // **Seven roles and not one character** (I62, I68). The terminal picks a
      // glyph per alphabet from the same seven; this arm has no ladder and draws
      // a shape.
      //
      // **A record rather than a `switch`, and that is the half F289 was
      // missing.** The switch ended in a `default:` that drew a circle, so an
      // eighth role would have arrived here as a point mark and been drawn
      // *plausibly* — no error, no frame that looks wrong, and the two arms
      // silently answering different questions. Keyed exhaustively, the same
      // role is a compile error here and in `roleGlyphs`, which is what makes
      // the agreement structural rather than inherited from the composition the
      // roles were extracted from.
      const draw: Readonly<Record<GlyphRole, () => void>> = {
        median: () => { across(m.x, m.y, halfSlot, 2, ink); },
        // Half the slot, because a cap that is as wide as the box it caps
        // reads as a second box edge rather than as the whisker's end.
        cap: () => { across(m.x, m.y, halfSlot / 2, 1, ink); },
        // **A diamond in the series colour, which is what the terminal
        // draws.** A grey circle inside a filled box is not visible, which the
        // frame said and no row could: the outliers share the colour and the
        // shape is what tells them apart (C12 I33, C04 I53).
        mean: () => { diamond(cx, cy, Math.max(2, r * 0.8), ink, inkOf(LABEL, theme)); },
        target: () => { diamond(cx, cy, r, ink); },
        outlier: () => {
          out.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(Math.max(1.5, r * 0.6))}" fill="${ink}"/>`);
        },
        point: () => { out.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${ink}"/>`); },
        // Unreached — `GLYPH_SHAPE` skipped it above. Present because the record
        // is keyed by the role and not by the shape, so the two cannot drift.
        absent: () => {},
      };
      draw[m.role]();
      continue;
    }

    if (m.kind === "rect") {
      // **Two insets, and which one applies is what `depth` says** (F280).
      //
      // A **nested** rect is a member of a partition: its neighbours abut it,
      // so it comes off a unit on every side and the parent shows through. A
      // rect with no `depth` is a **measurement** — a bar's length *is* its
      // value, read against a labelled axis — so it must reach its own gridline
      // exactly, and what it wants instead is a gap across the *identity* axis
      // so two categories do not touch.
      //
      // The slot inset is taken here, in the figure's own space, because `x`
      // and `w` run along the identity axis whatever `orientation` says. Taking
      // it after projection would need this to know which page axis that had
      // become — the second reading of `orientation` the projector exists to
      // remove.
      const nested = m.depth !== undefined;
      const share = !nested && m.value === undefined && d.layer === "series" ? SLOT_SHARE : 1;
      const gap = ((1 - share) / 2) * m.w;
      const a = at(m.x + gap, m.y);
      const b = at(m.x + m.w - gap, m.y + m.h);
      // **Two corners and a bounding box, so every flip is the projector's.**
      // Mapping a corner and a size separately would need the walk to know which
      // way each axis runs — the second copy of `facing` this function exists to
      // remove.
      // **A hairline off every side, and it is the nesting rather than a
      // margin** (§3ak.12). `tiles`' own comment is the argument: *filling the
      // parent exactly is arithmetically right and draws a mosaic — the leaves
      // are correct, the siblings are adjacent, and nothing says which ones
      // belong together.* It used to be `tiles(root, 1 / max(w, h))`, a pad
      // baked into the layout, which is not a thing a shared partition can carry
      // — the terminal's unit is a cell and this arm's is a pixel, and the
      // figure knows neither (§3aj hazard 1).
      //
      // **`depth + 1` units, not one** — and the difference is the whole of
      // F278. A uniform inset separates *siblings* and leaves a child's shared
      // edge exactly on its parent's, so the ring vanishes at every depth and
      // the figure reads as a flat mosaic of outlined boxes. Measured: the
      // parent went `x=89.6 w=404.096` to `x=90.6 w=402.096` while its child
      // stayed at `90.6`, and nothing of the parent was left showing.
      //
      // **Applied after projection it is the better device than the pad it
      // replaces**: the partition stays true, so a tile's area is proportional
      // to its datum rather than to its datum minus the padding.
      const inset = nested ? (m.depth ?? 0) + 1 : 0;
      const x = Math.min(a[0], b[0]) + inset;
      const y = Math.min(a[1], b[1]) + inset;
      const w = Math.max(0.5, Math.abs(b[0] - a[0]) - inset * 2);
      const h = Math.max(0.5, Math.abs(b[1] - a[1]) - inset * 2);
      let fill = ink;
      // **`fill: false` is an outline with the datum showing through**, which is
      // a boxplot's body: the box is a *range* the whiskers pass behind, so a
      // solid fill would hide them and a bare outline would not read as a body.
      // The other rect kinds fill, and the member is what says which.
      if (m.fill === false) {
        out.push(
          `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" ` +
            `fill="${ink}" fill-opacity="0.35" stroke="${ink}" stroke-width="1.5"/>`,
        );
        continue;
      }
      // **A rect carrying a `value` is coloured by the ramp rather than by its
      // slot**, and the rule is the mark's rather than the family's. A matrix
      // cell has no length and no position left to carry its reading — the
      // coordinate is spent on the grid — so the reading crosses the seam
      // normalised and each arm turns it into a colour at its own depth.
      if (m.value !== undefined) {
        if (map === undefined) continue;
        const colour = continuousColour(map, m.value, SVG_CAPS);
        if (colour === undefined || colour.kind !== "rgb") continue;
        fill = colour.hex;
      }
      // **A partition's neighbours must be told apart and a field's must not**,
      // and `value` is what says which this is. A treemap without the hairline
      // is one colour chart with invisible nesting; a heatmap with it is a grid
      // drawn over a continuous field. One device where there were two — the
      // strips carried a one-pixel gap and the tiles a stroke, both expressed in
      // the renderer's units, both saying *these are separate*.
      const edge = inset > 0 ? ` stroke="${ground ?? fill}" stroke-width="1"` : "";
      if (d.seriesIndex !== undefined) boxes.set(d.seriesIndex, { left: x, top: y, right: x + w, bottom: y + h });
      out.push(
        `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}"${edge}/>`,
      );
      continue;
    }

    if (m.kind === "text") {
      // **The label places itself and stops itself, and nothing here asks how
      // wide the string is** (§3aj hazard 4). A `clipPath` is this renderer's
      // own mechanism; the terminal truncates to the cells its tile owns, which
      // it can do because it measures text and this cannot.
      //
      // **A label names a box, or it sits at a point — and this branch had four
      // rules that only hold for the first** (F306). Each is right for a
      // treemap and each was wearing the name of the general case, which is
      // MG24's class a third time in one pass. The proportion family is the
      // first to emit a `text` mark with no rect behind it, and it is what
      // showed them: five category names in the document and one smudge on the
      // page.
      //
      // | the rule | right for a tile because | wrong at a point because |
      // |---|---|---|
      // | drawn in the **ground** colour | a dark word on a filled tile | nothing is behind it, so it is the background |
      // | clip id keyed by `seriesIndex` | one label, one tile | several labels share a slot, and SVG takes the **first** `url(#id)` |
      // | placed at the clip's top-left + 3 | a tile's corner is where a label goes | the mark's point **is** the datum |
      // | clip runs right and down from the anchor | a tile extends that way | `end` and `middle` run the other way |
      const slot = d.seriesIndex === undefined ? undefined : boxes.get(d.seriesIndex);
      if (slot === undefined) {
        // **At a point: the mark's own position, its own ink, and the plot area
        // as the only bound.** A radar's spoke end is a coordinate, so moving it
        // three pixels for legibility would be the renderer editing the figure.
        const [tx, ty] = at(m.x, m.y);
        // **A baseline is not a centre, and the terminal already pays for
        // that** — `labelRows` anchors at `cy + (ry + 0.75)·sin(a)`, three
        // quarters of a cell outward, so a name below a ring sits below it. An
        // SVG `y` is the **baseline**, so a label at the bottom of a figure has
        // its body *above* the point and lands on the ring it names.
        //
        // **In this arm's units, because the two arms have different ones**
        // (§3aj hazard 4, F278's own shape): the terminal's is a cell and this
        // one's is the font size. What crosses is the *point*; the legibility
        // margin is each arm's, and a figure carrying one would be carrying a
        // cell count or a pixel count and could not be both.
        //
        // `m.y` is figure space with `y` up, so `1` is the top: a name there
        // wants its body above the baseline and one at `0` wants it below.
        const drop = SVG_FONT_SIZE * (0.35 + 0.65 * (1 - 2 * m.y));
        out.push(
          `<text x="${n(tx)}" y="${n(ty + drop)}" ` +
            `font-size="${n(SVG_FONT_SIZE)}" font-family="monospace" fill="${ink}"` +
            `${m.anchor === "start" ? "" : ` text-anchor="${m.anchor}"`}>${escape(m.text)}</text>`,
        );
        continue;
      }
      // **Too short for its own name is a decision in page units** — the
      // terminal's is *does the tile still own a run this wide*, in cells. Two
      // gates in two unit systems for one shared fact, which is what hazard 4
      // makes unavoidable rather than untidy.
      if (slot.bottom - slot.top < SVG_FONT_SIZE) continue;
      const id = `${m.kind[0] ?? "t"}${block.id}-${String(d.seriesIndex ?? 0)}`;
      out.push(
        `<clipPath id="${id}"><rect x="${n(slot.left)}" y="${n(slot.top)}" ` +
          `width="${n(slot.right - slot.left)}" height="${n(slot.bottom - slot.top)}"/></clipPath>`,
        `<text x="${n(slot.left + 3)}" y="${n(slot.top + SVG_FONT_SIZE)}" clip-path="url(#${id})" ` +
          `font-size="${n(SVG_FONT_SIZE)}" font-family="monospace" fill="${ground ?? ink}"` +
          // `start` is SVG's own default, so naming it would be a byte in every
          // frame saying nothing — the attribute appears only where it decides.
          `${m.anchor === "start" ? "" : ` text-anchor="${m.anchor}"`}>${escape(m.text)}</text>`,
      );
      continue;
    }
  }
  return out;
}

// **`rangeFor` is gone, and its removal is what this step is for** (C12 §3ak.10).
//
// It answered *a distribution's range comes from its own datum, and there are
// two* — `seriesRange` for most forms, `quartileRange` for a boxplot, in the arm
// the terminal uses. Every word of that is still true and none of it is decided
// here any more: each family's emitter answers it, once, for both arms. Its
// closing note — **no pin, because the terminal's boxplot arm overwrites
// `yMin`/`yMax` anyway, and whether that overwrite is right is a separate
// question** — moves with it, unanswered and now askable in one place.

/**
 * **How much of its slot a categorical figure takes** — this arm's, and one of
 * them (§3ak.12).
 *
 * `boxplotColumn`'s own ruling and matplotlib's `widths=0.6`: categories drawn
 * to the full slot touch, and a categorical axis whose categories touch is not
 * saying they are separate. The terminal takes the same fraction and rounds it
 * to cells; this does not round at all, which is the whole of the difference
 * (§3aj hazard 1).
 *
 * **It was two numbers until the bar family crossed** — `0.6` here and `0.7` in
 * `marks()`' own bar loop, one arm, two answers to *how wide is a bar*, which is
 * the duplication this pass exists to end one layer up.
 */
/** The share of the width a side legend takes — a fifth, never the widest entry. */
const LEGEND_SHARE = 0.2;

const SLOT_SHARE = 0.6;

/**
 * Layered nodes and their edges, placed without measuring a single label.
 *
 * **The placement is per-arm and this is the SVG's** (§3aj.6). The terminal's
 * is a function of label widths — `tdWidth` measures a subtree by the widest
 * label under it — and the two arms measure text differently by construction,
 * so each computes its own placement from the same topology.
 *
 * **A slot per node and a `clipPath` per label**, which is the treemap's answer
 * one family along: the label places itself *and* stops itself, and nothing
 * here asks how wide the string is. That is what makes the placement
 * font-independent rather than font-dependent in a second way.
 */
function nodeMarks(
  layers: readonly (readonly number[])[],
  labelAt: (id: number) => string,
  edges: readonly (readonly [number, number])[],
  box: Readonly<{ left: number; right: number; top: number; bottom: number }>,
  w: number,
  h: number,
  transposed: boolean,
  ink: string,
  ground: string | undefined,
  theme: ResolvedTheme,
  id: string,
  out: string[],
): readonly string[] {
  const depth = layers.length; // cells-ok — a layer count
  if (depth === 0) return out;
  const at = new Map<number, Readonly<{ x: number; y: number; w: number; h: number }>>();

  // **One box size for every node, taken from the widest layer.**
  //
  // The first version sized a node to its own layer's share, so a node alone in
  // its layer spanned the whole figure: a leaf drawn as wide as the root, and
  // the frame is what showed it. The terminal sizes a node to **its label**,
  // which this arm cannot do (§3aj hazard 4) — so the font-independent
  // equivalent is one size for all of them, from the busiest layer.
  const busiest = layers.reduce((m, row) => Math.max(m, row.length), 1); // cells-ok — a node count
  for (const [d, row] of layers.entries()) {
    const band = (transposed ? w : h) / depth;
    const across = (transposed ? h : w) / busiest; // cells-ok — a node count
    // Centred in the axis rather than spread across it, so a sparse layer sits
    // under its parents instead of stretching to the edges.
    const offset = ((transposed ? h : w) - across * row.length) / 2; // cells-ok — a node count
    for (const [i, node] of row.entries()) {
      const alongCentre = (transposed ? box.left : box.top) + band * (d + 0.5);
      const acrossCentre = (transposed ? box.top : box.left) + offset + across * (i + 0.5);
      const bw = Math.max(4, (transposed ? band : across) * 0.7);
      const bh = Math.max(4, (transposed ? across : band) * 0.5);
      const cx = transposed ? alongCentre : acrossCentre;
      const cy = transposed ? acrossCentre : alongCentre;
      at.set(node, { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh });
    }
  }

  // **The edges first, so a node is drawn over its own connections.** The same
  // order the treemap paints in, for the same reason: what is on top says what
  // is in front, and a line ending under a box reads as ending at it.
  const rule = inkOf(RULE, theme) ?? ink;
  for (const [from, to] of edges) {
    const a = at.get(from);
    const b = at.get(to);
    if (a === undefined || b === undefined) continue;
    // **A diagonal, which is the gain this arm has and the terminal does not.**
    // `strokePolyline` steps orthogonally because a diagonal step would claim
    // two cells at once; an SVG path draws any angle, so an edge goes where it
    // goes. A per-arm difference in what is *possible*, not in what is chosen.
    out.push(
      `<path d="M${n(a.x + a.w / 2)} ${n(a.y + a.h / 2)} L${n(b.x + b.w / 2)} ${n(b.y + b.h / 2)}" ` +
        `stroke="${rule}" stroke-width="1" fill="none"/>`,
    );
  }

  for (const [d, row] of layers.entries()) {
    for (const node of row) {
      const r = at.get(node);
      if (r === undefined) continue;
      const label = labelAt(node);
      // **A dummy node is a waypoint and draws nothing.** The Sugiyama pipeline
      // inserts them to route an edge across a layer, and a box there would be
      // a node the graph does not have.
      if (label === "") continue;
      const slot = inkOf(refOf(d), theme);
      if (slot === undefined) continue;
      out.push(
        `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" ` +
          `rx="2" fill="${slot}" stroke="${ground ?? slot}" stroke-width="1"/>`,
        `<clipPath id="n${id}-${String(node)}"><rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}"/></clipPath>`,
        `<text x="${n(r.x + 3)}" y="${n(r.y + r.h / 2 + SVG_FONT_SIZE / 3)}" clip-path="url(#n${id}-${String(node)})" ` +
          `font-size="${n(SVG_FONT_SIZE)}" font-family="monospace" fill="${ground ?? ink}">${escape(label)}</text>`,
      );
    }
  }
  return out;
}

/**
 * The indented outline — one node per row, indented by depth (F310).
 *
 * **`treeLayout: "outline"` was refused here and it is the layout with the
 * least geometry above cells**, which is backwards from difficulty. The refusal
 * read *an indented text listing and not a node placement*, and the second half
 * is true while the first is a reason to draw it rather than a reason not to: a
 * listing is a placement whose across-axis is `depth` and whose along-axis is
 * the walk order, both of which `flatten` already returns. It was in no refusal
 * record either — nine refusals the corpus had and the record did not.
 *
 * **The terminal draws `├── ` and this draws an elbow**, which is the same
 * difference the other two layouts already have: `strokePolyline` steps
 * orthogonally into cells, a path goes where it goes. Same figure, two
 * rasterisations, which is what the arm is for.
 *
 * **The row is the unit, so the height is a function of the node count** — a
 * deep tree gets thin rows rather than a clipped list, because dropping nodes
 * here would be the terminal's truncation decided a second time.
 */
function outlineMarks(
  flat: readonly FlatNode[],
  box: Readonly<{ left: number; right: number; top: number; bottom: number }>,
  ink: string,
  theme: ResolvedTheme,
  id: string,
  out: string[],
): readonly string[] {
  if (flat.length === 0) return out; // cells-ok — a node count
  const rowH = (box.bottom - box.top) / flat.length; // cells-ok — a node count
  const depth = flat.reduce((m, f) => Math.max(m, f.depth), 0); // cells-ok — a depth index
  // **The indent is a share of the box and never a constant**, so a four-deep
  // tree and a one-deep tree both use the width they have. `OUTLINE_INDENT` is
  // the terminal's answer to the same question in cells.
  const indent = (box.right - box.left) / Math.max(4, depth + 3); // cells-ok — a depth index
  const x = (f: FlatNode): number => box.left + f.depth * indent;
  const y = (i: number): number => box.top + rowH * (i + 0.5); // cells-ok — a node index

  const rule = inkOf(RULE, theme) ?? ink;
  for (const [i, f] of flat.entries()) { // cells-ok — a node index
    if (f.parent < 0) continue; // cells-ok — a node index
    const p = flat[f.parent]!;
    // The elbow: down the parent's own column, then right to the child's row.
    out.push(
      `<path d="M${n(x(p) + indent / 3)} ${n(y(f.parent))} V${n(y(i))} H${n(x(f))}" ` +
        `stroke="${rule}" stroke-width="1" fill="none"/>`,
    );
  }
  for (const [i, f] of flat.entries()) { // cells-ok — a node index
    const slot = inkOf(refOf(f.depth), theme);
    if (slot === undefined || f.label === "") continue;
    out.push(
      `<clipPath id="o${id}-${String(i)}"><rect x="${n(x(f))}" y="${n(y(i) - rowH / 2)}" ` +
        `width="${n(Math.max(0, box.right - x(f)))}" height="${n(rowH)}"/></clipPath>`,
      `<text x="${n(x(f) + 2)}" y="${n(y(i) + SVG_FONT_SIZE / 3)}" clip-path="url(#o${id}-${String(i)})" ` +
        `font-size="${n(SVG_FONT_SIZE)}" font-family="monospace" fill="${slot}">${escape(f.label)}</text>`,
    );
  }
  return out;
}

/**
 * A form's marks, by family.
 *
 * **One function per family and not one per form**, because the forms inside a
 * family differ only in what they put at a position the shared coordinate
 * already gave them — a joined path, a mark, a rectangle, a painted cell.
 */
// **`range` is gone from this signature and that is the seam arriving** (§3ak.13).
// Every family that walks takes its coordinate from the figure's marks, already
// normalised; the last caller that needed a range of its own was the
// distribution branch, which rasterised summaries here. What is left below is
// the nodes family, whose placement is topology and slots and no scale at all.
function marks(
  block: Plot,
  figure: Figure | Omit<Figure, "marks">,
  layout: SvgLayout,
  theme: ResolvedTheme,
): readonly string[] {
  const family = svgFamilyOf(block.form);
  const box = area(layout, figure.legend);
  const out: string[] = [];

  // **The families that have crossed**, and the list is the diff (§3ak.10).
  // Each commit of step 4 moves one or more into the walk and deletes the loop
  // it had, so what is left below is what is still decided twice — readable
  // without holding the plan beside it.
  //
  // **`"marks" in figure` is the nodes family and nothing else** (§3ak.10 S3).
  // `nodesDecisions` returns `Omit<Figure, "marks">` because a tree's placement
  // is a function of its labels' widths in the terminal and of slots here, so
  // the topology crosses and the placement does not.
  if ((family === "curve" || family === "scatter" || family === "matrix" || family === "tiles"
    || family === "bar" || family === "distribution" || family === "proportion"
    || family === "field" || family === "horizon" || family === "stacked"
    || family === "waterfall") && "marks" in figure) {
    return walk(figure, block, box, theme, out);
  }

  if (family === "nodes") {
    const ink0 = inkOf(LABEL, theme);
    const ground = inkOf(GROUND, theme);
    if (ink0 === undefined) return out;
    const w = box.right - box.left;
    const h = box.bottom - box.top;

    // **Layers of node indices, and where each came from.** A tree's layer is
    // its depth; a graph's is the Sugiyama pipeline's, dummy nodes and all.
    // Both are pure topology — measured at 0 `cells()` and 0 `caps` for
    // `graph.ts`'s pipeline and for `tree.ts`'s `flatten` (§3aj.6).
    let layers: readonly (readonly number[])[] = [];
    let labelAt: (id: number) => string = () => "";
    let edges: readonly (readonly [number, number])[] = [];

    if (block.form === "tree") {
      const root = block.hierarchy;
      if (root === undefined) return out;
      // **`topDown` where nothing is asked**, which is what the terminal picks
      // when everything fits: `chooseLayout` returns the first of
      // `["topDown", "leftRight", "outline"]` whose size fits the budget, and
      // an SVG has no budget. Read out of the source rather than chosen.
      const wanted = block.treeLayout ?? "topDown";
      const flat = flatten(root);
      // **Drawn rather than refused** (F310). The old reason — *an indented text
      // listing and not a node placement* — is true about the drawing and not a
      // reason to withhold it: a listing is a placement whose across-axis is
      // `depth` and whose along-axis is the walk order, and `flatten` returns
      // both. Refusing the cheapest of the three layouts while drawing the other
      // two is backwards from difficulty, and it was in no refusal record.
      if (wanted === "outline") return outlineMarks(flat, box, ink0, theme, block.id, out);
      const byDepth: number[][] = [];
      for (const [i, f] of flat.entries()) (byDepth[f.depth] ??= []).push(i);
      layers = byDepth;
      labelAt = (id) => flat[id]?.label ?? "";
      edges = flat.flatMap((f, i) => (f.parent >= 0 ? [[f.parent, i] as const] : []));
      // `leftRight` is the same placement transposed, which is what it is in
      // the terminal too — one label column per depth instead of one row.
      if (wanted === "leftRight") {
        return nodeMarks(layers, labelAt, edges, box, w, h, true, ink0, ground, theme, block.id, out);
      }
      return nodeMarks(layers, labelAt, edges, box, w, h, false, ink0, ground, theme, block.id, out);
    }

    const g = block.graph;
    if (g === undefined) return out;
    // **No pruning**, which is §3aj.6's other half: `graphArea` drops
    // least-connected nodes until the figure fits a cell budget, and an SVG
    // has none. A shared pruner would put a terminal's constraint into a
    // renderer that does not have it.
    const laid = graphLayers(g);
    layers = laid.rows;
    labelAt = (id) => laid.labelOf(id);
    // **The notice the terminal carries and this arm dropped** (C12 I58).
    // An edge reversed to make the graph acyclic is drawn pointing the way it
    // is not, and a reader who is not told reads the dependency backwards. The
    // frame is what said it was missing: the terminal's `1 reversed` sat under
    // its figure and the SVG had nothing.
    //
    // F259's ruling says *refuse a false figure, record an incomplete one* —
    // and this one is cheap enough to draw rather than record.
    if (laid.reversed > 0) {
      const warn = inkOf("tone.warn", theme);
      if (warn !== undefined) {
        out.push(
          `<text x="${n(box.left)}" y="${n(box.bottom + SVG_FONT_SIZE)}" ` +
            `font-size="${n(SVG_FONT_SIZE)}" font-family="monospace" fill="${warn}">` +
            `${escape(String(laid.reversed))} reversed</text>`,
        );
      }
    }
    edges = laid.edges;
    return nodeMarks(layers, labelAt, edges, box, w, h, false, ink0, ground, theme, block.id, out);
  }
  return out;
}

/**
 * A plot as SVG, or `null` where the form carries its own geometry.
 *
 * **`null` rather than a fallback picture**, because a form drawn by the wrong
 * family is a plausible wrong figure — a treemap rendered as a curve measures,
 * rasterises and reads as a chart of something. The refusal is the same argument
 * the placeholder encoding makes for a wrapped diacritic (C04 I73).
 */
export function plotToSvg(
  // **Not `given`, and MG24 is why.** The rule matches a published member by
  // *name* rather than by `owner.name` — a stated limit with three tightenings
  // measured and rejected (F105, F160) — so a parameter called `given`
  // satisfies `VerbRatio.given`'s consumption test and turns a live exemption
  // into a violation. Third instance of that mechanism and the first on a
  // function parameter rather than a table key.
  given: Plot,
  theme: ResolvedTheme,
  layout: SvgLayout = SVG_DEFAULT_LAYOUT,
): string | null {
  if (svgFamilyOf(given.form) === null) return null;

  // **The `ohlc` refusal used to be here and it is gone** (F259, §3ak.31).
  //
  // It was right and it was narrow: *`ohlc` is the candles' own data and nothing
  // here reads it*, so the curve arm found `series: []` — legal precisely
  // because plain candles are the ordinary case (C04 I57) — and drew a fully
  // furnished plot with an axis running 0 to 1 while the terminal drew three
  // candles over 8 to 16. The moving-average case was worse than the empty one:
  // a non-empty `series` beside `ohlc` is an average *over* the candles, so the
  // range came from the average alone and the frame was a confident chart of the
  // wrong thing rather than a blank a reader questions.
  //
  // **That is a refusal for a figure whose data has not been read, and F259's
  // subject is a figure that cannot be drawn.** `positionalDecisions` has ranged
  // over `candlesOf(block)` since §3ak.7 C6 and `legendSlots` has earned the
  // `rising`/`falling` pair for as long; what was missing is two marks, and
  // `Mark` has both. §3ak.29's rule at a fourth case.

  // **A flipped ordinate is the same class, found by asking the same question**
  // (F259). `svgPoints` passes `invert: true` unconditionally — the comment
  // beside it says it is spelling `FACING_DEFAULT` out because L0 does not hold
  // `Facing` — so **all four `origin` values produce byte-identical output**,
  // measured. A block asking for a top-left origin draws flipped in the
  // terminal and unflipped here: the same data, upside down between the arms.
  //
  // Refused rather than honoured, because honouring it is the families' work
  // and a wrong-way-up chart is a plausible wrong figure today.
  if (given.origin !== undefined && given.origin !== ORIGIN_DEFAULT[given.form]) return null;

  // **The block this arm draws, which is not always the block it was given**
  // (C12 I70, §3ak.27). `histogram`, `density` and `ecdf` replace their samples
  // with a quantity the samples do not contain, and for the length of the pass
  // that happened inside the terminal's dispatch table — so this arm drew 240
  // raw samples against 8 counted bins, the sorted values against a kernel
  // estimate, and a non-monotone staircase against a cumulative distribution
  // (F314, F317).
  //
  // **Here rather than inside `figureFor`**, because the furniture below reads
  // the block too: a figure about the drawn block beside a legend about the
  // given one is the same defect one level smaller. And **after the two
  // refusals above**, which are claims about what the author wrote.
  const block = drawnBlock(given);

  // **The axis is the figure's, and this is D1 through D7 closing at once**
  // (C12 §3ak.10). What this arm computed for itself — `rangeFor`, a hardcoded
  // five ticks, `niceAxis` without the block's scale, `String(tick)` — is one
  // read now, and the emitter behind it is the terminal's own computation.
  //
  // **The range is the NICED one and that is the sharpest of the sixteen.** The
  // same `line` spanned 0-6 in the terminal and 1-5 here, so the first sample
  // sat on the bottom edge in one arm and floated in the other: not a
  // rasterisation difference but a different scale, and no single decision held
  // it because both arms drew something plausible.
  // **Non-null by construction**, since a family of `null` returned above and
  // `figureFor` answers `null` for nothing else. Stated as a guard rather than
  // threaded as `?.`, because the marks walk needs the object and an optional
  // chain would say the refusal is decided in two places when it is decided in
  // one.
  const figure = figureFor(block);
  if (figure === null) return null;
  const range = figure.value?.range ?? figure.extent ?? { min: 0, max: 1 };
  const axis = figure.value;
  const box = area(layout, figure.legend);

  // **Furniture is not a picture**, and this is the second clause because it is
  // a second failure. `series: []` on a plain form, and a series that is all
  // `null`, both reach here with a range nobody declared — `seriesRange`
  // returns `null` and the `?? { min: 0, max: 1 }` above furnishes an axis out
  // of nothing. Drawn, that is five gridlines labelled 0 to 1 over an empty
  // box: a plot of a range the block never had.
  const body = marks(block, figure, layout, theme);
  if (body.length === 0) return null; // cells-ok — a count of SVG elements

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(layout.width)} ${n(layout.height)}" ` +
      `width="${n(layout.width)}" height="${n(layout.height)}">`,
  ];
  // **The ground is painted rather than inherited**, and it is the one place
  // this arm cannot follow `resolveBase`: a theme declaring `background:
  // "inherit"` means *the terminal's own background shows*, and an SVG has no
  // terminal underneath it. So the surface resolves directly.
  const ground = inkOf(GROUND, theme);
  if (ground !== undefined) parts.push(`<rect width="100%" height="100%" fill="${ground}"/>`);

  // **The labels place themselves.** `text-anchor="end"` at the gutter's right
  // edge, and nothing here knows or asks how wide the string is — which is the
  // whole of hazard 4's answer, visible in one attribute.
  //
  // A matrix has no value axis to tick: its ordinate is the series and its
  // readings are the colours, which is C12's own ruling for a field form.
  const rule = inkOf(RULE, theme);
  const label = inkOf(LABEL, theme);
  // **The value axis is not always `y`, and the first frame read said so.**
  //
  // A horizontal distribution runs its values left to right — the terminal's
  // `bandedForm` and every reference draw it that way — and this loop drew
  // horizontal gridlines with the numbers down the gutter regardless. The
  // geometry was right and the **axis labelled the other direction**: a box at
  // 6 with a rule marked 6 running across it, and both normalised, so the
  // numbers looked plausible against a figure they did not describe.
  //
  // Nothing in the rows caught it. Every one asserts a position against the
  // *area*, and the furniture is inside the area either way.
  // **The value axis is the figure's, and this is D11 and F274 closing at
  // once** (§3ak.10 S2). What stood here was
  // `svgFamilyOf(block.form) === "distribution" && block.orientation !== "vertical"` —
  // a **third** answer to which way the values run, beside `positionalDecisions`'
  // fixed `"vertical"` and `orientationOf`'s read of the block, and scoped to
  // the family the defect was noticed in. Measured on a `bar` at the terminal's
  // default orientation, which is horizontal: gridlines **across**, the gutter
  // reading `10 15 20 25`, values running the other way — and
  // `orientation: "vertical"` gave byte-identical output, so the arm ignored the
  // member entirely.
  //
  // **Closed by construction rather than repaired.** A scoping clause can only
  // be wrong where there is a clause, and the emitters decided this already.
  const valueOnX = figure.orientation === "horizontal" && axis !== null;
  // **`tiles` has no value axis either**, and the frame is what said so: a
  // treemap drew ticks at 0, 0.25, 0.5, 0.75, 1 — furnished by
  // `seriesRange([]) ?? {0,1}` out of a block with no series — beside a figure
  // whose readings are **areas**. That is C12's own ruling for a field form
  // (*its ordinate is the series and its readings are the colours*) arriving at
  // the family whose readings are sizes.
  // **The third family said the same thing, so the decision moved** (C12 I60,
  // §3ak). `matrix`, `tiles` and `nodes` each furnished an axis out of
  // `seriesRange([]) ?? {0,1}` — over readings that are colours, areas and
  // structure — and each was found by reading a frame, one family at a time.
  // Three renderers reaching the same wrong answer separately is the seam being
  // in the wrong place, so this arm no longer decides it: `HAS_VALUE_AXIS` does,
  // for both arms, over every form rather than over the three this one claims.
  // **`value === null` IS the answer now**, where this read a record keyed by
  // form. The record is still right and still total; what changed is that the
  // figure already applied it, so there is no second lookup to disagree with the
  // first (C12 I60).
  // **The border is the figure's, and `"none"` is one of its five values**
  // (C12 I67, §3ak.19, D9). This arm drew no frame at all, on 14 of the
  // matrix's open cells; the terminal draws four shapes and none. Each is the
  // same rectangle's edges, so the style names which of them land.
  if (rule !== undefined && figure.frame !== "none") {
    const edge = (x1: number, y1: number, x2: number, y2: number): string =>
      `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${rule}" stroke-width="1"/>`;
    if (figure.frame === "corners") {
      // **A tick of each edge at each corner**, which is what `┌ ┐ └ ┘` alone
      // are: the terminal draws the glyph and has no length to choose, so the
      // length is this arm's and the *shape* is the figure's. §2's legitimate
      // column, and the reason this is not a disagreement.
      const c = Math.min(12, (box.right - box.left) / 8, (box.bottom - box.top) / 8);
      for (const [x, sx] of [[box.left, 1], [box.right, -1]] as const) {
        for (const [y, sy] of [[box.top, 1], [box.bottom, -1]] as const) {
          parts.push(edge(x, y, x + c * sx, y), edge(x, y, x, y + c * sy));
        }
      }
    } else {
      // `rule` is a left rule and a bottom rule — what shipped before
      // `plotFrame` existed — and `box` and `grid` close the rectangle.
      parts.push(edge(box.left, box.top, box.left, box.bottom));
      parts.push(edge(box.left, box.bottom, box.right, box.bottom));
      if (figure.frame !== "rule") {
        parts.push(edge(box.right, box.top, box.right, box.bottom));
        parts.push(edge(box.left, box.top, box.right, box.top));
      }
    }
  }

  // **Interior rules are `"grid"` and nothing else** (C12 I67, §3ak.19, D6).
  // This arm drew one per tick unconditionally, which *is* the grid style
  // applied to every plot — so D6 was never a ruling about gridlines, it was
  // this member having no reader. The terminal draws `┄` at every value tick
  // and `┊` at every position tick; **both ways**, and drawing one was half of
  // what the style means.
  const gridded = figure.frame === "grid";
  if (axis !== null && rule !== undefined && label !== undefined) {
    for (const [i, tick] of axis.ticks.entries()) {
      // **The string is the figure's** (D5). `String(tick)` printed `1` where
      // the terminal printed `1.0`, and `0.6000000000000001` where its uniform
      // precision gave `0.6` — one axis, two spellings, both plausible.
      const text = axis.labels[i] ?? String(tick);
      // **The rule and the label answer to different members**, which is why
      // they are no longer pushed together. A rule is `frame`; a label on the
      // value axis is `valueLabels`, and on the position axis `positionAxis`.
      // `yAxis: false` removes the labels and keeps the frame — a sentence
      // neither member could say while one call drew both.
      if (valueOnX) {
        const x = box.left + (box.right - box.left) * normalisedOf(tick, range, false);
        if (gridded) {
          parts.push(`<line x1="${n(x)}" y1="${n(box.top)}" x2="${n(x)}" y2="${n(box.bottom)}" ` +
            `stroke="${rule}" stroke-width="1"/>`);
        }
        if (figure.valueLabels !== null) {
          parts.push(`<text x="${n(x)}" y="${n(box.bottom + SVG_FONT_SIZE)}" text-anchor="middle" ` +
            `font-size="${n(SVG_FONT_SIZE)}" font-family="monospace" fill="${label}">` +
            `${escape(text)}</text>`);
        }
        continue;
      }
      const y = box.top + (box.bottom - box.top) * normalisedOf(tick, range, true);
      if (gridded) {
        parts.push(`<line x1="${n(box.left)}" y1="${n(y)}" x2="${n(box.right)}" y2="${n(y)}" ` +
          `stroke="${rule}" stroke-width="1"/>`);
      }
      // **Both sides where the block asked for both**, which the terminal has
      // had since I47 and this arm could not express: `"left"`, `"right"` and
      // `"both"` are one member and the same ticks, never a second scale.
      const sides = figure.valueLabels === null ? []
        : figure.valueLabels === "both" ? ["left", "right"] as const
        : [figure.valueLabels];
      for (const side of sides) {
        const at = side === "left" ? box.left - 6 : box.right + 6;
        parts.push(`<text x="${n(at)}" y="${n(y + SVG_FONT_SIZE / 3)}" ` +
          `text-anchor="${side === "left" ? "end" : "start"}" ` +
          `font-size="${n(SVG_FONT_SIZE)}" font-family="monospace" fill="${label}">` +
          `${escape(text)}</text>`);
      }
    }
  }

  // **The position axis is a member now, and it was drawn by nothing before**
  // (C12 I67, §3ak.19, D8). A curve's abscissa runs `0 … n-1` and this arm drew
  // no x labels at all; `positionAxis` says whether the row exists and
  // `xLabels` — three strings, given rather than derived — is inside the
  // resolver, so a caller that supplied them gets them here too.
  if (figure.positionAxis && !valueOnX && label !== undefined && block.xLabels !== undefined) {
    const [first, mid, last] = block.xLabels;
    const spots = [[box.left, first, "start"], [(box.left + box.right) / 2, mid, "middle"],
                   [box.right, last, "end"]] as const;
    for (const [x, text, anchor] of spots) {
      if (text === "") continue;
      parts.push(`<text x="${n(x)}" y="${n(box.bottom + SVG_FONT_SIZE)}" text-anchor="${anchor}" ` +
        `font-size="${n(SVG_FONT_SIZE)}" font-family="monospace" fill="${label}">` +
        `${escape(text)}</text>`);
    }
  }

  // **The identity axis, and the strings are the figure's while the room is not**
  // (C12 I63, I67, §3ak.20, D10). The terminal guts its categories in a column
  // sized to the longest label **in cells**; this arm has no metrics and sizes
  // to a tenth of the width, deliberately. So what crosses is the list and the
  // *side* — the gutter holds the identity exactly when the values run along the
  // other axis, which `valueOnX` already answered from `orientation` — and the
  // width stays each arm's own. That is I63's ruling with the identity gutter as
  // its second subject rather than a treemap tile.
  //
  // **`nodes` and `tiles` name themselves inside the figure** and are excluded:
  // their labels are `text` marks placed by the walk, so drawing the identity
  // here as well would name every tile twice.
  const named = figure.identity.filter((i) => i !== "");
  const slots = named.length; // cells-ok — an identity slot count, not a width
  // **`ROW_IS_AN_IDENTITY` is the gate, and drawing without it made the cell
  // worse rather than better** — `line.identityLabels` went 12/70 to 70/70 on
  // the first attempt. A curve's `identity` is its **series**, which the
  // terminal names in the legend and never in the gutter; a bar's is its
  // categories, which it guts. `FB1` records that the two lists are one thing
  // for the curve family and two for the bar family, and this is the same fact
  // deciding where the strings land.
  //
  // **The record is the terminal's own** — *one row, column or band per name the
  // caller supplied* — read rather than restated, so there is no second answer
  // to disagree with the first. `tiles` and `nodes` are `false` in it already,
  // which is also why they are not excluded by name here: their labels are
  // `text` marks placed by the walk.
  // **And the field family, which the record excludes for a different
  // question's reason** (F325). `ROW_IS_AN_IDENTITY` answers *does each row get
  // its own palette slot* — `definition.ts` reads it exactly three times, all
  // `refOf(series[0], … ? i : 0)` — and it is `false` for a field because a
  // field row is a position rather than a name the caller supplied. That is
  // right, and it is not the gutter's question: the terminal captions a field's
  // ordinate `0 1 2 3 4 5` down the left, from those same strings. Named as an
  // exception rather than duplicated into a 46-entry table that would agree with
  // the first in 44 places.
  const captionsRows = ROW_IS_AN_IDENTITY[block.form] || svgFamilyOf(block.form) === "field";
  if (figure.gutter && slots > 0 && label !== undefined && captionsRows) {
    for (const [i, text] of named.entries()) {
      const t = (i + 0.5) / slots;
      // **`axis === null` is a family with no value axis, and its identity
      // indexes rows** (F325). The frame is what said so: a heatmap's five row
      // names came out at `y = 300`, evenly spaced along a **90-column** figure
      // — `row0` under column 9, `row4` under column 81, naming nothing — while
      // the terminal draws them down the left, one per band. **The matrix
      // reported `agree`**, because both readers return the same five strings
      // and neither asks where they landed.
      //
      // The old condition was `valueOnX` alone, which is `orientation ===
      // "horizontal" && axis !== null`; a matrix declares `ORIENTATION_UNUSED`
      // and has no axis, so it fell to the *else* — a placeholder value and an
      // absent one deciding a question neither was asked.
      if (valueOnX || axis === null) {
        // Values along x, so the identity owns the gutter: one label per row,
        // right-aligned against the plot area exactly as the terminal's is.
        const y = box.top + (box.bottom - box.top) * t;
        parts.push(
          `<clipPath id="i${block.id}-${String(i)}"><rect x="0" y="${n(y - SVG_FONT_SIZE)}" ` +
            `width="${n(box.left - 6)}" height="${n(SVG_FONT_SIZE * 2)}"/></clipPath>`,
          `<text x="${n(box.left - 6)}" y="${n(y + SVG_FONT_SIZE / 3)}" text-anchor="end" ` +
            `clip-path="url(#i${block.id}-${String(i)})" font-size="${n(SVG_FONT_SIZE)}" ` +
            `font-family="monospace" fill="${label}">${escape(text)}</text>`,
        );
        continue;
      }
      const x = box.left + (box.right - box.left) * t;
      parts.push(
        `<text x="${n(x)}" y="${n(box.bottom + SVG_FONT_SIZE)}" text-anchor="middle" ` +
          `font-size="${n(SVG_FONT_SIZE)}" font-family="monospace" fill="${label}">` +
          `${escape(text)}</text>`,
      );
    }
  }

  // **The legend, placed** (C12 I67, §3ak.19, D13). `legendSlots` composed these
  // entries from the first commit of the pass and nothing drew them: the member
  // returned the same list for `legend: false` as for `legend: "right"`, so an
  // arm consuming it would have drawn a legend the author refused. It carries
  // the request now and this is where the request is honoured.
  //
  // **`"right"` where the block said nothing**, which is the terminal's default
  // for the reason C04 records — the only placement that can size itself to its
  // content and so turn itself on. The auto-enable itself stays in the terminal,
  // because one of its clauses reads `caps.colourDepth` and this arm has no rung.
  // **`placement: null` means the author said nothing, and *nothing* is not
  // *yes***. Drawing whenever there were slots put a legend on every
  // single-series curve — `line.legend` 26/70 to 46/70 — because the terminal
  // auto-enables only where a legend is **load-bearing**: more than one thing
  // drawn into shared cells with no adjacent label, which is `SHARES_CELLS`.
  //
  // The clause that cannot cross is the rung — `legendPlacement` also suppresses
  // below the colour floor, where a positional stack writes its names in the
  // gutter — and this arm has no floor, so it takes the part that is a form fact
  // and leaves the part that is a capability. **One record, read by both.**
  const legend = figure.legend;
  const wanted = legend !== null
    && (legend.placement !== null || (SHARES_CELLS[block.form] && legend.slots.length > 1)); // cells-ok — a legend entry count
  if (legend !== null && wanted && legend.slots.length > 0 && label !== undefined) { // cells-ok — a legend entry count
    const place = legend.placement ?? "right";
    const swatch = SVG_FONT_SIZE * 0.8;
    const step = SVG_FONT_SIZE * 1.6;
    const sideways = place === "left" || place === "right";
    const originX = place === "right" ? box.right + 12 : place === "left" ? 6 : box.left;
    const originY = place === "above" ? box.top - step * legend.slots.length : place === "below" // cells-ok — a legend entry count
      ? box.bottom + SVG_FONT_SIZE * 2
      : box.top + SVG_FONT_SIZE;
    // **This arm does not draw annotations, so its legend must not name one**
    // (F259). `legendSlots` composes the terminal's list — candles, series, then
    // the annotations, which are claims *about* the data — and this path drops
    // annotations rather than refusing, because the picture it leaves is a
    // correct curve with a claim missing from beside it. Naming the claim in the
    // legend puts it back as a lie: `G8f` caught exactly that.
    //
    // **A per-arm filter of a shared list is not a second decision.** The figure
    // says what the legend contains; each arm names what it drew, and the gap is
    // the annotation disagreement already on the record rather than a new one.
    const shown = legend.slots.filter((sl) => sl.role !== "annotation");
    for (const [i, slot] of shown.entries()) {
      const ink = inkOf(slot.ref, theme);
      if (ink === undefined) continue;
      const x = sideways ? originX : originX + i * (SVG_FONT_SIZE * 8);
      const y = sideways ? originY + i * step : originY;
      parts.push(
        `<rect x="${n(x)}" y="${n(y - swatch)}" width="${n(swatch)}" height="${n(swatch)}" fill="${ink}"/>`,
        // **The reading beside the name, where the slot carries one** (§3ak.26
        // finding 5). A pie's legend is `swatch label 65%` in both arms; a
        // radar's has no reading and the member is absent rather than empty.
        `<text x="${n(x + swatch + 4)}" y="${n(y)}" text-anchor="start" ` +
          `font-size="${n(SVG_FONT_SIZE)}" font-family="monospace" fill="${label}">` +
          `${escape(slot.value === undefined ? slot.label : `${slot.label} ${slot.value}`)}</text>`,
      );
    }
  }

  parts.push(...body, "</svg>");
  return parts.join("\n");
}
