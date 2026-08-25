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
import { normalisedSummary, type NormalisedSummary } from "../../data/viewmodel/distribution.js";
import { strips, tiles } from "./hierarchy.js";
import { flatten } from "./tree.js";
import { graphLayers } from "./graph.js";
import { normalisedOf, type PinnedRange } from "../../data/viewmodel/range.js";

import { COLORMAPS, continuousColour } from "../theme/colormap.js";
import { resolve } from "../theme/resolve.js";
import type { ColourRef, ResolvedTheme } from "../theme/types.js";
import { refOf } from "./marks.js";
import {
  barFigure,
  curveFigure,
  distributionFigure,
  matrixFigure,
  nodesDecisions,
  scatterFigure,
  tilesFigure,
  type Drawn,
  type Figure,
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
export type SvgFamily = "curve" | "scatter" | "bar" | "matrix" | "distribution" | "tiles" | "nodes";

export const SVG_FAMILY = {
  // **Curve** — samples in order, joined. `step` differs only in the path
  // command, which is rasterisation and not geometry.
  line: "curve", sparkline: "curve", step: "curve", ecdf: "curve",
  density: "curve", autocorrelation: "curve",

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
  waterfall: null, streamgraph: null, stackedarea: null,
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
  // *Its own domain*: a date grid, a time span, a category ring, an angle.
  calendar: null, gantt: null, timeline: null, pie: null, radar: null,
  waffle: null, funnel: null,
  // *Paired or banded*: two positions per datum, or a band ladder.
  //
  // `forest` and `dumbbell` are the distribution family's other two — a forest
  // plot is an interval and an estimate, a dumbbell is two positions and a
  // connector, and both are `normalisedSummary`'s members. `slope`, `bullet`
  // and `horizon` are not: a slope's two positions are on **two axes**, a
  // bullet carries qualitative bands behind its measure, and a horizon is a
  // band ladder folded over one row.
  slope: null, dumbbell: "distribution", forest: "distribution", bullet: null, horizon: null,
  // *A composition of other forms*, so it is whatever they are.
  smallmultiples: null, pairplot: null,
  // *A field with layers over it* — the arrows and contours are a second
  // geometry the matrix family does not carry.
  contour: null, quiver: null,
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
    default: return null;
  }
}

/** A number with three decimals, so the output is byte-stable across platforms. */
function n(v: number): string {
  return (Math.round(v * 1000) / 1000).toString();
}

/**
 * A plot's samples in the SVG's pixel space — **from the shared coordinate**.
 *
 * `normalisedOf` is the same function `rowOf` calls, so the two paths cannot
 * disagree about where a value sits: one multiplies by `rows - 1` and rounds,
 * the other multiplies by a pixel height and does not. **That is §3aj G5** —
 * only the rasterisation differs — and it is asserted rather than described.
 */
export function svgPoints(
  values: readonly (number | null)[],
  range: PinnedRange,
  layout: SvgLayout,
): readonly (readonly [number, number] | null)[] {
  const left = layout.width * (layout.gutter + layout.pad);
  const right = layout.width * (1 - layout.pad);
  const top = layout.height * layout.pad;
  const bottom = layout.height * (1 - layout.gutter);
  const span = Math.max(1, values.length - 1); // cells-ok — a sample count
  return values.map((v, i) => {
    if (v === null || !Number.isFinite(v)) return null;
    const x = left + ((right - left) * i) / span;
    // `invert` is `true` because a curve's values face up and SVG's y grows
    // down — the same fact `FACING_DEFAULT` carries for the terminal path,
    // spelled here because L0 does not hold `Facing` (§3ac).
    const y = top + (bottom - top) * normalisedOf(v, range, true);
    return [x, y] as const;
  });
}

/** The plot area in px. Never a cell count. */
type Area = Readonly<{ left: number; right: number; top: number; bottom: number }>;

/** The plot area in px, from the layout's fractions. Never a cell count. */
function area(layout: SvgLayout): Area {
  return {
    left: layout.width * (layout.gutter + layout.pad),
    right: layout.width * (1 - layout.pad),
    top: layout.height * layout.pad,
    bottom: layout.height * (1 - layout.gutter),
  };
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
function projected(figure: Omit<Figure, "marks">, box: Area): (x: number, y: number) => readonly [number, number] {
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

/**
 * A figure's marks as SVG elements — **the walk that replaces a loop per
 * family** (§3ak.10).
 *
 * **Nothing here reads the form to decide *what* is drawn**, which is the whole
 * of the change: a rect is a rect whether it came from a bar, a heatmap cell or
 * a treemap tile, and the two members that vary its appearance — a `value` to
 * spend on the ramp, a `size` to spend on a radius — are on the mark rather than
 * in a table keyed by form. The form is read twice below and both are
 * rasterisation (§3aj hazard 1): which polyline joint a step takes, and which
 * ramp a matrix reads.
 *
 * **A colour is resolved here and never crosses the seam** (I62). `ref` is an
 * explicit slot and `seriesIndex` is the categorical ladder's; a mark with
 * neither is furniture, which is `xTitleRow`'s own reason — *furniture is not a
 * series*.
 */
function walk(figure: Figure, block: Plot, box: Area, theme: ResolvedTheme, out: string[]): readonly string[] {
  const at = projected(figure, box);
  const map = COLORMAPS[block.colormap ?? "viridis"];
  const furniture = inkOf(LABEL, theme);
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
      // **Dashed, for `annotate.ts`' own reason**: a reference line is a claim
      // *about* the ordinate drawn beside the data, and a solid rule crossing
      // five series reads as a sixth. The terminal draws `┄` and the legend
      // swatch it already shares says the same thing (C04 I52).
      out.push(
        `<path d="${path}${m.closed === true ? " Z" : ""}" fill="none" stroke="${ink}" ` +
          `stroke-width="${annotation ? "1" : "2"}"${annotation ? ' stroke-dasharray="4 3"' : ""}/>`,
      );
      continue;
    }

    if (m.kind === "point") {
      // **`absent` draws nothing, and that is the role's entire content here**
      // (I62). A forest row with no estimate is a real state the terminal has a
      // character for; this arm's equivalent of that character is not a circle
      // at the fallback position, which is the plausible wrong figure the role
      // exists to refuse.
      if (m.role === "absent") continue;
      const [cx, cy] = at(m.x, m.y);
      // **A bubble's radius is data and this scale is not** (§3aj hazard 1,
      // §3ak.1 finding 2). The size arrives normalised against its own series'
      // maximum — `bubbleRows`' own figure — and the terminal spends it on 0 to
      // 2 dots. The floor of 2 px is what its radius-0 single dot is: a sample
      // with no size still draws.
      const r = m.size === undefined ? 3 : 2 + 5 * m.size;
      out.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${ink}"/>`);
      continue;
    }

    if (m.kind === "rect") {
      const a = at(m.x, m.y);
      const b = at(m.x + m.w, m.y + m.h);
      // **Two corners and a bounding box, so every flip is the projector's.**
      // Mapping a corner and a size separately would need the walk to know which
      // way each axis runs — the second copy of `facing` this function exists to
      // remove.
      const x = Math.min(a[0], b[0]);
      const y = Math.min(a[1], b[1]);
      const w = Math.abs(b[0] - a[0]);
      const h = Math.abs(b[1] - a[1]);
      let fill = ink;
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
      out.push(
        `<rect x="${n(x)}" y="${n(y)}" width="${n(Math.max(w, 0.5))}" height="${n(Math.max(h, 0.5))}" ` +
          `fill="${fill}"/>`,
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

/** A slot along the categorical axis, and the half-width the figure takes in it. */
function slotOf(index: number, count: number, from: number, to: number): Readonly<{ centre: number; half: number }> {
  // **Three fifths of the slot**, which is `boxplotColumn`'s own ruling and
  // matplotlib's `widths=0.6`: categories drawn to the full slot touch, and a
  // categorical axis whose categories touch is not saying they are separate.
  // The terminal takes the same fraction and rounds it to cells; this does not
  // round at all, which is the whole of the difference (§3aj hazard 1).
  const slot = (to - from) / Math.max(1, count); // cells-ok — a category count
  return { centre: from + slot * (index + 0.5), half: (slot * 0.6) / 2 };
}

/**
 * One summary, across a categorical slot.
 *
 * **One function and a flag where the terminal keeps two glyph tables.**
 * `boxplotColumn` and `boxplotBand` are the same figure transposed, and the
 * tables exist because a cell's glyph for a corner is not its own transpose.
 * Here the transpose is a coordinate swap, so it is `vertical` and nothing else.
 */
function summaryMarks(
  ns: NormalisedSummary,
  slot: Readonly<{ centre: number; half: number }>,
  value: Readonly<{ from: number; to: number }>,
  vertical: boolean,
  ink: string,
  furniture: string,
): readonly string[] {
  const out: string[] = [];
  // The value axis runs bottom-to-top when vertical and left-to-right when not,
  // which is the only inversion in this family — and it is the renderer's, not
  // the coordinate's (§3aj hazard 1).
  const at = (t: number): number =>
    vertical ? value.to - (value.to - value.from) * t : value.from + (value.to - value.from) * t;

  const box = (a: number, b: number, across: number, thick: number, attrs: string): void => {
    const lo = Math.min(a, b);
    const len = Math.abs(b - a);
    const [x, y, w, h] = vertical
      ? [across - thick / 2, lo, thick, len]
      : [lo, across - thick / 2, len, thick];
    out.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(Math.max(w, 0.5))}" height="${n(Math.max(h, 0.5))}" ${attrs}/>`);
  };
  const capAt = (v: number): void => {
    const [x, y, w, h] = vertical
      ? [slot.centre - slot.half / 2, v - 0.5, slot.half, 1]
      : [v - 0.5, slot.centre - slot.half / 2, 1, slot.half];
    out.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${furniture}"/>`);
  };
  const dot = (t: number, r: number, colour: string): void => {
    const [cx, cy] = vertical ? [slot.centre, at(t)] : [at(t), slot.centre];
    out.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${colour}"/>`);
  };

  // Whiskers, then their caps, then the box over both, then the median over
  // that — the glyph tables' own order, so a cap coincident with an edge reads
  // the way it reads in the terminal.
  box(at(ns.min), at(ns.q1), slot.centre, 1, `fill="${furniture}"`);
  box(at(ns.q3), at(ns.max), slot.centre, 1, `fill="${furniture}"`);
  // **A cap runs ACROSS the slot at a value**, which is the other axis from
  // everything above it. The first draft passed the slot's two edges as `a`/`b`
  // and the value as `across`, so `box` — which reads `a`/`b` along the value
  // axis — drew every cap **rotated ninety degrees**. Inside the plot area,
  // inside its own category, and a caps-and-whiskers figure with the caps
  // running the wrong way: exactly what a containment assertion agrees with.
  for (const cap of [ns.min, ns.max]) capAt(at(cap));

  box(at(ns.q1), at(ns.q3), slot.centre, slot.half * 2, `fill="${ink}" fill-opacity="0.35" stroke="${ink}" stroke-width="1.5"`);
  box(at(ns.median), at(ns.median), slot.centre, slot.half * 2, `fill="${ink}"`);

  // **The mean only where the summary has one.** `ns.mean` is absent for *no
  // mean* and for a non-finite one, which is the distinction the shared summary
  // keeps so three renderers do not each write the condition (C04 I53).
  // **A diamond in the series colour, which is what the terminal draws.** The
  // first version put a grey circle here — `tone.muted`, the furniture slot —
  // and a grey circle inside a filled box is not visible, which the frame said
  // and no row could. The terminal's answer is `◈` in the series' own colour:
  // **same colour as the outliers, different shape**, so the two are told apart
  // by form rather than by a second tone (C12 I33, C04 I53).
  if (ns.mean !== undefined) {
    const r = Math.max(2, slot.half * 0.3);
    const [cx, cy] = vertical ? [slot.centre, at(ns.mean)] : [at(ns.mean), slot.centre];
    out.push(
      `<polygon points="${n(cx)},${n(cy - r)} ${n(cx + r)},${n(cy)} ${n(cx)},${n(cy + r)} ${n(cx - r)},${n(cy)}" ` +
        `fill="${ink}" stroke="${furniture}" stroke-width="0.75"/>`,
    );
  }
  for (const o of ns.outliers) dot(o, Math.max(1, slot.half * 0.22), ink);
  return out;
}

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
 * One forest row: a confidence interval, tees at each end, and an estimate.
 *
 * **The estimate is sized by weight** (C12 I31): a wide interval drawn small
 * contributed little and a narrow one drawn large carried the result, which is
 * the reading a forest plot exists for. No weight is the smallest mark, so an
 * ordinary summary still draws a point.
 */
function forestMarks(
  ns: NormalisedSummary,
  slot: Readonly<{ centre: number; half: number }>,
  value: Readonly<{ from: number; to: number }>,
  vertical: boolean,
  ink: string,
  furniture: string,
  pooled: boolean,
  weight: number | undefined,
): readonly string[] {
  const out: string[] = [];
  const at = (t: number): number =>
    vertical ? value.to - (value.to - value.from) * t : value.from + (value.to - value.from) * t;
  const rect = (x: number, y: number, w: number, h: number, colour: string): void => {
    out.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(Math.max(w, 0.5))}" height="${n(Math.max(h, 0.5))}" fill="${colour}"/>`);
  };

  const lo = Math.min(at(ns.lower), at(ns.upper));
  const hi = Math.max(at(ns.lower), at(ns.upper));
  if (vertical) rect(slot.centre - 0.5, lo, 1, hi - lo, furniture);
  else rect(lo, slot.centre - 0.5, hi - lo, 1, furniture);
  for (const end of [lo, hi]) {
    if (vertical) rect(slot.centre - slot.half / 2, end - 0.5, slot.half, 1, furniture);
    else rect(end - 0.5, slot.centre - slot.half / 2, 1, slot.half, furniture);
  }

  const w = weight !== undefined && Number.isFinite(weight) ? Math.max(0, Math.min(1, weight)) : 0;
  const r = Math.max(2.5, slot.half * (0.25 + 0.55 * w));
  const [cx, cy] = vertical ? [slot.centre, at(ns.centre)] : [at(ns.centre), slot.centre];
  // A pooled estimate is a diamond, which is what says *this one is the answer*.
  out.push(
    pooled
      ? `<polygon points="${n(cx)},${n(cy - r)} ${n(cx + r)},${n(cy)} ${n(cx)},${n(cy + r)} ${n(cx - r)},${n(cy)}" fill="${ink}"/>`
      : `<rect x="${n(cx - r)}" y="${n(cy - r)}" width="${n(r * 2)}" height="${n(r * 2)}" fill="${ink}"/>`,
  );
  return out;
}

/**
 * A form's marks, by family.
 *
 * **One function per family and not one per form**, because the forms inside a
 * family differ only in what they put at a position the shared coordinate
 * already gave them — a joined path, a mark, a rectangle, a painted cell.
 */
function marks(
  block: Plot,
  figure: Figure | Omit<Figure, "marks">,
  range: PinnedRange,
  layout: SvgLayout,
  theme: ResolvedTheme,
): readonly string[] {
  const family = svgFamilyOf(block.form);
  const box = area(layout);
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
  if ((family === "curve" || family === "scatter" || family === "matrix") && "marks" in figure) {
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
      // **`outline` is an indented text listing and not a node placement.**
      // Drawing it as boxes would be a different figure from the terminal's,
      // which is the plausible wrong figure the `null` arm refuses.
      if (wanted === "outline") return out;
      const flat = flatten(root);
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

  if (family === "tiles") {
    const root = block.hierarchy;
    // **Refused where the terminal takes its other arm.** `flame` and `icicle`
    // fall back to `legacyDepthBars` when there is no `hierarchy` — a bar chart
    // of depths, which is the bar family's geometry and not this one. Drawing
    // tiles for it would be a different figure from the terminal's.
    if (root === undefined) return out;

        const w = box.right - box.left;
    const h = box.bottom - box.top;
    const ground = inkOf(GROUND, theme);
    const ink0 = inkOf(LABEL, theme);

    /**
     * A node's name inside its own rectangle, **clipped by SVG rather than
     * measured** (§3aj hazard 4).
     *
     * The terminal truncates a label to the cells its tile has, which it can do
     * because it measures text. This cannot and must not: a `<clipPath>` is the
     * renderer's own mechanism, so the label places itself *and* stops itself,
     * and nothing here asks how wide the string is.
     *
     * **The frame is what said the labels were missing.** Every row asserted
     * rectangles and every one passed; a treemap with no names is a colour
     * chart.
     */
    const named = (id: string, x: number, y: number, tw: number, th: number, text: string): void => {
      if (text === "" || ink0 === undefined || th < SVG_FONT_SIZE) return;
      out.push(
        `<clipPath id="${id}"><rect x="${n(x)}" y="${n(y)}" width="${n(tw)}" height="${n(th)}"/></clipPath>`,
        `<text x="${n(x + 3)}" y="${n(y + SVG_FONT_SIZE)}" clip-path="url(#${id})" ` +
          `font-size="${n(SVG_FONT_SIZE)}" font-family="monospace" fill="${ground ?? ink0}">` +
          `${escape(text)}</text>`,
      );
    };

    if (block.form === "treemap") {
      // **A pixel's worth of padding, expressed on the unit square** — which is
      // the terminal's own rule at its own resolution: it passes
      // `1 / max(width, areaRows)`, one cell. Resolution-independent by
      // construction, so the two arms inset by the same *proportion* of the
      // figure and differ only in what a unit is.
      const placed = [...tiles(root, 1 / Math.max(w, h))].sort((a, b) => a.depth - b.depth);
      for (const t of placed) {
        const ink = inkOf(refOf(t.index), theme);
        if (ink === undefined) continue;
        // **Depth order, painted over** — a parent is drawn and then its
        // children are drawn on top, which is how nesting reads without a
        // border per node. The sort above is what makes that true.
        out.push(
          `<rect x="${n(box.left + t.x0 * w)}" y="${n(box.top + t.y0 * h)}" ` +
            `width="${n(Math.max((t.x1 - t.x0) * w, 0.5))}" height="${n(Math.max((t.y1 - t.y0) * h, 0.5))}" ` +
            `fill="${ink}" stroke="${ground ?? ink}" stroke-width="1"/>`,
        );
        named(
          `t${block.id}-${String(t.index)}`,
          box.left + t.x0 * w, box.top + t.y0 * h,
          (t.x1 - t.x0) * w, (t.y1 - t.y0) * h,
          t.label,
        );
      }
      return out;
    }

    // **`flame` grows up from depth 0 and `icicle` grows down from it**, which
    // is the terminal's `inverted` flag read from its own source rather than
    // from what reads naturally: `rowFor` is `areaRows - 1 - depth` for a flame
    // and `depth` for an icicle. Getting this from the convention rather than
    // from the code is how family 1's orientation default came out transposed.
    const inverted = block.form === "icicle";
    const placed = strips(root);
    const depth = placed.reduce((m, st) => Math.max(m, st.depth), 0); // cells-ok — a depth count
    const band = h / (depth + 1);
    for (const st of placed) {
      const ink = inkOf(refOf(st.index), theme);
      if (ink === undefined) continue;
      const y = inverted ? box.top + st.depth * band : box.bottom - (st.depth + 1) * band;
      out.push(
        `<rect x="${n(box.left + st.from * w)}" y="${n(y)}" ` +
          `width="${n(Math.max((st.to - st.from) * w, 0.5))}" height="${n(Math.max(band - 1, 0.5))}" ` +
          `fill="${ink}"/>`,
      );
      named(
        `s${block.id}-${String(st.index)}`,
        box.left + st.from * w, y,
        (st.to - st.from) * w, band - 1,
        st.label,
      );
    }
    return out;
  }

  if (family === "distribution") {
    // **Horizontal unless asked, which is the terminal's default and therefore
    // this arm's.** The first draft read `!== "horizontal"`, so an unset
    // `orientation` drew vertically here and horizontally there — the same
    // block, the same theme, transposed between the arms. `definition.ts`
    // routes a boxplot to `bandedForm` unless `orientation === "vertical"`, and
    // a forest plot is rows of studies in every reference there is.
    const vertical = block.orientation === "vertical";
    const value = vertical ? { from: box.top, to: box.bottom } : { from: box.left, to: box.right };
    const across = vertical ? { from: box.left, to: box.right } : { from: box.top, to: box.bottom };
    const furniture = inkOf(LABEL, theme);
    if (furniture === undefined) return out;

    if (block.form === "dumbbell") {
      // **Two series paired by index**, the family's other datum. The
      // coordinate is shared and the shape it reads is not.
      const [a, b] = [block.series[0], block.series[1]];
      const inkA = inkOf(refOf(0), theme);
      const inkB = inkOf(refOf(1), theme);
      if (a === undefined || b === undefined || inkA === undefined || inkB === undefined) return out;
      const count = Math.min(a.values.length, b.values.length); // cells-ok — a category count
      const pos = (v: number): number =>
        vertical
          ? value.to - (value.to - value.from) * normalisedOf(v, range, false)
          : value.from + (value.to - value.from) * normalisedOf(v, range, false);
      for (let i = 0; i < count; i += 1) {
        const va = a.values[i];
        const vb = b.values[i];
        if (va === null || vb === null || va === undefined || vb === undefined) continue;
        const slot = slotOf(i, count, across.from, across.to);
        const [pa, pb] = [pos(va), pos(vb)];
        const lo = Math.min(pa, pb);
        const len = Math.abs(pb - pa);
        const [x, y, w, h] = vertical
          ? [slot.centre - 0.75, lo, 1.5, len]
          : [lo, slot.centre - 0.75, len, 1.5];
        out.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(Math.max(w, 0.5))}" height="${n(Math.max(h, 0.5))}" fill="${furniture}"/>`);
        for (const [p, colour] of [[pa, inkA], [pb, inkB]] as const) {
          const [cx, cy] = vertical ? [slot.centre, p] : [p, slot.centre];
          out.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="3.5" fill="${colour}"/>`);
        }
      }
      return out;
    }

    const qs = block.quartiles ?? [];
    for (const [i, q] of qs.entries()) {
      const ink = inkOf(refOf(i), theme);
      if (ink === undefined) continue;
      // **A forest plot is not a five-number box**, and drawing it as one is
      // the plausible wrong figure: an interval and a point estimate rendered
      // as quartiles measures, rasterises and reads as a summary of samples.
      // Caught by a position row, not by containment — the box sat in the
      // middle third of an area the interval spans end to end.
      if (block.form === "forest") {
        out.push(...forestMarks(
          normalisedSummary(q, range),
          slotOf(i, qs.length, across.from, across.to), // cells-ok — a category count
          value,
          vertical,
          ink,
          furniture,
          q.pooled === true,
          q.weight,
        ));
        continue;
      }
      out.push(...summaryMarks(
        normalisedSummary(q, range),
        slotOf(i, qs.length, across.from, across.to), // cells-ok — a category count
        value,
        vertical,
        ink,
        furniture,
      ));
    }
    return out;
  }

  for (const [si, series] of block.series.entries()) {
    const points = svgPoints(series.values, range, layout);
    // **The terminal arm's own slot chooser**, and `refOf` is `marks.ts`'s: the
    // legend a reader compares the figure against is drawn from this same call,
    // so the two arms cannot give series three different colours.
    const ink = inkOf(refOf(si), theme);
    if (ink === undefined) continue;
    if (family === "bar") {
      // **The baseline is zero where the range contains it, and the floor
      // otherwise** — because a bar's length *is* its value, so signed data
      // grows both ways from zero.
      //
      // **The first draft used `normalisedOf(range.min, …)`, which is not a
      // coordinate at all**: it is `1` by construction, so the expression was
      // `box.bottom` written the long way round. A mutation replacing it with
      // `box.bottom` changed nothing and survived — and that survivor is what
      // said the line was dead arithmetic wearing the shared layer's clothes.
      const zero = range.min <= 0 && range.max >= 0 ? 0 : range.min;
      const base = box.top + (box.bottom - box.top) * normalisedOf(zero, range, true);
      const slot = (box.right - box.left) / Math.max(1, points.length); // cells-ok — a sample count
      const w = Math.max(1, slot * 0.7);
      for (const [i, p] of points.entries()) {
        if (p === null) continue;
        const x = box.left + slot * i + (slot - w) / 2;
        const top = Math.min(p[1], base);
        const height = Math.max(0.5, Math.abs(base - p[1]));
        out.push(
          block.form === "lollipop" || block.form === "dotplot"
            ? `<circle cx="${n(x + w / 2)}" cy="${n(p[1])}" r="3" fill="${ink}"/>`
            : `<rect x="${n(x)}" y="${n(top)}" width="${n(w)}" height="${n(height)}" fill="${ink}"/>`,
        );
      }
    }
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
  block: Plot,
  theme: ResolvedTheme,
  layout: SvgLayout = SVG_DEFAULT_LAYOUT,
): string | null {
  if (svgFamilyOf(block.form) === null) return null;

  // **A datum this path cannot see is a refusal, not a blank** (F259).
  //
  // `ohlc` is the candles' own data and nothing here reads it. A `line` with
  // `plotStyle: "candlestick"` therefore took the curve arm, found `series: []`
  // — which is legal precisely because plain candles are the ordinary case
  // (C04 I57) — and drew **a fully furnished plot with an axis running 0 to 1**
  // while the terminal drew three candles over 8 to 16.
  //
  // **And the moving-average case is worse than the empty one.** A non-empty
  // `series` beside `ohlc` is an average *over* the candles, so the range came
  // from the average alone: ticks 11 to 12 against data spanning 8 to 16. Not a
  // blank frame a reader questions but **a confident chart of the wrong thing**,
  // which is the plausible wrong figure the `null` arm exists to refuse.
  if (block.ohlc !== undefined) return null;

  // **A flipped ordinate is the same class, found by asking the same question**
  // (F259). `svgPoints` passes `invert: true` unconditionally — the comment
  // beside it says it is spelling `FACING_DEFAULT` out because L0 does not hold
  // `Facing` — so **all four `origin` values produce byte-identical output**,
  // measured. A block asking for a top-left origin draws flipped in the
  // terminal and unflipped here: the same data, upside down between the arms.
  //
  // Refused rather than honoured, because honouring it is the families' work
  // and a wrong-way-up chart is a plausible wrong figure today.
  if (block.origin !== undefined && block.origin !== ORIGIN_DEFAULT[block.form]) return null;

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
  const box = area(layout);

  // **Furniture is not a picture**, and this is the second clause because it is
  // a second failure. `series: []` on a plain form, and a series that is all
  // `null`, both reach here with a range nobody declared — `seriesRange`
  // returns `null` and the `?? { min: 0, max: 1 }` above furnishes an axis out
  // of nothing. Drawn, that is five gridlines labelled 0 to 1 over an empty
  // box: a plot of a range the block never had.
  const body = marks(block, figure, range, layout, theme);
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
  const valueOnX = svgFamilyOf(block.form) === "distribution" && block.orientation !== "vertical";
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
  if (axis !== null && rule !== undefined && label !== undefined) {
    for (const [i, tick] of axis.ticks.entries()) {
      // **The string is the figure's** (D5). `String(tick)` printed `1` where
      // the terminal printed `1.0`, and `0.6000000000000001` where its uniform
      // precision gave `0.6` — one axis, two spellings, both plausible.
      const text = axis.labels[i] ?? String(tick);
      if (valueOnX) {
        const x = box.left + (box.right - box.left) * normalisedOf(tick, range, false);
        parts.push(
          `<line x1="${n(x)}" y1="${n(box.top)}" x2="${n(x)}" y2="${n(box.bottom)}" ` +
            `stroke="${rule}" stroke-width="1"/>`,
          `<text x="${n(x)}" y="${n(box.bottom + SVG_FONT_SIZE)}" text-anchor="middle" ` +
            `font-size="${n(SVG_FONT_SIZE)}" font-family="monospace" fill="${label}">` +
            `${escape(text)}</text>`,
        );
        continue;
      }
      const y = box.top + (box.bottom - box.top) * normalisedOf(tick, range, true);
      parts.push(
        `<line x1="${n(box.left)}" y1="${n(y)}" x2="${n(box.right)}" y2="${n(y)}" ` +
          `stroke="${rule}" stroke-width="1"/>`,
        `<text x="${n(box.left - 6)}" y="${n(y + SVG_FONT_SIZE / 3)}" text-anchor="end" ` +
          `font-size="${n(SVG_FONT_SIZE)}" font-family="monospace" fill="${label}">` +
          `${escape(text)}</text>`,
      );
    }
  }

  parts.push(...body, "</svg>");
  return parts.join("\n");
}
