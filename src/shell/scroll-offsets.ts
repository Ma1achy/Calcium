/**
 * Scroll offsets — view state, per container, in rows (C04 I48, §3c).
 *
 * **Rows and not an element index**, so a resize re-interprets a reader's
 * position rather than moving them to whichever child used to sit there. The
 * clamp is the renderer's, at read: this store never corrects a value, because a
 * store fixed up on every patch is one that accumulates and C23 I47 forbids that
 * of view state.
 *
 * **Dropped on `rendered`'s own subscription**, in the same callback in
 * `construct.ts`. Two subscriptions would be two places for a future eviction
 * path to reach one and miss the other, and the rendered rows and the offset
 * that chose them are the same fact about the same entry.
 *
 * **Restored by no resume** (C13 I20): a resumed transcript's entries are
 * settled, and a settled container keeps the offset it had *within a session*
 * and starts a new one at zero. There is nothing here to persist.
 */
export class ScrollOffsets {
  readonly #byEntry = new Map<string, Map<string, number>>();

  /** Live entries holding at least one offset. Bounded by the entry count. */
  get size(): number {
    return this.#byEntry.size;
  }

  get(entryId: string, blockId: string): number {
    return this.#byEntry.get(entryId)?.get(blockId) ?? 0;
  }

  /**
   * The whole entry's offsets, for `RenderContext.scrollOffsets`.
   *
   * An empty record rather than `undefined` for an entry nothing has scrolled,
   * so a container reads `?? 0` on one branch instead of two.
   */
  forEntry(entryId: string): Readonly<Record<string, number>> {
    const held = this.#byEntry.get(entryId);
    if (held === undefined) return EMPTY;
    return Object.fromEntries(held);
  }

  /**
   * Move one container, floored at zero and unbounded above.
   *
   * **The ceiling is the renderer's** and is deliberately not here: this store
   * does not know the width, so it cannot know the content's height, and a
   * clamp taken against a guess is worse than one taken where the number is
   * known (§3c cell 4). Paging past the end leaves a value the renderer bounds.
   */
  nudge(entryId: string, blockId: string, delta: number): void {
    const held = this.#byEntry.get(entryId) ?? new Map<string, number>();
    held.set(blockId, Math.max(0, (held.get(blockId) ?? 0) + delta));
    this.#byEntry.set(entryId, held);
  }

  /**
   * A stable discriminator for the render cache's key (C22 §6c, I58).
   *
   * **The fourth axis, and it fails silently without this.** A scroll offset
   * changes what is rendered and moves none of `(entry, rev, width, focus,
   * theme)` — the third instance of focus's own story — so a reader who scrolls
   * away and back is served the frame they left. Sorted, because a `Map`'s
   * insertion order would make one state key two ways.
   */
  key(entryId: string): string {
    const held = this.#byEntry.get(entryId);
    if (held === undefined || held.size === 0) return "";
    // **Zeros are omitted, and T4.18e is what said so.** A container scrolled
    // down and back holds `0`, which is the state an entry nobody touched is
    // in — and keying them apart gives one appearance two slots, so the frame a
    // reader returns to is re-rendered rather than found. That is `focusKey`'s
    // own warning in this file's words: *a cache that misses on every frame
    // while every assertion about correctness still passes*.
    //
    // Sorted, because a Map's insertion order would key one state two ways for
    // the same reason.
    const live = [...held].filter(([, at]) => at !== 0);
    if (live.length === 0) return "";
    return live
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([id, at]) => `${id}=${String(at)}`)
      .join(",");
  }

  delete(entryId: string): void {
    this.#byEntry.delete(entryId);
  }

  clear(): void {
    this.#byEntry.clear();
  }
}

const EMPTY: Readonly<Record<string, number>> = Object.freeze({});
