/**
 * Waffle — a 10×10 grid of filled/empty cells, one per percent.
 *
 * Requires `segments`. Fixed 10 rows, no axes.
 */
import type { Segment } from "../../data/viewmodel/index.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";
import { pairFor } from "./ramp.js";

type Caps = Pick<TerminalCapabilities, "unicode" | "ambiguousWidth" | "colourDepth">;

export type WaffleCell = Readonly<{ mark: string; segmentIndex: number }>;

/**
 * 10 rows of exactly `width` cells. Each cell represents 1% of the total.
 *
 * Segments fill left-to-right, top-to-bottom.
 */
export function waffleRows(
  segments: readonly Segment[],
  width: number,
  caps: Caps,
): readonly string[] {
  return waffleCells(segments, width, caps).map((row) => row.map((c) => c.mark).join(""));
}

/**
 * Per-cell segment info for coloured rendering.
 */
export function waffleCells(
  segments: readonly Segment[],
  width: number,
  caps: Pick<Caps, "unicode" | "ambiguousWidth" | "colourDepth">,
): readonly (readonly WaffleCell[])[] {
  const w = Math.max(1, Math.floor(width));
  const cols = Math.min(w, 10);
  const gridSize = 100;

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
  for (let r = 0; r < 10; r++) {
    const row: WaffleCell[] = [];
    for (let c = 0; c < cols; c++) {
      const cell = grid[r * 10 + c]!;
      row.push(cell >= 0
        ? { mark: pair.filled, segmentIndex: cell }
        : { mark: pair.empty, segmentIndex: -1 });
    }
    for (let c = cols; c < w; c++) {
      row.push({ mark: " ", segmentIndex: -1 });
    }
    rows.push(row);
  }
  return rows;
}
