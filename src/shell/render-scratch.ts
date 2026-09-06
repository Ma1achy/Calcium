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
import { NO_PROBE } from "../data/viewmodel/index.js";
import type { Probe } from "../data/viewmodel/index.js";

type Slot = Readonly<{ key: string; value: unknown }>;

export class RenderScratchStore implements RenderScratch {
  readonly #slots = new WeakMap<object, Slot>();
  readonly #probe: Probe;

  /**
   * C28's seam, or none (C28 I30).
   *
   * **Constructor-injected here where the registry's is mutable**, because this
   * store is built at `construct.ts` step 5 with everything else the session
   * owns, and nothing has to exist before it. The registry's slot is late only
   * because the profiler is installed after the seal.
   */
  constructor(probe: Probe = NO_PROBE) {
    this.#probe = probe;
  }

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
    if (slot === undefined) {
      // **`absent` and `evicted` are the same observation from here.** The
      // `WeakMap` drops a slot when the document holding the carrier is
      // collected, and a reader cannot distinguish that from a first look — so
      // this reports the one it can defend. A separate `evicted` count would be
      // a guess with a name.
      this.#probe.miss("scratch", "absent");
      return undefined;
    }
    if (slot.key !== key) {
      // **`rev`, because that is what the key is.** It is a validity token that
      // moved, which is the same thing `RenderCache` and `HeightCache` call
      // `rev`; reporting the *diagnosis* instead would make one cache's
      // vocabulary different from the other two.
      //
      // The diagnosis is worth stating and is not the reason: on an orbit the
      // key moves because the camera did and the rebuild is owed, while on a
      // still frame it means a key recomputed rather than held — and the 194 ms
      // this file exists to avoid comes straight back. The counter cannot tell
      // those apart; the counter beside a still frame can.
      this.#probe.miss("scratch", "rev");
      return undefined;
    }
    this.#probe.hit("scratch");
    return slot.value;
  }

  set(owner: object, key: string, value: unknown): void {
    this.#slots.set(owner, Object.freeze({ key, value }));
  }
}
