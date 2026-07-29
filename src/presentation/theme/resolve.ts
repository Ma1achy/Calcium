/**
 * C10 §3 — the degradation ladder.
 *
 * | Depth | Resolution |
 * |---|---|
 * | 24 | the hex, verbatim |
 * | 8  | nearest entry in the 256-colour cube by perceptual distance, rank order preserved |
 * | 4  | the theme's curated map — never computed |
 * | 1  | no colour at all; typographic class only |
 *
 * **A palette resolves as a set**, once per `(theme, palette, depth)`. Rank order
 * and distinctness are properties of the set, and a per-slot nearest neighbour
 * can see neither: it will happily quantise `dim` above `default` and land `ok`
 * and `info` on the same green, and both failures are invisible in the
 * truecolour terminal where every value was authored.
 */

import type { Tone } from "../../data/viewmodel/index.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";
import { channels, luminance } from "./contrast.js";
import { MUST_STAY_DISTINCT } from "./four-bit.js";
import {
  NO_STYLE,
  type ColourRef,
  type ColourValue,
  type MonoClass,
  type PaletteSpec,
  type ResolvedTheme,
  type Style,
} from "./types.js";

type Depth = TerminalCapabilities["colourDepth"];

/**
 * Only the depth is read, and the whole record is taken so the call site reads
 * as "resolve against these capabilities" rather than as a number nobody can
 * trace back. C10 reads no environment; capabilities arrive injected (I12).
 */
type Caps = Readonly<Pick<TerminalCapabilities, "colourDepth">>;

// --- the 256-colour cube --------------------------------------------------

/**
 * Indices **16–255 only**. The first sixteen are whatever the emulator's palette
 * says they are — the same numbers a 4-bit theme deliberately curates — so
 * quantising into them would make an 8-bit result depend on a user's terminal
 * configuration while presenting itself as a measured nearest neighbour.
 */
const CUBE_LEVELS = [0, 95, 135, 175, 215, 255] as const;

function buildCube(): readonly Readonly<{ index: number; hex: string; lab: readonly [number, number, number]; lum: number }>[] {
  const entries: { index: number; hex: string; lab: readonly [number, number, number]; lum: number }[] = [];

  const push = (index: number, r: number, g: number, b: number): void => {
    const hex = `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
    entries.push({ index, hex, lab: toLab(hex), lum: luminance(hex) });
  };

  for (let r = 0; r < 6; r++) {
    for (let g = 0; g < 6; g++) {
      for (let b = 0; b < 6; b++) {
        push(16 + 36 * r + 6 * g + b, CUBE_LEVELS[r]!, CUBE_LEVELS[g]!, CUBE_LEVELS[b]!);
      }
    }
  }
  for (let i = 0; i < 24; i++) {
    const v = 8 + i * 10;
    push(232 + i, v, v, v);
  }

  return Object.freeze(entries);
}

const CUBE = buildCube();

/** The same entries, ordered by luminance — the axis every constraint uses. */
const BY_LUM = Object.freeze([...CUBE].sort((a, b) => a.lum - b.lum));

// --- perceptual distance --------------------------------------------------

/**
 * CIELAB, D65. "Perceptual distance" in the spec means something specific, and
 * RGB euclidean is not it: it puts two dark blues further apart than a mid green
 * and a mid yellow, which is how a nearest-neighbour walk produces a palette
 * nobody can read.
 */
function toLab(hex: string): readonly [number, number, number] {
  const [r, g, b] = channels(hex).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [
    number,
    number,
    number,
  ];

  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;

  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const [fx, fy, fz] = [f(x), f(y), f(z)];

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function deltaE(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

// --- 8-bit: the set, in luminance order ------------------------------------

/**
 * Below this, two source luminances are noise rather than a ranking, and the
 * resolver imposes no order on them (I6).
 */
const TIE = 0.02;

/**
 * Assign the whole palette at once so that no genuinely-ranked pair inverts.
 * That is what "rank order preserved" (I6) buys: if `dim` was darker than
 * `default` in 24-bit, it stays darker after quantisation.
 *
 * Slots in `MUST_STAY_DISTINCT` additionally refuse an index another member has
 * taken (I17). `ok` and `error` landing together is a failed row that reads as a
 * passing one; two quiet greys colliding costs nothing and is allowed.
 */
function quantiseSet(slots: Readonly<Record<string, string>>): Readonly<Record<string, number>> {
  const ordered = Object.entries(slots)
    .map(([slot, hex]) => ({ slot, lum: luminance(hex), lab: toLab(hex) }))
    .sort((a, b) => a.lum - b.lum);

  // I6 — rank order, by level rather than by neighbour.
  //
  // Two things had to be true at once, and each obvious version got one:
  //
  //   - Constraining every slot against its predecessor preserves the order and
  //     cascades. One slot bumped upward raises the floor for everything after
  //     it, and `meta` landing 0.11 lighter than its source dragged `ok` to
  //     near-white and `accent` to cream.
  //   - Exempting near-equal neighbours fixes the cascade and loses transitivity:
  //     `info` and `identifier` are 0.030 apart — a real ranking — with two
  //     near-equal steps between them, and the pair inverted while every
  //     adjacent check passed.
  //
  // So slots group into levels: a new level begins where the luminance has
  // risen by at least TIE from the level's first member. **Within a level there
  // is no order to preserve** — the source does not express one — and **every
  // level clears the one below it entirely**. Any pair separated by TIE or more
  // necessarily falls in different levels, which is the invariant stated.
  // The levels themselves are assigned as one problem rather than one at a time,
  // and that is the third version of this. Level-at-a-time was still greedy: a
  // level's ceiling is its *worst* member's pick, so `meta` — whose nearest
  // lilac in the cube sits 0.11 lighter than the token — set a floor that
  // dragged `identifier`, `accent` and `warn` into pale washes of themselves.
  //
  // A greedy walk cannot trade a small loss on one slot for a large saving on
  // the next, and that trade is the entire question. So: minimise total
  // perceptual distance subject to level monotonicity, over the ceiling each
  // level hands to the one above it.
  const chosen = ordered.map((entry) => ({ ...entry, pick: CUBE[0]! }));

  const levels: (typeof chosen)[number][][] = [];
  let levelStart = ordered[0]?.lum ?? 0;
  for (const entry of chosen) {
    if (levels.length === 0 || entry.lum - levelStart >= TIE) {
      levels.push([]);
      levelStart = entry.lum;
    }
    levels[levels.length - 1]!.push(entry);
  }

  const rows = levels.map((members) => members.map((m) => BY_LUM.map((c) => deltaE(m.lab, c.lab))));

  // dp[u] — the cheapest way to place every level so far with nothing above u.
  let dp = new Array(BY_LUM.length).fill(0) as number[];
  let back: number[][] = [];

  for (let r = 0; r < rows.length; r++) {
    const level = levels[r]!;
    const dist = rows[r]!;
    // running[t][u] is a min over a widening window, so it is swept rather than
    // recomputed: for each lower bound, walk the upper bound once.
    const next = new Array(BY_LUM.length).fill(Infinity) as number[];
    const cameFrom = new Array(BY_LUM.length).fill(0) as number[];

    for (let t = 0; t < BY_LUM.length; t++) {
      if (!Number.isFinite(dp[t]!)) continue;
      const running = level.map(() => Infinity);
      for (let u = t; u < BY_LUM.length; u++) {
        let total = dp[t]!;
        for (let m = 0; m < level.length; m++) {
          running[m] = Math.min(running[m]!, dist[m]![u]!);
          total += running[m]!;
        }
        if (total < next[u]!) {
          next[u] = total;
          cameFrom[u] = t;
        }
      }
    }

    dp = next;
    back.push(cameFrom);
  }

  // Reconstruct the ceilings, then place each member at its nearest inside the
  // window its level was given.
  let at = 0;
  for (let u = 1; u < dp.length; u++) if (dp[u]! < dp[at]!) at = u;

  const ceilings: number[] = new Array(levels.length).fill(0);
  for (let i = levels.length - 1; i >= 0; i--) {
    ceilings[i] = at;
    at = back[i]![at]!;
  }

  let floorAt = 0;
  for (let i = 0; i < levels.length; i++) {
    const lower = BY_LUM[floorAt]!.lum;
    const upper = BY_LUM[ceilings[i]!]!.lum;
    for (const member of levels[i]!) {
      member.pick = nearest(member.lab, (c) => c.lum >= lower && c.lum <= upper);
    }
    floorAt = ceilings[i]!;
  }

  // I17 at 8-bit — the five tones whose confusion would mislead. Invisible in
  // truecolour, which is where every value was authored and every golden will be
  // reviewed, so nothing but this check would ever report it.
  const taken = new Set<number>();
  for (let i = 0; i < chosen.length; i++) {
    const entry = chosen[i]!;
    if (!MUST_STAY_DISTINCT.includes(entry.slot)) continue;
    if (!taken.has(entry.pick.index)) {
      taken.add(entry.pick.index);
      continue;
    }

    // The replacement stays inside the window its neighbours leave it, so
    // separating two tones cannot reintroduce the inversion the DP just ruled
    // out. A distinctness fix that broke rank order would trade one invariant
    // for another and pass both tests separately.
    const lower = chosen[i - 1]?.pick.lum ?? -Infinity;
    const upper = chosen[i + 1]?.pick.lum ?? Infinity;
    entry.pick = nearest(entry.lab, (c) => !taken.has(c.index) && c.lum >= lower && c.lum <= upper);
    taken.add(entry.pick.index);
  }

  const out: Record<string, number> = {};
  for (const { slot, pick } of chosen) out[slot] = pick.index;
  return Object.freeze(out);
}

/** Nearest cube entry satisfying `allowed`, or the nearest overall (I1: total). */
function nearest(
  lab: readonly [number, number, number],
  allowed?: (candidate: (typeof CUBE)[number]) => boolean,
): (typeof CUBE)[number] {
  let best: (typeof CUBE)[number] | undefined;
  let bestDistance = Infinity;
  let fallback = CUBE[0]!;
  let fallbackDistance = Infinity;

  for (const candidate of CUBE) {
    const d = deltaE(lab, candidate.lab);
    if (d < fallbackDistance) {
      fallbackDistance = d;
      fallback = candidate;
    }
    if (allowed !== undefined && !allowed(candidate)) continue;
    if (d < bestDistance) {
      bestDistance = d;
      best = candidate;
    }
  }

  return best ?? fallback;
}

// --- 1-bit ------------------------------------------------------------------

const MONO: Readonly<Record<MonoClass, Style>> = Object.freeze({
  emphasised: Object.freeze({ bold: true }),
  normal: NO_STYLE,
  deemphasised: Object.freeze({ dim: true }),
});

// --- the cache --------------------------------------------------------------

/**
 * Keyed on `(ref, theme.name, depth)` — I11. `theme.name` carries the variant
 * and a serial that changes when overrides are applied, so a warm cache cannot
 * serve a pre-override style even before `clear()` runs. Depth is in the key
 * because it changes at runtime through a config override (T3.8), and a cache
 * keyed on the ref alone returns a truecolour style to a terminal that has since
 * been found to have sixteen.
 */
const styles = new Map<string, Style>();
const quantised = new Map<string, Readonly<Record<string, number>>>();

export function clearResolutionCache(): void {
  styles.clear();
  quantised.clear();
}

/** For T2.2 and T3.8 — the tests assert behaviour, not the cache's existence. */
export function cacheSize(): number {
  return styles.size;
}

function quantisedFor(theme: ResolvedTheme, palette: string, slots: Readonly<Record<string, string>>): Readonly<Record<string, number>> {
  const key = `${theme.name}|${palette}`;
  const held = quantised.get(key);
  if (held !== undefined) return held;

  const built = quantiseSet(slots);
  quantised.set(key, built);
  return built;
}

// --- resolution -------------------------------------------------------------

function split(ref: ColourRef): readonly [string, string] {
  const at = ref.indexOf(".");
  return at === -1 ? [ref, ""] : [ref.slice(0, at), ref.slice(at + 1)];
}

function styleOf(colour: ColourValue | undefined): Style {
  return colour === undefined ? NO_STYLE : Object.freeze({ colour });
}

/**
 * `resolve` is pure and total (I1). Every ref × every capability record yields a
 * `Style`, and an unknown ref yields the empty one rather than a throw — a
 * missing slot must not be the thing that takes a session down mid-render.
 */
export function resolve(ref: ColourRef, theme: ResolvedTheme, caps: Caps): Style {
  const key = `${ref}|${theme.name}|${caps.colourDepth}`;
  const held = styles.get(key);
  if (held !== undefined) return held;

  const computed = compute(ref, theme, caps.colourDepth);
  styles.set(key, computed);
  return computed;
}

function compute(ref: ColourRef, theme: ResolvedTheme, depth: Depth): Style {
  const [paletteName, slot] = split(ref);

  if (paletteName === "surface") return surface(ref, slot, theme, depth);

  const palette: PaletteSpec | undefined = theme.tokens.palettes[paletteName];
  const hex = palette?.slots[slot];
  if (palette === undefined || hex === undefined) return NO_STYLE;

  if (depth === 1) {
    // A decoration palette has no meaning to preserve, so it collapses to the
    // default foreground. A meaning palette collapses to the class it declared,
    // and that is only lossless because D29 holds: the glyph carries it.
    if (palette.monochrome === "foreground") return NO_STYLE;
    return MONO[palette.classes?.[slot] ?? "normal"];
  }

  if (depth === 24) return styleOf({ kind: "rgb", hex });

  if (depth === 4) {
    const index = theme.tokens.fourBit[ref];
    return index === undefined ? NO_STYLE : styleOf({ kind: "ansi16", index });
  }

  const index = quantisedFor(theme, paletteName, palette.slots)[slot];
  return index === undefined ? NO_STYLE : styleOf({ kind: "ansi256", index });
}

/**
 * Surfaces follow the same ladder and **vanish entirely at 1-bit** (I8): no
 * background is painted, borders are drawn with box characters alone, and a
 * component asking for a surface receives an empty `Style` rather than black.
 * Black is what a monochrome terminal is already showing.
 */
function surface(ref: ColourRef, slot: string, theme: ResolvedTheme, depth: Depth): Style {
  const hex = (theme.tokens.surfaces as Readonly<Record<string, string>>)[slot];
  if (hex === undefined) return NO_STYLE;

  if (depth === 1) return NO_STYLE;
  if (depth === 24) return styleOf({ kind: "rgb", hex });

  if (depth === 4) {
    const index = theme.tokens.fourBit[ref];
    return index === undefined ? NO_STYLE : styleOf({ kind: "ansi16", index });
  }

  const index = quantisedFor(theme, "surface", theme.tokens.surfaces as Readonly<Record<string, string>>)[slot];
  return index === undefined ? NO_STYLE : styleOf({ kind: "ansi256", index });
}

/** The ergonomic form. `tone` is the overwhelmingly common case (§2). */
export function resolveTone(tone: Tone, theme: ResolvedTheme, caps: Caps): Style {
  return resolve(`tone.${tone}`, theme, caps);
}
