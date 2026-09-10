/**
 * Leak counting: how many of a class were made, how many the runtime got round
 * to reporting collected, and what that leaves live (C28 I43).
 *
 * **The registry is built on the first `track` and never at `off`** (I1). A
 * `FinalizationRegistry` is cheap to hold and free to not hold, and a session
 * that does not profile should construct none — the assertion T1.73 makes, and
 * the one that would silently stop being true if this were a module constant.
 *
 * **The held value is the class name, never the object.** A tracker keeping a
 * strong reference to everything it watches is a leak in the instrument built
 * to find leaks, and it would report `live: 0` for ever while being the cause.
 * `FinalizationRegistry.register` holds its target weakly and its held value
 * strongly, so a string is the only safe thing to pass.
 *
 * **What the figures can and cannot say**, because the second is what a reader
 * gets wrong:
 *
 * - `created` is exact. It is a counter.
 * - `finalised` is a **lower bound on what died**. A callback is a promise the
 *   runtime may keep late or not at all, so an object collected between the
 *   last sweep and the report is gone from the heap and present in this number.
 * - `live` is therefore an **upper bound**, and it has a floor.
 *
 * **The floor is one, it is deterministic, and it belongs to the report rather
 * than to any class.** Measured 2026-09-07 under `--expose-gc`: exactly one
 * registration never reports, always the most recent, at N = 1, 2, 10, 100,
 * 1 000 and 5 000 and over eight repeats; further collections do not shrink it.
 * Three names through one registry at fifty each gave 50 · 50 · **49**, the
 * short one being whichever registered last — so the caveat cannot be written
 * per row. The design note's M20 claimed 1 000 of 1 000 after two collections
 * and named itself this file's falsifying measurement; it is 999 after one
 * (F893).
 *
 * Both controls respond, which is what makes the arm mean anything: objects
 * dropped with no forced collection report **0**, and objects still referenced
 * with one forced report **0**. The count measures reachability, not
 * registration.
 */

/** One class's figures. `live` is `created − finalised` and is an upper bound. */
export type LeakStat = Readonly<{ created: number; finalised: number; live: number }>;

export class Leaks {
  #registry: FinalizationRegistry<string> | null = null;
  readonly #created = new Map<string, number>();
  readonly #finalised = new Map<string, number>();

  /**
   * Register one object under a class name.
   *
   * Built lazily so `off` constructs nothing — the caller gates on tier and
   * this gates on ever having been asked, which are different conditions and
   * both wanted: a profiler raised to `counters` mid-session and never asked to
   * track still holds no registry.
   */
  track(name: string, held: object): void {
    this.#registry ??= new FinalizationRegistry<string>((cls) => {
      this.#finalised.set(cls, (this.#finalised.get(cls) ?? 0) + 1);
    });
    this.#created.set(name, (this.#created.get(name) ?? 0) + 1);
    this.#registry.register(held, name);
  }

  /** Whether a registry exists at all — T1.73's subject. */
  get armed(): boolean {
    return this.#registry !== null;
  }

  snapshot(): Readonly<Record<string, LeakStat>> {
    const out: Record<string, LeakStat> = {};
    for (const [name, created] of this.#created) {
      const finalised = this.#finalised.get(name) ?? 0;
      out[name] = Object.freeze({ created, finalised, live: created - finalised });
    }
    return Object.freeze(out);
  }

  /**
   * Drop the counters, keeping the registry.
   *
   * `setTier` resets the ring so histograms from two tiers never merge (I18),
   * and these are counted over the same window. **The registry is deliberately
   * kept**: unregistering is not possible without a token per object, and a
   * fresh registry would leave the old one's callbacks incrementing a map
   * nothing reads — which is the same object count reported as zero.
   */
  clear(): void {
    this.#created.clear();
    this.#finalised.clear();
  }
}
