/**
 * The two things C15 borrows, in one place.
 *
 * `Block` is C04's and `BlockRegistry` is C09's — both downward, and both the
 * whole of what an overlay manager needs to exist: content to hold and a way to
 * ask how tall it is.
 *
 * Collected here for the same reason C14's `deps.ts` collects its own, and for
 * one more: **the imports this file does not have are load-bearing.** No C13
 * (MG13, I9), no C14 (I12), no `terminal/` (I12). Each of those would be a
 * downward edge that the layer walk permits, so the thing that catches them is
 * a specific rule reading a specific file — and one file is easier to read than
 * six.
 */

export type { Block } from "../../data/viewmodel/index.js";
export type { BlockRegistry } from "../../presentation/blocks/index.js";
