/**
 * Column planning — C11 §3.
 *
 * The governing constraint is A01 D38: **no horizontal scroll, ever.** A table
 * that does not fit sheds columns, and what it sheds reaches the expand row
 * (`detail.ts`). So this module answers one question — which columns survive at
 * this width, and how wide is each — and it answers it as a pure function.
 *
 * **No cache.** C11 §2 records the reversal and its three reasons: C11 owns no
 * state (I11) and A03 SS24 scans this directory for exactly that; measured
 * heights are already cached at C14 I3 on `(entryId, rev, width)`, which is where
 * the repeated work accumulates; and T3.16's budget is met without one, so a memo
 * would be complexity bought with nothing. If one is ever wanted its shape is
 * C05 §3a's — a `WeakMap` on the columns *object*, not on its content.
 *
 * Widths come from C04's `normaliseWidth` rather than from a local clamp, for the
 * same reason `insetWidth` exists: two components flooring the same number
 * differently is a drift found only at the widths nobody looks at.
 */
import { normaliseWidth } from "../../data/viewmodel/index.js";
import { distribute, type Demand } from "../layout/index.js";
import type { ColumnDef } from "../../data/viewmodel/index.js";

/** Cells between adjacent columns (§3 step 1). */
export const COLUMN_GAP = 2;

export type PlannedColumn = Readonly<{ key: string; width: number }>;

export type PlannedColumns = Readonly<{
  visible: readonly PlannedColumn[];
  /** In original column order (§2). */
  dropped: readonly string[];
  gap: number;
  /** True iff the last kept column was truncated — the step 4 case only. */
  overflowed: boolean;
}>;

/**
 * A declared minimum, made safe to do arithmetic with.
 *
 * Floored at 1 rather than 0: a zero-width column is a column that renders
 * nothing while still consuming a gap, which is worse than either showing it or
 * dropping it. Every surface declares at least 1 already (the `expand` column is
 * exactly 1), so this bites only on malformed input, where I7's totality is the
 * property that matters.
 */
function minOf(column: ColumnDef): number {
  const declared = Number(column.minWidth);
  if (!Number.isFinite(declared)) return 1;
  return Math.max(1, Math.floor(declared));
}

/**
 * A declared maximum, or null.
 *
 * **`minWidth` wins over a smaller `maxWidth`** (T3.4), silently: a contradictory
 * `ColumnDef` is a surface defect, and there is nowhere at L1 to report it —
 * A03 SS33 bans `console.*` across `src/` and no debug sink reaches a renderer.
 * Clamping below the minimum would truncate a column the surface promised whole,
 * which is the failure I10 exists to prevent, so the minimum is the one that
 * holds.
 */
function maxOf(column: ColumnDef): number | null {
  if (column.maxWidth === undefined) return null;
  const declared = Number(column.maxWidth);
  if (!Number.isFinite(declared)) return null;
  return Math.max(minOf(column), Math.floor(declared));
}

/** The cells a set of columns needs at its minimums, gaps included (§3 step 3). */
function required(mins: readonly number[]): number {
  if (mins.length === 0) return 0; // cells-ok
  let total = 0;
  for (const min of mins) total += min;
  return total + (mins.length - 1) * COLUMN_GAP; // cells-ok
}

type Candidate = Readonly<{ column: ColumnDef; index: number; min: number }>;

/**
 * Which columns survive, and how wide each is.
 *
 * Pure and total (I7): every input returns a plan, including zero columns, zero
 * width and a negative one.
 *
 * `role` is never read here (I15). The expand marker is content, and a planner
 * that reserved width for it would move every drop total the S-series states.
 */
export function planColumns(cols: readonly ColumnDef[], width: number): PlannedColumns {
  const available = normaliseWidth(width);

  if (cols.length === 0) { // cells-ok
    return Object.freeze({ visible: [], dropped: [], gap: COLUMN_GAP, overflowed: false });
  }

  const candidates: readonly Candidate[] = cols.map((column, index) => ({
    column,
    index,
    min: minOf(column),
  }));

  // Step 2 — priority descending, ties broken by declared order. The tie rule is
  // what makes T3.3 deterministic: with one priority throughout, admission runs
  // left to right, so the columns that drop are the rightmost.
  const byPriority = [...candidates].sort((a, b) => {
    const pa = Number.isFinite(a.column.priority) ? a.column.priority : 0;
    const pb = Number.isFinite(b.column.priority) ? b.column.priority : 0;
    return pb - pa || a.index - b.index;
  });

  // Step 3 — greedy admission, and it **stops** at the first column that does not
  // fit rather than skipping it.
  //
  // The two readings of "greedily admit while Σ minWidth + (n−1)·gap ≤ width" are
  // observably different, and S03 discriminates between them. At width 80 its
  // admitted set reaches 72 cells through `age`; `kind` (10) would take it to 84
  // and is refused. Skipping on to the rest, `mr` at 6 needs exactly 80 and fits —
  // so a skipping planner shows `mr` at 80, while S03's drop table says 80 drops
  // `mr`, `owner` and `kind`. The drop tables were verified against an independent
  // planner during specification; the "while" in step 3 is a bound on the loop,
  // not a filter over it.
  //
  // It is also the better rule to be held to: a lower-priority column appearing at
  // a width where a higher-priority one was refused reads as a drop order nobody
  // chose, and D38's promise is that the order is reviewable.
  const admitted: Candidate[] = [];
  for (const candidate of byPriority) {
    if (required([...admitted.map((a) => a.min), candidate.min]) > available) break;
    admitted.push(candidate);
  }

  // Step 4 — the degenerate case. At width 20 with a 40-cell column the table
  // renders one truncated column rather than nothing (I3), and `overflowed`
  // records it so a caller can react.
  let overflowed = false;
  if (admitted.length === 0) { // cells-ok
    const forced = byPriority[0];
    if (forced === undefined) {
      return Object.freeze({ visible: [], dropped: [], gap: COLUMN_GAP, overflowed: false });
    }
    admitted.push(forced);
    overflowed = true;
  }

  // Step 5 — display order is the declared order. Priority governs survival,
  // never position: dropping `owner` must not reorder `uuid` and `status` (I4).
  const kept = [...admitted].sort((a, b) => a.index - b.index);

  const widths = columnWidths(kept, available, overflowed);

  const keptKeys = new Set(kept.map((k) => k.index));
  const dropped = candidates.filter((c) => !keptKeys.has(c.index)).map((c) => c.column.key);

  return Object.freeze({
    visible: Object.freeze(
      kept.map((k, i) => Object.freeze({ key: k.column.key, width: widths[i] ?? 1 })),
    ),
    dropped: Object.freeze(dropped),
    gap: COLUMN_GAP,
    overflowed,
  });
}

/**
 * Steps 6 to 8 — residual width to the flex columns, `maxWidth` respected.
 *
 * **The loop is C29's** (C29 I4, I5, I6). Steps 6 to 8 were a second copy of
 * the engine's surplus arm, down to the fixed point: share the residual among
 * the open columns, pin one that reaches its cap, share what that frees again.
 * The two even agreed on the leftover cell — C11 gave it to the leftmost flex
 * column and the engine gives it by largest remainder with ties in declaration
 * order, and under equal weights those are the same column. One loop now, and
 * the cap-and-re-run is written once.
 *
 * Step 8 is the one that looks like an omission and is a decision: with no flex
 * column the residual is **left unused** and the table renders narrower than the
 * terminal, rather than stretching columns arbitrarily. That is `weight: 0` on
 * every column, and the engine leaves the pot alone rather than needing a
 * clause. C07's fallback is exactly this shape — every column `minWidth: 3`,
 * none flex — which is why its rendered output is a finding about C07 §5 rather
 * than about this function.
 */
function columnWidths(
  kept: readonly Candidate[],
  available: number,
  overflowed: boolean,
): readonly number[] {
  // The forced column is the only one that may be narrower than its minimum, and
  // it is truncated to the terminal rather than overflowing it (I5).
  if (overflowed) return [Math.min(kept[0]?.min ?? 1, available)];

  // **The gaps come out of the budget, not out of a column.** `required` adds
  // them back when the planner asks whether a set fits; here they are simply
  // not on the table, which is what `childGap` is on a C29 row.
  const gaps = Math.max(0, kept.length - 1) * COLUMN_GAP; // cells-ok — a cell count
  const demands: readonly Demand[] = kept.map((k) => {
    const cap = maxOf(k.column);
    return {
      base: k.min,
      min: k.min,
      max: cap === null ? Infinity : cap,
      // **`flex` is the weight and the weights are equal** (§3 step 6). A
      // column that does not flex does not grow, which is `weight: 0` and the
      // engine's own pinning rather than a filter here.
      weight: k.column.flex === true ? 1 : 0,
    };
  });
  return distribute(demands, available - gaps, "largest-remainder").sizes;
}
