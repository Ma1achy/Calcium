/**
 * C09 §2 — the registry's vocabulary.
 *
 * `Measure` comes from C04, which owns the measurement contract; C09 owns the
 * implementations that satisfy it and the registry that pairs each with a
 * renderer (C09 §1).
 */
import type { ReactElement } from "react";
import type { Action, Block, Measure, MeasureFn } from "../../data/viewmodel/index.js";
import type { ResolvedTheme } from "../theme/index.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";

/** Which block, and which row within it, currently holds focus. */
export type FocusState = Readonly<{
  blockId: string;
  /** null — the block itself is focused, rather than a row inside it. */
  rowId: string | null;
}>;

/**
 * Everything a renderer may read. Nothing else: no environment (I3), no clock
 * (A03 SS1), no theme lookup of its own.
 *
 * `measureChild` and `renderChild` are A02 Seam 1 on the render side — the
 * registry passes itself for both, so a container composes children whose kind
 * it does not know without importing the registry (I7).
 */
export type RenderContext = Readonly<{
  width: number;
  theme: ResolvedTheme;
  capabilities: TerminalCapabilities;
  focus: FocusState | null;
  /**
   * A monotonic counter, incremented by C03's spinner commit. A renderer
   * computes `frames[tick % frames.length]`; nothing else reads it, and
   * `measure` never receives it at all (I8) — animation changes appearance,
   * never geometry.
   */
  tick: number;
  onAction: (action: Action) => void;
  measureChild: MeasureFn;
  renderChild: (block: Block, width: number) => ReactElement;
}>;

/**
 * What a *caller* of the registry supplies — everything a renderer may read
 * except the two fields the registry owns.
 *
 * **The registry overwrites `measureChild` and `renderChild` unconditionally**
 * (`registry.ts`, `{ ...ctx, measureChild: this.measure, renderChild: … }`), so
 * a caller's values were discarded on every call. The type demanded them anyway,
 * and the only way to satisfy it was to write something untrue: `render-lines.ts`
 * supplied `registry.measure` for one and a stub that **throws if called** for
 * the other, with a comment explaining that the registry replaces both and *"a
 * caller should not have to know that."*
 *
 * **The fix is a narrower type, not a wider one.** Making them optional would
 * leave them discarded; removing them from the construction boundary means
 * supplying one fails to compile rather than failing to matter. Second instance
 * of F58b's shape — an adapter computes ten `meta` fields and the registry
 * honours three — which is what says it generalises past one surface.
 * FINDINGS F85.
 */
export type RenderContextInput = Omit<RenderContext, "measureChild" | "renderChild">;

/**
 * A block reduced to a smaller one, plus the leading rows of it the caller drops
 * (C09 §2a, I25).
 *
 * **The offset is what makes exactness possible**, not a convenience. A window
 * that had to be a slice on the nose could not express an indivisible run of
 * changed lines (C25 I19) or a sticky header (C25 I18) without either inventing
 * a row C14 never measured or hiding one the reader asked for.
 *
 * **`block` is `Block` and not `B`, and the type cannot say what the spec says.**
 * I25 requires a window to be a block *of the same kind*, and expressing that
 * puts `B` in return position — which makes `BlockDefinition<B>` invariant, and
 * every `BlockDefinition<Table>` in the tree stops being assignable to the
 * `BlockDefinition` the registry stores. TypeScript then infers `never` and the
 * error surfaces in the *consumer's* test file rather than at the declaration,
 * which is how this was found. The same-kind rule is a contract held by I26 and
 * the conformance suite, not by the compiler; saying so here is better than a
 * variance fight that would move the cost onto every kind.
 */
export type Windowed = Readonly<{
  block: Block;
  skipRows: number;
}>;

/**
 * What `↓` does at the edge of a thing, and what `Esc` does inside it (C26 §4).
 *
 * A closed vocabulary rather than a callback, so a policy can be resolved
 * global → kind → per-element without a conditional in any handler — the shape
 * C10's theme resolution and C05's manifest merge already have.
 *
 * **Declared here rather than in C26, and the reason is the layer.** `elements`
 * hangs off `BlockDefinition`, which is L1; C26 is L3. A block declaring its
 * policy cannot import the component that reads it, so the vocabulary lives with
 * the declaration and C26 reads down. Same direction as `focusableRowIds`, which
 * C16 already imports from C11 for exactly this reason (C11 I14).
 */
/**
 * One thing focus can be on, and the **single** declaration both keyboard and
 * pointer read (C26 §5, I8).
 *
 * The keyboard walks the list; the pointer searches it. Two mechanisms agreeing
 * is not the same as one mechanism, and the roadmap's constraint on the mouse
 * work is *one source, or they will disagree*.
 *
 * `rows` and `cols` are **block-local and half-open**, `[from, to)`, so a caller
 * that knows where the block starts knows where the element is without the block
 * knowing where it was placed.
 */
export type NavElement = Readonly<{
  /**
   * Unique within the block's own declaration (C26 I6).
   *
   * **Not a row id, and that is the point.** `liveRows` concatenated row ids
   * across every table in an entry and `focusFor` resolved to the first block
   * holding one, so two tables each carrying `r1` drew the highlight on the
   * wrong one. An element is addressed inside a declaration that knows which
   * block produced it, so there is no flat namespace to collide in (C26 §8b.6).
   */
  id: string;
  level: "block" | "row" | "cell";
  /** Block-local row range, `[from, to)`. */
  rows: Readonly<{ from: number; to: number }>;
  /** Column range, `[from, to)`. */
  cols: Readonly<{ from: number; to: number }>;
  /**
   * What `⏎` does here, when the element is more than a place to stand.
   *
   * **`arrow` and `escape` are not here yet, and MG24 is why.** C26 §5 draws
   * them on `NavElement`, and landing them before C26 §4's resolution exists
   * would publish two fields with no reader — which is F21's shape exactly:
   * `TableRow.actions` existed, the spec said C11 "surfaces its actions", and
   * no code read the field. *The fifth of specified, agreed and structurally
   * absent, and the worst hidden — the other four were missing values or missing
   * verbs, and this one was a field that existed, so nothing looked.*
   *
   * They arrive with the resolution that reads them (C26 I15), in the commit
   * that gives them a consumer.
   */
  activate?: Action;
  /**
   * What `y` copies here — the element's **source**, never its rendering (C26 §5c).
   *
   * **Declared by the block, and that is the whole of semantic copy.** The
   * painted cells are a rendering: columns are dropped at narrow widths, values
   * are truncated with an ellipsis, and a marker column carries a glyph nobody
   * typed. A copy taken from them is *what is on screen*, which passes every
   * assertion about what is on screen and is wrong about exactly the thing this
   * exists for.
   *
   * So the declarer supplies it from the data it was given: `tableElements`
   * joins **every declared column's** `cell.text`, including the ones this width
   * dropped. That is what a raw terminal cannot offer.
   *
   * Optional, because an element may be a place to stand and nothing more —
   * `activate`'s reason, and the same shape.
   */
  copy?: string;
}>;

export interface BlockDefinition<B extends Block = Block> {
  kind: string;
  measure: Measure<B>;
  render: (block: B, ctx: RenderContext) => ReactElement;
  /**
   * A valid smaller block covering rows `[from, to)` of this one (I25, I26).
   *
   * **Optional, and a kind that does not divide omits it** — that is how `plot`
   * is atomic (I27, C12 I1), because an absent member cannot be deleted by a
   * later edit while a branch returning the block unchanged can.
   *
   * The contract is one line and it is checked generically:
   * `measure(result.block, width) − result.skipRows === to − from`.
   */
  window?: (block: B, width: number, from: number, to: number) => Windowed;
  /**
   * What this block offers to keyboard and pointer (C26 §5, I3).
   *
   * **Optional on `window?`'s argument above, and it is the same decision rather
   * than a second one that agrees**: an absent member cannot be deleted by a
   * later edit while a branch returning `[]` can. A kind that is a single
   * indivisible thing omits it and is atomic, exactly as `plot` is unwindowable.
   *
   * **`measureChild`, because the positions are not a function of `(block,
   * width)` alone** (C26 §8b.3). A table row's offset is
   * `header + Σ(1 + detailHeight(row))` and `detailHeight` measures the expanded
   * detail — so without the seam an implementation would guess, and a guessed
   * position is a pointer landing on the wrong row. Same seam `measure` takes
   * (A02 Seam 1), supplied by the registry so a kind cannot reach for its own.
   *
   * **Never receives focus, and that is a guarantee rather than a rule.** C11
   * I14 puts focus in C16; a geometry that varied with it would move without
   * `rev` moving and C14's cache could not invalidate it. Focus is not a
   * parameter here, so the violation is unrepresentable rather than forbidden.
   */
  elements?: (block: B, width: number, measureChild: MeasureFn) => readonly NavElement[];
}

export interface BlockRegistry {
  register(definition: BlockDefinition): void;
  get(kind: string): BlockDefinition | undefined;
  seal(): void;
  measure(block: Block, width: number): number;
  render(block: Block, ctx: RenderContextInput): ReactElement;
  /** A run of blocks laid out down the screen, `gapBefore` included (C04 §3a). */
  measureSequence(blocks: readonly Block[], width: number): number;
  /**
   * What one block offers to keyboard and pointer; `[]` for an atomic kind
   * (C26 §5). `measureChild` is supplied here, never by the caller.
   */
  elementsOf(block: Block, width: number): readonly NavElement[];
  /**
   * Every element in a sequence, with block-local rows lifted into
   * sequence-local ones and **children walked** (C26 §5, §8b.5).
   *
   * The pairing with `blockId` is what C09 I14's renderer needs and what stops
   * two blocks' element ids sharing one namespace.
   */
  elementsIn(
    blocks: readonly Block[],
    width: number,
  ): readonly Readonly<{ blockId: string; element: NavElement }>[];
  /**
   * Rows `[from, to)` of a *sequence*, as a smaller sequence plus an offset
   * (C09 §2a, I25).
   *
   * The sequence form is where `gapBefore` is applied, so it is where a window
   * over a document's top level has to be taken: a driver that windowed block by
   * block and summed would be short by one row per gap, which is the defect
   * `document-view.ts` already had once against `measure` (C04 §3a).
   */
  windowSequence(
    blocks: readonly Block[],
    width: number,
    from: number,
    to: number,
  ): Readonly<{ blocks: readonly Block[]; skipRows: number }>;
  renderSequence(blocks: readonly Block[], ctx: RenderContextInput): ReactElement;
  readonly kinds: readonly string[];
  readonly sealed: boolean;
}
