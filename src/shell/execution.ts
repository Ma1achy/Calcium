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
import type { Exit } from "../data/process/types.js";
import { block } from "../data/viewmodel/index.js";
import type { Block, ViewDocument } from "../data/viewmodel/index.js";
import { blockId, compose, errorDoc, noticeDoc } from "./documents.js";
import { createActionDispatcher } from "./actions.js";
import { createRefreshDriver } from "./refresh.js";
import { DOCUMENT_VIEW_ID } from "./document-view.js";
import { isViewInvocation } from "../data/manifest/index.js";
import { liveDeclarations } from "./builders/live.js";
import type { LiveSpec } from "./builders/types.js";
import { shippedHandlers } from "./local/handlers.js";
import {
  createLocalRegistry,
  reconcile,
  LocalRegistryError,
  type LocalHandler,
} from "./local/registry.js";
import type { Pipeline, PipelineDeps } from "./types.js";
import type { EntryId } from "../viewport/transcript/index.js";

/** Which foreground route holds the guard. `null` is idle (C23 §6). */
export type InFlight = "app" | "local" | "shell" | null;

/**
 * The first word of a delegated line, for the refusal notice and the handoff's
 * label (C23 I5).
 *
 * Naming what the user will recognise rather than the whole line: `vim` reads
 * better than `vim -c 'set nu' notes.md` in *`vim` is still running*. It is not
 * a parse — C18 owns that — and it does not need to be, because nothing branches
 * on the answer.
 */
const headOf = (command: string): string => command.split(/\s+/u)[0] ?? "shell";

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

  // **Registered before the app's and before `seal()`** (C22 I3, C23 I27). The
  // six are rows in every manifest (C05 §3), which is what makes them reachable
  // — C18 classifies `local` from the manifest, so handlers without rows are
  // registered for verbs nothing can route to.
  //
  // From one map rather than six calls: the set is a fact about what the
  // framework owns, and a call site listing them is a second place the list
  // lives.
  for (const [verb, handler] of Object.entries(
    shippedHandlers({
      manifest: () => deps.manifest.manifest,
      transcript: deps.transcript,
      theme: deps.theme,
      ...(deps.persistTheme === undefined ? {} : { persistTheme: deps.persistTheme }),
      history: () => deps.history.entries,
      bindings: () => deps.bindings(),
      stop: deps.stop,
    }),
  )) {
    local.register(verb, handler);
  }

  /**
   * What `cancel()` reaches, set for the length of one in-flight invocation.
   *
   * C23 §8a A1 — `runner.killAll()` kills a child and leaves the entry
   * streaming; cancellation has to settle the entry, so it goes through here.
   */
  let cancelInFlight: (() => void) | null = null;

  /**
   * Live subscriptions, oldest first, so Ctrl-C can cancel the **newest**
   * (C16 §5's subscription rung).
   *
   * **A list rather than `cancelInFlight`**, and the difference is reachable:
   * a `streams: true` verb releases the guard (I6) precisely so another command
   * can be submitted over it, and the next submission overwrites that single
   * slot. One `--watch` was therefore cancellable and two were not — the older
   * one had no handle left anywhere in the process.
   *
   * Entries are removed by the same closure that cancels them, so a stream that
   * ended on its own does not leave a canceller for an entry that has settled.
   */
  const liveStreams: { id: string; cancel: () => void }[] = [];

  const forgetStream = (id: string): void => {
    const at = liveStreams.findIndex((s) => s.id === id);
    if (at !== -1) liveStreams.splice(at, 1);
  };

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
  const appendAndCommit = (
    doc: Parameters<typeof deps.transcript.append>[0],
    /** The line as typed, when this append settles a submission (I29). */
    line?: string,
  ): string | null => {
    try {
      const id = deps.transcript.append(doc);
      declareLive(id, doc.blocks);
      if (line !== undefined) recordHistory(line, doc);
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

  /**
   * I29 — the submitted line enters C20 at settlement, with the code it settled
   * with, on every terminal path including refusals and parse errors.
   *
   * **The line as typed, passed in — not `doc.command`.** The first version read
   * the document, which is right for five routes and wrong for the sixth: the
   * app route settles with the *adapter's* document, whose `command` is whatever
   * the far side put there. `/ps` recorded as `adapted`, and `↑` would have
   * recalled a string nobody typed. T1.21 caught it because it asserts the line
   * rather than that something was recorded.
   *
   * Passing it only where an append settles a submission also keeps the two
   * other things `appendAndCommit` appends out of history: an identity notice
   * and an action's outcome are not lines anybody typed.
   */
  const recordHistory = (line: string, doc: Parameters<typeof deps.transcript.append>[0]): void => {
    deps.history.append(line, doc.meta.exitCode ?? 0);
  };

  /** C23 I5's refusal. An ordinary append with `origin: "user"` — see C23 §8b B5. */
  const refuse = (line: string, reason: string): void => {
    appendAndCommit(noticeDoc(line, reason, "warn", { origin: "user" }), line);
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

    // **I28 — the prompt clears whatever becomes of the line**, and before the
    // route so every one of them starts from the same empty prompt. After
    // `empty`, which is not a submission: a blank Enter has nothing to clear.
    //
    // Restoring it on a refusal was the alternative and is worse — the notice
    // says what happened, and a line that sometimes stays is a prompt whose
    // contents depend on a decision taken after the keystroke.
    deps.editor.clear();

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
    guard.take("shell", headOf(command));
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
        line,
      );
    } catch (cause) {
      appendAndCommit(
        errorDoc(line, { message: String(cause), stage: "spawn" }, { origin: "user" }),
        line,
      );
    } finally {
      // C23 §8a A5 — every exit releases it, this one included.
      guard.release();
    }
  };

  /**
   * A02 Seam 4's `Child process needing a TTY` row — `lifecycle.suspend` →
   * `runner.handoff` → `lifecycle.resume` → `scheduler.invalidate` (C23 §4).
   *
   * **One implementation for both opt-ins.** The routes differ in who knows —
   * an app verb declares `interactive` on its `ToolDef` (C05 I19), a shell line
   * carries `/tty` (C18 §5a) — and by the time the flag has been read they are
   * the same four calls over a different argv. C23 reads the flag and never
   * parses the line (C23 §4).
   *
   * **The inner `finally` is C23 §8a A6.5 and it is the whole point of the
   * shape.** C21 §5 rejects `handoff()` when `stdin.isRaw` is still true — a
   * good guard, checking a precondition of *this* sequence from inside its
   * second step. Without the `finally`, the rejection unwinds out of a sequence
   * that has already suspended the terminal: `resume` never runs, and the
   * session sits on the primary screen with no frame, no prompt and no visible
   * error, because the diagnostics path writes to a screen that was released.
   *
   * `suspend()` is deliberately **outside** it. A `resume()` that was never
   * suspended throws in C01's own transition table ("nothing was suspended"),
   * so a `finally` wrapped around the suspend would turn one failure into two.
   *
   * And the append waits for the resume. `appendAndCommit` commits, and a
   * commit while suspended paints onto the child's screen.
   */
  const runHandoff = async (
    line: string,
    argv: readonly string[],
    label: string,
    kind: "shell" | "app",
  ): Promise<void> => {
    guard.take(kind, label);
    try {
      deps.lifecycle.suspend();
      let exit: Exit;
      try {
        exit = await deps.runner.handoff(argv, { cwd: () => deps.session().cwd });
      } finally {
        deps.lifecycle.resume();
        // **Between the resume and the repaint** (C22 I25). C01 re-attaches the
        // listener as part of `resume()`, and whatever the decoder was holding
        // belongs to a sequence the child interrupted — an `Esc` mid-window, a
        // paste mid-accumulation. Kept unreset, the first keystroke back
        // completes a sequence begun before the child started.
        deps.resetInput();
        // The row's fourth call. C01's `resume()` fires no resume subscribers —
        // only the SIGCONT path does — so the repaint is ours to ask for, and
        // the whole screen belonged to the child.
        deps.scheduler.invalidate();
      }

      // A notice rather than a `raw` block: the child wrote to the terminal
      // directly, so there is no output to carry. What the transcript can say
      // is that it ran and how it ended.
      const code = exit.code ?? 1;
      appendAndCommit(
        exit.signal !== null
          ? noticeDoc(line, `${label} ended on ${exit.signal}`, "warn", { origin: "user" }, "error")
          : code === 0
            ? noticeDoc(line, `${label} finished`, "muted", { origin: "user" })
            : noticeDoc(line, `${label} exited ${String(code)}`, "warn", { origin: "user" }, "error"),
        line,
      );
    } catch (cause) {
      appendAndCommit(
        errorDoc(line, { message: String(cause), stage: "handoff" }, { origin: "user" }),
        line,
      );
    } finally {
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
          line,
        );
        return;
      }
      const produced = await handler(argv, { command: line });
      // **C23 states the command, not the handler** (I15, C22 I33) — the same
      // argument as C07 I16 makes for `doc.command` on the adapter side, and the
      // same one I13 makes for `meta`: the framework knows what was submitted
      // and the handler does not need to say. Six handlers each named their own,
      // and `/theme light` said `/theme` — a displayed command that dropped its
      // argument, which nothing could see while nothing was displayed.
      const doc = { ...produced, command: line };
      appendAndCommit(doc, line);
      // A02 Seam 4's theme row: `theme.setVariant` → `scheduler.invalidate`.
      // C10 never invalidates; the sequence is L4's, which is the seam.
      if (verb === "theme") deps.scheduler.invalidate();
      // C23 I7 — declared, never inferred. A verb declaring none leaves `$_` alone.
      if (doc.meta.resultId !== undefined) deps.writes.setLastUuid(doc.meta.resultId);
    } catch (cause) {
      appendAndCommit(
        errorDoc(
          line,
          { message: `\`${verb}\` failed: ${String(cause)}`, stage: "local" },
          { origin: "user" },
        ),
        line,
      );
    } finally {
      guard.release();
    }
  };

  /**
   * Step 4 onward, for a verb whose result is a view (C22 §13a).
   *
   * The transcript is untouched throughout — that is the ruling, and it is why
   * `Esc` has nothing to do to a source entry and why C16 I2 preserves focus:
   * focus resets only on append, and nothing appends.
   *
   * A failure renders **into the view**, because the view is where the reader is
   * looking and the transcript has nothing to show them. History still records
   * the line: history is C20's store and not the transcript, and a view the
   * reader cannot reopen from `↑` would be a surface reachable exactly once.
   */
  const runIntoView = async (
    displayed: string,
    line: string,
    verb: string,
    result: Extract<ParseResult, { kind: "app" }>,
  ): Promise<void> => {
    const controller = new AbortController();
    try {
      const transport = deps.transport.for(verb);
      const streams = result.tool.streams ?? false;
      const raw = await transport.invoke({
        verb,
        argv: result.argv,
        streams,
        timeoutMs: streams ? 0 : DEFAULT_TIMEOUT_MS,
        signal: controller.signal,
      });
      const doc = deps.adapters.adapt(raw, {
        command: displayed,
        verb,
        width: deps.lifecycle.size().columns,
        userRequestedJson: result.argv.includes("--json"),
        transport: "subprocess",
        origin: "user",
        tool: result.tool,
      });
      if (!deps.documentView.fill(doc)) return;
      // **Declare-on-push, which had no call site until now** (C23 I33a, F20).
      // `declareLive` hard-coded an entry host because an entry was the only
      // host anything produced; this is the other arm of `RefreshHost`, reached
      // for the first time.
      declareLiveInView(doc.blocks);
      recordHistory(line, doc);
      if (doc.meta.resultId !== undefined) deps.writes.setLastUuid(doc.meta.resultId);
    } catch (cause) {
      // C23 I2 — a transport that fails, times out or throws ends in a document
      // like everything else. It just lands somewhere else.
      const failed = errorDoc(line, { message: String(cause), stage: "transport" }, {
        origin: "user",
        verb,
      });
      deps.documentView.fill(failed);
      recordHistory(line, failed);
    } finally {
      cancelInFlight = null;
      guard.release();
      deps.scheduler.commit("completion");
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
        line,
      );
      return;
    }

    // Step 2 — the guard, before the pending entry, so a refusal leaves no
    // orphan (C23 §3, T3.17).
    guard.take("app", verb);

    /**
     * **The tier, read here because after step 3 it is too late** (C22 I45,
     * C05 I20).
     *
     * C23 I3 appends the pending entry before the transport is invoked and C13
     * has no delete, so a decision taken on seeing the result could only produce
     * a view *and* the entry B03 §2 says a push does not leave. The declaration
     * is the only thing known this early, which is the whole of §13a's argument
     * for putting it on the manifest.
     */
    const asView = isViewInvocation(result.tool, result.validation.args);

    /**
     * **The displayed command: the user's line, with `$_` resolved** (I15,
     * C22 I33, D24).
     *
     * Not the raw text — a transcript showing `/ps --search=$_` cannot
     * correspond to the argv that was spawned, and `$_` means something else in
     * bash, so the line is not reproducible where D24 says it must be. And not
     * the spawned form either: no binary, no `--json`. C18 has already expanded
     * `argv`, so the displayed line is that argv wearing the prefix the user
     * typed, which is exactly D24's one-token mapping.
     */
    const displayed = `/${result.argv.join(" ")}`;

    /**
     * **Step 3, for a view: the layer takes the pending entry's place** (C22 I45).
     *
     * One for one and in the same slot — pushed before the transport, filled
     * after it — because step 3 exists so that something is on screen before the
     * work starts, and ruling the entry away without a replacement would make a
     * slow verb look like a hung terminal.
     *
     * A refusal here is the one case that falls back to appending: C15 I1
     * permits one view at a time, and a second `/ps --watch` while the first is
     * open has to say so somewhere the reader is looking. The transcript is that
     * somewhere, and this is the only path on which a view verb touches it.
     */
    if (asView) {
      const refusal = deps.documentView.open(displayed);
      if (refusal === null) {
        await runIntoView(displayed, line, verb, result);
        return;
      }
      appendAndCommit(errorDoc(line, { message: refusal }, { origin: "user", verb }), line);
      return;
    }

    // Step 3 — the pending entry. Before step 4. This is the ordering.
    const pendingId = deps.transcript.append(
      compose({
        command: displayed,
        blocks: [],
        meta: { origin: "user", verb, transport: "subprocess", argv: [...result.argv] },
      }),
      { streaming: true },
    );
    deps.resetFocus();
    deps.scheduler.commit("input");
    // §3b — from here the entry can go quiet, so it is watched for silence.
    refresh.watch(pendingId);

    const controller = new AbortController();
    const cancelThis = (): void => {
      forgetStream(pendingId);
      controller.abort();
      deps.transcript.settle(pendingId);
      // I29 — the streaming route settles here rather than through
      // `appendAndCommit`, so these are the settlements the funnel does not
      // reach. A cancellation is a settlement and carries its own code.
      deps.history.append(line, 130);
      deps.scheduler.commit("completion");
    };
    cancelInFlight = cancelThis;

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
        // **Registered before the loop is awaited**, because the loop does not
        // return until the stream ends: a registration after it would only ever
        // run for a subscription that had already finished.
        liveStreams.push({ id: pendingId, cancel: cancelThis });
        try {
          await streamInto(pendingId, displayed, verb, transport.stream(invocation));
        } finally {
          forgetStream(pendingId);
        }
        return;
      }

      // Steps 4 and 5 — invoke, then adapt.
      const raw = await transport.invoke(invocation);
      const doc = deps.adapters.adapt(raw, {
        command: displayed,
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
      refresh.settled(pendingId);
      settleWithDocument(pendingId, doc);
      recordHistory(line, doc); // I29 — the app route's settlement.

      // C23 I7 — declared, never inferred. A verb declaring none leaves `$_`
      // alone, so `/promote $_` after a listing still names the submit before it.
      if (doc.meta.resultId !== undefined) deps.writes.setLastUuid(doc.meta.resultId);

      // Step 8.
      deps.scheduler.commit("completion");
    } catch (cause) {
      // C23 I2 — a transport that fails, times out or throws ends in a document
      // like everything else.
      const failed = errorDoc(
        line,
        { message: String(cause), stage: "transport" },
        { origin: "user", verb },
      );
      settleWithDocument(pendingId, failed);
      recordHistory(line, failed); // I29 — a failure is a settlement.
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
    /**
     * **The displayed command, and the same one the settle path uses** (I15).
     * It was `line` — the raw typed text — while step 5 passed `displayed`, so
     * one entry carried the line while streaming and the normalised argv once it
     * settled: the transcript changed what it said a command was, mid-stream,
     * with no event. `meta.argv` carries the spawned form for `/debug`.
     */
    displayed: string,
    verb: string,
    patches: AsyncIterable<RawPatch>,
  ): Promise<void> => {
    // **The stream's own counter** (I30, C07 I15). Not decoration: C07 spends it
    // as the namespace for generated block ids *and* as the per-stream reset,
    // because one `PatchAdapter` outlives many streams. This was the literal `0`,
    // which is the only value that is wrong twice — every patch collided with the
    // first under C04 I14, so no streaming verb could emit a second block, and the
    // reset fired continuously, so C06 I12's sticky degradation never stuck and a
    // degraded stream's remainder could not be composed. Neither is visible from
    // here, and neither is reachable from a test that builds its own context.
    let seq = 0;

    try {
      for await (const patch of patches) {
        if (patch.kind === "end") {
          // C23 I8 — settlement flushes at `"completion"`. §8a A4: settling
          // clears the stall state, so a notice does not outlive its condition.
          refresh.settled(id);
          deps.transcript.settle(id);
          deps.scheduler.commit("completion");
          return;
        }

        const view = deps.adapters.adaptPatch(patch, {
          command: displayed,
          verb,
          width: deps.lifecycle.size().columns,
          userRequestedJson: false,
          transport: "subprocess",
          origin: "user",
          tool: null,
          seq,
        });
        // Counted per patch adapted, not per patch applied: `seq` is a position
        // in the stream, and a patch C07 mapped to `null` still occupied one.
        // Counting only the applied ones would reuse a position after every
        // dropped `malformed` line, which is the collision again with a rarer
        // trigger.
        seq += 1;
        if (view === null) continue;

        const outcome = deps.transcript.patch(id, view);
        if (outcome.ok) {
          // §3b — output resumed, so the entry is no longer silent.
          refresh.sawPatch(id);
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
          line,
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
        appendAndCommit(errorDoc(line, result.error, { origin: "user" }), line);
        return;

      case "builtin": {
        const applied = applyBuiltin(result.name, result.args);
        appendAndCommit(
          applied.ok
            ? noticeDoc(line, `${result.name} ${applied.text}`, "muted", { origin: "user" })
            : errorDoc(line, { message: applied.message }, { origin: "user" }),
          line,
        );
        return;
      }

      case "builtinThenShell": {
        // **C23 I11 — the built-in applies before any delegation**, and C23 T3.13
        // is the other half: one that fails does not delegate.
        const applied = applyBuiltin(result.name, result.args);
        if (!applied.ok) {
          appendAndCommit(errorDoc(line, { message: applied.message }, { origin: "user" }), line);
          return;
        }
        start(line, runShell(line, result.rest));
        return;
      }

      case "shell":
        // C18 §5a's marker, already stripped from `command` (C18 I26) — so the
        // string handed to `sh -c` is the same one either way, and the flag is
        // the only difference between the two routes.
        start(
          line,
          result.interactive
            ? runHandoff(line, ["sh", "-c", result.command], headOf(result.command), "shell")
            : runShell(line, result.command),
        );
        return;

      case "local":
        start(
          line,
          // **The arguments, not the whole argv.** `ParseResult.argv` begins
          // with the verb — `["theme", "light"]` — and a handler knows its own
          // name, so passing it back means every handler indexes from 1 and the
          // one that forgets reads its own verb as an argument. A multi-token
          // verb (`debug dump`) makes the off-by-one an off-by-two, which is
          // the version that survives review.
          runLocal(line, result.tool.name, result.argv.slice(result.tool.name.split(" ").length)),
        );
        return;

      case "app":
        // C05 I19's field, read off the `ToolDef` C18 already carries — one
        // fact with one home, rather than a copy on the result. The transport
        // is bypassed entirely: an interactive verb's child owns the terminal,
        // and there is no stdout to read (C05 I19 refuses `streams` with it).
        start(
          line,
          result.tool.interactive === true
            ? runHandoff(line, [deps.binary, ...result.argv], result.tool.name, "app")
            : runApp(line, result),
        );
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
    pushView: (from, target) => deps.patchView.open(from, target),

    // **Patched into the source entry, never appended** (C23 I18, §3a). An
    // append freezes the block the action came from, so the next action is
    // refused as frozen rather than for its own reason and the selection A01 D7
    // preserves is cleared — C23 §4's pop row, one section over.
    refuse: (from, text) => {
      if (from === null) {
        appendAndCommit(noticeDoc("", text, "warn", { origin: "action" }));
        return;
      }
      const outcome = deps.transcript.patch(
        from,
        {
          op: "append",
          block: block({
            kind: "notice",
            id: blockId("refused"),
            tone: "warn",
            glyph: "warn",
            text,
          }),
        },
        // **The whole of why this works now.** A refusal notice *is* data, so a
        // gate reading the operation refused it on every settled entry — which
        // is most of the ones a reader acts on. The gate reads who is writing
        // (C13 §6), and this is the shell.
        "shell",
      );
      // The entry was evicted or cleared under the action. Nothing to patch and
      // nothing worth appending about it.
      if (outcome.ok) deps.scheduler.commit("input");
    },

    notify: (text) => void appendAndCommit(noticeDoc("", text, "warn", { origin: "action" })),
  });

  /**
   * A `LiveSpec` as C23 drives it (C23 §3b).
   *
   * **The defaults are the framework's, not the declarer's**, which is what
   * C24 §5's *behaviour is fixed* means in practice: one-shot when `every` is
   * omitted, staleness at twice the interval, and A02 §7's error shape when no
   * `renderError` is given. A consumer overrides how those look and never
   * whether they happen.
   */
  const partOf = (spec: LiveSpec): Parameters<typeof refresh.declare>[1][number] => ({
    id: spec.id,
    title: spec.title,
    intervalMs: spec.every ?? 0,
    staleAfterMs: spec.staleAfter ?? (spec.every ?? 0) * 2,
    fetch: spec.fetch ?? ((): Promise<unknown> => Promise.resolve(null)),
    render: spec.render,
    renderError:
      spec.renderError ??
      ((err, retryInMs) =>
        block({
          kind: "notice",
          id: `${spec.id}-error`,
          tone: "error",
          text:
            retryInMs === null
              ? err.message
              : `${err.message} — retrying in ${String(Math.round(retryInMs / 1000))}s`,
        })),
  });

  /**
   * Register every live part a document declares, against the entry that now
   * holds it (C23 §3b, I32, I33a).
   *
   * **Declared on any route is driven; stopped on settle, pop, eviction, clear
   * or shutdown — never on freeze.** Both halves of that are load-bearing and
   * the first half used to be false.
   *
   * It said *called from the one place a document reaches the transcript, so a
   * part declared on any route is driven and no route has to remember to* —
   * and there are **two** such places. `append(doc)` carries the local and
   * notice routes; `settle(id, doc)` carries the app route, where §3's steps 6
   * and 7 are one call, so the entry is appended *pending* and the blocks
   * arrive only at settlement. Hanging registration off `append` alone meant an
   * adapter's `b.live` was never driven at all: loading state, for the life of
   * the session, with nothing anywhere reporting a fault.
   *
   * A sentence claiming total coverage of a set it had miscounted — which no
   * test could contradict, because none of them declared a live part from an
   * adapter. A consumer built one on each route and read the frames.
   *
   * The second half is **not** the same kind of statement and must not be
   * "fixed" to match: a frozen entry keeps refreshing (I9, I33), because a
   * `--watch` scrolled out of view is still running. C24 §5's *teardown on
   * freeze* row was deleted against exactly that.
   */
  /**
   * The view arm of I33a's declaration, and the call site that did not exist.
   *
   * `declareLive` hard-codes `{ kind: "entry" }` because an entry was the only
   * host anything in the tree produced — the finding gap 7 was filed against
   * (F20). This is the other arm, reached now that a verb's result can be a
   * view, and it is the same `declare` with the same parts.
   */
  const declareLiveInView = (blocks: readonly Block[]): void => {
    const parts = liveDeclarations(blocks).map((d) => partOf(d.spec));
    if (parts.length > 0) refresh.declare({ kind: "view", id: DOCUMENT_VIEW_ID }, parts);
  };

  const declareLive = (id: string, blocks: readonly Block[]): void => {
    const parts = liveDeclarations(blocks).map((d) => partOf(d.spec));
    if (parts.length > 0) refresh.declare({ kind: "entry", id }, parts);
  };

  /**
   * The second place a document reaches the transcript (I33a).
   *
   * **Release-then-declare, and the order is a consequence of the call rather
   * than of subscriber registration.** C13 emits its `settle` change
   * synchronously, so the driver's I33 teardown has already run by the time
   * `settle()` returns — and the declaration that follows is the settled
   * document's own. Reading the order off two `subscribe` calls would work today
   * and break on the day someone reorders construction.
   */
  const settleWithDocument = (id: EntryId, doc: ViewDocument): void => {
    deps.transcript.settle(id, doc);
    declareLive(id, doc.blocks);
  };

  /**
   * C23 §3b. Constructed last because the identity notice appends through the
   * same path a submission does — it is C23 speaking, on C22's signal.
   */
  const refresh = createRefreshDriver({
    transcript: deps.transcript,
    clock: deps.clock,
    schedule: deps.schedule,
    commit: (reason) => void deps.scheduler.commit(reason),
    // **The only path in §3b that appends, and so the only producer of
    // `origin: "refresh"`.** The other two patch, and a patch carries no `meta`.
    append: (text) =>
      void appendAndCommit(noticeDoc("", text, "info", { origin: "refresh" })),
    stopping: () => deps.session().stopping,
    // **A second seam, because the two hosts are different components.** §3b
    // commits that an entry and a pushed view are driven by *the same code*,
    // not that they are the same store: C13 patches, C15 updates, and the
    // driver holds one loop over both.
    // **The document view is asked, not the layer** (C22 §13a, C22 I46). Its layer
    // holds a *window* of the document, so a part scrolled out of view is absent
    // from `layer.content` while being perfectly alive — patching the layer
    // directly would report that as a vanished host and release the parts, and
    // the reader would come back from a scroll to a dead panel.
    //
    // The owner holds the whole document, so it answers for blocks the window
    // does not currently show. `putBlock` is total (§13a): the reprojection
    // happens into a local and nothing is assigned unless it succeeds.
    updateView: (id, blockId, next) => {
      if (id === DOCUMENT_VIEW_ID) return deps.documentView.putBlock(blockId, next);
      const layer = deps.overlays.stack.find((l) => l.id === id);
      if (layer === undefined) return false;
      const content = layer.content.map((b) => (b.id === blockId ? next : b));
      return deps.overlays.update(id, { content });
    },
    viewBlock: (id, blockId) => {
      const found =
        id === DOCUMENT_VIEW_ID
          ? deps.documentView.blockAt(blockId)
          : deps.overlays.stack.find((l) => l.id === id)?.content.find((b) => b.id === blockId);
      return found !== undefined && found !== null && found.kind === "panel"
        ? (found.children[0] ?? null)
        : null;
    },
  });

  return {
    submit,
    onAction,
    identityNotice: (text) => void refresh.identityNotice(text),
    releaseView: () => void refresh.release({ kind: "view", id: DOCUMENT_VIEW_ID }),

    // C22 §4 step 7 (C22 I44). Through `appendAndCommit` like everything else,
    // which is what drives a live part in it and what lets `/clear` remove it.
    // No `line`: nothing was typed, so nothing enters history (I29).
    greeting: (doc) => void appendAndCommit(doc),
    dispose: () => void refresh.dispose(),

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

    /** How many subscriptions are live — C16 §5's rung, and the exit arming. */
    get liveStreams() {
      return liveStreams.length;
    },

    /**
     * Cancel the newest live subscription (C16 §5).
     *
     * **Newest, because it is the one the reader just started** and the only
     * rule they can predict without looking at the transcript. `n` streams take
     * `n` presses, and the exit confirm arms only once none are left.
     */
    cancelNewestStream: () => {
      const newest = liveStreams.at(-1);
      if (newest === undefined) return false;
      newest.cancel();
      return true;
    },
  };
}
