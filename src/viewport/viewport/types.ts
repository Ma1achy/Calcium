/**
 * The viewport's vocabulary.
 *
 * C14 — see spec. Types only; the arithmetic is `viewport.ts` and the two
 * structures it rests on are `index-tree.ts` and `cache.ts`.
 *
 * C14 imports nothing from `terminal/` (I12, MG11). Dimensions arrive as data
 * and C14 never calls the frame scheduler — a scroll reports a change and L4
 * commits, which is the same orchestration pattern C01 and C10 follow.
 */

import type { Block, EntryId } from "./deps.js";

export type ScrollState = Readonly<{
  topRow: number;
  viewportHeight: number;
  totalRows: number;
  followTail: boolean;
}>;

/**
 * An entry id and a row *within that entry* — never an index (I6).
 *
 * That is what makes it immune to eviction: C13 trims the front continuously, so
 * an index means something different after every command, while an id resolves
 * to the same content or to nothing.
 */
export type Anchor = Readonly<{ id: EntryId; rowOffset: number }>;

export type VisibleEntry = Readonly<{
  id: EntryId;
  /** Rows of this entry above the viewport's top edge. */
  skipRows: number;
  /** Rows of this entry inside the viewport. */
  takeRows: number;
  /**
   * Whether this is C13's live entry, so the frame can draw the **live gutter**
   * (`▌`, D6) without re-consulting the transcript per row.
   *
   * The live gutter, never "the marker": C13's eviction marker is an ordinary
   * entry that costs the rows it measures (I13), and this costs none (I18). Two
   * different things carried one name until the C14 spec pass, distinguishable
   * only by which invariant a sentence cited.
   */
  live: boolean;
}>;

export type VisibleRange = Readonly<{
  entries: readonly VisibleEntry[];
  topRow: number;
  atTop: boolean;
  atBottom: boolean;
}>;

/** What C14 tells L4 changed. C14 never commits a frame itself (I12). */
export type ViewportChange = Readonly<{ kind: "scroll" | "content" | "resize" }>;

export type ViewportOptions = Readonly<{
  width: number;
  height: number;
  /**
   * C09's registry dispatcher, injected. **`measureSequence`, not `measure`** —
   * the two differ by one row per `gapBefore` (C09 I17), and taking the sequence
   * form as the seam is what stops the summation being written here at all (I1).
   */
  measureSequence: (blocks: readonly Block[], width: number) => number;
}>;

export interface Viewport {
  readonly scroll: ScrollState;
  readonly anchor: Anchor | null;

  visible(): VisibleRange;

  scrollBy(rows: number): void;
  scrollToTop(): void;
  scrollToBottom(): void;
  pageUp(): void;
  pageDown(): void;

  /** Width invalidates every height; height invalidates none (I8). */
  resize(size: Readonly<{ width: number; height: number }>): void;

  subscribe(cb: (change: ViewportChange) => void): Disposable;
  dispose(): void;

  /** Cache and index sizes, for the post-conditions I3 and I9 state. */
  readonly stats: Readonly<{ cacheSize: number; indexCapacity: number; entryCount: number }>;
}
