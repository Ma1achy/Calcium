/**
 * The table's reserved focus column, for rows that are about something else
 * (C11 I15, §5b).
 *
 * **Two helpers rather than a literal `2` in twenty places.** The block reserves
 * a gutter on every row for `▸`, so every assertion about a table's *content* —
 * a truncation, a column boundary, a CJK width — now reads two cells to the
 * right of where it used to. A literal would drift the first time the mark's
 * glyph changes width, and the width is derived from the glyph precisely so
 * that it cannot (C09 §4's 1:1 rule).
 *
 * **These strip the gutter; they do not assert it.** C11 T2.11 is the row that
 * asserts the reservation, on the content column being the same integer across
 * four focus states. A row that both stripped the gutter and checked it would
 * be testing this file.
 */
import { GUTTER_CELLS } from "../../src/presentation/table/definition.js";

export { GUTTER_CELLS };

/** The width to render at, so the columns get the width the row is about. */
export const atContent = (width: number): number => width + GUTTER_CELLS;

/** A rendered row without its reserved gutter. */
export const body = (line: string): string => line.slice(GUTTER_CELLS);
