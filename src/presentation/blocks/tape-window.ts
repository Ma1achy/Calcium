/**
 * The tape's window — C04 I124, C04 I125, §3ao, §095.
 *
 * **A row of peers sheds members; a list you navigate slides a window.** Every
 * member keeps its place and its element id, and the window is the run of them
 * that is drawn, so `«n` and `n»` count what is offscreen rather than what was
 * lost.
 *
 * Nothing here reads a capability (C09 I3): the marks arrive as strings and
 * their width as a function, so the same arithmetic serves the Unicode rung's
 * `«`/`»` and the ASCII rung's `[`/`]` without knowing which it has.
 */

/** The two residue marks and the space between members, in cells. */
export type TapeMarks = Readonly<{ left: string; right: string; gap: number }>;

/** The run that is drawn, and what lies off each end. */
export type TapeWindow = Readonly<{
  from: number;
  to: number;
  before: number;
  after: number;
}>;

/**
 * The window holding `current`, moved from `from` by the minimum (C04 I125).
 *
 * `widths` is each member's own width in cells, already solved — this function
 * never asks what a member says, only how wide it is.
 *
 * **The cost is not monotone in the window's end**, which is why that bound is a
 * maximum over the candidates rather than a loop that stops at the first
 * failure. A residue mark disappears when the run reaches the last member, so
 * arriving there can be worth more than the member costs: measured over 200,000
 * random tapes, *grow while it fits* drew fewer members than fit in 233 of them.
 *
 * **The start is a different question and takes a different answer** — the
 * minimum *move*, scanning up from where the window already is. The two read as
 * one rule and are not: a start smaller than the held one exists in most tapes,
 * and taking it would drag the window backwards to reach something ahead of it.
 *
 * **The fixed point is reached by construction** (C04 I125). Asking which start is
 * least such that the window reaching the current fits prices the mark in
 * already, so there is nothing to iterate towards: the star rule's *one move can
 * push the current straight back out* is answered before the move is taken.
 */
export function tapeWindow(
  widths: readonly number[],
  room: number,
  current: number,
  from: number,
  marks: TapeMarks,
  measure: (text: string) => number,
): TapeWindow {
  const n = widths.length; // cells-ok — a count of members
  if (n === 0) return Object.freeze({ from: 0, to: 0, before: 0, after: 0 });

  const cost = (lo: number, hi: number): number => {
    if (hi <= lo) return 0;
    let body = 0;
    for (let i = lo; i < hi; i += 1) body += widths[i] ?? 0;
    body += marks.gap * (hi - lo - 1);
    // **Zero hidden is no mark and never `«0`** (C6). The count is what the
    // mark says, so a mark with nothing to count says nothing.
    const left = lo === 0 ? 0 : measure(`${marks.left}${String(lo)}`) + marks.gap;
    const right = hi === n ? 0 : measure(`${String(n - hi)}${marks.right}`) + marks.gap;
    return body + left + right;
  };

  /** The longest run from `lo` that fits — a maximum, not a first failure. */
  const endFrom = (lo: number): number => {
    let best = lo + 1;
    for (let hi = lo + 1; hi <= n; hi += 1) if (cost(lo, hi) <= room) best = Math.max(best, hi);
    return best;
  };

  const at = Math.min(Math.max(0, Math.trunc(current)), n - 1); // cells-ok — a member index
  // **The ceiling, clamped at read** (C04 I125, C04 I48). `0..n-1` bounds the
  // index and says nothing about the room, so a start written when the terminal
  // was narrow survived a widening: the reader got `«5` beside a row's worth of
  // empty space, because *the window moves only when the current leaves it* is
  // true of a start too far along as well as one too far back. This is
  // `offsetOf`'s `content − interior` in the tape's unit — the smallest start
  // whose window still reaches the last member — and it is taken here for the
  // same reason: the store does not know the width.
  //
  // **A minimum over candidates, not a walk back**, which is the end bound's
  // non-monotonicity arriving at this end: backing up past the first member
  // removes the `«n` the later starts were paying for, so a start that does not
  // fit sits between two that do. Widths `1 3 9 5` in a room of 24 from a held
  // start of 2 — `«1` costs four cells, so a window from 1 needs 25 and one
  // from 0 needs exactly 24, and a loop stopping at the first failure keeps a
  // `«2` where the whole tape fits.
  let held = Math.min(Math.max(0, Math.trunc(from)), n - 1); // cells-ok — a member index
  for (let c = 0; c <= held; c += 1) {
    if (cost(c, n) <= room) {
      held = c;
      break;
    }
  }

  let lo = held;
  let hi = endFrom(held);
  // **The window moves ONLY when the current leaves it** (S5) — the clause that
  // separates a tape from a cursor dragging the row along.
  if (at < lo) {
    lo = at;
    hi = endFrom(lo);
  } else if (at >= hi) {
    // **The minimum MOVE, and that is scanning up from where the window is —
    // not the smallest start that would fit.** A smaller start than the held one
    // exists in most tapes and choosing it would drag the window backwards to
    // reach something ahead of it, which is the cursor-dragging behaviour §095
    // separates a tape from. The first start at or after `lo` that fits is the
    // least distance moved, and the mark it raises is priced into the test.
    let moved = at;
    for (let l = lo; l <= at; l += 1) {
      if (cost(l, at + 1) <= room) {
        moved = l;
        break;
      }
    }
    lo = moved;
    hi = Math.max(at + 1, endFrom(lo));
  }

  return Object.freeze({ from: lo, to: hi, before: lo, after: n - hi });
}
