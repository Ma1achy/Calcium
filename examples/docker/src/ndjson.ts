/**
 * NDJSON, parsed a line at a time — shared by `/ps` and the dashboard.
 *
 * Extracted when the second consumer arrived rather than copied, because the
 * thing it encodes is a fact about **docker**, not about either caller: every
 * `--format json` verb emits one object per line, and the day docker changes
 * that there must be one place to change.
 *
 * `Row` is `Record<string, unknown>` and `str` refuses anything that is not a
 * string, which is walk C4's ruling: `Platform` is an object where R01 §4
 * promised a string, so every field read is checked at its use site rather than
 * trusted from the shape.
 */

/** One line of `docker … --format json`, before anything is trusted about it. */
export type Row = Readonly<Record<string, unknown>>;

/** A field, or `""` — never `[object Object]`, never a throw (walk C4). */
export const str = (row: Row, key: string): string => {
  const v = row[key];
  return typeof v === "string" ? v : "";
};

/**
 * **Per line, with a per-line catch.**
 *
 * One `JSON.parse` over the batch discards every good container for one bad byte
 * (R3.5). A failed line is *counted* and reported rather than dropped: a skipped
 * line and no line are indistinguishable in the frame otherwise.
 */
export function parseNdjson(raw: string): { rows: Row[]; skipped: number } {
  const rows: Row[] = [];
  let skipped = 0;
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        rows.push(parsed as Row);
      } else skipped += 1;
    } catch {
      skipped += 1;
    }
  }
  return { rows, skipped };
}
