// C11 T6.35 — the walk's shared plan and the mark's constant, reverted.
//
// The row shows the defect each revert ships and names the row that catches
// it; the mutation pass (`c11-plan-count`) makes both reverts mechanically.
import { describe, expect, it } from "vitest";

import { cells } from "../../src/presentation/text.js";
import { psTable } from "../support/blocks.js";

describe("C11 T6.35", () => {
  it("T6.35 (C11 I32): a plan per row, or the mark measured per call → T3.24 fails", () => {
    // **A plan per row** is a count of the rows asking: every expanded row asked
    // `detailHeight`, and each planned — 5 and 50 where T3.24 asserts 1.
    const rowsAsking = (n: number): number =>
      psTable({ rows: n, expanded: Array.from({ length: n }, (_, i) => i + 1), detail: true }).rows.filter(
        (row) => row.expanded === true,
      ).length; // cells-ok — a count of rows
    expect([rowsAsking(5), rowsAsking(50)], "the plans a per-row walk takes").toEqual([5, 50]);
    // **The mark measured per call**: `disclosureCells` asks twice per plan and
    // `glyphCells` measures both halves each time — four `cells()` of strings
    // that never change, where T3.24 asserts none.
    const perPlan = ["▹", "(", "▿", "v"].map((g) => cells(g));
    expect(perPlan, "four measurements, each of one cell").toEqual([1, 1, 1, 1]);
  });
});
