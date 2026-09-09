/**
 * C28's panes — a `ProfileReport` drawn.
 *
 * **A pure function from the report to blocks**, which is what makes it
 * testable without a session and what keeps C28 out of the render path: the
 * panes are a composition (C22) over a value, and the value is produced by
 * decoration at seams the root already owns.
 *
 * **Every pane displays what it excludes.** A reader who opens the profiler and
 * watches frame cost rise will otherwise conclude the framework is slow, so the
 * self-inflicted count sits beside the total rather than in a footnote
 * (C28 I12). The same rule puts the histogram's error bound in the header
 * (I10) and the loop delay's resolution beside its figure (I13): a percentile
 * quoted without its precision gets compared across runs by a reader who does
 * not know it cannot be.
 *
 * **`wait` and `work` are never summed** (C28 I4). They appear as two series of
 * a stacked bar, which shows the sum visually without producing a number that
 * claims to be one thing.
 *
 * **The overview fits the region it opens in** (C28 I52): at most 23 rows at
 * 80 columns for every report — a 24-row terminal minus the view's header —
 * because it is the pane a reader opens first and the one that must not page.
 * Every block on it is bounded by a closed set, and the two that are not, the
 * counters table and the cache table, are drawn on `frame` with one overview
 * row saying so. The heights were walked by hand before the cut and are in
 * C28 §3c; T1.100 holds them to the measurement.
 */
import { b } from "../builders/index.js";
import { glyphs } from "../../presentation/blocks/index.js";
import type { GlyphCaps } from "../../presentation/blocks/index.js";
import type { Block } from "../../data/viewmodel/index.js";
import { TIER_RANK } from "./types.js";
import type { CommitReason, Histogram, ProfileReport, SpanName } from "./types.js";

export type PaneName = "overview" | "frame" | "distribution" | "memory";

export const PANES: readonly PaneName[] = Object.freeze([
  "overview", "frame", "distribution", "memory",
]);

/**
 * Is the tier high enough to have durations?
 *
 * The recorder holds the same predicate as a closure over its own `tier`, and
 * this is the reader's copy over a report's. Written against `TIER_RANK` rather
 * than as a list of names because a list is a rule with a birthday: it is
 * correct until a fifth tier is added and then silently answers `false` for it,
 * which here would print *raise the tier* to someone already above it.
 */
const spanning = (r: ProfileReport): boolean => TIER_RANK[r.regime.tier] >= TIER_RANK.spans;

const ms = (v: number): string => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2));
const mib = (v: number): number => Number((v / 1024 ** 2).toFixed(1));

const caption = (text: string, id: string): Block => b.rule(text, undefined, { id });

/**
 * The header every pane carries: the regime, and what the figures cannot say.
 *
 * **Four rows, not six** (C28 I52): the tier, the frame count and the elapsed
 * time are one line a reader takes in at once, and the overview has 23 rows to
 * spend. `histogram`, `excluded` and `dropped` keep their own rows — each is a
 * figure's qualifier (I10, I12, I18), and T1.96 and T4.9 read `excluded` by
 * its label.
 */
function regimeRow(r: ProfileReport, id: string, sep: string): Block {
  const pct = (r.regime.histogramError * 100).toFixed(1);
  return b.kv(
    {
      regime: `tier ${r.regime.tier}${sep}${String(r.frames)} frames${sep}${ms(r.regime.durationMs)} ms elapsed`,
      histogram: `log-linear, +/-${pct}% relative`,
      excluded: `${String(r.excluded.selfInflicted)} self-inflicted${sep}${String(r.excluded.fallback)} fallback`,
      dropped: `${String(r.dropped.frames)} frames past the ring`,
    },
    { id, gapBefore: false },
  );
}

function spanSeries(r: ProfileReport): { names: readonly SpanName[]; p50: number[]; p95: number[] } {
  const spans = r.spans ?? {};
  const names = (Object.keys(spans) as SpanName[]).filter((n) => (spans[n]?.count ?? 0) > 0);
  return {
    names,
    p50: names.map((n) => Number((spans[n]?.p50 ?? 0).toFixed(3))),
    p95: names.map((n) => Number((spans[n]?.p95 ?? 0).toFixed(3))),
  };
}

function reasons(r: ProfileReport): readonly CommitReason[] {
  return (Object.keys(r.byReason) as CommitReason[]).filter(
    (k) => (r.byReason[k]?.count ?? 0) > 0,
  );
}

/** Every counter that is not the coalescing pair — `commit.*` and `frame.*` are `ov-coalesce`'s. */
const counterEntries = (r: ProfileReport): readonly (readonly [string, number])[] =>
  Object.entries(r.counters).filter(([k]) => !k.startsWith("commit.") && !k.startsWith("frame."));

const cacheNames = (r: ProfileReport): readonly string[] =>
  [...new Set([...Object.keys(r.hits), ...Object.keys(r.misses)])].sort();

/**
 * The counters table — on `frame`, not on the overview (C28 I52, §9b B9).
 *
 * **No type bounds its rows**: any component may `count` under any name, so a
 * pane holding it cannot promise a height. The overview promises one, so the
 * table is drawn here, whole, where the pane already pages, and the overview
 * says how many rows are here. A cap with an *N of M* marker on the overview
 * was the other option and it drops exactly the figures a reader opened the
 * pane for.
 */
function countersTable(r: ProfileReport): readonly Block[] {
  const counters = counterEntries(r);
  if (counters.length === 0) return [];
  return [
    caption("counters — every count the session recorded, at every tier that counts", "fr-cap-counters"),
    b.table({
      id: "fr-counters",
      columns: [b.col("counter", { minWidth: 22 }), b.col("value", { align: "right", minWidth: 10 })],
      rows: counters.map(([k, v]) => b.row(k, { counter: k, value: String(v) })),
    }),
  ];
}

/**
 * Per cache, and the reason beside the count: a hit rate says whether holding
 * it was worth anything, and only the reason says whether a miss was
 * legitimate. On `frame` for `countersTable`'s reason.
 */
function cacheTable(r: ProfileReport): readonly Block[] {
  const caches = cacheNames(r);
  if (caches.length === 0) return [];
  return [
    caption("cache — hits, misses and why; a miss with a reason is work the cache could not save", "fr-cap-cache"),
    b.table({
      id: "fr-cache",
      columns: [
        b.col("cache", { minWidth: 14 }),
        b.col("hits", { align: "right", minWidth: 8 }),
        b.col("misses", { align: "right", minWidth: 8 }),
        b.col("rate", { align: "right", minWidth: 6 }),
        b.col("reasons", { minWidth: 24 }),
      ],
      rows: caches.map((name) => {
        const hit = r.hits[name] ?? 0;
        const why = r.misses[name] ?? {};
        const missed = Object.values(why).reduce<number>((n, v) => n + (v ?? 0), 0);
        const looked = hit + missed;
        return b.row(name, {
          cache: name,
          hits: String(hit),
          misses: String(missed),
          rate: looked === 0 ? "-" : `${((hit / looked) * 100).toFixed(0)}%`,
          reasons: Object.entries(why)
            .sort((a, x) => (x[1] ?? 0) - (a[1] ?? 0))
            .map(([k, v]) => `${k} ${String(v)}`)
            .join(" "),
        });
      }),
    }),
  ];
}

/**
 * A caption with no gap — the overview's (C28 I52).
 *
 * `caption` carries a blank row before it, which reads well in a pane that
 * pages and costs a row the overview does not have: six captions' gaps were a
 * quarter of the region.
 */
const tightCaption = (text: string, id: string): Block =>
  b.rule(text, undefined, { id, gapBefore: false });

/**
 * Pane 1 — the shape of the session at a glance.
 *
 * **At most 23 rows at 80 columns, for every report** (C28 I52; F947). Each
 * block is bounded by a closed set: four regime rows, four latency categories
 * in four area rows, one coalescing row per `CommitReason`, two rows of the
 * instrument's own cost, one row pointing at `frame`. The counters and cache
 * tables — the two blocks no type bounds — are `countersTable` and
 * `cacheTable`, on `frame`. Walked by hand in C28 §3c: 8, 16, 17 and 21 pane
 * rows on an empty ring, twelve frames, twelve with spans, a counter and two
 * caches, and every commit reason; T1.100 holds the figures.
 */
function overview(r: ProfileReport, sep: string): readonly Block[] {
  const lat = r.latency;
  const rs = reasons(r);

  const out: Block[] = [regimeRow(r, "ov-regime", sep)];

  if (lat === undefined) {
    out.push(
      b.notice(
        "info",
        "tier is below `spans`, so there are no durations — the report omits them rather than reporting zeroes, because a zeroed histogram reads as measured-and-fast",
        undefined, { id: "ov-no-spans" },
      ),
    );
  } else if (lat.work.count === 0) {
    // The **data** axis, which is not the tier axis (C28 I23, F895). At `spans`
    // with nothing in the ring every percentile is 0, and four zero bars read as
    // *measured, and fast* — the reading I11 omits the whole key to avoid one
    // tier lower. Telling a reader to raise a tier that is already `spans` would
    // also be a wrong instruction, so the two cases get different sentences.
    out.push(
      b.notice(
        "info",
        "no frame has been recorded yet — the tier is `spans` and the ring is empty, so there is nothing to draw rather than nothing to find",
        undefined, { id: "ov-no-frames" },
      ),
    );
  } else {
    out.push(
      tightCaption(`latency${sep}work is efficiency, wait is policy — never summed`, "ov-cap-lat"),
      // Four categories in four area rows: the height was 6, and the two spare
      // rows drew nothing (C28 I52). The lid, the axis rule and the x-labels
      // are three more, and they are the plot's own furniture.
      b.plot({
        id: "ov-latency", form: "bar", height: 4, axes: true, orientation: "horizontal",
        layout: "stacked",
        categories: ["p50", "p95", "p99", "max"],
        series: [
          { values: [lat.work.p50, lat.work.p95, lat.work.p99, lat.work.max].map((v) => Number(ms(v))), label: "work" },
          { values: [lat.wait.p50, lat.wait.p95, lat.wait.p99, lat.wait.max].map((v) => Number(ms(v))), label: "wait" },
        ],
        gapBefore: false,
      }),
    );
  }

  if (rs.length > 0) {
    // One row per reason, bounded by the union (C28 I52, §9b B10). The grouped
    // bar this replaced drew two rows per reason under a height of one per
    // reason — right at the one reason every fixture had, and at the type's
    // five it put `stream` and `spinner` behind a `+4 more` marker (F960).
    // *The difference is what coalescing saved* was the caption's instruction
    // to the reader; here it is the column.
    out.push(
      b.table({
        id: "ov-coalesce",
        columns: [
          b.col("reason", { minWidth: 10 }),
          b.col("commits", { align: "right", minWidth: 8 }),
          b.col("frames", { align: "right", minWidth: 8 }),
          b.col("saved", { label: "saved by coalescing", align: "right", minWidth: 20 }),
        ],
        rows: rs.map((k) => {
          const commits = r.counters[`commit.${k}`] ?? 0;
          const drawn = r.counters[`frame.${k}`] ?? 0;
          return b.row(k, {
            reason: k,
            commits: String(commits),
            frames: String(drawn),
            saved: String(commits - drawn),
          });
        }),
        gapBefore: false,
      }),
    );
  }

  // **The instrument prices itself** (C28 I34). A profiler that does not report
  // its own cost invites a reader to assume zero, and every figure above is a
  // figure this had a hand in producing. Two rows: the estimate with the three
  // figures it is the product of, labelled an estimate; and the async store.
  const ov = r.overhead;
  out.push(
    b.kv(
      {
        // The word that says what the figure is comes first, because the value
        // truncates from the right at 80 columns once the numbers grow.
        "own cost": `${ms(ov.estimateMs)} ms estimated from ${String(ov.spans)} spans × 2 reads × ${ov.clockNs.toFixed(1)} ns per measured read`,
        "async store": ov.asyncEnabled
          ? "built — every await in this process pays for it"
          : "not built — nothing here has taxed a promise",
      },
      { id: "ov-oh", gapBefore: false },
    ),
  );

  // The two blocks no type bounds are on `frame` (C28 I52, §9b B9); this row
  // says so, with the counts, and only when there is something there to see —
  // a pointer at an empty table is a wrong instruction.
  const counters = counterEntries(r).length;
  const caches = cacheNames(r).length;
  if (counters > 0 || caches > 0) {
    const named = [
      counters > 0 ? `${String(counters)} counter${counters === 1 ? "" : "s"}` : "",
      caches > 0 ? `${String(caches)} cache${caches === 1 ? "" : "s"}` : "",
    ].filter((x) => x !== "");
    out.push(
      b.notice(
        "info",
        `${named.join(" and ")} ${counters + caches === 1 ? "is" : "are"} on the frame pane — press n`,
        undefined, { id: "ov-elsewhere" },
      ),
    );
  }

  return out;
}

/** Pane 2 — where the time goes. */
function frame(r: ProfileReport, sep: string): readonly Block[] {
  const { names, p50, p95 } = spanSeries(r);
  const out: Block[] = [caption("frame — self time per phase, so a container is not counted twice", "fr-cap")];

  if (names.length === 0) {
    // One guard, two states, and until F895 one sentence for both: at `spans`
    // with an empty ring this told a reader to *raise the tier to `spans`* —
    // the tier they were already on. This pane reads the data axis, which is
    // the right axis, and its message was still answering the tier one.
    out.push(
      b.notice(
        "info",
        spanning(r)
          ? "no spans recorded — the tier is high enough and nothing has been measured yet"
          : "no spans recorded — raise the tier to `spans`",
        undefined, { id: "fr-none" },
      ),
    );
  } else {
    out.push(
      b.plot({
        id: "fr-spans", form: "bar", height: Math.max(5, names.length + 2), axes: true,
        orientation: "horizontal",
        categories: [...names],
        series: [
          { values: p50, label: "p50 ms" },
          { values: p95, label: "p95 ms" },
        ],
      }),
    );

    if (r.worst.length > 0) {
      out.push(
        caption("the worst frames, kept whole — a p95 says a tail exists and nothing about what is in it", "fr-cap-worst"),
        b.table({
          id: "fr-worst",
          columns: [
            b.col("seq", { align: "right", minWidth: 5 }),
            b.col("reason", { minWidth: 10 }),
            b.col("work", { align: "right", minWidth: 8 }),
            b.col("wait", { align: "right", minWidth: 8 }),
            b.col("phases", { minWidth: 28 }),
          ],
          rows: r.worst.map((f) =>
            b.row(`w${String(f.seq)}`, {
              seq: String(f.seq),
              reason: f.reason,
              work: `${ms(f.work)} ms`,
              wait: `${ms(f.wait)} ms`,
              phases: Object.entries(f.spans)
                .sort((x, y) => (y[1] ?? 0) - (x[1] ?? 0))
                .slice(0, 3)
                .map(([k, v]) => `${k} ${ms(v ?? 0)}`)
                .join(sep),
            }),
          ),
        }),
      );
    }

    if (r.nodes.length > 0) {
      out.push(
        caption(
          "per element — self time, so a container is not credited with its children's work",
          "fr-cap-nodes",
        ),
        b.table({
          id: "fr-nodes",
          columns: [
            b.col("element", { minWidth: 20 }),
            b.col("self", { align: "right", minWidth: 9 }),
            b.col("max", { align: "right", minWidth: 8 }),
            b.col("calls", { align: "right", minWidth: 6 }),
            b.col("frames", { align: "right", minWidth: 7 }),
            // **The column that turns a duration into a defect.** Above 1 means
            // the element was measured or rendered more than once inside a single
            // frame, which is repeated work whatever it cost — and it is not
            // visible in any of the four columns to its left, because a node
            // measured four times cheaply and one measured once expensively can
            // carry the same self time.
            b.col("per frame", { align: "right", minWidth: 10 }),
          ],
          rows: r.nodes.slice(0, 20).map((n) =>
            b.row(n.key, {
              element: n.key,
              self: `${ms(n.self)} ms`,
              max: `${ms(n.max)} ms`,
              calls: String(n.calls),
              frames: String(n.frames),
              "per frame": n.frames === 0 ? "-" : (n.calls / n.frames).toFixed(1),
            }),
          ),
        }),
      );
    }

    const kinds = Object.entries(r.byKind).filter(([, h]) => h.count > 0);
    if (kinds.length > 0) {
      out.push(
        caption("cost by block kind — which renderer to look at", "fr-cap-kind"),
        b.plot({
          id: "fr-kinds", form: "bar", height: Math.max(4, Math.min(kinds.length, 10) + 2), axes: true,
          orientation: "horizontal",
          categories: kinds.slice(0, 10).map(([k]) => k),
          series: [{ values: kinds.slice(0, 10).map(([, h]) => Number(h.sum.toFixed(2))), label: "total ms" }],
        }),
      );
    }

  }

  // **The two tables no type bounds, moved here from the overview** (C28 I52,
  // §9b B9). Counts exist at every tier that counts (I44), so they draw under
  // the *raise the tier* notice too — `frame` pages, and the overview says
  // they are here.
  out.push(...countersTable(r), ...cacheTable(r));
  return out;
}

/** Pane 3 — the distribution, so a percentile can be read rather than trusted. */
function distribution(r: ProfileReport, sep: string): readonly Block[] {
  const lat = r.latency;
  if (lat === undefined) {
    return [b.notice("info", "tier is below `spans` — no distribution to draw", undefined, { id: "di-none" })];
  }
  const drawn = r.worst.length > 0 ? r.worst : [];
  const { names, p50, p95 } = spanSeries(r);

  // Empty ring, not low tier (C28 I23, F895). The quantile plot is the only
  // part of this pane sourced from the frame histogram; `spans` is fed by every
  // closed span, including ones outside a frame, so returning early here would
  // hide rows that do have data. The plot is replaced, not the pane.
  const out: Block[] = lat.work.count === 0
    ? [
        b.notice(
          "info",
          "no frame has been recorded yet — the tier is `spans` and the ring is empty, so there are no quantiles to take",
          undefined, { id: "di-no-frames" },
        ),
      ]
    : [
        caption(
          `distribution${sep}${String(lat.work.count)} frames, +/-${(r.regime.histogramError * 100).toFixed(1)}% bucket error`,
          "di-cap",
        ),
        b.plot({
          id: "di-quantiles", form: "bar", height: 6, axes: true,
          categories: ["min", "p50", "p95", "p99", "max"],
          series: [
            {
              values: [lat.work.min, lat.work.p50, lat.work.p95, lat.work.p99, lat.work.max].map((v) => Number(ms(v))),
              label: "work ms",
            },
          ],
        }),
      ];

  if (names.length > 0) {
    out.push(
      caption("per phase — p50 against p95, so a bimodal phase shows as a gap", "di-cap-spans"),
      b.plot({
        id: "di-spans", form: "bar", height: Math.max(5, names.length + 2), axes: true,
        orientation: "horizontal",
        categories: [...names],
        series: [
          { values: p50, label: "p50" },
          { values: p95, label: "p95" },
        ],
      }),
    );
  }

  if (drawn.length > 1) {
    out.push(
      caption("the worst frames in order — the fix is never in the median", "di-cap-worst"),
      b.plot({
        id: "di-worst", form: "line", height: 6, axes: true,
        series: [{ values: drawn.map((f) => Number(ms(f.work))), label: "work ms" }],
      }),
    );
  }

  return out;
}

/** Pane 4 — what the process holds, and what it burns. */
function memory(r: ProfileReport, sep: string): readonly Block[] {
  if (r.samples.length === 0) {
    return [
      b.notice(
        "info",
        "no resource samples yet — the sampler runs on the injected timer at tier `spans` and above",
        undefined, { id: "me-none" },
      ),
    ];
  }
  // **The headline comes from the last sample that was actually running**
  // (C28 I27, F900). Every figure in `me-kv` below is `last`'s, and a sample
  // taken while the session is suspended has a loop that was not turning and a
  // process that was not working — so drawing its zeroes as the present state
  // reports an idle machine, which is the reading I27 names. `suspended` was on
  // `ResourceSample` from the start and no consumer read it.
  const running = r.samples.filter((s) => !s.suspended);
  const suspendedCount = r.samples.length - running.length;
  const last = running[running.length - 1];
  if (last === undefined) {
    return [
      b.notice(
        "info",
        `every one of the ${String(r.samples.length)} samples was taken while the session was suspended — there is no reading of a running process here, and the figures a suspended sample carries are a stopped clock rather than an idle one`,
        undefined, { id: "me-suspended" },
      ),
    ];
  }

  const out: Block[] = [
    caption(
      `memory${sep}${String(r.samples.length)} samples${
        suspendedCount === 0
          ? ""
          : `, ${String(suspendedCount)} of them suspended — the series is not continuous and the figures below skip them`
      } — the sawtooth is the reading: GC drops with a rising floor is a leak`,
      "me-cap",
    ),
    b.plot({
      id: "me-heap", form: "line", height: 8, axes: true, yAxis: "right", yCallout: "last",
      series: [
        { values: r.samples.map((s) => mib(s.rss)), label: "rss MiB" },
        { values: r.samples.map((s) => mib(s.heapUsed)), label: "heap MiB" },
      ],
    }),
    caption("gc, cpu and the loop — the p50 is the sampler's own resolution and is not a delay", "me-cap-gc"),
    b.kv(
      {
        "loop delay max": `${ms(last.loopDelayMax)} ms`,
        "loop delay p50": `${ms(last.loopDelayP50)} ms at resolution ${String(last.loopDelayResolutionMs)} ms — a floor, not a reading`,
        "gc pauses": `${ms(last.gcPauseMs)} ms total`,
        "gc by kind": `minor ${String(last.gc.minor)}${sep}major ${String(last.gc.major)}${sep}incremental ${String(last.gc.incremental)}${sep}weakcb ${String(last.gc.weakcb)}`,
        cpu: `${ms(last.cpuUser)} ms user${sep}${ms(last.cpuSystem)} ms system`,
        "user-timing entries": `${String(last.timingEntries)} — a count with no attribution: the profiler raises no marks, so it cannot say whose these are`,
      },
      { id: "me-kv" },
    ),
  ];

  if (r.heapSpaces.length > 0) {
    out.push(
      caption(
        "heap by space, at report time — old space rising with new space flat is retention; the reverse is churn and no leak",
        "me-cap-spaces",
      ),
      b.table({
        id: "me-spaces",
        columns: [
          b.col("space", { minWidth: 24 }),
          b.col("used", { align: "right", minWidth: 10 }),
          b.col("size", { align: "right", minWidth: 10 }),
          // **Physical is not size.** V8 reserves address space it has not
          // committed, so a space can be large and cost nothing; `physical` is
          // what the process actually holds and `rss` is the sum a reader is
          // trying to explain.
          b.col("physical", { align: "right", minWidth: 10 }),
        ],
        rows: [...r.heapSpaces]
          .sort((x, y) => y.used - x.used)
          .map((sp) =>
            b.row(sp.name, {
              space: sp.name,
              used: `${mib(sp.used).toFixed(1)} MiB`,
              size: `${mib(sp.size).toFixed(1)} MiB`,
              physical: `${mib(sp.physical).toFixed(1)} MiB`,
            }),
          ),
      }),
    );
  }

  if (r.samples.length > 1) {
    out.push(
      caption("cpu, cumulative ms", "me-cap-cpu"),
      b.plot({
        id: "me-cpu", form: "line", height: 5, axes: true,
        series: [{ values: r.samples.map((s) => Number(s.cpuUser.toFixed(1))), label: "user ms" }],
      }),
    );
  }

  return out;
}

/**
 * The arm a caller with no terminal gets: ASCII, so the separator is `:`.
 *
 * Explicit rather than inferred. Defaulting to the unicode arm would put an
 * `East_Asian_Width=Ambiguous` character on a terminal nobody asked about,
 * which is the failure the pair exists to prevent.
 */
const ASCII_CAPS: GlyphCaps = { unicode: "ascii", ambiguousWidth: "narrow" };

const PANE_FNS: Readonly<
  Record<PaneName, (r: ProfileReport, sep: string) => readonly Block[]>
> = Object.freeze({
  overview, frame, distribution, memory,
});

/** The pane, drawn. Unknown names fall to `overview` rather than to nothing. */
export function profilePane(
  report: ProfileReport,
  pane: PaneName = "overview",
  /**
   * The terminal's, for the field separator (C09 I49, F828).
   *
   * **Not a style choice.** `·` is U+00B7 — non-ASCII and
   * `East_Asian_Width=Ambiguous`, so it is one cell on most terminals and two on
   * an ambiguous-wide one. A literal measures at the width `cells()` reports and
   * draws at the width the terminal chooses, and the two disagreeing is the
   * failure C09 §4 resolves through a pair. Defaulted, so a caller with no
   * terminal to hand gets the ASCII arm rather than a guess.
   */
  caps: GlyphCaps = ASCII_CAPS,
): readonly Block[] {
  const fn = PANE_FNS[pane] ?? overview;
  return fn(report, ` ${glyphs(caps).separator} `);
}

/** Every pane's title, for the surface that offers them. */
export function paneTitle(pane: PaneName): string {
  return { overview: "overview", frame: "frame", distribution: "distribution", memory: "memory" }[pane];
}

export type { Histogram };
