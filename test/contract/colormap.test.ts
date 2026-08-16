// C10 I31 — continuous colour, and the three rulings it rests on.
//
// Each row here is a *measurement* that was taken before the ruling, restated as
// an assertion. That is deliberate: the plan asked for a fourth palette family
// with a 4-bit map, and all three of those turned out to be answerable with a
// number rather than a preference.
import { describe, expect, it } from "vitest";

import { COLORMAPS, continuousColour, sample } from "../../src/presentation/theme/colormap.js";
import { COLORMAP_NAMES, block, validateBlock } from "../../src/data/viewmodel/index.js";
import { DEFAULT_FLOOR, ratio, textSurfaces } from "../../src/presentation/theme/contrast.js";
import { defaultTheme } from "../../src/presentation/theme/index.js";
import { FULL_CAPS, MONO_CAPS, measurable } from "../support/render.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";

const at = (t: number): string => sample(COLORMAPS.viridis, t);

describe("C10 I31 — a colormap is data, a channel, and vacuous below 8-bit", () => {
  it("T2.31 (C10 I31): the tables and the schema's names agree, both directions", () => {
    // A name in the schema with no table paints nothing and validates clean,
    // which is F172's shape. `Record<ColormapName, …>` makes the other direction
    // a compile error; this is the one a type cannot state.
    expect(Object.keys(COLORMAPS).sort()).toEqual([...COLORMAP_NAMES].sort());
  });

  it("T2.31 (C10 I31): `meaning` is unsatisfiable for a map, which is why it is decoration", () => {
    // **The measurement the ruling rests on.** A sequential map's content is a
    // luminance ordering from near the ground to far from it; the contrast floor
    // deletes the near half. Asserted as *the floor fails* rather than *the map
    // is decoration*, because the second is the conclusion and the first is the
    // reason.
    const dark = defaultTheme["dark"];
    expect(dark).toBeDefined();
    const bgs = textSurfaces(dark!);
    const stops = COLORMAPS.viridis.stops;
    const clearing = stops.filter((hex) => bgs.every(([, bg]) => ratio(hex, bg) >= DEFAULT_FLOOR));

    expect(clearing.length, "some of the map clears the floor").toBeGreaterThan(0);
    expect(clearing.length, "and some of it cannot").toBeLessThan(stops.length);
    // And the half that fails is the low half — which is the half the map exists
    // to encode, so raising it would not be a darker viridis, it would be none.
    expect(clearing).not.toContain(stops[0]);
  });

  it("T2.31 (C10 I31): below 8-bit a map says nothing, so one bit is unchanged", () => {
    for (const depth of [1, 4] as const) {
      expect(
        continuousColour(COLORMAPS.viridis, 0.5, { colourDepth: depth }),
        `depth ${String(depth)} has no ordering to encode`,
      ).toBeUndefined();
    }
    expect(continuousColour(COLORMAPS.viridis, 0.5, { colourDepth: 8 })?.kind).toBe("ansi256");
    expect(continuousColour(COLORMAPS.viridis, 0.5, { colourDepth: 24 })?.kind).toBe("rgb");
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
      lines.join("\n").replace(/\[[0-9;]*m/gu, "");

    // **The carrier is unchanged at every depth, which is the whole claim.**
    // Asserted as an equality between the coloured and uncoloured glyph streams:
    // if colour ever *replaced* a density step rather than joining it, this is
    // the row that fails, and no count of SGR sequences would.
    for (const caps of [FULL_CAPS, { ...FULL_CAPS, colourDepth: 8 as const }, MONO_CAPS]) {
      const kit = measurable({ definitions: [plotDefinition as never], capabilities: caps });
      expect(
        glyphsOf(kit.renderToLines(heat("viridis"), 40)),
        `depth ${String(caps.colourDepth)}: density is what the glyph says, coloured or not`,
      ).toBe(glyphsOf(kit.renderToLines(heat(), 40)));
    }

    // And the colour is genuinely there above the floor, or the row above passes
    // against a renderer that ignores the member.
    const sgr = (depth: 1 | 4 | 8 | 24): number =>
      (measurable({ definitions: [plotDefinition as never], capabilities: { ...FULL_CAPS, colourDepth: depth } })
        .renderToLines(heat("viridis"), 40)
        .join("")
        .match(/\[[0-9;]*m/gu)?.length ?? 0);

    expect(sgr(24), "24-bit paints per cell").toBeGreaterThan(sgr(4));
    expect(sgr(8), "8-bit quantises and coalesces").toBeGreaterThan(sgr(4));
    expect(sgr(4), "4-bit is the gutter alone").toBe(sgr(1));
  });

  it("T2.31 (C10 I31): the colour window is the glyph window, on the same anchor", () => {
    // **Found as a mutation survivor.** Left-anchoring the colours failed
    // nothing, because every fixture had exactly as many readings as cells and
    // the two slices agree there. A matrix with *more history than width* is the
    // state that separates them — and it is the ordinary one, since a ring is
    // longer than a terminal.
    //
    // Deriving the window twice is how colour and glyph come to describe
    // different ticks: the frame is a well-formed viridis heatmap either way.
    const values = Array.from({ length: 60 }, (_, i) => i);
    const heat = block({
      kind: "plot", id: "h", form: "heatmap", height: 1, yMin: 0, yMax: 59,
      colormap: "viridis", series: [{ values, label: "r" }],
    } as never);

    const line = measurable({ definitions: [plotDefinition as never], capabilities: FULL_CAPS })
      .renderToLines(heat, 30)
      .join("");

    // The newest reading is 59, which is the top of the range and the top of the
    // map. Its colour must be on the *last* cell, beside the densest glyph.
    // **After the gutter**, or the label's own tone is the first "cell" — which
    // is what the first version measured, and it compared the gutter's grey with
    // itself.
    const area = line.slice(line.lastIndexOf("\u2502"));
    const cells = [...area.matchAll(/38;2;(\d+);(\d+);(\d+)m(.)/gu)]
      .map((m) => ({ rgb: [Number(m[1]), Number(m[2]), Number(m[3])] as const, glyph: m[4] ?? "" }))
      .filter((c) => c.glyph.trim() !== "");
    expect(cells.length, "the matrix is painted").toBeGreaterThan(4);

    const last = cells[cells.length - 1];
    const first = cells[0];
    expect(last).toBeDefined();
    expect(first).toBeDefined();
    // Viridis runs dark-blue → yellow, so the newest cell is the yellow end.
    expect(last!.rgb[0], "the newest reading is the top of the map").toBeGreaterThan(first!.rgb[0]);
    expect(last!.rgb[2], "and not its blue end").toBeLessThan(first!.rgb[2]);
  });

  it("T2.31 (C10 I31): an unknown name is refused, because paints-nothing is a valid frame", () => {
    const bad = block({
      kind: "plot", id: "h", form: "heatmap", height: 1, series: [{ values: [1], label: "a" }],
      colormap: "inferno",
    } as never);
    const v = validateBlock(bad);
    expect(v.ok).toBe(false);
    expect(v.ok ? "" : v.error.join(" ")).toContain("viridis");
  });

  it("T2.31 (C10 I31): sampling is monotone, clamped, and total", () => {
    expect(at(-5)).toBe(COLORMAPS.viridis.stops[0]);
    expect(at(5)).toBe(COLORMAPS.viridis.stops[COLORMAPS.viridis.stops.length - 1]);
    expect(at(Number.NaN)).toBe(COLORMAPS.viridis.stops[0]);

    // **A cyclic map is clamped too, and that is a ruling.** Its ends meeting is
    // a statement about the colours, not permission to fold an out-of-range
    // value back into the scale — the caller's range decides where the wrap is.
    expect(sample(COLORMAPS.twilight, 1.25)).toBe(sample(COLORMAPS.twilight, 1));

    // Every sampled stop is reachable exactly, or the interpolation has moved
    // the table it claims to be.
    COLORMAPS.viridis.stops.forEach((hex, i) => {
      expect(at(i / (COLORMAPS.viridis.stops.length - 1))).toBe(hex);
    });
  });

  it("T2.31 (C10 I31): the interpolation is below the 8-bit floor it is seen through", () => {
    // **The honesty measurement.** These are viridis at ninths, not matplotlib's
    // 256 triples, so the values between anchors are a near viridis. That is only
    // acceptable if it is smaller than what the terminal does to it anyway: at
    // 8-bit every colour goes through the 256-cube, and two colours landing on
    // one cube entry are the same colour to a reader.
    const depth8 = { colourDepth: 8 } as const;
    let sameEntry = 0;
    const steps = 64;
    for (let i = 0; i < steps; i += 1) {
      const t = i / (steps - 1);
      const nudged = Math.min(1, t + 0.5 / (COLORMAPS.viridis.stops.length - 1) / 4);
      const a = continuousColour(COLORMAPS.viridis, t, depth8);
      const b = continuousColour(COLORMAPS.viridis, nudged, depth8);
      if (a?.kind === "ansi256" && b?.kind === "ansi256" && a.index === b.index) sameEntry += 1;
    }
    // A quarter-of-a-stop nudge — comfortably wider than any interpolation error
    // against the true table — lands on the same cube entry most of the time.
    expect(sameEntry / steps, "the cube is coarser than the approximation").toBeGreaterThan(0.5);
  });
});
