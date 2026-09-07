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

import { place, sortLayers } from "./place.js";
import { OverlayError } from "./types.js";
import type {
  BlockRegistryLike,
  DismissReason,
  KeyedLayer,
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

  /**
   * The topmost layer that takes keys (I21).
   *
   * **Skips peeks, and the type says so.** Everything that reads `top` is
   * asking *who has the keys* — C16's ladder, `pop`, the confirm's handler
   * guard, `promptUnderMenu` — and a peek's whole definition is that it never
   * does. `push` keeps the stack sorted (I23), so the topmost keyed layer is
   * the last one whose kind is not `peek`.
   */
  get top(): KeyedLayer | null {
    for (let i = this.#stack.length - 1; i >= 0; i -= 1) {
      const layer = this.#stack[i] as Layer;
      if (layer.kind !== "peek") return layer as KeyedLayer;
    }
    return null;
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
    assertPlaceable(layer);

    // **Sorted on the way in** (I2, I23), so `top` and `layout` read the same
    // order. Views and overlays already arrived sorted by construction — a view
    // is only ever pushed onto an empty stack — and a peek is the kind that
    // does not: it opens while a confirm or a menu may already be up, and it
    // belongs beneath them however late it arrives.
    this.#stack = sortLayers([...this.#stack, layer]);
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
    const updated: Layer = Object.freeze({
      ...current,
      ...(next.content !== undefined && { content: next.content }),
      ...(next.placement !== undefined && { placement: next.placement }),
      ...(next.width !== undefined && { width: next.width }),
      // The caret moves as the search is typed into, and `update` is how a
      // layer changes — a pop-and-repush is not (§4).
      ...(next.cursor !== undefined && { cursor: next.cursor }),
    });
    // **Before the stack moves, not after** (I20). A guard that throws having
    // already written leaves a layer neither placed nor removed, which is the
    // class C13's `settle(id, doc)` produced two components from the ruling
    // that made it possible.
    assertPlaceable(updated);

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

/**
 * I20 — a centred layer declares its own width.
 *
 * **Both entry points, and `update` is not the redundant one.** `LayerUpdate`
 * admits `placement`, so a layer pushed anchored and updated to centred reaches
 * the state by a route the push-time check cannot see.
 *
 * The state it forbids reads as correct at every width, which is why this is a
 * throw rather than a default: I16 resolves an absent width to the region's,
 * and a centred layer that inherits it is placed at `left = 0` and is
 * indistinguishable from `fill`. Defaulting to something narrower would invent
 * a number this component has no basis for — C15 knows the region and nothing
 * else (I16), and the owner is the only one that can measure its content.
 *
 * It lived as a comment in `shell/confirm.ts`, written after the defect had
 * been found once. `clearConfirmLayer` in C20 is the second centred layer in
 * the tree and declared no width at all.
 */
function assertPlaceable(layer: Layer): void {
  // I22 — a peek is beside the thing it describes, or it is a confirm or a
  // view wearing the wrong kind. Both entry points, on I20's argument.
  if (layer.kind === "peek" && layer.placement.kind !== "anchored") {
    throw new OverlayError(
      `peek ${layer.id} is ${layer.placement.kind}: a peek is anchored to the element it ` +
        `describes, and a centred or fill layer that takes no keys is a confirm or a view ` +
        `nothing can answer (I22)`,
    );
  }
  if (layer.placement.kind !== "centred" || layer.width !== undefined) return;
  throw new OverlayError(
    `centred layer ${layer.id} declares no width: it would be placed at left 0 ` +
      `across the whole region, which is \`fill\` and not \`centred\` (I20)`,
  );
}

export function createOverlayManager(opts: OverlayOptions): OverlayManager {
  return new Manager(opts);
}
