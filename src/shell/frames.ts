/**
 * Which frame of each animated image is showing, per entry and per block
 * (C22 I77, C04 I93).
 *
 * **`Cameras`' shape, and `ScrollOffsets`' rule about zero.** A camera's absent
 * state is the block's own declared view and `distance: 0` is degenerate rather
 * than absent, so that store omits *baselines*; a frame index has no such
 * trouble — an image nobody has advanced is showing frame 0, and a block
 * advanced all the way round is showing frame 0 too, and the two draw the same
 * cells. So `key()` omits zero, exactly as the offsets do, and an image that
 * has come round to its first frame is served the slot it started from.
 *
 * **The store holds a position in time, not a count of wakes** (C22 I74). Each
 * block carries the frame it is on and how far into that frame's delay it is;
 * `advance` adds elapsed milliseconds and walks forward through as many delays
 * as that covers, keeping the remainder — so four wakes of 25 ms and one of
 * 100 leave the same frame, and a wake the timer fired for some other
 * animation moves nothing it should not. The delays come in with every call
 * rather than being kept, for `Cameras.nudge`'s reason: only the block knows
 * them, and a copy here would outlive the block it describes.
 *
 * **Dropped on `rendered`'s own subscription**, in the same callback in
 * `construct.ts`, for the recorded reason: the rendered rows and the frame
 * that chose them are one fact about one entry.
 */

/** The frame a block is on and how long it has been showing. */
type Held = Readonly<{ index: number; shown: number }>;

export class Frames {
  readonly #byEntry = new Map<string, Map<string, Held>>();

  /** Live entries holding at least one position. Bounded by the entry count. */
  get size(): number {
    return this.#byEntry.size;
  }

  /**
   * The whole entry's frame indices, for `RenderContext.frames`.
   *
   * An empty record rather than `undefined` for an entry nothing has advanced,
   * so a renderer reads `?? 0` on one branch instead of two.
   */
  forEntry(entryId: string): Readonly<Record<string, number>> {
    const held = this.#byEntry.get(entryId);
    if (held === undefined) return EMPTY;
    return Object.fromEntries([...held].map(([id, h]) => [id, h.index]));
  }

  /** The frame one block is on. Absent is the first frame. */
  indexOf(entryId: string, blockId: string): number {
    return this.#byEntry.get(entryId)?.get(blockId)?.index ?? 0;
  }

  /**
   * Move one block forward by `elapsedMs` of showing time.
   *
   * **Whole delays are consumed and the remainder is kept**, which is the same
   * arithmetic the spinner's counter uses in `session.ts` and for the same
   * reason: dropping the remainder runs the animation slow by a fraction of a
   * frame on every wake, and stepping once per wake runs it at the timer's
   * speed rather than its own. A session idle for a minute comes back to the
   * frame the clock says, not to a minute of catching up — the elapsed time is
   * reduced modulo one loop first.
   *
   * A block with fewer than two frames, or whose delays sum to nothing, is
   * left alone: there is no position to hold.
   */
  advance(entryId: string, blockId: string, delays: readonly number[], elapsedMs: number): void {
    const n = delays.length; // cells-ok — a frame count
    if (n < 2 || elapsedMs <= 0) return;
    let loop = 0;
    for (const d of delays) loop += Math.max(0, d);
    if (loop <= 0) return;
    const held = this.#byEntry.get(entryId) ?? new Map<string, Held>();
    const was = held.get(blockId) ?? { index: 0, shown: 0 };
    let index = was.index % n;
    let shown = was.shown + (elapsedMs % loop);
    // Bounded by one loop plus the frames it lands across, because of the modulo.
    while (shown >= Math.max(0, delays[index] ?? 0)) {
      shown -= Math.max(0, delays[index] ?? 0);
      index = (index + 1) % n;
    }
    held.set(blockId, { index, shown });
    this.#byEntry.set(entryId, held);
  }

  /**
   * Milliseconds until this block's frame next changes — what the ticker arms
   * for (C22 I77).
   *
   * A block nothing has advanced is at the start of frame 0, so this is that
   * frame's whole delay. Never below zero: a position exactly at a boundary is
   * due now.
   */
  due(entryId: string, blockId: string, delays: readonly number[]): number {
    const was = this.#byEntry.get(entryId)?.get(blockId) ?? { index: 0, shown: 0 };
    const n = delays.length; // cells-ok — a frame count
    if (n === 0) return 0;
    return Math.max(0, (delays[was.index % n] ?? 0) - was.shown);
  }

  /**
   * A stable discriminator for the render cache's key (C22 I77, §6c).
   *
   * **Zero omitted, as `ScrollOffsets` does** — frame 0 after a full loop draws
   * the cells frame 0 drew before anything moved, and keying them apart gives
   * one appearance two slots (`focusKey`'s own warning). `shown` is not in the
   * key, because it moves no cell.
   *
   * Sorted, because a `Map`'s insertion order would key one state two ways.
   */
  key(entryId: string): string {
    const held = this.#byEntry.get(entryId);
    if (held === undefined || held.size === 0) return "";
    const live = [...held].filter(([, h]) => h.index !== 0);
    if (live.length === 0) return "";
    return live
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([id, h]) => `${id}=${String(h.index)}`)
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
