/**
 * One budget across many children — largest remainder, clamped to a fixed
 * point, with the leftover declared rather than assumed (C29 I4, I5).
 *
 * **Ported from `nicbarker/clay`** (Zlib, read at `v0.14`): the shape of the
 * four sizing modes and the order of the five passes are its; the arena, the
 * float unit and the culling are not. See `types.ts` for the attribution in
 * full and `DEPENDENCIES.md` for why it is not a dependency (C29 I17).
 *
 * **The leftover is a policy and not a property of the arithmetic** (C04 I42,
 * F1219). A group spends nothing — it has no child that claims the residual —
 * and a mosaic tiles, because a grid that leaves its right-hand column short is
 * ragged in every faceted frame. One function serves both.
 */
import type { Spend } from "./types.js";

/** What one child brings to a distribution on one axis. */
export type Demand = Readonly<{
  /** Its size before any slack or deficit is applied. */
  base: number;
  /** The hard floor. No round may go below it (C29 I6). */
  min: number;
  /** The ceiling, or `Infinity`. */
  max: number;
  /** Its share of a surplus. **0 means it does not grow** — only `GROW` does. */
  weight: number;
}>;

export type Distribution = Readonly<{
  sizes: readonly number[];
  /** Rounds the clamping loop took. The bound is the child count (C29 I5). */
  rounds: number;
  /** What the budget could not absorb — the container clips it (C29 I6). */
  overflow: number;
}>;

const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), hi);

/**
 * `count` cells handed out across `weights` by largest remainder, ties by
 * declaration order (C29 I4).
 *
 * Every line gets `floor(share)`; the leftover goes one cell each down the
 * fractional parts, descending, and a tie is broken by the order the author
 * wrote the children. **Declaration order is what makes the frame a pure
 * function of the tree**, which is what a byte-exact golden requires — a sort
 * that is not total leaves the frame to the engine's sort implementation.
 */
function largestRemainder(
  weights: readonly number[],
  count: number,
  spend: Spend,
): readonly number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || count <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (count * w) / total);
  const given = exact.map((e) => Math.floor(e)); // cells-ok — a cell count
  let left = count - given.reduce((a, b) => a + b, 0); // cells-ok — a cell count
  if (spend === "none" || left <= 0) return given;
  const order = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => (b.frac === a.frac ? a.i - b.i : b.frac - a.frac));
  for (const { i } of order) {
    if (left <= 0) break;
    given[i] = (given[i] ?? 0) + 1; // cells-ok — a cell count
    left -= 1;
  }
  return given;
}

/**
 * The axis solved: every child's size, the rounds the clamp took and what did
 * not fit (C29 I4, I5, I6).
 *
 * **Clamping runs before distribution and iterates to a fixed point.** A child
 * pinned at `max` leaves its surplus in the pot, which raises every other
 * child's share, which can pin a second — each round pins at least one child or
 * terminates, so `n` rounds is *exact* for `n` children rather than generous.
 * The count is returned rather than assumed, because a fixed point reached in
 * `n + 1` rounds is a defect in the clamping order that every assertion about
 * the frame would pass (C29 §8a A4).
 *
 * **The policy governs a surplus and never a deficit.** `spend: "none"` leaves
 * the leftover cell unspent; a deficit is always taken in full while any child
 * has room above its `min`, because leaving one cell of it would make the
 * container clip for a cell the children were willing to give. What the minima
 * cannot absorb is returned as `overflow`: **no child is dropped to honour a
 * floor** (C29 I6) — dropping is a decision and this is an arithmetic outcome.
 */
export function distribute(
  demands: readonly Demand[],
  budget: number,
  spend: Spend,
): Distribution {
  const n = demands.length; // cells-ok — a child count
  if (n === 0) return { sizes: [], rounds: 0, overflow: Math.max(0, -budget) };

  const sizes = demands.map((d) => clamp(d.base, d.min, d.max));
  // A child that does not grow, or is already at its ceiling, is pinned before
  // the first round — the pot it would have taken belongs to the others.
  const pinned = sizes.map((size, i) => demands[i]!.weight <= 0 || size >= demands[i]!.max);

  let rounds = 0;
  const total = (): number => sizes.reduce((a, b) => a + b, 0);

  if (budget >= total()) {
    // Surplus — only `GROW` children take it.
    for (let round = 0; round < n; round += 1) {
      const pot = budget - total(); // cells-ok — a cell count
      const live = sizes.map((_, i) => (pinned[i] === true ? 0 : demands[i]!.weight));
      if (pot <= 0 || live.every((w) => w === 0)) break;
      rounds += 1;
      const give = largestRemainder(live, pot, spend);
      let anyPinned = false;
      for (let i = 0; i < n; i += 1) {
        if (pinned[i] === true || give[i] === 0) continue;
        const want = sizes[i]! + give[i]!; // cells-ok — a cell count
        if (want >= demands[i]!.max) {
          sizes[i] = demands[i]!.max;
          pinned[i] = true;
          anyPinned = true;
        } else sizes[i] = want;
      }
      if (!anyPinned) break;
    }
  } else {
    // Deficit — every child shrinks toward its own floor (C29 §8a A11).
    for (let round = 0; round < n; round += 1) {
      const need = total() - budget; // cells-ok — a cell count
      if (need <= 0) break;
      const room = sizes.map((s, i) => Math.max(0, s - demands[i]!.min));
      const available = room.reduce((a, b) => a + b, 0);
      if (available === 0) break;
      rounds += 1;
      // **The clamp to `available` is the floor's whole defence, and it was
      // two defences until a mutation could not be caught.** A second guard
      // pinned any child whose cut crossed its `min` — and no input reached it,
      // because a largest remainder over `room` never hands a child more than
      // its own room (the leftover goes to fractional parts, and a child at its
      // room exactly has none). Either half alone holds the floor, so removing
      // either changed nothing and neither was observable. One is kept.
      const take = largestRemainder(room, Math.min(need, available), "largest-remainder");
      for (let i = 0; i < n; i += 1) {
        if (take[i] === 0) continue;
        sizes[i] = sizes[i]! - take[i]!; // cells-ok — a cell count
      }
    }
  }

  return { sizes, rounds, overflow: Math.max(0, total() - budget) };
}
