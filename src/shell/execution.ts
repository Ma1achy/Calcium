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
import type { Builtin, ParseResult } from "../interaction/parser/index.js";
import type { RawPatch } from "../data/transport/index.js";
import { block } from "../data/viewmodel/index.js";
import { blockId, compose, errorDoc, noticeDoc } from "./documents.js";
import { createActionDispatcher } from "./actions.js";
import {
  createLocalRegistry,
  reconcile,
  LocalRegistryError,
  type LocalHandler,
} from "./local/registry.js";
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

/** C06's default for a non-streaming verb. Streams pass 0, which is unbounded. */
const DEFAULT_TIMEOUT_MS = 30_000;

export function createExecutionPipeline(deps: PipelineDeps): Pipeline {
  const guard = new Guard();
  const local = createLocalRegistry();

  /**
   * What `cancel()` reaches, set for the length of one in-flight invocation.
   *
   * C23 §8a A1 — `runner.killAll()` kills a child and leaves the entry
   * streaming; cancellation has to settle the entry, so it goes through here.
   */
  let cancelInFlight: (() => void) | null = null;

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

  /** C23 I5's refusal. An ordinary append with `origin: "user"` — see C23 §8b B5. */
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

  /**
   * C18's built-ins, applied to session state (C23 I11).
   *
   * Returns a discriminated result rather than a document, because C23 T3.13
   * turns on the difference: a `cd` to a missing directory must **not** delegate
   * the remainder, so the caller needs to know which happened without parsing a
   * document to find out.
   */
  const applyBuiltin = (
    name: Builtin,
    args: readonly string[],
  ): { ok: true; text: string } | { ok: false; message: string } => {
    switch (name) {
      case "cd": {
        const target = args[0] ?? "~";
        // The value only. Resolution happens at spawn (C21 I10), which is what
        // lets a `cd` move the *next* verb rather than this one.
        deps.writes.setCwd(target);
        return { ok: true, text: target };
      }
      case "export": {
        const pair = args[0];
        const eq = pair === undefined ? -1 : pair.indexOf("=");
        if (pair === undefined || eq <= 0) {
          return { ok: false, message: `export: expected NAME=value, got \`${pair ?? ""}\`` };
        }
        deps.writes.setEnv(pair.slice(0, eq), pair.slice(eq + 1));
        return { ok: true, text: pair };
      }
      case "pwd":
        return { ok: true, text: deps.session().cwd };
    }
  };

  /** C23 §2's `shell` route — `spawnShell`, and a `raw` document (C18 §5). */
  const runShell = async (line: string, command: string): Promise<void> => {
    guard.take("shell", command.split(/\s+/)[0] ?? "shell");
    try {
      const child = deps.runner.spawnShell(command, { cwd: () => deps.session().cwd });
      let out = "";
      for await (const chunk of child.stdout) out += chunk;
      const exit = await child.exited;

      appendAndCommit(
        compose({
          command: line,
          status: exit.code === 0 ? "ok" : "error",
          blocks: [block({ kind: "raw", id: blockId("raw"), text: out })],
          meta: {
            origin: "user",
            exitCode: exit.code ?? 1,
            transport: "subprocess",
            argv: [command],
            truncated: child.overflowed,
          },
        }),
      );
    } catch (cause) {
      appendAndCommit(
        errorDoc(line, { message: String(cause), stage: "spawn" }, { origin: "user" }),
      );
    } finally {
      // C23 §8a A5 — every exit releases it, this one included.
      guard.release();
    }
  };

  /** C23 §2's `local` route. §8b B3's missing-handler cell is closed by `seal()`. */
  const runLocal = async (line: string, verb: string, argv: readonly string[]): Promise<void> => {
    guard.take("local", verb);
    try {
      const handler = local.get(verb);
      if (handler === undefined) {
        // Unreachable once `seal()` has run (C23 I27), and answered rather than
        // thrown because C23 I2 admits no escaping failure — including one the
        // reconciliation was supposed to have made impossible.
        appendAndCommit(
          errorDoc(
            line,
            { message: `no handler is registered for \`${verb}\``, stage: "local" },
            { origin: "user" },
          ),
        );
        return;
      }
      const doc = await handler(argv, { command: line });
      appendAndCommit(doc);
      // C23 I7 — declared, never inferred. A verb declaring none leaves `$_` alone.
      if (doc.meta.resultId !== undefined) deps.writes.setLastUuid(doc.meta.resultId);
    } catch (cause) {
      appendAndCommit(
        errorDoc(
          line,
          { message: `\`${verb}\` failed: ${String(cause)}`, stage: "local" },
          { origin: "user" },
        ),
      );
    } finally {
      guard.release();
    }
  };

  /**
   * C23 §3 — the eight steps, and the ordering that fails silently.
   *
   * **Step 3 before step 4** (C23 I3). The pending entry reaches the transcript
   * before the transport is invoked, so a verb whose interpreter takes three
   * hundred milliseconds to start reads as a command that was accepted rather
   * than a keystroke that was dropped. A test that waits for the result passes
   * either way, which is why C23 T1.4 asserts the call order on a spy.
   *
   * **Validation is read, never recomputed** (C23 I4, §8b B2). C18 ran it and
   * the answer travels on the `ParseResult`. Reading it is not recomputing it —
   * §2 routes by *shape*, so an `app` result arrives here whatever its validation
   * says, and the check has to happen or an invalid command is spawned.
   */
  const runApp = async (
    line: string,
    result: Extract<ParseResult, { kind: "app" }>,
  ): Promise<void> => {
    const verb = result.tool.name;

    // Step 1 — the carried result. C23 §8b B2 is the cell where §2's route table
    // and §5's containment row named different destinations for one value.
    if (!result.validation.ok) {
      appendAndCommit(
        errorDoc(line, result.validation.errors[0] ?? { message: `${verb}: invalid arguments` }, {
          origin: "user",
          verb,
        }),
      );
      return;
    }

    // Step 2 — the guard, before the pending entry, so a refusal leaves no
    // orphan (C23 §3, T3.17).
    guard.take("app", verb);

    // Step 3 — the pending entry. Before step 4. This is the ordering.
    const pendingId = deps.transcript.append(
      compose({
        command: line,
        blocks: [],
        meta: { origin: "user", verb, transport: "subprocess", argv: [...result.argv] },
      }),
      { streaming: true },
    );
    deps.resetFocus();
    deps.scheduler.commit("input");

    const controller = new AbortController();
    cancelInFlight = () => {
      controller.abort();
      deps.transcript.settle(pendingId);
      deps.scheduler.commit("completion");
    };

    try {
      const transport = deps.transport.for(verb);
      // `ToolDef.streams` is optional and `Invocation.streams` is not; absent
      // means a single document, which is the safe direction — a verb wrongly
      // streamed would hold a subscription nothing ends.
      const streams = result.tool.streams ?? false;
      const invocation = {
        verb,
        argv: result.argv,
        streams,
        // 0 is unbounded, which is what a live view needs (C06 commitment 7).
        timeoutMs: streams ? 0 : DEFAULT_TIMEOUT_MS,
        signal: controller.signal,
      };

      if (streams) {
        // C23 I6 — a subscription does not hold the guard. Released before the
        // loop rather than after it, or one `--watch` blocks the session.
        guard.release();
        await streamInto(pendingId, line, verb, transport.stream(invocation));
        return;
      }

      // Steps 4 and 5 — invoke, then adapt.
      const raw = await transport.invoke(invocation);
      const doc = deps.adapters.adapt(raw, {
        command: line,
        verb,
        width: deps.lifecycle.size().columns,
        userRequestedJson: result.argv.includes("--json"),
        transport: "subprocess",
        origin: "user",
        tool: result.tool,
      });

      // **Steps 6 and 7, which are one call on this route** (C23 §3, C13
      // §settle). The document arrives, the entry becomes it, the entry is done
      // — and `meta` travels with it, which is what C23 I7 and `/debug` need and
      // what no block-level patch could carry.
      deps.transcript.settle(pendingId, doc);

      // C23 I7 — declared, never inferred. A verb declaring none leaves `$_`
      // alone, so `/promote $_` after a listing still names the submit before it.
      if (doc.meta.resultId !== undefined) deps.writes.setLastUuid(doc.meta.resultId);

      // Step 8.
      deps.scheduler.commit("completion");
    } catch (cause) {
      // C23 I2 — a transport that fails, times out or throws ends in a document
      // like everything else.
      deps.transcript.settle(
        pendingId,
        errorDoc(line, { message: String(cause), stage: "transport" }, { origin: "user", verb }),
      );
      deps.scheduler.commit("completion");
    } finally {
      cancelInFlight = null;
      guard.release();
    }
  };

  /**
   * Streaming (C23 §3, I8, I9), and where §8a A2 and A3 are decided.
   *
   * **The three `PatchOutcome` arms are not one case**, and that is the whole
   * reason C04 returns a `PatchResult` rather than throwing. A throw would unwind
   * out of this loop with no way to tell a malformed patch from a dead transport,
   * and the two want opposite endings: settle with what was kept, or map the
   * failure through C07. C23 is the first consumer of that shape.
   */
  const streamInto = async (
    id: string,
    line: string,
    verb: string,
    patches: AsyncIterable<RawPatch>,
  ): Promise<void> => {
    try {
      for await (const patch of patches) {
        if (patch.kind === "end") {
          // C23 I8 — settlement flushes at `"completion"`.
          deps.transcript.settle(id);
          deps.scheduler.commit("completion");
          return;
        }

        const view = deps.adapters.adaptPatch(patch, {
          command: line,
          verb,
          width: deps.lifecycle.size().columns,
          userRequestedJson: false,
          transport: "subprocess",
          origin: "user",
          tool: null,
          seq: 0,
        });
        if (view === null) continue;

        const outcome = deps.transcript.patch(id, view);
        if (outcome.ok) {
          // C23 I8 — patches coalesce at `"stream"`. C23 I9: a frozen entry keeps
          // receiving them, which is C13's business and not a condition here.
          deps.scheduler.commit("stream");
          continue;
        }

        // **§8a A2 — three arms, one of which carries an error.**
        if (outcome.reason === "patch") {
          // Malformed. Settle with what was kept, say why, and stop the child:
          // the entry is final, so a subprocess still streaming into it spends a
          // process on output nothing can consume (§8a A3).
          deps.transcript.patch(id, {
            op: "append",
            block: block({
              kind: "notice",
              id: blockId("truncated"),
              tone: "warn",
              // C04 I6 — a toned notice carries a glyph, or `block()` throws and
              // the containment path produces no entry at all.
              glyph: "warn",
              text: `output truncated: ${outcome.error.message}`,
            }),
          });
          deps.transcript.settle(id);
          deps.scheduler.commit("completion");
          return;
        }

        // `"settled"` and `"unknown"` — already final, and a notice would
        // describe the transcript rather than the command. This is the arm §5
        // used to read `.error` off.
        return;
      }
    } catch (cause) {
      deps.transcript.patch(id, {
        op: "append",
        block: block({
          kind: "notice",
          id: blockId("stream-error"),
          tone: "error",
          glyph: "error",
          text: `stream failed: ${String(cause)}`,
        }),
      });
      deps.transcript.settle(id);
      deps.scheduler.commit("completion");
    }
  };

  /**
   * Starts a route and guarantees its failure is still an outcome.
   *
   * **`void runX(...)` loses a throw that happens before the route's own `try`.**
   * An async function that rejects with nobody awaiting is an unhandled
   * rejection: no entry, no commit, no error — and C23 I1 violated in the one way
   * nothing reports. The window is small and real, and it is exactly where the
   * glyph defect lived: `errorDoc` threw at *construction*, inside `runApp` and
   * ahead of its `try`, so every containment path produced nothing at all.
   *
   * The guard is released here too, because a route that fails before its own
   * `finally` never reaches one (C23 §8a A5).
   */
  const start = (line: string, run: Promise<void>): void => {
    void run.catch((cause: unknown) => {
      guard.release();
      try {
        appendAndCommit(
          errorDoc(line, { message: String(cause), stage: "pipeline" }, { origin: "user" }),
        );
      } catch {
        // The document itself is unbuildable. C23 §5's one stage whose failure
        // loses the outcome, reached from the one direction §5 did not name.
        deps.scheduler.commit("input");
      }
    });
  };

  /**
   * C23 §2 — seven kinds, seven paths, and `empty` is not one of the six here.
   *
   * **The type excludes it rather than a second `case` restating it.** `submit`
   * must return on `empty` *before* the guard, so a blank Enter over a running
   * verb is silent rather than a refusal — and an `empty` arm here as well is
   * unreachable. The mutation pass is what showed it: removing either check
   * failed nothing, because each defeated the other's mutation, and no test
   * could distinguish two guards from one.
   *
   * `Exclude` turns that into a compile error instead. The exhaustiveness T2.6
   * asserts is now over six reachable arms rather than seven with one that can
   * never run — a dead branch being A03 §2's class in code rather than in a rule.
   */
  const route = (line: string, result: Exclude<ParseResult, { kind: "empty" }>): void => {
    switch (result.kind) {
      case "error":
        appendAndCommit(errorDoc(line, result.error, { origin: "user" }));
        return;

      case "builtin": {
        const applied = applyBuiltin(result.name, result.args);
        appendAndCommit(
          applied.ok
            ? noticeDoc(line, `${result.name} ${applied.text}`, "muted", { origin: "user" })
            : errorDoc(line, { message: applied.message }, { origin: "user" }),
        );
        return;
      }

      case "builtinThenShell": {
        // **C23 I11 — the built-in applies before any delegation**, and C23 T3.13
        // is the other half: one that fails does not delegate.
        const applied = applyBuiltin(result.name, result.args);
        if (!applied.ok) {
          appendAndCommit(errorDoc(line, { message: applied.message }, { origin: "user" }));
          return;
        }
        start(line, runShell(line, result.rest));
        return;
      }

      case "shell":
        start(line, runShell(line, result.command));
        return;

      case "local":
        start(line, runLocal(line, result.tool.name, result.argv));
        return;

      case "app":
        start(line, runApp(line, result));
        return;
    }
  };

  /**
   * C23 I16 — C23 supplies `onAction` and nothing else may.
   *
   * Built after `submit` because `exec` re-enters it: an action is a submission
   * by another route, and giving it a shortcut past the guard would make one
   * kind of submission exempt from the rule every other kind obeys.
   */
  const onAction = createActionDispatcher({
    transcript: deps.transcript,
    editor: deps.editor,
    scheduler: deps.scheduler,
    openUrl: deps.openUrl,
    submit: (l) => void submit(l),
    notify: (text) => void appendAndCommit(noticeDoc("", text, "warn", { origin: "action" })),
  });

  return {
    submit,
    onAction,

    /**
     * C22 I3's fourth seal (§3a step 10), and C23 I27's reconciliation.
     *
     * Construction fails on a mismatch in either direction, because startup is
     * where the answer is cheap: after it, the same mistake is a verb that
     * classifies and has nothing to run.
     */
    seal: () => {
      local.seal();
      const manifest = deps.manifest.manifest;
      if (manifest !== null) {
        const reasons = reconcile(local, manifest);
        if (reasons.length > 0) throw new LocalRegistryError(reasons);
      }
    },
    get sealed() {
      return local.sealed;
    },

    /** Where `tui-kit`'s own handlers and the app's arrive, before `seal()`. */
    register: (verb: string, handler: LocalHandler) => void local.register(verb, handler),

    get inFlight() {
      return guard.route;
    },

    cancel: () => {
      // The in-flight invocation first, so the entry settles with what it had
      // (C23 I10), then the guard.
      cancelInFlight?.();
      guard.release();
    },
  };
}
