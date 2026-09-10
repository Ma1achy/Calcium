/**
 * C04 I118 — every string-literal union `Plot` declares is checked at the
 * document gate, and the table is the mechanism rather than a list beside one
 * (F213, F1076).
 *
 * The rows land with the code in the next commit. This file exists at this
 * commit because the spec that adds I118 must not stand without a row naming
 * it (SP9, A03 §7a, F814) — the invariant and its coverage arrive together or
 * the spec-alone tree is red on its own gate.
 */
import { describe, it } from "vitest";

describe("C04 I118 — Plot's string-literal unions", () => {
  it.todo("T1.35 (C04 I118, F213): every union member refuses a value outside it, and the refusal names the member — not deferred on a component: lands with the table in src/data/viewmodel/validate.ts in this round's code commit");
  it.todo("T1.36 (C04 I118): the control — every union's own values are accepted, false included — not deferred on a component: lands with the table in src/data/viewmodel/validate.ts in this round's code commit");
  it.todo("T1.37 (C04 I118, F213, F1076): the eight that no rule reached, named rather than looped — not deferred on a component: lands with the table in src/data/viewmodel/validate.ts in this round's code commit");
  it.todo("T1.38 (C04 I118): a form rule stays silent about a value the document does not contain — not deferred on a component: lands with the table in src/data/viewmodel/validate.ts in this round's code commit");
});
