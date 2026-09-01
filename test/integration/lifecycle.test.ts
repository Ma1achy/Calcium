// C01 tier 4 — integration. Real components, still no real terminal.
//
// C02 and C03 exist, so T4.1, T4.2, T4.3 and T4.7 run against real components.
// What remains names its blocker in a greppable form: `grep "waits on L4"`
// finds everything the shell landing would unblock. That is how C03's three
// were found the day it landed, and C21's nine the day the runner did — the
// grep is the manual half; `tools/enforce/todo-expiry.mjs` is the half that
// fails on its own.
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildGraph } from "../support/session.js";
import { wrappingDoc } from "../support/viewport.js";
import { detectCapabilities } from "../../src/terminal/capabilities.js";
import { createTerminalLifecycle, type TerminalLifecycle } from "../../src/terminal/lifecycle.js";
import { createFrameScheduler } from "../../src/terminal/frame-scheduler.js";
import type { FrameScheduler } from "../../src/terminal/frame-scheduler.js";
import { createProcessRunner } from "../../src/data/process/runner.js";
import { fakeStdin, fakeStdout, MODES } from "../support/fake-terminal.js";

const live: TerminalLifecycle[] = [];

/**
 * C01 and C03 wired the way L4 will wire them: the scheduler takes C01's
 * `acquired` getter as its live view and C01's `writer` as its `write`. Passing
 * `lifecycle` itself is what makes the view live — an object literal here would
 * capture `false` forever (C03 §2, C03 I12).
 */
function wireScheduler(env: Record<string, string> = { TERM: "xterm-256color" }): {
  scheduler: FrameScheduler;
  lifecycle: TerminalLifecycle;
  stdout: ReturnType<typeof fakeStdout>;
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

  const render = vi.fn();
  const repaint = vi.fn();
  const scheduler = createFrameScheduler({
    render,
    repaint,
    capabilities,
    lifecycle,
    write: (s: string): void => void lifecycle.writer.write(s),
    schedule: () => ({ [Symbol.dispose]: () => {} }),
  });

  return { scheduler, lifecycle, stdout, render, repaint };
}

afterEach(() => {
  for (const l of live.splice(0)) {
    try {
      l.release();
    } catch {
      // Already released.
    }
  }
});

describe("C01 integration", () => {
  it("T4.1 (with C02): a real record acquires nothing beyond what it supports", () => {
    // No fabricated capabilities anywhere in this test — the detector's own
    // output drives acquisition, which is the seam C02's tier 4 could not test
    // until C01 existed.
    const tmux = detectCapabilities({ TERM: "xterm-256color", TMUX: "/tmp/s" }).capabilities;
    expect(tmux.mouse).toBe(false);
    expect(tmux.bracketedPaste).toBe(true);

    const stdout = fakeStdout();
    const lifecycle = createTerminalLifecycle({
      stdout,
      stdin: fakeStdin(),
      capabilities: tmux,
      onFatal: ((err: unknown) => {
        throw err;
      }) as (err: unknown) => never,
    });
    live.push(lifecycle);

    lifecycle.acquire();
    lifecycle.release();

    // Mouse is off in the record, so no mouse byte in either direction (I10).
    for (const fragment of ["1002", "1006"]) {
      expect(stdout.output, fragment).not.toContain(fragment);
    }
    expect(stdout.output).toContain(MODES.pasteOn);
    expect(stdout.output).toContain(MODES.altScreenOn);
  });

  it("T4.1b (with C02): a TERM=dumb record is fatal before anything is emitted", () => {
    const dumb = detectCapabilities({ TERM: "dumb" }).capabilities;
    expect(dumb.altScreen).toBe(false);

    const stdout = fakeStdout();
    let fatal: unknown = null;
    const lifecycle = createTerminalLifecycle({
      stdout,
      stdin: fakeStdin(),
      capabilities: dumb,
      onFatal: ((err: unknown) => {
        fatal = err;
        throw err;
      }) as (err: unknown) => never,
    });
    live.push(lifecycle);

    expect(() => lifecycle.acquire()).toThrow();
    expect(fatal).toBeInstanceOf(Error);
    expect(stdout.chunks).toEqual([]);
  });

  it("T4.2 (with C03): the shell's resume() → invalidate() makes the next commit a repaint", () => {
    const { scheduler, lifecycle, render, repaint } = wireScheduler();
    lifecycle.acquire();
    scheduler.commit("input");
    expect(render).toHaveBeenCalledTimes(1);

    lifecycle.suspend();
    lifecycle.resume();
    // C01 sets no flag — it has no contamination concept (A01 D53, §2
    // commitment 7). The shell is what joins the two.
    expect(Object.hasOwn(lifecycle, "contaminated")).toBe(false);
    scheduler.invalidate();

    scheduler.commit("input");
    expect(repaint).toHaveBeenCalledTimes(1);
  });

  it("T4.3 (with C03): C03 never writes while `acquired` is false", () => {
    const { scheduler, lifecycle, stdout, render } = wireScheduler();

    // Asserted from C01's side of the boundary: whatever C03 decides, no frame
    // byte reaches the stream unless C01 says it is safe (C03 I1, C03 T6.6).
    for (const phase of ["constructed", "suspended", "released"] as const) {
      if (phase === "suspended") {
        lifecycle.acquire();
        lifecycle.suspend();
      }
      if (phase === "released") {
        lifecycle.resume();
        lifecycle.release();
      }
      expect(lifecycle.acquired, phase).toBe(false);

      const before = stdout.chunks.length;
      const drawn = render.mock.calls.length;
      scheduler.commit("input");
      scheduler.commit("resize");
      expect(stdout.chunks.length, phase).toBe(before);
      expect(render.mock.calls.length, phase).toBe(drawn);
    }
  });
  it("T4.4 (with C21): the child gets an un-raw stdin on the primary screen", async () => {
    // A02 Seam 4's TTY row from C01's side. C21 T4.5 asserts the *order* of the
    // four calls through C23; what this asserts is the terminal state at the
    // moment the child starts, which is the half a call-order spy cannot see.
    const stdout = fakeStdout();
    const stdin = fakeStdin();
    const lifecycle = createTerminalLifecycle({
      stdout,
      stdin,
      capabilities: detectCapabilities({ TERM: "xterm-256color" }).capabilities,
      onFatal: ((err: unknown) => {
        throw err;
      }) as (err: unknown) => never,
    });
    live.push(lifecycle);
    const runner = createProcessRunner({ env: process.env, stdin });

    lifecycle.acquire();
    expect(stdin.rawModeCalls.at(-1), "acquired means raw").toBe(true);
    expect(stdout.output).toContain(MODES.altScreenOn);

    lifecycle.suspend();

    // **The two things a child expects, and the ones C21 cannot check.** C21 §5
    // probes `stdin.isRaw` and throws if the caller skipped `suspend()`; it
    // cannot import C01, so it cannot see the screen at all.
    expect(stdin.rawModeCalls.at(-1), "a child that expects a cooked terminal").toBe(false);
    expect(stdout.output.endsWith(MODES.altScreenOff), "on the primary screen").toBe(true);

    // And the guard does not fire on this path, which is the negative half of
    // C21 T3.8 — `handoff` resolving is the proof, since the guard rejects.
    const exit = await runner.handoff(["true"], { cwd: () => process.cwd() });
    expect(exit.code, "the child ran rather than being refused").toBe(0);

    lifecycle.resume();
    expect(stdin.rawModeCalls.at(-1), "and the terminal comes back raw").toBe(true);
    expect(stdout.output).toContain(MODES.altScreenOn);
  });
  it("T4.5 (with C22): handlers, then acquire, then paint — asserted as a sequence", async () => {
    // A02 §3's 6 → 7 → 8, which is C22 §3's step 7 → acquire → first commit.
    // **Asserted as an order, not as three facts**: each step happening is true
    // under any permutation, and the invariant is about the sequence (A03 §2's
    // ordered-structure class).
    //
    // 6 before 7 closes the window where terminal state is held with nothing
    // registered to release it; 6 before 8 means a crash during first paint
    // still restores.
    const { graph, stdout, renders } = await buildGraph();

    // 6 — the lifecycle exists, so its handlers are registered (C01 I3) …
    expect(graph.log).toContain("lifecycle");
    // … and 7 has not happened: nothing acquired, no byte, no frame.
    expect([graph.lifecycle.acquired, stdout.output, renders()]).toEqual([false, "", 0]);

    graph.lifecycle.acquire();
    expect(stdout.output, "7 — the alternate screen").toContain(MODES.altScreenOn);

    graph.scheduler.commit("input");
    expect(renders(), "8 — and only now a frame").toBeGreaterThan(0);
  });

  it("T4.6 (with C22, C14): a SIGWINCH snapshot reaches the viewport", async () => {
    // C01 states a fact and the shell decides what it means (A01 D53). The
    // snapshot is coherent per signal (I12) and **C22 is what carries it across
    // the layer** — C14 never reads a dimension and C01 never knows a viewport
    // exists.
    // **Both dimensions travel by the frame now, and this row's claim inverted**
    // (C22 I34, C03 I15). It used to read *width reaches C14 from the signal,
    // height from the composed frame* — two routes, one observable here. The
    // resize handler's `viewport.resize` was the width's route and it was a
    // second writer of a quantity `render-frame.ts` already sets, whose only
    // effect was to re-measure the whole transcript per `SIGWINCH` instead of
    // per frame: **544 ms for a 30-event drag at a thousand entries** (F423).
    //
    // So the row now asserts the **single-owner property**: with no frame
    // composed, nothing reaches the viewport at all. That is not a weaker
    // assertion — it is the one that fails if a second writer is ever added
    // back, which is the defect this replaces. This harness stubs `render` with
    // a counter (`test/support/session.ts`), so no frame is ever composed, which
    // is exactly what makes the property observable here.
    //
    // **The positive case is where a frame exists**: `session.test.ts`'s T4.12
    // (C22 I34, with C14) drives a real session, and C04 T5.2 a real PTY resize.
    // Named rather than left, because a row that quietly stopped covering its
    // claim reads exactly like one that still does.
    const { graph, resize } = await buildGraph({}, { columns: 200, rows: 30 });
    // **`wrappingDoc`, not `rowsDoc`** — and the support file says why: a `raw`
    // block measures one row at every width, so a resize assertion built on one
    // passes without exercising anything. Written with `rowsDoc` first, and it
    // reported an unchanged height at columns 6, which is the fixture agreeing
    // with a broken product and a working one alike.
    for (let i = 0; i < 6; i += 1) graph.transcript.append(wrappingDoc(`e${i}`));
    graph.lifecycle.acquire();

    const wide = graph.viewport.scroll.totalRows;
    resize({ columns: 20, rows: 30 });

    // C14 drops the whole cache on a width change (C14 I8), so a re-measure is
    // the observable — and it does not happen, because nothing composed a frame.
    // **One writer of the viewport's size, and it is the frame.**
    expect(
      graph.viewport.scroll.totalRows,
      "no frame composed, so no second writer pushed the width",
    ).toBe(wide);
  });
  it("T4.7 (with C03): SIGCONT fires onResume, the shell invalidates, the next commit repaints", () => {
    const { scheduler, lifecycle, render, repaint } = wireScheduler();
    lifecycle.acquire();
    scheduler.commit("input");

    // The A01 D53 channel, wired the way L4 will wire it: C01 states a fact,
    // L4 decides what it means. Still an integration of two components — what
    // waits on the shell is the composition, not this seam.
    lifecycle.onResume(() => scheduler.invalidate());

    process.emit("SIGCONT");

    expect(lifecycle.acquired).toBe(true);
    expect(scheduler.contaminated).toBe(true);

    scheduler.commit("input");
    expect(repaint).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(1);
  });
});
