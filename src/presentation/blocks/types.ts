/**
 * C09 §2 — the registry's vocabulary.
 *
 * `Measure` comes from C04, which owns the measurement contract; C09 owns the
 * implementations that satisfy it and the registry that pairs each with a
 * renderer (C09 §1).
 */
import type { ReactElement } from "react";
import type { Action, Block, Camera, Measure, MeasureFn, WidthFn } from "../../data/viewmodel/index.js";
import type { ResolvedTheme } from "../theme/index.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";

/** Which block, and which row within it, currently holds focus. */
/**
 * What one of the registry's containments swallowed (I29).
 *
 * **The kind is the document's, not the fallback's.** An unregistered kind
 * resolves through `raw` (I10), so reporting the resolved kind would name `raw`
 * for a fault in someone else's block and send the reader to the wrong file.
 *
 * `error` is `unknown` rather than `Error` because `throw` takes anything, and a
 * sink that assumed otherwise would itself throw on the one input it exists to
 * describe.
 */
export type BlockFault = Readonly<{
  kind: string;
  /**
   * **Which block, and it was missing** (C22 I69).
   *
   * A fault carrying only the kind is enough to write a diagnostic and not
   * enough to *act* — the shell that wants to reserve rows for a block whose
   * renderer gave way has to address it, and `ViewPatch` addresses by id. The
   * kind cannot stand in: a document can hold three `plot`s.
   *
   * Ids are unique within a document (C04 I14) and **not across entries**, so
   * this half of the address is the caller's: whoever is rendering an entry
   * knows which one, and the fault does not.
   */
  id: string;
  /** Which half gave way. Three, and the fourth was folded into `elements` (I30). */
  member: "measure" | "render" | "elements" | "width";
  /**
   * The rows the error box needs for the text it is about to draw (I34, C22 I69).
   *
   * **Computed here because this is the only place that can.** The number is a
   * function of the message *and* the width, and the containment holds both: it
   * is one line above the `#errorBlock` call that draws them. The shell drains
   * the request after the frame has returned — deliberately, so the frame stays
   * single-pass — and by then the width is gone.
   *
   * It replaced a constant the shell imported from this component. A floor that
   * is the same three rows whatever the box has to say is a floor that cuts, and
   * cut in silence at every height rather than only at a cap (F230's class, one
   * level down).
   *
   * Zero for `elements`, which costs no rows: it makes a block atomic for
   * keyboard and pointer (I30) and changes nothing about the frame.
   */
  rows: number;
  error: unknown;
}>;

export type FocusState = Readonly<{
  blockId: string;
  /** null — the block itself is focused, rather than a row inside it. */
  rowId: string | null;
  /**
   * The selection's extent (C26 I16), as pairs over the **entry's** element
   * list — head included — and **absent when the extent is the head alone**.
   *
   * Pairs and not row ids, because a selection runs over the entry's list and
   * a list can cross blocks: a table and a `pills` in one entry share one
   * extent, and each renderer keeps the pairs naming itself. So a block that
   * does not hold the head still learns which of its rows are selected, from
   * the same value, in one pass (C11 I14).
   *
   * Absence is the sentinel rather than `[]`, on `scrollOffsets`' rule: the
   * head-alone extent and no selection draw identically — the head is painted
   * as the head — so a field that distinguished them would put two keys on one
   * appearance (`focusKey`'s own warning, C22 I58). The store's sentinel is
   * `anchor: null`; this is the render side of the same measurement (C26 §5c).
   */
  selected?: readonly Readonly<{ blockId: string; rowId: string }>[];
}>;

/**
 * Everything a renderer may read. Nothing else: no environment (I3), no clock
 * (A03 SS1), no theme lookup of its own.
 *
 * `measureChild` and `renderChild` are A02 Seam 1 on the render side — the
 * registry passes itself for both, so a container composes children whose kind
 * it does not know without importing the registry (I7).
 */
/**
 * A caller-owned store for derived work, keyed on an object the caller holds.
 *
 * Structural on purpose: the implementation is L4's and this layer only needs
 * to name the two calls. See `RenderContext.scratch` for what it is for and why
 * a renderer writing to it does not violate C12 I11.
 */
export type RenderScratch = Readonly<{
  /** What is held for `owner`, or `undefined` if the slot is empty or holds another `key`. */
  get: (owner: object, key: string) => unknown;
  /** Overwrite `owner`'s one slot. Never called before the value exists (C12 §6o row 8). */
  set: (owner: object, key: string, value: unknown) => void;
}>;

export type RenderContext = Readonly<{
  width: number;
  theme: ResolvedTheme;
  capabilities: TerminalCapabilities;
  /**
   * Scroll offsets by block id, in **rows** (C04 I48).
   *
   * **View state, arriving the way focus does** — a record the container looks
   * itself up in rather than a value threaded down the tree. Rows and not an
   * element index, so a resize re-interprets it and a reader who scrolled
   * halfway stays halfway (C04 §3c trace 4).
   *
   * Absent is zero. It is clamped where it is read and never corrected where it
   * is written, because a store fixed up on every patch is one that accumulates
   * (C23 I47).
   */
  scrollOffsets?: Readonly<Record<string, number>>;
  /**
   * The cursor's index into the data, per plot block id (C12 I37).
   *
   * **Written by L4's `CursorPositions`** (`shell/cursor-positions.ts`, C22
   * I76) from `←`/`→` on a focused plot (C16 I28); read by C12, which draws
   * the crosshair and owns nothing about who moves it. Absent is no crosshair.
   */
  cursorPositions?: Readonly<Record<string, number>>;
  /**
   * The live camera of each 3D plot, by block id (C12 I83, C22 I71).
   *
   * **A record and not a value, and the reason is a document rather than a
   * plot.** Two 3D plots can sit in one document — a loss landscape beside its
   * parameter sweep — and a camera threaded down the tree as a scalar would give
   * them one view, so orbiting either would turn both. `scrollOffsets`' shape,
   * and `scrollOffsets`' reason: a record the container looks itself up in.
   *
   * **Absent is the block's own** `camera`, completed from `CAMERA_DEFAULT`.
   *
   * **This field arrived with its writer, and `cursorPositions` is why.** That
   * one was read here and written by nothing in `src/` — a complete mechanism
   * with nothing on the other side (C12 §3s) — until C22 I76 gave it a writer
   * (`shell/cursor-positions.ts`). This arrives with `Cameras` in `shell/`, a
   * binding that moves it and the render key's sixth axis, because a context
   * field with no writer is correct, complete and unobservable at once.
   */
  cameras?: Readonly<Record<string, Camera>>;
  /**
   * The frame each animated image is showing, by block id (C04 I93, C22 I77).
   *
   * **Written by L4's `Frames`** (`shell/frames.ts`) on the animation wake,
   * read by the image block's rasterising arms, which draw `frames[index]`
   * and never advance anything. Absent is frame 0, which is what a still is
   * always on — so a renderer reads `?? 0` and a PNG never notices the field.
   * `measure` does not receive it (I8): every frame shares the logical
   * screen, so the frame is appearance and never geometry.
   */
  frames?: Readonly<Record<string, number>>;
  /**
   * The reader's overrides of `Series.hidden`, by plot block id and then by
   * series index (C04 I99, C12 I116, C22 I78).
   *
   * **Written by L4's `SeriesVisibility`** (`shell/series-visibility.ts`) from
   * the plot's own digit keymap; read by C12, which asks `seriesHidden` and
   * owns nothing about who toggles it. An explicit boolean per index rather
   * than a set, because *shown* has to be able to override a producer's
   * *hidden*. Absent is the block's own member. `measure` never receives it
   * (I8): a hidden series still holds its rows.
   *
   * **Arrived with its writer and its key axis in one commit**, on C22 I71's
   * rule and `cursorPositions`' counter-example two fields up.
   */
  seriesVisibility?: Readonly<Record<string, Readonly<Record<number, boolean>>>>;
  /**
   * Caller-owned scratch for work a renderer would otherwise repeat (C12 I107).
   *
   * **An input, which is what keeps I11 satisfied.** C12 I11 forbids state that
   * *survives* a render and permits a local; the distinction it draws is
   * ownership, not lifetime. A renderer that writes here keeps nothing — the
   * store is the caller's, arriving the way `cameras` does — while a
   * module-level `WeakMap` is exactly the forbidden thing and is the tempting
   * version of this.
   *
   * **Keyed on an object the caller already holds**, so eviction is the garbage
   * collector's and nothing subscribes. `owner` is the payload a renderer's
   * result is derived from — C12 passes a surface's `faces` array — and `key`
   * discriminates everything else the derivation reads. **One slot per owner**:
   * `HeightCache`'s rule and its reason, since read as a composite key this
   * describes a table with one slot per revision.
   *
   * **`unknown` because this layer cannot know what a renderer stores**, and
   * the alternative — importing C12's `Tri3` into C09's context type — is an
   * edge from `blocks/` into `plot/` where the reverse already exists.
   *
   * **Absent is a miss, and a field with no writer is unobservable** (§3s):
   * `cursorPositions` two fields up was that counter-example — read here and
   * written by nothing in `src/`, correct, complete and inert at once — until
   * C22 I76 gave it a writer (`shell/cursor-positions.ts`). The L4 writer for
   * this lands with it or neither does.
   */
  scratch?: RenderScratch;
  focus: FocusState | null;
  /**
   * A monotonic counter, incremented by C03's spinner commit. A renderer
   * computes `frames[tick % frames.length]`; nothing else reads it, and
   * `measure` never receives it at all (I8) — animation changes appearance,
   * never geometry.
   */
  tick: number;
  /*
   * **No `onAction`.** A required `(action: Action) => void` sat here for the
   * life of the project, and the measurement is F85's shape: no renderer under
   * `kinds/` read it, the only writers were two no-op defaults in
   * `render-lines.ts`, and both product call sites (`shell/paint.ts`,
   * `shell/composite.ts`) omitted it. The route an action takes is
   * `KeyDeps.onAction → pipeline.onAction` (C23 I37); the context was never on
   * it. A required member with no reader is a value every caller must invent
   * (F58b), so it is removed rather than made optional — supplying one now fails
   * to compile rather than failing to matter (C09 §2, C23 §3a). 2026-09-03.
   */
  measureChild: MeasureFn;
  /** The registry's `width` (§2c) — a container asks a child's content width through this and never imports the registry. */
  widthChild: WidthFn;
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
export type RenderContextInput = Omit<RenderContext, "measureChild" | "widthChild" | "renderChild">;

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
  /**
   * The **trailing** rows of it the caller drops (I26).
   *
   * **Slack falls at both ends and only one end had a name.** `skipRows` was
   * sufficient for the kinds that took the seam first: `patch`'s slack is a path
   * header and a hunk header, which lead, and `logs` and `keyValue` have units
   * of one row and cannot overhang at all. `table` is the first kind whose last
   * unit can hang past `to` — a range ending inside an expanded row gets the
   * whole row — and both ends of a table can be asked for alone, where the
   * header case puts its surplus after the header (F428).
   *
   * **Required rather than optional, and that is the point.** A default of zero
   * would let the next kind not think about it, which is exactly how the first
   * four did not: the whole finding is that nobody had considered the trailing
   * end. Four call sites is the cost of making it a question.
   *
   * **It names a drop the consumer already makes.** `session.ts` renders the
   * window and writes `rows.slice(0, ve.takeRows)`, so trailing rows past the
   * viewport's own count have been discarded on every frame since the seam
   * landed. The alternative was relaxing I26 to `≥`, and containment is
   * satisfied by every wrong answer inside the bounds.
   */
  dropRows: number;
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
  /**
   * What the rendering **could not show** of this element, shown beside it as
   * C15's peek while it holds focus (C15 §2a, C26 §5).
   *
   * **Source, like `copy`, and for the same reason**: the painted cells are a
   * rendering, and the things a rendering loses — a dropped column, a cell cut
   * with an ellipsis — are exactly what a reader hovering a row wants. So the
   * declarer supplies it from the data it was given: `tableElements` lists the
   * columns this width dropped and the cells it truncated, label against full
   * text, as a `keyValue`. Measured before it was built: 13 of 20 corpus tables
   * cut something at 80 columns, 50 of 80 rows, docker's real `/ps` among them.
   *
   * **Absent when nothing was cut**, so a row that fits declares no detail and
   * no peek appears — a peek saying *nothing to add* is furniture over a row
   * the reader could already read. A block, not a string, so a producer's own
   * detail (a chip's, a panel's) is themed and measured like everything else.
   * Shown on key and on the click that focuses alike; hover is not reachable at
   * mouse mode 1002 and is recorded under `MOUSE_ANY_EVENT` rather than built.
   */
  detail?: Block;
}>;

/**
 * One key a block binds while it holds focus (A01 D4, C16 I27).
 *
 * **L1's spelling of C16's `BlockKeymap` element**, structurally identical and
 * declared here because imports go down: a block definition cannot name a type
 * in `interaction/`. L4 hands the array to `Keymap.mergeBlock` unchanged.
 */
export type BlockKeyBinding = Readonly<{
  key: Readonly<{ name: string; ctrl?: boolean; meta?: boolean; shift?: boolean }>;
  action: string;
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
   * `measure(result.block, width) − result.skipRows − result.dropRows === to − from`.
   *
   * **`measureChild`, and the argument for it was already written one member
   * below** (I26a). A table row's offset is `header + Σ(1 + detailHeight(row))`
   * and `detailHeight` measures the expanded detail through the child seam, so
   * the unit boundaries are not a function of `(block, width)` alone. `logs`,
   * `patch` and `keyValue` have units of one row and never needed it, which is
   * why nothing connected the two — and `table` could not divide for want of a
   * parameter rather than for want of a rule (F428).
   */
  window?: (
    block: B,
    width: number,
    from: number,
    to: number,
    measureChild: MeasureFn,
  ) => Windowed;
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
  /**
   * The keys this block binds while focus is on it (A01 D4, C16 I27, C22 I78).
   *
   * **Optional on `elements?`'s argument, and it is the same decision**: an
   * absent member cannot be deleted by a later edit while a branch returning
   * `[]` can, so a kind with no keys omits it. **The block and nothing else** —
   * no width, no context — because a key table that varied with the frame would
   * be one a reader could not learn. L4 merges it when focus lands on the block
   * and withdraws it when focus leaves; a key `global` or `liveBlock` already
   * binds lands at `interaction` (C16 I27) and the rest at `liveBlock`.
   *
   * The first producer is `plot`'s digits (C12 I116).
   */
  /**
   * §2c — the columns the block's content occupies at `width`, in `[1, width]`,
   * pure in `(block, width)` as `measure` is (I42). Optional on `window?`'s
   * argument: a kind whose drawing *is* its width — a `rule`, a `progress`, a
   * `plot` — declares nothing, and the registry answers `width` for it. The
   * contract that makes it safe to render at is I43: the block is the same
   * height at this width as at `width`.
   */
  width?: (block: B, width: number, widthChild: WidthFn) => number;
  keymap?: (block: B) => readonly BlockKeyBinding[];
}

export interface BlockRegistry {
  register(definition: BlockDefinition): void;
  get(kind: string): BlockDefinition | undefined;
  seal(): void;
  measure(block: Block, width: number): number;
  /** §2c — a block's content width at `width`, clamped to `[1, width]`; the width itself for a kind declaring none (I42). */
  width(block: Block, width: number): number;
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
