/**
 * C22 §8 — cleanup, and the four steps three of the five callers run.
 *
 * **`beforeRelease` is the function all five share, and `stop` is not** (I4).
 * `signal` and `fault` are entirely C01's: `signalExit` and `fault` call
 * `releaseInternal` — which runs this once, guarded by C01's own
 * `beforeReleaseRan` — write diagnostics and `process.exit`. C01 exposes no
 * signal hook, so `stop`'s four steps cannot run there, and an earlier I4
 * saying "one function, five callers" named neither.
 *
 * That is also why `session.stopping` is unset on those two paths (I4a). It is
 * safe for exactly one reason: `process.exit` runs synchronously inside the
 * handler, so no submission can interleave between the release and the exit.
 * Make either path asynchronous and the reason goes without the flag noticing.
 */

import type { ProcessRunner } from "../data/process/types.js";

/** The half of C20 that cleanup needs. Narrow, so a later edit cannot widen it. */
export type Drainable = Readonly<{ drain: () => void }>;

/**
 * §8's steps a and b, as one synchronous function (I21, C01 I5).
 *
 * Both calls are cases where the synchronous-looking option is the wrong one,
 * and both are load-bearing in a way review does not catch.
 */
export function makeBeforeRelease(
  runner: ProcessRunner,
  history: Drainable,
  /**
   * Anything else holding unconfirmed writes — the transcript writer, once
   * a verb declares persistence (C13 I20). **A list rather than a second
   * named parameter**, because the argument for (b) below is about the
   * *kind* — a pending promise is not waited for at exit — and it is the
   * same argument for every writer this session ever gains.
   */
  also: readonly Drainable[] = [],
): () => void {
  return () => {
    // (a) `killAll()` returns a Promise and is **deliberately not awaited**.
    //
    // It delivers every SIGKILL in a synchronous loop and awaits only the
    // reaping (C21 §killAll), so by the time it returns its promise every live
    // child has been signalled — which is the part that must happen before the
    // terminal is released. What is abandoned is a wait for exit statuses
    // nothing here reads.
    //
    // **Do not add `await`.** It would make this function `async`, and C01 I5
    // requires it synchronous because a signal handler cannot await. There is
    // no `no-floating-promises` rule in this tree — typescript-eslint was
    // rejected during C02 at 87 packages — so nothing flags the promise and
    // nothing flags the fix; the failure appears only when a signal arrives
    // during shutdown. T2.8 asserts this function returns `undefined` and not a
    // thenable, and T6.14 names this edit.
    void runner.killAll();

    // (b) `drain()`, not `flush()`. `flush` is async (C20 §2, I18), and Node
    // does not wait for a pending promise at exit — so the append still in
    // flight is lost, and that append is the command the user has just typed.
    // `drain` is the synchronous member `FileSystem.appendFileSync` exists for.
    history.drain();
    for (const d of also) d.drain();
  };
}
