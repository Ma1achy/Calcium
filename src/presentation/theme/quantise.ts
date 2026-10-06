/**
 * C10 §4c — the 256-colour cube, the perceptual distance over it, and the
 * quantisation of a slot set into it (I6, I17, I26, I41).
 *
 * **Split from `resolve.ts` so the computation has a name the generator and
 * the test can call without the table in front of it** (I41). `quantiseSet`
 * is what the resolver calls: the shipped table first, the DP for a set it
 * does not hold. `computeQuantisation` is the DP alone; its consumers outside
 * this file are `tools/theme/quantised.mjs`, which writes the table, and
 * T3.73, which holds the two in step. That is an export with no `src/`
 * caller other than this file, and it is deliberate: a computation whose only
 * entry reads a cache of itself cannot be checked against the cache.
 */
import { channels, luminance } from "./contrast.js";
import { MUST_STAY_DISTINCT } from "./four-bit.js";
import { CUBE_LEVELS } from "./colormap.js";
import { QUANTISED } from "./quantised.generated.js";

// --- the 256-colour cube --------------------------------------------------

/**
 * Indices **16–255 only**. The first sixteen are whatever the emulator's palette
 * says they are — the same numbers a 4-bit theme deliberately curates — so
 * quantising into them would make an 8-bit result depend on a user's terminal
 * configuration while presenting itself as a measured nearest neighbour.
 */
// `CUBE_LEVELS` is `colormap.ts`'s — one definition, three callers (C12 §3y).

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
 * Which cube entries a slot may take, asked of the entry's hex (C10 I69). A slot
 * with no entry takes any: the floor is where the gate is, and a slot the gate
 * does not measure on this ground is not held to anything here.
 */
export type Admits = Readonly<Record<string, (hex: string) => boolean>>;

const everything = (): boolean => true;

/**
 * Assign the whole palette at once so that no genuinely-ranked pair inverts.
 * That is what "rank order preserved" (I6) buys: if `dim` was darker than
 * `default` in 24-bit, it stays darker after quantisation.
 *
 * Slots in `MUST_STAY_DISTINCT` additionally refuse an index another member has
 * taken (I17). `ok` and `error` landing together is a failed row that reads as a
 * passing one; two quiet greys colliding costs nothing and is allowed.
 */
export function computeQuantisation(
  slots: Readonly<Record<string, string>>,
  admits?: Admits,
): Readonly<Record<string, number>> {
  const ordered = Object.entries(slots)
    .map(([slot, hex]) => ({ slot, hex: hex.toLowerCase(), lum: luminance(hex), lab: toLab(hex), admits: admits?.[slot] ?? everything }))
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

  // I69 — an entry a member's floor refuses is not a distance at all, so the
  // DP places the floor exactly as it places rank: as a constraint on the one
  // problem, never as a pass after it.
  const rows = levels.map((members) => members.map((m) => BY_LUM.map((c) => (m.admits(c.hex) ? deltaE(m.lab, c.lab) : Infinity))));

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

  if (Number.isFinite(dp[at]!)) {
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
        member.pick = nearest(member.lab, (c) => c.lum >= lower && c.lum <= upper && member.admits(c.hex));
      }
      floorAt = ceilings[i]!;
    }
  } else {
    // **No assignment holds both the floor and rank** (I69, §4c.4 row 5). Two
    // ways in: a member no entry admits — a ground whose inks sit on both sides
    // at a floor no cube ground gives both — or a lower-ranked member admitting
    // only the light side of its ground and a higher-ranked one only the dark
    // side of its own, which one set holds only with members on different
    // grounds, the hue inks. The floor holds and rank yields: each member takes
    // its nearest admitted entry, and one admitted nowhere its nearest. Measured
    // on the shipped themes it is never reached; `resolve` is total (I1), so it
    // is answered rather than thrown.
    for (const member of chosen) member.pick = nearest(member.lab, (c) => member.admits(c.hex));
  }

  // I17 at 8-bit — the five tones whose confusion would mislead. Invisible in
  // truecolour, which is where every value was authored and every golden will be
  // reviewed, so nothing but this check would ever report it.
  //
  // **Two slots the set gives one value are one ink, not a collision** (§4c.4
  // row 6). I17's premise is that no two slots carry the same 24-bit value, and
  // a band breaks it on purpose: every slot on it is the band's one ink
  // (R-THM-005), so separating them split `hcLight`'s black focus ink into five
  // near-blacks and its selection white into five near-whites.
  const taken = new Map<number, string>();
  for (let i = 0; i < chosen.length; i++) {
    const entry = chosen[i]!;
    if (!MUST_STAY_DISTINCT.includes(entry.slot)) continue;
    const holder = taken.get(entry.pick.index);
    if (holder === undefined || holder === entry.hex) {
      taken.set(entry.pick.index, entry.hex);
      continue;
    }

    // The replacement stays inside the window its neighbours leave it, so
    // separating two tones cannot reintroduce the inversion the DP just ruled
    // out. A distinctness fix that broke rank order would trade one invariant
    // for another and pass both tests separately.
    //
    // **Where the floor leaves that window empty, the order of what yields is
    // ruled, not found** (I69, §4c.4 row 4): the floor holds first, distinctness
    // second and rank last. `paper`'s `ok` is the case — on its page the DP gives
    // it and `info` one grey, and the window its neighbours leave has no free
    // entry that clears, so the nearest-overall fallback this line used to reach
    // put it back on the green that misses, at 3.54 against 4.5.
    const lower = chosen[i - 1]?.pick.lum ?? -Infinity;
    const upper = chosen[i + 1]?.pick.lum ?? Infinity;
    const free = (c: (typeof CUBE)[number]): boolean => !taken.has(c.index) && entry.admits(c.hex);
    entry.pick =
      closest(entry.lab, (c) => free(c) && c.lum >= lower && c.lum <= upper) ??
      closest(entry.lab, free) ??
      nearest(entry.lab, (c) => entry.admits(c.hex));
    taken.set(entry.pick.index, entry.hex);
  }

  const out: Record<string, number> = {};
  for (const { slot, pick } of chosen) out[slot] = pick.index;
  return Object.freeze(out);
}

/**
 * A hex to its nearest 256-cube index (C10 I31).
 *
 * **Exported for the colormap and for nothing else.** A palette slot is
 * quantised through `quantiseSet`, which preserves *rank order across a set* —
 * the property that keeps eight tones distinct from one another. A colormap has
 * no set: it is a continuum, and its neighbouring samples are *meant* to be
 * close, so rank preservation has nothing to hold apart and per-sample nearest
 * neighbour is the right answer here for the reason it is the wrong one there.
 */
/** Nearest cube entry satisfying `allowed`, or the nearest overall (I1: total). */
function nearest(
  lab: readonly [number, number, number],
  allowed?: (candidate: (typeof CUBE)[number]) => boolean,
): (typeof CUBE)[number] {
  return closest(lab, allowed) ?? closest(lab)!;
}

/** Nearest cube entry satisfying `allowed`, or `undefined` where none does. */
function closest(
  lab: readonly [number, number, number],
  allowed?: (candidate: (typeof CUBE)[number]) => boolean,
): (typeof CUBE)[number] | undefined {
  let best: (typeof CUBE)[number] | undefined;
  let bestDistance = Infinity;

  for (const candidate of CUBE) {
    if (allowed !== undefined && !allowed(candidate)) continue;
    const d = deltaE(lab, candidate.lab);
    if (d < bestDistance) {
      bestDistance = d;
      best = candidate;
    }
  }

  return best;
}

// --- the shipped table ------------------------------------------------------

/**
 * A set's identity for the table: its entries in slot order, serialised (I41).
 * Slot order rather than authored order, so a theme whose surfaces are listed
 * differently but valued the same reads the same entry.
 */
export function quantisationKey(slots: Readonly<Record<string, string>>): string {
  return JSON.stringify(Object.entries(slots).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/**
 * The resolver's entry: the shipped table first, the DP for a set it does not
 * hold (I41). The table's entry is returned as held — frozen, the same object
 * on every call — which is what T3.73 reads to know the DP did not run.
 */
export function quantiseSet(slots: Readonly<Record<string, string>>): Readonly<Record<string, number>> {
  return QUANTISED[quantisationKey(slots)] ?? computeQuantisation(slots);
}

/** A cube index back to the hex the standard fixes for it; `null` off the cube. */
export function cubeHexOf(index: number): string | null {
  return CUBE.find((entry) => entry.index === index)?.hex ?? null;
}
