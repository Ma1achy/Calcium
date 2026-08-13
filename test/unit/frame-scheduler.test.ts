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

  it("T1.10 (I7): commit(resize) repaints immediately, with no explicit invalidate()", () => {
    const { scheduler, render, repaint, clock } = build();

    scheduler.commit("resize");

    expect(repaint).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();
    expect(clock.outstanding).toBe(0);
    expect(scheduler.contaminated).toBe(false);
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
    const { scheduler, render, repaint } = build();

    scheduler.suspend();
    scheduler.commit("resize");

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
