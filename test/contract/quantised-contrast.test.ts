// C10 I68 — the floor at the rungs below 24-bit, ink and ground as the
// resolver paints them.
//
// **Two lists, held by equality, and they mean different things.** At 8 bits
// the cube's RGB is fixed, so every shortfall is a defect and the list is owed;
// at 4 bits the ratios are against the reference palette, so the list is an
// exemption list in T2.64's shape. Both are recorded in
// `test/support/quantised-shortfalls.ts`, and a remedy empties them there.
import { describe, expect, it } from "vitest";
import { defaultTheme, inkOn, ratio, resolve, resolveBackground } from "../../src/presentation/theme/index.js";
import { ANSI16_HEX } from "../../src/presentation/theme/colormap.js";
import type { ResolvedTheme, ThemeTokens } from "../../src/presentation/theme/types.js";
import { quantisedShortfalls } from "../support/quantised-contrast.js";
import { EIGHT_BIT_SHORTFALLS, FOUR_BIT_SHORTFALLS } from "../support/quantised-shortfalls.js";
import { caps, store } from "../support/theme.js";

const listed = (theme: ResolvedTheme, depth: 8 | 4): readonly string[] =>
  quantisedShortfalls(theme, depth).map((e) => `${e.path} ${e.measured.toFixed(2)}`);

const NAMES = Object.keys(defaultTheme).sort();

describe("C10 I68 — quantised contrast", () => {
  it("T2.74 (C10 I68, I26, I54): at 8 bits every shipped theme's shortfalls are the recorded defect list, each one the rung's", () => {
    // **The lists cover the set, both ways**: a theme added with no list, or a
    // list left behind by a retired theme, fails here before any entry is read.
    expect(Object.keys(EIGHT_BIT_SHORTFALLS).sort(), "one recorded list per shipped theme").toEqual(NAMES);

    let total = 0;
    for (const name of NAMES) {
      const theme = store(name).current;
      expect(listed(theme, 8), `${name} at 8 bits`).toEqual(EIGHT_BIT_SHORTFALLS[name]);
      total += listed(theme, 8).length;

      // **Every entry clears its floor at 24 bits**, so every entry is what the
      // cube did and never a wider scope than the load-time gate's (C10 I68).
      const tokens = theme.tokens;
      const grounds = tokens.surfaces as Readonly<Record<string, string>>;
      for (const { path, need } of quantisedShortfalls(theme, 8)) {
        if (path.startsWith("hueBand.")) {
          const hue = tokens.hues?.[path.slice("hueBand.".length)];
          expect(hue, `${name} ${path} is a hue the theme carries`).toBeDefined();
          expect(ratio(hue!.on, hue!.ground), `${name} ${path} at 24 bits`).toBeGreaterThanOrEqual(need);
          continue;
        }
        const ground = path.slice(0, path.indexOf("."));
        const ref = path.slice(ground.length + 1);
        const hex = grounds[ground];
        expect(hex, `${name} ${path}: a ground the theme paints`).toBeDefined();
        expect(ratio(inkOn(tokens, ref, ground), hex!), `${name} ${path} at 24 bits`).toBeGreaterThanOrEqual(need);
      }
    }
    expect(total, "193, as measured when I68 landed").toBe(193);

    // **The instrument answers a constructed case.** `tone.default` moved to the
    // page's own hex, under its own name because the resolver's memo is keyed on
    // it: the cell appears on each page ground, where the shipped `dark` has none.
    const dark = store("dark").current;
    const pageInk: ThemeTokens = {
      ...dark.tokens,
      palettes: {
        ...dark.tokens.palettes,
        tone: {
          ...dark.tokens.palettes["tone"]!,
          slots: { ...dark.tokens.palettes["tone"]!.slots, default: dark.tokens.surfaces.bg },
        },
      },
    };
    const control: ResolvedTheme = { ...dark, name: "dark/quantised-control", tokens: pageInk };
    const paths = (theme: ResolvedTheme): readonly string[] => quantisedShortfalls(theme, 8).map((e) => e.path);
    for (const ground of ["bg", "bgElev", "focusGround"]) {
      expect(paths(control), `the constructed ink on ${ground}`).toContain(`${ground}.tone.default`);
      expect(paths(dark), `and the shipped one is clear on ${ground}`).not.toContain(`${ground}.tone.default`);
    }
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
    expect(Math.round(ratio(ANSI16_HEX[4]!, ANSI16_HEX[15]!) * 100) / 100).toBe(16.01);
    expect(
      FOUR_BIT_SHORTFALLS["light"]!.filter((e) => /^(bg|bgElev|focusGround)\.tone\.info /.test(e)),
      "and is on no page ground's list",
    ).toEqual([]);
    expect(resolve("syntax.function", dark, caps(4)).colour, "dark's function is index 12").toEqual({ kind: "ansi16", index: 12 });
    expect(FOUR_BIT_SHORTFALLS["dark"]).toContain("bg.syntax.function 2.44");
  });
});
