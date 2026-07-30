// C03 tier 4 — integration. Real components, no real terminal.
//
// C01 and C02 exist, so the three seams C03 shares with them are driven by real
// objects: a real capability record, a real lifecycle, and C01's own `writer`
// as the injected `write`. The rest name their blocker in a greppable form.
import { afterEach, describe, expect, it, vi } from "vitest";
import { detectCapabilities } from "../../src/terminal/capabilities.js";
import { createTerminalLifecycle, type TerminalLifecycle } from "../../src/terminal/lifecycle.js";
import { createFrameScheduler } from "../../src/terminal/frame-scheduler.js";
import type { FrameScheduler } from "../../src/terminal/frame-scheduler.js";
import { fakeStdin, fakeStdout, MODES } from "../support/fake-terminal.js";
import { fakeClock } from "../support/fake-scheduler.js";

const live: TerminalLifecycle[] = [];

afterEach(() => {
  for (const l of live.splice(0)) {
    try {
      l.release();
    } catch {
      // Already released.
    }
  }
});

/**
 * The wiring L4 will do, written once here: a real C01, a real detection run,
 * and the scheduler taking C01's `acquired` getter and C01's `writer`. Nothing
 * is fabricated except the streams.
 */
function wire(env: Record<string, string> = { TERM: "xterm-256color" }): {
  scheduler: FrameScheduler;
  lifecycle: TerminalLifecycle;
  stdout: ReturnType<typeof fakeStdout>;
  clock: ReturnType<typeof fakeClock>;
  render: ReturnType<typeof vi.fn>;
  repaint: ReturnType<typeof vi.fn>;
} {
  const capabilities = detectCapabilities(env).capabilities;
  const stdout = fakeStdout();
  const lifecycle = createTerminalLifecycle({
    stdout,
    stdin: fakeStdin(),
    capabilities,
    onFatal: ((err: unknown) => {
      throw err;
    }) as (err: unknown) => never,
  });
  live.push(lifecycle);

  const clock = fakeClock();
  const render = vi.fn();
  const repaint = vi.fn();
  const scheduler = createFrameScheduler({
    render,
    repaint,
    capabilities,
    // The live view, not a snapshot: `acquired` is C01's own getter, so this is
    // the wiring §2 requires and T3.24 shows the failure of (I12).
    lifecycle,
    write: (s: string): void => void lifecycle.writer.write(s),
    schedule: clock.schedule,
  });

  return { scheduler, lifecycle, stdout, clock, render, repaint };
}

describe("C03 integration", () => {
  it("T4.1 (with C01, C01's T4.3): nothing is written while C01 reports unacquired", () => {
    const { scheduler, lifecycle, stdout, clock, render, repaint } = wire();

    // Before acquire.
    expect(lifecycle.acquired).toBe(false);
    scheduler.commit("input");
    scheduler.commit("stream");
    clock.advance(100);
    expect(render).not.toHaveBeenCalled();
    expect(repaint).not.toHaveBeenCalled();

    lifecycle.acquire();
    const afterAcquire = stdout.chunks.length;
    scheduler.commit("input");
    expect(render).toHaveBeenCalledTimes(1);

    // And after release, from C01's side of the boundary.
    lifecycle.release();
    expect(lifecycle.acquired).toBe(false);
    const afterRelease = stdout.chunks.length;
    scheduler.commit("input");
    scheduler.commit("stream");
    clock.advance(100);

    expect(render).toHaveBeenCalledTimes(1);
    expect(stdout.chunks.length, "no frame bytes after release").toBe(afterRelease);
    expect(afterRelease).toBeGreaterThan(afterAcquire);
  });

  it("T4.2 (with C01, C02): resume() → invalidate() makes the next commit a repaint", () => {
    const { scheduler, lifecycle, clock, render, repaint } = wire();
    lifecycle.acquire();

    scheduler.commit("input");
    expect(render).toHaveBeenCalledTimes(1);

    // The A02 §4 sequence, with L4's part written out: C01 states the fact,
    // the shell decides what it means. C01 sets no flag itself (A01 D53).
    const seen: string[] = [];
    lifecycle.onResume(() => {
      seen.push("resume");
      scheduler.invalidate();
    });

    lifecycle.suspend();
    expect(lifecycle.acquired).toBe(false);
    scheduler.commit("input");
    expect(render, "nothing is written while suspended").toHaveBeenCalledTimes(1);

    lifecycle.resume();
    // `resume()` re-acquires directly; the onResume channel is for SIGCONT.
    // Either way the shell is what calls invalidate.
    if (seen.length === 0) scheduler.invalidate();

    scheduler.commit("input");
    clock.advance(100);

    expect(repaint, "the first frame after resume is a full repaint").toHaveBeenCalledTimes(1);
    expect(scheduler.contaminated).toBe(false);
  });

  it("T4.3 (with C02): synchronisedUpdate:false from a real detection run emits no 2026", () => {
    // Real records, not fabricated ones, and both directions — a negative
    // assertion alone passes just as well when C03 never wraps anything.
    expect(detectCapabilities({ TERM: "xterm-256color" }).capabilities.synchronisedUpdate).toBe(
      false,
    );
    expect(detectCapabilities({ TERM: "xterm-kitty" }).capabilities.synchronisedUpdate).toBe(true);

    function framesFor(env: Record<string, string>): string {
      const w = wire(env);
      w.lifecycle.acquire();
      const before = w.stdout.chunks.length;
      w.scheduler.commit("input");
      w.scheduler.commit("resize");
      w.scheduler.commit("stream");
      w.clock.advance(100);
      return w.stdout.chunks.slice(before).join("");
    }

    const without = framesFor({ TERM: "xterm-256color" });
    expect(without).not.toContain(MODES.syncOn);
    expect(without).not.toContain(MODES.syncOff);
    expect(without, "C03 writes nothing at all without the capability").toBe("");

    const with_ = framesFor({ TERM: "xterm-kitty" });
    expect(with_).toContain(MODES.syncOn);
    expect(with_).toContain(MODES.syncOff);
    // Balanced across all three writes (I6).
    expect(with_.split(MODES.syncOn)).toHaveLength(with_.split(MODES.syncOff).length);
  });

  it("T4.7 (with C01): a SIGWINCH snapshot produces a repaint, not a diff", () => {
    const { scheduler, lifecycle, render, repaint } = wire();
    lifecycle.acquire();

    // L4's wiring: C01 reports the snapshot, the shell classifies the commit.
    // C03 does not subscribe — it cannot, the view is `acquired` only.
    lifecycle.onResize(() => scheduler.commit("resize"));

    process.emit("SIGWINCH");

    expect(repaint).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();

    // D31 — resize is not debounced, by C01 or by C03. Three snapshots are
    // three repaints, and dragging an edge stays continuously correct.
    process.emit("SIGWINCH");
    process.emit("SIGWINCH");
    expect(repaint).toHaveBeenCalledTimes(3);
  });

  // C13 landed, and it is deliberately not what these were waiting for. C13
  // emits a `Change` and commits nothing — L1, L2 and L3 never commit a frame,
  // L4 does — so "an append issues one commit(stream)" is a claim about the
  // orchestration above the store, and the piece still missing is C14.
  it.todo(
    "T4.4: a transcript append issues one commit(stream), and a burst inside one 16 ms window is one frame — waits on C14",
  );
  it.todo(
    "T4.5: a keystroke issues commit(input) and the frame is drawn before the next keystroke is processed — waits on C17",
  );
  it.todo(
    "T4.6: typing while a stream commits at 16 ms intervals — every keystroke frame immediate, none behind a stream frame — waits on C17. T3.23 asserts the same property deterministically and does not wait on it",
  );
});
