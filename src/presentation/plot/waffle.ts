/**
 * Waffle — a 10×10 grid of filled/empty cells, one per percent.
 *
 * Requires `segments`. Fixed 10 rows, no axes.
 */
import type { Segment } from "../../data/viewmodel/index.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";
import { pairFor } from "./ramp.js";

type Caps = Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">;

/**
 * 10 rows of exactly `width` cells. Each cell represents 1% of the total.
 *
 * Segments fill left-to-right, top-to-bottom. The grid is always 10 rows;
 * `width` determines column count (clamped to 10 for a square waffle when
 * wider, but we use all available width and repeat segments proportionally).
 */
export function waffleRows(
  segments: readonly Segment[],
  width: number,
  caps: Caps,
): readonly string[] {
  const w = Math.max(1, Math.floor(width));
  const cols = Math.min(w, 10);
  const gridSize = 100;

  const mark = pairFor(caps);
  const filled = mark.filled;
  const empty = mark.empty;

  const sum = segments.reduce((a, s) => a + s.value, 0);
  const scale = sum > 0 ? gridSize / sum : 0;

  const grid = new Array(gridSize).fill(-1) as number[];
  let pos = 0;
  segments.forEach((seg, idx) => {
    const count = Math.round(seg.value * scale);
    for (let i = 0; i < count && pos < gridSize; i++) {
      grid[pos++] = idx;
    }
  });

  const rows: string[] = [];
  for (let r = 0; r < 10; r++) {
    let row = "";
    for (let c = 0; c < cols; c++) {
      const cell = grid[r * 10 + c];
      row += cell !== undefined && cell >= 0 ? filled : empty;
    }
    const pad = " ".repeat(Math.max(0, w - cols));
    rows.push(row + pad);
  }
  return rows;
}
