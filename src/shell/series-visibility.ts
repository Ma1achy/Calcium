/**
 * Which series a reader has hidden or shown, per entry and per block (C22 I78,
 * C12 §3aq, C04 I99).
 *
 * **The reader's override of `Series.hidden`.** The block says what the producer
 * meant; this says what the reader has since done, and the renderer reads this
 * first — `ScrollOffsets` over `Scroll.follow` is the same relationship (C04
 * §3c), and for the same reason: view state is never written back into the
 * block, so a `replace` from the far side carrying `hidden: true` again is a new
 * default under an override that still holds.
 *
 * **An explicit boolean per index, not a set of hidden indices.** A set can say
 * *hide this one* and cannot say *show the one the producer hid*; the toggle
 * needs both directions, so the value is the state and absence is *the block's
 * own*. That is also why `key()` carries `false`: an override to *shown* on a
 * series the block hides is a different frame from no override, and a key that
 * omitted it would serve the producer's frame to a reader who just undid it —
 * `CursorPositions`' zero clause one store along.
 *
 * **The store records what it is told**, which is `dollyBlock`'s seam (C22 I75):
 * `toggleSeriesBlock` in `construct.ts` reads the effective state — override,
 * else the member, else shown — and writes its negation; the only bound it
 * applies is *the index exists*. An override for an index a later patch removed
 * is kept and inert (C23 I47 — a store corrected on every patch is one that
 * accumulates), and the residue is named in C12 §3aq B4 rather than absorbed.
 *
 * **Dropped on `rendered`'s own subscription**, in the same callback in
 * `construct.ts`, as the fifth store to join it, for `ScrollOffsets`' recorded
 * reason.
 */
export class SeriesVisibility {
  readonly #byEntry = new Map<string, Map<string, Map<number, boolean>>>();

  /** Live entries holding at least one override. Bounded by the entry count. */
  get size(): number {
    return this.#byEntry.size;
  }

  /** The override for one series, or `undefined` for the block's own default. */
  get(entryId: string, blockId: string, index: number): boolean | undefined {
    return this.#byEntry.get(entryId)?.get(blockId)?.get(index);
  }

  /**
   * The whole entry's overrides, for `RenderContext.seriesVisibility`.
   *
   * An empty record rather than `undefined` for an entry nothing has touched,
   * so the renderer's `ctx.seriesVisibility?.[block.id]?.[i]` is `undefined`
   * on one branch instead of two.
   */
  forEntry(entryId: string): Readonly<Record<string, Readonly<Record<number, boolean>>>> {
    const held = this.#byEntry.get(entryId);
    if (held === undefined) return EMPTY;
    return Object.fromEntries([...held].map(([id, m]) => [id, Object.fromEntries(m)]));
  }

  /** Record one series' visibility. Decided by the caller, recorded here (see header). */
  set(entryId: string, blockId: string, index: number, hidden: boolean): void {
    const entry = this.#byEntry.get(entryId) ?? new Map<string, Map<number, boolean>>();
    const block = entry.get(blockId) ?? new Map<number, boolean>();
    block.set(index, hidden);
    entry.set(blockId, block);
    this.#byEntry.set(entryId, entry);
  }

  /**
   * A stable discriminator for the render cache's key (C22 I78, §6c).
   *
   * **The ninth axis.** Every override is in it — `false` included, see the
   * header — and both levels are sorted, because a `Map`'s insertion order would
   * key one state two ways.
   */
  key(entryId: string): string {
    const held = this.#byEntry.get(entryId);
    if (held === undefined || held.size === 0) return "";
    return [...held]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([id, m]) =>
        `${id}=${[...m]
          .sort(([a], [b]) => a - b)
          .map(([i, h]) => `${String(i)}${h ? "h" : "s"}`)
          .join("+")}`)
      .join(",");
  }

  delete(entryId: string): void {
    this.#byEntry.delete(entryId);
  }

  clear(): void {
    this.#byEntry.clear();
  }
}

const EMPTY: Readonly<Record<string, Readonly<Record<number, boolean>>>> = Object.freeze({});
