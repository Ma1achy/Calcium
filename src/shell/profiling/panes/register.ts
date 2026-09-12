/**
 * C28 §3c's deck, as data — the register the three totality gates compare against.
 *
 * **Declarations, not drawing.** Nothing here builds a block. The cards are
 * written in the modules beside this one and each names its row here, so the
 * gates can ask questions about the deck that no card can answer about itself:
 * whether every member of `PlotForm` is a card or a recorded refusal (I59),
 * whether every key of `ProfileReport` reaches a figure (I61), and whether every
 * card says which population its spans came from (I57, I41).
 *
 * **The register was written before the cards and that is the whole of why it
 * found anything.** Working out which report key each card reads is what
 * surfaced two cards whose question had no time axis in the report — a `gantt`
 * over spans that publish no start, a `step` over a snapshot that carries no
 * counters (F1131) — and comparing the forms to the union is what surfaced
 * `bubble`, discussed correctly in §3c inside another card's note and
 * dispositioned nowhere (F1132). Neither is reachable from a row read one at a
 * time: the first is a disagreement between a form's second axis and a source's
 * shape, and the second is prose one table away from the list that is compared.
 */
import type { PlotForm } from "../../../data/viewmodel/index.js";
import type { ProfileReport } from "../types.js";

/** The deck's three groups, in the order `n`/`p` walks them. */
export type CardGroup = "verdict" | "app" | "framework";

export const CARD_GROUPS: readonly CardGroup[] = Object.freeze(["verdict", "app", "framework"]);

/**
 * Which population a card's span figures were taken over (C28 I41, I57).
 *
 * **Two spans with one name are two populations**, and `FrameRecord.spans`
 * accumulates whatever closed since the last frame reset — so a session-site
 * name appearing there is the window it happened to close in and not a
 * per-frame measurement. Measured once at a residue of −460.5 ms (F888).
 * `none` is a card that draws no span at all, which is most of Group B.
 */
export type Population = "frame" | "session" | "none";

export type CardSpec = Readonly<{
  /** Stable across a rename of the title — the address `/profile` and a card's `seq` hold. */
  id: string;
  group: CardGroup;
  /** The question in the reader's words, from §3c's own table. */
  question: string;
  /** The one figure. `null` is a text card — the verdict's contents, `the instrument`'s `kv`. */
  form: PlotForm | null;
  /**
   * A second form the card draws only when the report carries what it needs.
   *
   * One entry today: `the instrument` draws a `slope` of before against after
   * where a replay baseline exists and nothing otherwise. It is a member of the
   * register rather than a note, because F1132 is what a note buys.
   */
  also?: readonly PlotForm[];
  /** Every `ProfileReport` key the card reads — the coverage gate's input (I61). */
  draws: readonly (keyof ProfileReport)[];
  site: Population;
  /**
   * The rows the card's figure needs before the kit will build it (I60).
   *
   * **Declared here and asserted against `b.plot` by T1.112**, rather than
   * discovered by a throw inside a render path with no catch: C12 refuses
   * rather than degrades, and the region is not bounded below (F1130).
   */
  floor: number;
  /** One card per retained worst frame, addressed by `seq` and never by position (I58). */
  perFrame?: true;
  /**
   * The card draws a loop-delay figure, so its footer carries the resolution
   * (C28 I13).
   *
   * **Declared rather than derived, because `draws` is keyed by report key and
   * the resolution qualifies three fields of one.** Every card here draws
   * `samples`; two of the four draw a delay, and a footer that quoted the
   * resolution on all four would put a loop figure's caveat under a heap chart.
   * The suspended-sample clause beside it *is* derived, and the difference is
   * real: a suspended sample breaks every series taken over the ring, and a
   * resolution bounds only the delay.
   */
  loopDelay?: true;
  /**
   * The card's figure comes from V8's sampler rather than from a span, so its
   * population clause is the capture window and its exclusion clause is the
   * synthetic frames (C28 I63, I64).
   *
   * **A member rather than a sentence in the card**, for the reason every other
   * clause here is generated: a card that has to remember to say what it
   * dropped is a card that will forget, and `(idle)` is the thing this figure
   * drops most of.
   */
  sampled?: true;
}>;

const card = (spec: CardSpec): CardSpec => Object.freeze(spec);

/** Group 0 — the verdict. The only card that must not page (I52). */
const VERDICT: readonly CardSpec[] = Object.freeze([
  card({
    id: "verdict",
    group: "verdict",
    question: "is it slow, where, and which card answers it",
    form: "bullet",
    draws: ["regime", "latency", "spans", "excluded", "frames"],
    site: "frame",
    floor: 3,
  }),
]);

/** Group A — the app's own cost. */
const APP: readonly CardSpec[] = Object.freeze([
  card({
    id: "vitals",
    group: "app",
    question: "what happened, and did the spikes coincide",
    form: "horizon",
    draws: ["timeline", "samples"],
    // **`frame`, and the gate is what said so.** The card reads `work` and
    // `wait` rather than a named span, so `none` read as right — and a
    // `FrameRecord` *is* the frame population, so the spikes it draws are
    // frame-site whether or not a span name appears. Declared `none`, the
    // card would sit beside `memory` and `the loop` in the one classification
    // that says *this figure is not about frames*.
    site: "frame",
    // Four stacked horizons, each a band row and the legend row the form spends
    // whatever `legend` says.
    floor: 8,
    loopDelay: true,
  }),
  card({
    id: "frame-cost",
    group: "app",
    question: "the distribution at each moment",
    form: "latency",
    draws: ["timeline", "latency"],
    site: "frame",
    // A matrix form: two axis rows even at `axes: false`, and a matrix of one
    // row is a strip.
    floor: 5,
  }),
  card({
    id: "where-the-frame-went",
    group: "app",
    question: "these 47 ms — where",
    form: "waterfall",
    draws: ["worst", "spans"],
    site: "frame",
    floor: 4,
    perFrame: true,
  }),
  card({
    id: "the-flow",
    group: "app",
    question: "the same question as a division",
    form: "sankey",
    draws: ["worst", "spans", "nodes"],
    site: "frame",
    floor: 6,
    perFrame: true,
  }),
  card({
    id: "element-tree",
    group: "app",
    question: "which element, in the nesting",
    form: "icicle",
    draws: ["worst"],
    site: "frame",
    floor: 4,
    perFrame: true,
  }),
  card({
    id: "flame",
    group: "app",
    question: "the same datum, root-down",
    form: "flame",
    draws: ["worst"],
    site: "frame",
    floor: 4,
    perFrame: true,
  }),
  card({
    id: "named-tree",
    group: "app",
    question: "which element, when the tiles are too narrow to say",
    form: "tree",
    draws: ["worst"],
    site: "frame",
    floor: 4,
    perFrame: true,
  }),
  card({
    id: "frame-on-a-clock",
    group: "app",
    question: "where inside the frame each span actually sat",
    form: "gantt",
    draws: ["worst"],
    site: "frame",
    floor: 3,
    perFrame: true,
  }),
  card({
    id: "elements-ranked",
    group: "app",
    question: "the top twenty by self time",
    form: "lollipop",
    draws: ["nodes"],
    site: "frame",
    floor: 3,
  }),
  card({
    id: "cost-per-unit",
    group: "app",
    question: "expensive per unit against how many units",
    form: "scatter",
    draws: ["nodes"],
    site: "frame",
    floor: 5,
  }),
  card({
    id: "content-sizes",
    group: "app",
    question: "what the app asks the framework to draw",
    form: "ridgeline",
    draws: ["gauges"],
    site: "none",
    floor: 4,
  }),
  card({
    id: "far-side-cost",
    group: "app",
    question: "each far-side span, p50 against p95",
    form: "dotplot",
    draws: ["spans"],
    site: "session",
    floor: 3,
  }),
]);

/** Group B — the framework's. */
const FRAMEWORK: readonly CardSpec[] = Object.freeze([
  card({
    id: "phases",
    group: "framework",
    question: "does drawing grow with the transcript",
    form: "stackedarea",
    draws: ["timeline"],
    site: "frame",
    floor: 4,
  }),
  card({
    id: "composition",
    group: "framework",
    question: "the same when the total swings",
    form: "streamgraph",
    draws: ["timeline"],
    site: "frame",
    floor: 4,
  }),
  card({
    id: "by-kind",
    group: "framework",
    question: "which of forty kinds costs most",
    form: "treemap",
    draws: ["byKind"],
    site: "frame",
    floor: 4,
  }),
  card({
    id: "span-shapes",
    group: "framework",
    question: "which spans are bimodal",
    form: "ridgeline",
    draws: ["timeline", "spans"],
    site: "frame",
    floor: 4,
  }),
  card({
    id: "one-span",
    group: "framework",
    question: "the drill",
    form: "violin",
    draws: ["timeline"],
    site: "frame",
    // Two rows per band and one band, so the floor is met at any card height.
    floor: 2,
  }),
  card({
    id: "spans-compared",
    group: "framework",
    question: "five-number summaries, side by side",
    form: "boxplot",
    draws: ["timeline"],
    site: "frame",
    // One row per band, five bands.
    floor: 5,
  }),
  card({
    id: "against-the-budget",
    group: "framework",
    question: "what share is under 16 ms",
    form: "ecdf",
    draws: ["latency", "timeline"],
    site: "frame",
    floor: 4,
  }),
  card({
    id: "work-against-wait",
    group: "framework",
    question: "cost or policy",
    form: "density2d",
    draws: ["timeline"],
    site: "frame",
    floor: 5,
  }),
  card({
    id: "a-periodic-stall",
    group: "framework",
    question: "is something beating against the frame window",
    form: "autocorrelation",
    draws: ["timeline"],
    site: "frame",
    floor: 4,
  }),
  card({
    id: "coalescing",
    group: "framework",
    question: "C03's value proposition",
    form: "funnel",
    draws: ["counters", "frames"],
    site: "none",
    floor: 3,
  }),
  card({
    id: "by-reason",
    group: "framework",
    question: "p50 and p95 per commit reason",
    form: "dotplot",
    draws: ["byReason"],
    site: "none",
    floor: 3,
  }),
  card({
    id: "caches",
    group: "framework",
    question: "six caches against eight axes",
    form: "heatmap",
    draws: ["misses", "hits"],
    site: "none",
    floor: 5,
  }),
  card({
    id: "counters-over-time",
    group: "framework",
    question: "what has accumulated, and when it jumped",
    form: "step",
    draws: ["samples"],
    site: "none",
    floor: 4,
  }),
  card({
    id: "the-loop-spectrogram",
    group: "framework",
    question: "a stall is a band, not a percentile",
    form: "spectrogram",
    draws: ["samples"],
    site: "none",
    floor: 5,
    loopDelay: true,
  }),
  card({
    id: "the-loop-utilisation",
    group: "framework",
    question: "how busy the process actually was",
    form: "utilisation",
    draws: ["samples"],
    site: "none",
    floor: 3,
    loopDelay: true,
  }),
  card({
    id: "memory",
    group: "framework",
    question: "composition, and the floor under the sawtooth",
    form: "stackedarea",
    draws: ["samples"],
    site: "none",
    floor: 4,
  }),
  card({
    id: "heap-spaces",
    group: "framework",
    question: "V8's spaces as a proportion",
    form: "waffle",
    draws: ["heapSpaces"],
    site: "none",
    // `waffle` is always ten rows and ignores `height`.
    floor: 10,
  }),
  card({
    id: "leaks",
    group: "framework",
    question: "created against finalised",
    form: "dumbbell",
    draws: ["leaks"],
    site: "none",
    floor: 3,
  }),
  card({
    id: "co-variance",
    group: "framework",
    question: "what moves with what",
    form: "correlation",
    draws: ["samples"],
    site: "none",
    floor: 5,
    loopDelay: true,
  }),
  card({
    id: "the-pairs",
    group: "framework",
    question: "the drill",
    form: "pairplot",
    draws: ["samples"],
    site: "none",
    floor: 6,
    loopDelay: true,
  }),
  card({
    id: "marks",
    group: "framework",
    question: "instants on a wall clock",
    form: "dotplot",
    draws: ["marks"],
    site: "none",
    floor: 3,
  }),
  card({
    id: "handles",
    group: "framework",
    question: "by type",
    form: "bar",
    draws: ["samples"],
    site: "none",
    floor: 3,
  }),
  card({
    id: "element-space",
    group: "framework",
    question: "three quantities at once",
    form: "plot3d",
    draws: ["nodes"],
    site: "frame",
    floor: 6,
  }),
  card({
    id: "sampled-stacks",
    group: "framework",
    question: "which function was on the stack, not which block cost what",
    form: "flame",
    draws: ["captures"],
    // **Not a span site at all** (C28 I64). The population is V8's sampler over
    // one capture window, which is neither of the two `SPAN_SITE` answers and
    // is why `sampled` carries its own clause.
    site: "none",
    floor: 4,
    sampled: true,
  }),
  card({
    id: "the-instrument",
    group: "framework",
    question: "what the profiler cost and excluded",
    form: null,
    also: ["slope"],
    draws: ["regime", "overhead", "excluded", "dropped", "captures"],
    site: "none",
    floor: 3,
  }),
]);

export const CARDS: readonly CardSpec[] = Object.freeze([...VERDICT, ...APP, ...FRAMEWORK]);

/**
 * What every member of `PlotForm` is to this deck (C28 I59).
 *
 * `satisfies Record<PlotForm, …>` is the equality, in both directions and at
 * compile time: the `Record` forces every member and `satisfies` refuses an
 * extra, so a form added to C12 fails the build here until it is dispositioned
 * and an entry for a form that no longer exists fails too. The runtime rows
 * check what the type cannot — that a form marked `card` has one, and that one
 * marked otherwise does not.
 *
 * - `card` — drawn by a card above.
 * - `inline` — used, but never as a card: `sparkline` in the contents list and
 *   in table cells, `line` inside the vitals drill.
 * - `refused` — considered and not used, with the reason in §3c's table.
 * - `deferred` — wanted, blocked, and the blocker named as a symbol.
 */
export type Disposition = "card" | "inline" | "refused" | "deferred";

export const FORM_DISPOSITION = {
  autocorrelation: "card", bar: "card", boxplot: "card", bullet: "card",
  correlation: "card", density2d: "card", dotplot: "card", dumbbell: "card",
  ecdf: "card", flame: "card", funnel: "card", gantt: "card", heatmap: "card",
  horizon: "card", icicle: "card", latency: "card", lollipop: "card",
  pairplot: "card", plot3d: "card", ridgeline: "card", sankey: "card",
  scatter: "card", slope: "card", spectrogram: "card", stackedarea: "card",
  step: "card", streamgraph: "card", tree: "card",
  treemap: "card", utilisation: "card", violin: "card", waffle: "card",
  waterfall: "card",

  line: "inline", sparkline: "inline",

  bubble: "refused", confusion: "refused", contour: "refused",
  density: "refused", graph: "refused", histogram: "refused", pie: "refused",
  quiver: "refused", radar: "refused",

  calendar: "deferred", forest: "deferred", smallmultiples: "deferred",
  timeline: "deferred",
} as const satisfies Readonly<Record<PlotForm, Disposition>>;

/**
 * Every key of `ProfileReport` — exhaustive against the type, by construction.
 *
 * **The compile-time half of I61 and the half that matters.** A hand-written
 * list compared against a hand-written list is a tally over two populations
 * that agree by being wrong together; this one is checked against
 * `keyof ProfileReport` by `EVERY_REPORT_KEY` below, so a member added to the
 * report fails the build rather than going quietly undrawn.
 */
export const REPORT_KEYS = [
  "regime", "spans", "latency", "byReason", "timeline", "worst", "nodes",
  "byKind", "byEntry", "counters", "gauges", "misses", "hits", "marks",
  "samples", "captures", "excluded", "leaks", "dropped", "overhead",
  "heapSpaces", "frames",
] as const satisfies readonly (keyof ProfileReport)[];

/**
 * The other direction, which `satisfies` alone does not give.
 *
 * `satisfies readonly (keyof ProfileReport)[]` refuses a key the report does not
 * have; nothing in it refuses a key the report *does* have and the list omits.
 * This alias is `never` exactly when the list is complete, so the assignment
 * below stops compiling the day a member is added — which is the whole point of
 * writing the register before the cards.
 */
type MissingReportKey = Exclude<keyof ProfileReport, (typeof REPORT_KEYS)[number]>;
export const EVERY_REPORT_KEY: MissingReportKey extends never ? true : never = true;

/**
 * Keys no card draws, each with the reason (C28 I61).
 *
 * **Compared by equality rather than as a subset**, so a key whose card is
 * later deleted cannot quietly rejoin the list, and an entry that stops being
 * true has to be removed by hand.
 */
export const UNDRAWN = Object.freeze({
  byEntry:
    "deferred, blocker `NodeStat.firstFrame`. *Does cost rise with position in the document* " +
    "is the question and `scatter` is the form; the report cannot express the abscissa — " +
    "`byEntry` is keyed by entry id, `NodeStat` carries no ordinal, and `snapshot()` sorts by " +
    "`self`, so even insertion order is gone. A card taking its x axis from the sort it happens " +
    "to receive would be a figure whose abscissa is a rendering artefact (F1129).",
}) satisfies Readonly<Partial<Record<keyof ProfileReport, string>>>;
