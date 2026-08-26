/**
 * Boxplot, forest and dumbbell — glyph-row forms.
 *
 * No raster. Each category gets one row of horizontal glyphs scaled to the
 * available width. The category label sits in the gutter; the glyphs fill the
 * plot area.
 */
import { normalisedSummary } from "../../data/viewmodel/distribution.js";
import { normalisedOf } from "../../data/viewmodel/range.js";
import type { QuartileSummary, Series } from "../../data/viewmodel/index.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";
import { glyphs } from "../blocks/glyphs.js";
import { estimateRole } from "./figure.js";
import { marksACell, roleGlyphs } from "./roles.js";
import { ladderFor, pairFor } from "./ramp.js";
import type { Range } from "./scale.js";

type Caps = Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">;

/**
 * The **furniture** these rows draw with — a run, its two ends, and a fill.
 *
 * **Five slots left this table and they were the role-named ones** (F298).
 * `median`, `outlier`, `whiskerH`, `boxLeft` and `boxRight` were resolved per
 * rung and read by nothing: `forestRow` and `dumbbellRow` reached past them to
 * `glyphs(caps)`, and the two boxplot renderers never had them at all. So the
 * rung table's *terminal walker's `Record`* had a plausible referent, in the
 * right file, keyed by the right rung — and the parts that made it look like the
 * answer were precisely the parts nothing read. What a role draws is
 * `roleGlyphs` now; what remains here is not a role.
 *
 * **`outlier` also disagreed with the renderers that draw one**: `"*"` here
 * against `g.dotted` — `.` — in `boxplotBand` and `boxplotColumn`. Two answers
 * for one role in one arm, harmless only because nobody read the first.
 */
interface GlyphChars {
  boxFill: string;
  whiskerLeft: string;
  whiskerRight: string;
  line: string;
}

function glyphCharsFor(caps: Caps): GlyphChars {
  const g = glyphs(caps);
  if (caps.unicode === "ascii") {
    return { boxFill: "=", whiskerLeft: "|", whiskerRight: "|", line: "-" };
  }
  return {
    boxFill: g.bar, whiskerLeft: g.teeLeft, whiskerRight: g.teeRight, line: g.horizontal,
  };
}

/**
 * A value's column, from the shared coordinate.
 *
 * **The degenerate answer stays here** (§3aj hazard 1), and the reason it gives
 * is the second one it was given.
 *
 * The first read *`Math.floor(width / 2)` and `Math.round(0.5 · (width - 1))`
 * differ at every even width*. **They are equal at every width** — measured,
 * 1 through 12 — so the sentence named a distinction that does not exist and
 * the mutation written from it changed nothing. A03 §2's vacuity class in a
 * justification, and the mutation pass is the only thing that asks a sentence
 * whether it can be violated.
 *
 * **What is true**: a shared degenerate answer arrives as `0.5`, and the guard
 * that consumes it is this renderer's. `Math.round(0.5 · width)` differs from
 * `Math.floor(width / 2)` at **every odd width** — 1, 3, 5, 7 — which is the
 * mutation that now runs. The rounding stage is the thing hazard 1 protects,
 * and *which* arithmetic reads it is exactly the choice it must not move.
 */
function scaleX(value: number, min: number, max: number, width: number): number {
  if (max === min) return Math.floor(width / 2);
  return Math.round(normalisedOf(value, { min, max }, false) * Math.max(0, width - 1));
}

/**
 * A normalised position as a row index, **inverted by hand**.
 *
 * `L - Math.round(t · L)` is **not** `Math.round((1 - t) · L)`: at `t · L = 2.5`
 * and `L = 6` the first is 3 and the second 4, because a half rounds away from
 * zero. So this takes an uninverted `[0, 1]` and does the subtraction itself,
 * which is the arithmetic every one of these call sites already had.
 */
function rowAt(t: number, rows: number): number {
  const last = rows - 1; // cells-ok — a row count
  return Math.max(0, Math.min(last, last - Math.round(t * last))); // cells-ok — a row index
}


/**
 * One forest-plot row: centre mark with CI bounds.
 * `●────[▬▬▬|▬▬▬]────●`
 */
export function forestRow(
  q: QuartileSummary,
  min: number,
  max: number,
  width: number,
  caps: Caps,
  references: readonly number[] = [],
): string {
  const ch = glyphCharsFor(caps);
  const roles = roleGlyphs(caps);
  const g = glyphs(caps);
  const w = Math.max(1, Math.floor(width));
  const row = new Array<string>(w).fill(" ");

  // **The reference lines first, so the data draws over them** (C12 §3k, C12 I31).
  // A null line is a claim about the ordinate beside the data, not a member of
  // it; broken rather than solid because a solid rule crossing five intervals
  // reads as a sixth.
  for (const v of references) {
    const x = scaleX(v, min, max, w);
    if (x >= 0 && x < w) row[x] = g.dashedVertical; // cells-ok — a column index
  }

  // **The three fallbacks are the shared summary's**, not this row's: an
  // interval falls back to the whiskers and an estimate to the median (C12
  // I31), and the same three lines were written out in each renderer.
  const ns = normalisedSummary(q, { min, max });
  const last = Math.max(0, w - 1); // cells-ok — a column count
  const atX = (t: number): number => (max === min ? Math.floor(w / 2) : Math.round(t * last)); // cells-ok — a column index

  const xLower = atX(ns.lower);
  const xUpper = atX(ns.upper);
  const xCentre = atX(ns.centre);

  // The interval, with a tee at each end — a plain `─` at the end of a run does
  // not say the interval stops there.
  for (let i = xLower; i <= xUpper; i += 1) row[i] = ch.line;
  row[xLower] = ch.whiskerLeft;
  row[xUpper] = ch.whiskerRight;

  // **The estimate, sized by weight** (C12 I31, §3k). A wide interval drawn small
  // contributed little and a narrow one drawn large carried the result — which
  // is the reading a forest plot exists for. No weight means one cell, so an
  // ordinary quartile summary still draws a point.
  //
  // **And nothing draws over the interval.** The old row overwrote the whole
  // interior with a box plot's body wherever `q1`/`q3` were present — which the
  // catalogue fixture always sets, so the interval was never visible in any
  // rendered frame. A box's edges are quartiles of a sample; this interval is a
  // confidence bound on one estimate, and replacing the second with the first
  // is not decoration.
  const wt = q.weight;
  const span = wt !== undefined && Number.isFinite(wt) ? Math.max(0, Math.min(1, wt)) : 0;
  const halfCells = Math.floor((span * Math.max(0, xUpper - xLower)) / 2); // cells-ok — a cell count

  // **Which of the three this estimate is, asked once** (§3ak.22, I68). The
  // emitter had this three-way test and so did this row, written out separately
  // — and `absent`'s answer here was not a decision at all: `normalisedSummary`
  // falls `centre` back to the median, a row with neither gives `NaN`, and
  // `row[NaN] = mark` sets a **property** on an array rather than a cell. The
  // two arms agreed about *nothing was reported* and one of them agreed by
  // writing to `row.NaN`, which any tidying of the fallback would have ended.
  //
  // Nothing in the catalogue constructs the state, so no frame moves; what this
  // removes appears the first time a caller passes a row with no estimate.
  const role = estimateRole(q);
  if (marksACell(role)) {
    const mark = roles.of[role];
    for (let i = xCentre - halfCells; i <= xCentre + halfCells; i += 1) {
      if (i >= 0 && i < w) row[i] = mark; // cells-ok — a column index
    }
    row[xCentre] = mark;
  }

  return row.join("");
}

/**
 * One dumbbell row: `●────────○`
 */
export function dumbbellRow(
  v1: number,
  v2: number,
  min: number,
  max: number,
  width: number,
  caps: Caps,
): string {
  const ch = glyphCharsFor(caps);
  const roles = roleGlyphs(caps);
  const w = Math.max(1, Math.floor(width));

  const x1 = scaleX(v1, min, max, w);
  const x2 = scaleX(v2, min, max, w);

  const row = new Array(w).fill(" ");

  const lo = Math.min(x1, x2);
  const hi = Math.max(x1, x2);
  for (let i = lo; i <= hi; i++) row[i] = ch.line;
  // **One role at both ends, told apart by shape rather than by tone** — which
  // is why `pairedPoint` sits beside the record instead of in it: the figure
  // says `point` twice and distinguishes them by `seriesIndex` (I68).
  row[x1] = roles.of.point;
  row[x2] = roles.pairedPoint;

  return row.join("");
}

/**
 * The box plot **stood up** — `boxplotBand` transposed (C12 I30).
 *
 * ```
 *    ╷        the max cap
 *    │        whisker
 *  ┌─┴─┐      q3, the box's lid
 *  │   │
 *  ├─◆─┤      the median, and the mean where it differs
 *  │   │
 *  └─┬─┘      q1, the floor
 *    │
 *    ╵        the min cap
 * ```
 *
 * **Column-indexed where its sibling is row-indexed**, and that is what keeps
 * the two one figure rather than two drawings that happen to agree. The three
 * slots are the box's left edge, its spine and its right edge, exactly as the
 * horizontal table's three are its top edge, spine and bottom — every glyph
 * appears in both tables in the position the other one gives it, rotated.
 *
 * `at(v)` inverts, because a row index grows downwards and a value grows up.
 */
export function boxplotColumn(
  q: QuartileSummary,
  min: number,
  max: number,
  width: number,
  rows: number,
  caps: Caps,
  /** The compact box's interquartile run: a filled block or a heavier line (C12 I46). */
  box: "solid" | "line" = "solid",
): readonly string[] {
  const slot = Math.max(1, Math.floor(width));
  const n = Math.max(1, Math.floor(rows));
  const g = glyphs(caps);
  const roles = roleGlyphs(caps);
  // `boxplotBand`'s ruling stood up (C12 I46) — a one-column box has no sides,
  // so its interior is a run, and a heavier rule is a run.
  const fill = box === "line" ? g.heavyVertical : pairFor(caps).filled;

  // **The box is narrower than its column, and that is the figure rather than
  // taste.** Drawn to the full slot the four categories touched — three boxes
  // with no gap read as one continuous object, and the whole point of a
  // categorical axis is that the categories are separate. Three fifths is what
  // matplotlib's `widths=0.6` draws and what UnicodePlots leaves; below five
  // cells there is nothing to spare and it takes the slot.
  const w = slot >= 5 ? Math.max(3, Math.round(slot * 0.6)) : slot; // cells-ok — a column width
  const padL = Math.floor((slot - w) / 2); // cells-ok — a column width
  const padR = slot - w - padL; // cells-ok — a column width

  // **Rows built whole, not as three slots.** The first version wrote a glyph at
  // the left, centre and right of each row and left the cells between them
  // blank, so the box came out as three disconnected columns — the transpose of
  // `boxplotBand` in arithmetic and not in figure. A box's lid is a *run*.
  const mid = Math.floor((w - 1) / 2); // cells-ok — a column index
  const runRow = (left: string, joint: string, right: string): string => {
    if (w === 1) return joint; // cells-ok — a column count
    const cells = new Array<string>(w).fill(g.horizontal);
    cells[0] = left;
    cells[w - 1] = right;
    if (mid > 0 && mid < w - 1) cells[mid] = joint; // cells-ok — a column index
    return cells.join("");
  };
  const centred = (glyph: string): string => {
    const cells = new Array<string>(w).fill(" ");
    cells[mid] = glyph;
    return cells.join("");
  };
  const sides = (): string => {
    if (w === 1) return g.vertical; // cells-ok — a column count
    const cells = new Array<string>(w).fill(" ");
    cells[0] = g.vertical;
    cells[w - 1] = g.vertical;
    return cells.join("");
  };

  // Inverted: a value grows upwards and a row index grows down. The inversion
  // and the rounding are this renderer's; the positions are the family's.
  const ns = normalisedSummary(q, { min, max });
  const at = (t: number): number => rowAt(t, n);
  const yMax = at(ns.max), yQ3 = at(ns.q3), yMed = at(ns.median);
  const yQ1 = at(ns.q1), yMin = at(ns.min);

  const blank = " ".repeat(w);
  const grid = Array.from({ length: n }, () => blank);
  const set = (r: number, text: string): void => {
    if (r >= 0 && r < n) grid[r] = text; // cells-ok — a row index
  };

  // Whiskers first, so every edge below overwrites them where they meet.
  for (let r = yMax + 1; r < yQ3; r += 1) set(r, centred(g.vertical));
  for (let r = yQ1 + 1; r < yMin; r += 1) set(r, centred(g.vertical));
  // **The interior is clear where edges enclose it and inked where they cannot** —
  // `boxplotBand`'s compact rule, standing up: a one-cell column has no sides,
  // so a blank interior would say nothing about where the box is.
  for (let r = yQ3 + 1; r < yQ1; r += 1) set(r, w === 1 ? fill : sides()); // cells-ok — a column count

  set(yMax, runRow(g.stubRight, g.teeDown, g.stubLeft));
  set(yMin, runRow(g.stubRight, g.teeUp, g.stubLeft));
  // The whisker arrives from above at the lid and leaves below at the floor, so
  // the junction points the way the whisker goes — and **where there is no
  // whisker there is nothing to point toward** (I33). The lid is written over
  // the cap when the two rows coincide, so without this the figure keeps a stub
  // aimed at blank rows. Horizontal `─`, the transpose of the band's `│`.
  const upperWhisker = yQ3 > yMax; // cells-ok — a row index
  const lowerWhisker = yMin > yQ1; // cells-ok — a row index
  set(yQ3, runRow(g.topLeft, upperWhisker ? g.teeUp : g.horizontal, g.topRight));
  set(yQ1, runRow(g.bottomLeft, lowerWhisker ? g.teeDown : g.horizontal, g.bottomRight));
  set(yMed, runRow(g.teeLeft, g.horizontal, g.teeRight));

  // The mean last and only where it differs — a second centre needs its own
  // mark (C04 I53), and on an edge row it would read as a corner.
  const punch = (r: number, glyph: string): void => {
    if (r < 0 || r >= n) return; // cells-ok — a row index
    const cells = [...(grid[r] ?? blank)];
    cells[mid] = glyph; // cells-ok — a column index
    grid[r] = cells.join("");
  };
  // Mean on median gets its own glyph rather than no glyph — see `kde.ts`.
  // **`ns.mean` is absent where the summary had none or had a non-finite one**,
  // so *no mean* and *a mean at the median* stay distinguishable here rather
  // than at each call site.
  if (ns.mean !== undefined) {
    punch(at(ns.mean), at(ns.mean) === yMed ? roles.meanOnMedian : roles.of.mean);
  }
  for (const o of ns.outliers) punch(at(o), roles.of.outlier);
  return grid.map((r) => " ".repeat(padL) + r + " ".repeat(padR));
}

/**
 * A box plot as three rows — the UnicodePlots / YouPlot figure.
 *
 * ```
 *        ┌────┬───────┐
 *   ╷────┤    │       ├──────╷
 *   ╵    └────┴───────┘      ╵
 * ```
 *
 * **One row per category could not show a centre and this is why.** The old
 * form drew `[▌▌▌│▌▌▌]` — a filled slab with the median as an interior bar —
 * so the box had no top or bottom edge to read a quartile against, and a mean
 * had nowhere to go that was not already occupied by the fill. The reference
 * spends three rows: the middle carries the whiskers and the spine, and the
 * outer two carry the box's edges. The box is an **outline**, so anything
 * drawn inside it is legible.
 *
 * The glyph table is indexed by row, which is what makes the three rows one
 * figure rather than three drawings that happen to line up.
 */
export function boxplotBand(
  q: QuartileSummary,
  min: number,
  max: number,
  width: number,
  rows: number,
  caps: Caps,
  /** The compact box's interquartile run: a filled block or a heavier line (C12 I46). */
  box: "solid" | "line" = "solid",
): readonly string[] {
  const w = Math.max(1, Math.floor(width));
  const n = Math.max(1, Math.floor(rows));

  // Row-indexed, exactly as the reference: index 0 is the box's top edge, 1 the
  // spine, 2 the bottom edge. ASCII collapses the corners it cannot spell.
  // **Named slots, never literals** (C09 I22, SS47). The table is row-indexed,
  // which is what makes three rows one figure rather than three drawings that
  // happen to line up; ASCII collapses the corners it cannot spell and the
  // figure still reads.
  const g = glyphs(caps);
  const roles = roleGlyphs(caps);
  // **Not inverted**, which is the whole difference between this and its
  // transpose: a column index grows the way a value does.
  const ns = normalisedSummary(q, { min, max });
  const last = Math.max(0, w - 1); // cells-ok — a column count
  const at = (t: number): number => Math.max(0, Math.min(last, Math.round(t * last))); // cells-ok — a column index

  const xMin = at(ns.min), xQ1 = at(ns.q1), xMed = at(ns.median);
  const xQ3 = at(ns.q3), xMax = at(ns.max);

  // The interquartile run's ink, for the compact arm. `pairFor` is the gauge
  // vocabulary and this *is* a gauge: a span of the axis that is filled or not.
  //
  // **Or a heavier line, which is the same claim at less weight** (C12 I46).
  // What the compact arm needs is a run that is *not the whisker*; filled says
  // so loudest and `━` says so too, leaving the figure a line drawing. The
  // choice is the caller's because it is about what the reader is after — the
  // summary's shape, or its mass against a density behind it.
  const fill = box === "line" ? g.heavyHorizontal : pairFor(caps).filled;
  const compact = n < 3; // cells-ok — a row count

  // **No whisker, no stub** (I33). The cap and the box edge are two writes to
  // one column when a whisker has zero length at cell resolution, and the edge
  // is written second — so the spine kept `├` pointing right at blank columns,
  // promising a whisker that is not there. The condition is on the *columns*
  // rather than on the values: two readings a hair apart round into one cell
  // and there is nothing drawn between them to point at.
  const lowWhisker = xQ1 > xMin; // cells-ok — a column index
  const highWhisker = xMax > xQ3; // cells-ok — a column index
  // **What a box edge draws with no whisker to point at, and the two arms
  // differ for the reason they already differ about the interior.** With three
  // rows the interior is clear and the edges are the only thing saying where
  // the box is, so the spine keeps a plain `│`. With one row the box **is** the
  // filled run, and its edge is where that run begins — a `│` there says
  // nothing the ink does not, and collides with the median, which is the one
  // other `│` on that row. One glyph, two meanings, in the arm that has no
  // corners to tell them apart.
  const edge = compact ? fill : g.vertical;

  const T = {
    minCap: [g.stubDown, g.teeLeft, g.stubUp],
    whisker: [" ", g.horizontal, " "],
    boxL: [g.topLeft, lowWhisker ? g.teeRight : edge, g.bottomLeft],
    boxEdge: [g.horizontal, " ", g.horizontal],
    median: [g.teeDown, g.vertical, g.teeUp],
    boxR: [g.topRight, highWhisker ? g.teeLeft : edge, g.bottomRight],
    maxCap: [g.stubDown, g.teeRight, g.stubUp],
    mean: roles.of.mean,
    meanTee: roles.meanOnMedian,
    outlier: roles.of.outlier,
  };


  // **Compact is one row and it is the spine, not a different drawing.** A
  // single row taken from the same table keeps the median and the caps; taking
  // a separate renderer is how the two would drift.
  const wanted = n >= 3 ? [0, 1, 2] : n === 2 ? [0, 1] : [1]; // cells-ok — a row count
  const out: string[] = [];

  for (const r of wanted) {
    const row = new Array<string>(w).fill(" ");
    for (let i = xMin + 1; i < xQ1; i += 1) row[i] = T.whisker[r]!;
    for (let i = xQ3 + 1; i < xMax; i += 1) row[i] = T.whisker[r]!;
    // **The compact box is filled, and the three-row box is not.** With top and
    // bottom edges the interquartile range is enclosed and the interior must
    // stay clear so the median and mean are legible inside it. With one row
    // there are no edges: a blank interior leaves `┤    │    ├` — two tees, a
    // rule, and nothing saying where the box begins or that those cells are the
    // box at all. So the run carries the range, and the median and mean are
    // punched into it below.
    const interior = compact && r === 1 ? fill : T.boxEdge[r]!;
    for (let i = xQ1 + 1; i < xQ3; i += 1) row[i] = interior;
    row[xMin] = T.minCap[r]!;
    row[xMax] = T.maxCap[r]!;
    row[xQ1] = T.boxL[r]!;
    row[xQ3] = T.boxR[r]!;
    row[xMed] = T.median[r]!;
    // The mean last and only on the spine — a second centre needs its own mark
    // (C04 I53), and drawn on an edge row it would read as a corner.
    if (ns.mean !== undefined && r === 1) {
      const xm = at(ns.mean);
      // **Mean on median gets its own glyph rather than none** (C12 I33,
      // C04 I53) — the same ruling `boxplotColumn` and `kde.ts` already carry.
      // This arm dropped it instead: `xm !== xMed` meant a distribution whose
      // mean *is* its median drew no mean at all, and a reader cannot tell that
      // from a summary with no mean in it. Two arms of one figure, and the
      // claim that `◈` landed in both was true of the vertical one.
      row[xm] = xm === xMed ? T.meanTee : T.mean;
    }
    for (const o of ns.outliers) {
      const xo = at(o);
      if (xo >= 0 && xo < w && r === 1) row[xo] = T.outlier;
    }
    out.push(row.join(""));
  }
  while (out.length < n) out.push(" ".repeat(w)); // cells-ok — a row count
  return out;
}

/**
 * One lag of an autocorrelation plot, with its significance band (C04 §8).
 *
 * **Signed about zero**, which is what makes it an autocorrelation and not a bar
 * chart of magnitudes: a negative lag means the series anti-correlates with
 * itself at that offset, and a plot drawing |r| says the opposite of the data
 * half the time. Zero sits at the centre column.
 */
export function lagRow(
  value: number | null,
  magnitude: number,
  width: number,
  bounds: readonly number[],
  caps: Caps,
): string {
  const w = Math.max(1, Math.floor(width));
  const g = glyphs(caps);
  const ch = glyphCharsFor(caps);
  const row = new Array<string>(w).fill(" ");
  const zero = Math.floor((w - 1) / 2); // cells-ok — a column index

  // The band first, so a bar crossing it draws over it — a bound is a claim
  // beside the data, and one interrupting a bar reads as part of it.
  for (const b of bounds) {
    for (const sign of [-1, 1]) {
      const x = zero + Math.round((sign * Math.abs(b) / magnitude) * zero); // cells-ok — a column index
      if (x >= 0 && x < w) row[x] = g.dashedVertical; // cells-ok — a column index
    }
  }
  row[zero] = g.vertical;

  if (value !== null && Number.isFinite(value)) {
    const end = zero + Math.round((value / magnitude) * zero); // cells-ok — a column index
    const [from, to] = end >= zero ? [zero, end] : [end, zero]; // cells-ok — a column index
    for (let i = Math.max(0, from); i <= Math.min(w - 1, to); i += 1) row[i] = ch.boxFill; // cells-ok — a column index
    row[zero] = g.vertical;
  }
  return row.join("");
}

/**
 * One track of a timeline — event marks on a shared time axis (C04 §8).
 *
 * A series' *positions* are the data here and its magnitudes are not, which is
 * the distinction that makes this a form rather than a scatter with one row: an
 * event happened at a time, and asking how big it was is asking the wrong
 * question of it.
 */
export function timelineRow(
  series: Series | undefined,
  range: Range,
  width: number,
  caps: Caps,
): string {
  const w = Math.max(1, Math.floor(width));
  const g = glyphs(caps);
  const row = new Array<string>(w).fill(g.horizontal);
  if (series === undefined) return " ".repeat(w);
  for (const v of series.values) {
    if (v === null || !Number.isFinite(v)) continue;
    const x = scaleX(v, range.min, range.max, w);
    if (x >= 0 && x < w) row[x] = g.filled; // cells-ok — a column index
  }
  return row.join("");
}

/**
 * A bullet graph's row — qualitative bands, a measure, and a target (C04 §8).
 *
 * Stephen Few's replacement for a gauge, and the reason it is not one: the bands
 * say what *good* is, so the reader needs no legend and no second glance at a
 * dial. The target is a **perpendicular** mark rather than a longer bar, because
 * *did we hit it* is a boolean and a bar invites the eye to compare lengths.
 */
export function bulletRow(
  q: QuartileSummary,
  measure: number | null,
  width: number,
  caps: Caps,
): string {
  const w = Math.max(1, Math.floor(width));
  const g = glyphs(caps);
  const ramp = [...ladderFor("density", caps).steps];
  const lo = q.min, hi = q.max;
  const row = new Array<string>(w).fill(" ");

  // The qualitative bands, lightest first — a background the measure sits on.
  const bands = [q.q1, q.median, q.q3, hi];
  let from = 0; // cells-ok — a column index
  for (const [i, edge] of bands.entries()) {
    const to = scaleX(edge, lo, hi, w);
    const ink = ramp[Math.min(ramp.length - 1, Math.round(((i + 1) / bands.length) * 3))] ?? ramp[0]!; // cells-ok — a ramp index
    for (let x = from; x <= to && x < w; x += 1) row[x] = ink; // cells-ok — a column index
    from = to + 1; // cells-ok — a column index
  }

  if (measure !== null && Number.isFinite(measure)) {
    const end = scaleX(measure, lo, hi, w);
    for (let x = 0; x <= end && x < w; x += 1) row[x] = g.filled; // cells-ok — a column index
  }
  // The target last, over everything: it is the question the row answers.
  if (q.centre !== undefined && Number.isFinite(q.centre)) {
    const t = scaleX(q.centre, lo, hi, w);
    if (t >= 0 && t < w) row[t] = g.vertical; // cells-ok — a column index
  }
  return row.join("");
}
