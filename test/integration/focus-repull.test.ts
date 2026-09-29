// C26 I32 — the pull re-runs on a layout change unless the box was scrolled by
// hand since focus arrived (review batch 4, M14.5; D15).
import { describe, it } from "vitest";

describe("C26 I32 — re-pull and the latch", () => {
  it.todo(
    "C26 T4.35 (I32): a resize that moves the focused child re-pulls its box — not deferred on a component: the row lands with the code commit of review batch 4's shell lane, group C (C26 §8c)",
  );
  it.todo(
    "C26 T4.36 (I32): a patch that moves the focused child re-pulls its box — not deferred on a component: the row lands with the code commit of review batch 4's shell lane, group C (C26 §8c)",
  );
  it.todo(
    "C26 T4.37 (I32, D15): a page key latches the box until focus moves, and the wheel latches only the box under it — not deferred on a component: the row lands with the code commit of review batch 4's shell lane, group C (C26 §8c)",
  );
});
