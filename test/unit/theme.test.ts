// C10 tier 1 — unit. The ladder at each depth, the 1-bit collapse, and the
// rejection paths that keep a broken theme off the screen.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fires, sourceOf } from "../support/source.js";
import {
  assertPictureGlyph,
  clearResolutionCache,
  defaultTheme,
  isPictureGlyph,
  loadTheme,
  ratio,
  resolve,
  resolveBackground,
  resolveBase,
  resolveTone,
  quantisedHex,
  validatePaintedFloors,
  collisions,
  separation,
  OKABE_ITO_CANONICAL,
  SEPARATION_FLOOR,
  VISIONS,
} from "../../src/presentation/theme/index.js";
import { floorFor } from "../../src/presentation/theme/index.js";
import { REQUIRED_SLOTS } from "../../src/presentation/theme/contrast.js";
import { caps, DEPTHS, store, SURFACES, TONES, withTone } from "../support/theme.js";

/**
 * **T1.34's fixture: §4f.1's table, recomputed.** The twelve light slots that
 * fail against `bgDeep` — the whole reason the page moved rather than the check.
 * Held as a set with its figures so the row asserts *which* twelve, not *some*:
 * element zero is the degenerate one, and an arm collapsing onto it survives a
 * `.some()`.
 */
const LIGHT_FAILS_ON_BGDEEP: readonly (readonly [string, string, number])[] = [
  ["tone", "muted", 2.44], ["tone", "ok", 4.29], ["tone", "warn", 4.30],
  ["tone", "info", 4.29], ["tone", "accent", 4.30], ["tone", "identifier", 4.31],
  ["categorical", "c4", 4.41], ["syntax", "string", 4.29], ["syntax", "comment", 2.89],
  ["syntax", "number", 4.30], ["syntax", "function", 4.30], ["syntax", "operator", 4.29],
];

describe("C10 resolution", () => {
  it("T1.34 (I34, §4f.1): every slot clears its floor on `bg`, and light fails twelve times on `bgDeep`", () => {
    // **Both halves, because either alone reads as the other's evidence.** The
    // first is why the page can be `bg`; the second is why widening the check to
    // `bgDeep` was the arm not taken, and it is a property of the *theme's*
    // polarity — dark's `bgDeep` recesses away from its tones and light's
    // recesses toward them, so a surface outside the check is a surface whose
    // polarity nobody constrained.
    for (const [name, tokens] of Object.entries(defaultTheme)) {
      const failed: string[] = [];
      // **`REQUIRED_SLOTS`' families and not every palette** — `spectrum` is
      // declared art, `carries: "decoration"`, and lands on no page. Derived
      // rather than listed, so a fourth family the framework resolves against
      // enters this row on the day it is added (I30).
      for (const family of Object.keys(REQUIRED_SLOTS)) {
        const palette = tokens.palettes[family];
        if (palette === undefined) continue;
        for (const [slot, hex] of Object.entries(palette.slots)) {
          if (typeof hex !== "string") continue;
          const floor = floorFor(slot);
          expect(ratio(hex, tokens.surfaces.bg), `${name} ${family}.${slot} on bg`).toBeGreaterThanOrEqual(floor);
          if (ratio(hex, tokens.surfaces.bgDeep) < floor) failed.push(`${family}.${slot}`);
        }
      }
      // **The set, not its first member.** `dark` and `high-contrast` clear
      // `bgDeep` too, which is exactly what makes the exclusion look harmless.
      if (name === "light") {
        expect(failed.sort()).toEqual(LIGHT_FAILS_ON_BGDEEP.map(([f, s]) => `${f}.${s}`).sort());
        for (const [family, slot, figure] of LIGHT_FAILS_ON_BGDEEP) {
          const hex = tokens.palettes[family]?.slots[slot] ?? "";
          expect(ratio(hex, tokens.surfaces.bgDeep), `light ${family}.${slot} on bgDeep`).toBeCloseTo(figure, 1);
        }
      } else {
        expect(failed, `${name} clears bgDeep too, which is why one theme in three hid this`).toEqual([]);
      }
    }
  });

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

  it("T1.6: setTheme swaps the variant and clears the cache", () => {
    const themes = store("dark");
    expect(resolveTone("ok", themes.current, caps(24)).colour).toEqual({ kind: "rgb", hex: "#87b86c" });

    themes.setTheme("light");

    expect(themes.current.variant).toBe("light");
    expect(resolveTone("ok", themes.current, caps(24)).colour).toEqual({ kind: "rgb", hex: "#3c793c" });
  });

  it("T1.7 (I3, §4a): a theme whose error fails its 2.5 floor is rejected, naming error", () => {
    // **The floor moved and this row moved with it, deliberately.** `error` is
    // now the `status` tag's foreground *and* its ground (§4a), and those are
    // held to opposite constraints — readable on the page, dark behind white
    // text — so at 4.5 the two could share a hue and never a value. The slot
    // sits at `muted`'s 2.5, and what still protects the word is
    // `errorTagPairs`, which checks white on the ground at the full 4.5.
    //
    // **Both directions, because a floor that moved has to be shown to have
    // moved.** `#c62828` is 2.97 against `bg` and 2.83 against `bgElev` — it
    // failed at 4.5 and passes at 2.5, which is the whole of the change. The
    // fabricated violation moved down with it, or this row would assert a check
    // nothing can fail (A03 §2): `#3a2422` is 1.21 and still looks like a red
    // someone might plausibly choose.
    expect(loadTheme(withTone("error", "#c62828")).ok, "the shipped red passes at 2.5").toBe(true);

    const loaded = loadTheme(withTone("error", "#3a2422"));
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      const text = loaded.error.map((e) => `${e.path}: ${e.message}`).join("\n");
      expect(text).toMatch(/error/);
      expect(text).toMatch(/below its floor of 2\.5/);
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

  // --- §4a, the second channel ---------------------------------------------

  it("T1.14 (I21): the two functions differ in which channel they fill, and nothing else", () => {
    const current = store().current;

    for (const surface of SURFACES) {
      const fg = resolve(`surface.${surface}`, current, caps(24));
      const bg = resolveBackground(`surface.${surface}`, current, caps(24));

      expect(bg.background, `surface.${surface}`).toEqual(fg.colour);
      expect(bg.colour, "and nothing in the other channel").toBeUndefined();
      expect(fg.background).toBeUndefined();
    }
  });

  it("T1.15 (I21): a palette ref resolves to no background at all", () => {
    // A rule rather than an omission. §4's floors are measured for text *on* a
    // surface, so painting a tone behind text asks for a guarantee nobody
    // computed — and a caller wanting `tone.ok` as a background is a caller who
    // has not decided what reads on it.
    const current = store().current;

    for (const ref of ["tone.ok", "tone.error", "syntax.keyword", "spectrum.3"] as const) {
      expect(resolveBackground(ref, current, caps(24)), ref).toEqual({});
    }
  });

  it("T1.16 (I2, I23): at depth 1 a diff surface resolves to nothing", () => {
    // What makes losing the background lossless: the marker and the toned gutter
    // are still there, so a diff at one bit is still a diff (C25 I13).
    for (const variant of ["dark", "light"] as const) {
      const current = store(variant).current;
      for (const surface of ["diffAdd", "diffRemove"] as const) {
        expect(resolveBackground(`surface.${surface}`, current, caps(1)), surface).toEqual({});
      }
    }
  });

  it("T1.17 (I25): the base is `surface.bg` and follows it", () => {
    // **The row that fails the day the declaration carries a colour of its own**,
    // which is the only way the painted value and the measured one can disagree
    // — and disagreeing is roadmap 39's own defect from the other side.
    const light = store("light").current;
    expect(light.tokens.background, "the light theme paints, because it cannot work otherwise").toBe(
      "surface",
    );
    expect(resolveBase(light, caps(24))).toEqual(
      resolveBackground("surface.bg", light, caps(24)),
    );

    // Follows `bg`, rather than being a second value beside it.
    // **A different `name`, because identity is the memo key** (I11). A
    // hand-built theme that changes a token and keeps the name gets the style
    // resolved for the old one — which is the cache doing exactly what it is
    // for, and the reason the store bumps a serial on every override.
    const moved = {
      ...light,
      name: `${light.name}#probe`,
      tokens: { ...light.tokens, surfaces: { ...light.tokens.surfaces, bg: "#123456" } },
    };
    expect(resolveBase(moved, caps(24))).toEqual({ background: { kind: "rgb", hex: "#123456" } });

    // And a theme that inherits paints nothing at any depth.
    const dark = store("dark").current;
    expect(dark.tokens.background).toBe("terminal");
    for (const depth of DEPTHS) expect(resolveBase(dark, caps(depth)), `depth ${depth}`).toEqual({});
  });

  it("T1.18 (I26): the base over all four rungs, in one row", () => {
    // One row because the claim is a **ladder** and not four claims: provable at
    // 24, provable against the cube's defined RGB at 8, best-effort at 4 where
    // the index is the emulator's, and vacuous at 1.
    const light = store("light").current;

    expect(resolveBase(light, caps(24)), "the token's hex, verbatim").toEqual({
      background: { kind: "rgb", hex: light.tokens.surfaces.bg },
    });

    const eight = resolveBase(light, caps(8)).background;
    expect(eight?.kind).toBe("ansi256");
    expect(
      eight?.kind === "ansi256" && eight.index >= 16,
      "16–255 only: the first sixteen are the emulator's",
    ).toBe(true);

    expect(resolveBase(light, caps(4)), "the theme's own curated index, never a computed nearest").toEqual({
      background: { kind: "ansi16", index: light.tokens.fourBit["surface.bg"] },
    });

    expect(resolveBase(light, caps(1)), "surfaces vanish, and so do foregrounds").toEqual({});
  });

  it("T1.19 (I26): the 8-bit floor is recomputed against the quantised base", () => {
    // **Asserted as a recomputation and not as a result.** Against the shipped
    // tokens both numbers clear, so a row comparing outcomes would agree with
    // the wrong one — this drives a slot to just clear its floor against the
    // token and fail against what an 8-bit terminal actually paints.
    const light = store("light").current;
    const painted = quantisedHex(light.tokens, "bg");
    expect(painted, "a painting theme has a quantised background").not.toBeNull();
    expect(painted).not.toBe(light.tokens.surfaces.bg);

    // A tone placed between the two floors: over 4.5 against the token, under it
    // against the colour the terminal paints. The fixture is checked to be that
    // before it is asserted against.
    // **The background is searched too, and it has to be.** Against `#fafafa`
    // the nearest cube entry is *lighter*, so contrast only improves and the
    // recomputation can never fail — a fixture built on the shipped bg would
    // assert nothing while passing. The failing direction needs a bg whose
    // quantised value is darker than the token, and one exists.
    const greys = Array.from({ length: 256 }, (_, i) => {
      const c = i.toString(16).padStart(2, "0");
      return `#${c}${c}${c}`;
    });

    const straddle = greys
      .map((bg) => ({ bg, painted: quantisedHex({ ...light.tokens, surfaces: { ...light.tokens.surfaces, bg } }, "bg") }))
      .flatMap(({ bg, painted: p }) =>
        p === null
          ? []
          : greys
              .filter(
                (fg) => ratio(fg, bg) >= floorFor("default") && ratio(fg, p) < floorFor("default"),
              )
              .map((fg) => ({ bg, fg })),
      )[0];
    expect(straddle, "the fixture must straddle the two floors, or this proves nothing").toBeDefined();

    const patched = {
      ...light.tokens,
      surfaces: { ...light.tokens.surfaces, bg: straddle!.bg },
      palettes: {
        ...light.tokens.palettes,
        tone: {
          ...light.tokens.palettes["tone"]!,
          slots: { ...light.tokens.palettes["tone"]!.slots, default: straddle!.fg },
        },
      },
    };

    const errors = validatePaintedFloors(patched);
    expect(errors.map((e) => e.path)).toContain("palettes.tone.default");

    // And nothing at all for a theme that inherits: there is no painted value
    // to check against, so the floor is the declared assumption as before.
    expect(validatePaintedFloors({ ...patched, background: "terminal" })).toEqual([]);
  });

  it("T1.20 (I28): a theme declaring the wrong polarity is rejected at load", () => {
    // **The state that was legal until this landed.** `variant` was a second
    // record of a fact the tokens carry — `luminance(bg)` answers it — and
    // nothing checked the two agreed: I9 compares tones *to* `bg` and has no
    // opinion about what `bg` is. So a theme could say `light` over black,
    // resolve, and clear every floor.
    const dark = defaultTheme["dark"]!;
    const lying = { ...defaultTheme, liar: { ...dark, variant: "light" as const } };

    const loaded = loadTheme(lying, "dark");
    expect(loaded.ok, "a theme that lies about its own ground").toBe(false);
    if (!loaded.ok) {
      const messages = loaded.error.map((e) => `${e.path}: ${e.message}`).join("; ");
      expect(messages).toContain("liar.variant");
      // Both numbers, so the reader can check the claim rather than trust it.
      expect(messages).toContain(dark.surfaces.bg);
      expect(messages, "the measured luminance, not just a verdict").toMatch(/luminance is 0\.\d+/u);
    }

    // And the shipped set clears it by an order of magnitude in both directions.
    expect(loadTheme(defaultTheme).ok).toBe(true);
  });

  it("T1.21 (I27): a set of three, and two themes of one polarity are distinct", () => {
    // **The case a variant-keyed store could not express.** `identity()` puts
    // the name first, so two dark themes differ — and the switch is by name,
    // which is what stops one of them being unreachable.
    const dark = defaultTheme["dark"]!;
    const three = { ...defaultTheme, "high-contrast": { ...dark, name: "hc" } };

    const loaded = loadTheme(three, "dark");
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const store = loaded.value;
    expect(store.names, "every theme is a name, in declaration order").toEqual([
      "dark",
      "light",
      "high-contrast",
    ]);

    const before = store.current;
    store.setTheme("high-contrast");
    expect(store.current, "a switch between two dark themes is a switch").not.toBe(before);
    expect(store.current.variant, "and polarity is untouched by it").toBe("dark");
    expect(store.current.name).not.toBe(before.name);

    // A name the set does not hold throws rather than no-opping, and says what
    // it does hold. A silent no-op would report a change that did not happen.
    expect(() => store.setTheme("solarised")).toThrow(/no theme named "solarised"/u);
    expect(store.current.name, "and nothing moved on the way out").toBe(
      loaded.value.current.name,
    );
  });

  it("T1.21a (I27): the set opens on its first key, not on a name this component invented", () => {
    // A literal default is a name C10 would be requiring of every app's set.
    const only = { midnight: { ...defaultTheme["dark"]!, name: "midnight" } };
    const loaded = loadTheme(only);
    expect(loaded.ok, "a set with no `dark` in it opens").toBe(true);
    if (loaded.ok) expect(loaded.value.current.tokens.name).toBe("midnight");

    // And an empty set is refused — the one failure a token check cannot see,
    // because it is about the collection rather than about a theme.
    expect(loadTheme({}).ok).toBe(false);
  });

  it("both shipped variants load", () => {
    clearResolutionCache();
    expect(loadTheme(defaultTheme, "dark").ok).toBe(true);
    expect(loadTheme(defaultTheme, "light").ok).toBe(true);
  });
});

/**
 * I21's fourth admitted case — the picture cell (C10 §4c.1).
 *
 * The admission used to read *the cell carries no text*, and the golden read
 * below is what falsified it: both shipped picture-cell constructors always
 * draw a glyph. The condition that is true is that the glyph is a **fill**, and
 * these rows are what makes the alphabet evidence rather than a stipulation.
 */
describe("C10 §4c.1 — the picture cell's alphabet", () => {
  it("T1.35 (C10 I21, §4c.1): the alphabet admits the fills and refuses everything a reader reads", () => {
    // Admitted, by range and not by a list the rows could agree with.
    expect(isPictureGlyph(" "), "the blank — `wash`'s own case through this door").toBe(true);
    for (let cp = 0x2580; cp <= 0x259f; cp += 1) {
      expect(isPictureGlyph(String.fromCodePoint(cp)), `U+${cp.toString(16)} block element`).toBe(true);
    }
    for (let cp = 0x2800; cp <= 0x28ff; cp += 1) {
      expect(isPictureGlyph(String.fromCodePoint(cp)), `U+${cp.toString(16)} braille`).toBe(true);
    }

    // Refused — and the refusal list is where the ruling shows. `#`, `=` and
    // `-` are `sankeyAlphabet`'s ASCII arm: the set a brand put on the
    // *alphabet* would have had to admit, and which a brand on the background
    // *channel* never has to, because `cellOf` passes no lower owner there.
    for (const ch of ["a", "Z", "0", "#", "=", "-", "_", "→", "─", "│", "╭", "↗"]) {
      expect(isPictureGlyph(ch), `${JSON.stringify(ch)} is not a fill`).toBe(false);
    }

    // Not one glyph is not one cell — a cluster and the empty string both out.
    expect(isPictureGlyph(""), "the empty string").toBe(false);
    expect(isPictureGlyph("▀▀"), "two fills are not one cell").toBe(false);
  });

  it("T1.36 (C10 I21, §4c.1, C12): every glyph the shipped frames paint a background under is admitted", () => {
    // **Read off the goldens, not off the constructors.** An admission list
    // derived from the table the constructors read agrees with itself and
    // passes on any addition — T2.20's reason, one artefact along. These bytes
    // are the frames the two sites actually produce on every shipped depth.
    const dir = new URL("../golden/terminal-baseline/", import.meta.url);
    const names = readdirSync(dir).filter(
      (n) => /^(sankey|plot3d)-/u.test(n) && /-(24bit|8bit)-/u.test(n) && n.endsWith(".txt"),
    );
    expect(names.length, "the corpus is not empty — an empty scan is a green scan").toBeGreaterThan(20);

    const sankeyGlyphs = new Set<string>();
    const plot3dGlyphs = new Set<string>();
    for (const name of names) {
      const text = readFileSync(new URL(name, dir), "utf8");
      const into = name.startsWith("sankey") ? sankeyGlyphs : plot3dGlyphs;
      // Walk the SGR state and collect the glyph of every cell with a
      // background set. `48;` opens one, `49` closes it, `0`/`` resets both.
      let painted = false;
      for (const m of text.matchAll(/\u001b\[([0-9;]*)m|([^])/gu)) {
        const sgrParams = m[1];
        if (sgrParams !== undefined) {
          if (sgrParams.startsWith("48;")) painted = true;
          else if (sgrParams === "49" || sgrParams === "0" || sgrParams === "") painted = false;
          continue;
        }
        const ch = m[2];
        if (painted && ch !== undefined && ch !== "\n") into.add(ch);
      }
    }

    // The control the scan owes: a reader that saw no backgrounds would report
    // a clean corpus, which is what a broken walk looks like.
    expect(sankeyGlyphs.size, "sankey paints backgrounds at all").toBeGreaterThan(0);
    expect(plot3dGlyphs.size, "plot3d paints backgrounds at all").toBeGreaterThan(0);

    // Asserted as a set. Sankey's is exactly one glyph — `▀`, the half that
    // carries bar against ribbon at 1-bit, which is why a blank `Span` could
    // never have served this site.
    expect([...sankeyGlyphs].sort()).toEqual(["▀"]);
    for (const ch of [...sankeyGlyphs, ...plot3dGlyphs]) {
      expect(isPictureGlyph(ch), `${JSON.stringify(ch)} U+${ch.codePointAt(0)!.toString(16)} is painted over`).toBe(true);
    }
    // And plot3d's set is wider than one range, so the row is not satisfied by
    // the block elements alone.
    expect([...plot3dGlyphs].some((c) => c.codePointAt(0)! >= 0x2800), "braille is in it").toBe(true);
    expect([...plot3dGlyphs].some((c) => c.codePointAt(0)! < 0x2600), "block elements are in it").toBe(true);
  });

  it("T1.37 (C10 I21, §4c.1): the refusal fires, and both constructors are on it", () => {
    // The function, with its control beside it — a throw asserted without one
    // is satisfied by a function that always throws.
    expect(() => { assertPictureGlyph("a", "site"); }).toThrow(/C10 I21/u);
    expect(() => { assertPictureGlyph("-", "site"); }).toThrow(/not one/u);
    expect(() => { assertPictureGlyph("▀", "site"); }, "the control").not.toThrow();
    expect(() => { assertPictureGlyph("⠉", "site"); }, "the control").not.toThrow();

    // **And the sites, asserted on stripped source — with the limit stated.**
    // Neither guard is reachable from a public surface: `sankeyArea` takes its
    // glyph from `sankeyAlphabet(caps)` and `mixedRows` is not exported, which
    // is the same measurement that says no input the tree produces trips them.
    // So the honest row is that the call is *there*, on the background arm, and
    // T6.92 is what says removing it is invisible in every other result.
    const sankeySrc = sourceOf("src/presentation/plot/sankey.ts");
    const scatterSrc = sourceOf("src/presentation/plot/scatter3.ts");
    expect(fires(scatterSrc, /assertPictureGlyph\(glyph, "plot3d mixedRows"\)/u), "plot3d's span").toBe(true);

    // **Sankey's half of this row is stronger than a call site now, and the
    // change is what broke the old assertion** — C12 I125 moved the call out of
    // the constructor and into `pictureGlyph()`, the sole constructor of the
    // branded type the background arm demands. So the honest assertion is no
    // longer *the call is there*; it is that **the brand has exactly one
    // construction path and the guard is on it**. Three parts, because the
    // first two are satisfiable separately:
    //
    //   1 · the guard is inside `pictureGlyph`;
    //   2 · the file holds exactly **one** `as PictureGlyph`, so nothing else
    //       mints the brand — a second cast anywhere would route around the
    //       guard while leaving part 1 true;
    //   3 · the background-bearing cell is built by calling it, not from a bare
    //       string.
    //
    // Part 2 is the one with content, and it is the reason this reads as a
    // count rather than as a presence: an assertion that a guard exists is
    // satisfied by a guard nothing goes through.
    expect(
      fires(sankeySrc, /function pictureGlyph\([^)]*\): PictureGlyph \{\s*assertPictureGlyph\(glyph, site\);/u),
      "sankey's guard is the body of the brand's constructor",
    ).toBe(true);
    expect(
      (sankeySrc.match(/as PictureGlyph/gu) ?? []).length,
      "exactly one cast mints the brand, so nothing routes around the guard",
    ).toBe(1);
    expect(
      fires(sankeySrc, /text: pictureGlyph\(text, "sankeyArea"\)/u),
      "sankey's cell is built through it",
    ).toBe(true);
    // The control for the stripper: both files still hold the construction the
    // guard sits in front of, so a stripper that ate the code would fail here
    // rather than pass over an empty string.
    expect(fires(sankeySrc, /background: refOf\(below\)/u), "stripper control").toBe(true);
    expect(fires(scatterSrc, /colour, background: bg/u), "stripper control").toBe(true);
  });
});

/**
 * **C10 §4j — hue as the only channel.** F676 discharged the picture cell's
 * 1.00 with *legible only by hue* and four documents repeated it. These rows
 * are that clause measured: the metric, its control, and the shape of the
 * verdict the debt list is compared against.
 */
describe("C10 §4j — separation under dichromacy", () => {
  /**
   * **T1.40 (C10 I39, §4j.1) — the metric, and the control that gives the floor
   * a meaning.**
   *
   * The pairs are hand-checked against the Python reference in `out/`, which is
   * an independent implementation of the same two papers — a figure this file
   * and that one both produce is a figure neither transcribed.
   *
   * **The canonical control is the load-bearing half.** Without it a floor of
   * seven is indistinguishable from a floor of seventy: every shipped palette
   * fails both, so a suite indexed by the shipped palettes agrees with either.
   * A rule nothing can satisfy passes review exactly like one nothing violates,
   * which is A03 §2's vacuity class arriving in a threshold.
   */
  it("T1.40 (I39, §4j): separation reproduces the reference, and canonical Okabe-Ito clears the floor", () => {
    // Identical colours are zero under every model, including the dichromacies
    // — the degenerate case, asserted because a matrix that dropped a channel
    // would also return zero here and the next row is what tells them apart.
    for (const vision of VISIONS) {
      expect(separation("#e69f00", "#e69f00", vision), `identity under ${vision}`).toBeCloseTo(0, 6);
    }

    // **The pair that carries the whole finding, and it is one hue pair twice.**
    // Canonical orange against canonical yellow clears every model with room —
    // 11.7 at its worst. The light theme darkens both to clear its own ground
    // and ships them as `c1` and `c4`, where the same two hues measure **0.6**.
    // Orange and yellow differ mostly in the channel a deuteranope has lost, so
    // what is left to separate them is lightness — and the ground floor is a
    // constraint on exactly that. The adaptation did not fail to preserve the
    // property; it removed a pair canonical had handled with 67% of headroom.
    expect(separation("#e69f00", "#f0e442", "deutan"), "canonical orange/yellow, deutan").toBeCloseTo(11.7, 1);
    expect(separation("#8a5f00", "#7a6a00", "deutan"), "the same hues, darkened, deutan").toBeCloseTo(0.6, 1);
    expect(separation("#8a5f00", "#7a6a00", "normal"), "and separated to a trichromat").toBeGreaterThan(9);

    // A pair that survives every model — the control for the control: a
    // simulation that collapsed everything would satisfy the rows above.
    expect(separation("#000000", "#f0e442", "deutan"), "black vs yellow, deutan").toBeGreaterThan(50);

    // **The floor is calibrated on this set and on nothing else.** 7.9 is its
    // worst pair, so seven is the largest integer it clears and eight would
    // refuse the reference every shipped palette claims its property from.
    const names = Object.keys(OKABE_ITO_CANONICAL);
    let worst = Number.POSITIVE_INFINITY;
    let where = "";
    for (const vision of VISIONS) {
      for (let i = 0; i < names.length; i += 1) {
        for (let j = i + 1; j < names.length; j += 1) {
          const [a, b] = [names[i] as string, names[j] as string];
          const d = separation(OKABE_ITO_CANONICAL[a] as string, OKABE_ITO_CANONICAL[b] as string, vision);
          if (d < worst) { worst = d; where = `${vision} ${a}/${b}`; }
        }
      }
    }
    expect(where, "the canonical set's tightest pair").toBe("tritan orange/reddishPurple");
    expect(worst, "the control clears the floor").toBeGreaterThan(SEPARATION_FLOOR);
    expect(worst, "and would not clear eight").toBeLessThan(8);
    expect(worst).toBeCloseTo(7.9, 1);
  });

  /**
   * **T1.41 (C10 I39, §4j.3) — `collisions` returns a verdict and not a count.**
   *
   * T2.14b's form and its reason: the rule this feeds compares a **list** by
   * equality, so a pair that disappears is as much a change to look at as one
   * that appears, and a count cannot say which. The empty result on the
   * canonical set is the assertion, not a precondition.
   */
  it("T1.41 (I39, §4j): collisions names the model and both slots, and is empty for the control", () => {
    // Two slots a deuteranope cannot separate — the light theme's own pair.
    const collapsed = collisions({ c1: "#8a5f00", c4: "#7a6a00" });
    // **Two of four models and not all four**, which is the row's real content:
    // the pair is separated to a trichromat at 9.7 and under tritanopia at 7.2,
    // so a reader looking at the frame sees two colours and the entry names the
    // two models where they are one. A verdict that said only *collides* would
    // be satisfied by a simulation that collapsed every model equally.
    expect(collapsed.map((c) => `${c.vision} ${c.a}/${c.b}`), "the models that cannot separate them")
      .toEqual(["protan c1/c4", "deutan c1/c4"]);
    expect(collapsed[0]?.deltaE, "protan").toBeCloseTo(2.6, 1);
    expect(collapsed[1]?.deltaE, "deutan").toBeCloseTo(0.6, 1);

    // The control: the set the floor is calibrated on has no pair under it, and
    // the empty list is what is asserted — an `expect(...).toHaveLength(0)` on
    // a reader that returned nothing at all would pass identically, which is
    // why the row above drives the same function to a non-empty answer first.
    expect(collisions(OKABE_ITO_CANONICAL), "canonical Okabe-Ito").toEqual([]);

    // A floor the caller supplies, so the debt list is not the only reading —
    // canonical's own worst pair is 7.9, so a floor of eight finds it.
    expect(collisions(OKABE_ITO_CANONICAL, 8).map((c) => `${c.vision} ${c.a}/${c.b}`), "at a floor of eight")
      .toEqual(["tritan orange/reddishPurple"]);
  });
});
