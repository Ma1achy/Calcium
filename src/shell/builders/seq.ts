/**
 * `b.seq` — where "not the first block" lives (C24 §4a, I17).
 *
 * §4 said the builders set `gapBefore` "when they are not the first block in
 * the sequence they are built into", and **a builder cannot know its position**.
 * C04 §3a had already ruled against position meaning anything at measurement:
 * a block measures the same wherever it is concatenated, and `sequenceHeight`
 * implements that with no index test.
 *
 * Both statements are correct and they overlap. The resolution came from asking
 * who holds the rule today, and the answer was nobody — `shell/local/handlers.ts`
 * sets `gapBefore` three times by hand, chosen per position, and
 * `test/support/surfaces.ts` hand-authors the same pattern for every S-series
 * figure. The rule S02's figure depends on has been discipline since it was
 * written.
 *
 * So this is the one place position means anything, and it means it **at
 * construction** rather than at measurement. C04 §3a is untouched: the blocks
 * returned are honest about themselves.
 *
 * **The default is a preference until this resolves it.** A builder records
 * that its gap was defaulted rather than asked for, so an explicit
 * `gapBefore: true` on the first block survives — §4's "an explicit value always
 * wins" has to hold at position 0 too, and it is the only position where the two
 * can disagree.
 */

import { block } from "../../data/viewmodel/index.js";
import type { Block } from "../../data/viewmodel/index.js";

/**
 * Blocks whose `gapBefore` came from their builder's default rather than from
 * the caller.
 *
 * **A `WeakSet` keyed on the block, never a field on it.** C04 owns block
 * shapes, and a builder inventing one would be the second enforcement point
 * I15's own reasoning rejects — as well as a field every consumer, every golden
 * frame and every patch would then carry. Private to this directory, which is
 * what "private to `b`" means.
 */
const DEFAULTED = new WeakSet<object>();

/**
 * Record that this block's gap is the builder's preference, and return it.
 *
 * Called only where `opts.gapBefore` was absent. A builder that received an
 * explicit value — of either polarity — must not call this, and that is the
 * whole distinction `b.seq` reads.
 */
export function defaulted<B extends Block>(blk: B): B {
  DEFAULTED.add(blk);
  return blk;
}

/** Whether this block's gap was defaulted. Exported for the tests that prove it. */
export function wasDefaulted(blk: Block): boolean {
  return DEFAULTED.has(blk);
}

/**
 * Assemble a sequence: the first block does not carry a leading gap unless it
 * was asked to.
 *
 * Returns a new array; the input is not mutated and neither are its blocks.
 * Clearing rebuilds through C04's `block()` because the block is frozen — and
 * because rebuilding is the only way to stay inside the one construction path
 * (§4: `b` never freezes or validates directly).
 *
 * **`b.seq` is the convenience, never the only path.** A consumer who drops one
 * builder's output into an array of their own has positions this never sees, so
 * `gapBefore` stays settable on every builder.
 */
export function seq(blocks: readonly Block[]): readonly Block[] {
  if (blocks.length === 0) return Object.freeze([]);

  const first = blocks[0];
  if (first === undefined) return Object.freeze([]);

  // Both halves of the condition carry weight, and only one of them is
  // obvious. `gapBefore === true` is the common case. `wasDefaulted` is the
  // rule: a gap the caller asked for at position 0 is the one place an explicit
  // value and a default can disagree, and dropping this clause passes every
  // test written about the common case (T6.13).
  const clear = first.gapBefore === true && wasDefaulted(first);
  const head = clear ? withoutGap(first) : first;
  return Object.freeze([head, ...blocks.slice(1)]);
}

/** A copy of `blk` with no leading gap, rebuilt through C04's constructor. */
function withoutGap<B extends Block>(blk: B): B {
  const { gapBefore: _dropped, ...rest } = blk;
  return block(rest as B);
}
