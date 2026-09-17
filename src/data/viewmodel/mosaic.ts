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

/**
 * The leftover after flooring — **a declared policy, not the arithmetic's**
 * (C04 I42, F1219).
 *
 * Declared here rather than in C29 because both consumers are below it: a
 * group spends nothing, a mosaic tiles, and the engine's own distribution takes
 * the same word. One declaration, so the two cannot drift apart into two
 * vocabularies for one decision.
 */
export type Spend = "none" | "largest-remainder";

/**
 * `count` cells across `weights` by largest remainder, **ties by declaration
 * order** (C04 I42, C29 I4).
 *
 * Every line gets `floor(share)`; the leftover goes one cell each down the
 * fractional parts, descending. Declaration order as the tie-break is what
 * makes a frame a pure function of the tree — a sort that is not total leaves
 * the frame to the runtime's sort implementation, which a byte-exact golden
 * cannot allow.
 *
 * **One implementation, and it lives at L0 because both callers do.** C29's
 * `distribute` reads it downward; `mosaicRects` reads it here. The engine
 * cannot own it without `mosaicRects` importing upward, and a second copy is
 * the drift F1219 ruled against — the group and the mosaic disagreeing on a
 * leftover cell is exactly the defect that ruling closed.
 */
export function largestRemainder(
  weights: readonly number[],
  count: number,
  spend: Spend,
): readonly number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || count <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (count * w) / total);
  const given = exact.map((e) => Math.floor(e)); // cells-ok — a cell count
  let left = count - given.reduce((a, b) => a + b, 0); // cells-ok — a cell count
  if (spend === "none" || left <= 0) return given;
  const order = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => (b.frac === a.frac ? a.i - b.i : b.frac - a.frac));
  for (const { i } of order) {
    if (left <= 0) break;
    given[i] = (given[i] ?? 0) + 1; // cells-ok — a cell count
    left -= 1;
  }
  return given;
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
 * One axis of the grid: every line's size in cells (C04 I44, I72 · C29 I4).
 *
 * **A line is a proportion with a floor, not a grower with a minimum**, and the
 * walk measured the difference (C29 §8a C10). Reserving a cell per line off the
 * top before weighting — which is what `GROW` with `min: 1` means — turns a
 * declared `[1, 3]` at width 8 into `[3, 5]`, and a reader who wrote 1:3 would
 * be right to call that wrong. So the shares divide the whole budget by largest
 * remainder and the floor bites only where a proportion falls below one cell.
 *
 * Fixed `{cells: n}` lines come off the budget first and are neither shortened
 * nor absorbers: a cell count that shrinks is a suggestion (C04 I44).
 *
 * **The leftover goes by largest remainder with ties in declaration order**,
 * which is the mosaic's declared policy — a grid that leaves its right-hand
 * column short is ragged in every faceted frame (C12 §3, F1219). `spread` used
 * to give it to the earliest lines instead; the two agree on equal weights,
 * which is why one function could replace both, and they differ wherever the
 * weights are unequal and the budget does not divide.
 */
function gridLines(shares: readonly Share[], total: number): readonly number[] {
  const n = shares.length; // cells-ok — a share count
  if (n === 0) return [];
  const fixed = shares.map((s) => (isCells(s) ? Math.max(1, s.cells) : 0)); // cells-ok — declared cell counts
  const weights = shares.map((s) => (isCells(s) ? 0 : s));
  const budget = total - fixed.reduce((a, b) => a + b, 0); // cells-ok — a cell count
  const share = largestRemainder(weights, Math.max(0, budget), "largest-remainder");
  return shares.map((s, i) =>
    isCells(s) ? fixed[i]! : Math.max(1, share[i] ?? 0), // cells-ok — a cell count
  );
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
  const colWidths = gridLines(columns ?? ones(grid.columns), width);
  const rowHeights = gridLines(rows ?? ones(grid.rows), height);
  const sum = (xs: readonly number[], from: number, count: number): number =>
    xs.slice(from, from + count).reduce((a, b) => a + b, 0);

  // **The geometry is not clamped, and the cut lives where the rows are
  // written** (C29 §8a C9). It used to be one expression doing two jobs: the
  // floor of 1 per grid line, which is geometry, and a clamp to `width - left`,
  // which is a cut. Clamping in the geometry gave three answers to one
  // arithmetic outcome — a cell measured at 1, a zero-width focusable element,
  // and nothing drawn — each locally defensible and not the same fact.
  //
  // **Shrink, never drop.** A line never goes below one cell; where the floors
  // do not fit, the grid is wider than its container and the container cuts. So
  // a region here is what the grid says it is, and `render` cuts each piece to
  // the room the grid actually has — the same place `fitRow` already cuts
  // (F1211). Ink's clip stack is no longer the mechanism and the note it needed
  // has gone with it.
  return grid.regions.map((r) => {
    const left = sum(colWidths, 0, r.col);
    const top = sum(rowHeights, 0, r.row);
    return Object.freeze({
      left,
      top,
      // **A region is the sum of what it spans, and nothing more is decided
      // here.** Whether the grid has room for it is the container's question.
      width: sum(colWidths, r.col, r.cols), // cells-ok — a cell count
      height: sum(rowHeights, r.row, r.rows), // cells-ok — a row count
    });
  });
}
