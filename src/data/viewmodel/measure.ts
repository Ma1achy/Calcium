/**
 * The measurement contract's arithmetic.
 *
 * C04 §5 — see spec. **C04 ships no measurers.** `render` needs theme and
 * capabilities, so the registry lives in C09, and a measurer separated from its
 * renderer is the pair that drifts silently (§1). What C04 ships is the part
 * every measurer must agree on and none of them should re-derive:
 *
 *   - the width a container gives a child (§3), and
 *   - the floor every present block sits on (I17).
 *
 * These are functions rather than prose deliberately. C11 already measured its
 * detail at `w - 2` while nothing said so; a second component reading the same
 * paragraph and writing `w - 1` would be a real drift found only by T2.1, at
 * whichever width a child happens to wrap. A shared function cannot drift.
 */

import type { Block, Group, MeasureFn, Panel, Share } from "./types.js";
import type { ContainerBlock } from "./tree.js";

/**
 * Width 0 is treated as 1 (T3.2). No measurer divides by zero, and no caller
 * has to remember that — every width entering this module goes through here.
 */
export function normaliseWidth(width: number): number {
  if (!Number.isFinite(width)) return 1;
  return Math.max(1, Math.floor(width));
}

/**
 * I17 — a present block occupies at least one row. `ceil(cells("") / w)` is 0
 * and an empty notice renders as a row. Stated once over every kind rather than
 * as a clause in the three whose arithmetic reaches zero, because it is the
 * same arithmetic in each of them.
 *
 * An empty container measures 0 and must not come through here: that is the
 * absence of content rather than empty content (T3.5).
 */
export function atLeastOne(rows: number): number {
  if (!Number.isFinite(rows)) return 1;
  return Math.max(1, Math.floor(rows));
}

/** The border takes a column each side. `panel`, and a table's expanded detail. */
export const BORDER_INSET = 2;

/** One cell of gutter between each adjacent pair in a `row` group. */
export const ROW_GUTTER = 1;

/** A share that names cells rather than a proportion (I44). */
function isCells(share: Share): share is Readonly<{ cells: number }> {
  return typeof share === "object";
}

/** `panel` children, and a table row's `detail` blocks (§3). */
export function insetWidth(width: number): number {
  return normaliseWidth(normaliseWidth(width) - BORDER_INSET);
}

/**
 * The width a `group` gives each child, in order (§3, I42).
 *
 * `column` passes `w` through to every child. `row` divides it by the declared
 * weights, and **four rules the equal split made invisible are stated here**
 * because they are identical under it and differ the moment a weight does:
 *
 *   - **The gutter comes off the top**, before any share is computed. Taking it
 *     proportionally makes the separator between a 2 and a 1 narrower than the
 *     one between two 2s, and a gutter's job is identical between every pair.
 *   - **The remainder after flooring is unspent**, exactly as it is with no
 *     weights at all. Spending it — on the leftmost child, as C11 does with a
 *     table's residual — would make `flex: [1, 1]` differ from no `flex`, and a
 *     table's residual exists *to be absorbed* where a group has no child that
 *     claims it.
 *   - **Absent weights are an equal split**, and the arithmetic below reduces to
 *     the old `floor((w - gaps) / n)` when every weight is equal. T3.16 asserts
 *     that against the unweighted path rather than against a number.
 *   - **The floor of 1 is unchanged.** `normaliseWidth` takes a share of 0 to 1,
 *     so a `row` group still measures rather than dividing by zero (T3.6c) —
 *     and weights move C09 §4b's degenerate boundary into ordinary range rather
 *     than adding a rule: `[50, 1]` reaches the floor at eighty columns with two
 *     children, where the equal split needs sixty children at a hundred and
 *     twenty.
 */
export function groupChildWidths(block: Group, width: number): readonly number[] {
  const w = normaliseWidth(width);
  const n = block.children.length;
  if (block.direction === "column" || n <= 1) return block.children.map(() => w);

  const gaps = (n - 1) * ROW_GUTTER;
  const shares = block.flex ?? block.children.map(() => 1);

  // **Fixed first, and what remains is what the weights divide** (I44). Any
  // other order makes a cell count a suggestion, which is the one thing a cell
  // count is not — the banner's whale is 40 cells and `40 : 61` gives it 41 at
  // 105 columns and 47 at 120.
  const fixed = shares.reduce<number>((sum, share) => sum + (isCells(share) ? share.cells : 0), 0);
  const budget = w - gaps - fixed;
  const weights = shares.reduce<number>((sum, share) => sum + (isCells(share) ? 0 : share), 0);

  return block.children.map((_child, i) => {
    const share = shares[i] ?? 1;
    if (isCells(share)) return normaliseWidth(share.cells);
    // A row of fixed children alone divides nothing: `weights` is 0 and there is
    // no share to compute, so the floor answers rather than an infinity.
    if (weights === 0) return normaliseWidth(budget);
    return normaliseWidth(Math.floor((budget * share) / weights));
  });
}

/**
 * The two container kinds C04 can resolve without knowing a child's kind. C09's
 * `panel` and `group` measurers call this rather than restating §3, and a table's
 * detail uses `insetWidth` directly (C11 §2).
 *
 * Returns the width for each child in order, so a caller maps rather than
 * indexes — a `row` group gives every child the same width today, and a future
 * weights field would change that here and nowhere else.
 */
/**
 * Which children a `row` group can place, and at what width (§3).
 *
 * The floor of 1 makes the arithmetic total and, at a narrow width, makes the
 * children plus their gutters wider than the group: two children at width 1
 * need three columns. A child that cannot be placed is placed by *neither*
 * half — it contributes to neither the rendered rows nor the measured height —
 * which is the only one of the three available answers that keeps them
 * agreeing.
 *
 * Above `2n - 1` columns every child fits and this returns all of them.
 */
export function placeable(block: Panel | Group, width: number): number {
  if (block.kind === "panel" || block.direction === "column") {
    return block.children.length;
  }

  const w = normaliseWidth(width);
  // **Left to right, by position and never by size** (I42). Under an equal split
  // the two are the same rule, because every child costs the same; under weights
  // they are not, and dropping the smallest or the largest would make the
  // rendered set depend on a number rather than on the order the author wrote.
  const widths = groupChildWidths(block, width);
  let used = 0;
  let placed = 0;
  for (const each of widths) {
    const needed = placed === 0 ? each : each + ROW_GUTTER;
    if (used + needed > w) break;
    used += needed;
    placed += 1;
  }

  // At least one, so a group is never emptied by arithmetic alone.
  return Math.max(1, placed);
}

export function childWidths(block: ContainerBlock, width: number): readonly number[] {
  if (block.kind === "panel") {
    return block.children.map(() => insetWidth(width));
  }
  // **A `scroll` takes the full width and insets nothing.** Its box is drawn by
  // bounding rows, not by a border, so there is no frame to sit inside — and
  // the residue marker is a row rather than a column (I49).
  //
  // This arm is here because the parameter widened to `ContainerBlock` and the
  // compiler then refused every call site that could hand it a `scroll`. That
  // is the seventh enumeration of the container kinds and the only one nothing
  // had to notice by hand: `tree.ts` derived the type, and `tsc` found the
  // function that answered for two kinds of three.
  if (block.kind === "scroll") {
    return block.children.map(() => atLeastOne(width));
  }
  return groupChildWidths(block, width);
}

/**
 * The rows a *sequence* of blocks occupies: their heights, plus one row for
 * each block declaring `gapBefore` (§3a, I25).
 *
 * A sequence is a document's top level, a `panel`'s children, or a `column`
 * group's children — anything laid out one after another down the screen. A
 * `row` group is not one: its children sit side by side, so a gap before one of
 * them is meaningless and is ignored rather than being an error.
 *
 * **No measurer counts a gap.** A block measures the same wherever it appears,
 * which is what lets C14 key its cache on the block and the width alone; the
 * arithmetic that differs between a block and a run of them lives here, once,
 * for the same reason `childWidths` does.
 *
 * The first block's gap is a leading blank row, not a special case. Dropping it
 * would make the field mean two things depending on position, and a document
 * assembled by concatenating two others would render differently from either.
 */
export function sequenceHeight(
  blocks: readonly Block[],
  width: number,
  measureChild: MeasureFn,
): number {
  let total = 0;
  for (const block of blocks) {
    total += measureChild(block, width);
    if (block.gapBefore === true) total += 1;
  }
  return total;
}

/** The gap rows a sequence contributes, without measuring anything. */
export function gapRows(blocks: readonly Block[]): number {
  let gaps = 0;
  for (const block of blocks) if (block.gapBefore === true) gaps += 1;
  return gaps;
}
