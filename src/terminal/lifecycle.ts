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

import {
  ALT_SCREEN,
  BRACKET_PASTE,
  CURSOR,
  CURSOR_SHAPE,
  KITTY_KEYBOARD,
  MOUSE,
  MOUSE_ANY,
  cursorTo,
} from "./escapes.js";
import type { CursorStyle } from "./escapes.js";
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
   * Raw stdin bytes, while acquired and not otherwise (I18).
   *
   * C01 delivers and interprets nothing — decoding is C16's. The attachment is
   * part of `acquire()` and the removal part of `suspend()`, so the window in
   * which a child owns the terminal is one the shell cannot forget to close.
   */
  onInput(cb: (chunk: Uint8Array) => void): Disposable;
  /**
   * The frame's cursor, as bytes for the frame to write (I19).
   *
   * **A string rather than a call, and the second reason decides it.** The
   * cursor's visibility is a mode this component holds and restores at release
   * (I1), so nothing else may write it — but the bytes have to land inside the
   * frame's single `write`, and a separate call cannot be kept inside C03's
   * synchronised-update window. So the owner yields the sequence and the drawer
   * embeds it.
   *
   * **Hide, then move, then show**, and the sync window does not make the order
   * moot: `synchronisedUpdate` is a capability, so the unwrapped path is real,
   * and on it a visible cursor is dragged across the frame by every row written
   * after it. `null` hides and does not move — there is nowhere to move to.
   */
  cursorSequence(at: Readonly<{ row: number; col: number }> | null): string;
  /**
   * The cursor's **shape**, as bytes, **or the empty string when it has not
   * changed** (I20).
   *
   * A `setting` rather than a mode: persistent state like one, no inverse like
   * an SGR sequence, and an undo that is a third value. It is therefore not in
   * `held`, is restored beside it at `release()`, and its record is marked
   * **unknown** by `resume()` — a suspended terminal belonged to a child, and
   * `vim` leaves a bar behind, so the next resolution is emitted whatever it is
   * rather than compared against a record describing a screen that is gone.
   *
   * **Emitted only on change, and that is what the record is for.** The cursor
   * sequence goes out with every frame (I19), so a shape folded into it is
   * re-asserted at frame cadence — wasted bytes at best, and at worst a cursor
   * that never blinks because the terminal restarts its phase each time.
   *
   * `null` means *the terminal's configured default*. **Before anything has been
   * emitted it means emit nothing at all**, which is the only way to leave a
   * terminal the application never asked to touch alone (C22 §6f table row 2).
   */
  cursorShapeSequence(style: CursorStyle | null): string;
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
  /**
   * Mouse tracking on or off, while acquired (C22's copy mode).
   *
   * **Here because nowhere else may write an escape sequence.** `MOUSE` is a
   * mode this component takes at `acquire()` and restores at `release()`, and a
   * second writer of it is precisely the class C01 exists to prevent — the
   * cursor's sequence takes the same shape for the same reason.
   *
   * **A no-op without the capability**, so a caller never has to ask twice: the
   * mode was never taken, so there is nothing to toggle and `held` stays
   * truthful. Idempotent, and a no-op while suspended — a child owns the
   * terminal there, and its modes are not ours to change.
   *
   * `mouseEnabled()` in the router is a *capability* question and gains no arm
   * from this. A capability and a mode are different questions, and one
   * predicate answering both is how they come to disagree.
   */
  setMouseTracking(on: boolean): void;
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
  /**
   * Step 6 takes 1003 in 1002's place (I21) — every pointer move reported, not
   * only drags. **An option and not a capability**: nothing detects it, and the
   * cost is the application's. Default off. `capabilities.mouse` false still
   * takes neither (I10).
   */
  hover?: boolean;
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

/** Two styles, or two absences, are the same value (I20). */
function sameStyle(a: CursorStyle | null, b: CursorStyle | null): boolean {
  if (a === null || b === null) return a === b;
  return a.shape === b.shape && a.blink === b.blink;
}

/**
 * §3's `held` keys, named rather than counted. Two of them are not escape
 * sequences at all — `stdout` is the redirection and `rawMode` is a termios
 * call — which is why I8 can release the first while emitting nothing.
 *
 * `scrollRegion` is C03's and transactional; it is not in this union because
 * C01 never acquires it, and adding it before there is a caller would be an
 * export nothing consumes.
 */
type HeldKey =
  | "stdout"
  | "altScreen"
  | "cursor"
  | "rawMode"
  | "bracketedPaste"
  | "mouse"
  | "keyboardProtocol";

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
  // **One pair, chosen once** (I21). Acquisition, release and the copy-mode
  // toggle all read this binding, so the mode that leaves is the mode that was
  // entered — a toggle reading `MOUSE` while acquisition took `MOUSE_ANY` would
  // emit `1002l` for a 1003 the terminal still holds.
  const mouseMode = opts.hover === true ? MOUSE_ANY : MOUSE;

  let state: LifecycleState = "constructed";
  const held = new Set<HeldKey>();
  const resizeSubscribers = new Set<(size: TerminalSize) => void>();
  const resumeSubscribers = new Set<() => void>();
  const inputSubscribers = new Set<(chunk: Uint8Array) => void>();
  let beforeReleaseRan = false;
  /**
   * The last cursor shape put on the wire, or `undefined` for *never emitted*
   * (I20).
   *
   * **Three states and not two**, because *nothing has been emitted* and *the
   * default has been emitted* are different: only the first may leave the
   * terminal alone, and it is unreachable once left. `null` is the second.
   */
  let shapeEmitted: CursorStyle | null | undefined = undefined;
  /**
   * Set by `resume()`: a child owned the terminal and may have changed the
   * shape (I20).
   *
   * **A flag rather than clearing the record, and the mutation pass is what
   * said so.** The walk's ruling was *`resume()` clears the record*, and
   * clearing it to `undefined` restores the *leave the terminal alone*
   * semantics — so a target resolving to `null` after a handoff emits nothing
   * and `vim`'s bar survives, which is the exact case the ruling was written
   * for. Clearing was also **dead**: `suspend()` already resets, so every
   * post-handoff request for a real style emitted either way, and only a
   * request for `null` distinguishes them.
   *
   * The next resolution is therefore emitted **whatever it is**, the reset
   * included. The cost is stated in C22 §6f.5: a session that declares no style
   * and performs a handoff emits one reset, where a session that never suspends
   * emits nothing at all.
   */
  let shapeUnknown = false;

  // --- raw input delivery (I18) --------------------------------------------
  //
  // **Attached by `acquire()`, dropped by `suspend()`, and that is the whole
  // point of it living here.** Under `stdio: inherit` the child reads the same
  // descriptor, so a listener the shell forgot to remove races it for every
  // byte — and the symptom is a child dropping every other keystroke, with
  // nothing in either component to point at. C21 I6 already refuses `handoff()`
  // while raw mode is set; this is the same guarantee over the same window,
  // made part of the transition rather than a rule someone has to remember.
  //
  // Dropped rather than paused, and the bytes in between are lost on purpose:
  // they were typed at the child. A queue would replay a `vim` session into the
  // prompt on resume.
  function onData(chunk: Buffer): void {
    for (const cb of inputSubscribers) cb(chunk);
  }

  let listening = false;

  function attachInput(): void {
    if (listening) return;
    listening = true;
    stdin.on("data", onData);
    // I18a — **the attach is the inverse of the detach in both of its effects.**
    // `detachInput` pauses as well as removing, and `pause()` sets Node's
    // `flowing` to `false`, which is the one state in which adding a `data`
    // listener does *not* resume the stream. Without this the listener after a
    // handoff sits on a stream nothing feeds: the shell keeps drawing frames
    // and never takes another key.
    //
    // Cheap on the first attach — `resume()` on an already-flowing stream is a
    // no-op — and the one line that makes `suspend`/`resume` reversible.
    stdin.resume();
  }

  function detachInput(): void {
    if (!listening) return;
    listening = false;
    stdin.off("data", onData);
    // Explicit, not incidental: removing the last `data` listener pauses the
    // stream in Node's flowing mode, but that is a consequence of there being
    // no listeners rather than a statement about who owns the descriptor. A
    // second subscriber elsewhere would keep it flowing and keep reading the
    // child's keystrokes.
    stdin.pause();
  }

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
    mouse: () => emit(mouseMode.enter),
    keyboardProtocol: () => emit(KITTY_KEYBOARD.enter),
  });

  const RELEASE: Readonly<Record<Exclude<HeldKey, "stdout">, () => void>> = Object.freeze({
    altScreen: () => emit(ALT_SCREEN.leave),
    cursor: () => emit(CURSOR.leave),
    rawMode: () => setRawMode(false),
    bracketedPaste: () => emit(BRACKET_PASTE.leave),
    mouse: () => emit(mouseMode.leave),
    // The pop, never `CSI = 0 u`: the terminal's prior flag set comes back
    // (C02 §3). Last taken and so first released — the terminal is on legacy
    // key reporting before the mouse and paste modes leave.
    keyboardProtocol: () => emit(KITTY_KEYBOARD.leave),
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

  /**
   * Mouse tracking toggled while the shell holds the terminal.
   *
   * **`held` is the record and it stays truthful**, which is what makes the
   * unwind in `release()` correct without a second flag: tracking off means the
   * mode is not held, so release does not emit a `leave` for something already
   * left, and re-enabling goes through `take` exactly as acquisition does.
   */
  function setMouseTracking(on: boolean): void {
    if (!capabilities.mouse) return; // I10 — never taken; nothing to toggle.
    if (state !== "acquired") return; // suspended or released: not ours to change.
    if (on === held.has("mouse")) return; // idempotent (T3.x, the second call).
    if (on) {
      take("mouse");
      return;
    }
    emit(mouseMode.leave);
    held.delete("mouse");
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

    detachInput(); // I18 — dropped for good; `released` is terminal (I11).

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
      // **Beside `held` and not inside it** (I20). A setting has no inverse, so
      // I6's lookup cannot express it and I8's *release the key while emitting
      // nothing* is an argument about keys. It emits nothing where nothing was
      // ever put on the wire, which is what keeps a terminal the application
      // never touched untouched.
      try {
        const reset = releaseShape();
        if (reset !== "") writer.write(reset);
      } catch (err) {
        failures.push(err);
      }
    } else {
      // I8 — the child owns the screen; writing a reset into it would corrupt
      // whatever the child is drawing. The keys are dropped without emitting,
      // and the shape's record with them (I20): the same argument reaches it
      // even though `held` does not.
      for (const key of held) if (key !== "stdout") held.delete(key);
      shapeEmitted = undefined;
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
    // **I12b — the states that drop are named, not inferred from the one that
    // delivers.** This was `state !== "acquired"`, and T3.18's reason — while
    // suspended the dimensions belong to the child — is true of `suspended` and
    // of nothing else. `released` is terminal (I11). `constructed` has neither
    // property, and C01 already answers `size()` there.
    //
    // The cost of the wider form was a contradiction neither spec could see:
    // C22 I8 defers a failed size gate and registers an `onResize` to continue
    // from startup step 5, and gate 4 deliberately does not acquire — so the
    // deferral deferred for ever. Measured at 100x12, resized to 100x30: zero
    // further bytes, no alternate screen, process alive. FINDINGS F67.
    if (state === "suspended" || state === "released") return;

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
      if (capabilities.keyboardProtocol === "kitty") take("keyboardProtocol"); // I10, C02 I12
    } catch (err) {
      // T3.7 — partial acquisition never leaves partial state.
      unwind();
      debug(`acquire failed midway: ${String(err)}`);
      throw err;
    }

    state = "acquired";

    // Last, and after the state: a subscriber that dispatched a keystroke into
    // a shell whose terminal is half-acquired is the window I3 closes for
    // handlers, arriving through the one subscription that is not one (I18).
    attachInput();
  }

  /** Releases what is held without touching `state` or the handlers. */
  /**
   * I20 — the shape, on change only, with three states rather than two.
   *
   * **`undefined` is not `null`.** *Nothing has been emitted* may leave the
   * terminal alone; *the default has been emitted* is a value we put there. The
   * first is unreachable once left, which is why the guard below is about a
   * transition and not about a value: asking for `null` before anything was
   * emitted writes nothing, and asking for it afterwards writes the reset.
   */
  function cursorShapeSequence(style: CursorStyle | null): string {
    if (shapeUnknown) {
      // The screen is not what the record says, so nothing may be skipped —
      // including the reset, which is the only thing that takes a child's
      // shape back off the screen.
      shapeUnknown = false;
      shapeEmitted = style;
      return style === null ? CURSOR_SHAPE.reset : CURSOR_SHAPE.set(style);
    }
    if (style === null && shapeEmitted === undefined) return "";
    if (shapeEmitted !== undefined && sameStyle(shapeEmitted, style)) return "";
    shapeEmitted = style;
    return style === null ? CURSOR_SHAPE.reset : CURSOR_SHAPE.set(style);
  }

  /** The reset, or nothing where nothing was ever put on the wire (I20). */
  function releaseShape(): string {
    if (shapeEmitted === undefined || shapeEmitted === null) return "";
    shapeEmitted = null;
    return CURSOR_SHAPE.reset;
  }

  function unwind(): void {
    // Before the sequences, because a child takes the terminal the moment the
    // suspension completes and the ordering is what T4.4b asserts (I18).
    detachInput();
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
    // The shape goes back before the child takes the terminal, on the same
    // terms as `held`: only where something was put on the wire (I20).
    const reset = releaseShape();
    if (reset !== "") writer.write(reset);
    state = "suspended";
  }

  function resume(): void {
    guard("resume");
    // **The record is marked unknown rather than cleared** (I20). The child
    // owned the terminal and may have set a shape of its own — `vim` leaves a
    // bar behind — so the record describes a screen that no longer exists.
    // Clearing it to `undefined` was the walk's ruling and it was wrong twice
    // over: it restores the *leave the terminal alone* arm, so a target
    // resolving to `null` would emit nothing and the child's bar would stay,
    // and it was dead anyway because `suspend()` has already reset. This is
    // C22 I56's *drop the record before the bytes go out*, one component down.
    shapeUnknown = true;
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
    onInput: (cb) => subscribe(inputSubscribers, cb),
    cursorSequence: (at) =>
      at === null ? CURSOR.enter : `${CURSOR.enter}${cursorTo(at.row, at.col)}${CURSOR.leave}`,
    cursorShapeSequence,
    // Not gated on state, and that is the one difference from everything above
    // it: C22 needs the viewport's dimensions at construction step 5, before
    // any acquire. There is nothing to be wrong about — reading the size of a
    // terminal nobody has entered is still the size of the terminal.
    size: snapshotSize,
    setMouseTracking,
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
