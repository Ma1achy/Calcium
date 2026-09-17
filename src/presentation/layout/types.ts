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
  children: readonly Box[] | Leaf;
}>;

/** A rectangle in cells, **parent-relative** (C29 §2). */
export type Rect = Readonly<{ x: number; y: number; width: number; height: number }>;

export type SolvedBox = Readonly<{
  id: string;
  rect: Rect;
  clip?: Readonly<{ x: boolean; y: boolean; offset: Readonly<{ x: number; y: number }> }>;
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
  isLeaf(box.children) ? [] : box.children;

/** A box's leaf, or `undefined` when it is a container. */
export const leafOf = (box: Box): Leaf | undefined =>
  isLeaf(box.children) ? box.children : undefined;
