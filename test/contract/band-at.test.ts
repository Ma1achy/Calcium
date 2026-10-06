// C10 I66 — whether a surface is a band is asked at a depth, and the
// resolver's answer is the answer.
//
// **The oracle is what the resolver paints**: a ground from `resolveBackground`,
// and every tone drawn on that ground resolving to one `Style`. `bandAt` reads
// the tokens; the row holds the two to agreement over every shipped theme,
// every surface and every depth. The blind spot is I66's own — a defect in the
// shared predicate moves both sides — and T1.51's literal values catch that.
import { describe, expect, it } from "vitest";

import { TONES } from "../../src/data/viewmodel/index.js";
import { bandAt, defaultTheme, loadTheme, resolveBackground, resolveTone, themeNames } from "../../src/presentation/theme/index.js";
import { validateBands } from "../../src/presentation/theme/contrast.js";
import { REGISTRY_THEMES } from "../../src/presentation/theme/tokens.generated.js";
import type { ResolvedTheme, ThemeTokens } from "../../src/presentation/theme/types.js";

const DEPTHS = [1, 4, 8, 24] as const;

/** What the resolver paints on `surface`: a ground, and one ink for every tone. */
function painted(theme: ResolvedTheme, surface: string, depth: (typeof DEPTHS)[number]): boolean {
  const caps = { colourDepth: depth };
  if (resolveBackground(`surface.${surface}`, theme, caps).background === undefined) return false;
  return new Set(TONES.map((t) => JSON.stringify(resolveTone(t, theme, caps, surface)))).size === 1;
}

const hcDark = (): ResolvedTheme => {
  const loaded = loadTheme(defaultTheme, "hcDark");
  if (!loaded.ok) throw new Error("hcDark must load");
  return loaded.value.current;
};

describe("C10 I66 — bandAt is the resolver's answer", () => {
  it("T2.72 (C10 I66, I45, I61, I8): over every shipped theme, surface and depth, bandAt is true exactly where the resolver paints a band", () => {
    const disagree: string[] = [];
    const bands: string[] = [];
    let cells = 0;
    for (const name of themeNames(defaultTheme)) {
      const loaded = loadTheme(defaultTheme, name);
      if (!loaded.ok) throw new Error(`${name} must load`);
      const theme = loaded.value.current;
      for (const surface of Object.keys(theme.tokens.surfaces)) {
        for (const depth of DEPTHS) {
          cells += 1;
          const want = painted(theme, surface, depth);
          if (want) bands.push(`${name} ${surface} ${String(depth)}`);
          if (bandAt(theme, surface, { colourDepth: depth }) !== want) disagree.push(`${name} ${surface} at ${String(depth)}: resolver ${String(want)}`);
        }
      }
    }
    expect(disagree, "bandAt against what is painted").toEqual([]);
    // **The oracle is not vacuous**: it finds both bands of both high-contrast
    // themes at 4, 8 and 24 bits and nothing else — so a resolver that painted
    // no band anywhere, or every surface as one, fails here too.
    // `high-contrast` is the alias that opens `hcDark` (I63), measured as a name of its own.
    const hc = ["hcDark", "hcLight", "high-contrast"].flatMap((t) =>
      ["focusGround", "selection"].flatMap((s) => [4, 8, 24].map((d) => `${t} ${s} ${String(d)}`)),
    );
    expect(bands.sort(), "the painted bands").toEqual(hc.sort());
    expect(cells, "every name × every surface × four depths").toBe(themeNames(defaultTheme).length * Object.keys(hcDark().tokens.surfaces).length * 4);
  });

  it("T2.72 (C10 I66, I61): a band with no 4-bit pair, and an orphan pair, are no band at 4 bits — to the resolver and to bandAt alike", () => {
    const hc = hcDark();
    // **Each fabricated theme has its own name**: `resolve` memoises on
    // `theme.name`, so a copy keeping hcDark's reads hcDark's answers and the
    // cell measures nothing.
    const { bandFourBit: _pairs, ...noPairs } = hc.tokens;
    const pairless: ResolvedTheme = { ...hc, name: "t2.72-pairless", tokens: noPairs as ThemeTokens };
    const { selection: _selection, ...focusOnly } = hc.tokens.bandInk ?? {};
    const orphan: ResolvedTheme = { ...hc, name: "t2.72-orphan", tokens: { ...hc.tokens, bandInk: focusOnly } };

    const cell = (t: ResolvedTheme, surface: string, depth: (typeof DEPTHS)[number]) => ({
      painted: painted(t, surface, depth),
      bandAt: bandAt(t, surface, { colourDepth: depth }),
    });
    for (const surface of ["focusGround", "selection"]) {
      expect(cell(pairless, surface, 4), `pair-less ${surface} at 4 bits`).toEqual({ painted: false, bandAt: false });
      expect(cell(pairless, surface, 24), `pair-less ${surface} at 24 bits keeps its band`).toEqual({ painted: true, bandAt: true });
    }
    expect(cell(orphan, "selection", 4), "the orphan pair at 4 bits").toEqual({ painted: false, bandAt: false });
    expect(cell(orphan, "selection", 24), "the orphan's surface at 24 bits").toEqual({ painted: false, bandAt: false });
    expect(cell(orphan, "focusGround", 4), "the band beside it still paints").toEqual({ painted: true, bandAt: true });
    // The control: hcDark itself, where the pair is read at 4 bits.
    expect(cell(hc, "selection", 4), "hcDark's selection at 4 bits").toEqual({ painted: true, bandAt: true });
  });

  it("T2.73 (C10 I61, I66, question 55): validateBands refuses a pair-less band behind a page that is not a hex, and an orphan pair with or without other bands", () => {
    const tokens = (REGISTRY_THEMES as Readonly<Record<string, ThemeTokens>>)["hcDark"];
    if (tokens === undefined) throw new Error("no hcDark tokens");
    const paths = (t: ThemeTokens): readonly string[] => validateBands(t).map((e) => e.path).filter((p) => p.startsWith("bandFourBit"));

    // The page inherits — not a hex — and the selection band has no pair.
    const { selection: _pair, ...focusPair } = tokens.bandFourBit ?? {};
    const inheriting: ThemeTokens = { ...tokens, surfaces: { ...tokens.surfaces, bg: "inherit" }, bandFourBit: focusPair };
    expect(paths(inheriting), "a pair-less band on an inheriting page").toEqual(["bandFourBit.selection"]);

    // An orphan pair beside real bands, and on a theme with no bands at all.
    const probe = { ground: 0, ink: 15 };
    expect(paths({ ...tokens, bandFourBit: { ...tokens.bandFourBit, probe } }), "an orphan beside bands").toEqual(["bandFourBit.probe"]);
    const { bandInk: _bands, ...unbanded } = tokens;
    expect(paths({ ...unbanded, bandFourBit: { probe } } as ThemeTokens), "an orphan on a theme with no bandInk").toEqual(["bandFourBit.probe"]);

    // Clean: both shipped high-contrast themes.
    for (const id of ["hcDark", "hcLight"]) {
      const t = (REGISTRY_THEMES as Readonly<Record<string, ThemeTokens>>)[id];
      if (t === undefined) throw new Error(`no ${id}`);
      expect(validateBands(t), `${id} is clean`).toEqual([]);
    }
  });
});
