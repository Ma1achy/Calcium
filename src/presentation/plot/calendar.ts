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
import { civilFromDays, parseStartDate, weekdayFromDays } from "../../data/dates.js";

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

/** `2026-03-04`, with the parts padded so a column of them lines up. */
function iso(days: number): string {
  const c = civilFromDays(days);
  return `${String(c.year).padStart(4, "0")}-${String(c.month).padStart(2, "0")}-${String(c.day).padStart(2, "0")}`;
}

/**
 * What column `k` is called, at the **super-unit's** granularity (C12 §3ae.8).
 *
 * The rows say which month; the legend says how much; without this the super
 * unit has no voice at all — twelve years of monthly readings at a pitch of six
 * is seventy-two cells of wash with nothing saying which year a column is, and
 * the frame is what showed it because every assertion was about the grid.
 *
 * **Not the index's own date.** A column is a period, so the caption is the
 * period rather than the first reading in it: a column of days is the week its
 * Monday starts, whichever day the series began on.
 */
export function calendarColumnLabel(unit: CalendarUnit, start: CalendarStart, column: number): string {
  if (unit === "hour") return iso(start.z + column);
  if (unit === "day") return iso(start.z - weekdayFromDays(start.z) + 7 * column);
  if (unit === "week") {
    const m = start.month - 1 + column;
    return `${String(start.year + Math.floor(m / 12)).padStart(4, "0")}-${String((m % 12) + 1).padStart(2, "0")}`;
  }
  return String(start.year + column);
}

/**
 * The three captions, or `undefined` where this block is not a dated calendar.
 *
 * **Read through the map rather than off the series' own indices**, which is the
 * whole of §3ae.8's second half: where the readings outnumber the cells the
 * oldest are dropped, and captioning column 0 would name a week that is not on
 * the frame. `columns` is `columnMap`'s output — the one derivation — so the
 * caption and the cell under it are answering from the same array.
 */
export function calendarCaptions(
  block: Plot,
  columns: readonly (number | null)[],
): readonly [string, string, string] | undefined {
  const unit = block.calendarUnit;
  if (block.form !== "calendar" || unit === undefined) return undefined;
  if (block.startDate === undefined) return undefined;

  // **Precedence is the caller's business and it is expressed once.** This used
  // to refuse where `block.xLabels` was set, which is the same rule the `??` at
  // the call site states — and two guards for one rule make the call site's
  // mutation a no-op. The pass is what said so: swapping the two operands
  // failed nothing, because this function had already answered `undefined`.
  const start = parseStartDate(block.startDate);
  if (start === null) return undefined;
  const shown = columns.filter((c): c is number => c !== null);
  const last = shown[shown.length - 1]; // cells-ok — a column index
  const first = shown[0];
  const mid = shown[Math.floor((shown.length - 1) / 2)]; // cells-ok — a column index
  if (first === undefined || mid === undefined || last === undefined) return undefined;
  const at = (c: number): string => calendarColumnLabel(unit, start, c);
  return [at(first), at(mid), at(last)];
}
