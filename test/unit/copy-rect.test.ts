// C14 §6e — the rectangular selection: cells, clipped to the block it started in.
//
// Spec-first: the rows arrive with the model in the next commit. `it.todo` is
// what SP9 takes while a spec commit stands alone, and TD6 wants the blocker
// named — which here is the code in the same MR and **not deferred on a
// component**.
import { describe, it } from "vitest";

describe("C14 §6e — the rectangle", () => {
  it.todo(
    "T1.42 (C14 I42): the head clips into the anchor's block and the rectangle survives the boundary — awaiting `rectBetween` in this MR's second commit, not deferred on a component",
  );

  it.todo(
    "T1.43 (C14 I43): the copy is the rendered cells with the ink stripped — awaiting `cellTextOf` in this MR's second commit, not deferred on a component",
  );
});
