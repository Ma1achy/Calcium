/**
 * The stack: push, pop, dismiss, update.
 *
 * C15 — see spec.
 *
 * Everything positional lives in `place.ts`. What is here is the stack's shape
 * and the change stream, and the shape is small on purpose: §6's transition
 * table has four states and `update` changes none of them.
 *
 * **This component holds no information about what a layer refers to.** It does
 * not know which transcript row an overlay is anchored to, whether that row
 * still exists, how wide a confirm wants to be, or where a view has scrolled.
 * Each of those was written into the spec as a duty here and moved back to the
 * owner, which is why `dismiss` takes a reason it never derives and `update`
 * exists at all.
 */

import { place } from "./place.js";
import { OverlayError } from "./types.js";
import type {
  BlockRegistryLike,
  DismissReason,
  Layer,
  LayerUpdate,
  OverlayChange,
  OverlayManager,
  OverlayOptions,
  Placed,
  Region,
} from "./types.js";

class Manager implements OverlayManager {
  readonly #registry: BlockRegistryLike;
  readonly #subscribers = new Set<(change: OverlayChange) => void>();

  /** Bottom-first, and already sorted — `push` maintains I2 rather than `layout` discovering it. */
  #stack: readonly Layer[] = Object.freeze([]);

  constructor(opts: OverlayOptions) {
    this.#registry = opts.registry;
  }

  get stack(): readonly Layer[] {
    return this.#stack;
  }

  get top(): Layer | null {
    return this.#stack.at(-1) ?? null;
  }

  get hasView(): boolean {
    return this.#stack.some((l) => l.kind === "view");
  }

  push(layer: Layer): Disposable {
    if (layer.kind === "view" && this.#stack.length > 0) {
      // Rejected rather than reordered. A view raised while anything is open
      // means the caller opened it from inside a modal, and views do not nest
      // (I1) — the drill-in from the dashboard appends to the transcript
      // instead (A01 D7), so there is no legitimate path here to accommodate.
      throw new OverlayError(
        `cannot push view ${layer.id}: ${this.#stack.length} layer(s) are already open`,
      );
    }
    if (this.#stack.some((l) => l.id === layer.id)) {
      throw new OverlayError(`layer ${layer.id} is already on the stack`);
    }

    this.#stack = Object.freeze([...this.#stack, layer]);
    this.#emit({ kind: "push", id: layer.id, layerKind: layer.kind });

    let disposed = false;
    return {
      [Symbol.dispose]: () => {
        // Idempotent (T3.15), and harmless after the layer has gone by another
        // route (T3.16) — `dismiss` on an unknown id is a no-op, and ids are
        // never reused, so a stale disposable cannot reach a newer layer.
        if (disposed) return;
        disposed = true;
        this.dismiss(layer.id);
      },
    };
  }

  pop(): Layer | null {
    const top = this.top;
    if (top === null || !top.dismissable) return null;
    this.#remove(top.id);
    this.#emit({ kind: "pop", id: top.id, layerKind: top.kind });
    return top;
  }

  dismiss(id: string, reason: DismissReason = "explicit"): void {
    const layer = this.#stack.find((l) => l.id === id);
    if (layer === undefined) return;
    this.#remove(id);
    this.#emit({ kind: "dismiss", id, reason });
  }

  update(id: string, next: LayerUpdate): boolean {
    const i = this.#stack.findIndex((l) => l.id === id);
    if (i === -1) return false;

    const current = this.#stack[i] as Layer;
    const updated = Object.freeze({
      ...current,
      ...(next.content !== undefined && { content: next.content }),
      ...(next.placement !== undefined && { placement: next.placement }),
      ...(next.width !== undefined && { width: next.width }),
    });

    const copy = [...this.#stack];
    copy[i] = updated;
    this.#stack = Object.freeze(copy);
    this.#emit({ kind: "content", id });
    return true;
  }

  layout(region: Region): readonly Placed[] {
    return place(this.#stack, region, this.#registry);
  }

  subscribe(cb: (change: OverlayChange) => void): Disposable {
    this.#subscribers.add(cb);
    return {
      [Symbol.dispose]: () => {
        this.#subscribers.delete(cb);
      },
    };
  }

  #remove(id: string): void {
    this.#stack = Object.freeze(this.#stack.filter((l) => l.id !== id));
  }

  /** Over a copy, so a subscriber dismissing a layer cannot skip another. */
  #emit(change: OverlayChange): void {
    for (const cb of [...this.#subscribers]) cb(change);
  }
}

export function createOverlayManager(opts: OverlayOptions): OverlayManager {
  return new Manager(opts);
}
