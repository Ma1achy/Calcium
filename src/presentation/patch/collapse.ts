/**
 * C25 §3 — the collapse marker, and the one place a patch's measurer reads a
 * capability.
 *
 * A collapsed region is **one row that states its own count** (I5): `⋯ 14 unchanged
 * lines`, not a bare marker. The count is what tells a reader whether expanding is
 * worth it, and the row is what makes measurement exact — height reads
 * `collapsedBefore` directly rather than deriving anything.
 *
 * **The ASCII fallback changes the cell count, deliberately.** `⋯` is one cell and
 * `...` is three, so unlike C09's 1:1 substitution rule what changes here is the
 * marker's *content budget* rather than its glyph. The row is one row either way, so
 * height is unaffected and C09 I1 holds. C09 commitment 11 names this as the case
 * where a measurer would need capabilities; the alternative is a three-cell glyph
 * measured as one, which drifts every truncation point on the row.
 */
import type { TerminalCapabilities } from "../../terminal/capabilities.js";

/**
 * The pair, held here rather than in C09's glyph table.
 *
 * **It cannot go in the table**, and that is the whole of §3's exception: every
 * entry there is 1:1 by cell count (C09 I5, asserted over the table by C09 T2.5),
 * and `⋯` is one cell against `...`'s three. Adding it would either break that
 * assertion or force a one-cell ASCII marker, and the second is `truncate`'s `~`
 * trick applied where the reader needs a word rather than a mark.
 *
 * `truncate`'s marker is a different decision and stays 1:1 — a truncation happens
 * mid-row where three cells would shift everything after it, and this happens at the
 * start of a row that has nothing else on it.
 */
const ELLIPSIS: readonly [string, string] = Object.freeze(["⋯", "..."]);

/** The marker's text at the capability in force. One row, its own count. */
export function collapseText(count: number, caps: Pick<TerminalCapabilities, "unicode">): string {
  const ellipsis = caps.unicode === "ascii" ? ELLIPSIS[1] : ELLIPSIS[0];
  const lines = count === 1 ? "line" : "lines";
  return `${ellipsis} ${count} unchanged ${lines}`;
}
