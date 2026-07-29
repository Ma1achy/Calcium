// Fakes for C01's tiers 1-3. No real terminal, no PTY.
//
// A fabricated capability record and a stream that records what it was given is
// what makes every unit test a table rather than a mock — the same reason C02
// takes its `env` by injection.
import type { TerminalCapabilities } from "../../src/terminal/capabilities.js";

export const ALL_CAPABILITIES: TerminalCapabilities = Object.freeze({
  colourDepth: 24,
  unicode: "full",
  synchronisedUpdate: true,
  bracketedPaste: true,
  mouse: true,
  imageProtocol: "none",
  altScreen: true,
});

export function capabilities(over: Partial<TerminalCapabilities> = {}): TerminalCapabilities {
  return Object.freeze({ ...ALL_CAPABILITIES, ...over });
}

export type FakeStdout = NodeJS.WriteStream & {
  /** Everything that reached the real stream — i.e. was written through `writer`. */
  readonly chunks: string[];
  /** Joined, for substring assertions. */
  readonly output: string;
  /** Reads of `columns` and `rows`, counted for I12. */
  readonly reads: { columns: number; rows: number };
  /** Make the next `write` throw, once, when `chunks.length` reaches `at`. */
  throwOn(at: number, err?: Error): void;
  /** Run `fn` inside the next `write` — how a signal is delivered mid-acquire. */
  duringWrite(at: number, fn: () => void): void;
};

export function fakeStdout(size = { columns: 80, rows: 24 }): FakeStdout {
  const chunks: string[] = [];
  const reads = { columns: 0, rows: 0 };
  let throwAt: number | null = null;
  let thrown: Error = new Error("write failed");
  let hookAt: number | null = null;
  let hook: (() => void) | null = null;

  const stream = {
    isTTY: true,
    write(chunk: unknown): boolean {
      if (hookAt === chunks.length && hook !== null) {
        const fn = hook;
        hook = null;
        hookAt = null;
        fn();
      }
      if (throwAt === chunks.length) {
        throwAt = null;
        throw thrown;
      }
      chunks.push(String(chunk));
      return true;
    },
    get chunks() {
      return chunks;
    },
    get output() {
      return chunks.join("");
    },
    get reads() {
      return reads;
    },
    get columns() {
      reads.columns += 1;
      return size.columns;
    },
    get rows() {
      reads.rows += 1;
      return size.rows;
    },
    throwOn(at: number, err?: Error): void {
      throwAt = at;
      if (err !== undefined) thrown = err;
    },
    duringWrite(at: number, fn: () => void): void {
      hookAt = at;
      hook = fn;
    },
    on(): unknown {
      return stream;
    },
    once(): unknown {
      return stream;
    },
    off(): unknown {
      return stream;
    },
    removeListener(): unknown {
      return stream;
    },
    emit(): boolean {
      return false;
    },
    end(): unknown {
      return stream;
    },
  };

  return stream as unknown as FakeStdout;
}

export type FakeStdin = NodeJS.ReadStream & {
  readonly rawModeCalls: boolean[];
};

/** `tty: false` drops `setRawMode` entirely — stdin is not a TTY (T3.9). */
export function fakeStdin({ tty = true } = {}): FakeStdin {
  const rawModeCalls: boolean[] = [];
  const stream: Record<string, unknown> = {
    isTTY: tty,
    get rawModeCalls() {
      return rawModeCalls;
    },
    on: () => stream,
    once: () => stream,
    off: () => stream,
    removeListener: () => stream,
    resume: () => stream,
    pause: () => stream,
  };
  if (tty) {
    stream["setRawMode"] = (on: boolean): unknown => {
      rawModeCalls.push(on);
      return stream;
    };
  }
  return stream as unknown as FakeStdin;
}

/** A `debug` sink that records rather than writes — SS33 forbids console in src/. */
export function fakeDebug(): ((line: string) => void) & { lines: string[] } {
  const lines: string[] = [];
  const sink = (line: string): void => void lines.push(line);
  return Object.assign(sink, { lines });
}

/**
 * The mode numbers, for asserting presence and absence by name rather than by
 * pasting escape literals into a test — A03 SS14 scopes to `src/`, but a test
 * full of raw escapes is unreadable regardless.
 */
export const MODES = {
  altScreenOn: "[?1049h",
  altScreenOff: "[?1049l",
  cursorHide: "[?25l",
  cursorShow: "[?25h",
  pasteOn: "[?2004h",
  pasteOff: "[?2004l",
  mouseOn: "[?1002h",
  mouseSgrOn: "[?1006h",
  mouseOff: "[?1002l",
  mouseSgrOff: "[?1006l",
  // C03's, and the only pair here C01 never emits (C01 T6.12).
  syncOn: "[?2026h",
  syncOff: "[?2026l",
} as const;
