/**
 * The two eight-step ramps (C12 §6, A01 A.2).
 *
 * Both are exactly eight glyphs, and that is load-bearing rather than tidy: a
 * value normalised into `[0, 1]` indexes one of eight steps, and the ASCII
 * fallback must offer the same number of steps or the two forms would differ in
 * vertical resolution as well as in appearance. The cell grid is identical (I9);
 * only the glyphs change.
 */
import type { TerminalCapabilities } from "../../terminal/capabilities.js";

/** Unicode: the lower-block ramp, one eighth per step. */
export const RAMP_UNICODE = "▁▂▃▄▅▆▇█";

/** ASCII: increasing ink, which is the only ordering ASCII can express. */
export const RAMP_ASCII = ".:-=+*#@";

/**
 * Braille density, for a terminal that draws ambiguous glyphs wide (C02 I9).
 *
 * **`RAMP_UNICODE` is `East_Asian_Width=Ambiguous` in all eight glyphs**, so on
 * such a terminal every step is two cells — and `sparkline` is what C11 draws
 * into a table cell, so what breaks is the column alignment of every row below
 * rather than a chart looking odd.
 *
 * Braille is the replacement because **every code point in the block is narrow**
 * — U+2800–U+28FF is `East_Asian_Width=Neutral`, not ambiguous — so this arm is
 * correct on both kinds of terminal rather than being a second guess. Eight
 * steps, like the other two, because the step count is load-bearing: a value
 * normalised into `[0, 1]` indexes one of eight, and a ramp with fewer would
 * change the vertical resolution as well as the appearance.
 *
 * It is dot density rather than height, which reads less like a bar chart and
 * is the cost of the arm. The alternative was refusing ambiguous glyphs outright
 * and taking this ramp everywhere — which would have changed the sparkline for
 * every user to fix it for some.
 *
 * **It fills from the bottom, and its first step is one dot rather than none**
 * (I16). The set that shipped began at `U+2800` — BRAILLE PATTERN BLANK — so
 * every sparkline on a wide terminal drew its *minimum* as whitespace, which the
 * right-anchor already uses to mean *fewer samples than cells*: one character,
 * two meanings, in the arm nothing renders in a golden frame. Measured rather
 * than noticed — `sparkline([0, 5], 6, wide)` came back as four spaces, then
 * `U+2800` for the zero, then `U+28FF` for the five: five blank cells and one
 * full one, where the row holds two readings. Every width and length assertion
 * passed against it, because `cells()` counts the blank as one. Found by C12's
 * heatmap walk (§6a A1), whose subject is magnitude carried by a glyph: an idle
 * row must not read as an absent one.
 *
 * The old set was also non-monotone in ink — its dot populations ran
 * `0,1,2,3,4,5,6,8`, so the last step was a double jump. This one runs `1..8`,
 * which is what an eight-step ramp claims to be.
 */
export const RAMP_BRAILLE = "\u2840\u28c0\u28c4\u28e4\u28e6\u28f6\u28f7\u28ff";

/**
 * Density, for a grid cell — the heatmap's ramp (C12 I17, §3a).
 *
 * **Not `RAMP_BRAILLE`, and the difference is what the cell is.** That one fills
 * bottom-up because a sparkline cell has a vertical axis and the glyph is a
 * column of it. **A grid cell has no vertical axis**, so a bottom-filled glyph
 * reads as a bar fragment and a matrix of them reads as rows of tiny bar charts —
 * which is a picture every count agrees with and no assertion can see.
 *
 * Dots spread across the cell instead: populations 1 to 8, monotone in ink,
 * every step narrow under both width conventions.
 *
 * **It starts at one dot rather than none** (I16). The prior art's density set
 * begins at `U+2800`, and blank is what an absent cell draws in a grid — so a
 * ramp starting there would make the minimum and absence one picture, which is
 * the collision I16 exists to refuse, arriving on a third ramp.
 *
 * **The same set on an ASCII terminal is `RAMP_ASCII`.** Density has no ASCII
 * expression beyond increasing ink, which is what that ramp already is.
 */
export const RAMP_DENSITY = "\u2804\u2814\u2816\u2836\u2837\u283f\u287f\u28ff";

/**
 * The ramp for these capabilities. Nothing here probes for its own (C09 I3).
 *
 * **ASCII first, because it is the stronger constraint.** A terminal that cannot
 * draw braille cannot draw blocks either, so the ambiguous question only arises
 * once unicode is available.
 */
export function rampFor(
  caps: Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">,
): string {
  if (caps.unicode === "ascii") return RAMP_ASCII;
  return caps.ambiguousWidth === "wide" ? RAMP_BRAILLE : RAMP_UNICODE;
}

/** Ramp steps. Eight, in both modes — see the header. */
export const RAMP_STEPS = 8;

/**
 * The heatmap's ramp (I17). ASCII first, for `rampFor`'s reason exactly.
 *
 * **The ambiguous question does not arise**, because every braille code point is
 * narrow — so unlike `rampFor` there is no third arm here, and the density ramp
 * is correct on both kinds of terminal.
 */
export function densityRampFor(caps: Pick<TerminalCapabilities, "unicode">): string {
  return caps.unicode === "ascii" ? RAMP_ASCII : RAMP_DENSITY;
}
