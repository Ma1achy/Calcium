/**
 * What C20 borrows, in one place.
 *
 * Every edge is downward or sideways-and-acyclic — C04 for `Block`, C15 for the
 * overlay, C18 for the tokeniser redaction works in — and the imports this file
 * does **not** have are load-bearing: no `terminal/` and no C17 (I1, I15, MG18).
 * C20 returns strings; the buffer is somebody else's.
 *
 * `tokenise` is C18's and is not reimplemented here. A second tokeniser would
 * disagree with the first at unbalanced quotes and escaped spaces, and the
 * symptom would be a secret surviving redaction because the two disagreed about
 * where a token ended (SS30).
 */

export type { Block, Tone } from "../../data/viewmodel/index.js";
export type { Layer } from "../../viewport/overlay/index.js";
export type { Token } from "../parser/index.js";
export { tokenise } from "../parser/index.js";
export { cells } from "../../presentation/text.js";
