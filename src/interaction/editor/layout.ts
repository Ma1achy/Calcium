/**
 * The one walk: display rows, their count, and the cursor's cell.
 *
 * C17 §2, §7b, I3, I4, I18, I19, I20 — see spec.
 *
 * `displayRows` is a measurement contract in C09 I1's sense. The frame's
 * viewport height is `rows − header − prompt − footer` (S01 §3), so a prompt
 * that lies about its height misaligns everything above it rather than only
 * itself — and L4 draws the rows this returns rather than wrapping the buffer
 * again (I18, S01 §3). One walk, for the reason there is one `cells()`.
 *
 * Three rules came out of drawing the figure (§7b), and each is an off-by-one
 * on its own:
 *
 *   - **`usable = max(1, width − gutter)`**, with `first` on the buffer's first
 *     display row only. Every later row takes `cont`, whether it is a wrap or a
 *     new logical line.
 *   - **A row exists for every position the cursor can occupy** (I19), so a
 *     logical line whose last cluster exactly fills a row emits a trailing
 *     empty row — per line. `ceil(cells / usable)` is one short there, agrees
 *     everywhere else, and leaves the cursor at the end of a full command with
 *     no row to sit on. T3.8's trailing `\n` is this same rule.
 *   - **Clusters are walked, never divided** (I20). One that does not fit moves
 *     whole and leaves its cell blank; one wider than `usable` takes a row of
 *     its own and *overflows* it. C09 I19 substitutes a `?` in the same case
 *     and the divergence is deliberate: a block renders someone's data, an
 *     editor holds what the user typed.
 */

import { clusterWidth, graphemes } from "./graphemes.js";

export type Gutter = Readonly<{ first: number; cont: number }>;

export type Cell = Readonly<{ row: number; col: number }>;

/** The usable columns on a display row. Row 0 of the buffer carries `first`. */
function usableAt(row: number, width: number, gutter: Gutter): number {
  const w = Number.isFinite(width) ? Math.floor(width) : 1;
  const indent = row === 0 ? gutter.first : gutter.cont;
  return Math.max(1, w - Math.max(0, Math.floor(indent)));
}

/**
 * The rows, and the display position of every cursor index, from one walk.
 *
 * Returned together because they are the same traversal: `layout` and
 * `cursorCell` computing their answers separately is the divergence I18 exists
 * to prevent, one file lower than the one S01 would have introduced it in.
 *
 * `cells[i]` is where the cursor sits when `cursor === i`, so it has one more
 * entry than the buffer has clusters — the end position is a position.
 */
export function walk(
  text: string,
  width: number,
  gutter: Gutter,
): Readonly<{ rows: readonly string[]; cells: readonly Cell[] }> {
  const rows: string[] = [];
  const cells: Cell[] = [];

  let row = "";
  let used = 0;

  const open = (): void => {
    rows.push(row);
    row = "";
    used = 0;
  };

  /**
   * Which display row the walk is on.
   *
   * Named once rather than annotated four times. `rows.length` is a count of
   * rows and not of anything text-shaped, so `// graphemes-ok` is the honest
   * claim (SS40, test/support/README.md) — and stating it in one place is the
   * difference between a claim a reviewer can check and four marks that start
   * to read as "the scan complained here".
   */
  const at = (): number => rows.length; // graphemes-ok

  for (const line of text.split("\n")) {
    // The cursor's position at the start of this logical line.
    cells.push({ row: at(), col: gutterAt(at(), gutter) + used });

    for (const cluster of graphemes(line)) {
      const limit = usableAt(at(), width, gutter);
      const w = clusterWidth(cluster);

      // Moves whole. A cluster wider than the whole row still goes on one — it
      // overflows rather than being dropped or substituted (I20).
      if (used > 0 && used + w > limit) open();

      row += cluster;
      used += w;

      // A row that is exactly full ends here, so the position after this
      // cluster is the start of the next row (I19). Opening it now rather than
      // when the next cluster arrives is what gives that position a cell.
      if (used >= usableAt(at(), width, gutter)) open();

      cells.push({ row: at(), col: gutterAt(at(), gutter) + used });
    }

    // End of the logical line. When the last cluster filled the row exactly,
    // the fullness test above already opened a fresh one and this pushes it
    // empty — which is I19's trailing row, and the same push that gives a
    // buffer ending in `\n` its final empty row (T3.8). The two are one rule.
    open();
  }

  // The position before a `\n` is pushed by the line's last cluster and the one
  // after it by the next line's first push, so the count is exact; the slice is
  // a guard on that arithmetic rather than a trim.
  return { rows, cells: cells.slice(0, cellCount(text)) }; // graphemes-ok
}

function gutterAt(row: number, gutter: Gutter): number {
  return Math.max(0, Math.floor(row === 0 ? gutter.first : gutter.cont));
}

/** Positions, which is clusters plus one. */
function cellCount(text: string): number {
  return graphemes(text).length + 1; // graphemes-ok
}

export function layout(text: string, width: number, gutter: Gutter): readonly string[] {
  return walk(text, width, gutter).rows;
}

export function displayRows(text: string, width: number, gutter: Gutter): number {
  return layout(text, width, gutter).length; // graphemes-ok
}

export function cursorCell(text: string, cursor: number, width: number, gutter: Gutter): Cell {
  const { cells } = walk(text, width, gutter);
  const i = Math.min(Math.max(0, cursor), cells.length - 1); // graphemes-ok
  return cells[i] ?? { row: 0, col: gutterAt(0, gutter) };
}
