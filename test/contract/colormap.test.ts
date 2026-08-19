// C10 I31 — continuous colour, and the three rulings it rests on.
import { describe, expect, it } from "vitest";

import { COLORMAPS, continuousColour, sample } from "../../src/presentation/theme/colormap.js";
import { COLORMAP_NAMES, block, validateBlock } from "../../src/data/viewmodel/index.js";
import { DEFAULT_FLOOR, ratio, textSurfaces } from "../../src/presentation/theme/contrast.js";
import { defaultTheme } from "../../src/presentation/theme/index.js";
import { FULL_CAPS, MONO_CAPS, MONO_UNICODE_CAPS, measurable } from "../support/render.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { RAMP_DENSITY } from "../../src/presentation/plot/ramp.js";

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

    // **Either edge**: a labelled row carries the tick and not the plain border
    // (C12 §3f), and every matrix row is labelled — so a search for `│` alone
    // found nothing and the window silently became the last character.
    const area = line.slice(Math.max(line.lastIndexOf("│"), line.lastIndexOf("┤")));
    // **The background channel, since C12 I29.** A matrix cell is a painted blank
    // and the colour is the reading; this used to read `38;2;…m` followed by a
    // ramp glyph, and the glyph became a space. What the row claims — that the
    // colour window tracks the data window on the same anchor — is unchanged,
    // and reading `48` is reading it where it now lives.
    //
    // The old filter dropped blank cells to skip the absent ones. It is gone
    // because it is no longer needed and would now drop *everything*: an absent
    // cell emits no background at all, so every match is a present reading.
    const cells = [...area.matchAll(/48;2;(\d+);(\d+);(\d+)m/gu)]
      .map((m) => ({ rgb: [Number(m[1]), Number(m[2]), Number(m[3])] as const }));
    expect(cells.length, "the matrix is painted").toBeGreaterThan(4); // cells-ok — a cell count

    const last = cells[cells.length - 1]; // cells-ok — a cell count
    const first = cells[0];
    expect(last).toBeDefined();
    expect(first).toBeDefined();
    expect(last!.rgb[0], "the newest reading is the top of the map").toBeGreaterThan(first!.rgb[0]);
    expect(last!.rgb[2], "and not its blue end").toBeLessThan(first!.rgb[2]);
  });

  it("T2.31 (C10 I31): below the floor the ramp carries it, and nothing is painted", () => {
    // **C10 I31's observable half, and it was not asserted anywhere in this
    // file.** The rule is that a continuous map below 8-bit is an ordering over
    // sixteen indices whose luminances the terminal never reports, so
    // `continuousColour` declines — and what makes that safe rather than blank
    // is C12 I29's ladder handing the cell back to the density ramp.
    //
    // Found by mutation: blanking the cell unconditionally survived this suite
    // entirely. The row that caught it lives in `plot.test.ts`, outside this
    // run's command, so the pass reported a survivor for a defect that *is*
    // caught — which is a finding about where the assertion lives, not about
    // whether it exists. It belongs here, because it is this component's claim.
    const values = Array.from({ length: 60 }, (_, i) => i);
    const heat = block({
      kind: "plot", id: "h", form: "heatmap", height: 1, yMin: 0, yMax: 59,
      colormap: "viridis", series: [{ values, label: "r" }],
    } as never);

    // **The matrix rows only.** Written against the whole frame this passed
    // under the mutation it was written for: below the floor the *legend* is the
    // density swatch, so a search over the joined frame finds ramp glyphs in the
    // furniture whether or not a single cell drew one. `height: 1`, so the
    // matrix is the first row and the last two are the x-labels and the legend.
    const rowsOf = (caps: typeof FULL_CAPS): readonly string[] =>
      measurable({ definitions: [plotDefinition as never], capabilities: caps }).renderToLines(heat, 30);
    const cellsIn = (rows: readonly string[]): string => rows.slice(0, -2).join("");

    const mono = cellsIn(rowsOf(MONO_UNICODE_CAPS));
    expect(mono, "nothing is painted below the floor").not.toMatch(/48;2;/u);
    expect([...RAMP_DENSITY].some((g) => mono.includes(g)), "and the ramp is what carries it").toBe(true);

    // The fixture responds: the same block at 24-bit paints, and the cells stop
    // carrying a ramp glyph at all.
    const full = cellsIn(rowsOf(FULL_CAPS));
    expect(full, "the same fixture paints above the floor").toMatch(/48;2;/u);
    expect([...RAMP_DENSITY].some((g) => full.includes(g)), "and its cells are blank").toBe(false);
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
