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
import { TIER_RANK } from "../shell/profiling/types.js";
import type { ProfileReport } from "../shell/profiling/types.js";

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
