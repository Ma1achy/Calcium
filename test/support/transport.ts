// Fakes for C06's tiers 1-3. No real process, no real timer.
//
// C21 is not built, so the runner is faked — but faked *against C21 §2*, not
// invented. Everything C06 asks of a child is in that interface: separate
// `AsyncIterable<string>` streams, an `exited` that always resolves, and a
// `signal` that returns false on a dead child rather than throwing. A fake that
// drifted from it would let C06 pass here and fail on the day C21 lands.
import type {
  ChildHandle,
  Exit,
  ProcessRunner,
  SpawnOptions,
} from "../../src/data/process/types.js";
import type {
  Clock,
  Fixture,
  Invocation,
  RawPatch,
  RawResult,
  VerbTransport,
} from "../../src/data/transport/index.js";
import {
  createEmulatedTransport,
  createFixtureTransport,
  createSubprocessTransport,
} from "../../src/data/transport/index.js";
import { fakeClock, type FakeClock } from "./fake-scheduler.js";

/** `fakeClock` supplies `schedule`; `now` is the same counter, read explicitly. */
export function clockOf(fake: FakeClock): Clock & { tick(ms: number): void } {
  let now = 0;
  return {
    now: (): number => now,
    schedule: fake.schedule,
    tick: (ms: number): void => {
      now += ms;
      fake.advance(ms);
    },
  };
}

export type ScriptedChild = {
  /** Chunks the child writes to stdout, in order. Not lines — chunk boundaries are the point. */
  stdout?: readonly string[];
  stderr?: readonly string[];
  /** Resolved when the child exits. Omit to leave it running until signalled. */
  exit?: Exit;
  /** Signals this child ignores. Everything else ends it. */
  ignores?: readonly string[];
  /** Exit reported when a signal ends it. */
  onSignal?: (sig: string) => Exit;
};

export type FakeChild = ChildHandle & {
  /** Every signal delivered, in order — the ladder's assertion (T3.5). */
  readonly signals: readonly string[];
  /** Push another stdout chunk after construction, for mid-stream tests. */
  emit(chunk: string): void;
  close(exit?: Exit): void;
};

function stream(initial: readonly string[]): {
  iterable: AsyncIterable<string>;
  push(chunk: string): void;
  end(): void;
} {
  const queue: string[] = [...initial];
  const waiting: ((v: IteratorResult<string>) => void)[] = [];
  let ended = false;

  const pump = (): void => {
    while (waiting.length > 0 && (queue.length > 0 || ended)) {
      const resolve = waiting.shift()!;
      const value = queue.shift();
      resolve(value === undefined ? { value: undefined, done: true } : { value, done: false });
    }
  };

  return {
    iterable: {
      [Symbol.asyncIterator]: (): AsyncIterator<string> => ({
        next: (): Promise<IteratorResult<string>> => {
          if (queue.length > 0) return Promise.resolve({ value: queue.shift()!, done: false });
          if (ended) return Promise.resolve({ value: undefined, done: true });
          return new Promise((resolve) => void waiting.push(resolve));
        },
      }),
    },
    push: (chunk: string): void => {
      queue.push(chunk);
      pump();
    },
    end: (): void => {
      ended = true;
      pump();
    },
  };
}

export function fakeChild(script: ScriptedChild = {}): FakeChild {
  const out = stream(script.stdout ?? []);
  const err = stream(script.stderr ?? []);
  const signals: string[] = [];
  let running = true;
  let settle!: (exit: Exit) => void;
  const exited = new Promise<Exit>((resolve) => {
    settle = resolve;
  });

  const close = (exit: Exit = { code: 0, signal: null }): void => {
    if (!running) return;
    running = false;
    out.end();
    err.end();
    settle(exit);
  };

  if (script.exit !== undefined) {
    out.end();
    err.end();
    running = false;
    settle(script.exit);
  } else if (script.stdout !== undefined && script.ignores === undefined) {
    // A scripted stdout with no explicit exit means "these chunks then done".
    out.end();
    err.end();
    running = false;
    settle({ code: 0, signal: null });
  }

  return {
    pid: 4242,
    stdout: out.iterable,
    stderr: err.iterable,
    exited,
    get running() {
      return running;
    },
    get signals() {
      return signals;
    },
    signal(sig) {
      // False on an already-exited child, never a throw (C21 I9). The race is
      // routine: a child may exit between the decision to cancel and delivery.
      if (!running) return false;
      signals.push(sig);
      if (!(script.ignores ?? []).includes(sig)) {
        close(script.onSignal?.(sig) ?? { code: null, signal: sig });
      }
      return true;
    },
    emit(chunk) {
      out.push(chunk);
    },
    close,
  };
}

export type FakeRunner = ProcessRunner & {
  /** Every `spawn` call: the argv array and the cwd read at that moment. */
  readonly spawns: readonly { argv: readonly string[]; cwd: string }[];
  readonly children: readonly FakeChild[];
};

export function fakeRunner(
  next: (argv: readonly string[], n: number) => ScriptedChild | FakeChild = () => ({
    exit: { code: 0, signal: null },
  }),
): FakeRunner {
  const spawns: { argv: readonly string[]; cwd: string }[] = [];
  const children: FakeChild[] = [];

  const notHere = (): never => {
    throw new Error("C06 uses spawn() and only spawn() — the shell is never in the loop (I3)");
  };

  return {
    spawn(argv: readonly string[], opts: SpawnOptions): ChildHandle {
      // `cwd` is read here, at spawn, so T3.22 can see the second call land
      // somewhere else.
      spawns.push({ argv, cwd: opts.cwd() });
      const made = next(argv, children.length);
      const child = "signals" in made ? made : fakeChild(made);
      children.push(child);
      return child;
    },
    spawnShell: notHere,
    handoff: notHere,
    get live() {
      return children.filter((c) => c.running);
    },
    killAll(): Promise<void> {
      for (const c of children) c.close({ code: null, signal: "SIGKILL" });
      return Promise.resolve();
    },
    get spawns() {
      return spawns;
    },
    get children() {
      return children;
    },
  };
}

// --- invocations ----------------------------------------------------------

export function invocation(over: Partial<Invocation> = {}): Invocation {
  return {
    verb: "ps",
    argv: ["ps"],
    streams: false,
    timeoutMs: 0,
    signal: new AbortController().signal,
    ...over,
  };
}

export function result(over: Partial<RawResult> = {}): RawResult {
  return {
    argv: ["widget", "ps", "--json"],
    exitCode: 0,
    signal: null,
    stdout: { rows: [] },
    stdoutRaw: '{"rows":[]}',
    stderr: "",
    durationMs: 3,
    parseError: null,
    cancelled: false,
    timedOut: false,
    ...over,
  };
}

export function recorded(over: Partial<Fixture> = {}): Fixture {
  return {
    id: "ps/empty",
    verb: "ps",
    argv: ["ps"],
    provenance: "recorded",
    capturedAt: "2026-01-01T00:00:00Z",
    cliVersion: "2.4.0",
    result: result(),
    ...over,
  };
}

export async function drain(source: AsyncIterable<RawPatch>): Promise<RawPatch[]> {
  const out: RawPatch[] = [];
  for await (const patch of source) out.push(patch);
  return out;
}

// --- the shared suite -----------------------------------------------------

/**
 * The three transports, each built to answer one invocation identically.
 *
 * **Three, not two, and that is not a D43 violation** — the comment is here
 * because it looks like one and someone will otherwise narrow it back.
 *
 * D43 forbids tests *agreeing with an animated world*: asserting on values the
 * emulator invents, so that drift in the world silently becomes the expected
 * result. This suite asserts that three transports behave identically at the
 * interface, over a handler that returns a fixed envelope. Nothing here treats
 * the emulator as a source of truth about the far side, and C08's world never
 * appears (C06 I17).
 *
 * Dropping the third case would narrow I15 to whatever two implementations
 * happen to share — the same silent narrowing as letting `signal` go unhonoured
 * by the fixture transport, one case at a time.
 */
export type Case = {
  name: string;
  /**
   * Answers `ps` with `answer`, or streams `patches` when given them. `argv` is
   * the invocation the caller will make — the fixture case needs it to key its
   * corpus, which is a real asymmetry between the implementations rather than a
   * papered-over one: only the fixture transport resolves by argv at all.
   */
  make(answer: RawResult, patches?: readonly RawPatch[], argv?: readonly string[]): VerbTransport;
};

export function transportCases(): readonly Case[] {
  return [
    {
      name: "fixture",
      make: (answer, patches, argv) =>
        createFixtureTransport([
          recorded({ ...(argv === undefined ? {} : { argv }), result: patches ?? answer }),
        ]),
    },
    {
      name: "emulated",
      make: (answer, patches) =>
        createEmulatedTransport(() => (patches === undefined ? answer : replay(patches))),
    },
    {
      name: "subprocess",
      make: (answer, patches) => {
        const fake = fakeClock();
        const clock = clockOf(fake);
        const stdout =
          patches === undefined
            ? [answer.stdoutRaw]
            : patches
                .filter((p) => p.kind === "data")
                .map((p) => `${JSON.stringify((p as { value: unknown }).value)}\n`);
        return createSubprocessTransport({
          binary: "widget",
          clock,
          runner: fakeRunner(() => ({
            stdout,
            stderr: answer.stderr === "" ? [] : [answer.stderr],
            exit: { code: answer.exitCode, signal: answer.signal },
          })),
        });
      },
    },
  ];
}

async function* replay(patches: readonly RawPatch[]): AsyncGenerator<RawPatch> {
  for (const patch of patches) yield patch;
}
