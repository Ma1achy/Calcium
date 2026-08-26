/**
 * Waffle — a 10×10 grid of filled/empty cells, one per percent.
 *
 * Requires `segments`. Fixed 10 rows, no axes.
 */
import type { Segment } from "../../data/viewmodel/index.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";
import { pairFor } from "./ramp.js";
import { squareColumns } from "./aspect.js";

import { markOf } from "./marks.js";
// **The grid's shape and its assignment are the figure's** (§3ak.26). Ten rows
// of ten is a property of the mosaic and not of the terminal — an SVG waffle is
// ten by ten as well — and what is terminal is the *columns*, twenty of them,
// because `squareColumns` compensates for a cell being twice as tall as it is
// wide. That compensation is the one that really does disappear at the second
// arm (F303).
import { WAFFLE_ROWS, waffleGrid } from "./figure.js";

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
  const perSquare = Math.max(1, Math.floor(cols / WAFFLE_ROWS)); // cells-ok — a cell width

  const pair = pairFor(caps);
  const grid = waffleGrid(segments);

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
