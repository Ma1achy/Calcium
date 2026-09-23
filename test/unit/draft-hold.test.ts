// C17 I28 — the line taken and given back exactly (§101, C23 I28, C23 I73).
//
// **The region is the discriminator and the other two fields are not.** A
// snapshot carrying text and caret is restored correctly by a build that never
// knew there was a third field, which is what makes *restored exactly* a claim
// worth a type rather than a pair of `setText` calls.
import { describe, it } from "vitest";

describe("C17 §101 — the held draft", () => {
  it.todo(
    "T1.49 (C17 I28, §101) — not deferred on a component: `snapshot`/`restore` land in this MR's next commit: a snapshot over a buffer with a caret inside it and a live region restores all three, with the region as the discriminator",
  );
  it.todo(
    "T1.50 (C17 I28) — not deferred on a component: `snapshot`/`restore` land in this MR's next commit: a restore is not an edit, so `undo()` after it does not walk back into the text that was there in between",
  );
});
