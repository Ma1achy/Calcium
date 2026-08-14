/**
 * C22's shapes: the config an app supplies, the session state that belongs to
 * no component, and the two seams C22 declares for things it does not own.
 *
 * **The seams point downward even though C23 is beside C22 in L4.** `Pipeline`
 * is declared here rather than imported from `execution.ts` for the reason C20
 * declares `HistoryFs` and C19 declares `ReadDir`: a narrow interface named by
 * the consumer cannot grow a member the consumer never needed, and a wider one
 * lets a later edit reach for something that was never part of the contract.
 * C23 satisfies it structurally when it lands.
 */

import type { ConfirmHost } from "./confirm.js";
import type { Adapter, AdapterRegistry, ProducerContext } from "../data/adapters/index.js";
import type { ManifestDocument, ManifestStore } from "../data/manifest/index.js";
import type { ProcessRunner } from "../data/process/types.js";
import type { TransportRouter } from "../data/transport/index.js";
import type { Action, Block, ViewDocument } from "../data/viewmodel/index.js";
import type { EntryId } from "../viewport/transcript/index.js";
import type { DocumentView } from "./document-view.js";
import type { PatchView } from "./patch-view.js";
import type { RefreshHost } from "./refresh.js";
import type { CompletionSource } from "../interaction/completion/index.js";
import type { FocusTarget } from "../interaction/router/types.js";
import type { CursorStyle } from "../terminal/escapes.js";
import type { LineEditor } from "../interaction/editor/index.js";
import type { HistoryStore } from "../interaction/history/types.js";
import type { CommandPolicy } from "../interaction/parser/index.js";
import type { BlockDefinition, BlockRegistry } from "../presentation/blocks/index.js";
import type { ThemeSet, ThemeStore } from "../presentation/theme/index.js";
import type { FrameScheduler } from "../terminal/frame-scheduler.js";
import type { TerminalCapabilities } from "../terminal/capabilities.js";
import type { TerminalLifecycle } from "../terminal/lifecycle.js";
import type { OverlayManager } from "../viewport/overlay/index.js";
import type { TranscriptStore } from "../viewport/transcript/index.js";
import type { LocalContext, LocalHandler } from "./local/registry.js";
import type { ExecutionWrites } from "./state.js";

/** The five triggers of §8. Three reach `stop`; two are C01's (I4). */
export type StopReason = "exit" | "eof" | "interrupt" | "signal" | "fault";

export type Identity = Readonly<{
  user: string;
  email: string;
  groups: readonly string[];
  /** ms; null = no expiry known. */
  expiresAt: number | null;
}>;

export type Health = "live" | "degraded" | "offline" | "expiring";

/**
 * §5 — nine fields, seven with one writer and two with none.
 *
 * `cluster` and `version` are set at construction and never written after, and
 * they are in the type rather than beside it because chrome reads them off the
 * snapshot (S01 §2). A second cluster is a second session.
 */
export type SessionSnapshot = Readonly<{
  cwd: string;
  /** `export` overrides. */
  env: Readonly<Record<string, string>>;
  /** For `$_`. */
  lastUuid: string | null;
  identity: Identity | null;
  cluster: string;
  health: Health;
  version: string;
  /** A command held for retry after re-login. */
  retained: string | null;
  /** Set by `stop()`; C23 refuses submissions once true. */
  stopping: boolean;
}>;

/**
 * §6 — session, plus the two things a snapshot cannot carry.
 *
 * `now` is not a snapshot field because it ticks per frame while every other
 * field changes on an event, and I11 would then be satisfied by a writer firing
 * sixty times a second. `columns` is C01's to hand down (C01 I13).
 */
export type ChromeContext = Readonly<{
  session: SessionSnapshot;
  now: number;
  columns: number;
  /**
   * Copy mode is up (C16 §5b).
   *
   * **Handed down rather than left to the default header**, because an app that
   * supplies its own chrome supplies all of it — and copy mode is the one mode
   * whose entire effect is that things stop responding. A reader whose mouse
   * has gone dead with nothing on screen saying why has been given a bug.
   *
   * Not on `SessionSnapshot`: that is what a *command* runs against, and this is
   * a property of the frame, like `columns`.
   */
  copyMode: boolean;
}>;

export type ChromeFn = (ctx: ChromeContext) => readonly Block[];

/**
 * Superset of C20's `HistoryFs` (C22 §2), so the injected value passes straight
 * down with no adapter.
 *
 * `appendFileSync` is the one synchronous member and it exists for C20 I18:
 * `beforeRelease` cannot await, and the append in flight at exit is the command
 * the user has just typed.
 */
/**
 * **`exists` was removed rather than allow-listed.** It was declared here,
 * implemented in `session.ts` over `fs.access`, supplied by both test fakes,
 * and called by nothing anywhere — MG24's own disposition is *wire it or remove
 * it*, and there was nothing to wire it to: `mkdir` is `recursive: true`, so a
 * prior existence check would be a call whose answer changes nothing.
 *
 * Narrowing a public type is cheap now and a breaking change after the freeze,
 * which is the whole argument for doing it here. FINDINGS F96.
 */
export interface FileSystem {
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  appendFile(path: string, data: string): Promise<void>;
  appendFileSync(path: string, data: string): void;
  mkdir(path: string): Promise<void>;
  /**
   * C19's `ReadDir`, for the path and executable completion sources (§2b).
   *
   * Here rather than beside them because C22 is the only file that may reach
   * `node:fs` (I10) — a second filesystem route would put two in the graph.
   */
  readDir(path: string): Promise<readonly Readonly<{ name: string; directory: boolean }>[]>;
}

/**
 * What C22 needs from C23, and nothing more (§3a, step 10).
 *
 * `seal` is here because C23's is the fourth of I3's seals: the app's local
 * handlers arrive through config and C23 is what holds them, so it cannot be
 * sealed at step 4 with C05's, C07's and C09's. (C19's registry is the fourth
 * one *built* and has no seal at all — `register` returns a `Disposable`, by
 * design. Four built, four sealed, and they are not the same four.)
 */
export interface Pipeline {
  submit(line: string): void;
  /**
   * What the pipeline's bare catches swallowed (C23 I48, F15).
   *
   * **Returned, never emitted** — C02's ruling taken a third time, after C20.
   * C23 decides what is wrong; C22 §8 step 3 decides when the user is told, on
   * the restored primary screen, because a diagnostic written to the alternate
   * screen is discarded with it.
   */
  readonly faults: readonly string[];
  seal(): void;
  readonly sealed: boolean;
  /**
   * Which foreground route is in flight, for C16's Ctrl-C rungs 1 and 2
   * (C16 §5, C23 §8a A1). `null` when idle.
   *
   * The route rather than a boolean: C23's guard covers every foreground route
   * (C23 I5), so a boolean makes rung 1 fire on a `shell` delegation and swallows
   * rung 2.
   */
  readonly inFlight: "app" | "local" | "shell" | null;
  /** How many `streams: true` subscriptions are live (C16 §5, C23 I6). */
  readonly liveStreams: number;
  /** Cancel the newest one; `false` when there is none. */
  cancelNewestStream(): boolean;
  /** Cancel what is in flight, settling the entry `partial` (C23 I10). */
  cancel(): void;
  /**
   * Where Calcium's own local handlers and the app's arrive (C23 §2).
   *
   * Before `seal()`, which reconciles them against the manifest (C23 I27) — and
   * that is why the registry cannot seal at step 4 with the other three: the
   * app's handlers arrive with the pipeline (C22 I3).
   */
  register(verb: string, handler: LocalHandler): void;
  /**
   * C09's `RenderContext.onAction` (C23 §3a, I16).
   *
   * **Nothing else may supply it.** An action is a submission by another route,
   * and routing submissions is what C23 does — a block library dispatching its
   * own would be L1 causing effects in L2 and L4 at once.
   */
  onAction(action: Action, from?: EntryId | null): void;
  /**
   * The document view was popped — stop its parts now (C22 I46).
   *
   * **At the pop, not a tick later.** Without this the driver only discovers a
   * gone host when a fetch resolves into it and `putBlock` returns false, so one
   * more request runs against a view nobody is looking at. That lazy path stays
   * as the backstop it was; this is the trigger C23 I33's set was missing.
   */
  releaseView(): void;
  /**
   * Something moved on screen, so which hosts are visible may have changed
   * (C23 I46).
   *
   * **Heard rather than polled**, which is I33's disposition for eviction one
   * level down. A paused source is not what the timer arms to — arming to an
   * overdue source nobody is looking at would spin at zero — so without this
   * signal a scroll back into view would resume nothing until the next unrelated
   * wake-up, and a session whose only live parts were off screen would never
   * resume at all.
   */
  visibilityChanged(): void;
  /**
   * The producer context, for C22's greeting (C22 I53, C23 I40).
   *
   * **Exposed so there is one builder rather than two.** The greeting fires
   * from `session.ts`, which holds the lifecycle, the capabilities and the
   * registry and could assemble a second one — which is the two-records defect
   * the grant exists to close, reproduced one file over.
   */
  producerContext(): ProducerContext;
  /**
   * C22's identity loop signalling a transition worth saying out loud (C23 §3b).
   *
   * **C22 signals, C23 appends** — the loop produces a *fact* and not an entry,
   * which is every other Seam 4 row's shape and keeps C23 the only component
   * that appends. The document carries `origin: "refresh"`, and this is the only
   * path that sets it: §3b's other two mechanisms patch, and a patch has no
   * `meta`.
   */
  identityNotice(text: string): void;
  /**
   * §4 step 7's greeting, appended (I44).
   *
   * **C22 fires and C23 appends**, which is A02 Seam 4 and the same division
   * `identityNotice` above makes: the loop produces a fact, and C23 is the only
   * component that appends. A whole document rather than a line of text, because
   * S02 §1 is explicit that the welcome is an ordinary `ViewDocument` and not
   * chrome — so `/clear` removes it, it scrolls away, and a `b.live` part inside
   * it is driven because it took the route every other document takes (C23 I33a).
   */
  greeting(doc: ViewDocument): void;
  /**
   * Stops §3b's timers. Called at C22 §8 **step 1**, where `stopping` is set.
   *
   * **The step matters and the invariant says so** (C23 I12). `stopping()` is
   * read at the top of a tick, which cannot see work already in flight; a
   * `fetch` that resolves during teardown patches a transcript being torn down,
   * which is precisely what I12's own sentence promises does not happen. So the
   * timers are stopped where the flag is set, ahead of `beforeRelease` — the
   * ordering §8 already keeps for `killAll()` against `history.drain()`.
   *
   * It had no caller at all: `RefreshDriver.dispose` existed, was implemented,
   * and was named nowhere in `src/`, so the driver's timer outlived every
   * session that ended.
   */
  dispose(): void;
}

/** Step 10. Takes the router because C23's submit row ends `resetFocus()`. */
export type PipelineFactory = (deps: PipelineDeps) => Pipeline;

/**
 * What step 10 hands C23 — **a subset of the graph, by interface, never `Graph`**
 * (C22 §Consumed-by, §3a step 10).
 *
 * Each collaborator arrives as its owning component's own interface. The
 * narrowness lives there, which is where it already is; thirteen consumer-named
 * wrappers would be thirteen more things to keep in step with their owners, and
 * `Graph` itself would hand over stores C23 must not touch.
 *
 * **`session` is a function and that is a correction, not a style.** It was
 * `SessionSnapshot`, evaluated once at step 10, against a store that freezes a
 * *fresh* object per write (`state.ts`) — so the value could never change, C23
 * I12's `stopping` was false forever, and T3.15 could not have been written.
 *
 * **`writes` is exactly §5's four rows for C23.** Passing the whole `SessionStore`
 * would put `beginStopping` and the identity loop's `refresh` in the pipeline's
 * reach, which is the two-writer problem §5 exists to prevent.
 */
export type PipelineDeps = Readonly<{
  session: () => SessionSnapshot;
  writes: ExecutionWrites;

  transcript: TranscriptStore;
  scheduler: FrameScheduler;
  transport: TransportRouter;
  adapters: AdapterRegistry;
  manifest: ManifestStore;
  blocks: BlockRegistry;
  /**
   * C02's **resolved** record, for `ProducerContext.capabilities` (C07 I19).
   *
   * The resolved one, not `detect()`'s: overrides are applied at construction
   * (C22 I49), and a second derivation is F124 reproduced inside the framework.
   */
  capabilities: TerminalCapabilities;
  /**
   * The region a view fills (C15 §4) — for `ProducerContext.height` on the one
   * route where a bound exists (C07 I18).
   *
   * The same source `documentView` reads, rather than a second computation of
   * it: two answers to *how big is the region* is how a producer splits against
   * an axis the frame does not use.
   */
  region: () => Readonly<{ width: number; height: number }>;
  editor: LineEditor;
  overlays: OverlayManager;
  /**
   * The fullscreen patch view (C25 §3b), for the `view` action's arm.
   *
   * On the pipeline's deps rather than reached through `overlays`, because the
   * refusal it returns is C23's to patch into the source entry and the stack
   * check that produces it is the view owner's (C23 I31).
   */
  patchView: PatchView;
  /** C22 §13a — raised when a verb's declaration says its result is a view. */
  documentView: DocumentView;
  /**
   * Whether anyone is looking at a live part's host (C23 I46).
   *
   * **Answered by C22 and not by the pipeline**, because the answer is C14's for
   * an entry and C15's for a layer, and a pipeline reaching into two stores to
   * decide when to poll is the seam A02 Seam 4 exists to hold. It is also why
   * `refresh.ts` still imports nothing from `viewport/` but a type.
   */
  visible: (host: RefreshHost) => boolean;
  /**
   * `ctx.ask`'s host (C23 I36).
   *
   * On the deps rather than built here, because C22's own exit rung asks the
   * same question through the same object — one confirm mechanism, one
   * rendering.
   */
  confirm: ConfirmHost;
  theme: ThemeStore;
  /** Persist the chosen variant (C22 I40). Absent in harnesses with no state directory. */
  persistTheme?: (name: string) => void;
  /** `--no-bg` for one invocation, written by `/theme`'s handler (C22 I66). */
  setSuppressBackground: (suppressed: boolean) => void;
  history: HistoryStore;
  runner: ProcessRunner;
  lifecycle: TerminalLifecycle;

  /**
   * Discards whatever the decoder half-decoded (C16 I18, C22 I25).
   *
   * Called on the resume side of a handoff and nowhere else. C01 knows the
   * terminal came back and holds no decoder; C16 holds the state and cannot see
   * the gap, because a gap in bytes is what a slow link looks like. Only the
   * shell knows both, and this is the shell's seam into it.
   */
  resetInput: () => void;

  /** C23's submit row ends here (A02 Seam 4, C16 I2). A call, not a subscription. */
  resetFocus: () => void;
  /** For `/exit` (C23 §2). */
  stop: (reason: StopReason) => Promise<number>;
  /** C22's injected clock — §3b's three mechanisms and nothing else (C23 I19). */
  clock: () => number;
  /** C22's ambient `setTimeout`, for §3b's timers. Nothing else schedules. */
  schedule: (fn: () => void, ms: number) => Disposable;
  /** Scheme-checked by C23 before use (C23 I17). */
  openUrl: (url: URL) => Promise<void>;

  /**
   * Every binding C16 will dispatch, for `/help` (C23 I26).
   *
   * Read rather than restated: a hand-written help text guarantees drift, and
   * a binding shown that C16 does not dispatch is the drift arriving.
   */
  bindings: () => readonly Readonly<{ keys: string; does: string }>[];
  /** For rewriting `/verb` inside a delegated command (C18 I5). */
  binary: string;
  commandPolicy: CommandPolicy;
}>;

export type TuiConfig = Readonly<{
  name: string;
  binary: string;
  /**
   * The app's own verbs, or a path to a JSON document containing them.
   *
   * **A `ManifestDocument`, not a `Manifest`** (C22 I23a). A `Manifest` is what
   * `parseManifest` returns — it carries `appTools` and the framework's six
   * verbs, both derived — so asking for one was asking for the parser's output
   * before the call, and the only function that produces it is exported nowhere.
   * Construction parses whichever arm arrives.
   */
  manifest: ManifestDocument | string;
  theme: ThemeSet;

  /**
   * The cursor's shape, per focus target (C22 I63, §6f, roadmap entry 45).
   *
   * **Keyed on the focus target and not on the layer**, and that is a check
   * rather than a preference: `FOCUS_ORDER` has seven members and exactly two —
   * `overlay` and `pushedView` — are layers, so a style on `Layer` would cover
   * two-sevenths of its subject while reading as total, and the prompt, which is
   * the case that motivates the feature, is not a layer at all.
   *
   * A target with no entry takes `fallback`; a `fallback` of `null`, or absent,
   * means **the terminal's own** — Calcium writes nothing and the user's own
   * setting stands. `null` for a target is the same answer stated per target.
   *
   * There is no third inheritance link and there cannot be: `FOCUS_ORDER` is a
   * priority list rather than a tree, so there is no containing target to
   * inherit from.
   */
  cursor?: Readonly<{
    fallback?: CursorStyle | null;
    targets?: Partial<Record<FocusTarget, CursorStyle | null>>;
  }>;

  adapters?: Readonly<Record<string, Adapter>>;
  /**
   * The app's own local verbs (§2a, I3a).
   *
   * Registered at step 10 before `seal()`, which is what makes C23 I27's
   * reconciliation see them. A manifest verb marked `local` with no handler
   * here fails construction naming the verb — correctly, and until this field
   * existed there was no way to satisfy it.
   */
  localHandlers?: Readonly<Record<string, LocalHandler>>;
  /**
   * **Not the type `createTui` accepts.** This field is what the shell reads;
   * `ExactLocalHandlers` is what the call site must satisfy (C23 I39). The two
   * differ because a handler assignable to `LocalHandler` may still have
   * declared a context it cannot be told anything through.
   */
  commandPolicy?: CommandPolicy;
  completionSources?: readonly CompletionSource[];
  chrome?: Readonly<{ header: ChromeFn; footer: ChromeFn }>;
  blocks?: readonly BlockDefinition[];
  transport?: TransportRouter;

  /** Off by default; 50 when enabled without a count (C13 §5a). */
  debug?: Readonly<{ retainPayloads?: number }>;

  /**
   * The process environment, supplied by the app (I20).
   *
   * C02 and C21 each take one and **no file under `src/` reads `process.env`** —
   * not even C02, which is allow-listed for it and does not use the allowance.
   * **Omitted, it defaults to `{}`, and the shell refuses to open** (C22 I61).
   * The sentence here used to say it *"degrades to ASCII with no colour: the
   * safe direction"*, which was true about two of the three consequences and
   * silent about the one that ends the process (F8). C02 derives
   * `bracketedPaste`, `mouse` and `altScreen` from one `usable` flag that is
   * false without `TERM`:
   *
   *     env {} → altScreen: false  colourDepth: 1  unicode: ascii
   *
   * Colour and unicode do degrade. `altScreen` is not a fallback — it is the
   * one hard requirement (C02 I7) — so the safe direction was the opposite of
   * what the default does, and it read as reassurance while being the failure.
   *
   * The default stands, because a fifth required field is what I17 forbids and
   * R01 §1 tests. What changed is that gate 3b now names `env` at the point of
   * exit instead of leaving C01 to name a capability the author never mentioned.
   */
  env?: Readonly<NodeJS.ProcessEnv>;
  /**
   * C02's capability overrides, wired (I49).
   *
   * `detectCapabilities(env, overrides)` has taken these since C02 was written:
   * C02 I4 makes a valid one win unconditionally, including for `altScreen`,
   * an unknown key is ignored and an out-of-range value is rejected with a
   * warning. **Nothing an application could call ever supplied them** — this
   * line is the producer, and until it existed the two callers in the tree were
   * `construct.ts` passing one argument and a test fixture reaching in by deep
   * import.
   *
   * The consumer that found it is the degradation showcase, at the depth that
   * matters most: `colourDepth: 1` follows only from C02's `dumb` gate, and
   * that gate also clears `altScreen`, which C02 I7 makes the one refusal that
   * stops the shell. So 1-bit was unreachable by any application.
   *
   * **`| undefined` is load-bearing, not noise.** This tree compiles with
   * `exactOptionalPropertyTypes`, under which an optional property and a
   * property that may be undefined are different types — so without it a
   * consumer computing the value conditionally cannot supply the field at all:
   * neither `capabilities: maybe` nor `...(maybe === undefined ? {} : { … })`
   * type-checks, and only a cast gets past. Every other optional field on this
   * type has the same shape and no consumer has needed one conditionally yet
   * (FINDINGS F53). Fixed here because this is the field with a consumer.
   */
  capabilities?: Partial<TerminalCapabilities> | undefined;
  /** The session's starting directory. Defaults to the process's. */
  cwd?: string;
  clock?: () => number;
  fs?: FileSystem;
  /** Default `.calcium`, beside the project. The **app** resolves its own variable (I20). */
  stateDir?: string;
  /** Default: the OS handler, http/https only. */
  openUrl?: (url: URL) => Promise<void>;
  stdout?: NodeJS.WriteStream;
  stdin?: NodeJS.ReadStream;

  cluster?: string;
  version?: string;

  /** Step 10's seam. Injected so C22's tests construct a graph without C23. */
  pipeline?: PipelineFactory;

  /**
   * Where identity comes from (C22 §7, I43). Defaults to a fetcher returning
   * `null` — a working default, as every optional field has (I17).
   *
   * **C22 owns the cadence and the state; the source is the far side's** (§13),
   * so this is a seam rather than a mechanism here. It was a stub with no field
   * behind it, commented *until the app supplies one*, and nothing could: which
   * is why §7's expiry notice had two independent things between it and a
   * reader, and why removing either alone changed no behaviour at all.
   */
  identity?: () => Promise<Identity | null>;

  /**
   * The session's first entry (§4 step 7, I44, C24 §2).
   *
   * **Step 7 said "fire banner fetches, non-blocking" and nothing fired
   * anything.** S02 specifies this entry in detail and cites the step; T3.10 and
   * T3.11 test it and were never written. Three documents agreed about a thing
   * no code did, and the consumer that respected the package boundary went
   * looking for the field and found none — step 12's shape, a second time in the
   * same list.
   *
   * **Not awaited.** Input is accepted at step 8 whatever this does: a greeting
   * that hangs leaves the prompt usable and produces no entry, and one that
   * rejects is contained and the session continues.
   *
   * A `b.live` part inside it ticks until the entry is evicted or the transcript
   * is cleared — **not** until the first command (C23 I9, C23 I33). An app that
   * wants launch cheap omits `every` and gets a one-shot.
   */
  greeting?: (ctx: ProducerContext) => ViewDocument | Promise<ViewDocument>;
}>;

/**
 * C23 I39 — a local handler's context is obligatory, and a wider parameter is
 * refused.
 *
 * **A parameter type may always be wider than what is passed.** That is not a
 * gap in `LocalContext`'s declaration; it is how function assignability works,
 * and it always will be. So a handler written `(argv, ctx: { command: string })`
 * is legal TypeScript that compiles, registers, runs, and **can never see a
 * field the framework adds** — measured at four of the reference app's eight
 * handler families, where the split is exact: the four that name the type are
 * the four that call `ask` (F125).
 *
 * The sentence that published `LocalContext` — *a handler that asks cannot name
 * the type of the thing it is asking through* — is true about the handlers it
 * describes and silent about the other half. MG24's shape (F84), and the second
 * instance of a correct sentence justifying a scope it does not reach.
 *
 * **This is C07 I13's `never` keys in reverse.** There a supplied return value
 * the registry discards fails to compile rather than failing to matter; here it
 * is a declared parameter. It is the direction with something to bite on: F13's
 * narrowing landed correctly and changed nothing at four call sites, because a
 * hand-written shape was structurally assignable.
 *
 * **A check on the declaration, not on assignability.** *The parameter is
 * invariant* would be the wrong description: variance governs whether a function
 * is assignable to `LocalHandler`, and this never asks that — it recovers the
 * declared type through `infer` and tests it directly. Which is why the shape
 * variance would have let through is refused too: an **object method**, whose
 * parameters are bivariant, is rejected exactly as an arrow is. Probed across a
 * named const, an inline arrow, an object method and a pre-typed record.
 *
 * **Only one direction is new, and the mutation pass is what said so.** A
 * handler declaring `LocalContext & { extra }` is *already* refused by
 * assignability alone — a parameter wider than what is passed has never been
 * legal. What this adds is the **narrower** arm and the **optional** one; the
 * mutual form is how the check is written, not the work it does. Removing it
 * from `createTui` kills three of the four tier-6 rows and leaves the wider one
 * passing, which is the row being a restatement of a rule it does not test.
 *
 * The four arms, each measured by probe before this was written down:
 *
 * | declared | verdict |
 * |---|---|
 * | `ctx: LocalContext`, or typed as `LocalHandler` | accepted |
 * | no second parameter at all | accepted — nothing declared, nothing to miss |
 * | `ctx: { command: string }` · `ctx: LocalContext & { … }` | refused |
 * | `ctx?: …`, whatever the type | refused |
 *
 * **The optional arm is not pedantry and the first version of this type got it
 * wrong twice.** `ctx?: LocalContext` declares a handler that may run with no
 * context, which is exactly the direct-call shape this exists to kill — the
 * reference app invokes a handler outside the shell with an object literal that
 * has no `ask` and compiles. And the first draft refused a handler taking only
 * `argv`, because `infer C` on a one-parameter function yields `unknown`. Both
 * were found by the probe and neither is visible in the type.
 */
export type ExactLocalHandlers<T> = {
  [K in keyof T]: T[K] extends (...a: infer A) => unknown
    ? A["length"] extends 0 | 1
      ? T[K]
      : A extends readonly [readonly string[], (infer C)?, ...unknown[]]
        ? [LocalContext] extends [C]
          ? [C] extends [LocalContext]
            ? T[K]
            : never
          : never
        : never
    : never;
};

/**
 * What `createTui` accepts: a `TuiConfig` whose handlers have named their
 * context (C23 I39). The shell reads `TuiConfig`; the boundary checks this.
 */
export type TuiConfigInput<C extends TuiConfig> = C & {
  localHandlers?: ExactLocalHandlers<C["localHandlers"]>;
};

export interface TuiInstance {
  start(): Promise<void>;
  /** Resolves with the exit code. */
  stop(reason: StopReason): Promise<number>;
  readonly session: SessionSnapshot;
}

export type SessionState = "created" | "running" | "stopped";

/** Thrown for §9's two illegal cells, named so a test asserts which (T3.1). */
export class SessionStateError extends Error {
  constructor(
    readonly operation: string,
    readonly state: SessionState,
  ) {
    super(`cannot ${operation}() while ${state}: stopped is terminal — construct a new session`);
    this.name = "SessionStateError";
  }
}

/**
 * Thrown by gate 3b when the resolved record cannot open a terminal (I61, T3.20).
 *
 * **It names the cause; C01's refusal could only name the consequence** (F8). C01
 * raises *"alternate screen unsupported — the shell cannot open"* and is entitled
 * to nothing but the capability record, so an author who omitted `env` was told
 * about a capability they never mentioned. C22 holds the record and the config
 * and is the only layer that holds both.
 *
 * `remedy` is the config field or variable to change, not a description of the
 * failure — it is what the reader has to go and edit. **Not `cause`**: `Error`
 * has carried that member since ES2022, and shadowing it would put the string
 * where every logger looks for a nested error.
 */
export class UnusableTerminalError extends Error {
  constructor(readonly remedy: string) {
    super(`the terminal cannot open: no alternate screen — ${remedy}`);
    this.name = "UnusableTerminalError";
  }
}

/** Thrown by `createTui` for a missing required field (T2.7, I7a). */
export class ConfigError extends Error {
  constructor(readonly field: string) {
    super(`createTui: \`${field}\` is required`);
    this.name = "ConfigError";
  }
}
