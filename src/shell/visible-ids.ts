/**
 * The set of entry ids in C14's visible range, built once per range object
 * (C22 I106, F1201).
 *
 * **The gate C23 I46 asks, once per part per sweep.** The `visible` dependency
 * the composition root hands the refresh driver answers *is this host on
 * screen*; the driver asks it for every part — `anyoneLooking`, the stale pass,
 * the arm gates, the readouts. Its first form walked `range.entries` with a
 * `.some` for each, and at two hundred live parts that was twelve thousand
 * walks a second of one frozen array, the largest single line of the stream
 * profile after F1198 memoised C14's half.
 *
 * **The range object's identity is the key.** C14 I30 hands back the same
 * frozen range until the viewport moves, so a set built for one object is right
 * for as long as that object is the answer. One slot and not a `WeakMap`: the
 * previous range is unreachable the moment C14 returns a new one, and a map
 * keyed on it would be a second copy of C14's own invalidation with nothing to
 * read it.
 *
 * **Owned by the composition root beside the other stores**, so nothing here
 * is module-level (A02 §1); it holds no entry state and joins no subscription —
 * a stale range cannot reach it, because the only range it ever sees is the one
 * C14 just returned.
 */
import type { EntryId } from "../viewport/transcript/index.js";
import type { VisibleRange } from "../viewport/viewport/types.js";

export class VisibleIds {
  #range: VisibleRange | null = null;
  #ids: ReadonlySet<EntryId> = new Set();

  /** The ids of `range.entries` — the same set while `range` is the same object (I106). */
  of(range: VisibleRange): ReadonlySet<EntryId> {
    if (range !== this.#range) {
      const ids = new Set<EntryId>();
      for (const entry of range.entries) ids.add(entry.id);
      this.#range = range;
      this.#ids = ids;
    }
    return this.#ids;
  }
}
