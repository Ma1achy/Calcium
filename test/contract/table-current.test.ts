// C04 §3 — a table's `current` (I150, ruling 89, F1474).
//
// The field is the table's `active`: the row a chooser is on, named by id.
// These rows hold the two halves C04 owns — what the wire accepts, and that
// nothing `measure` reads follows it. What C11 draws for it is C11 T1.43.
import { describe, expect, it } from "vitest";

import { validateBlock, type Table } from "../../src/data/viewmodel/index.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import { measurable } from "../support/render.js";

const TABLE: Table = {
  kind: "table",
  id: "t",
  columns: [
    { key: "value", label: "", align: "left", priority: 2, minWidth: 8, flex: true, sortable: false },
    { key: "detail", label: "", align: "right", priority: 1, minWidth: 12, sortable: false },
  ],
  rows: ["r0", "r1", "r2"].map((id, i) => ({
    id,
    cells: { value: { text: `/verb-${String(i)}` }, detail: { text: `what verb ${String(i)} does` } },
  })),
  showHeader: false,
};

describe("C04 I150 — a table's current", () => {
  it("T2.155 (C04 I150): a non-string current is refused naming the field, a row id or an id naming no row is accepted, and measure is one number with current absent, naming each row, and naming none", () => {
    const refused = validateBlock({ ...TABLE, current: 3 } as unknown as Table);
    expect(refused.ok, "an index is refused").toBe(false);
    expect(refused.ok ? "" : refused.error.join("\n")).toMatch(/"current" is a row's id, a string/u);

    expect(validateBlock({ ...TABLE, current: "r1" }).ok, "a row's id").toBe(true);
    expect(validateBlock({ ...TABLE, current: "gone" }).ok, "an id naming no row is valid").toBe(true);

    // **The fixture responds**: the field reaches the renderer, or the measure
    // arm below compares one table with itself. The current row's text moves
    // two cells right of the table without the field.
    const r = measurable({ definitions: [tableDefinition] });
    const plain = (b: Table): string => (r.renderToLines(b, 60)[1] ?? "").replace(/\u001b\[[0-9;]*m/gu, "");
    expect(plain({ ...TABLE, current: "r1" }).indexOf("/verb-1"), "the field is drawn").toBe(
      plain(TABLE).indexOf("/verb-1") + 2,
    );

    for (const width of [40, 80]) {
      const bare = r.measure(TABLE, width);
      const heights = [undefined, "r0", "r1", "r2", "gone"].map((current) =>
        r.measure(current === undefined ? TABLE : { ...TABLE, current }, width),
      );
      expect(heights, `${String(width)}: one height whatever current names`).toEqual(heights.map(() => bare));
    }
  });
});
