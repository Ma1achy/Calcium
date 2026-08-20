/**
 * CN1–CN8 and LY1–LY8: the contour, and what is layered over a field
 * (C12 I49, I51; C04 I61).
 *
 * **§6d's table is the primary artefact and these rows follow it.** A field form
 * is nearly all structure — two rules that both hold at rest — and the one
 * sequential thing it has is the composition order, which §6d.2 traces and LY1,
 * LY2 and LY7 test.
 *
 * The fixtures are not incidental. A ridge field cannot saddle and a separable
 * one only saddles at the level the surface takes there, so the two facts a
 * saddle needs are both in the fixture rather than in a comment beside it.
 */
import { describe, expect, it } from "vitest";
import { block, type Series } from "../../src/data/viewmodel/index.js";
import { validateDocument } from "../../src/data/viewmodel/validate.js";
import { b } from "../../src/shell/builders/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import {
  contourLevels, dimFactorFor, fieldSampler, glyphLayerOrder, marchingMask,
  saddleJoinsTopLeft,
} from "../../src/presentation/plot/field.js";
import { glyphForMask } from "../../src/presentation/plot/linedraw.js";
import { COLORMAPS } from "../../src/presentation/theme/colormap.js";
import { DEFAULT_FLOOR, ratio } from "../../src/presentation/theme/contrast.js";
import { FULL_CAPS, measurable } from "../support/render.js";

const kit = (caps = FULL_CAPS) => measurable({ definitions: [plotDefinition], capabilities: caps });
const plain = (l: string): string => l.replace(/\x1b\[[0-9;]*m/gu, "");

/** A separable field: local extrema, so the surface has saddles to find. */
const field = (rows: number, cols: number, freq = 0.6): Series[] =>
  Array.from({ length: rows }, (_r, r) => ({
    values: Array.from({ length: cols }, (_c, c) => Math.sin(r * freq) * Math.sin(c * freq) * 50 + 50), // cells-ok — a sample count
    label: `row${String(r)}`,
  }));

/** A ridge field: `sin(r + c)`, whose iso-lines are straight and never saddle. */
const ridge = (rows: number, cols: number): Series[] =>
  Array.from({ length: rows }, (_r, r) => ({
    values: Array.from({ length: cols }, (_c, c) => Math.sin((r + c) * 0.3) * 50 + 50), // cells-ok — a sample count
    label: `row${String(r)}`,
  }));

function rows(extra: object, w = 60, caps = FULL_CAPS): readonly string[] {
  return kit(caps).renderToLines(block({
    kind: "plot", id: "cn", form: "contour", height: 6, axes: true,
    series: field(6, 24), ...extra,
  }), w);
}
const bare = (extra: object, w = 60, caps = FULL_CAPS): string[] => rows(extra, w, caps).map(plain);
/**
 * The plot area's rows only — the gutter and the legend stripped off.
 *
 * **The row count comes from the fixture**, because a fixed six sliced the
 * legend into a four-row plot and CN4 read `50 50 ·` as ink the contour had
 * drawn. The helper has to know the height for the same reason the renderer does.
 */
const area = (extra: object, w = 60, caps = FULL_CAPS): string[] => {
  const h = (extra as { height?: number }).height ?? 6;
  return bare(extra, w, caps).slice(0, h).map((l) => l.replace(/^[^┤+]*[┤+]/u, ""));
};

describe("CN — the contour (C12 I49)", () => {
  it("CN1 (C12 I49): each of the sixteen corner cases resolves to the shipped table's glyph", () => {
    // **Enumerated, not sampled**, and asserted against `glyphForMask` itself
    // rather than a copy: a second table is the thing the derivation exists to
    // avoid, and a copy in the test would agree with a copy in the source.
    const seen = new Map<number, string>();
    for (let i = 0; i < 16; i += 1) { // cells-ok — a case count
      const [tl, tr, br, bl] = [(i >> 3) & 1, (i >> 2) & 1, (i >> 1) & 1, i & 1];
      const mask = marchingMask(tl!, tr!, br!, bl!, 0.5);
      seen.set(mask, glyphForMask(mask, "rounded"));
    }
    // Eight distinct masks, and every one already in the table.
    expect([...seen.keys()].sort((x, y) => x - y)).toEqual([0, 3, 5, 6, 9, 10, 12, 15]);
    expect([...seen.values()]).not.toContain(undefined);
    // The mapping itself, spelled out — a corner pair that disagrees crosses.
    expect(marchingMask(1, 0, 0, 0, 0.5)).toBe(glyphMaskOf("top", "left"));
    expect(marchingMask(0, 0, 1, 1, 0.5)).toBe(glyphMaskOf("right", "left"));
    expect(glyphForMask(marchingMask(0, 1, 0, 1, 0.5), "rounded")).toBe("┼");
  });

  it("CN2 (C12 I49): the saddle resolves by the centre value, both ways reachable", () => {
    // Both resolutions, from the same four corners at two levels — the pairing
    // turns with where the level sits relative to the surface's centre.
    expect(saddleJoinsTopLeft(100, 0, 100, 0, 40)).toBe(true);
    expect(saddleJoinsTopLeft(100, 0, 100, 0, 60)).toBe(false);
    // And it is visible on the braille arm: the two arms of the crossing differ.
    const saddled = area({ height: 8, levels: [50], series: field(8, 32, 1.0) });
    const glyphs = new Set(saddled.join("").split("").filter((c) => c !== " "));
    expect(glyphs.size).toBeGreaterThan(1);
  });

  it("CN2b (C12 I49): the `line` arm collapses both resolutions to ┼", () => {
    // **The pair is the point.** The ruling has no subject here, and this row is
    // what says so rather than a comment: every crossing is the same glyph, so a
    // mutation replacing the centre-value rule with a constant fails nothing on
    // this arm and fails CN2 on the other.
    const cells = area({
      height: 8, levels: [50], plotStyle: "line", series: field(8, 32, 1.0),
    }).join("");
    expect(cells).toContain("┼");
    expect(cells).not.toContain("╳");
  });

  it("CN3 (C12 I49): a ridge field has no saddle at any level, which is why the fixture is separable", () => {
    // **The fixture is shown to respond before it is asserted against.** The
    // catalogue's `matrix` is `sin(r + c)` — a ridge — and no cell of it can have
    // two opposite corners above a level with the other two below.
    const sample = fieldSampler(ridge(8, 32));
    let saddles = 0;
    for (let y = 0; y < 8; y += 1) { // cells-ok — a row count
      for (let x = 0; x < 54; x += 1) { // cells-ok — a column count
        const at = (i: number, j: number): number | null => sample((i / 54) * 31, (j / 8) * 7);
        for (const lv of [20, 40, 50, 60, 80]) {
          if (marchingMask(at(x, y), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1), lv) === 15) saddles += 1;
        }
      }
    }
    expect(saddles).toBe(0);
  });

  it("CN4 (C12 I49): a field with no variation draws no contour, and is not a full grid", () => {
    const flat = Array.from({ length: 4 }, (_v, r) => ({ // cells-ok — a row count
      values: Array.from({ length: 16 }, () => 50), label: `row${String(r)}` })); // cells-ok
    const drawn = area({ height: 4, series: flat }).join("").replace(/[\s⠀]/gu, "");
    expect(drawn).toBe("");
  });

  it("CN5 (C12 I49): levels not declared come from niceAxis, interior only", () => {
    const levels = contourLevels({ form: "contour" } as never, { min: 0, max: 100 });
    expect(levels).toEqual([20, 40, 60, 80]);
    // The ends are excluded because they cross nothing: a level at the minimum
    // says *no contour* where the caller asked for one.
    expect(levels).not.toContain(0);
    expect(levels).not.toContain(100);
  });

  it("CN6 (C12 I49): adjacent cells join — no cell claims an edge its neighbour does not", () => {
    // **Over the whole area**, because the property is *by construction* and one
    // junction would test the derivation against itself.
    const sample = fieldSampler(field(6, 24));
    const [W, H] = [40, 6];
    const at = (i: number, j: number): number | null => sample((i / W) * 23, (j / H) * 5);
    const RIGHT = 8;
    const LEFT = 4;
    let checked = 0;
    for (const lv of [20, 40, 60, 80]) {
      for (let y = 0; y < H; y += 1) {
        for (let x = 0; x + 1 < W; x += 1) {
          const a = marchingMask(at(x, y), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1), lv);
          const c = marchingMask(at(x + 1, y), at(x + 2, y), at(x + 2, y + 1), at(x + 1, y + 1), lv);
          expect((a & RIGHT) !== 0).toBe((c & LEFT) !== 0);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(900);
  });

  it("CN7 (C12 I49): a level is named in the legend and nowhere in the plot area", () => {
    const lines = bare({ levels: [25, 75] });
    expect(lines.at(-1)).toContain("25 75");
    expect(area({ levels: [25, 75] }).join("")).not.toContain("25");
  });

  it("CN7b (C12 I49): a level outside the range is named, and drawn nowhere", () => {
    // Dropping it makes an empty area indistinguishable from a constant field.
    expect(bare({ levels: [500] }).at(-1)).toContain("500");
    expect(area({ levels: [500] }).join("").replace(/[\s⠀]/gu, "")).toBe("");
  });

  it("CN8 (C12 I49): two levels crossing one cell union their masks and emit a tee", () => {
    // A tee needs three edges, and a single level crosses two or four — so this
    // glyph can only come from the union.
    const cells = area({ plotStyle: "line", levels: [40, 45, 50, 55, 60], series: field(6, 24, 1.3) }).join("");
    expect(/[┤├┴┬]/u.test(cells)).toBe(true);
  });
});

/** The mask bits, named here so CN1 does not restate the source's numbers. */
function glyphMaskOf(...edges: readonly ("top" | "right" | "bottom" | "left")[]): number {
  const bit = { top: 1, bottom: 2, left: 4, right: 8 } as const;
  return edges.reduce((m, e) => m | bit[e], 0);
}

describe("LY — what is layered over a field (C12 I51)", () => {
  it("LY1 (C12 I51): layers draw in declared order, last on top", () => {
    // Through the merge, so the row covers the reversal at the seam rather than
    // the array the caller declared.
    expect(glyphLayerOrder({ form: "contour", layers: ["field", "contour", "quiver"] }))
      .toEqual(["quiver", "contour"]);
    expect(glyphLayerOrder({ form: "contour", layers: ["quiver", "contour"] }))
      .toEqual(["contour", "quiver"]);
  });

  it("LY2 (C12 I51): `field`'s position is inert and its membership is not", () => {
    const withField = bare({ layers: ["field", "contour"] });
    const reversed = bare({ layers: ["contour", "field"] });
    const without = bare({ layers: ["contour"] });
    expect(reversed).toEqual(withField);
    // **The second half is what makes the first an assertion.** Byte-identical
    // for two orderings is a tautology if membership changes nothing either.
    expect(without).not.toEqual(withField);
  });

  it("LY4 (C12 I51): an empty layers array renders the field alone", () => {
    expect(area({ layers: [] }).join("").replace(/[\s⠀]/gu, "")).toBe("");
  });

  it("LY5 (C12 I51): below colourDepth 8 the field is a ramp glyph and yields to the contour", () => {
    // Asserted at 4-bit, where the interaction exists. Every frame above the
    // floor is silent about it, because there the field is a background.
    const four = area({}, 60, { ...FULL_CAPS, colourDepth: 4 as const });
    const braille = four.join("").split("").filter((c) => c >= "⠁" && c <= "⣿").length; // cells-ok
    expect(braille).toBeGreaterThan(0);
    // The ramp is not drawn *through* the contour: no cell carries both.
    const ramp = new Set([..."░▒▓█▁▂▃▄▅▆▇"]);
    const contended = four.join("").split("").filter((c) => ramp.has(c) && c >= "⠁");
    expect(contended).toEqual([]);
  });

  it("LY6 (C12 I51): fieldDim `floor` clears 4.5:1 on every sample of three maps", () => {
    // **Run against the shipped dimming**, not the constants — the per-map
    // figures are the claim, and a test naming 0.5 would agree with a constant.
    for (const name of ["viridis", "inferno", "coolwarm"] as const) {
      const map = COLORMAPS[name]!;
      const f = dimFactorFor(map);
      for (const c of map.data) {
        const hex = `#${[c[0], c[1], c[2]].map((v) => Math.round(v * f).toString(16).padStart(2, "0")).join("")}`;
        expect(ratio("#ffffff", hex)).toBeGreaterThanOrEqual(DEFAULT_FLOOR);
      }
    }
    // And it is not one factor for all maps: inferno is the brightest and needs
    // the most. A constant that clears three maps is a constant that fails a fourth.
    expect(dimFactorFor(COLORMAPS.inferno!)).toBeLessThan(dimFactorFor(COLORMAPS.viridis!));
  });

  it("LY7 (C12 I51): glyphInk `contrast` picks its ink per cell from the background", () => {
    const styled = rows({ glyphInk: "contrast" }).join("");
    // Both inks appear, which is what *per cell* means — one of them everywhere
    // is a constant that satisfies "picks a contrasting colour" exactly.
    expect(styled).toContain("255;255;255");
    expect(styled).toContain("38;2;0;0;0");
    // And the price: the glyph no longer wears a series slot.
    const own = rows({ glyphInk: "own" }).join("");
    expect(own).not.toEqual(styled);
  });

  it("LY8 (C12 I51): fieldDim `floor` is inert below colourDepth 8", () => {
    const four = { ...FULL_CAPS, colourDepth: 4 as const };
    expect(bare({ fieldDim: "floor" }, 60, four)).toEqual(bare({ fieldDim: "none" }, 60, four));
    // …and is not inert above it, or the row above passes on a field nothing dims.
    expect(rows({ fieldDim: "floor" })).not.toEqual(rows({ fieldDim: "none" }));
  });
});

describe("the gates (C04 I61)", () => {
  const doc = (extra: object): readonly string[] => {
    const r = validateDocument({
      version: 1,
      blocks: [{ kind: "plot", id: "g", form: "line", height: 4, axes: true, series: [{ values: [1, 2] }], ...extra }],
    });
    // **Only this rule's errors**, on YC7's own note: the envelope is minimal so
    // the document also fails its schema row, and a converse asserted on *no
    // errors at all* would pass or fail for reasons that are not the gate's.
    return r.ok ? [] : r.error.filter((m) => /I61|I60|layers|fieldDim|glyphInk|levels|ordinate|vectors/u.test(m));
  };

  it("refuses the field members off the family, at the document gate", () => {
    expect(doc({ layers: ["field"] }).join()).toContain("C04 I61");
    expect(doc({ fieldDim: "floor" }).join()).toContain("C04 I61");
    expect(doc({ glyphInk: "contrast" }).join()).toContain("C04 I61");
    expect(doc({ levels: [1] }).join()).toContain("C04 I61");
    // …and accepts each on the form that has them.
    expect(doc({ form: "contour", layers: ["field", "contour"], fieldDim: "floor", glyphInk: "contrast", levels: [1] })).toEqual([]);
  });

  it("refuses a layer named twice, and a layer with no data", () => {
    expect(doc({ form: "contour", layers: ["contour", "contour"] }).join()).toContain("drawn once");
    expect(doc({ form: "contour", layers: ["quiver"] }).join()).toContain("no \"vectors\"");
  });

  it("refuses `yAxis: false` on a contour — the family, not the one form", () => {
    // The narrow check `form === \"heatmap\"` had been widened once already in
    // `checkHeatmap` and written again here; `contour` fell through it.
    expect(doc({ form: "contour", yAxis: false }).join()).toContain("C04 I60");
  });

  it("refuses the same four at the builder", () => {
    expect(() => b.plot({ form: "line", height: 4, series: [{ values: [1] }], layers: ["field"] } as never)).toThrow(/C04 I61/u);
    expect(() => b.plot({ form: "line", height: 4, series: [{ values: [1] }], levels: [1] } as never)).toThrow(/C04 I61/u);
    expect(() => b.plot({ form: "contour", height: 4, series: [{ values: [1] }], layers: ["contour", "contour"] } as never)).toThrow(/drawn once/u);
    expect(() => b.plot({ form: "contour", height: 4, series: [{ values: [1] }], yAxis: false } as never)).toThrow(/C04 I60/u);
  });
});
