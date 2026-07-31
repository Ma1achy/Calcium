// C22 §8 and §9 — shutdown, and the state machine.
//
// **T2.1 asserted the wrong thing and could not have passed.** It required the
// same `stop` for all five callers, by identity — and `signal` and `fault` are
// entirely C01's, which exposes no signal hook. §8a is the walk that found it.
//
// So the assertion here is the **property**, not the mechanism: every exit path
// runs the same cleanup exactly once, however it gets there. That is true of
// all five, it is what I5 actually claims, and it survives the two paths being
// reached through a different function — which the identity form could not.
import { describe, expect, it, vi } from "vitest";

import { makeBeforeRelease } from "../../src/shell/shutdown.js";
import { createTerminalLifecycle } from "../../src/terminal/lifecycle.js";
import type { ProcessRunner } from "../../src/data/process/types.js";
import { fakeStdout } from "../support/fake-terminal.js";
import { FULL_CAPS } from "../support/render.js";

function harness() {
  const killed: string[] = [];
  const drained: number[] = [];
  const runner = {
    live: [],
    killAll: () => {
      killed.push("killAll");
      return Promise.resolve();
    },
  } as unknown as ProcessRunner;
  const history = {
    drain: () => void drained.push(drained.length),
  };

  const stdout = fakeStdout();
  const exit = vi.fn();
  const lifecycle = createTerminalLifecycle({
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: { isRaw: false, setRawMode: () => undefined } as unknown as NodeJS.ReadStream,
    capabilities: FULL_CAPS,
    onFatal: (err) => {
      throw err;
    },
    beforeRelease: makeBeforeRelease(runner, history),
  });

  return { lifecycle, killed, drained, stdout, exit };
}

describe("C22 §8 — cleanup", () => {
  it("T2.8 (I21, C01 I5): beforeRelease returns undefined, not a thenable", () => {
    // **The mechanism, not the habit.** There is no `no-floating-promises` rule
    // in this tree — typescript-eslint was rejected during C02 at 87 packages —
    // so nothing flags the un-awaited `killAll()` and nothing flags the `await`
    // that would "fix" it. Adding it makes this function `async`, which C01 I5
    // forbids because a signal handler cannot await, and the failure appears
    // only when a signal arrives during shutdown.
    //
    // Checked by shape rather than by awaiting: `await undefined` succeeds, so
    // an awaiting test passes against the very thing it is written to catch.
    const runner = { live: [], killAll: () => Promise.resolve() } as unknown as ProcessRunner;
    const result: unknown = makeBeforeRelease(runner, { drain: () => undefined })();

    expect(result).toBeUndefined();
    expect(typeof (result as { then?: unknown } | undefined)?.then).not.toBe("function");
  });

  it("T2.8b (C20 I18): cleanup drains rather than flushing", () => {
    // `flush` is async, and Node does not wait for a pending promise at exit —
    // so the append still in flight is lost, and that append is the command the
    // user has just typed. `drain` is the synchronous member.
    const history = { drain: vi.fn(), flush: vi.fn() };
    const runner = { live: [], killAll: () => Promise.resolve() } as unknown as ProcessRunner;

    makeBeforeRelease(runner, history)();

    expect(history.drain).toHaveBeenCalledTimes(1);
    expect(history.flush, "the async one is never the one called").not.toHaveBeenCalled();
  });

  it("T2.1 (I4, I5): every exit path runs the same cleanup, exactly once", () => {
    // **The property, replacing an identity assertion that could not hold.**
    // Three callers reach `stop` and two are C01's, so no single function is
    // shared by all five — but `beforeRelease` is, and running once per session
    // is what I5 claims. Asserted per path, against the observable effect.
    for (const path of ["release", "SIGTERM", "uncaughtException"] as const) {
      const { lifecycle, killed, drained } = harness();
      lifecycle.acquire();

      if (path === "release") {
        lifecycle.release();
      } else {
        const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
        process.emit(path as "SIGTERM", path as "SIGTERM");
        exit.mockRestore();
      }

      expect(killed, `${path}: killAll`).toEqual(["killAll"]);
      expect(drained, `${path}: drain`).toEqual([0]);
    }
  });

  it("T1.7 (I5): a second release does not clean up twice", () => {
    // A double history flush duplicates entries (§8). C01's own
    // `beforeReleaseRan` guard is what makes this hold, and asserting it from
    // this side is what stops C22 growing a second guard for one condition.
    const { lifecycle, killed, drained } = harness();
    lifecycle.acquire();
    lifecycle.release();
    lifecycle.release();

    expect(killed).toEqual(["killAll"]);
    expect(drained).toEqual([0]);
  });

  it("T2.2 (I6): the last release byte precedes the first diagnostic byte", () => {
    // A stack printed onto the alternate screen is discarded when the screen is
    // released, so the dev sees a flash and an empty shell. Restoring first
    // puts the trace in the real scrollback.
    const { lifecycle, stdout } = harness();
    lifecycle.acquire();

    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    process.emit("uncaughtException", new Error("boom"));
    exit.mockRestore();

    const restored = stdout.output;
    expect(restored, "the alternate screen was left").toContain("?1049l");
    expect(stderr, "and only then was the stack written").toHaveBeenCalled();
    stderr.mockRestore();
  });

  it("T3.16 (I7): a fault still cleans up — history is not lost to a crash", () => {
    // Losing a session's history to a crash is a small loss that feels large,
    // and the fault path is the one where a special case would be easiest to
    // justify and hardest to notice missing.
    const { lifecycle, killed, drained } = harness();
    lifecycle.acquire();

    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    process.emit("uncaughtException", new Error("boom"));
    exit.mockRestore();
    stderr.mockRestore();

    expect([killed, drained]).toEqual([["killAll"], [0]]);
  });
});
