/**
 * Group A — the app's own cost.
 *
 * Every card is one figure and states what it excludes in the panel's footer,
 * which costs no row (C09 §4). The rules that make the pictures *correct* rather
 * than merely drawn are C28 I40 (self time is not the whole), I41 (frame-site
 * and session-site spans are two populations), I31 (an element's cost is
 * measured, never apportioned) and I58 (a frame is addressed by its `seq`).
 */
import { b } from "../../builders/index.js";
import type { Block, Series } from "../../../data/viewmodel/index.js";
import { PHASE_GROUP, SPAN_SITE } from "../types.js";
import type { FrameRecord, ProfileReport, SpanName, TreeNode } from "../types.js";
import type { CardDraw, CardContext } from "./kit.js";
import {
  cannotDraw, figureRows, frameSamples, hierarchyOf, mib, ms, namesAt,
  NO_DURATIONS, nothingYet, quartilesOf, resolveFrame, room, sessionSummary, spanning,
} from "./kit.js";

/** The notice every card draws below `spans`, rather than a zero (C28 I11). */
const belowSpans = (ctx: CardContext): boolean => !spanning(ctx.report);

// --- vitals -----------------------------------------------------------------

/**
 * Four `horizon` bands sharing one x domain — frame cost, heap, cpu, loop delay.
 *
 * **Stacked rather than side by side, and that is the reading.** Bands carry
 * magnitude by folding, so a 48 ms frame does not flatten the other 47; and a
 * shared domain is what lets a reader see that the heap step and the frame
 * spike are the *same* instant, which four independent sparklines cannot say.
 *
 * `legend: false` is refused on this form and signed data under a sequential
 * colormap is refused with it, so the legend row is budgeted rather than
 * switched off.
 */
const vitals: CardDraw = (ctx, spec) => {
  const r = ctx.report;
  if (r.samples.length === 0 && r.timeline.length === 0) {
    return nothingYet(spec, "no frame and no resource sample yet — there is nothing to draw rather than nothing to find");
  }
  const G = { form: "horizon" as const, axes: false, legend: "below" as const };
  if (!room(ctx, spec, G)) return cannotDraw(ctx, spec);

  const series: readonly Readonly<{ id: string; label: string; values: number[] }>[] = [
    { id: "vit-frame", label: "frame ms", values: r.timeline.map((f) => Number(ms(f.work))) },
    { id: "vit-heap", label: "heap MiB", values: r.samples.map((s) => mib(s.heapUsed)) },
    { id: "vit-cpu", label: "cpu ms", values: r.samples.map((s) => Number(s.cpuUser.toFixed(1))) },
    { id: "vit-loop", label: "loop ms", values: r.samples.map((s) => Number(ms(s.loopDelayMax))) },
  ];

  const drawn = series.filter((s) => s.values.length > 1);
  // **A horizon's height is its band count**, and the two must be the same
  // number. The first cut divided the region by four and drew one curve in a
  // twenty-eight-row area: twenty-five blank rows, one band and a legend. The
  // region is not what this figure is a function of — `bands` is — so the card
  // divides the room to *choose* the band count, and then asks for exactly it.
  //
  // Divided among the series that exist, not among the four that might: a
  // session with no resource sample yet is every session for the first second.
  const share = Math.max(2, Math.floor((ctx.region.rows - 2) / Math.max(1, drawn.length)) - 1);
  const bands = Math.max(2, Math.min(5, share));
  return drawn
    .map((s) =>
      b.plot({
        id: s.id,
        form: "horizon",
        height: bands,
        bands,
        series: [{ values: s.values, label: s.label } satisfies Series],
        gapBefore: false,
      }),
    );
};

// --- frame cost -------------------------------------------------------------

/**
 * The frame's *distribution* at each moment, as a `latency` matrix.
 *
 * Time across, duration bucket up. **A bimodal population is visible here and
 * invisible on a line**, which draws the mean of two modes through the gap
 * between them — and the gap is the finding.
 */
const frameCost: CardDraw = (ctx, spec) => {
  const r = ctx.report;
  if (belowSpans(ctx)) return nothingYet(spec, NO_DURATIONS);
  const work = r.timeline.map((f) => f.work);
  if (work.length < 4) {
    return nothingYet(spec, `${String(work.length)} frames in the ring — a distribution over fewer than four is a list`);
  }
  const G = { form: "latency" as const, axes: false };
  if (!room(ctx, spec, G)) return cannotDraw(ctx, spec);

  // The matrix: columns are windows of the ring, rows are duration buckets.
  const rows = Math.max(4, Math.min(8, figureRows(ctx, G)));
  const cols = Math.max(4, Math.min(40, work.length));
  // **Bucketed over the observed range, not over zero to the maximum.** A
  // session whose frames sit between 78 and 90 ms drew into the top two rows of
  // eight and left six empty, which reads as *most of the distribution is
  // missing* — and the empty rows are the ones a reader scans first. The floor
  // is the fastest frame because that is where the population starts.
  const hi = Math.max(...work);
  const lo = Math.min(...work);
  const span = hi - lo || 1;
  const per = Math.ceil(work.length / cols);
  const grid: number[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
  work.forEach((v, i) => {
    const c = Math.min(cols - 1, Math.floor(i / per));
    const row = Math.min(rows - 1, Math.floor(((v - lo) / span) * (rows - 1)));
    const line = grid[row];
    if (line !== undefined) line[c] = (line[c] ?? 0) + 1;
  });
  const most = Math.max(1, ...grid.flat());

  return [
    b.plot({
      id: "fc-latency",
      form: "latency",
      height: rows,
      yMin: 0,
      yMax: 1,
      colormap: "viridis",
      xLabels: ["oldest", "", "now"],
      // Rows bottom-up, so the dearest bucket is at the top of the figure.
      series: [...grid].reverse().map((line, i) => ({
        values: line.map((v) => Number((v / most).toFixed(3))),
        label: `${ms(lo + (span * (rows - 1 - i)) / (rows - 1))} ms`,
      })),
      gapBefore: false,
    }),
  ];
};

// --- where the frame went ---------------------------------------------------

/**
 * One frame's phases as a `waterfall` — zero-anchored, offset from the running
 * total, closed with `totals`.
 *
 * **Self time only** (C28 I40): `spans` is self and `latency.work` is the whole,
 * so dividing one by the other produces a figure that is wrong in a way that
 * reads as a measurement.
 */
const whereTheFrameWent: CardDraw = (ctx, spec) => {
  const f = resolveFrame(ctx.report, ctx.seq);
  if (f === null) return frameGone(ctx, spec);
  const G = { form: "waterfall" as const, axes: true };
  if (!room(ctx, spec, G)) return cannotDraw(ctx, spec);

  const parts = (Object.entries(f.spans) as [SpanName, number][])
    .filter(([n]) => SPAN_SITE[n] === "frame")
    .sort((x, y) => (y[1] ?? 0) - (x[1] ?? 0))
    .slice(0, 7);
  if (parts.length === 0) {
    return nothingYet(spec, `frame ${String(f.seq)} closed no frame-site span — nothing was measured inside it`);
  }
  const total = parts.reduce((n, [, v]) => n + v, 0);

  return [
    b.plot({
      id: "wf-waterfall",
      form: "waterfall",
      // **A bar chart's height is its category count**, so the figure asks for
      // that and not for the region: seven rows of bars in a thirty-row area is
      // seven bars and twenty-three blanks.
      height: figureRows(ctx, G, 0, parts.length + 1),
      axes: true,
      yFormat: "duration",
      categories: [...parts.map(([n]) => n), "measured"],
      series: [{ values: [...parts.map(([, v]) => Number(v.toFixed(3))), Number(total.toFixed(3))], label: "ms" } satisfies Series],
      totals: [...parts.map(() => false), true],
      gapBefore: false,
    }),
  ];
};

/** A `seq` that has left `worst` is a reading, not an error (C28 I58). */
const frameGone = (ctx: CardContext, spec: { id: string }): Block[] => [
  b.notice(
    "info",
    ctx.seq === undefined
      ? "no frame has been retained whole yet — a tree is kept only for the worst frames (C28 I32), so there is nothing to open"
      : `frame ${String(ctx.seq)} has left the retained set — \`report()\` recomputes which frames are worst on every call, ` +
        `and a frame leaving it is itself a reading. Press \`n\` for one that is still there`,
    undefined,
    { id: `${spec.id}-gone` },
  ),
];

// --- the flow ---------------------------------------------------------------

/** The same division as a `sankey`: frame → phase group → the dearest spans. */
const theFlow: CardDraw = (ctx, spec) => {
  const f = resolveFrame(ctx.report, ctx.seq);
  if (f === null) return frameGone(ctx, spec);
  const G = { form: "sankey" as const, axes: false };
  if (!room(ctx, spec, G)) return cannotDraw(ctx, spec);

  const parts = (Object.entries(f.spans) as [SpanName, number][])
    .filter(([n]) => SPAN_SITE[n] === "frame" && (n as string) !== "frame")
    .sort((x, y) => (y[1] ?? 0) - (x[1] ?? 0))
    .slice(0, 6);
  if (parts.length === 0) return nothingYet(spec, `frame ${String(f.seq)} closed no frame-site span to divide`);

  const groups = [...new Set(parts.map(([n]) => PHASE_GROUP[n]))];
  return [
    b.plot({
      id: "flow-sankey",
      form: "sankey",
      height: figureRows(ctx, G),
      graph: {
        nodes: [{ id: "frame" }, ...groups.map((g) => ({ id: g })), ...parts.map(([n]) => ({ id: n }))],
        edges: [
          ...groups.map((g) => ({
            from: "frame",
            to: g,
            // **`weight` on every edge**: a sankey with an unweighted edge is
            // a graph, and the whole reading is where the time divided.
            weight: Number(
              parts.filter(([n]) => PHASE_GROUP[n] === g).reduce((n2, [, v]) => n2 + v, 0).toFixed(3),
            ),
          })),
          ...parts.map(([n, v]) => ({ from: PHASE_GROUP[n], to: n, weight: Number(v.toFixed(3)) })),
        ],
      },
      series: [],
      gapBefore: false,
    }),
  ];
};

// --- the three tree cards ---------------------------------------------------

const treeCard = (form: "icicle" | "flame" | "tree", id: string): CardDraw => (ctx, spec) => {
  const f = resolveFrame(ctx.report, ctx.seq);
  if (f === null) return frameGone(ctx, spec);
  const tree: TreeNode | undefined = f.tree;
  if (tree === undefined) {
    return nothingYet(spec, `frame ${String(f.seq)} is retained without a tree — only the worst frames keep their structure (C28 I32)`);
  }
  const G = { form, axes: false };
  if (!room(ctx, spec, G)) return cannotDraw(ctx, spec);

  // **A tree form's natural height is the tree, not the region.** An `icicle`
  // of a three-deep frame drew three rows in a thirty-row area and twenty-seven
  // blanks; `tree` lays a node per leaf, so its number is the leaf count. Read
  // off the datum rather than assumed, because the two differ by an order of
  // magnitude on the same tree.
  const depth = (n: TreeNode): number =>
    1 + Math.max(0, ...n.children.map(depth));
  const leaves = (n: TreeNode): number =>
    n.children.length === 0 ? 1 : n.children.reduce((k, c) => k + leaves(c), 0);
  const natural = form === "tree" ? leaves(tree) + 1 : depth(tree);

  return [
    b.plot({
      id,
      form,
      height: figureRows(ctx, G, 0, natural),
      hierarchy: hierarchyOf(tree),
      series: [],
      // **`tone.muted` on the named tree** — it reads no palette at all, which
      // is what lets the names carry the figure rather than the colour.
      ...(form === "tree" ? { tone: "muted" as const } : {}),
      gapBefore: false,
    }),
  ];
};

// --- ranked and per-unit ----------------------------------------------------

/** The top twenty elements by self time — `lollipop`, because a bar's ink is heavier. */
const elementsRanked: CardDraw = (ctx, spec) => {
  const nodes = ctx.report.nodes.slice(0, 20);
  if (nodes.length === 0) return nothingYet(spec, "no element has been measured — the registry seam records at tier `spans` and above");
  const G = { form: "lollipop" as const, axes: true };
  if (!room(ctx, spec, G)) return cannotDraw(ctx, spec);
  return [
    b.plot({
      id: "rank-lollipop",
      form: "lollipop",
      height: figureRows(ctx, G, 0, nodes.length),
      axes: true,
      orientation: "horizontal",
      yFormat: "duration",
      categories: nodes.map((n) => n.key),
      series: [{ values: nodes.map((n) => Number(n.self.toFixed(3))), label: "self ms" } satisfies Series],
      gapBefore: false,
    }),
  ];
};

/**
 * Cost per call against calls — log on both axes, total cost as `sizes`.
 *
 * **The defect is up and to the left**: dear per unit and rarely reached is a
 * component nobody has looked at; a big block bottom-right is drawn constantly
 * and is nobody's bug. A table sorted by either column buries the other.
 *
 * `sizes` rather than a second series, because `bubble` takes exactly one — so
 * the third channel is the size and the form stays `scatter`.
 */
const costPerUnit: CardDraw = (ctx, spec) => {
  const nodes = ctx.report.nodes.filter((n) => n.calls > 0 && n.self > 0);
  if (nodes.length < 2) return nothingYet(spec, "fewer than two measured elements — a scatter of one point is a number");
  const G = { form: "scatter" as const, axes: true };
  if (!room(ctx, spec, G)) return cannotDraw(ctx, spec);
  return [
    b.plot({
      id: "cpu-scatter",
      form: "scatter",
      height: figureRows(ctx, G),
      axes: true,
      xScale: "log",
      yScale: "log",
      series: [{ values: nodes.map((n) => Number((n.self / n.calls).toFixed(4))), label: "ms per call" } satisfies Series],
      sizes: nodes.map((n) => Number(n.self.toFixed(3))),
      gapBefore: false,
    }),
  ];
};

// --- content sizes ----------------------------------------------------------

/** The thirty gauges as a `ridgeline` — the shape of what the app asks for. */
const contentSizes: CardDraw = (ctx, spec) => {
  const gauges = Object.entries(ctx.report.gauges).filter(([, h]) => h.count > 0).slice(0, 8);
  if (gauges.length === 0) return nothingYet(spec, "no gauge has been observed — sizes are recorded at tier `spans` and above");
  const G = { form: "ridgeline" as const, axes: true };
  if (!room(ctx, spec, G)) return cannotDraw(ctx, spec);
  return [
    b.plot({
      id: "cs-ridge",
      form: "ridgeline",
      height: figureRows(ctx, G, 0, gauges.length * 2),
      axes: true,
      series: gauges.map(([name, h]) => ({
        values: [h.min, h.q1, h.p50, h.q3, h.p95, h.max].map((v) => Number(v.toFixed(3))),
        label: name,
      })),
      gapBefore: false,
    }),
  ];
};

// --- the frame on a clock ---------------------------------------------------

/**
 * One frame's spans laid on the frame's own clock — `gantt`, `offsets` from
 * `TreeNode.startedAt`.
 *
 * **Carried rather than derived, and that is what the member is for.** A
 * parent's children do not tile it — the gaps between them are the parent's own
 * self time — so a consumer laying them out end to end produces a timeline that
 * is well-formed, plausible and not what happened. The card that wanted this
 * figure over the *far side* could not have it, because a session-site span
 * publishes a histogram and a histogram has no start (F1131).
 */
const frameOnAClock: CardDraw = (ctx, spec) => {
  const f = resolveFrame(ctx.report, ctx.seq);
  if (f === null) return frameGone(ctx, spec);
  const tree = f.tree;
  if (tree === undefined) return nothingYet(spec, `frame ${String(f.seq)} kept no tree, so no span has a start`);
  const G = { form: "gantt" as const, axes: true };
  if (!room(ctx, spec, G)) return cannotDraw(ctx, spec);

  const flat: { name: string; at: number; total: number }[] = [];
  const walk = (n: TreeNode): void => {
    flat.push({ name: n.name, at: n.startedAt, total: n.total });
    for (const c of n.children) walk(c);
  };
  walk(tree);
  const base = Math.min(...flat.map((x) => x.at));
  const rows = flat.slice(0, Math.max(3, figureRows(ctx, G)));

  return [
    b.plot({
      id: "clock-gantt",
      form: "gantt",
      height: figureRows(ctx, G, 0, rows.length),
      axes: true,
      yFormat: "duration",
      categories: rows.map((x) => x.name),
      series: [{ values: rows.map((x) => Number(x.total.toFixed(3))), label: "ms" } satisfies Series],
      offsets: rows.map((x) => Number((x.at - base).toFixed(3))),
      gapBefore: false,
    }),
  ];
};

// --- far side cost ----------------------------------------------------------

/**
 * Each session-site span, p50 against p95 — the summary honestly drawn.
 *
 * **Session-site spans have no per-frame samples** (C28 I41): they close between
 * frames, so `FrameRecord.spans` holds them under whichever window they landed
 * in, and using that as a series is F888's −460.5 ms residue with a picture on
 * it. Two points per category is what the report actually carries.
 */
const farSideCost: CardDraw = (ctx, spec) => {
  const names = namesAt(ctx.report, "session");
  if (names.length === 0) {
    return nothingYet(spec, "no session-site span has closed — nothing has been routed, decoded or fetched at this tier");
  }
  const G = { form: "dotplot" as const, axes: true };
  if (!room(ctx, spec, G)) return cannotDraw(ctx, spec);
  return [
    b.plot({
      id: "fs-dotplot",
      form: "dotplot",
      height: figureRows(ctx, G, 0, names.length),
      axes: true,
      orientation: "horizontal",
      yFormat: "duration",
      categories: [...names],
      series: [
        { values: names.map((n) => Number((sessionSummary(ctx.report, n)?.p50 ?? 0).toFixed(3))), label: "p50" },
        { values: names.map((n) => Number((sessionSummary(ctx.report, n)?.p95 ?? 0).toFixed(3))), label: "p95" },
      ],
      gapBefore: false,
    }),
  ];
};

export const APP_CARDS: Readonly<Record<string, CardDraw>> = Object.freeze({
  "vitals": vitals,
  "frame-cost": frameCost,
  "where-the-frame-went": whereTheFrameWent,
  "the-flow": theFlow,
  "element-tree": treeCard("icicle", "tree-icicle"),
  "flame": treeCard("flame", "tree-flame"),
  "named-tree": treeCard("tree", "tree-named"),
  "frame-on-a-clock": frameOnAClock,
  "elements-ranked": elementsRanked,
  "cost-per-unit": costPerUnit,
  "content-sizes": contentSizes,
  "far-side-cost": farSideCost,
});

export type { FrameRecord, ProfileReport };
export { frameSamples, quartilesOf };
