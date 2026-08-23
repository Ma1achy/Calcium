/**
 * CL1–CL12 — the calendar's grid, its arithmetic and its refusals
 * (C12 I53, §3ae · C04 I62).
 *
 * **The weekday rows are checked against an oracle that is not this code.**
 * Eight dates, their weekdays read from the system `date` before any of this was
 * written — 1970-01-01 Thu, 1900-01-01 Mon, 2000-01-01 Sat, 2024-02-29 Thu,
 * 2026-08-21 Fri, 2100-01-01 Fri, 1969-12-31 Wed, 2026-01-01 Thu. A hand-rolled
 * calendar checked against itself is the shape `test/support/README.md` records.
 */
import { describe, expect, it } from "vitest";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { FULL_CAPS, MONO_UNICODE_CAPS, measurable } from "../support/render.js";
import { block, validateBlock, type Plot } from "../../src/data/viewmodel/index.js";
import { b } from "../../src/shell/builders/index.js";
import {
  civilFromDays,
  daysFromCivil,
  daysInMonth,
  isLeapYear,
  parseStartDate,
  weekdayFromDays,
} from "../../src/data/dates.js";
import { CALENDAR_ROWS, calendarGrid } from "../../src/presentation/plot/calendar.js";

const kit = (caps = FULL_CAPS) => measurable({ definitions: [plotDefinition], capabilities: caps });

const draw = (spec: Record<string, unknown>, w = 80): readonly string[] =>
  kit()
    .renderToLines(
      block({ kind: "plot", id: "cal", form: "calendar", height: 7, axes: true, ...spec } as unknown as Plot),
      w,
    )
    .map((r) => r.replace(/\x1b\[[0-9;]*m/g, ""));

/** The gutter's label on each row, in drawn order. */
const gutterOf = (rows: readonly string[]): readonly string[] =>
  rows.filter((r) => r.includes("┤")).map((r) => (r.split("┤")[0] ?? "").trim());

const errorsFor = (spec: Record<string, unknown>): readonly string[] => {
  const v = validateBlock({
    kind: "plot", id: "cal", form: "calendar", height: 7, axes: true, ...spec,
  });
  return v.ok ? [] : v.error;
};

describe("C12 §3ae — the calendar's arithmetic", () => {
  it("CL3 (C12 I53): the leap rule is Gregorian — 2000 is a leap year and 2100 is not", () => {
    expect(isLeapYear(2000), "divisible by 400").toBe(true);
    expect(isLeapYear(2100), "divisible by 100 and not 400").toBe(false);
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(daysInMonth(2024, 2), "a leap February").toBe(29);
    expect(daysInMonth(2100, 2), "not a leap February").toBe(28);
    // **The whole year, not the rule that produces it**: a year is 366 days when
    // the rule says so, and asserting the rule twice is asserting it once.
    const days = (y: number): number => daysFromCivil(y + 1, 1, 1) - daysFromCivil(y, 1, 1);
    expect(days(2024)).toBe(366);
    expect(days(2100)).toBe(365);
    expect(days(2000)).toBe(366);
  });

  it("CL4 (C12 I53): a weekday is derived without Date, against eight dates from an oracle", () => {
    const NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const known: readonly (readonly [number, number, number, string])[] = [
      [1970, 1, 1, "Thu"], [1900, 1, 1, "Mon"], [2000, 1, 1, "Sat"], [2024, 2, 29, "Thu"],
      [2026, 8, 21, "Fri"], [2100, 1, 1, "Fri"], [1969, 12, 31, "Wed"], [2026, 1, 1, "Thu"],
    ];
    for (const [y, m, d, name] of known) {
      expect(NAMES[weekdayFromDays(daysFromCivil(y, m, d))], `${y}-${m}-${d}`).toBe(name);
    }
    // **The negative branch is a row of its own**, because `-1 % 7` is `-1` in
    // JavaScript and a negative row index is what the grid cannot hold.
    expect(daysFromCivil(1969, 12, 31), "before the epoch").toBe(-1);
    expect(weekdayFromDays(-1)).toBe(2);
  });

  it("CL3a (C12 I53): civilFromDays inverts daysFromCivil across four centuries", () => {
    for (let z = -30000; z <= 60000; z += 37) { // cells-ok — a day count
      const c = civilFromDays(z);
      expect(daysFromCivil(c.year, c.month, c.day), `z=${String(z)}`).toBe(z);
      expect(c.day).toBeGreaterThanOrEqual(1);
      expect(c.day).toBeLessThanOrEqual(daysInMonth(c.year, c.month));
    }
  });

  it("CL5 (C04 §3): the parse takes what is inside the cell and refuses what is not", () => {
    expect(parseStartDate("2026-03-04")?.hour, "no hour is hour zero").toBe(0);
    expect(parseStartDate("2026-03-04T09")?.hour).toBe(9);
    expect(parseStartDate("2026-03-04T09:30:15Z")?.hour, "below the hour is inside the cell").toBe(9);
    expect(parseStartDate("2026-03-04 09:30")?.hour, "a space separates too").toBe(9);
    // **Refused rather than ignored**: honouring an offset needs a zone table,
    // and ignoring it puts the reading in the wrong cell.
    expect(parseStartDate("2026-03-04T09:30+05:00"), "a zone offset").toBeNull();
    expect(parseStartDate("2026-02-30"), "four correct digits and not a day").toBeNull();
    expect(parseStartDate("2100-02-29"), "not a leap year").toBeNull();
    expect(parseStartDate("2024-02-29"), "a leap year").not.toBeNull();
    expect(parseStartDate("2026-13-01")).toBeNull();
    expect(parseStartDate("2026-03-04T24")).toBeNull();
    expect(parseStartDate("4 March 2026")).toBeNull();
    expect(parseStartDate("")).toBeNull();
  });
});

describe("C12 §3ae — the grid the unit picks", () => {
  it("CL1 (C12 I53): each unit produces its declared row count and its own row labels", () => {
    const start = parseStartDate("2026-01-01")!;
    const shapes = [
      ["hour", 24, "00", "23"], ["day", 7, "Mon", "Sun"],
      ["week", 5, "W1", "W5"], ["month", 12, "Jan", "Dec"],
    ] as const;
    for (const [unit, rows, first, last] of shapes) {
      const grid = calendarGrid(unit, start, [1, 2, 3]);
      expect(grid.length, `${unit} rows`).toBe(rows); // cells-ok — a row count
      expect(grid[0]?.label).toBe(first);
      expect(grid[rows - 1]?.label).toBe(last);
      expect(CALENDAR_ROWS[unit].length).toBe(rows); // cells-ok — a row count
    }
  });

  it("CL2 (C12 I53): startDate + unit + length spans exactly the period claimed", () => {
    // A year of daily readings from a Thursday: 53 week-columns, and the first
    // column holds Mon–Wed empty because those days precede the start.
    const start = parseStartDate("2026-01-01")!;
    const year = Array.from({ length: 365 }, (_, i) => i);
    const grid = calendarGrid("day", start, year);
    expect(grid.length).toBe(7); // cells-ok — a row count
    expect(grid[0]?.values.length, "columns are weeks").toBe(53); // cells-ok — a column count
    expect(grid[0]?.values[0], "Monday before a Thursday start").toBeNull();
    expect(grid[3]?.values[0], "Thursday is the first reading").toBe(0);
    // **Every reading lands, exactly once** — the property that says the grid is
    // the series rearranged rather than resampled.
    const placed = grid.flatMap((s) => s.values).filter((v) => v !== null);
    expect(placed.length).toBe(365); // cells-ok — a reading count
    expect(new Set(placed).size).toBe(365); // cells-ok — a reading count

    // A day of hourly readings from 09:00 spans two columns, not one.
    const hourly = calendarGrid("hour", parseStartDate("2026-03-04T09")!, Array.from({ length: 24 }, (_, i) => i));
    expect(hourly[9]?.values[0], "09 in the first day").toBe(0);
    expect(hourly[8]?.values[1], "08 the next day, the 24th reading").toBe(23);
    expect(hourly[0]?.values[0], "midnight before the start").toBeNull();

    // Twelve monthly readings from March span two year-columns.
    const monthly = calendarGrid("month", parseStartDate("2026-03-01")!, Array.from({ length: 12 }, (_, i) => i));
    expect(monthly[2]?.values[0], "Mar, first year").toBe(0);
    expect(monthly[1]?.values[1], "Feb, the next year").toBe(11);
  });

  it("CL2b (§3ae.2): a `week` column crosses a year, and the year term is what carries it", () => {
    // Two years of weekly readings from January. Column 12 is the following
    // January — reachable only through `12 · (y − y₀)`, and a map that took the
    // month difference alone would fold it back onto column 0 and overwrite.
    const start = parseStartDate("2026-01-05")!; // a Monday
    const grid = calendarGrid("week", start, Array.from({ length: 104 }, (_, i) => i));
    expect(grid[0]?.values.length, "columns are months, over two years").toBe(24); // cells-ok
    expect(grid[0]?.values[0], "the first Monday of Jan 2026").toBe(0);
    // 2027-01-04 is 52 weeks after 2026-01-05, and it is W1 of column 12.
    expect(grid[0]?.values[12], "the same week a year later").toBe(52);
    const placed = grid.flatMap((r) => r.values).filter((v) => v !== null);
    expect(placed.length, "nothing overwritten").toBe(104); // cells-ok — a reading count
  });

  it("CL2c (§3ae.5): more columns than cells drops the oldest, and the newest keeps the right edge", () => {
    // Five years of daily readings: 261 week-columns into an area of seventy-odd
    // cells, so the pitch is one and `from` is what decides which weeks survive.
    // Every other test has `from` at zero, which is where a mutation of it lives.
    const flat = [{ label: "x", values: Array.from({ length: 1826 }, (_, i) => (i === 1825 ? 99 : i % 9)) }];
    const rows = kit(MONO_UNICODE_CAPS)
      .renderToLines(
        block({
          kind: "plot", id: "cal", form: "calendar", height: 7, axes: true,
          calendarUnit: "day", startDate: "2026-01-01", series: flat,
        } as unknown as Plot),
        80,
      )
      .map((r) => r.replace(/\x1b\[[0-9;]*m/g, ""));
    // **Which weekday the last reading falls on is derived, not guessed** — the
    // first draft said Wednesday and 1825 days after a Thursday is a Tuesday.
    // `weekdayFromDays` is checked against a system oracle in CL4, so leaning on
    // it here is leaning on something already measured.
    const last = CALENDAR_ROWS.day[weekdayFromDays(daysFromCivil(2026, 1, 1) + 1825)] ?? "";
    const area = (label: string): string => {
      const row = rows.find((r) => r.startsWith(label)) ?? "";
      return (row.split("┤")[1] ?? "").trimEnd();
    };
    const newest = area(last);
    expect(newest.length, "the grid fills the area once the columns outnumber it").toBeGreaterThan(70); // cells-ok
    expect(newest[newest.length - 1], "the newest reading is the last column").toBe("⣿");
    // …and the oldest is gone rather than shown: the first column is not day 0.
    expect(rows.join("\n")).toContain("older not shown");
  });

  it("CL2a (§3ae.2): `week` is the only unit whose grid has interior holes", () => {
    // Weekly readings through a 28-day February: W5 is a week that does not
    // exist, and the cell stays absent rather than borrowing March's.
    const start = parseStartDate("2026-02-02")!; // a Monday
    const grid = calendarGrid("week", start, [1, 2, 3, 4, 5, 6]);
    expect(grid[0]?.values[0], "Feb 2 is W1").toBe(1);
    expect(grid[3]?.values[0], "Feb 23 is W4").toBe(4);
    expect(grid[4]?.values[0], "February 2026 has no W5").toBeNull();
    expect(grid[0]?.values[1], "March 2 is W1 of the next column").toBe(5);
    // The other three cannot: their maps are `(offset + i) mod cycle`, so the
    // only blanks are the ragged ends.
    const hourly = calendarGrid("hour", parseStartDate("2026-01-01T00")!, Array.from({ length: 48 }, (_, i) => i));
    expect(hourly.flatMap((s) => s.values).filter((v) => v === null).length).toBe(0); // cells-ok
  });
});

describe("C12 §3ae — the frame, and what does not move", () => {
  it("CL6 (C12 I53): `startDate` without a unit is inert, and the anchor is what moved", () => {
    const raw = Array.from({ length: 7 }, (_, d) => ({
      label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d],
      values: Array.from({ length: 20 }, (_, w) => (d * 20 + w) % 13),
    }));
    // The member is inert without a unit — that half is exactly what the plan
    // claimed and it holds.
    expect(draw({ series: raw })).toEqual(draw({ series: raw, startDate: "2026-01-01" }));

    // **The other half did not, and this row is where the correction lives.**
    // Two shipped `calendar` goldens moved, because the ruling is about the
    // *form* and not about the member: a calendar's columns are periods whether
    // or not a unit derived them, so the default anchor changed under a frame
    // with no `calendarUnit` in it. `stretch` restores the old picture exactly,
    // which is what says the default is the only thing that changed.
    const wide = { series: raw, height: 7 };
    expect(draw(wide), "the new default").not.toEqual(draw({ ...wide, matrixAnchor: "stretch" }));
    expect(draw({ ...wide, matrixAnchor: "uniform" })).toEqual(draw(wide));
  });

  it("CL7a (§3ae.6 A10): the renderer falls through rather than refusing, and draws the raw matrix", () => {
    // The renderer has no rejection path (C12 I11), so every condition the gate
    // refuses is a silent fall-through here. Two series with a unit is the one a
    // caller can reach by bypassing both gates, and what it draws is the
    // pre-calendar matrix — a frame that is not wrong and is not a calendar.
    const two = [
      { label: "a", values: [1, 2, 3, 4] },
      { label: "b", values: [4, 3, 2, 1] },
    ];
    expect(gutterOf(draw({ series: two, startDate: "2026-01-01", calendarUnit: "day" }))).toEqual(["a", "b"]);
    // The same for a date the parse cannot place.
    expect(gutterOf(draw({ series: [two[0]], startDate: "2026-02-30", calendarUnit: "day" }))).toEqual(["a"]);
  });

  it("CL7 (C12 I53): a unit turns one flat series into the unit's own gutter", () => {
    const flat = [{ label: "commits", values: Array.from({ length: 30 }, (_, i) => i % 7) }];
    const before = draw({ series: flat });
    const after = draw({ series: flat, startDate: "2026-01-01", calendarUnit: "day" });
    expect(gutterOf(before), "one series is one row, named by the caller").toEqual(["commits"]);
    expect(gutterOf(after)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  });

  it("CL8 (§3ae.4 B2): the range is invariant under the substitution", () => {
    // The legend's bounds are the flat series' own min and max — the property
    // that says the derivation added no data and dropped none.
    const flat = [{ label: "x", values: [3, 41, 12, 8, 27, 5, 19, 33] }];
    const legend = (rows: readonly string[]): string => rows[rows.length - 1] ?? "";
    const on = legend(draw({ series: flat, startDate: "2026-01-01", calendarUnit: "day" }));
    expect(on).toContain("3");
    expect(on).toContain("41");
  });

  it("CL9 (§3ae A5): a height below the row count names the rows it is hiding", () => {
    const flat = [{ label: "x", values: Array.from({ length: 48 }, (_, i) => i) }];
    const rows = draw({ series: flat, startDate: "2026-01-01T00", calendarUnit: "hour", height: 4 });
    expect(gutterOf(rows), "three rows, then the notice").toEqual(["00", "01", "02"]);
    // **The notice names hours and not `row 4`**, which is B4: the overflow row
    // sees the derived labels because the substitution is upstream of it.
    expect(rows.join("\n")).toContain("+21 more · 03 · 04");
  });

  it("CL10 (§3ae.5): a calendar's columns are uniform, and `left` is where they are not", () => {
    // Twelve monthly readings in an area far wider than twelve cells. Under
    // `uniform` every column is the same width and they fill what divides;
    // under `left` each is one cell and the rest of the area is a fringe.
    //
    // **Drawn at one bit, because a washed cell is blank in a stripped frame by
    // construction** — the colour *is* the reading, so a full-colour frame
    // measures nothing here and would have answered `0` for both arms. Below the
    // colour floor the density ramp carries it and the extent is countable.
    //
    // **Twelve years of monthly readings, not twelve months** — the first
    // attempt used twelve, which is 12 rows of *one* column, so both arms drew
    // one column and the wide one filled the area. A fixture with one column
    // cannot answer a question about column width, and it answers confidently.
    const flat = [{ label: "x", values: Array.from({ length: 144 }, (_, i) => i % 40) }];
    const spec = { series: flat, startDate: "2026-01-01", calendarUnit: "month" as const, height: 12 };
    const mono = (o: Record<string, unknown>): readonly string[] =>
      kit(MONO_UNICODE_CAPS)
        .renderToLines(
          block({ kind: "plot", id: "cal", form: "calendar", height: 7, axes: true, ...o } as unknown as Plot),
          80,
        )
        .map((r) => r.replace(/\x1b\[[0-9;]*m/g, ""));
    const inked = (rows: readonly string[]): number =>
      Math.max(...rows.filter((r) => r.includes("┤")).map((r) => (r.split("┤")[1] ?? "").trimEnd().length)); // cells-ok
    const uniform = inked(mono(spec));
    const left = inked(mono({ ...spec, matrixAnchor: "left" }));
    expect(left, "one cell per month").toBe(12); // cells-ok — a cell width
    expect(uniform, "widened to fill what divides").toBeGreaterThan(60); // cells-ok — a cell width
    // **Uniform**: the pitch divides the extent exactly, so no month is wider
    // than another. §6b B15's rule, and the reason `stretch` is not the default.
    expect(uniform % 12).toBe(0); // cells-ok — a cell width
  });
});

describe("C12 §3ae.8 — the captions, and the grid they span", () => {
  /** The caption row: the last row before the legend that carries no `┤`. */
  const captionOf = (rows: readonly string[]): string => {
    const last = rows.map((r, i) => (r.includes("┤") ? i : -1)).filter((i) => i >= 0).pop() ?? -1; // cells-ok
    return rows[last + 1] ?? "";
  };
  const flatFor = (n: number): readonly { label: string; values: readonly number[] }[] =>
    [{ label: "x", values: Array.from({ length: n }, (_, i) => i % 11) }];
  const mono = (o: Record<string, unknown>): readonly string[] =>
    kit(MONO_UNICODE_CAPS)
      .renderToLines(
        block({ kind: "plot", id: "cal", form: "calendar", height: 7, axes: true, ...o } as unknown as Plot),
        80,
      )
      .map((r) => r.replace(/\x1b\[[0-9;]*m/g, ""));

  it("CP1 (§3ae.8): each unit is captioned at its super-unit's granularity", () => {
    const cases = [
      // 2026-01-01 is a Thursday, so the first column is the week starting Monday 2025-12-29.
      ["day", 365, "2026-01-01", 7, ["2025-12-29", "2026-12-28"]],
      ["hour", 336, "2026-03-04T09", 24, ["2026-03-04", "2026-03-18"]],
      ["week", 104, "2026-01-05", 5, ["2026-01", "2027-12"]],
      ["month", 144, "2026-01-01", 12, ["2026", "2037"]],
    ] as const;
    for (const [unit, n, startDate, height, [first, last]] of cases) {
      const caption = captionOf(draw({ series: flatFor(n), calendarUnit: unit, startDate, height }));
      expect(caption.trimStart().startsWith(first), `${unit} first: ${caption}`).toBe(true);
      expect(caption.trimEnd().endsWith(last), `${unit} last: ${caption}`).toBe(true);
    }
  });

  it("CP2 (§3ae.8): the caption row ends at the grid's edge and not the area's", () => {
    // Fifty-three weeks at a pitch of one leave a twenty-two cell fringe, and a
    // caption placed against the area's right edge names a column that is not
    // there. The row's own length is what says which edge it took.
    //
    // **At one bit, for CL10's reason and the second time in this file**: a
    // painted cell is a background, so a full-colour frame strips to blanks and
    // an ink measurement over it answers zero for every arm. Twice is the number
    // that makes it worth writing down rather than remembering.
    const rows = mono({ series: flatFor(365), calendarUnit: "day", startDate: "2026-01-01" });
    const gutter = (rows.find((r) => r.includes("┤")) ?? "").indexOf("┤") + 1; // cells-ok — a cell width
    const inked = (rows.find((r) => r.includes("┤")) ?? "").slice(gutter).trimEnd().length; // cells-ok
    expect(inked, "fifty-three weeks, one cell each").toBe(53); // cells-ok — a cell width
    expect(captionOf(rows).trimEnd().length, "gutter plus grid, not gutter plus area").toBe(gutter + inked); // cells-ok
  });

  it("CP3 (§3ae.8): a declared xLabels still wins, on `fieldAxes`' precedent", () => {
    const rows = draw({
      series: flatFor(365), calendarUnit: "day", startDate: "2026-01-01",
      xLabels: ["start", "middle", "end"],
    });
    const caption = captionOf(rows);
    expect(caption).toContain("start");
    expect(caption).toContain("end");
    expect(caption).not.toContain("2026");
  });

  it("CP4 (§3ae.7): `window` keeps the area, which is the limit rather than the rule", () => {
    // A right-anchored grid begins at `w − n`, so its captions need an offset
    // `xLabelRow` does not take. Stated so the frame is not read as a defect:
    // the caption row spans the area and the leftmost names a blank column.
    const short = [{ label: "r", values: [1, 2, 3, 4, 5] }];
    const spec = { series: short, xLabels: ["a", "b", "c"] as const, height: 1 };
    const win = captionOf(draw({ ...spec, matrixAnchor: "window" }));
    const lft = captionOf(draw({ ...spec, matrixAnchor: "left" }));
    // `left` grows from column 0, so its captions stop at its five cells;
    // `window` is anchored right and keeps the whole area.
    expect(lft.trimEnd().length).toBeLessThan(win.trimEnd().length); // cells-ok — a cell width
  });

  it("CP5 (§3ae.8): the captions name the columns shown, not the columns that exist", () => {
    // Five years of daily readings: 261 week-columns into seventy-odd cells, so
    // the oldest are dropped. Captioning column 0 would name a week that is not
    // on the frame — which is why the three positions are read through the map.
    const caption = captionOf(draw({
      series: flatFor(1826), calendarUnit: "day", startDate: "2026-01-01", height: 7,
    }));
    expect(caption, "the first week of 2026 is off the left").not.toContain("2025-12-29");
    // **Derived, because guessing a date has been wrong twice in this file.**
    // The last column is the week holding the last reading, and its Monday is
    // what a `day` column is called — from primitives CL4 checks against an
    // external oracle.
    const lastDay = daysFromCivil(2026, 1, 1) + 1825;
    const monday = civilFromDays(lastDay - weekdayFromDays(lastDay));
    const expected = `${String(monday.year)}-${String(monday.month).padStart(2, "0")}-${String(monday.day).padStart(2, "0")}`;
    expect(caption.trimEnd().endsWith(expected), `${caption} · expected ${expected}`).toBe(true);
  });
});

describe("C04 I62 — the calendar's refusals, at both gates", () => {
  const flat = [{ label: "x", values: [1, 2, 3] }];
  const one = (errs: readonly string[], needle: string): void => {
    expect(errs.filter((e) => e.includes(needle)).length, `${needle} in ${errs.join(" | ")}`).toBe(1); // cells-ok
  };

  it("CL11 (C04 I62): the document gate refuses form, count, absence and shape", () => {
    one(errorsFor({ series: flat, calendarUnit: "day", startDate: "2026-01-01", form: "heatmap" }), "on form");
    one(
      errorsFor({ series: [flat[0], flat[0]], calendarUnit: "day", startDate: "2026-01-01" }),
      "a second series is a second period",
    );
    one(errorsFor({ series: flat, calendarUnit: "day" }), 'without "startDate"');
    one(errorsFor({ series: flat, calendarUnit: "day", startDate: "2026-02-30" }), "not a date this can place");
    one(errorsFor({ series: flat, calendarUnit: "fortnight", startDate: "2026-01-01" }), '"calendarUnit" must be');
    // **Zero is not more than one** (§3ae A8): an empty calendar is commitment
    // 3's empty plot, and a gate written `!== 1` would refuse it.
    expect(errorsFor({ series: [], calendarUnit: "day", startDate: "2026-01-01" })).toEqual([]);
    expect(errorsFor({ series: flat, calendarUnit: "day", startDate: "2026-01-01" })).toEqual([]);
  });

  it("CL12 (C04 I62): the builder refuses the same four", () => {
    const plot = (spec: Record<string, unknown>): unknown =>
      b.plot({ form: "calendar", height: 7, axes: true, series: flat, ...spec } as never);
    expect(() => plot({ calendarUnit: "day", startDate: "2026-01-01", form: "heatmap" })).toThrow(/on form/u);
    expect(() => plot({ calendarUnit: "day", startDate: "2026-01-01", series: [flat[0], flat[0]] }))
      .toThrow(/second period/u);
    expect(() => plot({ calendarUnit: "day" })).toThrow(/without "startDate"/u);
    expect(() => plot({ calendarUnit: "day", startDate: "2026-02-30" })).toThrow(/not a date this can place/u);
    expect(() => plot({ calendarUnit: "day", startDate: "2026-01-01" })).not.toThrow();
  });

  it("CL13 (F213): an anchor outside the union is refused rather than falling through to `window`", () => {
    one(errorsFor({ series: flat, matrixAnchor: "uniforn" }), '"matrixAnchor" must be');
    for (const a of ["stretch", "window", "left", "uniform"]) {
      expect(errorsFor({ series: flat, matrixAnchor: a }), a).toEqual([]);
    }
  });
});
