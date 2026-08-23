/**
 * The character grid a figure is drawn on, and the box-drawing mask beside it.
 *
 * **Extracted from `tree.ts` rather than copied into `graph.ts`** (C12 §3ai).
 * Four independent gutter implementations already exist in this directory and
 * each was reasonable when it was written; that is how they arrived and how
 * they would return. Two forms drawing labels and edges on a cell grid is the
 * moment to make it one thing, not the moment after.
 *
 * Text and mask are separate planes merged at the end: a label is written into
 * `text`, an edge sets bits in `mask`, and `paint` resolves a mask bit to a
 * glyph only where the text left the cell blank. So a label always wins the
 * cell it occupies and an edge routed through it is bent rather than drawn over.
 */
import type { TerminalCapabilities } from "../../terminal/capabilities.js";
import { cells } from "../text.js";
import { glyphForMask } from "./linedraw.js";

type Caps = Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">;

/** A text cell grid and the edge mask beside it, merged at the end. */
export type Grid = Readonly<{ text: string[][]; mask: number[][] }>;

export function grid(rows: number, columns: number): Grid {
  return {
    text: Array.from({ length: rows }, () => new Array<string>(columns).fill(" ")),
    mask: Array.from({ length: rows }, () => new Array<number>(columns).fill(0)),
  };
}

/**
 * Lay a label into a row from `at`, one codepoint per its own cell width.
 *
 * A two-cell character writes itself and leaves `""` behind it, so the cell it
 * occupies is not one an edge can walk into — the same continuation the
 * treemap's names and a point label both needed, and the same reason (§3n).
 */
export function write(row: string[], at: number, body: string, caps: Caps): void {
  let col = at; // cells-ok — a column position
  for (const ch of body) {
    if (col < 0 || col >= row.length) break; // cells-ok — a column position
    row[col] = ch;
    const w = cells(ch, caps.ambiguousWidth);
    for (let k = 1; k < w; k += 1) if (col + k < row.length) row[col + k] = ""; // cells-ok — a cell count
    col += w; // cells-ok — a cell count
  }
}

export function paint(g: Grid, corners: "rounded" | "sharp", caps: Caps): readonly string[] {
  return g.text.map((row, r) =>
    row
      .map((cell, c) => {
        if (cell !== " ") return cell;
        const m = g.mask[r]![c] ?? 0;
        return m === 0 ? " " : glyphForMask(m, corners, caps);
      })
      .join("")
      .replace(/\s+$/u, ""),
  );
}

export const setMask = (g: Grid, r: number, c: number, bits: number): void => {
  if (r < 0 || r >= g.mask.length) return; // cells-ok — a row index
  const row = g.mask[r]!;
  if (c < 0 || c >= row.length) return; // cells-ok — a column position
  row[c] = (row[c] ?? 0) | bits;
};
