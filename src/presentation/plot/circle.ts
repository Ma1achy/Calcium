/**
 * Pie and radar — the two circle forms, drawn in the braille dot grid.
 *
 * **The dot grid rather than the cell grid, and that is the whole of this
 * file.** Both forms used to stroke their curves with `strokePolyline`, whose
 * steps are axis-aligned by construction: correct for a line chart, where a
 * segment is a shallow slope across many columns, and a rectilinear staircase
 * for anything at an arbitrary angle. A circle drawn that way is a blocky
 * polygon, five spokes drawn that way fill the interior with steps — which is
 * why the spokes were left out rather than fixed, and the objection was
 * recorded about them while the ring and the polygons had the same defect.
 * Braille gives 2 dot columns and 4 dot rows per cell, so a diagonal has twice
 * the horizontal and four times the vertical resolution and reads smooth.
 *
 * **A dot is square, which is why the figures come out round.** A terminal cell
 * is about twice as tall as it is wide, so a dot is half a cell across and a
 * quarter of one down — the same size on both axes. A circle of equal dot radii
 * is therefore visually round, and that one statement replaces the `rx = 2 *
 * ry` arithmetic the cell-space version carried in two places and derived
 * twice.
 *
 * **The width is spent on a legend, because the radius cannot spend it.** A
 * disc of `h` rows is `2h` columns wide and no wider without becoming an
 * ellipse, so at 80 columns and 10 rows sixty columns are not the circle's to
 * use. They name the segments instead (C12 §3g's `"right"` placement, the only
 * one that costs width rather than a declared row).
 */
import type { Segment, Series } from "../../data/viewmodel/index.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";
import { BRAILLE_DOTS, createGrid, drawLine, foldBraille, foldSolid, setDot, type Grid } from "./raster.js";
import { glyphs } from "../blocks/glyphs.js";
import { pad, padStart } from "../blocks/paint.js";
import { cells, truncate } from "../text.js";
import { extentFor, extentRun, pairFor } from "./ramp.js";
import { QUAD_BL, QUAD_BR, QUAD_TL, QUAD_TR, quadrantGlyph } from "./linedraw.js";
import { niceAxis } from "./axes.js";

type Caps = Pick<TerminalCapabilities, "unicode" | "ambiguousWidth" | "colourDepth">;

const TAU = Math.PI * 2;

/** Twelve o'clock — where the first segment and the first category both begin. */
const START_ANGLE = -Math.PI / 2;

/** Cells between the figure and the legend beside it. */
export const LEGEND_GAP = 2;

/** Below this the legend goes and the disc takes the whole width. */
const MIN_DISC_CELLS = 8;

/** The rings a radar draws inside its outer one — matplotlib's 20/40/60/80. */
const VALUE_RINGS: readonly number[] = Object.freeze([0.2, 0.4, 0.6, 0.8]);


/**
 * The smallest ring worth drawing, in dots.
 *
 * A ring of three dots' radius is five stippled dots around the centre, which
 * reads as dirt rather than as a gridline — so the inner rings drop out as the
 * figure shrinks instead of the figure filling with specks.
 */
const MIN_RING_DOTS = 4;


// --- geometry ---------------------------------------------------------------

/**
 * The disc, in **dots**, computed once and never derived a second time.
 *
 * The outline used to be measured in cell space and the fill in dot space, each
 * with its own centre and its own radius, so the boundary sat beside the
 * interior rather than around it. One radius, because a dot is square.
 */
type Disc = Readonly<{ cx: number; cy: number; r: number; dotWidth: number; dotHeight: number }>;

/** The disc centred on `centreCol`, a cell coordinate that may fall between cells. */
function discAt(centreCol: number, gridCells: number, gridRows: number, radius: number): Disc {
  return {
    cx: centreCol * BRAILLE_DOTS.x + (BRAILLE_DOTS.x - 1) / 2,
    cy: (gridRows * BRAILLE_DOTS.y - 1) / 2,
    r: radius,
    dotWidth: Math.max(1, gridCells) * BRAILLE_DOTS.x,
    dotHeight: Math.max(1, gridRows) * BRAILLE_DOTS.y,
  };
}

/**
 * The largest radius the area admits, in dots.
 *
 * `marginRows` buys room outside the figure — the radar spends one row on the
 * category labels above and below it, and a label on the row the ring occupies
 * is a label nobody can read.
 */
function radiusFor(areaWidth: number, areaRows: number, marginRows: number): number {
  const byHeight = (areaRows * BRAILLE_DOTS.y - 1) / 2 - marginRows * BRAILLE_DOTS.y;
  const byWidth = (areaWidth * BRAILLE_DOTS.x - 1) / 2;
  return Math.max(1, Math.min(byHeight, byWidth));
}

/** The cells a disc of this radius occupies across. */
function discCellsFor(radius: number, areaWidth: number): number {
  return Math.min(areaWidth, Math.ceil((2 * radius + 1) / BRAILLE_DOTS.x));
}

/** A point `t` of the way out from the centre, at `angle`. */
function at(d: Disc, angle: number, t: number): readonly [number, number] {
  return [d.cx + d.r * t * Math.cos(angle), d.cy + d.r * t * Math.sin(angle)];
}

/**
 * An arc, dot by dot, one dot apart along its length.
 *
 * **The spacing was a parameter and the stipple it existed for is gone.** The
 * value rings stepped every fourth dot on §3g's rule that a scale drawn as
 * heavily as the data competes with it — an argument about weight answered by
 * leaving holes, where `tone.muted` against the series' slots already separates
 * them. A ring is continuous now, and a knob nothing turns is a knob the next
 * reader has to check.
 */
function arcDots(grid: Grid, d: Disc, t: number, from: number, to: number): void {
  const radius = Math.max(1, d.r * t);
  const step = 1 / radius;
  for (let a = from; a <= to; a += step) {
    const [x, y] = at(d, a, t);
    setDot(grid, Math.round(x), Math.round(y));
  }
}

// --- strokes ----------------------------------------------------------------

/** A stroke style: dots on, then dots off, measured along the run. */
type Dash = Readonly<{ on: number; off: number }>;

const SOLID_DASH: Dash = Object.freeze({ on: 1, off: 0 });

/**
 * Eight stroke styles, one per palette slot — C12 I25 for a line.
 *
 * Reached by index rather than named at a call site, and paired with
 * `CATEGORY_PATTERNS` below: a series is the same slot in both ladders, so what
 * identifies it in the figure identifies it in the legend.
 */
const STROKE_DASHES: readonly Dash[] = Object.freeze([
  SOLID_DASH,
  Object.freeze({ on: 6, off: 3 }),
  Object.freeze({ on: 2, off: 2 }),
  Object.freeze({ on: 10, off: 4 }),
  Object.freeze({ on: 1, off: 3 }),
  Object.freeze({ on: 4, off: 4 }),
  Object.freeze({ on: 8, off: 2 }),
  Object.freeze({ on: 2, off: 6 }),
]);

/**
 * A run of dots between two points, dashed by length along the run.
 *
 * **The dash is measured along the segment and never read off the
 * coordinates.** A predicate over `(x, y)` is the cheaper implementation and it
 * is degenerate on exactly the lines a radar draws: `(x + y) % 4` is constant
 * along an anti-diagonal, so one edge of a five-sided polygon comes out solid
 * and the edge beside it vanishes entirely.
 */
function strokeDashed(
  grid: Grid,
  from: readonly [number, number],
  to: readonly [number, number],
  dash: Dash,
): void {
  const [x0, y0] = from;
  const [x1, y1] = to;
  const span = Math.hypot(x1 - x0, y1 - y0);
  if (span === 0) {
    setDot(grid, Math.round(x0), Math.round(y0));
    return;
  }
  if (dash.off === 0) {
    drawLine(grid, x0, y0, x1, y1);
    return;
  }
  for (let s = 0; s < span; s += dash.on + dash.off) {
    const a = s / span;
    const b = Math.min(1, (s + dash.on) / span);
    drawLine(grid, x0 + (x1 - x0) * a, y0 + (y1 - y0) * a, x0 + (x1 - x0) * b, y0 + (y1 - y0) * b);
  }
}

// --- marks ------------------------------------------------------------------

/**
 * Eight dot patterns, one per palette slot — C12 I25's braille arm.
 *
 * I25 asks for a mark ladder because four forms drew one glyph for every
 * category and were unreadable without colour. A braille fill has no glyph to
 * vary: the mark **is** the dot pattern, and varying it is the same statement
 * in the vocabulary this file draws in. Applied only where colour cannot
 * separate the segments, because a solid wedge is what a pie looks like.
 *
 * The first slot is solid, so the common case of a plot with one thing in it is
 * unhatched whatever the depth.
 */
type DotPattern = (x: number, y: number) => boolean;

const SOLID: DotPattern = () => true;

const CATEGORY_PATTERNS: readonly DotPattern[] = Object.freeze([
  SOLID,
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x, _y) => x % 2 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (x - y + 12) % 3 === 0,
  (x, y) => x % 2 === 0 && y % 2 === 0,
  (x, y) => (x + y) % 4 === 0,
]);

function patternFor(index: number, caps: Caps): DotPattern {
  if (caps.colourDepth !== 1) return SOLID;
  return CATEGORY_PATTERNS[index % CATEGORY_PATTERNS.length] ?? SOLID; // cells-ok — a pattern count
}

function dashFor(index: number, caps: Caps): Dash {
  if (caps.colourDepth !== 1) return SOLID_DASH;
  return STROKE_DASHES[index % STROKE_DASHES.length] ?? SOLID_DASH; // cells-ok — a style count
}

/** One cell of a pattern, for a legend swatch: the mark the fill is made of. */
function patternSwatch(pattern: DotPattern): string {
  const grid = createGrid(BRAILLE_DOTS.x, BRAILLE_DOTS.y);
  for (let y = 0; y < BRAILLE_DOTS.y; y += 1) {
    for (let x = 0; x < BRAILLE_DOTS.x; x += 1) {
      if (pattern(x, y)) setDot(grid, x, y);
    }
  }
  return foldBraille(grid)[0] ?? " ";
}

/** A short run of a stroke style, for a legend swatch — the line, sampled. */
function dashSwatch(dash: Dash, wide: number): string {
  const grid = createGrid(wide * BRAILLE_DOTS.x, BRAILLE_DOTS.y);
  const mid = 1;
  strokeDashed(grid, [0, mid], [wide * BRAILLE_DOTS.x - 1, mid], dash);
  return foldBraille(grid).join("");
}

// --- the legend -------------------------------------------------------------

/**
 * A run of text and the palette slot it carries; `-1` is unstyled.
 *
 * The pie's legend, the pie's ASCII rows and the radar's ASCII rows are all
 * this shape: the renderer decides the text and which slot owns it, and the
 * caller — which holds the theme — turns a slot into a style.
 */
export type MarkedText = Readonly<{ text: string; index: number }>;

export type LegendEntryOf = Readonly<{ swatch: string; label: string; value: string; index: number }>;

export type SegmentLegend = Readonly<{ width: number; lines: readonly (readonly MarkedText[])[] }>;

export const NO_SEGMENT_LEGEND: SegmentLegend = Object.freeze({ width: 0, lines: Object.freeze([]) });

/**
 * The legend block: swatch, label, and an optional value, one entry per row.
 *
 * Capped at a third of the width, which is `categoricalForm`'s existing bound
 * and T3.3's ladder — labels are dropped before the figure is starved. More
 * entries than rows truncates with a count, reusing I8's wording.
 */
export function segmentLegend(
  entries: readonly LegendEntryOf[],
  rows: number,
  budget: number,
  caps: Caps,
): SegmentLegend {
  const count = entries.length; // cells-ok — an entry count
  if (count === 0 || rows <= 0) return NO_SEGMENT_LEGEND;

  const ambiguous = caps.ambiguousWidth;
  const swatchW = entries.reduce((m, e) => Math.max(m, cells(e.swatch, ambiguous)), 0);
  const valueW = entries.reduce((m, e) => Math.max(m, cells(e.value, ambiguous)), 0);
  const natural = entries.reduce((m, e) => Math.max(m, cells(e.label, ambiguous)), 0);
  const spare = budget - swatchW - 1 - (valueW > 0 ? valueW + 1 : 0);
  if (spare < 1) return NO_SEGMENT_LEGEND;

  const labelW = Math.min(natural, spare);
  const width = swatchW + 1 + labelW + (valueW > 0 ? valueW + 1 : 0);
  const gap = " ".repeat(LEGEND_GAP);

  const shown = count <= rows ? count : Math.max(0, rows - 1);
  const dropped = count - shown;
  const top = Math.max(0, Math.floor((rows - shown - (dropped > 0 ? 1 : 0)) / 2));

  const lines: (readonly MarkedText[])[] = Array.from({ length: rows }, () => []);
  for (let i = 0; i < shown; i += 1) {
    const e = entries[i]!;
    const label = pad(truncate(e.label, labelW, caps), labelW, ambiguous);
    const tail = valueW > 0 ? ` ${padStart(e.value, valueW, ambiguous)}` : "";
    lines[top + i] = [
      { text: gap, index: -1 },
      { text: `${pad(e.swatch, swatchW, ambiguous)} ${label}${tail}`, index: e.index },
    ];
  }
  if (dropped > 0) {
    const more = `${glyphs(caps).residue} ${String(dropped)} more`;
    lines[top + shown] = [{ text: `${gap}${truncate(more, width, caps)}`, index: -1 }];
  }
  return { width, lines };
}

// --- the pie ----------------------------------------------------------------

export type PieLayer = Readonly<{ glyphRows: readonly string[]; segmentIndex: number }>;

/**
 * Everything the pie is: one braille layer per segment, a legend beside it, and
 * where the one ends and the other begins.
 *
 * **One entry point rather than four**, because every one of them needs the
 * same disc and the file's opening rule is that the geometry is computed once.
 * `discWidth` is what the caller composites the layers over; the legend lines
 * carry their own leading gap and follow.
 */
export type PieRender = Readonly<{
  layers: readonly PieLayer[];
  legend: readonly (readonly MarkedText[])[];
  discWidth: number;
}>;

type Slice = Readonly<{ label: string; fraction: number; originalIndex: number }>;

/**
 * Minimum-segment ruling: below some fraction a slice is less than a dot wide,
 * and drawing it is a lie. The threshold depends on the radius.
 */
function minSegmentFraction(radius: number): number {
  const circumference = TAU * radius;
  return circumference > 0 ? 1 / circumference : 1;
}

function slicesOf(segments: readonly Segment[], radius: number): readonly Slice[] {
  const total = segments.reduce((a, sg) => a + Math.max(0, sg.value), 0);
  if (total <= 0) return [];

  const minFrac = minSegmentFraction(radius);
  const visible: Slice[] = [];
  let otherFrac = 0;
  for (let i = 0; i < segments.length; i += 1) { // cells-ok — a segment count
    const sg = segments[i]!;
    const frac = Math.max(0, sg.value) / total;
    if (frac < minFrac) otherFrac += frac;
    else visible.push({ label: sg.label, fraction: frac, originalIndex: i });
  }
  if (otherFrac > 0) {
    visible.push({ label: "other", fraction: otherFrac, originalIndex: segments.length }); // cells-ok — a segment count
  }
  return visible;
}

/**
 * A wedge, filled dot by dot.
 *
 * **Solid, and the sparse dither it replaces read as noise.** Every dot inside
 * the radius and inside the angular range is set; the pattern is the identity
 * mark and is `SOLID` wherever colour can do the separating.
 */
function fillWedge(
  grid: Grid,
  d: Disc,
  start: number,
  end: number,
  pattern: DotPattern,
): void {
  const r2 = d.r * d.r;
  const x0 = Math.max(0, Math.floor(d.cx - d.r));
  const x1 = Math.min(d.dotWidth - 1, Math.ceil(d.cx + d.r));
  const y0 = Math.max(0, Math.floor(d.cy - d.r));
  const y1 = Math.min(d.dotHeight - 1, Math.ceil(d.cy + d.r));

  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = x - d.cx;
      const dy = y - d.cy;
      if (dx * dx + dy * dy > r2) continue;
      let a = Math.atan2(dy, dx);
      while (a < start) a += TAU;
      if (a <= end && pattern(x, y)) setDot(grid, x, y);
    }
  }
}

/** The percentage a fraction reads as, for a legend. */
function percent(fraction: number): string {
  return `${String(Math.round(fraction * 100))}%`;
}

export function pieRender(
  segments: readonly Segment[],
  areaWidth: number,
  areaRows: number,
  caps: Caps,
  /**
   * Block glyphs at cell resolution rather than braille dots (C12 I43, §3w).
   *
   * **Every wedge is computed exactly as before and only the fold changes**, so
   * the two arms cannot disagree about where a boundary is. Coarser, and with
   * no inter-dot gaps at all — the trade the braille arm makes in the other
   * direction.
   */
  solid = false,
): PieRender {
  const w = Math.max(0, Math.floor(areaWidth));
  const h = Math.max(0, Math.floor(areaRows));
  const empty: PieRender = { layers: [], legend: [], discWidth: Math.max(1, w) };
  if (w === 0 || h === 0) return empty;

  const radius = radiusFor(w, h, 0);
  const slices = slicesOf(segments, radius);
  if (slices.length === 0) return empty; // cells-ok — a slice count

  const legend = segmentLegend(
    slices.map((s) => ({
      // **The swatch is the vocabulary the wedge is drawn in.** A braille key
      // beside a block-glyph disc names the right colour with the wrong mark,
      // which is what a legend exists to stop.
      swatch: solid ? pairFor(caps).filled : patternSwatch(patternFor(s.originalIndex, caps)),
      label: s.label,
      value: percent(s.fraction),
      index: s.originalIndex,
    })),
    h,
    Math.floor(w / 3),
    caps,
  );

  // **The composition is centred, not the disc.** Centring the disc in what the
  // legend leaves puts twenty blank columns between the figure and the words
  // about it, which is the same complaint as sixty blank columns beside a
  // circle — one place further along.
  const discCells = discCellsFor(radius, w);
  const room = w - legend.width - LEGEND_GAP;
  const withLegend = legend.width > 0 && room >= Math.max(MIN_DISC_CELLS, discCells);
  const leftPad = withLegend
    ? Math.max(0, Math.floor((w - discCells - LEGEND_GAP - legend.width) / 2))
    : Math.max(0, Math.floor((w - discCells) / 2));
  const discWidth = withLegend ? leftPad + discCells : w;
  const disc = discAt(leftPad + (discCells - 1) / 2, discWidth, h, radius);

  const layers: PieLayer[] = [];
  let angle = START_ANGLE;
  for (const s of slices) {
    const grid = createGrid(disc.dotWidth, disc.dotHeight);
    const end = angle + s.fraction * TAU;
    fillWedge(grid, disc, angle, end, patternFor(s.originalIndex, caps));
    // **The two radial edges and the arc, solid whatever the fill is.** A wedge
    // narrower than the sampling grid would otherwise draw nothing at all, and
    // at one bit the edges are what separates two hatches that meet.
    strokeDashed(grid, at(disc, angle, 0), at(disc, angle, 1), SOLID_DASH);
    strokeDashed(grid, at(disc, end, 0), at(disc, end, 1), SOLID_DASH);
    arcDots(grid, disc, 1, angle, end);
    layers.push({
      glyphRows: solid ? foldSolid(grid, pairFor(caps).filled) : foldBraille(grid),
      segmentIndex: s.originalIndex,
    });
    angle = end;
  }

  return {
    layers,
    legend: withLegend ? legend.lines : Array.from({ length: h }, () => []),
    discWidth,
  };
}

/**
 * The pie at ASCII: one row per segment — mark, label, share, bar.
 *
 * **Degradation preserves meaning, not appearance.** The waffle this replaces
 * drew a hundred identical `#` with no way to tell one segment from the next,
 * at a row count that did not match the block's declared height; a labelled
 * proportion carries the whole of what a pie says, which is how the parts
 * divide the total.
 */
export function pieAsciiRows(
  segments: readonly Segment[],
  width: number,
  areaRows: number,
  caps: Caps,
): readonly (readonly MarkedText[])[] {
  const w = Math.max(0, Math.floor(width));
  const h = Math.max(0, Math.floor(areaRows));
  const blank: readonly (readonly MarkedText[])[] = Array.from({ length: h }, () => []);
  if (w === 0 || h === 0) return blank;

  const slices = slicesOf(segments, radiusFor(w, h, 0));
  if (slices.length === 0) return blank; // cells-ok — a slice count

  const ambiguous = caps.ambiguousWidth;
  const mark = glyphs(caps).filled;
  const ext = extentFor(caps);
  const markW = cells(mark, ambiguous);
  const valueW = slices.reduce((m, s) => Math.max(m, cells(percent(s.fraction), ambiguous)), 0);
  const natural = slices.reduce((m, s) => Math.max(m, cells(s.label, ambiguous)), 0);
  const labelW = Math.max(1, Math.min(natural, Math.floor(w / 3)));
  const barW = Math.max(0, w - markW - labelW - valueW - 3);

  const shown = slices.length <= h ? slices.length : Math.max(0, h - 1); // cells-ok — a slice count
  const dropped = slices.length - shown; // cells-ok — a slice count
  const top = Math.max(0, Math.floor((h - shown - (dropped > 0 ? 1 : 0)) / 2));
  const lines: (readonly MarkedText[])[] = Array.from({ length: h }, () => []);

  for (let i = 0; i < shown; i += 1) {
    const s = slices[i]!;
    const label = pad(truncate(s.label, labelW, caps), labelW, ambiguous);
    const bar = barW > 0 ? ` ${pad(extentRun(s.fraction, barW, ext), barW, ambiguous)}` : "";
    lines[top + i] = [
      { text: `${mark} ${label} ${padStart(percent(s.fraction), valueW, ambiguous)}${bar}`, index: s.originalIndex },
    ];
  }
  if (dropped > 0) {
    lines[top + shown] = [{ text: truncate(`${glyphs(caps).residue} ${String(dropped)} more`, w, caps), index: -1 }];
  }
  return lines;
}

// --- the radar --------------------------------------------------------------

/**
 * The radar, whole: one layer per series, the frame under them, the category
 * labels around them, and a legend when there is more than one reading to tell
 * apart.
 */
export type RadarRender = Readonly<{
  polygons: readonly (readonly string[])[];
  frame: readonly string[];
  labels: readonly string[];
  legend: readonly (readonly MarkedText[])[];
  discWidth: number;
  /** The line arm's composed figure, owners and all — absent for braille. */
  figure?: readonly (readonly MarkedText[])[];
}>;

/** The scale a radar is read against — a round ceiling, so the rings are round. */
function radarCeiling(series: readonly Series[]): number {
  const all = series.flatMap((ss) =>
    ss.values.filter((v): v is number => v !== null && Number.isFinite(v)),
  );
  const top = Math.max(...all, 0);
  if (!(top > 0)) return 1;
  return niceAxis({ min: 0, max: top }, 6, {}).range.max;
}

/**
 * The frame: the outer ring, the value rings inside it, and one spoke per
 * category.
 *
 * **The spokes are here because the staircase is gone.** They were left out
 * when a stroke could only step north/south/east/west — five of them inside a
 * seventeen-by-nine figure filled the interior with steps and the polygons
 * became unreadable — and that objection was about the drawing vocabulary
 * rather than about the spokes.
 *
 * The value rings are stippled and the outer one is not: the outer ring is the
 * boundary and the rings inside it are a scale, and a scale drawn as heavily as
 * the data is a scale that competes with it.
 */
function frameRows(
  d: Disc,
  categories: readonly string[],
  /** The ring shape (C12 I45, §3w) — an *n*-gon through the axes, or a circle. */
  gridShape: "polygon" | "circle" = "polygon",
): readonly string[] {
  const grid = createGrid(d.dotWidth, d.dotHeight);
  const n = categories.length; // cells-ok — a category count

  /**
   * One value ring, at `t` of the radius.
   *
   * **The polygon runs through the same vertices the data does**, so the ring
   * is a ruler the shape can be read against along its whole length rather than
   * at *n* points. Below three axes there is no polygon to draw — two vertices
   * are a line and one is a point — so the circle is the only ring available
   * and the shape falls back to it.
   */
  const ringAt = (t: number): void => {
    if (gridShape === "circle" || n < 3) { // cells-ok — a category count
      arcDots(grid, d, t, 0, TAU);
      return;
    }
    for (let i = 0; i < n; i += 1) { // cells-ok — a vertex count
      const a = START_ANGLE + (TAU * i) / n;
      const b = START_ANGLE + (TAU * ((i + 1) % n)) / n; // cells-ok — a vertex count
      strokeDashed(grid, at(d, a, t), at(d, b, t), SOLID_DASH);
    }
  };

  // **Continuous, and the weight is carried by colour** (C12 I43, §3w). The
  // rings stepped every fourth dot and the spokes dashed two-on-two-off, on
  // §3g's rule that a scale drawn as heavily as the data competes with it —
  // which is an argument about *weight* and was answered by leaving holes. A
  // stippled ring does not read as a lighter ring; it reads as a broken one.
  // The frame is `tone.muted` and the polygons carry their series' slots, so
  // the separation is already there and the scale can be a scale.
  ringAt(1);
  for (const t of VALUE_RINGS) {
    if (d.r * t >= MIN_RING_DOTS) ringAt(t);
  }
  for (let i = 0; i < n; i += 1) {
    const a = START_ANGLE + (TAU * i) / n;
    strokeDashed(grid, [d.cx, d.cy], at(d, a, 1), SOLID_DASH);
  }
  return foldBraille(grid);
}

/**
 * The category labels, placed around the ring in **cells**.
 *
 * Alignment follows the angle: a label to the right of the figure starts at its
 * anchor, one to the left ends there, and one at the top or the bottom is
 * centred on it. Anything else puts the word across the ring it names.
 */
function labelRows(
  d: Disc,
  categories: readonly string[],
  gridCells: number,
  gridRows: number,
  caps: Caps,
): readonly string[] {
  const slots: string[][] = Array.from({ length: gridRows }, () =>
    Array.from({ length: gridCells }, () => " "),
  );
  const n = categories.length; // cells-ok — a category count
  const ambiguous = caps.ambiguousWidth;
  const cxCells = d.cx / BRAILLE_DOTS.x;
  const cyCells = d.cy / BRAILLE_DOTS.y;
  const rxCells = d.r / BRAILLE_DOTS.x;
  const ryCells = d.r / BRAILLE_DOTS.y;
  const budget = Math.max(1, Math.floor(gridCells / 3));

  for (let i = 0; i < n; i += 1) {
    const a = START_ANGLE + (TAU * i) / n;
    const text = truncate(categories[i] ?? "", budget, caps);
    const textW = cells(text, ambiguous);
    if (textW === 0) continue;
    const anchorX = cxCells + (rxCells + 1.5) * Math.cos(a);
    const anchorY = cyCells + (ryCells + 0.75) * Math.sin(a);
    const row = Math.max(0, Math.min(gridRows - 1, Math.round(anchorY)));
    const cos = Math.cos(a);
    const wanted =
      cos > 0.25
        ? Math.round(anchorX)
        : cos < -0.25
          ? Math.round(anchorX) - textW
          : Math.round(anchorX - textW / 2);
    const start = Math.max(0, Math.min(gridCells - textW, wanted));
    const chars = [...text];
    for (let k = 0; k < chars.length; k += 1) { // cells-ok — a character count
      const target = slots[row]?.[start + k];
      if (target !== undefined) slots[row]![start + k] = chars[k]!;
    }
  }
  return slots.map((row) => row.join(""));
}

/** A vertex, two dots by two — the corner a reading actually sits on. */
function markVertex(grid: Grid, point: readonly [number, number]): void {
  const x = Math.round(point[0] - 0.5);
  const y = Math.round(point[1] - 0.5);
  for (let dy = 0; dy < 2; dy += 1) {
    for (let dx = 0; dx < 2; dx += 1) setDot(grid, x + dx, y + dy);
  }
}

/**
 * The line-drawn radar: **one figure, quadrant blocks, an owner per sub-cell**
 * (C12 I43, §3w).
 *
 * Three alphabets were tried and refused before this one, and each failure is a
 * different thing.
 *
 * **`strokePolyline` steps orthogonally** and every edge of a pentagon is
 * oblique, so the figure was a staircase. **`╱` and `╲` per cell** draw a clean
 * pentagon *in isolation* and compose to rubble, because `mergedRow` unions
 * braille and resolves everything else first-wins (I40) — the labels, the
 * polygons and the frame each took cells from the others. **One grid with an
 * owner per cell** fixes that and still renders as dashes: those two glyphs are
 * strokes inside a box and do not reach their corners.
 *
 * The quadrant blocks are **filled sub-cells**, so consecutive cells touch. Half
 * braille's vertical resolution and the same horizontal, traded for coverage —
 * the right trade for a *shape*, where braille's is right for a *curve*.
 *
 * The composition is the third attempt's, kept: one grid, no merge, an owner per
 * sub-cell. A cell can carry two shapes in different quadrants while its tone is
 * one layer's — I40's limit again, biting less at 2×2 than at 1×1 because the
 * glyph keeps both and only the tone is chosen.
 */
function radarQuadFigure(
  d: Disc,
  categories: readonly string[],
  series: readonly Series[],
  ceiling: number,
  labels: readonly string[],
  gridShape: "polygon" | "circle" = "polygon",
): readonly (readonly MarkedText[])[] {
  const cols = Math.ceil(d.dotWidth / BRAILLE_DOTS.x); // cells-ok — a column count
  const rows = Math.ceil(d.dotHeight / BRAILLE_DOTS.y); // cells-ok — a row count
  const sx = cols * 2; // cells-ok — a sub-cell column count
  const sy = rows * 2; // cells-ok — a sub-cell row count
  const bits = new Uint8Array(sx * sy);
  const owner = new Int16Array(sx * sy).fill(-1);
  const furniture = series.length; // cells-ok — a series count
  // Furniture ranks below every series, so `>` is the priority order. That
  // `furniture` is `series.length` — numerically the *largest* owner — is the
  // trap a bare `Math.max` over owners falls into.
  const rank = (o: number): number => (o >= furniture ? -1 : o); // cells-ok — a series index

  const mark = (x: number, y: number, who: number): void => {
    if (x < 0 || y < 0 || x >= sx || y >= sy) return; // cells-ok — a sub-cell position
    bits[y * sx + x] = 1;
    owner[y * sx + x] = who; // cells-ok — a sub-cell position
  };
  // A straight run in sub-cells. Every sample is one sub-cell apart, so the
  // stroke is connected by construction rather than by a glyph choice.
  const run = (a: readonly [number, number], b: readonly [number, number], who: number): void => {
    const steps = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); // cells-ok — a sub-cell count
    if (steps === 0) { mark(a[0], a[1], who); return; }
    for (let i = 0; i <= steps; i += 1) { // cells-ok — a sub-cell count
      mark(Math.round(a[0] + ((b[0] - a[0]) * i) / steps), Math.round(a[1] + ((b[1] - a[1]) * i) / steps), who);
    }
  };
  const sub = (angle: number, t: number): [number, number] => {
    const [x, y] = at(d, angle, t);
    return [
      Math.max(0, Math.min(sx - 1, Math.round((x / BRAILLE_DOTS.x) * 2))), // cells-ok — a sub-cell column
      Math.max(0, Math.min(sy - 1, Math.round((y / BRAILLE_DOTS.y) * 2))), // cells-ok — a sub-cell row
    ];
  };
  const n = Math.max(1, categories.length); // cells-ok — a category count
  const ring = (t: number, who: number, values?: readonly (number | null)[]): void => {
    // **A circular grid is sampled rather than jointed** (C12 I45). The data is
    // always a polygon — it has a vertex per axis and nothing between them — so
    // this arm only takes the arc for the furniture.
    if (values === undefined && gridShape === "circle") {
      const steps = Math.max(8, Math.round(TAU * d.r * t)); // cells-ok — a sample count
      let prev = sub(START_ANGLE, t);
      for (let i = 1; i <= steps; i += 1) { // cells-ok — a sample count
        const next = sub(START_ANGLE + (TAU * i) / steps, t);
        run(prev, next, who);
        prev = next;
      }
      return;
    }
    const pts = Array.from({ length: n }, (_p, i) => { // cells-ok — a vertex count
      const v = values?.[i];
      const at01 = values === undefined
        ? t
        : v !== null && v !== undefined && Number.isFinite(v) ? Math.max(0, Math.min(1, v / ceiling)) : 0;
      return sub(START_ANGLE + (TAU * i) / n, at01);
    });
    for (let i = 0; i < pts.length; i += 1) run(pts[i]!, pts[(i + 1) % pts.length]!, who); // cells-ok — a vertex count
  };

  // Furniture first, so the data paints over it.
  ring(1, furniture);
  for (const t of VALUE_RINGS) if (d.r * t >= MIN_RING_DOTS) ring(t, furniture);
  for (let i = 0; i < n; i += 1) { // cells-ok — a vertex count
    run(sub(0, 0), sub(START_ANGLE + (TAU * i) / n, 1), furniture);
  }
  series.forEach((sr, si) => { ring(1, si, sr.values); });

  const gridRows: (readonly MarkedText[])[] = [];
  for (let cy = 0; cy < rows; cy += 1) { // cells-ok — a cell row
    const out: MarkedText[] = [];
    for (let cx = 0; cx < cols; cx += 1) { // cells-ok — a cell column
      const quads = [
        [cx * 2, cy * 2, QUAD_TL], [cx * 2 + 1, cy * 2, QUAD_TR],
        [cx * 2, cy * 2 + 1, QUAD_BL], [cx * 2 + 1, cy * 2 + 1, QUAD_BR],
      ] as const;
      // **A cell is one layer's, and draws only that layer's sub-cells.**
      // Keeping every quadrant and choosing one tone reads as the frame wearing
      // a series colour, because a value ring and a data polygon are *the same
      // shape at different radii* — they run alongside one another for their
      // whole length rather than crossing at points. So the topmost layer
      // occludes the rest of its cell (C12 I44).
      let who = -1;
      for (const [x, y] of quads) {
        if (bits[y * sx + x] !== 1) continue; // cells-ok — a sub-cell position
        const o = owner[y * sx + x] ?? -1; // cells-ok — a sub-cell position
        if (who < 0 || rank(o) > rank(who)) who = o; // cells-ok — a series index
      }
      let mask = 0;
      for (const [x, y, bit] of quads) {
        if (bits[y * sx + x] === 1 && owner[y * sx + x] === who) mask |= bit; // cells-ok — a sub-cell position
      }
      const label = [...(labels[cy] ?? "")][cx]; // cells-ok — a cell column
      // The names last and whole, so a word a polygon crosses stays a word.
      const named = label !== undefined && label !== " ";
      const text = named ? label : quadrantGlyph(mask);
      const index = named ? furniture : who;
      const prev = out[out.length - 1]; // cells-ok — a piece count
      if (prev !== undefined && prev.index === index) out[out.length - 1] = { text: prev.text + text, index }; // cells-ok — a piece count
      else out.push({ text, index });
    }
    gridRows.push(out);
  }
  return gridRows;
}

export function radarRender(
  series: readonly Series[],
  categories: readonly string[],
  areaWidth: number,
  areaRows: number,
  caps: Caps,
  /** A connected figure in quadrant blocks rather than braille dots (C12 I43, §3w). */
  lineDraw = false,
  /** The value rings' shape (C12 I45, §3w). */
  gridShape: "polygon" | "circle" = "polygon",
): RadarRender {
  const w = Math.max(0, Math.floor(areaWidth));
  const h = Math.max(0, Math.floor(areaRows));
  const n = categories.length; // cells-ok — a category count
  const empty: RadarRender = {
    polygons: [],
    frame: Array.from({ length: h }, () => ""),
    labels: Array.from({ length: h }, () => ""),
    legend: Array.from({ length: h }, () => []),
    discWidth: Math.max(1, w),
  };
  if (w === 0 || h === 0 || n === 0) return empty;

  // **A legend only where there is something to tell apart.** One series is
  // named by the block around it; two are two shapes in one figure, and at one
  // bit the dash is the only thing that says which is which.
  const legend =
    series.length > 1 // cells-ok — a series count
      ? segmentLegend(
          series.map((sr, i) => ({
            swatch: dashSwatch(dashFor(i, caps), 2),
            label: sr.label ?? `series ${String(i + 1)}`,
            value: "",
            index: i,
          })),
          h,
          Math.floor(w / 3),
          caps,
        )
      : NO_SEGMENT_LEGEND;

  const room = legend.width > 0 ? w - legend.width - LEGEND_GAP : w;
  // One row above and below for the labels the ring would otherwise sit on.
  const radius = radiusFor(room, h, 1);
  const discCells = discCellsFor(radius, room);
  const withLegend = legend.width > 0 && room >= Math.max(MIN_DISC_CELLS, discCells);
  const discWidth = withLegend ? room : w;
  const disc = discAt((discWidth - 1) / 2, discWidth, h, radiusFor(discWidth, h, 1));

  const ceiling = radarCeiling(series);
  const polygons = series.map((sr, si) => {
    const grid = createGrid(disc.dotWidth, disc.dotHeight);
    const points: (readonly [number, number])[] = [];
    for (let i = 0; i < n; i += 1) {
      const v = sr.values[i];
      const t = v !== null && v !== undefined && Number.isFinite(v)
        ? Math.max(0, Math.min(1, v / ceiling))
        : 0;
      points.push(at(disc, START_ANGLE + (TAU * i) / n, t));
    }
    // **Box drawing at cell resolution, where the polygon is the whole figure**
    // (C12 I43, §3w). `strokePolyline` and `glyphForMask` are the same path the
    // violin and the line form take, so a corner is one glyph rather than the
    // 2×2 block a braille vertex needs.
    //
    // **And it loses two things the braille arm keeps.** I40 unions the dots
    // where two layers ink one cell and that union is braille's alone, so two
    // `╭─╮` polygons crossing fall back to first-wins and the further one loses
    // the cell. And `strokePolyline` steps orthogonally, so a pentagon — whose
    // every edge is diagonal — comes out as runs of right angles.
    //
    // What it buys is continuity and contrast: two polygons at cell resolution
    // are two shapes a reader separates at a glance, where the braille ones are
    // two fields of dots. Shipped beside it rather than instead of it.
    const dash = dashFor(si, caps);
    for (let i = 0; i < n; i += 1) {
      strokeDashed(grid, points[i]!, points[(i + 1) % n]!, dash);
      // **The vertex carries a marker and the edges do not.** A one-dot stroke
      // is what braille has, and five of them meeting at shallow angles is a
      // shape whose corners a reader has to infer; the reading is *at* the
      // corner, so that is the one place worth two dots by two.
      markVertex(grid, points[i]!);
    }
    return foldBraille(grid);
  });

  return {
    // **One figure and no merge for the line arm** — the layers below are the
    // braille arm's, and at cell resolution they eat each other (I40).
    ...(lineDraw
      ? {
          figure: radarQuadFigure(
            disc, categories, series, ceiling,
            labelRows(disc, categories, discWidth, h, caps), gridShape,
          ),
        }
      : {}),
    polygons,
    frame: frameRows(disc, categories, gridShape),
    labels: labelRows(disc, categories, discWidth, h, caps),
    legend: withLegend ? legend.lines : Array.from({ length: h }, () => []),
    discWidth,
  };
}

/**
 * The radar at ASCII: a header naming the series, then one row per category
 * with a bar and a reading per series.
 *
 * The value table this replaces rendered `categories.length` rows against a
 * declared height that had nothing to do with the data, so a radar of five
 * categories in a block of ten rows moved everything below it. Rows are exactly
 * `areaRows` now, and the bar is what makes two readings comparable at a glance
 * — which is the only thing the polygon was doing.
 */
export function radarAsciiRows(
  series: readonly Series[],
  categories: readonly string[],
  width: number,
  areaRows: number,
  caps: Caps,
): readonly (readonly MarkedText[])[] {
  const w = Math.max(0, Math.floor(width));
  const h = Math.max(0, Math.floor(areaRows));
  const blank: readonly (readonly MarkedText[])[] = Array.from({ length: h }, () => []);
  const count = series.length; // cells-ok — a series count
  const n = categories.length; // cells-ok — a category count
  if (w === 0 || h === 0 || count === 0 || n === 0) return blank;

  const ambiguous = caps.ambiguousWidth;
  const ext = extentFor(caps);
  const ceiling = radarCeiling(series);
  const reading = (v: number | null | undefined): string =>
    v !== null && v !== undefined && Number.isFinite(v) ? String(Math.round(v * 10) / 10) : "";

  const labelW = Math.max(
    1,
    Math.min(Math.floor(w / 3), categories.reduce((m, c) => Math.max(m, cells(c, ambiguous)), 0)),
  );
  let valueW = 1;
  for (const sr of series) {
    for (const v of sr.values) valueW = Math.max(valueW, cells(reading(v), ambiguous));
  }
  const column = Math.max(valueW + 2, Math.floor((w - labelW - 1) / count));
  const barW = Math.max(0, column - valueW - 2);

  const rows: (readonly MarkedText[])[] = Array.from({ length: h }, () => []);
  const header: MarkedText[] = [{ text: " ".repeat(labelW + 1), index: -1 }];
  for (let s = 0; s < count; s += 1) {
    header.push({ text: pad(truncate(series[s]?.label ?? `series ${String(s + 1)}`, column, caps), column, ambiguous), index: s });
  }
  rows[0] = header;

  const shown = Math.min(n, Math.max(0, h - 1));
  for (let i = 0; i < shown; i += 1) {
    const pieces: MarkedText[] = [
      { text: `${pad(truncate(categories[i] ?? "", labelW, caps), labelW, ambiguous)} `, index: -1 },
    ];
    for (let s = 0; s < count; s += 1) {
      const v = series[s]?.values[i];
      const t = v !== null && v !== undefined && Number.isFinite(v) ? v / ceiling : 0;
      const bar = barW > 0 ? `${pad(extentRun(t, barW, ext), barW, ambiguous)} ` : "";
      pieces.push({ text: `${bar}${padStart(reading(v), valueW, ambiguous)} `, index: s });
    }
    rows[i + 1] = pieces;
  }
  if (shown < n && h > 0) {
    rows[h - 1] = [{ text: truncate(`${glyphs(caps).residue} ${String(n - shown)} more`, w, caps), index: -1 }];
  }
  return rows;
}
