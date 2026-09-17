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
import type { SolvedBox } from "./types.js";

/** An absolute rectangle a leaf's rows are cut to (C29 I15). */
type Window = Readonly<{ x: number; y: number; w: number; h: number }>;

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

function collect(node: SolvedBox, ox: number, oy: number, window: Window, out: Placed[]): void {
  const x = ox + node.rect.x;
  const y = oy + node.rect.y;
  const own: Window = { x, y, w: node.rect.width, h: node.rect.height };

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
  for (const child of node.children) collect(child, dx, dy, inner, out);
}

/** The rows a solved tree draws — `measure` is their count, by construction (C29 I12). */
export function compose(solved: SolvedBox): readonly string[] {
  const out: Placed[] = [];
  const window: Window = { x: 0, y: 0, w: solved.rect.width, h: solved.rect.height };
  collect(solved, 0, 0, window, out);
  return placeRows(out, solved.rect.height);
}
