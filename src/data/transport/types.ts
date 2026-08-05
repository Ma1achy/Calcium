/**
 * What a transport takes and what it reports.
 *
 * C06 §2 — see spec. Types only; enforcement lives in the modules beside this
 * one. The discipline the whole component rests on is that **C06 reports and
 * C07 interprets** (I2): nothing here is a status, an envelope or a mapped exit
 * code, and `RawResult` is a record of what happened rather than a judgement
 * about it. That is what lets transport be tested with no view model in sight.
 *
 * C06 references no C04 type (I1, MG6).
 */

import type { ProcessRunner } from "../process/types.js";

export type Invocation = Readonly<{
  verb: string;
  /** `["ps", "--mine"]` — `--json` is appended by the transport (I4), never typed. */
  argv: readonly string[];
  /** From the manifest. C06 does not read C05; the caller does. */
  streams: boolean;
  /** 0 = unbounded, which is what live views use (commitment 7). */
  timeoutMs: number;
  signal: AbortSignal;
}>;

export type RawResult = Readonly<{
  /** Exactly what was spawned, including `--json` — or for a fixture, what *would* have been. */
  argv: readonly string[];
  /** Null iff killed by a signal. No mapping to a status: that is C07's (I2). */
  exitCode: number | null;
  signal: string | null;
  /** Parsed JSON, or undefined when unparseable. */
  stdout: unknown;
  /** Retained either way (I6), so C07 can always fall back to a `raw` block. */
  stdoutRaw: string;
  /** Never merged into stdout (I5). */
  stderr: string;
  durationMs: number;
  parseError: string | null;
  cancelled: boolean;
  timedOut: boolean;
  /**
   * The runner's buffer bound was crossed, so `stdoutRaw` is a prefix of what
   * the far side wrote (C21 I5). Reported, never interpreted.
   *
   * **Not `meta.truncated`.** That says the fallback adapter capped rows (C07
   * I13); this says bytes never arrived. The remedies differ — widen a cap in
   * one case, reconsider what the far side is asked to emit in the other — and
   * C07 §4 carries the open question of whether this reaches a document at all.
   */
  overflowed: boolean;
}>;

export type RawPatch =
  | Readonly<{ kind: "data"; value: unknown }>
  | Readonly<{ kind: "malformed"; line: string }>
  // A reason and nothing else. It carried a `remaining` string, and the field
  // was a fiction: degradation trips on a completed line, completing a line
  // clears the buffer, so `remaining` was a partial line that was empty in
  // almost every case. What carries the remainder is the `malformed` patches
  // that follow (C06 §5, C07 §6).
  | Readonly<{ kind: "degraded"; reason: string }>
  | Readonly<{ kind: "end"; result: RawResult }>;

export interface VerbTransport {
  invoke(inv: Invocation): Promise<RawResult>;
  /** Always emits exactly one `end`, last, on every termination path (I9). */
  stream(inv: Invocation): AsyncIterable<RawPatch>;
}

export interface TransportRouter {
  /** Total: an unmapped verb gets the default (I14). */
  for(verb: string): VerbTransport;
  readonly busy: boolean;
  /** Verb name, for the refusal message. */
  readonly inFlight: string | null;
}

/**
 * Time enters C06 here and nowhere else (I19).
 *
 * `durationMs` needs the clock twice and the §4 ladder needs two 2 s timers, and
 * both are ambient reads SS1 permits only in `shell/session.ts`. Injected, T3.5
 * asserts each rung against a counter rather than sleeping four seconds a case —
 * the same shape C03 takes its `schedule` in, so `fakeClock()` drives it
 * unchanged.
 */
export type Clock = Readonly<{
  now: () => number;
  schedule: (fn: () => void, ms: number) => Disposable;
}>;

export type FixtureHandler = (inv: Invocation) => RawResult | AsyncIterable<RawPatch>;

/**
 * A recorded or authored response, and where it came from.
 *
 * **Declared here rather than in C08** (A02 §1): a type belongs to the layer that
 * consumes it structurally, not to the component with the most to say about it.
 * C08 has the domain knowledge — provenance policy, recording, redaction, the
 * authored ratio — but `createFixtureTransport` reads this shape, and it is
 * expressed in `RawResult` and `RawPatch`. Declaring it in C08 would put a cycle
 * inside L0 data: C06 importing `Fixture` while C08 imports what it is made of.
 *
 * C08 keeps every rule about it. Nothing here checks that an `authored` fixture
 * has a note — that is C08's build-time check, and duplicating it would put one
 * rule in two places.
 */
export type Fixture = Readonly<{
  id: string;
  verb: string;
  argv: readonly string[];
  provenance: "recorded" | "derived" | "authored";
  /** ISO; null iff authored. */
  capturedAt: string | null;
  cliVersion: string | null;
  /** Required for authored — why recording was impossible. Enforced by C08. */
  note?: string;
  result: RawResult | readonly RawPatch[];
}>;

export type TransportMode = "emulated" | "fixture" | "subprocess";

/**
 * Discriminated on mode, so a mode cannot be constructed without its dependency.
 * A single optional-everything record makes the wrong construction a runtime
 * surprise in the one component whose failures are already other people's.
 *
 * There is no `PRISM_TUI_TRANSPORT` here or anywhere under `src/` (I18). The
 * *app's* entry point resolves it and passes a constructed router through
 * `TuiConfig.transport`; Calcium ships no binary, and a framework that claims
 * to serve other apps has no business reading a variable named for one of them.
 */
export type TransportDeps =
  | Readonly<{
      mode: "subprocess";
      binary: string;
      runner: ProcessRunner;
      clock: Clock;
      env?: Readonly<NodeJS.ProcessEnv>;
      /** Live — pass-through `cd` moves it (I, commitment 14). */
      cwd?: () => string;
    }>
  | Readonly<{ mode: "fixture"; corpus: readonly Fixture[] }>
  | Readonly<{ mode: "emulated"; handler: FixtureHandler }>;

export type { ProcessRunner };
