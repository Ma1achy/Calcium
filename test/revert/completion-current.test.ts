// C19 T6.25, T6.26, T6.27 — the current candidate, the shared rule and the
// chrome count that shares it, reverted.
//
// Each row pins the property its revert breaks; `tools/mutate/runs/c19-menu-current.mjs`
// makes the reverts mechanically and names the rows that go red.
import { describe, expect, it } from "vitest";

import { menuLayer, menuRowsShown } from "../../src/interaction/completion/index.js";

const DETAILED = [
  { value: "/capabilities", detail: "the rendering route" },
  { value: "/clear", detail: "empty the transcript" },
];
const ANCHOR = { row: 20, rows: 1 };

describe("C19 T6.25, T6.26, T6.27", () => {
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

  it("T6.26 (C19 I23): the menu's own bottom rule restored → T3.25 fails on the untruncated arm and T4.9 on the truncated, where the frame cuts the rule", () => {
    for (const remainder of [0, 4]) {
      const kinds = menuLayer(DETAILED, 0, remainder, ANCHOR).content.map((b) => b.kind);
      expect(kinds[0], `${String(remainder)}: the top edge is the menu's`).toBe("rule");
      expect(kinds.filter((k) => k === "rule"), `${String(remainder)}: and it is its only rule`).toHaveLength(1);
    }
  });

  it("T6.27 (C19 I23): menuRowsShown still charging the bottom edge → T4.9 fails, the window one candidate short of its box", () => {
    // The chrome is the top edge and the status row, whether or not anything
    // was cut (C19 I33): the bottom edge is the prompt's rule (ruling 90), so
    // neither arm charges it.
    const placed = (height: number, truncated: boolean) =>
      ({ height, truncated }) as unknown as Parameters<typeof menuRowsShown>[0];
    expect(menuRowsShown(placed(6, false)), "untruncated: the edge and the status row").toBe(4);
    expect(menuRowsShown(placed(6, true)), "truncated: the same two").toBe(4);
  });
});
