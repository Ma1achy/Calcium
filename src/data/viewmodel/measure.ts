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

import type { Group, Panel } from "./types.js";

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
export function childWidths(block: Panel | Group, width: number): readonly number[] {
  if (block.kind === "panel") {
    return block.children.map(() => insetWidth(width));
  }
  const each = groupChildWidth(block.direction, width, block.children.length);
  return block.children.map(() => each);
}
