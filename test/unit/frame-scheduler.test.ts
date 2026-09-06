// C03 tier 1 — isolated. Fake clock, spy render/repaint, fabricated capabilities.
//
// Every timing assertion names the window it is about. Nothing sleeps.
import { afterEach, describe, expect, it } from "vitest";
import { MODES } from "../support/fake-terminal.js";
import { assertSeamNarrow, harness } from "../support/fake-scheduler.js";

const corpus: string[][] = [];

function build(...args: Parameters<typeof harness>): ReturnType<typeof harness> {
  const h = harness(...args);
  corpus.push(h.written);
  return h;
}

afterEach(() => {
  // C13 — the write seam stays two strings wide across the whole file (T2.7).
  for (const written of corpus) assertSeamNarrow(written);
  corpus.length = 0;
});

describe("C03 commit classification", () => {
  it("T1.1 (I2): commit(input) from idle renders synchronously, before the clock moves", () => {
    const { scheduler, render, clock } = build();

    scheduler.commit("input");

    expect(render).toHaveBeenCalledTimes(1);
    expect(clock.outstanding).toBe(0);
    expect(scheduler.pending).toBe(false);
  });

  it("T1.2 (I2): commit(completion) from idle renders synchronously", () => {
    const { scheduler, render, clock } = build();

    scheduler.commit("completion");

    expect(render).toHaveBeenCalledTimes(1);
    expect(clock.outstanding).toBe(0);
  });

  it("T1.3: commit(stream) schedules at 33 ms and renders only when it arrives", () => {
    const { scheduler, render, clock } = build();

    scheduler.commit("stream");

    expect(render).not.toHaveBeenCalled();
    expect(scheduler.pending).toBe(true);
    expect(clock.armed).toEqual([33]);

    clock.advance(32);
    expect(render).not.toHaveBeenCalled();

    clock.advance(1);
    expect(render).toHaveBeenCalledTimes(1);
    expect(scheduler.pending).toBe(false);
  });

  it("T1.4 (I3): three stream commits in one window are one timer, one render, no slide", () => {
    const { scheduler, render, clock } = build();

    scheduler.commit("stream");
    clock.advance(10);
    scheduler.commit("stream");
    clock.advance(10);
    scheduler.commit("stream");

    expect(clock.outstanding).toBe(1);
    // One arm, not three: 33 is not strictly shorter than 33, so the window
    // cannot slide (I3, T6.2).
    expect(clock.arms).toEqual([33]);

    clock.advance(13); // 33 ms from the *first* commit.
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("T1.5 (I4): an immediate commit cancels the pending timer and it never fires", () => {
    const { scheduler, render, clock } = build();

    scheduler.commit("stream");
    clock.advance(4);
    scheduler.commit("input");

    expect(render).toHaveBeenCalledTimes(1);
    expect(clock.outstanding).toBe(0);

    // Past the window the cancelled timer would have fired in.
    clock.advance(40);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("T1.6: flush() writes the pending frame now and cancels the timer", () => {
    const { scheduler, render, clock } = build();

    scheduler.commit("spinner");
    scheduler.flush();

    expect(render).toHaveBeenCalledTimes(1);
    expect(clock.outstanding).toBe(0);
    expect(scheduler.pending).toBe(false);

    clock.advance(200);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("T1.7: commit(spinner) schedules at 100 ms, not at the 33 ms stream window", () => {
    const { scheduler, clock } = build();

    scheduler.commit("spinner");

    expect(clock.armed).toEqual([100]);
  });

  it("T1.14: a custom stream window is the one that is armed", () => {
    const { scheduler, clock } = build({ windows: { stream: 16 } });

    scheduler.commit("stream");

    expect(clock.armed).toEqual([16]);
  });
});

describe("C03 contamination", () => {
  it("T1.8 (I5): invalidate() makes the next write a repaint, and clears", () => {
    const { scheduler, render, repaint } = build();

    scheduler.invalidate();
    expect(scheduler.contaminated).toBe(true);

    scheduler.commit("input");

    expect(repaint).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();
    expect(scheduler.contaminated).toBe(false);
  });

  it("T1.9 (I5): one invalidate() contaminates one write, not every write after it", () => {
    const { scheduler, render, repaint } = build();

    scheduler.invalidate();
    scheduler.commit("input");
    scheduler.commit("input");

    expect(repaint).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("T1.10 (I7, I15): commit(resize) contaminates at once and repaints one window later", () => {
    // **The flag is eager and the frame is not** (I7, I15). This row asserted
    // both as immediate, because they were; the window separates them and the
    // separation is the thing that makes coalescing safe rather than a
    // trade-off. `contaminated` is set inside `commit` before any branch, so a
    // frame written for *any* reason inside the window is a repaint.
    const { scheduler, render, repaint, clock } = build();

    scheduler.commit("resize");

    expect(repaint, "nothing written before the window elapses").not.toHaveBeenCalled();
    expect(clock.outstanding, "a timer is standing").toBe(1);
    expect(scheduler.contaminated, "and the flag is already set").toBe(true);

    clock.advance(16);

    expect(repaint).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();
    expect(clock.outstanding).toBe(0);
    expect(scheduler.contaminated).toBe(false);
  });

  it("T1.21 (I15): commit(resize) from idle arms a 16 ms window and writes nothing yet", () => {
    // **The defect this window exists for is invisible to every assertion about
    // what a frame contains** (F423). A frame written per SIGWINCH is correct —
    // just thirty times over, each one re-measuring the whole transcript because
    // width invalidates every cached height (C14 I8). Measured at 544 ms for a
    // 30-event drag at a thousand entries, of which the index rebuild everyone
    // named was 0.07%. So the row asserts the *timer*, which is the only
    // observable the cost has.
    const { scheduler, repaint, clock } = build();

    scheduler.commit("resize");
    clock.advance(15);
    expect(repaint, "still inside the window").not.toHaveBeenCalled();

    clock.advance(1);
    expect(repaint).toHaveBeenCalledTimes(1);
  });

  it("T1.22 (I15): two resizes inside one window write once, and the deadline does not slide", () => {
    // **A window re-armed per event never fires during a continuous drag**
    // (C03 §8a A1) — the starvation case, and exactly what a per-event
    // `setTimeout` in the resize handler would have produced. §3's
    // strictly-shorter rule already gives the fixed deadline, so this row exists
    // to hold it rather than to add a clause.
    const { scheduler, repaint, clock } = build();

    scheduler.commit("resize");
    clock.advance(10);
    scheduler.commit("resize");
    clock.advance(6);

    expect(repaint, "one write, at the first commit's deadline").toHaveBeenCalledTimes(1);
  });

  it("T1.23 (I15): an input commit inside the window writes at once, and as a repaint", () => {
    // **This is why the coalescing costs no correctness** (C03 §8a A2). A
    // keystroke mid-drag is written immediately by I2, and it is a *repaint*
    // because the resize already contaminated — so it is never a diff against
    // dimensions the terminal no longer has. The frame is at the current width
    // because L4 resizes the viewport from the composed frame before reading a
    // row (C22 I34), which is the half of the argument that lives elsewhere.
    const { scheduler, render, repaint, clock } = build();

    scheduler.commit("resize");
    clock.advance(4);
    scheduler.commit("input");

    expect(repaint, "written before the window elapsed").toHaveBeenCalledTimes(1);
    expect(render, "and not as an ordinary diffed frame").not.toHaveBeenCalled();
    expect(clock.outstanding, "the resize's timer was cancelled, not left standing").toBe(0);
  });
});

describe("C03 acquisition and synchronised update", () => {
  it("T1.11 (I1): a commit while unacquired writes nothing and does not throw", () => {
    const { scheduler, render, repaint, written } = build({ acquired: false });

    expect(() => scheduler.commit("input")).not.toThrow();

    expect(render).not.toHaveBeenCalled();
    expect(repaint).not.toHaveBeenCalled();
    expect(written).toEqual([]);
  });

  it("T1.12 (I6): a write is wrapped in the synchronised-update markers, in order", () => {
    const order: string[] = [];
    const { scheduler, written } = build({
      capabilities: { synchronisedUpdate: true },
      render: () => void order.push("render"),
    });

    scheduler.commit("input");

    expect(written.map((s) => s.slice(1))).toEqual([MODES.syncOn, MODES.syncOff]);
    expect(order).toEqual(["render"]);
  });

  it("T1.13 (I6): without the capability, no 2026 byte is emitted at all", () => {
    const { scheduler, written } = build({ capabilities: { synchronisedUpdate: false } });

    scheduler.commit("input");
    scheduler.commit("resize");

    expect(written).toEqual([]);
  });
});

describe("C03 §4a — suspension", () => {
  it("T1.15 (I13): a suspended scheduler writes nothing, and resume writes once", () => {
    // **The pair is the assertion.** A suspension that never lifts is
    // indistinguishable from a scheduler that stopped working, so asserting the
    // silence alone would pass for a component that had simply broken.
    const { scheduler, render, repaint } = build();

    scheduler.suspend();
    scheduler.commit("input");
    scheduler.commit("completion");

    expect(render, "nothing is written while suspended").not.toHaveBeenCalled();
    expect(repaint).not.toHaveBeenCalled();

    scheduler.resume();

    expect(render).toHaveBeenCalledTimes(1);
    expect(repaint, "resume diffs; it does not repaint").not.toHaveBeenCalled();
  });

  it("T1.16 (I13): a resize is written while suspended — contamination overrides", () => {
    // Suspension may make the screen *stale*, which is what the reader asked
    // for. It may not make the screen *unknown*. Width is the axis that wraps
    // and a wrapped line scrolls the alternate screen, which is the one failure
    // the application can no longer see — so deferring here protects nothing
    // and costs the state.
    // **The window and the suspension are different mechanisms** (C03 §8a A4).
    // I13 is about *whether* a contaminated frame is written; I15 is about
    // *when*. The clock advance is not a formality — commitment 14 used to say a
    // resize is *never deferred*, which was true of suspension and became false
    // in a second sense the moment a window existed, and nothing about writing
    // the window would have re-read that sentence. The walk did.
    const { scheduler, render, repaint, clock } = build();

    scheduler.suspend();
    scheduler.commit("resize");
    clock.advance(16);

    expect(repaint, "a resize reaches the terminal while suspended").toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();

    // And the suspension is still in force afterwards: the resize was written
    // because it was contaminated, not because it lifted the hold.
    scheduler.commit("input");
    expect(render).not.toHaveBeenCalled();
  });

  it("T1.17 (I13): the rule is contamination, not resize in particular", () => {
    // The same behaviour reached through `invalidate()`, so the row cannot pass
    // for an implementation that special-cased one commit reason.
    const { scheduler, render, repaint } = build();

    scheduler.suspend();
    scheduler.invalidate();
    scheduler.commit("input");

    expect(repaint).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();
  });

  it("T1.18 (I14): flush forces nothing while suspended, and holds no queue", () => {
    // **Both obvious answers were wrong**, and this row separates them. If
    // `flush()` composed, suspension would be advisory — the first assertion.
    // If suspension queued, `resume()` would produce more than one frame — the
    // last. There is no queue because `commit` already collapses to one state
    // and one deferred reason, which was true long before suspension existed.
    const { scheduler, render, clock } = build();

    scheduler.commit("spinner");
    scheduler.suspend();
    scheduler.flush();

    expect(render, "flush does not compose while suspended").not.toHaveBeenCalled();

    // The armed timer still fires and still writes nothing.
    clock.advance(100);
    expect(render).not.toHaveBeenCalled();

    scheduler.resume();
    expect(render, "one frame on resume, not one per held commit").toHaveBeenCalledTimes(1);
  });

  it("T1.19 (I14): resume diffs, because suspension wrote nothing to diverge from", () => {
    // **The property that chose this seam over a no-op `render` callback.**
    // Nothing was written, so the terminal still holds the last frame this
    // component put there and the diff's model of it is still true. A repaint
    // here would be a larger burst bought with no correctness at all — and a
    // no-op render would have cleared these two flags on a frame that never
    // reached the screen.
    const { scheduler, render, repaint } = build();

    scheduler.commit("input"); // a real frame, so there is a screen to diff against
    expect(render).toHaveBeenCalledTimes(1);

    scheduler.suspend();
    scheduler.commit("stream");
    scheduler.resume();

    expect(repaint).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledTimes(2);
    expect(scheduler.contaminated, "suspension never contaminates").toBe(false);
  });

  it("T1.19b (I13): suspend and resume are idempotent", () => {
    const { scheduler, render } = build();

    scheduler.suspend();
    scheduler.suspend();
    scheduler.commit("input");
    expect(render).not.toHaveBeenCalled();

    scheduler.resume();
    scheduler.resume();
    expect(render, "the second resume commits nothing").toHaveBeenCalledTimes(1);
  });
});
