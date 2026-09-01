// C03 tier 4 — integration. Real components, no real terminal.
//
// C01 and C02 exist, so the three seams C03 shares with them are driven by real
// objects: a real capability record, a real lifecycle, and C01's own `writer`
// as the injected `write`. The rest name their blocker in a greppable form.
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSession } from "../support/session.js";
import { pipelineHarness, settled } from "../support/execution.js";
import { displayCells } from "../../src/presentation/text.js";
import { detectCapabilities } from "../../src/terminal/capabilities.js";
import { createTerminalLifecycle, type TerminalLifecycle } from "../../src/terminal/lifecycle.js";
import { createFrameScheduler } from "../../src/terminal/frame-scheduler.js";
import type { FrameScheduler } from "../../src/terminal/frame-scheduler.js";
import { fakeStdin, fakeStdout, MODES } from "../support/fake-terminal.js";
import { fakeClock } from "../support/fake-scheduler.js";
import { createEditor } from "../../src/interaction/editor/index.js";

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

  it("T4.7 (with C01, C03 I15): a SIGWINCH run produces one repaint per window, not a diff", () => {
    const { scheduler, lifecycle, render, repaint, clock } = wire();
    lifecycle.acquire();

    // L4's wiring: C01 reports the snapshot, the shell classifies the commit.
    // C03 does not subscribe — it cannot, the view is `acquired` only.
    lifecycle.onResize(() => scheduler.commit("resize"));

    process.emit("SIGWINCH");

    expect(repaint, "coalesced, so not yet").not.toHaveBeenCalled();
    clock.advance(16);
    expect(repaint).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();

    // **D31, amended.** It read *resize is not debounced* and three snapshots
    // were three repaints. A debounce and a fixed window are not the same thing:
    // a debounce waits for the events to stop, so a long drag draws nothing for
    // its duration, and that is what D31 protects against. A 16 ms deadline
    // draws throughout, at most one window behind — so *dragging an edge stays
    // continuously correct* survives, and three snapshots inside one window are
    // **one** repaint rather than three (C03 I15, F425).
    process.emit("SIGWINCH");
    process.emit("SIGWINCH");
    process.emit("SIGWINCH");
    expect(repaint, "still one — the deadline does not slide").toHaveBeenCalledTimes(1);
    clock.advance(16);
    expect(repaint, "and the run resolves to a single further frame").toHaveBeenCalledTimes(2);
  });

  // C13 and C14 both landed, and neither is what this was waiting for: L1, L2
  // and L3 never commit a frame, L4 does. "An append issues one commit(stream)"
  // is a claim about the orchestration above the store, so the blocker is C22.
  //
  // The blocker clause is everything after "waits on", so the reasoning lives
  // here rather than in the title — a title reading "waits on C22. Neither C13
  // nor C14 …" names three blockers, two of which exist, and the rule fires.
  it("T4.4 (with C23, C13): a submission issues one commit, and a stream burst coalesces", async () => {
    // **A02 §4 gives transcript writes to the pipeline**, so this is C03's claim
    // from the side that actually appends. Two halves, and the second is the one
    // C03 exists for: a thousand log lines a second must not be a thousand
    // frames.
    const h = pipelineHarness();

    h.pipeline.submit("/ps");
    await settled();
    expect(
      h.commits.filter((c: string) => c === "input"),
      "one submission, one input commit — not one per block",
    ).toHaveLength(1);

    // A burst of stream patches: each commits `"stream"`, and coalescing is
    // C03's to do from there. What C23 must not do is commit `"input"` per
    // patch, which would bypass the window entirely.
    const streamed = pipelineHarness({
      stream: () =>
        (async function* () {
          for (let i = 0; i < 20; i += 1) yield { kind: "data", value: {} } as never;
        })(),
    });
    streamed.pipeline.submit("/tail");
    await settled();

    expect(
      streamed.commits.filter((c: string) => c === "input"),
      "the pending append, and nothing else at input priority",
    ).toHaveLength(1);
    expect(
      streamed.commits.every((c: string) => c === "input" || c === "stream" || c === "completion"),
      "every commit names a documented class (C23 I8)",
    ).toBe(true);
  });
  it("T4.9 (with C22): a resize mid-frame cannot produce a two-width frame", async () => {
    // **The test `docs/notes/resize-and-compositor.md` specifies**, at the scope
    // where the property lives. Compose at 100, let the terminal become 80
    // before the next write, and assert that what was written is internally
    // consistent — a too-long line is a wrong frame, but the wrap it causes
    // scrolls the alternate screen, and that is unrecoverable.
    //
    // The subject that can tell the two apart is a size that changes between
    // the compose and the read. If anything downstream re-read it, some rows
    // would be 100 cells and some 80.
    // **A real session, not `buildGraph`.** That harness stubs `render` with a
    // counter, so nothing it builds ever paints — a test about what reaches the
    // terminal would be measuring the harness.
    // **Per frame, not per width, and the first draft of this test had it
    // wrong.** A frame written *after* the resize is correctly at 80 — C03
    // treats `resize` as an immediate commit, so the repaint composes at the
    // new size. The property is not "every frame is 100"; it is that no single
    // frame mixes two widths, which is what wraps.
    const { stdout, resize } = await buildSession({}, { columns: 100, rows: 30 });

    const before = stdout.chunks.length;
    resize({ columns: 80, rows: 30 });
    // **The window, and the guard below is what asked for this line** (C03 I15).
    // With `resize` coalesced, nothing is written synchronously — so the frames
    // examined below were an empty set and every assertion about them passed
    // vacuously. They did not, because this row carries a guard that the set is
    // non-empty, and that guard is the only reason the change surfaced here as a
    // failure rather than as silent coverage loss.
    //
    // **A real wait, and `clock.advance` would not do.** This harness's clock is
    // fake for `now()` and its `schedule` is a real `setTimeout`
    // (`test/support/session.ts`) — C16's windows read the clock, C03's arm a
    // timer, and they are different mechanisms. Advancing the reading fires
    // nothing, which is a way for a test to wait for something that has already
    // been made not to happen.
    await new Promise((done) => setTimeout(done, 40));

    // Every frame written since, examined on its own.
    // **A frame is no longer `HOME` and rows.** It is hide, `HOME`, the rows,
    // then the cursor's position and show — one write, because the cursor's
    // bytes have to land inside C03's synchronised-update window (C01 I19). So
    // the rows are what sits between `HOME` and the cursor sequence closing the
    // frame. The `startsWith` this replaced matched nothing after that change,
    // and the guard below is what said so rather than the assertions passing
    // vacuously over an empty set.
    const HOME_SEQ = "\u001b[H";
    const HIDE_SEQ = "\u001b[?25l";
    const frames = stdout.chunks
      .slice(before)
      .filter((c) => c.includes(HOME_SEQ))
      .map((c) => {
        const body = c.slice(c.indexOf(HOME_SEQ) + HOME_SEQ.length);
        const end = body.indexOf(HIDE_SEQ);
        return (end === -1 ? body : body.slice(0, end)).split("\r\n");
      });

    // **The subject, before the claim.** A set of one is satisfied by a set of
    // none, so a frame that was never written would pass — the inert-subject
    // class this suite has now met five times.
    expect(frames.length, "a frame was actually written").toBeGreaterThan(0);

    for (const [i, rows] of frames.entries()) {
      const widths = new Set(rows.map((l) => displayCells(l)));
      expect(rows, `frame ${String(i)}: 30 rows`).toHaveLength(30);
      expect(widths.size, `frame ${String(i)}: composed at ${[...widths].join(", ")}`).toBe(1);
    }
  });

  it("T4.5 (with C17): a keystroke's frame is drawn before the next keystroke is processed", () => {
    // Against a real editor, which is what the deferral was waiting for. The
    // property is about *ordering*, not about the buffer, so the assertion is
    // that the frame for keystroke n exists before keystroke n+1 reaches the
    // editor — a scheduler that coalesced input would leave the user typing
    // ahead of the screen, which is the one latency nobody tolerates.
    const { scheduler, lifecycle, render } = wire();
    lifecycle.acquire();

    const editor = createEditor();
    const drawn: string[] = [];
    render.mockImplementation(() => drawn.push(editor.text));

    for (const ch of [..."git push"]) {
      const before = render.mock.calls.length;
      editor.insert(ch);
      scheduler.commit("input");
      expect(
        render.mock.calls.length,
        `"${ch}" drew no frame before the next keystroke`,
      ).toBe(before + 1);
    }

    // And each frame saw the buffer as it was at that keystroke, in order. The
    // count alone passes for a scheduler that draws eight identical frames.
    expect(drawn).toEqual(["g", "gi", "git", "git ", "git p", "git pu", "git pus", "git push"]);
    expect(editor.text).toBe("git push");
  });

  it("T4.6 (with C17): a keystroke never queues behind a stream frame", () => {
    // The interleaving the deferral names: a stream committing on its 33 ms
    // window while someone types. `input` is immediate and `stream` is not
    // (§3), so every keystroke draws on the spot and the stream's pending frame
    // is what waits — not the other way round.
    const { scheduler, lifecycle, clock, render } = wire();
    lifecycle.acquire();

    const editor = createEditor();
    const reasons: string[] = [];
    render.mockImplementation(() => reasons.push(editor.text === "" ? "stream" : "input"));

    scheduler.commit("stream");
    expect(render, "a stream frame waits for its window").not.toHaveBeenCalled();

    // Typed inside the stream's window. Each draws immediately, and the stream's
    // frame has still not been drawn.
    for (const ch of [..."ls"]) {
      editor.insert(ch);
      scheduler.commit("input");
    }
    expect(reasons, "two keystrokes, two immediate frames").toEqual(["input", "input"]);

    // And the stream's pending frame is **absorbed** rather than drawn late.
    // I4's reason — the pending frame would draw the same state — so the
    // keystroke's frame carries the stream's content and the timer is
    // cancelled. Written this way because the first draft asserted a third
    // frame after the window and there is none: typing during a stream costs
    // the stream nothing and delays nobody.
    clock.advance(50);
    expect(
      render.mock.calls.length,
      "the keystroke's frame carried the stream's content; no late frame follows",
    ).toBe(2);
    expect(scheduler.pending).toBe(false);
  });
});
