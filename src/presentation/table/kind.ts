/**
 * A column's value kind — C11 §3, §4, I27.
 *
 * **One classification, two readers, and it moved here when it gained the
 * second.** `kindOf` was the sort's: it answered which comparator a column
 * wants. I27 gives it the column's *alignment* as well, on the same argument
 * I26 makes about the decimal point — a declared kind is a claim the data can
 * falsify with nothing to report the disagreement — and a function that decides
 * how a table is drawn does not belong in a file headed *Sort*. A reader
 * looking for where alignment is decided would not open it.
 *
 * **The agreement rule is the load-bearing part and it serves both readers for
 * two different reasons.** For sorting, one `AUC 0.912` in a column of numbers
 * makes the whole column text because a comparator returning null for some of
 * its input has no defined order. For alignment, a column whose values disagree
 * about their kind **has** no kind, and the safe reading of a mixed column is
 * the one that treats it as prose. The same rule, arrived at twice.
 */
import type {
  Cell,
  ColumnDef,
  Table,
  TableRow,
} from "../../data/viewmodel/index.js";

/** The value a row carries for a column, or "" when it carries none. */
export function valueOf(row: TableRow, key: string): string {
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
export function isMissing(value: string): boolean {
  return value.trim() === "";
}

const THOUSANDS = /,/g;
// **Exponent form is a number, and leaving it out made §099's own column
// text** (I27, I26). The grammar was `digits[.digits]` with an optional `%`,
// so `3e-4` failed it — and §099 draws `3e-4` in the metric column *beside*
// `0.0372` and `0.941`, with I26's prose resolving it explicitly: *it has no
// `.`, so it is an integer part four cells wide and ends at the point like
// `1284` does.* A classifier that calls that column text cannot align it, and
// the alignment is the figure the section exists to draw.
//
// **It corrects an ordering defect nobody had reported.** The same three
// values sort by grapheme today, which puts `3e-4` last where it is the
// smallest of them by three orders of magnitude. Widening the grammar for the
// alignment fixes the comparator in the same move, because both read the same
// answer — which is what moving this classification out of `sort.ts` made
// visible (T1.31, T1.34).
const NUMERIC = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?%?$/;
const DURATION = /^(?:\d+(?:\.\d+)?\s*[smhdw]\b\s*)+/;
const DURATION_PART = /(\d+(?:\.\d+)?)\s*([smhdw])/g;

const SECONDS: Readonly<Record<string, number>> = Object.freeze({
  s: 1,
  m: 60,
  h: 3_600,
  d: 86_400,
  w: 604_800,
});

export function asNumber(value: string): number | null {
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
export function asDuration(value: string): number | null {
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

export type ColumnKind = "numeric" | "duration" | "text";

/**
 * How a column sorts, decided from the values present in it.
 *
 * Every non-missing value must agree: one `AUC 0.912` in a column of numbers
 * makes the whole column text, because a comparator that returns null for some
 * of its input is a comparator with no defined order. Numeric is tried before
 * duration so a bare `12` is a number rather than a parse failure, and `12m` is a
 * duration because no number ends in a letter.
 */
export function columnKind(rows: readonly TableRow[], key: string): ColumnKind {
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

/** A resolved alignment: what a column declared, or what its values imply. */
export type Alignment = NonNullable<ColumnDef["align"]>;

/**
 * Whether a column's numbers have points to align on (I27, I26).
 *
 * **§078 draws both cases in one table and that is what settles it.** Its
 * `rows` column is `184`, `88`, `1,204`, `120` and sits flush to the column's
 * inline end; its `metric` column is `0.0372`, `0.941`, `-` and aligns on the
 * point. One default cannot be right for both, and the difference is legible in
 * the cells themselves: a column whose numbers all lack a point has nothing to
 * align on, so it takes `right`.
 *
 * **The first form of I27 made every numeric column `decimal`, on the argument
 * that `decimal` is a refinement of `right` — and the frame falsified it.**
 * Rendered in a six-cell column, `1204 / 88 / 120` came out `"1204  "` against
 * `right`'s `"  1204"`: the values agree with each other under both, and the
 * **slack** sits after the number under `decimal`, because the fraction side is
 * left-aligned after the point (I26, and §099's own figure, whose right edge is
 * ragged on purpose). So the column stops being flush, which is what §078 draws
 * and what `R-TBL-001`'s *compare a column by its SHAPE* rests on. The claim
 * was checkable and it was wrong; this is the form that survived the check.
 */
function hasPoint(rows: readonly TableRow[], key: string): boolean {
  for (const row of rows) {
    const value = valueOf(row, key);
    if (isMissing(value)) continue;
    if (/[.eE]/u.test(value)) return true;
  }
  return false;
}

/**
 * The alignment a column's values imply (I27, §078 `R-TBL-001`, `R-TBL-002`).
 *
 * `numeric` splits on whether any of its values carries a point — see
 * `hasPoint`. `duration` takes `right` and not `decimal`: `1h 12m` has no point
 * to align on, and §078 draws the `age` column inline-end like the counts
 * beside it. Everything else is prose and starts at the inline edge.
 */
function impliedBy(
  kind: ColumnKind,
  rows: readonly TableRow[],
  key: string,
): Alignment {
  if (kind === "text") return "left";
  if (kind === "duration") return "right";
  return hasPoint(rows, key) ? "decimal" : "right";
}

/**
 * Each column's resolved alignment, declared or derived (I27).
 *
 * **A declaration is honoured unchanged**, which is what keeps this inside the
 * design kit's scope: `src/data/adapters/fallback.ts` is C07, which
 * `AUTHORITY.md` leaves untouched, so its explicit `left` still means `left`
 * and nothing reaches into it. What changes is every column that never named
 * one — which is most of them, because `col()`'s own comment already treats the
 * field as a default in the same breath as `priority: 50` and `minWidth: 8`.
 *
 * **Computed once per block**, beside `markedSeriesColumns` and
 * `decimalPoints`, for I26's reason: `rowSpans` holds the whole table and would
 * otherwise take the walk once per row.
 */
export function columnAlignments(block: Table): ReadonlyMap<string, Alignment> {
  const out = new Map<string, Alignment>();
  for (const column of block.columns) {
    out.set(
      column.key,
      column.align ??
        impliedBy(columnKind(block.rows, column.key), block.rows, column.key),
    );
  }
  return out;
}

const GROUP_FROM = 4;
const THREES = /\B(?=(\d{3})+(?!\d))/gu;

/**
 * A number's integer part with its thousands grouped (I28, §078 `R-TBL-004`).
 *
 * **The comma is the design's own and was settled by measurement rather than
 * parked**: 29 grouped occurrences of 14 distinct numerals across
 * `docs/design/language/fixtures`, a comma every time, against one ungrouped
 * numeral in a numeric table column — §099's `steps 1284`, in a section citing
 * neither `R-TBL-001` nor `R-TBL-004`, whose figure is about the decimal point.
 *
 * **Only the integer part, and only from four digits.** A fraction's digits are
 * not places of a thousand, and `1000` is the first value with a group to make.
 * The sign and any trailing `%` travel untouched, because neither is a digit.
 */
export function grouped(text: string): string {
  const m = /^([+-]?)(\d+)(.*)$/su.exec(text.trim());
  if (m === null) return text;
  const [, sign = "", whole = "", rest = ""] = m;
  if (whole.length < GROUP_FROM) return text; // cells-ok — a digit count, not a width
  return `${sign}${whole.replace(THREES, ",")}${rest}`;
}

/**
 * The columns that group, by I28's three clauses — all-or-nothing, each.
 *
 * **A column grouping some of its rows and not others would put `1,204` above
 * `41208`**, which is worse than grouping neither and is exactly the comparison
 * `R-TBL-001` says a reader makes by shape without reading. So every clause is
 * a property of the column, and a single cell can take the whole column out.
 *
 * Clause 1 is the resolved alignment being a number's — a column holding one
 * non-numeric value is `left` by I27's agreement rule and never arrives here,
 * which is how a port, a year and a line number stay bare without this having
 * to tell them apart. Clause 2 is `spans`: they are code-unit offsets into
 * `text` (C04 I83) and grouping splices into that string, so a run would land
 * on different characters — no producer in `src/` writes them on a table cell
 * today, and the clause is here because the failure would be silent. Clause 3
 * is the width: §078's fifth rule is explicit that *a number column never
 * truncates, because half a number is a different number*, and separators make
 * a value wider, so a column that cannot afford them draws without them.
 */
export function groupingColumns(
  block: Table,
  aligns: ReadonlyMap<string, Alignment>,
  widthOf: ReadonlyMap<string, number>,
  measure: (text: string) => number,
): ReadonlySet<string> {
  const out = new Set<string>();
  for (const column of block.columns) {
    const align = aligns.get(column.key);
    if (align !== "right" && align !== "decimal") continue;
    // **Clause 1, and a duration is the only kind it reaches.** A text column
    // is already `left` by I27 and never arrives here, so this guard failed
    // nothing on the first mutation pass — the one kind that resolves to
    // `right` without being a bare quantity is a duration, where `10000s`
    // would otherwise draw `10,000s`. The design shows that nowhere: §078's
    // durations are `2m`, `41m` and `1h`, none near a thousand, so bare is the
    // reading that invents nothing (T1.35's fourth arm).
    if (columnKind(block.rows, column.key) !== "numeric") continue;

    const room = widthOf.get(column.key);
    if (room === undefined) continue;

    let ok = true;
    for (const row of block.rows) {
      const cell: Cell | undefined = row.cells[column.key];
      if (cell === undefined) continue;
      const spanned = (cell.spans ?? []).length > 0; // cells-ok — a span count, not a width
      if (spanned) {
        ok = false;
        break;
      }
      if (measure(grouped(cell.text)) > room) {
        ok = false;
        break;
      }
    }
    if (ok) out.add(column.key);
  }
  return out;
}

/** A cell's text as it will be drawn (I28) — grouped where its column groups. */
export function displayText(text: string, grouping: boolean): string {
  return grouping ? grouped(text) : text;
}
