/**
 * The interface between the application and everything it runs.
 *
 * C21 §2 — see spec. **Declarations only; the behaviour is `runner.ts`.**
 *
 * The split exists because C06 cannot be built without `ProcessRunner` and C21
 * is not written yet. Declaring the port in C06 instead would invert the
 * dependency — C21 implementing an interface owned by its own consumer — and
 * A03 MG19 says C21 imports nothing but Node's `child_process`. So the type
 * lands with C06 and the runner lands with C21, and `COMPONENT_SOURCES.C21`
 * points at `runner.ts`, the file that must hold the behaviour.
 */

/** `cwd` is a function, read at spawn (C21 I10) — pass-through `cd` moves it. */
export type SpawnOptions = Readonly<{
  cwd: () => string;
  env?: Readonly<NodeJS.ProcessEnv>;
  /** Default 8 MiB per stream (C21 I5). Beyond it the handle drains rather than blocking the child. */
  maxBufferBytes?: number;
}>;

export type Exit = Readonly<{ code: number | null; signal: string | null }>;

/**
 * `stdout` and `stderr` are separate and never merged (C21 I3), and both decode
 * streaming UTF-8 (I4) — a multi-byte character split across a chunk boundary is
 * one character. C06 parses NDJSON line by line and would otherwise see mojibake
 * at exactly the buffer boundaries.
 */
export interface ChildHandle {
  readonly pid: number | null;
  readonly stdout: AsyncIterable<string>;
  readonly stderr: AsyncIterable<string>;
  /** Always resolves, spawn failure included (C21 I13). */
  readonly exited: Promise<Exit>;
  readonly running: boolean;
  /**
   * The buffer bound was crossed and output was dropped (C21 I5).
   *
   * A field rather than a sentinel in the stream: a marker chunk is
   * indistinguishable from content the child emitted, and C06 would read it as a
   * line of NDJSON and report it malformed. A fact about a channel does not
   * travel inside it.
   */
  readonly overflowed: boolean;
  /** Delivered to the process group. False on an already-exited child, never a throw (C21 I9). */
  signal(sig: string): boolean;
}

/**
 * `spawn` and `spawnShell` are separate methods rather than a flag, because the
 * distinction is the security-relevant one (A01 D18) and a boolean makes it
 * invisible at the call site. C06 uses `spawn` and only `spawn`.
 *
 * C21 delivers signals; **C06 owns the escalation ladder** and its timings
 * (C21 I8, C06 §4). Nothing in this interface schedules anything.
 */
/**
 * What C21 is given, because it reaches for nothing (C21 I14).
 *
 * Three ambient reads, three dependencies. `env` is where `$SHELL` is resolved
 * from and what `SpawnOptions.env` overlays, since A03 SS10 bans `process.env`
 * everywhere in `src/` outside C02. `debug` is where the shell-fallback warning
 * goes, since SS33 bans `console.*` and C21 cannot import C01's writer.
 *
 * `stdin` is the one that earns the pattern rather than merely obeying it: it is
 * the raw-mode probe of §5, and injected it makes **I6 assertable** — a test
 * hands it `{ isRaw: true }`. Against the real `process.stdin` the same test
 * would have to put the runner's own terminal into raw mode and hope to restore
 * it, and an invariant checkable only by mutating global state is one that ends
 * up unchecked.
 */
export type ProcessRunnerDeps = Readonly<{
  env: Readonly<NodeJS.ProcessEnv>;
  stdin: Readonly<{ isRaw?: boolean }>;
  debug?: (line: string) => void;
}>;

export interface ProcessRunner {
  spawn(argv: readonly string[], opts: SpawnOptions): ChildHandle;
  spawnShell(command: string, opts: SpawnOptions): ChildHandle;
  handoff(argv: readonly string[], opts: SpawnOptions): Promise<Exit>;
  readonly live: readonly ChildHandle[];
  killAll(): Promise<void>;
}
