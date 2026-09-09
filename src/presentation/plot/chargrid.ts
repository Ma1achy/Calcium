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
import { cells, graphemes, type AmbiguousWidth } from "../text.js";
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
 * Lay a label into a row from `at`, one grapheme cluster per the cells it
 * measures (C12 I118, §3n).
 *
 * **The one writer.** The treemap's names, `tree`'s and `graph`'s labels, the
 * sankey's node labels and the point labels all come through here. Four
 * private copies of this loop wrote one *code point* per cell, advancing by
 * `cells()` of the code point, so a zero-width piece was written and then
 * overwritten by the piece after it: a family `👨‍👩‍👧` arrived as three faces, a
 * keycap `1️⃣` as a bare digit, and `café` decomposed as `cafe` (F969, F976).
 *
 * **A cluster owns the cells it measures.** It is written whole into the cell
 * where it starts, and the cells after that one up to its width are `""` —
 * the continuation the four already kept, so a two-cell character is not one
 * an edge, a fill or a ribbon can walk into, and the row keeps its count. **A
 * cluster measuring nothing owns none**: a lone leading combining mark or a
 * bare joiner is dropped and the column does not move, because attaching it
 * to a neighbour would put a mark on an edge glyph or on a tile's colour ring,
 * which is worse than losing a mark that had no base. `scatter3.ts`'s
 * `overlay` is the precedent (C12 I92, F970).
 *
 * The row is `(string | undefined)[]` because the treemap's grid and the
 * sankey's line use `undefined` for *no label here*; a `string[]` row is
 * assignable, and the tree, the graph and the point labels pass one. A
 * cluster that would start outside the row stops the write, so a caller that
 * placed by measurement cannot write past the row.
 */
export function write(
  row: (string | undefined)[],
  at: number,
  body: string,
  ambiguous: AmbiguousWidth,
): void {
  let col = at; // cells-ok — a column position
  for (const cluster of graphemes(body)) {
    if (col < 0 || col >= row.length) break; // cells-ok — a column position
    const w = cells(cluster, ambiguous);
    if (w === 0) continue;
    row[col] = cluster;
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
