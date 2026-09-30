/**
 * The layer vocabulary.
 *
 * C15 — see spec. One mechanism for overlays and pushed views, differing in
 * what they cover and whether they take letter keys (A01 D4).
 *
 * The shape of this file is the spec's central finding: **C15 holds no
 * information about what a layer refers to.** No entry ids, no anchors into a
 * transcript, no natural width, no scroll offset. Every one of those belongs to
 * whoever raised the layer, and each was written here first as a duty this
 * component could not discharge.
 */

import type { Block } from "./deps.js";

/**
 * Where a layer sits.
 *
 * `anchored` carries a **span**, not a row. A prompt two rows tall has no
 * single row that places a menu correctly — anchoring on its top and preferring
 * `below` starts the menu on its second line, anchoring on its bottom and
 * preferring `above` ends on its first — and both produce placements whose
 * every number is self-consistent (I17).
 */
export type Placement =
  | Readonly<{
      kind: "anchored";
      /** First row of the anchor, within the region. */
      row: number;
      /** The anchor's own extent. Defaults to 1, which is the special case. */
      rows?: number;
      prefer: "above" | "below";
    }>
  | Readonly<{ kind: "centred" }>;

/**
 * What every kind carries (§2).
 *
 * `kind`, `blocking`, `dismissal` and `owner` are not here: they are one table,
 * and `Layer` below is that table written as a type (I30).
 */
export type LayerBase = Readonly<{
  id: string;
  placement: Placement;
  /**
   * `Block[]`, never React (I4) — so a layer is themed, degrades to ASCII and
   * measures through the same registry as the transcript.
   *
   * For a **view** this is already the region's worth: the owner windows it and
   * owns its own scroll (§4). S12 holds fifty thousand log lines behind this
   * field, and C15 sees the visible ones.
   */
  content: readonly Block[];
  /**
   * Requested width in cells; absent means the region's.
   *
   * Declared rather than measured because `BlockRegistry` answers height at a
   * width and never the reverse (I16). C19 knows its longest candidate; this
   * component knows the region and nothing else.
   */
  width?: number;
  /** Overlays; default 0.5. */
  maxHeightFraction?: number;
  /**
   * Where this layer wants the terminal cursor, **relative to its own origin**
   * (I19).
   *
   * On the layer rather than only on `Placed`, because `place()` computes
   * geometry from a measured height and a region and has no idea where a
   * search's caret is — a cursor that existed only on the output could only be
   * invented there. The producer states it and placement copies it through;
   * both ends are relative to the same origin, so nothing is adjusted.
   *
   * Absent means the layer has no cursor, which is the default and the case
   * that matters: it is what a menu wants. Nothing is entered into a menu.
   */
  cursor?: Readonly<{ row: number; col: number }>;
}>;

/**
 * The fields the §2d table is over, documented once (I26, I29).
 *
 * Each arm of the union below intersects this with its own literals, which
 * narrows every field to the arm's values and keeps the prose in one place
 * rather than three copies of it.
 */
type LayerFields = Readonly<{
  /**
   * `overlay` and `panel` take keys; a **`peek`** never does (§2a, I21).
   *
   * A peek is the focused element's detail drawn beside it. It is a third kind
   * rather than a flag because C16 reads `top.kind`: measured with a plain
   * anchored overlay standing in for one, `↓` was consumed and focus did not
   * move, `⏎` went to the layer, and `Esc` dismissed it instead of leaving the
   * block. A layer that is never `top` cannot reach the ladder at all.
   */
  kind: "overlay" | "peek" | "panel";
  /**
   * Does this layer own input while it is up (I26, R-QST-001)?
   *
   * **One of the two fields `dismissable` was** (§2c). The flag answered *can
   * `pop()` remove it*, *is it modal to the mouse* and *does it claim keys
   * before the prompt* at once, and R-BLK-822 is the design's own construction
   * of the case where those diverge: a typed reply **blocks** and **floats**
   * above a live prompt and is still not escapable. R-QST-001 settles that it is
   * declared rather than derived — *a question declares blocking and owner
   * explicitly* — which is what retired C16's `coversRegion`, a measured box
   * standing in for a field that did not exist yet.
   *
   * Never changes (I14): a layer that stopped blocking mid-answer would hand
   * the keyboard back to a prompt an owner is still waiting on.
   */
  blocking: boolean;
  /**
   * What closes this layer (I26, R-BLK-779).
   *
   * - `escape` — the reader closes it: `pop()` reaches it, and a press outside
   *   it closes it and is consumed there (C16 I47).
   * - `focus` — focus leaving closes it. A peek's, because a peek is a
   *   projection of focus and nothing else.
   * - `answer` — only its own resolution closes it. *Clicking off it does
   *   nothing, because an owner is waiting.*
   *
   * Never changes (I14), for the reason it never changed as `dismissable`:
   * a layer whose escapability moved mid-life makes C16's ladder depend on
   * when it looked.
   */
  dismissal: "escape" | "focus" | "answer";
  /**
   * Which owner rung this layer is, when it takes keys (I29, R-QST-001, C16 I63).
   *
   * *A question declares blocking and owner explicitly* — the design's own
   * words, and until this field the owner was the one half not declared. C16
   * derived it twice: from `kind` for the footer, the guard and the epoch, and
   * from whether an answer callback was registered for the intercept table —
   * and on a blocking overlay nothing could answer, the two said `question`
   * and `scope`. Declared, there is one answer and C16 reads it.
   *
   * **Absent is the kind's own rung**: an overlay is a question and a panel an
   * unnamed substate. The strict form — every overlay declares `question` and
   * is therefore blocking and closed by `answer` — is not built: probed, it
   * refused 52 rows whose non-blocking overlays are test stand-ins with no
   * design counterpart (C15 I29).
   *
   * Never changes (I14), and `LayerUpdate` does not admit it: a layer whose
   * owner moved mid-life makes the ladder depend on when it looked.
   */
  owner?: LayerOwner;
}>;

/**
 * A layer: one kind, one shape (I30, §2d, R-BLK-779).
 *
 * **The §2d table written as a type.** Each refused row is a literal that does
 * not compile — a blocking peek, a peek closed by `escape` or `answer`, an
 * overlay closed by `focus`, a non-blocking overlay closed by its `answer` — and
 * `push`/`update` check the same table at run time, because a cast, a widened
 * value or JavaScript reaches the stack without the type (§2d, D11).
 *
 * **`placement` is not narrowed here**, although I22 and I27 fix it for two of
 * the kinds: `LayerUpdate` admits it and names no kind, so the run-time check is
 * the only one both routes reach, and a narrowed type would read as a guarantee
 * `update` does not give.
 */
export type Layer =
  | (LayerBase & LayerFields & Readonly<{ kind: "peek"; blocking: false; dismissal: "focus"; owner?: undefined }>)
  | (LayerBase & LayerFields & Readonly<{ kind: "panel"; blocking: false; dismissal: "escape"; owner?: SubstateOwner }>)
  | (LayerBase &
      LayerFields &
      Readonly<{ kind: "overlay"; owner?: QuestionOwner }> &
      (Readonly<{ blocking: true; dismissal: "answer" | "escape" }> | Readonly<{ blocking: false; dismissal: "escape" }>));

/**
 * The owner rung a keyed layer declares (I29, §103).
 *
 * A **substate names itself** — `find`, `complete` or `preview` — because the
 * footer says which one is up and `promptUnderMenu` decides by it; both read
 * layer ids before this, and the footer said `find` for all three.
 */
export type QuestionOwner = Readonly<{ rung: "question" }>;
export type SubstateOwner = Readonly<{ rung: "substate"; name: "find" | "complete" | "preview" }>;
export type LayerOwner = QuestionOwner | SubstateOwner;

/**
 * A layer C16 can route to — what `top` answers (I21).
 *
 * Typed rather than documented: `RouterDeps.overlayTop` narrows `kind` to the
 * keyed ones, so a `top` that could answer a peek would not compile at the one
 * seam that matters. (`"view"` was a third until R-EXA-082 retired it — F1254.)
 */
export type KeyedLayer = Layer & Readonly<{ kind: "overlay" | "panel" }>;

/**
 * A placed layer that takes input — the ones C16 hit-tests a click against (I21).
 *
 * **A peek takes no clicks as it takes no keys**: a click on it falls through to
 * the transcript row beneath, which is the element the peek describes. One
 * predicate for the three `placed` seams, so the rule is stated once.
 */
export function takesInput(p: Placed): p is Placed & Readonly<{ layer: KeyedLayer }> {
  return p.layer.kind !== "peek";
}

/**
 * A placed layer the pointer reaches for this gesture (I31, C16 I48).
 *
 * **Separate from `takesInput`, and the peek is why.** One predicate answered
 * for keys and for the pointer, so the peek band of C16 I48's scroll order —
 * `overlay › panel › peek › base` — was a band no event could reach: a wheel
 * over a truncated peek scrolled the transcript row beneath it. A peek takes
 * the wheel and nothing else; a press on it still reaches the row beneath
 * (I21), which is the element the peek describes.
 */
export function takesPointer(p: Placed, gesture: "wheel" | "press"): boolean {
  return gesture === "wheel" || takesInput(p);
}

export type Placed = Readonly<{
  layer: Layer;
  /** Absolute row within the region. */
  top: number;
  /**
   * Absolute column within it.
   *
   * Non-zero only for `centred`, and present because C16 hit-tests a mouse
   * event against a layer's whole rectangle (C16 §4). Without it a centred
   * confirm's horizontal extent is unrecoverable.
   */
  left: number;
  height: number;
  width: number;
  truncated: boolean;
  /** The layer's own, copied through — see `Layer.cursor` (I19). */
  cursor?: Readonly<{ row: number; col: number }>;
}>;

/**
 * `anchorEvicted` is supplied by the caller, not detected here (I10).
 *
 * `displaced` is the one reason this component supplies itself: a blocking
 * layer arriving closed the panel (I28), and its owner holds the panel's state
 * to restore when the arrival resolves (I32). Neither the reader closing it nor
 * its referent going is what happened, and an owner that could not tell the
 * three apart kept a closed menu's state live.
 *
 * C15 subscribes to nothing and holds no entry ids, so it cannot notice an
 * eviction — and the requirement was never that it should. What L4 needs is to
 * tell a user's cancellation from a referent that has gone.
 */
export type DismissReason = "explicit" | "anchorEvicted" | "displaced";

/**
 * What `update` may change.
 *
 * **`blocking` and `dismissal` are deliberately absent, both of them** (I14).
 * A layer that becomes escapable partway through its life makes C16's Ctrl-C
 * ladder depend on when it looked: the same confirm answers "may I be
 * dismissed?" differently on two consecutive keystrokes. Ownership is the same
 * fact twice over — a layer that stopped blocking mid-answer hands the keyboard
 * back to a prompt an owner is still waiting on. A layer that needs to change
 * either is two layers.
 */
export type LayerUpdate = Partial<Pick<Layer, "content" | "placement" | "width" | "cursor">>;

export type OverlayChange =
  | Readonly<{ kind: "push"; id: string; layerKind: Layer["kind"] }>
  /** A peek is never popped (I21), so `pop` names only the keyed kinds. */
  | Readonly<{ kind: "pop"; id: string; layerKind: "overlay" | "panel" }>
  | Readonly<{ kind: "content"; id: string }>
  | Readonly<{ kind: "dismiss"; id: string; reason: DismissReason }>;

export type Region = Readonly<{ width: number; height: number }>;

export interface OverlayManager {
  push(layer: Layer): Disposable;
  /**
   * The top layer, if its `dismissal` is `escape` (I3, §2c).
   *
   * **Inspects only the top.** It does not search downwards for the first
   * escapable layer: under a confirm raised over a completion menu, the
   * searching version pops the menu — answering nothing and closing something
   * the user was not looking at (I3).
   *
   * `null` covers two cases, and C16's Ctrl-C ladder needs them apart. It reads
   * `top` first: `null` falls through to the next rung, a layer closed by its
   * answer is a no-op. Branching on this return value instead pops the pushed
   * view beneath an unanswered confirm.
   */
  pop(): Layer | null;
  dismiss(id: string, reason?: DismissReason): void;
  /** `false` if no layer has that id. It never pushes (I14). */
  update(id: string, next: LayerUpdate): boolean;
  layout(region: Region): readonly Placed[];
  subscribe(cb: (change: OverlayChange) => void): Disposable;

  /** Bottom-first, and sorted: every overlay above every peek above every view (I2, I23). */
  readonly stack: readonly Layer[];
  /** The topmost layer that takes keys — never a peek (I21). */
  readonly top: KeyedLayer | null;
  /** Keyed pushes and removals, never down — the owner generation C16's epoch reads (I33). */
  readonly generation: number;
}

export type OverlayOptions = Readonly<{ registry: BlockRegistryLike }>;

/** The half of C09 that C15 uses. Narrow because the seam should be. */
export type BlockRegistryLike = Readonly<{
  measureSequence(blocks: readonly Block[], width: number): number;
}>;

export class OverlayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OverlayError";
  }
}
