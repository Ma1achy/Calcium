// C12 I53, §3ae — the calendar's grid, its arithmetic and its anchor.
//
// **Three of these attack the walk's own rulings rather than the code's edges**,
// which is what a mutation run is for once a component has been walked: §3ae.2's
// asymmetry (three units are modular and `week` is a calendar), §3ae.5's uniform
// pitch, and §3ae.6's silent fall-through. A ruling nothing can violate is A03
// §2's vacuity class in prose, and the mutation is the only thing that asks.
//
// **`from` is the one every other row leaves at zero.** Every fixture but CL2c
// has fewer columns than cells, so the arm that decides *which* columns survive
// is exercised by one row in the suite — and a mutation of it is silent in the
// other seventeen.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CAL = "src/presentation/plot/calendar.ts";
const DATES = "src/data/dates.ts";
const HEAT = "src/presentation/plot/heatmap.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(
      "npx vitest run test/unit/plot-calendar.test.ts test/unit/plot.test.ts test/golden/plot-forms.test.ts 2>&1",
      { cwd: ROOT, encoding: "utf8", timeout: 300_000 },
    );
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.code === "ETIMEDOUT" ? `${out}\nTIMED OUT` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: CAL,
    from: "  const labels = CALENDAR_ROWS[unit];",
    to: '  const labels = CALENDAR_ROWS["day"];',
    why:
      "every unit derives seven rows called Mon…Sun, so the row count, the row labels and the " +
      "placement all go at once; a run that cannot see that cannot see any row below it",
  },
  mutations: [
    {
      // The rule the walk named and CL3 asserts whole: a year is 366 days when
      // the rule says so. `% 4` alone makes 2100 a leap year.
      name: "the leap rule is `% 4`, without the century exceptions",
      file: DATES,
      from: "  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;",
      to: "  return year % 4 === 0;",
      expect: "CL3",
    },
    {
      // 1970-01-01 was a Thursday. Off by one and every weekday row shifts,
      // which no arithmetic inside this file can detect — CL4's oracle can.
      name: "the weekday's epoch offset is one day out",
      file: DATES,
      from: "  return (((days + 3) % 7) + 7) % 7;",
      to: "  return (((days + 4) % 7) + 7) % 7;",
      expect: "CL4",
    },
    {
      // **§3ae.2's asymmetry, denied.** Treating `week` as `(offset + i) mod 5`
      // like the other three is the tidy answer, and it puts a reading in W5 of
      // a February that has no fifth week.
      name: "`week` is modular like the other three units",
      file: CAL,
      from: '  if (unit === "week") {',
      to: "  if (false) {",
      expect: "CL2a",
    },
    {
      // The year term is what carries a `week` column across January. Without
      // it the following January folds onto column 0 and overwrites.
      name: "a `week` column is the month difference alone",
      file: CAL,
      from: "      column: 12 * (civil.year - start.year) + (civil.month - start.month),",
      to: "      column: civil.month - start.month,",
      expect: "CL2b",
    },
    {
      // **§3ae.5, reverted to the arm it refines.** `uniform` and `left` are
      // identical wherever the pitch is one, so this is silent on the `day`
      // fixture and visible on the `month` one.
      name: "the calendar anchors `left`, so a column is never widened",
      file: HEAT,
      from: '  calendar: "uniform",',
      to: '  calendar: "left",',
      expect: "CL10",
    },
    {
      // The oldest drop first. Reversed, the newest go and the grid shows a
      // history that stops before the reading a live calendar is opened for.
      name: "the columns that do not fit are the newest",
      file: HEAT,
      from: "    const from = count - shown; // cells-ok — a reading index",
      to: "    const from = 0; // cells-ok — a reading index",
      expect: "CL2c",
    },
    {
      // A pitch that rounds up overruns the area; one that ignores the count
      // is `stretch` again. This is the arithmetic §3ae.5 states.
      name: "the pitch is taken from a division that rounds up",
      file: HEAT,
      from: "    const pitch = Math.max(1, Math.floor(w / count)); // cells-ok — a cell width",
      to: "    const pitch = Math.max(1, Math.ceil(w / count)); // cells-ok — a cell width",
      expect: "CL10",
    },
    {
      // **§3ae.6's fall-through, widened.** The renderer substituting for a
      // two-series block draws a calendar the caller never asked for, from the
      // first series, and silently discards the second.
      name: "the renderer derives a grid from the first of several series",
      file: HEAT,
      from: "  const only = raw.series.length === 1 ? raw.series[0] : undefined; // cells-ok — a series count",
      to: "  const only = raw.series[0]; // cells-ok — a series count",
      expect: "CL7a",
    },
    {
      // A zone offset ignored rather than refused puts every reading in the
      // wrong cell, by a whole number of hours nobody stated.
      name: "the parse accepts anything after the hour, including a zone offset",
      file: DATES,
      from: "const START_DATE = /^(\\d{4})-(\\d{2})-(\\d{2})(?:[T ](\\d{2})(?::(\\d{2})(?::(\\d{2}))?)?Z?)?$/u;",
      to: "const START_DATE = /^(\\d{4})-(\\d{2})-(\\d{2})(?:[T ](\\d{2})(?::(\\d{2})(?::(\\d{2}))?)?.*)?$/u;",
      expect: "CL5",
    },
    {
      // The day-of-month check is the parse's only use of the leap rule, and a
      // date that does not exist is a grid anchored a day out.
      name: "the parse takes any day from 1 to 31",
      file: DATES,
      from: "  if (day < 1 || day > daysInMonth(year, month)) return null;",
      to: "  if (day < 1 || day > 31) return null;",
      expect: "CL5",
    },
    {
      // **§3ae.8's first ruling, reverted.** The captions span the area again,
      // so the last one sits up to `n − 1` cells past the column it names —
      // shipped for `left` and invisible to 312 goldens, because no matrix
      // fixture had ever paired a fringe-leaving anchor with captions.
      name: "the captions span the area rather than the grid",
      file: HEAT,
      from: "  const captionWidth = leading === 0 ? occupied : layout.areaWidth; // cells-ok — a cell width",
      to: "  const captionWidth = layout.areaWidth; // cells-ok — a cell width",
      expect: "CP2",
    },
    {
      // The captions taken off the series' own indices rather than through the
      // map: correct until the columns outnumber the cells, and then it names
      // a week that is not on the frame.
      name: "the captions name the columns that exist rather than the ones shown",
      file: CAL,
      from: "  const shown = columns.filter((c): c is number => c !== null);",
      to: "  const shown = columns.map((_, i) => i);",
      expect: "CP5",
    },
    {
      // `fieldAxes`' precedent inverted — a caller who names their columns is
      // saying they mean something the index does not.
      name: "a derived caption outranks the caller's own",
      file: HEAT,
      from: "  const captions = block.xLabels ?? calendarCaptions(block, grid);",
      to: "  const captions = calendarCaptions(block, grid) ?? block.xLabels;",
      expect: "CP3",
    },
    {
      // **A column is a period, not the first reading in it.** Dropping the
      // weekday term captions the first column with the start date itself, so
      // a Thursday start says the week begins on a Thursday.
      name: "a `day` column is captioned with the start date, not its week's Monday",
      file: CAL,
      from: '  if (unit === "day") return iso(start.z - weekdayFromDays(start.z) + 7 * column);',
      to: '  if (unit === "day") return iso(start.z + 7 * column);',
      expect: "CP1",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
