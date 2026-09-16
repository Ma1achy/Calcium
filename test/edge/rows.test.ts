// C09 I72 — the rows arm at its edges: SGR-only rows, OSC controls, styled and plain trailing blanks, wide characters, the empty block.
import { describe, it } from "vitest";

describe("C09 I72 — rows at the edges", () => {
  it.todo(
    "T3.88 (C09 I72): an SGR-only row normalises to empty, an OSC control is dropped, styled trailing blanks stay with their closing codes, plain ones go, a wide character keeps its cells, and rows([]) is one empty row in the frame — not deferred on a component: the code commit replaces this row",
  );
});
