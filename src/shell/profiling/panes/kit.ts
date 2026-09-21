/**
 * The card kit — what every card in the deck is built out of.
 *
 * **A card is a pure function of one report and one region**, and the kit is
 * what makes that cheap: the height arithmetic, the two extractors, the
 * quartile reducer, the tree adapter, the footer that states what a figure
 * excludes, and the notice a card draws instead of throwing.
 *
 * **The extractors are named for their population and not for their shape**
 * (C28 I57). `record()` feeds two stores from one close — the span histograms
 * are unbounded since the last tier reset and the frame ring holds 512 — so at
 * frame 600 one report carries `spans.measure.count === 600` and
 * `timeline.length === 512` over the same name, and a figure taken from either
 * is right while disagreeing with the other (F1127). `frameSamples` and
 * `sessionSummary` are two functions rather than one with a flag, because a
 * flag is a thing a caller forgets and a name is a thing a reader reads.
 *
 * **The kit refuses above the form** (C28 I60). C12's contract is *refuse,
 * never ignore*: `b.plot` throws rather than degrades on a `violin` under two
 * rows per band, a `boxplot` with fewer rows than bands, a ninth series off a
 * matrix form and thirty-five more — inside a render path that has no catch and
 * whose `arm` has already run (F1130). So a card asks `room` before it builds,
 * and `cannotDraw` is what it returns when the answer is no.
 */
import { b } from "../../builders/index.js";
import { glyphs } from "../../../presentation/blocks/index.js";
import type { GlyphCaps } from "../../../presentation/blocks/index.js";
import { fillHeight, plotHeight } from "../../../presentation/plot/index.js";
import type { PlotGeometry } from "../../../presentation/plot/index.js";
import type { Block, HierarchyNode, QuartileSummary } from "../../../data/viewmodel/index.js";
import { SPAN_SITE, TIER_RANK } from "../types.js";
import type { StackNode } from "../stacks.js";
import type {
  FrameRecord, Histogram, ProfileReport, SpanName, TreeNode,
} from "../types.js";
import type { CardSpec } from "./register.js";

/**
 * How a card is drawn: a value and a region in, the panel's children out.
 *
 * **Blocks, not a panel.** The frame, the title and the footer are the kit's
 * (`card` below), so a card cannot forget to state what it excludes and cannot
 * spend a row on furniture the panel already gives free.
 */
export type CardDraw = (ctx: CardContext, spec: CardSpec) => readonly Block[];

/** The rows and columns a card has to work in — the view's region, whole. */
export type Region = Readonly<{ w: number; rows: number }>;

export type CardContext = Readonly<{
  report: ProfileReport;
  region: Region;
  caps: GlyphCaps;
  /** The field separator, resolved once from the terminal's capabilities (C09 I49). */
  sep: string;
  /**
   * Which retained frame a per-frame card is showing, by `seq` (C28 I58).
   *
   * Never an index into `worst`: `report()` recomputes that set on every call
   * and the view refreshes every second, so a position names a different frame
   * the moment a slower one arrives (F1128).
   */
  seq?: number;
}>;

/**
 * The arm a caller with no terminal gets: ASCII, so the separator is `:`.
 *
 * Explicit rather than inferred — defaulting to the unicode arm would put an
 * `East_Asian_Width=Ambiguous` character on a terminal nobody asked about.
 */
export const ASCII_CAPS: GlyphCaps = { unicode: "ascii", ambiguousWidth: "narrow" };

export const contextFor = (
  report: ProfileReport,
  region: Region,
  caps: GlyphCaps = ASCII_CAPS,
  seq?: number,
): CardContext => ({
  report,
  region,
  caps,
  sep: ` ${glyphs(caps).separator} `,
  // `exactOptionalPropertyTypes` — an absent `seq` is absent rather than
  // present-and-undefined, which is the distinction `resolveFrame` reads.
  ...(seq === undefined ? {} : { seq }),
});

/**
 * What a card says instead of a duration below `spans` (C28 I11, I23).
 *
 * **One copy, in the kit, because the two it replaces had already drifted**:
 * `app.ts`'s ended *which is the one reading a profiler must not produce* and
 * `framework.ts`'s did not, and neither reader could see the other. A sentence
 * written twice is a sentence that will be corrected once.
 */
export const NO_DURATIONS =
  "the tier is below `spans`, so the report omits durations rather than reporting zeroes — " +
  "a zeroed figure reads as measured-and-fast, which is the one reading a profiler must not produce";

/** Is the tier high enough to have durations at all (C28 I11)? */
export const spanning = (r: ProfileReport): boolean =>
  TIER_RANK[r.regime.tier] >= TIER_RANK.spans;

export const ms = (v: number): string =>
  v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);

export const mib = (v: number): number => Number((v / 1024 ** 2).toFixed(1));

// --- the card's frame -------------------------------------------------------

/**
 * A card, framed and footed.
 *
 * `b.panel` costs **children + 2 rows** and draws children at `w - 2`, carrying
 * the title in the top border and the footer in the bottom (C09 §4). **The
 * frame is free**, which is what makes one-figure-per-card affordable, and the
 * footer is where a card states what it excludes — also free, and the reason
 * every card can afford to name its population (C28 I57).
 */
export const card = (
  id: string,
  title: string,
  children: readonly Block[],
  footer: string,
): Block => b.panel(title, [...children], { id, footer });

/**
 * How many rows the figure gets — **solved against C12's own measurement**.
 *
 * `fillHeight` answers *what height should I ask for* and it is the wrong half
 * of the question on its own: `height` is the **plot area**, and every
 * `axes: true` form spends three more rows on the lid, the axis rule and the
 * x-labels, several forms ignore `height` altogether, and `horizon` spends a
 * legend row whatever it is told. A card that asked for the region got a block
 * three rows taller than the region, on nineteen of thirty-seven cards, with
 * nothing on either side of the seam able to say so (F1133).
 *
 * So this searches down from the region for the largest height whose
 * `plotHeight` fits — C12's own function, the one the renderer measures with,
 * rather than a constant that agrees with it today. `natural` caps the answer
 * where a form's height is really its category count: a `bullet` of three rows
 * in a twenty-one-row area draws three rows and eighteen blanks, which reads as
 * a figure that failed rather than one that is small.
 */
export const figureRows = (
  ctx: CardContext,
  geom: Omit<PlotGeometry, "height">,
  reserve = 0,
  natural = Number.POSITIVE_INFINITY,
): number => {
  const available = fillHeight(ctx.region.rows - 2, 8, reserve);
  let h = Math.max(1, Math.min(available, Math.floor(natural)));
  // Down from the cap rather than up from one: the answer is almost always the
  // first or second try, and starting at the top means a form that ignores
  // `height` lands on its own number instead of on 1.
  while (h > 1 && plotHeight({ ...geom, height: h }) > available) h -= 1;
  return h;
};

/**
 * Has the card got the room its form needs (C28 I60)?
 *
 * Asked **before** the figure is built rather than caught after, because a
 * caught throw one second later is still a pane that cannot draw itself, and
 * the notice is the honest version of that.
 */
export const room = (
  ctx: CardContext,
  spec: CardSpec,
  geom: Omit<PlotGeometry, "height">,
  reserve = 0,
): boolean => plotHeight({ ...geom, height: spec.floor }) <= fillHeight(ctx.region.rows - 2, 8, reserve);

/** The card a region cannot hold, naming the floor it missed rather than throwing. */
export const cannotDraw = (ctx: CardContext, spec: CardSpec, reserve = 0): Block[] => [
  b.notice(
    "info",
    `this figure needs ${String(spec.floor)} rows and has ` +
      `${String(fillHeight(ctx.region.rows - 2, 8, reserve))} — ` +
      `a \`${spec.form ?? "text"}\` below its floor is refused by C12 rather than drawn smaller, ` +
      `so the card says which floor it missed instead of stopping the view`,
    undefined,
    { id: `${spec.id}-floor` },
  ),
];

/** The card with no data yet — a notice, never a zero (C28 I11, I23). */
export const nothingYet = (spec: CardSpec, why: string): Block[] => [
  b.notice("info", why, undefined, { id: `${spec.id}-empty` }),
];

// --- the two populations ----------------------------------------------------

/** Every span name in the report, at one site (C28 I41). */
export const namesAt = (
  r: ProfileReport,
  site: "frame" | "session",
): readonly SpanName[] => {
  const spans = r.spans ?? {};
  return (Object.keys(spans) as SpanName[])
    .filter((n) => (spans[n]?.count ?? 0) > 0)
    .filter((n) => {
      const at = SPAN_SITE[n] as string | undefined;
      return site === "frame" ? at === "frame" || at === "frame-itself" : at === "session";
    })
    .sort();
};

/**
 * A span's per-frame self times, over the ring (C28 I41, I57).
 *
 * **Frame-site names only, and the filter is the whole function.**
 * `FrameRecord.spans` accumulates whatever closed since the last frame reset,
 * so a session-site name appearing there is the window it happened to close in
 * rather than a per-frame measurement — F888 measured that as a −460.5 ms
 * residue. A series built without this filter is a figure of a population that
 * does not exist.
 *
 * Empty for a session-site name, deliberately: the caller's honest option is
 * `sessionSummary`, and a silently wrong series is the one thing this must not
 * return.
 */
export const frameSamples = (r: ProfileReport, name: SpanName): readonly number[] => {
  const at = SPAN_SITE[name] as string | undefined;
  if (at !== "frame" && at !== "frame-itself") return [];
  return r.timeline.map((f) => f.spans[name] ?? 0).filter((v) => v > 0);
};

/** A span's summary since the last tier reset — unbounded, and not the ring's (C28 I57). */
export const sessionSummary = (r: ProfileReport, name: SpanName): Histogram | undefined =>
  (r.spans ?? {})[name];

/** How the two populations are named on a card's face, so no figure is silent about it. */
export const populationFooter = (r: ProfileReport, over: "ring" | "session"): string =>
  over === "ring"
    ? `${String(r.timeline.length)} frames in the ring` +
      (r.dropped.frames > 0 ? `, ${String(r.dropped.frames)} dropped past it` : "")
    : `every close since the tier was set${
        r.regime.ringReset > 0 ? `, ring reset at ${ms(r.regime.ringReset)} ms` : ""
      }`;

// --- reducers and adapters --------------------------------------------------

/**
 * A five-number summary from real samples (C28 I56).
 *
 * Used where samples exist. Where they do not, `summaryOf` below takes the
 * histogram's own `q1` and `q3` — which is why I56 put them there: without the
 * pair, every quartile-shaped form over a session-site span fabricates two of
 * its five numbers.
 */
export const quartilesOf = (values: readonly number[]): QuartileSummary | null => {
  if (values.length === 0) return null;
  const xs = [...values].sort((x, y) => x - y);
  const at = (q: number): number => xs[Math.min(xs.length - 1, Math.floor(q * (xs.length - 1)))] ?? 0;
  return {
    min: xs[0] ?? 0,
    q1: at(0.25),
    median: at(0.5),
    q3: at(0.75),
    max: xs[xs.length - 1] ?? 0,
    mean: xs.reduce((n, v) => n + v, 0) / xs.length,
  };
};

/** The same five numbers from a published summary, which now carries them (C28 I56). */
export const summaryOf = (h: Histogram): QuartileSummary => ({
  min: h.min, q1: h.q1, median: h.p50, q3: h.q3, max: h.max, mean: h.mean,
});

/**
 * `TreeNode` as a `HierarchyNode` — which is almost its shape already.
 *
 * **`self` and not `total`** (C28 I31, I40): a hierarchy form apportions a
 * parent's area among its children, so passing the total counts a container's
 * children twice and draws a figure whose arithmetic is self-consistent and
 * about a different frame. A leaf's self time is its total.
 */
export const hierarchyOf = (n: TreeNode): HierarchyNode => ({
  label: n.name,
  value: n.self,
  ...(n.children.length > 0 ? { children: n.children.map(hierarchyOf) } : {}),
});

/**
 * The capture the sampled card draws — the last `cpu` one that **completed**
 * (C28 I64, §9b S17, S18).
 *
 * **Completed, not newest.** A capture in flight is an entry with no tree, so a
 * card taking `captures.at(-1)` blanks for the length of the window and comes
 * back — which reads as the card failing rather than as a capture running.
 * An abandoned one has no tree either, and it is kept in view here: *abandoned*
 * and *none taken* are two different sentences and the card draws them as two.
 */
export const lastSampled = (r: ProfileReport): ProfileReport["captures"][number] | undefined => {
  const cpu = r.captures.filter((c) => c.kind === "cpu");
  return [...cpu].reverse().find((c) => c.stacks !== null) ?? cpu[cpu.length - 1];
};

/**
 * A sampled stack as a `HierarchyNode` — `self`, for `hierarchyOf`'s reason.
 *
 * Its own function rather than a widened `hierarchyOf`: the two trees carry
 * different things and a shared structural parameter would make it easy to hand
 * a `TreeNode` to the sampled card and get a figure back (C28 I62).
 */
export const stackHierarchy = (n: StackNode): HierarchyNode => ({
  label: n.name,
  value: n.self,
  ...(n.children.length > 0 ? { children: n.children.map(stackHierarchy) } : {}),
});

/**
 * The retained frame a card is showing, resolved by `seq` on every draw (C28 I58).
 *
 * `null` when the frame has left the set — which is itself a reading, and the
 * card says so rather than drawing its neighbour under the old heading.
 */
export const resolveFrame = (r: ProfileReport, seq: number | undefined): FrameRecord | null => {
  if (seq === undefined) return r.worst[0] ?? null;
  return r.worst.find((f) => f.seq === seq) ?? null;
};

/** The counters that are not the coalescing pair — `commit.*` and `frame.*` are its. */
export const plainCounters = (r: ProfileReport): readonly (readonly [string, number])[] =>
  Object.entries(r.counters).filter(([k]) => !k.startsWith("commit.") && !k.startsWith("frame."));

export const cacheNames = (r: ProfileReport): readonly string[] =>
  [...new Set([...Object.keys(r.hits), ...Object.keys(r.misses)])].sort();

/** The last sample taken while the session was actually running (C28 I27, F900). */
export const lastRunning = (r: ProfileReport): ProfileReport["samples"][number] | undefined => {
  const running = r.samples.filter((s) => !s.suspended);
  return running[running.length - 1];
};
