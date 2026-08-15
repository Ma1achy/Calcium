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
 */
export const RAMP_BRAILLE = "\u2800\u2804\u2806\u2816\u2836\u2837\u283f\u28ff";

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
