/**
 * When each one-shot began, per entry and per identity (C22 I131, §6o).
 *
 * **The record C04 I109 named and nothing wrote.** A one-shot is timed from
 * `Ramp.since`, the tick it began on, and a far side cannot supply that: the tick
 * is this session's counter and never leaves it. So an adapter's `pop` was the
 * first frame of a flash, held for the life of the session. This store is the
 * writer — it stamps an absent `since` with the tick of the first frame that
 * draws the entry.
 *
 * **Keyed by identity and never by object.** The identity is the block id, the
 * ramp's address in the block (`mapRamps`') and the effect; the entry id is the
 * outer key. A `b.live` part re-renders its block on every poll and an adapter
 * re-emits its whole document, and both are the same event arriving again — so a
 * key on the block object, or on the entry's `rev`, would replay the flash on
 * every poll. A changed effect is a different event and plays (§6o.2 row 4).
 *
 * **A producer's own `since` is never overwritten** (§6o.2 row 7): the stamp
 * fills an absence.
 *
 * **Memoised on the producer's array**, so a still document is stamped once and
 * returns the same array on every later frame — the height and window memos are
 * keyed on block identity, and a fresh copy per frame would miss all of them.
 * A document with nothing to stamp is returned as it came.
 *
 * **Dropped on `rendered`'s own subscription**, the sixth store to join it, for
 * the reason the other five give: the rows and what chose them are one fact
 * about one entry.
 */
import { hasChildren, RAMP_ONE_SHOTS, type Block } from "../data/viewmodel/index.js";
import { mapRamps } from "../presentation/blocks/index.js";

export class OneShots {
  readonly #byEntry = new Map<string, Map<string, number>>();
  #memo = new WeakMap<readonly Block[], Map<string, readonly Block[]>>();

  /** Live entries holding at least one stamp. Bounded by the entry count. */
  get size(): number {
    return this.#byEntry.size;
  }

  /**
   * The entry's blocks with every unstamped one-shot stamped — at `tick` if this
   * identity has never been drawn, at its first tick if it has.
   */
  stamp(entryId: string, blocks: readonly Block[], tick: number): readonly Block[] {
    const byArray = this.#memo.get(blocks);
    const held = byArray?.get(entryId);
    if (held !== undefined) return held;

    const stamps = this.#byEntry.get(entryId) ?? new Map<string, number>();
    const visit = (block: Block): Block => {
      let next = mapRamps(block, (ramp, address) => {
        if (ramp.since !== undefined || ramp.animate === undefined || !RAMP_ONE_SHOTS.has(ramp.animate)) return ramp;
        const key = `${block.id}\u0000${address}\u0000${ramp.animate}`;
        let since = stamps.get(key);
        if (since === undefined) {
          since = tick;
          stamps.set(key, since);
        }
        return { ...ramp, since };
      });
      // **Children through `tree.ts`'s two fields and no others**: a container's
      // `children` and a table row's `detail` — `childBlocks`' own answer.
      if (hasChildren(next)) {
        const container = next;
        const children = container.children.map(visit);
        if (children.some((c, i) => c !== container.children[i])) next = { ...container, children } as Block;
      } else if (next.kind === "table") {
        const table = next;
        let changed = false;
        const rows = table.rows.map((row) => {
          if (row.detail === undefined) return row;
          const detail = row.detail.map(visit);
          if (detail.every((d, i) => d === row.detail?.[i])) return row;
          changed = true;
          return { ...row, detail };
        });
        if (changed) next = { ...table, rows } as Block;
      }
      return next;
    };
    const stamped = blocks.map(visit);
    const result = stamped.every((b, i) => b === blocks[i]) ? blocks : stamped;
    if (stamps.size > 0) this.#byEntry.set(entryId, stamps);
    const memo = byArray ?? new Map<string, readonly Block[]>();
    memo.set(entryId, result);
    if (byArray === undefined) this.#memo.set(blocks, memo);
    return result;
  }

  delete(entryId: string): void {
    this.#byEntry.delete(entryId);
  }

  /** Every stamp, and the memo with them — a cleared transcript's arrays can come back under a new id. */
  clear(): void {
    this.#byEntry.clear();
    this.#memo = new WeakMap();
  }
}
