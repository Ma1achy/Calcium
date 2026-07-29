// C10 tier 1 — unit. The ladder at each depth, the 1-bit collapse, and the
// rejection paths that keep a broken theme off the screen.
import { describe, expect, it } from "vitest";
import {
  clearResolutionCache,
  defaultTheme,
  loadTheme,
  ratio,
  resolve,
  resolveTone,
} from "../../src/presentation/theme/index.js";
import { caps, DEPTHS, store, SURFACES, TONES, withTone } from "../support/theme.js";

describe("C10 resolution", () => {
  it("T1.1 (I1): every tone at every depth yields a Style and never throws", () => {
    // Forty cases. Totality is the invariant a renderer depends on without ever
    // stating it: a missing slot mid-frame must not be what takes a session down.
    const current = store().current;

    for (const tone of TONES) {
      for (const depth of DEPTHS) {
        expect(() => resolveTone(tone, current, caps(depth))).not.toThrow();
        expect(resolveTone(tone, current, caps(depth))).toBeTypeOf("object");
      }
    }
  });

  it("T1.2 (I2): at depth 1 no Style carries a colour — tones or surfaces", () => {
    const current = store().current;

    for (const tone of TONES) expect(resolveTone(tone, current, caps(1)).colour).toBeUndefined();
    for (const surface of SURFACES) {
      expect(resolve(`surface.${surface}`, current, caps(1)).colour).toBeUndefined();
    }
  });

  it("T1.3: at depth 1 the ten tones collapse to exactly the three §3 classes", () => {
    // Not ten legible monochrome styles but three, and the meaning survives
    // because D29 holds: a failed row is `✗` *and* red, so here it is `✗` and
    // bold. Anything finer is an underline nobody notices.
    const current = store().current;
    const styleOf = (tone: (typeof TONES)[number]): string =>
      JSON.stringify(resolveTone(tone, current, caps(1)));

    const emphasised = styleOf("ok");
    const normal = styleOf("default");
    const deemphasised = styleOf("dim");

    expect(new Set([emphasised, normal, deemphasised]).size).toBe(3);
    expect(["ok", "warn", "error", "accent"].map((t) => styleOf(t as never))).toEqual([
      emphasised,
      emphasised,
      emphasised,
      emphasised,
    ]);
    expect(["default", "info", "meta", "identifier"].map((t) => styleOf(t as never))).toEqual([
      normal,
      normal,
      normal,
      normal,
    ]);
    expect(["dim", "muted"].map((t) => styleOf(t as never))).toEqual([deemphasised, deemphasised]);
  });

  it("T1.4: at depth 24 the colour is the token's hex, verbatim", () => {
    const current = store().current;
    for (const tone of TONES) {
      expect(resolveTone(tone, current, caps(24)).colour).toEqual({
        kind: "rgb",
        hex: current.tokens.palettes["tone"]!.slots[tone],
      });
    }
  });

  it("T1.5 (I5): at depth 4 the curated table is used, not a computed nearest", () => {
    // Asserted against the theme's own declaration. Against a computed nearest
    // it would agree with whatever the code did, which is a test with nothing to
    // be wrong about.
    const current = store().current;
    for (const tone of TONES) {
      expect(resolveTone(tone, current, caps(4)).colour).toEqual({
        kind: "ansi16",
        index: current.tokens.fourBit[`tone.${tone}`],
      });
    }
  });

  it("T1.6: setVariant swaps the variant and clears the cache", () => {
    const themes = store("dark");
    expect(resolveTone("ok", themes.current, caps(24)).colour).toEqual({ kind: "rgb", hex: "#87b86c" });

    themes.setVariant("light");

    expect(themes.current.variant).toBe("light");
    expect(resolveTone("ok", themes.current, caps(24)).colour).toEqual({ kind: "rgb", hex: "#3c793c" });
  });

  it("T1.7 (I3): a theme whose error fails 4.5:1 is rejected, naming error", () => {
    // #6b3a34 against #1a1a1a measures well under the floor while still looking
    // like a red someone might plausibly choose.
    const loaded = loadTheme(withTone("error", "#6b3a34"));

    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      const text = loaded.error.map((e) => `${e.path}: ${e.message}`).join("\n");
      expect(text).toMatch(/error/);
      expect(text).toMatch(/below its floor of 4\.5/);
    }
  });

  it("T1.8: a valid override merges and takes effect", () => {
    const themes = store();
    const before = themes.current;

    expect(themes.applyOverrides({ palettes: { tone: { ok: "#9ad07f" } } })).toEqual([]);

    expect(themes.current).not.toBe(before);
    expect(resolveTone("ok", themes.current, caps(24)).colour).toEqual({ kind: "rgb", hex: "#9ad07f" });
  });

  it("T1.9 (I9): a tone equal to the variant's bg is rejected at load", () => {
    const loaded = loadTheme(withTone("info", "#1a1a1a"));

    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.error.map((e) => e.message).join("\n")).toMatch(/renders as nothing/);
    }
  });

  it("T1.10 (I6): quantisation corrects a pair whose nearest neighbours would invert", () => {
    // The property, asserted over every genuinely-ranked pair rather than over
    // one contrived one: a pair separated in 24-bit must not swap at 8-bit.
    // Pairs closer than the tie threshold are noise and are excluded, which the
    // spec's own wording ("if dim *was* darker than default") allows.
    const current = store().current;
    const slots = current.tokens.palettes["tone"]!.slots;

    const lum = (hex: string): number => {
      const to = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      const [r, g, b] = [1, 3, 5].map((i) => to(Number.parseInt(hex.slice(i, i + 2), 16) / 255)) as [
        number,
        number,
        number,
      ];
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    const index = (tone: string): number => {
      const colour = resolve(`tone.${tone}`, current, caps(8)).colour;
      return colour !== undefined && colour.kind === "ansi256" ? colour.index : -1;
    };

    // Cube index → luminance, so "darker" is comparable after quantisation.
    const cubeLum = (i: number): number => {
      if (i >= 232) {
        const v = 8 + (i - 232) * 10;
        return lum(`#${[v, v, v].map((c) => c.toString(16).padStart(2, "0")).join("")}`);
      }
      const levels = [0, 95, 135, 175, 215, 255];
      const n = i - 16;
      const [r, g, b] = [levels[Math.floor(n / 36)]!, levels[Math.floor((n % 36) / 6)]!, levels[n % 6]!];
      return lum(`#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`);
    };

    for (const a of TONES) {
      for (const b of TONES) {
        const gap = lum(slots[b]!) - lum(slots[a]!);
        if (gap < 0.02) continue; // not a ranking, so nothing to preserve
        expect(cubeLum(index(a)), `${a} must stay darker than ${b} at 8-bit`).toBeLessThanOrEqual(
          cubeLum(index(b)),
        );
      }
    }
  });

  it("T1.11: muted passes at 2.5:1 and fails at 2.0:1", () => {
    // The floor is the assertion, and it is asserted from both sides — a floor
    // only tested from above is a number nobody has shown to bite.
    const passes = "#626262";
    const fails = "#4a4a4a";

    expect(ratio(passes, "#1a1a1a")).toBeGreaterThanOrEqual(2.5);
    expect(ratio(fails, "#1a1a1a")).toBeLessThan(2.5);

    expect(loadTheme(withTone("muted", passes)).ok).toBe(true);
    expect(loadTheme(withTone("muted", fails)).ok).toBe(false);
  });

  it("T1.12 (I8): at depth 1 every surface is an empty Style, not black", () => {
    // Black is what a monochrome terminal is already showing. Painting it would
    // fight whatever the user has actually configured.
    const current = store().current;
    for (const surface of SURFACES) {
      expect(resolve(`surface.${surface}`, current, caps(1))).toEqual({});
    }
  });

  it("T1.13 (I8): at depth 4 surfaces use the curated map", () => {
    const current = store().current;
    for (const surface of SURFACES) {
      expect(resolve(`surface.${surface}`, current, caps(4)).colour).toEqual({
        kind: "ansi16",
        index: current.tokens.fourBit[`surface.${surface}`],
      });
    }
  });

  it("both shipped variants load", () => {
    clearResolutionCache();
    expect(loadTheme(defaultTheme, "dark").ok).toBe(true);
    expect(loadTheme(defaultTheme, "light").ok).toBe(true);
  });
});
