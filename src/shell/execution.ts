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
import { blockId, completeLocal, compose, errorDoc, noticeDoc, usageDoc } from "./documents.js";
import { createActionDispatcher } from "./actions.js";
import { createRefreshDriver } from "./refresh.js";
import { DOCUMENT_VIEW_ID } from "./document-view.js";
import type { ProducerContext } from "../data/adapters/types.js";
import { isViewInvocation } from "../data/manifest/index.js";
import type { ValidationResult } from "../data/manifest/index.js";
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

/** What a handler is told when validation failed and there is nothing parsed. */
const EMPTY_ARGS: Readonly<Record<string, unknown>> = Object.freeze({});

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
    // **Roadmap 33's drain, at the one place every exit is guaranteed to pass.**
    // The comment above was written before this entry needed it, and it is why
    // the queue attaches here rather than at each runner's `finally`: a drain
    // per exit path is a drain the next route forgets.
    this.#onRelease?.();
  }

  /** Set once by the pipeline — `Guard` is constructed before `drain` exists. */
  #onRelease: (() => void) | undefined;

  onRelease(fn: () => void): void {
    this.#onRelease = fn;
  }
}

/** C06's default for a non-streaming verb. Streams pass 0, which is unbounded. */
const DEFAULT_TIMEOUT_MS = 30_000;

export function createExecutionPipeline(deps: PipelineDeps): Pipeline {
  /**
   * The producer context, **built at the call and never captured** (C07 §3a).
   *
   * Every route that produces a document or a block is told the same four facts
   * (C23 I40). Reading them here, per call, is what makes them true when the
   * producer runs rather than when its document was made — a live part renders
   * repeatedly and a stream adapts per patch, and a captured width is stale by
   * the first resize. That is the half of F24 that survives.
   *
   * `height` is the caller's, because only the caller knows whether this
   * document is bound: `null` on every route but a view invocation, which C23
   * reads before step 3 for its own reasons (C22 I45).
   */
  const producerContext = (height: number | null): ProducerContext => ({
    width: deps.lifecycle.size().columns,
    height,
    capabilities: deps.capabilities,
    // The frame's own measurer, not a second one (C09 I1, C07 I20). The
    // registry is sealed at composition, so this closure cannot go stale.
    measure: (block, width) => deps.blocks.measure(block, width),
  });

  const guard = new Guard();
  const local = createLocalRegistry();

  /**
   * Roadmap 33 — submissions taken while something runs (C23 I5, as re-ruled).
   *
   * **A list in this file and nothing else.** No published type, no `TuiConfig`
   * field, no chrome row, `src/index.ts` untouched. The cost was never the list:
   * it was `Settle` above, without which a queued submission puts one row on
   * screen when it is typed and a second when it runs.
   */
  type Queued = Readonly<{
    line: string;
    result: Exclude<ParseResult, { kind: "empty" }>;
    id: EntryId;
  }>;
  const queue: Queued[] = [];

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
      setSuppressBackground: deps.setSuppressBackground,
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
   * C23 I48 — what the bare catches record, drained by C22 §8 step 3.
   *
   * **A collection and not a callback**, which is C02's ruling taken a third
   * time: C23 decides what is wrong, never when the user is told. A callback
   * would choose the moment, and the moment is after the terminal is released —
   * a diagnostic painted onto the alternate screen is discarded with it.
   *
   * Deduplicated by message, which is what C20 already means by *logged once*:
   * a refresh notice failing on every tick would otherwise fill both channels
   * with one sentence.
   */
  const faults: string[] = [];

  /** Whether this is the first time — the notice's gate as well as the list's. */
  const recordFault = (stage: string, cause: unknown): boolean => {
    const text = `${stage}: ${String(cause)}`;
    if (faults.includes(text)) return false;
    faults.push(text);
    return true;
  };

  /**
   * The other channel — an entry, at the moment (C23 §5a, F15).
   *
   * **Not the submission's entry** (§8b B1), so I1's count is untouched: it is a
   * fourth thing that appends without being a submission, beside the identity
   * notice, a stall patch and a refresh tick. `origin: "defect"` is the only
   * field that can distinguish this from a verb that did nothing, and `/debug`
   * renders it.
   *
   * **Deduplicated by the same collection**, which is why `recordFault` answers
   * whether it was new: a refresh notice failing every tick would otherwise fill
   * the transcript with one sentence at 1 Hz.
   *
   * **`stopping` halts it, as B1 ruled for B1's own three.** After shutdown
   * begins the transcript is being torn down, and the accumulation is what the
   * reader gets — which is right, because step 3 has not run yet.
   *
   * The append is direct rather than through `appendAndCommit`: no history, no
   * live parts, and nothing that could recurse into the catch that called this.
   * If it throws, the accumulation is all that survives, and that is the end of
   * the ladder (T3.38).
   */
  const contain = (stage: string, cause: unknown): void => {
    if (!recordFault(stage, cause)) return;
    if (deps.session().stopping) return;
    try {
      deps.transcript.append(
        noticeDoc("", `${stage}: ${String(cause)}`, "error", { origin: "defect" }, "error"),
      );
    } catch {
      // Nothing left to say it with. `faults` already has it, and that is the
      // end of the ladder.
    }
  };

  /**
   * **Where a submission's document goes, and it is a value rather than a flag.**
   *
   * Nineteen `appendAndCommit` call sites partition by *when they append
   * relative to the guard*, and the fifteen that settle a submission are exactly
   * the fifteen that carry `line`, because I29 needs it at those and no others.
   * So the destination travels a thread that is load-bearing already, and the
   * four sites that are **not** submissions — an action's refusal, `notify`, a
   * refresh notice, the greeting — are separated by the test that always gated
   * history.
   *
   * `into` is `null` for a submission routed the moment it was typed, and an
   * `EntryId` for one that waited: a queued submission's entry is appended when
   * it is typed and the route that eventually runs it settles **that** entry.
   * **One entry with two states and never two entries** — which is the defect
   * the obvious build reintroduces, because every arm appends by default.
   *
   * A record rather than a second positional parameter beside `line`: two
   * positionals that must agree are two records of one fact, and a runner that
   * threads one and drops the other type-checks.
   *
   * **`runApp` is not converted, and the reason is not obvious from reading it.**
   * Its pair at the `settleWithDocument` calls below looks like this function's
   * body and differs in two deliberate ways: it does **not** `resetFocus`,
   * because a settlement is not an append and focus must not jump out of the
   * entry the reader is in, and it commits `"completion"` rather than `"input"`.
   * A green suite shows neither. Left alone on purpose — the duplication is
   * apparent rather than real.
   */
  type Settle = Readonly<{ line: string; into: EntryId | null }>;

  /** A submission routed as it was typed — the ordinary case. */
  const now = (line: string): Settle => ({ line, into: null });

  /**
   * The one place a document reaches the transcript, and the one place the
   * frame is committed for a submission (Seam 4's submit row).
   *
   * **`resetFocus` sits between the append and the commit** and the order is the
   * whole of C23 T4.7b: a reset issued before the append is undone by nothing,
   * and one issued after the commit paints a frame with focus in a block that
   * has just been frozen.
   *
   * **The catch covers five statements and §5 was written about the first**
   * (§8e). `id` is a `let` because four of the five rows leave the entry
   * appended, and the catch that returned a flat `null` was telling every caller
   * the entry did not exist. Nothing reads it today, which is what made the lie
   * survivable rather than what made it true.
   */
  const appendAndCommit = (
    doc: Parameters<typeof deps.transcript.append>[0],
    /**
     * The submission this settles, when it settles one (I29). Absent at the four
     * sites that are not submissions — the same test that always gated history.
     */
    settle?: Settle,
  ): string | null => {
    const line = settle?.line;
    let id: string | null = null;
    try {
      // **The two cases of one destination.** A submission that waited already
      // has its entry; appending here would put a row on screen when it was
      // typed and a second when it ran.
      if (settle?.into != null) {
        deps.transcript.settle(settle.into, doc);
        id = settle.into;
      } else {
        id = deps.transcript.append(doc);
      }
      declareLive(id, doc.blocks);
      if (line !== undefined) recordHistory(line, doc);
      deps.resetFocus();
      deps.scheduler.commit("input");
      return id;
    } catch (cause) {
      // §5's stage whose failure loses the *entry*, and C23 I1's second
      // exception. The guard is still released by the caller's `finally`.
      contain("appendAndCommit", cause);
      // **I49 — the catch finishes what the try did not.** `resetFocus` is
      // abandoned by every row of §8e but the first, and its absence is the one
      // that is permanent: the append froze the previous entry and focus is
      // still inside it, on every frame from here on. Guarded, because a reset
      // that throws is §8e's fourth row and must not take the commit with it.
      try {
        deps.resetFocus();
      } catch (second) {
        // **Recorded, not noticed.** One swallow is one notice: a second arm of
        // the same containment would put two sentences on screen for one event,
        // and the reader already has the first. The collection keeps both,
        // because at exit the detail is what tells them apart.
        recordFault("resetFocus", second);
      }
      deps.scheduler.commit("input");
      return id;
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

  // **C23 I5's refusal had one caller and the queue is what that caller does
  // now.** Removed rather than kept: a function whose comment explains a
  // behaviour the shell no longer has is the kind of thing a reader trusts. Its
  // reason did not go with it — it is quoted at the `enqueue` call, because the
  // reason was always about *no part takes effect now* and never about
  // discarding the line.

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
      // **Whole-line and unconditional, and the property is the same one it
      // always was** (C23 I5, C23 §8b B4). No part of a deferred submission
      // takes effect while something is in flight, including a `builtin` that
      // needs nothing C23 is holding: a line that silently moved the working
      // directory out from under the running command is a lie about what the
      // tool did. The deferral is a **queue** rather than a refusal since
      // 2026-08-15, which is the stronger satisfier of that rule — the reader's
      // line is neither lost nor applied out of order.
      //
      // Everything queues, strictly. The rule that would let a `local` handler
      // jump is the **who is writing** axis, and it is inferred from two cases:
      // the roadmap entry carries it as the open question it is.
      enqueue(line, result);
      return;
    }

    route(now(line), result);
  };

  /**
   * The deferred submission's entry, appended **when it is typed** (roadmap 33).
   *
   * `streaming: true`, so the queue is visible where this reader is already
   * looking. That is what makes roadmap 29's contested chrome row not owed —
   * reading *a queue you cannot see is a queue you forget you typed into* as a
   * counter is what put 29 in front of this.
   *
   * **Not through `appendAndCommit`**: nothing has settled, so I29's history
   * append would record a line that has not run. History is written by the route
   * that drains it, through the funnel, exactly as an unqueued submission's is.
   */
  const enqueue = (line: string, result: Exclude<ParseResult, { kind: "empty" }>): void => {
    // **Contained, because C23 I2 admits no escaping failure and this append is
    // outside the funnel's catch** (§5). Found by T1.46 rather than by reading:
    // `/help` takes the guard, so with a throwing transcript the second and
    // subsequent submissions now enqueue instead of routing, and an uncaught
    // throw here leaves `submit` — a keystroke taking the process down. The
    // funnel's own catch never covered this path because this path is new.
    //
    // A submission that cannot be shown is dropped rather than queued blind: a
    // queued item with no entry is invisible **and** still runs, which is worse
    // than not running.
    let id: EntryId;
    try {
      id = deps.transcript.append(
        noticeDoc(line, `queued behind ${guard.verb ?? "a command"}`, "muted", { origin: "user" }),
        { streaming: true },
      );
    } catch (cause) {
      contain("enqueue", cause);
      return;
    }
    queue.push({ line, result, id });
    deps.scheduler.commit("input");
  };

  /**
   * **The loop is gated on the guard, not on the queue.**
   *
   * One item per release is wrong: a `builtin` completes synchronously and never
   * takes the guard, so `release()` never fires again and everything behind it
   * stalls. Draining outright is the other wrong answer — it starts every item at
   * once, and sequentiality is the whole point. **The condition is *nothing is
   * running***, which is exactly what makes an item's predecessor finished.
   */
  let draining = false;
  const drain = (): void => {
    // I12, and for I12's reason: after shutdown begins, nothing appends.
    if (deps.session().stopping) return;
    // Insurance rather than an observed path: every release reached from inside
    // a route today is a microtask later. A route that released synchronously
    // would shift twice from one release.
    if (draining) return;
    draining = true;
    try {
      while (guard.route === null) {
        const next = queue.shift();
        if (next === undefined) return;
        route({ line: next.line, into: next.id }, next.result);
      }
    } finally {
      draining = false;
    }
  };
  guard.onRelease(drain);

  /**
   * C23 I5's `Ctrl-C` half: **one press stops everything the reader started.**
   *
   * The two-rung answer — cancel the running thing, leave the queue, clear it on
   * a second press — needs a *held* queue, and nothing restarts one: every drain
   * hangs off `release()` and the release that would drain is the one the cancel
   * consumed. Letting the cancel drain instead makes the second rung unreachable.
   *
   * **The work is not discarded silently**, and the entry appended at submission
   * is what pays for that: it already exists and settles in place saying what
   * happened to it.
   */
  const clearQueue = (): void => {
    for (const item of queue.splice(0)) {
      deps.transcript.settle(
        item.id,
        noticeDoc(item.line, "cancelled before it ran", "warn", { origin: "user" }),
      );
    }
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

  /**
   * C23 §2's `shell` route — `spawnShell`, and a `raw` document (C18 §5).
   *
   * **I50, and the failure shape is the whole of it** (F151). This composed
   * `status: "error"` with no `error` field, which C04 I3 forbids in both
   * directions, so `transcript.append` refused every failing command (C13 I10)
   * and the route produced **no entry at all** — the reader shown F15's fault
   * notice citing two invariant numbers in place of the command they typed.
   *
   * Fourth instance of one class, and both earlier closures miss it by
   * construction: `documents.ts` filled the field inside `noticeDoc` *"rather
   * than at the two call sites"* and this route composes directly, while F35's
   * app-side closure runs the documents the **app** produces and this one is
   * the framework's. Closing a class means checking the class has one member.
   *
   * **`stderr` is read because it is where the sentence is.** `ChildHandle`
   * delivers the two streams separately (C21 I3) and this read only `stdout`,
   * so `sh: 1: list: not found` — the one line that names what went wrong —
   * was produced, delivered and dropped, leaving a raw block that was empty as
   * well as unappendable. Concurrently rather than in sequence: a child filling
   * the pipe nobody is draining blocks, and reading stdout to exhaustion first
   * is that deadlock.
   *
   * **The wording is C07 §4's, deliberately duplicated rather than imported.**
   * `mapResult` takes a `RawResult` that a shell route has no way to build, and
   * two spellings of *the command exited with code N* is a worse outcome than
   * one sentence written twice; if that pair drifts, this comment is the link.
   *
   * **A remedy naming the prefix is a separate ruling and not taken here.** The
   * likeliest cause is a verb typed without one, but `commandPolicy` is
   * injected (C22) — `slashPolicy` is a default, not a guarantee — so a message
   * saying *type `/list`* would be wrong for any app that supplied its own.
   * What is here instead is true under every policy: the exit code, and the
   * shell's own line naming the token it could not find.
   */
  const runShell = async (settle: Settle, command: string): Promise<void> => {
    // `line` is read throughout; `settle` carries where its document goes.
    const { line } = settle;

    guard.take("shell", headOf(command));
    try {
      const child = deps.runner.spawnShell(command, { cwd: () => deps.session().cwd });
      const drain = async (stream: AsyncIterable<string>): Promise<string> => {
        let text = "";
        for await (const chunk of stream) text += chunk;
        return text;
      };
      const [out, err] = await Promise.all([drain(child.stdout), drain(child.stderr)]);
      const exit = await child.exited;

      const failed = exit.code !== 0 || exit.signal !== null;
      const message =
        exit.signal !== null
          ? `Killed by ${exit.signal}.`
          : `The command exited with code ${String(exit.code ?? 1)}.`;

      appendAndCommit(
        compose({
          command: line,
          status: failed ? "error" : "ok",
          // **The success path is byte-identical to what it was**: one raw
          // block, emitted whether or not the command said anything. Eliding
          // an empty one there would change every silent command's entry from
          // one block to none, which is a rendering change this row has no
          // reason to make and no test covering it.
          //
          // The failure path is new, so it chooses: the notice carries the
          // sentence, and a raw block appears only when it has content — an
          // empty one is a blank row the reader has to account for, and on
          // this route both streams are routinely empty.
          blocks: failed
            ? [
                block({
                  kind: "notice",
                  id: blockId("shell-failed"),
                  tone: "error",
                  glyph: "error",
                  text: message,
                }),
                ...(out === "" ? [] : [block({ kind: "raw", id: blockId("raw"), text: out })]),
                ...(err === "" ? [] : [block({ kind: "raw", id: blockId("raw-err"), text: err })]),
              ]
            : [block({ kind: "raw", id: blockId("raw"), text: out })],
          ...(failed
            ? {
                error: {
                  message,
                  code: exit.signal !== null ? "KILLED_BY_SIGNAL" : "UNEXPECTED_EXIT",
                },
              }
            : {}),
          meta: {
            origin: "user",
            exitCode: exit.code ?? 1,
            transport: "subprocess",
            argv: [command],
            truncated: child.overflowed,
          },
        }),
        settle,
      );
    } catch (cause) {
      appendAndCommit(
        errorDoc(line, { message: String(cause), stage: "spawn" }, { origin: "user" }),
        settle,
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
    settle: Settle,
    argv: readonly string[],
    label: string,
    kind: "shell" | "app",
  ): Promise<void> => {
    // `line` is read throughout; `settle` carries where its document goes.
    const { line } = settle;
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
        settle,
      );
    } catch (cause) {
      appendAndCommit(
        errorDoc(line, { message: String(cause), stage: "handoff" }, { origin: "user" }),
        settle,
      );
    } finally {
      guard.release();
    }
  };

  /** C23 §2's `local` route. §8b B3's missing-handler cell is closed by `seal()`. */
  const runLocal = async (
    settle: Settle,
    verb: string,
    argv: readonly string[],
    // **What C05 already parsed, carried rather than re-derived** (C22 I66).
    // Empty when validation failed, which a local verb is not gated on.
    args: Readonly<Record<string, unknown>>,
  ): Promise<void> => {
    // `line` is read throughout; `settle` carries where its document goes.
    const { line } = settle;
    guard.take("local", verb);
    const startedAt = deps.clock();
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
          settle,
        );
        return;
      }
      const produced = await handler(argv, {
        // **`null`, and C07 §3a cell B records that it is right by accident.**
        // The local route cannot open a view — C18 classifies on `tool.local`
        // first and `isViewInvocation` is read only on the `app` route — so a
        // local verb has no bound to state. F129 is that gap; when it closes,
        // this argument changes with it.
        ...producerContext(null),
        command: line,
        // **The host's own `ask`, not a per-call wrapper** (C23 I36). One layer
        // id and one answer handler exist at a time, so a question asked while
        // one is open would replace the layer under the first handler's promise
        // — the host owns that, not this call site.
        ask: deps.confirm.ask,
        args,
      });
      // **C23 states the command, not the handler** (I15, C22 I33) — the same
      // argument as C07 I16 makes for `doc.command` on the adapter side, and the
      // same one I13 makes for `meta`: the framework knows what was submitted
      // and the handler does not need to say. Six handlers each named their own,
      // and `/theme light` said `/theme` — a displayed command that dropped its
      // argument, which nothing could see while nothing was displayed.
      // **`meta` the same way, and the comment above was already the argument.**
      // *"The framework knows what was submitted and the handler does not need
      // to say"* was written for `command` and never applied to `meta`, so four
      // handlers in the reference app each carried an eleven-line helper writing
      // `verb` re-derived from `argv[0]`, `durationMs: 0` on a route the shell
      // times, a `transport` that is a constant and an `origin` it already
      // holds. Nothing overwrote them, so they were invented rather than
      // discarded — the mirror of the adapter route, where the same seven are
      // computed and thrown away. FINDINGS F13.
      //
      // `exitCode` is derived from `status` rather than taken: every local
      // document in the reference app pairs `status: "error"` with `1` and
      // `"ok"` with `0`, at eight sites, so carrying both is two records of one
      // fact. **`stderr` is empty because a local route has no far side** — the
      // failure message belongs in `error.message`, where it already is. F101.
      const doc = completeLocal(produced, {
        command: line,
        verb,
        argv,
        durationMs: deps.clock() - startedAt,
      });
      appendAndCommit(doc, settle);
      // A02 Seam 4's theme row: `theme.setTheme` → `scheduler.invalidate`.
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
        settle,
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
    settle: Settle,
    verb: string,
    result: Extract<ParseResult, { kind: "app" }>,
  ): Promise<void> => {
    // `line` is read throughout; `settle` carries where its document goes.
    const { line } = settle;
    const controller = new AbortController();

    /**
     * **`Ctrl-C` reaches this route too** — the obligation the table found
     * missing (C22 §13a). It was set on the entry route and not here, which is
     * `declareLive` and `release` a third time: an obligation the author of a
     * new route did not notice, in a route written rather than derived.
     *
     * It pops rather than settling, because there is no entry to settle. The
     * reader is left with no record, which §13a rules is the cost B03 §2 already
     * names for an excursion that appended nothing on the way in.
     */
    const cancelThis = (): void => {
      controller.abort();
      refresh.release({ kind: "view", id: DOCUMENT_VIEW_ID });
      deps.documentView.pop();
      deps.history.append(line, 130);
      deps.scheduler.commit("completion");
    };
    cancelInFlight = cancelThis;

    try {
      const transport = deps.transport.for(verb);
      const streams = result.tool.streams ?? false;
      const invocation = {
        verb,
        argv: result.argv,
        streams,
        // 0 is unbounded, which is what a follow needs (C06 commitment 7).
        timeoutMs: streams ? 0 : DEFAULT_TIMEOUT_MS,
        signal: controller.signal,
      };

      /**
       * **The fourth route** (C22 I48, §13a), and the three obligations it does
       * not share with the entry one are ruled in the spec rather than here.
       *
       * The order of these four lines is the whole of what was refused before:
       * the guard is released *before* the loop or one follow holds the session
       * (C23 I6), and the canceller is registered *before* the loop is awaited
       * or Ctrl-C falls past C16 §5's rung — which on this route quits the
       * shell, because the view's loop is the only thing on screen.
       */
      if (streams) {
        guard.release();
        liveStreams.push({ id: DOCUMENT_VIEW_ID, cancel: cancelThis });
        // **An empty document before the loop.** `open()` pushed a spinner and
        // `ViewPatch` has no delete, so appending beside it would leave it
        // spinning under the notice that says the stream stopped.
        deps.documentView.fill({
          schema: "tui.view/1",
          command: displayed,
          status: "ok",
          blocks: [],
          meta: {
            verb,
            adapter: "stream",
            exitCode: 0,
            durationMs: 0,
            truncated: false,
            argv: result.argv,
            stderr: "",
            transport: "subprocess",
            origin: "user",
          },
        });
        try {
          await streamIntoView(displayed, verb, transport.stream(invocation), result.validation.ok ? result.validation.args : {});
        } finally {
          forgetStream(DOCUMENT_VIEW_ID);
        }
        return;
      }

      const raw = await transport.invoke(invocation);
      const doc = deps.adapters.adapt(raw, {
        command: displayed,
        verb,
// **The region's height, because a view's producer is defined by it**
// (C07 I18, C15 §4). The same source `documentView` reads — a second
// computation is a producer splitting against an axis the frame does
// not use, and nothing in the arithmetic would look wrong.
...producerContext(deps.region().height),
        userRequestedJson: result.argv.includes("--json"),
        // C05 I21 — the validated values, so a `shellOnly` flag is readable by
        // the thing that has to act on it. Empty on the failure arm, which
        // cannot be reached here: a malformed invocation never spawns.
        flags: result.validation.ok ? result.validation.args : {},
        transport: "subprocess",
        origin: "user",
        tool: result.tool,
      });
      // **A queued view invocation still owns an entry, and this route has no
      // settlement of its own** (roadmap 33; C22 §13a). §13a ruled *it pops
      // rather than settling, because there is no entry to settle*, and that was
      // true of a view submitted directly — it appends nothing on the way in.
      // A **deferred** one appended its entry when it was typed, so the sentence
      // no longer covers it and the entry would stream for ever, marked *queued
      // behind* something that finished long ago.
      //
      // Settled before the fill, so the ordering holds if the fill refuses.
      if (settle.into !== null) {
        deps.transcript.settle(
          settle.into,
          noticeDoc(line, `${verb} opened a view`, "muted", { origin: "user" }),
        );
      }
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
   * §2 routes by *shape*, so an `app` result arrives whatever its validation
   * says, and the check has to happen or an invalid command is spawned.
   *
   * **It happens in `route`, above the interactive split** (I38). This function
   * is the non-interactive arm of that split, so a check here covered half the
   * verbs — and the half it missed were the ones that take the terminal (F119).
   */
  const runApp = async (
    settle: Settle,
    // **The gate's placement, made a compile obligation** (I38). `route` checks
    // `validation.ok` above the interactive split, and narrowing the parameter
    // here is what stops that check drifting back into this function: two
    // runtime guards of one condition are indistinguishable from one in every
    // test, because each defeats the other's mutation. This one cannot be
    // satisfied by a caller that has not gated.
    result: Extract<ParseResult, { kind: "app" }> & {
      validation: Extract<ValidationResult, { ok: true }>;
    },
  ): Promise<void> => {
    // `line` is read throughout; `settle` carries where its document goes.
    const { line } = settle;
    const verb = result.tool.name;

    // Step 1 — the carried result, now read in `route` above the interactive
    // split (I38). C23 §8b B2 is the cell where §2's route table and §5's
    // containment row named different destinations for one value; the
    // destination is unchanged and only the moment moved, because this function
    // is one arm of two and the gate has to cover both.
    //
    // Not left here as well: the parameter type is what holds it now.

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
        await runIntoView(displayed, settle, verb, result);
        return;
      }
      appendAndCommit(errorDoc(line, { message: refusal }, { origin: "user", verb }), settle);
      return;
    }

    // Step 3 — the pending entry. Before step 4. This is the ordering.
    //
    // **A deferred submission already has one, and this is the site the compiler
    // could not check** (roadmap 33). `into` type-checks at every one of the
    // fifteen and only here does it change *when* an entry comes into being:
    // appending a fresh pending entry over a queued one leaves the queued row on
    // screen for ever and puts a second beneath it. The entry appended when the
    // line was typed **is** this route's pending entry — same id, same
    // `streaming`, and the settle below closes it exactly as it always did.
    const pendingId = settle.into ?? deps.transcript.append(
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
          await streamInto(pendingId, displayed, verb, transport.stream(invocation), result.validation.ok ? result.validation.args : {});
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
// `null` — a transcript entry is windowed by rows and has no bound
// (C07 I18). The terminal's height standing in here would be a region
// nobody promised.
...producerContext(null),
        userRequestedJson: result.argv.includes("--json"),
        // C05 I21 — the validated values, so a `shellOnly` flag is readable by
        // the thing that has to act on it. Empty on the failure arm, which
        // cannot be reached here: a malformed invocation never spawns.
        flags: result.validation.ok ? result.validation.args : {},
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
  /**
   * `streamInto`'s sibling — the same loop against a view (C22 I48).
   *
   * **Not a parameterisation of `streamInto`, and that is a decision.** The two
   * differ at every branch: the target, the settlement, and what a failed patch
   * means. A shared function with a `target` flag would carry six conditionals
   * and read as one route with exceptions, when it is two routes with a common
   * shape — and the shape is what the route-obligation table already records.
   *
   * **What is genuinely shared is `seq`'s discipline** (C07 I15, I30): a
   * per-stream counter, incremented per patch *adapted* rather than applied,
   * because a patch C07 mapped to `null` still occupied a position. Counting
   * only the applied ones reuses a position after every dropped line, and the
   * collision that produces is the one no test that builds its own context can
   * see.
   */
  const streamIntoView = async (
    displayed: string,
    verb: string,
    patches: AsyncIterable<RawPatch>,
    /** The invocation's validated flags, for `adaptPatch` (C05 I21, F39). */
    flags: Readonly<Record<string, unknown>>,
  ): Promise<void> => {
    let seq = 0;

    /**
     * **A view has no settlement** (C22 I48). `end`, a malformed patch and a
     * failure all append a notice and leave the view open, because the stream
     * ending is not the reader having finished with it — `docker logs` without
     * `-f` ends immediately, and a view that popped would flash and vanish.
     * Only the wording differs, so only the wording is a parameter.
     */
    const finish = (text: string, tone: "ok" | "warn" | "error", id: string): void => {
      // C04 I6 — a toned notice carries a glyph, or `block()` throws and the
      // containment path leaves the reader with a view that simply stopped.
      // F29 is what happens when this is forgotten one layer down.
      deps.documentView.patch({
        op: "append",
        block: block({ kind: "notice", id: blockId(id), tone, glyph: tone, text }),
      });
      // The stall machinery is per host and this one has stopped producing, so
      // `settled` still fires — it is only `transcript.settle` that has no
      // counterpart here, and only because there is no transcript on this route.
      refresh.settled(DOCUMENT_VIEW_ID);
      deps.scheduler.commit("completion");
    };

    try {
      for await (const patch of patches) {
        if (patch.kind === "end") {
          // **The walk said this route has no exit code and it was wrong.**
          // `RawPatch` `end` carries a whole `RawResult`
          // (`transport/types.ts:63`), so the code is right there — the ruling
          // was written from *what a patch is for* rather than from the type,
          // and the type is the thing that can falsify it.
          //
          // It matters to the reader rather than being a detail: a follow that
          // ends because the container stopped is a different event from one
          // that ends because the log ran out, and the code is what separates
          // them. Still not phrased as *the container stopped* — a non-zero
          // code is the `docker logs` process's, and inferring the container's
          // fate from it is a second claim this route cannot make.
          const code = patch.result.exitCode;
          // **And the reason, when there is one.** The first version said only
          // *exited 1*, which a frame-read against a container that does not
          // exist showed to be the wrong half: the reader is told the follow
          // failed and not why, while `stderr` sat on the same `RawResult`
          // carrying `No such container`. The entry route has the transcript's
          // error rendering behind it; this route has only what it appends.
          const why = patch.result.stderr.trim().split("\n")[0] ?? "";
          finish(
            code === 0
              ? "the log stream ended"
              : `the log stream ended — ${why === "" ? `docker exited ${String(code)}` : why}`,
            code === 0 ? "ok" : "warn",
            "stream-end",
          );
          return;
        }

        const view = deps.adapters.adaptPatch(patch, {
          command: displayed,
          verb,
  // **The region's height, because a view's producer is defined by it**
  // (C07 I18, C15 §4). The same source `documentView` reads — a second
  // computation is a producer splitting against an axis the frame does
  // not use, and nothing in the arithmetic would look wrong.
  ...producerContext(deps.region().height),
          userRequestedJson: false,
          flags,
          transport: "subprocess",
          origin: "user",
          tool: null,
          seq,
        });
        seq += 1;
        if (view === null) continue;

        const outcome = deps.documentView.patch(view);
        if (outcome.ok) {
          refresh.sawPatch(DOCUMENT_VIEW_ID);
          deps.scheduler.commit("stream");
          continue;
        }

        if (outcome.reason === "patch") {
          finish(`output truncated: ${outcome.error.message}`, "warn", "truncated");
          return;
        }

        // `"closed"`, `"layer"`, `"project"` — the view is gone or could not be
        // reprojected, so there is nothing to append a notice *to*. Stop
        // consuming: a subprocess still streaming into a layer that has been
        // popped spends a process on output nothing can receive. This is the
        // arm A4 rules, and it is why the owner returns rather than throwing.
        return;
      }
    } catch (cause) {
      finish(`stream failed: ${String(cause)}`, "error", "stream-error");
    }
  };

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
    /** The invocation's validated flags, for `adaptPatch` (C05 I21, F39). */
    flags: Readonly<Record<string, unknown>>,
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
  // `null` — a transcript entry is windowed by rows and has no bound
  // (C07 I18). The terminal's height standing in here would be a region
  // nobody promised.
  ...producerContext(null),
          userRequestedJson: false,
          flags,
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
  const start = (settle: Settle, run: Promise<void>): void => {
    // `line` is read throughout; `settle` carries where its document goes.
    const { line } = settle;

    void run.catch((cause: unknown) => {
      guard.release();
      try {
        appendAndCommit(
          errorDoc(line, { message: String(cause), stage: "pipeline" }, { origin: "user" }),
          settle,
        );
      } catch (second) {
        // The document itself is unbuildable. C23 §5's stage whose failure loses
        // the entry, reached from the one direction §5 did not name — so it
        // records like the other one (I48). Two causes and both are kept: the
        // route's, and the failure to say so.
        contain("pipeline", cause);
        recordFault("pipeline-report", second);
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
  const route = (
    settle: Settle,
    result: Exclude<ParseResult, { kind: "empty" }>,
  ): void => {
    // `line` is read throughout; `settle` carries where its document goes.
    const { line } = settle;

    // **`--help` is answered here, before the local/app split** (C05 I22, F92).
    //
    // Both routes have it, because C05 reserves it on every tool — so putting
    // the check inside either arm would give half the verbs help and leave the
    // other half spawning `docker ps --help`, which is F39 with a different
    // flag. It never travels either way (C05 I21), so this is the only thing
    // that can answer it.
    //
    // `validation.ok` guards it because a malformed invocation should say what
    // is wrong rather than what is possible: `/ps --nonsense --help` is a
    // misspelling, and answering with usage hides the error that caused it.
    if (
      (result.kind === "app" || result.kind === "local") &&
      result.validation.ok &&
      result.validation.args["help"] === true
    ) {
      appendAndCommit(usageDoc(line, result.tool), settle);
      return;
    }

    switch (result.kind) {
      case "error":
        appendAndCommit(errorDoc(line, result.error, { origin: "user" }), settle);
        return;

      case "builtin": {
        const applied = applyBuiltin(result.name, result.args);
        appendAndCommit(
          applied.ok
            ? noticeDoc(line, `${result.name} ${applied.text}`, "muted", { origin: "user" })
            : errorDoc(line, { message: applied.message }, { origin: "user" }),
          settle,
        );
        return;
      }

      case "builtinThenShell": {
        // **C23 I11 — the built-in applies before any delegation**, and C23 T3.13
        // is the other half: one that fails does not delegate.
        const applied = applyBuiltin(result.name, result.args);
        if (!applied.ok) {
          appendAndCommit(errorDoc(line, { message: applied.message }, { origin: "user" }), settle);
          return;
        }
        start(settle, runShell(settle, result.rest));
        return;
      }

      case "shell":
        // C18 §5a's marker, already stripped from `command` (C18 I26) — so the
        // string handed to `sh -c` is the same one either way, and the flag is
        // the only difference between the two routes.
        start(
          settle,
          result.interactive
            ? runHandoff(settle, ["sh", "-c", result.command], headOf(result.command), "shell")
            : runShell(settle, result.command),
        );
        return;

      case "local":
        start(
          settle,
          // **The arguments, not the whole argv.** `ParseResult.argv` begins
          // with the verb — `["theme", "light"]` — and a handler knows its own
          // name, so passing it back means every handler indexes from 1 and the
          // one that forgets reads its own verb as an argument. A multi-token
          // verb (`debug dump`) makes the off-by-one an off-by-two, which is
          // the version that survives review.
          runLocal(
            settle,
            result.tool.name,
            result.argv.slice(result.tool.name.split(" ").length),
            result.validation.ok ? result.validation.args : EMPTY_ARGS,
          ),
        );
        return;

      case "app": {
        // **The pre-spawn gate, above the interactive split** (I38, F119). It
        // lived inside `runApp` — which is the *non-interactive* arm of that
        // split — so an interactive verb was spawned without its invocation
        // being looked at. A handoff suspends the alternate screen before the
        // child starts, so the reader watched their session go away and come
        // back to learn they had missed an argument. D17's argument is that a
        // malformed invocation costs nothing rather than an interpreter's
        // startup, and the route stepping over it was the expensive one.
        //
        // One check, not two: `runApp`'s parameter demands the narrowed
        // validation, so the gate cannot drift back into it.
        if (!result.validation.ok) {
          appendAndCommit(
            errorDoc(
              line,
              result.validation.errors[0] ?? { message: `${result.tool.name}: invalid arguments` },
              { origin: "user", verb: result.tool.name },
            ),
            settle,
          );
          return;
        }

        // **The invocation's contract, not the verb's** (I38, C05 I23). `docker
        // run` attaches by default and detaches with `-d`, so a `ToolDef` field
        // cannot answer this; C05 resolves it from the flags actually given and
        // C18 carries the answer. Both routes read one field name now.
        //
        // The transport is bypassed on the handoff arm: the child owns the
        // terminal and there is no stdout to read (C05 I19 refuses `streams`
        // with it).
        start(
          settle,
          result.interactive
            ? runHandoff(settle, [deps.binary, ...result.argv], result.tool.name, "app")
            : runApp(settle, { ...result, validation: result.validation }),
        );
        return;
      }
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
    // **`null` rather than absent, and that is the same choice as the two above.**
    // The driver's shape is total where the declaration's is optional: a part
    // that named no key is its own source (C23 I42), so there is one code path
    // and the unshared case is the degenerate one rather than a branch.
    source: spec.source ?? null,
    derive: spec.derive ?? null,
    // **No `?? Promise.resolve(null)` fallback** (F78). It existed to cover the
    // `stream` arm, which nothing drove, so its whole effect was to turn an
    // undriven declaration into a part that rendered `render(null)` once — a
    // plausible empty panel rather than a failure. `fetch` is required now.
    fetch: spec.fetch,
    render: spec.render,
    // **Threaded so the driver knows whose block is in the panel** (C23 I52).
    // It is never called from there — `b.live` resolves the placeholder at
    // construction — but resolution consumes the one bit the elapsed counter
    // needs, and a `status` at `loading` cannot be inspected for it: a
    // consumer's own `renderLoading` may return exactly that shape.
    renderLoading: spec.renderLoading ?? null,
    /**
     * **A `status`, and its state is read rather than asserted** (C23 I51).
     *
     * The kind exists for exactly this fact — a backoff counting down — and the
     * driver is the only layer that can see it. What decides the arm is
     * `retryInMs`: **`null` means no retry is coming**, which §3d rule 3 makes
     * true of every one-shot and of every deterministic `render` throw.
     *
     * **Mapping both arms to `retrying` would have shipped a blank row.**
     * `activityLine` draws nothing for a `retrying` box with no countdown, and
     * that row is where the spinner goes — so a one-shot's failure would draw a
     * message and an empty line under it. Found by the classification table
     * before any of this was written (C23 §8a-bis C1, F234).
     *
     * **The heights are a frame read** (F234). Both arms land inside
     * `livePanel`, which already draws a border and carries the title: at 3 the
     * box spends a row on a second border inside the first, and `error` has no
     * activity line, so a second row there is blank by construction.
     *
     * The glyph problem the `notice` form had is gone with the form — `status`
     * carries its own mark from `glyphs(ctx.capabilities)` and cannot be
     * constructed without one. That defect was A03 §2's vacuity class in a
     * default, never exercised because no test had failed a fetch on a part that
     * did not override this, and found by inducing a stall and looking at the
     * frame (F29).
     */
    // **`null` when the declarer supplied none, and the driver resolves it**
    // (C23 I51, I52, F407). This used to write the default in, which is the
    // resolution `renderLoading` beside it deliberately avoids — and it spent the
    // one bit the countdown sweep needs: *whose block is in the panel.* With the
    // default here, a part that declared nothing and a part that declared exactly
    // the framework's shape were identical from the driver, so it could not
    // rewrite `retryInMs` into one without risking the other.
    //
    // **The fallback moved to `refresh.ts`**, which C24 §5 already named as the
    // tidier shape and did not take: the two framework defaults lived one in
    // `builders/index.ts` and one here.
    renderError: spec.renderError ?? null,
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
    // One builder for every route (C23 I40) — this file's.
    producerContext: () => producerContext(null),
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
    // Returns the panel itself, not its child (F22). The caller wants the block
    // as the view holds it, and handing back a child forced a reconstruction
    // that silently dropped every field it did not know to set.
    viewPanel: (id, blockId) => {
      const found =
        id === DOCUMENT_VIEW_ID
          ? deps.documentView.blockAt(blockId)
          : deps.overlays.stack.find((l) => l.id === id)?.content.find((b) => b.id === blockId);
      return found !== undefined && found !== null && found.kind === "panel" ? found : null;
    },
    // C23 I46 — C22 answers, because the answer is C14's for an entry and C15's
    // for a layer (A02 Seam 4).
    visible: deps.visible,
  });

  return {
    submit,
    onAction,
    /**
     * C23 I48 — read by C22 §8 step 3, on the restored primary screen.
     *
     * A copy, because the collection keeps accumulating and a caller holding the
     * live array would see it change under them.
     */
    get faults() {
      return Object.freeze([...faults]);
    },
    identityNotice: (text) => void refresh.identityNotice(text),
    releaseView: () => void refresh.release({ kind: "view", id: DOCUMENT_VIEW_ID }),
    visibilityChanged: () => void refresh.visibilityChanged(),
    // C22 I53 — the greeting is a producer, and this is the one builder.
    producerContext: () => producerContext(null),

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

    /** Where Calcium's own handlers and the app's arrive, before `seal()`. */
    register: (verb: string, handler: LocalHandler) => void local.register(verb, handler),

    get inFlight() {
      return guard.route;
    },

    cancel: () => {
      // The in-flight invocation first, so the entry settles with what it had
      // (C23 I10), then the guard.
      // **The queue goes with it, and before the release** — the order is the
      // whole of the ruling. Reversed, the release drains and the next queued
      // item starts on the keystroke that was meant to stop everything.
      cancelInFlight?.();
      clearQueue();
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
