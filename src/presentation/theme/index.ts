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

export { CATEGORY_REFS, refOf } from "./categorical.js";
export { mixHex, rampStyle, stepOf } from "./ramp.js";
export { DEFAULT_FLOOR, decorationTextPairs, diffPairs, errorTagPairs, floorFor, inkOn, isHex, luminance, pickPairs, ratio, selectionPairs, textSurfaces, validateTokens } from "./contrast.js";
export { DARK_FOUR_BIT, HIGH_CONTRAST_FOUR_BIT, LIGHT_FOUR_BIT, MUST_STAY_DISTINCT } from "./four-bit.js";
export { assertPictureGlyph, isPictureGlyph } from "./picture.js";
export { collisions, separation, OKABE_ITO_CANONICAL, SEPARATION_FLOOR, VISIONS, type Collision, type Vision } from "./cvd.js";
export {
  cacheSize,
  clearResolutionCache,
  quantisedHex,
  resolve,
  resolveBackground,
  resolveBase,
  resolveTone,
  validatePaintedFloors,
} from "./resolve.js";
export { loadTheme, type Overrides, type ThemeStore } from "./store.js";
export { DARK } from "./tokens-dark.js";
export { HIGH_CONTRAST } from "./tokens-high-contrast.js";
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

import { REGISTRY_THEMES } from "./tokens.generated.js";
import type { ThemeSet } from "./types.js";

/**
 * `theme` is a required field of `TuiConfig` (A02 §6, hook 2), and this is what
 * makes satisfying it one line. A framework with no themes at all would make the
 * reference app awkward for no gain; one that silently picked a theme would hide
 * a decision the app should own.
 */
/**
 * **Ten, projected from the design registry** (C10 §2, R-THM-001), which is
 * normative for these values. `tokens.generated.ts` is the projection and
 * `make themes` rebuilds it; a hand edit there is a value the design does not hold.
 *
 * **`high-contrast` is now `hcDark`, and `hcLight` joins it.** The registry names
 * the two polarities separately because a high-contrast theme is a promise about a
 * ratio and a ratio is measured against a ground — one entry could only ever keep
 * that promise on one of them. The repository's shipped `high-contrast` IS the
 * registry's `hcDark` bar two diff surfaces, so this is a rename plus a sibling
 * rather than a replacement.
 *
 * I27's point survives intact and is now carried by seven entries rather than one:
 * these are *themes*, not polarities, and a set keyed by variant could hold at most
 * two of them.
 */
export const defaultTheme: ThemeSet = REGISTRY_THEMES;
