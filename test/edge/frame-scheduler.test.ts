// C03 tier 3 — where the real defects live.
//
// Re-entrancy, throwing callbacks, and the acquired flag moving underneath a
// pending timer. Every one of these is a state the transition table has a cell
// for and an implementation reaches by accident.
import { afterEach, describe, expect, it, vi } from "vitest";
import { MODES } from "../support/fake-terminal.js";
import { assertSeamNarrow, harness } from "../support/fake-scheduler.js";

const corpus: string[][] = [];

function build(...args: Parameters<typeof harness>): ReturnType<typeof harness> {
  const h = harness(...args);
  corpus.push(h.written);
  return h;
}

afterEach(() => {
  for (const written of corpus) assertSeamNarrow(written);
  corpus.length = 0;
  vi.restoreAllMocks();
});

describe("C03 no-ops and idempotence", () => {
  it("T3.1: flush() from idle writes nothing and does not throw", () => {
    const { scheduler, render, repaint } = build();

    expect(() => scheduler.flush()).not.toThrow();

    expect(render).not.toHaveBeenCalled();
    expect(repaint).not.toHaveBeenCalled();
  });

  it("T3.2: invalidate() twice before a write is one repaint, not two", () => {
    const { scheduler, render, repaint } = build();

    scheduler.invalidate();
    scheduler.invalidate();
    scheduler.commit("input");
    scheduler.commit("input");

    expect(repaint).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("T3.6: invalidate() while pending stays pending, and that frame is a repaint", () => {
    const { scheduler, render, repaint, clock } = build();

    scheduler.commit("stream");
    scheduler.invalidate();

    expect(scheduler.pending).toBe(true);
    expect(clock.outstanding).toBe(1);

    clock.advance(33);

    expect(repaint).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();
  });
});

describe("C03 throwing callbacks", () => {
  it("T3.3 (I9): a throwing render leaves no timer, no pending state, and no wedge", () => {
    const boom = new Error("render failed");
    let live = true;
    const h = build({
      render: () => {
        if (live) throw boom;
      },
    });

    expect(() => h.scheduler.commit("input")).toThrow(boom);

    expect(h.scheduler.pending).toBe(false);
    expect(h.clock.outstanding).toBe(0);

    live = false;
    h.scheduler.commit("input");
    expect(h.render).toHaveBeenCalledTimes(2);
  });

  it("T3.4 (I6, I9): a throwing render still emits the closing marker", () => {
    const { scheduler, written } = build({
      capabilities: { synchronisedUpdate: true },
      render: () => {
        throw new Error("render failed");
      },
    });

    expect(() => scheduler.commit("input")).toThrow();

    // Unbalanced, the terminal stays in synchronised mode and is frozen — the
    // throw would present as a dead screen rather than as an error.
    expect(written.map((s) => s.slice(1))).toEqual([MODES.syncOn, MODES.syncOff]);
  });

  it("T3.5 (I5, I9): a throwing repaint leaves contaminated set, so the next write retries", () => {
    let live = true;
    const h = build({
      repaint: () => {
        if (live) throw new Error("repaint failed");
      },
    });

    h.scheduler.invalidate();
    expect(() => h.scheduler.commit("input")).toThrow();

    // Cleared before the repaint rather than after, a failed repaint is never
    // retried and every later frame diffs against an unknown screen.
    expect(h.scheduler.contaminated).toBe(true);

    live = false;
    h.scheduler.commit("input");

    expect(h.repaint).toHaveBeenCalledTimes(2);
    expect(h.render).not.toHaveBeenCalled();
    expect(h.scheduler.contaminated).toBe(false);
  });
});

describe("C03 re-entrancy", () => {
  it("T3.7 (I10): a commit during render is deferred to after the write, not dropped", () => {
    let inner = true;
    const h = build({
      render: () => {
        if (!inner) return;
        inner = false;
        h.scheduler.commit("input");
        // Still inside the write: the inner commit has not drawn anything.
        expect(h.render).toHaveBeenCalledTimes(1);
      },
    });

    h.scheduler.commit("input");

    expect(h.render).toHaveBeenCalledTimes(2);
    expect(h.scheduler.pending).toBe(false);
  });

  it("T3.8: flush() during render is a no-op — the write it would force is happening", () => {
    let inner = true;
    const h = build({
      render: () => {
        if (!inner) return;
        inner = false;
        h.scheduler.flush();
      },
    });

    h.scheduler.commit("stream");
    h.clock.advance(33);

    expect(h.render).toHaveBeenCalledTimes(1);
  });

  it("T3.15 (I3, I10): a coalesced commit deferred during a write gets a fresh window", () => {
    let inner = true;
    const h = build({
      render: () => {
        if (!inner) return;
        inner = false;
        h.scheduler.commit("stream");
      },
    });

    h.scheduler.commit("input");

    expect(h.render).toHaveBeenCalledTimes(1);
    expect(h.scheduler.pending).toBe(true);
    // Measured from the end of the write, and one timer only.
    expect(h.clock.outstanding).toBe(1);
    expect(h.clock.armed).toEqual([33]);

    h.clock.advance(33);
    expect(h.render).toHaveBeenCalledTimes(2);
  });

  it("T3.17 (I10): a resize during a write defers, sets the flag, and repaints", () => {
    let inner = true;
    const h = build({
      render: () => {
        if (!inner) return;
        inner = false;
        h.scheduler.commit("resize");
        // I7 — the flag is set at commit time, not when the deferral is acted on.
        expect(h.scheduler.contaminated).toBe(true);
      },
    });

    h.scheduler.commit("input");

    expect(h.render).toHaveBeenCalledTimes(1);
    expect(h.repaint).toHaveBeenCalledTimes(1);
    expect(h.scheduler.contaminated).toBe(false);
  });

  it("T3.18 (I10): a stream commit during a write is scheduled, not written inline", () => {
    let inner = true;
    const h = build({
      render: () => {
        if (!inner) return;
        inner = false;
        h.scheduler.commit("stream");
      },
    });

    h.scheduler.commit("input");

    expect(h.render).toHaveBeenCalledTimes(1);
    expect(h.scheduler.pending).toBe(true);
  });

  it("T3.19: invalidate() during a write applies to the next frame, not the one in flight", () => {
    let inner = true;
    const h = build({
      render: () => {
        if (!inner) return;
        inner = false;
        h.scheduler.invalidate();
      },
    });

    h.scheduler.commit("input");

    // The write in progress was already a render; the flag survives it.
    expect(h.render).toHaveBeenCalledTimes(1);
    expect(h.repaint).not.toHaveBeenCalled();
    expect(h.scheduler.contaminated).toBe(true);

    h.scheduler.commit("input");
    expect(h.repaint).toHaveBeenCalledTimes(1);
  });

  it("T3.20 (I10): a render that always commits writes once more, then escalates", () => {
    const h = build({
      render: () => {
        h.scheduler.commit("input");
      },
    });

    // Terminates. The hazard is livelock, not depth: each write returns before
    // the next begins, so a drain-in-a-loop is flat and infinite rather than
    // deep and finite. It exhausts the heap, not the stack — this test found
    // that by taking the runner down with it.
    h.scheduler.commit("input");

    expect(h.render).toHaveBeenCalledTimes(2);
    // Not dropped either — escalated to a timer, so it lands on the next turn.
    expect(h.scheduler.pending).toBe(true);
    expect(h.clock.armed).toEqual([0]);

    h.clock.advance(0);
    expect(h.render).toHaveBeenCalledTimes(4);
  });

  it("T3.21 (I10): two commits during one write produce one write, at the stricter reason", () => {
    let inner = true;
    const h = build({
      render: () => {
        if (!inner) return;
        inner = false;
        h.scheduler.commit("stream");
        h.scheduler.commit("input");
      },
    });

    h.scheduler.commit("input");

    // One deferred write, immediate — not two, and not deferred to 33 ms.
    expect(h.render).toHaveBeenCalledTimes(2);
    expect(h.scheduler.pending).toBe(false);
    expect(h.clock.outstanding).toBe(0);
  });
});

describe("C03 acquisition moving underneath a timer", () => {
  it("T3.9 (I1): a timer that fires while unacquired writes nothing and clears", () => {
    const h = build();

    h.scheduler.commit("stream");
    h.setAcquired(false);

    expect(() => h.clock.advance(33)).not.toThrow();

    expect(h.render).not.toHaveBeenCalled();
    expect(h.written).toEqual([]);
    expect(h.scheduler.pending).toBe(false);
  });

  it("T3.10 (I1, I12): acquired flipping false and back while pending still writes once", () => {
    const h = build();

    h.scheduler.commit("stream");
    h.setAcquired(false);
    h.setAcquired(true);
    h.clock.advance(33);

    expect(h.render).toHaveBeenCalledTimes(1);
  });

  it("T3.14 (I1): flush() while unacquired cancels the timer and writes nothing", () => {
    const h = build();

    h.scheduler.commit("stream");
    h.setAcquired(false);
    h.scheduler.flush();

    expect(h.render).not.toHaveBeenCalled();
    expect(h.scheduler.pending).toBe(false);
    expect(h.clock.outstanding).toBe(0);

    // The frame is gone: an explicit flush discards it silently (I1).
    h.setAcquired(true);
    h.clock.advance(100);
    expect(h.render).not.toHaveBeenCalled();
  });

  it("T3.22 (I12): acquired flipping true after construction lets the next commit write", () => {
    const h = build({ acquired: false });

    h.scheduler.commit("input");
    expect(h.render).not.toHaveBeenCalled();

    h.setAcquired(true);
    h.scheduler.commit("input");

    // A snapshotted view would never write at all — see T3.24.
    expect(h.render).toHaveBeenCalledTimes(1);
  });

  it("T3.24 (I12): a snapshotted lifecycle view drops every frame, in silence", () => {
    const h = build({ acquired: false, snapshotLifecycle: true });

    h.setAcquired(true);

    expect(() => h.scheduler.commit("input")).not.toThrow();
    expect(() => h.scheduler.commit("resize")).not.toThrow();

    // No throw, no output, no timer — which is why §2 describes this as a hung
    // UI with no error anywhere. It is L4's mistake to make; C03 cannot prevent
    // it structurally, so it is demonstrated instead.
    expect(h.render).not.toHaveBeenCalled();
    expect(h.repaint).not.toHaveBeenCalled();
    expect(h.written).toEqual([]);
    expect(h.clock.outstanding).toBe(0);
  });
});

describe("C03 coalescing under load", () => {
  it("T3.11 (I3): a hundred stream commits in one block are one timer and one render", () => {
    const h = build();

    for (let i = 0; i < 100; i += 1) h.scheduler.commit("stream");

    expect(h.clock.outstanding).toBe(1);
    expect(h.clock.arms).toEqual([33]);

    h.clock.advance(33);
    expect(h.render).toHaveBeenCalledTimes(1);
  });

  it("T3.12 (I3): the shortest ceiling governs, in both orderings", () => {
    const first = build();
    first.scheduler.commit("stream");
    first.scheduler.commit("spinner");
    // 100 is not shorter than 33 — the longer window never pushes a frame out.
    expect(first.clock.arms).toEqual([33]);

    const second = build();
    second.scheduler.commit("spinner");
    second.scheduler.commit("stream");
    // 33 is strictly shorter, so the ceiling drops. There is no frame content,
    // so this draws the spinner earlier rather than later (§3).
    expect(second.clock.arms).toEqual([100, 33]);
    expect(second.clock.outstanding).toBe(1);

    second.clock.advance(33);
    expect(second.render).toHaveBeenCalledTimes(1);
  });

  it("T3.16: a resize while pending cancels the timer and repaints now", () => {
    const h = build();

    h.scheduler.commit("stream");
    h.scheduler.commit("resize");

    expect(h.repaint).toHaveBeenCalledTimes(1);
    expect(h.render).not.toHaveBeenCalled();
    expect(h.clock.outstanding).toBe(0);
    expect(h.scheduler.pending).toBe(false);
  });

  it("T3.23 (§1): input is never starved by a stream, over a long interleaving", () => {
    const h = build({ windows: { stream: 16 } });
    const inputFrames: number[] = [];
    let elapsed = 0;

    // 600 ms of streaming at the 16 ms ceiling, with keystrokes at irregular
    // offsets — the property the component exists for (§1).
    for (let tick = 0; tick < 60; tick += 1) {
      h.scheduler.commit("stream");
      if (tick % 7 === 3) {
        const before = h.render.mock.calls.length + h.repaint.mock.calls.length;
        h.scheduler.commit("input");
        const after = h.render.mock.calls.length + h.repaint.mock.calls.length;

        // Drawn at the tick its commit arrived, not queued behind a stream
        // frame. This is the whole assertion.
        expect(after - before).toBe(1);
        inputFrames.push(elapsed);
      }
      h.clock.advance(10);
      elapsed += 10;
    }

    expect(inputFrames.length).toBeGreaterThan(5);
    // And the stream is still capped: far fewer frames than commits.
    expect(h.render.mock.calls.length).toBeLessThan(60);
  });
});

describe("C03 construction", () => {
  it("T3.13 (I2): giving an immediate reason a window is refused at construction", () => {
    const base = harness();

    for (const reason of ["input", "completion", "resize"] as const) {
      expect(
        () => harness({ windows: { [reason]: 50 } }),
        `${reason} must not be configurable — a config file cannot introduce input lag`,
      ).toThrow(RangeError);
    }

    // A zero window is still a window: refusing only non-zero values would let
    // `{ input: 0 }` through and normalise the idea that the key is meaningful.
    expect(() => harness({ windows: { input: 0 } })).toThrow(RangeError);
    expect(base.scheduler.pending).toBe(false);
  });

  it("T3.13 (I2): a coalesced reason still accepts a window, and rejects nonsense", () => {
    expect(() => harness({ windows: { stream: 16, spinner: 250 } })).not.toThrow();
    expect(() => harness({ windows: { stream: -1 } })).toThrow(RangeError);
    expect(() => harness({ windows: { stream: Number.NaN } })).toThrow(RangeError);
  });
});
