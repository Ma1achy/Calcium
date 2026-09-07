/**
 * The mosaic's grid, parsed once and shared by both gates and the renderer
 * (C04 §3f, I71, I72).
 *
 * **One parse, because three callers asking the same question differently is how
 * a refusal and a render come to disagree.** `validateDocument` needs the faults,
 * `b.mosaic` needs the same faults at construction, and C09's definition needs
 * the rectangles — and the rectangles are only well defined once the faults are
 * ruled out, so the two are one function rather than two.
 *
 * `data/` and not `presentation/`: this is arithmetic over a string and a width,
 * and it knows nothing of terminals (A02 §1, L0's two halves).
 */
import type { Share } from "./types.js";

/** One named region, in grid coordinates rather than cells. */
export type MosaicRegion = Readonly<{
  name: string;
  col: number;
  row: number;
  cols: number;
  rows: number;
}>;

/** A parsed `areas` string. Regions are in reading order (C04 §3f.1). */
export type MosaicGrid = Readonly<{
  columns: number;
  rows: number;
  regions: readonly MosaicRegion[];
}>;

export type MosaicParse =
  | Readonly<{ ok: true; grid: MosaicGrid }>
  | Readonly<{ ok: false; fault: string }>;

/** A hole: drawn as blanks, named by no child, and exempt from the rectangle rule. */
export const MOSAIC_HOLE = ".";

/**
 * The grid a spec string names, or the first fault (C04 §3f.1, I71).
 *
 * **The first fault and not all of them**, on the walk's own terms: a ragged
 * grid has no column count, so every rule after rule 2 would be reporting about
 * a shape that does not exist. Refusals are ordered so that each one's premise
 * is established by the one before it.
 */
export function parseAreas(areas: string): MosaicParse {
  const rows = areas.split("/");
  // 1 · There is no grid.
  if (areas.length === 0 || rows.some((r) => r.length === 0)) {
    return {
      ok: false,
      fault: `"areas" needs at least one row and every row at least one column (C04 I71) — got ${JSON.stringify(areas)}`,
    };
  }
  // 2 · The grid is ragged, so it has no column count.
  const columns = rows[0]?.length ?? 0; // cells-ok — a grid column count
  const ragged = rows.findIndex((r) => r.length !== columns); // cells-ok — a grid column count
  if (ragged !== -1) {
    return {
      ok: false,
      fault:
        `"areas" row ${String(ragged)} has ${String(rows[ragged]?.length ?? 0)} columns and row 0 has ` +
        `${String(columns)} (C04 I71) — a ragged grid has no column count, so nothing below it is defined`,
    };
  }

  // 3 · Every named region is a solid rectangle. **The one a reader cannot
  // see**: `"ABA"` names a region in two pieces and looks like a spec string.
  const seen = new Map<string, { col: number; row: number; col2: number; row2: number; n: number }>();
  const order: string[] = [];
  for (const [r, line] of rows.entries()) {
    for (let c = 0; c < line.length; c += 1) {
      const name = line[c];
      if (name === undefined || name === MOSAIC_HOLE) continue;
      const box = seen.get(name);
      if (box === undefined) {
        seen.set(name, { col: c, row: r, col2: c, row2: r, n: 1 });
        order.push(name);
        continue;
      }
      box.col = Math.min(box.col, c);
      box.row = Math.min(box.row, r);
      box.col2 = Math.max(box.col2, c);
      box.row2 = Math.max(box.row2, r);
      box.n += 1;
    }
  }
  for (const name of order) {
    const box = seen.get(name);
    if (box === undefined) continue;
    const area = (box.col2 - box.col + 1) * (box.row2 - box.row + 1);
    // **Counting the cells is what catches both shapes.** A hole in the middle
    // and a region split in two both give an area larger than the count, so one
    // comparison covers the L and the disjoint pair.
    if (box.n !== area) {
      return {
        ok: false,
        fault:
          `"areas" region ${JSON.stringify(name)} is not a rectangle (C04 I71) — it covers ` +
          `${String(box.n)} cells inside a ${String(box.col2 - box.col + 1)}x${String(box.row2 - box.row + 1)} box`,
      };
    }
  }

  const regions = order.map((name) => {
    const box = seen.get(name) ?? { col: 0, row: 0, col2: 0, row2: 0, n: 0 };
    return Object.freeze({
      name,
      col: box.col,
      row: box.row,
      cols: box.col2 - box.col + 1,
      rows: box.row2 - box.row + 1,
    });
  });
  return { ok: true, grid: Object.freeze({ columns, rows: rows.length, regions: Object.freeze(regions) }) };
}

/**
 * A budget divided by shares — the group's widths and both of the mosaic's axes
 * (C04 I44, I72).
 *
 * **Extracted rather than copied**, which is the standing hazard in this tree
 * named where it can still be avoided: `presentation/plot/` already carries four
 * independent gutter implementations, and a second copy of this rule would drift
 * on the boundary case rather than on the common one.
 *
 * Fixed `{cells: n}` shares come off the budget first and the weights divide
 * what remains; any other order makes a cell count a suggestion. The floor of 1
 * makes the arithmetic total.
 */
/** A share that names cells rather than a proportion (C04 I44). */
function isCells(share: Share): share is Readonly<{ cells: number }> {
  return typeof share === "object";
}

export function divideShares(shares: readonly Share[], total: number, gaps: number): readonly number[] {
  const n = shares.length; // cells-ok — a share count
  if (n === 0) return [];
  const fixed = shares.reduce<number>((sum, s) => sum + (isCells(s) ? s.cells : 0), 0);
  const budget = total - gaps - fixed;
  const weights = shares.reduce<number>((sum, s) => sum + (isCells(s) ? 0 : s), 0);
  return shares.map((share) => {
    if (isCells(share)) return Math.max(1, share.cells); // cells-ok — a declared cell count
    // A row of fixed shares alone divides nothing: the floor answers rather
    // than an infinity.
    if (weights === 0) return Math.max(1, budget); // cells-ok — a cell count
    return Math.max(1, Math.floor((budget * share) / weights)); // cells-ok — a cell count
  });
}

/**
 * The remainder, distributed rather than dropped — `facetWidths`' ruling, in the
 * one place it applies here.
 *
 * **Not in `divideShares`, and the difference is the gutter.** A `row` group
 * puts a cell between its children and T3.16 pins its remainder where it is, so
 * changing the shared rule would move a shipped frame for a decision that is not
 * the share rule's to make. A mosaic **tiles**: three columns of `floor(40/3)`
 * leave the right-hand column blank at every width that does not divide, which
 * is exactly what C12 §3 called *visible as a ragged edge in every faceted
 * frame*.
 *
 * The leftover goes one cell each to the earliest lines that are not a fixed
 * `{cells: n}` — a cell count stays a cell count (C04 I44), so it can neither
 * absorb the remainder nor be shortened by it.
 */
function spread(lines: readonly number[], total: number, shares?: readonly Share[]): readonly number[] {
  const used = lines.reduce((a, b) => a + b, 0);
  let left = total - used; // cells-ok — a cell count
  if (left <= 0) return lines;
  return lines.map((n, i) => {
    const fixed = shares !== undefined && shares[i] !== undefined && isCells(shares[i] as Share);
    if (fixed || left <= 0) return n;
    left -= 1;
    return n + 1; // cells-ok — a cell count
  });
}

/** One region's rectangle, in cells. */
export type MosaicRect = Readonly<{ left: number; top: number; width: number; height: number }>;

/**
 * Where each region sits, in cells (C04 I72).
 *
 * **A spanning region takes the sum of what it spans** — walk M1. Not its own
 * share: a region covering two columns has no single column to be weighted by,
 * and giving it one would make the grid's totals depend on which regions happen
 * to span.
 */
export function mosaicRects(
  grid: MosaicGrid,
  width: number,
  height: number,
  columns?: readonly Share[],
  rows?: readonly Share[],
): readonly MosaicRect[] {
  const ones = (n: number): readonly Share[] => Array.from({ length: n }, () => 1);
  const colWidths = spread(divideShares(columns ?? ones(grid.columns), width, 0), width, columns);
  const rowHeights = spread(divideShares(rows ?? ones(grid.rows), height, 0), height, rows);
  const sum = (xs: readonly number[], from: number, count: number): number =>
    xs.slice(from, from + count).reduce((a, b) => a + b, 0);

  // **Clamped here, because the clip below cannot save it** (C09 I35). Ink keeps
  // a stack of clipping regions and applies `clips.at(-1)` — the innermost — so
  // a cell that clips its own child **shadows** the container's clip rather than
  // intersecting with it, and the frame runs past the width with every count
  // agreeing. Measured: three 1-wide cells in a container of 1 draw `"A"` with
  // the container clipping alone and `"ABC"` once the cells clip too.
  //
  // So the geometry is the guarantee and the clip is not a backstop. The floor
  // of 1 per grid line is what makes this reachable: a three-column grid asks
  // for three cells at any width, including one.
  return grid.regions.map((r) => {
    const left = sum(colWidths, 0, r.col);
    const top = sum(rowHeights, 0, r.row);
    return Object.freeze({
      left,
      top,
      // **A cell with no room is zero-wide and is not drawn**, which is the only
      // one of the three answers that keeps both axes of C09 I1: drawing it
      // over-runs the region, and widening the region is not this block's to do.
      width: Math.max(0, Math.min(sum(colWidths, r.col, r.cols), width - left)), // cells-ok — a cell count
      height: Math.max(0, Math.min(sum(rowHeights, r.row, r.rows), height - top)), // cells-ok — a row count
    });
  });
}
