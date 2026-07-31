// C19's stand-ins: a controllable dynamic source, a fake directory reader, and
// the context builder every tier uses.
//
// Nothing here is a mock. Each is a recording stand-in, so a test can be a table
// of inputs and outputs rather than a script of expectations.
//
// **Every parameter is asserted to take effect**, per this directory's rule.
// `test/unit/support-harness.test.ts` holds those assertions; the defaults below
// are chosen to differ from the values tests ask for, so a helper that ignored
// its argument would fail rather than pass.

import { contextAt } from "../../src/interaction/completion/index.js";
import type {
  Candidate,
  CompletionContext,
  CompletionSource,
  DirEntry,
} from "../../src/interaction/completion/index.js";
import type { Manifest } from "../../src/data/manifest/index.js";
import { fixture } from "./manifest.js";

/** A clock a test steps by hand. Default 0, so any `at` a test sets differs. */
export function fakeClock(start = 0): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return {
    now: () => t,
    advance: (ms) => {
      t += ms;
    },
  };
}

export type Deferred = Readonly<{
  source: CompletionSource;
  /** How many times the source function actually ran — T3.9's spy. */
  calls: () => number;
  resolve: (candidates: readonly Candidate[]) => void;
  reject: (error: unknown) => void;
}>;

/**
 * A dynamic source that resolves only when a test says so.
 *
 * The default `slots` is `["flagValue"]` rather than every slot, so a test that
 * passes its own list and is ignored would see candidates in the wrong slot and
 * fail.
 */
export function deferredSource(
  over: Partial<Pick<CompletionSource, "id" | "slots" | "ttlMs">> = {},
): Deferred {
  let calls = 0;
  let settle: ((c: readonly Candidate[]) => void) | null = null;
  let fail: ((e: unknown) => void) | null = null;

  const source: CompletionSource = {
    id: over.id ?? "deferred",
    slots: over.slots ?? ["flagValue"],
    dynamic: true,
    ...(over.ttlMs === undefined ? {} : { ttlMs: over.ttlMs }),
    complete() {
      calls += 1;
      return new Promise<readonly Candidate[]>((res, rej) => {
        settle = res;
        fail = rej;
      });
    },
  };

  return {
    source,
    calls: () => calls,
    resolve: (candidates) => settle?.(candidates),
    reject: (error) => fail?.(error),
  };
}

/** A dynamic source that resolves immediately with what it is given. */
export function instantSource(
  id: string,
  slots: CompletionSource["slots"],
  candidates: readonly Candidate[],
): CompletionSource & { calls: () => number } {
  let calls = 0;
  return {
    id,
    slots,
    dynamic: true,
    complete() {
      calls += 1;
      return Promise.resolve(candidates);
    },
    calls: () => calls,
  };
}

/**
 * A directory reader over a plain map (I17).
 *
 * Every tier below 5 drives the filesystem sources through this, which is what
 * T2.3b asserts: no `fs` import in `completion/`, and no test needing a real
 * tree.
 */
export function fakeDirs(tree: Readonly<Record<string, readonly DirEntry[]>>): {
  readDir: (path: string) => Promise<readonly DirEntry[]>;
  reads: () => readonly string[];
} {
  const reads: string[] = [];
  return {
    readDir: (path) => {
      reads.push(path);
      const entries = tree[path];
      if (entries === undefined) return Promise.reject(new Error(`no such directory: ${path}`));
      return Promise.resolve(entries);
    },
    reads: () => Object.freeze([...reads]),
  };
}

/**
 * A context from a line with `\u2038` marking the cursor.
 *
 * The marker keeps every case legible as one string — `"/ps --stat\u2038"` —
 * instead of a line and an offset that can disagree with it.
 *
 * **It was `|` for one commit, and `|` is a shell operator.** `"ls | gre|"`
 * put the cursor at the pipe, so the command-position case built a context for
 * a line the test was not describing and failed with a slot that was correct
 * for the input it actually got. A marker has to be a character the language
 * under test cannot contain; a caret is not in C18's operator set and cannot
 * appear in a command.
 */
export const CURSOR = "\u2038";

export function at(line: string, manifest: Manifest | null = fixture()): CompletionContext {
  const cursor = line.indexOf(CURSOR);
  if (cursor === -1) throw new Error(`no cursor marker in ${JSON.stringify(line)}`);
  const input = line.slice(0, cursor) + line.slice(cursor + CURSOR.length);
  return contextAt(input, cursor, manifest);
}

/** The whole state of an engine, for §8a's row-by-row assertions. */
export function snapshot(engine: {
  active: number | null;
  pending: boolean;
  spinning: boolean;
  inFlight: number;
}): Readonly<{ active: number | null; pending: boolean; spinning: boolean; inFlight: number }> {
  return Object.freeze({
    active: engine.active,
    pending: engine.pending,
    spinning: engine.spinning,
    inFlight: engine.inFlight,
  });
}
