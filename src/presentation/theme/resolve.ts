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
import { floorFor, isHex, ratio } from "./contrast.js";
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
export function resolve(ref: ColourRef, theme: ResolvedTheme, caps: Caps): Style {
  const key = `${ref}|${theme.name}|${caps.colourDepth}`;
  const held = styles.get(key);
  if (held !== undefined) return held;

  const computed = compute(ref, theme, caps.colourDepth);
  styles.set(key, computed);
  return computed;
}

function compute(ref: ColourRef, theme: ResolvedTheme, depth: Depth): Style {
  const [paletteName, slot] = split(ref);

  if (paletteName === "surface") return surface(ref, slot, theme, depth);

  const palette: PaletteSpec | undefined = theme.tokens.palettes[paletteName];
  const hex = palette?.slots[slot];
  if (palette === undefined || hex === undefined) return NO_STYLE;

  if (depth === 1) {
    // A decoration palette has no meaning to preserve, so it collapses to the
    // default foreground. A meaning palette collapses to the class it declared,
    // and that is only lossless because D29 holds: the glyph carries it.
    if (palette.monochrome === "foreground") return NO_STYLE;
    return MONO[palette.classes?.[slot] ?? "normal"];
  }

  if (depth === 24) return styleOf({ kind: "rgb", hex });

  if (depth === 4) {
    const index = theme.tokens.fourBit[ref];
    return index === undefined ? NO_STYLE : styleOf({ kind: "ansi16", index });
  }

  const index = quantisedFor(theme, paletteName, palette.slots)[slot];
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
export function resolveTone(tone: Tone, theme: ResolvedTheme, caps: Caps): Style {
  return resolve(`tone.${tone}`, theme, caps);
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
