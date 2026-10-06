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
 *
 * **The indices live in the registry since C10 I62** — `terminalPalettes.fourBit`,
 * generated into `four-bit.generated.ts` — and this module keeps the names every
 * reader uses and the reasons each index is what it is, which JSON cannot carry.
 * A theme names its map in the registry (`fourBit: "highContrast"`), so which map
 * a theme takes is design data too.
 */

import { FOUR_BIT } from "./four-bit.generated.js";
import type { FourBitMap } from "./types.js";

/*
 * 0 black    1 red      2 green    3 yellow
 * 4 blue     5 magenta  6 cyan     7 white
 * 8-15       the bright half, in the same order
 */

/**
 * The dark map. **Light text on a dark ground, so the bright half carries the
 * emphasis.** `tone.accent` is plain yellow (3), because plain yellow reads orange
 * beside bright yellow's `warn`.
 *
 * **Eight categorical indices that must stay pairwise distinct**, which is the
 * cap's 4-bit expression: the palette promises `n` distinguishable categories and
 * sixteen colours is where that promise is hardest to keep. Curated rather than
 * computed, for `FourBitMap`'s own reason — nearest-of-16 by RGB distance
 * collapses hues that the eye separates easily.
 *
 * **Surfaces are painted, not written on.** `bg`, `bgElev` and `bgDeep` share
 * black because a 16-colour terminal has no third dark ground to give them, and
 * inventing one from the bright half would make elevation louder than the text
 * sitting on it.
 *
 * **`diffAdd` and `diffRemove` are §4a's two, and the one place a background
 * lands on text at four bits. No floor is measured against them, and none can
 * be.** The sixteen are the terminal's own values, so a ratio computed here would
 * be a ratio against a colour this process cannot see — which is why the check
 * in `contrast.ts` covers 24-bit tokens and stops there. What makes an
 * unmeasurable background acceptable at this depth and unacceptable at
 * twenty-four is I23: the marker and the toned gutter carry the add/remove
 * distinction on their own, so a background that reads badly costs legibility of
 * the tint and no information. Plain rather than bright: the bright half of the
 * sixteen is where the foreground tones live, and a background from the same
 * half competes with the text sitting on it.
 *
 * **The `status` tag's pair, and the ground is not chosen** (C10 I32, F240). It
 * is `tone.error`'s own index for the same reason the 24-bit ground is
 * `tone.error`'s own hex: one red by construction, rather than two values in two
 * places kept in step by eye — which drifted four times in one sitting when they
 * were two literals. **So only the ink is a decision, and it inverts against
 * 24-bit.** There the tone is `#c62828`, a dark red that needs white on it; here
 * it is index 9, the bright one, which needs black. The relationship held is *the
 * ink is the half that reads on the ground* — the colour is its consequence.
 * **No ratio is claimed.** I26 rules the floor best-effort at this rung, the
 * sixteen being the emulator's own values, so this is a curated decision and not
 * a measurement.
 */
export const DARK_FOUR_BIT: FourBitMap = FOUR_BIT.dark;

/**
 * The light map. **Dark text on a light ground, so the plain half carries the
 * emphasis and the bright half is what recedes.** `tone.muted` shares grey with
 * `dim`; neither is in the injective set. `syntax.type` shares gold with
 * `number`, as the 24-bit pair nearly does. The categorical indices keep the
 * cap's 4-bit expression — see `DARK_FOUR_BIT` — and the diff surfaces take the
 * dark map's reasoning.
 *
 * The error pair on the dark map's construction: the ground is this theme's
 * `tone.error`. Here that is index 1, the plain red, so the ink stays white and
 * the 24-bit relationship survives the rung unchanged.
 */
export const LIGHT_FOUR_BIT: FourBitMap = FOUR_BIT.light;

/**
 * The tones whose confusion would be misleading rather than merely dull. `dim`
 * and `default` are free to collapse: losing the difference between two quiet
 * greys costs nothing, while `ok` and `error` landing on one colour is a failed
 * row that reads as a passing one.
 *
 * **`muted` is in the set and is the one grey that is** (C10 I17, PARKED 79):
 * `info` rendered as `muted` reads as *nothing to see*, and where the theme
 * authors both greys, as `paper` does, the index is the only thing that tells
 * the two facts apart at 8-bit. The three 4-bit maps already keep it apart —
 * index 8 in each, which none of the five takes.
 */
export const MUST_STAY_DISTINCT: readonly string[] = Object.freeze([
  "ok",
  "warn",
  "error",
  "info",
  "accent",
  "muted",
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
 * confusion misleads take five different indices, and every collision is between
 * slots whose confusion costs nothing. `syntax.type` is plain yellow, so
 * `number`'s bright yellow stays its own.
 *
 * Bright half for the foreground, as `DARK_FOUR_BIT` does, because the ground is
 * index 0 and the plain half is where a 16-colour terminal's dim text lives.
 * **`hcLight` does not take this map, for the same reason**: its ground is white,
 * so a bright foreground is the illegible arm of the reasoning. It names `light`.
 *
 * The error pair costs nothing here at all: the 24-bit tag is already dark ink on
 * a light ground — `#3d0000` on `#ff7171` — so taking `tone.error`'s index 9 and
 * black on it reproduces the inversion rather than giving it up.
 */
export const HIGH_CONTRAST_FOUR_BIT: FourBitMap = FOUR_BIT.highContrast;
