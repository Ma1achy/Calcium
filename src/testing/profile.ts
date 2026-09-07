/**
 * A01 Appendix B, filled from a `ProfileReport` (C28 I37).
 *
 * The appendix is a six-row M-T6 decision gate, it has been empty since it was
 * written, and its own instruction is *fill this from real numbers; do not
 * estimate*. This is the thing that fills it. `formatBudget` emits the appendix's
 * own three columns with its own row labels, so filling it is a copy rather than
 * a transcription.
 *
 * **Two of the six rows a report cannot answer, and they come back unanswerable
 * rather than as zero.** That is the whole reason this is a module and not four
 * divisions at a call site: a plausible zero in a decision gate closes an
 * experiment nobody ran, and the two rows most likely to read as zero are exactly
 * the two nothing measures. `resize-corruption` is the sharper of the pair —
 * C03 *does* carry a `contaminated` flag, and it is set on every resize
 * (`frame-scheduler.ts:276`) because contamination there is a pre-emptive
 * declaration rather than an observation. Counting it would put the resize count
 * in a column headed *corruption*, and `byReason.resize.count` — which a reader
 * will reach for first — is that same number by another route.
 *
 * **The verdict is where the same failure does the most damage.** The appendix
 * says *none crossed means M-T6 is closed*, which is a two-valued reading of a
 * table that can have four answers and two blanks. So there are three verdicts,
 * and an unanswered row produces `undecided`. A crossing still produces
 * `justified` whatever else is blank, because one crossing is sufficient by the
 * appendix's own sentence and an absence is not evidence against it.
 *
 * Runner-free and parameterised, like every sibling here: it returns a value and
 * the caller asserts. Its input is a `ProfileReport`, which is published — a
 * consumer cannot construct a `Profiler` or a `ResourceProbe` and must not need
 * one to read their own budget.
 */
import { PHASE_GROUP, SPAN_SITE, TIER_RANK } from "../shell/profiling/types.js";
import type { PhaseGroup, ProfileReport, SpanName } from "../shell/profiling/types.js";

/** The appendix's rows, in its order. */
export type BudgetRow =
  | "bytes-per-frame"
  | "median-frame"
  | "p95-frame"
  | "resize-corruption"
  | "page-down-latency"
  | "streaming-cpu";

export type BudgetVerdict = "closed" | "justified" | "undecided";

type Spec = Readonly<{
  row: BudgetRow;
  /** A01's own label, so the emitted table is the appendix's table. */
  label: string;
  /** A01's own threshold text, quoted rather than restated. */
  thresholdText: string;
  /** The figure `> threshold` is crossed. */
  threshold: number;
}>;

/**
 * A01 Appendix B verbatim, and deliberately not an option.
 *
 * A caller that can move a threshold can move the gate past its own result,
 * which is the one thing a decision gate must not permit. Exported so a reader
 * can see the numbers being applied without reading the architecture document.
 */
export const BUDGET: readonly Spec[] = Object.freeze([
  Object.freeze({
    row: "bytes-per-frame" as const,
    label: "Bytes written per frame",
    thresholdText: "Sustained > 100 KB on a typical repaint",
    threshold: 100 * 1024,
  }),
  Object.freeze({
    row: "median-frame" as const,
    label: "Median frame construction",
    thresholdText: "> 8 ms",
    threshold: 8,
  }),
  Object.freeze({
    row: "p95-frame" as const,
    label: "p95 frame construction",
    thresholdText: "> 16 ms",
    threshold: 16,
  }),
  Object.freeze({
    row: "resize-corruption" as const,
    label: "Resize corruption count",
    thresholdText: "Any non-zero",
    threshold: 0,
  }),
  Object.freeze({
    row: "page-down-latency" as const,
    label: "10k-line Page Down latency",
    thresholdText: "> 50 ms",
    threshold: 50,
  }),
  Object.freeze({
    row: "streaming-cpu" as const,
    label: "Streaming CPU",
    thresholdText: "> 25% on a single core",
    threshold: 0.25,
  }),
]);

export type MeasuredRow = Readonly<{
  row: BudgetRow;
  label: string;
  thresholdText: string;
  state: "measured";
  /** The raw figure, in the row's own unit — bytes, ms, or a fraction of a core. */
  value: number;
  /** The same figure written the way the appendix's column wants it. */
  text: string;
  crossed: boolean;
  /**
   * The crossing is inside the measurement's own error (C28 I13).
   *
   * A p95 of 16.1 ms against a 16 ms threshold is a crossing the histogram's
   * bucketing cannot resolve, and reporting it the same way as 40 ms is how a
   * gate gets crossed by its own resolution. `crossed` still says what the
   * appendix's arithmetic says; this says whether to believe it.
   */
  marginal: boolean;
}>;

export type UnansweredRow = Readonly<{
  row: BudgetRow;
  label: string;
  thresholdText: string;
  state: "unanswerable";
  /** What would have to exist for this row to be filled. Never a guess at the value. */
  needs: string;
}>;

export type BudgetResult = MeasuredRow | UnansweredRow;

export type BudgetReport = Readonly<{
  rows: readonly BudgetResult[];
  crossed: readonly BudgetRow[];
  unanswered: readonly BudgetRow[];
  verdict: BudgetVerdict;
  /** What the CPU row was measured over, in words. Part of the reading, not a note. */
  window: string;
  /** The regime the figures were taken in, so the table travels with its machine. */
  regime: string;
}>;

export type BudgetOptions = Readonly<{
  /**
   * Mark labels bounding the streaming window.
   *
   * Without them the CPU row covers the whole sampled session and says so. With
   * them and a mark missing the row is **unanswerable**, not silently widened:
   * a figure labelled *streaming* that covers an idle session is the compression
   * failure this module exists to refuse, and it is invisible once the label is
   * the only thing carrying the scope.
   */
  window?: Readonly<{ from: string; to: string }>;
}>;

function measured(
  spec: Spec,
  value: number,
  text: string,
  relativeError: number,
): MeasuredRow {
  return Object.freeze({
    row: spec.row,
    label: spec.label,
    thresholdText: spec.thresholdText,
    state: "measured" as const,
    value,
    text,
    crossed: value > spec.threshold,
    marginal: Math.abs(value - spec.threshold) <= value * relativeError,
  });
}

function unanswerable(spec: Spec, needs: string): UnansweredRow {
  return Object.freeze({
    row: spec.row,
    label: spec.label,
    thresholdText: spec.thresholdText,
    state: "unanswerable" as const,
    needs,
  });
}

const spec = (row: BudgetRow): Spec => {
  const found = BUDGET.find((s) => s.row === row);
  if (found === undefined) throw new Error(`no budget spec for ${row}`);
  return found;
};

function bytesPerFrame(report: ProfileReport): BudgetResult {
  const s = spec("bytes-per-frame");
  const written = report.counters["bytes.written"];
  if (written === undefined) {
    return unanswerable(
      s,
      `no \`bytes.written\` counter — the writer counts at tier \`counters\` and above, and this report is \`${report.regime.tier}\``,
    );
  }
  if (report.frames === 0) return unanswerable(s, "no frame was committed in this session");
  const per = written / report.frames;
  return measured(
    s,
    per,
    `${(per / 1024).toFixed(1)} KB (${written.toLocaleString("en-GB")} B over ${report.frames} frames)`,
    0,
  );
}

function frameConstruction(report: ProfileReport, row: "median-frame" | "p95-frame"): BudgetResult {
  const s = spec(row);
  const latency = report.latency;
  if (latency === undefined) {
    return unanswerable(
      s,
      `no frame latency — it is recorded at tier \`spans\` and above, and this report is \`${report.regime.tier}\``,
    );
  }
  if (latency.work.count === 0) return unanswerable(s, "no frame was committed in this session");
  const value = row === "median-frame" ? latency.work.p50 : latency.work.p95;
  const err = latency.work.error;
  return measured(
    s,
    value,
    `${value.toFixed(2)} ms +/- ${(value * err).toFixed(2)} (${latency.work.count} frames)`,
    err,
  );
}

function resizeCorruption(report: ProfileReport): UnansweredRow {
  // **Unconditional, and the reason is in the header.** C03's `contaminated` is
  // set for every resize rather than for an observed corruption, so the number
  // that looks like this row's answer — and `byReason.resize.count` is the same
  // number by an easier route — would put the resize count under a column headed
  // *corruption*. Nothing in the tree compares a written frame against what the
  // terminal holds afterwards, which is what the row asks.
  const resizes = report.byReason.resize?.count ?? 0;
  return unanswerable(
    spec("resize-corruption"),
    `nothing observes a corrupted screen: C03's \`contaminated\` is a pre-emptive declaration set on every resize, so counting it reports resizes (${resizes} here) as corruptions. This row needs a written frame compared against the terminal's contents after a resize — C01 §5 records that no frame-path check exists`,
  );
}

function pageDown(report: ProfileReport): UnansweredRow {
  const input = report.byReason.input?.count ?? 0;
  return unanswerable(
    spec("page-down-latency"),
    `no report distinguishes one key from another: \`byReason.input\` holds every keystroke's frame (${input} here), and the row names one key against a 10k-line document. This row needs a scenario, not a counter`,
  );
}

function streamingCpu(report: ProfileReport, opts: BudgetOptions): {
  result: BudgetResult;
  window: string;
} {
  const s = spec("streaming-cpu");
  const w = opts.window;
  let from = -Infinity;
  let to = Infinity;
  let window = "the whole sampled session";
  if (w !== undefined) {
    const start = report.marks.find((m) => m.label === w.from);
    const end = [...report.marks].reverse().find((m) => m.label === w.to);
    if (start === undefined || end === undefined) {
      const missing = start === undefined ? w.from : w.to;
      return {
        result: unanswerable(
          s,
          `the window was bounded by marks \`${w.from}\`..\`${w.to}\` and \`${missing}\` was never marked; widening to the whole session would label idle time as streaming`,
        ),
        window: `marks \`${w.from}\`..\`${w.to}\` (absent)`,
      };
    }
    from = start.at;
    to = end.at;
    window = `marks \`${w.from}\`..\`${w.to}\`, ${(to - from).toFixed(0)} ms`;
  }
  const inWindow = report.samples.filter((sample) => sample.at >= from && sample.at <= to);
  const first = inWindow[0];
  const last = inWindow[inWindow.length - 1];
  if (first === undefined || last === undefined || inWindow.length < 2) {
    const had = inWindow.length === 1 ? "is 1" : `are ${inWindow.length}`;
    // **Two reasons, and naming the wrong one makes the refusal read as a bug in
    // the harness.** Below tier `spans` there is no sampler at all; at `spans`
    // and above there is one, and a session shorter than its interval produces
    // the same empty window with a completely different remedy. The first draft
    // blamed the tier in both cases, and printed *this report is `spans`* on a
    // report at tier `spans`.
    const needs =
      TIER_RANK[report.regime.tier] < TIER_RANK.spans
        ? `there is no sampler below tier \`spans\` and this report is \`${report.regime.tier}\``
        : `the session ran ${report.regime.durationMs.toFixed(0)} ms and the sampler's interval did not fit inside it twice — lower \`profile.sampleMs\` or measure a longer window`;
    return {
      result: unanswerable(s, `a rate needs two samples in the window and there ${had}; ${needs}`),
      window,
    };
  }
  const wall = last.at - first.at;
  if (wall <= 0) {
    return {
      result: unanswerable(s, "the window has no duration — two samples share one timestamp"),
      window,
    };
  }
  // Both figures are cumulative milliseconds since the probe was built
  // (`node.ts` takes `process.cpuUsage(base)`), so the difference over the wall
  // interval is a fraction of one core directly.
  const cpu = last.cpuUser + last.cpuSystem - first.cpuUser - first.cpuSystem;
  const fraction = cpu / wall;
  return {
    result: measured(
      s,
      fraction,
      `${(fraction * 100).toFixed(1)}% of a core (${cpu.toFixed(0)} ms CPU over ${wall.toFixed(0)} ms, ${inWindow.length} samples)`,
      0,
    ),
    window,
  };
}

/**
 * Fill A01 Appendix B from a report.
 *
 * Every row is answered or refused; none is estimated and none defaults to zero.
 */
export function checkBudget(report: ProfileReport, opts: BudgetOptions = {}): BudgetReport {
  const cpu = streamingCpu(report, opts);
  const rows: readonly BudgetResult[] = Object.freeze([
    bytesPerFrame(report),
    frameConstruction(report, "median-frame"),
    frameConstruction(report, "p95-frame"),
    resizeCorruption(report),
    pageDown(report),
    cpu.result,
  ]);
  const crossed = rows.filter((r) => r.state === "measured" && r.crossed).map((r) => r.row);
  const unanswered = rows.filter((r) => r.state === "unanswerable").map((r) => r.row);
  // **The order is the appendix's own sentence and not a preference.** *Any
  // threshold crossed justifies the experiment* — one crossing is sufficient, so
  // a blank row elsewhere cannot take it back. *None crossed means M-T6 is
  // closed* needs all six, so a blank row does take that back.
  const verdict: BudgetVerdict =
    crossed.length > 0 ? "justified" : unanswered.length > 0 ? "undecided" : "closed";
  return Object.freeze({
    rows,
    crossed: Object.freeze(crossed),
    unanswered: Object.freeze(unanswered),
    verdict,
    window: cpu.window,
    regime: `node ${report.regime.node}, ${report.regime.cpus} cpus, tier \`${report.regime.tier}\`, ${report.regime.durationMs.toFixed(0)} ms`,
  });
}

const VERDICT_TEXT: Readonly<Record<BudgetVerdict, string>> = Object.freeze({
  justified: "**justified** — a threshold is crossed, which is sufficient on its own.",
  closed: "**closed** — six rows measured, none crossed. Upstream Ink is sufficient.",
  undecided:
    "**undecided** — no threshold crossed, and rows below are unanswered. `closed` over a partial table would end the experiment on rows nobody measured.",
});

/**
 * The appendix's own three columns, so filling A01 is a copy.
 *
 * An unanswered row prints its label and what it needs, never a blank cell: a
 * blank in a filled table reads as a zero that was too small to print.
 */
export function formatBudget(budget: BudgetReport): string {
  const out: string[] = [];
  out.push("| Metric | Layer A result | Threshold suggesting Layer B |");
  out.push("|---|---|---|");
  for (const row of budget.rows) {
    const cell =
      row.state === "measured"
        ? `${row.text}${row.crossed ? (row.marginal ? " · **crossed, inside the measurement's own error**" : " · **crossed**") : ""}`
        : `— *unanswerable:* ${row.needs}`;
    out.push(`| ${row.label} | ${cell} | ${row.thresholdText} |`);
  }
  out.push("");
  out.push(`M-T6: ${VERDICT_TEXT[budget.verdict]}`);
  out.push("");
  out.push(`Streaming CPU measured over ${budget.window}. Regime: ${budget.regime}.`);
  return out.join("\n");
}

// --- where the frame went (C28 I41) -----------------------------------------
//
// **Two populations, and only one of them is inside `latency.work`.** The table
// this replaces divided every span's self time by that whole. `latency.work`
// sums the *frames'* work, and four of the nineteen names are opened between
// frames rather than inside one — so a session that ran commands added 755.9 ms
// of `local`, `handler`, `route` and `decode` to 2515.7 ms of in-frame work and
// printed a residue of -460.5 ms. The sign is the only thing that made it
// visible, and at one transcript entry the same error is 1.1% (F888).
//
// Here rather than in `tools/profile.mjs` for the reason the budget check is
// here: a reading computed in a script is a reading no row can be written
// against, and the negative residue is exactly the assertion that was missing.

/** One phase's total, and the spans that make it up. */
export type PhaseRow = Readonly<{
  group: PhaseGroup | "no phase" | "the frame itself" | "unaccounted";
  ms: number;
  /** Absent for the rows that are not a `PHASE_GROUP` member. */
  spans: readonly string[];
  /** `null` where a share would divide across populations (I41). */
  share: number | null;
  note: string;
}>;

export type PhaseReport = Readonly<{
  frames: number;
  /** `latency.work` — the whole the in-frame rows are shares of. */
  work: number;
  /** Rows for the spans opened inside a frame, plus the frame's own residue. */
  inFrame: readonly PhaseRow[];
  /**
   * Rows for the spans opened outside a frame, carrying **ms and no share**.
   * Their time is not in `work`, so every denominator available here would be
   * one population over another's total.
   */
  session: readonly PhaseRow[];
  /** `work − Σ(in-frame parts) − frame self`. Below zero means a misfiling. */
  residue: number;
}>;

/**
 * The phase breakdown, partitioned by where each span is opened.
 *
 * A span name `SPAN_SITE` does not carry is a component's own sub-span — the
 * `ctx.probe` seam produces `group.place` and its kin — and those are in-frame
 * by construction, since a definition only renders inside a frame.
 */
export function checkPhases(report: ProfileReport): PhaseReport {
  const spans = report.spans ?? {};
  const work = report.latency?.work.sum ?? 0;

  const inGroups = new Map<PhaseGroup, number>();
  const sessionGroups = new Map<PhaseGroup, number>();
  // **Keyed by site as well as group, because `compute` occurs on both sides.**
  // Keyed by group alone, the two `compute` rows listed each other's spans —
  // the in-frame row naming `local` and the between-frames row naming
  // `compose`. Each number was right and each list was wrong, which is the
  // shape a reader cannot catch from the table.
  const members = new Map<string, string[]>();
  let unphased = 0;
  let frameSelf = 0;
  let parts = 0;

  for (const [name, hist] of Object.entries(spans)) {
    const sum = hist?.sum ?? 0;
    const site = SPAN_SITE[name as SpanName];
    if (site === "frame-itself") {
      frameSelf += sum;
      continue;
    }
    if (site === undefined) {
      // A component sub-span: no site, no phase, and in-frame by construction.
      unphased += sum;
      parts += sum;
      continue;
    }
    const group = PHASE_GROUP[name as SpanName];
    const into = site === "frame" ? inGroups : sessionGroups;
    into.set(group, (into.get(group) ?? 0) + sum);
    const key = `${site}:${group}`;
    members.set(key, [...(members.get(key) ?? []), name]);
    if (site === "frame") parts += sum;
  }

  const rowsOf = (source: Map<PhaseGroup, number>, site: "frame" | "session"): readonly PhaseRow[] =>
    [...source]
      .sort((a, b) => b[1] - a[1])
      .map((entry) => ({
        group: entry[0],
        ms: entry[1],
        spans: Object.freeze([...(members.get(`${site}:${entry[0]}`) ?? [])].sort()),
        share: site === "frame" && work > 0 ? entry[1] / work : null,
        note: "",
      }));

  const inFrame: PhaseRow[] = [...rowsOf(inGroups, "frame")];
  if (unphased > 0) {
    inFrame.push({
      group: "no phase",
      ms: unphased,
      spans: Object.freeze([]),
      share: work > 0 ? unphased / work : null,
      note: "a component's own sub-spans, which `PHASE_GROUP` does not map",
    });
  }
  inFrame.push({
    group: "the frame itself",
    ms: frameSelf,
    spans: Object.freeze(["frame"]),
    share: work > 0 ? frameSelf / work : null,
    note: "`frame`'s self time — per-frame work no other span brackets",
  });

  // **Printed rather than left as a gap in the arithmetic.** A table whose rows
  // do not sum to the whole invites the reader to assume they do — and a
  // *negative* one is the table saying its own denominator is wrong, which is
  // how I41 was found.
  const residue = work - parts - frameSelf;
  inFrame.push({
    group: "unaccounted",
    ms: residue,
    spans: Object.freeze([]),
    share: work > 0 ? residue / work : null,
    note:
      residue < 0
        ? "**below zero** — a span opened outside a frame is being divided by the frames' work (C28 I41)"
        : "work in a frame that no span reaches at all",
  });

  return Object.freeze({
    frames: report.frames,
    work,
    inFrame: Object.freeze(inFrame),
    session: Object.freeze([...rowsOf(sessionGroups, "session")]),
    residue,
  });
}

/** The two tables, the second carrying no share for the reason it says. */
const PHASE_GROUPS: readonly PhaseGroup[] = Object.freeze([
  "compute",
  "draw",
  "output",
  "input",
  "far side",
  "total",
]);

export function formatPhases(phases: PhaseReport): string {
  const pct = (row: PhaseRow): string =>
    row.share === null ? "-" : `${(row.share * 100).toFixed(1)}%`;
  // Named `spansOf` and not `cells`: SS50's pattern is `\bcells\(`, and a
  // helper that happens to share the name of a display measurement makes the
  // rule fire on a table of milliseconds. A `// narrow-ok` here would answer a
  // question nobody asked.
  const spansOf = (row: PhaseRow): string =>
    row.note !== ""
      ? row.note
      : row.spans.map((n) => `\`${n}\``).join(", ");

  const out: string[] = [];
  out.push(
    `## Where the frame went - ${String(phases.frames)} frames, ${phases.work.toFixed(0)} ms of work`,
  );
  out.push("");
  out.push("| phase | ms | share of work | spans |");
  out.push("|---|---|---|---|");
  for (const row of phases.inFrame) {
    // Italic marks a row that is not a `PHASE_GROUP` member, so a reader can
    // see at a glance which rows are phases and which are the arithmetic.
    const phase = (PHASE_GROUPS as readonly string[]).includes(row.group);
    const label = phase ? row.group : `*${row.group}*`;
    out.push(`| ${label} | ${row.ms.toFixed(1)} | ${pct(row)} | ${spansOf(row)} |`);
  }

  if (phases.session.length > 0) {
    out.push("");
    out.push("## Between frames - work `latency.work` does not contain");
    out.push("");
    // **No share column at all**, rather than a share against a different
    // whole. A percentage beside these numbers is what produced -460.5%.
    out.push("| phase | ms | spans |");
    out.push("|---|---|---|");
    for (const row of phases.session) {
      out.push(`| ${String(row.group)} | ${row.ms.toFixed(1)} | ${spansOf(row)} |`);
    }
  }
  return out.join("\n");
}

// --- leaks -------------------------------------------------------------------

/** One tracked class, with the reading the figures support. */
export type LeakRow = Readonly<{
  name: string;
  created: number;
  finalised: number;
  live: number;
  /** `live / created` — the shape, which is the only thing a single run says. */
  liveShare: number;
  note: string;
}>;

export type LeakReport = Readonly<{
  rows: readonly LeakRow[];
  /**
   * Whether a collection was ever observed at all.
   *
   * **The distinguisher a reader needs before believing any row.** Every
   * `finalised` at zero and every `live` at its `created` is what a leaking
   * process looks like, and it is also what a process that has not collected
   * looks like — a short run, a large heap, no pressure. One says fix
   * something; the other says measure for longer.
   */
  collected: boolean;
  /**
   * The floor, stated rather than left as an off-by-one.
   *
   * Exactly one registration is never reported — always the most recent, at
   * every size measured, and it does not shrink with more collections. It
   * belongs to the report and not to a class: whichever registered last is the
   * one short (C28 I43, F893).
   */
  floor: number;
}>;

/**
 * What the leak counters support saying (C28 I43).
 *
 * **A `live` figure alone is not a finding, and this is where that is enforced
 * rather than hoped for.** One class holding one object is the floor; every
 * class holding everything is either a leak or a process that has not collected
 * yet, and `collected` is what separates those two.
 */
export function checkLeaks(report: ProfileReport): LeakReport {
  const rows: LeakRow[] = [];
  let anyFinalised = 0;
  for (const stat of Object.values(report.leaks)) anyFinalised += stat.finalised;
  for (const [name, stat] of Object.entries(report.leaks)) {
    const liveShare = stat.created === 0 ? 0 : stat.live / stat.created;
    const note =
      anyFinalised === 0
        ? "nothing collected in this run — not a reading about this class"
        : stat.live <= 1
          ? "at the floor: one registration is never reported"
          : liveShare > 0.9
            ? "held: almost nothing this class made was let go"
            : "";
    rows.push(Object.freeze({ name, ...stat, liveShare, note }));
  }
  rows.sort((a, b) => b.live - a.live);
  return Object.freeze({ rows: Object.freeze(rows), collected: anyFinalised > 0, floor: 1 });
}

/** `checkLeaks` as a table. */
export function formatLeaks(leaks: LeakReport): string {
  const out: string[] = [];
  out.push("## Objects made and let go — per tracked class (C28 I43)");
  out.push("");
  if (leaks.rows.length === 0) {
    out.push("Nothing tracked. `probe.track(name, obj)` is what fills this.");
    return out.join("\n");
  }
  out.push("| class | created | reported collected | live | live share | reading |");
  out.push("|---|---|---|---|---|---|");
  for (const r of leaks.rows) {
    out.push(
      `| \`${r.name}\` | ${String(r.created)} | ${String(r.finalised)} | ${String(r.live)} | ` +
        `${(r.liveShare * 100).toFixed(0)}% | ${r.note} |`,
    );
  }
  out.push("");
  out.push(
    leaks.collected
      ? `\`live\` is an upper bound with a floor of ${String(leaks.floor)}: the most recent registration is never ` +
        "reported, whichever class it belongs to. Read the shape over a session, not one figure."
      : "**No collection was observed in this run**, so every figure here is `created` and says nothing about " +
        "retention. A short run and a leak look identical from this table.",
  );
  return out.join("\n");
}
