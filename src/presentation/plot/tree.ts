/**
 * `tree` — the fourth reading of `hierarchy`, and the first about structure
 * (C12 I57, §3ah).
 *
 * **Three layouts of one drawing, not a ladder.** Measured over four trees, the
 * top-down figure is the cheapest of the three in rows on a broad tree (3) and
 * the dearest on a deep one (13) while its columns invert with it, so no
 * ordering by budget exists — not even one depending only on the budget, since
 * which layout is cheapest depends on the tree. And all three draw the same
 * names and the same edges, which is C12 I34's own test for a rung failed three
 * times in the same way. So `plotDetail` is refused on the form and the choice
 * is `treeLayout`.
 *
 * **`value` is not read here.** A tree is placed by shape alone; a magnitude a
 * caller wants visible goes in the name — `label: "gc (2.1s)"` — which is what
 * `HierarchyNode.value`'s doc says beside the ruling, because a bare refusal
 * leaves *a field that does nothing* reading as one not yet implemented.
 *
 * **Pure geometry, and the styling is the caller's.** This module returns plain
 * text rows and the names it had to drop; `definition.ts` tones them and adds
 * the notice row. That direction because `emptyRows`, `composeRows` and the
 * tones all live there, and a module the dispatch imports cannot import it back.
 */
import { cells } from "../text.js";
import { glyphForMask, LINE_DOWN, LINE_LEFT, LINE_RIGHT, LINE_UP } from "./linedraw.js";
import { grid, paint, setMask, write } from "./chargrid.js";
import type { Grid } from "./chargrid.js";
import { HIERARCHY_MAX_DEPTH, type HierarchyNode } from "../../data/viewmodel/index.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";

/** The three layouts, in `"auto"`'s preference order. */
export const TREE_LAYOUTS = ["topDown", "leftRight", "outline"] as const;

export type TreeLayoutName = (typeof TREE_LAYOUTS)[number];

type Caps = Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">;

/** A node flattened out of the recursion, in pre-order. */
type Flat = Readonly<{ label: string; depth: number; parent: number; kids: readonly number[] }>;

/** Which nodes survived truncation, indexed as `Flat` is. */
type Kept = readonly boolean[];

/** What a layout needs to draw the whole of what it was given. */
type Size = Readonly<{ rows: number; columns: number }>;

/** The gap between a depth column and the next in the left-to-right layout. */
const LR_EDGE = 2;

/** `├── ` and its two relatives are four cells wide, in both alphabets. */
const OUTLINE_INDENT = 4;

// --------------------------------------------------------------- the tree

/**
 * A node flattened out of the recursion — **the topology, and it is shared**
 * (§3aj.6).
 *
 * Exported because the SVG arm needs the structure and **not** the placement:
 * `tdWidth` measures a subtree by the widest label under it, so where a node
 * goes is a function of text measurement and the two arms measure text
 * differently by construction. This is the half that is neither.
 */
export type FlatNode = Flat;

export function flatten(root: HierarchyNode): readonly Flat[] {
  const out: { label: string; depth: number; parent: number; kids: number[] }[] = [];
  const walk = (node: HierarchyNode, depth: number, parent: number): void => { // cells-ok — a depth index
    const here = out.length; // cells-ok — a node index
    out.push({ label: node.label, depth, parent, kids: [] });
    if (parent >= 0) out[parent]!.kids.push(here); // cells-ok — a node index
    // The bound the gate already enforces, repeated because a fixture reaches a
    // renderer without passing either gate (C12 I2) and this walk recurses.
    if (depth >= HIERARCHY_MAX_DEPTH) return; // cells-ok — a depth index
    for (const kid of node.children ?? []) walk(kid, depth + 1, here); // cells-ok — a depth index
  };
  walk(root, 0, -1);
  return out;
}

const keptKids = (nodes: readonly Flat[], kept: Kept, i: number): readonly number[] =>
  nodes[i]!.kids.filter((k) => kept[k] === true); // cells-ok — a node index

const keptCount = (kept: Kept): number => kept.filter(Boolean).length; // cells-ok — a node count

const keptDepth = (nodes: readonly Flat[], kept: Kept): number =>
  nodes.reduce((m, n, i) => (kept[i] === true ? Math.max(m, n.depth) : m), 0); // cells-ok — a depth index

/** The kept nodes with no kept children — a row each in the left-to-right form. */
const keptLeaves = (nodes: readonly Flat[], kept: Kept): readonly number[] =>
  nodes.map((_n, i) => i).filter((i) => kept[i] === true && keptKids(nodes, kept, i).length === 0); // cells-ok — a node index

// ------------------------------------------------------- the natural sizes

/**
 * A subtree's width in the top-down layout.
 *
 * **The `max` is the interaction, and a plan formula did not have it.** That
 * formula was the sum of the leaf widths plus gaps, which gives 5 on a tree
 * whose parent is `initialiseRenderer` over two children of one cell, where the
 * measurement gives 20: a parent's own name can be wider than everything
 * beneath it, and then the parent sets the width. Without it the name is drawn
 * over its siblings and **every count still agrees** — the leaf positions, the
 * depth, the node total (C12 §3ah.2).
 */
function tdWidth(nodes: readonly Flat[], kept: Kept, i: number, caps: Caps): number {
  const own = cells(nodes[i]!.label, caps.ambiguousWidth);
  const kids = keptKids(nodes, kept, i);
  if (kids.length === 0) return own; // cells-ok — a child count
  const span =
    kids.reduce((s, k) => s + tdWidth(nodes, kept, k, caps), 0) + kids.length - 1; // cells-ok — a cell count
  return Math.max(own, span); // cells-ok — a cell count
}

function sizeOf(nodes: readonly Flat[], kept: Kept, layout: TreeLayoutName, caps: Caps): Size {
  const depth = keptDepth(nodes, kept);
  if (layout === "outline") {
    const columns = nodes.reduce(
      (m, n, i) =>
        kept[i] === true
          ? Math.max(m, OUTLINE_INDENT * n.depth + cells(n.label, caps.ambiguousWidth)) // cells-ok — a cell count
          : m,
      0,
    );
    return { rows: keptCount(kept), columns };
  }
  if (layout === "topDown") {
    if (kept[0] !== true) return { rows: 0, columns: 0 }; // cells-ok — a row count
    return { rows: 2 * depth + 1, columns: tdWidth(nodes, kept, 0, caps) }; // cells-ok — a row count
  }
  const widest = widestPerDepth(nodes, kept, caps);
  const columns = widest.reduce((s, w) => s + w, 0) + LR_EDGE * depth; // cells-ok — a cell count
  return { rows: keptLeaves(nodes, kept).length, columns }; // cells-ok — a row count
}

/** The widest kept label at each depth — the left-to-right layout's columns. */
function widestPerDepth(nodes: readonly Flat[], kept: Kept, caps: Caps): readonly number[] {
  const out: number[] = [];
  for (const [i, n] of nodes.entries()) { // cells-ok — a node index
    if (kept[i] !== true) continue;
    out[n.depth] = Math.max(out[n.depth] ?? 0, cells(n.label, caps.ambiguousWidth)); // cells-ok — a cell count
  }
  return out.map((w) => w ?? 0); // cells-ok — a cell count
}

// ------------------------------------------------------------ truncation

/**
 * The kept set at step `k` of a layout's own drop sequence.
 *
 * **The sequence is part of the layout**, so the count in the notice is a
 * property of the layout rather than of the tree: the same tree in the same box
 * reports a different `+N` under two layouts, which is correct rather than an
 * inconsistency (C12 §3ah.4).
 */
function subsetAt(nodes: readonly Flat[], layout: TreeLayoutName, k: number): Kept {
  const kept = new Array<boolean>(nodes.length).fill(false); // cells-ok — a node count
  if (layout === "outline") {
    // A pre-order prefix is closed under ancestors, so it is always a tree.
    for (let i = 0; i < Math.min(k, nodes.length); i += 1) kept[i] = true; // cells-ok — a node index
    return kept;
  }
  if (layout === "topDown") {
    for (const [i, n] of nodes.entries()) kept[i] = n.depth <= k; // cells-ok — a depth index
    return kept;
  }
  const leaves = nodes.map((_n, i) => i).filter((i) => nodes[i]!.kids.length === 0); // cells-ok — a node index
  for (const leaf of leaves.slice(0, Math.max(1, k))) { // cells-ok — a leaf count
    for (let i = leaf; i >= 0; i = nodes[i]!.parent) kept[i] = true; // cells-ok — a node index
  }
  return kept;
}

/** The last step of a layout's own drop sequence — the whole tree. */
function fullStep(nodes: readonly Flat[], layout: TreeLayoutName): number {
  if (layout === "outline") return nodes.length; // cells-ok — a node count
  if (layout === "topDown") return nodes.reduce((m, n) => Math.max(m, n.depth), 0); // cells-ok — a depth index
  return nodes.filter((n) => n.kids.length === 0).length; // cells-ok — a leaf count
}

/**
 * The kept sets a layout will try, largest first.
 *
 * **Each layout's own sequence, and then the tail all three share** — a
 * pre-order prefix down to the root. The tail is not tidiness: **a sequence
 * keyed on a layout's own axis cannot reach every budget.** A depth cut cannot
 * narrow a broad tree and a leaf cut cannot narrow a deep one, and the measured
 * case is a chain one column short of its left-to-right width, where the leaf
 * sequence had exactly one step, nothing was dropped, and a name was **silently
 * clipped** instead — which §3n forbids in as many words. The own-axis phase
 * comes first because it is what makes the drawing readable: a top-down figure
 * cut by depth keeps a whole level, where a prefix keeps one branch.
 */
function* candidates(nodes: readonly Flat[], layout: TreeLayoutName): Generator<Kept> {
  if (layout !== "outline") {
    for (let k = fullStep(nodes, layout); k >= 0; k -= 1) yield subsetAt(nodes, layout, k); // cells-ok — a step index
  }
  for (let k = nodes.length; k >= 0; k -= 1) yield subsetAt(nodes, "outline", k); // cells-ok — a node count
}

/** The largest kept set of `layout`'s sequence that fits, down to nothing. */
function fitTo(
  nodes: readonly Flat[], layout: TreeLayoutName, rows: number, columns: number, caps: Caps,
): Kept {
  for (const kept of candidates(nodes, layout)) {
    const size = sizeOf(nodes, kept, layout, caps);
    if (size.rows <= rows && size.columns <= columns) return kept; // cells-ok — a row count
  }
  return new Array<boolean>(nodes.length).fill(false); // cells-ok — a node count
}

/**
 * Which layout to draw (C12 I57).
 *
 * **`"auto"` is a fit and not a rung.** The first of top-down, left-to-right,
 * outline whose natural size fits both axes — top-down because it is what *a
 * tree diagram* means, left-to-right because a terminal is wide and short and a
 * broad tree is what it survives, the outline last because it is the reading a
 * `pre` block could already have given the caller.
 *
 * **Where none fits, the one that keeps the most nodes**, ties by the same
 * order. Not the smallest overflow: overflow is measured in rows and columns and
 * the two are not comparable, where nodes kept is what the figure is about. The
 * budget in that branch is `rows − 1`, because the notice has already taken its
 * row — spent before the choice rather than after it, so the notice cannot
 * remove itself by making the drawing fit (C12 §3ah.4).
 */
function chooseLayout(
  nodes: readonly Flat[], rows: number, columns: number, caps: Caps,
): TreeLayoutName {
  const whole = new Array<boolean>(nodes.length).fill(true); // cells-ok — a node count
  for (const layout of TREE_LAYOUTS) {
    const size = sizeOf(nodes, whole, layout, caps);
    if (size.rows <= rows && size.columns <= columns) return layout; // cells-ok — a row count
  }
  let best: TreeLayoutName = TREE_LAYOUTS[0];
  let most = -1; // cells-ok — a node count
  for (const layout of TREE_LAYOUTS) {
    const n = keptCount(fitTo(nodes, layout, Math.max(1, rows - 1), columns, caps)); // cells-ok — a row count
    if (n > most) { best = layout; most = n; } // cells-ok — a node count
  }
  return best;
}

// ------------------------------------------------------------ the layouts

/**
 * Top-down — Reingold–Tilford, one label row and one connector row per level.
 *
 * **A parent is centred on its children's own centres, never on its block.**
 * Centring the label in the block and the children's span in the same block
 * agrees only when the two parities agree; where they differ the parent sits one
 * column off its children and every count still agrees — the node total, the
 * depth, the width, the leaf positions. Only the frame can see it, which is the
 * defect this layout was predicted to have and the reason the centre is taken
 * from the children rather than from the box (C12 §3ah.8 A).
 */
function drawTopDown(
  nodes: readonly Flat[], kept: Kept, g: Grid, caps: Caps,
): void {
  const centre = new Array<number>(nodes.length).fill(0); // cells-ok — a column position
  const width = g.text[0]?.length ?? 0; // cells-ok — a cell count
  const total = tdWidth(nodes, kept, 0, caps);
  const lead = Math.max(0, Math.floor((width - total) / 2)); // cells-ok — a column position

  const place = (i: number, x0: number): void => { // cells-ok — a column position
    const label = nodes[i]!.label;
    const own = cells(label, caps.ambiguousWidth);
    const kids = keptKids(nodes, kept, i);
    const block = tdWidth(nodes, kept, i, caps);
    let labelX = x0; // cells-ok — a column position
    if (kids.length > 0) { // cells-ok — a child count
      const span =
        kids.reduce((s, k) => s + tdWidth(nodes, kept, k, caps), 0) + kids.length - 1; // cells-ok — a cell count
      let cursor = x0 + Math.floor((block - span) / 2); // cells-ok — a column position
      for (const kid of kids) {
        place(kid, cursor);
        cursor += tdWidth(nodes, kept, kid, caps) + 1; // cells-ok — a column position
      }
      const mid = Math.floor((centre[kids[0]!]! + centre[kids[kids.length - 1]!]!) / 2); // cells-ok — a column position
      labelX = Math.max(x0, mid - Math.floor((own - 1) / 2)); // cells-ok — a column position
    }
    centre[i] = labelX + Math.floor((own - 1) / 2); // cells-ok — a column position
    write(g.text[2 * nodes[i]!.depth]!, labelX, label, caps); // cells-ok — a row index
  };
  place(0, lead);

  for (const [i, node] of nodes.entries()) { // cells-ok — a node index
    if (kept[i] !== true) continue;
    const kids = keptKids(nodes, kept, i);
    if (kids.length === 0) continue; // cells-ok — a child count
    const row = 2 * node.depth + 1; // cells-ok — a row index
    const first = Math.min(...kids.map((k) => centre[k]!)); // cells-ok — a column position
    const last = Math.max(...kids.map((k) => centre[k]!)); // cells-ok — a column position
    // **The bar, then the turns, through one mask.** A fan of one leaves `first`
    // and `last` equal, so no horizontal bit is ever set and the cell resolves
    // to `│` — the two cases differ in the frame rather than in a special case
    // (C12 §3ah.5).
    for (let c = first; c <= last; c += 1) { // cells-ok — a column position
      setMask(g, row, c, (c > first ? LINE_LEFT : 0) | (c < last ? LINE_RIGHT : 0));
    }
    for (const kid of kids) setMask(g, row, centre[kid]!, LINE_DOWN);
    setMask(g, row, centre[i]!, LINE_UP);
  }
}

/** Left-to-right — the same node-link figure turned ninety degrees. */
function drawLeftRight(
  nodes: readonly Flat[], kept: Kept, g: Grid, caps: Caps,
): void {
  const widest = widestPerDepth(nodes, kept, caps);
  const colStart: number[] = []; // cells-ok — a column position
  for (let d = 0; d < widest.length; d += 1) { // cells-ok — a depth index
    colStart[d] = d === 0 ? 0 : colStart[d - 1]! + widest[d - 1]! + LR_EDGE; // cells-ok — a column position
  }

  // **Rows are the kept leaves, and a parent is the midpoint of its own.**
  // Sibling subtrees hold disjoint leaf ranges and a midpoint lies inside its
  // range, so two nodes at one depth cannot share a row — it falls out of the
  // in-order rule rather than needing a check (C12 §3ah.2).
  const row = new Array<number>(nodes.length).fill(0); // cells-ok — a row index
  for (const [n, leaf] of keptLeaves(nodes, kept).entries()) row[leaf] = n; // cells-ok — a row index
  for (let i = nodes.length - 1; i >= 0; i -= 1) { // cells-ok — a node index
    const kids = keptKids(nodes, kept, i);
    if (kept[i] !== true || kids.length === 0) continue; // cells-ok — a child count
    row[i] = Math.floor((row[kids[0]!]! + row[kids[kids.length - 1]!]!) / 2); // cells-ok — a row index
  }

  for (const [i, node] of nodes.entries()) { // cells-ok — a node index
    if (kept[i] !== true) continue;
    const x = colStart[node.depth] ?? 0; // cells-ok — a column position
    write(g.text[row[i]!]!, x, node.label, caps);
    const kids = keptKids(nodes, kept, i);
    if (kids.length === 0) continue; // cells-ok — a child count
    const turn = x + widest[node.depth]!; // cells-ok — a column position
    // The stub from the name's own end to the turn column, so a short label is
    // still joined to its children rather than floating a gap away from them.
    for (let c = x + cells(node.label, caps.ambiguousWidth); c < turn; c += 1) { // cells-ok — a column position
      setMask(g, row[i]!, c, LINE_LEFT | LINE_RIGHT);
    }
    const first = Math.min(...kids.map((k) => row[k]!)); // cells-ok — a row index
    const last = Math.max(...kids.map((k) => row[k]!)); // cells-ok — a row index
    for (let r = first; r <= last; r += 1) { // cells-ok — a row index
      setMask(g, r, turn, (r > first ? LINE_UP : 0) | (r < last ? LINE_DOWN : 0));
    }
    setMask(g, row[i]!, turn, LINE_LEFT);
    for (const kid of kids) {
      setMask(g, row[kid]!, turn, LINE_RIGHT);
      setMask(g, row[kid]!, turn + 1, LINE_LEFT | LINE_RIGHT); // cells-ok — a column position
    }
  }
}

/** The indented outline — `tree(1)`, and the glyphs come from the same table. */
function drawOutline(
  nodes: readonly Flat[], kept: Kept, g: Grid, caps: Caps, corners: "rounded" | "sharp",
): void {
  // **The real sibling list, not the kept one** — read off the overflow frame.
  // `╰──` is a claim: *this is the last child*. Computed over what survived
  // truncation it said `╰── render` on a root whose `layout` and `parse` were in
  // the notice one row below, so the glyph and the notice contradicted each
  // other. The other two layouts have no such glyph — an absent fan claims
  // nothing — which is why this is the one layout the reading applies to, and
  // why it is invisible at `unicode: "ascii"`, where both forms substitute to
  // `+` and the distinction the claim is made in does not exist.
  const isLast = (i: number): boolean => {
    const parent = nodes[i]!.parent;
    if (parent < 0) return true; // cells-ok — a node index
    const siblings = nodes[parent]!.kids;
    return siblings[siblings.length - 1] === i; // cells-ok — a node index
  };
  // **Every one of these is `OUTLINE_INDENT` cells wide**, derived rather than
  // written out: the constant sized the layout and padded the blank
  // continuation while the bar and the branch were hardcoded four-cell strings,
  // so the measurement and the drawing agreed by coincidence. The mutation pass
  // is what said so — changing the constant left the figure four cells wide and
  // its declared width two, and the row that caught it was about a natural size
  // rather than about an indent.
  const rule = glyphForMask(LINE_LEFT | LINE_RIGHT, corners, caps);
  const run = rule.repeat(Math.max(0, OUTLINE_INDENT - 2)); // cells-ok — a cell count
  const bar = glyphForMask(LINE_UP | LINE_DOWN, corners, caps) + " ".repeat(OUTLINE_INDENT - 1); // cells-ok — a cell count
  const branch = `${glyphForMask(LINE_UP | LINE_DOWN | LINE_RIGHT, corners, caps)}${run} `;
  const elbow = `${glyphForMask(LINE_UP | LINE_RIGHT, corners, caps)}${run} `;

  let r = 0; // cells-ok — a row index
  for (const [i, node] of nodes.entries()) { // cells-ok — a node index
    if (kept[i] !== true) continue;
    // The ancestors, root-first, excluding the node itself: each contributes a
    // continuation bar where it has a later kept sibling and blanks where not.
    const chain: number[] = []; // cells-ok — a node index
    for (let a = node.parent; a >= 0; a = nodes[a]!.parent) chain.unshift(a); // cells-ok — a node index
    const prefix =
      chain
        .slice(1)
        .map((a) => (isLast(a) ? " ".repeat(OUTLINE_INDENT) : bar))
        .join("") + (node.depth === 0 ? "" : (isLast(i) ? elbow : branch));
    write(g.text[r]!, 0, `${prefix}${node.label}`, caps);
    r += 1; // cells-ok — a row index
  }
}

// ------------------------------------------------------------- the entry

/**
 * The plot area of a `tree`, and the names that did not fit (C12 I57).
 *
 * `rows` is one shorter than the budget where anything was dropped, leaving the
 * caller the row for the notice — which is I8's mechanism and the caller's to
 * tone, because a node not drawn is data going missing. **That is the opposite
 * of the neighbouring form's ruling and the reason is the figure**: a tile has
 * an extent and keeps its datum when its name is dropped, where a tree node
 * *is* its name (C12 §3ah.7).
 */
export function treeArea(
  root: HierarchyNode,
  areaRows: number,
  width: number,
  declared: TreeLayoutName | "auto" | undefined,
  caps: Caps,
  corners: "rounded" | "sharp",
): { rows: readonly string[]; dropped: readonly string[]; layout: TreeLayoutName } {
  const nodes = flatten(root);
  const layout =
    declared === undefined || declared === "auto"
      ? chooseLayout(nodes, areaRows, width, caps)
      : declared;

  const whole = new Array<boolean>(nodes.length).fill(true); // cells-ok — a node count
  const natural = sizeOf(nodes, whole, layout, caps);
  const fits = natural.rows <= areaRows && natural.columns <= width; // cells-ok — a row count
  // **The notice takes the row rather than sharing it.** Clamping this to one
  // gave the drawing the only row there was and left the notice nowhere to go,
  // so a tree that did not fit rendered its figure and said nothing about what
  // was missing — I8's exact subject, arriving through a `Math.max` (§3ah.4).
  const budget = fits ? areaRows : areaRows - 1; // cells-ok — a row count
  const kept = fits ? whole : fitTo(nodes, layout, budget, width, caps);

  const g = grid(Math.max(0, budget), width); // cells-ok — a row count
  if (keptCount(kept) === 0) return { rows: paint(g, corners, caps), dropped: nodes.map((n) => n.label), layout }; // cells-ok — a node count
  if (layout === "topDown") drawTopDown(nodes, kept, g, caps);
  else if (layout === "leftRight") drawLeftRight(nodes, kept, g, caps);
  else drawOutline(nodes, kept, g, caps, corners);

  const dropped = nodes.filter((_n, i) => kept[i] !== true).map((n) => n.label); // cells-ok — a node index
  return { rows: paint(g, corners, caps), dropped, layout };
}
