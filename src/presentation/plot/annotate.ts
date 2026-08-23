/**
 * Annotations — one feature, and the six named chart types collapse into it
 * (C12 §3e, I23).
 *
 * **A dashed line in the same raster, which is the whole design.** An annotation
 * is drawn into a `Grid` exactly as a curve is, so it inherits the braille/ASCII
 * choice, the width and the fold, and it needs no glyph vocabulary of its own —
 * which means no new rôle, no new fallback (C09 §4), and no third instance of
 * F176's ambiguous-width trap.
 *
 * **Dashed rather than toned, and that is F34 satisfied structurally.** A
 * distinction must not be carried by colour alone; here the other carrier is
 * *shape* — a reference line is broken where a curve is continuous, at every
 * colour depth including one bit. It was always going to be a line or a mark,
 * which is the argument for annotations being cheap in a terminal at all.
 *
 * **A band is two lines, so it is one statement and not a new mechanism.** The
 * survey's own ruling — *a band is a boundary pair rather than a fill* — and a
 * fill would compete with the curve for the cells the curve is drawn in.
 */
import type { Annotation } from "../../data/viewmodel/index.js";
import type { Range } from "./scale.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";
import { BRAILLE_DOTS, createGrid, foldBraille, setDot } from "./raster.js";
import { isBlank } from "./curve.js";
import { rowOf, type Facing } from "./scale.js";

/**
 * Cells between dashes, and the frame is what set it.
 *
 * **Four, not two.** At braille's 2×4 a period of two lights one dot in *every*
 * cell, so the line is solid to a reader — it reads as a series drawn flat, which
 * is the one thing an annotation must not look like. Four leaves a clear cell
 * between marks at both densities.
 */
const DASH_CELLS = 2;

/** The values an annotation marks on the ordinate. A band is its two edges. */
export function edgesOf(annotation: Annotation): readonly number[] {
  if (annotation.kind === "band") return [annotation.from, annotation.to];
  if (annotation.kind === "confidence") return [...annotation.upper, ...annotation.lower];
  if (annotation.kind === "whiskers") return annotation.points.flatMap((p) => [p.y - p.err, p.y + p.err]);
  return [annotation.value];
}

/** An edge that is on the scale at all — see `annotationRows` for why not clamped. */
function drawn(value: number, range: Range): boolean {
  if (!Number.isFinite(value)) return false;
  return range.max === range.min || (value >= range.min && value <= range.max);
}

/**
 * One annotation's glyph rows, sized like a curve's (I23).
 *
 * **Out-of-range edges are dropped, not clamped**, and this is the one place
 * that differs from a series. C04 I29 clamps a *sample* to the edge because the
 * sample is data and pressing it against the ceiling is honest. An annotation is
 * a **claim about where a value sits**, so a threshold of 85 clamped onto a plot
 * whose ceiling is 60 draws a line that says *the limit is here* about a place
 * the limit is not. Saying nothing is the only honest answer.
 *
 * **Two mechanisms, and the ASCII one is not the raster.** A curve at ASCII goes
 * through `foldRamp`, which encodes **height** — how full the cell is — and that
 * is a declared stand-in for position (C12 I21). An annotation has no height to
 * encode: it is one dot at one row, and folding it by ink weight turned a
 * reference line into `# # # # #`, a row of heavy glyphs indistinguishable from
 * a flat series. Read from a frame; every count agreed.
 *
 * So at ASCII the line is drawn **at cell resolution directly**, which is all the
 * resolution ASCII has, and the mark is `-` — narrow under both width
 * conventions, unlike every box-drawing dash (F176).
 */
export function annotationRows(
  annotation: Annotation,
  range: Range,
  areaWidth: number,
  areaRows: number,
  caps: Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">,
  facing: Facing,
): readonly string[] {
  const w = Math.max(1, Math.floor(areaWidth));
  const h = Math.max(1, Math.floor(areaRows));

  if (annotation.kind === "confidence") {
    return confidenceRows(annotation, range, w, h, caps, facing);
  }
  if (annotation.kind === "whiskers") {
    return whiskersRows(annotation.points, range, w, h, caps, facing);
  }

  const edges = edgesOf(annotation).filter((v) => drawn(v, range));

  if (caps.unicode === "ascii") {
    // **Only the vertical half reaches here**: a rule spanning the width is its
    // own horizontal mirror, so `facing.x` has nothing to move (§3ac).
    const rows = new Set(edges.map((v) => rowOf(v, range, h, facing)));
    const dashes = Array.from({ length: w }, (_, x) => (x % DASH_CELLS === 0 ? "-" : " ")).join("");
    return Array.from({ length: h }, (_, i) => (rows.has(i) ? dashes : ""));
  }

  const grid = createGrid(w * BRAILLE_DOTS.x, h * BRAILLE_DOTS.y);
  for (const value of edges) {
    const y = rowOf(value, range, grid.dotHeight, facing);
    for (let x = 0; x < grid.dotWidth; x += DASH_CELLS * BRAILLE_DOTS.x) setDot(grid, x, y);
  }
  return foldBraille(grid);
}

/**
 * The shade a confidence band's interior is filled with, or `null` (C12 §3e).
 *
 * **One arm of three has a vocabulary and the other two are stated rather than
 * left to a fallback.** The fill must not be the curve's own alphabet — that is
 * the surviving half of C04 I52's refusal, *indistinguishable from the curve at
 * one bit* — and the curve is braille on every unicode terminal (`curve.ts`:
 * *braille is narrow on both kinds*) and `RAMP_ASCII` below that.
 *
 * | unicode | ambiguousWidth | the fill |
 * |---|---|---|
 * | `full` / `bmp` | `narrow` | `░` U+2591 — a block element, neither alphabet |
 * | `full` / `bmp` | `wide` | **none** — `cells("░", "wide")` is 2, and the tree's only narrow substitutes are braille |
 * | `ascii` | any | **none** — the ramp *is* the curve's, and `-` is the edge's own dash |
 *
 * Where this returns `null` the two dashed edges carry the band, which is the
 * frame that shipped before the fill existed: C12 I25's substitution ladder at
 * its bottom rung rather than a member with no arm.
 */
function shadeFor(caps: Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">): string | null {
  if (caps.unicode === "ascii") return null;
  if (caps.ambiguousWidth === "wide") return null;
  return "\u2591";
}

/**
 * The interior, one cell column at a time, **clamped where the edge is dropped**.
 *
 * C04 I52 drops an out-of-range *edge* because a threshold moved onto a scale it
 * is outside says *the limit is here* about a place the limit is not. The
 * interior says *the region covers here*, which stays true of every visible cell
 * whatever the edge does — so a band whose upper edge is above the ceiling fills
 * to the top row and draws no upper edge. Reading the two as one rule gives a
 * dashed lower edge with no fill above it, which reads as *the band ended*.
 *
 * **Sampled by inverse mapping rather than by the edges' forward one.** The
 * edges place sample *i* at column `round(i/(n−1)·(w−1))`, which leaves columns
 * empty when there are fewer samples than cells; an interior with holes in it is
 * not an interior. So each column asks which samples straddle it and
 * interpolates — `fill_between`'s own reading.
 */
function fillRows(
  upper: readonly number[],
  lower: readonly number[],
  range: Range,
  w: number,
  h: number,
  shade: string,
  facing: Facing,
): readonly string[] {
  const n = Math.min(upper.length, lower.length); // cells-ok — a sample count
  const grid: string[][] = Array.from({ length: h }, () => new Array<string>(w).fill(" ")); // cells-ok
  if (n === 0) return grid.map((r) => r.join("")); // cells-ok — a sample count

  for (let x = 0; x < w; x += 1) { // cells-ok — a column index
    // A single sample has no span to interpolate across, so it covers the whole
    // width: one reading of an interval is still an interval.
    const t = along(w === 1 ? 0 : x / (w - 1), facing); // cells-ok — a column index
    const u = edgeAt(upper, t);
    const l = edgeAt(lower, t);
    if (u === null || l === null) continue;

    // `rowOf` clamps to the grid, so an edge off the scale lands on the nearest
    // row rather than outside the loop — which is the clamp this doc argues for.
    // **Ordered after the flip, not before it** (§3ac B5). Under a downward
    // facing `rowOf(max)` is the *larger* row index, so a loop from `a` to `b`
    // runs backwards and fills nothing — the band vanishes rather than inverts,
    // which is the failure that looks like the member working.
    const a = rowOf(Math.max(u, l), range, h, facing);
    const b = rowOf(Math.min(u, l), range, h, facing);
    for (let y = Math.min(a, b); y <= Math.max(a, b); y += 1) grid[y]![x] = shade; // cells-ok — a row index
  }
  return grid.map((r) => r.join("")); // cells-ok — a row of cells
}

/**
 * An edge's value at a fractional position along it, or `null` across a gap.
 *
 * **The inverse of the placement the edges used to use, and it is what both the
 * edge and the interior now walk.** The forward mapping puts sample *i* at
 * column `round(i/(n−1)·(w−1))` and leaves the columns between two samples with
 * no value at all, which is fine for a dot and wrong for a line and wrong for an
 * area. Asking each column which samples straddle it answers for every column.
 *
 * `null` where either neighbour is a gap (C04 I46a) — a segment with one end
 * missing has no interpolant, and inventing one draws data nobody sent.
 */
/**
 * A column's position **along the data**, which is not its position across the
 * area once the facing reverses (C12 §3ac).
 *
 * The interpolated edges walk `t ∈ [0, 1]` across the cells and ask `edgeAt`
 * for the value there; under a left-facing origin the leftmost cell holds the
 * *last* reading. One conversion at the boundary, rather than `edgeAt` learning
 * about origins — it is the inverse of a placement and has no opinion about
 * which end the placement started from.
 */
function along(t: number, facing: Facing): number {
  return facing.x === "left" ? 1 - t : t;
}

function edgeAt(values: readonly number[], t: number): number | null {
  const n = values.length; // cells-ok — a sample count
  if (n === 0) return null; // cells-ok — a sample count
  const only = values[0];
  if (n === 1) return only !== undefined && Number.isFinite(only) ? only : null; // cells-ok

  const pos = Math.min(n - 1, Math.max(0, t * (n - 1))); // cells-ok — a sample index
  const i0 = Math.min(n - 1, Math.floor(pos)); // cells-ok — a sample index
  const a = values[i0];
  const b = values[Math.min(n - 1, i0 + 1)]; // cells-ok — a sample index
  if (a === undefined || b === undefined) return null;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return a + (b - a) * (pos - i0);
}

/**
 * The braille edges over the shade, cell by cell — the edge wins its own cell.
 *
 * **`isBlank` and not a space test**, which is the defect this comment is
 * standing on. `foldBraille` folds an empty cell to `⠀` U+2800 rather than to a
 * space, so `cell !== " "` reads every cell of an untouched grid as inked and
 * the fill never draws — a fill that renders nothing while every count agrees.
 * The reader already exists in `curve.ts` and covers all three spellings; a
 * second one written here would have carried the wrong premise with it.
 *
 * **An unfilled cell keeps the edge's own byte**, so `fill: false` and the two
 * capability arms with no shade produce rows identical to the ones that shipped
 * before this existed, rather than rows that merely render the same.
 */
function overlay(edges: readonly string[], fill: readonly string[], w: number): readonly string[] {
  return edges.map((edge, y) => {
    const row = fill[y] ?? "";
    let out = "";
    for (let x = 0; x < w; x += 1) { // cells-ok — a column index
      const e = edge[x] ?? " ";
      const f = row[x] ?? " ";
      out += isBlank(e) && f !== " " ? f : e;
    }
    return out;
  });
}

function confidenceRows(
  annotation: Extract<Annotation, { kind: "confidence" }>,
  range: Range,
  w: number,
  h: number,
  caps: Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">,
  facing: Facing,
): readonly string[] {
  const { upper, lower } = annotation;
  const shade = shadeFor(caps);
  // **Defaults on** (C04 I52): `fill_between` is the figure a caller arrives
  // expecting, and `fill: false` keeps the two-edge frame byte for byte.
  const fill = (annotation.fill ?? true) && shade !== null
    ? fillRows(upper, lower, range, w, h, shade, facing)
    : null;

  if (caps.unicode === "ascii") {
    const grid: string[][] = Array.from({ length: h }, () => new Array<string>(w).fill(" ")); // cells-ok
    // **The dash steps the columns; it does not filter the samples.** Stepping
    // by `DASH_CELLS` inks every step, which is what `line` and `band` do one
    // branch up. Testing a sample's own column against the dash inked seven
    // cells whatever the sample count (C12 §3e).
    for (let x = 0; x < w; x += DASH_CELLS) { // cells-ok — a column index
      const t = along(w === 1 ? 0 : x / (w - 1), facing); // cells-ok — a column index
      for (const v of [edgeAt(upper, t), edgeAt(lower, t)]) {
        if (v === null || !drawn(v, range)) continue;
        const row = rowOf(v, range, h, facing);
        if (row >= 0 && row < h) grid[row]![x] = "-"; // cells-ok — a row index
      }
    }
    return grid.map((r) => r.join(""));
  }

  const grid = createGrid(w * BRAILLE_DOTS.x, h * BRAILLE_DOTS.y);
  // The same loop as the `line` edge two functions up — `x += DASH_CELLS *
  // dots.x`, every step inked — with the row varying instead of held.
  const span = Math.max(1, grid.dotWidth - 1); // cells-ok — a dot column
  for (let dotCol = 0; dotCol < grid.dotWidth; dotCol += DASH_CELLS * BRAILLE_DOTS.x) { // cells-ok
    const t = along(dotCol / span, facing); // cells-ok — a dot column
    for (const v of [edgeAt(upper, t), edgeAt(lower, t)]) {
      if (v === null || !drawn(v, range)) continue;
      setDot(grid, dotCol, rowOf(v, range, grid.dotHeight, facing));
    }
  }
  const edges = foldBraille(grid);
  // The edge wins its own cell inside this layer, and the *curve* wins it
  // outside — `mergedRow` takes the first layer that inked a cell and the
  // annotation is last (C12 §3e, §3u).
  return fill === null ? edges : overlay(edges, fill, w);
}

function whiskersRows(
  points: readonly Readonly<{ x: number; y: number; err: number }>[],
  range: Range,
  w: number,
  h: number,
  caps: Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">,
  facing: Facing,
): readonly string[] {
  if (caps.unicode === "ascii") {
    const grid: string[][] = Array.from({ length: h }, () => new Array(w).fill(" "));
    const n = points.length; // cells-ok — a point count
    for (let i = 0; i < n; i++) {
      const p = points[i]!;
      const at = facing.x === "left" ? n - 1 - i : i; // cells-ok — a point index
      const col = n <= 1 ? Math.floor(w / 2) : Math.round((at / (n - 1)) * (w - 1));
      if (col < 0 || col >= w) continue;
      const yTop = rowOf(p.y + p.err, range, h, facing);
      const yBot = rowOf(p.y - p.err, range, h, facing);
      const top = Math.min(yTop, yBot);
      const bot = Math.max(yTop, yBot);
      for (let r = top; r <= bot; r++) {
        if (r >= 0 && r < h) grid[r]![col] = "|";
      }
    }
    return grid.map((r) => r.join(""));
  }

  const grid = createGrid(w * BRAILLE_DOTS.x, h * BRAILLE_DOTS.y);
  for (let i = 0; i < points.length; i++) { // cells-ok — a point count
    const p = points[i]!;
    const at = facing.x === "left" ? points.length - 1 - i : i; // cells-ok — a point index
    const dotCol = points.length <= 1 // cells-ok — a point count
      ? Math.floor(grid.dotWidth / 2)
      : Math.round((at / (points.length - 1)) * (grid.dotWidth - 1)); // cells-ok — a point count
    if (dotCol < 0 || dotCol >= grid.dotWidth) continue;
    const yTop = rowOf(p.y + p.err, range, grid.dotHeight, facing);
    const yBot = rowOf(p.y - p.err, range, grid.dotHeight, facing);
    const top = Math.min(yTop, yBot);
    const bot = Math.max(yTop, yBot);
    for (let r = top; r <= bot; r++) setDot(grid, dotCol, r);
  }
  return foldBraille(grid);
}
