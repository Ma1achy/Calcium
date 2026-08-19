/**
 * SA1–SA8: the three styling forks and the record that governs them
 * (C12 I43, C04 I59, §3w).
 *
 * **What each fork does *not* change is the load-bearing half**, so most of
 * these rows assert something staying still.
 */
import { describe, expect, it } from "vitest";
import { block, validateBlock, STYLE_ARMS } from "../../src/data/viewmodel/index.js";
import type { PlotForm } from "../../src/data/viewmodel/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { FULL_CAPS, MONO_UNICODE_CAPS, measurable } from "../support/render.js";

const kit = (caps = FULL_CAPS) => measurable({ definitions: [plotDefinition], capabilities: caps });
const plain = (l: string): string => l.replace(/\x1b\[[0-9;]*m/gu, "");
const isBraille = (c: string): boolean => c >= "⠀" && c <= "⣿";
const DIST = (c: number, sp: number): number[] =>
  Array.from({ length: 200 }, (_v, i) => c + Math.sin(i * 1.7) * sp + ((i * 7) % 11) - 5); // cells-ok — a sample count

const violin = (extra: object) => block({
  kind: "plot", id: "sa", form: "violin", height: 21, axes: true,
  categories: ["a", "b", "c"],
  series: [{ values: DIST(40, 5) }, { values: DIST(45, 12) }, { values: DIST(38, 8) }], ...extra,
});

describe("SA1 (C12 I43): the record says which arms a form has, and the refusal is one rule", () => {
  it("every form declares its arms", () => {
    const forms = Object.keys(STYLE_ARMS) as PlotForm[];
    expect(forms.length).toBeGreaterThan(30); // cells-ok — a form count
    for (const f of forms) expect(Array.isArray(STYLE_ARMS[f])).toBe(true);
  });

  it("a style a form has no arm for is refused", () => {
    const bad = validateBlock({
      kind: "plot", id: "x", form: "bar", series: [{ values: [1, 2] }], height: 3,
      categories: ["a", "b"], plotStyle: "braille",
    });
    expect(bad.ok).toBe(false);
    expect(JSON.stringify(bad)).toContain("no style arms");
  });

  it("candlestick's own refusal still fires, through the record", () => {
    const bad = validateBlock({
      kind: "plot", id: "x", form: "bar", series: [], height: 3, categories: ["a"],
      plotStyle: "candlestick", ohlc: [{ open: 1, high: 2, low: 0, close: 1 }],
    });
    expect(bad.ok).toBe(false);
  });

  it("and a style the form does have is accepted", () => {
    expect(validateBlock({
      kind: "plot", id: "x", form: "violin", series: [{ values: [1, 2, 3] }], height: 9,
      categories: ["a"], plotStyle: "braille",
    }).ok).toBe(true);
  });
});

describe("SA2 (C04 I59): a fill is the braille arm's", () => {
  it("solid with a line style is refused", () => {
    const bad = validateBlock({
      kind: "plot", id: "x", form: "violin", series: [{ values: [1, 2, 3] }], height: 9,
      categories: ["a"], plotStyle: "line", plotFill: "solid",
    });
    expect(bad.ok).toBe(false);
    expect(JSON.stringify(bad)).toContain("no interior vocabulary");
  });

  it("solid with braille is accepted", () => {
    expect(validateBlock({
      kind: "plot", id: "x", form: "violin", series: [{ values: [1, 2, 3] }], height: 9,
      categories: ["a"], plotStyle: "braille", plotFill: "solid",
    }).ok).toBe(true);
  });
});

describe("SA3 (C12 I43): a braille violin changes the vocabulary and not the geometry", () => {
  const rowsOf = (extra: object): readonly string[] =>
    kit().renderToLines(violin(extra), 72).map(plain);

  it("the row count and the band labels are identical to the line arm", () => {
    const line = rowsOf({});
    const braille = rowsOf({ plotStyle: "braille" });
    expect(braille).toHaveLength(line.length); // cells-ok — a row count
    // Only a row with an axis edge has a gutter; splitting every row and
    // keeping the head returns the whole of the ones without, which differ by
    // construction. The same slip T2.12b made, two steps earlier.
    const labels = (rs: readonly string[]): string[] =>
      rs.filter((r) => r.includes("┤")).map((r) => r.split("┤")[0] ?? "");
    expect(labels(braille)).toEqual(labels(line));
  });

  it("the outline is dots where the line arm draws box glyphs", () => {
    const braille = rowsOf({ plotStyle: "braille" }).join("");
    expect([...braille].some(isBraille)).toBe(true);
    expect(braille).not.toContain("╭");
  });

  it("the shape exists across the whole width, not half of it", () => {
    // **The row the mutation walked past.** Reusing the cell-resolution
    // densities gives `undefined` past the halfway column — guarded to zero
    // now, so the right half of every band collapses onto the spine and *the
    // outline is dots* stays true. Resampling means both halves have a shape.
    // **Off the spine row**, which is inked from edge to edge in both arms and
    // so makes any half look occupied — the first form of this counted it and
    // the mutation walked past.
    const rows = rowsOf({ plotStyle: "braille" }).filter((r) => r.includes("│"));
    const inked = (half: 0 | 1): number => rows.reduce((n, r) => {
      const cs = [...r].filter(isBraille);
      const mid = Math.floor(cs.length / 2); // cells-ok — a column index
      const side = half === 0 ? cs.slice(0, mid) : cs.slice(mid);
      return n + side.filter((c) => c !== "⠀").length; // cells-ok — a cell count
    }, 0);
    // **Comparable halves, not merely non-empty ones.** A violin is a
    // distribution across its whole support; the mutation leaves the right half
    // at 99 cells against 241, which *greater than ten* passes and a ratio does
    // not. Unmutated the two are within a sixth of each other.
    expect(inked(1)).toBeGreaterThan(inked(0) * 0.6); // cells-ok — a cell count
    expect(inked(0)).toBeGreaterThan(inked(1) * 0.6); // cells-ok — a cell count
  });

  it("the box and the marks stay cell-resolution over the fill", () => {
    // A quartile is a position, not a shape — the braille arm draws its outline
    // in dots and its box in cells, and one placer means the two arms cannot
    // drift about where a median is.
    const filled = rowsOf({ plotStyle: "braille", plotFill: "solid" }).join("");
    expect(filled).toContain("◈");
  });
});

describe("SA4 (C12 I43): the fill is a body and not a hatch", () => {
  it("filling sets every dot of an interior cell", () => {
    // The first form set one dot column per cell and drew `⢸⢸⢸` — a hatch. An
    // interior cell is `⣿`.
    const filled = kit().renderToLines(violin({ plotStyle: "braille", plotFill: "solid" }), 72)
      .map(plain).join("");
    expect(filled).toContain("⣿");
  });

  it("and an unfilled one has none", () => {
    const open = kit().renderToLines(violin({ plotStyle: "braille" }), 72).map(plain).join("");
    expect(open).not.toContain("⣿");
  });
});

describe("SA5 (C12 I43): a solid pie folds the same geometry", () => {
  const segs = [
    { label: "A", value: 65 }, { label: "B", value: 15 },
    { label: "C", value: 12 }, { label: "D", value: 8 },
  ];
  const pie = (extra: object, caps = FULL_CAPS) =>
    kit(caps).renderToLines(block({
      kind: "plot", id: "sa5", form: "pie", height: 18, series: [], segments: segs, ...extra,
    }), 72).map(plain);

  it("block glyphs replace the dots, and the disc is the same size", () => {
    const solid = pie({ plotStyle: "solid" });
    const braille = pie({});
    expect(solid.join("")).toContain("█");
    expect([...solid.join("")].some(isBraille)).toBe(false);
    // **The area, and strictly smaller — measured, after two weaker forms.**
    // The row count is identical under any threshold, and so is the widest row:
    // the disc's flanks are dense and only its *rim* holds part-covered cells.
    // Braille inks a cell with one dot in it, so at `>= 1` the solid disc is
    // the braille disc exactly; at half it rounds the rim in. 519 cells against
    // 540 at height 18, and the relation is what the threshold means — *this
    // cell is more inside than out*.
    const area = (rs: readonly string[], mark: (c: string) => boolean): number =>
      rs.reduce((n, r) => n + [...r].filter(mark).length, 0); // cells-ok — a cell count
    const solidArea = area(solid, (c) => c === "█");
    const brailleArea = area(braille, (c) => isBraille(c) && c !== "⠀");
    expect(solidArea).toBeLessThan(brailleArea); // cells-ok — a cell count
    expect(solidArea).toBeGreaterThan(brailleArea * 0.9); // cells-ok — a cell count
  });

  it("at one bit it degrades to braille rather than refusing", () => {
    // The hatch ladder is that depth's identity channel and a block glyph has
    // no hatch, so a solid pie there would be an undifferentiated disc.
    // C12 I18's precedent: the honest answer is the thing that fits.
    const oneBit = pie({ plotStyle: "solid" }, MONO_UNICODE_CAPS);
    expect([...oneBit.join("")].some(isBraille)).toBe(true);
  });
});

describe("SA6 (C12 I43): a line-drawn radar strokes at cell resolution", () => {
  const radar = (extra: object) => kit().renderToLines(block({
    kind: "plot", id: "sa6", form: "radar", height: 17,
    categories: ["Speed", "Power", "Range", "Defence", "HP"],
    series: [{ values: [8, 6, 7, 5, 9], label: "alpha" }, { values: [5, 9, 4, 8, 6], label: "beta" }],
    ...extra,
  }), 72).map(plain);

  it("the polygons are box glyphs, read by their own colour", () => {
    // **The frame follows the style too, so *the figure has box glyphs* is
    // true with the polygons left in braille** — which is what the mutation
    // proved. The polygons carry their series' slots and the frame carries
    // `tone.muted`, so the claim is about box glyphs in a *series* colour.
    const raw = kit().renderToLines(block({
      kind: "plot", id: "sa6c", form: "radar", height: 17,
      categories: ["Speed", "Power", "Range", "Defence", "HP"],
      series: [{ values: [8, 6, 7, 5, 9], label: "alpha" }, { values: [5, 9, 4, 8, 6], label: "beta" }],
      plotStyle: "line",
    }), 72);
    const MUTED = "98;98;98";
    let coloured = 0;
    for (const l of raw) {
      let slot = "";
      for (const part of l.split(/\x1b\[/u)) {
        const m = /^38;2;(\d+;\d+;\d+)m/u.exec(part);
        if (m) { slot = m[1]!; }
        const text = m ? part.slice(m[0].length) : part.replace(/^[0-9;]*m/u, "");
        if (slot !== "" && slot !== MUTED) coloured += [...text].filter((c) => /[╭╮╯╰─│┬┴├┤┼]/u.test(c)).length; // cells-ok — a cell count
      }
    }
    expect(coloured).toBeGreaterThan(20); // cells-ok — a cell count
  });

  it("the braille arm has no box glyphs at all", () => {
    expect(radar({}).join("")).not.toMatch(/[╭╮╯╰]/u);
  });
});

describe("SA7 (C12 I43): the legend's swatch is the vocabulary the figure uses", () => {
  it("a solid pie's key is a block, not a braille cell", () => {
    const rows = kit().renderToLines(block({
      kind: "plot", id: "sa7", form: "pie", height: 18, series: [],
      segments: [{ label: "A", value: 60 }, { label: "B", value: 40 }], plotStyle: "solid",
    }), 72).map(plain);
    const key = rows.find((r) => r.includes("A ")) ?? "";
    // Everything after the disc: the swatch and its label.
    expect(key).toContain("█");
  });
});

describe("SA8 (C12 I43): the forks leave the untouched arms alone", () => {
  it("a violin with no style is what it was", () => {
    const before = kit().renderToLines(violin({}), 72).map(plain).join("\n");
    expect(before).toContain("╭");
    expect([...before].some(isBraille)).toBe(false);
  });
});
