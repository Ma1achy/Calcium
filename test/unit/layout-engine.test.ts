// C29 — the layout engine's sizing core, one row per invariant.
//
// **These land as `it.todo` with the spec commit and become tests with the
// code** (A03 §7a, F814): a spec-first commit that adds invariants fails SP9 at
// its own tree, and adding them to `UNCITED_INVARIANTS` is not the route — that
// list may only shrink.
//
// The walk that ruled them is `docs/notes/C29_LAYOUT_WALK.md`; its two defects
// are F1220's, and they are I10 and I13 here.
import { describe, it } from "vitest";

describe("C29 — the sizing core", () => {
  it.todo(
    "T1.1 (C29 I1): every dimension is a whole integer of cells at every pass and on both axes — a row of three GROW children in 80 columns solves to integers, cells() is the width authority, and nothing rounds at the end — not deferred on a component: the types land with 1.1 of the layout pass",
  );
  it.todo(
    "T1.2 (C29 I2): a FIT container's natural size is the sum along its axis and the max across it, plus its own padding and gaps, computed bottom-up from the leaves — not deferred on a component: the types land with 1.1 of the layout pass",
  );
  it.todo(
    "T1.3 (C29 I3): a GROW child contributes its min to a FIT parent and min defaults to 0, so a growing child in a fitting row contributes nothing and PERCENT does the same — not deferred on a component: the types land with 1.1 of the layout pass",
  );
  it.todo(
    "T1.4 (C29 I4): distribution is largest remainder with ties by declaration order, and spend none leaves the leftover unspent where spend largest-remainder hands it out one cell each — not deferred on a component: the types land with 1.1 of the layout pass",
  );
  it.todo(
    "T1.5 (C29 I5): clamping precedes distribution and reaches a fixed point in at most n rounds for n children, asserted on the counted round rather than on the widths — not deferred on a component: the types land with 1.1 of the layout pass",
  );
  it.todo(
    "T1.6 (C29 I6): three FIXED(20) children in a FIXED(40) parent keep their minima and the container clips, and no child is dropped — not deferred on a component: the types land with 1.1 of the layout pass",
  );
  it.todo(
    "T1.7 (C29 I7): n children have n-1 gaps, a child solving to zero keeps its gap, and padding wider than the box clamps with its gaps to an inner size of 0 rather than a negative one — not deferred on a component: the types land with 1.1 of the layout pass",
  );
  it.todo(
    "T1.8 (C29 I8): alignment acts on slack alone, integer centring rounds down with the leftover cell on the right, and an alignment with no slack is counted as a no-op — not deferred on a component: the types land with 1.1 of the layout pass",
  );
  it.todo(
    "T1.9 (C29 I9): stretch resolves in pass 4 over a FIT cross axis, never over FIXED, and is silent against GROW — not deferred on a component: the types land with 1.1 of the layout pass",
  );
  it.todo(
    "T1.10 (C29 I10): aspect resolves on the width axis in pass 2 so the re-fit wraps at the final width, only ever shrinks, and loses when neither axis has slack — not deferred on a component: the types land with 1.1 of the layout pass",
  );
  it.todo(
    "T1.11 (C29 I11): the passes run in order and one re-fit suffices — a wrapped child's height is taken at its solved width, and a kind whose height changed its width would be caught rather than looped on — not deferred on a component: the types land with 1.1 of the layout pass",
  );
  it.todo(
    "T1.12 (C29 I12): measure(box, w) stops after pass 4 and equals compose(layout(box, w)).length over the corpus at every gate width — not deferred on a component: the types land with 1.1 of the layout pass",
  );
  it.todo(
    "T1.13 (C29 I13): the tree and the width are the only inputs — the same tree at the same width solves identically twice, with no clock, no random, no id hashing, and a representation chosen from the solved share alone — not deferred on a component: the types land with 1.1 of the layout pass",
  );
  it.todo(
    "T1.14 (C29 I14): width 0 solves nothing and measures 0, a child at 0 is kept and emits nothing, and a one-row container drops its border — not deferred on a component: the types land with 1.1 of the layout pass",
  );
  it.todo(
    "T1.15 (C29 I15): overflow and clipping are per axis with a childOffset, and a clip leaves the measured height where it was — not deferred on a component: the types land with 1.1 of the layout pass",
  );
  it.todo(
    "T1.16 (C29 I16): a sticky child that grows on the scroll axis is refused at construction and the engine never throws, so measure stays pure and total — not deferred on a component: the refusal lands with C04's boundary in 1.1 of the layout pass",
  );
  it.todo(
    "T1.17 (C29 I17): the engine's module header names the clay port and the version read, and DEPENDENCIES.md carries the refusal row — asserted on the source, because a licence condition nobody reads is how one gets found at publication — not deferred on a component: the header lands with 1.1 of the layout pass",
  );
});
