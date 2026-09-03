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
export { plotDefinition, cursorable } from "./definition.js";
/**
 * **`cursorable` is published for L4's cursor writer** (C12 I85, C22 I76).
 * `moveCursor` must ask *can this block take a cursor* with the renderer's own
 * answer — the forms `positionalForm` serves, with samples and a frame — or it
 * stores an index nothing reads. The predicate is the one `elements()` gates on,
 * so the block that gains a focus stop and the block that accepts a cursor are
 * the same block by construction.
 */
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
