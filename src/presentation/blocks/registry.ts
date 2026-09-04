/**
 * C09 §6 — the registry, and the two failures it contains.
 *
 * The registry is the dispatcher for both halves, and it passes **itself** as
 * `measureChild` and `ctx.renderChild` (A02 Seam 1). That is what lets `panel`
 * and `group` compose children whose kind they do not know while no kind
 * imports the registry (I7) — the layering at L1 holds because of this one
 * argument, and it is the most copied-wrong pattern in a block library.
 */
import { Box, Text } from "ink";
import { createElement, type ReactElement } from "react";
import {
  childWidths,
  hasChildren,
  normaliseWidth,
  sequenceHeight,
} from "../../data/viewmodel/index.js";
import type { Block, Status } from "../../data/viewmodel/index.js";
import { DEFAULT_DEFINITIONS } from "./defaults.js";
import { clampSpans, paint, rows, tone } from "./paint.js";
import { truncate } from "../text.js";
import { statusDefinition, statusRowsFor } from "./kinds/status.js";
import type {
  BlockDefinition,
  BlockFault,
  BlockRegistry,
  NavElement,
  RenderContext,
  RenderContextInput,
} from "./types.js";

/**
 * One frozen empty list, shared.
 *
 * A fresh `[]` per call would be a new identity every time, and C26 I11 makes
 * this a **pull** recomputed on dispatch — so an atomic block would allocate on
 * every keystroke for a value that is always the same nothing.
 */
const EMPTY_ELEMENTS: readonly NavElement[] = Object.freeze([]);

/**
 * *No elements, and this definition does not own them* — the one answer both
 * halves of I30 are read from.
 *
 * **`owned: false` on the throwing path is the fix.** The two questions used to
 * be two calls, and the ownership one asked whether `elements` was *declared*
 * rather than what resolving it returned — so a container whose `elements` threw
 * answered *no elements* and *do not descend* at once, and took its whole subtree
 * out of the walk. Measured at 0 elements against a control's 4 (F224).
 */
const NO_ELEMENTS: Resolved = Object.freeze({ elements: EMPTY_ELEMENTS, owned: false });

/** A block's elements and whether its definition answered them. */
type Resolved = Readonly<{ elements: readonly NavElement[]; owned: boolean }>;

/** The contained height, and whether the measurer gave way producing it (I11). */
type Measured = Readonly<{ ok: boolean; rows: number }>;

/**
 * The most rows one block may occupy before the registry caps it (C14 I24, §2b).
 *
 * **A reading-length policy, not a figure the measurement chose.** Paint is
 * ~0.25 ms a row for every kind and linear with no knee (C14 §4b's table), so
 * nothing in the figures picks a number; fifty screens of forty rows is the
 * policy, and it is `MAX_ROWS`'s figure for the fallback adapter — one number in
 * the tree rather than two that drift. `TuiConfig.maxBlockRows` raises it per
 * session; nothing raises it per block, because a cap an adapter can lift is a
 * cap on nothing.
 */
export const DEFAULT_MAX_BLOCK_ROWS = 2_000;

/**
 * What a capped form carries: the rows it draws and the rows the block had
 * (C14 I24). `shown` is the window's own measured rows and **not the cap**,
 * because a window is a unit boundary — a `table` whose boundary row is
 * expanded keeps the whole row — and the marker names the rows on screen.
 */
type Capped = Readonly<{ shown: number; total: number }>;

/**
 * A block resolved to the definition that draws it, in its capped form.
 *
 * `capped` is `null` for every block within the cap and for every kind with no
 * `window` (C14 I26); `block` is then the **same reference** the caller passed,
 * so nothing downstream can observe the cap on a block it does not touch.
 */
type Form = Readonly<{ definition: BlockDefinition; block: Block; capped: Capped | null }>;

/**
 * `capped` is view state on `lineRange`'s argument (C04 I82, C09 I25a): written
 * here, read here, refused from a far side. **Read through a cast until C04
 * names the field** — the request is recorded rather than the field assumed —
 * and the shape is checked rather than trusted, because a far side that got
 * past validation would otherwise dictate a marker.
 */
function cappedOf(block: Block): Capped | null {
  const held = (block as { capped?: unknown }).capped;
  if (typeof held !== "object" || held === null) return null;
  const { shown, total } = held as { shown?: unknown; total?: unknown };
  if (!Number.isInteger(shown) || !Number.isInteger(total)) return null;
  return { shown: shown as number, total: total as number };
}

function withCapped(block: Block, capped: Capped): Block {
  // Through `unknown`, as every kind's registration is: `Block` is a union and
  // an excess-property check on a union refuses a field no arm declares yet.
  return { ...block, capped } as unknown as Block;
}

/** A block without its `capped`, so a window that stops short of the marker draws none. */
function stripCapped(block: Block): Block {
  if (cappedOf(block) === null) return block;
  const { capped: _capped, ...rest } = block as Block & { capped?: unknown };
  return rest as Block;
}

/**
 * The definition of last resort: a registry with no `raw` at all, which is
 * reachable only through `defaults: false`. One row, saying what is missing.
 */
const MISSING: BlockDefinition = {
  kind: "raw",
  measure: () => 1,
  render: (block, ctx) =>
    rows([
      paint([
        {
          text: `[${block.kind} has no definition, and no raw fallback is registered]`,
          style: tone("error", ctx.theme, ctx.capabilities),
        },
      ]),
    ]),
};

/**
 * A registry that has been sealed cannot be registered against (I12).
 *
 * Sealing matches C05's manifest store and C07's adapter registry, and the
 * reason is measurement rather than tidiness: a kind registered mid-session
 * would let a block measured before registration differ from the same block
 * measured after, which is drift that appears only on scrollback (§6).
 */
class Registry implements BlockRegistry {
  readonly #definitions = new Map<string, BlockDefinition>();
  readonly #onError: (fault: BlockFault) => void;
  /** The most rows one block may occupy (C14 I24). A positive integer, checked at construction. */
  readonly #cap: number;
  #sealed = false;

  constructor(
    definitions: readonly BlockDefinition[],
    onError: (fault: BlockFault) => void,
    maxBlockRows: number,
  ) {
    for (const definition of definitions) this.#definitions.set(definition.kind, definition);
    this.#onError = onError;
    // **Refused here rather than defaulted** (C14 T2.14). A cap of `0` would
    // mark every block and a fraction would put the marker at a row nothing
    // measured; both read as a working registry until a frame is read.
    if (!Number.isInteger(maxBlockRows) || maxBlockRows < 1) {
      throw new Error(
        `createBlockRegistry: maxBlockRows must be a positive integer, got ${String(maxBlockRows)}`,
      );
    }
    this.#cap = maxBlockRows;
  }

  /**
   * What a containment swallowed, handed to whoever asked for it (I29).
   *
   * **Three call sites, not four**, and the fourth is gone rather than missing:
   * the ownership question used to carry a catch of its own and now reads the
   * one `#elements` already took (I30). The invariant was written expecting four
   * and the implementation is what disproved it.
   *
   * **A throwing sink is not caught.** That is what makes a caught error a red
   * suite rather than a quiet frame — the harness supplies one that throws, and
   * containment that survives its own alarm would be the defect this exists to
   * end. Deduplication is the sink's business: `measure` is called at frame
   * cadence, so a flood is the default shape and L4's recorder already collapses
   * one by message.
   */
  #report(block: Block, member: BlockFault["member"], error: unknown, rows = 0): void {
    this.#onError(Object.freeze({ kind: block.kind, id: block.id, member, error, rows }));
  }

  /**
   * What the error box will say — **one text, and the fault and the block both
   * take it from here.**
   *
   * The rows a fault asks for are a function of this string, and the string the
   * box draws has to be the same one or the height fits a message nobody sees.
   * They were two literals a hundred lines apart before there was a number
   * riding on them; `cells()`'s argument, applied to a sentence.
   */
  static #errorText(block: Block, member: "measure" | "render", error: unknown): string {
    if (member === "measure") return `${block.kind} failed to measure`;
    return `${block.kind} failed to render: ${error instanceof Error ? error.message : String(error)}`;
  }

  /**
   * `measure`, contained — and whether it gave way, which the error path needs
   * and the public member throws away.
   */
  #measured(block: Block, width: number, caps?: RenderContext["capabilities"]): Measured {
    // **The floor is C04's and applying it is this function's** (I33, C04 I67).
    // In both arms rather than only the successful one: a floor is about the
    // block, not about which half of its definition gave way, and a measurer
    // that threw is exactly the case where the rows are most needed.
    const floor = floorOf(block);
    try {
      // **The capped form, and the marker is a row** (C14 I24). Cap first and
      // floor after: the floor pads a short block and this bounds a tall one,
      // and a floored block over the cap takes `max(shown + 1, floor)`.
      const form = this.#form(block, width);
      const rows =
        form.definition.measure(form.block, width, this.measure) + (form.capped === null ? 0 : 1);
      return { ok: true, rows: Math.max(rows, floor) };
    } catch (error) {
      // I11 — a throwing measurer is contained and the block treated as one
      // row. This protects virtualisation: C14 sums measured heights without
      // rendering, so a measurer that throws would take the viewport with it
      // (T3.14). Compute, so no retry (A02 §7 rule 2).
      // **`caps` is absent on the public `measure` path and that is not a
      // default standing in for a value** (I2). A fault seen there is a
      // diagnostic and never a request: the shell only records one inside the
      // scope a *render* opens, so a measure fault with no request is exactly
      // the case that cannot produce one. Asking for rows would be answering a
      // question nobody put.
      const rows =
        caps === undefined
          ? 0
          : statusRowsFor(
              errorStatus(Registry.#errorText(block, "measure", error), 1),
              width,
              caps,
            );
      this.#report(block, "measure", error, rows);
      return { ok: false, rows: Math.max(1, floor) };
    }
  }

  /**
   * The error block, at **exactly** the height already committed (I11).
   *
   * The message is fitted to the width and the remaining rows are blank; the
   * height is never fitted to the message. A committed height of zero — an empty
   * `group`, the one legitimate zero (`rows`' own comment) — draws **nothing**,
   * and the fault still reaches the sink: the visible channel is bounded by the
   * contract and the reporting channel is not.
   */
  /**
   * **No brackets around the message.** They shipped because the design figure
   * drew `[⚠ plot failed to render: …]` as *annotation* — square brackets marking
   * which cells the figure intended to paint — and the implementation read them
   * as characters. The tag ` ERROR ` keeps its own, because those are real.
   */
  #errorBlock(text: string, height: number, ctx: RenderContext): ReactElement {
    if (height <= 0) return createElement(Box, { flexDirection: "column" });
    // **Through the `status` definition, not a private figure** (C09 I31). The
    // boundary's box and the box a live part draws while it is retrying are the
    // same picture, so they are one implementation — and the height handed in is
    // the one `measure` already committed, which is what makes the pair
    // self-consistent by construction rather than by agreement.
    //
    // Called directly rather than through `this.render`: the definition is a
    // different kind from the one being contained, so there is no re-entrancy,
    // and going back through the registry would put a second catch between the
    // boundary and the block it is drawing.
    return statusDefinition.render(errorStatus(text, height), ctx);
  }

  /**
   * A block's elements **and** whether its definition owns them — one call,
   * because they are one answer (I30, C26 I12).
   */
  #elements(block: Block, width: number): Resolved {
    try {
      // Over the capped form (C14 I24): nothing beyond the cap is on screen, so
      // nothing beyond it can be focused, and the marker row declares none.
      const form = this.#form(block, width);
      const declared = form.definition.elements;
      if (declared === undefined) return NO_ELEMENTS;
      return { elements: declared(form.block, width, this.measure), owned: true };
    } catch (error) {
      this.#report(block, "elements", error);
      return NO_ELEMENTS;
    }
  }

  get sealed(): boolean {
    return this.#sealed;
  }

  get kinds(): readonly string[] {
    return [...this.#definitions.keys()];
  }

  register(definition: BlockDefinition): void {
    if (this.#sealed) {
      throw new Error(
        `the block registry is sealed; ${definition.kind} cannot be registered after composition`,
      );
    }
    if (this.#definitions.has(definition.kind)) {
      // Shadowing a registered kind is rejected rather than silently accepted
      // (T3.18). An app that overrides `logs` by accident gets a frame that is
      // subtly wrong everywhere, and no way to find out why.
      throw new Error(
        `${definition.kind} is already registered; a kind is not overridden, it is named differently`,
      );
    }
    this.#definitions.set(definition.kind, definition);
  }

  get(kind: string): BlockDefinition | undefined {
    return this.#definitions.get(kind);
  }

  seal(): void {
    // Sealing twice is a no-op, not an error (T3.3). Composition roots compose.
    this.#sealed = true;
  }

  /**
   * An unregistered kind resolves to `raw` rather than throwing (I10): a
   * document referencing an unknown kind still renders, degraded.
   *
   * The block is *converted* rather than merely dispatched, because a foreign
   * block has no `text` field and `raw` reads one. Rendering the block as its
   * own JSON is the honest degradation: the content is visible, and what is
   * wrong with it is visible too. A registry with no `raw` — `defaults: false`
   * and nothing registered — falls back to nothing, and says so as a block
   * rather than as a throw.
   */
  #resolve(block: Block): Readonly<{ definition: BlockDefinition; block: Block }> {
    const held = this.#definitions.get(block.kind);
    if (held !== undefined) return { definition: held, block };

    const fallback = this.#definitions.get("raw");
    if (fallback === undefined) return { definition: MISSING, block };

    return {
      definition: fallback,
      block: { kind: "raw", id: block.id, text: JSON.stringify(block) },
    };
  }

  /**
   * A block in its capped form — the definition's own `window(block, w, 0, cap)`
   * with `capped: { shown, total }` attached — or the block itself, by reference,
   * when it is within the cap or its kind does not divide (C14 I24, I26, §2b).
   *
   * **The kind's window is the cap, which is why no kind implements one.** A
   * kind's `window` is its statement that its rows are its lines; `plot` has
   * none and is exactly as atomic as I27 says, and a kind that declares one is
   * capped on the day it does — no list of kinds is consulted (C14 I26).
   *
   * **The whole measure first, and the cap cannot avoid it.** The marker has to
   * say *of 50 000 rows*, and knowing the total is the whole of what `measure`
   * does. Measured before this was built: 0.6 ms for a 50 000-row `table`,
   * 0.2 ms for `logs`, ~20 ms for `raw` and `code` (one split of the text), so
   * the roadmap's *a 50 000-row table has to be measured before C14 can place
   * it* named a cost that is neither large nor this cap's to bound (C14 §4b).
   *
   * **A block already carrying `capped` is never re-capped.** It is a piece a
   * window produced, and its rows are its definition's plus the marker.
   */
  #form(block: Block, width: number): Form {
    const resolved = this.#resolve(block);
    const held = cappedOf(resolved.block);
    if (held !== null) return { ...resolved, capped: held };
    const windowable = resolved.definition.window;
    if (windowable === undefined) return { ...resolved, capped: null };
    const total = resolved.definition.measure(resolved.block, width, this.measure);
    if (!(total > this.#cap)) return { ...resolved, capped: null };
    // `this.measure` is the child seam (I26a), as `windowSequence` hands it.
    const out = windowable(resolved.block, width, 0, this.#cap, this.measure);
    const shown = resolved.definition.measure(out.block, width, this.measure);
    const capped: Capped = Object.freeze({ shown, total });
    return { definition: resolved.definition, block: withCapped(out.block, capped), capped };
  }

  /**
   * `#form`, contained — for `windowSequence`, whose `this.measure` call has
   * already reported a throwing measurer (I11) and must not report it twice or
   * take the sequence with it. `null` means *keep the block whole*, which is
   * the answer a kind declaring no `window` gets anyway.
   */
  #formContained(block: Block, width: number): Form | null {
    try {
      return this.#form(block, width);
    } catch {
      return null;
    }
  }

  /**
   * The marker row a capped block ends with (C14 I24): `… 2,000 of 50,000 rows`
   * in `muted`, D40's shape (C13 I14) one axis over.
   *
   * **The mark is `truncate`'s own** — two cells cut to one yield exactly the
   * marker the capability allows, `…` or `~` (C04 §5) — rather than a second
   * literal for the mark scan to excuse. `en-GB` grouping as D40's notice.
   * Clamped to the width so this is one row at every width the measurer counted.
   */
  #marker(capped: Capped, width: number, ctx: RenderContext): ReactElement {
    const mark = truncate("..", 1, ctx.capabilities);
    const text =
      `${mark} ${capped.shown.toLocaleString("en-GB")} of ` +
      `${capped.total.toLocaleString("en-GB")} rows`;
    const style = tone("muted", ctx.theme, ctx.capabilities);
    return rows([paint(clampSpans([{ text, style }], width, ctx.capabilities))]);
  }

  measure = (block: Block, width: number): number => this.#measured(block, normaliseWidth(width)).rows;

  /**
   * A sequence's rows: the blocks' heights plus one per `gapBefore` (C04 §3a).
   *
   * The gap belongs to the sequence and never to the block, so this is the only
   * place the two arithmetics differ — and every composer, here and in L4, uses
   * this rather than adding spacing of its own (C23 §2). A composer that
   * inserted a row would make a document's height unknowable from the document.
   */
  measureSequence = (blocks: readonly Block[], width: number): number =>
    sequenceHeight(blocks, normaliseWidth(width), this.measure);

  /**
   * What one block offers to keyboard and pointer, `measureChild` supplied
   * (C26 §5, I8).
   *
   * **A kind with no `elements` is atomic and answers `[]`** — the same shape
   * `window`'s absence takes, and the reason `elements?` is optional rather
   * than a member every kind must implement with an empty body.
   *
   * Contained for `measure`'s reason (I11): an implementation that throws makes
   * its block atomic for this call rather than taking the caller with it. C26
   * I12 rules that explicitly — the alternative leaves focus pointing at
   * something unresolvable two components from the throw.
   *
   * **And atomic means the block, never the subtree** (I30). The ownership
   * question used to be a second call that read whether `elements` was
   * *declared*, so a container whose `elements` threw answered *no elements* and
   * *do not descend* at once — 0 elements against a control's 4, with `↓`
   * skipping the lot (F224). Both answers come out of `#elements` now, which is
   * why they cannot disagree rather than why they happen not to.
   */
  elementsOf = (block: Block, width: number): readonly NavElement[] =>
    this.#elements(block, normaliseWidth(width)).elements;

  /**
   * Every element in a **sequence**, block-local rows lifted into
   * sequence-local ones (C26 §5).
   *
   * **The recursion is the point, and its absence was a defect** (C26 §8b.5).
   * The three walks this replaces each iterated a document's top level and
   * stopped, so a `table` inside a `panel` could not be focused, moved through
   * or activated. `panel` and `group` hold arbitrary children, and the offsets
   * are exactly the ones `measureSequence` already computes — so recursing here
   * costs a line and inventing a second geometry to avoid it would have cost a
   * drift.
   *
   * `gapBefore` is counted here and never inside a block, for `windowSequence`'s
   * reason: the gap belongs to the run.
   */
  elementsIn = (
    blocks: readonly Block[],
    width: number,
  ): readonly Readonly<{ blockId: string; element: NavElement }>[] => {
    const w = normaliseWidth(width);
    const out: Readonly<{ blockId: string; element: NavElement }>[] = [];
    let row = 0; // cells-ok — a row cursor, not a width

    const walk = (seq: readonly Block[], atWidth: number): void => {
      for (const block of seq) {
        if (block.gapBefore === true) row += 1;
        const top = row;
        // **One call for both questions** (I30). Asking twice is what let the
        // two answers disagree.
        const own = this.#elements(block, atWidth);
        for (const element of own.elements) {
          out.push({
            blockId: block.id,
            element: Object.freeze({
              ...element,
              rows: Object.freeze({ from: top + element.rows.from, to: top + element.rows.to }),
            }),
          });
        }
        // **A container that declares its own elements owns them.** `panel` and
        // `group` declare none, so their children's are reached here; `scroll`
        // declares one element per child (C26 §4b cell 3), and descending past
        // it would emit each child twice and at the wrong coordinates — its
        // children are placed in content space, not in this walk's.
        //
        // So the question is asked of the **definition** rather than of a list
        // of kinds, which is the one form that stays right when a fourth
        // container arrives: whichever answer it gives, this walk follows it.
        if (hasChildren(block) && !own.owned) {
          const widths = childWidths(block, atWidth);
          const before = row;
          block.children.forEach((child, i) => {
            row = before;
            walk([child], widths[i] ?? 1);
          });
        }
        row = top + this.measure(block, atWidth);
      }
    };

    walk(blocks, w);
    return Object.freeze(out);
  };

  /**
   * Rows `[from, to)` of a sequence, as a smaller sequence plus an offset (I25).
   *
   * **The gap is the sequence's and never the block's** (C04 §3a), so it is
   * counted here: a `gapBefore` row belongs to the run and a driver that
   * windowed block by block and summed would be one row short per gap. That is
   * the defect `document-view.ts` had against `measure` and it would arrive
   * identically here.
   *
   * **A kind without `window` is kept whole**, and its rows are paid for out of
   * `skipRows`. That is what makes the seam optional rather than obligatory: an
   * atomic block inside a windowed run costs its full height in slack and the
   * caller still gets exactly the rows it asked for.
   */
  windowSequence = (
    blocks: readonly Block[],
    width: number,
    from: number,
    to: number,
  ): Readonly<{ blocks: readonly Block[]; skipRows: number }> => {
    const w = normaliseWidth(width);
    const lo = Math.max(0, Math.trunc(from));
    const hi = Math.max(lo, Math.trunc(to));

    const kept: Block[] = [];
    let skipRows = -1;
    let row = 0; // cells-ok — a row cursor, not a width

    for (const block of blocks) {
      const gap = block.gapBefore === true ? 1 : 0;
      const height = this.measure(block, w);
      const top = row + gap;
      const bottom = top + height;
      row = bottom;

      // Entirely above or entirely below the window, gap included.
      if (bottom <= lo || top - gap >= hi) continue;

      // **The capped form, and the window is taken over it** (C14 I25). A
      // window below the marker is the definition's window over the form with
      // `capped` stripped — byte-identical to the same range of the uncapped
      // block — and a window reaching the marker row carries the field onto the
      // piece. Both after the definition's window, never before: `patch`'s
      // builds a fresh block and would drop it, and a field a kind can lose is
      // not view state.
      const form = this.#formContained(block, w);
      // **The whole piece is the block itself unless it was capped** — the
      // caller's reference, not `#resolve`'s conversion of an unknown kind to
      // `raw`, so a block within the cap is handed back unchanged (C14 I24).
      // The definition's window is handed the resolved block, as before.
      const held = form === null || form.capped === null ? block : form.block;
      const source = form === null ? block : form.block;
      const capped = form === null ? null : form.capped;
      // **A block carrying a floor is kept whole** (C09 I33, C04 I68).
      //
      // The window's contract is an identity about rows the *definition* can
      // produce — `measure(w.block, w) − skipRows === to − from` (I26) — and a
      // floor's rows are the registry's padding, which no definition knows
      // about. Handing a `to` derived from the floored height to a `window` that
      // can only reach the definition's own rows breaks that identity from
      // outside the definition, where nothing would find it.
      //
      // Keeping it whole costs slack, which this function already pays for
      // every kind declaring no `window` at all — and a floored block is small
      // by construction, because the reason it has a floor is that it failed to
      // draw.
      const windowable = form === null || floorOf(block) > 0 ? undefined : form.definition.window;

      // The gap row, when the window opens on or above it, is kept by keeping
      // the block's own `gapBefore`; when the window opens *below* it the gap is
      // dropped with it, which is why the flag is rewritten rather than carried.
      const gapKept = gap === 1 && top - gap >= lo;
      const localFrom = Math.max(0, lo - top);
      const localTo = Math.min(height, hi - top);

      let piece: Block = held;
      let dropped = localFrom;
      if (windowable !== undefined && (localFrom > 0 || localTo < height)) {
        // The rows the definition can reach are the form's; the marker is the
        // registry's and sits at `contentRows`. A window over the marker alone
        // takes the last content row and charges it to `skipRows`, because no
        // kind's window returns zero rows (C11 I20).
        const contentRows = capped === null ? height : capped.shown;
        const reachesMarker = capped !== null && localTo > contentRows;
        const wFrom = Math.min(localFrom, Math.max(0, contentRows - 1));
        const wTo = Math.max(wFrom + 1, Math.min(localTo, contentRows));
        // **`this.measure` is the child seam** (C09 I26a), the same one
        // `#elements` hands over four members up: a kind whose unit boundaries
        // depend on a child's height — a table row's detail — cannot compute
        // them from `(block, width)` alone, and a window that guessed would
        // slice at the wrong row while I26's arithmetic still balanced.
        const out = windowable(stripCapped(source), w, wFrom, wTo, this.measure);
        piece = reachesMarker && capped !== null ? withCapped(out.block, capped) : stripCapped(out.block);
        dropped = out.skipRows + (localFrom - wFrom);
      }
      if (gapKept !== (block.gapBefore === true)) {
        piece = gapKept ? { ...piece, gapBefore: true } : stripGap(piece);
      }

      if (skipRows < 0) skipRows = dropped + (gapKept ? 0 : 0);
      kept.push(piece);
    }

    return Object.freeze({ blocks: Object.freeze(kept), skipRows: Math.max(0, skipRows) });
  };

  renderSequence = (blocks: readonly Block[], ctx: RenderContext): ReactElement => {
    const width = normaliseWidth(ctx.width);
    const children: ReactElement[] = [];

    blocks.forEach((block, index) => {
      if (block.gapBefore === true) {
        children.push(createElement(Text, { key: `gap-${index}` }, " "));
      }
      children.push(
        createElement(
          Box,
          { key: block.id === "" ? `block-${index}` : block.id, flexDirection: "column" },
          this.render(block, { ...ctx, width }),
        ),
      );
    });

    return createElement(Box, { flexDirection: "column", width }, children);
  };

  /**
   * The other half of C04's floor: the element, padded to it (I33).
   *
   * **`minHeight` and never `height`, and the difference was measured.** A box
   * with a fixed height holding more rows than it declares drops its **first**
   * row rather than its last — `["1","2","3","4"]` in a `height: 3` box renders
   * `["2","3","4"]` — and `overflowY: "hidden"` does not change it. So a bound
   * would silently behead a block that grew, which is F223's defect wearing the
   * mechanism built to prevent it. `minHeight` pads a short child and leaves a
   * tall one exactly as it was.
   *
   * With this and the `max` in `#measured`, I1 holds by construction: both
   * sides take the same number from the same field, so neither is trusted to
   * agree with the other.
   */
  #floored(block: Block, element: ReactElement): ReactElement {
    const floor = floorOf(block);
    if (floor === 0) return element;
    return createElement(Box, { flexDirection: "column", minHeight: floor }, element);
  }

  render = (block: Block, ctx: RenderContextInput): ReactElement => {
    const width = normaliseWidth(ctx.width);
    const childContext: RenderContext = {
      ...ctx,
      width,
      measureChild: this.measure,
      renderChild: (child: Block, childWidth: number): ReactElement =>
        this.render(child, { ...ctx, width: childWidth }),
    };

    // **The height is committed before anything is drawn** (I11). One extra
    // `measure` per render, and the two reasons it is affordable are that L4
    // caches rendered lines per entry (C22 I58) so this is not a per-frame cost,
    // and that `windowSequence` has already measured the same blocks on the way
    // here. The alternative — measuring only inside the catch — cannot see a
    // *measurer* that gave way while the renderer succeeded, which is the case
    // that drew a fifth of a figure and said nothing.
    const committed = this.#measured(block, width, childContext.capabilities);

    if (!committed.ok) {
      // A definition that threw in either half renders the error block (I11).
      // Truncating a good render to the fallback height is the same failure one
      // level down: 4 of 5 rows dropped, in silence (F223).
      return this.#floored(
        block,
        this.#errorBlock(Registry.#errorText(block, "measure", undefined), committed.rows, childContext),
      );
    }

    try {
      // **The capped form, and the marker beneath it** (C14 I24). The same
      // form `#measured` counted one row for, drawn from the same fields, so the
      // frame and the height agree by construction rather than by agreement.
      const form = this.#form(block, width);
      const drawn = form.definition.render(form.block, childContext);
      const element =
        form.capped === null
          ? drawn
          : createElement(
              Box,
              { flexDirection: "column" },
              drawn,
              this.#marker(form.capped, width, childContext),
            );
      return this.#floored(block, element);
    } catch (error) {
      // I11 — a throwing renderer is contained to its block, **and the
      // containment includes the row count**. The rest of the frame is
      // unaffected in position as well as in content, and the block says what
      // happened rather than vanishing.
      // **The text first, because the number rides on it** (I34). The rows this
      // fault asks for are a function of exactly this string at exactly this
      // width, and the box below is drawn from the same one — so they are
      // computed together rather than written twice.
      const text = Registry.#errorText(block, "render", error);
      this.#report(
        block,
        "render",
        error,
        statusRowsFor(errorStatus(text, 1), width, childContext.capabilities),
      );
      return this.#floored(block, this.#errorBlock(text, committed.rows, childContext));
    }
  };
}

/**
 * The registry, with the fourteen default kinds unless asked otherwise.
 *
 * `table`, `plot` and `patch` are **not** here. They register from C11, C12 and
 * C25 through this same public `register`, exactly as an app-defined kind
 * would, which is what proves the extension mechanism rather than privileging
 * it (§3). Three components rather than one matters: a single privileged
 * exception is indistinguishable from a special case.
 */
export function createBlockRegistry(
  opts: Readonly<{
    defaults?: boolean;
    onError?: (fault: BlockFault) => void;
    /** The most rows one block may occupy (C14 I24, §2b). Default `DEFAULT_MAX_BLOCK_ROWS`. */
    maxBlockRows?: number;
  }> = {},
): BlockRegistry {
  return new Registry(
    opts.defaults === false ? [] : DEFAULT_DEFINITIONS,
    // **Silence is the default and the harness opts in** (I29). Loud by default
    // would make every existing containment test a failure, which is a fact
    // about those tests and not about a consumer's registry; the shell passes
    // one, and `test/support/render.ts` passes one that throws.
    opts.onError ?? ((): void => undefined),
    opts.maxBlockRows ?? DEFAULT_MAX_BLOCK_ROWS,
  );
}

/**
 * C04's floor, as a non-negative integer (C04 I67, C09 I33).
 *
 * **Read here and by no definition**, which is the whole of why the field is
 * safe: `definition.measure` stays a function of `(block, width)` so I2 holds,
 * and `scrollDefinition.measure` cannot consult it even by accident, so C04
 * §3c's argument that a bounded box never depends on view state is not
 * reopened by the mechanism added two components away.
 *
 * Total, because `measure` is: a malformed floor on a document that reached
 * here anyway is treated as none rather than throwing at frame cadence.
 */
/**
 * The `status` block a containment draws, and **the one the fitter measures.**
 *
 * One constructor for both, because the height a fault asks for is computed from
 * this block and the box that arrives is drawn from it: two literals would let
 * the request fit a message the frame does not show, and every count would agree
 * (C09 I34).
 */
function errorStatus(text: string, height: number): Status {
  return { kind: "status", id: "status", state: "error", message: text, height } as Status;
}

function floorOf(block: Block): number {
  const held = (block as { minHeight?: unknown }).minHeight;
  return typeof held === "number" && Number.isInteger(held) && held > 0 ? held : 0;
}

/** A block without its `gapBefore`, so a dropped gap row is genuinely dropped. */
function stripGap(block: Block): Block {
  const { gapBefore: _gapBefore, ...rest } = block as Block & { gapBefore?: boolean };
  return rest as Block;
}
