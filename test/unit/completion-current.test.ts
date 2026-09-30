// C19 §6 — the current candidate (I29, ruling 89, F1474).
//
// The current is the selection when there is one and the first candidate when
// there is none. It is declared on the table as `current` (C04 I150) and C11
// draws it, and the table is the menu's one form (I30, ruling 99). These rows
// read the layer the shell pushes, which is where a typed menu's `null`
// selection arrives.
import { describe, expect, it } from "vitest";

import { MENU_ID, menuLayer } from "../../src/interaction/completion/index.js";
import type { Block } from "../../src/data/viewmodel/index.js";

const DETAILED = [
  { value: "/capabilities", detail: "the rendering route" },
  { value: "/clear", detail: "empty the transcript" },
  { value: "/config", detail: "every setting" },
];
const PLAIN = [{ value: "--status", tone: "warn" as const }, { value: "--since" }];
const ANCHOR = { row: 20, rows: 1 };

const tableOf = (content: readonly Block[]) => {
  const t = content.find((b) => b.kind === "table");
  if (t === undefined || t.kind !== "table") throw new Error("the detailed menu is a table");
  return t;
};

describe("C19 I29 — the current candidate", () => {
  it("T1.72 (C19 I29, I30): with no selection the table declares current naming the first row, with selection 1 the second, no cell carries a glyph, and a menu without hints is the same table", () => {
    const rest = tableOf(menuLayer(DETAILED, null, 0, ANCHOR).content);
    expect(rest.current, "at rest, the first candidate").toBe(rest.rows[0]?.id);
    expect(rest.rows[0]?.id, "and the row is the menu's").toBe(`${MENU_ID}-0`);

    const moved = tableOf(menuLayer(DETAILED, 1, 0, ANCHOR).content);
    expect(moved.current, "the selection").toBe(moved.rows[1]?.id);

    // **No cell glyph**: the mark is C11's, drawn from `current`, so a cell
    // glyph beside it would draw two marks and move one row's label alone.
    const glyphs = [rest, moved].flatMap((t) => t.rows.flatMap((r) => Object.values(r.cells).map((c) => c.glyph)));
    expect(glyphs.filter((g) => g !== undefined), "no cell carries a glyph").toEqual([]);

    // **A menu without hints is the same ladder** (C19 I30, ruling 99): no chip
    // row, the first row current at rest, every hint cell empty, and the
    // candidate's tone on its label — the pills form was its only reader.
    const content = menuLayer(PLAIN, null, 0, ANCHOR).content;
    expect(content.map((b) => b.kind), "no pills block").not.toContain("pills");
    const plain = tableOf(content);
    expect(plain.current, "at rest, the first candidate").toBe(plain.rows[0]?.id);
    expect(plain.rows.map((r) => r.cells["value"]?.text), "one row a candidate").toEqual(["--status", "--since"]);
    expect(plain.rows.map((r) => r.cells["detail"]?.text), "an empty hint cell").toEqual(["", ""]);
    expect(plain.rows.map((r) => r.cells["value"]?.tone), "the tone on the label").toEqual(["warn", undefined]);
  });
});
