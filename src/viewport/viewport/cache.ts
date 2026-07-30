/**
 * The height cache.
 *
 * C14 §4 — see spec, and I3.
 *
 * **`(entryId, rev, width)` is a validity predicate, not a map key**, and this
 * file exists to make that structural. Read as a composite key it describes a
 * table holding one slot per revision — so a `--watch` at a thousand lines a
 * second accumulates a thousand entries for one id, which is the leak T3.18
 * catches and T5.3 runs into. There is never a use for a previous revision's
 * height: the moment `rev` moves, the old value is wrong.
 *
 * One slot per entry makes T2.3b (`size ≤ entries.length`) hold by construction
 * rather than by an eviction rule someone must remember to run, and C13's
 * `Change` variants map onto three operations with nothing left over: `patch`
 * overwrites, `evict` deletes by id, a width change clears.
 *
 * **Theme and capabilities are deliberately absent.** C09 §4 guarantees
 * capability substitutions are 1:1 by cell count and C10 T4.1 asserts geometry
 * is identical across themes and colour depths, so a theme switch invalidates
 * the frame (C03) and not one cached height.
 */

import type { EntryId } from "../transcript/index.js";

type Slot = Readonly<{ rev: number; width: number; height: number }>;

export class HeightCache {
  readonly #slots = new Map<EntryId, Slot>();

  /** Live slots. I3's post-condition bounds this by the entry count. */
  get size(): number {
    return this.#slots.size;
  }

  /**
   * The cached height, or `undefined` if nothing valid is held.
   *
   * The three-way comparison *is* I3. A slot whose `rev` or `width` disagrees is
   * not a different key to be kept alongside — it is this entry's one slot,
   * holding a value that is now wrong.
   */
  get(id: EntryId, rev: number, width: number): number | undefined {
    const slot = this.#slots.get(id);
    if (slot === undefined || slot.rev !== rev || slot.width !== width) return undefined;
    return slot.height;
  }

  set(id: EntryId, rev: number, width: number, height: number): void {
    this.#slots.set(id, Object.freeze({ rev, width, height }));
  }

  /** `evict` deletes by id — no key enumeration, because there is one slot. */
  delete(id: EntryId): void {
    this.#slots.delete(id);
  }

  clear(): void {
    this.#slots.clear();
  }
}
