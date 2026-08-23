/**
 * Interaction tests — the readout cursor.
 */
import { describe, expect, it } from "vitest";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { FULL_CAPS, measurable } from "../support/render.js";
import { block } from "../../src/data/viewmodel/index.js";

function kit(caps = FULL_CAPS, cursorPositions?: Record<string, number>) {
  return measurable({ definitions: [plotDefinition], capabilities: caps, cursorPositions });
}

const lineBlock = block({
  kind: "plot", id: "cursor-test", form: "line", height: 5, axes: true,
  series: [
    { values: [10, 20, 30, 40, 50], label: "train" },
    { values: [15, 25, 35, 45, 55], label: "val" },
  ],
});

describe("cursor position changes output", () => {
  it("rendering with cursor differs from rendering without", () => {
    const withoutCursor = kit().renderToLines(lineBlock, 60);
    const withCursor = kit(FULL_CAPS, { "cursor-test": 2 }).renderToLines(lineBlock, 60);
    expect(withCursor.join("\n")).not.toBe(withoutCursor.join("\n"));
  });
});

describe("legend shows value at cursor", () => {
  it("the readout row contains the series values", () => {
    const lines = kit(FULL_CAPS, { "cursor-test": 2 }).renderToLines(lineBlock, 60);
    const readout = lines[lines.length - 1] ?? ""; // cells-ok — the bottom row
    expect(readout).toContain("30");
    expect(readout).toContain("35");
  });
});

describe("cursor on absent value", () => {
  it("shows dash for null values", () => {
    const gappedBlock = block({
      kind: "plot", id: "cursor-gap", form: "line", height: 5, axes: true,
      series: [{ values: [10, null, 30, 40, 50], label: "s" }],
    });
    const lines = kit(FULL_CAPS, { "cursor-gap": 1 }).renderToLines(gappedBlock, 60);
    const readout = lines[lines.length - 1] ?? ""; // cells-ok — the bottom row
    expect(readout).toContain("—");
  });
});

describe("cursor on a heatmap cell", () => {
  it("heatmap with cursor renders without error", () => {
    const heatBlock = block({
      kind: "plot", id: "cursor-heat", form: "heatmap", height: 3, axes: true,
      series: [
        { values: [1, 2, 3], label: "r1" },
        { values: [4, 5, 6], label: "r2" },
        { values: [7, 8, 9], label: "r3" },
      ],
    });
    const k = kit(FULL_CAPS, { "cursor-heat": 1 });
    expect(() => k.renderToLines(heatBlock, 40)).not.toThrow();
  });
});

describe("render height unchanged with cursor", () => {
  it("measured height equals rendered height with and without cursor", () => {
    const k1 = kit();
    const k2 = kit(FULL_CAPS, { "cursor-test": 2 });
    const measured = k1.measure(lineBlock, 60);
    const withCursor = k2.renderToLines(lineBlock, 60);
    expect(withCursor.length).toBe(measured); // cells-ok — a row count
  });
});

describe("cursor at edge positions", () => {
  it("cursor at index 0 renders without error", () => {
    const lines = kit(FULL_CAPS, { "cursor-test": 0 }).renderToLines(lineBlock, 60);
    const readout = lines[lines.length - 1] ?? ""; // cells-ok — the bottom row
    expect(readout).toContain("10");
  });

  it("cursor at last index renders without error", () => {
    const lines = kit(FULL_CAPS, { "cursor-test": 4 }).renderToLines(lineBlock, 60);
    const readout = lines[lines.length - 1] ?? ""; // cells-ok — the bottom row
    expect(readout).toContain("50");
  });

  it("cursor past the end clamps gracefully", () => {
    expect(() => kit(FULL_CAPS, { "cursor-test": 100 }).renderToLines(lineBlock, 60)).not.toThrow();
  });
});

describe("highlight: cursor emphasises one position", () => {
  it("cursor position 0 and position 4 produce different readouts", () => {
    const at0 = kit(FULL_CAPS, { "cursor-test": 0 }).renderToLines(lineBlock, 60);
    const at4 = kit(FULL_CAPS, { "cursor-test": 4 }).renderToLines(lineBlock, 60);
    const readout0 = at0[at0.length - 1] ?? ""; // cells-ok — the bottom row
    const readout4 = at4[at4.length - 1] ?? ""; // cells-ok — the bottom row
    expect(readout0).not.toBe(readout4);
  });
});

describe("cache key: cursor position changes the rendered output", () => {
  it("different cursor positions produce different frames", () => {
    const frame1 = kit(FULL_CAPS, { "cursor-test": 1 }).renderToLines(lineBlock, 60).join("\n");
    const frame2 = kit(FULL_CAPS, { "cursor-test": 3 }).renderToLines(lineBlock, 60).join("\n");
    expect(frame1).not.toBe(frame2);
  });

  it("cursor position is part of the render identity", () => {
    const noCursor = kit(FULL_CAPS).renderToLines(lineBlock, 60).join("\n");
    const withCursor = kit(FULL_CAPS, { "cursor-test": 2 }).renderToLines(lineBlock, 60).join("\n");
    expect(noCursor).not.toBe(withCursor);
  });
});
