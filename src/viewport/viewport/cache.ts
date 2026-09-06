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

import type { EntryId, Probe } from "./deps.js";
import { NO_PROBE } from "../../data/viewmodel/index.js";

type Slot = Readonly<{ rev: number; width: number; height: number }>;

/**
 * A hit carries a value, a miss carries a reason, and neither carries the other.
 *
 * **Discriminated rather than `{ value, reason }`**, because `undefined` cannot
 * be the sentinel for absence: a height of zero is a real cached answer, and a caller
 * narrowing on the value re-computes it every frame while reporting a miss that
 * did not happen. The reason is the discriminant, so the compiler enforces it.
 */
/** I27's shape, and I28 is the fourth key: a value comparison, never an axis. */
export type HeightMisses = Readonly<Record<"absent" | "rev" | "width" | "nothing-changed", number>>;

export class HeightCache {
  readonly #slots = new Map<EntryId, Slot>();
  readonly #probe: Probe;
  #hits = 0;
  readonly #misses = { absent: 0, rev: 0, width: 0, "nothing-changed": 0 };

  /**
   * The slot `get` most recently rejected, and its height (I28).
   *
   * **One field rather than a map**, because the only caller that matters reads
   * a height and writes it back immediately: `#heightOf` misses, recomputes, and
   * sets. Anything else between the two makes the comparison wrong rather than
   * stale, so the id is kept and checked instead of assumed.
   */
  #discarded: Readonly<{ id: EntryId; height: number }> | null = null;

  /**
   * C28's seam, or none (C28 I30).
   *
   * **Both readers are written at one site.** `stats` below is C14's own
   * surface (I27) and the probe is C28's; a cache that reported to one and was
   * counted by the other would be two comparisons that have to agree. SS4 bans
   * a clock here and this is not one — the probe names events and only L4 knows
   * when they happened.
   */
  constructor(probe: Probe = NO_PROBE) {
    this.#probe = probe;
  }

  /** I27 — the hit rate beside the size. */
  get hits(): number {
    return this.#hits;
  }

  /** I27 — by reason, and the reason is the axis the comparison rejected first. */
  get misses(): HeightMisses {
    return Object.freeze({ ...this.#misses });
  }

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
    if (slot === undefined) {
      this.#miss(id, "absent", undefined);
      return undefined;
    }
    // **The order is the invariant** (C28 I8). A slot can disagree on both axes
    // and the reason reported is the first checked, so this sequence is what a
    // count means. `rev` first because it moves on any content change at all: an
    // entry whose document changed reports `rev` even if the width also moved,
    // which is right, because the re-measure was owed either way.
    if (slot.rev !== rev) {
      this.#miss(id, "rev", slot.height);
      return undefined;
    }
    if (slot.width !== width) {
      this.#miss(id, "width", slot.height);
      return undefined;
    }
    this.#hits += 1;
    this.#probe.hit("height");
    return slot.height;
  }

  #miss(id: EntryId, reason: "absent" | "rev" | "width", discarded: number | undefined): void {
    this.#misses[reason] += 1;
    this.#probe.miss("height", reason);
    this.#discarded = discarded === undefined ? null : { id, height: discarded };
  }

  set(id: EntryId, rev: number, width: number, height: number): void {
    // **I28 — wasted work reporting itself.** A miss says the slot was invalid;
    // this says whether invalidating it bought anything. A `--watch` patching an
    // entry whose rendered height never moves produces a `rev` miss and a full
    // re-measure per patch, and the two counts together are the only way to see
    // it: the axis says what invalidated, this says whether it needed to.
    //
    // Not an axis (C28 I8), and it cannot be one — a slot agreeing on `rev` and
    // `width` **is** a hit, so a fourth axis would be a counter that can never
    // be non-zero and reads as a healthy zero for ever.
    const d = this.#discarded;
    if (d !== null && d.id === id && d.height === height) this.#misses["nothing-changed"] += 1;
    this.#discarded = null;
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
