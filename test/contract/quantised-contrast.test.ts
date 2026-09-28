// C10 I68 — the floor at the rungs below 24-bit, ink and ground as the
// resolver paints them — and C10 I69, the quantiser holding it at 8 bits.
//
// **Two lists, held by equality, and they mean different things.** At 8 bits
// the cube's RGB is fixed, so every shortfall was a defect and the list was
// owed — I69 emptied it; at 4 bits the ratios are against the reference
// palette, so the list is an exemption list in T2.64's shape. Both are recorded
// in `test/support/quantised-shortfalls.ts`.
import { describe, expect, it } from "vitest";
import {
  defaultTheme,
  floorFor,
  inkOn,
  luminance,
  quantisedHex,
  ratio,
  resolve,
  resolveBackground,
  resolveHueBand,
  textGrounds,
} from "../../src/presentation/theme/index.js";
import { ANSI16_WINDOWS_HEX } from "../../src/presentation/theme/colormap.js";
import { computeQuantisation, cubeHexOf, quantiseSet } from "../../src/presentation/theme/quantise.js";
import type { ColourRef, ResolvedTheme, Style, ThemeTokens } from "../../src/presentation/theme/types.js";
import { quantisedShortfalls } from "../support/quantised-contrast.js";
import { EIGHT_BIT_SHORTFALLS, FOUR_BIT_SHORTFALLS } from "../support/quantised-shortfalls.js";
import { TONES, caps, store } from "../support/theme.js";

const listed = (theme: ResolvedTheme, depth: 8 | 4): readonly string[] =>
  quantisedShortfalls(theme, depth).map((e) => `${e.path} ${e.measured.toFixed(2)}`);

const NAMES = Object.keys(defaultTheme).sort();

/** The hex an 8-bit style paints, through the cube the standard fixes. */
const painted = (style: Style, channel: "colour" | "background" = "colour"): string => {
  const value = style[channel];
  if (value?.kind !== "ansi256") throw new Error(`not an 8-bit ${channel}: ${JSON.stringify(style)}`);
  return cubeHexOf(value.index)!;
};

describe("C10 I68 — quantised contrast", () => {
  it("T2.74 (C10 I68, I69, I26, I54): at 8 bits every shipped theme's shortfalls are the recorded list, and it is empty", () => {
    // **The lists cover the set, both ways**: a theme added with no list, or a
    // list left behind by a retired theme, fails here before any entry is read.
    expect(Object.keys(EIGHT_BIT_SHORTFALLS).sort(), "one recorded list per shipped theme").toEqual(NAMES);

    let total = 0;
    for (const name of NAMES) {
      const theme = store(name).current;
      expect(listed(theme, 8), `${name} at 8 bits`).toEqual(EIGHT_BIT_SHORTFALLS[name]);
      total += listed(theme, 8).length;
    }
    expect(total, "193 when C10 I68 landed, and none since C10 I69").toBe(0);

    // **The instrument answers a case the quantiser cannot hold**, because an
    // empty list is also what an instrument that reads nothing returns. A floor
    // of 7, a mid-grey focus ground and a black ink composed on it beside the
    // light ones: white needs the ground below 0.1 luminance and black needs it
    // above 0.3, so no cube entry admits it (C10 §4c.4, what the rulings leave
    // behind). Such a theme is refused at 24 bits too; it is built past
    // `loadTheme`, under its own name because the resolver's memo is keyed on it.
    const dark = store("dark").current;
    const focus = "surface.focusGround";
    const unholdable: ThemeTokens = {
      ...dark.tokens,
      floor: 7,
      surfaces: { ...dark.tokens.surfaces, focusGround: "#777777" },
      composed: { ...dark.tokens.composed, [focus]: { ...dark.tokens.composed?.[focus], "tone.default": "#000000" } },
    };
    const control: ResolvedTheme = { ...dark, name: "dark/quantised-control", tokens: unholdable };
    const paths = quantisedShortfalls(control, 8).map((e) => e.path);
    expect(paths, "the unholdable ground's cells are reported").toContain("focusGround.tone.default");
    expect(paths.filter((p) => !p.startsWith("focusGround.")), "and only that ground's").toEqual([]);
    // With no assignment, each surface takes its nearest admitted entry and this
    // one, admitted nowhere, its nearest: `#767676`, where black is 4.6 and white
    // 4.5 (§4c.4 row 5).
    expect(resolveBackground(focus, control, caps(8)).background, "the ground no entry admits is its nearest").toEqual({ kind: "ansi256", index: 243 });
  });

  it("T2.75 (C10 I68, I61): at 4 bits every shipped theme's shortfalls against the reference palette are its map's recorded list", () => {
    expect(Object.keys(FOUR_BIT_SHORTFALLS).sort(), "one recorded list per shipped theme").toEqual(NAMES);

    let total = 0;
    for (const name of NAMES) {
      const theme = store(name).current;
      expect(listed(theme, 4), `${name} at 4 bits`).toEqual(FOUR_BIT_SHORTFALLS[name]);
      total += listed(theme, 4).length;
      // The ten-hue 4-bit map does not exist (C10 I55), so no hue band is a cell.
      expect(listed(theme, 4).filter((e) => e.startsWith("hueBand.")), `${name}: no hue band at 4 bits`).toEqual([]);
    }
    expect(total, "403, as measured when I68 landed").toBe(403);

    // **A ground the resolver does not paint is the page.** `dark` has no 4-bit
    // band and no curated `focusGround`, so its focus cells are its page cells.
    const dark = store("dark").current;
    expect(resolveBackground("surface.focusGround", dark, caps(4)), "no 4-bit focus ground on dark").toEqual({});
    const on = (prefix: string): readonly string[] =>
      listed(dark, 4).filter((e) => e.startsWith(`${prefix}.`)).map((e) => e.slice(prefix.length + 1));
    expect(on("focusGround"), "measured on the page").toEqual(on("bg"));
    expect(on("focusGround").length, "and not an empty agreement").toBeGreaterThan(0);

    // **The dim blue, resolved by measurement** (C10 I68). Not `light`'s `tone.info`,
    // which the resolver puts on index 4 — navy on white, 16.01 : 1 — but index
    // 12 on the dark map's black page.
    const light = store("light").current;
    expect(resolve("tone.info", light, caps(4)).colour, "light's info is index 4").toEqual({ kind: "ansi16", index: 4 });
    expect(Math.round(ratio(ANSI16_WINDOWS_HEX[4]!, ANSI16_WINDOWS_HEX[15]!) * 100) / 100).toBe(16.01);
    expect(
      FOUR_BIT_SHORTFALLS["light"]!.filter((e) => /^(bg|bgElev|focusGround)\.tone\.info /.test(e)),
      "and is on no page ground's list",
    ).toEqual([]);
    expect(resolve("syntax.function", dark, caps(4)).colour, "dark's function is index 12").toEqual({ kind: "ansi16", index: 12 });
    expect(FOUR_BIT_SHORTFALLS["dark"]).toContain("bg.syntax.function 2.44");
  });
});

describe("C10 I69 — the quantiser holds the floor", () => {
  it("T2.76 (C10 I69, §4c.4 rows 1, 3, 8, 10, 11): each shape at its cell, against the nearest set, and the page held as bg", () => {
    const c8 = caps(8);

    // (a) The ground no ink could clear. The nearest set gives hcDark's focus
    // band #005faf, where the band's white is below the 7 the theme declares.
    const hcDark = store("hcDark").current;
    const surfaces = hcDark.tokens.surfaces as Readonly<Record<string, string>>;
    const near = quantiseSet(surfaces)["focusGround"]!;
    expect(cubeHexOf(near), "the nearest entry to #234f92").toBe("#005faf");
    expect(ratio("#ffffff", cubeHexOf(near)!), "and white on it misses 7").toBeLessThan(7);
    const focus = painted(resolveBackground("surface.focusGround", hcDark, c8), "background");
    expect(focus, "the ground the floor admits").toBe("#005f87");
    for (const tone of TONES) {
      expect(ratio(painted(resolve(`tone.${tone}`, hcDark, c8, "focusGround")), focus), `hcDark tone.${tone} on its focus band`).toBeGreaterThanOrEqual(7);
    }
    expect(quantisedHex(hcDark.tokens, "focusGround"), "and the load gate reads the ground painted").toBe("#005f87");

    // (b) The hue band: the ground moves, and the band's ink does not.
    const dark = store("dark").current;
    const grounds = Object.fromEntries(Object.entries(dark.tokens.hues ?? {}).map(([k, v]) => [k, v.ground]));
    const nearPurple = cubeHexOf(quantiseSet(grounds)["purple"]!)!;
    expect(nearPurple, "the nearest entry to purple's ground").toBe("#af5fff");
    expect(ratio(dark.tokens.hues!["purple"]!.on, nearPurple), "and its ink misses 4.5 there").toBeLessThan(4.5);
    const band = resolveHueBand(dark, "purple", c8)!;
    expect(painted(band.ground, "background"), "the purple ground the floor admits").toBe("#875fd7");
    expect(ratio(painted(band.ink), painted(band.ground, "background")), "and its ink clears").toBeGreaterThanOrEqual(4.5);

    // (c) An ink whose nearest entry misses while a clearing one exists.
    const elev = painted(resolveBackground("surface.bgElev", dark, c8), "background");
    const composed = Object.fromEntries(
      Object.keys(dark.tokens.palettes["syntax"]!.slots).map((s) => [s, inkOn(dark.tokens, `syntax.${s}`, "bgElev")]),
    );
    const need = floorFor("comment");
    expect(ratio(cubeHexOf(quantiseSet(composed)["comment"]!)!, elev), "the nearest comment on bgElev misses").toBeLessThan(need);
    expect(ratio(painted(resolve("syntax.comment", dark, c8, "bgElev")), elev), "and the held one clears").toBeGreaterThanOrEqual(need);

    // The page is `bg` (§4c.4 row 8): a ref resolved on no ground is held
    // exactly as on `bg`, in every theme — which is what the page's painters,
    // who pass no ground, draw.
    for (const name of NAMES) {
      const theme = store(name).current;
      for (const [palette, spec] of Object.entries(theme.tokens.palettes)) {
        for (const slot of Object.keys(spec.slots)) {
          const ref = `${palette}.${slot}` as ColourRef;
          expect(resolve(ref, theme, c8), `${name} ${ref}: the page is bg`).toEqual(resolve(ref, theme, c8, "bg"));
        }
      }
    }
  });

  it("T2.77 (C10 I69, I6, I17, §4c.4 rows 2 and 4): the only ranked pairs the floor inverts are paper's accent and ok, and there ok and info stay apart", () => {
    // `TIE` in `quantise.ts`: below it two luminances are noise, not a rank (I6).
    const TIE = 0.02;
    const c8 = caps(8);
    const inverted: string[] = [];
    for (const name of NAMES) {
      const theme = store(name).current;
      const tokens = theme.tokens;
      const grounds = [undefined, ...new Set(textGrounds(tokens).map(([ground]) => ground))];
      for (const [palette, spec] of Object.entries(tokens.palettes)) {
        for (const ground of grounds) {
          const slots = Object.keys(spec.slots);
          const source = (s: string): string => (ground === undefined ? spec.slots[s]! : inkOn(tokens, `${palette}.${s}`, ground) || spec.slots[s]!);
          const at = (s: string): number => luminance(painted(resolve(`${palette}.${s}` as ColourRef, theme, c8, ground)));
          for (const a of slots) {
            for (const b of slots) {
              if (luminance(source(b)) - luminance(source(a)) >= TIE && at(b) < at(a)) {
                inverted.push(`${name} ${ground ?? "page"} ${palette}: ${a} < ${b}`);
              }
            }
          }
        }
      }
    }
    expect(inverted, "the ruled inversions, and no others").toEqual([
      "paper page tone: accent < ok",
      "paper bg tone: accent < ok",
      "paper bgElev tone: accent < ok",
    ]);

    // Row 4's order: the floor first, then distinctness, then rank.
    const paper = store("paper").current;
    for (const ground of [undefined, "bg", "bgElev"]) {
      const under = painted(resolveBackground(`surface.${ground ?? "bg"}`, paper, c8), "background");
      const ok = resolve("tone.ok", paper, c8, ground);
      const info = resolve("tone.info", paper, c8, ground);
      expect(ok.colour, `paper ${ground ?? "page"}: ok and info apart`).not.toEqual(info.colour);
      expect(ratio(painted(ok), under), `paper ${ground ?? "page"}: ok clears`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(painted(info), under), `paper ${ground ?? "page"}: info clears`).toBeGreaterThanOrEqual(4.5);
    }

    // **And the second step, which no shipped set reaches**: `paper`'s `ok` finds
    // a free entry that clears as its nearest, so the step that takes a free
    // entry *outside* the rank window is invisible there. Constructed: three
    // tones one level apart, each admitting only `#005f00` and `#ffffff`. All
    // three land on the green; `info`'s window between `ok` and `warn` is that
    // one taken entry, so distinctness takes the white before rank keeps it.
    const two = (hex: string): boolean => hex === "#005f00" || hex === "#ffffff";
    const picks = computeQuantisation({ ok: "#3f7040", info: "#3f7041", warn: "#3f7042" }, { ok: two, info: two, warn: two });
    expect(cubeHexOf(picks["ok"]!), "ok takes the nearest admitted entry").toBe("#005f00");
    expect(cubeHexOf(picks["info"]!), "info takes a free one outside its window, not ok's").toBe("#ffffff");
  });

  it("T2.78 (C10 I17, R-THM-005, §4c.4 row 6): at 8 bits a band's every tone is its one ink", () => {
    for (const name of ["hcDark", "hcLight"]) {
      const theme = store(name).current;
      for (const band of ["focusGround", "selection"]) {
        const indices = new Set(TONES.map((tone) => JSON.stringify(resolve(`tone.${tone}`, theme, caps(8), band).colour)));
        expect([...indices], `${name} ${band}: one ink`).toHaveLength(1);
      }
    }
  });
});

describe("C10 I17 and I70 — muted kept apart, and the 8-bit floor as a load gate", () => {
  it.todo("T2.79 (C10 I17, PARKED 79): at 8 bits no tone of the five shares muted's index on any shipped ground unless the two carry one value, paper's page gives info 242 and muted 243, and a constructed pair each at 242 alone splits — not deferred on a component: the code lands in the next commit of this round");
  it.todo("T2.80 (C10 I70, I4, I11): loadTheme and applyOverrides refuse the 256-colour cells beside the 24-bit reasons, the shipped set loads, the verdict is kept only for a frozen token set, and the scratch name is forgotten — not deferred on a component: the code lands in the next commit of this round");
});
