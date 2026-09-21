/**
 * A solved tree to rows, through C09's own composers (C29 §2, I12).
 *
 * **`compose` is not new.** It writes `Placed` and hands it to `placeRows`,
 * which already composes a grid of pieces into rows, already cuts a row to its
 * cell and already sorts by column — the last of which is F1213, where 440
 * goldens, 2,440 baseline frames and 6,265 test rows all agreed while a mosaic
 * was missing two of five cells. A second composer would be a second place for
 * that to be wrong.
 */
import { placeRows, type Placed } from "../rows.js";
import { sliceCells } from "../text.js";
import type { SolvedBox, SolvedFloat } from "./types.js";

/** An absolute rectangle a leaf's rows are cut to (C29 I15). */
export type Window = Readonly<{ x: number; y: number; w: number; h: number }>;

/**
 * Where a box ended up and what it is drawn through — C29 §7f, I22.
 *
 * **The composited rect and not the flow rect**, which is the whole of why this
 * is built here rather than in `solve`: a box on row 9 of a list scrolled to
 * row 3 is on screen row 6, and `SolvedBox.rect` says 9 either way. A float
 * attached to it belongs where it is drawn, not where flow put it — and at
 * `offset 0` the two agree, so a fixture written there tests nothing.
 */
export type Sited = Readonly<{ rect: Window; window: Window }>;

/**
 * The floats a walk found, each beside the site of the box that declared it.
 *
 * Document order, because that is the only total order a tree supplies and the
 * walk is stable (walk C7).
 */
export type FoundFloat = Readonly<{ float: SolvedFloat; parent: Sited }>;

/** What one walk of a solved tree produces besides its rows (C29 §7f). */
export type Sites = Readonly<{
  /** Every non-float box by id — **first match in document order wins** (walk C5). */
  byId: ReadonlyMap<string, Sited>;
  floats: readonly FoundFloat[];
}>;

const intersect = (a: Window, b: Window): Window => {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x),
    h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y),
  };
};

/**
 * One leaf, cut to the window its ancestors left it (C29 I15).
 *
 * **A clip never changes a measured height.** The height was committed in pass
 * 3 and pass 4 (C09 I1), and a clip that shortened it would make the
 * measurement false one frame later — so the cut happens here, where nothing
 * reports a number, and never in a pass.
 */
function cut(placed: Placed, window: Window): Placed | undefined {
  const box: Window = {
    x: placed.x,
    y: placed.top,
    w: placed.width,
    h: placed.height ?? placed.rows.length, // cells-ok — a row count
  };
  const seen = intersect(box, window);
  if (seen.w === 0 || seen.h === 0) return undefined;
  const from = seen.y - placed.top;
  const rows = placed.rows.slice(from, from + seen.h);
  const left = seen.x - placed.x;
  return {
    x: seen.x,
    top: seen.y,
    width: seen.w,
    height: seen.h,
    rows: left === 0 ? rows : rows.map((row) => sliceCells(row, left, left + seen.w)),
  };
}

type Walk = { readonly byId: Map<string, Sited>; readonly floats: FoundFloat[] };

function collect(node: SolvedBox, ox: number, oy: number, window: Window, out: Placed[], walk: Walk): void {
  const x = ox + node.rect.x;
  const y = oy + node.rect.y;
  const own: Window = { x, y, w: node.rect.width, h: node.rect.height };

  // **Sited where it is drawn, and recorded for every box** (C29 §7f, I22). A
  // float attaches to a box by id and the id may name a leaf, so this is before
  // the leaf's return rather than after it — and **first match wins**, because
  // `Box.id` has no uniqueness rule and a throw would make a float's validity
  // depend on a box two subtrees away that it does not name (walk C5).
  if (!walk.byId.has(node.id)) walk.byId.set(node.id, { rect: own, window });
  for (const float of node.floats ?? []) {
    walk.floats.push({ float, parent: { rect: own, window } });
  }

  const leaf = node.leaf;
  if (leaf !== undefined) {
    const rows = leaf.kind === "rows" ? leaf.rows : leaf.render(node.rect.width, node.rect.height);
    const piece = cut({ x, top: y, width: node.rect.width, height: node.rect.height, rows }, window);
    if (piece !== undefined) out.push(piece);
    return;
  }

  // **`clip` is per axis and `offset` is how scroll works** (C29 I15): the
  // container clips and the child is placed at a negative offset. One mechanism
  // for mosaic cells, scroll blocks and attached terminals.
  const clip = node.clip;
  const inner = clip === undefined ? window : intersect(window, {
    x: clip.x ? own.x : window.x,
    y: clip.y ? own.y : window.y,
    w: clip.x ? own.w : window.w,
    h: clip.y ? own.h : window.h,
  });
  const dx = x - (clip?.offset.x ?? 0);
  const dy = y - (clip?.offset.y ?? 0);

  // **A sticky child sits the offset out, and is collected first** (C29 I21,
  // §7c).
  //
  // Two rules, and `LAYOUT_ENGINE.md` §14 states one. Skipping the offset is
  // what makes a header stay while its body scrolls; **order is what makes it
  // visible**, because a sticky child sits where flow put it and its scrolling
  // siblings land on the same rows.
  //
  // **First and not last, and the frame is what settled that** (F1234). The
  // obvious reading is a painter's: draw the sticky child after everything so
  // it covers them. This compositor is not a painter — `composeRow` walks a
  // **cursor** left to right and cuts a piece that starts behind it, so the
  // piece composited *later* at the same column is the one that loses. Written
  // last, `sticky: "top"` produced a frame byte-identical to no sticky at all:
  // the field was read, the piece was emitted, and the row it belonged on had
  // already been claimed. **A ruling that names an operation checks the
  // operation exists** — and this one assumed a mechanism the layer below does
  // not have.
  //
  // Nothing else in the engine reads the field: a sticky child's `rect` is its
  // flow rect, it displaces its siblings like any other, and the scrollable
  // area is what remains.
  for (const child of node.children) {
    if (child.sticky === undefined) continue;
    // `"top"` keeps the position flow gave it, against the container's own
    // origin. `"bottom"` is pinned to the far edge — the same exclusion said
    // from the other end, and the arithmetic cancels the child's own flow `y`
    // so a footer declared anywhere lands on the last row.
    const oyOf =
      child.sticky === "bottom" ? y + own.h - child.rect.height - child.rect.y : y; // cells-ok — a row count
    collect(child, x, oyOf, inner, out, walk);
  }
  for (const child of node.children) {
    if (child.sticky === undefined) collect(child, dx, dy, inner, out, walk);
  }
}

/** The rows a solved tree draws — `measure` is their count, by construction (C29 I12). */
export function compose(solved: SolvedBox): readonly string[] {
  return composeSited(solved).rows;
}

/**
 * The same walk, with what a float needs to be placed — C29 §7f, I22.
 *
 * **One walk and two products, never two walks.** The composited rect of every
 * box is a by-product of drawing it, and a second traversal computing the same
 * offsets is a second place for `clip.offset` to be applied differently — which
 * is F1213's shape, where every count agreed while a mosaic was missing two of
 * five cells.
 */
export function composeSited(solved: SolvedBox): { readonly rows: readonly string[]; readonly sites: Sites } {
  const out: Placed[] = [];
  const window: Window = { x: 0, y: 0, w: solved.rect.width, h: solved.rect.height };
  const walk: Walk = { byId: new Map(), floats: [] };
  collect(solved, 0, 0, window, out, walk);
  return { rows: placeRows(out, solved.rect.height), sites: { byId: walk.byId, floats: walk.floats } };
}
