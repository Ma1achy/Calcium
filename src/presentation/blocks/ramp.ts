/**
 * Ramps — the extent per kind and the five loops (C09 §5 *Ramps*, I50–I54).
 *
 * A `Ramp` (C04 §3am.2) is a function `[0, 1] → Colour`. This module supplies
 * its **argument**: which kinds have an extent and of what shape, and what
 * `tick` does to `t` before C10 samples it (`rampStyle`). Nothing here reads a
 * clock or a capability; the frame is a function of `tick` and of nothing else,
 * which is what keeps the GIF catalogue deterministic.
 */
import type { Block, BlockKind, KnownBlockKind, Progress, Ramp, RampAnimation, TextSpan } from "../../data/viewmodel/index.js";
import { spinnerIntervalMs } from "./glyphs.js";
import type { Motion } from "./types.js";

/**
 * What a ramp varies over, per kind (I50). **A record and never a `Set`**, for
 * the reason `ANIMATES` is one: exhaustive in both directions, so a kind added
 * to the union without an entry is a type error and so is an entry for a kind
 * that no longer exists. `clusters` for the span carriers, `axis` for the bar,
 * `none` for the rest — and a kind marked `none` has no member to carry a ramp
 * (C04 I108), so the record is the statement and the type is the gate.
 */
export type RampExtent = "none" | "clusters" | "axis";
// **`KnownBlockKind` and not `BlockKind`** (C04 I119): the union is open and
// this table is the framework's own. Keyed on the open union it would demand
// an entry for a kind an app declared and this build never heard of.
export const RAMP_EXTENT: Readonly<Record<KnownBlockKind, RampExtent>> = Object.freeze({
  code: "none",
  comparison: "none",
  events: "none",
  group: "none",
  keyValue: "none",
  image: "none",
  // A ramp over a child's screen would repaint the child's colours with the
  // application's, which inverts C04 §3i's whole argument (C09 I57).
  terminal: "none",
  logs: "none",
  mosaic: "none",
  notice: "clusters",
  panel: "none",
  patch: "none",
  pills: "none",
  // A choice and a control take grounds, never inks over an axis (C09 I105, I106).
  choice: "none",
  control: "none",
  plot: "none",
  progress: "axis",
  raw: "clusters",
  rule: "clusters",
  scroll: "none",
  status: "none",
  steps: "none",
  // A tape is one row of labels and marks; there is no run of text for a ramp
  // to cool along, on the reason `steps` and `pills` both give.
  tape: "none",
  // A tree is rows of names under guides — no run of text for a ramp to cool
  // along, on `tape`'s reason.
  tree: "none",
  // A split holds two panes and draws a divider; the ramp is its children's,
  // as a group's is.
  split: "none",
  form: "none",
  table: "clusters",
  tip: "none",
});

/**
 * The cadence a moving ramp asks for (I53, I54): the default spinner set's, through
 * the same lookup `status` and `steps` use — **no millisecond literal here**. What
 * a tick *is* is C03's: the scheduler clamps every request to its spinner window,
 * so one tick is one window and the periods below are counted in ticks. This
 * module may not import C03 (MG21: `presentation/` reaches `terminal/` through
 * `escapes.ts` alone), and it does not need to.
 */
export function rampCadenceMs(): number {
  return spinnerIntervalMs();
}

/** The position of cell `i` in an extent of `n` (I51, I52): the midpoint for one cell, because one cell cannot show a direction. */
export function extentT(i: number, n: number): number {
  return n <= 1 ? 0.5 : i / (n - 1);
}

const BREATHE_TICKS = 20;
const PULSE_TICKS = 10;
const HEARTBEAT: readonly number[] = Object.freeze([1, 0.5, 0, 1, 0.5, 0, 0, 0, 0, 0, 0, 0]);
const SHIMMER_HALF_WIDTH = 1.5;

/** §037's *seconds apart*: the band passes, then the extent rests for 60 ticks. */
const GLINT_REST = 60;
/** §037's *a slow swell*: two and a half times `breathe`, so the two do not read alike. */
const TIDE_TICKS = 50;
/** Two periods with no common factor, which is how *never repeating* is spelled in integers. */
const DRIFT_A = 37;
const DRIFT_B = 53;
/** §037's *unsteady, irregular, **low***: the amplitude is the word `low`. */
const FLICKER_CEILING = 0.35;
/** §037's *a chase of three points*. */
const CHASE_POINTS = 3;
/** `flicker, settle, flicker, settle` — two bursts and two rests, in ticks. */
const NEON: readonly number[] = Object.freeze([1, 0.2, 0.9, 0.1, 1, 1, 1, 1, 0.3, 1, 1, 1, 1, 1, 1, 1]);
/** How long a one-shot runs before it holds its final frame, beyond the extent it crosses. */
const POP_TICKS = 6;
const RIPPLE_TICKS = 12;

/**
 * **A deterministic hash, because a frame must be reproducible.**
 *
 * Four of these effects are *irregular* by their own description — `flicker`,
 * `twinkle`, `scatter`, and `neon`'s jitter — and an RNG would make every golden
 * frame a different frame. So irregularity is a function of `(i, k)`: the same
 * cell at the same tick is the same value on every machine and in every run,
 * and it still has no pattern a reader can predict. This is the same trade
 * `drift` makes with two incommensurable periods, one integer arithmetic and one
 * trigonometric.
 */
function hash01(a: number, b: number): number {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545f491) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 0x100000000;
}

/** A triangular band of half-width `w` centred on `c`, at cell `i`: 1 at the centre, 0 outside. */
function band(i: number, c: number, w: number): number {
  return Math.max(0, 1 - Math.abs(i - c) / w);
}

/** How far the extent is into a one-shot, or `undefined` while it has not started. */
function shotProgress(since: number | undefined, k: number, ticks: number): number | undefined {
  if (since === undefined) return 0;
  const elapsed = k - Math.floor(since);
  if (elapsed <= 0) return 0;
  return elapsed >= ticks ? undefined : elapsed / ticks;
}

/**
 * `t' = f(t, tick, n)` — the one term an effect adds before the fill is sampled
 * (I53). `tick = 0` is the static frame.
 *
 * **Eighteen of the twenty-three arrived with the design registry**, and five of
 * those are one-shots, which C04 I109 said could not exist here. They can: the
 * render has no birth tick of its own, and it does not need one, because the
 * block carries the tick it began on (`Ramp.since`). A one-shot with no stamp
 * draws its first frame and stays there — not its last, because *unstarted* and
 * *finished* are different facts and only one of them has happened.
 *
 * | effect | `t'` | period |
 * |---|---|---|
 * | `shimmer` | a band of half-width 1.5 whose centre moves one cell per tick; the ramp is the band's profile | `n + 3` ticks |
 * | `wave` | the ramp translates one cell per tick and wraps | `n` ticks |
 * | `breathe` | `½(1 + sin 2π·tick/20)`, constant across the extent | 20 ticks |
 * | `pulse` | two states, five ticks each | 10 ticks |
 * | `heartbeat` | two beats front-loaded, then rest | 12 ticks |
 * | `sweepbar` | `shimmer`'s band with an exponential trail behind it — the leading edge is hard, the wake decays | `n + 3` ticks |
 * | `glint` | one band pass, then 60 ticks of rest | `n + 3 + 60` |
 * | `tide` | `breathe` given a position phase, so the swell travels | 50 ticks |
 * | `flicker` | `hash(0, tick)` scaled to `[0, 0.35]`, constant across the extent | aperiodic |
 * | `twinkle` | per cell, `hash(i, tick)` thresholded — independent points | aperiodic |
 * | `pendulum` | a band whose centre is a triangle wave over the extent | `2(n − 1)` ticks |
 * | `converge` | two bands, one from each edge, meeting at the centre | `⌈n/2⌉ + 3` |
 * | `marquee` | a rectangular window of width `n/3` sliding and wrapping | `n` ticks |
 * | `chase` | three narrow bands evenly spaced, all moving one cell per tick | `n` ticks |
 * | `neon` | a sixteen-tick envelope: two bursts of jitter, then steady | 16 ticks |
 * | `drift` | two sines at 37 and 53 ticks — no common period inside any session | ≈37·53 ticks |
 * | `bookend` | `converge` reversed: the edges arrive first and the centre last | `⌈n/2⌉ + 3` |
 * | `scatter` | each cell lights in a hashed order within one pass | `n + 3` ticks |
 * | `sweep` | **one-shot** — a band crosses once; after, every cell at `to` | `n + 3` then held |
 * | `pop` | **one-shot** — one flash, then rest | 6 ticks then held |
 * | `wipe` | **one-shot** — a hard edge crosses once; after, every cell changed | `n` then held |
 * | `typewriter` | **one-shot** — cells brighten one per tick, inline-start first | `n` then held |
 * | `ripple` | **one-shot** — a ring expands from the centre, then rest | 12 ticks then held |
 */
export function animateT(
  effect: RampAnimation | undefined,
  t: number,
  tick: number,
  n: number,
  i: number,
  since?: number,
): number {
  const k = Math.max(0, Math.floor(tick));
  const span = Math.max(1, n);
  switch (effect) {
    case undefined:
    case "none":
      return t;
    case "shimmer": {
      const period = span + 3;
      return band(i, (k % period) - SHIMMER_HALF_WIDTH, SHIMMER_HALF_WIDTH);
    }
    case "wave": {
      const shift = n <= 1 ? 0 : (k % n) / n;
      const moved = (t + shift) % 1;
      return moved < 0 ? moved + 1 : moved;
    }
    case "breathe":
      return 0.5 * (1 + Math.sin((2 * Math.PI * k) / BREATHE_TICKS));
    case "pulse":
      return k % PULSE_TICKS < PULSE_TICKS / 2 ? 0 : 1;
    case "heartbeat":
      return HEARTBEAT[k % HEARTBEAT.length] ?? 0; // cells-ok — an envelope length

    // --- the thirteen periodic effects the registry adds ---------------------
    case "sweepbar": {
      // A hard leading edge and a wake: ahead of the band nothing, behind it a
      // decay. §035's *active progress* — the trail is what says the fill is
      // being worked through rather than merely lit.
      const period = span + 3;
      const head = (k % period) - SHIMMER_HALF_WIDTH;
      if (i > head) return 0;
      return Math.max(0, 1 - (head - i) / (span / 2 + 1));
    }
    case "glint": {
      // One pass, then the extent rests. The rest is the effect: §037 calls it
      // *rare*, and a band that never stops is `shimmer`.
      const pass = span + 3;
      const phase = k % (pass + GLINT_REST);
      if (phase >= pass) return 0;
      return band(i, phase - SHIMMER_HALF_WIDTH, SHIMMER_HALF_WIDTH);
    }
    case "tide":
      // `breathe` with a position term, so the swell has an end it starts from.
      return 0.5 * (1 + Math.sin(2 * Math.PI * (k / TIDE_TICKS - t)));
    case "flicker":
      // Constant across the extent — an unstable *connection* is one fact about
      // the whole run, not a property of each cell.
      return hash01(0, k) * FLICKER_CEILING;
    case "twinkle":
      // Per cell and independent, which is the difference from `flicker`: many
      // small things, each with its own state.
      return hash01(i, Math.floor(k / 2)) > 0.8 ? 1 : 0;
    case "pendulum": {
      // A triangle wave, so it reverses at the ends rather than wrapping —
      // *searching*, and a search that wrapped would be a scan.
      const sweepSpan = Math.max(1, span - 1);
      const phase = k % (2 * sweepSpan);
      const centre = phase <= sweepSpan ? phase : 2 * sweepSpan - phase;
      return band(i, centre, SHIMMER_HALF_WIDTH);
    }
    case "converge": {
      // Both ends toward the middle. The distance travelled is half the extent,
      // so the period is half `shimmer`'s — which is what *closing in* reads as.
      const half = Math.ceil(span / 2);
      const phase = k % (half + 3);
      const from = phase - SHIMMER_HALF_WIDTH;
      return Math.max(band(i, from, SHIMMER_HALF_WIDTH), band(i, span - 1 - from, SHIMMER_HALF_WIDTH));
    }
    case "marquee": {
      // A window, not a band: `marquee` is content that does not fit, so what
      // moves is a run rather than a highlight. It wraps, which is §037's own
      // word and is why this is not a one-shot.
      const width = Math.max(1, Math.round(span / 3));
      const start = k % span;
      const offset = (i - start + span) % span;
      return offset < width ? 1 : 0;
    }
    case "chase": {
      // Three points, evenly spaced, all moving together — *streaming*, where the
      // spacing is what makes the direction readable at a glance.
      const gap = span / CHASE_POINTS;
      let best = 0;
      for (let p = 0; p < CHASE_POINTS; p += 1) {
        const centre = (k + p * gap) % span;
        best = Math.max(best, band(i, centre, 1));
        // The wrap seam: a point half off the end is half on the start.
        best = Math.max(best, band(i, centre - span, 1));
      }
      return best;
    }
    case "neon":
      // An envelope rather than a hash, because *flicker, settle* is a shape and
      // not noise: the settling is the part that reads as connecting.
      return NEON[k % NEON.length] ?? 1; // cells-ok — an envelope length
    case "drift": {
      // Two sines whose periods share no factor. It repeats after 37·53 = 1 961
      // ticks, which at the spinner cadence is minutes — *never repeating* for
      // any run that will see it, and honest about being periodic underneath.
      const a = Math.sin((2 * Math.PI * k) / DRIFT_A);
      const b = Math.sin((2 * Math.PI * k) / DRIFT_B + t * Math.PI);
      return 0.5 * (1 + (a + b) / 2);
    }
    case "bookend": {
      // `converge` run backwards: the edges land first. *Converging* is what the
      // registry calls it, and the difference from `converge` is which end of
      // the motion you are watching.
      const half = Math.ceil(span / 2);
      const period = half + 3;
      const phase = period - 1 - (k % period);
      const from = phase - SHIMMER_HALF_WIDTH;
      return Math.max(band(i, from, SHIMMER_HALF_WIDTH), band(i, span - 1 - from, SHIMMER_HALF_WIDTH));
    }
    case "scatter": {
      // Each cell has a place in a hashed order and lights when the pass reaches
      // it — *one glyph at a time, irregular*. Hashed on `i` alone, so the order
      // is stable within a pass rather than re-rolled every tick.
      const period = span + 3;
      const place = Math.floor(hash01(i, 0) * period);
      return (k % period) === place ? 1 : 0;
    }

    // --- the five one-shots --------------------------------------------------
    case "sweep": {
      // A band crosses once. Finished, every cell sits at `to`: *done* is a state
      // and the frame that shows it is the full one.
      const p = shotProgress(since, k, span + 3);
      if (p === undefined) return 1;
      return band(i, p * (span + 3) - SHIMMER_HALF_WIDTH, SHIMMER_HALF_WIDTH);
    }
    case "pop": {
      // One flash, then it settles — so the resting frame is 0 and not 1, which
      // is the difference between *arrived once* and *done*.
      const p = shotProgress(since, k, POP_TICKS);
      if (p === undefined) return 0;
      return 1 - p;
    }
    case "wipe": {
      // A hard edge, not a band: *cleanly*. Behind it the new state, ahead of it
      // the old, and afterwards the whole run is the new one.
      const p = shotProgress(since, k, span);
      if (p === undefined) return 1;
      return i <= p * span ? 1 : 0;
    }
    case "typewriter": {
      // Cells brighten one per tick from inline-start. It reveals by brightening
      // and never by withholding a cluster, which is what keeps it inside
      // R-MOT-005 and out of `measure`'s way.
      const p = shotProgress(since, k, span);
      if (p === undefined) return 1;
      return i <= p * span ? 1 : 0;
    }
    case "ripple": {
      // A ring leaving the centre, once. *Acknowledged* — it says a thing was
      // received, and then there is nothing more to say, so it rests at 0.
      const p = shotProgress(since, k, RIPPLE_TICKS);
      if (p === undefined) return 0;
      const centre = (span - 1) / 2;
      const radius = p * (centre + 1);
      return band(Math.abs(i - centre), radius, 1);
    }
  }
}

/**
 * **The ambient attention group** — `rampPolicy.attentionGroups.ambient` (C09
 * I99, `R-MOT-003`, `R-MOT-012`). The three the design calls decorative, and
 * the three `reduced` stops.
 *
 * Held here as a table and compared against the registry **by equality** in
 * T2.168, as the bar alphabets and the spinner sets are (I94, I98): a
 * membership written twice drifts, and a subset check would let a fourth
 * arrive in the registry with this set never noticing. The other four groups —
 * `working`, `waiting`, `attention`, `terminal` — each say something a reader
 * is meant to act on, so `reduced` keeps them; `off` is what stops those.
 */
export const AMBIENT_ANIMATIONS: ReadonlySet<RampAnimation> = new Set<RampAnimation>(["glint", "drift", "tide"]);

/**
 * The effect a ramp actually runs under this reader's preference (C09 I99,
 * `R-MOT-001`, `R-MOT-003`).
 *
 * **`none` and not a frozen tick, which is the whole of the choice here.**
 * `animateT(undefined | "none", t, …)` returns `t` — the ramp drawn flat along
 * its extent, which is the still picture. Pinning the tick to zero instead
 * would return frame 0 of a moving thing: `shimmer`'s band parked at the
 * inline-start edge, a stripe that reads as a paused animation rather than as a
 * ramp. The state survives either way on `R-MOT-002`'s three carriers — the
 * mark, the label and the elapsed text — so nothing is lost by drawing the
 * honest still figure.
 *
 * `off` stops every effect; `reduced` stops `AMBIENT_ANIMATIONS` alone.
 */
export function effectiveAnimation(effect: RampAnimation | undefined, motion: Motion = "full"): RampAnimation | undefined {
  if (motion === "off") return "none";
  if (motion === "reduced" && effect !== undefined && AMBIENT_ANIMATIONS.has(effect)) return "none";
  return effect;
}

/**
 * The tick a **colour** effect sees — **the depth axis and only that** (C10 I36's
 * rung, applied here because C10 has no tick to read): below 8-bit motion
 * resolves to `none`, so the frame is `tick = 0` — three colours moving is a
 * flicker, and a flicker is worse than a static tone. The cadence is still
 * declared (I54); the frame is stable.
 *
 * **Two axes, one owner each, and the second gate this function briefly had was
 * dead** (C09 I99). Depth is the terminal's and motion is the reader's, and a
 * reader's `off` reaches a ramp through `effectiveAnimation` — which both call
 * sites apply to the effect before handing it the tick, so an `if (motion ===
 * "off") return 0` here was byte-identical for every input the type admits. The
 * mutation pass found it: deleting the branch failed nothing, and the finding
 * was about the code rather than about a missing row. A ramp's stillness has
 * one owner and it is the effect, not the clock.
 *
 * The pair to this is `glyphTick`, below, and it is §038's own split — *below
 * 8-bit colour interpolation stops; discrete glyph motion remains*. Both halves
 * were true in this tree before I99 and lived in two files with nothing naming
 * them together; they are two functions now so a reader meeting one finds the
 * other.
 */
export function effectiveTick(tick: number | undefined, caps: Readonly<{ colourDepth: number }>): number {
  return caps.colourDepth >= 8 ? (tick ?? 0) : 0;
}

/**
 * The tick a **discrete glyph** effect sees — a spinner frame, a rotating
 * container mark (C09 I99, `R-BLK-702`).
 *
 * **No depth gate, deliberately.** A frame index selects a character and a
 * character costs no colours, so *a 1-bit display may animate* holds here where
 * it cannot hold for a ramp. Motion is the only axis that reaches this, and a
 * frozen tick **is** the right answer for a glyph where it was the wrong one for
 * a ramp: frame 0 of a spinner is a mark, not a paused stripe.
 */
export function glyphTick(tick: number | undefined, motion: Motion = "full"): number {
  return motion === "off" ? 0 : (tick ?? 0);
}

/** A ramp that moves: an `animate` other than `none` (I54). */
export function rampMoves(ramp: Ramp | undefined): boolean {
  return ramp !== undefined && ramp.animate !== undefined && ramp.animate !== "none";
}

function spansMove(spans: readonly TextSpan[] | undefined): boolean {
  return spans !== undefined && spans.some((span) => rampMoves(span.ramp));
}

/**
 * Whether a block animates **by content** — a span or a bar carrying a moving
 * ramp (I54). Consulted by `tickIntervalOf` beside `ANIMATES`, which stays the
 * record of the kinds that animate by nature. Only the kinds with an extent are
 * asked, through `RAMP_EXTENT`, so a kind marked `none` answers `false` without
 * being read.
 */
/**
 * The table read for a kind that may not be in it (C04 I119).
 *
 * **One cast, and the alternative is a table keyed on the open union.** The
 * declaration is the exhaustiveness assertion — a framework kind without a row
 * fails to compile — and the read is total, because `block.kind` may be a kind
 * an app declared. Widening the table's key would lose the assertion; widening
 * the read loses nothing.
 */
function rampExtentOf(kind: BlockKind): RampExtent | undefined {
  return (RAMP_EXTENT as Readonly<Partial<Record<BlockKind, RampExtent>>>)[kind];
}

export function animatesByContent(block: Block): boolean {
  switch (rampExtentOf(block.kind)) {
    // **An app's kind, and the arm the closed table made visible** (C04 I119).
    // The lookup was `Record<BlockKind, …>` and answered `RampExtent` for every
    // kind by declaration; keyed on the framework's own it answers `undefined`
    // for a kind an app registered, and this function's `boolean` was a lie for
    // exactly that input — it returned `undefined`, falsy, right by accident.
    //
    // `false` and not a throw: C09 draws an unknown kind degraded rather than
    // refusing it (§2), and a content ramp is a property of a block the
    // framework knows how to read. An app that wants one animates by nature.
    case undefined:
    case "none":
      return false;
    case "axis":
      return rampMoves((block as Progress).ramp);
    case "clusters": {
      if (block.kind === "table") {
        return block.rows.some((row) => Object.values(row.cells).some((cell) => spansMove(cell.spans)));
      }
      return spansMove((block as Readonly<{ spans?: readonly TextSpan[] }>).spans);
    }
  }
}
