/**
 * C12 — the plot renderer.
 *
 * Two exports, and each has a named consumer. `plotDefinition` for whoever
 * composes the registry (C22, through C09's public `register`), and `sparkline`
 * for C11 — a `Cell.spark` is not a block, so it cannot come through the
 * registry, and C12 §2 records that the consumer is named precisely so nobody
 * later reads this as public surface with nothing behind it and deletes it.
 *
 * Nothing else. The grid, the Bresenham walker, the scaling core and the strip
 * arithmetic are internal; the block shapes are C04's.
 */
export { plotDefinition } from "./definition.js";
export { sparkline } from "./sparkline.js";
export { valueBar } from "./bar.js";
/**
 * **`fillHeight` is published because the caller is an app, not a component.**
 * The other three exports here are seams inside the framework; this one closes
 * roadmap 38, whose whole subject is a *producer* choosing a height from the
 * region it was handed. A helper the framework keeps to itself would leave the
 * arithmetic — `region − reserve`, floored at 1, and what to do when the region
 * is `null` — to be re-derived by every surface that wants a plot to fill.
 */
export { fillHeight } from "./height.js";
