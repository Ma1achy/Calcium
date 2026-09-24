/**
 * C10 §3 — the degradation ladder.
 *
 * | Depth | Resolution |
 * |---|---|
 * | 24 | the hex, verbatim |
 * | 8  | nearest entry in the 256-colour cube by perceptual distance, rank order preserved |
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
import { floorFor, inkOn, isHex, ratio } from "./contrast.js";
import { cubeHexOf, quantiseSet } from "./quantise.js";
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

function quantisedFor(theme: ResolvedTheme, palette: string, slots: Readonly<Record<string, string>>): Readonly<Record<string, number>> {
  const key = `${theme.name}|${palette}`;
  const held = quantised.get(key);
  if (held !== undefined) return held;

  const built = quantiseSet(slots);
  quantised.set(key, built);
  return built;
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
 * one ink — and the set collapses to one value on purpose. That is R-THM-003
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
  // the band first (R-THM-003), then the theme's `(ground, ref)` value
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
    const index = theme.tokens.fourBit[ref];
    return index === undefined ? NO_STYLE : styleOf({ kind: "ansi16", index });
  }

  // 8-bit carries the theme's own values, so the ground binds — over the
  // composed **set**, keyed by the ground so the page's picks stay the page's.
  const set = on === undefined ? palette.slots : composedSlots(theme, paletteName, palette.slots, on);
  const index = quantisedFor(theme, on === undefined ? paletteName : `${paletteName}@${on}`, set)[slot];
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
    const index = theme.tokens.fourBit[ref];
    return index === undefined ? NO_STYLE : styleOf({ kind: "ansi16", index });
  }

  const index = quantisedFor(theme, "surface", theme.tokens.surfaces as Readonly<Record<string, string>>)[slot];
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
 * failure `R-THM-003` exists to prevent.
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
  const g = quantisedFor(theme, "hueGround", grounds)[name];
  const i = quantisedFor(theme, "hueOn", inks)[name];
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
  const index = quantiseSet(surfaces)[slot];
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
