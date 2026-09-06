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
 * **And `capabilities` is the fourth thing the render reads, absent for a
 * reason this header did not give** (T4.18c, T4.18d). The paragraph above
 * refutes the height argument for theme *and* capabilities in one sentence —
 * *both are true and both are about height* — and then adds theme only. A
 * capability record is an appearance axis exactly as a theme is: `rule` draws
 * `─` at full and `-` at ascii, at the same height, and T4.18c is that
 * measured rather than argued.
 *
 * What makes the omission safe is not in the refuted sentence: **the record is
 * built once at construction step 2 and nothing in `src/` reassigns it**, so
 * the axis is constant for the session. That is `ctx.tick`'s treatment below,
 * and T4.18d asserts it rather than describing it — a re-detect on resize or an
 * `/ascii` toggle fails that row, which is the day this key needs a fifth
 * discriminator.
 *
 * **The audit that found it is worth naming, because the key was right and its
 * reasoning was not**: *a cache key is wrong until you have listed everything
 * the render reads*. Listed against `visibleRows` — the registry (sealed), the
 * blocks (`rev`), the width, the window range, the theme, the focus, the
 * capabilities. Six keyed, one constant, none unaccounted for.
 *
 * **`ctx.tick` is keyed per kind, and only where something moves** (I60, F233,
 * F836). `visibleRows` asks `animationIntervalOf(windowed.blocks)` and puts the
 * tick in the slot's key when the answer is not `null` — a `status`, a `steps`,
 * or since the ramps any block whose content carries an `animate` (C09 I54) —
 * so an entry holding nothing that moves keys exactly as it did and only the
 * entries that move pay for moving. This comment said the opposite for one
 * commit after the wiring landed, which is F836: the axis and its absence were
 * described in the file that implements the key, and nothing re-reads a comment
 * when the invariant it cites changes tense.
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
export function focusKey(
  focus: Readonly<{
    blockId: string;
    rowId: string | null;
    selected?: readonly Readonly<{ blockId: string; rowId: string }>[];
  }> | null,
): string {
  if (focus === null) return "";
  // **The extent is in the key** (I58, C26 I16). `⌃a` at the tail moves the
  // anchor and not the head, so it is the one keystroke that changes what is
  // painted while `(blockId, rowId)` stands still — and a key holding the head
  // alone served the frame from before the selection. Every `⇧↓` moves the
  // head, so every `⇧↓` moved the key by coincidence, which is why the axis
  // was owed and unreported (§6c row 1a). Absent and `[]` key alike, because
  // they draw alike.
  const extent = (focus.selected ?? []).map((s) => `${s.blockId}\u0000${s.rowId}`).join("\u0001");
  // `\u0000` written as an escape and not as the byte. SS43 caught the literal,
  // which is the rule doing exactly what its message describes: the separator
  // read as a space in every editor and was a NUL. The *value* was right — it is
  // the separator C19's engine uses to join a source id to a context key, and it
  // cannot occur in a block or row id — and only the spelling was invisible.
  return `${focus.blockId}\u0000${focus.rowId ?? ""}\u0000${extent}`;
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
