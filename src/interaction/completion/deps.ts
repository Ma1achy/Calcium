/**
 * What C19 borrows, in one place.
 *
 * Every edge here is downward — C04 for `Block` and `Tone`, C05 for the manifest
 * vocabulary, C15 for the menu, C18 for the tokeniser's own shapes — and the
 * imports this file does **not** have are load-bearing: no `terminal/` (I12,
 * MG17), no C03 scheduler (SS28), no C17. C19 supplies text and a range; the
 * buffer is somebody else's.
 *
 * `Token` is C18's, spans included. That is C18 ruling 4 held to: the
 * span-carrying token serves both the delegated splice and this component's
 * `prefix`, and a second shape here would be the ruling contradicted in the file
 * that consumes it (I5).
 */

export type { Block, Tone } from "../../data/viewmodel/index.js";
export type { ArgDef, FlagDef, Manifest, ToolDef } from "../../data/manifest/index.js";
export { findTool, visibleTools } from "../../data/manifest/index.js";
export type { Layer, OverlayManager, Placed } from "../../viewport/overlay/index.js";
export type { Token } from "../parser/index.js";
export { quote, tokenise } from "../parser/index.js";
