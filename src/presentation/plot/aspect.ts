/**
 * A terminal cell is not square, and exactly one file used to know it.
 *
 * **The compensation belongs in one place because the number is one number.** A
 * cell is about one column wide and two rows tall — call it 1×2 — so a figure
 * that wants to look square must spend twice as many columns as rows.
 * `circle.ts` did that (`rx = 2·ry`, which is why our pie is round where
 * granite's is an ellipse) and `waffle.ts` did not, so its 10×10 grid rendered
 * ten wide and twenty tall: a tall rectangle where a mosaic belongs.
 *
 * Same terminal geometry, two answers, one file aware of it. That is the shape
 * of every defect this component has had twice.
 *
 * **Not a capability**, deliberately. The ratio is a property of monospace text
 * rather than of a terminal's declared features: no escape sequence reports it,
 * every font is close enough to 1×2 that the approximation holds, and a font
 * that is not would break every box-drawing figure in the framework long before
 * it broke a waffle.
 */

/** How much taller than wide a cell is. */
export const CELL_ASPECT = 2;

/**
 * The column count that renders as square beside `rows` rows.
 *
 * Floored at 1: a figure with no room to be square is still a figure, and a
 * zero-column mosaic is not an improvement on a wrong-shaped one.
 */
export function squareColumns(rows: number): number {
  return Math.max(1, Math.round(Math.max(0, rows) * CELL_ASPECT)); // cells-ok — a column count
}

// **`squareRows` is not here, and it was.** The inverse was written in the same
// breath — *a waffle knows its rows, a figure fitting an area knows its
// columns* — and the second caller does not exist. MG25 caught it on the commit
// that added it, which is the rule about exports nothing consumes doing its job:
// an unused inverse is a second definition of the ratio, free to drift from this
// one, and the day something needs it is the day to write it.
