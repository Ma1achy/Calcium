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

import type { Block, Group, MeasureFn, Panel } from "./types.js";

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

/** `panel` children, and a table row's `detail` blocks (§3). */
export function insetWidth(width: number): number {
  return normaliseWidth(normaliseWidth(width) - BORDER_INSET);
}

/**
 * The width a `group` gives each child (§3).
 *
 * `column` passes `w` through. `row` splits equally —
 * `floor((w - gaps) / n)`, with `n - 1` gutters — and takes the max of the
 * results. There is no weights field: uneven allocation is expressible as
 * nested groups, and a weights field would be a second layout system inside a
 * height rule that has to stay simple enough to hold I7.
 *
 * The split can floor to 0 at narrow widths; `normaliseWidth` takes it to 1, so
 * a `row` group still measures rather than dividing by zero (T3.6c).
 */
export function groupChildWidth(
  direction: Group["direction"],
  width: number,
  childCount: number,
): number {
  const w = normaliseWidth(width);
  if (direction === "column" || childCount <= 1) return w;
  const gaps = (childCount - 1) * ROW_GUTTER;
  return normaliseWidth(Math.floor((w - gaps) / childCount));
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
  const each = groupChildWidth(block.direction, width, block.children.length);
  let used = 0;
  let placed = 0;
  for (const _child of block.children) {
    const needed = placed === 0 ? each : each + ROW_GUTTER;
    if (used + needed > w) break;
    used += needed;
    placed += 1;
  }

  // At least one, so a group is never emptied by arithmetic alone.
  return Math.max(1, placed);
}

export function childWidths(block: Panel | Group, width: number): readonly number[] {
  if (block.kind === "panel") {
    return block.children.map(() => insetWidth(width));
  }
  const each = groupChildWidth(block.direction, width, block.children.length);
  return block.children.map(() => each);
}

/**
 * The rows a *sequence* of blocks occupies: their heights, plus one row for
 * each block declaring `gapBefore` (§3a, I19).
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
