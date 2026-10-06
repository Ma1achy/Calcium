// C11 T6.36, T6.37 — the current row, reverted (I33).
//
// Each row pins the property its revert breaks and names the row that goes
// red; `tools/mutate/runs/c11-current-row.mjs` makes both reverts mechanically.
import { describe, expect, it } from "vitest";

import { background } from "../../src/presentation/blocks/paint.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import { sgr } from "../../src/terminal/escapes.js";
import type { Table } from "../../src/data/viewmodel/index.js";
import { DARK_THEME, FULL_CAPS, measurable, visible } from "../support/render.js";

const TABLE: Table = {
  kind: "table",
  id: "t",
  columns: [{ key: "value", label: "", align: "left", priority: 1, minWidth: 8, flex: true, sortable: false }],
  rows: ["alpha", "beta", "gamma"].map((text, i) => ({ id: `r${String(i)}`, cells: { value: { text } } })),
  showHeader: false,
};

const draw = (block: Table): readonly string[] =>
  measurable({ definitions: [tableDefinition], capabilities: FULL_CAPS }).renderToLines(block, 30);

describe("C11 T6.36, T6.37", () => {
  it("T6.36 (C11 I33): the reservation keyed on the value rather than the presence → T1.43 fails on the no-row arm", () => {
    // A chooser whose current the wheel scrolled out of its window declares an
    // id naming no row. Keyed on the value, the slot goes with the mark, and
    // every label jumps two cells left mid-scroll.
    const column = (current: string): readonly number[] =>
      draw({ ...TABLE, current }).map((l, i) => visible(l).indexOf(["alpha", "beta", "gamma"][i] ?? "?"));
    expect(column("gone"), "one column with no row current").toEqual(column("r1"));
    expect(new Set(column("r1")).size, "and one column with a row current").toBe(1);
  });

  it("T6.37 (C11 I33): the current row emitted without the pick ground → T1.43 fails on the 24-bit arm", () => {
    const pick = sgr(background("surface.pick", DARK_THEME, FULL_CAPS)).slice(2, -1);
    const rows = draw({ ...TABLE, current: "r1" });
    expect(rows.map((r) => r.includes(pick)), "the ground is the current row's alone").toEqual([false, true, false]);
  });
});
