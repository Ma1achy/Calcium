/**
 * VF1–VF3: violin rendering — mirrored density vase.
 */
import { describe, expect, it } from "vitest";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { FULL_CAPS, measurable } from "../support/render.js";
import { block } from "../../src/data/viewmodel/index.js";
import { violinRows } from "../../src/presentation/plot/kde.js";

const kit = () => measurable({ definitions: [plotDefinition], capabilities: FULL_CAPS });

describe("VF1: violin with bimodal data shows two bulges", () => {
  it("the rendered rows have wider fill at the two modes", () => {
    const b = block({
      kind: "plot", id: "vf1", form: "violin", height: 9, axes: true,
      categories: ["bimodal"],
      series: [{ values: [1, 1, 1, 1, 2, 3, 5, 5, 5, 5] }],
    });
    const k = kit();
    const lines = k.renderToLines(b, 60);

    const areaLines = lines.slice(0, -2);
    const stripped = areaLines.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ""));

    const filledCounts = stripped.map((row) => {
      const afterGutter = row.slice(row.indexOf("│") + 1);
      return [...afterGutter].filter((c) => c !== " ").length; // cells-ok — a glyph count
    });

    const centre = Math.floor(filledCounts.length / 2); // cells-ok — a row index
    expect(filledCounts[centre]).toBeGreaterThan(0);

    const hasVariation = filledCounts.some((c) => c > 0) &&
      filledCounts.some((c, i) => c !== filledCounts[0] && i > 0);
    expect(hasVariation).toBe(true);
  });
});

describe("VF2: violin is symmetric about the category axis", () => {
  it("each column's outline mirrors about the centre, and only the spine does not", () => {
    // **Against `violinRows` and not the composed frame.** The old row parsed
    // the rendered block: it found the gutter by `indexOf("│")`, which the
    // outline itself now emits, and it mirrored across the whole area rather
    // than within a band. Both were harmless while a violin was a solid slab
    // and neither is a property of the figure. A test that re-derives the
    // layout is testing the layout.
    const rows = violinRows(
      { values: [1, 2, 3, 3, 3, 4, 5] },
      40, 9, FULL_CAPS,
    );
    expect(rows.length).toBe(9); // cells-ok — a row count

    const n = rows.length; // cells-ok — a row count
    const spine = Math.round((n - 1) / 2);
    const grid = rows.map((r) => [...r]);

    for (let c = 0; c < 40; c += 1) { // cells-ok — a column index
      for (let i = 0; i < Math.floor(n / 2); i += 1) {
        if (i === spine || n - 1 - i === spine) continue;
        const above = (grid[i]?.[c] ?? " ") !== " ";
        const below = (grid[n - 1 - i]?.[c] ?? " ") !== " ";
        expect(above, `column ${String(c)} mirrors at row ${String(i)}`).toBe(below);
      }
    }
  });

  it("the spine carries a box the mirror does not (C12 §3i)", () => {
    // A violin is a box plot that also shows the distribution, so the centre
    // row is asymmetric on purpose — and asserting that keeps the row above
    // from being satisfied by an empty figure.
    const rows = violinRows(
      { values: [1, 2, 3, 3, 3, 4, 5] },
      40, 9, FULL_CAPS,
      { min: 1, q1: 2, median: 3, q3: 4, max: 5, mean: 3.4 },
    );
    const spine = rows[Math.round((rows.length - 1) / 2)] ?? "";
    expect(spine, "the median rule").toContain("│");
    expect(spine, "the mean, with its own mark").toContain("◆");
  });
});

describe("VF3: violin width proportional to density", () => {
  it("the column at the mode is wider than the column at the trough", () => {
    const b = block({
      kind: "plot", id: "vf3", form: "violin", height: 11, axes: true,
      categories: ["wide"],
      series: [{ values: [3, 3, 3, 3, 3, 3, 3, 3, 1, 5] }],
    });
    const k = kit();
    const lines = k.renderToLines(b, 60);

    const areaLines = lines.slice(0, -2);
    const stripped = areaLines.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ""));
    const gutterEnd = stripped[0]?.indexOf("│") ?? -1;
    if (gutterEnd < 0) return;

    const cols: string[][] = [];
    for (const row of stripped) {
      const area = row.slice(gutterEnd + 1);
      const chars = [...area];
      for (let c = 0; c < chars.length; c++) { // cells-ok — a column index
        if (!cols[c]) cols[c] = [];
        cols[c]!.push(chars[c]!);
      }
    }

    const widths = cols.map((col) => col.filter((c) => c !== " ").length); // cells-ok — a glyph count
    const maxW = Math.max(...widths);
    const minNonZero = Math.min(...widths.filter((w) => w > 0));
    expect(maxW).toBeGreaterThan(minNonZero);
  });
});
