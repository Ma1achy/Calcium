/**
 * Terminal lifecycle — the only owner of terminal mode state.
 *
 * C01 — see spec.
 * Implement to the spec's commitments and invariants; cite invariant
 * numbers in tests. If the spec is wrong, change the spec first.
 *
 * Capabilities arrive by injection and the type is imported type-only, so no
 * runtime edge to C02 exists: C01 and C02 are the same layer and the edge has
 * to stay acyclic (§2, A03 MG3).
 */

import { ALT_SCREEN, BRACKET_PASTE, CURSOR, MOUSE } from "./escapes.js";
import type { TerminalCapabilities } from "./capabilities.js";

export type TerminalSize = Readonly<{ columns: number; rows: number }>;

export interface TerminalLifecycle {
  acquire(): void;
  release(): void;
  suspend(): void;
  resume(): void;
  onResize(cb: (size: TerminalSize) => void): Disposable;
  onResume(cb: () => void): Disposable;
  /**
   * One frozen snapshot per call (I12a) — the only route to a dimension outside
   * a `SIGWINCH`, and the reason SS42 can keep its single-file scope while the
   * frame path needs a width.
   *
   * **A method, not a getter.** A getter reads like a property, and
   * `{ w: size.columns, h: size.rows }` is then the natural spelling — two
   * reads, which is the mismatched pair I12 exists to prevent. `size()` makes
   * one call the obvious thing to write and the value the obvious thing to pass
   * down.
   *
   * Answers while `constructed`, unlike everything else here: C22 takes the
   * viewport's dimensions at construction step 5, before anything is acquired.
   */
  size(): TerminalSize;
  readonly writer: NodeJS.WriteStream;
  readonly acquired: boolean;
  readonly suspended: boolean;
}

export type TerminalLifecycleOptions = Readonly<{
  stdout: NodeJS.WriteStream;
  stdin: NodeJS.ReadStream;
  capabilities: TerminalCapabilities;
  onFatal: (err: unknown) => never;
  beforeRelease?: () => void;
  debug?: (line: string) => void;
}>;

/**
 * Thrown for every invalid cell of §5's transition table. A named class so
 * tests can assert the transition that was refused rather than that *something*
 * threw — a TypeError from a null dereference would satisfy a bare toThrow().
 */
export class TerminalStateError extends Error {
  constructor(
    readonly operation: string,
    readonly state: LifecycleState,
    readonly because: string,
  ) {
    super(`cannot ${operation}() while ${state}: ${because}`);
    this.name = "TerminalStateError";
  }
}

export type LifecycleState = "constructed" | "acquired" | "suspended" | "released";

/**
 * §3's `held` keys, named rather than counted. Two of them are not escape
 * sequences at all — `stdout` is the redirection and `rawMode` is a termios
 * call — which is why I8 can release the first while emitting nothing.
 *
 * `scrollRegion` is C03's and transactional; it is not in this union because
 * C01 never acquires it, and adding it before there is a caller would be an
 * export nothing consumes.
 */
type HeldKey = "stdout" | "altScreen" | "cursor" | "rawMode" | "bracketedPaste" | "mouse";

/**
 * §5's transition table, as data. Every cell, including the nine that throw.
 *
 * A table rather than a chain of `if`s: sixteen cells written out are checkable
 * against the spec by reading, and a chain gets one of the nine wrong. The
 * three ambiguous throws carry their reason, because the message is what tells
 * an L4 author which call they meant.
 */
const TRANSITIONS: Readonly<
  Record<LifecycleState, Readonly<Record<"acquire" | "release" | "suspend" | "resume", string | null>>>
> = Object.freeze({
  constructed: Object.freeze({
    acquire: null,
    release: null,
    suspend: "nothing is acquired to suspend",
    resume: "nothing was suspended",
  }),
  acquired: Object.freeze({
    acquire: null,
    release: null,
    suspend: null,
    resume: "nothing was suspended",
  }),
  suspended: Object.freeze({
    acquire: "resume() is the call you meant; a child owns the terminal",
    release: null,
    suspend: "nested suspend has no legitimate caller and would mask an orchestration bug",
    resume: null,
  }),
  released: Object.freeze({
    acquire: "released is terminal — construct a new instance",
    release: null,
    suspend: "released is terminal — construct a new instance",
    resume: "released is terminal — construct a new instance",
  }),
});

/** The eight trappable events of §5. `SIGKILL` is the ninth row and is not one. */
const SIGNALS = [
  "SIGINT",
  "SIGTERM",
  "SIGHUP",
  "SIGWINCH",
  "SIGTSTP",
  "SIGCONT",
  "uncaughtException",
  "unhandledRejection",
] as const;

/** 128 + signal, per signal (§5, A01 D54). */
const EXIT_CODES: Readonly<Record<string, number>> = Object.freeze({
  SIGINT: 130,
  SIGTERM: 143,
  SIGHUP: 129,
});

/**
 * I12a, and the reason it is a free function as well as a method.
 *
 * **I13 is a rule about a file, not about an object.** C22 needs the terminal's
 * dimensions at construction step 5, for the viewport, and the lifecycle is
 * step 7 — and it cannot move earlier, because `beforeRelease` closes over the
 * history store and the runner (C22 I1) and C01 takes it at construction. A
 * method alone would have forced one of the two invariants to give.
 *
 * So the read lives here, in the one file allowed to perform it, and is
 * reachable without an instance. `size()` delegates to it: one implementation,
 * so the signal path, the frame path and the construction path cannot come to
 * disagree about what a snapshot is.
 */
export function terminalSize(stream: Readonly<{ columns: number; rows: number }>): TerminalSize {
  return Object.freeze({ columns: stream.columns, rows: stream.rows });
}

export function createTerminalLifecycle(opts: TerminalLifecycleOptions): TerminalLifecycle {
  const { stdout, stdin, capabilities, onFatal } = opts;
  const debug = opts.debug ?? ((): void => {});

  let state: LifecycleState = "constructed";
  const held = new Set<HeldKey>();
  const resizeSubscribers = new Set<(size: TerminalSize) => void>();
  const resumeSubscribers = new Set<() => void>();
  let beforeReleaseRan = false;

  // --- stdout redirection (I9) ---------------------------------------------
  //
  // The privileged handle is the whole mechanism. `stdout.write` is replaced
  // with one that routes to `debug`; `writer` is the only thing that still
  // reaches the original. Origin is therefore structural — the renderer is
  // whoever holds `writer` — which is the only definition anything can check.
  //
  // A Proxy rather than a hand-built stream: Ink needs `columns`, `rows`,
  // `isTTY` and the EventEmitter surface, and enumerating them here would be a
  // guess that goes stale. `receiver` is the target, so `this` stays correct
  // inside every inherited method and getter.
  // Both references are needed and they are not interchangeable: `realWrite` is
  // what `writer` calls, and must be bound so `this` survives the detour;
  // `originalWrite` is what release puts back, and must be the *same function*
  // the caller had before construction. Restoring the bound one leaves a
  // permanent wrapper — a leak that survives release and passes any purely
  // behavioural assertion (T1.8).
  const originalWrite = stdout.write;
  const realWrite = originalWrite.bind(stdout) as NodeJS.WriteStream["write"];
  const patchedWrite = ((chunk: unknown): boolean => {
    debug(typeof chunk === "string" ? chunk : String(chunk));
    return true;
  }) as NodeJS.WriteStream["write"];

  const writer = new Proxy(stdout, {
    get(target, prop) {
      if (prop === "write") return realWrite;
      const value: unknown = Reflect.get(target, prop, target);
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });

  function redirectStdout(): void {
    stdout.write = patchedWrite;
    held.add("stdout");
  }

  function restoreStdout(): void {
    // Restored to what it was, not wrapped in a pass-through: T1.8 asserts the
    // identity, because a wrapper left behind is a leak that survives release.
    stdout.write = originalWrite;
    held.delete("stdout");
  }

  // --- emitting -------------------------------------------------------------

  function emit(seq: string): void {
    realWrite(seq);
  }

  /**
   * Acquisition, in §5's order. Each step records into `held` only after it has
   * succeeded, so a throw leaves `held` describing exactly what was taken —
   * which is what makes the unwind in `acquire()` correct rather than hopeful.
   */
  const ACQUIRE: Readonly<Record<Exclude<HeldKey, "stdout">, () => void>> = Object.freeze({
    altScreen: () => emit(ALT_SCREEN.enter),
    cursor: () => emit(CURSOR.enter),
    rawMode: () => setRawMode(true),
    bracketedPaste: () => emit(BRACKET_PASTE.enter),
    mouse: () => emit(MOUSE.enter),
  });

  const RELEASE: Readonly<Record<Exclude<HeldKey, "stdout">, () => void>> = Object.freeze({
    altScreen: () => emit(ALT_SCREEN.leave),
    cursor: () => emit(CURSOR.leave),
    rawMode: () => setRawMode(false),
    bracketedPaste: () => emit(BRACKET_PASTE.leave),
    mouse: () => emit(MOUSE.leave),
  });

  function setRawMode(on: boolean): void {
    // Absent when stdin is not a TTY (T3.9). Unsupported, not fatal: alternate
    // screen is the only hard capability (A01 D28).
    if (typeof stdin.setRawMode !== "function") return;
    stdin.setRawMode(on);
  }

  function take(key: Exclude<HeldKey, "stdout">): void {
    ACQUIRE[key]();
    held.add(key);
  }

  // --- the transition guard -------------------------------------------------

  function guard(operation: "acquire" | "release" | "suspend" | "resume"): void {
    const because = TRANSITIONS[state][operation];
    if (because !== null) throw new TerminalStateError(operation, state, because);
  }

  // --- release --------------------------------------------------------------

  /**
   * The single funnel. Every exit path — explicit, signal, fault — goes through
   * here, which is what makes I2 and I5 hold under the same-tick double signal
   * (T3.14) rather than being asserted separately on each path.
   */
  function releaseInternal(emitSequences: boolean): void {
    if (state === "released") return; // I2

    if (!beforeReleaseRan) {
      beforeReleaseRan = true;
      try {
        opts.beforeRelease?.();
      } catch (err) {
        // Recorded, never thrown: a throw here would strand the terminal, which
        // is the failure the hook exists to help avoid (I5).
        debug(`beforeRelease threw: ${String(err)}`);
      }
    }

    const failures: unknown[] = [];

    if (emitSequences) {
      // I6 — the inverse of `held`, in reverse acquisition order. A `Set`
      // preserves insertion order, so this is a lookup rather than a second
      // ordering that can disagree with the first.
      for (const key of [...held].reverse()) {
        if (key === "stdout") continue;
        try {
          RELEASE[key]();
        } catch (err) {
          // T3.8 — one failing sequence does not strand the others.
          failures.push(err);
        }
        held.delete(key);
      }
    } else {
      // I8 — the child owns the screen; writing a reset into it would corrupt
      // whatever the child is drawing. The keys are dropped without emitting.
      for (const key of held) if (key !== "stdout") held.delete(key);
    }

    disposeHandlers();
    if (held.has("stdout")) restoreStdout();
    state = "released";

    if (failures.length > 0) {
      debug(`release: ${failures.length} sequence(s) failed: ${failures.map(String).join("; ")}`);
    }
  }

  // --- process handlers -----------------------------------------------------

  const registered: [(typeof SIGNALS)[number], (...args: never[]) => void][] = [];

  function disposeHandlers(): void {
    for (const [event, handler] of registered) {
      process.removeListener(event, handler as (...args: unknown[]) => void);
    }
    registered.length = 0;
  }

  /**
   * I4 — release completes before any diagnostic is written. A stack written
   * onto the alternate screen is discarded the moment the screen is released,
   * so the ordering is what makes a crash trace readable at all.
   */
  function fault(err: unknown): void {
    releaseInternal(state !== "suspended");
    process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
    process.exit(1);
  }

  function signalExit(signal: "SIGINT" | "SIGTERM" | "SIGHUP"): void {
    releaseInternal(state !== "suspended");
    process.exit(EXIT_CODES[signal]);
  }

  const snapshotSize = (): TerminalSize => terminalSize(stdout);

  function onWinch(): void {
    // T3.18 — while suspended the dimensions belong to the child.
    if (state !== "acquired") return;

    // I12 — read each once, freeze, hand the same object to every subscriber.
    // Two reads per subscriber is where a mismatched pair would come from.
    const size = snapshotSize();
    for (const cb of resizeSubscribers) cb(size);
  }

  function onTstp(): void {
    // §5's "release" here means releasing what is `held`, not `release()` the
    // method — SIGCONT re-acquires, and `released` is terminal (I11), so the
    // method reading cannot be what was meant. This is `suspend()`'s effect
    // plus the re-raise.
    if (state === "acquired") {
      unwind();
      state = "suspended";
    }

    // Only the SIGTSTP handler is removed, and only so the re-raise reaches the
    // default disposition. Disposing the rest would take SIGCONT with it, and
    // the process would resume with the terminal unrestored and nothing left to
    // restore it. Handling without re-raising means Ctrl-Z appears to do
    // nothing; releasing without re-raising restores the terminal while the
    // process keeps running (§5).
    process.removeListener("SIGTSTP", onTstp);
    process.kill(process.pid, "SIGTSTP");
  }

  function onCont(): void {
    // Re-acquire from the same record, reinstall, and report. No flag: C03 owns
    // contamination and the L4 shell calls invalidate() (A01 D53).
    if (state === "suspended") {
      state = "constructed";
      acquire();
    }

    process.on("SIGTSTP", onTstp);
    registered.push(["SIGTSTP", onTstp]);

    for (const cb of resumeSubscribers) cb();
  }

  const HANDLERS: Readonly<Record<(typeof SIGNALS)[number], (...args: never[]) => void>> =
    Object.freeze({
      SIGINT: () => signalExit("SIGINT"),
      SIGTERM: () => signalExit("SIGTERM"),
      SIGHUP: () => signalExit("SIGHUP"),
      SIGWINCH: onWinch,
      SIGTSTP: onTstp,
      SIGCONT: onCont,
      uncaughtException: (err: never) => fault(err),
      unhandledRejection: (reason: never) => fault(reason),
    });

  function register(): void {
    for (const event of SIGNALS) {
      const handler = HANDLERS[event];
      process.on(event, handler as (...args: unknown[]) => void);
      registered.push([event, handler]);
    }
  }

  // --- public operations ----------------------------------------------------

  function acquire(): void {
    guard("acquire");
    if (state === "acquired") return; // T3.5 — no-op, not an error.

    // I14 — the record has already concluded the shell cannot open. Fatal
    // before anything is emitted (T3.15).
    if (!capabilities.altScreen) {
      unwind();
      onFatal(new Error("alternate screen unsupported — the shell cannot open"));
    }

    try {
      take("altScreen");
    } catch (err) {
      // §5 — the fatal path unwinds first. onFatal returns `never`, so nothing
      // runs after it; otherwise the only fatal case in the system would be the
      // one case that leaves state behind.
      unwind();
      onFatal(err);
    }

    try {
      take("cursor");
      take("rawMode");
      if (capabilities.bracketedPaste) take("bracketedPaste"); // I10
      if (capabilities.mouse) take("mouse"); // I10
    } catch (err) {
      // T3.7 — partial acquisition never leaves partial state.
      unwind();
      debug(`acquire failed midway: ${String(err)}`);
      throw err;
    }

    state = "acquired";
  }

  /** Releases what is held without touching `state` or the handlers. */
  function unwind(): void {
    for (const key of [...held].reverse()) {
      if (key === "stdout") continue;
      try {
        RELEASE[key]();
      } catch {
        // Best effort: the caller is already on a failure path.
      }
      held.delete(key);
    }
  }

  function release(): void {
    guard("release");
    releaseInternal(state !== "suspended");
  }

  function suspend(): void {
    guard("suspend");
    unwind(); // I7 — leaves the alternate screen entirely, does not retain it.
    state = "suspended";
  }

  function resume(): void {
    guard("resume");
    state = "constructed";
    acquire();
  }

  function subscribe<T>(set: Set<T>, cb: T): Disposable {
    set.add(cb);
    return { [Symbol.dispose]: () => void set.delete(cb) };
  }

  // I3 — handlers exist before `acquire()` is reachable. Construction has side
  // effects deliberately: a two-call API invites the ordering bug it exists to
  // prevent (§2).
  redirectStdout();
  register();

  return {
    acquire,
    release,
    suspend,
    resume,
    onResize: (cb) => subscribe(resizeSubscribers, cb),
    onResume: (cb) => subscribe(resumeSubscribers, cb),
    // Not gated on state, and that is the one difference from everything above
    // it: C22 needs the viewport's dimensions at construction step 5, before
    // any acquire. There is nothing to be wrong about — reading the size of a
    // terminal nobody has entered is still the size of the terminal.
    size: snapshotSize,
    writer,
    // Getters, not stored booleans: two booleans for four states admits two
    // combinations that cannot happen (T2.1).
    get acquired() {
      return state === "acquired";
    },
    get suspended() {
      return state === "suspended";
    },
  };
}
