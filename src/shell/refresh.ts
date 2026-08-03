/**
 * C23 §3b — time-driven updates. Three mechanisms, two that patch and one that
 * appends.
 *
 * Adapters are pure and read no clock (C07 I1); C15's layout is pure (C15 I5).
 * **Anything periodic is therefore C23's, on C22's injected clock** (C23 I19).
 *
 * The three, and what separates them:
 *
 *   - **Stall detection** patches a streaming entry that has gone quiet.
 *   - **Part refresh** patches a layer on a declared interval.
 *   - **The identity notice** *appends*, on a signal from C22's identity loop.
 *
 * The third is the one that had to be found rather than written. C23 §3a's
 * `origin` table listed `refresh` against the first two — and neither of them
 * appends, while `meta.origin` is a field on an appended document. So the value
 * read as reserved and was unreachable: A03 §2's vacuity class in a field rather
 * than in a rule. **This is the cell it was reserved for**, which is why its test
 * asserts the origin and not merely that a notice appeared.
 *
 * All three stop once `session.stopping` is set (C23 I12, §8b B1). I12 governs
 * *submissions* and none of these is one, so without that the rule covers
 * submissions while its reason claims everything — and an identity notice lands
 * in a transcript being torn down.
 */

import { block } from "../data/viewmodel/index.js";
import type { ViewPatch } from "../data/viewmodel/index.js";
import type { EntryId, TranscriptStore } from "../viewport/transcript/index.js";

/** C23 §3b — a stream silent for this long gets a notice, never an error (C23 I25). */
export const STALL_MS = 120_000;

/** C23 §3b — a failing refresh doubles from its interval to here (C23 I21). */
export const BACKOFF_CAP_MS = 300_000;

/** The block id a stall notice always uses, so it can be found and removed. */
const STALL_BLOCK = "stall-notice";

export type ViewRefresh = Readonly<{
  /** Which part of the view. */
  id: string;
  intervalMs: number;
  /** Stagger, assigned by `assignOffsets` — never chosen by the declarer. */
  offsetMs: number;
  fetch: () => Promise<ViewPatch>;
}>;

/**
 * C23 I20 — no two declared parts fire in the same tick.
 *
 * Spread across the *smallest* interval rather than each part's own, because two
 * parts at 30 s and 300 s collide every tenth tick if each is staggered within
 * its own period. The smallest is the only window every part shares.
 *
 * Synchronised refreshes produce a periodic load spike and a whole-screen
 * flicker; staggering costs nothing.
 */
export function assignOffsets(parts: readonly Omit<ViewRefresh, "offsetMs">[]): ViewRefresh[] {
  if (parts.length === 0) return [];
  const smallest = Math.min(...parts.map((p) => p.intervalMs));
  const step = Math.floor(smallest / parts.length);
  return parts.map((p, i) => ({ ...p, offsetMs: step * i }));
}

/**
 * The backoff of A02 §7's one rule, and C23 is its only implementation.
 *
 * Doubling from the interval to a five-minute cap; recovery resets it. Returned
 * as a function rather than held in the driver so the arithmetic is testable
 * without a clock — the thing that goes wrong here is off-by-one doubling, and
 * that is visible in a table and invisible in a running session.
 */
export function backoffOf(intervalMs: number, consecutiveFailures: number): number {
  if (consecutiveFailures === 0) return intervalMs;
  return Math.min(intervalMs * 2 ** consecutiveFailures, BACKOFF_CAP_MS);
}

export type RefreshDeps = Readonly<{
  transcript: TranscriptStore;
  clock: () => number;
  schedule: (fn: () => void, ms: number) => Disposable;
  commit: (reason: "stream" | "input") => void;
  /** Appends a document. The identity notice is the only §3b path that does. */
  append: (text: string) => void;
  stopping: () => boolean;
}>;

export interface RefreshDriver {
  /** A patch landed on `id`; any stall notice it carries is now false. */
  sawPatch(id: EntryId): void;
  /** Called when an entry starts streaming, so it can be watched for silence. */
  watch(id: EntryId): void;
  /** C23 §8a A4 — settlement removes a stall notice that is present. */
  settled(id: EntryId): void;
  /** C22's identity loop signalling a transition worth saying out loud. */
  identityNotice(text: string): void;
  dispose(): void;
}

export function createRefreshDriver(deps: RefreshDeps): RefreshDriver {
  /** Last patch time per streaming entry, and whether it carries a stall notice. */
  const watched = new Map<EntryId, { last: number; stalled: boolean; stalledAt: number }>();
  const timers: Disposable[] = [];

  /**
   * **Replaced, never removed** (C23 §3b, §8a A4).
   *
   * `ViewPatch` has no delete and should not: a transcript is a record, C13's
   * only removal path is the cap and it leaves a marker, and a patch that made a
   * block vanish would leave a document whose earlier state cannot be
   * reconstructed from its own history — `rev` is a counter, not a log.
   *
   * Removal was never what this wanted anyway. The notice said *this stream has
   * gone quiet*; then the stream spoke, or ended. Either way the thing it
   * describes still exists and its state changed, which is `replace`.
   *
   * The row is spent and it says something true. A zero-height replacement is
   * not available and should not be — C09's floor is one row for any block that
   * is present, which is the constraint that keeps measurement honest.
   */
  const resolveStall = (id: EntryId): void => {
    const state = watched.get(id);
    if (state === undefined || !state.stalled) return;
    state.stalled = false;

    const gap = Math.max(1, Math.round((deps.clock() - state.stalledAt) / 60_000));
    deps.transcript.patch(
      id,
      {
        op: "replace",
        blockId: STALL_BLOCK,
        block: block({
          kind: "notice",
          id: STALL_BLOCK,
          tone: "muted",
          text: `resumed after ${String(gap)}m`,
        }),
      },
      "shell",
    );
  };

  const tick = (): void => {
    // C23 I12's second clause — §3b stops once shutdown begins, or a notice
    // lands in a transcript being torn down.
    if (deps.stopping()) return;

    const now = deps.clock();
    for (const [id, state] of watched) {
      if (state.stalled || now - state.last < STALL_MS) continue;
      state.stalled = true;
      state.stalledAt = now;

      // **A notice, never an error** (C23 I25). A quiet stream is the normal
      // state of a `--watch` on an idle cluster; reporting it as a failure
      // trains the reader to ignore the one time it is one.
      const quiet = Math.round((now - state.last) / 60_000);
      deps.transcript.patch(id, {
        op: "append",
        block: block({
          kind: "notice",
          id: STALL_BLOCK,
          tone: "muted",
          text: `no output for ${String(quiet)}m`,
        }),
      }, "shell");
      deps.commit("stream");
    }
  };

  timers.push(deps.schedule(tick, STALL_MS / 4));

  return {
    watch: (id) => void watched.set(id, { last: deps.clock(), stalled: false, stalledAt: 0 }),

    sawPatch: (id) => {
      const state = watched.get(id);
      if (state === undefined) return;
      resolveStall(id);
      state.last = deps.clock();
    },

    settled: (id) => {
      // **C23 §8a A4.** Stopping the mechanism does not retract the block it
      // already injected, so an entry that goes quiet and then settles would
      // keep `no output for 2m` in its final document — where it is no longer
      // true and can never be replaced.
      resolveStall(id);
      watched.delete(id);
    },

    identityNotice: (text) => {
      if (deps.stopping()) return;
      deps.append(text);
    },

    dispose: () => {
      for (const t of timers) t[Symbol.dispose]();
      timers.length = 0;
      watched.clear();
    },
  };
}
