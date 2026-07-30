// C01 tier 4 — integration. Real components, still no real terminal.
//
// C02 and C03 exist, so T4.1, T4.2, T4.3 and T4.7 run against real components.
// What remains names its blocker in a greppable form: `grep "waits on L4"`
// finds everything the shell landing would unblock. That is how C03's three
// were found the day it landed, and C21's nine the day the runner did — the
// grep is the manual half; `tools/enforce/todo-expiry.mjs` is the half that
// fails on its own.
import { afterEach, describe, expect, it, vi } from "vitest";
import { detectCapabilities } from "../../src/terminal/capabilities.js";
import { createTerminalLifecycle, type TerminalLifecycle } from "../../src/terminal/lifecycle.js";
import { createFrameScheduler } from "../../src/terminal/frame-scheduler.js";
import type { FrameScheduler } from "../../src/terminal/frame-scheduler.js";
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
  it.todo(
    "T4.4: the documented suspend → handoff → resume sequence runs in order, and the child receives an un-raw stdin on the primary screen — waits on L4",
  );
  it.todo(
    "T4.5: startup ordering — the composition root's steps 6, 7, 8 execute in that order, asserted by an event log — waits on C22",
  );
  it.todo(
    "T4.6: a SIGWINCH snapshot propagates to the viewport, which clamps scroll against it — waits on C22",
  );
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
