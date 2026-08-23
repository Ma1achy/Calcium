/**
 * `graph` — a layered drawing of a node set and an edge set (C12 I58, §3ai).
 *
 * **Six passes, and the recipe is usually named with three.** Layer assignment
 * by longest path and ordering by median heuristic are the two anybody names;
 * cycle removal, deduplication, dummy nodes and placement are the rest, and
 * every one of them is load-bearing. `deduplicate` is in the list because
 * checking the probe found it rather than because reading the recipe did:
 * reversing `b -> a` where `a -> b` already exists yields the same edge twice,
 * drawn twice and counted twice in every crossing figure, and looking exactly
 * like a correct edge (F242).
 *
 * **The drawing is `tree`'s**, on the shared character grid — labels into the
 * text plane, edges as mask bits, merged by `paint`. A graph is a new placement
 * and not a new drawing technology.
 *
 * **The figure does not claim direction** (§3ai.3). The layering carries it —
 * every edge runs forward by construction, so downward is the direction — and
 * the exception, an edge the cycle pass reversed, is counted in the notice row
 * rather than marked. An arrowhead would need a glyph the set does not have,
 * and the down-pointing triangle is in no file in this repository while the
 * up-pointing one and both arrows are ambiguous-width throughout, so a mark
 * here is the ambiguous-width arm again.
 */
import type { Graph } from "../../data/viewmodel/index.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";
import { cells } from "../text.js";
import { grid, paint, setMask, write } from "./chargrid.js";
import { LINE_DOWN, LINE_LEFT, LINE_RIGHT, LINE_UP } from "./linedraw.js";

type Caps = Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">;

/** Cells between two labels in a layer. One reads as a join; two as a gap. */
const GAP = 2;

/**
 * Sweeps of the median heuristic (C12 I58).
 *
 * **Two is a number chosen and not a recipe followed.** One sweep never hurt in
 * any of 360 measured graphs and cut crossings four- to fivefold; two taken
 * plainly is *worse than one* in a whole family — near-path n=50, mean 36.5 to
 * 38.1, worse in 17 trials of 40. Keeping the best rather than the last is what
 * makes the count safe, and past two the marginal gain is 3-6% where the first
 * buys 80% (F242).
 */
const SWEEPS = 2;

type Edge = readonly [number, number];

// ------------------------------------------------------- passes 1 and 2

/**
 * Cycle removal by DFS back-edge reversal, then deduplication — **in that
 * order, and the order is the ruling** (§3ai.4 G1).
 *
 * Before reversal `a -> b` and `b -> a` are two legal distinct edges and
 * collapsing them is data loss. After it they are the same edge, and keeping
 * both draws one line twice.
 *
 * Iterative rather than recursive, because a 256-node path is 256 frames and a
 * renderer that throws on deep input fails on the data it was built for.
 */
function acyclic(n: number, edges: readonly Edge[]): { dag: readonly Edge[]; reversed: number } {
  const out = Array.from({ length: n }, (): number[] => []);
  edges.forEach(([a], i) => out[a]!.push(i));
  const state = new Int8Array(n);
  const back = new Set<number>();

  for (let root = 0; root < n; root += 1) {
    if (state[root] !== 0) continue;
    const stack: { u: number; k: number }[] = [{ u: root, k: 0 }];
    state[root] = 1;
    while (stack.length > 0) { // cells-ok — a stack depth
      const top = stack[stack.length - 1]!; // cells-ok — a stack depth
      const es = out[top.u]!;
      if (top.k >= es.length) { // cells-ok — an edge count
        state[top.u] = 2;
        stack.pop();
        continue;
      }
      const i = es[top.k]!;
      top.k += 1;
      const v = edges[i]![1];
      if (state[v] === 1) back.add(i);
      else if (state[v] === 0) {
        state[v] = 1;
        stack.push({ u: v, k: 0 });
      }
    }
  }

  const seen = new Set<string>();
  const dag: Edge[] = [];
  edges.forEach(([a, b], i) => {
    const e: Edge = back.has(i) ? [b, a] : [a, b];
    const key = `${e[0]}:${e[1]}`;
    if (e[0] === e[1] || seen.has(key)) return;
    seen.add(key);
    dag.push(e);
  });
  return { dag, reversed: back.size };
}

// ------------------------------------------------------------- pass 3

/** Layer assignment by longest path. Components share layers (§3ai.4 G9). */
function layerOf(n: number, dag: readonly Edge[]): readonly number[] {
  const inc = Array.from({ length: n }, (): number[] => []);
  for (const [a, b] of dag) inc[b]!.push(a);
  const L = new Array<number>(n).fill(-1);
  for (let start = 0; start < n; start += 1) {
    if (L[start]! >= 0) continue;
    const stack: { u: number; k: number }[] = [{ u: start, k: 0 }];
    while (stack.length > 0) { // cells-ok — a stack depth
      const top = stack[stack.length - 1]!; // cells-ok — a stack depth
      const ps = inc[top.u]!;
      if (top.k < ps.length) { // cells-ok — a predecessor count
        const p = ps[top.k]!;
        top.k += 1;
        if (L[p]! < 0 && !stack.some((f) => f.u === p)) stack.push({ u: p, k: 0 });
        continue;
      }
      let m = 0;
      for (const p of ps) m = Math.max(m, (L[p] ?? -1) + 1);
      L[top.u] = m;
      stack.pop();
    }
  }
  return L;
}

// ------------------------------------------------------------- pass 4

/** Dummy nodes, so every segment spans exactly one layer (§3ai.4 G5). */
function expand(
  n: number,
  dag: readonly Edge[],
  L: readonly number[],
): { layers: number[][]; seg: Edge[] } {
  const layers: number[][] = [];
  const push = (l: number, id: number): void => {
    while (layers.length <= l) layers.push([]); // cells-ok — a layer count
    layers[l]!.push(id);
  };
  for (let u = 0; u < n; u += 1) push(L[u]!, u);
  let next = n;
  const seg: Edge[] = [];
  for (const [a, b] of dag) {
    if (L[b]! - L[a]! <= 1) {
      seg.push([a, b]);
      continue;
    }
    let prev = a;
    for (let l = L[a]! + 1; l < L[b]!; l += 1) {
      const d = next;
      next += 1;
      push(l, d);
      seg.push([prev, d]);
      prev = d;
    }
    seg.push([prev, b]);
  }
  return { layers, seg };
}

// ------------------------------------------------------------- pass 5

function positions(layers: readonly (readonly number[])[]): Map<number, number> {
  const p = new Map<number, number>();
  for (const row of layers) row.forEach((id, i) => p.set(id, i));
  return p;
}

function bucketOf<K, V>(m: Map<K, V[]>, k: K): V[] {
  let bucket = m.get(k);
  if (bucket === undefined) {
    bucket = [];
    m.set(k, bucket);
  }
  return bucket;
}

function crossings(layers: readonly (readonly number[])[], seg: readonly Edge[]): number {
  const p = positions(layers);
  const lay = new Map<number, number>();
  layers.forEach((row, l) => row.forEach((id) => lay.set(id, l)));
  const byLayer = new Map<number, Edge[]>();
  for (const e of seg) bucketOf(byLayer, lay.get(e[0]) ?? -1).push(e);
  let c = 0;
  for (const es of byLayer.values())
    for (let i = 0; i < es.length; i += 1) // cells-ok — an edge count
      for (let j = i + 1; j < es.length; j += 1) { // cells-ok — an edge count
        const da = (p.get(es[i]![0]) ?? 0) - (p.get(es[j]![0]) ?? 0);
        const db = (p.get(es[i]![1]) ?? 0) - (p.get(es[j]![1]) ?? 0);
        if (da * db < 0) c += 1;
      }
  return c;
}

/**
 * The median heuristic, `SWEEPS` passes, **keeping the best rather than the
 * last** (§3ai.1, §3ai.5 S3 and S5).
 *
 * **The record is a copy, and that is the whole of why this is not a no-op.**
 * Holding a reference to the rows the next sweep goes on to mutate reports the
 * right crossing number and returns the wrong order — every assertion about
 * crossings passes and only the frame disagrees. No table of rule interactions
 * reaches that; it came out of walking the sequence.
 */
function order(layers: readonly (readonly number[])[], seg: readonly Edge[]): number[][] {
  const rows = layers.map((r) => [...r]);
  const up = new Map<number, number[]>();
  const down = new Map<number, number[]>();
  for (const [a, b] of seg) {
    bucketOf(down, a).push(b);
    bucketOf(up, b).push(a);
  }

  let best = rows.map((r) => [...r]);
  let bestCost = crossings(best, seg);

  const median = (id: number, nbrs: Map<number, number[]>, p: Map<number, number>): number => {
    const xs = (nbrs.get(id) ?? [])
      .map((x) => p.get(x))
      .filter((x): x is number => x !== undefined)
      .sort((x, y) => x - y);
    if (xs.length === 0) return -1; // cells-ok — a neighbour count
    const h = xs.length >> 1; // cells-ok — a neighbour count
    return xs.length % 2 === 1 ? xs[h]! : (xs[h - 1]! + xs[h]!) / 2; // cells-ok — a neighbour count
  };

  // **Every median first, then one sort.** Computing a median after the sort has
  // begun reads a half-applied order — deltas read as state, in an ordering pass
  // (§3ai.5 S2). A node with no neighbour in the adjacent layer has no median
  // and keeps its index: any other answer migrates an isolated node on every
  // sweep, and two renders of one input differ (C12 I11, §3ai.4 G6).
  const sortRow = (row: number[], nbrs: Map<number, number[]>, p: Map<number, number>): void => {
    const keyed = row.map((id, i) => ({ id, m: median(id, nbrs, p), i }));
    keyed.sort((A, B) => (A.m < 0 || B.m < 0 ? A.i - B.i : A.m - B.m || A.i - B.i));
    keyed.forEach((k, i) => {
      row[i] = k.id;
    });
  };

  for (let s = 0; s < SWEEPS; s += 1) {
    const p = positions(rows);
    if (s % 2 === 0) for (let l = 1; l < rows.length; l += 1) sortRow(rows[l]!, up, p); // cells-ok — a layer count
    else for (let l = rows.length - 2; l >= 0; l -= 1) sortRow(rows[l]!, down, p); // cells-ok — a layer count
    const cost = crossings(rows, seg);
    if (cost < bestCost) {
      bestCost = cost;
      best = rows.map((r) => [...r]);
    }
  }
  return best;
}

// ------------------------------------------------------------- pass 6

const labelOf = (g: Graph, i: number): string => g.nodes[i]!.label ?? g.nodes[i]!.id;

function widthOf(rows: readonly (readonly number[])[], g: Graph, caps: Caps): number {
  let widest = 0; // cells-ok — a cell count
  for (const row of rows) {
    let w = 0; // cells-ok — a cell count
    row.forEach((id, i) => {
      w += id < g.nodes.length ? cells(labelOf(g, id), caps.ambiguousWidth) : 1; // cells-ok — a cell count
      if (i > 0) w += GAP; // cells-ok — a cell count
    });
    widest = Math.max(widest, w); // cells-ok — a cell count
  }
  return widest;
}

/**
 * The layered pass over the **whole** graph — no pruning (§3aj.6).
 *
 * `graphArea` drops least-connected nodes until the figure fits a cell budget,
 * and that budget is a terminal fact: an SVG has none. So the second arm takes
 * the pipeline and not the loop around it — which is possible because
 * `acyclic`, `layerOf`, `expand`, `positions`, `crossings`, `order` and `lay`
 * are **0 `cells()` and 0 `caps`**, measured.
 *
 * `labelOf` returns `''` for a dummy node, which is how a caller tells a
 * routing waypoint from a node the graph declared.
 */
export function graphLayers(g: Graph): {
  rows: readonly (readonly number[])[];
  reversed: number;
  edges: readonly (readonly [number, number])[];
  labelOf: (id: number) => string;
} {
  const keep = new Set(g.nodes.map((_n, i) => i));
  const laid = lay(g, keep);
  return {
    rows: laid.rows,
    reversed: laid.reversed,
    edges: laid.seg.map((e) => [e[0], e[1]] as const),
    labelOf: (id) => (id < g.nodes.length ? labelOf(g, id) : ""), // cells-ok — a node count
  };
}

function lay(g: Graph, keep: ReadonlySet<number>): { rows: number[][]; seg: readonly Edge[]; reversed: number } {
  const index = new Map(g.nodes.map((node, i) => [node.id, i]));
  const edges: Edge[] = [];
  for (const e of g.edges) {
    const a = index.get(e.from);
    const b = index.get(e.to);
    if (a === undefined || b === undefined) continue;
    // **A dropped node takes its edges with it** (§3ai.4 G4). A segment left
    // behind draws a line to a place nothing is.
    if (!keep.has(a) || !keep.has(b)) continue;
    edges.push([a, b]);
  }
  const { dag, reversed } = acyclic(g.nodes.length, edges); // cells-ok — an edge count
  const L = layerOf(g.nodes.length, dag); // cells-ok — an edge count
  const { layers, seg } = expand(g.nodes.length, dag, L); // cells-ok — an edge count
  const kept = layers
    .map((row) => row.filter((id) => id >= g.nodes.length || keep.has(id))) // cells-ok — an edge count
    .filter((row) => row.length > 0); // cells-ok — a node count
  return { rows: order(kept, seg), seg, reversed };
}

/**
 * The plot area of a `graph`, and the names that did not fit (C12 I58).
 *
 * `rows` is one shorter than the budget where anything was dropped or reversed,
 * leaving the caller the row for the notice — I8's mechanism, and the caller's
 * to tone, exactly as `treeArea` hands one back (§3ah.4). **The row is spent
 * before the drawing is chosen**: clamping it afterwards gives the drawing the
 * only row there is and leaves the notice nowhere to go.
 */
export function graphArea(
  g: Graph,
  areaRows: number,
  width: number,
  caps: Caps,
  corners: "rounded" | "sharp",
): { rows: readonly string[]; dropped: readonly string[]; reversed: number } {
  const index = new Map(g.nodes.map((node, i) => [node.id, i]));
  const degree = new Map<number, number>();
  for (const e of g.edges)
    for (const id of [e.from, e.to]) {
      const i = index.get(id);
      if (i !== undefined) degree.set(i, (degree.get(i) ?? 0) + 1);
    }
  // Least-connected first, ties by declaration order reversed so the last
  // declared goes first: a node with one edge carries less of the shape than a
  // hub, and the order has to be total or two renders of one input differ
  // (C12 I11).
  const sacrifice = g.nodes
    .map((_n, i) => i)
    .sort((a, b) => (degree.get(a) ?? 0) - (degree.get(b) ?? 0) || b - a);

  const keep = new Set(g.nodes.map((_n, i) => i));
  let laid = lay(g, keep);
  let cut = 0;
  const budget = (): number => (cut === 0 && laid.reversed === 0 ? areaRows : areaRows - 1); // cells-ok — a row count
  const held = (): boolean =>
    laid.rows.length * 2 - 1 <= budget() && widthOf(laid.rows, g, caps) <= width; // cells-ok — a row count

  while (!held() && cut < sacrifice.length) { // cells-ok — a node count
    keep.delete(sacrifice[cut]!);
    cut += 1;
    laid = lay(g, keep);
  }

  const dropped = sacrifice.slice(0, cut).map((i) => labelOf(g, i));
  const height = Math.max(0, budget()); // cells-ok — a row count
  const canvas = grid(height, Math.max(0, width)); // cells-ok — a cell count
  if (keep.size === 0 || height === 0) {
    return { rows: paint(canvas, corners, caps), dropped, reversed: laid.reversed };
  }

  // ----------------------------------------------------------- pass 7
  //
  // **X-coordinate assignment, and the six-pass pipeline was five and a
  // packing.** Every layer was centred on its **own** width, so a chain whose
  // layers hold different numbers of nodes zigzags: one 8-cell node centres at
  // `(width - 8) / 2` and the three-node layer under it centres somewhere else,
  // and the edge between them is a diagonal staircase drawn between two nodes
  // that should have been in a column.
  //
  // **Arithmetically correct and reading worse than it should**, which is why no
  // count found it and the figure did (C12 I58 §3ai.6). The remedy is the phase
  // Sugiyama names and this pipeline skipped: the **priority/median** method —
  // pull each node toward the median of its neighbours, then restore the
  // separation the pull broke, alternating direction so neither end wins.
  const cw = (id: number): number =>
    id < g.nodes.length ? cells(labelOf(g, id), caps.ambiguousWidth) : 1; // cells-ok — a cell count

  /** Left edges per layer, packed from zero. The pull below moves them. */
  const xs = laid.rows.map((row) => {
    let x = 0; // cells-ok — a column position
    return row.map((id) => {
      const at = x;
      x += cw(id) + GAP; // cells-ok — a cell count
      return at;
    });
  });

  const mid = (l: number, i: number): number =>
    (xs[l]?.[i] ?? 0) + Math.floor((cw(laid.rows[l]?.[i] ?? 0) - 1) / 2); // cells-ok — a column position

  /**
   * Separation restored **without reordering** — the ordering pass owns that,
   * and a placement that reordered would throw away the crossings it bought.
   */
  const separate = (l: number): void => {
    const row = laid.rows[l] ?? [];
    const line = xs[l] ?? [];
    for (let i = 1; i < row.length; i += 1) { // cells-ok — a node count
      const floor = (line[i - 1] ?? 0) + cw(row[i - 1] ?? 0) + GAP; // cells-ok — a column position
      if ((line[i] ?? 0) < floor) line[i] = floor;
    }
    for (let i = row.length - 2; i >= 0; i -= 1) { // cells-ok — a node count
      const ceiling = (line[i + 1] ?? 0) - cw(row[i] ?? 0) - GAP; // cells-ok — a column position
      if ((line[i] ?? 0) > ceiling) line[i] = ceiling; // cells-ok — a column position
    }
  };

  // **Neighbours in the adjacent layer, from the segments** — the same list the
  // ordering pass used, so the two passes cannot disagree about who is adjacent.
  const at = new Map<number, { l: number; i: number }>();
  laid.rows.forEach((row, l) => row.forEach((id, i) => at.set(id, { l, i })));
  const near = laid.rows.map((): number[][] => []);
  laid.rows.forEach((row, l) => (near[l] = row.map((): number[] => [])));
  for (const [a, bb] of laid.seg) {
    const pa = at.get(a);
    const pb = at.get(bb);
    if (pa === undefined || pb === undefined || pb.l !== pa.l + 1) continue;
    near[pa.l]?.[pa.i]?.push(bb);
    near[pb.l]?.[pb.i]?.push(a);
  }

  // **Four sweeps, alternating**, which is the count `graph`'s own sweep
  // measurement argues for: past the second the gain falls off, and an odd
  // number leaves the last-swept end privileged.
  for (let pass = 0; pass < 4; pass += 1) { // cells-ok — a sweep count
    const order = pass % 2 === 0
      ? laid.rows.map((_r, l) => l)
      : laid.rows.map((_r, l) => laid.rows.length - 1 - l); // cells-ok — a row count
    for (const l of order) {
      const row = laid.rows[l] ?? [];
      for (let i = 0; i < row.length; i += 1) { // cells-ok — a node count
        const ns = (near[l]?.[i] ?? [])
          .map((id) => {
            const p = at.get(id);
            return p === undefined ? null : mid(p.l, p.i);
          })
          .filter((v): v is number => v !== null)
          .sort((x, y) => x - y);
        if (ns.length === 0) continue; // cells-ok — a neighbour count
        const m = ns[Math.floor((ns.length - 1) / 2)] ?? 0; // cells-ok — a column position
        const line = xs[l];
        // **No clamp at zero.** The figure is shifted as a whole below, so a
        // floor here does not keep it on the canvas — it moves one node
        // relative to the others and the shift cannot undo it. A wide label
        // pulled to a negative x is normalised with everything else.
        if (line !== undefined) line[i] = m - Math.floor((cw(row[i] ?? 0) - 1) / 2); // cells-ok — a column position
      }
      separate(l);
    }
  }

  // **Centred once, on the whole figure** — which is the difference the pass
  // exists for. Centring each layer on its own width is what produced the
  // zigzag, and centring the bounding box keeps the columns the sweeps built.
  // **Normalised before it is centred**, which is the other half of dropping the
  // clamp: the sweeps work in a coordinate space that may start left of zero,
  // and the figure is placed by moving all of it at once.
  const left = xs.reduce((m, line) => line.reduce((n, x) => Math.min(n, x), m), 0); // cells-ok — a column position
  const right = xs.reduce(
    (m, line, l) =>
      line.reduce((n, x, i) => Math.max(n, x - left + cw(laid.rows[l]?.[i] ?? 0)), m), // cells-ok — a column position
    0,
  );
  const shift = Math.max(0, Math.floor((width - right) / 2)) - left; // cells-ok — a column position

  const centre = new Map<number, number>();
  laid.rows.forEach((row, l) => {
    row.forEach((id, i) => {
      const x = shift + (xs[l]?.[i] ?? 0); // cells-ok — a column position
      const real = id < g.nodes.length; // cells-ok — an edge count
      if (real) write(canvas.text[2 * l] ?? [], x, labelOf(g, id), caps); // cells-ok — a row index
      centre.set(id, x + Math.floor((cw(id) - 1) / 2)); // cells-ok — a column position
    });
  });

  const lat = new Map<number, number>();
  laid.rows.forEach((row, l) => row.forEach((id) => lat.set(id, l)));
  for (const [a, b] of laid.seg) {
    const la = lat.get(a);
    const lb = lat.get(b);
    const ca = centre.get(a);
    const cb = centre.get(b);
    if (la === undefined || lb === undefined || ca === undefined || cb === undefined) continue;
    if (lb !== la + 1) continue;
    const r = 2 * la + 1; // cells-ok — a row index
    if (ca === cb) {
      setMask(canvas, r, ca, LINE_UP | LINE_DOWN);
      continue;
    }
    setMask(canvas, r, ca, LINE_UP | (ca < cb ? LINE_RIGHT : LINE_LEFT));
    const lo = Math.min(ca, cb) + 1; // cells-ok — a column position
    const hi = Math.max(ca, cb) - 1; // cells-ok — a column position
    for (let c = lo; c <= hi; c += 1) setMask(canvas, r, c, LINE_LEFT | LINE_RIGHT);
    setMask(canvas, r, cb, LINE_DOWN | (ca < cb ? LINE_LEFT : LINE_RIGHT));
  }
  return { rows: paint(canvas, corners, caps), dropped, reversed: laid.reversed };
}
