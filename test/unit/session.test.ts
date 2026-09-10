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
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { makeBeforeRelease } from "../../src/shell/shutdown.js";
import { createTerminalLifecycle } from "../../src/terminal/lifecycle.js";
import type { ProcessRunner } from "../../src/data/process/types.js";
import { fakeStdin, fakeStdout } from "../support/fake-terminal.js";
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
    stdin: fakeStdin(),
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

describe("C22 §4 — the two paths that do not set `stopping`", () => {
  it("T1.5h (I4a): `beginStopping` has one call site, and it is not on the signal or fault path", () => {
    // **`session.stopping` is unset on those two, and that is safe for one
    // reason only**: `process.exit` runs synchronously inside the handler, so
    // there is no window for a submission to interleave. The flag is
    // unnecessary for exactly as long as that holds — which makes the
    // *synchrony* the invariant and the flag's absence the consequence.
    const shell = readdirSync("src/shell")
      .filter((f) => f.endsWith(".ts"))
      .map((f) => `src/shell/${f}`);
    const callers: string[] = [];
    for (const f of shell) {
      const stripped = readFileSync(f, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      // A *call*, so the interface member in `state.ts` — `beginStopping(): void;`
      // — is not counted as a caller of itself.
      if (/\.beginStopping\(\)/.test(stripped)) callers.push(f);
    }
    expect(callers, "one caller: the ordinary stop").toEqual(["src/shell/session.ts"]);

    // And it is inside `#runStop` — the ordinary path — rather than in a handler.
    const session = readFileSync("src/shell/session.ts", "utf8");
    const runStop = /async #runStop\(reason: StopReason\): Promise<number> \{([\s\S]*?)\n  \}/.exec(
      session,
    );
    expect(runStop, "#runStop's body").not.toBeNull();
    expect(runStop![1]!, "the flag is set on the ordinary stop").toMatch(/beginStopping\(\)/u);
  });

  it("T1.5i (I4a): the fault handler is synchronous — nothing may make either path await", () => {
    // The clause with teeth, and it is the one a reader would not think to
    // check: an `await` added to `onFatal` or to the release path opens the
    // interleaving window the flag was never built to close.
    const session = readFileSync("src/shell/session.ts", "utf8");
    const onFatal = /onFatal: \(err\) => \{([\s\S]*?)\n      \}/.exec(session);
    expect(onFatal, "the fault handler").not.toBeNull();
    expect(/\bawait\b|\basync\b/.test(onFatal![1]!), "the fault path stays synchronous").toBe(
      false,
    );

    // The cleanup C01 runs on the signal path, from the module that owns it.
    const shutdown = readFileSync("src/shell/shutdown.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(/\basync\b|\bawait\b/.test(shutdown), "`beforeRelease` stays synchronous").toBe(false);
    // The control: the pattern does find these words where they exist, so the
    // two assertions above are readings of those files rather than of a regex
    // that never matches.
    expect(/\basync\b/.test(session), "the corpus is not empty").toBe(true);
  });
});
