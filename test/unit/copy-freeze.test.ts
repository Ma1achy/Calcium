// C14 §6b tier 1 — the freeze. A held view over a record that keeps moving.
//
// **Spec-first**, so every row here is `it.todo` until the hold is built. The
// rows are written now rather than with the code because §6b's walk is what
// decided the mechanism, and a walk whose rulings are not written as rows is a
// set of sentences nobody has to satisfy.
//
// The shape every row shares: **the difference is the subject.** A hold that
// stopped the store and a hold that holds the view produce the same screen, and
// only an assertion naming both sides tells them apart — which is why each row
// asserts the record *and* the view rather than the picture.
import { describe, it } from "vitest";

describe("C14 §6b — the freeze", () => {
  it.todo(
    "T1.30 (C14 I31, §6b A1, A2): the held entries and their heights are the ones from the moment of entry, while the record takes the fourth — not deferred on a component: the hold lands in this MR's code commit",
  );
  it.todo(
    "T1.31 (C14 I31, §6b A4): a resize re-measures the held document at the new width and the arriving entry still does not appear — not deferred on a component: the hold lands in this MR's code commit",
  );
  it.todo("T1.32 (C14 I32, §6b A3): the caret moves the scroll and never the document — not deferred on a component: the hold lands in this MR's code commit");
  it.todo(
    "T1.33 (C14 I33, §6b A6): `y` takes the blocks the entry had when the mode was entered, and the control without the mode takes the patched ones — not deferred on a component: the hold lands in this MR's code commit",
  );
  it.todo("T1.34 (C14 I34): the buffered count is the difference, zero before and zero after the exit — not deferred on a component: the hold lands in this MR's code commit");
  it.todo(
    "T1.35 (C14 I35): the ticker stops with the mode — `tick` and the orbit do not advance — and the elapsed counts freeze with no code stopping them — not deferred on a component: the hold lands in this MR's code commit",
  );
});
