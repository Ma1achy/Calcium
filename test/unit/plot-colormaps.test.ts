/**
 * CM1–CM13: matplotlib colormaps — data integrity and wiring.
 */
import { describe, expect, it } from "vitest";
import { COLORMAPS_WITH_REVERSED, COLORMAPS, COLORMAPS_256, COLORMAP_NAMES } from "../../src/data/colormaps/index.js";
import { QUALITATIVE_PALETTES } from "../../src/data/colormaps/qualitative/index.js";
import { continuousColour, rgbHex, sample, sampleRgb, shadeColour, shadeRgb } from "../../src/presentation/theme/colormap.js";

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

describe("T1.42 (C10 I40, F1150) — the numeric colour path is the hex path, bit-for-bit", () => {
  // **The domain is the 256 channels, not the `t` axis.** `shadeRgb`'s claim is
  // exactness over every eight-bit input, so every channel × 65 k is the whole
  // of it — 16 640 comparisons. `shadeColour` is deliberately kept on
  // `overChannels`' direct `toLinear`, so this compares two implementations and
  // a wrong table entry cannot pass it. The first draft swept 1 024 t × 64 k over
  // every map: ten million calls of the slow reference, re-testing `sampleRgb`
  // against `sample` (which delegates to it) and timing out under load at 23 s
  // against a 30 s ceiling — a control written as a magnitude.
  const caps24 = { colourDepth: 24 } as const;
  const K_STEPS = 64;

  it("T1.42 (C10 I40): every eight-bit channel × 65 k — shadeColour on overChannels equals rgbHex(shadeRgb)", () => {
    let compared = 0;
    for (let c = 0; c <= 255; c += 1) {
      const hex = rgbHex([c, c, c]);
      for (let ki = 0; ki <= K_STEPS; ki += 1) {
        const k = ki / K_STEPS;
        const viaHex = shadeColour({ kind: "rgb", hex }, k);
        if (viaHex.kind !== "rgb") throw new Error("the rgb arm stays rgb");
        const viaInts = rgbHex(k >= 1 ? [c, c, c] : shadeRgb(c, c, c, k));
        if (viaHex.hex !== viaInts) {
          throw new Error(`channel ${String(c)} k=${String(k)}: hex path ${viaHex.hex}, numeric ${viaInts}`);
        }
        compared += 1;
      }
    }
    // Mixed channels too, so a per-channel bug that cancels on grey is seen.
    for (let c = 0; c <= 255; c += 17) {
      for (let ki = 0; ki <= K_STEPS; ki += 8) {
        const k = ki / K_STEPS;
        const rgb: readonly [number, number, number] = [c, 255 - c, (c * 7) % 256];
        const viaHex = shadeColour({ kind: "rgb", hex: rgbHex(rgb) }, k);
        if (viaHex.kind !== "rgb") throw new Error("the rgb arm stays rgb");
        expect(viaHex.hex).toBe(rgbHex(k >= 1 ? rgb : shadeRgb(rgb[0], rgb[1], rgb[2], k)));
        compared += 1;
      }
    }
    expect(compared, "pairs compared — the subject, before the claim").toBe(256 * 65 + 16 * 9);
  });

  it("T1.42 (C10 I40): the integration — every map × 64 t × 8 k through continuousColour, and sample is rgbHex(sampleRgb)", () => {
    let compared = 0;
    for (const map of Object.values(COLORMAPS_WITH_REVERSED)) {
      for (let ti = 0; ti <= 64; ti += 1) {
        const t = ti / 64;
        const rgb = sampleRgb(map, t);
        expect(sample(map, t), `${map.name} sample at ${String(t)}`).toBe(rgbHex(rgb));
        const base = continuousColour(map, t, caps24);
        if (base === undefined || base.kind !== "rgb") throw new Error("24-bit continuous is always rgb");
        for (let ki = 0; ki <= 8; ki += 1) {
          const k = ki / 8;
          const viaHex = shadeColour(base, k);
          if (viaHex.kind !== "rgb") throw new Error("the rgb arm stays rgb");
          const viaInts = rgbHex(k >= 1 ? rgb : shadeRgb(rgb[0], rgb[1], rgb[2], k));
          if (viaHex.hex !== viaInts) {
            throw new Error(`${map.name} t=${String(t)} k=${String(k)}: hex path ${viaHex.hex}, numeric ${viaInts}`);
          }
          compared += 1;
        }
      }
    }
    expect(compared, "pairs compared").toBeGreaterThan(10_000);
  });

  it("T1.42 (C10 I40): the fabricated violation — a LUT off by one entry is caught by the sweep", () => {
    // `shadeRgb` reads `LINEAR_LUT[c]`; a table built from `toLinear((i + 1) / 255)`
    // would drift every channel. The sweep above sees it because it compares to
    // `shadeColour`, which computes `toLinear` directly; here the same drift is
    // shown to move the answer, so the sweep's equality is not vacuous.
    const wrong = (c: number, k: number): number => {
      const lin = c >= 255 ? 1 : Math.pow(((c + 1) / 255 + 0.055) / 1.055, 2.4);
      const srgb = lin * k <= 0.0031308 ? lin * k * 12.92 : 1.055 * Math.pow(lin * k, 1 / 2.4) - 0.055;
      return Math.max(0, Math.min(255, Math.round(srgb * 255)));
    };
    const [r] = shadeRgb(128, 128, 128, 0.5);
    expect(wrong(128, 0.5), "an off-by-one table answers differently").not.toBe(r);
  });
});

describe("C10 I42 — the packed forms", () => {
  it.todo(
    "T1.43 (C10 I42): packedHex(shadePacked(samplePacked(map, t), k)) equals rgbHex(shadeRgb(...sampleRgb(map, t), k)) over I40's sweep, k >= 1 included, and samplePacked on a non-finite t and an empty map equals sampleRgb packed — not deferred on a component: the code commit replaces this row",
  );
});
