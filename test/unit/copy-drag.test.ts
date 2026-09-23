// C14 §6f — the drag: a gesture belongs to where it started.
//
// Spec-first: the rows arrive with the model in the next commit. `it.todo` is
// what SP9 takes while a spec commit stands alone, and TD6 wants the blocker
// named — which here is the code in the same MR and **not deferred on a
// component**.
import { describe, it } from "vitest";

describe("C14 §6f — the drag", () => {
  it.todo(
    "T1.44 (C14 I44): the gesture's container is the anchor's and is held to the release — awaiting the drag model in this MR's second commit, not deferred on a component",
  );

  it.todo(
    "T1.45 (C14 I45): the three bands, and a ticker that survives a pointer holding still — awaiting the autoscroll ticker in this MR's second commit, not deferred on a component",
  );

  it.todo(
    "T1.46 (C14 I46): a container passed through is taken whole and does not scroll — awaiting the drag model in this MR's second commit, not deferred on a component",
  );
});
