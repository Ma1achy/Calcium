/**
 * C10 — theme resolution. A block names a palette slot and gets back a style;
 * neither the block nor the theme knows what terminal it is on.
 *
 * The promise that makes degradation safe is D29: no information is carried by
 * colour alone. When colour disappears entirely nothing is lost, because the
 * semantic weight was never in the colour — C10's job at 1-bit is not to invent
 * ten distinguishable monochrome styles but to collapse honestly to three and
 * let the glyph carry the meaning.
 */

export { DEFAULT_FLOOR, floorFor, isHex, luminance, ratio, textSurfaces, validateTokens } from "./contrast.js";
export { DARK_FOUR_BIT, LIGHT_FOUR_BIT, MUST_STAY_DISTINCT } from "./four-bit.js";
export { cacheSize, clearResolutionCache, resolve, resolveTone } from "./resolve.js";
export { loadTheme, type Overrides, type ThemeStore } from "./store.js";
export { DARK } from "./tokens-dark.js";
export { LIGHT } from "./tokens-light.js";
export {
  NO_STYLE,
  type ColourRef,
  type ColourValue,
  type FourBitMap,
  type MonoClass,
  type PaletteSpec,
  type ResolvedTheme,
  type Style,
  type Surfaces,
  type ThemeError,
  type ThemeSet,
  type ThemeTokens,
} from "./types.js";

import { DARK } from "./tokens-dark.js";
import { LIGHT } from "./tokens-light.js";
import type { ThemeSet } from "./types.js";

/**
 * `theme` is a required field of `TuiConfig` (A02 §6, hook 2), and this is what
 * makes satisfying it one line. A framework with no themes at all would make the
 * reference app awkward for no gain; one that silently picked a theme would hide
 * a decision the app should own.
 */
export const defaultTheme: ThemeSet = Object.freeze({ dark: DARK, light: LIGHT });
