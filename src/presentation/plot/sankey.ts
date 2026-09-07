/**
 * `sankey` — bars for the nodes, ribbons for the flows, over `graph`'s layering
 * (C12 I110, I111, §3ap).
 *
 * **Passes 1–5 are `graphLayers` and nothing after them is** (§3d *Sankey*).
 * Cycle removal, deduplication, layering, dummy nodes and ordering transfer
 * untouched; what this file adds is a **placement** in which a node's extent is
 * its flow, and a **drawing** in which an edge is a fill rather than a mask bit.
 *
 * **One geometry, two painters** (I1's *measure the same*). `sankeyLayout` is
 * pure — 0 `cells()`, 0 `caps` — and takes its height, gap and minimum slice as
 * numbers, so the terminal calls it in half-rows with `quantum: true` and the
 * SVG arm calls it in pixels with `quantum: false`; every bar, slice and ribbon
 * end the two arms draw comes out of the same function. What does not cross is
 * the horizontal axis and the labels, which are cells here and a font there
 * (§3aj hazard 4).
 *
 * **The vertical quantum is a half-row**, which is what `▀ ▄ █` buy: a bar
 * whose flow rounds below one half-row still draws as one, and a ribbon is
 * never thinner than the bar it leaves.
 *
 * **Compared against two references before it was drawn** (§3ap.1): d3-sankey's
 * energy figure and plotly's `go.Sankey` — thin node rectangles stacked per
 * layer with a pad, ribbons in a source-derived colour at half opacity, labels
 * beside the bar and flipped to its left on the last layer — and
 * `mermaid-ascii`'s `sankey`, which is one line per flow with a bar whose
 * *length* is the value and no layout at all. The picture follows the first two
 * because the layering already exists; the third settled what to do with the
 * value itself, which is nothing — the ribbon's width is the reading, and a
 * numeral beside every bar is the table `mermaid-ascii` draws instead of a
 * figure.
 */
import type { Graph } from "../../data/viewmodel/index.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";
import { assertPictureGlyph, type ColourRef } from "../theme/index.js";
import { cells } from "../text.js";
import { graphLayers } from "./graph.js";
import { refOf } from "./marks.js";

type Caps = Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">;

/** A node's bar: its layer and its vertical extent in the layout's units. */
export type SankeyBar = Readonly<{ id: number; layer: number; y0: number; y1: number }>;

/**
 * A ribbon between two adjacent layers.
 *
 * `source` is the **declared** node the flow left — not the segment's `from`,
 * which is a dummy for every piece of an edge that spans layers — so a ribbon
 * routed through three layers is one colour end to end (§3ap.4 K4).
 */
export type SankeyRibbon = Readonly<{
  from: number;
  to: number;
  source: number;
  weight: number;
  sy0: number;
  sy1: number;
  ty0: number;
  ty1: number;
}>;

export type SankeyLayout = Readonly<{
  layers: readonly (readonly number[])[];
  bars: ReadonlyMap<number, SankeyBar>;
  ribbons: readonly SankeyRibbon[];
  reversed: number;
  /** Whether every layer's stack, gaps included, is within the height it was given. */
  fits: boolean;
  labelOf: (id: number) => string;
}>;

export type SankeyOptions = Readonly<{
  /** The vertical extent, in the caller's units. */
  height: number;
  /** Between two bars in one layer, in the caller's units. */
  gap: number;
  /** The thinnest a slice may draw, in the caller's units. */
  min: number;
  /** Round every slice to a whole unit — the terminal's half-row. */
  quantum: boolean;
}>;

/**
 * Sweeps of the vertical relaxation — the same count and the same argument as
 * `graph`'s seventh pass (§3ai.6): alternate so neither end is privileged, and
 * past the second the gain falls off.
 */
const SWEEPS = 4;

const centreOf = (b: Readonly<{ y0: number; y1: number }>): number => (b.y0 + b.y1) / 2;

/**
 * The placement — the pass `graph` does not have (C12 I110).
 *
 * The scale is **one number for the whole figure**: the tightest layer's
 * `(height − gaps) / Σflow`, so a unit of flow is the same height in every
 * layer and a ribbon leaves a bar at the width it arrives with. A node's bar is
 * the **larger** of its two sides, and the side that falls short leaves bare
 * bar below its last slice — which is what a sankey draws for a loss (§3ap.4 K6).
 *
 * `fits` is reported rather than enforced: this function has no budget to
 * spend, and the terminal arm owns the loop that drops nodes until it holds.
 */
export function sankeyLayout(g: Graph, opts: SankeyOptions): SankeyLayout {
  const laid = graphLayers(g);
  const rows = laid.rows;
  const n = g.nodes.length; // cells-ok — a node count
  const weights = laid.origins.map((os) => os.reduce((s, o) => s + (g.edges[o]?.weight ?? 0), 0));
  const sourceOf = laid.origins.map((os) => {
    const first = g.edges[os[0] ?? -1];
    const at = first === undefined ? -1 : g.nodes.findIndex((node) => node.id === first.from);
    return at;
  });

  const inW = new Map<number, number>();
  const outW = new Map<number, number>();
  laid.edges.forEach(([a, b], j) => {
    const w = weights[j] ?? 0;
    outW.set(a, (outW.get(a) ?? 0) + w);
    inW.set(b, (inW.get(b) ?? 0) + w);
  });
  const flow = (id: number): number => Math.max(inW.get(id) ?? 0, outW.get(id) ?? 0);

  // **The tightest layer sets the scale** — dummies included, because a ribbon
  // passing through a layer spends that layer's height too (§3ap.4 K4).
  let scale = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    const total = row.reduce((s, id) => s + flow(id), 0);
    const avail = opts.height - opts.gap * (row.length - 1); // cells-ok — a node count
    if (total > 0) scale = Math.min(scale, Math.max(0, avail) / total);
  }
  if (!Number.isFinite(scale)) scale = 0;

  const slice = (w: number): number => {
    const h = w * scale;
    return opts.quantum ? Math.max(1, Math.round(h)) : Math.max(opts.min, h);
  };
  const sliceH = weights.map(slice);

  const barH = new Map<number, number>();
  for (const row of rows) {
    for (const id of row) {
      let ins = 0;
      let outs = 0;
      laid.edges.forEach(([a, b], j) => {
        if (a === id) outs += sliceH[j] ?? 0;
        if (b === id) ins += sliceH[j] ?? 0;
      });
      // An isolated node has no flow and still exists: one minimum slice of bar.
      barH.set(id, Math.max(ins, outs, opts.quantum ? 1 : opts.min));
    }
  }

  // Stacked from the top and centred, per layer — the starting point the sweeps
  // pull from, and the whole answer for a layer with nothing adjacent.
  const y0 = new Map<number, number>();
  let fits = true;
  for (const row of rows) {
    const total = row.reduce((s, id) => s + (barH.get(id) ?? 0), 0) + opts.gap * (row.length - 1); // cells-ok — a node count
    if (total > opts.height) fits = false;
    let y = Math.max(0, (opts.height - total) / 2);
    if (opts.quantum) y = Math.floor(y);
    for (const id of row) {
      y0.set(id, y);
      y += (barH.get(id) ?? 0) + opts.gap;
    }
  }

  const bar = (id: number): { y0: number; y1: number } => {
    const top = y0.get(id) ?? 0;
    return { y0: top, y1: top + (barH.get(id) ?? 0) };
  };

  // **Neighbours from the segments** — the list the ordering pass used, so
  // placement and ordering cannot disagree about adjacency (§3ai.6).
  const near = new Map<number, { id: number; w: number }[]>();
  laid.edges.forEach(([a, b], j) => {
    const w = weights[j] ?? 0;
    (near.get(a) ?? near.set(a, []).get(a)!).push({ id: b, w });
    (near.get(b) ?? near.set(b, []).get(b)!).push({ id: a, w });
  });

  /**
   * Separation restored **without reordering** — the ordering pass owns the
   * order (§3ai.6) — then the whole stack shifted back inside `[0, height]`.
   */
  const separate = (row: readonly number[]): void => {
    for (let i = 1; i < row.length; i += 1) { // cells-ok — a node count
      const prev = bar(row[i - 1]!);
      const floor = prev.y1 + opts.gap;
      if ((y0.get(row[i]!) ?? 0) < floor) y0.set(row[i]!, floor);
    }
    const last = row[row.length - 1]; // cells-ok — a node count
    if (last === undefined) return;
    const over = bar(last).y1 - opts.height;
    if (over > 0) {
      for (let i = row.length - 1; i >= 0; i -= 1) { // cells-ok — a node count
        const ceiling = i === row.length - 1 // cells-ok — a node count
          ? opts.height - (barH.get(row[i]!) ?? 0)
          : (y0.get(row[i + 1]!) ?? 0) - opts.gap - (barH.get(row[i]!) ?? 0);
        if ((y0.get(row[i]!) ?? 0) > ceiling) y0.set(row[i]!, ceiling);
      }
    }
    const first = row[0];
    if (first !== undefined && (y0.get(first) ?? 0) < 0) {
      const lift = -(y0.get(first) ?? 0);
      for (const id of row) y0.set(id, (y0.get(id) ?? 0) + lift);
    }
  };

  for (let pass = 0; pass < SWEEPS; pass += 1) { // cells-ok — a sweep count
    const order = pass % 2 === 0 ? rows.map((_r, l) => l) : rows.map((_r, l) => rows.length - 1 - l); // cells-ok — a layer count
    for (const l of order) {
      const row = rows[l] ?? [];
      for (const id of row) {
        const ns = near.get(id) ?? [];
        let sum = 0;
        let wsum = 0;
        for (const { id: other, w } of ns) {
          sum += centreOf(bar(other)) * w;
          wsum += w;
        }
        if (wsum === 0) continue;
        let top = sum / wsum - (barH.get(id) ?? 0) / 2;
        if (opts.quantum) top = Math.round(top);
        y0.set(id, top);
      }
      separate(row);
    }
  }

  const bars = new Map<number, SankeyBar>();
  rows.forEach((row, l) => {
    for (const id of row) bars.set(id, { id, layer: l, ...bar(id) });
  });

  // **Slices ordered by the far end's centre**, on both sides, so the ribbons
  // leaving a bar fan out in the order they arrive and do not cross each other
  // at the bar (§3ap.4 K2). Stable on the segment index for equal centres (I11).
  const sy = new Map<number, number>();
  const ty = new Map<number, number>();
  const byId = (a: number, b: number): number => a - b;
  const outgoing = new Map<number, number[]>();
  const incoming = new Map<number, number[]>();
  laid.edges.forEach(([a, b], j) => {
    (outgoing.get(a) ?? outgoing.set(a, []).get(a)!).push(j);
    (incoming.get(b) ?? incoming.set(b, []).get(b)!).push(j);
  });
  for (const [id, js] of outgoing) {
    js.sort((p, q) => centreOf(bar(laid.edges[p]![1])) - centreOf(bar(laid.edges[q]![1])) || byId(p, q));
    let y = bar(id).y0;
    for (const j of js) {
      sy.set(j, y);
      y += sliceH[j] ?? 0;
    }
  }
  for (const [id, js] of incoming) {
    js.sort((p, q) => centreOf(bar(laid.edges[p]![0])) - centreOf(bar(laid.edges[q]![0])) || byId(p, q));
    let y = bar(id).y0;
    for (const j of js) {
      ty.set(j, y);
      y += sliceH[j] ?? 0;
    }
  }

  const ribbons: SankeyRibbon[] = laid.edges.map(([a, b], j) => {
    const s0 = sy.get(j) ?? 0;
    const t0 = ty.get(j) ?? 0;
    const h = sliceH[j] ?? 0;
    return { from: a, to: b, source: sourceOf[j] ?? -1, weight: weights[j] ?? 0, sy0: s0, sy1: s0 + h, ty0: t0, ty1: t0 + h };
  });

  return { layers: rows, bars, ribbons, reversed: laid.reversed, fits, labelOf: (id) => (id < n ? laid.labelOf(id) : "") };
}

// ------------------------------------------------------------ the terminal arm

/**
 * One cell of the drawn area. `ref` and `background` name palette slots —
 * C10 resolves them (CLAUDE.md, *never embed a colour*); the glyph carries
 * bar against ribbon at every depth (I17).
 */
export type SankeyCell = Readonly<{ text: string; ref?: ColourRef; background?: ColourRef }>;

/**
 * The block alphabet, and the ASCII arm it falls to.
 *
 * **`▀ ▄ █ ▒` are `East_Asian_Width=Ambiguous` every one**, so a terminal
 * declaring `wide` takes the ASCII set — `barStyle`'s rule (C02 I9, A03 SS47),
 * applied to the same family. `#` for any cell a bar owns, `=` for a full
 * ribbon cell and `-` for a half, which is the shape distinction the
 * one-bit unicode arm makes with `█` against `▒`.
 */
type Alphabet = Readonly<{ bar: string; top: string; bottom: string; ribbon: string; ascii: boolean }>;
const UNICODE: Alphabet = Object.freeze({ bar: "█", top: "▀", bottom: "▄", ribbon: "▒", ascii: false });
const ASCII: Alphabet = Object.freeze({ bar: "#", top: "-", bottom: "-", ribbon: "=", ascii: true });

export function sankeyAlphabet(caps: Caps): Alphabet {
  return caps.unicode === "ascii" || caps.ambiguousWidth === "wide" ? ASCII : UNICODE;
}

/** The half-row canvas: who owns a half-cell, and whether as bar or ribbon. */
type Half = Readonly<{ owner: number; bar: boolean }>;

const NONE = -1;

/** Row gaps tried in order: one row, a half-row, none (§3ap.4 K5). */
const GAPS = [2, 1, 0] as const;

/**
 * The plot area of a `sankey`, and the names that did not fit (C12 I110, I111).
 *
 * **The row for the notice is spent before the drawing is chosen**, as
 * `graphArea` spends it (§3ah.4): once anything is dropped or reversed the
 * figure has one row fewer, and clamping afterwards would leave the notice
 * nowhere to go.
 *
 * **The drop is by flow**, least first, ties by declaration order reversed so
 * the order is total (I11) — the sankey's reading of `graph`'s *least
 * connected*: a node carrying the least flow carries the least of the shape.
 * Dropping a node re-runs the whole layering, because a dropped node takes its
 * edges and their dummies with it (§3ai.4 G4).
 */
export function sankeyArea(
  g: Graph,
  areaRows: number,
  width: number,
  caps: Caps,
): { rows: readonly (readonly SankeyCell[])[]; dropped: readonly string[]; reversed: number } {
  const labelOf = (i: number): string => g.nodes[i]?.label ?? g.nodes[i]?.id ?? "";
  const declaredFlow = new Map<number, number>();
  const index = new Map(g.nodes.map((node, i) => [node.id, i]));
  const inW = new Map<number, number>();
  const outW = new Map<number, number>();
  for (const e of g.edges) {
    const a = index.get(e.from);
    const b = index.get(e.to);
    if (a === undefined || b === undefined) continue;
    outW.set(a, (outW.get(a) ?? 0) + (e.weight ?? 0));
    inW.set(b, (inW.get(b) ?? 0) + (e.weight ?? 0));
  }
  g.nodes.forEach((_n, i) => declaredFlow.set(i, Math.max(inW.get(i) ?? 0, outW.get(i) ?? 0)));
  const sacrifice = g.nodes
    .map((_n, i) => i)
    .sort((a, b) => (declaredFlow.get(a) ?? 0) - (declaredFlow.get(b) ?? 0) || b - a);

  const keep = new Set(g.nodes.map((_n, i) => i));
  let cut = 0;

  /** The kept nodes as a graph of their own, with each kept node's declared index. */
  const subgraph = (): { sub: Graph; orig: readonly number[] } => {
    const orig = g.nodes.map((_n, i) => i).filter((i) => keep.has(i));
    const kept = new Set(orig.map((i) => g.nodes[i]!.id));
    return {
      sub: {
        nodes: orig.map((i) => g.nodes[i]!),
        edges: g.edges.filter((e) => kept.has(e.from) && kept.has(e.to)),
      },
      orig,
    };
  };

  let attempt: { layout: SankeyLayout; orig: readonly number[]; gap: number; height: number } | null = null;
  while (attempt === null && keep.size > 0) { // cells-ok — a node count
    const { sub, orig } = subgraph();
    // The reversal count does not depend on the height, so one call settles the
    // budget and the gaps are tried against it.
    const probe = sankeyLayout(sub, { height: 2 * areaRows, gap: 0, min: 1, quantum: true }); // cells-ok — a row count
    const budget = cut === 0 && probe.reversed === 0 ? areaRows : areaRows - 1; // cells-ok — a row count
    const height = 2 * Math.max(0, budget); // cells-ok — a row count
    for (const gap of GAPS) {
      const layout = sankeyLayout(sub, { height, gap, min: 1, quantum: true });
      if (layout.fits && height > 0) {
        attempt = { layout, orig, gap, height };
        break;
      }
    }
    if (attempt === null) {
      keep.delete(sacrifice[cut]!);
      cut += 1;
    }
  }

  const dropped = sacrifice.slice(0, cut).map(labelOf);
  const alphabet = sankeyAlphabet(caps);
  const blank = (): SankeyCell[] => Array.from({ length: Math.max(0, width) }, (): SankeyCell => ({ text: " " })); // cells-ok — a cell count

  if (attempt === null) {
    const budget = Math.max(0, areaRows - 1); // cells-ok — a row count
    return { rows: Array.from({ length: budget }, blank), dropped, reversed: 0 };
  }

  const { layout, orig, height } = attempt;
  const rows = height / 2; // cells-ok — a row count
  const k = layout.layers.length; // cells-ok — a layer count
  const xOf = (l: number): number => (k <= 1 ? 0 : Math.round((l * (width - 1)) / (k - 1))); // cells-ok — a column position
  const n = orig.length; // cells-ok — a node count
  const colourOf = (subId: number): number => orig[subId] ?? subId;

  const canvas: (Half | null)[][] = Array.from({ length: height }, () => new Array<Half | null>(Math.max(0, width)).fill(null)); // cells-ok — a cell count
  const put = (hr: number, c: number, cell: Half): void => {
    if (hr < 0 || hr >= height || c < 0 || c >= width) return;
    canvas[hr]![c] = cell;
  };

  // **Ribbons first, bars over them** — d3's order and the treemap's reason:
  // what is on top says what is in front, and a ribbon ending under a bar
  // reads as ending at it.
  for (const r of layout.ribbons) {
    const la = layout.bars.get(r.from)?.layer;
    const lb = layout.bars.get(r.to)?.layer;
    if (la === undefined || lb === undefined) continue;
    const xa = xOf(la);
    const xb = xOf(lb);
    const owner = r.source >= 0 ? colourOf(r.source) : NONE;
    for (let c = xa + 1; c < xb; c += 1) { // cells-ok — a column position
      const t = (c - xa) / (xb - xa);
      // The cubic's S: the same ease the SVG's two Béziers draw, sampled per column.
      const e = t * t * (3 - 2 * t);
      const top = Math.round(r.sy0 + (r.ty0 - r.sy0) * e);
      let bot = Math.round(r.sy1 + (r.ty1 - r.sy1) * e);
      if (bot <= top) bot = top + 1;
      for (let hr = top; hr < bot; hr += 1) put(hr, c, { owner, bar: false }); // cells-ok — a half-row index
    }
  }
  // A dummy's slot is ribbon in its source's colour, never a bar (§3ap.4 K4).
  const through = new Map<number, number>();
  for (const r of layout.ribbons) if (r.to >= n) through.set(r.to, r.source);
  for (const b of layout.bars.values()) {
    const real = b.id < n; // cells-ok — a node count
    const owner = real ? colourOf(b.id) : colourOf(through.get(b.id) ?? -1);
    for (let hr = b.y0; hr < b.y1; hr += 1) put(hr, xOf(b.layer), { owner, bar: real }); // cells-ok — a half-row index
  }

  // **Labels, outermost layers first** (§3ap.4 K3). A label sits one cell off
  // its bar at the bar's centre row, to the right everywhere but the last layer,
  // where it sits to the left — d3's placement. One that would run into the
  // next bar, or into a label already written, is **dropped, never truncated**
  // (§3n): the bar keeps its colour and its extent, exactly as a tile whose
  // name did not fit keeps both. Written from the outside in, so when two
  // compete for the same cells it is the inner one that goes.
  const text: (string | undefined)[][] = Array.from({ length: rows }, () => new Array<string | undefined>(Math.max(0, width)).fill(undefined)); // cells-ok — a cell count
  const visit: number[] = [];
  for (let i = 0; i < k; i += 1) { // cells-ok — a layer count
    const l = i % 2 === 0 ? i / 2 : k - 1 - (i - 1) / 2; // cells-ok — a layer index
    if (!visit.includes(l)) visit.push(l);
  }
  for (const l of visit) {
    for (const id of layout.layers[l] ?? []) {
      if (id >= n) continue; // cells-ok — a node count
      const b = layout.bars.get(id);
      if (b === undefined || b.y1 <= b.y0) continue;
      const label = layout.labelOf(id);
      const w = cells(label, caps.ambiguousWidth);
      if (w === 0) continue; // cells-ok — a cell count
      const row = Math.floor(Math.floor((b.y0 + b.y1 - 1) / 2) / 2); // cells-ok — a row index
      const x = xOf(l);
      const left = l === k - 1 && k > 1; // cells-ok — a layer count
      const col = left ? x - 1 - w : x + 2; // cells-ok — a column position
      const lo = left ? (k > 1 ? xOf(k - 2) + 2 : 0) : col; // cells-ok — a column position
      const hi = left ? x - 1 : l + 1 < k ? xOf(l + 1) - 1 : width; // cells-ok — a column position
      if (col < lo || col + w > hi) continue;
      const line = text[row];
      if (line === undefined) continue;
      let taken = false;
      for (let c = col; c < col + w; c += 1) if (line[c] !== undefined) taken = true; // cells-ok — a column position
      if (taken) continue;
      let c = col; // cells-ok — a column position
      for (const ch of label) {
        line[c] = ch;
        const cw = cells(ch, caps.ambiguousWidth);
        for (let j = 1; j < cw; j += 1) line[c + j] = ""; // cells-ok — a cell count
        c += cw;
      }
    }
  }

  // **Two half-rows to a cell, and the glyph says which halves are inked.**
  // A bar is solid, a ribbon's interior is the shade, and a half a bar or a
  // ribbon covers is the half block in that owner's slot. Two owners in one
  // cell put the lower one in the background — `image.ts`'s half-block
  // precedent, a picture cell rather than text on a surface (C10 I21).
  const out: SankeyCell[][] = [];
  for (let r = 0; r < rows; r += 1) { // cells-ok — a row index
    const line: SankeyCell[] = [];
    for (let c = 0; c < width; c += 1) { // cells-ok — a column position
      const ch = text[r]?.[c];
      if (ch !== undefined) {
        line.push({ text: ch });
        continue;
      }
      const top = canvas[2 * r]?.[c] ?? null; // cells-ok — a half-row index
      const bot = canvas[2 * r + 1]?.[c] ?? null; // cells-ok — a half-row index
      line.push(cellOf(top, bot, alphabet));
    }
    out.push(line);
  }
  return { rows: out, dropped, reversed: layout.reversed };
}

/**
 * A cell naming its owner's slot, and the lower owner's as a background where
 * there is one.
 *
 * **The background channel is where I21's admission is checked** (C10 §4c.1).
 * A cell with two owners is a picture cell: `▀` with one slot in front and one
 * behind is two *regions of one cell*, not ink on a ground, and that is why a
 * palette slot may reach the background here when `resolveBackground` refuses
 * it. The condition used to read *the cell carries no text* and was false of
 * every cell this function builds — the glyph is always drawn, and it is the
 * half that survives at 1-bit (I17). The condition that is true is that the
 * glyph is a **fill**, and `assertPictureGlyph` is what holds it.
 *
 * Checked on the background arm alone, which is what keeps the ASCII fallback
 * out of the alphabet: `cellOf` never passes `below` when `a.ascii`, so `#`,
 * `=` and `-` never reach a painted cell and never had to be admitted.
 */
function cell(text: string, owner: number, below?: number): SankeyCell {
  if (owner < 0) return { text };
  const ref = refOf(owner);
  if (below === undefined || below < 0) return { text, ref };
  assertPictureGlyph(text, "sankeyArea");
  return { text, ref, background: refOf(below) };
}

function cellOf(top: Half | null, bot: Half | null, a: Alphabet): SankeyCell {
  if (top === null && bot === null) return { text: " " };
  if (top !== null && bot !== null) {
    if (top.owner === bot.owner && top.bar === bot.bar) return cell(top.bar ? a.bar : a.ribbon, top.owner);
    if (a.ascii) return cell(top.bar || bot.bar ? a.bar : a.ribbon, top.owner);
    return cell(a.top, top.owner, bot.owner);
  }
  const one = (top ?? bot)!;
  if (a.ascii) return cell(one.bar ? a.bar : a.top, one.owner);
  return cell(top !== null ? a.top : a.bottom, one.owner);
}
