/**
 * C17 — the line editor.
 *
 * Buffer, grapheme cursor, and one layout walk that L4 draws from (I18). No
 * rendering, no geometry held, no clock read.
 */

export { createEditor, type LineEditor, type Motion } from "./editor.js";
export type { Cell, Gutter } from "./layout.js";
