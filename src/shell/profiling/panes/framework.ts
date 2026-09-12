/**
 * Group B — the framework's own cost.
 *
 * The distinction from Group A is the audience rather than the data: these are
 * the cards a maintainer of Calcium reads, and several of them are about the
 * *shape* of a population rather than its size — which is the half a p50 and a
 * p95 cannot report, since they answer *a number and a bigger number* for a
 * tight distribution and a bimodal one alike.
 */
import { b } from "../../builders/index.js";
import type { Block, QuartileSummary, Series } from "../../../data/viewmodel/index.js";
import { PHASE_GROUP } from "../types.js";
import type { CommitReason, MissReason, SpanName } from "../types.js";
import type { CardDraw, CardContext } from "./kit.js";
import {
  cacheNames, cannotDraw, figureRows, frameSamples, lastRunning, mib, ms,
  namesAt, nothingYet, plainCounters, quartilesOf, room, spanning,
} from "./kit.js";

const NO_DURATIONS =
  "the tier is below `spans`, so the report omits durations rather than reporting zeroes — " +
  "a zeroed figure reads as measured-and-fast";

/** The frame-site names with enough per-frame samples to have a shape. */
const shaped = (ctx: CardContext, least = 5): readonly SpanName[] =>
  namesAt(ctx.report, "frame").filter((n) => frameSamples(ctx.report, n).length >= least);

// --- phases over time -------------------------------------------------------

/** `PHASE_GROUP` over the ring — **frame-site names only** (C28 I41). */
const phaseSeries = (ctx: CardContext): readonly Series[] => {
  const groups = ["compute", "draw", "output"] as const;
  const names = namesAt(ctx.report, "frame");
  return groups.map((g) => ({
    label: g,
    values: ctx.report.timeline.map((f) =>
      Number(
        names
          .filter((n) => PHASE_GROUP[n] === g)
          .reduce((sum, n) => sum + (f.spans[n] ?? 0), 0)
          .toFixed(3),
      ),
    ),
  }));
};

const areaCard = (form: "stackedarea" | "streamgraph", id: string): CardDraw => (ctx, spec) => {
  if (!spanning(ctx.report)) return nothingYet(spec, NO_DURATIONS);
  if (ctx.report.timeline.length < 3) {
    return nothingYet(spec, `${String(ctx.report.timeline.length)} frames in the ring — an area over fewer than three is a bar`);
  }
  const G = { form, axes: true };
  if (!room(ctx, spec, G)) return cannotDraw(ctx, spec);
  return [
    b.plot({
      id, form, height: figureRows(ctx, G), axes: true, yFormat: "duration",
      series: phaseSeries(ctx), gapBefore: false,
    }),
  ];
};

// --- by kind ----------------------------------------------------------------

const byKind: CardDraw = (ctx, spec) => {
  const kinds = Object.entries(ctx.report.byKind).filter(([, h]) => h.count > 0);
  if (kinds.length === 0) return nothingYet(spec, "no block kind has been measured yet");
  const G = { form: "treemap" as const, axes: false };
  if (!room(ctx, spec, G)) return cannotDraw(ctx, spec);
  return [
    b.plot({
      id: "bk-treemap", form: "treemap", height: figureRows(ctx, G),
      // **The root carries a value too.** `hierarchyFault` walks every node
      // when the form divides space in proportion to it, the root included, so
      // a root with children and no value throws at construction — inside a
      // render path with no catch (F1130, F1134).
      hierarchy: {
        label: "total",
        value: Number(kinds.reduce((n, [, h]) => n + h.sum, 0).toFixed(3)),
        children: kinds.map(([k, h]) => ({ label: k, value: Number(h.sum.toFixed(3)) })),
      },
      series: [], gapBefore: false,
    }),
  ];
};

// --- distributions ----------------------------------------------------------

/** Which spans are bimodal — `ridgeline` over the real per-frame samples. */
const spanShapes: CardDraw = (ctx, spec) => {
  const names = shaped(ctx).slice(0, 6);
  if (names.length === 0) {
    return nothingYet(spec, "no frame-site span has five samples in the ring yet — a shape needs a population, not a percentile");
  }
  const G = { form: "ridgeline" as const, axes: true };
  if (!room(ctx, spec, G)) return cannotDraw(ctx, spec);
  return [
    b.plot({
      id: "shape-ridge", form: "ridgeline", height: figureRows(ctx, G, 0, names.length * 2), axes: true,
      series: names.map((n) => ({ values: [...frameSamples(ctx.report, n)], label: n })),
      gapBefore: false,
    }),
  ];
};

/** The drill — one span, one band, so the two-rows-per-band floor is met anywhere. */
const oneSpan: CardDraw = (ctx, spec) => {
  const name = shaped(ctx, 8)[0];
  if (name === undefined) {
    return nothingYet(spec, "no frame-site span has eight samples in the ring — a density below that is an artefact rather than an estimate");
  }
  const G = { form: "violin" as const, axes: true };
  if (!room(ctx, spec, G)) return cannotDraw(ctx, spec);
  return [
    b.plot({
      id: "one-violin", form: "violin", height: figureRows(ctx, G), axes: true,
      categories: [name],
      series: [{ values: [...frameSamples(ctx.report, name)], label: name } satisfies Series],
      gapBefore: false,
    }),
  ];
};

/** Five spans, five-number summaries — **real quartiles**, computed from the ring. */
const spansCompared: CardDraw = (ctx, spec) => {
  const names = shaped(ctx, 4).slice(0, 5);
  if (names.length === 0) return nothingYet(spec, "no frame-site span has four samples in the ring");
  const G = { form: "boxplot" as const, axes: true };
  if (!room(ctx, spec, G)) return cannotDraw(ctx, spec);
  const quartiles = names
    .map((n) => quartilesOf(frameSamples(ctx.report, n)))
    .filter((q): q is QuartileSummary => q !== null);
  return [
    b.plot({
      id: "cmp-box", form: "boxplot", height: figureRows(ctx, G, 0, names.length * 2), axes: true,
      orientation: "horizontal", yFormat: "duration",
      categories: [...names], quartiles, series: [], gapBefore: false,
    }),
  ];
};

/**
 * What share of frames is actually under the budget — `ecdf` with the budget
 * drawn as a reference line.
 *
 * **The share is read off rather than computed**, and the knee is where the
 * population lives: a curve that is vertical at 4 ms and flat after is a
 * framework that is fast with a tail, which a p95 states and does not show.
 */
const againstTheBudget: CardDraw = (ctx, spec) => {
  const work = ctx.report.timeline.map((f) => Number(f.work.toFixed(3)));
  if (work.length < 4) return nothingYet(spec, `${String(work.length)} frames — an ECDF over fewer than four is a staircase of one`);
  const G = { form: "ecdf" as const, axes: true };
  if (!room(ctx, spec, G)) return cannotDraw(ctx, spec);
  return [
    b.plot({
      id: "budget-ecdf", form: "ecdf", height: figureRows(ctx, G), axes: true, yFormat: "duration",
      series: [{ values: work, label: "frame work ms" } satisfies Series],
      annotations: [{ kind: "line", value: 16, tone: "warn", label: "16 ms" }],
      gapBefore: false,
    }),
  ];
};

/** Cost against policy — `density2d`, because I4 forbids summing them. */
const workAgainstWait: CardDraw = (ctx, spec) => {
  const t = ctx.report.timeline;
  if (t.length < 6) return nothingYet(spec, `${String(t.length)} frames — a density over fewer than six is a scatter`);
  const G = { form: "density2d" as const, axes: false };
  if (!room(ctx, spec, G)) return cannotDraw(ctx, spec);
  const rows = Math.max(4, Math.min(8, figureRows(ctx, G)));
  const cols = 12;
  const wMax = Math.max(...t.map((f) => f.work), 1);
  const aMax = Math.max(...t.map((f) => f.wait), 1);
  const grid: number[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
  for (const f of t) {
    const rr = Math.min(rows - 1, Math.floor((f.work / wMax) * (rows - 1)));
    const cc = Math.min(cols - 1, Math.floor((f.wait / aMax) * (cols - 1)));
    const line = grid[rr];
    if (line !== undefined) line[cc] = (line[cc] ?? 0) + 1;
  }
  const most = Math.max(1, ...grid.flat());
  return [
    b.plot({
      id: "ww-density", form: "density2d", height: rows,
      yMin: 0, yMax: 1, colormap: "viridis",
      xLabels: ["no wait", "", `${ms(aMax)} ms wait`],
      series: [...grid].reverse().map((line, i) => ({
        values: line.map((v) => Number((v / most).toFixed(3))),
        label: `${ms((wMax * (rows - i)) / rows)} ms work`,
      })),
      gapBefore: false,
    }),
  ];
};

/**
 * A periodic stall — `autocorrelation`, and **nothing else in C12 finds it**.
 *
 * A 100 ms timer beating against a 33 ms window is a peak at lag 3, and it is
 * invisible on every other figure here: the frames are individually ordinary
 * and the pattern is in their spacing.
 */
const periodicStall: CardDraw = (ctx, spec) => {
  const xs = ctx.report.timeline.map((f) => f.work);
  if (xs.length < 16) return nothingYet(spec, `${String(xs.length)} frames — a correlogram wants at least sixteen before a lag means anything`);
  const G = { form: "autocorrelation" as const, axes: true };
  if (!room(ctx, spec, G)) return cannotDraw(ctx, spec);
  const mean = xs.reduce((n, v) => n + v, 0) / xs.length;
  const denom = xs.reduce((n, v) => n + (v - mean) ** 2, 0) || 1;
  const lags = Array.from({ length: Math.min(12, Math.floor(xs.length / 3)) }, (_v, i) => i + 1);
  return [
    b.plot({
      id: "acf", form: "autocorrelation", height: figureRows(ctx, G), axes: true,
      categories: lags.map((l) => String(l)),
      series: [{
        label: "acf",
        values: lags.map((l) =>
          Number(
            (xs.slice(l).reduce((n, v, i) => n + (v - mean) * ((xs[i] ?? mean) - mean), 0) / denom).toFixed(3),
          ),
        ),
      } satisfies Series],
      gapBefore: false,
    }),
  ];
};

// --- counters ---------------------------------------------------------------

/** C03's value proposition — commits in, frames out. */
const coalescing: CardDraw = (ctx, spec) => {
  const reasons = (Object.keys(ctx.report.byReason) as CommitReason[]).filter(
    (k) => (ctx.report.byReason[k]?.count ?? 0) > 0,
  );
  const commits = reasons.reduce((n, k) => n + (ctx.report.counters[`commit.${k}`] ?? 0), 0);
  const drawn = reasons.reduce((n, k) => n + (ctx.report.counters[`frame.${k}`] ?? 0), 0);
  if (commits === 0) return nothingYet(spec, "nothing has committed yet — there is no coalescing to show");
  const G = { form: "funnel" as const, axes: true };
  if (!room(ctx, spec, G)) return cannotDraw(ctx, spec);
  return [
    b.plot({
      id: "coal-funnel", form: "funnel", height: figureRows(ctx, G, 0, 3), axes: true,
      categories: ["commits raised", "frames drawn", "frames kept"],
      series: [{ values: [commits, drawn, ctx.report.frames], label: "count" } satisfies Series],
      gapBefore: false,
    }),
  ];
};

/** p50 against p95 per `CommitReason` — `byReason`, which no pane read before. */
const byReason: CardDraw = (ctx, spec) => {
  const reasons = (Object.keys(ctx.report.byReason) as CommitReason[]).filter(
    (k) => (ctx.report.byReason[k]?.count ?? 0) > 0,
  );
  if (reasons.length === 0) return nothingYet(spec, "no commit reason has been measured — durations start at tier `spans`");
  const G = { form: "dotplot" as const, axes: true };
  if (!room(ctx, spec, G)) return cannotDraw(ctx, spec);
  return [
    b.plot({
      id: "reason-dot", form: "dotplot", height: figureRows(ctx, G, 0, reasons.length), axes: true,
      orientation: "horizontal", yFormat: "duration",
      categories: [...reasons],
      series: [
        { values: reasons.map((k) => Number((ctx.report.byReason[k]?.p50 ?? 0).toFixed(3))), label: "p50" },
        { values: reasons.map((k) => Number((ctx.report.byReason[k]?.p95 ?? 0).toFixed(3))), label: "p95" },
      ],
      gapBefore: false,
    }),
  ];
};

// --- caches -----------------------------------------------------------------

const MISS_AXES: readonly MissReason[] = Object.freeze([
  "absent", "rev", "width", "theme", "focus", "range", "evicted", "nothing-changed",
]);

/**
 * Six caches against eight miss axes — the eye finds the hot cell.
 *
 * **A miss carries exactly one reason** (C28 I8) — the first axis that rejected
 * it — so a row sums to that cache's miss count and never to more. `height` is
 * mandatory on this form.
 */
const caches: CardDraw = (ctx, spec) => {
  const names = cacheNames(ctx.report);
  if (names.length === 0) return nothingYet(spec, "no cache has been instrumented in this session");
  const G = { form: "heatmap" as const, axes: false };
  if (!room(ctx, spec, G)) return cannotDraw(ctx, spec);
  const most = Math.max(
    1,
    ...names.flatMap((n) => MISS_AXES.map((a) => ctx.report.misses[n]?.[a] ?? 0)),
  );
  return [
    b.plot({
      id: "cache-heat", form: "heatmap", height: figureRows(ctx, G, 0, Math.max(names.length, 3)),
      yMin: 0, yMax: 1, colormap: "inferno",
      xLabels: [MISS_AXES[0] ?? "", "", MISS_AXES[MISS_AXES.length - 1] ?? ""],
      series: names.map((n) => ({
        label: n,
        values: MISS_AXES.map((a) => Number(((ctx.report.misses[n]?.[a] ?? 0) / most).toFixed(3))),
      })),
      gapBefore: false,
    }),
  ];
};

/**
 * What has accumulated, and when it jumped — `step` over the resource ring.
 *
 * **A cumulative counter is a step function** and a line interpolates it into a
 * lie: between two GC samples nothing gradual happened, and a slope drawn there
 * is an event that did not occur. Not the cache misses, which the report holds
 * as a snapshot with no time axis at all (F1131).
 */
const countersOverTime: CardDraw = (ctx, spec) => {
  const s = ctx.report.samples;
  if (s.length < 2) return nothingYet(spec, `${String(s.length)} resource samples — a staircase needs at least two treads`);
  const G = { form: "step" as const, axes: true };
  if (!room(ctx, spec, G)) return cannotDraw(ctx, spec);
  return [
    b.plot({
      id: "ctr-step", form: "step", height: figureRows(ctx, G), axes: true,
      series: [
        { values: s.map((x) => x.gc.minor + x.gc.major + x.gc.incremental), label: "gc" },
        { values: s.map((x) => x.majorPageFaults), label: "major faults" },
        { values: s.map((x) => x.involuntaryContextSwitches), label: "switches" },
      ],
      gapBefore: false,
    }),
  ];
};

// --- the loop ---------------------------------------------------------------

/** A stall is a band, not a percentile — the delay spectrum over the sample ring. */
const loopSpectrogram: CardDraw = (ctx, spec) => {
  const s = ctx.report.samples.filter((x) => x.loopDelaySamples > 0);
  if (s.length < 3) return nothingYet(spec, "fewer than three sampled loop windows — the p50 below the resolution is a floor and not a reading (C28 I13)");
  const G = { form: "spectrogram" as const, axes: false };
  if (!room(ctx, spec, G)) return cannotDraw(ctx, spec);
  const hi = Math.max(...s.map((x) => x.loopDelayMax), 1);
  const bands = [
    { label: `${ms(hi)} ms`, pick: (x: (typeof s)[number]): number => x.loopDelayMax },
    { label: "p99", pick: (x: (typeof s)[number]): number => x.loopDelayP99 },
    { label: "p50", pick: (x: (typeof s)[number]): number => x.loopDelayP50 },
  ];
  return [
    b.plot({
      id: "loop-spec", form: "spectrogram", height: figureRows(ctx, G, 0, 3),
      yMin: 0, yMax: 1, colormap: "magma",
      xLabels: ["oldest", "", "now"],
      series: bands.map((band) => ({
        label: band.label,
        values: s.map((x) => Number((band.pick(x) / hi).toFixed(3))),
      })),
      gapBefore: false,
    }),
  ];
};

/** How busy the process actually was — the honest *is it working* figure. */
const loopUtilisation: CardDraw = (ctx, spec) => {
  const s = ctx.report.samples;
  if (s.length < 2) return nothingYet(spec, "fewer than two resource samples");
  const G = { form: "utilisation" as const, axes: false };
  if (!room(ctx, spec, G)) return cannotDraw(ctx, spec);
  return [
    b.plot({
      id: "loop-util", form: "utilisation", height: figureRows(ctx, G, 0, 2),
      yMin: 0, yMax: 1, yFormat: "fraction",
      xLabels: ["oldest", "", "now"],
      series: [
        { label: "loop", values: s.map((x) => Number(x.loopUtilisation.toFixed(3))) },
        { label: "suspended", values: s.map((x) => (x.suspended ? 1 : 0)) },
      ],
      gapBefore: false,
    }),
  ];
};

// --- memory -----------------------------------------------------------------

/** The composition, and the floor under the sawtooth — GC drops with a rising floor is a leak. */
const memory: CardDraw = (ctx, spec) => {
  const s = ctx.report.samples;
  if (s.length < 2) return nothingYet(spec, "no resource sample yet — the sampler runs on the injected timer at tier `spans` and above");
  const G = { form: "stackedarea" as const, axes: true };
  if (!room(ctx, spec, G)) return cannotDraw(ctx, spec);
  return [
    b.plot({
      id: "mem-area", form: "stackedarea", height: figureRows(ctx, G), axes: true, yFormat: "bytes",
      series: [
        { label: "heap used", values: s.map((x) => x.heapUsed) },
        { label: "external", values: s.map((x) => x.external) },
        { label: "buffers", values: s.map((x) => x.arrayBuffers) },
      ],
      gapBefore: false,
    }),
  ];
};

/** V8's spaces as a proportion — `waffle` is exactly ten rows and ignores `height`. */
const heapSpaces: CardDraw = (ctx, spec) => {
  const spaces = [...ctx.report.heapSpaces].filter((x) => x.used > 0).sort((x, y) => y.used - x.used);
  if (spaces.length === 0) return nothingYet(spec, "no heap-space reading — the resource probe runs at tier `spans` and above");
  const total = spaces.reduce((n, x) => n + x.used, 0);
  return [
    b.plot({
      id: "spaces-waffle", form: "waffle", height: 10,
      segments: spaces.map((x) => ({ label: x.name, value: Math.max(1, Math.round((x.used / total) * 100)) })),
      series: [], gapBefore: false,
    }),
    b.notice(
      "info",
      `${mib(total).toFixed(1)} MiB used across ${String(spaces.length)} spaces — old space rising with new space flat is retention; the reverse is churn and no leak`,
      undefined, { id: "spaces-note" },
    ),
  ];
};

/** Created against finalised — **the gap is the finding, drawn** (C28 I43). */
const leaks: CardDraw = (ctx, spec) => {
  const names = Object.keys(ctx.report.leaks).sort();
  if (names.length === 0) return nothingYet(spec, "nothing is tracked for finalisation in this session");
  const G = { form: "dumbbell" as const, axes: true };
  if (!room(ctx, spec, G)) return cannotDraw(ctx, spec);
  return [
    b.plot({
      id: "leak-dumb", form: "dumbbell", height: figureRows(ctx, G, 0, names.length), axes: true,
      orientation: "horizontal",
      categories: names,
      series: [
        { values: names.map((n) => ctx.report.leaks[n]?.created ?? 0), label: "created" },
        { values: names.map((n) => ctx.report.leaks[n]?.finalised ?? 0), label: "finalised" },
      ],
      gapBefore: false,
    }),
  ];
};

// --- co-variance ------------------------------------------------------------

const SERIES_KEYS = ["frame ms", "heap", "cpu", "loop"] as const;

const covariates = (ctx: CardContext): readonly (readonly number[])[] => {
  const s = ctx.report.samples;
  return [
    ctx.report.timeline.map((f) => f.work),
    s.map((x) => x.heapUsed),
    s.map((x) => x.cpuUser),
    s.map((x) => x.loopDelayMax),
  ];
};

const pearson = (xs: readonly number[], ys: readonly number[]): number => {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const mx = xs.slice(0, n).reduce((a, v) => a + v, 0) / n;
  const my = ys.slice(0, n).reduce((a, v) => a + v, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i += 1) {
    const a = (xs[i] ?? 0) - mx;
    const c = (ys[i] ?? 0) - my;
    num += a * c; dx += a * a; dy += c * c;
  }
  const d = Math.sqrt(dx * dy);
  return d === 0 ? 0 : Number((num / d).toFixed(3));
};

const coVariance: CardDraw = (ctx, spec) => {
  const cols = covariates(ctx);
  if (cols.every((c) => c.length < 3)) return nothingYet(spec, "fewer than three readings of anything — a correlation over two points is a line");
  const G = { form: "correlation" as const, axes: false };
  if (!room(ctx, spec, G)) return cannotDraw(ctx, spec);
  return [
    b.plot({
      id: "cov-corr", form: "correlation", height: figureRows(ctx, G, 0, SERIES_KEYS.length),
      yMin: -1, yMax: 1, colormap: "coolwarm",
      categories: [...SERIES_KEYS],
      series: cols.map((row, i) => ({
        label: SERIES_KEYS[i] ?? "",
        values: cols.map((other) => pearson(row, other)),
      })),
      gapBefore: false,
    }),
  ];
};

/** The drill — `facets` lay out as one row of columns, so four panels and not sixteen. */
const thePairs: CardDraw = (ctx, spec) => {
  const cols = covariates(ctx);
  if (cols.every((c) => c.length < 3)) return nothingYet(spec, "fewer than three readings of anything");
  const G = { form: "pairplot" as const, axes: true };
  if (!room(ctx, spec, G)) return cannotDraw(ctx, spec);
  const inner = figureRows(ctx, G);
  return [
    b.plot({
      id: "pairs", form: "pairplot", height: inner, axes: true, series: [],
      facets: SERIES_KEYS.map((k, i) =>
        b.plot({
          id: `pair-${i}`, form: "scatter", height: Math.max(3, inner - 3), axes: true,
          series: [{ values: [...(cols[i] ?? [])], label: k } satisfies Series],
        }),
      ),
      gapBefore: false,
    }),
  ];
};

// --- marks, handles, the element space, the instrument ----------------------

/** Instants on a wall clock — `report.marks`, which nothing drew before. */
const marks: CardDraw = (ctx, spec) => {
  const m = ctx.report.marks;
  const caps = ctx.report.captures;
  if (m.length === 0 && caps.length === 0) {
    return nothingYet(spec, "no mark has been raised and no capture taken — `mark()` is the app's own instrument and the profiler raises none of its own (C28 I25)");
  }
  const G = { form: "dotplot" as const, axes: true };
  if (!room(ctx, spec, G)) return cannotDraw(ctx, spec);
  // **Marks alone, and the captures are counted beside them.** The first cut put
  // both on one axis and it is the F1131 shape again, one card over: a
  // `CaptureResult` carries `durationMs` and **no start**, so a capture row was
  // anchored at zero and drawn against wall-clock instants — a figure whose two
  // kinds of row are in different coordinate systems and which reads as though
  // they are in one.
  const rows = m
    .map((x) => ({ label: x.label, at: x.at }))
    .slice(0, Math.max(3, figureRows(ctx, G)));
  if (rows.length === 0) {
    return nothingYet(spec, `${String(caps.length)} captures were taken and no mark was raised — a capture carries a duration and no start, so it has no place on a wall clock`);
  }
  const base = Math.min(...rows.map((x) => x.at));
  const last = Math.max(...rows.map((x) => x.at));
  // An instant is a point, and a point on a shared axis needs the axis to have
  // an extent: the three series are the same value, and the domain comes from
  // the spread of the marks themselves.
  void last;
  return [
    b.plot({
      // **A `dotplot`, not a `timeline`** — the third instance of F1131's class
      // on this deck. `timeline` draws an interval per row from a start, a mid
      // and an end, and a mark is an **instant**: given one series it drew the
      // first mark as a full-width bar and the second as nothing, which is a
      // figure that is wrong and renders. The report holds no wall-clock
      // interval at all — `CaptureResult` has a duration and no start — so the
      // form is dispositioned rather than fed.
      id: "marks-dots", form: "dotplot", height: figureRows(ctx, G, 0, rows.length), axes: true,
      orientation: "horizontal", yFormat: "duration",
      categories: rows.map((x) => x.label),
      series: [
        { values: rows.map((x) => Number((x.at - base).toFixed(1))), label: "raised" },
      ],
      gapBefore: false,
    }),
  ];
};

/**
 * Active handles by type — **the one place a vertical bar is wrong**.
 *
 * Horizontal, because the vertical arm reserves a legend's width and draws
 * nothing in it, and drops a colliding category name reporting only a muted
 * `+N` (F374, C04 I8's fourth arm). Handle type names are long and collide.
 */
const handles: CardDraw = (ctx, spec) => {
  const last = lastRunning(ctx.report);
  if (last === undefined) return nothingYet(spec, "no sample of a running process — every one was taken while the session was suspended");
  const types = Object.keys(last.handles).sort();
  if (types.length === 0) return nothingYet(spec, "the process holds no named handle");
  const G = { form: "bar" as const, axes: true };
  if (!room(ctx, spec, G)) return cannotDraw(ctx, spec);
  return [
    b.plot({
      id: "handles-bar", form: "bar", height: figureRows(ctx, G, 0, types.length), axes: true,
      orientation: "horizontal",
      categories: types,
      series: [{ values: types.map((t) => last.handles[t] ?? 0), label: "held" } satisfies Series],
      gapBefore: false,
    }),
  ];
};

/**
 * Calls, volume and self time at once — `plot3d`, `colourBy: "value"`.
 *
 * **`axes: true` is refused on this form**; the frame is `box3`/`axes3`. And the
 * camera is the *initial* view: a live camera keys off a transcript entry, so a
 * card in an overlay is static, which is stated here rather than discovered.
 */
const elementSpace: CardDraw = (ctx, spec) => {
  const nodes = ctx.report.nodes.filter((n) => n.calls > 0).slice(0, 120);
  if (nodes.length < 4) return nothingYet(spec, "fewer than four measured elements — a cloud of three is three points");
  const G = { form: "plot3d" as const, axes: false };
  if (!room(ctx, spec, G)) return cannotDraw(ctx, spec);
  const norm = (vs: readonly number[]): number[] => {
    const hi = Math.max(...vs, 1);
    return vs.map((v) => (v / hi) * 2 - 1);
  };
  const xs = norm(nodes.map((n) => n.calls));
  const ys = norm(nodes.map((n) => n.frames));
  const zs = norm(nodes.map((n) => n.self));
  return [
    b.plot({
      id: "espace", form: "plot3d", height: figureRows(ctx, G),
      series: [],
      colourBy: "value",
      points3: [{
        label: "elements",
        points: nodes.map((n, i) => ({
          x: xs[i] ?? 0, y: ys[i] ?? 0, z: zs[i] ?? 0, value: Number(n.self.toFixed(3)),
        })),
      }],
      gapBefore: false,
    }),
  ];
};

/** What the profiler cost, and what it excluded — the instrument prices itself (C28 I34). */
const theInstrument: CardDraw = (ctx) => {
  const r = ctx.report;
  const out: Block[] = [
    b.kv(
      {
        "own cost": `${ms(r.overhead.estimateMs)} ms estimated from ${String(r.overhead.spans)} spans × 2 reads × ${r.overhead.clockNs.toFixed(1)} ns per measured read`,
        "async store": r.overhead.asyncEnabled
          ? "built — every await in this process pays for it"
          : "not built — nothing here has taxed a promise",
        excluded: `${String(r.excluded.selfInflicted)} self-inflicted${ctx.sep}${String(r.excluded.fallback)} fallback`,
        dropped: `${String(r.dropped.frames)} frames${ctx.sep}${String(r.dropped.samples)} samples${ctx.sep}${String(r.dropped.marks)} marks${ctx.sep}${String(r.dropped.captures)} captures abandoned${ctx.sep}${String(r.dropped.captureBytes)} capture bytes`,
        counters: `${String(plainCounters(r).length)} named, outside the coalescing pair`,
        regime: `node ${r.regime.node}${ctx.sep}${String(r.regime.cpus)} cpus${ctx.sep}tier \`${r.regime.tier}\`${ctx.sep}+/-${(r.regime.histogramError * 100).toFixed(1)}% bucket error`,
      },
      { id: "inst-kv", gapBefore: false },
    ),
  ];
  return out;
};

export const FRAMEWORK_CARDS: Readonly<Record<string, CardDraw>> = Object.freeze({
  "phases": areaCard("stackedarea", "phase-area"),
  "composition": areaCard("streamgraph", "phase-stream"),
  "by-kind": byKind,
  "span-shapes": spanShapes,
  "one-span": oneSpan,
  "spans-compared": spansCompared,
  "against-the-budget": againstTheBudget,
  "work-against-wait": workAgainstWait,
  "a-periodic-stall": periodicStall,
  "coalescing": coalescing,
  "by-reason": byReason,
  "caches": caches,
  "counters-over-time": countersOverTime,
  "the-loop-spectrogram": loopSpectrogram,
  "the-loop-utilisation": loopUtilisation,
  "memory": memory,
  "heap-spaces": heapSpaces,
  "leaks": leaks,
  "co-variance": coVariance,
  "the-pairs": thePairs,
  "marks": marks,
  "handles": handles,
  "element-space": elementSpace,
  "the-instrument": theInstrument,
});
