// C22 I106 — the visibility gate's set of ids is built once per range object
// (F1201). The rows land with the code commit; this file names the row so the
// spec commit stands alone under SP9.
import { describe, it } from "vitest";

describe("C22 visible ids (F1201)", () => {
  it.todo("T1.61 (I106): one set per range object, by identity, and a fresh one for a fresh range — not deferred on a component: the code commit replaces this row");
});
