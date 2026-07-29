/**
 * The production transport: spawn, report, never interpret.
 *
 * C06 §3, §4 — see spec. Everything about *how* a process is spawned, signalled
 * and drained is C21's; this file decides what to spawn, when to escalate, and
 * what the result records. It maps no exit code and constructs no envelope (I2,
 * SS25) — a non-zero exit is reported as a number and C07 decides what it means.
 *
 * The two joints that carry weight:
 *
 *   - **`end` is yielded from one place** (I9). An `end` at each exit point is
 *     correct until someone adds a seventh, and the failure is a consumer that
 *     awaits a terminal patch forever. So the generator's body sets state and
 *     falls through to a single tail yield, and the `finally` does cleanup only
 *     — never a yield, which during an early `return()` would be dropped.
 *   - **Output produced before death is retained** (I7). Parsing is a derived
 *     step over retained text, never a replacement for it, so a cancelled tail
 *     keeps the forty lines it already showed.
 */

import { withJson } from "./argv.js";
import { escalate } from "./ladder.js";
import { createNdjsonReader } from "./ndjson.js";
import type { ChildHandle, Exit, ProcessRunner, SpawnOptions } from "../process/types.js";
import type { Clock, Invocation, RawPatch, RawResult, VerbTransport } from "./types.js";

type Termination = { cancelled: boolean; timedOut: boolean };

/** Drains a stream into a string without letting its rejection escape unhandled. */
function collect(source: AsyncIterable<string>): { text: () => string; done: Promise<void> } {
  let text = "";
  const done = (async (): Promise<void> => {
    for await (const chunk of source) text += chunk;
  })().catch(() => undefined);
  return { text: (): string => text, done };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Cancellation and timeout, sharing one ladder (I8).
 *
 * Whichever fires first owns the escalation; the second is ignored rather than
 * starting a competing ladder, because two ladders on one child send `SIGKILL`
 * two seconds early.
 */
function arm(child: ChildHandle, inv: Invocation, clock: Clock, state: Termination): () => void {
  let stop: (() => void) | null = null;

  const fire = (which: keyof Termination): void => {
    if (stop !== null) return;
    state[which] = true;
    stop = escalate(child, clock);
  };

  const onAbort = (): void => fire("cancelled");
  inv.signal.addEventListener("abort", onAbort, { once: true });

  // `timeoutMs: 0` is unbounded, and the assertion T3.8 makes is that no timer
  // is *scheduled* — not that it never fires. A timer armed with 0 and cleared
  // later would satisfy the weaker reading and kill every live view.
  const timer = inv.timeoutMs > 0 ? clock.schedule(() => fire("timedOut"), inv.timeoutMs) : null;

  return (): void => {
    inv.signal.removeEventListener("abort", onAbort);
    timer?.[Symbol.dispose]();
    stop?.();
  };
}

export function createSubprocessTransport(opts: {
  binary: string;
  runner: ProcessRunner;
  clock: Clock;
  env?: Readonly<NodeJS.ProcessEnv>;
  cwd?: () => string;
}): VerbTransport {
  const { binary, runner, clock } = opts;

  // Read at spawn, never captured (commitment 14). A captured string spawns
  // every subsequent verb in the directory the session started in, and T3.22 is
  // what catches the difference.
  const spawnOptions = (): SpawnOptions => ({
    cwd: opts.cwd ?? ((): string => process.cwd()),
    ...(opts.env === undefined ? {} : { env: opts.env }),
  });

  const spawnArgv = (inv: Invocation): readonly string[] => [binary, ...withJson(inv.argv)];

  return {
    async invoke(inv) {
      const argv = spawnArgv(inv);
      const started = clock.now();
      const state: Termination = { cancelled: false, timedOut: false };
      const base = {
        argv,
        exitCode: null,
        signal: null,
        stdout: undefined,
        stdoutRaw: "",
        stderr: "",
        parseError: null,
      };

      // An already-aborted signal spawns nothing at all (T3.9). Checking after
      // the spawn would start a process solely to kill it, which on a far side
      // with side effects is not a wasted fork but a wrong one.
      if (inv.signal.aborted) {
        return { ...base, durationMs: 0, cancelled: true, timedOut: false };
      }

      let child: ChildHandle;
      try {
        child = runner.spawn(argv, spawnOptions());
      } catch (error) {
        // A spawn failure is a result, not a throw (T3.17). The guard releases
        // and the session survives a mistyped binary.
        return {
          ...base,
          stderr: messageOf(error),
          durationMs: clock.now() - started,
          cancelled: false,
          timedOut: false,
        };
      }

      const out = collect(child.stdout);
      const err = collect(child.stderr);
      const disarm = arm(child, inv, clock, state);

      let exit: Exit;
      try {
        exit = await child.exited;
      } finally {
        disarm();
      }
      await Promise.all([out.done, err.done]);

      const stdoutRaw = out.text();
      let stdout: unknown;
      let parseError: string | null = null;
      try {
        stdout = JSON.parse(stdoutRaw) as unknown;
      } catch (error) {
        parseError = messageOf(error);
      }

      return {
        argv,
        exitCode: exit.code,
        signal: exit.signal,
        stdout,
        stdoutRaw,
        stderr: err.text(),
        durationMs: clock.now() - started,
        parseError,
        cancelled: state.cancelled,
        timedOut: state.timedOut,
      };
    },

    stream(inv) {
      async function* body(): AsyncGenerator<RawPatch> {
        const argv = spawnArgv(inv);
        const started = clock.now();
        const state: Termination = { cancelled: false, timedOut: false };

        let child: ChildHandle | null = null;
        let disarm: (() => void) | null = null;
        let exit: Exit = { code: null, signal: null };
        let stdoutRaw = "";
        let stderr = "";

        try {
          if (inv.signal.aborted) {
            state.cancelled = true;
          } else {
            child = runner.spawn(argv, spawnOptions());
            const err = collect(child.stderr);
            disarm = arm(child, inv, clock, state);
            const reader = createNdjsonReader();

            for await (const chunk of child.stdout) {
              stdoutRaw += chunk;
              for (const patch of reader.push(chunk)) yield patch;
            }
            for (const patch of reader.flush()) yield patch;

            exit = await child.exited;
            await err.done;
            stderr = err.text();
          }
        } catch (error) {
          // Spawn failure, or a stream that died mid-flight. Reported, never
          // thrown: a consumer awaiting `end` must not have to also catch.
          stderr = stderr === "" ? messageOf(error) : stderr;
        } finally {
          disarm?.();
          // Still running when the iteration ends means the consumer broke
          // early (T2.5) — on the normal path the child has already exited, so
          // this is the condition itself rather than a flag tracking it. The
          // child does not get to outlive the iteration that started it, and the
          // ladder is how it is asked to stop, not a bare `SIGKILL`.
          if (child !== null && child.running) escalate(child, clock);
        }

        yield {
          kind: "end",
          result: {
            argv,
            exitCode: exit.code,
            signal: exit.signal,
            // The payload arrived as patches; there is no single document to
            // parse. `stdoutRaw` is retained regardless (I6, I7).
            stdout: undefined,
            stdoutRaw,
            stderr,
            durationMs: clock.now() - started,
            parseError: null,
            cancelled: state.cancelled,
            timedOut: state.timedOut,
          },
        };
      }

      return { [Symbol.asyncIterator]: (): AsyncGenerator<RawPatch> => body() };
    },
  };
}
