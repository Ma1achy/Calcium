// C11 §5d — the current row at every width (I33, C09 I1).
//
// The lead is taken off the column before the cell is fitted, so the row can
// never be wider than the block and the mark is never what a cut removes.
import { describe, expect, it } from "vitest";

import { tableDefinition } from "../../src/presentation/table/index.js";
import type { Table } from "../../src/data/viewmodel/index.js";
import { cells } from "../../src/presentation/text.js";
import { FULL_CAPS, measurable, visible } from "../support/render.js";

const BARE: Table = {
  kind: "table",
  id: "t",
  columns: [
    { key: "value", label: "name", align: "left", priority: 2, minWidth: 6, flex: true, sortable: false },
    { key: "detail", label: "what", align: "right", priority: 1, minWidth: 5, sortable: false },
  ],
  rows: [
    { id: "r0", cells: { value: { text: "/capabilities" }, detail: { text: "route" } } },
    { id: "r1", cells: { value: { text: "/clear" }, detail: { text: "empty" } } },
  ],
};
const TABLE: Table = { ...BARE, current: "r0" };

describe("C11 §5d — the current row, narrow", () => {
  it("T3.25 (C11 I33, C09 I1): a table declaring current, from 1 to 30 columns, draws no row over the width and measures what it draws, and a column truncating from the start keeps the mark", () => {
    const r = measurable({ definitions: [tableDefinition], capabilities: FULL_CAPS });
    for (let width = 1; width <= 30; width += 1) {
      const lines = r.renderToLines(TABLE, width);
      for (const line of lines) {
        expect(cells(visible(line)), `${String(width)}: ${JSON.stringify(visible(line))}`).toBeLessThanOrEqual(width);
      }
      expect(r.measure(TABLE, width), `${String(width)}: measure is what is drawn`).toBe(lines.length);
      expect(r.measure(TABLE, width), `${String(width)}: and what the table without the field measures`).toBe(
        r.measure(BARE, width),
      );
    }

    // **The mark survives the cut** from either end: the lead is outside it.
    const fromStart: Table = {
      ...TABLE,
      columns: TABLE.columns.map((c) => (c.key === "value" ? { ...c, truncateFrom: "start" as const } : c)),
    };
    const row = visible(r.renderToLines(fromStart, 14)[1] ?? "");
    expect(row.startsWith("  › "), `the mark leads: ${JSON.stringify(row)}`).toBe(true);
    expect(row.trimEnd().endsWith("ities"), `and the text's tail is kept: ${JSON.stringify(row)}`).toBe(true);
  });
});
