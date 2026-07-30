/**
 * A series to rows of glyphs — the step where I5 and I14 meet.
 *
 * C12 §3 records why the composition needs four values per dot column rather than
 * two, and `scale.ts`'s `Column` is that type. Here is what the two invariants do
 * with it:
 *
 *     within a column   the vertical span [min, max]   → the spike survives (I5)
 *     between columns   last → next first, Bresenham   → the curve connects (I14)
 *
 * With at most one sample per column all four values coincide and the span is a
 * single dot, so this is plain Bresenham between points. Fifty samples and fifty
 * thousand take one path, and there is no density branch to get wrong at the
 * boundary — which is the reason to do it this way rather than switching
 * strategies above some threshold.
 */
import { BRAILLE_DOTS, createGrid, drawColumnSpan, drawLine, foldBraille, foldRamp, RAMP_DOTS } from "./raster.js";
import { columnsOf, finiteSamples, rowOf, type Range } from "./scale.js";
import { rampFor } from "./ramp.js";
import type { Series } from "../../data/viewmodel/index.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";

/** The blank cell each mode folds to, for the merge in `definition.ts`. */
export const BRAILLE_BLANK = "⠀";

/** Whether a folded cell carries any ink. */
export function isBlank(cell: string): boolean {
  return cell === " " || cell === BRAILLE_BLANK || cell === "";
}

/**
 * One series, rasterised into `areaRows` rows of `areaWidth` cells.
 *
 * The dot grid is sized from the cell grid and the mode's dots-per-cell, so the
 * braille and ASCII forms occupy an identical cell grid by construction rather
 * than by agreement (I9) — the division is the same division, and there is no
 * second place for the two to drift apart.
 */
export function curveRows(
  series: Series,
  range: Range,
  areaWidth: number,
  areaRows: number,
  caps: Pick<TerminalCapabilities, "unicode">,
): readonly string[] {
  const ascii = caps.unicode === "ascii";
  const dots = ascii ? RAMP_DOTS : BRAILLE_DOTS;
  const grid = createGrid(areaWidth * dots.x, areaRows * dots.y);

  const samples = finiteSamples(series.values);
  const columns = columnsOf(samples, series.values.length, grid.dotWidth); // cells-ok — a sample count
  const y = (v: number): number => rowOf(v, range, grid.dotHeight);

  columns.forEach((column, index) => {
    // I5: the whole vertical extent of what this column held. A single sample
    // makes this one dot, which is why there is no special case for it.
    drawColumnSpan(grid, column.x, y(column.max), y(column.min));

    const next = columns[index + 1];
    if (next === undefined) return;

    // I14, and the adjacency test is where I4 lands: two columns are joined only
    // if their samples are consecutive in the *original* series. A filtered
    // non-finite value leaves a hole in the indices, and the line breaks across
    // the gap rather than spanning it (§4).
    if (next.iFirst !== column.iLast + 1) return;
    drawLine(grid, column.x, y(column.last), next.x, y(next.first));
  });

  return ascii ? foldRamp(grid, rampFor(caps)) : foldBraille(grid);
}
