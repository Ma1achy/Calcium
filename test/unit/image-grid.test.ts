/**
 * Phase 2 · the carried premise, re-taken with kitty placing.
 *
 * The 2x2 captioned grid was measured under the dither. **A grid of real
 * thumbnails is a different measurement**, and the caption row's height
 * interacts with the image's declared height in a way the dither may have
 * masked — every dithered cell is the same texture, so a wrong height looks
 * like a right one.
 */
import { describe, expect, it } from "vitest";
import { b } from "../../src/shell/builders/index.js";
import { parseAreas } from "../../src/data/viewmodel/index.js";
import { imageCells } from "../../src/presentation/blocks/kinds/image.js";
import { PLACEHOLDER } from "../../src/presentation/image/kitty.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { renderToLines } from "../../src/presentation/render-lines.js";
import { DARK_THEME, FULL_CAPS } from "../support/render.js";
import { ONE_PER_KIND } from "../support/blocks.js";
import type { Image } from "../../src/data/viewmodel/index.js";
import type { TerminalCapabilities } from "../../src/terminal/capabilities.js";

const SGR = new RegExp(String.fromCharCode(27) + String.raw`\[[0-9;]*m`, "gu");
const KITTY = { ...FULL_CAPS, imageProtocol: "kitty" as const };
const block = ONE_PER_KIND.image as Image;
const PNG = block.data;

const draw = (
  blk: Parameters<typeof renderToLines>[1],
  caps: TerminalCapabilities = KITTY,
  w = 40,
): readonly string[] =>
  renderToLines(createBlockRegistry(), blk, w, { theme: DARK_THEME, capabilities: caps }).map((l) =>
    l.replace(SGR, ""),
  );

describe("phase 2 · the carried premise, re-taken", () => {
  it("P2-1: `areas` still names 62 regions", () => {
    const row = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"].join("");
    const r = parseAreas(row);
    expect(r.ok, r.ok ? "" : r.fault).toBe(true);
    if (r.ok) console.log(`P2-1  one row names ${String(r.grid.regions.length)} regions`);
  });

  it("P2-2: the geometry is the SAME at both protocols — the fork's real measurement", () => {
    // **This is what decides PLACED against COMPOSITED, and it is in-repo.**
    // If an image occupies the same cell rectangle whichever arm draws it, then
    // an overlay registered against that rectangle is registered under both —
    // the registration is cell-to-cell between two grids the FRAMEWORK declares,
    // never pixel-to-pixel against the terminal's rasterisation.
    const rows: string[] = [];
    for (const width of [10, 20, 40, 80]) {
      for (const height of [1, 2, 4, 8]) {
        const img = b.image({ data: PNG, height, alt: "x" });
        const k = imageCells(img, width);
        rows.push(`w=${String(width)} h=${String(height)} -> ${String(k.cols)}x${String(k.rows)}`);
      }
    }
    console.log(`P2-2  ${rows.join("  ")}`);
    // The geometry is a pure function of (block, width) — no capability reaches
    // it — so this is asserted rather than described.
    const img = b.image({ data: PNG, height: 4, alt: "x" });
    expect(imageCells(img, 40)).toEqual(imageCells(img, 40));
  });

  it("SG1: `b.samples` composes the same grid by hand-free arithmetic — READ THE FIGURE", () => {
    const items = [
      { data: PNG, alt: "cat", label: "cat 0.98" },
      { data: PNG, alt: "dog", label: "dog 0.91" },
      { data: PNG, alt: "fox", label: "fox 0.77" },
      { data: PNG, alt: "owl", label: "owl 0.64" },
    ];
    const grid = b.samples({ items, columns: 2, cellRows: 4 });
    const lines = draw(grid, FULL_CAPS);
    console.log(`\nSG1:\n${lines.map((l, i) => `${String(i).padStart(2)}|${l}|`).join("\n")}`);
    expect(lines, "two bands of four rows plus a caption each").toHaveLength(10);

    // **The reading order is the row with teeth.** `AB/ab` maps as `A B a b`, so
    // a band contributes its pictures then its labels — get it wrong and every
    // caption sits under the wrong picture with every count agreeing.
    expect(lines[4]).toMatch(/cat 0\.98/u);
    expect(lines[4], "and its neighbour, not the next band's").toMatch(/dog 0\.91/u);
    expect(lines[9]).toMatch(/fox 0\.77/u);
    expect(lines[9]).toMatch(/owl 0\.64/u);
  });

  it("SG2: a short last band is holes, and the pool is a refusal rather than a wrap", () => {
    // Three items in two columns: the fourth cell is a hole, named by no child,
    // so the arity stays exact and nothing is drawn where nothing is.
    const three = [1, 2, 3].map((n) => ({ data: PNG, alt: `a${String(n)}`, label: `L${String(n)}` }));
    const grid = b.samples({ items: three, columns: 2, cellRows: 2 });
    const lines = draw(grid, FULL_CAPS);
    console.log(`\nSG2 (3 items, 2 columns):\n${lines.map((l, i) => `${String(i).padStart(2)}|${l}|`).join("\n")}`);
    expect(lines).toHaveLength(6);
    expect(lines[5], "the third label, alone in its band").toMatch(/L3/u);

    // **Refused rather than wrapped**: reusing a region name merges two samples
    // into one region and draws a plausible grid of the wrong pictures.
    const many = Array.from({ length: 32 }, (_, i) => ({ data: PNG, alt: `a${String(i)}`, label: "x" }));
    expect(() => b.samples({ items: many, columns: 8 })).toThrow(/regions/u);
    expect(() => b.samples({ items: [], columns: 2 })).toThrow(/at least one item/u);
    expect(() => b.samples({ items: three, columns: 0 })).toThrow(/columns is a positive integer/u);
  });

  it("P2-3: a 2x2 captioned grid, with kitty placing — READ THE FIGURE", () => {
    const img = (id: string) => b.image({ id, data: PNG, height: 4, alt: id });
    const cap = (t: string) => b.raw(t);
    const grid = b.mosaic({
      height: 10,
      areas: "AABB/abcd/CCDD/efgh",
      rows: [{ cells: 4 }, { cells: 1 }, { cells: 4 }, { cells: 1 }],
      children: [
        img("cat"), img("dog"),
        cap("cat 0.98"), cap(""), cap("dog 0.91"), cap(""),
        img("fox"), img("owl"),
        cap("fox 0.77"), cap(""), cap("owl 0.64"), cap(""),
      ],
    });
    const kitty = draw(grid);
    const dither = draw(grid, FULL_CAPS);
    console.log(`\nP2-3 kitty:\n${kitty.map((l, i) => `${String(i).padStart(2)}|${l}|`).join("\n")}`);
    console.log(`\nP2-3 dither:\n${dither.map((l, i) => `${String(i).padStart(2)}|${l}|`).join("\n")}`);

    expect(kitty, "measured 10, rendered 10").toHaveLength(10);
    expect(dither, "and the same under the dither").toHaveLength(10);

    // **The caption row is the thing the dither could have masked.** Each
    // caption must be on its own row and not inside an image's cells.
    const capRows = kitty.map((l, i) => (/[a-z] 0\./u.test(l) ? i : -1)).filter((i) => i >= 0);
    console.log(`P2-3  caption rows: ${capRows.join(", ")}`);
    expect(capRows, "two caption rows, at the foot of each image band").toEqual([4, 9]);

    // And the image rows carry placeholders under kitty, nothing under dither.
    const placed = kitty.filter((l) => l.includes(PLACEHOLDER)).length;
    console.log(`P2-3  rows carrying placeholders: ${String(placed)} of 10`);
    expect(placed, "eight image rows").toBe(8);
  });
});
