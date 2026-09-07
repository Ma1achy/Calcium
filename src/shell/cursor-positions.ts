/**
 * The crosshair of each plot, per entry and per block (C22 I76, C12 §3s, I37).
 *
 * **The writer `RenderContext.cursorPositions` waited for.** The field was
 * declared, threaded through `render-lines.ts` and read in one place — C12's
 * `positionalForm` — and written by nothing in `src/`: a complete mechanism with
 * nothing on the other side, correct and unobservable at once (C12 §3s). C22 I71
 * used it as the counter-example when the camera landed and refused to repeat it;
 * this is the other half finally arriving, and it is built on `Cameras`' shape
 * because that shape has been mutated and shipped.
 *
 * **What the value is: an index into the data, not a column** (C12 I37). The
 * renderer maps it to a column through the form's own placement, so a resize
 * keeps the cursor on the same sample and moves the mark — `ScrollOffsets`
 * chose rows over an element index for the opposite reason, and both are the
 * same rule: store the thing the reader meant, and let the frame re-derive the
 * rest.
 *
 * **Absent is not zero, and that is where this differs from the offsets.** A
 * cursor at index 0 is a crosshair on the first sample; no entry is no crosshair
 * at all, and the frame draws differently for each — so `key()` omits nothing
 * and `forEntry` carries every index that is set. `Cameras` faced the same
 * question with *baseline* where this has *absent*, and each says so rather than
 * copying `ScrollOffsets`' zeros clause.
 *
 * **`set`, not `nudge`, because the ceiling is the sample count and only the
 * effect holds the block.** `ScrollOffsets.nudge` floors at zero and leaves the
 * top to the renderer; a cursor past the last sample is not a value the renderer
 * bounds — `cursorColumn` answers `null` and the readout prints `—` for every
 * series — so the clamp has to happen where `n` is known, which is
 * `construct.ts`'s `cursorBlock`. That is `dollyBlock`'s seam: the effect
 * computes, the store records what it is told (C22 I75).
 *
 * **Dropped on `rendered`'s own subscription**, in the same callback in
 * `construct.ts`, for `ScrollOffsets`' recorded reason: two subscriptions are two
 * places for a future eviction path to reach one and miss the other.
 */
export class CursorPositions {
  readonly #byEntry = new Map<string, Map<string, number>>();

  /** Live entries holding at least one cursor. Bounded by the entry count. */
  get size(): number {
    return this.#byEntry.size;
  }

  /** The block's cursor index, or `undefined` for no crosshair. */
  get(entryId: string, blockId: string): number | undefined {
    return this.#byEntry.get(entryId)?.get(blockId);
  }

  /**
   * The whole entry's cursors, for `RenderContext.cursorPositions`.
   *
   * An empty record rather than `undefined` for an entry nothing has aimed, so
   * the renderer's `ctx.cursorPositions?.[block.id]` is `undefined` on one
   * branch instead of two.
   */
  forEntry(entryId: string): Readonly<Record<string, number>> {
    const held = this.#byEntry.get(entryId);
    if (held === undefined) return EMPTY;
    return Object.fromEntries(held);
  }

  /** Place one block's cursor. Clamped by the caller, recorded here (see header). */
  set(entryId: string, blockId: string, index: number): void {
    const held = this.#byEntry.get(entryId) ?? new Map<string, number>();
    held.set(blockId, index);
    this.#byEntry.set(entryId, held);
  }

  /**
   * A stable discriminator for the render cache's key (C22 I76, §6c).
   *
   * **The seventh axis, and its symptom is the one C22 I71 predicted for a field
   * with no writer**: a crosshair moved and the frame served from before it
   * moved, which reads as a key that does nothing. Every index is in the key —
   * see the header for why zero is not omitted — and the ids are sorted, because
   * a `Map`'s insertion order would key one state two ways.
   */
  key(entryId: string): string {
    const held = this.#byEntry.get(entryId);
    if (held === undefined || held.size === 0) return "";
    return [...held]
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
