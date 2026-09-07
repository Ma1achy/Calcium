/**
 * The three forms whose subject is **containment** — `flame`, `icicle`, `treemap`.
 *
 * **`flame` and `icicle` shipped as `barRow` with the labels suppressed**, so
 * they were a bar chart and a reversed bar chart: correct in every count and
 * about nothing. A flame graph's whole content is that a frame *sits on* the one
 * beneath it and spans a sub-range of it; a bar chart has no way to say either.
 *
 * One layout function serves the first two and a second serves the third,
 * because what they share is the tree and what they disagree about is how a
 * subtree occupies space — a strip along one axis, or a rectangle.
 */
import type { HierarchyNode } from "../../data/viewmodel/index.js";

/** A node placed on the unit interval at a depth. */
export type Strip = Readonly<{
  label: string;
  depth: number;
  from: number;
  to: number;
  index: number;
}>;

/** A node placed in the unit square. */
export type Tile = Readonly<{
  label: string;
  x0: number; y0: number; x1: number; y1: number;
  depth: number;
  index: number;
}>;

/**
 * A node's extent — its own value, or its subtree's, whichever is larger.
 *
 * A parent stating less than its children sum to is ordinary in profiling data
 * (self time against total time), and taking the stated value would draw the
 * children outside the parent that contains them.
 */
function extentOf(node: HierarchyNode): number {
  // **`value` is optional since `tree` joined the field** (C04 I64): absent is
  // zero here, which is what the three magnitude forms already did with a
  // non-finite one — and the gate refuses an absent value on all three, so a
  // node reaching this without one came through a fixture (C12 I2).
  const own = typeof node.value === "number" && Number.isFinite(node.value)
    ? Math.max(0, node.value)
    : 0;
  const kids = (node.children ?? []).reduce((sum: number, c: HierarchyNode) => sum + extentOf(c), 0);
  return Math.max(own, kids);
}

/**
 * The tree as strips on the unit interval, depth 0 at the root.
 *
 * Children divide their parent's span in order and in proportion, so a child is
 * always inside its parent — the containment is structural rather than something
 * the layout could get wrong for particular data.
 */
export function strips(root: HierarchyNode): readonly Strip[] {
  const out: Strip[] = [];
  let counter = 0; // cells-ok — a node count
  const walk = (node: HierarchyNode, depth: number, from: number, to: number): void => {
    out.push({ label: node.label, depth, from, to, index: counter++ }); // cells-ok — a node count
    const kids = node.children ?? [];
    const total = kids.reduce((sum: number, c: HierarchyNode) => sum + extentOf(c), 0);
    if (total <= 0 || kids.length === 0) return; // cells-ok — a child count
    const span = to - from;
    let cursor = from;
    for (const kid of kids) {
      const width = (extentOf(kid) / total) * span;
      walk(kid, depth + 1, cursor, cursor + width);
      cursor += width;
    }
  };
  walk(root, 0, 0, 1);
  return out;
}

/**
 * The tree as tiles in the unit square — squarified, per Bruls, Huizing and
 * van Wijk.
 *
 * **Squarified rather than sliced**, because a slice-and-dice treemap produces
 * long thin slivers whose areas the eye cannot compare, which is the one thing
 * the form exists to let it do. The algorithm lays children along the shorter
 * side of the remaining rectangle and starts a new row when adding the next
 * child would make the current row's worst aspect ratio worse.
 */
export function tiles(root: HierarchyNode, pad = 0): readonly Tile[] {
  const out: Tile[] = [];
  let counter = 0; // cells-ok — a node count

  /** A tile shrunk by `by` on every side, or unchanged where it cannot be. */
  const inset = (t: Tile, by: number): Pick<Tile, "x0" | "y0" | "x1" | "y1"> => {
    const w = t.x1 - t.x0, h = t.y1 - t.y0;
    const dx = w > by * 3 ? by : 0;
    const dy = h > by * 3 ? by : 0;
    return { x0: t.x0 + dx, y0: t.y0 + dy, x1: t.x1 - dx, y1: t.y1 - dy };
  };

  const worst = (row: readonly number[], side: number, sum: number): number => {
    if (row.length === 0 || sum <= 0 || side <= 0) return Number.POSITIVE_INFINITY; // cells-ok — a row length
    const max = Math.max(...row), min = Math.min(...row);
    const s2 = sum * sum, w2 = side * side;
    return Math.max((w2 * max) / s2, s2 / (w2 * min));
  };

  const layout = (
    nodes: readonly HierarchyNode[], depth: number,
    x0: number, y0: number, x1: number, y1: number,
  ): void => {
    if (nodes.length === 0) return; // cells-ok — a node count
    const total = nodes.reduce((sum, n) => sum + extentOf(n), 0);
    if (total <= 0) return;

    let rx0 = x0, ry0 = y0, rx1 = x1, ry1 = y1;
    let remaining = [...nodes];
    let remainingTotal = total;

    while (remaining.length > 0) { // cells-ok — a node count
      const w = rx1 - rx0, h = ry1 - ry0;
      if (w <= 0 || h <= 0) return;
      const horizontal = w >= h;
      const side = horizontal ? h : w;
      // Areas in the units the remaining rectangle is measured in.
      const scale = (w * h) / remainingTotal;
      const row: number[] = [];
      let rowSum = 0;
      let taken = 0; // cells-ok — a node count
      for (const node of remaining) {
        const area = extentOf(node) * scale;
        if (row.length > 0 && worst([...row, area], side, rowSum + area) > worst(row, side, rowSum)) break; // cells-ok — a row length
        row.push(area);
        rowSum += area;
        taken += 1; // cells-ok — a node count
      }

      const thickness = rowSum / side;
      let cursor = horizontal ? ry0 : rx0;
      for (let i = 0; i < taken; i += 1) { // cells-ok — a node count
        const node = remaining[i]!;
        const length = (row[i]! / rowSum) * side;
        const t0 = cursor, t1 = cursor + length;
        const tile: Tile = horizontal
          ? { label: node.label, x0: rx0, y0: t0, x1: rx0 + thickness, y1: t1, depth, index: counter++ } // cells-ok — a node count
          : { label: node.label, x0: t0, y0: ry0, x1: t1, y1: ry0 + thickness, depth, index: counter++ }; // cells-ok — a node count
        out.push(tile);
        // **Children are inset where the parent can spare it**, which is d3's
        // `treemapPadding` and the only thing that makes nesting visible. Filling
        // the parent exactly is arithmetically right and draws a mosaic: the
        // leaves are correct, the siblings are adjacent, and nothing says which
        // ones belong together. The inset is skipped where the rectangle cannot
        // afford it, because a tile shrunk to nothing reports an area of zero.
        const padded = inset(tile, pad);
        layout(node.children ?? [], depth + 1, padded.x0, padded.y0, padded.x1, padded.y1);
        cursor = t1;
      }

      if (horizontal) rx0 += thickness; else ry0 += thickness;
      remaining = remaining.slice(taken);
      remainingTotal -= rowSum / scale;
      if (taken === 0) return; // cells-ok — a node count — a rectangle too small to divide
    }
  };

  layout(root.children ?? [root], 0, 0, 0, 1, 1);
  return out;
}
