// Fakes for C03's tiers 1-3. No real timers, no terminal.
//
// The clock is a counter and the timer is injected, so a coalescing test states
// the window it is asserting rather than sleeping through it — a scheduler
// tested with real timers is a scheduler with flaky tests (C03 §2).
import { vi } from "vitest";
import { createFrameScheduler } from "../../src/terminal/frame-scheduler.js";
import type { CommitReason, FrameScheduler } from "../../src/terminal/frame-scheduler.js";
import type { TerminalCapabilities } from "../../src/terminal/capabilities.js";
import { MODES, capabilities } from "./fake-terminal.js";

/**
 * A fake timer with **turn semantics**: one `advance()` is one turn, and a
 * timer armed *during* that advance waits for the next call rather than firing
 * within it.
 *
 * This matches reality — a real `setTimeout` armed inside a timer callback
 * fires on a later tick, never inside the callback that armed it — but it is a
 * model, and every component that later takes an injected timer inherits it
 * from here. Read this before writing a timing test that expects a chain of
 * timers to drain in one `advance()`; it will not, and that is deliberate.
 *
 * C03's T3.20 forced it. A render callback that commits on every invocation
 * re-arms a zero-window timer inside the drain, and without the barrier the
 * fake loops forever inside a single `advance()` — which is not a hang in the
 * component under test but a hang in the harness, and it presents as an
 * out-of-memory rather than as a failed assertion. Ten seconds of OOM before
 * the first useful line of output.
 */
export type FakeClock = {
  /** Drop-in for C03's `schedule`. */
  schedule(fn: () => void, ms: number): Disposable;
  /** Run to `now + ms`, firing whatever was already armed when the turn began. */
  advance(ms: number): void;
  /** Timers alive right now. I3 is an assertion about this being 0 or 1. */
  readonly outstanding: number;
  /** The windows those live timers were armed with. */
  readonly armed: readonly number[];
  /** Every window ever armed, cancelled or not — how a re-arm is detected. */
  readonly arms: readonly number[];
};

export function fakeClock(): FakeClock {
  type Entry = { at: number; ms: number; fn: () => void };
  const live = new Map<number, Entry>();
  const arms: number[] = [];
  let now = 0;
  let seq = 0;

  /** The barrier that makes one `advance` one turn — see `FakeClock`. */
  function next(target: number, barrier: number): [number, Entry] | null {
    let best: [number, Entry] | null = null;
    for (const entry of live) {
      if (entry[0] >= barrier || entry[1].at > target) continue;
      // Ties break by arm order, so a re-arm at the same instant is
      // deterministic rather than dependent on Map iteration.
      if (best === null || entry[1].at < best[1].at) best = entry;
    }
    return best;
  }

  return {
    schedule(fn, ms) {
      const id = seq++;
      live.set(id, { at: now + ms, ms, fn });
      arms.push(ms);
      return { [Symbol.dispose]: () => void live.delete(id) };
    },
    advance(ms) {
      const target = now + ms;
      const barrier = seq;
      for (;;) {
        const due = next(target, barrier);
        if (due === null) break;
        live.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = target;
    },
    get outstanding() {
      return live.size;
    },
    get armed() {
      return [...live.values()].map((e) => e.ms);
    },
    get arms() {
      return arms;
    },
  };
}

const SYNC = [MODES.syncOn, MODES.syncOff] as const;

/**
 * C03 commitment 13 — `write` carries the two synchronised-update markers and
 * nothing else; frame bytes leave through `render()`, which C03 does not own.
 * Called from the `afterEach` of every tier-1 and tier-3 file, so the corpus it
 * checks is every write C03 makes under test. T2.7 asserts this checker fires.
 */
export function assertSeamNarrow(written: readonly string[]): void {
  const foreign = written.filter((s) => !SYNC.some((m) => s.endsWith(m)));
  if (foreign.length > 0) {
    throw new Error(
      `C03 wrote something that is not a synchronised-update marker: ` +
        `${JSON.stringify(foreign[0])}. The write seam is two strings wide ` +
        `(C03 §2, C13) — frame content belongs in render().`,
    );
  }
}

export type Harness = {
  readonly scheduler: FrameScheduler;
  readonly render: ReturnType<typeof vi.fn>;
  readonly repaint: ReturnType<typeof vi.fn>;
  /** Everything passed to `write`, in order. */
  readonly written: string[];
  readonly clock: FakeClock;
  setAcquired(value: boolean): void;
};

export type HarnessOptions = {
  capabilities?: Partial<TerminalCapabilities>;
  windows?: Partial<Record<CommitReason, number>>;
  acquired?: boolean;
  render?: () => void;
  repaint?: () => void;
  /**
   * Build the lifecycle view as an object literal capturing `acquired` at
   * construction — L4's mistake, which C03 cannot prevent structurally. T3.24
   * is the only caller (§2, I11).
   */
  snapshotLifecycle?: boolean;
};

export function harness(over: HarnessOptions = {}): Harness {
  const clock = fakeClock();
  const written: string[] = [];
  const acquired = { value: over.acquired ?? true };

  const render = vi.fn(over.render ?? ((): void => {}));
  const repaint = vi.fn(over.repaint ?? ((): void => {}));

  // A getter over a mutable cell — the live view §2 requires. The snapshot
  // branch is the failure it warns about, and exists only so T3.24 can assert
  // the warning is about something real.
  const lifecycle =
    over.snapshotLifecycle === true
      ? { acquired: acquired.value }
      : {
          get acquired(): boolean {
            return acquired.value;
          },
        };

  const scheduler = createFrameScheduler({
    render,
    repaint,
    capabilities: capabilities(over.capabilities ?? {}),
    lifecycle,
    write: (s: string): void => void written.push(s),
    schedule: clock.schedule,
    ...(over.windows === undefined ? {} : { windows: over.windows }),
  });

  return {
    scheduler,
    render,
    repaint,
    written,
    clock,
    setAcquired: (value: boolean): void => {
      acquired.value = value;
    },
  };
}
