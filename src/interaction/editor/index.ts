/**
 * C17 — the line editor.
 *
 * Buffer, grapheme cursor, and one layout walk that L4 draws from (I18). No
 * rendering, no geometry held, no clock read.
 */

export { createEditor, type LineEditor, type Motion } from "./editor.js";
export type { Cell, CellSpan, Gutter } from "./layout.js";
// Entry 23 — the wash. L4 reads `editor.selection` and maps it through the
// same walk `layout` returns rows from (I18).
export { selectionSpans } from "./layout.js";
