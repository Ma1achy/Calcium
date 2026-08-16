// C10 tier 6 — fail-on-revert. Each names the edit that makes a test fail, so
// the guard is legible from the change rather than from the assertion.
import { describe, expect, it } from "vitest";
import {
  defaultTheme,
  diffPairs,
  floorFor,
  loadTheme,
  ratio,
  resolve,
  resolveBackground,
  resolveTone,
  validateTokens,
} from "../../src/presentation/theme/index.js";
import { SCANS } from "../../tools/enforce/source-scans.mjs";
import { caps, store, SURFACES, SYNTAX_SLOTS, TONES, withTone } from "../support/theme.js";

/**
 * Derived, for §5a.4's reason: a literal here is a coverage set the test wrote
 * for itself, and a third shipped theme would join none of these rows.
 */
const SHIPPED = Object.entries(defaultTheme);

/** WCAG relative luminance, computed here so the test does not lean on the code it guards. */
function relativeLuminance(hex: string): number {
  const to = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [1, 3, 5].map((i) => to(Number.parseInt(hex.slice(i, i + 2), 16) / 255)) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The cube index a tone resolves to at depth 8, as a luminance. */
function eightBit(current: ReturnType<typeof store>["current"], tone: string): number {
  const colour = resolve(`tone.${tone}`, current, caps(8)).colour;
  const index = colour !== undefined && colour.kind === "ansi256" ? colour.index : -1;

  if (index >= 232) {
    const v = 8 + (index - 232) * 10;
    return relativeLuminance(`#${[v, v, v].map((c) => c.toString(16).padStart(2, "0")).join("")}`);
  }
  const levels = [0, 95, 135, 175, 215, 255];
  const n = index - 16;
  const [r, g, b] = [levels[Math.floor(n / 36)]!, levels[Math.floor((n % 36) / 6)]!, levels[n % 6]!];
  return relativeLuminance(`#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`);
}

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
    for (const [, tokens] of SHIPPED) {
      const five = ["ok", "warn", "error", "info", "accent"].map(
        (t) => tokens.fourBit[`tone.${t}`],
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
    themes.setTheme("light");
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
    expect(ratio(defaultTheme["dark"]!.palettes["tone"]!.slots["dim"]!, "#1a1a1a")).toBeLessThan(
      ratio(defaultTheme["dark"]!.palettes["tone"]!.slots["default"]!, "#1a1a1a"),
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
    for (const [variant, tokens] of SHIPPED) {
      const muted = tokens.palettes["tone"]!.slots["muted"]!;
      expect(ratio(muted, tokens.surfaces.bgElev), `${variant} muted on bgElev`).toBeGreaterThanOrEqual(
        floorFor("muted"),
      );
    }
  });

  it("T6.13 (I17): giving two slots one value → T2.16 fails, naming the pair", () => {
    // Both states this caught: `key`/`number`, which shipped that way in Atom
    // One, and light `number`/`type`, which the contrast correction created.
    for (const [, tokens] of SHIPPED) {
      const syntax = tokens.palettes["syntax"]!.slots;
      expect(syntax["key"]).not.toBe(syntax["number"]);
      expect(syntax["type"]).not.toBe(syntax["number"]);
    }

    const collided = loadTheme(withTone("info", defaultTheme["dark"]!.palettes["tone"]!.slots["ok"]!));
    expect(collided.ok).toBe(false);
    if (!collided.ok) expect(collided.error.map((e) => e.message).join()).toMatch(/must not render as one another/);
  });

  it("T6.15 (I6): a neighbour-wise walk → T1.10 fails while every adjacent check passes", () => {
    // The revert that looks like a simplification, and the reason T1.10 asserts
    // all pairs rather than adjacent ones.
    //
    // `info` and `identifier` are 0.030 apart — a real ranking — with two
    // near-equal steps between them. A walk that exempts near-equal neighbours
    // therefore leaves them unconstrained relative to each other, and they
    // invert with no adjacent comparison ever failing. The test names that
    // configuration explicitly so the guard cannot be weakened back to
    // adjacency by someone who reads only the assertion.
    const current = store().current;
    const slots = current.tokens.palettes["tone"]!.slots;

    const order = TONES.map((t) => ({ tone: t, lum: relativeLuminance(slots[t]!) })).sort(
      (a, b) => a.lum - b.lum,
    );
    const at = (tone: string): number => order.findIndex((o) => o.tone === tone);

    // The configuration: separated by more than the noise threshold, and not
    // adjacent — so adjacency alone says nothing about the pair.
    const gap = order[at("identifier")]!.lum - order[at("info")]!.lum;
    expect(gap, "info and identifier are a real ranking").toBeGreaterThan(0.02);
    expect(at("identifier") - at("info"), "with steps between them").toBeGreaterThan(1);

    for (let i = at("info"); i < at("identifier"); i++) {
      expect(
        order[i + 1]!.lum - order[i]!.lum,
        "and every step between them is below the threshold, so no adjacent check constrains the pair",
      ).toBeLessThan(0.02);
    }

    // The pair holds anyway, because the assignment is over the set.
    expect(eightBit(current, "info")).toBeLessThanOrEqual(eightBit(current, "identifier"));
  });

  it("T6.16 (I24): making colour a bare string → T2.18 fails and the writer guesses again", () => {
    const rule = SCANS.find((s) => s.id === "SS36");
    expect(rule?.scope).toBe("src/");
    expect(rule?.allow, "no file may write an untagged colour").toEqual([]);

    const current = store().current;
    for (const tone of TONES) {
      for (const depth of [24, 8, 4] as const) {
        const colour = resolveTone(tone, current, caps(depth)).colour;
        expect(typeof colour, `${tone} at depth ${depth}`).toBe("object");
        expect(colour?.kind, `${tone} at depth ${depth}`).toBeTypeOf("string");
      }
    }
  });

  it("T6.14 (I17): dropping the 8-bit distinctness check → T2.17 fails", () => {
    // Nothing in a truecolour terminal would have shown it, which is the whole
    // reason the check exists rather than the review.
    for (const [variant] of SHIPPED) {
      const current = store(variant).current;
      const five = ["ok", "warn", "error", "info", "accent"].map((t) => {
        const colour = resolveTone(t as never, current, caps(8)).colour;
        return colour !== undefined && colour.kind === "ansi256" ? colour.index : -1;
      });
      expect(new Set(five).size).toBe(5);
    }
  });

  // --- §4a ------------------------------------------------------------------

  it("T6.17 (I22): widening the pairing to every tone is invisible in results", () => {
    // **The revert that no result catches, which is why the check is on the
    // pairing.** The obvious claim — ten tones against a diff background would
    // fail on slots that never land there — is wrong, and asserting it is how this
    // test failed on the way in. Against the shipped tokens the widened check
    // *passes*: every one of the seven tones that never appears on a changed row
    // clears both diff surfaces, `dim` tightest at 4.74 against a floor of 3.
    //
    // So what the widening costs is not a failure now. It binds seven slots to a
    // constraint they do not have to satisfy, and the bill arrives as a *later*
    // theme rejected for something nobody can see — at which point the fix looks
    // like weakening the check. This asserts the surplus explicitly so the reason
    // for the narrow pairing survives someone reading only the passing suite.
    const NEVER_ON_A_DIFF_ROW = ["default", "dim", "warn", "info", "accent", "meta", "identifier"];
    const tokens = defaultTheme["dark"]!;
    const surplus: string[] = [];

    for (const surface of ["diffAdd", "diffRemove"] as const) {
      const hex = (tokens.surfaces as Readonly<Record<string, string>>)[surface] as string;
      for (const slot of NEVER_ON_A_DIFF_ROW) {
        const value = tokens.palettes["tone"]?.slots[slot] as string;
        expect(
          ratio(value, hex),
          `tone.${slot} on ${surface}: the widened check would pass, which is why it is not caught`,
        ).toBeGreaterThanOrEqual(floorFor(slot));
        surplus.push(`tone.${slot}`);
      }
    }

    // And the pairing does not contain them, which is the whole assertion.
    const paired = new Set(diffPairs(tokens).map(([palette, slot]) => `${palette}.${slot}`));
    for (const name of surplus) {
      expect(paired.has(name), `${name} must not be in the diff pairing`).toBe(false);
    }
  });

  it("T6.18 (I22): dropping the gutter tones from the pairing → the gutter is unchecked", () => {
    // The other direction, and the quieter one: `syntax` alone leaves the numbers
    // and the `+`/`-` marker unmeasured on the surface they are drawn on. The
    // three that would go unchecked are named, so the loss is visible.
    const tokens = defaultTheme["dark"]!;
    const gutter = ["ok", "error", "muted"];

    for (const slot of gutter) {
      const value = tokens.palettes["tone"]?.slots[slot] as string;
      const hex = tokens.surfaces.diffAdd;
      expect(ratio(value, hex), `tone.${slot} is measured, not assumed`).toBeGreaterThanOrEqual(
        floorFor(slot),
      );
    }
  });

  it("T6.19 (I21): letting `resolveBackground` take a palette ref → T1.15 fails", () => {
    // A tone painted behind text is a tone with no floor measured for it in that
    // role. The empty `Style` is the refusal.
    const current = store().current;
    expect(resolveBackground("tone.ok", current, caps(24))).toEqual({});
    expect(resolveBackground("syntax.keyword", current, caps(24))).toEqual({});
  });

  it("T6.20 (I2, I23): emitting a diff background at depth 1 → T1.16 fails", () => {
    // The one signal a monochrome terminal cannot show becoming the one that
    // carries the meaning. At one bit the marker and the gutter are all there is.
    for (const [variant] of SHIPPED) {
      const current = store(variant).current;
      for (const surface of ["diffAdd", "diffRemove"] as const) {
        expect(resolveBackground(`surface.${surface}`, current, caps(1)), surface).toEqual({});
      }
    }
  });

  it("T6.21 (I22): a diff background too strong for syntax → the theme is rejected at load", () => {
    // The check doing what it is for, shown rather than trusted. A `diffAdd`
    // lifted to where a real tool would put it on a dark theme breaks `comment`
    // and `muted` first — the two recessive slots that bound the whole budget.
    const tokens = defaultTheme["dark"]!;
    const broken = {
      ...tokens,
      surfaces: { ...tokens.surfaces, diffAdd: "#1b4721" },
    };

    const errors = validateTokens(broken);
    const paths = errors.map((e) => e.path);

    expect(errors.length, errors.map((e) => e.message).join("\n")).toBeGreaterThan(0);
    expect(paths).toContain("palettes.syntax.comment");
    expect(paths).toContain("palettes.tone.muted");
    expect(errors.some((e) => e.message.includes("the background moves rather than the slot"))).toBe(
      true,
    );
    expect(loadTheme({ dark: broken, light: defaultTheme["light"]! }, "dark").ok).toBe(false);
  });
});
