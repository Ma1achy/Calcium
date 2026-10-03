// C11 I32 — tier 6.
//
// Each row names the change that makes it fail and shows the defect it would
// ship; the mutation pass (`c11-disclosure`) checks the named row mechanically.
import { describe, expect, it } from "vitest";

import { planColumns } from "../../src/presentation/table/index.js";
import { planDisclosed } from "../../src/presentation/table/plan.js";
import type { ColumnDef } from "../../src/data/viewmodel/index.js";

const col = (key: string, priority: number, minWidth: number, extra: Partial<ColumnDef> = {}): ColumnDef => ({
  key, label: key, align: "left", priority, minWidth, sortable: false, ...extra,
});
const COLS: readonly ColumnDef[] = [
  col("expand", 100, 1, { label: "", role: "expand" }),
  col("a", 90, 8, { flex: true }),
  col("b", 80, 8),
];

describe("C11 §3a — the disclosure count, tier 6", () => {
  it("T6.32 (C11 I32): planDisclosed returning planColumns unchanged → T1.41 fails", () => {
    // **The defect, as the expand column's width**: one declared cell, into
    // which `▹+2` is cut to `▹` — disclosure back to one carrier.
    expect(planColumns(COLS, 60).visible[0]?.width, "the revert: the declared cell").toBe(1);
    expect(planDisclosed(COLS, 60, 2).visible[0]?.width, "the reservation").toBe(3);
  });

  it("T6.33 (C11 I32): the window's pin removed → T3.23 fails", () => {
    // **The defect, as two reservations for one table**: a slice without the
    // detail rows counts N = 0, and every column after the marker moves.
    expect(planDisclosed(COLS, 60, 0).visible[1]?.width).not.toBe(planDisclosed(COLS, 60, 2).visible[1]?.width);
  });

  it("T6.34 (C11 I32): a marker wider than its column cut rather than reduced to the mark → T1.42 fails", () => {
    // **The defect, as a number**: `▹+12` cut from the end in a three-cell column.
    const cut = "▹+12".slice(0, 3);
    expect(cut, "the revert draws a different count").toBe("▹+1");
  });
});
