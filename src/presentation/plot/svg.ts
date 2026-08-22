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
import { normalisedSummary, quartileRange, type NormalisedSummary } from "../../data/viewmodel/distribution.js";
import { normalisedOf, type PinnedRange } from "../../data/viewmodel/range.js";
import { seriesRange } from "./scale.js";
import { niceAxis } from "./axes.js";
import { COLORMAPS, continuousColour } from "../theme/colormap.js";
import { resolve } from "../theme/resolve.js";
import type { ColourRef, ResolvedTheme } from "../theme/types.js";
import { refOf } from "./marks.js";
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
export type SvgFamily = "curve" | "scatter" | "bar" | "matrix" | "distribution";

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
  // *Hierarchy and topology*: position comes from structure, not from a value.
  flame: null, icicle: null, treemap: null, tree: null, graph: null,
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

/** The plot area in px, from the layout's fractions. Never a cell count. */
function area(layout: SvgLayout): Readonly<{ left: number; right: number; top: number; bottom: number }> {
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
 * **A distribution's range comes from its own datum, and there are two.**
 *
 * `seriesRange` reads `block.series`, and a boxplot's is `[]` — the summaries
 * are the data (C04 I57's shape, one field along). So the family's range is
 * `quartileRange`, in the arm the terminal uses: the whisker arm for a box and
 * the interval arm for a forest plot.
 *
 * **Except `dumbbell`**, whose datum is two `series` paired by index rather
 * than a summary at all. Its *coordinate* is the family's — positions on one
 * axis from one range — which is why it is in the family; its datum is not,
 * which is why this is a function rather than a line in `plotToSvg`.
 *
 * **No pin.** `seriesRange` applies `yMin`/`yMax` and this does not, because
 * the terminal's boxplot arm does not either: it writes `yMin: lo, yMax: hi`
 * over whatever the author set. **The arms match, and whether that overwrite is
 * right is a separate question** — recorded rather than answered here, because
 * answering it in one arm is how the two come to disagree.
 */
function rangeFor(block: Plot): PinnedRange | null {
  if (svgFamilyOf(block.form) !== "distribution" || block.form === "dumbbell") {
    return seriesRange(block.series, block);
  }
  return quartileRange(block.quartiles ?? [], block.form === "forest");
}

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
function marks(block: Plot, range: PinnedRange, layout: SvgLayout, theme: ResolvedTheme): readonly string[] {
  const family = svgFamilyOf(block.form);
  const box = area(layout);
  const out: string[] = [];

  if (family === "matrix") {
    const map = COLORMAPS[block.colormap ?? "viridis"];
    const rows = block.series.length; // cells-ok — a series count
    const cols = block.series.reduce((m, r) => Math.max(m, r.values.length), 0); // cells-ok — a column count
    if (map === undefined || rows === 0 || cols === 0) return out;
    const w = (box.right - box.left) / cols;
    const h = (box.bottom - box.top) / rows;
    for (const [r, series] of block.series.entries()) {
      for (const [c, v] of series.values.entries()) {
        if (v === null || !Number.isFinite(v)) continue;
        // **The shared coordinate, spent on colour.** `invert` is false: a
        // matrix reads low-to-high up the map rather than up the page.
        const t = normalisedOf(v, range, false);
        const colour = continuousColour(map, t, SVG_CAPS);
        if (colour === undefined || colour.kind !== "rgb") continue;
        out.push(
          `<rect x="${n(box.left + c * w)}" y="${n(box.top + r * h)}" width="${n(w)}" height="${n(h)}" ` +
            `fill="${colour.hex}"/>`,
        );
      }
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
    if (family === "curve") {
      const d = curvePath(points, block.form === "step" || block.form === "ecdf");
      if (d !== "") out.push(`<path d="${d}" fill="none" stroke="${ink}" stroke-width="2"/>`);
      continue;
    }
    if (family === "scatter") {
      for (const p of points) {
        if (p !== null) out.push(`<circle cx="${n(p[0])}" cy="${n(p[1])}" r="3" fill="${ink}"/>`);
      }
      continue;
    }
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

  const range = rangeFor(block) ?? { min: 0, max: 1 };
  const axis = niceAxis(range, 5, block);
  const box = area(layout);

  // **Furniture is not a picture**, and this is the second clause because it is
  // a second failure. `series: []` on a plain form, and a series that is all
  // `null`, both reach here with a range nobody declared — `seriesRange`
  // returns `null` and the `?? { min: 0, max: 1 }` above furnishes an axis out
  // of nothing. Drawn, that is five gridlines labelled 0 to 1 over an empty
  // box: a plot of a range the block never had.
  const body = marks(block, range, layout, theme);
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
  if (svgFamilyOf(block.form) !== "matrix" && rule !== undefined && label !== undefined) {
    for (const tick of axis.ticks) {
      if (valueOnX) {
        const x = box.left + (box.right - box.left) * normalisedOf(tick, range, false);
        parts.push(
          `<line x1="${n(x)}" y1="${n(box.top)}" x2="${n(x)}" y2="${n(box.bottom)}" ` +
            `stroke="${rule}" stroke-width="1"/>`,
          `<text x="${n(x)}" y="${n(box.bottom + SVG_FONT_SIZE)}" text-anchor="middle" ` +
            `font-size="${n(SVG_FONT_SIZE)}" font-family="monospace" fill="${label}">` +
            `${escape(String(tick))}</text>`,
        );
        continue;
      }
      const y = box.top + (box.bottom - box.top) * normalisedOf(tick, range, true);
      parts.push(
        `<line x1="${n(box.left)}" y1="${n(y)}" x2="${n(box.right)}" y2="${n(y)}" ` +
          `stroke="${rule}" stroke-width="1"/>`,
        `<text x="${n(box.left - 6)}" y="${n(y + SVG_FONT_SIZE / 3)}" text-anchor="end" ` +
          `font-size="${n(SVG_FONT_SIZE)}" font-family="monospace" fill="${label}">` +
          `${escape(String(tick))}</text>`,
      );
    }
  }

  parts.push(...body, "</svg>");
  return parts.join("\n");
}
