/**
 * The live camera of each 3D plot, per entry and per block (C22 I71, C12 I83).
 *
 * **`ScrollOffsets`' shape, and one rule it could not inherit.** That store omits
 * a **zero** from its key, because zero is what an entry nobody touched is in —
 * so a container scrolled down and back keys identically to one never scrolled,
 * and the frame a reader returns to is found rather than re-rendered.
 *
 * **A camera's absent state is not zero on any axis.** `distance: 0` is a
 * degenerate camera — the eye at the target — and not an absent one, and an
 * azimuth of zero is a view in which two axes project onto each other. So the
 * rule here is **omit when equal to the baseline**, where the baseline is the
 * camera this block would be drawn from with no entry at all: its own declared
 * `camera`, completed from `CAMERA_DEFAULT`.
 *
 * The two rules coincide for an offset and diverge here, which is why this says
 * so rather than copying the line.
 *
 * **The baseline is stored beside the value and refreshed on every write**, so it
 * cannot drift more than one nudge from the block. And the drift is
 * unobservable: a block whose declared camera changed has a new `rev`, and `rev`
 * is already in the render key — so the slot is gone before a stale baseline
 * could serve anything.
 *
 * **Dropped on `rendered`'s own subscription**, in the same callback in
 * `construct.ts`, for `ScrollOffsets`' recorded reason: the rendered rows and the
 * camera that chose them are one fact about one entry, and two subscriptions are
 * two places for a future eviction path to reach one and miss the other.
 */
import { CAMERA_DEFAULT, type Camera, type Plot } from "../data/viewmodel/index.js";

/** What a block is drawn from with no entry in this store (C04 I75). */
export function baselineOf(declared: Plot["camera"]): Camera {
  return declared === undefined ? CAMERA_DEFAULT : { ...CAMERA_DEFAULT, ...declared };
}

const same = (a: Camera, b: Camera): boolean =>
  a.azimuth === b.azimuth &&
  a.elevation === b.elevation &&
  a.distance === b.distance &&
  a.projection === b.projection;

/** One block's live view, and the view it would have with no entry here. */
type Held = Readonly<{ camera: Camera; baseline: Camera }>;

export class Cameras {
  readonly #byEntry = new Map<string, Map<string, Held>>();

  /** Live entries holding at least one camera. Bounded by the entry count. */
  get size(): number {
    return this.#byEntry.size;
  }

  /**
   * The whole entry's cameras, for `RenderContext.cameras`.
   *
   * An empty record rather than `undefined` for an entry nothing has orbited, so
   * a renderer reads `?? block.camera` on one branch instead of two.
   */
  forEntry(entryId: string): Readonly<Record<string, Camera>> {
    const held = this.#byEntry.get(entryId);
    if (held === undefined) return EMPTY;
    return Object.fromEntries([...held].map(([id, h]) => [id, h.camera]));
  }

  /**
   * Turn one block's view, relative to wherever it is now.
   *
   * **The baseline comes in with every call** rather than being read once, for
   * the reason in this file's header: a block's declared camera can move, and a
   * baseline captured at first touch would outlive the block it describes.
   *
   * Nothing is clamped and nothing is normalised. `elevation` is left as given —
   * a camera past the pole is a view, not a corruption, and a store fixed up on
   * every write is one that accumulates (C23 I47). The renderer bounds what it
   * has to bound, which is where the projection is.
   */
  nudge(entryId: string, blockId: string, declared: Plot["camera"], delta: Partial<Camera>): void {
    const held = this.#byEntry.get(entryId) ?? new Map<string, Held>();
    const baseline = baselineOf(declared);
    const from = held.get(blockId)?.camera ?? baseline;
    held.set(blockId, {
      baseline,
      camera: {
        azimuth: from.azimuth + (delta.azimuth ?? 0),
        elevation: from.elevation + (delta.elevation ?? 0),
        distance: from.distance + (delta.distance ?? 0),
        projection: delta.projection ?? from.projection,
      },
    });
    this.#byEntry.set(entryId, held);
  }

  /**
   * A stable discriminator for the render cache's key (C22 I71, §6c).
   *
   * **The sixth axis, and its symptom is a hang rather than a stale frame.** The
   * other five produce a *wrong* frame and a reader reports it against what they
   * touched; a cached 3D plot under an orbit produces a **correct** frame — the
   * previous one — thirty times a second, which is what a stopped process looks
   * like.
   *
   * **Baselines are omitted, not zeros.** See the header: the two rules are the
   * same statement for an offset and different statements here, and keying a
   * returned-to-baseline camera apart from an untouched one would give one
   * appearance two slots — a cache that misses on every frame while every
   * assertion about correctness still passes (`focusKey`'s own warning).
   *
   * Sorted, because a `Map`'s insertion order would key one state two ways.
   */
  key(entryId: string): string {
    const held = this.#byEntry.get(entryId);
    if (held === undefined || held.size === 0) return "";
    const live = [...held].filter(([, h]) => !same(h.camera, h.baseline));
    if (live.length === 0) return "";
    return live
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([id, h]) => `${id}=${String(h.camera.azimuth)},${String(h.camera.elevation)},${String(h.camera.distance)},${h.camera.projection}`)
      .join(",");
  }

  delete(entryId: string): void {
    this.#byEntry.delete(entryId);
  }

  clear(): void {
    this.#byEntry.clear();
  }
}

const EMPTY: Readonly<Record<string, Camera>> = Object.freeze({});
