/**
 * C10 §3 — the degradation ladder.
 *
 * | Depth | Resolution |
 * |---|---|
 * | 24 | the hex, verbatim |
 * | 8  | nearest entry in the 256-colour cube by perceptual distance, rank order preserved, the floor held (I69) |
 * | 4  | the theme's curated map — never computed |
 * | 1  | no colour at all; typographic class only |
 *
 * **A palette resolves as a set**, once per `(theme, palette, depth)`. Rank order
 * and distinctness are properties of the set, and a per-slot nearest neighbour
 * can see neither: it will happily quantise `dim` above `default` and land `ok`
 * and `info` on the same green, and both failures are invisible in the
 * truecolour terminal where every value was authored.
 */

import type { Tone } from "../../data/viewmodel/index.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";
import { ANSI16_WINDOWS_HEX } from "./colormap.js";
import { DEFAULT_FLOOR, decorationTextPairs, floorFor, inkOn, isHex, luminance, ratio, textGrounds } from "./contrast.js";
import { computeQuantisation, cubeHexOf, quantiseSet, type Admits } from "./quantise.js";
import {
  NO_STYLE,
  type ColourRef,
  type ColourValue,
  type MonoClass,
  type PaletteSpec,
  type ResolvedTheme,
  type Style,
  type ThemeError,
  type ThemeTokens,
} from "./types.js";

type Depth = TerminalCapabilities["colourDepth"];

/**
 * Only the depth is read, and the whole record is taken so the call site reads
 * as "resolve against these capabilities" rather than as a number nobody can
 * trace back. C10 reads no environment; capabilities arrive injected (I12).
 */
type Caps = Readonly<Pick<TerminalCapabilities, "colourDepth">>;

const FOUR_BIT: Caps = Object.freeze({ colourDepth: 4 });

/**
 * Whether `surface` is painted as a band at these capabilities (I66): a
 * ground, and one ink for every slot drawn on it.
 *
 * **The resolver's answer, and the resolver reads it.** At 24 and 8 bits the
 * band is the theme's `bandInk` entry, composed through `inkOn` (I48); at 4
 * bits it is that **and** the curated pair (I61), since the flat map spreads a
 * band's one ink across one index per tone; at 1 bit no surface is painted at
 * all (I8). `isBand` asked the tokens alone and said *band* at 1 bit where
 * nothing is — which the head mark's own depth clause hid, and the render
 * cache's `washed` axis did not (C14 I54).
 */
export function bandAt(theme: ResolvedTheme, surface: string, caps: Caps): boolean {
  if (caps.colourDepth === 1) return false;
  if (theme.tokens.bandInk?.[surface] === undefined) return false;
  return caps.colourDepth !== 4 || theme.tokens.bandFourBit?.[surface] !== undefined;
}


// --- 1-bit ------------------------------------------------------------------

const MONO: Readonly<Record<MonoClass, Style>> = Object.freeze({
  emphasised: Object.freeze({ bold: true }),
  normal: NO_STYLE,
  deemphasised: Object.freeze({ dim: true }),
});

// --- the cache --------------------------------------------------------------

/**
 * Keyed on `(ref, theme.name, depth)` — I11. `theme.name` carries the variant
 * and a serial that changes when overrides are applied, so a warm cache cannot
 * serve a pre-override style even before `clear()` runs. Depth is in the key
 * because it changes at runtime through a config override (T3.8), and a cache
 * keyed on the ref alone returns a truecolour style to a terminal that has since
 * been found to have sixteen.
 */
const styles = new Map<string, Style>();
const quantised = new Map<string, Readonly<Record<string, number>>>();

export function clearResolutionCache(): void {
  styles.clear();
  quantised.clear();
}

/** For T2.2 and T3.8 — the tests assert behaviour, not the cache's existence. */
export function cacheSize(): number {
  return styles.size;
}

function quantisedFor(
  theme: ResolvedTheme,
  palette: string,
  slots: Readonly<Record<string, string>>,
  admits?: () => Admits | undefined,
): Readonly<Record<string, number>> {
  const key = `${theme.name}|${palette}`;
  const held = quantised.get(key);
  if (held !== undefined) return held;

  const built = holdFloor(slots, admits?.());
  quantised.set(key, built);
  return built;
}

// --- the floor, held at 8-bit (I69) -----------------------------------------

/**
 * **The set's picks, and the DP again with the floor as a constraint where a
 * pick misses it** (I69). The nearest set comes first — the shipped table's
 * entry where it holds one (I41), so a set whose every pick already clears is
 * the table's own object and the DP never runs — and only a set with a refused
 * pick is assigned again, as one problem, so rank (I6) and distinctness (I17)
 * are held by the same computation that holds the floor. A pass that re-picked
 * the refused slots alone would move a slot past a neighbour it was ranked
 * below, which is §3's greedy walk arriving by a second door.
 */
function holdFloor(slots: Readonly<Record<string, string>>, admits: Admits | undefined): Readonly<Record<string, number>> {
  const nearest = quantiseSet(slots);
  if (admits === undefined) return nearest;
  const refused = Object.entries(admits).some(([slot, admit]) => {
    const index = nearest[slot];
    const hex = index === undefined ? null : cubeHexOf(index);
    return hex !== null && !admit(hex);
  });
  return refused ? computeQuantisation(slots, admits) : nearest;
}

/**
 * **The 24-bit gate's scope, as a need per `(ground, ref)`** (I68's cells): every
 * `textGrounds` ref held to `max(floorFor(slot), floor)` as
 * `validateHighContrast` holds it, and every `decorationTextPairs` cell to
 * `DEFAULT_FLOOR` as `validateDecorationText` does. **No wider**: a ground the
 * gate does not measure text on holds nothing here, because a floor enforced
 * at 8-bit where the author was never told of one at 24 is a constraint nobody
 * can see the reason for.
 */
const scopes = new WeakMap<ThemeTokens, ReadonlyMap<string, ReadonlyMap<string, number>>>();

function floorsOn(tokens: ThemeTokens): ReadonlyMap<string, ReadonlyMap<string, number>> {
  const held = scopes.get(tokens);
  if (held !== undefined) return held;
  const out = new Map<string, Map<string, number>>();
  const need = (ground: string, ref: string, value: number): void => {
    const cells = out.get(ground) ?? new Map<string, number>();
    cells.set(ref, Math.max(cells.get(ref) ?? 0, value));
    out.set(ground, cells);
  };
  for (const [ground, , refs] of textGrounds(tokens)) {
    for (const ref of refs) need(ground, ref, Math.max(floorFor(ref.slice(ref.indexOf(".") + 1)), tokens.floor ?? 0));
  }
  for (const [palette, slot, ground] of decorationTextPairs(tokens)) need(ground, `${palette}.${slot}`, DEFAULT_FLOOR);
  // Kept only for a set frozen throughout, as the gate's verdict is (C10 I70):
  // a token object mutated between two measurements was held to its first
  // shape's needs — 61 cells refused where a fresh copy of it has 19.
  if (frozenThrough(tokens)) scopes.set(tokens, out);
  return out;
}

/**
 * The cube's darkest and lightest entries — `#000000` at 16 and `#ffffff` at
 * 231 — which bound what any ink can reach on a ground.
 */
const DARKEST = cubeHexOf(16)!;
const LIGHTEST = cubeHexOf(231)!;

/**
 * **A ground admits a cube entry on which its inks can reach their floor**
 * (I69). Asked of the cube's extreme on each ink's own side — lighter than the
 * authored ground, or darker — so the answer depends on the tokens and the cube
 * alone, never on an ink's pick, and the surfaces are held before any palette
 * is quantised against them. `hcDark`'s focus band is the case: `#234f92` is
 * nearest `#005faf`, where white is 6.45 against the declared 7, and no ink the
 * cube has reaches 7 there.
 */
function sideNeeds(inks: Iterable<readonly [ink: string, need: number]>, ground: string): (hex: string) => boolean {
  let light = 0;
  let dark = 0;
  for (const [ink, need] of inks) {
    if (!isHex(ink)) continue;
    if (luminance(ink) >= luminance(ground)) light = Math.max(light, need);
    else dark = Math.max(dark, need);
  }
  return (hex) => (light === 0 || ratio(LIGHTEST, hex) >= light) && (dark === 0 || ratio(DARKEST, hex) >= dark);
}

function groundAdmits(tokens: ThemeTokens): Admits {
  const surfaces = tokens.surfaces as Readonly<Record<string, string>>;
  const out: Record<string, (hex: string) => boolean> = {};
  for (const [ground, cells] of floorsOn(tokens)) {
    const hex = surfaces[ground];
    if (hex === undefined || !isHex(hex)) continue;
    out[ground] = sideNeeds([...cells].map(([ref, need]) => [inkOn(tokens, ref, ground), need] as const), hex);
  }
  return out;
}

/**
 * **An ink admits a cube entry that clears its floor on its ground as painted**
 * (I69) — the ground's own quantised hex, never the token.
 */
function inkAdmits(
  tokens: ThemeTokens,
  paletteName: string,
  slots: Readonly<Record<string, string>>,
  ground: string,
  painted: string | null,
): Admits | undefined {
  const cells = floorsOn(tokens).get(ground);
  if (cells === undefined || painted === null) return undefined;
  const out: Record<string, (hex: string) => boolean> = {};
  for (const slot of Object.keys(slots)) {
    const need = cells.get(`${paletteName}.${slot}`);
    if (need !== undefined) out[slot] = (hex) => ratio(hex, painted) >= need;
  }
  return out;
}

function heldSurfaces(theme: ResolvedTheme): Readonly<Record<string, number>> {
  const surfaces = theme.tokens.surfaces as Readonly<Record<string, string>>;
  return quantisedFor(theme, "surface", surfaces, () => groundAdmits(theme.tokens));
}

// --- resolution -------------------------------------------------------------

function split(ref: ColourRef): readonly [string, string] {
  const at = ref.indexOf(".");
  return at === -1 ? [ref, ""] : [ref.slice(0, at), ref.slice(at + 1)];
}

function styleOf(colour: ColourValue | undefined): Style {
  return colour === undefined ? NO_STYLE : Object.freeze({ colour });
}

/**
 * `resolve` is pure and total (I1). Every ref × every capability record yields a
 * `Style`, and an unknown ref yields the empty one rather than a throw — a
 * missing slot must not be the thing that takes a session down mid-render.
 */
export function resolve(ref: ColourRef, theme: ResolvedTheme, caps: Caps, on?: string): Style {
  // **A receded theme answers every ink as `dim`, and it asks the theme it came
  // from** (I59). Here and not in the tokens: rewriting every slot to one hex
  // would quantise a set of identical values at 8-bit, which need not land on
  // the index `tone.dim` takes in its own set — so the redirection is exact at
  // every depth only by being a redirection. A surface is not content.
  if (theme.recedes !== undefined && split(ref)[0] !== "surface") {
    return resolve("tone.dim", theme.recedes, caps, on);
  }
  const key = `${ref}|${theme.name}|${caps.colourDepth}|${on ?? ""}`;
  const held = styles.get(key);
  if (held !== undefined) return held;

  const computed = compute(ref, theme, caps.colourDepth, on);
  styles.set(key, computed);
  return computed;
}

/**
 * The composed slot set for one palette on one ground (I48).
 *
 * **A set, because quantisation is a property of a set** (§3). Composing slot by
 * slot and quantising each on its own would let two inks the theme separated on
 * a band land on one cube entry, which is the failure §3 is written about
 * arriving on a surface instead of on the page.
 *
 * A band answers for every slot, so on a banded ground every entry is the band's
 * one ink — and the set collapses to one value on purpose. That is R-THM-005
 * and not a degenerate case.
 */
function composedSlots(
  theme: ResolvedTheme,
  paletteName: string,
  slots: Readonly<Record<string, string>>,
  on: string,
): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const name of Object.keys(slots)) {
    const composed = inkOn(theme.tokens, `${paletteName}.${name}`, on);
    out[name] = composed === "" ? (slots[name] as string) : composed;
  }
  return out;
}

function compute(ref: ColourRef, theme: ResolvedTheme, depth: Depth, on?: string): Style {
  const [paletteName, slot] = split(ref);

  // **A surface is not composed on another surface.** A ground is the thing a
  // composition is *against*; asking which ink `surface.selection` takes on the
  // focus band is a question no theme answers and none should be asked to.
  if (paletteName === "surface") return surface(ref, slot, theme, depth);

  const palette: PaletteSpec | undefined = theme.tokens.palettes[paletteName];
  const flat = palette?.slots[slot];
  if (palette === undefined || flat === undefined) return NO_STYLE;

  // **The composition step is `inkOn` and not a second copy of the rule** (I48):
  // the band first (R-THM-005), then the theme's `(ground, ref)` value
  // (R-THM-001), then the flat slot. `inkOn` answers `""` for a ref it cannot
  // place, which is the flat slot's cue rather than an error — `resolve` is
  // total (I1) and a missing composition is not a missing slot.
  const composed = on === undefined ? flat : inkOn(theme.tokens, ref, on);
  const hex = composed === "" ? flat : composed;

  if (depth === 1) {
    // A decoration palette has no meaning to preserve, so it collapses to the
    // default foreground. A meaning palette collapses to the class it declared,
    // and that is only lossless because D29 holds: the glyph carries it.
    if (palette.monochrome === "foreground") return NO_STYLE;
    return MONO[palette.classes?.[slot] ?? "normal"];
  }

  if (depth === 24) return styleOf({ kind: "rgb", hex });

  // **Below 24-bit the ground is inert, and it is a limit rather than an
  // omission** (I48). The curated 4-bit map is sixteen entries the theme
  // authored per ref and composed no second time, so there is no composed index
  // to serve; at 1-bit no colour is emitted at all (I2), so there is no ink for
  // a ground to change. A floor is a 24-bit claim and both rungs already depart
  // from the hexes wholesale.
  if (depth === 4) {
    // **A band binds at 4-bit** (I61): its one ink for every ref drawn on it,
    // read before the flat map, which is per ref and would spread that one ink
    // across as many indices as there are tones.
    // Only where `bandAt` says so (I66): a pair with no `bandInk` partner is
    // not a band, and the painters, who ask `bandAt`, must not see one here.
    const band = on !== undefined && bandAt(theme, on, FOUR_BIT) ? theme.tokens.bandFourBit?.[on] : undefined;
    if (band !== undefined) return styleOf({ kind: "ansi16", index: band.ink });
    const index = theme.tokens.fourBit[ref];
    return index === undefined ? NO_STYLE : styleOf({ kind: "ansi16", index });
  }

  // 8-bit carries the theme's own values, so the ground binds — over the
  // composed **set**, keyed by the ground so the page's picks stay the page's.
  // And the floor binds with it (I69): the set is held against its ground as
  // painted, and an absent ground is the page (I48).
  const set = on === undefined ? palette.slots : composedSlots(theme, paletteName, palette.slots, on);
  const ground = on ?? "bg";
  const index = quantisedFor(theme, on === undefined ? paletteName : `${paletteName}@${on}`, set, () => {
    const at = heldSurfaces(theme)[ground];
    return inkAdmits(theme.tokens, paletteName, set, ground, at === undefined ? null : cubeHexOf(at));
  })[slot];
  return index === undefined ? NO_STYLE : styleOf({ kind: "ansi256", index });
}

/**
 * Surfaces follow the same ladder and **vanish entirely at 1-bit** (I8): no
 * background is painted, borders are drawn with box characters alone, and a
 * component asking for a surface receives an empty `Style` rather than black.
 * Black is what a monochrome terminal is already showing.
 */
function surface(ref: ColourRef, slot: string, theme: ResolvedTheme, depth: Depth): Style {
  const hex = (theme.tokens.surfaces as Readonly<Record<string, string>>)[slot];
  if (hex === undefined) return NO_STYLE;

  if (depth === 1) return NO_STYLE;
  if (depth === 24) return styleOf({ kind: "rgb", hex });

  if (depth === 4) {
    // A band's curated ground (I61) — the flat map has no entry for either band.
    const band = bandAt(theme, slot, FOUR_BIT) ? theme.tokens.bandFourBit?.[slot] : undefined;
    if (band !== undefined) return styleOf({ kind: "ansi16", index: band.ground });
    const index = theme.tokens.fourBit[ref];
    return index === undefined ? NO_STYLE : styleOf({ kind: "ansi16", index });
  }

  const index = heldSurfaces(theme)[slot];
  return index === undefined ? NO_STYLE : styleOf({ kind: "ansi256", index });
}

/**
 * The screen's base style — what every cell falls back to (I25, C22 I65).
 *
 * **`NO_STYLE` for a theme that inherits**, which is not a degradation but the
 * declaration: the terminal's own background is what shows, and a translucent
 * one stays translucent. A painting theme resolves `surface.bg` through the
 * ordinary ladder, so the base vanishes at 1-bit exactly as every other surface
 * does (I8) — and at that rung no foreground is coloured either, so the frame is
 * the terminal's own pair and the failure this closes cannot arise.
 */
/**
 * A hue as a BAND — its ground and the ink that reads on it (C10 I53, I55,
 * C22 I114, §070).
 *
 * **Not `resolve("hue.<name>")`, and the difference is which tier is wanted.**
 * The palette carries the hue's *ink*, for a hue used as text; this answers the
 * other two tiers, for a hue used as a painted label. Both come from the one
 * `hues` record, and the ink on a band comes with the band because it is a
 * property of the band — a caller choosing its own ink over a hue is the
 * failure `R-THM-005` exists to prevent.
 *
 * `null` for a name the theme does not carry, and `null` at the two rungs that
 * cannot serve it: at 1-bit no colour is emitted at all (I2), and at 4-bit
 * there is no curated hue map — PARKED 21, because quantising the ten inks
 * mechanically returns six distinct indices and destroys the identities. A
 * caller falling back to its untinted ground is the honest answer at both.
 */
export function resolveHueBand(
  theme: ResolvedTheme,
  name: string,
  caps: Caps,
): Readonly<{ ground: Style; ink: Style }> | null {
  const hue = theme.tokens.hues?.[name];
  if (hue === undefined) return null;
  if (caps.colourDepth === 1 || caps.colourDepth === 4) return null;
  // **The ground is returned on the `background` channel, not the `colour` one.**
  // `withBackground` reads `surface.background` — a ground handed back as a
  // foreground is silently dropped, which is what the first draft did: the ink
  // arrived correct and the band did not, so the label was a contrast ink on no
  // band and the frame read as *the hue is not wired* rather than *one channel
  // is wrong*.
  if (caps.colourDepth === 24) {
    return Object.freeze({
      ground: Object.freeze({ background: { kind: "rgb", hex: hue.ground } as const }),
      ink: styleOf({ kind: "rgb", hex: hue.on }),
    });
  }
  // **Quantised as a SET, over the ten grounds together** (§3). Rank order and
  // distinctness are properties a set has and a per-slot neighbour cannot see,
  // and it is what keeps the ten identities ten at 8-bit where 4-bit cannot.
  const hues = theme.tokens.hues!;
  const grounds: Record<string, string> = {};
  const inks: Record<string, string> = {};
  for (const [k, v] of Object.entries(hues)) {
    grounds[k] = v.ground;
    inks[k] = v.on;
  }
  // **Both halves hold the floor** (I69), the grounds first and against the
  // cube's extremes, the inks then against their own ground as painted — each
  // ink on a different ground, in one set.
  const placeGrounds = (): Readonly<Record<string, number>> =>
    quantisedFor(theme, "hueGround", grounds, () => {
      const out: Record<string, (hex: string) => boolean> = {};
      for (const [k, v] of Object.entries(hues)) out[k] = sideNeeds([[v.on, DEFAULT_FLOOR]], v.ground);
      return out;
    });
  const g = placeGrounds()[name];
  const i = quantisedFor(theme, "hueOn", inks, () => {
    const placed = placeGrounds();
    const out: Record<string, (hex: string) => boolean> = {};
    for (const k of Object.keys(hues)) {
      const under = placed[k] === undefined ? null : cubeHexOf(placed[k]);
      if (under !== null) out[k] = (hex) => ratio(hex, under) >= DEFAULT_FLOOR;
    }
    return out;
  })[name];
  if (g === undefined || i === undefined) return null;
  return Object.freeze({
    ground: Object.freeze({ background: { kind: "ansi256", index: g } as const }),
    ink: styleOf({ kind: "ansi256", index: i }),
  });
}

export function resolveBase(theme: ResolvedTheme, caps: Caps): Style {
  if (theme.tokens.background !== "surface") return NO_STYLE;
  return resolveBackground("surface.bg", theme, caps);
}

/**
 * The colour an 8-bit terminal would actually paint for a surface, as hex (I26).
 *
 * **The floor is measured against what is painted, and at this rung that is not
 * the token.** `quantiseSet` picks a cube entry, whose RGB the standard fixes —
 * so the value is knowable, and a floor computed against the author's hex is
 * once again a floor against a colour nobody paints.
 *
 * `null` where the surface has no quantised answer, which `validateTokens` has
 * already reported as a malformed value.
 */
export function quantisedHex(tokens: ThemeTokens, slot: string): string | null {
  const surfaces = tokens.surfaces as Readonly<Record<string, string>>;
  const index = holdFloor(surfaces, groundAdmits(tokens))[slot];
  if (index === undefined) return null;
  return cubeHexOf(index);
}

/**
 * §4c — the floor recomputed against what an 8-bit terminal actually paints (I26).
 *
 * **Only for a theme that paints, and only for `bg`.** A theme that inherits has
 * no painted value to check against and its floor is the declared assumption, as
 * before; `bgElev` has no painter at all (I25's scope), so pairing against a
 * quantised value nobody writes would be the `bgDeep` mistake in a new place.
 *
 * **The foreground's own quantisation is a separate question and deliberately not
 * asked here.** At 8-bit a tone is a cube entry too, so a complete 8-bit floor is
 * quantised-against-quantised — but that is true whether or not anything is
 * painted, it predates this entry, and widening the check here would bind every
 * theme to a constraint this entry did not measure. Recorded in §4c.3.
 *
 * Reported at **load**, with both variants, because a theme that fails only on an
 * 8-bit terminal is a theme that passes on the machine of whoever wrote it.
 */
export function validatePaintedFloors(tokens: ThemeTokens): readonly ThemeError[] {
  if (tokens.background !== "surface") return Object.freeze([]);

  const bg = tokens.surfaces.bg;
  if (!isHex(bg)) return Object.freeze([]);

  const painted = quantisedHex(tokens, "bg");
  if (painted === null || painted.toLowerCase() === bg.toLowerCase()) return Object.freeze([]);

  const errors: ThemeError[] = [];
  for (const [paletteName, palette] of Object.entries(tokens.palettes)) {
    if (palette.carries !== "meaning") continue;

    for (const [slot, value] of Object.entries(palette.slots)) {
      if (!isHex(value)) continue;

      const floor = floorFor(slot);
      const measured = ratio(value, painted);
      if (measured < floor) {
        errors.push({
          path: `palettes.${paletteName}.${slot}`,
          message:
            `"${slot}" is ${measured.toFixed(2)} : 1 against the background an 8-bit terminal ` +
            `paints (${painted}, quantised from ${bg}), below its floor of ${floor} : 1`,
        });
      }
    }
  }

  return Object.freeze(errors);
}

/**
 * **The floor measured at the rungs below 24-bit, ink and ground both as the
 * resolver paints them** (C10 I68). The scope is the 24-bit gate's, cell for
 * cell: every `textGrounds` row held to `max(floorFor(slot), floor)` as
 * `validateHighContrast` holds it, every `decorationTextPairs` cell to
 * `DEFAULT_FLOOR` as `validateDecorationText` does, and at 8-bit each hue
 * band's ink on its ground to `DEFAULT_FLOOR` (I54). A cell the gate does not
 * check at 24-bit is not checked here either, so a shortfall is always the
 * rung's doing and never a wider scope's.
 *
 * **Both halves come from `resolve`**, because that is what reaches the screen,
 * and **the needs are computed here and not read from `floorsOn`**: the hold and
 * its measurement are two readings of one scope, and a measurement that asked
 * the hold what to measure would agree with it by construction. At 8-bit an
 * index maps back through the cube the standard fixes; at 4-bit through
 * `ANSI16_WINDOWS_HEX`, the reference palette I61 measures bands against. **A
 * ground the resolver does not paint at 4-bit is the page**, because that is
 * what shows through. An ink or a page with no colour at all is the terminal's
 * own pair and is not a cell.
 *
 * Moved here from `test/support` when its 8-bit list emptied (C10 I69, I70): its
 * caller is `validateQuantisedFloors`, and T2.74 and T2.75 read both depths.
 */
export function quantisedShortfalls(
  theme: ResolvedTheme,
  depth: 8 | 4,
): readonly Readonly<{ path: string; measured: number; need: number }>[] {
  const tokens = theme.tokens;
  const caps = Object.freeze({ colourDepth: depth });
  const hexOf = (colour: ColourValue | undefined): string | null => {
    if (colour === undefined) return null;
    if (depth === 4) return colour.kind === "ansi16" ? (ANSI16_WINDOWS_HEX[colour.index] ?? null) : null;
    return colour.kind === "ansi256" ? cubeHexOf(colour.index) : null;
  };
  const page = hexOf(resolveBackground("surface.bg", theme, caps).background);
  const out: { path: string; measured: number; need: number }[] = [];
  const hold = (ground: string, ref: ColourRef, need: number): void => {
    const ink = hexOf(resolve(ref, theme, caps, ground).colour);
    const under = hexOf(resolveBackground(`surface.${ground}`, theme, caps).background) ?? (depth === 4 ? page : null);
    if (ink === null || under === null) return;
    const measured = ratio(ink, under);
    if (measured < need) out.push({ path: `${ground}.${ref}`, measured: Math.round(measured * 100) / 100, need });
  };

  for (const [ground, , refs] of textGrounds(tokens)) {
    for (const ref of refs) {
      hold(ground, ref as ColourRef, Math.max(floorFor(ref.slice(ref.indexOf(".") + 1)), tokens.floor ?? 0));
    }
  }
  for (const [palette, slot, ground] of decorationTextPairs(tokens)) hold(ground, `${palette}.${slot}`, DEFAULT_FLOOR);

  // A hue band has no 4-bit form (C10 I55, PARKED 21), so it is an 8-bit cell only.
  if (depth === 8) {
    for (const name of Object.keys(tokens.hues ?? {})) {
      const band = resolveHueBand(theme, name, caps);
      const ink = hexOf(band?.ink.colour);
      const ground = hexOf(band?.ground.background);
      if (ink === null || ground === null) continue;
      const measured = ratio(ink, ground);
      if (measured < DEFAULT_FLOOR) out.push({ path: `hueBand.${name}`, measured: Math.round(measured * 100) / 100, need: DEFAULT_FLOOR });
    }
  }
  return Object.freeze(out);
}

/**
 * The name a theme is measured under at load — no theme's identity, because
 * `identity` joins a name and a variant with `/` and this has no `/`.
 */
const SCRATCH = "quantised-floor-gate";

/**
 * **The 8-bit floor as a load gate** (C10 I70): a theme whose quantised cells
 * break the floor is refused at load, as `validateHighContrast` refuses one
 * whose authored cells do. **On a theme the 24-bit gates pass it is empty
 * unless the quantiser is wrong**, and that is arithmetic rather than a
 * sample: every colour clears √21 (4.58 : 1) against `#000000` or `#ffffff`,
 * so I69's fallback always has an extreme for an ink held to √21 or less, and
 * above it no ground holds inks on both sides at 24 bits either. What it
 * refuses is a ground whose inks sit on both sides at a need above √21 — a
 * theme the 24-bit gate refuses too, and this names its 256-colour cells.
 *
 * **8-bit only.** The 4-bit ratios are a claim about a reference palette and
 * not about the user's sixteen, so they stay an exemption list (T2.75), and a
 * gate over them would refuse every shipped theme.
 *
 * **Measured under a scratch name that is forgotten after**, because the
 * resolver memoises on the name: under the theme's own identity, an override
 * validated before its serial moves would read the unpatched theme's picks.
 */
export function validateQuantisedFloors(tokens: ThemeTokens): readonly ThemeError[] {
  if (!quantisable(tokens)) return Object.freeze([]);
  const held = verdicts.get(tokens);
  if (held !== undefined) return held;
  const verdict = measureQuantisedFloors(tokens);
  if (frozenThrough(tokens)) verdicts.set(tokens, verdict);
  return verdict;
}

/**
 * **The verdict, once per token set** — because the measurement is the held
 * DP for every refused set on every ground, 12–40 ms a theme once warm and
 * ten themes a `loadTheme`, and the shell and every `expectDocument` load the
 * same frozen `defaultTheme`. Kept only for a set frozen all the way down,
 * so a consumer's token object mutated between two loads is measured again
 * rather than answered from its first shape.
 */
const verdicts = new WeakMap<ThemeTokens, readonly ThemeError[]>();

/**
 * **Every value the gate quantises is a hex**, and nothing more: a value that is
 * not has no cube entry nearest it, and `validateTokens` already names it. So
 * the gate runs beside the 24-bit ones on any theme it can read, rather than
 * after them on the themes they pass — the only themes it can say nothing about.
 */
function quantisable(tokens: ThemeTokens): boolean {
  const values = [
    ...Object.values(tokens.surfaces),
    ...Object.values(tokens.palettes).flatMap((palette) => Object.values(palette.slots)),
    ...Object.values(tokens.composed ?? {}).flatMap((inks) => Object.values(inks)),
    ...Object.values(tokens.bandInk ?? {}),
    ...Object.values(tokens.hues ?? {}).flatMap((hue) => [hue.ink, hue.ground, hue.on]),
  ];
  return values.every((value) => typeof value === "string" && isHex(value)) && (tokens.floor === undefined || Number.isFinite(tokens.floor));
}

function frozenThrough(value: unknown): boolean {
  return value === null || typeof value !== "object" || (Object.isFrozen(value) && Object.values(value).every(frozenThrough));
}

function measureQuantisedFloors(tokens: ThemeTokens): readonly ThemeError[] {
  const theme: ResolvedTheme = Object.freeze({ name: SCRATCH, variant: tokens.variant, tokens });
  try {
    return Object.freeze(
      quantisedShortfalls(theme, 8).map(({ path, measured, need }) => {
        if (path.startsWith("hueBand.")) {
          const name = path.slice("hueBand.".length);
          return {
            path: `hues.${name}`,
            message: `the "${name}" band is ${measured.toFixed(2)} : 1 as a 256-colour terminal paints it, below ${need} : 1 — no cube entry holds this ground and its ink together`,
          };
        }
        const ground = path.slice(0, path.indexOf("."));
        const ref = path.slice(ground.length + 1);
        return {
          path: `palettes.${ref}`,
          message: `"${ref}" is ${measured.toFixed(2)} : 1 on ${ground} as a 256-colour terminal paints the pair, below ${need} : 1 — no cube entry holds this ground for every ink on it`,
        };
      }),
    );
  } finally {
    forget(SCRATCH);
  }
}

/** Every memo entry resolved under `name` — the scratch gate's, and nobody else's. */
function forget(name: string): void {
  for (const key of [...styles.keys()]) if (key.split("|")[1] === name) styles.delete(key);
  for (const key of [...quantised.keys()]) if (key.startsWith(`${name}|`)) quantised.delete(key);
}

/** The ergonomic form. `tone` is the overwhelmingly common case (§2). */
export function resolveTone(tone: Tone, theme: ResolvedTheme, caps: Caps, on?: string): Style {
  return resolve(`tone.${tone}`, theme, caps, on);
}

/**
 * The same colour, in the other channel (§4a, I21).
 *
 * **`surface` refs only.** A palette ref returns the empty `Style`, and that is a
 * rule rather than an omission: §4's floors are measured for text *on* a surface,
 * so painting a tone as a background asks for a guarantee nobody computed. A
 * caller wanting `tone.ok` behind text is a caller who has not decided what reads
 * on it.
 *
 * Everything else is inherited rather than re-implemented — the depth ladder, the
 * curated 4-bit index, the memo, and the 1-bit vanishing that makes I23 lossless.
 * The one thing this function does is move the value from `colour` to
 * `background`, and it does it by resolving through `resolve` so the two channels
 * cannot degrade differently.
 */
export function resolveBackground(ref: ColourRef, theme: ResolvedTheme, caps: Caps): Style {
  if (split(ref)[0] !== "surface") return NO_STYLE;

  const asForeground = resolve(ref, theme, caps);
  return asForeground.colour === undefined ? NO_STYLE : { background: asForeground.colour };
}

const receded = new WeakMap<ResolvedTheme, ResolvedTheme>();

/**
 * The theme a stale reading is drawn in (I59, §047, `R-HON-002`): every palette
 * slot resolves as `tone.dim`, at every depth, and every surface as it did.
 *
 * **Its own name**, because `resolve` memoises on the name, and one object per
 * theme so the frame path allocates it once. Receding a receded theme is the
 * same theme.
 *
 * **The blind spot, stated**: a painter reading `theme.tokens` without going
 * through `resolve` — a colormap's stops, a ramp's mix — is not receded, so a
 * stale heatmap keeps its colours. Every tone and slot a block names passes
 * through here; a figure's own gradient does not.
 */
export function recede(theme: ResolvedTheme): ResolvedTheme {
  if (theme.recedes !== undefined) return theme;
  const held = receded.get(theme);
  if (held !== undefined) return held;
  const made: ResolvedTheme = Object.freeze({ ...theme, name: `${theme.name}/receded`, recedes: theme });
  receded.set(theme, made);
  return made;
}
