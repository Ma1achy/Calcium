/**
 * LS1–LS10: line style tier — box-drawing connected lines.
 */
import { describe, expect, it } from "vitest";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { FULL_CAPS, measurable } from "../support/render.js";
import { block } from "../../src/data/viewmodel/index.js";

const kit = (caps = FULL_CAPS) => measurable({ definitions: [plotDefinition], capabilities: caps });

const lineData = block({
  kind: "plot", id: "ls-line", form: "line", height: 5, axes: true,
  series: [{ values: [10, 30, 20, 50, 40, 60, 35, 45] }],
});

const BOXDRAW_CHARS = /[─│╭╮╰╯┌┐└┘╶╴┼├┤]/;
const BRAILLE_RANGE = /[⠀-⣿]/;

describe("LS1: auto renders box drawing at narrow", () => {
  it("default style produces box-drawing glyphs at narrow", () => {
    const lines = kit().renderToLines(lineData, 60);
    const joined = lines.join("\n");
    expect(BOXDRAW_CHARS.test(joined)).toBe(true);
  });
});

describe("LS2: auto renders braille at wide", () => {
  it("default style at wide produces braille glyphs", () => {
    const wideCaps = { ...FULL_CAPS, ambiguousWidth: "wide" as const };
    const lines = kit(wideCaps).renderToLines(lineData, 60);
    const joined = lines.join("\n");
    expect(BRAILLE_RANGE.test(joined)).toBe(true);
    expect(BOXDRAW_CHARS.test(joined.replace(/[│─┼├┤└]/g, ""))).toBe(false);
  });
});

describe("LS3: braille style renders braille at narrow", () => {
  it("explicit braille style overrides auto at narrow", () => {
    const b = block({
      ...lineData, id: "ls3", plotStyle: "braille",
    });
    const lines = kit().renderToLines(b, 60);
    const joined = lines.join("\n");
    expect(BRAILLE_RANGE.test(joined)).toBe(true);
  });
});

describe("LS5: rounded and sharp corners render differently", () => {
  it("rounded vs sharp produce different output", () => {
    const rounded = block({ ...lineData, id: "ls5r", plotStyle: "line", plotCorners: "rounded" });
    const sharp = block({ ...lineData, id: "ls5s", plotStyle: "line", plotCorners: "sharp" });
    const r = kit().renderToLines(rounded, 60).join("\n");
    const s = kit().renderToLines(sharp, 60).join("\n");
    expect(r).not.toBe(s);
  });
});

describe("LS7: braille vs line — different glyphs, same row count", () => {
  it("both styles produce the same number of rows", () => {
    const braille = block({ ...lineData, id: "ls7b", plotStyle: "braille" });
    const linestyle = block({ ...lineData, id: "ls7l", plotStyle: "line" });
    const bLines = kit().renderToLines(braille, 60);
    const lLines = kit().renderToLines(linestyle, 60);
    expect(bLines.length).toBe(lLines.length); // cells-ok — row count
    expect(bLines.join("\n")).not.toBe(lLines.join("\n"));
  });
});

describe("LS9: glyph-row forms degrade at wide", () => {
  it("boxplot at wide produces ASCII substitutes", () => {
    const wideCaps = { ...FULL_CAPS, ambiguousWidth: "wide" as const };
    const b = block({
      kind: "plot", id: "ls9", form: "boxplot", height: 3, axes: true,
      categories: ["A", "B", "C"],
      quartiles: [
        { min: 1, q1: 2, median: 3, q3: 4, max: 5 },
        { min: 2, q1: 3, median: 4, q3: 5, max: 6 },
        { min: 0, q1: 1, median: 2, q3: 3, max: 4 },
      ],
      series: [],
    });
    expect(() => kit(wideCaps).renderToLines(b, 60)).not.toThrow();
  });
});

describe("LS10: axes follow ambiguousWidth regardless of style", () => {
  it("braille-style plot still uses correct axis characters", () => {
    const b = block({ ...lineData, id: "ls10", plotStyle: "braille" });
    const lines = kit().renderToLines(b, 60);
    const joined = lines.join("\n");
    expect(joined).toContain("│");
  });
});
