/**
 * Caller-owned scratch for work a renderer would otherwise repeat (C12 I107,
 * C12 §6o, FINDINGS F469, F507).
 *
 * **This exists so that C12 can hold nothing.** I11 forbids state that survives
 * a render and permits a local; the distinction it draws is **ownership**, not
 * lifetime. `trianglesOf` is a pure function of a surface's carriers, the
 * block's extent and the series index — none of which is the camera — so an
 * orbit rebuilds an identical answer thirty times a second, measured at
 * **194 ms of a 319 ms frame** on a 69,451-face mesh. F469 named exactly this
 * remedy and recorded it rather than taking it, on the ground that the wrong
 * version of it — a module-level cache inside the renderer — is the tempting
 * one. Here it is the session's, and the renderer reads a field.
 *
 * **`RenderCache`'s shape and `HeightCache`'s rule, and neither is copied
 * whole.** One slot per owner, and `(owner, key)` is a **validity predicate**
 * rather than a map key: read as a composite key this describes a table with one
 * slot per revision, which is the leak T3.18 catches one store along. What does
 * not transfer is the eviction — those two are dropped on `rendered`'s
 * subscription, and this needs no subscription at all.
 *
 * **A `WeakMap` on the caller's own array is what bounds it**, and that is the
 * whole reason the owner is a carrier rather than an entry id. The slot dies
 * when the document holding the mesh does, so there is no third callback for a
 * future eviction path to reach two of — this file's neighbours make that
 * argument twice and then both subscribe.
 *
 * **Nothing here knows what it holds.** The value is `unknown` because the
 * alternative is C09's context type importing C12's `Tri3`, an edge from
 * `blocks/` into `plot/` where the reverse already exists.
 */
import type { RenderScratch } from "../presentation/blocks/types.js";

type Slot = Readonly<{ key: string; value: unknown }>;

export class RenderScratchStore implements RenderScratch {
  readonly #slots = new WeakMap<object, Slot>();

  /**
   * What is held for `owner`, or `undefined` if the slot is empty or holds
   * another `key`.
   *
   * **The three-way comparison *is* the one-slot rule.** A slot whose key
   * disagrees is not a second entry to be kept alongside — it is this owner's
   * one slot, holding a value that is now wrong.
   */
  get(owner: object, key: string): unknown {
    const slot = this.#slots.get(owner);
    return slot === undefined || slot.key !== key ? undefined : slot.value;
  }

  set(owner: object, key: string, value: unknown): void {
    this.#slots.set(owner, Object.freeze({ key, value }));
  }
}
