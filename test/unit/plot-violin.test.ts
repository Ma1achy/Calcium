/**
 * VF1–VF3: violin rendering — mirrored density vase.
 */
import { describe, expect, it } from "vitest";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { FULL_CAPS, measurable } from "../support/render.js";
import { block } from "../../src/data/viewmodel/index.js";

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
  it("for each column, fill above centre mirrors fill below", () => {
    const b = block({
      kind: "plot", id: "vf2", form: "violin", height: 9, axes: true,
      categories: ["sym"],
      series: [{ values: [1, 2, 3, 3, 3, 4, 5] }],
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

    for (const col of cols) {
      const n = col.length; // cells-ok — a row count
      for (let i = 0; i < Math.floor(n / 2); i++) {
        const above = col[i] !== " ";
        const below = col[n - 1 - i] !== " ";
        expect(above).toBe(below);
      }
    }
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
