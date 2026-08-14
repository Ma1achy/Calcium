// C10 tier 3 — edge cases. The overrides an app can legitimately write that have
// no sensible reading, and the moments a switch could be observed half-done.
import { describe, expect, it } from "vitest";
import { defaultTheme, loadTheme, resolve, resolveTone } from "../../src/presentation/theme/index.js";
import { caps, store, withTone } from "../support/theme.js";

describe("C10 edges", () => {
  it("T3.1: an override naming an unknown tone is ignored, not a throw", () => {
    // The same leniency C05 applies to unknown manifest fields: a theme written
    // for a newer palette should not stop a session opening.
    const themes = store();
    expect(themes.applyOverrides({ palettes: { tone: { fabulous: "#123456" } } })).toEqual([]);
    expect(resolveTone("ok", themes.current, caps(24)).colour).toEqual({ kind: "rgb", hex: "#87b86c" });
  });

  it("T3.2: a malformed hex is rejected with a named error", () => {
    const themes = store();
    for (const bad of ["#GGG", "red", "", "#12345", "rgb(1,2,3)"]) {
      const errors = themes.applyOverrides({ palettes: { tone: { ok: bad } } });
      expect(errors.length, JSON.stringify(bad)).toBeGreaterThan(0);
      expect(errors.map((e) => e.path).join()).toContain("tone.ok");
    }
  });

  it("T3.3: an override to bg that puts valid tones under the floor is rejected as a set", () => {
    // Not partially applied. Half of an override is a theme nobody authored,
    // and it is the half nobody can reproduce from a bug report.
    const themes = store();
    const errors = themes.applyOverrides({ surfaces: { bg: "#8a8a8a" } });

    expect(errors.length).toBeGreaterThan(1);
    expect(themes.current.tokens.surfaces.bg).toBe("#1a1a1a");
  });

  it("T3.4 (I4): after a rejected override, current is reference-identical", () => {
    const themes = store();
    const before = themes.current;

    expect(themes.applyOverrides({ palettes: { tone: { error: "#1b1b1b" } } }).length).toBeGreaterThan(0);

    expect(themes.current).toBe(before);
  });

  it("T3.5 (I10): a switch mid-render leaves the render on one theme", () => {
    // The render holds the theme it started with, because a resolved theme is a
    // value rather than a channel to the store. Swapping field by field is what
    // would produce a frame half in each.
    const themes = store("dark");
    const held = themes.current;

    const during: string[] = [];
    for (const tone of ["ok", "warn"] as const) {
      if (tone === "warn") themes.setTheme("light");
      const colour = resolveTone(tone, held, caps(24)).colour;
      during.push(colour !== undefined && colour.kind === "rgb" ? colour.hex : "");
    }

    expect(during).toEqual(["#87b86c", "#d4b35a"]); // both dark
    expect(themes.current.variant).toBe("light");
  });

  it("T3.6: switching to the active variant is a no-op", () => {
    const themes = store("dark");
    const before = themes.current;
    themes.setTheme("dark");
    expect(themes.current).toBe(before);
  });

  it("T3.7: a theme whose variants are identical loads and switches without error", () => {
    const twin = loadTheme({ dark: defaultTheme["dark"]!, light: defaultTheme["dark"]! });
    expect(twin.ok).toBe(true);
    if (twin.ok) {
      expect(() => twin.value.setTheme("light")).not.toThrow();
      expect(twin.value.current.tokens.variant).toBe("dark"); // a visual no-op, not an error
    }
  });

  it("T3.8 (I11): a depth change at runtime does not serve a stale style", () => {
    // The cache is keyed on depth, so a config override that lowers it produces
    // different results rather than a truecolour style on a 16-colour terminal.
    const current = store().current;
    const truecolour = resolveTone("ok", current, caps(24));
    const sixteen = resolveTone("ok", current, caps(4));

    expect(truecolour.colour).toEqual({ kind: "rgb", hex: "#87b86c" });
    expect(sixteen.colour).toEqual({ kind: "ansi16", index: 10 });
    expect(resolveTone("ok", current, caps(24))).toEqual(truecolour);
  });

  it("T3.9: a token with an alpha channel is rejected — terminals have no alpha", () => {
    expect(loadTheme(withTone("ok", "#87b86cff")).ok).toBe(false);
  });

  it("T3.10: contrast is a floor against broken themes, not a guarantee about the emulator", () => {
    // The user's terminal may override the background entirely. The test asserts
    // the check runs against the declared surface — claiming anything about what
    // the emulator does would be claiming something nobody can test.
    const loaded = loadTheme(withTone("ok", "#1e1e1e"));
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.error.map((e) => e.message).join("\n")).toMatch(/against bg \(#1a1a1a\)/);
    }
  });

  it("an unknown ref resolves to the empty style rather than throwing", () => {
    const current = store().current;
    expect(resolve("nosuch.slot", current, caps(24))).toEqual({});
    expect(resolve("tone.nosuch", current, caps(8))).toEqual({});
  });
});
