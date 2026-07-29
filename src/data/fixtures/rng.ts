/**
 * The seeded generator every world draws from instead of `Math.random`.
 *
 * C08 §3, I3, I4 — see spec. This is harness rather than world (§1a) for one
 * reason: **determinism is the machinery most likely to be got wrong**, and a
 * world that reimplements it gets a demo that is reproducible until the day it
 * is not. An app writes its transitions; it does not write its randomness.
 *
 * `mulberry32` — 32 bits of state, one multiply-xorshift round. Chosen because
 * it is arithmetic the spec can define rather than a dependency (A04 §2): a
 * generator is exactly the kind of ~30-line capability where an external package
 * buys nothing and costs a supply-chain edge.
 *
 * It is not cryptographic and must never be reached for where that matters. What
 * it is asked to do is produce the same run set twice, and it does.
 */

/** Draws, and the cursor that makes a sequence reproducible from its start. */
export interface Rng {
  /** `[0, 1)`. */
  next(): number;
  /** Integer in `[lo, hi)`. Empty range → `lo`, never a throw or a NaN. */
  int(lo: number, hi: number): number;
  /** Uniform pick. An empty array is a programming error and throws. */
  pick<T>(items: readonly T[]): T;
  /** A fresh generator from the same seed — the sequence, from the top. */
  fork(seed: number): Rng;
}

export function createRng(seed: number): Rng {
  // Coerced into a 32-bit integer at construction rather than trusted. A caller
  // passing `Date.now()` (which nothing here should, SS1) or a float would
  // otherwise get a generator whose sequence depends on floating-point
  // representation, and "same seed, same world" would hold everywhere except
  // the one machine where it did not.
  let state = seed | 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,

    int(lo, hi) {
      // Floored rather than rejected. A caller asking for `int(3, 3)` wants an
      // empty range's only sensible answer, and throwing would make a world
      // generator carry a guard at every call site for a case that means "none".
      if (hi <= lo) return lo;
      return lo + Math.floor(next() * (hi - lo));
    },

    pick(items) {
      const item = items[Math.floor(next() * items.length)];
      if (item === undefined) {
        throw new Error("pick() from an empty array — there is nothing to choose");
      }
      return item;
    },

    fork(nextSeed) {
      return createRng(nextSeed);
    },
  };
}
