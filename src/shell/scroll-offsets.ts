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
 *
 * **The pull writes here, and it writes a position rather than a step** (C26
 * I24, §7a). `nudge` is a reader's key and `set` is focus arriving somewhere
 * the window does not reach; both resolve the held value the same way and
 * normalise the result the same way, through one private method, because the
 * follow box's tail is the part that is easy to get right in one of two copies.
 *
 * **`TAIL` is a value this store holds and never interprets** (C04 I97). It is
 * `∞`, so the renderer's clamp at read resolves it to whatever the ceiling is
 * *this* frame — which is how a following box stays at the bottom as its
 * content grows with nothing written here on a patch. The store cannot resolve
 * it itself for the reason it cannot clamp: it does not know the width.
 */
import { atTail, TAIL } from "./tail.js";

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
   *
   * **With a `box`, the tail is a position and not a flag** (C04 I97, C14 I5).
   * The caller holds the block and measured its content, so it hands over the
   * ceiling — `content − height` — and whether the block opens at its tail. A
   * held value at or past the ceiling (`TAIL` included) is resolved to it
   * before the move, and a result at or past it is written back as `TAIL`, so a
   * reader who pages to the bottom follows and one who pages up stops,
   * **derived from where the box ended up and never from which way they went**.
   *
   * **`follow` is the default for a block nothing has touched, and the walk's
   * own first draft got it wrong.** The store holds nothing for an untouched
   * box and the renderer opens a follow box at its tail (C04 I97), so a page up
   * from that state has to start from the tail the field implies and not from
   * the `0` an absent entry reads as — or the first `⇞` on a streaming box
   * jumps to its top. The store does not know the block; the caller does.
   *
   * Without a `box`, `TAIL` stays `TAIL` (`∞ + δ`), which degrades to *still
   * following* rather than to a wrong position — C04 §3c T7, for the two
   * callers that pass none yet.
   */
  nudge(
    entryId: string,
    blockId: string,
    delta: number,
    box?: Readonly<{ ceiling: number; follow?: boolean }>,
  ): void {
    this.#place(entryId, blockId, this.resolved(entryId, blockId, box) + delta, box);
  }

  /**
   * Where the renderer will read this container, before anything moves it
   * (C26 I25, §7a).
   *
   * **`get`'s answer is not this one, and the difference is the follow box.**
   * `get` reports the stored number and reads an untouched container as `0`,
   * which is right for a cache key and wrong for a pull: an untouched follow box
   * opens at its tail, so a pull computed against `0` would drag a streaming box
   * to its top the first time focus entered it. `nudge`'s own argument, reached
   * by both of its callers now rather than written once inside it.
   */
  resolved(
    entryId: string,
    blockId: string,
    box?: Readonly<{ ceiling: number; follow?: boolean }>,
  ): number {
    const held = this.#byEntry.get(entryId)?.get(blockId);
    if (box === undefined) return held ?? 0;
    const current = held ?? (box.follow === true ? TAIL : 0);
    return atTail(current, box.ceiling) ? box.ceiling : current;
  }

  /**
   * Put one container at an offset — **the pull's write** (C26 I24, I25).
   *
   * The distance is the caller's, because the caller is what knows the unit: a
   * box's is rows and a tape's is members (C04 I48). This is the same
   * normalisation `nudge` performs, which is why they are one private method —
   * a result at or past the ceiling is written back as `TAIL`, so a reader
   * pulled to the bottom keeps following and one pulled up stops.
   */
  set(
    entryId: string,
    blockId: string,
    at: number,
    box?: Readonly<{ ceiling: number; follow?: boolean }>,
  ): void {
    this.#place(entryId, blockId, at, box);
  }

  #place(
    entryId: string,
    blockId: string,
    at: number,
    box?: Readonly<{ ceiling: number; follow?: boolean }>,
  ): void {
    const held = this.#byEntry.get(entryId) ?? new Map<string, number>();
    const next = Math.max(0, at);
    held.set(blockId, box !== undefined && atTail(next, box.ceiling) ? TAIL : next);
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
