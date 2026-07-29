/**
 * C10 §3 — the curated 4-bit maps. **The one module in `theme/` that contains
 * ANSI indices**, and SS19's single named exception.
 *
 * Computing nearest-of-16 by RGB distance collapses tones onto each other —
 * `dim` and `muted` both land on bright black, `warn` and `accent` both on
 * yellow — and the result is a UI where distinctions silently vanish. In
 * truecolour, where this is authored and reviewed, nothing shows. So each theme
 * declares its own mapping and T2.3 asserts the five tones whose confusion would
 * mislead stay apart: `ok`, `warn`, `error`, `info`, `accent`.
 *
 * Sixteen slots for nineteen named colours means collisions are not merely
 * tolerated, they are the point of curating: a human decides which pairs may
 * share. Every deliberate one is commented.
 *
 * Keys are full `ColourRef`s, because `tone.default` and `syntax.punctuation`
 * are different decisions that a bare slot name would not distinguish.
 */

import type { FourBitMap } from "./types.js";

/*
 * 0 black    1 red      2 green    3 yellow
 * 4 blue     5 magenta  6 cyan     7 white
 * 8-15       the bright half, in the same order
 */

export const DARK_FOUR_BIT: FourBitMap = Object.freeze({
  // Light text on a dark ground, so the bright half carries the emphasis.
  "tone.default": 15,
  "tone.dim": 7,
  "tone.muted": 8,
  "tone.ok": 10,
  "tone.warn": 11,
  "tone.error": 9,
  "tone.info": 14,
  "tone.accent": 3, // plain yellow reads orange beside bright yellow's `warn`
  "tone.meta": 13,
  "tone.identifier": 6,

  "syntax.keyword": 13,
  "syntax.string": 10,
  "syntax.comment": 8,
  "syntax.number": 3,
  "syntax.key": 9,
  "syntax.type": 11,
  "syntax.function": 12,
  "syntax.operator": 14,
  "syntax.punctuation": 7,

  // Surfaces are painted, not written on. `bg`, `bgElev` and `bgDeep` share
  // black because a 16-colour terminal has no third dark ground to give them,
  // and inventing one from the bright half would make elevation louder than
  // the text sitting on it.
  "surface.bg": 0,
  "surface.bgElev": 0,
  "surface.bgDeep": 0,
  "surface.border": 8,
  "surface.borderStrong": 7,
});

export const LIGHT_FOUR_BIT: FourBitMap = Object.freeze({
  // Dark text on a light ground, so the plain half carries the emphasis and the
  // bright half is what recedes.
  "tone.default": 0,
  "tone.dim": 8,
  "tone.muted": 8, // shares grey with `dim`; neither is in the injective set
  "tone.ok": 2,
  "tone.warn": 3,
  "tone.error": 1,
  "tone.info": 4,
  "tone.accent": 12,
  "tone.meta": 5,
  "tone.identifier": 6,

  "syntax.keyword": 5,
  "syntax.string": 2,
  "syntax.comment": 8,
  "syntax.number": 3,
  "syntax.key": 1,
  "syntax.type": 3, // shares gold with `number`, as the 24-bit pair nearly does
  "syntax.function": 4,
  "syntax.operator": 6,
  "syntax.punctuation": 0,

  "surface.bg": 15,
  "surface.bgElev": 15,
  "surface.bgDeep": 15,
  "surface.border": 7,
  "surface.borderStrong": 8,
});

/**
 * The tones whose confusion would be misleading rather than merely dull. `dim`,
 * `muted` and `default` are free to collapse: losing the difference between two
 * quiet greys costs nothing, while `ok` and `error` landing on one colour is a
 * failed row that reads as a passing one.
 */
export const MUST_STAY_DISTINCT: readonly string[] = Object.freeze([
  "ok",
  "warn",
  "error",
  "info",
  "accent",
]);
