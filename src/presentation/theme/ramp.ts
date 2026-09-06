/**
 * A ramp's sample, on this component's ladder (C10 §4h, I36).
 *
 * A `Ramp` (C04 §3am.2) is a function `[0, 1] → Colour`; C09 supplies the
 * argument per cluster or per axis cell and this is what it resolves to. **It
 * adds no ladder**: each backing degrades on the ladder its slot or map already
 * has, and the one new piece of arithmetic — `mixHex`, a mix of two resolved
 * slots — is the interpolation `sample` already uses between colormap stops.
 *
 * `undefined` means *say nothing*: the run paints as its neighbours do and
 * coalesces with them by reference, which is `continuousColour`'s existing
 * answer below its floor and what makes a 4-bit frame byte-identical with and
 * without a colormap ramp (I31).
 */
import type { TerminalCapabilities } from "../../terminal/capabilities.js";
import type { Ramp } from "../../data/viewmodel/index.js";
import { COLORMAPS, continuousColour, nearestAnsi256 } from "./colormap.js";
import { refOf } from "./categorical.js";
import { resolve, resolveTone } from "./resolve.js";
import type { ResolvedTheme, Style } from "./types.js";

type Caps = Readonly<Pick<TerminalCapabilities, "colourDepth">>;

/** The depth at or above which the categorical palette separates its entries — C12's `CATEGORY_COLOUR_FLOOR`, the same number. */
const PALETTE_FLOOR = 4;

/** `#rrggbb` → the three channels. Total: a malformed hex yields black rather than `NaN`. */
function channels(hex: string): readonly [number, number, number] {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  if (!Number.isFinite(n)) return [0, 0, 0];
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function hex2(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
}

/**
 * Linear in sRGB between two hexes — the arithmetic `sample` applies between
 * adjacent colormap stops, so a two-stop map and a slot pair agree (T1.38).
 */
export function mixHex(from: string, to: string, t: number): string {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  const a = channels(from);
  const b = channels(to);
  return `#${hex2(a[0] + (b[0] - a[0]) * clamped)}${hex2(a[1] + (b[1] - a[1]) * clamped)}${hex2(a[2] + (b[2] - a[2]) * clamped)}`;
}

/** `t` quantised to `bands` levels — a `step` before its gradient rule (C04 I106). */
export function stepOf(t: number, bands: number): number {
  if (!(bands >= 2)) return t;
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  const band = Math.min(bands - 1, Math.floor(clamped * bands));
  return band / (bands - 1);
}

/** A slot's 24-bit hex, whatever the terminal's depth — the ends a pair is mixed between. */
function hexOf(tone: Ramp["from"], theme: ResolvedTheme): string {
  const colour = resolveTone(tone ?? "default", theme, { colourDepth: 24 }).colour;
  return colour !== undefined && colour.kind === "rgb" ? colour.hex : "#000000";
}

/**
 * What a ramp resolves to at `t` for cell `index`, or `undefined` for *say
 * nothing* (I36). The ladder, per backing:
 *
 * | backing | 24-bit | 8-bit | 4-bit | 1-bit |
 * |---|---|---|---|---|
 * | slot pair | `mixHex` | `nearestAnsi256` of the mix | a step of two — `from` below ½, `to` from ½ | `from`, resolved as the slot is |
 * | colormap | `sample` | LUT | `undefined` | `undefined` |
 * | palette | the categorical slot | the slot | the slot | `undefined` |
 *
 * Returns a `Style` and not a bare colour because the 1-bit answer for a slot
 * pair is `from`'s **class** — bold, dim or neither — and a colour value cannot
 * carry that. At 8-bit and above the style is a colour alone; the run's own
 * tone and attributes supply the rest.
 */
export function rampStyle(ramp: Ramp, t: number, index: number, theme: ResolvedTheme, caps: Caps): Style | undefined {
  const depth = caps.colourDepth;
  if (ramp.fill === "palette") {
    if (depth < PALETTE_FLOOR) return undefined;
    const colour = resolve(refOf(index), theme, caps).colour;
    return colour === undefined ? undefined : { colour };
  }
  const tt = ramp.fill === "step" ? stepOf(t, ramp.bands ?? 2) : t;
  if (ramp.colormap !== undefined) {
    const map = COLORMAPS[ramp.colormap];
    if (map === undefined) return undefined;
    const colour = continuousColour(map, tt, caps);
    return colour === undefined ? undefined : { colour };
  }
  // A slot pair.
  if (depth >= 24) return { colour: { kind: "rgb", hex: mixHex(hexOf(ramp.from, theme), hexOf(ramp.to, theme), tt) } };
  if (depth >= 8) return { colour: { kind: "ansi256", index: nearestAnsi256(mixHex(hexOf(ramp.from, theme), hexOf(ramp.to, theme), tt)) } };
  if (depth >= 4) {
    const colour = resolveTone((tt < 0.5 ? ramp.from : ramp.to) ?? "default", theme, caps).colour;
    return colour === undefined ? undefined : { colour };
  }
  return resolveTone(ramp.from ?? "default", theme, caps);
}
