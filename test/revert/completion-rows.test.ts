// C19 T6.31, T6.32, T6.33 — the menu's rows, status row and ghost, reverted.
//
// Each row pins the property its revert breaks; `tools/mutate/runs/c19-menu-rows.mjs`
// makes the reverts mechanically and names the rows that go red.
import { describe, expect, it } from "vitest";

import { ghostOf, menuBlocks } from "../../src/interaction/completion/index.js";

const ROWS = [{ value: "/capabilities", detail: "the route" }, { value: "/clear", detail: "empty" }];
const REST = [{ keys: "⏎", does: "run" }, { keys: "⇥", does: "complete" }, { keys: "esc", does: "close" }];

describe("C19 T6.31, T6.32, T6.33", () => {
  it("T6.31 (C19 I32): the hint column right-aligned or the label flexing again, the match span dropped, or the accent kept over a tone → T1.73 and T4.13 fail", () => {
    const t = menuBlocks(ROWS, 0, 0, { prefix: "/c" }).find((b) => b.kind === "table");
    if (t === undefined || t.kind !== "table") throw new Error("a table");
    expect(t.columns.map((c) => [c.align ?? "left", c.flex === true])).toEqual([["left", false], ["left", true]]);
    expect(t.rows[0]?.cells["value"]?.spans).toHaveLength(1);
  });

  it("T6.32 (C19 I33): the rest keys spelled as the specimen, the count dropped for `+ N more`, or a key shed before the count → T1.74 and T4.13 fail", () => {
    const last = menuBlocks(ROWS, 0, 3, { keys: REST }).at(-1);
    expect(last?.kind === "raw" ? last.text : "").toBe("  2 of 5   ⏎ run   ⇥ complete   esc close");
  });

  it("T6.33 (C19 I34): the ghost a unique match's only, or the chip guard removed → T4.13 and T1.75 fail", () => {
    expect(ghostOf("/c", { value: "/capabilities" }), "a menu's current is a ghost too").toBe("apabilities");
    expect(ghostOf("@p", { value: "@parse.ts", chip: { kind: "file" as const, name: "p", content: "" } })).toBeNull();
  });
});
