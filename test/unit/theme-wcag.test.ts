// `tools/theme/wcag.mjs` — the WCAG arithmetic the theme tools compose inks by.
//
// **A shared module, and the one whose wrong answer every composed ink would
// inherit.** The generator pays a derived palette's residue with `clearFloor`,
// and the one-shot compositions landed `hcLight`'s and `nord`'s inks with it —
// so a luminance off by a channel weight would have written wrong values into
// the registry and read as *measured*. `make instruments` found it with no
// fixture. These rows hold it to values WCAG publishes and to `contrast.ts`,
// which its header says it matches and nothing compared.
import { describe, expect, it } from "vitest";

import { luminance, ratio } from "../../src/presentation/theme/contrast.js";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — a `.mjs` instrument with no declarations, like its siblings.
import { chan, clearFloor, contrast, lum } from "../../tools/theme/wcag.mjs";

const channel = chan as (hex: string, i: number) => number;
const L = lum as (hex: string) => number;
const C = contrast as (a: string, b: string) => number;
const clear = clearFloor as (ink: string, ground: string, floor: number) => string | null;

/** One step of 1/255 per channel, the walk `clearFloor` takes, reversed. */
const back = (hex: string, towardsLight: boolean): string =>
  `#${[0, 1, 2]
    .map((i) => Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) + (towardsLight ? -1 : 1))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;

describe("tools/theme/wcag.mjs — luminance, contrast and the least move that clears", () => {
  it("WC1: a channel is its byte over 255, and luminance runs from 0 at black to 1 at white", () => {
    expect(channel("#80ff00", 0)).toBe(128 / 255);
    expect(channel("#80ff00", 1)).toBe(1);
    expect(channel("#80ff00", 2)).toBe(0);
    expect(L("#000000")).toBe(0);
    expect(L("#ffffff")).toBe(1);
    // The channel weights are WCAG's, and green outweighs red outweighs blue —
    // a transposed weight passes both endpoints above and fails here.
    expect(L("#00ff00")).toBeCloseTo(0.7152, 12);
    expect(L("#ff0000")).toBeCloseTo(0.2126, 12);
    expect(L("#0000ff")).toBeCloseTo(0.0722, 12);
  });

  it("WC2: white on black is 21 : 1 either way round, and #767676 is the grey that clears AA on white where #777777 does not", () => {
    expect(C("#ffffff", "#000000")).toBe(21);
    expect(C("#000000", "#ffffff")).toBe(21);
    // The published boundary: 4.54 and 4.48 against 4.5.
    expect(C("#767676", "#ffffff")).toBeCloseTo(4.542, 3);
    expect(C("#777777", "#ffffff")).toBeCloseTo(4.478, 3);
  });

  it("WC3: the same arithmetic `contrast.ts` uses — equal on every pair of a 6-level cube", () => {
    // The header's claim, which makes this a second copy of one answer — so the
    // two are compared rather than trusted. 216 colours, every pair.
    const levels = ["00", "33", "66", "99", "cc", "ff"];
    const cube = levels.flatMap((r) => levels.flatMap((g) => levels.map((b) => `#${r}${g}${b}`)));
    expect(cube).toHaveLength(216);
    for (const a of cube) {
      expect(L(a), a).toBeCloseTo(luminance(a), 12);
      for (const b of cube) expect(C(a, b), `${a} on ${b}`).toBeCloseTo(ratio(a, b), 12);
    }
  });

  it("WC4: an ink that already clears is returned unchanged — the same string", () => {
    expect(clear("#767676", "#ffffff", 4.5)).toBe("#767676");
    expect(clear("#000000", "#ffffff", 21)).toBe("#000000");
  });

  it("WC5: the least move that clears — away from the ground, and one step short does not", () => {
    // Darker on a light ground: #777777 is one step from the boundary.
    expect(clear("#777777", "#ffffff", 4.5)).toBe("#767676");
    // Lighter on a dark ground, several steps.
    const up = clear("#767676", "#000000", 5);
    expect(up).toBe("#7c7c7c");
    expect(C(up as string, "#000000")).toBeGreaterThanOrEqual(5);
    expect(C(back(up as string, true), "#000000"), "one step back does not clear").toBeLessThan(5);
  });

  it("WC6: a floor that cannot be met is null, not the nearest miss — at white and at black", () => {
    // White on #767676 is 4.54, so 7 : 1 is out of reach upwards; black on it
    // is 4.62 — the walk goes the way the ink already leans and stops there.
    expect(C("#ffffff", "#767676")).toBeLessThan(7);
    expect(clear("#ffffff", "#767676", 7)).toBeNull();
    expect(clear("#000000", "#767676", 7)).toBeNull();
  });
});
