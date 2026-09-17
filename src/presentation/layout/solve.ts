/**
 * The five passes (C29 §4, I2, I11).
 *
 * ```
 * 1  FIT, bottom-up, WIDTH     each box's natural width from its children
 * 2  GROW/SHRINK, top-down     slack or deficit across the width axis; aspect's
 *                              width half; stretch, when the cross axis is width
 * 3  RE-FIT, HEIGHT            text re-wraps at its solved width
 * 4  GROW/SHRINK, top-down     the same on height; aspect's height half;
 *                              stretch, when the cross axis is height
 * 5  POSITION                  padding, gap and alignment, parent-relative
 * ```
 *
 * **Children declare their natural size; parents derive theirs from their
 * children. Nothing is imposed downward until pass 2, and pass 2 only ever
 * distributes slack or deficit** — it never assigns a size from nothing,
 * because a child that was never asked cannot say *that is not enough*.
 *
 * **Ported from `nicbarker/clay`** (Zlib, read at `v0.14`) — see `types.ts`
 * for the attribution and `DEPENDENCIES.md` for the refusal (C29 I17).
 *
 * **`measure` stops after pass 4** and reads the root's height, so C09 I1 holds
 * by construction rather than as a written pair tested as a pair (C29 I12).
 */
import { cells, wrapCells } from "../text.js";
import { distribute, type Demand } from "./distribute.js";
import {
  boxesOf,
  isLeaf,
  leafOf,
  type Box,
  type Leaf,
  type Size,
  type SolveCounts,
  type SolvedBox,
} from "./types.js";

const FIT: Size = { kind: "fit" };
const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), hi);
const lo = (s: Size): number => (s.kind === "fixed" ? s.n : (s.min ?? 0));
const hi = (s: Size): number => (s.kind === "fixed" ? s.n : (s.max ?? Number.POSITIVE_INFINITY));

/** The mutable node the passes write into. A `SolvedBox` is taken from it at the end. */
type Node = {
  /** Mutable, because choosing a representation replaces it (C29 I18, §7b). */
  box: Box;
  children: Node[];
  leaf: Leaf | undefined;
  /**
   * Candidate forms in preference order, **the fallback last** — `undefined`
   * where the box declares none, which is every box but the ones that do.
   */
  forms: Node[] | undefined;
  natW: number;
  natH: number;
  w: number;
  h: number;
  x: number;
  y: number;
  /** A `rows` leaf's rows at the solved width, when the box wraps (C29 §7). */
  wrapped: readonly string[] | undefined;
};

/**
 * **A padded leaf is a container of one unpadded leaf** (C29 §6, I2).
 *
 * Padding is *inside* the box, around its children — and a leaf has content
 * rather than children, so every pass would have had a second arm asking
 * whether the padding it was about to apply belonged to a box with a leaf in
 * it. Normalising the shape once, here, is the alternative: after this, padding
 * only ever appears on a container, which is the only case the passes handle.
 *
 * The wrapper stretches on both axes so the content fills what the padding left
 * it — a `FIT` child would otherwise take its natural size and be measured at a
 * width the box does not give it.
 *
 * **The first consumer found this, and the row that should have was vacuous.**
 * T1.12's corpus held a padded leaf and asserted only that `measure` equalled
 * the composed count, which is true of any pair of agreeing wrong numbers.
 */
const padded = (box: Box): boolean => {
  const p = box.padding;
  return p !== undefined && ((p.l ?? 0) + (p.r ?? 0) + (p.t ?? 0) + (p.b ?? 0)) > 0;
};

const normalise = (box: Box): Box => {
  if (!isLeaf(box.children) || !padded(box)) return box;
  // **`overflow` travels inward with the content it describes.** It says what
  // the *content* does when it does not fit — `wrap` reflows the text, and the
  // text is on the inside of the padding. `clip` stays on the outer box, which
  // is the thing with an edge to cut against.
  const { overflow, ...frame } = box;
  // **The content's own size follows the frame's intent, per axis.** Where the
  // box is `FIT` the content keeps `FIT`, because the box's size is derived
  // from it; where the box has a size of its own the content **fills** what the
  // padding left, because that is what putting padding round something means.
  //
  // Width is the cross axis of the wrapper, so `stretch` does that job
  // (C29 I9). **Height is the main axis, and stretch is not defined there** —
  // filling a main axis is `GROW`, which is why this reads as two rules rather
  // than one alignment.
  const fills = (box.height ?? { kind: "fit" as const }).kind !== "fit";
  return {
    ...frame,
    align: { x: "stretch" },
    children: [
      {
        id: `${box.id}\u00b7content`,
        ...(fills ? { height: { kind: "grow" as const } } : {}),
        ...(overflow === undefined ? {} : { overflow }),
        children: box.children,
      },
    ],
  };
};

/**
 * The box with its representations stripped — **the fallback form**, and the
 * reason there is no empty-list case (C29 I18).
 *
 * `children` is required on a `Box`, so a box that declares forms always has
 * one more behind them. A list that could produce nothing is what `art`'s
 * fallback chain refuses, and here the type refuses it instead.
 */
const fallbackOf = (box: Box): Box => {
  const { representations: _forms, ...rest } = box;
  return rest;
};

const build = (input: Box): Node => {
  const box = normalise(input);
  const declared = box.representations;
  const node: Node = {
    box,
    children: boxesOf(box).map(build),
    leaf: leafOf(box),
    forms: undefined,
    natW: 0,
    natH: 0,
    w: 0,
    h: 0,
    x: 0,
    y: 0,
    wrapped: undefined,
  };
  if (declared === undefined || declared.length === 0) return node; // cells-ok — a form count
  // **The fallback is built last and is the box itself.** Preference order is
  // the declaration's, and falling off the end is taking this box's own
  // children, which is the case every other pass already handles.
  node.forms = [...declared.map(build), build(fallbackOf(box))];
  return node;
};

/**
 * Adopt a chosen form — **the id is the box's, the content is the form's**
 * (C29 I18, §7b).
 *
 * `width` is the one field not taken, and the reason is an ordering fact rather
 * than a rule about which half wins: the parent distributed against this box's
 * declared width in the pass above, before this box was asked, so a form's
 * width would be a number nobody reads. Every other field is read after this
 * runs.
 */
const adopt = (node: Node, form: Node): void => {
  node.box = { ...form.box, id: node.box.id };
  node.children = form.children;
  node.leaf = form.leaf;
  node.natW = form.natW;
  node.natH = form.natH;
  node.wrapped = form.wrapped;
  node.forms = undefined;
};

/** `padding`, clamped to the box so the inner size reaches 0 rather than going negative (C29 I7, §8a A8). */
function insets(node: Node, axis: "x" | "y"): { readonly near: number; readonly far: number; readonly inner: number } {
  const p = node.box.padding ?? {};
  const size = axis === "x" ? node.w : node.h;
  const near = Math.min(axis === "x" ? (p.l ?? 0) : (p.t ?? 0), size);
  const far = Math.min(axis === "x" ? (p.r ?? 0) : (p.b ?? 0), size - near);
  return { near, far, inner: size - near - far };
}

/**
 * The budget a container's children are distributed across (C29 I15, F1222).
 *
 * **A container that clips on an axis does not impose its size on that axis.**
 * `clip` draws the box and drops what is outside it, and `scroll` is `clip`
 * plus a `childOffset` — both of which require the child to be *bigger* than
 * the box. A container that first shrank its child to fit has nothing left to
 * clip and nowhere for the offset to move to, which makes the offset a
 * mechanism with nothing behind it.
 */
function budgetOf(node: Node, inner: number, gaps: number, demands: readonly Demand[], axis: "x" | "y"): number {
  const room = Math.max(0, inner - gaps);
  const clipped = axis === "x" ? node.box.clip?.x === true : node.box.clip?.y === true;
  if (!clipped) return room;
  // Surplus still distributes — a clipping container with slack is an ordinary
  // container. Only the deficit is refused.
  return Math.max(room, demands.reduce((a, d) => a + d.base, 0));
}

/** The gaps between `n` children, **clamped with the padding** (C29 I7, §8a A8). */
const gapsOf = (node: Node, inner: number): number =>
  Math.min(Math.max(0, node.children.length - 1) * (node.box.childGap ?? 0), Math.max(0, inner)); // cells-ok — a child count

/** The natural size a declaration contributes, given what its contents came to (C29 I2, I3). */
function naturalOf(size: Size, content: number): number {
  switch (size.kind) {
    case "fixed":
      return size.n;
    case "fit":
      return clamp(content, lo(size), hi(size));
    // **`GROW` and `PERCENT` contribute their `min`, and `min` defaults to 0**
    // (C29 I3, §8a A1/A2). Neither has a natural size — that is what they mean
    // — and the two rules that could answer are circular: a parent derives from
    // its children while the child takes a share of what the parent has left.
    case "grow":
    case "percent":
      return size.min ?? 0;
  }
}

// ---------------------------------------------------------------- pass 1

/** Pass 1 — natural widths, bottom-up, leaves as the base case (C29 I2). */
function fitWidth(node: Node): void {
  // **Every form is fitted, and the box's own natural width is the preferred
  // form's** (C29 I18, §7b). Fitting them all is what makes pass 2's choice one
  // pass and not a search: each candidate's minimum is its own measured width,
  // taken through the same arithmetic as every other box, so there is nothing
  // left to compute when the width arrives. Taking the *preferred* form's
  // number rather than the fallback's is what makes a `FIT` parent size to the
  // form it would rather draw.
  if (node.forms !== undefined) {
    for (const form of node.forms) fitWidth(form);
    node.natW = node.forms[0]!.natW;
    return;
  }
  for (const child of node.children) fitWidth(child);
  const leaf = node.leaf;
  let content: number;
  if (leaf !== undefined) {
    // A `rows` leaf's natural width is its widest row by `cells()` — never
    // `String.length`, and never a second implementation (C29 I1, C09 I72). A
    // `paint` leaf's is what it declares, and **absent is 0**.
    content =
      leaf.kind === "rows"
        ? leaf.rows.reduce((w, row) => Math.max(w, cells(row)), 0) // narrow-ok — the width authority's own default (C09 I72)
        : (leaf.natural ?? 0);
  } else if ((node.box.direction ?? "column") === "row") {
    const sum = node.children.reduce((a, c) => a + c.natW, 0);
    content = sum + Math.max(0, node.children.length - 1) * (node.box.childGap ?? 0); // cells-ok — a child count
  } else {
    content = node.children.reduce((a, c) => Math.max(a, c.natW), 0);
  }
  const pad = (node.box.padding?.l ?? 0) + (node.box.padding?.r ?? 0);
  node.natW = naturalOf(node.box.width ?? FIT, content + (leaf === undefined ? pad : 0));
}

// ---------------------------------------------------------------- pass 2 and 4

/**
 * What a child brings to its parent's distribution on one axis.
 *
 * `FIT` and `FIXED` bring the size they asked for; `GROW` brings its floor and
 * a weight of 1; `PERCENT` resolves against the **inner** size after padding
 * and gaps, so three `PERCENT(0.33)` children do not fill the row (C29 §3).
 * Every mode may shrink toward its own `min` under a deficit, which is how
 * `PERCENT` past 100 % resolves (C29 §8a A11).
 */
function demandOf(size: Size, natural: number, inner: number): Demand {
  switch (size.kind) {
    case "fixed":
      return { base: size.n, min: size.n, max: size.n, weight: 0 };
    case "fit":
      return { base: natural, min: lo(size), max: hi(size), weight: 0 };
    case "grow":
      return { base: lo(size), min: lo(size), max: hi(size), weight: 1 };
    case "percent": {
      const want = clamp(Math.floor(size.p * inner), lo(size), hi(size)); // cells-ok — a cell count
      return { base: want, min: lo(size), max: want, weight: 0 };
    }
  }
}

/** A cross-axis child's size, resolved independently against the inner size (C29 §3, I9). */
function crossOf(size: Size, natural: number, inner: number, stretch: boolean): number {
  switch (size.kind) {
    // **`FIXED` is never stretched** — an explicit size beats an inherited one,
    // always (C29 I9, §8a A5).
    case "fixed":
      return size.n;
    case "fit":
      return stretch ? clamp(inner, lo(size), hi(size)) : clamp(Math.min(natural, inner), lo(size), hi(size));
    // **Stretch against `GROW` is a no-op and not an error**: the child already
    // fills, and the default for a mosaic row *is* stretch, so an error would
    // fire on the default (C29 I9, §8a A5).
    case "grow":
      return clamp(inner, lo(size), hi(size));
    case "percent":
      return clamp(Math.floor(size.p * inner), lo(size), hi(size)); // cells-ok — a cell count
  }
}

/**
 * Pass 2 — width, top-down (C29 §4).
 *
 * **Aspect's width half lands here** (C29 I10, F1220 D1). It can only shrink,
 * and it can only shrink against a height that is already knowable, which is a
 * `FIXED` one; every other aspect resolves in pass 4 by shrinking the height.
 * Resolving it after pass 3 would leave every height standing at the pre-aspect
 * width, which is C09 I1 violated by construction in the engine that exists to
 * make it hold by construction.
 *
 * **Stretch lands here when the cross axis is width**, which is a `column`'s
 * (C29 I9, F1221). Stretching a width after pass 3 has wrapped at the
 * unstretched one leaves the committed height false, and repairing it inside
 * pass 4 is the second re-fit C29 I11 forbids.
 */
function growWidth(node: Node, counts: SolveCounts): void {
  // **The choice is made here, before anything else in this pass** (C29 I18,
  // §7b). Before the aspect clamp, before the children are distributed, and
  // before the recursion — so every rule below and every later pass sees one
  // tree and never a candidate set. A chooser that ran after distribution would
  // hand the slack of one form to the children of another, and every width in
  // the subtree would be self-consistent and wrong.
  //
  // **The first that fits, and the last regardless.** The last is the box's own
  // children with the forms stripped, so falling off the end is not a case.
  if (node.forms !== undefined) {
    const forms = node.forms;
    adopt(node, forms.find((f) => f.natW <= node.w) ?? forms[forms.length - 1]!); // cells-ok — a form count
  }

  const aspect = node.box.aspect;
  const height = node.box.height ?? FIT;
  if (aspect !== undefined && aspect > 0 && height.kind === "fixed") {
    node.w = Math.min(node.w, Math.max(0, Math.round(aspect * height.n))); // cells-ok — a cell count
  }

  const { inner } = insets(node, "x");
  const gaps = gapsOf(node, inner);
  const kids = node.children;
  if (kids.length > 0) { // cells-ok — a child count
    if ((node.box.direction ?? "column") === "row") {
      const demands = kids.map((c) => demandOf(c.box.width ?? FIT, c.natW, inner));
      const solved = distribute(demands, budgetOf(node, inner, gaps, demands, "x"), node.box.spend ?? "none");
      counts.rounds.push(solved.rounds);
      kids.forEach((c, i) => {
        c.w = solved.sizes[i]!;
      });
    } else {
      const stretch = node.box.align?.x === "stretch";
      const room = node.box.clip?.x === true ? Number.POSITIVE_INFINITY : inner;
      kids.forEach((c) => {
        c.w = crossOf(c.box.width ?? FIT, c.natW, stretch ? inner : room, stretch);
      });
    }
  }
  for (const child of kids) growWidth(child, counts);
}

/** Pass 3 — heights, bottom-up, at the widths pass 2 solved (C29 §4, I11). */
function fitHeight(node: Node): void {
  for (const child of node.children) fitHeight(child);
  const leaf = node.leaf;
  let content: number;
  if (leaf !== undefined) {
    if (leaf.kind === "rows") {
      // **Text re-wraps here and only here** (C29 §4). A box that does not
      // declare `wrap` keeps its rows and the composer cuts them, which is
      // C09's own rule and the safe direction of a width disagreement.
      const wrapping = node.box.overflow?.x === "wrap" && node.w > 0;
      node.wrapped = wrapping ? leaf.rows.flatMap((row) => wrapCells(row, node.w)) : undefined;
      content = (node.wrapped ?? leaf.rows).length; // cells-ok — a row count
    } else {
      content = leaf.measure(node.w);
    }
  } else if ((node.box.direction ?? "column") === "row") {
    content = node.children.reduce((a, c) => Math.max(a, c.natH), 0);
  } else {
    const sum = node.children.reduce((a, c) => a + c.natH, 0);
    content = sum + Math.max(0, node.children.length - 1) * (node.box.childGap ?? 0); // cells-ok — a child count
  }
  const pad = (node.box.padding?.t ?? 0) + (node.box.padding?.b ?? 0);
  // **A box with no width has no height** (C29 I14): width 0 solves nothing and
  // emits nothing, so measuring it at anything above 0 would be a count of rows
  // that are never drawn. A `rows` leaf is the case that shows it — its row
  // count does not depend on the width, so nothing else in pass 3 would notice.
  node.natH = node.w === 0 ? 0 : naturalOf(node.box.height ?? FIT, content + (leaf === undefined ? pad : 0));
}

/**
 * Pass 4 — height, top-down; stretch when the cross axis is height; aspect's
 * height half (C29 §4, I9, I10).
 *
 * **A height never feeds back into a width** (C29 I11). Nothing here re-wraps,
 * which is why one re-fit suffices.
 */
function growHeight(node: Node, counts: SolveCounts): void {
  const aspect = node.box.aspect;
  if (aspect !== undefined && aspect > 0) {
    // **Aspect only ever shrinks, and loses when neither axis has slack**
    // (C29 I10, §8a A9) — growing an axis would overflow a box that already fits.
    node.h = Math.min(node.h, Math.max(0, Math.round(node.w / aspect))); // cells-ok — a cell count
  }

  const { inner } = insets(node, "y");
  const gaps = gapsOf(node, inner);
  const kids = node.children;
  if (kids.length > 0) { // cells-ok — a child count
    if ((node.box.direction ?? "column") === "column") {
      const demands = kids.map((c) => demandOf(c.box.height ?? FIT, c.natH, inner));
      const solved = distribute(demands, budgetOf(node, inner, gaps, demands, "y"), node.box.spend ?? "none");
      counts.rounds.push(solved.rounds);
      kids.forEach((c, i) => {
        c.h = solved.sizes[i]!;
      });
    } else {
      const stretch = node.box.align?.y === "stretch";
      const room = node.box.clip?.y === true ? Number.POSITIVE_INFINITY : inner;
      kids.forEach((c) => {
        c.h = crossOf(c.box.height ?? FIT, c.natH, stretch ? inner : room, stretch);
      });
    }
  }
  for (const child of kids) growHeight(child, counts);
}

/** Where a child sits in the slack, and a declared alignment with none is counted (C29 I8). */
function offsetOf(
  align: "l" | "c" | "r" | "t" | "b" | "stretch" | undefined,
  slack: number,
  counts: SolveCounts,
): number {
  if (align === undefined || align === "stretch") return 0;
  // **A declared alignment with no slack on that axis is a counted no-op**
  // (C29 I8, §8a A6) — a `GROW` sibling consumes the slack by definition, so
  // the field is set and nothing happens. Counting it makes *why is my
  // alignment ignored* a number rather than a reading of the source.
  if (slack <= 0) {
    counts.alignNoOp += 1;
    return 0;
  }
  // **Integer centring rounds down**, one leftover cell to the right or bottom.
  if (align === "c") return Math.floor(slack / 2); // cells-ok — a cell count
  return align === "r" || align === "b" ? slack : 0;
}

/** Pass 5 — positions, parent-relative (C29 §2, §4). */
function position(node: Node, counts: SolveCounts): void {
  const kids = node.children;
  if (kids.length === 0) return; // cells-ok — a child count
  const px = insets(node, "x");
  const py = insets(node, "y");
  const row = (node.box.direction ?? "column") === "row";
  const gaps = gapsOf(node, row ? px.inner : py.inner);
  // The gap the clamp left, per space rather than in total, so the slack the
  // alignment reads and the cursor the children walk are the same arithmetic.
  const step = kids.length > 1 ? // cells-ok — a child count
     Math.floor(gaps / (kids.length - 1)) : 0; // cells-ok — a cell count
  const used = kids.reduce((a, c) => a + (row ? c.w : c.h), 0) + step * Math.max(0, kids.length - 1); // cells-ok — a child count
  const mainSlack = (row ? px.inner : py.inner) - used;
  const start = offsetOf(row ? node.box.align?.x : node.box.align?.y, mainSlack, counts);

  let cursor = (row ? px.near : py.near) + start;
  for (const child of kids) {
    if (row) {
      child.x = cursor;
      // **A child solving to zero keeps its gap** (C29 I7, §8a A7): a dropped
      // child is gone and takes its separator with it, and a child at zero is
      // present. A row whose gaps appear and disappear with its contents'
      // widths is a row that jitters.
      cursor += child.w + step;
      child.y = py.near + offsetOf(node.box.align?.y, py.inner - child.h, counts);
    } else {
      child.y = cursor;
      cursor += child.h + step;
      child.x = px.near + offsetOf(node.box.align?.x, px.inner - child.w, counts);
    }
    position(child, counts);
  }
}

/** The root's own size against the width it was given (C29 §4, I14). */
function rootWidth(node: Node, width: number): number {
  const size = node.box.width ?? FIT;
  const available = Math.max(0, Math.floor(width)); // cells-ok — a cell count
  switch (size.kind) {
    case "fixed":
      return size.n;
    case "fit":
      return clamp(Math.min(node.natW, available), lo(size), hi(size));
    case "grow":
      return clamp(available, lo(size), hi(size));
    case "percent":
      return clamp(Math.floor(size.p * available), lo(size), hi(size)); // cells-ok — a cell count
  }
}

const freeze = (node: Node): SolvedBox => ({
  id: node.box.id,
  rect: { x: node.x, y: node.y, width: node.w, height: node.h },
  ...(node.box.clip === undefined
    ? {}
    : {
        clip: {
          x: node.box.clip.x ?? false,
          y: node.box.clip.y ?? false,
          offset: { x: node.box.clip.offset?.x ?? 0, y: node.box.clip.offset?.y ?? 0 },
        },
      }),
  // **The leaf carried out is the one pass 3 measured**, wrap included. A
  // second read of the rows at compose time would be a second answer to the
  // question C29 I12 exists to have one answer to.
  ...(node.leaf === undefined
    ? {}
    : {
        leaf:
          node.leaf.kind === "rows" && node.wrapped !== undefined
            ? { kind: "rows" as const, rows: node.wrapped }
            : node.leaf,
      }),
  children: node.children.map(freeze),
});

/** Passes 1 to 4, which is where `measure` stops (C29 I12). */
function solveSize(box: Box, width: number, counts: SolveCounts): Node {
  const root = build(box);
  fitWidth(root);
  root.w = rootWidth(root, width);
  growWidth(root, counts);
  fitHeight(root);
  // **The root has no available height to grow into** — `measure` takes a width
  // and nothing else (C29 I13) — so a `GROW` root resolves to its own floor,
  // which `naturalOf` has already put in `natH`.
  root.h = root.natH;
  growHeight(root, counts);
  return root;
}

/**
 * The solved tree, all five passes (C29 §2).
 *
 * **Pure and total**: the tree and the width are the only inputs, and no input
 * makes it throw (C29 I13, I16 — a contradictory declaration is refused at
 * construction, because `measure` may not throw and a throw mid-pass would
 * abandon a half-solved tree).
 */
export function layout(box: Box, width: number): SolvedBox {
  return layoutCounted(box, width).solved;
}

/** `layout`, with the numbers a frame assertion cannot see (C29 I5, I8). */
export function layoutCounted(box: Box, width: number): { solved: SolvedBox; counts: SolveCounts } {
  const counts: SolveCounts = { rounds: [], alignNoOp: 0 };
  const root = solveSize(box, width, counts);
  position(root, counts);
  return { solved: freeze(root), counts };
}

/**
 * The height, without building pass 5's product (C29 I12).
 *
 * **It equals `compose(layout(box, w)).length` because both halves build the
 * same tree and run the same passes** — C09 I1 by construction rather than as a
 * written pair tested as a pair, which is the property a solver dependency was
 * going to buy.
 */
export function measure(box: Box, width: number): number {
  const counts: SolveCounts = { rounds: [], alignNoOp: 0 };
  return solveSize(box, width, counts).h;
}

