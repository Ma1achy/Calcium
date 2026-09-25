/**
 * C17 — the line editor.
 *
 * Buffer, grapheme cursor, and one layout walk that L4 draws from (I18). No
 * rendering, no geometry held, no clock read.
 */

export { createEditor, type HeldLine, type LineEditor, type LineState, type Motion } from "./editor.js";
export type { Cell, CellSpan, Gutter } from "./layout.js";
// Entry 23 — the wash. L4 reads `editor.selection` and maps it through the
// same walk `layout` returns rows from (I18).
export { selectionSpans } from "./layout.js";
// C22 I118 — a held line drawn by the walk that drew it before it was held,
// resolving its chips through the editor's own `drawAs` (C17 I29).
export { cursorCell, layout } from "./layout.js";
// C17 §5c — the chip's ground, off the same walk (I26). L4 paints the cells;
// the label they cover is composed here, so the design's form is not every
// application's to spell (I25).
export { chipLabel, chipSpans, chipText } from "./layout.js";
export type { Chip, ChipKind, ChipLook } from "./layout.js";
