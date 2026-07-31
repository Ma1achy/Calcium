/**
 * C20's shapes.
 *
 * `HistoryFs` is declared here rather than imported from C22 for two reasons
 * that point the same way: C22 does not exist, and C22 is L4 — an L3 component
 * reaching upward for a type is the edge A02 Seam 4 exists to prevent. C22 §2's
 * `FileSystem` is a superset and satisfies this structurally, so the injected
 * filesystem passes straight down with no adapter (T2.11).
 *
 * The `ReadDir` precedent in C19's path source, for the same reason it gives: a
 * wider type here would let a later edit reach for something the component never
 * needed.
 */

import type { Block, Layer } from "./deps.js";

export type HistoryEntry = Readonly<{ command: string; ts: number; exitCode: number }>;
export type SearchHit = Readonly<{ command: string; index: number }>;

/**
 * `failed` is §7a Trace 2's finding (I22).
 *
 * Without it a narrowing keystroke that matches nothing has only two outcomes,
 * and both are wrong: retain the hit and the overlay shows a line that does not
 * contain the query printed beside it, or clear it and the next backspace
 * silently undoes a walk the user made on purpose.
 */
export type SearchState = Readonly<{ query: string; hit: SearchHit | null; failed: boolean }>;

/** The prompt's own extent, as C15 wants it — C19's `menuLayer` takes the same. */
export type Anchor = Readonly<{ row: number; rows: number }>;

export type SearchAction = "submit" | "accept" | "cancel";

/**
 * Four methods, one of them synchronous.
 *
 * `appendFileSync` exists for I18 and nowhere else: C22 §8 flushes history
 * inside `beforeRelease`, C01 I5 requires that to be synchronous, and Node does
 * not wait for a pending promise at exit — so without it the append in flight
 * when the process ends is the command the user has just typed.
 */
export interface HistoryFs {
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  appendFile(path: string, data: string): Promise<void>;
  appendFileSync(path: string, data: string): void;
}

export type HistoryDeps = Readonly<{
  fs: HistoryFs;
  clock: () => number;
  stateDir: string;
  cap?: number;
}>;

export interface HistoryStore {
  append(command: string, exitCode: number): void;
  previous(current: string): string | null;
  next(): string | null;
  resetNavigation(): void;
  search(query: string, from?: number): SearchHit | null;
  list(filter?: string): readonly HistoryEntry[];
  listBlocks(filter?: string): readonly Block[];
  rerun(index: number): string | null;
  clear(): void;

  searchOpen(current: string): void;
  searchType(text: string): void;
  searchBackspace(): void;
  searchOlder(): void;
  searchEnd(action: SearchAction): string | null;
  searchLayer(anchor: Anchor): Layer;

  clearConfirmLayer(): Layer;

  flush(): Promise<void>;
  drain(): void;

  readonly entries: readonly HistoryEntry[];
  readonly navigating: boolean;
  readonly searchState: SearchState | null;
  readonly warnings: readonly string[];
}

/** The default cap (I10). Overridable through `HistoryDeps` for tests. */
export const DEFAULT_CAP = 10_000;

/**
 * How far the files may run past the cap before they are compacted together.
 *
 * I10's promise is about `entries` and about what a load produces. Rewriting
 * both files on every append once full is the obvious reading and costs a
 * megabyte of writing per submitted command; the slack keeps the promise and
 * pays once every 256.
 */
export const COMPACT_SLACK = 256;
