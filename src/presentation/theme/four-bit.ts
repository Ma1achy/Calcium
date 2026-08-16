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


  // **Eight indices that must stay pairwise distinct**, which is the cap's
  // 4-bit expression: the palette promises `n` distinguishable categories and
  // sixteen colours is where that promise is hardest to keep. Curated rather
  // than computed, for `FourBitMap`'s own reason — nearest-of-16 by RGB
  // distance collapses hues that the eye separates easily.
  "categorical.c1": 3,
  "categorical.c2": 6,
  "categorical.c3": 2,
  "categorical.c4": 11,
  "categorical.c5": 12,
  "categorical.c6": 1,
  "categorical.c7": 5,
  "categorical.c8": 7,

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
  // §4a's two, and the one place a background lands on text at four bits.
  //
  // **No floor is measured against these, and none can be.** The sixteen are the
  // terminal's own values, so a ratio computed here would be a ratio against a
  // colour this process cannot see — which is why the check in `contrast.ts`
  // covers 24-bit tokens and stops there. What makes an unmeasurable background
  // acceptable at this depth and unacceptable at twenty-four is I23: the marker
  // and the toned gutter carry the add/remove distinction on their own, so a
  // background that reads badly costs legibility of the tint and no information.
  //
  // Plain rather than bright. The bright half of the sixteen is where the
  // foreground tones live, and a background from the same half competes with the
  // text sitting on it.
  "surface.diffAdd": 2,
  "surface.diffRemove": 1,

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

  // The cap's 4-bit expression — see DARK_FOUR_BIT.
  "categorical.c1": 3,
  "categorical.c2": 6,
  "categorical.c3": 2,
  "categorical.c4": 5,
  "categorical.c5": 4,
  "categorical.c6": 1,
  "categorical.c7": 13,
  "categorical.c8": 8,

  "surface.bg": 15,
  "surface.bgElev": 15,
  "surface.bgDeep": 15,
  "surface.border": 7,
  "surface.borderStrong": 8,
  // §4a, and the same reasoning as the dark map above.
  "surface.diffAdd": 2,
  "surface.diffRemove": 1,

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

/**
 * The high-contrast map — and the rung where its claim stops (roadmap 24).
 *
 * **A high-contrast theme cannot promise contrast here, and this map is what it
 * promises instead.** The sixteen are the emulator's own values, so a ratio
 * computed against index 0 is a ratio against a colour this process cannot see
 * — the argument the diff surfaces above already make, applied to the whole
 * palette. What survives the rung is **distinctness** (I17), which is a property
 * of the indices themselves, so that is what is curated: the five tones whose
 * confusion misleads take five different indices, and every collision below is
 * between slots whose confusion costs nothing.
 *
 * Bright half for the foreground, as `DARK_FOUR_BIT` does, because the ground is
 * index 0 and the plain half is where a 16-colour terminal's dim text lives.
 */
export const HIGH_CONTRAST_FOUR_BIT: FourBitMap = Object.freeze({
  "tone.default": 15,
  "tone.dim": 7,
  "tone.muted": 8,
  "tone.ok": 10,
  "tone.warn": 11,
  "tone.error": 9,
  "tone.info": 14,
  "tone.accent": 13,
  "tone.meta": 5,
  "tone.identifier": 6,

  "syntax.keyword": 13,
  "syntax.string": 10,
  "syntax.comment": 8,
  "syntax.number": 11,
  "syntax.key": 9,
  "syntax.type": 3, // plain yellow, so `number`'s bright yellow stays its own
  "syntax.function": 12,
  "syntax.operator": 14,
  "syntax.punctuation": 15,

  // The cap's 4-bit expression — see DARK_FOUR_BIT.
  "categorical.c1": 11,
  "categorical.c2": 14,
  "categorical.c3": 10,
  "categorical.c4": 3,
  "categorical.c5": 12,
  "categorical.c6": 9,
  "categorical.c7": 13,
  "categorical.c8": 7,

  "surface.bg": 0,
  "surface.bgElev": 0,
  "surface.bgDeep": 0,
  "surface.border": 8,
  "surface.borderStrong": 7,
  "surface.diffAdd": 2,
  "surface.diffRemove": 1,
});
