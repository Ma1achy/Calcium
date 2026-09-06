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

import type { Block, EntryId, Probe, TranscriptEntry } from "./deps.js";
import type { HeightMisses } from "./cache.js";

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
  /**
   * Rows the composer draws *around* an entry, and which therefore belong to its
   * height (I20).
   *
   * The command line is the one producer: it is chrome rather than a block, so
   * no adapter made it and C13's cap never counts it — but it occupies a row and
   * wraps, so an index that left it out would virtualise against a height the
   * frame does not draw. That is the distinction I18's live gutter does *not*
   * illustrate: the gutter costs columns.
   *
   * Optional, defaulting to none, so C14 still knows nothing about what the
   * chrome says.
   */
  chromeRows?: (entry: TranscriptEntry, width: number) => number;
  /**
   * C28's instrumentation seam, or absent (C28 I30).
   *
   * **The L0 type, so C14 still imports nothing from `src/shell/`.** SS4 bans a
   * clock here with no exceptions and this does not give C14 one: it names
   * regions and counts events, and only L4 knows when any of it happened.
   *
   * What it is here for is the height cache. Its three-axis predicate is the
   * one place C14 can be wrong about work rather than about arithmetic, and a
   * `width` miss with no resize means the whole index rebuilt for nothing.
   */
  probe?: Probe;
}>;

export interface Viewport {
  readonly scroll: ScrollState;
  readonly anchor: Anchor | null;

  visible(): VisibleRange;
  /**
   * The entry at a viewport row, and the row within it — in the entry's height
   * as the index holds it, chrome rows included (I19, I20).
   *
   * **Pure and total**: reads the index and the current scroll, stores nothing,
   * and answers `null` for any row the transcript does not occupy — a negative
   * row, one past the viewport's height, or one below the last entry of a short
   * transcript. A click on blank space beneath the transcript is not a click on
   * the thing above it (T3.1b).
   *
   * **The only place a region row becomes an entry.** C16 routes the mouse by
   * position and takes this as an injected dep rather than recomputing it — two
   * components computing where a row is agree until one learns about a height
   * change and the other does not. Declared by the spec from the start and, for
   * the whole time the mouse could be decoded, supplied to C16 as `() => null`
   * by the production frame: the router's viewport rung had never once fired.
   */
  entryAtRow(row: number): Anchor | null;

  scrollBy(rows: number): void;
  scrollToTop(): void;
  scrollToBottom(): void;
  pageUp(): void;
  pageDown(): void;

  /** Width invalidates every height; height invalidates none (I8). */
  resize(size: Readonly<{ width: number; height: number }>): void;

  subscribe(cb: (change: ViewportChange) => void): Disposable;
  dispose(): void;

  /**
   * Cache and index sizes for the post-conditions I3 and I9 state, **and the
   * cache's hit rate by reason** (I27).
   *
   * A size says how much is held; only a rate says whether holding it was worth
   * anything, and only the reason says whether a miss was legitimate. The three
   * travel together because the size alone has been the whole diagnostic and it
   * cannot distinguish a cache working from one thrashing (F863).
   */
  readonly stats: Readonly<{
    cacheSize: number;
    indexCapacity: number;
    entryCount: number;
    hits: number;
    misses: HeightMisses;
  }>;
}
