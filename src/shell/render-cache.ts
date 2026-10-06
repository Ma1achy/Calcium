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

import { NO_PROBE } from "../data/viewmodel/index.js";
import type { Probe } from "../data/viewmodel/index.js";
import type { EntryId } from "../viewport/transcript/index.js";

type Slot = Readonly<{
  rev: number;
  width: number;
  focus: string;
  theme: string;
  /** The spinner counter — the second axis whose miss keeps the parts (I103). */
  tick: string;
  /** The window range the rows are of — the one axis the parts do not carry (I101). */
  range: string;
  lines: readonly string[];
  /**
   * The lines of every block rendered whole under this slot's stable key, by
   * the block's id and its `align` (I101), and one slice per block the window
   * sliced, under its id with the window it is of (I104). Bounded by the
   * entry's own blocks and dropped with the slot on a miss on any axis but
   * the range and the tick.
   */
  parts: Held;
}>;

/**
 * What a slot holds beside its rows (I101, I104): the lines of every block
 * rendered whole, by key; and for a block the window sliced, one slice —
 * its rows and the run-local window they are of — by the block's id, replaced
 * whenever another window renders it. Bounded by the entry's own shape.
 */
type Held = Readonly<{
  whole: Map<string, readonly string[]>;
  slices: Map<string, Readonly<{ window: string; lines: readonly string[] }>>;
}>;

const freshHeld = (): Held => ({ whole: new Map(), slices: new Map() });

/**
 * The parts of one entry, open to the render that follows a **range** miss
 * (I101): `part` reads a block rendered whole under the same stable key, and
 * `hold` keeps one rendered now for the next range. `slice` reads the rows of
 * a block the window sliced, if they were rendered for this very window, and
 * `holdSlice` keeps them under the block's id for the next miss that reaches
 * it — replacing whatever window that id held before (I104). Handed out by
 * `parts()` only after a range or a tick miss, so a miss on any other axis
 * assembles nothing from before it.
 */
export type EntryParts = Readonly<{
  part(key: string): readonly string[] | undefined;
  hold(key: string, lines: readonly string[]): void;
  slice(id: string, window: string): readonly string[] | undefined;
  holdSlice(id: string, window: string, lines: readonly string[]): void;
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
    inside?: boolean;
    draft?: Readonly<{ text: string; cursor: number }>;
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
  // **The inside is in the key** (I58, C26 I26). Entering changes what a control
  // draws — §018's third state is *weight plus a painted handle* — and moves
  // neither `rev`, nor the width, nor `(blockId, rowId)`, which is the sixth
  // axis's own argument arriving on a seventh: a correct stale frame, and the
  // reader's `⏎` doing nothing visible.
  // **And the draft** (C22 I118, C09 I119): a keystroke in a form field changes
  // what the field draws and moves none of the axes above — the inside's own
  // argument, one keystroke later. Measured: the frame showed the value from
  // before the key.
  const draft = focus.draft === undefined ? "" : `${String(focus.draft.cursor)}\u0001${focus.draft.text}`;
  return `${focus.blockId}\u0000${focus.rowId ?? ""}\u0000${extent}\u0000${focus.inside === true ? "in" : ""}\u0000${draft}`;
}

/** `HeightCache`'s two axes and the three this one adds (C28 I8, C14 I27). */
export type RenderMisses = Readonly<
  Record<"absent" | "rev" | "width" | "theme" | "focus" | "tick" | "range" | "nothing-changed", number>
>;

/**
 * Row for row, and **only ever on a miss**.
 *
 * A whole-document comparison in the hot path would be the wrong trade; this
 * runs once per re-render that already happened, so it is paid out of work
 * already spent rather than added to work about to be. Escapes and all, because
 * a re-render producing the same bytes is the thing being counted — two visually
 * identical rows differing in an SGR reset are two different writes.
 */
function sameLines(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

export class RenderCache {
  readonly #slots = new Map<EntryId, Slot>();
  readonly #probe: Probe;
  #hits = 0;
  readonly #misses = { absent: 0, rev: 0, width: 0, theme: 0, focus: 0, tick: 0, range: 0, "nothing-changed": 0 };

  /** The slot `get` most recently rejected, and its lines — see `set` (C14 I28). */
  #discarded: Readonly<{ id: EntryId; lines: readonly string[] }> | null = null;

  /**
   * The parts a **range** miss (I101) or a **tick** miss (I103) left open for
   * the render that follows it, or `null` after any other miss — the render after a `rev` miss holds
   * whatever it renders whole into a fresh map, and reads nothing from before.
   */
  #open: Readonly<{ id: EntryId; parts: Held }> | null = null;

  /**
   * C28's seam, or none (C28 I30).
   *
   * **Counted here rather than at the caller**, which is `HeightCache`'s ruling
   * carried over: the comparison that knows the axis is here, and the value
   * comparison `nothing-changed` needs is one only this class can make. A store
   * that reported to a caller and was counted by another would be two
   * comparisons obliged to agree.
   */
  constructor(probe: Probe = NO_PROBE) {
    this.#probe = probe;
  }

  get hits(): number {
    return this.#hits;
  }

  get misses(): RenderMisses {
    return Object.freeze({ ...this.#misses });
  }

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
    range: string,
    tick = "",
  ): readonly string[] | undefined {
    const slot = this.#slots.get(id);
    if (slot === undefined) return this.#miss(id, "absent", undefined, null);
    // **The order is the invariant** (C28 I8). A slot can disagree on several
    // axes at once and the reason reported is the first checked, so this
    // sequence is what a count means. Coarsest first: `rev` moves on any content
    // change at all, so an entry that changed reports `rev` even if the width
    // moved too — right, because the re-render was owed either way.
    if (slot.rev !== rev) return this.#miss(id, "rev", slot.lines, null);
    if (slot.width !== width) return this.#miss(id, "width", slot.lines, null);
    if (slot.theme !== theme) return this.#miss(id, "theme", slot.lines, null);
    if (slot.focus !== focus) return this.#miss(id, "focus", slot.lines, null);
    // **The tick keeps the parts too** (I103): a spinner moved one block's rows
    // and no other's, so the slot's parts are right for every block that does
    // not animate — the assembly is what skips the ones that do. Folded into
    // `focus` this was a whole-entry render every 80 ms, reported under the
    // wrong name (F1189).
    if (slot.tick !== tick) return this.#miss(id, "tick", slot.lines, slot.parts);
    // **The range last, and it is the other miss that keeps the parts** (I101):
    // every axis above agreed, so what the slot rendered whole is what this
    // window would render whole, and only the rows are of the wrong range.
    if (slot.range !== range) return this.#miss(id, "range", slot.lines, slot.parts);
    this.#hits += 1;
    this.#probe.hit("render");
    return slot.lines;
  }

  #miss(
    id: EntryId,
    reason: "absent" | "rev" | "width" | "theme" | "focus" | "tick" | "range",
    discarded: readonly string[] | undefined,
    parts: Held | null,
  ): undefined {
    this.#misses[reason] += 1;
    this.#probe.miss("render", reason);
    this.#discarded = discarded === undefined ? null : { id, lines: discarded };
    this.#open = parts === null ? null : { id, parts };
    return undefined;
  }

  /**
   * The parts left open for `id` by a range or a tick miss (I101, I103), or `undefined` when
   * the last miss for it was on any other axis — or was another entry's.
   */
  parts(id: EntryId): EntryParts | undefined {
    const open = this.#open;
    if (open === null || open.id !== id) return undefined;
    return {
      part: (key) => open.parts.whole.get(key),
      hold: (key, lines) => void open.parts.whole.set(key, lines),
      // **One slice per id, and the window is the condition** (I104): a slice
      // held for another window is not these rows, and holding replaces it.
      slice: (id, window) => {
        const held = open.parts.slices.get(id);
        return held !== undefined && held.window === window ? held.lines : undefined;
      },
      holdSlice: (id, window, lines) => void open.parts.slices.set(id, { window, lines }),
    };
  }

  set(
    id: EntryId,
    rev: number,
    width: number,
    focus: string,
    theme: string,
    range: string,
    lines: readonly string[],
    tick = "",
  ): void {
    // **C14 I28's comparison, on lines rather than a height.** `slot` above is
    // seven fields joined per entry per frame, so a key that churns while the
    // screen is still spends a full re-render and produces identical output.
    // The axis says what invalidated; this says whether it needed to.
    const d = this.#discarded;
    if (d !== null && d.id === id && sameLines(d.lines, lines)) {
      this.#misses["nothing-changed"] += 1;
    }
    this.#discarded = null;
    // **The largest per-entry allocation in the shell, watched** (C28 I43). The
    // slots are a strong map keyed by entry id and `delete` empties them, so a
    // retained array is not this cache's doing — it is a closure somewhere else
    // still holding a frame that was replaced or evicted. Nothing else could
    // say so: occupancy counts slots, and a slot that was overwritten leaves no
    // trace in it at all.
    this.#probe.track("render-cache.lines", lines);
    // **The parts survive a range miss and a tick miss and nothing else** (I101, I103): the map the
    // miss left open is the one stored back, grown by what this render held;
    // after any other miss it is a fresh one.
    const open = this.#open;
    const parts = open !== null && open.id === id ? open.parts : freshHeld();
    this.#open = null;
    this.#slots.set(id, Object.freeze({ rev, width, focus, theme, tick, range, lines, parts }));
  }

  /** `evict` deletes by id — no key enumeration, because there is one slot. */
  delete(id: EntryId): void {
    this.#slots.delete(id);
  }

  clear(): void {
    this.#slots.clear();
  }
}
