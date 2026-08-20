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
  arrowFor, arrowsFor, contourLevels, dimColour, dimFactorFor, fieldSampler, glyphLayerOrder,
  magnitudeSeries, marchingMask, saddleJoinsTopLeft,
} from "../../src/presentation/plot/field.js";
import { glyphForMask } from "../../src/presentation/plot/linedraw.js";
import { COLORMAPS, ansi256Hex, continuousColour, nearestAnsi256 } from "../../src/presentation/theme/colormap.js";
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

  it("CN9 (C12 I49): a gap makes a cell uncrossable, and draws no rim", () => {
    // **The survivor's row.** CN4 uses a constant field, which has no levels at
    // all, so a mutation treating an absent corner as *below the level* changed
    // nothing there and survived a run of eleven.
    //
    // A hole in a uniformly-high region is what separates the two readings: with
    // absence read as zero, the rim between the hole and its neighbours crosses
    // every level and a contour ring appears around nothing.
    const holed = Array.from({ length: 6 }, (_v, r) => ({ // cells-ok — a row count
      values: Array.from({ length: 24 }, (_w, c) => // cells-ok — a column count
        (r >= 2 && r <= 3 && c >= 18 && c <= 20 ? null : c < 12 ? (c / 11) * 100 : 100)),
      label: `row${String(r)}`,
    }));
    // **Both arms**, because they guard it in different places: `contourDotRows`
    // re-checks for a null after taking the mask, so `marchingMask`'s own guard
    // is redundant there and load-bearing on the cell arm, which does not. A row
    // written against the default alone survived the mutation that removes it.
    for (const style of [undefined, "line"] as const) {
      const extra = { series: holed, ...(style === undefined ? {} : { plotStyle: style }) };
      const cells = area(extra);
      // The ramp is the left half and carries the contour…
      const left = cells.map((l) => l.slice(0, 26)).join("").replace(/[\s\u2800]/gu, "");
      expect(left, `${String(style)}: the fixture responds`).not.toBe("");
      // …and the flat region with the hole in it carries none.
      const right = cells.map((l) => l.slice(30)).join("").replace(/[\s\u2800]/gu, "");
      expect(right, `${String(style)}: no rim around the hole`).toBe("");
    }
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

  it("LY5 (C12 I51): below colourDepth 8 the field yields to a contour entirely", () => {
    // **The first version of this row was vacuous.** It asserted *no cell
    // carries both the ramp and the contour* against a ramp character set of
    // `░▒▓█▁▂▃▄▅▆▇` — and the density ramp below the floor is **braille**, so the
    // set it filtered on was empty and the claim held over nothing. The 1-bit
    // frame was an even wash of speckle the whole time.
    //
    // What the ruling actually says is testable directly: below the floor a
    // contour over a field is the *same frame* as a contour over no field.
    const four = { ...FULL_CAPS, colourDepth: 4 as const };
    expect(bare({}, 60, four)).toEqual(bare({ layers: ["contour"] }, 60, four));
    // …and above it they differ, or the row above is satisfied by a field that
    // never paints at any depth.
    expect(rows({})).not.toEqual(rows({ layers: ["contour"] }));
    // A quiver is not drawn in the ramp's alphabet, so it keeps its field.
    const sparseQ = { layers: ["field", "quiver"] as const };
    expect(qbare(sparseQ, 60, four)).not.toEqual(qbare({ layers: ["quiver"] }, 60, four));
  });

  it("LY6b (C12 I51, §3y): and it clears at 8-bit too, where the factor differs", () => {
    // **The 24-bit factor does not carry**: quantising after the dim can lift a
    // sample back over the floor, so viridis at 0.50 leaves one of twenty-one
    // at 3.71 against a floor of 4.5 and needs 0.45. Measured against the
    // colour the reader is shown rather than the one that was sampled.
    for (const name of ["viridis", "coolwarm", "inferno"] as const) {
      const map = COLORMAPS[name]!;
      const f = dimFactorFor(map, true);
      for (let i = 0; i <= 20; i += 1) { // cells-ok — a sample count
        const c = dimColour(continuousColour(map, i / 20, { colourDepth: 8 })!, f);
        const hex = c.kind === "rgb" ? c.hex : ansi256Hex(c.index)!;
        expect(ratio(hex, "#ffffff")).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(dimFactorFor(COLORMAPS.viridis!, true)).toBeCloseTo(0.45, 5);
    expect(dimFactorFor(COLORMAPS.viridis!, false)).toBeCloseTo(0.5, 5);
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

  it("LY8b (C12 I51, §3y): and it is not inert *at* 8, which is what the doc says", () => {
    // **The row above says *below* and asserted only 4 and 24.** `dimColour`
    // opened with `if (colour.kind !== "rgb") return colour` and
    // `continuousColour` returns `ansi256` at 8, so the dim was applied,
    // returned its argument, and said nothing — on every terminal between the
    // colour floor and true colour. LY8 passed throughout.
    // `rows` and not `bare`: a dim is a colour change and `bare` strips SGR,
    // so the stripped frames are identical by construction — the same shape
    // LY5's first version had, asserted against a set it had emptied.
    const eight = { ...FULL_CAPS, colourDepth: 8 as const };
    expect(rows({ fieldDim: "floor" }, 60, eight)).not.toEqual(rows({ fieldDim: "none" }, 60, eight));
    expect(bare({ fieldDim: "floor" }, 60, eight)).toEqual(bare({ fieldDim: "none" }, 60, eight));
  });

  it("LY8c (§3y): dimming an indexed colour lands on a darker index, and 0–15 are left alone", () => {
    const dimmed = dimColour({ kind: "ansi256", index: 231 }, 0.5); // 231 is #ffffff
    expect(dimmed.kind).toBe("ansi256");
    expect((dimmed as { index: number }).index).not.toBe(231);
    // 255 * 0.5 = 128, and the nearest cube level to 128 is 135 rather than 175.
    expect(ansi256Hex((dimmed as { index: number }).index)).toBe("#878787");
    // The sixteen system colours are the reader's own palette and have no value
    // we can read, so there is nothing to scale.
    expect(dimColour({ kind: "ansi256", index: 4 }, 0.5)).toEqual({ kind: "ansi256", index: 4 });
    expect(ansi256Hex(4)).toBe(null);
    // **The cube compresses rather than dims, and that is why the factor has to
    // be measured against the quantised colour.** Halved and requantised, four
    // of the six levels land on the same one:
    const halved = (L: number): string | null => {
      const h = `#${Math.round(L * 0.5).toString(16).padStart(2, "0").repeat(3)}`;
      return ansi256Hex(nearestAnsi256(h));
    };
    expect([0, 95, 135, 175, 215, 255].map(halved)).toEqual([
      "#000000", "#5f5f5f", "#5f5f5f", "#5f5f5f", "#5f5f5f", "#878787",
    ]);
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

/** A row of vectors, `[u, v]` with `v` north-positive. */
const vec = (values: readonly (readonly [number, number] | null)[], label: string) => ({ values, label });

function qrows(extra: object, w = 60, caps = FULL_CAPS): readonly string[] {
  return kit(caps).renderToLines(block({
    kind: "plot", id: "qv", form: "quiver", height: 3, axes: true, series: [],
    vectors: [
      vec([[1, 0], [1, 1], [0, 1], [-1, 1]], "a"),
      vec([[-1, 0], [-1, -1], [0, -1], [1, -1]], "b"),
      vec([[2, 0], [0, 0], [4, 0], null], "c"),
    ],
    ...extra,
  }), w);
}
const qbare = (extra: object, w = 60, caps = FULL_CAPS): string[] => qrows(extra, w, caps).map(plain);
const qarea = (extra: object, w = 60, caps = FULL_CAPS): string[] =>
  qbare(extra, w, caps).slice(0, 3).map((l) => l.replace(/^[^┤+]*[┤+]/u, ""));

describe("QV — the quiver (C12 I50)", () => {
  it("QV1 (C12 I50): eight directions map to eight glyphs", () => {
    const arrows = arrowsFor(FULL_CAPS);
    const dirs: readonly (readonly [number, number])[] = [
      [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
    ];
    const got = dirs.map(([u, v]) => arrowFor(u, v, arrows));
    expect(got).toEqual([...arrows]);
    expect(new Set(got).size).toBe(8); // cells-ok — a direction count
  });

  it("QV2 (C12 I50): magnitude maps through the continuous palette, per cell", () => {
    // **Per cell** — one colour for the whole layer satisfies *the arrows are
    // coloured* exactly, and that is what shipped until the frame was read.
    //
    // **Asserted where the field carries something else**, which is where the
    // ruling puts magnitude in the arrow. Written against the default it was
    // asserting the double encoding QV9 forbids, and it passed.
    const styled = qrows({
      series: [
        { values: [1, 2, 3, 4], label: "a" },
        { values: [4, 3, 2, 1], label: "b" },
        { values: [2, 2, 3, 3], label: "c" },
      ],
    }).join("");
    const inks = new Set([...styled.matchAll(/38;2;(\d+;\d+;\d+)m\u001b\[48;2;/gu)].map((m) => m[1]));
    expect(inks.size, "the arrows carry magnitude when the field does not").toBeGreaterThan(1); // cells-ok — a colour count
  });

  it("QV3 (C12 I50): a zero-magnitude cell draws no arrow, and the field beneath still reads", () => {
    const cells = qarea({});
    // Row `c` is [2,0] · [0,0] · [4,0] · null — the still cell is blank…
    expect(cells[2]).toMatch(/[→>]\s+[→>]/u);
    // …and it is *not* an eastward arrow, which is what atan2(0, 0) would give.
    const eastRun = /^[→]+$/u.test(cells[2] ?? "");
    expect(eastRun).toBe(false);
  });

  it("QV4 (C12 I50, C12 I9): the ASCII arm renders all eight directions", () => {
    const arrows = arrowsFor({ ...FULL_CAPS, unicode: "ascii" as const });
    expect(arrows.join("")).toBe(">/^\\</v\\");
    // Six distinct marks for eight directions: the diagonals reuse, and that is
    // a stated loss rather than an invented glyph nobody reads as a direction.
    expect(new Set(arrows).size).toBe(6); // cells-ok — a mark count
  });

  it("QV5 (C12 I50): at colourDepth 4 AND 1, direction survives and magnitude does not", () => {
    // Asserted at **both**, because the claim was written about one depth and
    // holds at two: `continuousColour` returns undefined below CONTINUOUS_FLOOR.
    for (const depth of [4, 1] as const) {
      const caps = { ...FULL_CAPS, colourDepth: depth };
      const cells = qarea({}, 60, caps).join("");
      expect(/[→↗↑↖←↙↓↘]/u.test(cells)).toBe(true);
      const colours = new Set([...qrows({}, 60, caps).join("").matchAll(/38;2;(\d+;\d+;\d+)/gu)]);
      expect(colours.size, `depth ${String(depth)}: no rgb magnitude`).toBe(0); // cells-ok — a colour count
    }
  });

  it("QV6 (C12 I50, C02 I9): ambiguousWidth `wide` takes the ASCII arm on a unicode terminal", () => {
    // **The conjunct that is easy to drop.** Every arrow in U+2190–21FF is
    // `East_Asian_Width=Ambiguous`, so a wide terminal draws the field at double
    // width — `art.ts:eligible()`'s third consumer, and the only one that leaves
    // no visible seam.
    const wide = { ...FULL_CAPS, unicode: "full" as const, ambiguousWidth: "wide" as const };
    expect(arrowsFor(wide).join("")).toBe(">/^\\</v\\");
    expect(/[→↗↑↖←↙↓↘]/u.test(qarea({}, 60, wide).join(""))).toBe(false);
  });

  it("QV7 (C12 I50): a null vector is a gap and draws nothing", () => {
    const arrows = arrowsFor(FULL_CAPS);
    expect(arrowFor(0, 0, arrows)).toBeNull();
    expect(arrowFor(Number.NaN, 1, arrows)).toBeNull();
    // A gap and a still cell are both blank; what tells them apart is the field
    // beneath, which has a reading for one and none for the other.
    const mag = magnitudeSeries([vec([[0, 0], null], "z")]);
    expect(mag[0]?.values).toEqual([0, null]);
  });

  it("QV8 (C12 I50): the field beneath a quiver is the vectors' magnitude when no scalar is named", () => {
    // The legend's bounds are the magnitudes', not 0–1 or the arrows' components.
    expect(qbare({}).at(-1)).toMatch(/\b4\b/u);
  });

  it("QV9 (C12 I50): an arrow is never drawn in its own cell's background colour", () => {
    // **The defect only the frame could show.** Where the caller names no
    // scalar the field *is* the magnitude, so colouring the arrow by magnitude
    // too painted it in exactly its own background — `38;2;33;145;141` on
    // `48;2;33;145;141`, an invisible arrow at full colour depth. Every other
    // assertion passed: the field painted, the arrows were there, and QV2 saw
    // more than two distinct colours.
    //
    // One datum, one channel. Asserted on the SGR because both readings produce
    // the same stripped frame.
    for (const spec of [{}, { layers: ["field", "quiver"] as const }]) {
      for (const row of qrows(spec)) {
        for (const m of row.matchAll(/38;2;(\d+;\d+;\d+)m\u001b\[48;2;(\d+;\d+;\d+)m/gu)) {
          expect(m[1], "arrow drawn in its own background").not.toBe(m[2]);
        }
      }
    }
  });

  it("the gates: vectors off quiver, and a quiver with none", () => {
    const r = validateDocument({
      version: 1,
      blocks: [{ kind: "plot", id: "g", form: "line", height: 4, series: [{ values: [1] }], vectors: [] }],
    });
    expect(r.ok ? [] : r.error.filter((m) => /vectors/u.test(m))).not.toEqual([]);
    expect(() => b.plot({ form: "quiver", height: 3, series: [] } as never)).toThrow(/vectors/u);
  });
});
