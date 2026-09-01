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
import type { Cell, ColumnDef, Table, TableRow } from "../../data/viewmodel/index.js";

/** The value a row carries for a column, or "" when it carries none. */
function valueOf(row: TableRow, key: string): string {
  const cell: Cell | undefined = row.cells[key];
  return cell === undefined ? "" : cell.text;
}

/**
 * Missing is absent or empty, and nothing else.
 *
 * A surface's placeholder — S03 draws `—` for a metric a failed run never
 * produced — is data the surface chose to show, and reading it as absence would
 * be C11 inferring meaning from cell content, which is I12's objection one field
 * over. It sorts as the text it is.
 */
function isMissing(value: string): boolean {
  return value.trim() === "";
}

const THOUSANDS = /,/g;
const NUMERIC = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)%?$/;
const DURATION = /^(?:\d+(?:\.\d+)?\s*[smhdw]\b\s*)+/;
const DURATION_PART = /(\d+(?:\.\d+)?)\s*([smhdw])/g;

const SECONDS: Readonly<Record<string, number>> = Object.freeze({
  s: 1,
  m: 60,
  h: 3_600,
  d: 86_400,
  w: 604_800,
});

function asNumber(value: string): number | null {
  const bare = value.replace(THOUSANDS, "").trim();
  if (!NUMERIC.test(bare)) return null;
  const n = Number(bare.endsWith("%") ? bare.slice(0, -1) : bare);
  return Number.isFinite(n) ? n : null;
}

/**
 * A duration in seconds, or null.
 *
 * Multi-part durations are summed, because S03 draws `1h 12m` beside `23m` and a
 * parser reading only the first part would order them by the hour alone. A
 * trailing word is ignored — S06 draws `2h ago` — since the unit carries the
 * magnitude and the word carries nothing.
 */
function asDuration(value: string): number | null {
  const text = value.trim();
  if (!DURATION.test(text)) return null;

  let total = 0;
  let seen = false;
  DURATION_PART.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DURATION_PART.exec(text)) !== null) {
    const size = Number(m[1]);
    const unit = SECONDS[m[2] ?? ""];
    if (!Number.isFinite(size) || unit === undefined) return null;
    total += size * unit;
    seen = true;
  }
  return seen ? total : null;
}

type ColumnKind = "numeric" | "duration" | "text";

/**
 * How a column sorts, decided from the values present in it.
 *
 * Every non-missing value must agree: one `AUC 0.912` in a column of numbers
 * makes the whole column text, because a comparator that returns null for some
 * of its input is a comparator with no defined order. Numeric is tried before
 * duration so a bare `12` is a number rather than a parse failure, and `12m` is a
 * duration because no number ends in a letter.
 */
function kindOf(rows: readonly TableRow[], key: string): ColumnKind {
  let numeric = true;
  let duration = true;
  let seen = false;

  for (const row of rows) {
    const value = valueOf(row, key);
    if (isMissing(value)) continue;
    seen = true;
    if (asNumber(value) === null) numeric = false;
    if (asDuration(value) === null) duration = false;
    if (!numeric && !duration) return "text";
  }

  if (!seen) return "text";
  return numeric ? "numeric" : duration ? "duration" : "text";
}

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

  const kind = kindOf(block.rows, sort.key);
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
