/**
 * C22 I108 — the schedule C22 hands C03, dating a window from the last slot's
 * own firing.
 *
 * C03 arms one timer for the shortest coalesced window as each write begins and
 * dates the next from the moment that one fires (C03 I17). It has no clock
 * (C03 I11), so it cannot see that Node's timer fired about a millisecond late,
 * and the lateness joins every period: a 16 ms window drew 58 to 59 frames a
 * second where A02 §7 budgets sixty (F1207). This wrapper is where the clock
 * is — C22 injects it — so it holds the deadline of the slot now firing and
 * dates an arm made **inside that firing** from that deadline. The lateness of
 * one firing is taken off the next delay, and the period on the clock is the
 * window.
 *
 * **The chain runs through the firing, and only between windows of the same
 * length.** C03 arms the frame slot at the shortest coalesced window and an
 * animation commit at its own — 80 ms for the spinner — and both can be armed
 * inside one firing; dating the second from the first's deadline mixes two
 * cadences and drops the spinner to two thirds of its rate, which C22 T4.17u,
 * T4.17k, T4.35 and T4.8 all read.
 *
 * **The chain runs through the firing, not through the clock.** The arm it
 * exists for is C03's write opening the next window, which happens inside the
 * slot's callback. A slot that fired with nothing in it and lapsed armed
 * nothing there, so the commit after it is a fresh window rather than a frame
 * dated a window after a deadline nothing drew at; an arm outside any firing —
 * a lone commit, a resize, the first frame — is dated from now, so its latency
 * is what it was.
 *
 * **Floored at one sixtieth of a second**, because C03's windows are integer
 * ceilings on each gap (C03 I15) and A02 §7's budget is a rate: a 16 ms window
 * dated end to end draws 62.5. A zero window is C03's next turn (C03 I10) —
 * neither floored, chained nor remembered.
 *
 * **The clock is the untapped one** (C28 I53). These reads date timers and
 * enter no frame, and a replay's timers are not the recording's, so a read per
 * arm on the recording's positional channel is one the replay consumes at a
 * position it never reaches — which is what broke C28 T5.1c and T5.1d when this
 * first read `elapsed`.
 *
 * **Measured twice, and the first reading was of a tree with a second defect in
 * it** (F1206, F1207). With the live poll still dating itself from each fetch,
 * 695 of 706 slots were cancelled by an immediate commit before they closed:
 * this moved nothing, and its floor only widened every coalescing window, so it
 * was specified, built, mutation-covered, gate-green and then withdrawn on the
 * bench. With C23 I72 in place the slot closes a fifth to a half of all frames
 * and the same code pins the three live cases at 60.0 to a tenth. Two defects
 * that read as one: either alone measures as noise.
 */

/** A02 §7 — sixty frames a second, as a period. */
export const FRAME_PERIOD_MS = 1000 / 60;

export type Schedule = (fn: () => void, ms: number) => Disposable;

export function pacedSchedule(sampleClock: () => number, schedule: Schedule): Schedule {
  /** The deadline and window of the slot now firing, for the span of its callback. */
  let firing: { due: number; window: number } | null = null;
  return (fn, ms) => {
    if (ms <= 0) return schedule(fn, ms);
    const window = Math.max(ms, FRAME_PERIOD_MS);
    const now = sampleClock();
    // **Only a window of the same length chains.** C03 arms the frame slot at
    // the shortest coalesced window and a spinner commit at its own 80 ms, and
    // both can be armed inside one firing — so without this an animation's
    // window is dated from the frame's deadline and the two cadences mix,
    // which four integration rows read as a spinner at two thirds its rate.
    const chained = firing !== null && firing.window === window;
    const due = (chained && firing !== null ? firing.due : now) + window;
    const slot = { due, window };
    return schedule(() => {
      firing = slot;
      try {
        fn();
      } finally {
        firing = null;
      }
    }, due - now);
  };
}
