// C22 I102 — the header, the footer and each overlay layer are rendered once
// per content, never once per frame, and the footer is measured with them.
//
// **Counted, never timed**, as `render-cache.test.ts` counts: the chrome is a
// registered kind the row supplies through `config.chrome`, so the count is
// taken inside the production paint path and not from a spy round it.
import { describe, it } from "vitest";

describe("C22 I102 — the chrome cache", () => {
  it.todo(
    "T4.90a (C22 I102): a chrome function returning structurally equal blocks of a counting kind every frame renders once across ten further frames and measures once, the rest chrome hits — not deferred on a component: the code commit replaces this row",
  );
  it.todo(
    "T4.90b (C22 I102): a changed chip label renders once more as a rev miss, a resize as a width miss, a theme switch as a theme miss, and the footer's height moves with its content — not deferred on a component: the code commit replaces this row",
  );
  it.todo(
    "T4.90c (C22 I102): a pushed surface's layer renders once across frames that leave its content alone, once more when it re-renders, and a second surface is keyed apart — not deferred on a component: the code commit replaces this row",
  );
});
