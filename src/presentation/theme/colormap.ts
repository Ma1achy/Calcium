/**
 * Continuous colour — a value on a scale, as a second channel (C10 §6, I31).
 *
 * **A colormap is framework data, not theme tokens, and that is the first
 * ruling.** The plan called for a fourth *palette family*; measured against the
 * shape, it is not one. A `PaletteSpec` is `slots: Record<string, hex>` — a
 * closed set of named roles a theme authors — and a colormap is a **function**
 * from a normalised value to a colour, sampled at whatever resolution the
 * consumer needs. Writing it as slots means 256 entries per map per theme, and
 * it would say something false: **viridis is viridis on every theme.** A theme
 * chooses which map, never what it contains.
 *
 * **256 entries per map, taken from matplotlib.** The old 9-stop approximations
 * are replaced by exact tables. At 24-bit the lookup is direct with linear
 * interpolation between adjacent entries. At 8-bit a precomputed ANSI 256 index
 * per entry avoids the per-cell CIELAB distance calculation.
 */
import type { TerminalCapabilities } from "../../terminal/capabilities.js";
import type { ColourValue } from "./types.js";
import {
  COLORMAPS_WITH_REVERSED,
  COLORMAPS_256,
  type ColormapEntry,
} from "../../data/colormaps/index.js";

export type ColormapKind = "sequential" | "diverging" | "cyclic" | "miscellaneous";

export type Colormap = ColormapEntry;

export const COLORMAPS: Readonly<Record<string, Colormap>> = COLORMAPS_WITH_REVERSED;

/**
 * Sample the map at `t`, clamped into `[0, 1]`.
 *
 * Direct lookup into the 256-entry table with linear interpolation between
 * adjacent entries. At the ends, clamps rather than wraps.
 */
export function sample(map: Colormap, t: number): string {
  const data = map.data;
  if (data.length === 0) return "#000000"; // cells-ok — a data length
  if (!Number.isFinite(t)) return rgbHex(data[0]!);
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  const scaled = clamped * (data.length - 1); // cells-ok — a data length
  const low = Math.floor(scaled);
  const high = Math.min(data.length - 1, low + 1); // cells-ok — a data length
  const frac = scaled - low;
  const lo = data[low]!;
  const hi = data[high]!;
  const r = Math.round(lo[0] + (hi[0] - lo[0]) * frac);
  const g = Math.round(lo[1] + (hi[1] - lo[1]) * frac);
  const b = Math.round(lo[2] + (hi[2] - lo[2]) * frac);
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

function hex2(n: number): string {
  return n.toString(16).padStart(2, "0");
}

function rgbHex(c: readonly [number, number, number]): string {
  return `#${hex2(c[0])}${hex2(c[1])}${hex2(c[2])}`;
}

/**
 * The depth below which a continuous map says **nothing** (I31).
 */
const CONTINUOUS_FLOOR = 8;

/**
 * A continuous colour for a normalised value, or `undefined` for *no colour*.
 */
export function continuousColour(
  map: Colormap,
  t: number,
  caps: Pick<TerminalCapabilities, "colourDepth">,
): ColourValue | undefined {
  if (caps.colourDepth < CONTINUOUS_FLOOR) return undefined;
  if (caps.colourDepth >= 24) {
    const hex = sample(map, t);
    return { kind: "rgb", hex };
  }
  // 8-bit: use precomputed ANSI 256 index
  const lut = COLORMAPS_256[map.name];
  if (lut !== undefined) {
    const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
    const index = Math.round(clamped * (lut.length - 1)); // cells-ok — a LUT length
    return { kind: "ansi256", index: lut[index] ?? 16 };
  }
  // Fallback: sample and convert
  return { kind: "ansi256", index: nearestAnsi256(sample(map, t)) };
}

/**
 * The 256-palette's colour cube, which **three places had a copy of**.
 *
 * `resolve.ts` builds it for the theme's constraint solver, `continuousColour`
 * inlined the quantisation above, and `dimColour` needed the inverse and had
 * neither — which is how `fieldDim: "floor"` came to be silently inert at 8-bit
 * (C12 §3y). One definition and three callers rather than a fourth copy.
 *
 * **The levels are not evenly spaced and that is the cube, not a choice.**
 * Scaling a colour by a factor and requantising therefore compresses the dark
 * end harder than the light: halving 215 lands on 175, halving 95 lands on 0.
 * A dimmed map's lowest band goes to black at 8-bit where it stays coloured at
 * 24, and that is a property of the palette rather than of the remedy.
 */
export const CUBE_LEVELS = [0, 95, 135, 175, 215, 255] as const;

/**
 * A colour with every channel remapped, **in whatever encoding it arrived in**.
 *
 * The traversal `dimColour` had and `shadeColour` would otherwise have copied:
 * parse the hex, map the three channels, and put an `ansi256` back through the
 * cube it came from. Two copies of it are two places for the 8-bit arm to stop
 * agreeing, which is the defect `dimColour`'s own comment records.
 *
 * **0–15 are returned unchanged**, because those are the terminal's own palette
 * and have no value we can read — there is nothing to scale.
 */
export function overChannels(colour: ColourValue, f: (c: number) => number): ColourValue {
  const map = (hex: string): string => {
    const n = (i: number): number => {
      const v = f(parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255);
      return Math.max(0, Math.min(255, Math.round(v * 255)));
    };
    return `#${[0, 1, 2].map((i) => hex2(n(i))).join("")}`;
  };
  if (colour.kind === "rgb") return { kind: "rgb", hex: map(colour.hex) };
  if (colour.kind === "ansi256") {
    const hex = ansi256Hex(colour.index);
    return hex === null ? colour : { kind: "ansi256", index: nearestAnsi256(map(hex)) };
  }
  return colour;
}

/** The sRGB transfer function, both directions. */
const toLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const toSrgb = (c: number): number =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

/**
 * A colour under an illumination of `intensity`, **scaled in linear light**
 * (C12 I94, FINDINGS F455).
 *
 * **Linear and not encoded, for two independent reasons.** Light is linear, so
 * a face at 20% illumination should carry 20% of the luminance — scaling the
 * *encoded* value by 0.2 gives about 2.9% of it, which turns the ambient floor
 * back into the hole it exists to prevent. And scaling in linear light is
 * exactly *hold chromaticity, change luminance*, which is what makes the field
 * recoverable from hue under the shading: 0.0330 rad of drift on viridis
 * against a 0.1292 rad step between adjacent field values, 3.9× (F455).
 *
 * **That ratio holds over `[0, 1]` and nowhere else**, which is why the
 * intensity is clamped before it arrives here rather than after: past 1 a
 * channel clips, a clipped channel rotates hue, and viridis's ratio falls to
 * 0.01× (F457). The clamp in `overChannels` is the last guard and not the rule.
 *
 * **Per map rather than per rung.** The field survives the shading exactly when
 * the map travels in hue, and three of the six shipped maps do not — magma,
 * inferno and coolwarm invert the ratio, and `gray` has no chroma to carry
 * anything. That is a consequence of the caller's `colormap` and not a branch
 * here (F455).
 */
export function shadeColour(colour: ColourValue, intensity: number): ColourValue {
  const k = intensity < 0 ? 0 : intensity > 1 ? 1 : intensity;
  if (k === 1) return colour;
  return overChannels(colour, (c) => toSrgb(toLinear(c) * k));
}

/**
 * The sixteen ANSI colours, as the xterm defaults (C10 §4i, I38).
 *
 * **A table rather than a computation**, because there is nothing to compute: a
 * terminal's low sixteen are whatever the user's palette says, and these are the
 * reference values the mapping measures distance against. A child asking for
 * *the terminal's red* keeps its index and never reaches this table (I38); it is
 * consulted only when an `rgb` or an `ansi256` has to come down to four bits.
 */
const ANSI16_HEX: readonly string[] = Object.freeze([
  "#000000", "#800000", "#008000", "#808000", "#000080", "#800080", "#008080", "#c0c0c0",
  "#808080", "#ff0000", "#00ff00", "#ffff00", "#0000ff", "#ff00ff", "#00ffff", "#ffffff",
]);

/** The 256-colour cube and greys as hexes, for the `ansi256` → 4-bit step. */
function hexOfAnsi256(index: number): string {
  if (index < 16) return ANSI16_HEX[index] ?? "#000000";
  if (index >= 232) {
    const level = 8 + (index - 232) * 10; // cells-ok — a grey ramp step
    const part = level.toString(16).padStart(2, "0");
    return `#${part}${part}${part}`;
  }
  const n = index - 16;
  const parts = [Math.floor(n / 36) % 6, Math.floor(n / 6) % 6, n % 6].map((step) => {
    const level = step === 0 ? 0 : 55 + step * 40; // cells-ok — the cube's levels
    return level.toString(16).padStart(2, "0");
  });
  return `#${parts.join("")}`;
}

/**
 * The nearest of the sixteen, by squared distance in sRGB (C10 I38).
 *
 * `nearestAnsi256`'s sibling one table smaller, and deliberately the same
 * arithmetic: two quantisers disagreeing about which red is nearest would put a
 * child's colour in one place at 8-bit and another at 4-bit for no reason a
 * reader could name.
 */
export function nearestAnsi16(hex: string): number {
  const channel = (h: string, i: number): number => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < ANSI16_HEX.length; i += 1) { // cells-ok — a palette index
    const candidate = ANSI16_HEX[i] ?? "#000000";
    let distance = 0;
    for (let c = 0; c < 3; c += 1) { // cells-ok — a colour channel
      const d = channel(hex, c) - channel(candidate, c);
      distance += d * d;
    }
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best; // cells-ok — a palette index
}

/**
 * A literal colour, down C10's ladder (§4i, I38).
 *
 * **The theme is not a parameter and cannot become one.** A child's colour is
 * not a slot, has no dark and light form, and nothing about the application's
 * taste applies to it — so this takes capabilities alone, which is what makes it
 * safe to call beside a measurer and impossible to make theme-dependent by
 * accident.
 *
 * `ansi16` passes through above 1-bit: the child asked for *the terminal's red*,
 * and the user's palette is the right answer to that question. Resolving it to a
 * hex and back would substitute our red for theirs.
 */
export function degradeColour(
  value: ColourValue,
  caps: Readonly<Pick<TerminalCapabilities, "colourDepth">>,
): ColourValue | undefined {
  const depth = caps.colourDepth;
  if (depth === 1) return undefined;
  if (value.kind === "ansi16") return value;
  if (value.kind === "ansi256") {
    return depth === 4 ? { kind: "ansi16", index: nearestAnsi16(hexOfAnsi256(value.index)) } : value;
  }
  if (depth === 24) return value;
  if (depth === 4) return { kind: "ansi16", index: nearestAnsi16(value.hex) };
  return { kind: "ansi256", index: nearestAnsi256(value.hex) };
}

/** The nearest cube index to a hex colour — the greyscale ramp is not searched. */
export function nearestAnsi256(hex: string): number {
  const at = (i: number): number => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    let best = 0;
    for (let k = 1; k < CUBE_LEVELS.length; k += 1) { // cells-ok — a cube axis
      if (Math.abs(CUBE_LEVELS[k]! - c) < Math.abs(CUBE_LEVELS[best]! - c)) best = k; // cells-ok
    }
    return best;
  };
  return 16 + 36 * at(0) + 6 * at(1) + at(2); // cells-ok — a palette index
}

/**
 * A cube or greyscale index as hex, or `null` for the sixteen system colours.
 *
 * **`null` rather than a guess for 0–15**, because those are the terminal's own
 * palette and their values are the reader's theme: a framework that named them
 * would be asserting a colour it cannot see (C10 I21's argument, one index set
 * along).
 */
export function ansi256Hex(index: number): string | null {
  const i = Math.round(index);
  const hex = (r: number, g: number, b: number): string =>
    `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  if (i >= 16 && i <= 231) {
    const n = i - 16;
    return hex(
      CUBE_LEVELS[Math.floor(n / 36)] ?? 0,
      CUBE_LEVELS[Math.floor(n / 6) % 6] ?? 0,
      CUBE_LEVELS[n % 6] ?? 0,
    );
  }
  if (i >= 232 && i <= 255) {
    const v = 8 + (i - 232) * 10;
    return hex(v, v, v);
  }
  return null;
}

