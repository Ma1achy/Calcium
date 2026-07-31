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

import type { Adapter } from "../data/adapters/index.js";
import type { Manifest } from "../data/manifest/index.js";
import type { TransportRouter } from "../data/transport/index.js";
import type { Block } from "../data/viewmodel/index.js";
import type { CompletionSource } from "../interaction/completion/index.js";
import type { CommandPolicy } from "../interaction/parser/index.js";
import type { BlockDefinition } from "../presentation/blocks/index.js";
import type { ThemeSet } from "../presentation/theme/index.js";

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
 * `seal` is here because I3 counts five registries and the fifth is C23's: the
 * app's local handlers arrive through config and C23 is what holds them, so the
 * seal cannot happen at step 4 with the other four.
 */
export interface Pipeline {
  submit(line: string): void;
  seal(): void;
  readonly sealed: boolean;
}

/** Step 10. Takes the router because C23's submit row ends `resetFocus()`. */
export type PipelineFactory = (deps: PipelineDeps) => Pipeline;

export type PipelineDeps = Readonly<{
  session: SessionSnapshot;
  resetFocus: () => void;
  stop: (reason: StopReason) => Promise<number>;
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
