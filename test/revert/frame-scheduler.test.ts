// C03 tier 6 — each names the change that makes it fail.
//
// These are not extra coverage. Each one is a plausible edit to
// frame-scheduler.ts, written out so that making it breaks a named test rather
// than passing review.
import { afterEach, describe, expect, it, vi } from "vitest";
import { MODES } from "../support/fake-terminal.js";
import { assertSeamNarrow, harness } from "../support/fake-scheduler.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("C03 fail-on-revert", () => {
  it("T6.1 (I2): giving `input` a non-zero window → T1.1 and T3.13 fail", () => {
    // T1.1's property: the render is synchronous, before the clock moves.
    const { scheduler, render, clock } = harness();
    scheduler.commit("input");
    expect(render).toHaveBeenCalledTimes(1);
    expect(clock.outstanding).toBe(0);

    // T3.13's property: the window cannot be supplied in the first place.
    expect(() => harness({ windows: { input: 1 } })).toThrow(RangeError);
  });

  it("T6.2 (I3): restarting the timer on each coalesced commit → T1.4 fails", () => {
    const { scheduler, render, clock } = harness();

    // Five commits inside one window: one arm, and the frame lands 33 ms after
    // the *first* of them.
    for (let i = 0; i < 5; i += 1) {
      scheduler.commit("stream");
      clock.advance(5);
    }
    expect(clock.arms, "one arm, not five").toEqual([33]);
    expect(render).not.toHaveBeenCalled();

    clock.advance(8); // t = 33
    expect(render).toHaveBeenCalledTimes(1);

    // And the shape of the bug itself: under a sliding window a stream that
    // never pauses never renders at all, however long it runs.
    for (let ms = 0; ms < 500; ms += 5) {
      scheduler.commit("stream");
      clock.advance(5);
    }
    expect(render.mock.calls.length, "a continuous stream must keep rendering").toBeGreaterThan(10);
  });

  it("T6.3 (I4): leaving the timer live after an immediate commit → T1.5 fails", () => {
    const { scheduler, render, clock } = harness();

    scheduler.commit("stream");
    scheduler.commit("input");
    clock.advance(100);

    expect(render, "the cancelled timer must not produce a second frame").toHaveBeenCalledTimes(1);
  });

  it("T6.4 (I6): emitting the closing marker in the `try` rather than a `finally` → T3.4 fails", () => {
    const { scheduler, written } = harness({
      capabilities: { synchronisedUpdate: true },
      render: () => {
        throw new Error("render failed");
      },
    });

    expect(() => scheduler.commit("input")).toThrow();

    const closers = written.filter((s) => s.endsWith(MODES.syncOff));
    expect(closers, "an unbalanced marker freezes the terminal").toHaveLength(1);
  });

  it("T6.5 (I5): clearing `contaminated` before the repaint → T3.5 fails", () => {
    let live = true;
    const h = harness({
      repaint: () => {
        if (live) throw new Error("repaint failed");
      },
    });

    h.scheduler.invalidate();
    expect(() => h.scheduler.commit("input")).toThrow();

    // Cleared early, a failed repaint is never retried and every frame after it
    // diffs against a screen whose contents nobody knows.
    expect(h.scheduler.contaminated).toBe(true);
    live = false;
    h.scheduler.commit("input");
    expect(h.repaint).toHaveBeenCalledTimes(2);
  });

  it("T6.6 (I1): removing the acquired check → T1.11 fails, and C01's T4.3 from the other side", () => {
    const h = harness({ acquired: false });

    h.scheduler.commit("input");
    h.scheduler.commit("resize");
    h.scheduler.commit("stream");
    h.clock.advance(100);

    expect(h.render).not.toHaveBeenCalled();
    expect(h.repaint).not.toHaveBeenCalled();
    expect(h.written, "nothing reaches the stream while unacquired").toEqual([]);
  });

  it("T6.7 (I7): decoupling resize from invalidation → T1.10 fails", () => {
    const { scheduler, render, repaint } = harness();

    scheduler.commit("resize");

    // A diff against a frame drawn at the old dimensions is meaningless.
    expect(repaint).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();
  });

  it("T6.8 (I8): adding a frame buffer or a content parameter to commit → T2.2 fails", () => {
    const { scheduler } = harness();

    expect(scheduler.commit.length, "commit takes a reason and nothing else").toBe(1);
    expect(new Set(Object.keys(scheduler))).toEqual(
      new Set(["commit", "flush", "invalidate", "pending", "contaminated"]),
    );
  });

  it("T6.9 (A02 §7): adding a CommitReason without a window → T2.5 fails at build time", () => {
    // The gate is `WINDOWS: Record<CommitReason, number>` — a total Record, so
    // a new member stops `tsc` rather than a test. What is checkable here is
    // the consequence that gate exists to guarantee: no reason falls through to
    // an implicit zero and becomes silently immediate.
    for (const reason of ["stream", "spinner"] as const) {
      const { scheduler, clock } = harness();
      scheduler.commit(reason);
      expect(scheduler.pending, `${reason} must coalesce, not write`).toBe(true);
      expect(clock.armed[0], `${reason} must have a real window`).toBeGreaterThan(0);
    }
  });

  it("T6.10 (I10): draining the deferral in a loop → T3.20 hangs; dropping it → T3.21", () => {
    // Not recursion — each write returns before the next begins. Draining in a
    // loop is flat and infinite, so it exhausts the heap rather than the stack
    // and a depth bound would not catch it. Inline-once is what terminates.
    const loop = harness({
      render: () => {
        loop.scheduler.commit("input");
      },
    });
    expect(() => loop.scheduler.commit("input")).not.toThrow();
    expect(loop.render).toHaveBeenCalledTimes(2);
    expect(loop.scheduler.pending, "escalated, not dropped").toBe(true);

    // Dropping: the final state is lost.
    let inner = true;
    const kept = harness({
      render: () => {
        if (!inner) return;
        inner = false;
        kept.scheduler.commit("stream");
        kept.scheduler.commit("input");
      },
    });
    kept.scheduler.commit("input");
    expect(kept.render, "the deferred frame must still be drawn").toHaveBeenCalledTimes(2);
  });

  it("T6.11 (I11): snapshotting `acquired` at construction → T3.22 fails", () => {
    const live = harness({ acquired: false });
    live.setAcquired(true);
    live.scheduler.commit("input");
    expect(live.render, "a live view writes once acquired").toHaveBeenCalledTimes(1);

    // The same sequence against a snapshot, which is what T3.24 demonstrates.
    const dead = harness({ acquired: false, snapshotLifecycle: true });
    dead.setAcquired(true);
    dead.scheduler.commit("input");
    expect(dead.render, "a snapshot never writes at all").not.toHaveBeenCalled();
  });

  it("T6.12 (I2): allowing an immediate reason to be given a window → T3.13 fails", () => {
    // Distinct from T6.1: that reverts the behaviour, this reverts the
    // construction-time rejection. Zero included — refusing only non-zero
    // values would normalise the idea that the key means something.
    for (const reason of ["input", "completion", "resize"] as const) {
      expect(() => harness({ windows: { [reason]: 0 } }), reason).toThrow(RangeError);
      expect(() => harness({ windows: { [reason]: 50 } }), reason).toThrow(RangeError);
    }
  });

  it("T6.13 (I3): re-arming on a window that is merely not longer → T1.4; never → T3.12", () => {
    // Not-longer rather than strictly-shorter: 33 against 33 re-arms, and the
    // window slides on every commit.
    const same = harness();
    same.scheduler.commit("stream");
    same.clock.advance(10);
    same.scheduler.commit("stream");
    expect(same.clock.arms, "equal windows never re-arm").toEqual([33]);

    // Never re-arming: a 100 ms spinner holds a stream frame past its budget.
    const shorter = harness();
    shorter.scheduler.commit("spinner");
    shorter.scheduler.commit("stream");
    expect(shorter.clock.arms, "a strictly shorter ceiling governs").toEqual([100, 33]);
    expect(shorter.clock.outstanding, "and there is still only one timer").toBe(1);
  });

  it("T6.14 (C13): passing frame content to `write` rather than through render() → T2.7 fails", () => {
    const { scheduler, written } = harness({ capabilities: { synchronisedUpdate: true } });

    scheduler.commit("input");
    scheduler.commit("resize");

    // Two markers per write and nothing between them: C03 never sees a frame.
    expect(() => assertSeamNarrow(written)).not.toThrow();
    expect(written).toHaveLength(4);
  });

  it("T6.15 (I11): snapshotting `acquired` in the L4 wiring → T3.24 fails", () => {
    const h = harness({ acquired: false, snapshotLifecycle: true });
    h.setAcquired(true);

    h.scheduler.commit("input");
    h.scheduler.commit("stream");
    h.clock.advance(100);

    // Silent in every direction — no throw, no output, no timer left behind.
    // That is why it presents as a hung UI with no error anywhere.
    expect(h.render).not.toHaveBeenCalled();
    expect(h.written).toEqual([]);
    expect(h.clock.outstanding).toBe(0);
  });
});
