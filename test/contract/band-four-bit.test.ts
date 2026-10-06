// C10 I61 — at 4-bit a band keeps its promise: one curated ANSI16 ground and
// one ink, and every slot drawn on the band takes that ink.
import { describe, expect, it } from "vitest";

import { TONES } from "../../src/data/viewmodel/index.js";
import { resolveBackground, resolveTone } from "../../src/presentation/theme/index.js";
import { bandFourBitShortfalls, validateBands } from "../../src/presentation/theme/contrast.js";
import { REGISTRY_THEMES } from "../../src/presentation/theme/tokens.generated.js";
import type { ResolvedTheme, ThemeTokens } from "../../src/presentation/theme/types.js";
import { FULL_CAPS } from "../support/render.js";

const FOUR = { ...FULL_CAPS, colourDepth: 4 } as typeof FULL_CAPS;
const BANDS = ["focusGround", "selection"] as const;
const tokensOf = (id: string): ThemeTokens => {
  const t = (REGISTRY_THEMES as Readonly<Record<string, ThemeTokens>>)[id];
  if (t === undefined) throw new Error(`no theme ${id}`);
  return t;
};
const themeOf = (id: string): ResolvedTheme => ({ name: id, variant: "dark", tokens: tokensOf(id) }) as ResolvedTheme;
const index = (c: unknown): number | undefined =>
  typeof c === "object" && c !== null && (c as { kind?: string }).kind === "ansi16" ? (c as { index: number }).index : undefined;

describe("C10 I61 — bands at 4-bit", () => {
  it("T1.51 (C10 I61): the real resolver at 4-bit answers each HC band's curated ground and one ink for every tone", () => {
    for (const id of ["hcDark", "hcLight"]) {
      const theme = themeOf(id);
      for (const band of BANDS) {
        const pair = tokensOf(id).bandFourBit?.[band];
        expect(pair, `${id} curates ${band}`).toBeDefined();
        expect(index(resolveBackground(`surface.${band}`, theme, FOUR).background), `${id} ${band} ground`).toBe(pair?.ground);
        const inks = new Set(TONES.map((t) => index(resolveTone(t, theme, FOUR, band).colour)));
        // Over every tone a block can name, one index — the band's.
        expect([...inks], `${id} ${band}: one ink for ${String(TONES.length)} tones`).toEqual([pair?.ink]);
      }
    }
    // The control: `dark` has no band, so its tones keep their own indices on
    // the focus ground — the resolver is not flattening every ground at 4-bit.
    const dark = themeOf("dark");
    const darkInks = new Set(TONES.map((t) => index(resolveTone(t, dark, FOUR, "focusGround").colour)));
    expect(darkInks.size, "dark: tones stay apart where there is no band").toBeGreaterThan(1);
  });

  it("T2.63 (C10 I61): validateBands refuses a band with no 4-bit pair and a pair whose ground is its ink", () => {
    for (const id of ["hcDark", "hcLight"]) {
      expect(validateBands(tokensOf(id)).filter((e) => e.path.startsWith("bandFourBit")), `${id} is clean`).toEqual([]);
    }
    const hc = tokensOf("hcDark");
    const { selection: _dropped, ...onlyFocus } = hc.bandFourBit ?? {};
    const missing = validateBands({ ...hc, bandFourBit: onlyFocus });
    expect(missing.map((e) => e.path), "the missing pair, named").toContain("bandFourBit.selection");
    const same = validateBands({ ...hc, bandFourBit: { ...hc.bandFourBit, focusGround: { ground: 12, ink: 12 } } });
    expect(same.find((e) => e.path === "bandFourBit.focusGround")?.message, "ground is ink").toMatch(/both index 12/u);
  });

  it("T2.64 (C10 I61, C10 I45): the 4-bit pairs meet the four band constraints on the reference palette save exactly hcLight focus against the page", () => {
    const found = ["hcDark", "hcLight"].flatMap((id) =>
      bandFourBitShortfalls(tokensOf(id)).map((s) => `${id} ${s.path} ${s.measured.toFixed(2)}<${String(s.need)}`),
    );
    // **By equality**: a second shortfall fails, and so does a fix that leaves
    // this one listed. No hcLight pair meets all four (C10 I61's search).
    expect(found).toEqual(["hcLight focusGround.page 1.82<2"]);
  });
});
