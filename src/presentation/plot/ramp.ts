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

/** The ramp for these capabilities. Nothing here probes for its own (C09 I3). */
export function rampFor(caps: Pick<TerminalCapabilities, "unicode">): string {
  return caps.unicode === "ascii" ? RAMP_ASCII : RAMP_UNICODE;
}

/** Ramp steps. Eight, in both modes — see the header. */
export const RAMP_STEPS = 8;
