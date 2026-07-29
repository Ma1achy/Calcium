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
