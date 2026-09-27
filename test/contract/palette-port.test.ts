// C10 I62 — every value a generated theme carries is read from the registry;
// no generated theme borrows from another theme's tokens.
//
// **A second reader of the registry, on purpose.** The generator reads
// `themeRules` with its own selector grammar; these rows read it with this
// file's, so a generator that misparses a rule and a test that agrees with it
// have to be wrong the same way twice.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { BAND_FOUR_BIT, FOUR_BIT } from "../../src/presentation/theme/four-bit.generated.js";
import { DARK_FOUR_BIT, HIGH_CONTRAST_FOUR_BIT, LIGHT_FOUR_BIT } from "../../src/presentation/theme/four-bit.js";
import { REGISTRY_THEMES } from "../../src/presentation/theme/tokens.generated.js";
import type { ThemeTokens } from "../../src/presentation/theme/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
interface Rule { selector: string; declarations: string }
interface ThemeRecord { id: string; status: string; fourBit: string; spectrum: string }
const registry = JSON.parse(readFileSync(resolve(root, "docs/design/language/calcium-registry.json"), "utf8")) as {
  themes: ThemeRecord[];
  themeRules: Rule[];
  terminalPalettes: {
    fourBit: Record<string, Record<string, number>>;
    bandFourBit: Record<string, Record<string, { ground: number; ink: number }>>;
    spectrum: Record<string, Record<string, string>>;
    classes: { tone: Record<string, string>; syntax: Record<string, string> };
    paletteDerivation: { syntax: Record<string, string>; categorical: Record<string, string> };
  };
};
const TP = registry.terminalPalettes;
const current = registry.themes.filter((t) => t.status === "current");
const tokensOf = (id: string): ThemeTokens => {
  const t = (REGISTRY_THEMES as Readonly<Record<string, ThemeTokens>>)[id];
  if (t === undefined) throw new Error(`no theme ${id}`);
  return t;
};
const norm = (hex: string): string => {
  const h = hex.toLowerCase();
  return h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
};
const colourOf = (rule: Rule): string => {
  const m = /(?:^|;)color:(#[0-9a-fA-F]{3,8})/.exec(rule.declarations);
  if (m === null) throw new Error(`${rule.selector} declares no color`);
  return norm(m[1]!);
};
const FAMILY = { syn: "syntax", cat: "categorical" } as const;

/** `family.slot` -> hex, from a theme's flat `.syn-*` and `.cat-*` rules. */
const flatOf = (id: string): Map<string, string> => {
  const out = new Map<string, string>();
  for (const rule of registry.themeRules) {
    const m = /^\[data-theme="([A-Za-z]+)"\] \.(syn|cat)-([A-Za-z0-9]+)$/.exec(rule.selector);
    if (m !== null && m[1] === id) out.set(`${FAMILY[m[2] as "syn" | "cat"]}.${m[3]!}`, colourOf(rule));
  }
  return out;
};
/** `surface.ground|family.slot` -> hex, from a theme's `.bg-* .syn-*` rules. */
const composedOf = (id: string): Map<string, string> => {
  const out = new Map<string, string>();
  for (const rule of registry.themeRules) {
    for (const member of rule.selector.split(",")) {
      const m = /^\[data-theme="([A-Za-z]+)"\] \.bg-([A-Za-z-]+) \.(syn|cat)-([A-Za-z0-9]+)$/.exec(member.trim());
      if (m !== null && m[1] === id) out.set(`surface.${m[2]!}|${FAMILY[m[3] as "syn" | "cat"]}.${m[4]!}`, colourOf(rule));
    }
  }
  return out;
};
const slotsOf = (t: ThemeTokens, family: string): Readonly<Record<string, string>> => {
  const p = t.palettes[family];
  if (p === undefined) throw new Error(`${t.name} has no ${family} palette`);
  return p.slots as Readonly<Record<string, string>>;
};

describe("C10 I62 — the palettes ported into the registry", () => {
  it("T1.52 (C10 I62): tokens.generated.ts imports no hand-written token set and defines no lend; every theme's fourBit is a generated named map, and hcDark's is the high-contrast one", () => {
    const src = readFileSync(resolve(root, "src/presentation/theme/tokens.generated.ts"), "utf8");
    const imports = [...src.matchAll(/^import .* from "([^"]+)";$/gmu)].map((m) => m[1]);
    expect(imports, "the generated file reads the generated maps and the types, nothing else").toEqual([
      "./four-bit.generated.js",
      "./types.js",
    ]);
    expect(src, "no lend() survives the port").not.toMatch(/\blend\b|\bclassesOf\b/u);

    const maps = Object.values(FOUR_BIT);
    for (const theme of current) {
      const fourBit = tokensOf(theme.id).fourBit;
      expect(maps.includes(fourBit as never), `${theme.id}'s fourBit is one of the generated maps, by identity`).toBe(true);
      expect(fourBit, `${theme.id} takes the map its registry record names (${theme.fourBit})`).toBe(
        (FOUR_BIT as Readonly<Record<string, unknown>>)[theme.fourBit],
      );
    }
    expect(tokensOf("hcDark").fourBit, "hcDark: the map curated for high contrast").toBe(FOUR_BIT.highContrast);
    expect(tokensOf("hcLight").fourBit, "hcLight: not that map — its ground is white").toBe(FOUR_BIT.light);
  });

  it("T2.65 (C10 I62): curated themes' syntax and categorical slots and compositions equal their registry rules; every other theme's slots equal the tone paletteDerivation names — both directions", () => {
    const curated = current.filter((t) => flatOf(t.id).size > 0).map((t) => t.id);
    expect([...curated].sort(), "the three themes measured before the registry existed curate their palettes").toEqual([
      "dark",
      "hcDark",
      "light",
    ]);

    for (const theme of current) {
      const tokens = tokensOf(theme.id);
      const flat = flatOf(theme.id);
      for (const [family, derivation] of [["syntax", TP.paletteDerivation.syntax], ["categorical", TP.paletteDerivation.categorical]] as const) {
        const slots = slotsOf(tokens, family);
        expect(Object.keys(slots).sort(), `${theme.id} ${family}: the derivation's slot set`).toEqual(Object.keys(derivation).sort());
        for (const [slot, tone] of Object.entries(derivation)) {
          const want = curated.includes(theme.id)
            ? flat.get(`${family}.${slot}`)
            : slotsOf(tokens, "tone")[tone];
          expect(want, `${theme.id} ${family}.${slot} has a source`).toBeDefined();
          expect(slots[slot], `${theme.id} ${family}.${slot}`).toBe(want);
        }
      }

      // Compositions, both directions, for a curated theme: every registry rule
      // reached the token set, and every syntax or categorical ink the token set
      // composes is a registry rule — so a lent composition cannot survive.
      if (!curated.includes(theme.id)) continue;
      const want = composedOf(theme.id);
      const have = new Map<string, string>();
      for (const [ground, inks] of Object.entries(tokens.composed ?? {})) {
        for (const [ref, hex] of Object.entries(inks)) {
          if (ref.startsWith("syntax.") || ref.startsWith("categorical.")) have.set(`${ground}|${ref}`, hex);
        }
      }
      expect(Object.fromEntries(have), `${theme.id}: composed syntax and categorical inks are the registry's`).toEqual(
        Object.fromEntries(want),
      );
    }
    // The count C10 I62 states, so a rule dropped from the registry and the token
    // set together still fails.
    const composed = current.map((t) => composedOf(t.id).size);
    expect(composed.reduce((a, b) => a + b, 0), "25 composed inks: dark 2, light 7, hcDark 16").toBe(25);
  });

  it("T2.66 (C10 I62): the 4-bit maps and band pairs equal terminalPalettes, four-bit.ts's names are the generated objects, and each theme's spectrum and classes equal the record it names", () => {
    expect(FOUR_BIT).toEqual(TP.fourBit);
    expect(BAND_FOUR_BIT).toEqual(TP.bandFourBit);
    expect(DARK_FOUR_BIT, "four-bit.ts names the generated object").toBe(FOUR_BIT.dark);
    expect(LIGHT_FOUR_BIT).toBe(FOUR_BIT.light);
    expect(HIGH_CONTRAST_FOUR_BIT).toBe(FOUR_BIT.highContrast);

    for (const theme of current) {
      const tokens = tokensOf(theme.id);
      expect(tokens.palettes["spectrum"], `${theme.id}: the ${theme.spectrum} spectrum`).toEqual({
        carries: "decoration",
        monochrome: "foreground",
        slots: TP.spectrum[theme.spectrum],
      });
      expect(tokens.palettes["tone"]?.classes, `${theme.id}: tone classes`).toEqual(TP.classes.tone);
      expect(tokens.palettes["syntax"]?.classes, `${theme.id}: syntax classes`).toEqual(TP.classes.syntax);
      const band = (BAND_FOUR_BIT as Readonly<Record<string, unknown>>)[theme.id];
      expect(tokens.bandFourBit, `${theme.id}: the band pair it is named for, or none`).toBe(band);
    }
  });
});
