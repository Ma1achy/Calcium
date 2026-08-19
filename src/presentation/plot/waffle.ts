/**
 * Waffle — a 10×10 grid of filled/empty cells, one per percent.
 *
 * Requires `segments`. Fixed 10 rows, no axes.
 */
import type { Segment } from "../../data/viewmodel/index.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";
import { pairFor } from "./ramp.js";
import { squareColumns } from "./aspect.js";

/** Ten rows of ten, one square per percent. */
const WAFFLE_ROWS = 10;
import { markOf } from "./marks.js";

type Caps = Pick<TerminalCapabilities, "unicode" | "ambiguousWidth" | "colourDepth">;

export type WaffleCell = Readonly<{ mark: string; segmentIndex: number }>;

/**
 * Per-cell segment info for coloured rendering.
 */
export function waffleCells(
  segments: readonly Segment[],
  width: number,
  caps: Pick<Caps, "unicode" | "ambiguousWidth" | "colourDepth">,
): readonly (readonly WaffleCell[])[] {
  const w = Math.max(1, Math.floor(width));
  // **Twice as many columns as rows, because a cell is not square.** Ten cells
  // by ten rows renders ten wide and twenty tall — a tall rectangle where a
  // mosaic belongs, and the one file that knew about cell aspect was
  // `circle.ts`. Each square of the waffle is `CELL_ASPECT` cells wide.
  const cols = Math.min(w, squareColumns(WAFFLE_ROWS));
  const gridSize = 100;
  const perSquare = Math.max(1, Math.floor(cols / WAFFLE_ROWS)); // cells-ok — a cell width

  const pair = pairFor(caps);

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

  const rows: WaffleCell[][] = [];
  for (let r = 0; r < WAFFLE_ROWS; r++) {
    const row: WaffleCell[] = [];
    for (let c = 0; c < cols; c++) {
      const cell = grid[r * WAFFLE_ROWS + Math.floor(c / perSquare)]!; // cells-ok — a square index
      // **The segment's own mark, not one fill for all of them** (C12 I25).
      // Every cell drew `pair.filled`, so a three-segment waffle was one solid
      // block the moment colour went — and it was the single genuine failure of
      // the nine the sweep first reported. `markOf` is uniform above the colour
      // floor, so this changes nothing where tone already separates them.
      row.push(cell >= 0
        ? { mark: markOf(cell, caps), segmentIndex: cell }
        : { mark: pair.empty, segmentIndex: -1 });
    }
    for (let c = cols; c < w; c++) {
      row.push({ mark: " ", segmentIndex: -1 });
    }
    rows.push(row);
  }
  return rows;
}
