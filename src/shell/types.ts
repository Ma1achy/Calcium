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

import type { Adapter, AdapterRegistry } from "../data/adapters/index.js";
import type { Manifest, ManifestStore } from "../data/manifest/index.js";
import type { ProcessRunner } from "../data/process/types.js";
import type { TransportRouter } from "../data/transport/index.js";
import type { Block } from "../data/viewmodel/index.js";
import type { CompletionSource } from "../interaction/completion/index.js";
import type { LineEditor } from "../interaction/editor/index.js";
import type { HistoryStore } from "../interaction/history/types.js";
import type { CommandPolicy } from "../interaction/parser/index.js";
import type { BlockDefinition, BlockRegistry } from "../presentation/blocks/index.js";
import type { ThemeSet, ThemeStore } from "../presentation/theme/index.js";
import type { FrameScheduler } from "../terminal/frame-scheduler.js";
import type { TerminalLifecycle } from "../terminal/lifecycle.js";
import type { OverlayManager } from "../viewport/overlay/index.js";
import type { TranscriptStore } from "../viewport/transcript/index.js";
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
export interface FileSystem {
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  appendFile(path: string, data: string): Promise<void>;
  appendFileSync(path: string, data: string): void;
  mkdir(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
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
  /** Cancel what is in flight, settling the entry `partial` (C23 I10). */
  cancel(): void;
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
  editor: LineEditor;
  overlays: OverlayManager;
  theme: ThemeStore;
  history: HistoryStore;
  runner: ProcessRunner;
  lifecycle: TerminalLifecycle;

  /** C23's submit row ends here (A02 Seam 4, C16 I2). A call, not a subscription. */
  resetFocus: () => void;
  /** For `/exit` (C23 §2). */
  stop: (reason: StopReason) => Promise<number>;
  /** C22's injected clock — §3b's three mechanisms and nothing else (C23 I19). */
  clock: () => number;
  /** Scheme-checked by C23 before use (C23 I17). */
  openUrl: (url: URL) => Promise<void>;

  /** For rewriting `/verb` inside a delegated command (C18 I5). */
  binary: string;
  commandPolicy: CommandPolicy;
}>;

export type TuiConfig = Readonly<{
  name: string;
  binary: string;
  manifest: Manifest | string;
  theme: ThemeSet;

  adapters?: Readonly<Record<string, Adapter>>;
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
   * Omitted, it defaults to `{}`, and the shell degrades to ASCII with no
   * colour: the safe direction, and the alternative is a fifth required field.
   */
  env?: Readonly<NodeJS.ProcessEnv>;
  /** The session's starting directory. Defaults to the process's. */
  cwd?: string;
  clock?: () => number;
  fs?: FileSystem;
  /** Default `~/.prism`. The **app** resolves `PRISM_TUI_STATE_DIR` (I20). */
  stateDir?: string;
  /** Default: the OS handler, http/https only. */
  openUrl?: (url: URL) => Promise<void>;
  stdout?: NodeJS.WriteStream;
  stdin?: NodeJS.ReadStream;

  cluster?: string;
  version?: string;

  /** Step 10's seam. Injected so C22's tests construct a graph without C23. */
  pipeline?: PipelineFactory;
}>;

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

/** Thrown by `createTui` for a missing required field (T2.7, I7a). */
export class ConfigError extends Error {
  constructor(readonly field: string) {
    super(`createTui: \`${field}\` is required`);
    this.name = "ConfigError";
  }
}
