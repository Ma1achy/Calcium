/**
 * C29's vocabulary — the box, its sizing, and what a solved tree is.
 *
 * **The sizing model and the pass structure are ported from `nicbarker/clay`**
 * (Zlib, read at `v0.14`), whose licence asks for the acknowledgement and
 * nothing else (C29 I17). Taking it as a dependency is refused with a row in
 * `DEPENDENCIES.md`: it is C, its unit is a float, and its arena is meaningless
 * in a GC'd runtime — what transfers is the shape of the four modes and the
 * order of the five passes.
 *
 * **Every dimension is a whole number of cells** (C29 I1). There is no sub-cell
 * anything, nothing is laid out in floats and rounded at the end, and `cells()`
 * is the only width authority — a second implementation is what removing Yoga
 * was worth (C09 I72).
 */

import type { Spend } from "../../data/viewmodel/index.js";

/** How a box asks for its size on one axis (C29 §3). */
export type Size =
  | Readonly<{ kind: "fixed"; n: number }>
  | Readonly<{ kind: "fit"; min?: number; max?: number }>
  | Readonly<{ kind: "grow"; min?: number; max?: number }>
  | Readonly<{ kind: "percent"; p: number; min?: number; max?: number }>;

/** What a box does with content that does not fit (C29 §7). */
export type Overflow = "wrap" | "truncate" | "clip" | "scroll";

/**
 * A leaf's content.
 *
 * **A `paint` leaf is C09's `BlockDefinition` in this shape and not a second
 * renderer contract** — `measure(w) → rows` and `render(w, h) → rows` is what a
 * definition already is. The engine never looks inside one.
 */
export type Leaf =
  | Readonly<{ kind: "rows"; rows: readonly string[] }>
  | Readonly<{
      kind: "paint";
      /** Its natural width. **Absent is 0** — `GROW`'s default (C29 I3). */
      natural?: number;
      measure: (width: number) => number;
      render: (width: number, height: number) => readonly string[];
    }>;

/** Where a container puts a child in the slack it has left (C29 §6). */
export type Align = Readonly<{
  x?: "l" | "c" | "r" | "stretch";
  y?: "t" | "c" | "b" | "stretch";
}>;

/**
 * The leftover after flooring — **a declared policy, not the arithmetic's**
 * (C29 I4, C04 I42).
 *
 * **Declared at L0 and re-exported here.** `mosaicRects` takes the same policy
 * and cannot import upward, so one declaration lives beside `divideShares` and
 * both halves of F1219's *one function* read it.
 */
export type { Spend };

export type Padding = Readonly<{ l?: number; r?: number; t?: number; b?: number }>;

export type Box = Readonly<{
  id: string;
  direction?: "row" | "column";
  width?: Size;
  height?: Size;
  padding?: Padding;
  childGap?: number;
  align?: Align;
  spend?: Spend;
  /** width / height, in **cells** (C29 I10). A terminal cell is roughly 1:2. */
  aspect?: number;
  /**
   * Alternative forms, in **preference order** — C29 §7b, I18.
   *
   * Pass 1 fits every form, so each has a natural width measured the way every
   * other box's is; pass 2 takes the **first whose natural width fits**, and
   * falls through to this box's own `children` when none does. **So the
   * fallback is structural**: `children` is required, which is why there is no
   * empty-list case to refuse.
   *
   * **No `min` beside a form** (C09 I72). `LAYOUT_ENGINE.md` §12 writes
   * `{min, box}[]` and a declared minimum is a second record of one number that
   * disagrees the first time the form is edited — `art()` made the same choice
   * at the document layer and for the same reason.
   *
   * **The id is this box's; the content is the form's.** Choosing a form
   * replaces `direction`, `padding`, `childGap`, `align`, `spend`, `aspect`,
   * `overflow`, `clip`, `height` and `children`. The one field it cannot
   * replace is `width`, because the parent distributed against it in the pass
   * above before this box was asked — an ordering fact rather than a rule about
   * which half wins.
   */
  representations?: readonly Box[];
  overflow?: Readonly<{ x?: Overflow; y?: Overflow }>;
  clip?: Readonly<{ x?: boolean; y?: boolean; offset?: Readonly<{ x: number; y: number }> }>;
  /**
   * Excluded from this box's **parent's** scroll offset, and drawn last —
   * C29 §7c, I21.
   *
   * A table header that stays while its body scrolls is neither flow nor float:
   * it **occupies flow space**, displacing its siblings so the scrollable area
   * is what remains, and it is the container's `clip.offset` it sits out. So no
   * sizing pass reads this field — `collect` does, and nothing else.
   *
   * `"top"` keeps the position flow gave it; `"bottom"` is pinned to the
   * container's far edge, which is the same exclusion said from the other end.
   *
   * **Collected first is half the rule, and the design document states only the
   * other half** (F1234). A child excluded from the offset still sits where
   * flow put it and its scrolling siblings land on the same rows — so a header
   * left in declaration order ends up under its own body. **First and not
   * last**, because `composeRow` walks a cursor and cuts a piece that starts
   * behind it: the piece composited *later* at a column is the one that loses,
   * and collecting a sticky child last drew a frame byte-identical to no sticky
   * at all.
   *
   * **No `GROW` refusal beside it.** `LAYOUT_ENGINE.md` §14 refuses a sticky
   * child that is `GROW` on the scroll axis, because it *would grow to fill the
   * space it is excluded from* — and a child occupying flow space is excluded
   * from no space, only from an offset. Measured: such a child solves to the
   * inner height less its siblings, five of six, and does not diverge (I15,
   * I16).
   */
  sticky?: "top" | "bottom";
  /**
   * A child that **takes no space** and is placed against another box after
   * pass 5 — C29 §7f, I22.
   *
   * It is declared inside the tree so that it has a parent to attach to, and it
   * is skipped **upward only**: the float's own subtree is sized by the same
   * four passes, while what it contributes to its parent is nothing. It is in
   * no `FIT` sum, no distribution and no sibling's position, and the scrollable
   * area of a container holding one is unchanged.
   *
   * **`floating` and `sticky` are opposites wearing one sentence.** Both read
   * as *this child is not laid out normally*: a sticky child occupies flow
   * space and is excluded from an offset (I21); a float takes no space at all.
   * A box declaring both asks for a child that occupies flow space and does
   * not, so the engine states the contradiction rather than picking a winner.
   */
  floating?: Floating;
  children: readonly Box[] | Leaf;
}>;

/**
 * One of nine points on a box — the corners, the edge centres and the centre.
 *
 * `anchor` lines two of them up: `{ self: "tc", target: "bc" }` puts this box's
 * top centre on the target's bottom centre, which is a tooltip under a row.
 */
export type Point = "tl" | "tc" | "tr" | "cl" | "cc" | "cr" | "bl" | "bc" | "br";

/**
 * The four named stack positions — C29 §7f, I22, I23.
 *
 * **Named and never an integer.** In a terminal there is no alpha, so a layer
 * that overlaps another destroys it, and an integer anyone can pick is an
 * invitation to two things claiming one cell with the winner decided by
 * whoever typed the larger number. `base` is the flow and is not declarable
 * here, because a float is by definition not in it.
 */
export type FloatLayer = "float" | "overlay" | "debug";

/** What a float attaches to — C29 §7f, I22. */
export type AttachTo =
  | Readonly<{ kind: "parent" }>
  | Readonly<{ kind: "element"; id: string }>
  | Readonly<{ kind: "root" }>;

export type Floating = Readonly<{
  /**
   * **`element` matters more than `parent`** (`LAYOUT_ENGINE.md` §10): a hover
   * card should not have to be declared inside whichever of five rows is
   * hovered, because that pollutes the declaration of the thing being hovered
   * with the state of the hover.
   *
   * `Box.id` has no uniqueness rule anywhere in this engine, so `element` takes
   * the **first** match in document order. That is a choice rather than a
   * fallback: throwing on a duplicate makes a float's validity depend on a box
   * two subtrees away that it does not name.
   */
  attachTo: AttachTo;
  /** Line these two points up — `self` on this float, `target` on what it attaches to. */
  anchor: Readonly<{ self: Point; target: Point }>;
  /** Whole cells, applied after the anchor and **before** the nudge (C29 I1, I22). */
  offset?: Readonly<{ x: number; y: number }>;
  layer: FloatLayer;
  /**
   * The window the float is nudged into and clipped to — default
   * `"attachedAncestor"`.
   *
   * A tooltip on a row inside a scroll block must be clipped by the scroll
   * block, or it draws outside the window and over rows that are not there.
   * `"none"` is the exception a modal asks for, and it takes the frame.
   */
  clipTo?: "none" | "attachedAncestor";
}>;

/**
 * A float carried out of the sizing passes — C29 §7f, I22.
 *
 * The declaration travels beside the solved subtree rather than on it, because
 * a `SolvedBox` is the answer to *what size is this and where is it in its
 * parent*, and a float's position is not known until the composer has applied
 * every offset above it.
 */
export type SolvedFloat = Readonly<{ solved: SolvedBox; floating: Floating }>;

/**
 * A float resolved to a whole-cell rect on the frame — C29 §7f, I22.
 *
 * `rect` is **absolute** and already nudged; `clip` is the window it was
 * nudged into and must be drawn through, which is the attached ancestor's or
 * the frame's. `layer` and the order of this list are what C15 composites by.
 */
export type PlacedFloat = Readonly<{
  id: string;
  layer: FloatLayer;
  rect: Rect;
  clip: Rect;
  solved: SolvedBox;
}>;

/** A rectangle in cells, **parent-relative** (C29 §2). */
export type Rect = Readonly<{ x: number; y: number; width: number; height: number }>;

export type SolvedBox = Readonly<{
  id: string;
  rect: Rect;
  clip?: Readonly<{ x: boolean; y: boolean; offset: Readonly<{ x: number; y: number }> }>;
  /**
   * Carried, not resolved — C29 I21.
   *
   * **`aspect`, `sticky` and a float are resolved rather than carried** is the
   * rule §1 states, and sticky is the exception that proves which passes it is
   * about: the *sizing* passes resolve everything and this reaches none of
   * them. It is the composer that applies `clip.offset`, so it is the composer
   * that must know which child sits the offset out — and a `rect` cannot say
   * so, because a sticky child's rect is its flow rect either way.
   */
  sticky?: "top" | "bottom";
  /**
   * The floats declared on this box, solved and not yet placed — C29 §7f, I22.
   *
   * **Beside the children rather than among them**, which is what *takes no
   * space* means structurally: nothing that walks `children` can reach a float,
   * so no sizing pass, no distribution and no sibling's position can be
   * affected by one without the walk being changed on purpose.
   */
  floats?: readonly SolvedFloat[];
  leaf?: Leaf;
  children: readonly SolvedBox[];
}>;

/**
 * What the engine counted about a solve — **the numbers a frame assertion cannot
 * see** (C29 I5, I8).
 *
 * The clamping loop's round count and the alignments that found no slack are
 * both invisible in the frame: a fixed point reached in `n + 1` rounds draws
 * exactly what one reached in `n` draws, and an ignored alignment draws what no
 * alignment draws. Counting them is what makes *why is my alignment ignored* a
 * number rather than a reading of the source.
 */
export type SolveCounts = {
  /** Clamping rounds taken, per distribution. The bound is the child count. */
  rounds: number[];
  /** Alignments declared on an axis with no slack. */
  alignNoOp: number;
};

export const isLeaf = (children: Box["children"]): children is Leaf =>
  !Array.isArray(children);

/** A box's children as boxes, or `[]` when it is a leaf. */
export const boxesOf = (box: Box): readonly Box[] =>
  isLeaf(box.children) ? [] : box.children.filter((c) => c.floating === undefined);

/**
 * The floats declared on a box, in document order — C29 §7f, I22.
 *
 * **The partition is here and not inside a pass**, so that *a float takes no
 * space* is a property of what the passes are given rather than a flag each one
 * must remember to read. The natural implementation is the other way round and
 * it skips the float's own subtree too, giving every float a size of zero
 * (walk C4).
 */
export const floatsOf = (box: Box): readonly Box[] =>
  isLeaf(box.children) ? [] : box.children.filter((c) => c.floating !== undefined);

/** A box's leaf, or `undefined` when it is a container. */
export const leafOf = (box: Box): Leaf | undefined =>
  isLeaf(box.children) ? box.children : undefined;
