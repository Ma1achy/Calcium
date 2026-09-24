/**
 * Sort — C11 §4.
 *
 * Stable, type-aware, height-neutral, and details travel with their parents.
 *
 * **The pairing is structural here, not defended.** A01 Appendix A.2 records the
 * mockup's client-side sort having to solve "keep detail rows paired to their
 * parent", and it was hard there because rows and their detail were two
 * sequences. C04 puts `detail` *inside* `TableRow`, so reordering rows cannot
 * separate them — there is no second array to forget. T1.12 asserts the rendered
 * order anyway: a property that holds by construction is still worth a test,
 * because the construction can change.
 *
 * Height-neutrality follows for the same reason: this returns a permutation, so
 * the count and every `expanded` flag are preserved and C14 never remeasures
 * after a sort (T1.13, T4.5).
 */
import { compareByGrapheme } from "../text.js";
import type { ColumnDef, Table, TableRow } from "../../data/viewmodel/index.js";
import { asDuration, asNumber, columnKind, isMissing, valueOf, type ColumnKind } from "./kind.js";


/**
 * The rows in display order.
 *
 * A `sort` naming a column that does not exist, or one the surface declared
 * unsortable, is **ignored** — the declared order is returned and nothing throws
 * (T3.12, T3.13). A view-state field is data from a far side by the time it
 * reaches here, and a renderer that threw on it would take down a frame over a
 * stale sort key.
 */
export function sortedRows(block: Table): readonly TableRow[] {
  // **A window's rows are already in display order** (C11 I19). Sorting them
  // again is not a no-op: `kindOf` below reads the values *present*, so a slice
  // that dropped the one non-numeric value in a numeric-looking column
  // re-classifies it and comes back in a different order — `2 · 10 · abc` sorts
  // to `10 · 2 · abc` whole and its first two rows re-sort to `2 · 10`, with
  // every count and every height correct (F429). `sort` itself is kept: the
  // indicator is drawn from it, and a scrolled table that lost its arrow would
  // be a visible regression in the one place a reader looks.
  if (block.presorted === true) return block.rows;

  const sort = block.sort;
  if (sort === undefined) return block.rows;

  const column: ColumnDef | undefined = block.columns.find((c) => c.key === sort.key);
  if (column === undefined || !column.sortable) return block.rows;

  const kind = columnKind(block.rows, sort.key);
  const descending = sort.direction === "desc";

  // Decorated with the input index, which is what makes the sort stable: equal
  // keys keep their original order, so re-sorting on a second column preserves
  // the first as a tiebreak (I8, T1.11).
  const decorated = block.rows.map((row, index) => ({ row, index }));

  decorated.sort((a, b) => {
    const av = valueOf(a.row, sort.key);
    const bv = valueOf(b.row, sort.key);

    // **Missing sorts last in both directions** (I13). Not first ascending and
    // last descending: a null is an absence of rank rather than the bottom of
    // one, and a reader sorting to find the worst case should not find blanks.
    // Compared before the direction is applied, which is what keeps it last
    // either way.
    const am = isMissing(av);
    const bm = isMissing(bv);
    if (am || bm) {
      if (am && bm) return a.index - b.index;
      return am ? 1 : -1;
    }

    const ordered = compareValues(av, bv, kind);
    return (descending ? -ordered : ordered) || a.index - b.index;
  });

  return decorated.map((d) => d.row);
}

function compareValues(a: string, b: string, kind: ColumnKind): number {
  if (kind === "numeric") {
    const an = asNumber(a) ?? 0;
    const bn = asNumber(b) ?? 0;
    return an - bn;
  }
  if (kind === "duration") {
    // By magnitude, so `12m` precedes `2h` rather than following it lexically.
    const ad = asDuration(a) ?? 0;
    const bd = asDuration(b) ?? 0;
    return ad - bd;
  }
  return compareByGrapheme(a, b);
}
