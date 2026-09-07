/**
 * Layers: overlays and pushed views, one mechanism.
 *
 * C15 — see spec. One stack, one layout, one pop, differing only in what a
 * layer covers and whether it takes letter keys (A01 D4).
 */

export { createOverlayManager } from "./manager.js";
export { place, sortLayers } from "./place.js";
export { takesInput } from "./types.js";
export { OverlayError } from "./types.js";
export type {
  DismissReason,
  Layer,
  LayerUpdate,
  OverlayChange,
  OverlayManager,
  OverlayOptions,
  Placed,
  Placement,
  Region,
} from "./types.js";
