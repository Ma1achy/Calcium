/**
 * Spawning, process groups, streams, handoff.
 *
 * C21 — see spec. The interface is in `types.ts`, which landed with C06; this
 * file holds the behaviour, and `COMPONENT_SOURCES.C21` points here for exactly
 * that reason.
 *
 * Three joints carry the weight, and each is a thing that looks fine and is not:
 *
 *   - **Detached, and signalled by group** (I2). `sh -c "cli ps | jq ."` is a
 *     shell with two children; signalling the shell alone leaves `jq` holding the
 *     pipe. The user presses Ctrl-C, the command appears not to stop, and the
 *     orphan outlives the session. `kill(-pid)` is the difference between
 *     cancellation working and appearing to.
 *   - **No timer, anywhere** (I8, I11). `killAll` sends `SIGKILL` outright: a
 *     grace period is a timing policy, C06 owns those, and by session exit it has
 *     already had its chance to cancel politely. A escalation ladder here would
 *     put the policy in two places, and the second one would be wrong first.
 *   - **Spawn failure is a resolution, not a throw** (I13). `exited` settles with
 *     a null code and the message arrives on `stderr`, so a mistyped binary is a
 *     result C06 reports rather than an exception a caller must also catch.
 */

import { accessSync, constants } from "node:fs";
import { spawn as nodeSpawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { createBoundedStream } from "./stream.js";
import type { ChildHandle, Exit, ProcessRunner, ProcessRunnerDeps, SpawnOptions } from "./types.js";

/** C21 §4. Per stream, not per child. */
const DEFAULT_MAX_BUFFER_BYTES = 8 * 1024 * 1024;

const FALLBACK_SHELL = "/bin/sh";

type Started = Readonly<{ command: string; args: readonly string[] }>;

export function createProcessRunner(deps: ProcessRunnerDeps): ProcessRunner {
  const debug = deps.debug ?? ((): void => {});
  const live = new Set<ChildHandle>();

  /**
   * `$SHELL` when set and executable, otherwise `/bin/sh` (§2).
   *
   * A set-but-unusable `$SHELL` warns rather than failing: the variable is
   * frequently a stale path to a shell that was uninstalled, and refusing every
   * system command over it would be a worse answer than running the one that is
   * definitely there.
   */
  function resolveShell(): string {
    const declared = deps.env["SHELL"];
    if (declared === undefined || declared === "") return FALLBACK_SHELL;

    try {
      accessSync(declared, constants.X_OK);
      return declared;
    } catch {
      debug(`SHELL=${declared} is not executable; falling back to ${FALLBACK_SHELL}`);
      return FALLBACK_SHELL;
    }
  }

  /**
   * The environment a child gets: what this runner was given, overlaid with what
   * the caller asked for (T1.10). Node would inherit the parent's environment for
   * free, but only if `env` is left unset — and passing `opts.env` alone replaces
   * it wholesale, which is how `PATH` goes missing from a child that asked to set
   * one variable.
   */
  function environmentFor(opts: SpawnOptions): NodeJS.ProcessEnv {
    return { ...deps.env, ...opts.env };
  }

  function start({ command, args }: Started, opts: SpawnOptions): ChildHandle {
    const limit = opts.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES;
    const out = createBoundedStream(limit);
    const err = createBoundedStream(limit);

    let running = true;
    let settle!: (exit: Exit) => void;
    const exited = new Promise<Exit>((resolve) => {
      settle = resolve;
    });

    /**
     * The child is gone. **The streams are not ended here**, and that is the
     * subtle part.
     *
     * Node's `exit` can fire before the stdio `data` events have been delivered
     * — which is the entire reason `close` exists as a separate event. Ending
     * the streams on exit therefore sets `ended` while output is still in
     * flight, and the T3.7 guard then drops it. The symptom is empty stdout from
     * a child that ran perfectly, on short-lived commands, and only when the
     * machine is loaded enough to reorder the two.
     *
     * So: `exited` settles on `exit`, and the streams end on their own `end` or
     * on the child's `close`, which is the event that means the stdio is
     * genuinely drained.
     */
    const finish = (exit: Exit): void => {
      if (!running) return;
      running = false;
      settle(exit);
    };

    let child: ChildProcess;
    try {
      child = nodeSpawn(command, [...args], {
        // Read here, at spawn, never captured at construction (I10). A
        // pass-through `cd` moves it between one call and the next.
        cwd: opts.cwd(),
        env: environmentFor(opts),
        // The child leads its own process group, which is what makes a pipeline
        // signallable as one thing (I2).
        detached: true,
        // Piped and separate, never inherited (I3). A child writing to the real
        // stdout corrupts the frame, and merging the two would put a diagnostic
        // in the middle of a JSON document.
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      // Node throws synchronously for some spawn failures and emits `error` for
      // others — an unreadable `cwd` against a missing binary, for instance. Both
      // are the same event to a caller, so both settle the same way (I13).
      return failedHandle(out, err, messageOf(error));
    }

    child.stdout?.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => err.push(chunk));
    child.stdout?.on("error", () => undefined);
    child.stderr?.on("error", () => undefined);

    // A stream ends when the child closes it, not when the child exits (T3.5).
    // A consumer of `cli tail --json | head` sees the stream finish while the
    // child is still alive, and `exited` still waits for it to go.
    child.stdout?.on("end", () => out.end());
    child.stderr?.on("end", () => err.end());

    // The backstop, and the ordering guarantee: `close` means every stdio
    // stream is drained and closed. A child killed mid-write reaches here even
    // if its pipes never emitted `end`.
    child.on("close", () => {
      out.end();
      err.end();
    });

    child.on("error", (error) => {
      // No `close` follows some spawn failures, so this path ends the streams
      // itself — after pushing the message, which is the order that matters.
      err.pushText(messageOf(error));
      finish({ code: null, signal: null });
      out.end();
      err.end();
    });

    // `exit`, not `close`: `close` waits for every pipe to be closed, and a
    // detached grandchild holding one open would leave `exited` pending on a
    // child that has demonstrably gone (T3.16).
    child.on("exit", (code, signal) => {
      finish({ code, signal: signal ?? null });
    });

    const handle: ChildHandle = {
      get pid() {
        return child.pid ?? null;
      },
      stdout: out.iterable,
      stderr: err.iterable,
      exited,
      get running() {
        return running;
      },
      get overflowed() {
        return out.overflowed || err.overflowed;
      },
      signal(sig: string): boolean {
        // False on an already-exited child, never a throw (I9). The race is
        // routine: a child may exit between the decision to cancel and delivery.
        if (!running) return false;
        const pid = child.pid;
        if (pid === undefined) return false;

        try {
          // The negative pid is the whole point — the group, not the leader.
          process.kill(-pid, sig as NodeJS.Signals);
          return true;
        } catch {
          return false;
        }
      },
    };

    live.add(handle);
    void exited.then(() => live.delete(handle));

    return handle;
  }

  return {
    spawn(argv: readonly string[], opts: SpawnOptions): ChildHandle {
      const [command, ...args] = argv;
      if (command === undefined) {
        return failedHandle(
          createBoundedStream(0),
          createBoundedStream(DEFAULT_MAX_BUFFER_BYTES),
          "spawn was given an empty argv",
        );
      }
      // No shell, ever (I1). The argv is passed as an argv, so `;`, `|` and
      // `$(…)` are characters in an argument and nothing expands them.
      return start({ command, args }, opts);
    },

    spawnShell(command: string, opts: SpawnOptions): ChildHandle {
      // The string is one the *user typed* (C18 §5). Nothing in the framework
      // assembles it, which is why this is a separate method and not a flag —
      // the security-relevant distinction is visible at every call site.
      return start({ command: resolveShell(), args: ["-c", command] }, opts);
    },

    handoff(argv: readonly string[], opts: SpawnOptions): Promise<Exit> {
      // C21 cannot import C01 to verify the terminal was released — L0's two
      // halves — but it can check cheaply, and the message names the missing
      // call rather than the state it found. "Still in raw mode" sends a reader
      // looking for who set it; the answer is always that nobody unset it.
      if (deps.stdin.isRaw === true) {
        return Promise.reject(
          new Error(
            "handoff() with stdin still in raw mode — the caller skipped " +
              "lifecycle.suspend(). A child handed a raw-mode terminal has no " +
              "working line editing and nothing points at the cause (C21 I6)",
          ),
        );
      }

      const [command, ...args] = argv;
      if (command === undefined) {
        return Promise.resolve({ code: null, signal: null });
      }

      return new Promise<Exit>((resolve) => {
        let child: ChildProcess;
        try {
          child = nodeSpawn(command, args, {
            cwd: opts.cwd(),
            env: environmentFor(opts),
            // Inherited, and **not detached** (I7): the child shares this
            // process group, so Ctrl-C reaches it through the terminal exactly
            // as it would from a shell. Detaching here would take the child out
            // of the foreground group and leave Ctrl-C going nowhere.
            stdio: "inherit",
          });
        } catch (error) {
          debug(`handoff failed to spawn: ${messageOf(error)}`);
          resolve({ code: null, signal: null });
          return;
        }

        child.on("error", (error) => {
          debug(`handoff failed to spawn: ${messageOf(error)}`);
          resolve({ code: null, signal: null });
        });
        child.on("exit", (code, signal) => resolve({ code, signal: signal ?? null }));
      });
      // Deliberately not tracked in `live`: a handed-off child is in *this*
      // process group, and `killAll` signalling that group would kill the
      // session along with it. Handoff awaits the child anyway, so nothing can
      // reach `killAll` while one is running.
    },

    get live(): readonly ChildHandle[] {
      return [...live];
    },

    async killAll(): Promise<void> {
      // `SIGKILL` outright, no grace period, no timer (I11). C06 owns the
      // escalation ladder and has already had its chance; a second policy here
      // would be the one nobody remembers to keep in step.
      const handles = [...live];
      for (const handle of handles) handle.signal("SIGKILL");
      await Promise.all(handles.map((handle) => handle.exited));
    },
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * A handle for a child that never started (I13).
 *
 * `exited` resolves rather than pending, `pid` is null, and the message is on
 * `stderr` where a caller already looks — so a mistyped binary is reported by the
 * same path as a binary that ran and failed.
 */
function failedHandle(
  out: ReturnType<typeof createBoundedStream>,
  err: ReturnType<typeof createBoundedStream>,
  message: string,
): ChildHandle {
  err.pushText(message);
  out.end();
  err.end();

  return {
    pid: null,
    stdout: out.iterable,
    stderr: err.iterable,
    exited: Promise.resolve({ code: null, signal: null }),
    running: false,
    overflowed: false,
    signal: (): boolean => false,
  };
}
