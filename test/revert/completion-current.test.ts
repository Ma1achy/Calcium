// C19 T6.25, T6.26 — the current candidate and the shared rule, reverted.
//
// Each row pins the property its revert breaks; `tools/mutate/runs/c19-menu-current.mjs`
// makes both reverts mechanically and names the rows that go red.
import { describe, expect, it } from "vitest";

import { menuLayer } from "../../src/interaction/completion/index.js";

const DETAILED = [
  { value: "/capabilities", detail: "the rendering route" },
  { value: "/clear", detail: "empty the transcript" },
];
const ANCHOR = { row: 20, rows: 1 };

describe("C19 T6.25, T6.26", () => {
  it("T6.25 (C19 I29): the current taken from the selection alone → T1.72 and T4.11 fail, at rest no row carries ›", () => {
    // A typed menu holds no selection and the prompt keeps its keys (I20), and
    // it still marks a current: the two facts are separate fields.
    const rest = menuLayer(DETAILED, null, 0, ANCHOR);
    expect(rest.promptLive, "no selection: the prompt keeps its keys").toBe(true);
    const table = rest.content.find((b) => b.kind === "table");
    expect(table?.kind === "table" ? table.current : undefined, "and a current all the same").toBe(
      table?.kind === "table" ? table.rows[0]?.id : "?",
    );
  });

  it("T6.26 (C19 I23): the menu's own bottom rule restored → T3.25 and C22's session T4.34 fail on two stacked rules", () => {
    for (const remainder of [0, 4]) {
      const kinds = menuLayer(DETAILED, 0, remainder, ANCHOR).content.map((b) => b.kind);
      expect(kinds[0], `${String(remainder)}: the top edge is the menu's`).toBe("rule");
      expect(kinds.filter((k) => k === "rule"), `${String(remainder)}: and it is its only rule`).toHaveLength(1);
    }
  });
});
