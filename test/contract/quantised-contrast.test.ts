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
  loadTheme,
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
import { quantisedShortfalls, validateQuantisedFloors } from "../../src/presentation/theme/resolve.js";
import { EIGHT_BIT_SHORTFALLS, FOUR_BIT_SHORTFALLS } from "../support/quantised-shortfalls.js";
import { TONES, caps, store } from "../support/theme.js";

const listed = (theme: ResolvedTheme, depth: 8 | 4): readonly string[] =>
  quantisedShortfalls(theme, depth).map((e) => `${e.path} ${e.measured.toFixed(2)}`);

const NAMES = Object.keys(defaultTheme).sort();

/**
 * **A ground no cube entry admits** (C10 §4c.4, what the rulings leave behind):
 * a floor of 7, a mid-grey focus ground and a black ink composed on it beside
 * the light ones. White needs the ground below 0.1 luminance and black needs it
 * above 0.3, so its cells are short at 8 bits — and at 24, where the gate
 * refuses it too.
 */
const unholdable = (tokens: ThemeTokens): ThemeTokens => {
  const focus = "surface.focusGround";
  return {
    ...tokens,
    floor: 7,
    surfaces: { ...tokens.surfaces, focusGround: "#777777" },
    composed: { ...tokens.composed, [focus]: { ...tokens.composed?.[focus], "tone.default": "#000000" } },
  };
};

/**
 * **The floor held by changing side** (C10 §4c.4 row 13): `hcDark` at a floor of
 * 4.57 with a `diffAdd` both black and white clear at 24 bits, `ok` composed
 * black on it and its other inks white. Every 24-bit cell clears; at 8 bits the
 * ground falls to `#767676`, where only black reaches 4.57, so every ink on it
 * paints black.
 */
const sideFlip = (tokens: ThemeTokens): ThemeTokens => {
  const refs = textGrounds(tokens).find(([ground]) => ground === "diffAdd")![2];
  const inks = Object.fromEntries(refs.map((ref) => [ref, ref === "tone.ok" ? "#000000" : "#ffffff"]));
  return {
    ...tokens,
    floor: 4.57,
    surfaces: { ...tokens.surfaces, diffAdd: "#767575" },
    composed: { ...tokens.composed, "surface.diffAdd": { ...tokens.composed?.["surface.diffAdd"], ...inks } },
  };
};

/** The gate's distinctness errors (C10 I17 as a refusal), told apart by wording. */
const shared = (errors: readonly { path: string; message: string }[]): readonly { path: string; message: string }[] =>
  errors.filter((e) => e.message.includes("I17 keeps them apart"));

/** The gate's own errors, told from the 24-bit validators' by their wording. */
const at256 = (errors: readonly { path: string; message: string }[]): readonly { path: string; message: string }[] =>
  errors.filter((e) => e.message.includes("as a 256-colour terminal paints the pair"));

/** The hex an 8-bit style paints, through the cube the standard fixes. */
const painted = (style: Style, channel: "colour" | "background" = "colour"): string => {
  const value = style[channel];
  if (value?.kind !== "ansi256") throw new Error(`not an 8-bit ${channel}: ${JSON.stringify(style)}`);
  return cubeHexOf(value.index)!;
};

describe("C10 I68 — quantised contrast", () => {
  it("T2.74 (C10 I68, I69, I26, I54): at 8 bits every shipped theme's shortfalls are the recorded list, and it is empty", () => {
    // **This row is the shipped themes' 8-bit floor gate** (C10 I70): the store
    // does not measure a shipped projection at load, so a registry change that
    // put a cell below its floor is caught here, in the suite, and nowhere else.
    //
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
    const control: ResolvedTheme = { ...dark, name: "dark/quantised-control", tokens: unholdable(dark.tokens) };
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
  it("T2.79 (C10 I17, PARKED 79, §4c.4 row 12): at 8 bits no tone of the five shares muted's index on any shipped ground unless the two carry one value", () => {
    // The five by name and not read from `MUST_STAY_DISTINCT`: the subject is
    // what the resolver paints, and the membership is the curated pin's.
    const five = ["ok", "warn", "error", "info", "accent"];

    let cells = 0;
    for (const name of NAMES) {
      const theme = store(name).current;
      for (const on of [undefined, ...textGrounds(theme.tokens).map(([ground]) => ground)]) {
        const at = (tone: string, depth: 8 | 24) => resolve(`tone.${tone}`, theme, caps(depth), on).colour;
        const muted = at("muted", 8);
        for (const tone of five) {
          // A set giving the two one value is one ink, not a collision (row 6).
          if (JSON.stringify(at(tone, 24)) === JSON.stringify(at("muted", 24))) continue;
          expect(at(tone, 8), `${name} on ${on ?? "the page"}: tone.${tone} against muted`).not.toEqual(muted);
          cells += 1;
        }
      }
    }
    // Ten themes, the page and every text ground, five tones: not an empty agreement.
    expect(cells, "measured when PARKED 79 landed").toBe(340);

    // **The case the ruling was written for**, and which of the two moves: the
    // repair walks the set darkest first, so the lighter claimant yields and
    // `info` keeps the grey the floor gave it.
    const paper = store("paper").current;
    expect(resolve("tone.info", paper, caps(8)).colour, "paper's info on its page").toEqual({ kind: "ansi256", index: 242 });
    expect(resolve("tone.muted", paper, caps(8)).colour, "paper's muted on its page").toEqual({ kind: "ansi256", index: 243 });

    // **A constructed pair, and its control.** Alone, each is nearest 242; in
    // one set they part; given one value they are one ink again.
    expect(computeQuantisation({ info: "#6c6c6c" })["info"], "info alone").toBe(242);
    expect(computeQuantisation({ muted: "#6c6c6d" })["muted"], "muted alone").toBe(242);
    const pair = computeQuantisation({ info: "#6c6c6c", muted: "#6c6c6d" });
    expect(pair["info"], "together, they part").not.toBe(pair["muted"]);
    const one = computeQuantisation({ info: "#6c6c6c", muted: "#6c6c6c" });
    expect(one["info"], "one value is one ink").toBe(one["muted"]);
  });

  it("T2.80 (C10 I70, I4, I11, §4c.4 row 13): loadTheme and applyOverrides refuse the 256-colour cells beside the 24-bit reasons, and the verdict is kept only for a frozen set", () => {
    // The shipped set loads, and the gate is part of what it passed.
    expect(loadTheme(defaultTheme).ok, "defaultTheme loads").toBe(true);
    for (const name of NAMES) expect(validateQuantisedFloors(defaultTheme[name]!), name).toEqual([]);

    // **`loadTheme`**: T2.74's control, refused at 24 bits too — which is the
    // only kind of theme the gate can refuse (C10 I70), so its cells arrive beside
    // those reasons, one per ink on the ground no cube entry admits.
    const dark = defaultTheme["dark"]!;
    const loaded = loadTheme({ dark: unholdable(dark) });
    const errors = loaded.ok ? [] : loaded.error;
    const cells = at256(errors);
    expect(cells, "a 256-colour cell for every ink on the focus ground").toHaveLength(19);
    expect(cells.filter((e) => !e.message.includes(" on focusGround as ")), "and on no other ground").toEqual([]);
    expect(cells.map((e) => e.path), "named by the slot").toContain("dark.palettes.tone.default");
    expect(errors.length, "beside the 24-bit reasons").toBeGreaterThan(cells.length);

    // **`applyOverrides`**: a black `ok` on a mid-grey page puts inks on both
    // sides of `bg` at hcDark's 7. Refused whole, and nothing moves (C10 I4).
    const hc = store("hcDark");
    const before = hc.current;
    const refused = at256(hc.applyOverrides({ palettes: { tone: { ok: "#000000" } }, surfaces: { bg: "#777777" } }));
    expect(refused, "every ink on the page").toHaveLength(19);
    expect(refused.filter((e) => !e.message.includes(" on bg as ")), "and only there").toEqual([]);
    expect(hc.current, "the theme is the one it was").toBe(before);

    // **The verdict is kept for a frozen set, and only for one.**
    expect(validateQuantisedFloors(dark), "the shipped set's answer, once").toBe(validateQuantisedFloors(dark));
    const mutable = structuredClone(dark) as { -readonly [K in keyof ThemeTokens]: ThemeTokens[K] };
    expect(validateQuantisedFloors(mutable), "a mutable copy of dark").toEqual([]);
    Object.assign(mutable, unholdable(mutable));
    expect(validateQuantisedFloors(mutable), "mutated into the control, it is measured again").toHaveLength(19);

    // **The scratch name is forgotten** (C10 I11): a set measured after the
    // control reads its own picks, not the control's.
    expect(validateQuantisedFloors(unholdable(dark))).toHaveLength(19);
    expect(validateQuantisedFloors(structuredClone(dark)), "dark after the control").toEqual([]);
  });

  it("T2.81 (C10 I17, I70, §4c.4 row 13): two of I17's six sharing an index on a measured ground is refused, naming the ground, the slots and the index", () => {
    // **The shipped half, which the store no longer measures** (C10 I70): no
    // shipped theme has a shared index on any ground the gate measures.
    for (const name of NAMES) expect(shared(validateQuantisedFloors(defaultTheme[name]!)), name).toEqual([]);

    // **The silent case made loud.** It loaded before this row: every 24-bit
    // cell clears and no 8-bit cell is short, and `ok` painted the same black as
    // `error` and `muted`.
    const hcDark = defaultTheme["hcDark"]!;
    const flipped = loadTheme({ flipped: sideFlip(hcDark) });
    expect(flipped.ok ? [] : flipped.error, "refused, and for this alone").toEqual([
      {
        path: "flipped.palettes.tone.ok",
        message:
          '"tone.ok", "tone.error", "tone.muted" all paint index 16 on diffAdd as a 256-colour terminal paints them — the floor there leaves no entry that keeps them apart, and C10 I17 keeps them apart',
      },
    ]);

    // **An override that forces it, and a control that holds distinct.** A
    // mid-grey `diffAdd` on hcDark leaves white the only ink that reaches 7.
    const store_ = store("hcDark");
    const before = store_.current;
    const forced = shared(store_.applyOverrides({ surfaces: { diffAdd: "#777777" } }));
    expect(forced.map((e) => e.path), "one shared index").toEqual(["hcDark.palettes.tone.ok"]);
    expect(forced[0]!.message).toContain("index 231 on diffAdd");
    expect(store_.current, "refused whole").toBe(before);

    expect(store_.applyOverrides({ surfaces: { diffAdd: "#003800" } }), "a darker green is accepted").toEqual([]);
    expect(store_.current, "and applied").not.toBe(before);
    const six = ["ok", "warn", "error", "info", "accent", "muted"].map((tone) => {
      const colour = resolve(`tone.${tone}`, store_.current, caps(8), "diffAdd").colour;
      return colour?.kind === "ansi256" ? colour.index : -1;
    });
    expect(new Set(six).size, `six indices on the accepted ground: ${six.join(" ")}`).toBe(6);
  });
});
