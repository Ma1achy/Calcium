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
import type {
  BlockDefinition,
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
  #sealed = false;

  constructor(definitions: readonly BlockDefinition[]) {
    for (const definition of definitions) this.#definitions.set(definition.kind, definition);
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

  measure = (block: Block, width: number): number => {
    const w = normaliseWidth(width);
    try {
      const resolved = this.#resolve(block);
      return resolved.definition.measure(resolved.block, w, this.measure);
    } catch {
      // I11 — a throwing measurer is contained and the block treated as one
      // row. This protects virtualisation: C14 sums measured heights without
      // rendering, so a measurer that throws would take the viewport with it
      // (T3.14). Compute, so no retry (A02 §7 rule 2).
      return 1;
    }
  };

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
   */
  elementsOf = (block: Block, width: number): readonly NavElement[] => {
    const w = normaliseWidth(width);
    try {
      const resolved = this.#resolve(block);
      const declared = resolved.definition.elements;
      if (declared === undefined) return EMPTY_ELEMENTS;
      return declared(resolved.block, w, this.measure);
    } catch {
      return EMPTY_ELEMENTS;
    }
  };

  /** Does this block's definition answer `elements` itself? (C26 §4b cell 3.) */
  #ownsElements(block: Block): boolean {
    try {
      return this.#resolve(block).definition.elements !== undefined;
    } catch {
      return false;
    }
  }

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
        for (const element of this.elementsOf(block, atWidth)) {
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
        if (hasChildren(block) && !this.#ownsElements(block)) {
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
      const windowable = resolved.definition.window;

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

  render = (block: Block, ctx: RenderContextInput): ReactElement => {
    const width = normaliseWidth(ctx.width);
    const childContext: RenderContext = {
      ...ctx,
      width,
      measureChild: this.measure,
      renderChild: (child: Block, childWidth: number): ReactElement =>
        this.render(child, { ...ctx, width: childWidth }),
    };

    try {
      const resolved = this.#resolve(block);
      return resolved.definition.render(resolved.block, childContext);
    } catch (error) {
      // I11 — a throwing renderer is contained to its block. The rest of the
      // frame is unaffected, and the block says what happened rather than
      // vanishing, which is the difference between a visible fault and a
      // document that quietly renders short.
      const message = error instanceof Error ? error.message : String(error);
      return rows([
        paint([
          {
            text: `[${block.kind} failed to render: ${message}]`.slice(0, width), // cells-ok
            style: tone("error", childContext.theme, childContext.capabilities),
          },
        ]),
      ]);
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
export function createBlockRegistry(opts: { defaults?: boolean } = {}): BlockRegistry {
  return new Registry(opts.defaults === false ? [] : DEFAULT_DEFINITIONS);
}

/** A block without its `gapBefore`, so a dropped gap row is genuinely dropped. */
function stripGap(block: Block): Block {
  const { gapBefore: _gapBefore, ...rest } = block as Block & { gapBefore?: boolean };
  return rest as Block;
}
