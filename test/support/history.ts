// C20's filesystem double, and the clock C20 refuses to read.
//
// **Every failure mode here is asserted to take effect**, in
// `test/unit/support-harness.test.ts`, per this directory's rule: a fake that
// cannot fail makes T3.7 and T3.8 read as covering a read-only home and a full
// disk while running neither. That is A03 §2's vacuity class one layer out, and
// this file is exactly the shape it likes — five options, each of which a
// careless implementation would silently discard.
import { openHistory, type HistoryEntry, type HistoryFs, type HistoryStore } from "../../src/interaction/history/index.js";

export type Failure = "none" | "readOnly" | "full";

export interface FakeFs extends HistoryFs {
  readonly files: Map<string, string>;
  /** Every write from now on rejects, until set back to `"none"`. */
  fail(mode: Failure): void;
  /**
   * Make asynchronous appends settle in the order opposite to the one they were
   * issued in.
   *
   * The point of T3.19: the writer's chain means the second write is not issued
   * until the first has settled, so this cannot reorder anything — unless
   * somebody removes the chain, which is the mutation the test exists to catch.
   */
  jitter(on: boolean): void;
  /** Writes recorded in the order they *reached* the file, for alignment assertions. */
  readonly writes: readonly string[];
}

const MESSAGES: Record<Exclude<Failure, "none">, string> = {
  readOnly: "EACCES: permission denied",
  full: "ENOSPC: no space left on device",
};

export function fakeFs(seed: Readonly<Record<string, string>> = {}): FakeFs {
  const files = new Map<string, string>(Object.entries(seed));
  const writes: string[] = [];
  let failure: Failure = "none";
  let jittering = false;
  let issued = 0;

  function guard(): void {
    if (failure !== "none") throw new Error(MESSAGES[failure]);
  }

  async function settle(): Promise<void> {
    if (!jittering) return;
    // Earlier calls wait longer, so a caller that issues two writes without
    // awaiting the first sees them land in the wrong order.
    const turns = Math.max(0, 8 - (issued += 1));
    for (let i = 0; i < turns; i += 1) await Promise.resolve();
  }

  return {
    files,
    writes,

    fail(mode) {
      failure = mode;
    },

    jitter(on) {
      jittering = on;
      issued = 0;
    },

    async readFile(path) {
      const text = files.get(path);
      if (text === undefined) throw new Error(`ENOENT: no such file, open '${path}'`);
      return text;
    },

    async writeFile(path, data) {
      await settle();
      guard();
      files.set(path, data);
      writes.push(path);
    },

    async appendFile(path, data) {
      await settle();
      guard();
      files.set(path, (files.get(path) ?? "") + data);
      writes.push(path);
    },

    appendFileSync(path, data) {
      guard();
      files.set(path, (files.get(path) ?? "") + data);
      writes.push(path);
    },
  };
}

/** A clock that never repeats, so a timestamp names the append that produced it. */
export function fakeClock(start = 1_700_000_000_000, step = 1_000): () => number {
  let now = start - step;
  return () => (now += step);
}

export const DIR = "/state";
export const COMMANDS = `${DIR}/history`;
export const META = `${DIR}/history.meta`;

export type Opened = Readonly<{ store: HistoryStore; fs: FakeFs }>;

export async function openWith(
  seed: Readonly<Record<string, string>> = {},
  options: Readonly<{ cap?: number; clock?: () => number }> = {},
): Promise<Opened> {
  const fs = fakeFs(seed);
  const store = await openHistory({
    fs,
    clock: options.clock ?? fakeClock(),
    stateDir: DIR,
    ...(options.cap === undefined ? {} : { cap: options.cap }),
  });
  return { store, fs };
}

/** A file body from commands, for seeding — escaping included, so a test can write a newline. */
export function seedFiles(entries: readonly HistoryEntry[]): Record<string, string> {
  return {
    [COMMANDS]: entries.map((e) => `${e.command.replace(/\\/g, "\\\\").replace(/\n/g, "\\n")}\n`).join(""),
    [META]: entries.map((e) => `${String(e.ts)} ${String(e.exitCode)}\n`).join(""),
  };
}

export function entry(command: string, ts = 1, exitCode = 0): HistoryEntry {
  return Object.freeze({ command, ts, exitCode });
}
