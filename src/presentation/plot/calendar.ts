/**
 * A calendar's grid — one flat series in, `N` labelled rows out (C12 I53, §3ae).
 *
 * **`calendar` was a `heatmap` alias with no date logic in it at all** — a
 * `MATRIX_LAYOUT` row, a `DEFAULT_COLORMAP` row, and that was the whole of it.
 * The catalogue's frame is a seven-row grid whose `Mon … Sun` labels the
 * *fixture* wrote, and `startDate` sat on `Plot` from step 0 with four
 * occurrences, all writes. This file is what reads it.
 *
 * The arithmetic is `src/data/dates.ts` and not here, on `stripControl`'s
 * argument: C04's validator has to refuse a `startDate` that is not a day and
 * this file has to place the readings it anchors, and two implementations of
 * *is this a date* are two answers.
 */
import type { Plot, Series } from "../../data/viewmodel/index.js";
import type { CalendarStart } from "../../data/dates.js";
import { civilFromDays, weekdayFromDays } from "../../data/dates.js";

/** The cell a calendar's grid is built from. */
export type CalendarUnit = NonNullable<Plot["calendarUnit"]>;

/**
 * The rows a unit declares, in the order they are drawn from the lid down.
 *
 * **Total over the four units**, so a fifth stops compiling until it says what
 * its rows are called — the argument `MATRIX_LAYOUT` and `DEFAULT_COLORMAP` both
 * make one file over, and the one those two were widened to a `Record` for.
 */
export const CALENDAR_ROWS: Readonly<Record<CalendarUnit, readonly string[]>> = Object.freeze({
  hour: Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0")),
  day: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  week: ["W1", "W2", "W3", "W4", "W5"],
  month: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
});

/**
 * Where the reading at index `i` lands (C12 §3ae.2).
 *
 * **Three units are `(offset + i) mod cycle` and `week` is a calendar**, because
 * a month is not a whole number of weeks. That asymmetry is the reason `week` is
 * the only unit whose grid has *interior* holes — a 28-day February has no W5,
 * and a start on the 12th leaves W1 empty in its own first column. Those cells
 * are periods that do not exist rather than readings that are missing.
 */
function cellOf(
  unit: CalendarUnit,
  start: CalendarStart,
  i: number,
): Readonly<{ row: number; column: number }> {
  if (unit === "week") {
    const civil = civilFromDays(start.z + 7 * i);
    return {
      row: Math.floor((civil.day - 1) / 7),
      column: 12 * (civil.year - start.year) + (civil.month - start.month),
    };
  }
  const cycle = CALENDAR_ROWS[unit].length; // cells-ok — a row count
  const offset = unit === "hour"
    ? start.hour
    : unit === "day"
      ? weekdayFromDays(start.z)
      : start.month - 1;
  const n = offset + i;
  return { row: n % cycle, column: Math.floor(n / cycle) };
}

/**
 * The grid, as a series list the matrix family already knows how to draw.
 *
 * **Sized before it is filled, and that is not an implementation detail**: the
 * column count comes from every index's column *before* any cell is written, so
 * there is no half-built grid for a failure to abandon. §3ae.6 says this is the
 * shape an optimisation would remove, which is why it is written down rather
 * than left to be read off the code.
 */
export function calendarGrid(
  unit: CalendarUnit,
  start: CalendarStart,
  values: readonly (number | null)[],
): readonly Series[] {
  const labels = CALENDAR_ROWS[unit];
  const cells = values.map((_, i) => cellOf(unit, start, i));
  let columns = 0; // cells-ok — a column count
  for (const cell of cells) columns = Math.max(columns, cell.column + 1); // cells-ok
  const grid = labels.map(() => Array.from<number | null>({ length: columns }).fill(null));
  values.forEach((v, i) => {
    const cell = cells[i];
    const row = cell === undefined ? undefined : grid[cell.row];
    if (cell !== undefined && row !== undefined) row[cell.column] = v;
  });
  return labels.map((label, r) => ({ label, values: grid[r] ?? [] }));
}
