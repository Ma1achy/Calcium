// C09 I132 — a chosen option's weight, tier 6.
//
// The row names the change that makes it fail. It restates the behaviour
// `test/unit/focus-shapes.test.ts`'s T1.90 holds, so a reader can see which
// row dies for which defect; the mutation pass checks it mechanically.
import { describe, it } from "vitest";

describe("C09 I132 — tier 6", () => {
  it.todo(
    "T6.154 (C09 I132): the chosen option's style without bold → T1.90 fails at every rung — not deferred on a component: the code lands in the next commit of this round",
  );
});
