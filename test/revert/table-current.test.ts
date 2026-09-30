// C11 T6.36, T6.37 — the current row, reverted.
//
// Spec-first: the rows land with the code commit that builds them.
import { describe, it } from "vitest";

describe("C11 I33", () => {
  it.todo(
    "T6.36 (C11 I33): the reservation keyed on the value rather than the presence → T1.43 fails on the no-row arm — not deferred on a component: lands with the F1474 code commit of review batch 4",
  );
  it.todo(
    "T6.37 (C11 I33): the current row emitted without the pick ground → T1.43 fails on the 24-bit arm — not deferred on a component: lands with the F1474 code commit of review batch 4",
  );
});
