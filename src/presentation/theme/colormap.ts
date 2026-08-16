/**
 * Continuous colour — a value on a scale, as a second channel (C10 §6, I31).
 *
 * **A colormap is framework data, not theme tokens, and that is the first
 * ruling.** The plan called for a fourth *palette family*; measured against the
 * shape, it is not one. A `PaletteSpec` is `slots: Record<string, hex>` — a
 * closed set of named rôles a theme authors — and a colormap is a **function**
 * from a normalised value to a colour, sampled at whatever resolution the
 * consumer needs. Writing it as slots means 256 entries per map per theme, and
 * it would say something false: **viridis is viridis on every theme.** A theme
 * chooses which map, never what it contains.
 *
 * That has a consequence worth stating: F172's scenario — *writing
 * `continuous.s3` before the family exists renders uncoloured and green* —
 * **cannot arise**, because `ColourRef` never reaches here. There is no family
 * to be missing.
 *
 * ## Three kinds, because the kind is a property of the data
 *
 * ```
 * sequential   low → high            viridis · magma
 * diverging    low ← MID → high      blue-white-red
 * cyclic       wraps at both ends    twilight
 * ```
 *
 * Using a sequential map for diverging data hides the sign — a correlation
 * matrix in viridis makes −0.9 and +0.1 look adjacent — so **a `diverging` map
 * used without a midpoint is a construction error**, not a default of zero.
 */
import type { TerminalCapabilities } from "../../terminal/capabilities.js";
import type { ColourValue } from "./types.js";
import type { ColormapName } from "../../data/viewmodel/index.js";
import { nearestCubeIndex } from "./resolve.js";

export type ColormapKind = "sequential" | "diverging" | "cyclic";

export type Colormap = Readonly<{
  name: string;
  kind: ColormapKind;
  /** Stops in order, sampled evenly across `[0, 1]`. */
  stops: readonly string[];
}>;

/**
 * The tables, sampled at ninths.
 *
 * **Sampled, and said so rather than claimed exact.** matplotlib distributes
 * viridis as 256 triples; these are its values at ninths with linear sRGB
 * interpolation between them, which is a *near* viridis and not byte-identical
 * to that table. Stating the resolution is the whole of the honesty here: a
 * table called `viridis` that nobody can reproduce is worse than one that says
 * how it was made.
 *
 * **Why it is enough, measured rather than asserted**: colour reaches a terminal
 * at 24-bit or through the 256-cube, and `colormap.test.ts` measures the
 * interpolation's disagreement with the anchors against the cube's own step. At
 * 8-bit the approximation is below the quantisation floor and cannot be seen; at
 * 24-bit it is visible and is a different shade of the same map, which is a cost
 * this records rather than hides.
 */
const VIRIDIS: Colormap = Object.freeze({
  name: "viridis",
  kind: "sequential",
  stops: Object.freeze([
    "#440154", "#472d7b", "#3b528b", "#2c728e", "#21918c",
    "#28ae80", "#5ec962", "#addc30", "#fde725",
  ]),
});

const MAGMA: Colormap = Object.freeze({
  name: "magma",
  kind: "sequential",
  stops: Object.freeze([
    "#000004", "#180f3d", "#440f76", "#721f81", "#9e2f7f",
    "#cd4071", "#f1605d", "#fd9668", "#fecf92",
  ]),
});

/**
 * Blue–white–red, and the white is the midpoint rather than a stop like any
 * other: it is the value the data's zero maps to, and a diverging map read
 * without one is a sequential map with a light patch in it.
 */
const COOLWARM: Colormap = Object.freeze({
  name: "coolwarm",
  kind: "diverging",
  stops: Object.freeze([
    "#3b4cc0", "#6788ee", "#9abbff", "#c9d7f0", "#edd1c2",
    "#f7a889", "#e26952", "#b40426", "#8b0000",
  ]),
});

/** Twilight — light at both ends, so a phase of 0 and 2π read alike. */
const TWILIGHT: Colormap = Object.freeze({
  name: "twilight",
  kind: "cyclic",
  stops: Object.freeze([
    "#e2d9e2", "#9ebeda", "#5a86ad", "#40518f", "#372a50",
    "#4a3055", "#7c4a6f", "#b5748a", "#e2d9e2",
  ]),
});

/**
 * The tables, keyed by C04's vocabulary.
 *
 * `Record<ColormapName, …>` rather than `Record<string, …>`: a name added to the
 * schema without a table here stops compiling, which is the direction the
 * mistake must not fall — a document that validates and paints nothing is F172.
 */
export const COLORMAPS: Readonly<Record<ColormapName, Colormap>> = Object.freeze({
  viridis: VIRIDIS,
  magma: MAGMA,
  coolwarm: COOLWARM,
  twilight: TWILIGHT,
});

function channel(hex: string, at: number): number {
  return Number.parseInt(hex.slice(at, at + 2), 16);
}

function mix(a: string, b: string, t: number): string {
  const of = (at: number): string =>
    Math.round(channel(a, at) + (channel(b, at) - channel(a, at)) * t)
      .toString(16)
      .padStart(2, "0");
  return `#${of(1)}${of(3)}${of(5)}`;
}

/**
 * The colour at `t`, clamped into `[0, 1]`.
 *
 * **Clamped rather than wrapped, including for `cyclic`.** A cyclic map's ends
 * meet, which is a statement about the *colours* — that a phase of 0 and 2π read
 * alike — and not permission to fold an out-of-range value back into the scale.
 * A value above the ceiling is out of range in every kind, and the caller's
 * range is what decides where the wrap is.
 */
export function sample(map: Colormap, t: number): string {
  const stops = map.stops;
  const first = stops[0] ?? "#000000";
  if (!Number.isFinite(t) || stops.length === 0) return first;
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  const scaled = clamped * (stops.length - 1);
  const low = Math.floor(scaled);
  const high = Math.min(stops.length - 1, low + 1);
  return mix(stops[low] ?? first, stops[high] ?? first, scaled - low);
}

/**
 * The depth below which a continuous map says **nothing** (I31).
 *
 * **Not *six levels* — nothing, and it rests on an invariant already ruled.**
 * I26 records that at 4-bit `0–15 are whatever the emulator's palette says`. A
 * sequential map's entire content is an **ordering**, and an ordering built from
 * indices whose luminances are unknown is not an ordering — it is sixteen
 * colours in an arbitrary sequence wearing viridis's name.
 *
 * So this is not a coarse rung, it is a **vacuous** one, and it declares itself
 * the way the heatmap's 1-bit rung does. That also makes 1-bit unchanged **by
 * construction** rather than by a fallback: colour is already gone one rung
 * above it, and density — which has eight steps at every depth — was the carrier
 * throughout (F34).
 */
const CONTINUOUS_FLOOR = 8;

/**
 * A continuous colour for a normalised value, or `undefined` for *no colour*.
 *
 * `undefined` rather than a default is the point: a caller that receives it
 * paints no foreground and the glyph carries the value alone, which is what it
 * was already doing.
 */
export function continuousColour(
  map: Colormap,
  t: number,
  caps: Pick<TerminalCapabilities, "colourDepth">,
): ColourValue | undefined {
  if (caps.colourDepth < CONTINUOUS_FLOOR) return undefined;
  const hex = sample(map, t);
  // 24-bit takes the sample; 8-bit takes the cube entry nearest it, per sample
  // rather than per set — see `nearestCubeIndex` for why that inverts a palette's
  // rule rather than contradicting it.
  return caps.colourDepth >= 24
    ? { kind: "rgb", hex }
    : { kind: "ansi256", index: nearestCubeIndex(hex) };
}
