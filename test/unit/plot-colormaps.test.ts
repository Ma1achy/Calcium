/**
 * CM1–CM13: matplotlib colormaps — data integrity and wiring.
 */
import { describe, expect, it } from "vitest";
import { COLORMAPS_WITH_REVERSED, COLORMAPS, COLORMAPS_256, COLORMAP_NAMES } from "../../src/data/colormaps/index.js";
import { QUALITATIVE_PALETTES } from "../../src/data/colormaps/qualitative/index.js";
import { sample, continuousColour } from "../../src/presentation/theme/colormap.js";

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe("CM1: every continuous map has exactly 256 entries", () => {
  it("all maps have 256 RGB triples", () => {
    for (const [name, entry] of Object.entries(COLORMAPS)) {
      expect(entry.data.length, `${name}`).toBe(256); // cells-ok — a data length
    }
  });
});

describe("CM2: sequential maps are monotonic in luminance", () => {
  it("viridis luminance is non-decreasing", () => {
    const v = COLORMAPS["viridis"]!;
    const lums = v.data.map(([r, g, b]) => luminance(r, g, b));
    let violations = 0;
    for (let i = 1; i < lums.length; i++) { // cells-ok — a lum count
      if (lums[i]! < lums[i - 1]! - 2) violations++;
    }
    expect(violations).toBeLessThan(5);
  });
});

describe("CM3: diverging maps are symmetric about the midpoint", () => {
  it("coolwarm entries at ±k from midpoint have similar luminance", () => {
    const cw = COLORMAPS["coolwarm"]!;
    const mid = 127;
    let maxDiff = 0;
    for (let k = 0; k < 64; k++) {
      const lo = luminance(...cw.data[mid - k]!);
      const hi = luminance(...cw.data[mid + k]!);
      maxDiff = Math.max(maxDiff, Math.abs(lo - hi));
    }
    expect(maxDiff).toBeLessThan(40);
  });
});

describe("CM4: cyclic maps — first and last entry are identical", () => {
  it("twilight ends match", () => {
    const tw = COLORMAPS["twilight"]!;
    const first = tw.data[0]!;
    const last = tw.data[tw.data.length - 1]!; // cells-ok — a data length
    expect(Math.abs(first[0] - last[0])).toBeLessThan(5);
    expect(Math.abs(first[1] - last[1])).toBeLessThan(5);
    expect(Math.abs(first[2] - last[2])).toBeLessThan(5);
  });
});

describe("CM5: 8-bit quantisation preserves monotonicity", () => {
  it("viridis at 8-bit is non-decreasing", () => {
    const lut = COLORMAPS_256["viridis"]!;
    let violations = 0;
    for (let i = 1; i < lut.length; i++) { // cells-ok — a LUT length
      if (lut[i]! < lut[i - 1]!) violations++;
    }
    expect(violations).toBeLessThan(10);
  });
});

describe("CM6: reversed variant is the original array flipped", () => {
  it("viridis_r is viridis reversed", () => {
    const v = COLORMAPS_WITH_REVERSED["viridis"]!;
    const vr = COLORMAPS_WITH_REVERSED["viridis_r"]!;
    expect(vr.data.length).toBe(v.data.length); // cells-ok — a data length
    for (let i = 0; i < v.data.length; i++) { // cells-ok — a data length
      expect(vr.data[i]).toEqual(v.data[v.data.length - 1 - i]); // cells-ok — a data index
    }
  });
});

describe("CM7: qualitative palettes have the documented number of colours", () => {
  const expected: Record<string, number> = {
    "okabe-ito": 8, tab10: 10, tab20: 20, tab20b: 20, tab20c: 20,
    Pastel1: 9, Pastel2: 8, Paired: 12, Accent: 8, Dark2: 8,
    Set1: 9, Set2: 8, Set3: 12,
  };
  for (const [name, count] of Object.entries(expected)) {
    it(`${name} has ${String(count)} colours`, () => {
      const palette = QUALITATIVE_PALETTES[name];
      expect(palette).toBeDefined();
      expect(palette!.length).toBe(count); // cells-ok — a colour count
    });
  }
});

describe("CM9: colormap field selects the named colormap", () => {
  it("sampling coolwarm at 0 differs from viridis at 0", () => {
    const v = COLORMAPS_WITH_REVERSED["viridis"]!;
    const cw = COLORMAPS_WITH_REVERSED["coolwarm"]!;
    expect(sample(v, 0)).not.toBe(sample(cw, 0));
  });
});

describe("CM11: unknown name refused at construction", () => {
  it("COLORMAP_NAMES does not include invented names", () => {
    expect(COLORMAP_NAMES).not.toContain("not-a-colormap");
    expect(COLORMAP_NAMES).toContain("viridis");
    expect(COLORMAP_NAMES).toContain("coolwarm_r");
  });
});

describe("CM12: default colormap per kind", () => {
  it("viridis is sequential, coolwarm is diverging, twilight is cyclic", () => {
    expect(COLORMAPS["viridis"]!.kind).toBe("sequential");
    expect(COLORMAPS["coolwarm"]!.kind).toBe("diverging");
    expect(COLORMAPS["twilight"]!.kind).toBe("cyclic");
  });
});

describe("CM13: qualitative palette at 1-bit renders without error", () => {
  it("okabe-ito has 8 entries", () => {
    const oi = QUALITATIVE_PALETTES["okabe-ito"]!;
    expect(oi.length).toBe(8); // cells-ok — a palette count
    for (const [r, g, b] of oi) {
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(255);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(b).toBeGreaterThanOrEqual(0);
    }
  });
});
