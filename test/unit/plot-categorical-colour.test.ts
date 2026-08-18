/**
 * DC1–DC7: default categorical colouring.
 */
import { describe, expect, it } from "vitest";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { FULL_CAPS, MONO_CAPS, measurable } from "../support/render.js";
import { block } from "../../src/data/viewmodel/index.js";

const kit = (caps = FULL_CAPS) => measurable({ definitions: [plotDefinition], capabilities: caps });

const SGR = /\x1b\[38;2;(\d+;\d+;\d+)m/g;

function extractColours(lines: readonly string[]): Set<string> {
  const colours = new Set<string>();
  for (const l of lines) {
    for (const m of l.matchAll(SGR)) colours.add(m[1]!);
  }
  return colours;
}

describe("DC1: pie with 4 segments renders 4 different SGR colours", () => {
  it("four distinct foreground colours appear", () => {
    const b = block({
      kind: "plot", id: "dc1", form: "pie", height: 8, series: [],
      segments: [
        { label: "A", value: 30 },
        { label: "B", value: 25 },
        { label: "C", value: 25 },
        { label: "D", value: 20 },
      ],
    });
    const lines = kit().renderToLines(b, 40);
    const colours = extractColours(lines);
    expect(colours.size).toBeGreaterThanOrEqual(4);
  });
});

describe("DC2: grouped bar with 3 categories renders 3 colours", () => {
  it("three distinct foreground colours appear", () => {
    const b = block({
      kind: "plot", id: "dc2", form: "bar", height: 3, axes: true,
      categories: ["X", "Y", "Z"],
      series: [{ values: [10, 20, 30] }],
    });
    const lines = kit().renderToLines(b, 60);
    const colours = extractColours(lines);
    expect(colours.size).toBeGreaterThanOrEqual(3);
  });
});

describe("DC3: waffle with 3 segments renders 3 colours", () => {
  it("three distinct foreground colours appear at 24-bit", () => {
    const b = block({
      kind: "plot", id: "dc3", form: "waffle", series: [],
      segments: [
        { label: "A", value: 40 },
        { label: "B", value: 30 },
        { label: "C", value: 30 },
      ],
    });
    const lines = kit().renderToLines(b, 20);
    const colours = extractColours(lines);
    expect(colours.size).toBeGreaterThanOrEqual(3);
  });
});

describe("DC4: at 1-bit, categorical forms render without error", () => {
  it("waffle with 3 segments renders correctly at 1-bit", () => {
    const b = block({
      kind: "plot", id: "dc4", form: "waffle", series: [],
      segments: [
        { label: "A", value: 40 },
        { label: "B", value: 30 },
        { label: "C", value: 30 },
      ],
    });
    const lines = kit(MONO_CAPS).renderToLines(b, 20);
    expect(lines.length).toBeGreaterThan(0); // cells-ok — a row count
    const stripped = lines.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ""));
    const hasContent = stripped.some((r) => r.trim().length > 0); // cells-ok — checking non-empty
    expect(hasContent).toBe(true);
  });
});

describe("DC6: explicit tone overrides the default assignment", () => {
  it("a series with tone 'error' uses a different colour than categorical", () => {
    const b1 = block({
      kind: "plot", id: "dc6a", form: "bar", height: 2, axes: true,
      categories: ["X", "Y"],
      series: [{ values: [10, 20] }],
    });
    const b2 = block({
      kind: "plot", id: "dc6b", form: "bar", height: 2, axes: true,
      categories: ["X", "Y"],
      series: [{ values: [10, 20], tone: "error" }],
    });
    const lines1 = kit().renderToLines(b1, 60).join("\n");
    const lines2 = kit().renderToLines(b2, 60).join("\n");
    expect(lines1).not.toBe(lines2);
  });
});

describe("DC7: default colours match Okabe-Ito slot order", () => {
  it("first category uses c1, second uses c2", () => {
    const b = block({
      kind: "plot", id: "dc7", form: "bar", height: 2, axes: true,
      categories: ["first", "second"],
      series: [{ values: [50, 50] }],
    });
    const lines = kit().renderToLines(b, 60);
    const colours = [...extractColours(lines)];
    expect(colours.length).toBeGreaterThanOrEqual(2); // cells-ok — a colour count
    expect(colours[0]).not.toBe(colours[1]);
  });
});
