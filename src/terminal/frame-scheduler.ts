/**
 * When the screen is written. Coalescing by commit class.
 *
 * C03 — see spec.
 * Implement to the spec's commitments and invariants; cite invariant
 * numbers in tests. If the spec is wrong, change the spec first.
 *
 * `SYNC_UPDATE` is the one mode C03 may import — A03 MG20 asserts that
 * ownership per sequence rather than per file, so the exception stays exactly
 * one sequence wide. Capabilities arrive by injection and the type is imported
 * type-only, for the same reason C01 takes them that way: C02 is the same layer
 * and the edge has to stay acyclic (A03 MG3).
 *
 * Nothing here reads a clock (A03 SS1). Windows are compared as *values* rather
 * than as deadlines, which is what makes I3 implementable at all — see §3.
 */

import { SYNC_UPDATE } from "./escapes.js";
import type { TerminalCapabilities } from "./capabilities.js";

export type CommitReason = "input" | "completion" | "resize" | "stream" | "spinner";

export interface FrameScheduler {
  commit(reason: CommitReason): void;
  flush(): void;
  invalidate(): void;
  /**
   * Hold the screen still on purpose (§4a, I13, I14).
   *
   * **Suspension is about staleness the reader asked for; contamination is
   * about a screen whose contents nobody knows.** That one distinction settles
   * both questions this pair raises: an ordinary frame waits, a contaminated
   * one is written, and `resize` — which implies contamination (I7) — is
   * therefore never deferred. A wrapped line scrolls the alternate screen,
   * which is the one failure the application can no longer see.
   *
   * `resume()` writes an ordinary diffed frame rather than a repaint, because
   * suspension writes nothing: the terminal still holds the last frame written
   * and the diff's model of it is still true. **That property is the whole
   * argument for this pair existing** rather than L4 passing a `render`
   * callback that returns without composing — a no-op render clears `pending`
   * and `contaminated` on a frame that was never written, so C03's own state
   * would stop describing the terminal.
   *
   * Freeze-relevant: new members on a published L0 interface (commitment 15).
   */
  suspend(): void;
  resume(): void;
  readonly pending: boolean;
  readonly contaminated: boolean;
}

export type FrameSchedulerOptions = Readonly<{
  /**
   * **The reason the frame is being drawn for, and only C03 can supply it**
   * (I16). Among coalesced reasons this unit picks the strictest, at flush; a
   * caller wrapping `commit` sees every reason committed and a caller wrapping
   * this sees every frame, and neither can recover which reason a *coalesced*
   * frame was drawn for. F395 recorded that the scheduler knows and hands it to
   * nothing.
   */
  render: (reason: CommitReason) => void;
  repaint: (reason: CommitReason) => void;
  capabilities: TerminalCapabilities;
  lifecycle: { readonly acquired: boolean };
  write: (s: string) => void;
  schedule?: (fn: () => void, ms: number) => Disposable;
  windows?: Partial<Record<CommitReason, number>>;
}>;

/**
 * §3's table as data, typed over the full union rather than a partial: adding a
 * `CommitReason` without a window stops compiling here (T2.5, T6.9). A chain of
 * `if`s would take a new member silently and default it to zero, which is the
 * one direction the mistake must not fall.
 */
const WINDOWS: Readonly<Record<CommitReason, number>> = Object.freeze({
  input: 0,
  completion: 0,
  // **16 ms, and not zero** (I15). A drag is dozens of `SIGWINCH`es and the cost
  // of a resize is not the frame: width invalidates every cached height (C14 I8),
  // so thirty events were thirty re-measures of the whole transcript — 544 ms at
  // a thousand entries, of which the index rebuild everyone named was 0.07%
  // (F423). One frame instead of thirty, and the final size is the only one
  // anyone sees.
  resize: 16,
  stream: 33,
  spinner: 100,
});

/**
 * The classification, in one place. `strictness` derives from this and from the
 * resolved windows rather than restating the order in a second table — two
 * tables is how the two come to disagree (§3, I10).
 */
const IMMEDIATE: ReadonlySet<CommitReason> = new Set<CommitReason>(["input", "completion"]);

/**
 * Coalesced, but with a window a config may not touch (I15).
 *
 * **Two rejections with two reasons, so two sets.** I2 refuses a window on
 * `input` and `completion` because a config file must not introduce *lag the
 * user causes*. This refuses one on `resize` because a longer window shows a
 * frame that is **wrong** rather than one that is **stale** — `stream` and
 * `spinner` may be tuned precisely because their staleness is bounded content,
 * not bad geometry.
 *
 * **The distinction is not pedantry: it is the defect.** `resize` was in
 * `IMMEDIATE`, and three places in C03's spec plus this file's own error message
 * cited I2 for it — an invariant whose text names two reasons. A citation that
 * resolves against an invariant not covering the case reads as backed, and
 * `make enforce` cannot see it: it checks that a citation names an invariant
 * which exists, never that the invariant says the cited thing (F423).
 */
const FIXED_WINDOW: ReadonlySet<CommitReason> = new Set<CommitReason>(["resize"]);

const defaultSchedule = (fn: () => void, ms: number): Disposable => {
  const handle = setTimeout(fn, ms);
  return { [Symbol.dispose]: () => clearTimeout(handle) };
};

export function createFrameScheduler(opts: FrameSchedulerOptions): FrameScheduler {
  const { render, repaint, capabilities, lifecycle, write } = opts;
  const schedule = opts.schedule ?? defaultSchedule;
  const windows = resolveWindows(opts.windows);

  let state: "idle" | "pending" | "writing" = "idle";
  let timer: Disposable | null = null;
  /** The window the outstanding timer was armed with — the ceiling in force. */
  let armed: number | null = null;
  let contaminated = false;
  /** §4a — the screen held still on purpose (I13, I14). */
  let suspended = false;
  let deferred: CommitReason | null = null;
  /** I16 — the reason the next frame is being drawn for. */
  let driving: CommitReason | null = null;

  /**
   * Higher is stricter. Immediate outranks every coalesced reason; among
   * coalesced, the shorter window. Order *among* the immediate reasons is
   * deliberately flat: `resize` sets contamination eagerly at commit time, so
   * the only thing that could distinguish the three has already taken effect by
   * the time a deferred reason is chosen (§3).
   */
  function strictness(reason: CommitReason): number {
    return IMMEDIATE.has(reason) ? Number.MAX_SAFE_INTEGER : -windows[reason];
  }

  function cancelTimer(): void {
    timer?.[Symbol.dispose]();
    timer = null;
    armed = null;
  }

  function armTimer(ms: number): void {
    cancelTimer();
    armed = ms;
    timer = schedule(() => {
      timer = null;
      armed = null;
      runWrite();
    }, ms);
  }

  /**
   * A write, plus the one deferred write I10 allows to follow it.
   *
   * The hazard is livelock, not depth. A render callback that commits on every
   * invocation never recurses — each write returns before the next begins — it
   * simply never terminates the drain, so the loop is flat and infinite rather
   * than deep and finite. A depth bound would not catch it. Inline-once bounds
   * the chain at two writes; escalating anything further to the timer means
   * nothing is dropped, and an application stuck in a render loop renders at
   * timer cadence rather than hanging (I10, T3.20, T6.10).
   */
  function runWrite(): void {
    writeFrame();

    const first = takeDeferred();
    if (first === null) return;
    if (!IMMEDIATE.has(first)) {
      // A fresh window from the end of the write (T3.15). No timer is
      // outstanding here — every path into a write consumes it — so I3 holds.
      raise(first);
      state = "pending";
      armTimer(windows[first]);
      return;
    }

    raise(first);
    writeFrame(); // The one deferred write (T3.7, T3.21).

    const second = takeDeferred();
    if (second === null) return;
    raise(second);
    // Escalated, not dropped and not written inline. An immediate reason gets a
    // zero window, so it lands on the next turn rather than on this stack
    // (T3.20).
    state = "pending";
    armTimer(IMMEDIATE.has(second) ? 0 : windows[second]);
  }

  /**
   * I16 — the strictest reason committed since the last write, which is the one
   * the frame is drawn for. Separate from `deferred`, which is about a commit
   * arriving *during* a write; this is about the frame about to happen.
   */
  function raise(reason: CommitReason): void {
    driving =
      driving === null || strictness(reason) > strictness(driving) ? reason : driving;
  }

  /** I10 — one deferral, at the strictest reason seen while writing. */
  function takeDeferred(): CommitReason | null {
    const reason = deferred;
    deferred = null;
    return reason;
  }

  /**
   * The only place `render` or `repaint` is called, and the only place anything
   * is written. Every §5 path that reaches "→ writing → idle" comes through
   * here.
   */
  function writeFrame(): void {
    // I1 — a commit while unacquired is dropped in silence. Checked here rather
    // than at commit time because a timer armed while acquired may fire after
    // release (T3.9); and `acquired` is read through the live view on every
    // write, never captured (I12, T3.22).
    if (!lifecycle.acquired) {
      state = "idle";
      return;
    }

    // **The gate is here and nowhere else** (I13). One place to reason about,
    // and it falls on the branch below rather than beside it: suspension holds
    // the `render` arm and never the `repaint` one. A suspended scheduler still
    // arms and fires timers, which costs a wasted callback per window and keeps
    // `commit`'s state machine one machine rather than two.
    if (suspended && !contaminated) {
      state = "idle";
      return;
    }

    state = "writing";
    // I16 — consumed here, so the next frame starts from nothing rather than
    // inheriting this one's reason.
    const reason = driving ?? "input";
    driving = null;
    const sync = capabilities.synchronisedUpdate;
    if (sync) write(SYNC_UPDATE.enter);
    try {
      if (contaminated) {
        repaint(reason);
        // Cleared *after* the repaint returns, not before: a repaint that
        // throws must leave the flag set, so the next write retries it rather
        // than diffing against a screen whose contents nobody knows
        // (I5, T3.5, T6.5).
        contaminated = false;
      } else {
        render(reason);
      }
    } finally {
      // In the `finally`, not the `try`. An unbalanced open marker leaves the
      // terminal in synchronised mode and frozen, so a throw during render
      // would present as a dead screen rather than as an error (I6, I9, T3.4,
      // T6.4).
      if (sync) write(SYNC_UPDATE.leave);
      state = "idle";
    }
  }

  function commit(reason: CommitReason): void {
    // I7 — resize implies invalidation, and the flag is set before anything
    // else so it applies whether the write happens now or is deferred (T3.17).
    if (reason === "resize") contaminated = true;

    if (state === "writing") {
      // The deferred reason becomes the *next* write's, raised at the point it
      // is taken rather than here — this write already has one.
      deferred =
        deferred === null || strictness(reason) > strictness(deferred) ? reason : deferred;
      return;
    }

    raise(reason);

    if (IMMEDIATE.has(reason)) {
      cancelTimer(); // I4 — the pending frame would draw the same state.
      runWrite();
      return;
    }

    const ms = windows[reason];
    // I3 — one timer, and windows are compared as ceilings rather than as
    // deadlines (§3). Strictly-shorter is doing the work: re-arming on every
    // commit, or on one whose window is merely not longer, slides the window
    // and a continuous stream never renders at all (T1.4, T6.2); never
    // re-arming lets a 100 ms spinner hold a stream frame past its budget
    // (T3.12, T6.13).
    if (state === "pending" && armed !== null && ms >= armed) return;

    state = "pending";
    armTimer(ms);
  }

  function flush(): void {
    // §3 — during a write the forced write is already happening (T3.8); from
    // idle there is nothing to force (T3.1).
    if (state !== "pending") return;
    cancelTimer();
    runWrite();
  }

  function suspend(): void {
    // Idempotent, and during a write it applies to the *next* frame — the same
    // rule `invalidate()` follows, and for the same reason: `writeFrame` read
    // its flags before calling out.
    suspended = true;
  }

  function resume(): void {
    if (!suspended) return;
    suspended = false;
    // **An ordinary commit, not `invalidate()`** (I14). Nothing was written
    // while suspended, so the terminal holds the last frame this component put
    // there and the diff has a true model of it. A repaint here would be a
    // larger burst bought with no correctness at all.
    commit("input");
  }

  function invalidate(): void {
    // Idempotent (T3.2). During a write it applies to the *next* frame rather
    // than the one in progress, because `writeFrame` read the flag before
    // calling out (T3.19).
    contaminated = true;
  }

  return {
    commit,
    flush,
    invalidate,
    suspend,
    resume,
    // Getters, not stored booleans — `pending` is a fact about the state
    // machine, and storing it alongside admits the combination where a timer is
    // outstanding and `pending` is false (T2.1, T2.4).
    get pending() {
      return state === "pending";
    },
    get contaminated() {
      return contaminated;
    },
  };
}

/**
 * I2 — a config file must not be able to introduce input lag, so an immediate
 * reason given any window is refused at construction rather than ignored.
 * Ignored, the caller believes a setting took effect; refused, they are told
 * (T3.13, T6.12).
 */
function resolveWindows(
  over: Partial<Record<CommitReason, number>> | undefined,
): Readonly<Record<CommitReason, number>> {
  if (over === undefined) return WINDOWS;

  const resolved: Record<CommitReason, number> = { ...WINDOWS };
  for (const [key, ms] of Object.entries(over) as [CommitReason, number | undefined][]) {
    if (ms === undefined) continue;
    if (IMMEDIATE.has(key)) {
      throw new RangeError(
        `cannot give ${key} a window: input and completion are never delayed (C03 I2)`,
      );
    }
    if (FIXED_WINDOW.has(key)) {
      throw new RangeError(
        `cannot give ${key} a window: its ${String(WINDOWS[key])} ms window is fixed, because a ` +
          `longer one shows a frame that is wrong rather than stale (C03 I15)`,
      );
    }
    if (!Number.isFinite(ms) || ms < 0) {
      throw new RangeError(`window for ${key} must be a non-negative number, got ${String(ms)}`);
    }
    resolved[key] = ms;
  }
  return Object.freeze(resolved);
}
