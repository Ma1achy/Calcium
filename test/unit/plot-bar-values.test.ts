/**
 * BV1–BV7: where a bar's number goes, and what it costs (C12 I20, §3b).
 *
 * **Indexed by the two rules meeting, not by input.** The rules are *the number
 * takes the width it needs* and *the run is the axis*, and they meet in one
 * cell: what happens when the number's width changes between two bars of one
 * chart. Taken per row that inverts — a larger value drew a shorter bar — and
 * no assertion about a single bar can see it, because each row is individually
 * correct.
 */
import { describe, expect, it } from "vitest";
import { barColumn, barRow } from "../../src/presentation/plot/categorical.js";
import { block } from "../../src/data/viewmodel/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { ASCII_CAPS, FULL_CAPS, measurable } from "../support/render.js";

const kit = (caps = FULL_CAPS) => measurable({ definitions: [plotDefinition], capabilities: caps });
const plain = (l: string): string => l.replace(/\x1b\[[0-9;]*m/gu, "");
/** The inked run, in whole and partial cells — the length a reader compares. */
const runOf = (row: string): number =>
  [...row].filter((c) => c >= "█" && c <= "▏").length; // cells-ok — a cell count

describe("BV1 (C12 I20): a larger value never draws a shorter run", () => {
  // **The inversion, and the width it happens at is not exotic.** At `max: 100`
  // in 40 cells, 99 drew 37 and 100 drew 36, because `100` is a column wider
  // than `99` and each run was scaled against what its own label left.
  it("99 and 100 at max 100", () => {
    const allow = 5; // ` 100`, the chart's widest — one number for both rows
    const a = runOf(barRow(99, 0, 100, 40, FULL_CAPS, true, undefined, allow));
    const b = runOf(barRow(100, 0, 100, 40, FULL_CAPS, true, undefined, allow));
    expect(b).toBeGreaterThanOrEqual(a); // cells-ok — a cell count
  });

  it("every value in a chart, across the digit boundaries", () => {
    const values = [1, 8, 9, 10, 11, 98, 99, 100, 101, 999, 1000];
    const b = block({
      kind: "plot", id: "bv1", form: "bar", height: values.length, axes: true,
      categories: values.map((v) => `v${String(v)}`),
      series: [{ values }],
    });
    const rows = kit().renderToLines(b, 60).map(plain).filter((r) => r.includes("┤"));
    const runs = rows.map(runOf);
    for (let i = 1; i < runs.length; i += 1) { // cells-ok — a row count
      expect({ at: values[i], run: runs[i]! >= runs[i - 1]! })
        .toEqual({ at: values[i], run: true });
    }
  });
});

describe("BV2 (C12 I20): the numbers line up under each other", () => {
  it("a chart of mixed widths right-aligns its numbers", () => {
    const b = block({
      kind: "plot", id: "bv2", form: "bar", height: 3, axes: true,
      categories: ["a", "b", "c"], series: [{ values: [4, 51, 100] }],
    });
    const ends = kit().renderToLines(b, 60).map(plain)
      .filter((r) => r.includes("┤"))
      .map((r) => r.replace(/[│\s]+$/u, "").length); // cells-ok — a column position
    expect(new Set(ends).size).toBe(1); // cells-ok — a position count
  });
});

describe("BV3 (C12 I20): the vertical arm writes the number above the run", () => {
  const col = (v: number, w: number, rows: number, max = 100): readonly string[] =>
    barColumn(v, 0, max, w, rows, FULL_CAPS, true);

  it("the number sits on the row above the topmost inked one, centred", () => {
    const c = col(50, 7, 10);
    const inked = c.findIndex((r) => r.trim() !== "" && !/\d/u.test(r)); // cells-ok — a row index
    const labelled = c.findIndex((r) => /\d/u.test(r)); // cells-ok — a row index
    expect(labelled).toBe(inked - 1); // cells-ok — a row index
    expect(c[labelled]!).toBe("  50   ");
  });

  it("a bar whose top cell is partial is still cleared", () => {
    // **The row the first form of BV3 could not reach.** `col(50, …, 10)` is
    // exactly five whole cells — `part` is zero — so *count the partial cell as
    // inked* and *do not* give the same answer, and the mutation that drops the
    // clause walked past it. 53 of 100 in ten rows is five cells and two
    // eighths, which is the case the clause exists for.
    const c = col(53, 7, 10);
    const top = c.findIndex((r) => r.trim() !== "" && !/\d/u.test(r)); // cells-ok — a row index
    // Shown to be partial before anything is asserted about the row above it.
    expect(c[top]!).not.toBe("███████");
    expect(c[top]!.trim()).not.toBe("");
    expect(c[top + 1]!).toBe("███████"); // cells-ok — a row index
    expect(c[top - 1]!).toBe("  53   "); // cells-ok — a row index
  });

  it("every row is still exactly the column's width", () => {
    for (const w of [3, 4, 7, 12]) {
      for (const r of col(50, w, 8)) expect(r).toHaveLength(w); // cells-ok — a column width
    }
  });
});

describe("BV4 (C12 I20): a bar at the ceiling drops its number", () => {
  it("nothing is written and nothing is overwritten", () => {
    const c = barColumn(100, 0, 100, 6, 5, FULL_CAPS, true);
    expect(c.join("")).not.toMatch(/\d/u);
    expect(c.every((r) => r === "██████")).toBe(true);
  });

  it("the bar one step below the ceiling keeps it", () => {
    const c = barColumn(70, 0, 100, 6, 5, FULL_CAPS, true);
    expect(c.join("")).toMatch(/70/u);
  });
});

describe("BV5 (C12 I20): a number wider than its column is dropped, never truncated", () => {
  for (const [w, v] of [[2, 12345], [3, 1000], [4, 100000]] as const) {
    it(`${String(v)} in ${String(w)} cells`, () => {
      const c = barColumn(v, 0, 200000, w, 8, FULL_CAPS, true);
      expect(c.join("")).not.toMatch(/\d/u);
      for (const r of c) expect(r).toHaveLength(w); // cells-ok — a column width
    });
  }

  it("and it fits the moment the column is wide enough", () => {
    expect(barColumn(1000, 0, 200000, 4, 8, FULL_CAPS, true).join("")).toMatch(/1000/u);
  });
});

describe("BV6 (C12 I20): a bar of no height keeps its number on the baseline", () => {
  it("the number is on the bottom row, where the ink would have started", () => {
    const c = barColumn(0, 0, 100, 5, 6, FULL_CAPS, true);
    expect(c[c.length - 1]!).toMatch(/0/u);
    expect(c.slice(0, -1).join("").trim()).toBe("");
  });
});

describe("BV7 (C12 I20): an absent value draws no column and no number", () => {
  it("a null column is blank at both arms", () => {
    for (const caps of [FULL_CAPS, ASCII_CAPS]) {
      const c = barColumn(null, 0, 100, 5, 6, caps, true);
      expect(c.join("").trim()).toBe("");
      for (const r of c) expect(r).toHaveLength(5); // cells-ok — a column width
    }
  });
});
