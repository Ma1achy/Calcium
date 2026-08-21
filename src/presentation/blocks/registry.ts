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
import type { Block } from "../../data/viewmodel/index.js";
import { DEFAULT_DEFINITIONS } from "./defaults.js";
import { paint, rows, tone } from "./paint.js";
import { statusDefinition } from "./kinds/status.js";
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
  #sealed = false;

  constructor(definitions: readonly BlockDefinition[], onError: (fault: BlockFault) => void) {
    for (const definition of definitions) this.#definitions.set(definition.kind, definition);
    this.#onError = onError;
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
  #report(block: Block, member: BlockFault["member"], error: unknown): void {
    this.#onError(Object.freeze({ kind: block.kind, id: block.id, member, error }));
  }

  /**
   * `measure`, contained — and whether it gave way, which the error path needs
   * and the public member throws away.
   */
  #measured(block: Block, width: number): Measured {
    // **The floor is C04's and applying it is this function's** (I33, C04 I67).
    // In both arms rather than only the successful one: a floor is about the
    // block, not about which half of its definition gave way, and a measurer
    // that threw is exactly the case where the rows are most needed.
    const floor = floorOf(block);
    try {
      const resolved = this.#resolve(block);
      const rows = resolved.definition.measure(resolved.block, width, this.measure);
      return { ok: true, rows: Math.max(rows, floor) };
    } catch (error) {
      // I11 — a throwing measurer is contained and the block treated as one
      // row. This protects virtualisation: C14 sums measured heights without
      // rendering, so a measurer that throws would take the viewport with it
      // (T3.14). Compute, so no retry (A02 §7 rule 2).
      this.#report(block, "measure", error);
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
    return statusDefinition.render(
      { kind: "status", id: "status", state: "error", message: text, height },
      ctx,
    );
  }

  /**
   * A block's elements **and** whether its definition owns them — one call,
   * because they are one answer (I30, C26 I12).
   */
  #elements(block: Block, width: number): Resolved {
    try {
      const resolved = this.#resolve(block);
      const declared = resolved.definition.elements;
      if (declared === undefined) return NO_ELEMENTS;
      return { elements: declared(resolved.block, width, this.measure), owned: true };
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

      const resolved = this.#resolve(block);
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
      const windowable = floorOf(block) > 0 ? undefined : resolved.definition.window;

      // The gap row, when the window opens on or above it, is kept by keeping
      // the block's own `gapBefore`; when the window opens *below* it the gap is
      // dropped with it, which is why the flag is rewritten rather than carried.
      const gapKept = gap === 1 && top - gap >= lo;
      const localFrom = Math.max(0, lo - top);
      const localTo = Math.min(height, hi - top);

      let piece: Block = block;
      let dropped = localFrom;
      if (windowable !== undefined && (localFrom > 0 || localTo < height)) {
        const out = windowable(resolved.block, w, localFrom, localTo);
        piece = out.block;
        dropped = out.skipRows;
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
    const committed = this.#measured(block, width);

    if (!committed.ok) {
      // A definition that threw in either half renders the error block (I11).
      // Truncating a good render to the fallback height is the same failure one
      // level down: 4 of 5 rows dropped, in silence (F223).
      return this.#floored(
        block,
        this.#errorBlock(`${block.kind} failed to measure`, committed.rows, childContext),
      );
    }

    try {
      const resolved = this.#resolve(block);
      return this.#floored(block, resolved.definition.render(resolved.block, childContext));
    } catch (error) {
      // I11 — a throwing renderer is contained to its block, **and the
      // containment includes the row count**. The rest of the frame is
      // unaffected in position as well as in content, and the block says what
      // happened rather than vanishing.
      this.#report(block, "render", error);
      const message = error instanceof Error ? error.message : String(error);
      return this.#floored(
        block,
        this.#errorBlock(`${block.kind} failed to render: ${message}`, committed.rows, childContext),
      );
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
  opts: Readonly<{ defaults?: boolean; onError?: (fault: BlockFault) => void }> = {},
): BlockRegistry {
  return new Registry(
    opts.defaults === false ? [] : DEFAULT_DEFINITIONS,
    // **Silence is the default and the harness opts in** (I29). Loud by default
    // would make every existing containment test a failure, which is a fact
    // about those tests and not about a consumer's registry; the shell passes
    // one, and `test/support/render.ts` passes one that throws.
    opts.onError ?? ((): void => undefined),
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
function floorOf(block: Block): number {
  const held = (block as { minHeight?: unknown }).minHeight;
  return typeof held === "number" && Number.isInteger(held) && held > 0 ? held : 0;
}

/** A block without its `gapBefore`, so a dropped gap row is genuinely dropped. */
function stripGap(block: Block): Block {
  const { gapBefore: _gapBefore, ...rest } = block as Block & { gapBefore?: boolean };
  return rest as Block;
}
