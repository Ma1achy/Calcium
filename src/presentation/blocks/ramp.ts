/**
 * Ramps — the extent per kind and the five loops (C09 §5 *Ramps*, I50–I54).
 *
 * A `Ramp` (C04 §3am.2) is a function `[0, 1] → Colour`. This module supplies
 * its **argument**: which kinds have an extent and of what shape, and what
 * `tick` does to `t` before C10 samples it (`rampStyle`). Nothing here reads a
 * clock or a capability; the frame is a function of `tick` and of nothing else,
 * which is what keeps the GIF catalogue deterministic.
 */
import type { Block, BlockKind, Progress, Ramp, RampAnimation, TextSpan } from "../../data/viewmodel/index.js";
import { spinnerIntervalMs } from "./glyphs.js";

/**
 * What a ramp varies over, per kind (I50). **A record and never a `Set`**, for
 * the reason `ANIMATES` is one: exhaustive in both directions, so a kind added
 * to the union without an entry is a type error and so is an entry for a kind
 * that no longer exists. `clusters` for the span carriers, `axis` for the bar,
 * `none` for the rest — and a kind marked `none` has no member to carry a ramp
 * (C04 I108), so the record is the statement and the type is the gate.
 */
export type RampExtent = "none" | "clusters" | "axis";
export const RAMP_EXTENT: Readonly<Record<BlockKind, RampExtent>> = Object.freeze({
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
  plot: "none",
  progress: "axis",
  raw: "clusters",
  rule: "clusters",
  scroll: "none",
  status: "none",
  steps: "none",
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

/**
 * `t' = f(t, tick, n)` — the one term an effect adds before the fill is sampled
 * (I53). `tick = 0` is the static frame. Every effect is periodic, because the
 * render has no birth tick: a one-shot is an event and is not in the union
 * (C04 I109).
 *
 * | effect | `t'` | period |
 * |---|---|---|
 * | `shimmer` | a band of half-width 1.5 cells whose centre moves one cell per tick; the ramp is the band's profile — `from` at rest, `to` at the peak | `n + 3` ticks |
 * | `wave` | the ramp translates one cell per tick and wraps | `n` ticks |
 * | `breathe` | `½(1 + sin 2π·tick/20)`, constant across the extent | 20 ticks |
 * | `pulse` | two states, five ticks each | 10 ticks |
 * | `heartbeat` | two beats front-loaded, then rest | 12 ticks |
 */
export function animateT(effect: RampAnimation | undefined, t: number, tick: number, n: number, i: number): number {
  const k = Math.max(0, Math.floor(tick));
  switch (effect) {
    case undefined:
    case "none":
      return t;
    case "shimmer": {
      const period = Math.max(1, n) + 3;
      const centre = (k % period) - SHIMMER_HALF_WIDTH;
      return Math.max(0, 1 - Math.abs(i - centre) / SHIMMER_HALF_WIDTH);
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
  }
}

/**
 * The tick an effect sees at this depth (C10 I36's rung, applied here because
 * C10 has no tick to read): below 8-bit motion resolves to `none`, so the frame
 * is `tick = 0` — three colours moving is a flicker, and a flicker is worse than
 * a static tone. The cadence is still declared (I54); the frame is stable.
 */
export function effectiveTick(tick: number | undefined, caps: Readonly<{ colourDepth: number }>): number {
  return caps.colourDepth >= 8 ? (tick ?? 0) : 0;
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
export function animatesByContent(block: Block): boolean {
  switch (RAMP_EXTENT[block.kind]) {
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
