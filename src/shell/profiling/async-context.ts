/**
 * Where the open span lives, across an `await` (C28 I33).
 *
 * **The defect this replaces.** The recorder held one closure variable for the
 * open span and refused any close that did not match it. Two spans that overlap
 * — which is what an `await` produces — made the inner close a no-op and left
 * the pointer wrong for everything after. So every async span the profiler
 * could have recorded reported nothing, and reported it silently. Nothing in
 * `src/` opened one, so nothing surfaced it.
 *
 * **Why `AsyncLocalStorage` is constructed lazily, with the figures.** Measured
 * in the container on Node v22.23.2, `await Promise.resolve(i)` in a tight loop:
 *
 * | | ns per `await` |
 * |---|---|
 * | no `AsyncLocalStorage` anywhere in the process | 38 |
 * | one constructed and **never used** | **59** |
 * | inside `als.run` | 111 |
 *
 * Constructing the object is what switches on the async-hooks machinery, so it
 * taxes **every** promise in the process by about 55 % whether or not anything
 * reads it. A framework that pays that on import has made every application
 * slower to profile one of them. So the store is built on the first transition
 * to a tier that records durations, and an application that never profiles never
 * constructs it.
 *
 * The lookup itself is not the expensive part — `getStore()` with a store set is
 * 10.9 ns against `performance.now()`'s 36.9, so context costs about 15 % of the
 * span it makes correct. That is the trade this file exists to take.
 *
 * **Sync work never touches the store.** A plain box holds the parent when no
 * async context is active, which is the whole render path: input decode, route,
 * measure, paint and write are one unbroken synchronous stack. ALS is entered
 * only by `fork`, and `fork` is called only where a bracket has to survive a
 * promise.
 */
import { AsyncLocalStorage } from "node:async_hooks";

import type { OpenNode } from "./tree.js";

/** The mutable cell holding whichever span is currently the parent. */
export type SpanContext = { parent: OpenNode | null };

export interface Contexts {
  /** The cell to read and write a parent through, right now. */
  current(): SpanContext;
  /**
   * Run `fn` in a context of its own, seeded with the current parent.
   *
   * Everything `fn` starts — including work resumed after an `await` inside it
   * — sees that context, and work outside it is unaffected. This is what makes
   * N concurrent live fetches attribute to N separate parents instead of
   * trampling one pointer.
   */
  fork<T>(fn: () => T): T;
  /** Build the store, if it is not built. Called on the first spanning tier. */
  enable(): void;
  /** Whether the store exists — reported, so the overhead is never a surprise. */
  readonly asyncEnabled: boolean;
}

export function createContexts(): Contexts {
  const sync: SpanContext = { parent: null };

  // Deliberately not `new AsyncLocalStorage()` here — see the header.
  //
  // **Importing the module is free; constructing the storage is not**, and that
  // is measured rather than assumed: the 38 ns baseline above was taken in a
  // process that had already loaded `node:async_hooks` and built no instance.
  // It is the constructor that switches the machinery on, so a static import at
  // the top of this file costs nothing until `enable()` runs.
  let store: AsyncLocalStorage<SpanContext> | null = null;

  return {
    current(): SpanContext {
      return store?.getStore() ?? sync;
    },

    fork<T>(fn: () => T): T {
      if (store === null) return fn();
      // Seeded from the current parent, so a forked span nests under whatever
      // opened it rather than starting a second root.
      return store.run({ parent: store.getStore()?.parent ?? sync.parent }, fn);
    },

    enable(): void {
      if (store !== null) return;
      store = new AsyncLocalStorage<SpanContext>();
    },

    get asyncEnabled(): boolean {
      return store !== null;
    },
  };
}
