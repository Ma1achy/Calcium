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
import { rowOf } from "./scale.js";

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
  return annotation.kind === "band" ? [annotation.from, annotation.to] : [annotation.value];
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
): readonly string[] {
  const w = Math.max(1, Math.floor(areaWidth));
  const h = Math.max(1, Math.floor(areaRows));
  const edges = edgesOf(annotation).filter((v) => drawn(v, range));

  if (caps.unicode === "ascii") {
    const rows = new Set(edges.map((v) => rowOf(v, range, h)));
    const dashes = Array.from({ length: w }, (_, x) => (x % DASH_CELLS === 0 ? "-" : " ")).join("");
    return Array.from({ length: h }, (_, i) => (rows.has(i) ? dashes : ""));
  }

  const grid = createGrid(w * BRAILLE_DOTS.x, h * BRAILLE_DOTS.y);
  for (const value of edges) {
    const y = rowOf(value, range, grid.dotHeight);
    for (let x = 0; x < grid.dotWidth; x += DASH_CELLS * BRAILLE_DOTS.x) setDot(grid, x, y);
  }
  return foldBraille(grid);
}
