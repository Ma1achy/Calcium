/**
 * The rendered lines of a transcript entry (C22 §6c, I58).
 *
 * **`HeightCache`'s shape, and two axes it deliberately does not have.** That
 * file's header is the argument to read first: `(entryId, rev, width)` is a
 * *validity predicate* rather than a map key, so one slot per entry is what
 * makes "no more slots than entries" hold by construction instead of by an
 * eviction rule someone must remember to run — and C13's `Change` variants map
 * onto the operations with nothing left over.
 *
 * All of that transfers. What does not is its other claim: that theme and
 * capabilities are absent because C09 §4 makes capability substitutions 1:1 by
 * cell count and C10 T4.1 asserts geometry is identical across themes. Both are
 * true and both are about *height*. **This holds appearance**, and a themed row
 * is a different string at the same height.
 *
 * So two axes are added, and each is one the naive key would have dropped:
 *
 * - **Focus.** `visibleRows` passes `focusFor(graph, entry.id)` into the render
 *   and C11 draws the focused row in another tone (C11 I14). Moving the
 *   selection down a table changes no `rev` and no width. `focusFor` answers
 *   non-null only for the live entry, so at most one slot is ever affected by
 *   it — which is why this is a discriminator on the slot rather than a reason
 *   to clear the cache.
 * - **The theme's identity.** `ResolvedTheme.name` already moves on a variant
 *   switch and on an override, and C10 I11 already keys its own memo on it. So
 *   this needs no `invalidate` call and, more to the point, cannot be left out
 *   of one: the fact travels with the value. A hook at a fourth call site is
 *   precisely the shape this tree keeps finding unwired.
 *
 * **`ctx.tick` is not here and no transcript render receives one** (I60).
 * `visibleRows` passes none, so every entry renders at 0. The day something
 * threads a tick through, an animating entry serves its first frame for the life
 * of the session and nothing in the suite would fail — so the axis is absent and
 * the value is constant *together*, and threading either obliges the other.
 *
 * **This makes the second frame free and the first no cheaper** (I59). A
 * 5,000-line block still renders every one of its lines the first time it is
 * drawn at a width. That is a stall rather than a fix, and `window.ts` is what
 * bounds the first frame.
 */

import type { EntryId } from "../viewport/transcript/index.js";

type Slot = Readonly<{
  rev: number;
  width: number;
  focus: string;
  theme: string;
  lines: readonly string[];
}>;

/**
 * The focus discriminator, normalised.
 *
 * **`null` must map to one value.** `focusFor` returns `null` for every entry
 * that is not live and for a live one holding no focusable block, and a key that
 * distinguished those would alternate between two slots for one appearance —
 * a cache that misses on every frame while every assertion about correctness
 * still passes.
 */
export function focusKey(focus: Readonly<{ blockId: string; rowId: string | null }> | null): string {
  if (focus === null) return "";
  // `\u0000` written as an escape and not as the byte. SS43 caught the literal,
  // which is the rule doing exactly what its message describes: the separator
  // read as a space in every editor and was a NUL. The *value* was right — it is
  // the separator C19's engine uses to join a source id to a context key, and it
  // cannot occur in a block or row id — and only the spelling was invisible.
  return `${focus.blockId}\u0000${focus.rowId ?? ""}`;
}

export class RenderCache {
  readonly #slots = new Map<EntryId, Slot>();

  /** Live slots. Bounded by the entry count, by construction (I58). */
  get size(): number {
    return this.#slots.size;
  }

  /**
   * The cached lines, or `undefined` if nothing valid is held.
   *
   * The five-way comparison **is** the invariant. A slot disagreeing on any axis
   * is not a different key to be kept alongside — it is this entry's one slot,
   * holding lines that are now wrong.
   */
  get(
    id: EntryId,
    rev: number,
    width: number,
    focus: string,
    theme: string,
  ): readonly string[] | undefined {
    const slot = this.#slots.get(id);
    if (slot === undefined) return undefined;
    if (slot.rev !== rev || slot.width !== width) return undefined;
    if (slot.focus !== focus || slot.theme !== theme) return undefined;
    return slot.lines;
  }

  set(
    id: EntryId,
    rev: number,
    width: number,
    focus: string,
    theme: string,
    lines: readonly string[],
  ): void {
    this.#slots.set(id, Object.freeze({ rev, width, focus, theme, lines }));
  }

  /** `evict` deletes by id — no key enumeration, because there is one slot. */
  delete(id: EntryId): void {
    this.#slots.delete(id);
  }

  clear(): void {
    this.#slots.clear();
  }
}
