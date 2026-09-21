/**
 * C29 — the layout engine.
 *
 * **The sizing model and the pass structure are ported from `nicbarker/clay`**
 * (Zlib, read at `v0.14`). Zlib's only real condition is the acknowledgement,
 * and a licence nobody looked at is how one gets found at publication; taking
 * it as a dependency is refused in writing in `DEPENDENCIES.md`, because *we
 * wrote our own* and *we considered theirs and measured why not* read
 * identically from outside and only one of them survives being asked
 * (C29 I17).
 *
 * *Children declare their natural size; parents derive theirs from their
 * children. Nothing is imposed downward until pass 2, and pass 2 only
 * distributes slack or deficit.*
 */
export { distribute, type Demand, type Distribution } from "./distribute.js";
export { compose, composeSited, type FoundFloat, type Sited, type Sites, type Window } from "./compose.js";
export { placeFloats } from "./floats.js";
export {
  compositeOf,
  currentTab,
  nextTab,
  popFrame,
  previousTab,
  pushFrame,
  topFrame,
  type Frame,
  type FrameRing,
  type FrameStack,
  type Layer,
  type LayerName,
} from "./frames.js";
export { layout, layoutCounted, measure } from "./solve.js";
export {
  boxesOf,
  floatsOf,
  isLeaf,
  leafOf,
  type Align,
  type Box,
  type Leaf,
  type Overflow,
  type Padding,
  type Rect,
  type AttachTo,
  type FloatLayer,
  type Floating,
  type PlacedFloat,
  type Point,
  type Size,
  type SolveCounts,
  type SolvedBox,
  type SolvedFloat,
  type Spend,
} from "./types.js";
