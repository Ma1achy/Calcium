/**
 * Routes, action dispatch, time-driven updates, orchestration.
 *
 * C23 — see spec.
 *
 * **The discipline is narrow and absolute: every submission produces exactly one
 * outcome, and no stage failure escapes** (C23 §1, C23 I1, C23 I2). A parse error, an adapter
 * throw, a spawn failure and a successful verb all end the same way — a document
 * appended and one frame committed. There is no path where the user submits
 * something and nothing visible happens.
 *
 * Three things in this file are load-bearing in a way that fails silently, and
 * each is a mutation the suite carries:
 *
 *   - **The guard is taken before the append and released by every exit** (I5,
 *     §8a A5). A stage failure that keeps it refuses every later submission for
 *     the life of the session, and nothing goes red — the session simply stops
 *     accepting input.
 *   - **The pending entry is appended before the transport is invoked** (C23 I3).
 *     Reversing it costs nothing visible in a test that waits for the result and
 *     makes every slow verb look like a dropped keystroke.
 *   - **`inFlight` reports the route, not a boolean** (C23 §8a A1). C16's Ctrl-C
 *     rungs 1 and 2 both read it, and a boolean collapses them.
 */

import { parse } from "../interaction/parser/index.js";
import type { ParseResult } from "../interaction/parser/index.js";
import { errorDoc, noticeDoc } from "./documents.js";
import type { Pipeline, PipelineDeps } from "./types.js";

/** Which foreground route holds the guard. `null` is idle (C23 §6). */
export type InFlight = "app" | "local" | "shell" | null;

/**
 * The state machine of §6, as one object.
 *
 * A `route` rather than a boolean and a separate kind: two fields would be two
 * things to keep in step, and the pair "running, but which" is the whole of what
 * C16 asks. One field cannot disagree with itself.
 */
class Guard {
  #route: InFlight = null;
  #verb: string | null = null;

  get route(): InFlight {
    return this.#route;
  }

  /** The verb holding it, for the refusal notice (C23 I5, C23 T1.6). */
  get verb(): string | null {
    return this.#verb;
  }

  take(route: Exclude<InFlight, null>, verb: string | null): void {
    this.#route = route;
    this.#verb = verb;
  }

  /**
   * **Every exit from `running` goes through here, including a stage failure**
   * (C23 §8a A5). C23 I1's second exception is about the entry, not a licence to keep
   * the guard.
   */
  release(): void {
    this.#route = null;
    this.#verb = null;
  }
}

export function createExecutionPipeline(deps: PipelineDeps): Pipeline {
  const guard = new Guard();
  let sealed = false;

  /**
   * §2's routes need C18's classification, and C18 needs the live session for
   * `$_` (`lastUuid`) and the manifest. Read per submission, never captured: a
   * `cd` between two verbs has to move the second one (C22 I12).
   */
  const classify = (line: string): ParseResult => {
    const manifest = deps.manifest.manifest;
    // Sealed at step 4, before input is accepted (C22 I3), so this is `null`
    // only if construction is broken. Answered rather than thrown: C23 I2 says no
    // stage failure escapes, and "the manifest is missing" is a stage failure
    // like any other.
    if (manifest === null) {
      return { kind: "error", error: { message: "no manifest is loaded", stage: "parse" } };
    }
    return parse(line, {
      manifest,
      binary: deps.binary,
      lastUuid: deps.session().lastUuid,
      policy: deps.commandPolicy,
    });
  };

  /**
   * The one place a document reaches the transcript, and the one place the
   * frame is committed for a submission (Seam 4's submit row).
   *
   * **`resetFocus` sits between the append and the commit** and the order is the
   * whole of C23 T4.7b: a reset issued before the append is undone by nothing,
   * and one issued after the commit paints a frame with focus in a block that
   * has just been frozen.
   */
  const appendAndCommit = (doc: Parameters<typeof deps.transcript.append>[0]): string | null => {
    try {
      const id = deps.transcript.append(doc);
      deps.resetFocus();
      deps.scheduler.commit("input");
      return id;
    } catch {
      // §5's one stage whose failure loses the outcome, and C23 I1's second
      // exception. The frame still commits; the guard is still released by the
      // caller's `finally`.
      deps.scheduler.commit("input");
      return null;
    }
  };

  /** I5's refusal. An ordinary append with `origin: "user"` — see C23 §8b B5. */
  const refuse = (line: string, reason: string): void => {
    appendAndCommit(
      noticeDoc(line, reason, "warn", { origin: "user" }),
    );
  };

  const submit = (line: string): void => {
    // **C23 I12 first, before anything else is read.** A submission after shutdown
    // begins must not append, and the check has to precede the guard so a
    // refusal during teardown does not take one it will never release.
    if (deps.session().stopping) return;

    const result = classify(line);

    // `empty` produces no entry and no commit (C23 I1's first exception, C23 §8b B5).
    // Checked before the guard so a blank Enter over a running verb is silent
    // rather than a refusal notice.
    if (result.kind === "empty") return;

    if (guard.route !== null) {
      // **Whole-line and unconditional** (C23 I5, C23 §8b B4). No part of a refused
      // submission takes effect, including a `builtin` that needs nothing C23
      // is holding: a refused line that silently moved the working directory is
      // a lie about what the tool did.
      refuse(line, `${guard.verb ?? "a command"} is still running`);
      return;
    }

    route(line, result);
  };

  /** §2 — seven kinds, seven paths. */
  const route = (line: string, result: ParseResult): void => {
    switch (result.kind) {
      case "empty":
        return;

      case "error":
        appendAndCommit(errorDoc(line, result.error, { origin: "user" }));
        return;

      default:
        // The remaining five routes land as they are built. Until then the
        // submission is answered rather than dropped — C23 I1 has no path that
        // produces nothing, and a silent `return` here would be one.
        appendAndCommit(
          noticeDoc(line, `\`${result.kind}\` is not wired yet`, "warn", { origin: "user" }),
        );
        return;
    }
  };

  return {
    submit,

    seal: () => {
      sealed = true;
    },
    get sealed() {
      return sealed;
    },

    get inFlight() {
      return guard.route;
    },

    cancel: () => {
      guard.release();
    },
  };
}
