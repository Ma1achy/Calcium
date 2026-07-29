/**
 * The expand row — C11 §3's "Dropped columns are not lost", and D38's other half.
 *
 * **No field is ever unreachable; it is one keystroke further away.** A dropped
 * column becomes a `keyValue` entry prepended to whatever `detail` the row
 * already carries, and a row becomes expandable *because* columns dropped,
 * whether or not it declared any detail at all.
 *
 * That derivation is the whole of it (I2, T2.8, T6.12). Tie expandability to a
 * declared `detail` and the promise is empty: a row with no detail is not
 * expandable, so at a narrow width its dropped fields are genuinely gone —
 * precisely the outcome D38 exists to prevent. It is also what makes dropping
 * *aggressively* safe, which is why the drop tables can be as aggressive as they
 * are.
 */
import type { Block, ColumnDef, KeyValue, Table, TableRow } from "../../data/viewmodel/index.js";
import type { PlannedColumns } from "./plan.js";

/**
 * Whether the row can be opened, derived rather than declared.
 *
 * `expandable = detail !== undefined || dropped.length > 0` — C11 §3, verbatim.
 */
export function isExpandable(row: TableRow, plan: PlannedColumns): boolean {
  return row.detail !== undefined || plan.dropped.length > 0; // cells-ok
}

/**
 * The blocks an expanded row reveals: the dropped columns first, then the row's
 * own detail.
 *
 * Dropped first because they are the columns the reader just watched disappear,
 * and the row's own detail is what it always showed. S03 §2's expand fragment
 * draws them in that order.
 *
 * The synthesised block's id is scoped to the table and the row. These blocks are
 * measured and rendered but never enter a `ViewDocument`, so C04 I14 does not
 * reach them — the scoping is so that two expanded rows do not hand React the
 * same key, which is a defect that presents as a row's detail appearing under its
 * neighbour.
 */
export function detailBlocks(
  block: Table,
  row: TableRow,
  plan: PlannedColumns,
): readonly Block[] {
  const own = row.detail ?? [];
  if (plan.dropped.length === 0) return own; // cells-ok

  const byKey = new Map<string, ColumnDef>(block.columns.map((c) => [c.key, c]));

  const entries = plan.dropped.map((key) => {
    const column = byKey.get(key);
    const cell = row.cells[key];
    const label = column === undefined ? key : column.label;
    // A row missing a cell for a dropped column still gets its label. The field
    // is present and empty, which is a different statement from the field being
    // absent — and the conformance corpus grows tables by a row with no cells at
    // all, so this is a path the suite takes.
    const value = cell === undefined ? "" : cell.text;
    return cell?.tone === undefined
      ? { label, value }
      : { label, value, tone: cell.tone };
  });

  const synthesised: KeyValue = {
    kind: "keyValue",
    id: `${block.id}-${row.id}-dropped`,
    rows: entries,
  };

  return [synthesised, ...own];
}
