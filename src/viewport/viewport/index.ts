/**
 * Scroll state, virtualisation, the height cache.
 *
 * C14 — see spec. What is visible and where it sits, decided from measured
 * heights without rendering (I1). C13 holds the entries; C09 measures them;
 * C14 caches those measurements and does the arithmetic.
 */

export { createViewport } from "./viewport.js";
export { HeightCache } from "./cache.js";
export { HeightIndex } from "./index-tree.js";
export type {
  Anchor,
  ScrollState,
  Viewport,
  ViewportChange,
  ViewportOptions,
  VisibleEntry,
  VisibleRange,
} from "./types.js";
