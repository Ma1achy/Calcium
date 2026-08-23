/**
 * Civil-date arithmetic — the one date parser, at the layer both halves reach.
 *
 * **`stripControl`'s argument, one file along** (`src/data/text.ts`): C04's
 * validator has to refuse a `startDate` that is not a day, and C12's renderer
 * has to place the readings that string anchors. Two implementations of *is this
 * a date* would be two answers, and the one that drifts is the one nobody runs —
 * `cells()` makes the same case for measurement.
 *
 * **No `Date`, and SS1 is the reason before the taste is.**
 * `tools/enforce/source-scans.mjs` bans the constructor across `src/` and allows
 * `src/shell/session.ts` alone. Howard Hinnant's days-from-civil is pure and
 * total, which serves C12 I11 better than the constructor would: no locale, no
 * zone table, no clock, and defined for every integer it is handed.
 *
 * **UTC only**, on `chrome.ts:formatClock`'s recorded reason — a local-time
 * conversion is the part that needs the platform's zone database.
 */

/** Where a calendar's first reading sits, in the terms its four maps ask for. */
export type CalendarStart = Readonly<{
  /** Days since 1970-01-01, UTC. */
  z: number;
  /** 0–23, from an explicit `THH` or zero. */
  hour: number;
  year: number;
  /** 1–12. */
  month: number;
}>;

/** The Gregorian rule, whole: 2000 is a leap year and 2100 is not. */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** Days in a month, 1-indexed, with February asking `isLeapYear`. */
export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return MONTH_LENGTHS[month - 1] ?? 0;
}

/**
 * Days since 1970-01-01 for a civil date (Hinnant).
 *
 * The era shift moves March to the front of the year, which is what makes the
 * leap day the *last* day of a year rather than a special case in the middle of
 * one — so there is no branch on February anywhere below.
 */
export function daysFromCivil(year: number, month: number, day: number): number {
  const y = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(y / 400);
  const yoe = y - era * 400; // 0 … 399
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1; // 0 … 365
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy; // 0 … 146096
  return era * 146097 + doe - 719468;
}

/** The inverse, exact for every `z` `daysFromCivil` can return. */
export function civilFromDays(days: number): Readonly<{ year: number; month: number; day: number }> {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097; // 0 … 146096
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  ); // 0 … 399
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)); // 0 … 365
  const mp = Math.floor((5 * doy + 2) / 153); // 0 … 11
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1; // 1 … 31
  const month = mp + (mp < 10 ? 3 : -9); // 1 … 12
  return { year: yoe + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

/**
 * The weekday, **Monday zero**, because 1970-01-01 was a Thursday.
 *
 * The double modulo is for dates before the epoch: `-1 % 7` is `-1` in
 * JavaScript, and a negative row index is the one thing a grid cannot hold.
 */
export function weekdayFromDays(days: number): number {
  return (((days + 3) % 7) + 7) % 7;
}

/**
 * `YYYY-MM-DD`, optionally an hour, and nothing that would be silently dropped
 * (C04 §3, C12 §3ae).
 *
 * Minutes and seconds are accepted and ignored because they are *inside* the
 * cell — an hour's reading is the hour's whatever the minute says — and that is
 * what makes ignoring them honest rather than lossy. A zone offset is refused by
 * not matching: honouring it needs arithmetic across a zone database, and
 * ignoring it puts the reading in the wrong cell.
 *
 * `null` rather than a throw, because both callers need a decision rather than a
 * failure — the validator turns it into a message and the renderer into a frame
 * (C12 I11).
 */
const START_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2})(?::(\d{2})(?::(\d{2}))?)?Z?)?$/u;

export function parseStartDate(text: string): CalendarStart | null {
  const m = START_DATE.exec(text);
  if (m === null) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = m[4] === undefined ? 0 : Number(m[4]);
  const minute = m[5] === undefined ? 0 : Number(m[5]);
  const second = m[6] === undefined ? 0 : Number(m[6]);
  if (month < 1 || month > 12) return null;
  // **The leap rule is load-bearing here and nowhere else in the parse**:
  // `2026-02-30` is four correct digits, two correct digits and two correct
  // digits, and it is not a day.
  if (day < 1 || day > daysInMonth(year, month)) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  return { z: daysFromCivil(year, month, day), hour, year, month };
}
