// C22 I153 — the frame folds prose punctuation at the ASCII rung (§6t, F1483).
import { describe, it } from "vitest";

describe("C22 I153 — prose at the ASCII rung", () => {
  it.todo(
    "C22 T1.187 (I153, A03 SS47): foldProse over each PROSE_MARKS character is printable ASCII of the mark's own cells at both conventions, leaves an SGR run and an OSC 8 hyperlink byte-identical, and folds exactly PROSE_MARKS — not deferred on a component: it lands with the fold in the next commit",
  );
});
