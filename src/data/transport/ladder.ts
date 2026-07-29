/**
 * SIGINT → 2 s → SIGTERM → 2 s → SIGKILL.
 *
 * C06 §4 — see spec. **One ladder, used by both cancellation and timeout** (I8).
 * They differ only in which flag the eventual `RawResult` carries, and two
 * ladders that agree today is the shape that drifts — a timeout path that grew a
 * shorter grace period would be correct on the day it was written and would kill
 * a cleaning-up child six months later.
 *
 * Cancellation begins at `SIGINT` because a well-behaved far side cleans up on it
 * (A01 B8). A timeout takes the same rungs: a `SIGINT` to an already-unresponsive
 * process is harmless, and one path is worth more than a marginally faster kill.
 *
 * C21 delivers; C06 decides when (C21 I8). Nothing in `process/` schedules
 * anything, and the timer here is injected so T3.5 asserts each rung against a
 * counter rather than sleeping six seconds a case.
 */

import type { Clock } from "./types.js";

export const RUNG_MS = 2_000;
export const RUNGS = ["SIGINT", "SIGTERM", "SIGKILL"] as const;

/** What the ladder needs of a child. `ChildHandle` satisfies it structurally. */
export type Signalable = Readonly<{
  readonly running: boolean;
  signal(sig: string): boolean;
}>;

/**
 * Starts the ladder and returns a stop. The caller stops it when the child
 * exits — on a child that dies on `SIGINT`, no `SIGTERM` and no `SIGKILL` are
 * ever sent (T3.6), which is the case that would otherwise look identical to a
 * ladder that always runs to the end.
 */
export function escalate(child: Signalable, clock: Clock): () => void {
  let rung = 0;
  let timer: Disposable | null = null;
  let stopped = false;

  const step = (): void => {
    if (stopped || !child.running) return;
    const sig = RUNGS[rung];
    if (sig === undefined) return;
    rung += 1;
    child.signal(sig);
    // `SIGKILL` is the last rung: nothing follows it, so nothing is armed after
    // it. An unconditional re-arm here leaves a timer alive on a dead child, and
    // T3.8's `outstanding === 0` is what would catch it.
    if (rung < RUNGS.length) timer = clock.schedule(step, RUNG_MS);
  };

  step();

  return () => {
    stopped = true;
    timer?.[Symbol.dispose]();
    timer = null;
  };
}
