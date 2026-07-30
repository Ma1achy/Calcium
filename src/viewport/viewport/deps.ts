/**
 * The two types C14 borrows, in one place.
 *
 * `Block` is C04's and `EntryId` is C13's — both downward imports, both L0 or L2
 * data, neither reaching `terminal/` (I12, MG11). Collected here so the module
 * graph has one edge to read rather than one per file, and so a later import of
 * something wider is a visible change to this file rather than a line in the
 * middle of the arithmetic.
 */

export type { Block } from "../../data/viewmodel/index.js";
export type { Change, EntryId, TranscriptEntry, TranscriptView } from "../transcript/index.js";
