// C10 tier 2 — contract. Purity, the properties a shipped theme must have, and
// the source scans that keep a palette from leaking out of its two consumers.
import { readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  defaultTheme,
  diffPairs,
  floorFor,
  ratio,
  resolve,
  resolveBackground,
  resolveTone,
  type ColourRef,
} from "../../src/presentation/theme/index.js";
import { checkSourceScans, SCANS } from "../../tools/enforce/source-scans.mjs";
import { caps, DEPTHS, store, SURFACES, SYNTAX_SLOTS, TONES } from "../support/theme.js";

const VARIANTS = ["dark", "light"] as const;

function sourceFiles(dir = "src"): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = `${dir}/${name}`;
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (path.endsWith(".ts")) out.push(path);
  }
  return out;
}

describe("C10 contract", () => {
  it("T2.1 (I1): a thousand calls return identical styles and touch nothing", () => {
    const current = store().current;
    const first = resolveTone("ok", current, caps(8));

    for (let i = 0; i < 1000; i++) {
      expect(resolveTone("ok", current, caps(8))).toEqual(first);
    }
  });

  it("T2.2 (I11): a warm cache agrees with a cold one for every key", () => {
    // Asserted by comparing results, not by inspecting the cache. A test that
    // knows the cache exists tests the cache; this tests the property the cache
    // is not allowed to break.
    const cold = store().current;
    const warm = store().current;

    for (const depth of DEPTHS) {
      for (const tone of TONES) {
        const a = resolveTone(tone, cold, caps(depth));
        resolveTone(tone, warm, caps(depth));
        expect(resolveTone(tone, warm, caps(depth))).toEqual(a);
      }
    }
  });

  it("T2.3 (I5): the 4-bit map is injective across the five tones that must stay apart", () => {
    // `ok` and `error` on one colour is a failed row that reads as a passing
    // one. `dim` and `muted` colliding costs nothing, and is not asserted.
    for (const variant of VARIANTS) {
      const indices = ["ok", "warn", "error", "info", "accent"].map(
        (t) => defaultTheme[variant].fourBit[`tone.${t}`],
      );
      expect(new Set(indices).size, `${variant} collapses two meaning tones at 4-bit`).toBe(5);
    }
  });

  it("T2.4 (I3): every shipped theme clears every floor on bg and bgElev", () => {
    // Recomputed from the shipped token, not read from A01 A.1's recorded
    // figure. That is what makes the catalogue an assertion this test upholds
    // rather than a record of what someone intended.
    for (const variant of VARIANTS) {
      const tokens = defaultTheme[variant];
      for (const [name, palette] of Object.entries(tokens.palettes)) {
        if (palette.carries !== "meaning") continue;

        for (const [slot, value] of Object.entries(palette.slots)) {
          for (const surface of [tokens.surfaces.bg, tokens.surfaces.bgElev]) {
            expect(
              ratio(value, surface),
              `${variant} ${name}.${slot} (${value}) against ${surface}`,
            ).toBeGreaterThanOrEqual(floorFor(slot));
          }
        }
      }
    }
  });

  it("T2.5 (I13): no ANSI index outside the curated map, and SS19 fires", () => {
    const rule = SCANS.find((s) => s.id === "SS19");
    expect(rule, "SS19 is gone from the scan table").toBeDefined();
    expect(rule?.allow).toEqual(["src/presentation/theme/four-bit.ts"]);

    expect(checkSourceScans(sourceFiles()).filter((v) => v.rule === "SS19")).toEqual([]);
  });

  it("T2.6 (I12): theme/ reads no environment", () => {
    const violations = checkSourceScans(sourceFiles()).filter((v) => v.rule === "SS10" || v.rule === "SS11");
    expect(violations).toEqual([]);
  });

  it("T2.7: every Tone in C04's union has a token in every shipped theme", () => {
    // Exhaustive over the type, so adding a tone without tokens fails the build
    // rather than rendering as nothing on the day someone uses it.
    for (const variant of VARIANTS) {
      for (const tone of TONES) {
        expect(defaultTheme[variant].palettes["tone"]?.slots[tone], `${variant} ${tone}`).toBeTypeOf("string");
      }
      expect(Object.keys(defaultTheme[variant].palettes["tone"]!.slots).sort()).toEqual([...TONES].sort());
    }
  });

  it("T2.8 (I16): syntax and spectrum stay inside their declared consumers", () => {
    for (const id of ["SS20", "SS21"]) {
      expect(SCANS.find((s) => s.id === id), `${id} is gone from the scan table`).toBeDefined();
    }
    expect(checkSourceScans(sourceFiles()).filter((v) => v.rule === "SS20" || v.rule === "SS21")).toEqual([]);
  });

  it("T2.9 (I14): no hex literal in a block-producing module", () => {
    expect(checkSourceScans(sourceFiles()).filter((v) => v.rule === "SS16" || v.rule === "SS17")).toEqual([]);
  });

  it("T2.13 (§2): syntax has exactly its nine slots in every shipped theme", () => {
    for (const variant of VARIANTS) {
      expect(Object.keys(defaultTheme[variant].palettes["syntax"]!.slots).sort()).toEqual(
        [...SYNTAX_SLOTS].sort(),
      );
    }
  });

  it("T2.14 (§2, I15): every syntax slot clears its floor on both surfaces", () => {
    // `comment` is checked at 3 : 1 and the rest at 4.5. Recessive is the
    // requirement, not a compromise on it.
    for (const variant of VARIANTS) {
      const tokens = defaultTheme[variant];
      for (const slot of SYNTAX_SLOTS) {
        const value = tokens.palettes["syntax"]!.slots[slot]!;
        for (const surface of [tokens.surfaces.bg, tokens.surfaces.bgElev]) {
          expect(ratio(value, surface), `${variant} syntax.${slot}`).toBeGreaterThanOrEqual(floorFor(slot));
        }
      }
    }
    expect(floorFor("comment")).toBe(3);
  });

  it("T2.15 (§3): at depth 1 every syntax slot is typographic and emits no colour", () => {
    for (const variant of VARIANTS) {
      const themes = store(variant);
      for (const slot of SYNTAX_SLOTS) {
        const style = resolve(`syntax.${slot}`, themes.current, caps(1));
        expect(style.colour, `syntax.${slot}`).toBeUndefined();
      }
      // Including `key`, which is the slot that would be dropped by a mapping
      // written before the ninth existed.
      expect(resolve("syntax.key", themes.current, caps(1))).toEqual({});
    }
  });

  it("T2.16 (I17): no two slots of one palette share a 24-bit value", () => {
    // The test that caught `key`/`number`, and then caught light `number`/`type`
    // — which the contrast correction itself created, so nothing but
    // recomputation could have found it.
    for (const variant of VARIANTS) {
      for (const [name, palette] of Object.entries(defaultTheme[variant].palettes)) {
        const values = Object.values(palette.slots);
        expect(new Set(values).size, `${variant} ${name} has two slots on one value`).toBe(values.length);
      }
    }
  });

  it("T2.18 (I24): every resolved colour names its depth, and the kinds are exactly three", () => {
    // The list is written out literally rather than derived from the type. A
    // list computed from `ColourValue` agrees with itself and passes on any
    // addition, which is a rule with nothing to be wrong about — C05 T1.7c's
    // shape, applied to a union that a renderer switches on.
    const KINDS = ["rgb", "ansi256", "ansi16"];
    const seen = new Set<string>();

    for (const variant of VARIANTS) {
      const current = store(variant).current;
      const refs: ColourRef[] = [
        ...TONES.map((t) => `tone.${t}` as const),
        ...SYNTAX_SLOTS.map((s) => `syntax.${s}` as const),
        ...SURFACES.map((s) => `surface.${s}` as const),
      ];

      for (const ref of refs) {
        for (const depth of DEPTHS) {
          const colour = resolve(ref, current, caps(depth)).colour;
          if (colour === undefined) continue;

          expect(typeof colour, `${ref} at depth ${depth} must not be a bare string`).toBe("object");
          expect(KINDS, `${ref} at depth ${depth}`).toContain(colour.kind);
          seen.add(colour.kind);
        }
      }
    }

    // And all three are reachable, so the check is not passing because two of
    // them never occur.
    expect([...seen].sort()).toEqual([...KINDS].sort());
  });

  it("T2.19 (I24): no string literal is assigned to a colour field anywhere in src/", () => {
    const rule = SCANS.find((s) => s.id === "SS36");
    expect(rule, "SS36 is gone from the scan table").toBeDefined();
    expect(checkSourceScans(sourceFiles()).filter((v) => v.rule === "SS36")).toEqual([]);
  });

  it("T2.17 (I17): at depth 8 the five meaning tones stay distinct", () => {
    // Two tones distinct in hex can quantise onto one index, and that failure is
    // invisible in the truecolour terminal where every value was authored and
    // every golden will be reviewed.
    for (const variant of VARIANTS) {
      const current = store(variant).current;
      const indices = ["ok", "warn", "error", "info", "accent"].map((t) => {
        const colour = resolveTone(t as never, current, caps(8)).colour;
        return colour !== undefined && colour.kind === "ansi256" ? colour.index : -1;
      });
      expect(new Set(indices).size, `${variant} collapses two meaning tones at 8-bit`).toBe(5);
    }
  });

  it("every slot and surface has a 4-bit entry, so nothing silently loses colour at depth 4", () => {
    for (const variant of VARIANTS) {
      const tokens = defaultTheme[variant];
      for (const [name, palette] of Object.entries(tokens.palettes)) {
        if (name === "spectrum") continue; // decoration; the art is not themed at 4-bit
        for (const slot of Object.keys(palette.slots)) {
          expect(tokens.fourBit[`${name}.${slot}`], `${variant} ${name}.${slot}`).toBeTypeOf("number");
        }
      }
      for (const surface of SURFACES) {
        expect(tokens.fourBit[`surface.${surface}`], `${variant} surface.${surface}`).toBeTypeOf("number");
      }
    }
  });

  // --- §4a, the diff surfaces ----------------------------------------------

  it("T2.14a (I22): 48 ratios — twelve slots × two diff surfaces × two variants", () => {
    // Recomputed from the shipped tokens, never read from A01 A.1. The catalogue
    // is an assertion this upholds rather than a record of what someone intended,
    // which is T2.4's reason applied to the surfaces C25 made text-bearing.
    const failures: string[] = [];
    let checked = 0;

    for (const variant of VARIANTS) {
      const tokens = defaultTheme[variant];
      for (const [palette, slot, surface, hex] of diffPairs(tokens)) {
        checked += 1;
        const value = tokens.palettes[palette]?.slots[slot];
        const measured = ratio(value as string, hex);
        const floor = floorFor(slot);
        if (measured < floor) {
          failures.push(`${variant} ${palette}.${slot} on ${surface}: ${measured.toFixed(2)} < ${floor}`);
        }
      }
    }

    expect(checked, "twelve slots × two surfaces × two variants").toBe(48);
    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("T2.14b (I22): the diff surfaces are paired with exactly those twelve slots", () => {
    // **Asserted on the pairing, not on its results**, because both ways of
    // getting it wrong pass a results-only check on a theme that happens to be
    // fine. Widening it to every `meaning` slot fails on seven tones that never
    // land on a diff background; narrowing it to `syntax` leaves the numbers and
    // the marker unchecked on the surface they are drawn on.
    const pairs = diffPairs(defaultTheme.dark);
    const slots = [...new Set(pairs.map(([palette, slot]) => `${palette}.${slot}`))].sort();

    expect(slots).toEqual([
      "syntax.comment",
      "syntax.function",
      "syntax.key",
      "syntax.keyword",
      "syntax.number",
      "syntax.operator",
      "syntax.punctuation",
      "syntax.string",
      "syntax.type",
      "tone.error",
      "tone.muted",
      "tone.ok",
    ]);
    expect([...new Set(pairs.map(([, , surface]) => surface))].sort()).toEqual(["diffAdd", "diffRemove"]);
  });

  it("T2.14c (I22, §4a): seven surfaces, and the withdrawn strong pair is absent", () => {
    // The pair that was specified, measured and removed. Asserted absent rather
    // than merely unmentioned: a spec that measured something out and a token
    // file that quietly kept it is exactly the drift this suite exists to stop,
    // and an unused surface with no floor behind it is what someone reaches for.
    for (const variant of VARIANTS) {
      const names = Object.keys(defaultTheme[variant].surfaces).sort();
      expect(names, variant).toEqual([
        "bg",
        "bgDeep",
        "bgElev",
        "border",
        "borderStrong",
        "diffAdd",
        "diffRemove",
      ]);
    }
  });

  it("T2.20 (I21): over every ref × every depth, `background` is absent or a tagged value", () => {
    // T2.18's assertion for the second channel, and the kinds are written out
    // literally for the same reason: a list derived from the type agrees with
    // itself and passes on any addition.
    const KINDS = ["rgb", "ansi256", "ansi16"];
    const refs: ColourRef[] = [
      ...SURFACES.map((s) => `surface.${s}` as ColourRef),
      ...TONES.map((t) => `tone.${t}` as ColourRef),
      ...SYNTAX_SLOTS.map((s) => `syntax.${s}` as ColourRef),
    ];

    for (const variant of VARIANTS) {
      const current = store(variant).current;
      for (const ref of refs) {
        for (const depth of DEPTHS) {
          const background = resolveBackground(ref, current, caps(depth)).background;
          if (background === undefined) continue;
          expect(typeof background, `${ref} at ${depth}`).toBe("object");
          expect(KINDS, `${ref} at ${depth}`).toContain(background.kind);
        }
      }
    }
  });
});
