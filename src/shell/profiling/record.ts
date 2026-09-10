/**
 * C28 I46 — a session's inputs, recorded as one ordered stream.
 *
 * **Four taps, one sink, and no new seam in the shell.** Input bytes, resizes,
 * far-side patches and written frames each reach a decorator over something
 * `TuiConfig` already injects — `stdin`, `stdout`, `TransportRouter` — so a
 * session that is not recording holds no recorder-shaped hole. This is C08's
 * technique for the one of the four it already does (`data/fixtures/record.ts`:
 * *recording cannot drift from replay: there is no second implementation of
 * what a run looks like*).
 *
 * **The clocks are positional and not part of that order** (I14, F908). A
 * frame contains a wall-clock time and, since C24 I32, a duration; both must
 * come back exactly, and the only reading that survives is *read `n` returns
 * what read `n` returned*. Recording them as events would interleave thousands
 * of lines per second into a stream whose order matters for four things and
 * not for these, so they go in batches and are served by index.
 *
 * **Nothing here reads a clock or a filesystem.** `append` and both clocks are
 * given, which is what lets a row drive a recording without a process.
 */
import type { TerminalSize } from "../../terminal/lifecycle.js";
import type {
  Invocation,
  RawPatch,
  RawResult,
  TransportRouter,
  VerbTransport,
} from "../../data/transport/types.js";

/** One line of the NDJSON. */
export type RecordedEvent =
  /**
   * **Construction-time facts only** (I47). The capabilities are not here: they
   * are a verdict a session computes from this environment and the replies it
   * reads back, and recording the verdict takes C02 out of the gate.
   */
  | Readonly<{
      t: "regime";
      node: string;
      tier: string;
      /**
       * The app's own identity — **construction-time facts, and they reach a
       * frame.** The first replay diverged at byte 43 of frame 0 on the
       * `binary`, because the driver hard-coded one: the chrome draws it, so it
       * is as much an input to a frame as a keystroke is. `env` was already
       * here for the same reason one layer down (C02 reads it).
       */
      name: string;
      binary: string;
      env: Readonly<Record<string, string>>;
    }>
  | Readonly<{ t: "input"; n: number; b64: string }>
  /**
   * The size the session **started** at — not an event.
   *
   * **A distinct line, because replaying it as a `resize` is a resize the
   * session never had.** The first format carried it as the recording's first
   * `resize` and the driver delivered every resize as a `SIGWINCH`, so a
   * replayed session was resized to the width it already had. C03 treats that
   * as contamination, and the frame the recording drew as three addressed rows
   * came back as a full repaint — byte-different, correct on both sides, and
   * caused entirely by the harness (F912).
   *
   * The positional alternative — *the first resize before the first frame is
   * the initial one* — is the class F910 already punished: a rule about where a
   * line sits rather than what it says.
   */
  | Readonly<{ t: "geometry"; n: number; columns: number; rows: number }>
  | Readonly<{ t: "resize"; n: number; columns: number; rows: number }>
  | Readonly<{ t: "far"; n: number; verb: string; value: unknown }>
  | Readonly<{ t: "frame"; n: number; b64: string }>
  /** A batch, flushed periodically so a killed process loses at most one. */
  | Readonly<{ t: "clock"; wall: readonly number[]; mono: readonly number[] }>
  /** `open` is the number of streams still iterating — the truncation signal. */
  | Readonly<{ t: "end"; n: number; open: number }>;

export interface Recording {
  regime(r: Omit<Extract<RecordedEvent, { t: "regime" }>, "t">): void;
  input(chunk: Uint8Array | string): void;
  /** The size at construction — see the `geometry` event. */
  geometry(size: TerminalSize): void;
  resize(size: TerminalSize): void;
  far(verb: string, value: unknown): void;
  frame(bytes: Uint8Array | string): void;
  /** Wraps `clock`; the returned function records every read. */
  wall(read: () => number): () => number;
  /** Wraps `elapsed`; the returned function records every read. */
  mono(read: () => number): () => number;
  /**
   * Record every value an iterable yields, and bracket it as open.
   *
   * **One method rather than an `opened`/`closed` pair.** The pair put the
   * bracket's correctness on the caller — a `return` inside the loop leaks a
   * count that only shows up as a recording claiming truncation months later —
   * and it published two members whose only caller is in this file. The open
   * count stays in the closure and the `finally` is written once.
   *
   * **Bracketing the iteration and not the call** is what makes `open > 0` mean
   * *patches were still arriving*, which is the state I15 is about; a recording
   * killed between `stream()` and the first patch is not truncated in any sense
   * a reader cares about.
   */
  stream<T>(verb: string, iter: AsyncIterable<T>): AsyncIterable<T>;
  /** Flushes the clock batch. Called on `end` and every `FLUSH_EVERY` reads. */
  flush(): void;
  end(): void;
}

/** How many clock reads accumulate before a batch is written. */
const FLUSH_EVERY = 512;

const b64 = (v: Uint8Array | string): string =>
  typeof v === "string" ? Buffer.from(v, "utf8").toString("base64") : Buffer.from(v).toString("base64");

export function createRecording(append: (line: string) => void): Recording {
  let n = 0;
  let open = 0;
  let ended = false;
  const wallReads: number[] = [];
  const monoReads: number[] = [];

  const write = (e: RecordedEvent): void => {
    if (ended) return;
    append(`${JSON.stringify(e)}\n`);
  };

  const flush = (): void => {
    if (wallReads.length === 0 && monoReads.length === 0) return;
    write({ t: "clock", wall: [...wallReads], mono: [...monoReads] });
    wallReads.length = 0;
    monoReads.length = 0;
  };

  const tick = (): void => {
    if (wallReads.length + monoReads.length >= FLUSH_EVERY) flush();
  };

  return {
    regime(r) {
      write({ t: "regime", ...r });
    },
    input(chunk) {
      write({ t: "input", n: n++, b64: b64(chunk) });
    },
    geometry(size) {
      write({ t: "geometry", n: n++, columns: size.columns, rows: size.rows });
    },
    resize(size) {
      write({ t: "resize", n: n++, columns: size.columns, rows: size.rows });
    },
    far(verb, value) {
      write({ t: "far", n: n++, verb, value });
    },
    frame(bytes) {
      write({ t: "frame", n: n++, b64: b64(bytes) });
    },
    wall(read) {
      return () => {
        const v = read();
        wallReads.push(v);
        tick();
        return v;
      };
    },
    mono(read) {
      return () => {
        const v = read();
        monoReads.push(v);
        tick();
        return v;
      };
    },
    stream<T>(verb: string, iter: AsyncIterable<T>): AsyncIterable<T> {
      const self = this as Recording;
      return {
        async *[Symbol.asyncIterator]() {
          open += 1;
          try {
            for await (const value of iter) {
              self.far(verb, value);
              yield value;
            }
          } finally {
            open -= 1;
          }
        },
      };
    },
    flush,
    end() {
      if (ended) return;
      flush();
      write({ t: "end", n: n++, open });
      ended = true;
    },
  };
}

/**
 * The frame tap — **over `lifecycle.writer`, not over `stdout`.**
 *
 * **Two layers say this is the wrong stream and both were learned the hard
 * way.** SS42 says the terminal's dimensions are read in `lifecycle.ts` and
 * handed down, so the first draft's resize detection — comparing
 * `stdout.columns` against the size it saw last — was a dimension read outside
 * C01. And C01 I9 replaces `stdout.write` at construction with one that routes
 * to `debug`, keeping the original only on `writer`: a tap on `stdout` sits
 * *inside* that redirect, so it forwards each frame into the debug sink and the
 * session draws nothing, silently and completely (F909).
 *
 * `writer` is C01's own definition of *the renderer* — the handle that still
 * reaches the terminal — which makes it the only stream on which \"every frame
 * this session drew\" is a true statement.
 *
 * A `Proxy` rather than a spread, for `lifecycle.ts`'s reason: the stream's
 * accessors are live, and a copy taken once answers the size the terminal had
 * at construction for ever.
 */
export function recordWriter(writer: NodeJS.WriteStream, rec: Recording): NodeJS.WriteStream {
  return new Proxy(writer, {
    get(target, prop, receiver) {
      if (prop === "write") {
        return (chunk: string | Uint8Array, ...rest: unknown[]): boolean => {
          rec.frame(chunk);
          return (target.write as (...a: unknown[]) => boolean).call(target, chunk, ...rest);
        };
      }
      return passThrough(target, prop, receiver);
    },
  });
}

/**
 * The `stdin` tap.
 *
 * **Wrapping `on("data")` rather than piping**, because the lifecycle attaches
 * and detaches its listener across `suspend`/`resume` (C01 I18) and a pipe
 * would keep reading while the child owns the terminal — recording bytes the
 * session never saw, which replays as input arriving out of nowhere.
 */
export function recordStdin(stdin: NodeJS.ReadStream, rec: Recording): NodeJS.ReadStream {
  return new Proxy(stdin, {
    get(target, prop, receiver) {
      if (prop === "on" || prop === "addListener") {
        return (event: string, fn: Listener): NodeJS.ReadStream => {
          if (event !== "data") {
            target.on(event, fn as (...args: unknown[]) => void);
            return receiver as NodeJS.ReadStream;
          }
          const tapped: Listener = (...args) => {
            const chunk = args[0];
            if (chunk instanceof Uint8Array || typeof chunk === "string") rec.input(chunk);
            fn(...args);
          };
          // The original is kept beside the tap so `off` can find it — a
          // listener is removed by the identity that was added, and the tap
          // changed it. A `Map` keyed on the caller's function, not on ours.
          TAPPED.set(fn, tapped);
          target.on("data", tapped as (...args: unknown[]) => void);
          return receiver as NodeJS.ReadStream;
        };
      }
      if (prop === "off" || prop === "removeListener") {
        return (event: string, fn: Listener): NodeJS.ReadStream => {
          target.off(event, (TAPPED.get(fn) ?? fn) as (...args: unknown[]) => void);
          return receiver as NodeJS.ReadStream;
        };
      }
      return passThrough(target, prop, receiver);
    },
  });
}

/**
 * Read a member through to the real stream, **binding methods to it**.
 *
 * `Reflect.get(target, prop, receiver)` hands back an unbound function, so a
 * caller writing `stream.on(…)` invokes it with the *proxy* as `this`, and a
 * Node stream's methods reach for internal slots the proxy does not have.
 * `lifecycle.ts` binds its own writer proxy for the same reason and says so;
 * this is that comment's second instance.
 */
function passThrough(target: object, prop: string | symbol, receiver: unknown): unknown {
  const value = Reflect.get(target, prop, receiver) as unknown;
  return typeof value === "function" ? (value as (...a: never[]) => unknown).bind(target) : value;
}

type Listener = (...args: readonly unknown[]) => void;

const TAPPED = new WeakMap<Listener, Listener>();

/**
 * The far-side tap — **`invoke` and `stream` both, and the stream counts**.
 *
 * `streamOpened`/`streamClosed` bracket the iteration rather than the call, so
 * a recording killed while patches are arriving reports `open > 0` and the
 * replay reads it as truncated instead of as a framework divergence (I15).
 */
export function recordTransport(router: TransportRouter, rec: Recording): TransportRouter {
  return {
    for(verb: string): VerbTransport {
      const inner = router.for(verb);
      return {
        async invoke(inv: Invocation): Promise<RawResult> {
          const result = await inner.invoke(inv);
          rec.far(verb, result);
          return result;
        },
        stream: (inv: Invocation): AsyncIterable<RawPatch> => rec.stream(verb, inner.stream(inv)),
      };
    },
    get busy() {
      return router.busy;
    },
    get inFlight() {
      return router.inFlight;
    },
  };
}
