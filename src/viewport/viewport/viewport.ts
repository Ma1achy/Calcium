/**
 * Scroll state, virtualisation, the height cache.
 *
 * C14 — see spec.
 *
 * Alt-screen means the terminal's own scrollback is gone (D2), and this is what
 * replaces it. The failure to design against is **drift**: a viewport whose
 * arithmetic disagrees with what is drawn does not look broken, it feels broken
 * — content jumps as you scroll past it, and the cause is three components away.
 *
 * Two lines carry most of that risk, and both are named where they occur:
 * heights come from `measureSequence` and never from a summation (I1), and a
 * detached viewport recomputes `topRow` from the anchor rather than keeping it
 * (I4).
 */

import { HeightCache } from "./cache.js";
import { HeightIndex } from "./index-tree.js";
import { atTail } from "./tail.js";
import type {
  Anchor,
  ScrollState,
  ViewportChange,
  ViewportOptions,
  VisibleEntry,
  VisibleRange,
  Viewport,
} from "./types.js";
import type { Change, EntryId, TranscriptEntry, TranscriptView } from "./deps.js";

class ViewportImpl implements Viewport {
  readonly #view: TranscriptView;
  readonly #measureSequence: ViewportOptions["measureSequence"];
  readonly #chromeRows: NonNullable<ViewportOptions["chromeRows"]>;
  readonly #cache = new HeightCache();
  readonly #index = new HeightIndex();
  readonly #subscribers = new Set<(change: ViewportChange) => void>();
  readonly #unsubscribe: Disposable;

  /** The entry ids the index currently mirrors, slot for slot. See `#sync`. */
  #ids: EntryId[] = [];
  #width: number;
  #height: number;
  #topRow = 0;
  #followTail = true;
  #anchor: Anchor | null = null;

  constructor(view: TranscriptView, opts: ViewportOptions) {
    this.#view = view;
    this.#width = opts.width;
    this.#height = opts.height;
    this.#measureSequence = opts.measureSequence;
    this.#chromeRows = opts.chromeRows ?? ((): number => 0);

    this.#rebuild();
    this.#unsubscribe = view.subscribe((c) => this.#onChange(c));
  }

  get scroll(): ScrollState {
    return Object.freeze({
      topRow: this.#topRow,
      viewportHeight: this.#height,
      totalRows: this.#index.totalRows,
      followTail: this.#followTail,
    });
  }

  get anchor(): Anchor | null {
    return this.#anchor;
  }

  get stats(): Readonly<{ cacheSize: number; indexCapacity: number; entryCount: number }> {
    return Object.freeze({
      cacheSize: this.#cache.size,
      indexCapacity: this.#index.capacity,
      entryCount: this.#view.entries.length,
    });
  }

  visible(): VisibleRange {
    const entries = this.#view.entries;
    const total = this.#index.totalRows;
    const height = Math.max(0, this.#height);
    const top = this.#topRow;
    const liveId = this.#view.liveId;

    if (height === 0 || total === 0 || entries.length === 0) {
      return Object.freeze({
        entries: Object.freeze([]),
        topRow: top,
        atTop: top === 0,
        // An empty transcript is at both edges at once, and so is one shorter
        // than the viewport (T1.4). Neither is a degenerate case to special-case
        // away: `End` on an empty screen must not move, and `atTop` must not
        // report false because there is nothing to be at the top of.
        atBottom: true,
      });
    }

    const out: VisibleEntry[] = [];
    const { index: firstIndex, offset } = this.#index.locate(top);
    let taken = 0;

    for (let i = firstIndex; i < entries.length && taken < height; i += 1) {
      const entryHeight = this.#index.at(i);
      // A zero-height entry (an empty `group`, T3.6) consumes no row and is not
      // reported: a `VisibleEntry` with `takeRows: 0` would make I10's sum hold
      // while putting an entry on screen that occupies nothing.
      if (entryHeight === 0) continue;

      const skipRows = i === firstIndex ? offset : 0;
      const available = entryHeight - skipRows;
      if (available <= 0) continue;

      const takeRows = Math.min(available, height - taken);
      const entry = entries[i];
      if (entry === undefined) break;

      out.push(Object.freeze({ id: entry.id, skipRows, takeRows, live: entry.id === liveId }));
      taken += takeRows;
    }

    return Object.freeze({
      entries: Object.freeze(out),
      topRow: top,
      atTop: top === 0,
      atBottom: atTail(top, this.#maxTop()),
    });
  }

  entryAtRow(row: number): Anchor | null {
    // A region row, bounded by the viewport it is a row of. `>= height` rather
    // than `> totalRows` alone, because a transcript taller than the viewport
    // has rows below the region that no pointer can be on.
    if (!Number.isInteger(row) || row < 0 || row >= Math.max(0, this.#height)) return null;
    const absolute = this.#topRow + row;
    // No `totalRows` guard: `locate` past the end yields `index === entries.length`,
    // and the `undefined` check below already answers `null`. A guard here was
    // measured dead — removing it failed nothing (F754's mutation M7).
    // `locate` walks past zero-height entries, so `offset` is inside an entry
    // that has rows — the same descent `visible()` starts from (T3.1c: an entry
    // that begins above the top edge answers with the rows already scrolled).
    const { index, offset } = this.#index.locate(absolute);
    const entry = this.#view.entries[index];
    if (entry === undefined) return null;
    return Object.freeze({ id: entry.id, rowOffset: offset });
  }

  scrollBy(rows: number): void {
    if (rows === 0) return;
    const before = this.#topRow;
    this.#setTop(this.#topRow + rows);

    // I5 — `followTail` is on iff the viewport is at the bottom. Derived from
    // where the viewport ended up, never from which way the user scrolled: a
    // scroll up that clamps at the bottom because the transcript is shorter than
    // the screen has not detached anything. `atTail` is the one comparison the
    // shell's tail helpers read too (C04 I97), so `>=` cannot drift in one copy.
    this.#followTail = atTail(this.#topRow, this.#maxTop());
    if (!this.#followTail) this.#captureAnchor();
    else this.#anchor = null;

    if (this.#topRow !== before) this.#emit({ kind: "scroll" });
  }

  scrollToTop(): void {
    this.#setTop(0);
    // The same derivation as `scrollBy`: at the top, following iff the whole
    // transcript fits — `maxTop() === 0`, spelled as the comparison it is.
    this.#followTail = atTail(this.#topRow, this.#maxTop());
    this.#captureAnchor();
    this.#emit({ kind: "scroll" });
  }

  scrollToBottom(): void {
    this.#setTop(this.#maxTop());
    this.#followTail = true;
    this.#anchor = null;
    this.#emit({ kind: "scroll" });
  }

  /** I17 — exactly `viewportHeight − 1`, both ways. The overlap is the point. */
  pageUp(): void {
    this.scrollBy(-Math.max(1, this.#height - 1));
  }

  pageDown(): void {
    this.scrollBy(Math.max(1, this.#height - 1));
  }

  resize(size: Readonly<{ width: number; height: number }>): void {
    // Step 0 (§5, I21) — the size already held is not a resize.
    //
    // **The emit is the load-bearing half.** A `Change` says the view moved, and
    // the steps below are not inert: they capture an anchor and restore it, so a
    // caller handing over the same size gets a report of a move that did not
    // happen. L4's answer to a change is to compose a frame, and L4 sets the
    // height from the frame it just composed (C22 I34) — without this guard that
    // is one frame per frame, forever.
    //
    // Argued without reference to that caller, because it is true without it: a
    // `SIGWINCH` says the size *may* have changed, terminals send one for a font
    // change or a pane re-layout that ends where it began, and C01 holds no
    // previous size to compare against (C01 §Signals). This is the first place
    // that can tell.
    if (size.width === this.#width && size.height === this.#height) return;

    const widthChanged = size.width !== this.#width;

    // Step 1 before step 2 (§5): the anchor is captured *before* anything is
    // remeasured, because after remeasuring at a new width the old row offset
    // may exceed the entry's new height and there would be nothing left to
    // capture it from.
    if (!this.#followTail) this.#captureAnchor();

    this.#width = size.width;
    this.#height = size.height;

    if (widthChanged) {
      // I8 — a width change invalidates every height because wrapping changes.
      // A height change invalidates none, and doing both would make dragging a
      // terminal's bottom edge cost a full remeasure per frame.
      this.#cache.clear();
      this.#rebuild();
    }

    // Step 6 (§5) — **and it had no mechanism.** The step is written in the
    // spec and `resize` went straight to `#restoreFromAnchor`, which for a
    // following viewport (`anchor === null`) only clamps `topRow` into the new
    // bounds. So a viewport at the tail did not stay at the tail: shrinking the
    // region left `topRow` where it was and the last rows of the transcript slid
    // off the bottom of the screen, one row per row lost.
    //
    // Invisible until now because `resize` was only ever called on `SIGWINCH`,
    // where the drift is one event deep and reads as the terminal's doing. It is
    // per frame now (C22 I34), so it compounds — which is how this was found.
    // `#afterContent` had the same two-branch shape all along, ten lines away.
    if (this.#followTail) this.#setTop(this.#maxTop());
    else this.#restoreFromAnchor();
    this.#emit({ kind: "resize" });
  }

  subscribe(cb: (change: ViewportChange) => void): Disposable {
    this.#subscribers.add(cb);
    return {
      [Symbol.dispose]: () => {
        this.#subscribers.delete(cb);
      },
    };
  }

  dispose(): void {
    this.#unsubscribe[Symbol.dispose]();
    this.#subscribers.clear();
  }

  // --- reacting to C13 ------------------------------------------------------

  /**
   * C13's granular `Change` is what makes this incremental (I15, C13 I12).
   *
   * A bare "something changed" would force a full remeasure on every log line,
   * which at a thousand lines a second is the difference between working and
   * not — and it would make the Fenwick tree pointless, since a rebuild per
   * change is a linear walk with extra steps.
   */
  #onChange(change: Change): void {
    switch (change.kind) {
      // **`settle` shares `patch`'s arm, and the comment it replaces was true
      // when it was written** (§4). `settle(id)` ended a stream and left the
      // document alone; `settle(id, doc)` replaces it and moves `rev`, which is
      // a content change by any reading. Ignoring it left the app route's entry
      // measured at the height of the *pending* document — no blocks, zero rows
      // — for the rest of the session: `totalRows` of 0, an empty visible range,
      // and a blank screen with the entry sitting in the store.
      //
      // A bare settle costs a cache lookup that returns the same height, since
      // `rev` did not move (C13 I13). That is cheaper than an arm that has to
      // know which kind of settle it was.
      case "settle":
      case "patch": {
        // `rev` moved, so this entry's slot is stale and no other entry's is.
        const i = this.#ids.indexOf(change.id);
        const entry = this.#view.entries.find((e) => e.id === change.id);
        if (i >= 0 && entry !== undefined) this.#index.set(i, this.#heightOf(entry));
        else this.#sync();
        break;
      }

      case "evict": {
        for (const id of change.ids) this.#cache.delete(id);
        this.#sync();
        break;
      }

      case "clear": {
        this.#cache.clear();
        this.#index.clear();
        this.#ids = [];
        this.#topRow = 0;
        this.#followTail = true;
        this.#anchor = null;
        break;
      }

      case "append":
        this.#sync();
        break;
    }

    this.#afterContent();
  }

  /**
   * Bring the index into line with `entries`, incrementally where it can.
   *
   * **The index tracks what it mirrors rather than inferring it from the change
   * kind, and that is a correction the frame reading forced.** C13's `append()`
   * emits `append` *and then* `evict` for one call, so by the time the `append`
   * arrives the entry list has already lost its front and gained the eviction
   * marker at its head. A handler that pushed one slot per `append` was right
   * only when nothing was evicted alongside it, and the `evict` that followed
   * was then repairing an index that had already desynchronised. The symptom was
   * not a wrong number — it was `totalRows` of 0 and a blank screen with three
   * entries in the transcript, which an assertion on "the anchor falls forward"
   * reports as a pass.
   *
   * Keeping `#ids` makes the question answerable instead of inferred: what does
   * the index hold, and how does that differ from what the store holds now.
   * The two shapes C13 actually produces stay O(1) and O(k); anything else
   * rebuilds, which is correct at any cost and reached only by a change C13 does
   * not currently emit.
   */
  #sync(): void {
    const entries = this.#view.entries;

    // Pure tail append — the overwhelmingly common case, and O(1).
    if (
      entries.length === this.#ids.length + 1 &&
      this.#ids.every((id, i) => entries[i]?.id === id)
    ) {
      const entry = entries[entries.length - 1];
      if (entry !== undefined) {
        this.#index.push(this.#heightOf(entry));
        this.#ids.push(entry.id);
        return;
      }
    }

    // A front eviction with the tail unchanged — O(k) in what left.
    const dropped = this.#ids.length - entries.length;
    if (dropped > 0 && entries.every((e, i) => this.#ids[i + dropped] === e.id)) {
      this.#index.evictFront(dropped);
      this.#ids = this.#ids.slice(dropped);
      return;
    }

    this.#rebuild();
  }

  /**
   * §3's rule, and the single most noticeable correctness property here.
   *
   * While following, `topRow` tracks the bottom. While detached, it is
   * recomputed from `(anchorId, rowOffset)` — so a frozen streaming entry above
   * the viewport that gains rows moves only the content *below* it, and the row
   * the reader is looking at stays on the same screen row (I4).
   */
  #afterContent(): void {
    if (this.#followTail) this.#setTop(this.#maxTop());
    else this.#restoreFromAnchor();
    this.#emit({ kind: "content" });
  }

  #rebuild(): void {
    const entries = this.#view.entries;
    this.#index.rebuild(entries.map((e) => this.#heightOf(e)));
    this.#ids = entries.map((e) => e.id);
  }

  /**
   * **`measureSequence`, never `Σ measure`** (I1, C09 I17).
   *
   * The two differ by exactly one row per block declaring `gapBefore`, which C09
   * applies at the sequence and never at the block. A surface like S07 declares
   * it on most of its blocks, so the summation — which is the natural thing to
   * write — is short on nearly every entry, and the symptom is drift rather than
   * anything that looks like a bug. C14 takes the sequence form as its injected
   * seam so the summation cannot be written here at all.
   */
  #heightOf(entry: TranscriptEntry): number {
    const cached = this.#cache.get(entry.id, entry.rev, this.#width);
    if (cached !== undefined) return cached;

    // I20 — row-occupying chrome is part of the height. The composer draws
    // `chrome ++ blocks` and this must measure the same thing, or the index is
    // self-consistent about a document the frame is not showing.
    const height =
      this.#chromeRows(entry, this.#width) +
      this.#measureSequence(entry.doc.blocks, this.#width);
    this.#cache.set(entry.id, entry.rev, this.#width, height);
    return height;
  }

  // --- scroll arithmetic ----------------------------------------------------

  #maxTop(): number {
    return Math.max(0, this.#index.totalRows - Math.max(0, this.#height));
  }

  #setTop(row: number): void {
    // I2 — always within [0, max(0, totalRows − viewportHeight)].
    this.#topRow = Math.min(Math.max(0, row), this.#maxTop());
  }

  #captureAnchor(): void {
    const entries = this.#view.entries;
    if (entries.length === 0 || this.#index.totalRows === 0) {
      this.#anchor = null;
      return;
    }
    const { index, offset } = this.#index.locate(this.#topRow);
    const entry = entries[Math.min(index, entries.length - 1)];
    if (entry === undefined) {
      this.#anchor = null;
      return;
    }
    this.#anchor = Object.freeze({ id: entry.id, rowOffset: offset });
  }

  #restoreFromAnchor(): void {
    const anchor = this.#anchor;
    if (anchor === null) {
      this.#setTop(this.#topRow);
      return;
    }

    const i = this.#view.entries.findIndex((e) => e.id === anchor.id);
    if (i < 0) {
      // I6 — the anchored entry was evicted. Fall forward to the oldest
      // survivor rather than jumping to the top: the content the reader was
      // looking at is genuinely gone, and the top of the transcript is not where
      // they were.
      this.#setTop(0);
      this.#captureAnchor();
      return;
    }

    // I7 — after a remeasure the offset may exceed the entry's new height. It
    // clamps to that entry's last row rather than spilling into the next one, so
    // the anchor degrades gracefully instead of drifting by a whole entry.
    const height = this.#index.at(i);
    const offset = Math.min(anchor.rowOffset, Math.max(0, height - 1));
    this.#setTop(this.#index.rowsBefore(i) + offset);
  }

  #emit(change: ViewportChange): void {
    for (const cb of [...this.#subscribers]) {
      try {
        cb(change);
      } catch {
        // A consumer's fault is not the viewport's, and C14 has no diagnostics
        // path — L4 owns that (C23 §5).
      }
    }
  }
}

export function createViewport(view: TranscriptView, opts: ViewportOptions): Viewport {
  return new ViewportImpl(view, opts);
}

export type { EntryId };
