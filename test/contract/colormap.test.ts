// C10 I31 — continuous colour, and the three rulings it rests on.
import { describe, expect, it } from "vitest";

import { COLORMAPS, continuousColour, sample } from "../../src/presentation/theme/colormap.js";
import { COLORMAP_NAMES, block, validateBlock } from "../../src/data/viewmodel/index.js";
import { DEFAULT_FLOOR, ratio, textSurfaces } from "../../src/presentation/theme/contrast.js";
import { defaultTheme } from "../../src/presentation/theme/index.js";
import { FULL_CAPS, MONO_CAPS, measurable } from "../support/render.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";

function rgbHex(c: readonly [number, number, number]): string {
  return `#${c[0].toString(16).padStart(2, "0")}${c[1].toString(16).padStart(2, "0")}${c[2].toString(16).padStart(2, "0")}`;
}

const viridis = COLORMAPS["viridis"]!;
const twilight = COLORMAPS["twilight"]!;
const at = (t: number): string => sample(viridis, t);

describe("C10 I31 — a colormap is data, a channel, and vacuous below 8-bit", () => {
  it("T2.31 (C10 I31): the tables and the schema's names agree, both directions", () => {
    expect(Object.keys(COLORMAPS).sort()).toEqual([...COLORMAP_NAMES].sort());
  });

  it("T2.31 (C10 I31): `meaning` is unsatisfiable for a map, which is why it is decoration", () => {
    const dark = defaultTheme["dark"];
    expect(dark).toBeDefined();
    const bgs = textSurfaces(dark!);
    const hexStops = viridis.data.filter((_, i) => i % 28 === 0).map(rgbHex); // cells-ok — a stride
    const clearing = hexStops.filter((hex) => bgs.every(([, bg]) => ratio(hex, bg) >= DEFAULT_FLOOR));

    expect(clearing.length, "some of the map clears the floor").toBeGreaterThan(0); // cells-ok — a colour count
    expect(clearing.length, "and some of it cannot").toBeLessThan(hexStops.length); // cells-ok — a colour count
    expect(clearing).not.toContain(rgbHex(viridis.data[0]!));
  });

  it("T2.31 (C10 I31): below 8-bit a map says nothing, so one bit is unchanged", () => {
    for (const depth of [1, 4] as const) {
      expect(
        continuousColour(viridis, 0.5, { colourDepth: depth }),
        `depth ${String(depth)} has no ordering to encode`,
      ).toBeUndefined();
    }
    expect(continuousColour(viridis, 0.5, { colourDepth: 8 })?.kind).toBe("ansi256");
    expect(continuousColour(viridis, 0.5, { colourDepth: 24 })?.kind).toBe("rgb");
  });

  it("T2.31 (C10 I31): the heatmap gains colour above 8-bit and loses none of its density", () => {
    const rows = ["api", "worker"].map((label, r) => ({
      label,
      values: Array.from({ length: 16 }, (_, i) => (i * 7 + r * 30) % 100),
    }));
    const heat = (colormap?: string): ReturnType<typeof block> =>
      block({
        kind: "plot", id: "h", form: "heatmap", height: 2, yMin: 0, yMax: 100,
        series: rows, ...(colormap === undefined ? {} : { colormap }),
      } as never);

    const glyphsOf = (lines: readonly string[]): string =>
      lines.join("\n").replace(/\x1b\[[0-9;]*m/gu, "");

    for (const caps of [FULL_CAPS, { ...FULL_CAPS, colourDepth: 8 as const }, MONO_CAPS]) {
      const kit = measurable({ definitions: [plotDefinition as never], capabilities: caps });
      expect(
        glyphsOf(kit.renderToLines(heat("viridis"), 40)),
        `depth ${String(caps.colourDepth)}: density is what the glyph says, coloured or not`,
      ).toBe(glyphsOf(kit.renderToLines(heat(), 40)));
    }

    const sgr = (depth: 1 | 4 | 8 | 24): number =>
      (measurable({ definitions: [plotDefinition as never], capabilities: { ...FULL_CAPS, colourDepth: depth } })
        .renderToLines(heat("viridis"), 40)
        .join("")
        .match(/\[[0-9;]*m/gu)?.length ?? 0);

    expect(sgr(24), "24-bit paints per cell").toBeGreaterThan(sgr(4));
    expect(sgr(8), "8-bit quantises and coalesces").toBeGreaterThan(sgr(4));
    expect(sgr(4), "4-bit is the gutter alone").toBe(sgr(1));
  });

  it("T2.31 (C10 I31): the colour window is the glyph window, on the same anchor", () => {
    const values = Array.from({ length: 60 }, (_, i) => i);
    const heat = block({
      kind: "plot", id: "h", form: "heatmap", height: 1, yMin: 0, yMax: 59,
      colormap: "viridis", series: [{ values, label: "r" }],
    } as never);

    const line = measurable({ definitions: [plotDefinition as never], capabilities: FULL_CAPS })
      .renderToLines(heat, 30)
      .join("");

    const area = line.slice(line.lastIndexOf("│"));
    const cells = [...area.matchAll(/38;2;(\d+);(\d+);(\d+)m(.)/gu)]
      .map((m) => ({ rgb: [Number(m[1]), Number(m[2]), Number(m[3])] as const, glyph: m[4] ?? "" }))
      .filter((c) => c.glyph.trim() !== "");
    expect(cells.length, "the matrix is painted").toBeGreaterThan(4); // cells-ok — a cell count

    const last = cells[cells.length - 1]; // cells-ok — a cell count
    const first = cells[0];
    expect(last).toBeDefined();
    expect(first).toBeDefined();
    expect(last!.rgb[0], "the newest reading is the top of the map").toBeGreaterThan(first!.rgb[0]);
    expect(last!.rgb[2], "and not its blue end").toBeLessThan(first!.rgb[2]);
  });

  it("T2.31 (C10 I31): an unknown name is refused, because paints-nothing is a valid frame", () => {
    const bad = block({
      kind: "plot", id: "h", form: "heatmap", height: 1, series: [{ values: [1], label: "a" }],
      colormap: "not-a-real-colormap",
    } as never);
    const v = validateBlock(bad);
    expect(v.ok).toBe(false);
  });

  it("T2.31 (C10 I31): sampling is monotone, clamped, and total", () => {
    expect(at(-5)).toBe(rgbHex(viridis.data[0]!));
    expect(at(5)).toBe(rgbHex(viridis.data[viridis.data.length - 1]!)); // cells-ok — a data length
    expect(at(Number.NaN)).toBe(rgbHex(viridis.data[0]!));

    expect(sample(twilight, 1.25)).toBe(sample(twilight, 1));

    // Every data entry is reachable exactly
    for (let i = 0; i < viridis.data.length; i++) { // cells-ok — a data length
      const t = i / (viridis.data.length - 1); // cells-ok — a data length
      expect(at(t)).toBe(rgbHex(viridis.data[i]!));
    }
  });

  it("T2.31 (C10 I31): 256-entry tables have exact data, not interpolated approximations", () => {
    expect(viridis.data.length).toBe(256); // cells-ok — a data length
    expect(viridis.data[0]).toEqual([68, 1, 84]);
    expect(viridis.data[255]).toEqual([253, 231, 37]); // cells-ok — a data index
  });
});
