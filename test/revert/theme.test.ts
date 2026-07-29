// C10 tier 6 — fail-on-revert. Each names the edit that makes a test fail, so
// the guard is legible from the change rather than from the assertion.
import { describe, expect, it } from "vitest";
import { defaultTheme, floorFor, loadTheme, ratio, resolve, resolveTone } from "../../src/presentation/theme/index.js";
import { SCANS } from "../../tools/enforce/source-scans.mjs";
import { caps, store, SURFACES, SYNTAX_SLOTS, TONES, withTone } from "../support/theme.js";

const VARIANTS = ["dark", "light"] as const;

describe("C10 fail-on-revert", () => {
  it("T6.1 (I2): emitting a colour at depth 1 → T1.2 and T5.3 fail", () => {
    const current = store().current;
    for (const tone of TONES) expect(resolveTone(tone, current, caps(1)).colour).toBeUndefined();
    for (const slot of SYNTAX_SLOTS) expect(resolve(`syntax.${slot}`, current, caps(1)).colour).toBeUndefined();
  });

  it("T6.2 (I5): replacing the curated 4-bit table with computed nearest-RGB → T2.3 fails", () => {
    // Nearest-of-16 by RGB puts `ok` and `info` on one green and `warn` and
    // `accent` on one yellow. The curated table is asserted to be a table, and
    // to keep the five apart.
    for (const variant of VARIANTS) {
      const five = ["ok", "warn", "error", "info", "accent"].map(
        (t) => defaultTheme[variant].fourBit[`tone.${t}`],
      );
      expect(new Set(five).size).toBe(5);
    }
  });

  it("T6.3 (I3): validating contrast at render instead of at load → T1.7 fails", () => {
    // A theme that fails must not produce a store at all. Checking at render
    // means the first frame is where you find out, and by then it is on screen.
    expect(loadTheme(withTone("error", "#6b3a34")).ok).toBe(false);
  });

  it("T6.4 (I4): applying an override before validating it → T3.4 fails", () => {
    const themes = store();
    const before = themes.current;
    themes.applyOverrides({ palettes: { tone: { error: "#1b1b1b" } } });
    expect(themes.current).toBe(before);
  });

  it("T6.5 (I11): keying the cache on tone alone → T3.8 returns a stale style", () => {
    const current = store().current;
    expect(resolveTone("ok", current, caps(24)).colour?.kind).toBe("rgb");
    expect(resolveTone("ok", current, caps(8)).colour?.kind).toBe("ansi256");
    expect(resolveTone("ok", current, caps(4)).colour?.kind).toBe("ansi16");
    expect(resolveTone("ok", current, caps(24)).colour?.kind).toBe("rgb");
  });

  it("T6.6 (I10): swapping tokens field by field rather than atomically → T3.5 fails", () => {
    // A resolved theme is a value. Holding one across a switch must keep giving
    // the theme it was, because that is what stops a frame being half in each.
    const themes = store("dark");
    const held = themes.current;
    themes.setVariant("light");
    expect(resolveTone("ok", held, caps(24)).colour).toEqual({ kind: "rgb", hex: "#87b86c" });
  });

  it("T6.7 (D29): collapsing 1-bit tones to fewer than three classes → T4.2 fails", () => {
    const current = store().current;
    const distinct = new Set(TONES.map((t) => JSON.stringify(resolveTone(t, current, caps(1)))));
    expect(distinct.size).toBe(3);
  });

  it("T6.8 (I6): dropping the rank-order correction → T1.10 fails", () => {
    // The pair the spec names. `dim` is darker than `default` in 24-bit and must
    // stay darker at 8-bit; an uncorrected nearest-neighbour can invert them.
    const current = store().current;
    const index = (tone: "dim" | "default"): number => {
      const colour = resolveTone(tone, current, caps(8)).colour;
      return colour !== undefined && colour.kind === "ansi256" ? colour.index : -1;
    };
    // Greyscale ramp indices ascend with luminance, so the comparison is direct.
    expect(index("dim")).toBeLessThan(index("default") >= 232 ? index("default") : 256);
    expect(ratio(defaultTheme.dark.palettes["tone"]!.slots["dim"]!, "#1a1a1a")).toBeLessThan(
      ratio(defaultTheme.dark.palettes["tone"]!.slots["default"]!, "#1a1a1a"),
    );
  });

  it("T6.9 (I13): putting an ANSI index in a token file → T2.5 fails", () => {
    const rule = SCANS.find((s) => s.id === "SS19");
    expect(rule?.scope).toBe("src/presentation/theme/");
    // The allow-list is one named file. Narrowing the *scope* instead would stop
    // seeing a new token file the day someone adds one.
    expect(rule?.allow).toEqual(["src/presentation/theme/four-bit.ts"]);
  });

  it("T6.10 (I7): C10 calling the scheduler directly → T4.4's spy fails", () => {
    // Asserted structurally until L4 exists: nothing in `theme/` names the
    // scheduler, so it cannot be calling it.
    const source = SCANS.map((s) => s.id);
    expect(source).toContain("SS28"); // L4 orchestrates; the layers below do not commit
    expect(Object.keys(store())).not.toContain("invalidate");
  });

  it("T6.11 (I8): painting a background at 1-bit → T1.12 fails", () => {
    const current = store().current;
    for (const surface of SURFACES) expect(resolve(`surface.${surface}`, current, caps(1))).toEqual({});
  });

  it("T6.12 (§4): validating against bg alone → T2.4 fails on muted", () => {
    // The revert that is invisible in the transcript and shows up only inside a
    // panel. Dark `muted` measured 2.31 against bgElev before the correction,
    // and against `bg` alone it passed.
    for (const variant of VARIANTS) {
      const tokens = defaultTheme[variant];
      const muted = tokens.palettes["tone"]!.slots["muted"]!;
      expect(ratio(muted, tokens.surfaces.bgElev), `${variant} muted on bgElev`).toBeGreaterThanOrEqual(
        floorFor("muted"),
      );
    }
  });

  it("T6.13 (I17): giving two slots one value → T2.16 fails, naming the pair", () => {
    // Both states this caught: `key`/`number`, which shipped that way in Atom
    // One, and light `number`/`type`, which the contrast correction created.
    for (const variant of VARIANTS) {
      const syntax = defaultTheme[variant].palettes["syntax"]!.slots;
      expect(syntax["key"]).not.toBe(syntax["number"]);
      expect(syntax["type"]).not.toBe(syntax["number"]);
    }

    const collided = loadTheme(withTone("info", defaultTheme.dark.palettes["tone"]!.slots["ok"]!));
    expect(collided.ok).toBe(false);
    if (!collided.ok) expect(collided.error.map((e) => e.message).join()).toMatch(/must not render as one another/);
  });

  it("T6.14 (I17): dropping the 8-bit distinctness check → T2.17 fails", () => {
    // Nothing in a truecolour terminal would have shown it, which is the whole
    // reason the check exists rather than the review.
    for (const variant of VARIANTS) {
      const current = store(variant).current;
      const five = ["ok", "warn", "error", "info", "accent"].map((t) => {
        const colour = resolveTone(t as never, current, caps(8)).colour;
        return colour !== undefined && colour.kind === "ansi256" ? colour.index : -1;
      });
      expect(new Set(five).size).toBe(5);
    }
  });
});
