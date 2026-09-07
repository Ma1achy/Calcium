// A01 Appendix B, filled — C28 §10's tier-1 rows for the headless budget face.
//
// **The appendix is a six-row decision gate that has been empty since it was
// written**, and its own instruction is *fill this from real numbers; do not
// estimate*. Four rows a `ProfileReport` can answer. Two it cannot, and most of
// what is below is about those: a gate table with a plausible zero in it closes
// an experiment nobody ran.
//
// **T1.50 is the row that does not build a literal**, and it is here because
// every other one does. A literal agrees with `ProfileReport` by construction —
// it would keep agreeing on the day `session.ts` renames its counter, and the
// failure that produces is an *unanswerable*, which is this module's
// honest-looking answer and therefore the one nothing would question.
import { describe, expect, it } from "vitest";

import { BUDGET, checkBudget, formatBudget } from "../../src/testing/index.js";
import type { Histogram, ProfileReport } from "../../src/shell/profiling/types.js";
import { buildSession } from "../support/session.js";

/** A histogram whose statistics are the ones a row reads, and nothing else. */
function hist(over: Partial<Histogram> = {}): Histogram {
  return {
    count: 1, min: 0, p50: 0, p95: 0, p99: 0, max: 0, sum: 0, mean: 0,
    error: 1 / 64,
    ...over,
  };
}

/** An empty report at a named tier, for a row to fill the part it is about. */
function report(over: Partial<ProfileReport> = {}): ProfileReport {
  return {
    regime: {
      node: "v22.0.0", cpus: 8, tier: "spans", durationMs: 1000,
      histogramError: 1 / 64, ringReset: 0,
    },
    byReason: {},
    timeline: [],
    worst: [],
    nodes: [],
    byKind: {},
    counters: {},
    gauges: {},
    misses: {},
    hits: {},
    marks: [],
    samples: [],
    captures: [],
    excluded: { selfInflicted: 0, fallback: 0 },
    dropped: { frames: 0, samples: 0, marks: 0, captureBytes: 0 },
    overhead: { spans: 0, clockNs: 0, estimateMs: 0, asyncEnabled: false },
    heapSpaces: [],
    frames: 0,
    ...over,
  };
}

/** A resource sample carrying only the two fields the CPU row divides. */
function sample(at: number, cpuMs: number): ProfileReport["samples"][number] {
  return {
    at,
    rss: 0, heapUsed: 0, heapTotal: 0, external: 0, arrayBuffers: 0, heapLimit: 0,
    cpuUser: cpuMs, cpuSystem: 0,
    loopUtilisation: 0,
    loopDelayMax: 0, loopDelayP50: 0, loopDelayP99: 0, loopDelayResolutionMs: 1,
    gc: { minor: 0, major: 0, incremental: 0, weakcb: 0 },
    gcPauseMs: 0,
    majorPageFaults: 0, involuntaryContextSwitches: 0,
    handles: {},
    timingEntries: 0,
    suspended: false,
  };
}

const row = (b: ReturnType<typeof checkBudget>, name: string) => {
  const found = b.rows.find((r) => r.row === name);
  if (found === undefined) throw new Error(`no row ${name}`);
  return found;
};

describe("C28 — the budget table", () => {
  it("T1.25 (C28 I37): the bytes row carries its figure and the threshold it was checked against", () => {
    const budget = checkBudget(report({ counters: { "bytes.written": 480 * 1024 }, frames: 12 }));
    const bytes = row(budget, "bytes-per-frame");

    expect(bytes.state).toBe("measured");
    if (bytes.state !== "measured") return;
    expect(bytes.value, "480 KB over 12 frames").toBeCloseTo(40 * 1024, 6);
    expect(bytes.crossed, "40 KB is under the appendix's 100 KB").toBe(false);
    // **Both figures, not a verdict.** A threshold quoted without the
    // measurement beside it is a judgement the reader cannot check, and the
    // appendix's column is headed *Layer A result* rather than *pass*.
    expect(bytes.text).toContain("40.0 KB");
    expect(bytes.text).toContain("12 frames");
    expect(bytes.thresholdText).toBe("Sustained > 100 KB on a typical repaint");
  });

  it("T1.26 (C28 I37): a tier with no latency refuses the two frame rows and names the tier", () => {
    // `latency` is absent below tier `spans` (C28 I11) — absent, not zeroed, and
    // this is the row that says why that distinction is load-bearing. A 0 here
    // reads as a frame that took no time, which is the one answer that closes
    // the gate.
    const budget = checkBudget(report({ regime: { ...report().regime, tier: "counters" } }));

    for (const name of ["median-frame", "p95-frame"]) {
      const r = row(budget, name);
      expect(r.state, `${name} cannot be answered at tier counters`).toBe("unanswerable");
      if (r.state !== "unanswerable") continue;
      expect(r.needs, "the refusal names the tier that would have to change").toContain("counters");
      expect(r.thresholdText, "and still says what it was blank against").not.toBe("");
    }
  });

  it("T1.27 (C28 I37): the two rows nothing measures are refused on a full report too", () => {
    // **An `unanswerable` that only appears on an empty report cannot be told
    // from a report with nothing in it.** So this is a report where every
    // answerable row is filled, and the two refusals are still refusals.
    const budget = checkBudget(
      report({
        regime: { ...report().regime, tier: "deep" },
        counters: { "bytes.written": 1024 },
        frames: 4,
        latency: { work: hist({ p50: 2, p95: 5 }), wait: hist() },
        byReason: { resize: hist({ count: 9 }), input: hist({ count: 40 }) },
        marks: [{ at: 0, label: "stream:start" }, { at: 100, label: "stream:end" }],
        samples: [sample(0, 0), sample(100, 10)],
      }),
    );

    expect(budget.unanswered).toEqual(["resize-corruption", "page-down-latency"]);
    expect(budget.rows.filter((r) => r.state === "measured")).toHaveLength(4);

    const resize = row(budget, "resize-corruption");
    if (resize.state !== "unanswerable") throw new Error("resize was answered");
    // The refusal names the number a reader would otherwise reach for. C03 sets
    // `contaminated` on every resize, so counting it puts the resize count in a
    // column headed *corruption* — and `byReason.resize.count` is that same
    // number by an easier route.
    expect(resize.needs).toContain("9");
    expect(resize.needs).toContain("contaminated");

    const pageDown = row(budget, "page-down-latency");
    if (pageDown.state !== "unanswerable") throw new Error("page down was answered");
    expect(pageDown.needs).toContain("40");
    expect(pageDown.needs).toContain("scenario");
  });

  it("T1.28 (C28 I37): a crossed row says so, and says when the crossing is inside its own error", () => {
    const crossed = checkBudget(report({ latency: { work: hist({ p50: 2, p95: 20 }), wait: hist() } }));
    const p95 = row(crossed, "p95-frame");
    expect(p95.state).toBe("measured");
    if (p95.state !== "measured") return;
    expect(p95.crossed, "20 ms against the appendix's 16").toBe(true);
    expect(p95.marginal, "20 is 4 ms clear of 16 and the error is 0.31").toBe(false);
    expect(crossed.crossed).toContain("p95-frame");
    expect(formatBudget(crossed)).toContain("**crossed**");

    // **The same row one bucket over.** 16.1 ms crosses by the appendix's
    // arithmetic and by less than the histogram's own resolution, and reporting
    // it the way 20 ms is reported is how a gate gets crossed by its bucketing
    // (C28 I13).
    const edge = checkBudget(report({ latency: { work: hist({ p95: 16.1 }), wait: hist() } }));
    const edgeRow = row(edge, "p95-frame");
    if (edgeRow.state !== "measured") throw new Error("the edge row was refused");
    expect(edgeRow.crossed, "the appendix's arithmetic is unchanged").toBe(true);
    expect(edgeRow.marginal, "and the reading cannot resolve it").toBe(true);
    expect(formatBudget(edge)).toContain("inside the measurement's own error");
  });

  it("T1.29 (C28 I37): a table with an unanswered row returns no verdict rather than a passing one", () => {
    // Every answerable row passes. The appendix's own sentence — *none crossed
    // means M-T6 is closed* — is a two-valued reading of a table with six rows
    // and four answers, and `closed` is the value that ends the experiment.
    const budget = checkBudget(
      report({
        counters: { "bytes.written": 1024 },
        frames: 4,
        latency: { work: hist({ p50: 1, p95: 3 }), wait: hist() },
        samples: [sample(0, 0), sample(100, 1)],
      }),
    );

    expect(budget.crossed).toHaveLength(0);
    expect(budget.verdict).toBe("undecided");
    expect(budget.unanswered).toEqual(["resize-corruption", "page-down-latency"]);
    expect(formatBudget(budget)).toContain("undecided");

    // The control: the same report with nothing unanswered is the only shape
    // that reaches `closed`, and no report can reach it today. Asserted through
    // the verdict's own inputs rather than by constructing one, because a row
    // that cannot fail is the vacuity this suite is written against.
    expect(BUDGET.map((s) => s.row)).toHaveLength(6);
    expect(budget.rows.filter((r) => r.state === "measured")).toHaveLength(4);
  });

  it("T1.50 (C28 I37, C22 I93): the bytes row resolves against the counter a real session writes", () => {
    // Every row above builds a literal, which agrees with `ProfileReport` by
    // construction. This one takes the report from a real session that painted,
    // so `session.ts`'s `count("bytes.written", …)` and the string this module
    // reads are resolved against each other — and the failure that gap admits is
    // an *unanswerable*, this module's honest-looking answer.
    let seen: ProfileReport | null = null;
    return buildSession({
      profile: {
        tier: "spans",
        elapsed: (() => {
          let t = 0;
          return () => (t += 1);
        })(),
        onReport: (r) => void (seen = r),
      },
    }).then(async ({ tui }) => {
      await tui.stop("exit");
      const got = seen as ProfileReport | null;
      if (got === null) throw new Error("no report arrived");
      expect(got.frames, "the session painted").toBeGreaterThan(0);

      const bytes = row(checkBudget(got), "bytes-per-frame");
      expect(bytes.state, "the counter this module names is the one the writer writes").toBe(
        "measured",
      );
    });
  });
});

describe("C28 — a part is self time and the whole is the frame's work", () => {
  it.todo("T1.62 (C28 I40): a session at tier spans with nested spans — spans.frame.sum is strictly less than latency.work.sum by more than the histogram's own error, and spans.frame.sum plus every other span does not exceed it; the strict inequality is the half that bites, because feeding record the node's total instead of its self time makes the two equal and a conservation bound alone is satisfied by that — not deferred on a component: lands with the phase seams");
  it.todo("T1.63 (C28 I40): make profile's phase table — its shares are taken against latency.work and the residue row is work minus the parts minus frame; a share against spans.frame is larger, sums to more than 100% once the seven dead spans are wired, and is the shape the first version shipped — not deferred on a component: lands with the phase seams");
});

describe("C28 — every declared span is opened", () => {
  it.todo("T1.60 (C28 I39): the shipped SpanName union against the members a scan finds opened under src/ — equal sets, by equality and not by containment, because a member added to the union and never wired is exactly the case this exists for and a subset check passes on it — not deferred on a component: lands with the phase seams");
  it.todo("T1.61 (C28 I39): a frame composed at tier spans — chrome, overlays, paint and assemble all carry a non-zero count, and the phases sum to within the frame span's own histogram error of frame itself; four spans firing proves they were called and the residue is what says they were called around the work rather than beside it — not deferred on a component: lands with the phase seams");
});

describe("C28 — the report's way out", () => {
  it("T1.58 (C28 I38): stop() hands the report out exactly once, with the session's frames in it", async () => {
    const reports: ProfileReport[] = [];
    const { tui } = await buildSession({
      profile: {
        tier: "spans",
        elapsed: (() => {
          let t = 0;
          return () => (t += 1);
        })(),
        onReport: (r) => void reports.push(r),
      },
    });

    await tui.stop("exit");

    // **Both halves are chosen for what can fail** (F883). Called twice is a
    // report a consumer appends twice; and a frame count above zero is what goes
    // red if the call moves to `start()`, where a report is well-formed, empty
    // and early.
    //
    // This row first asserted `heapSpaces.length > 0` on the reasoning that
    // `dispose()` ends the probe. It does not — `node.ts`'s `heapSpaces()` has
    // no dependency on a live probe, the count is 11 either side, and swapping
    // the two lines in `session.ts` failed nothing. The order is still right and
    // its justification was not.
    expect(reports).toHaveLength(1);
    expect(reports[0]?.frames, "taken at stop, with the session's frames in it").toBeGreaterThan(0);
  });

  it("T1.59 (C28 I38): nothing recorded means the callback does not fire", async () => {
    // An absent callback and an empty report are the two readings of *nothing
    // came back*, and only one of them is true here.
    let called = 0;
    const off = await buildSession({
      profile: { tier: "off", onReport: () => void (called += 1) },
    });
    await off.tui.stop("exit");
    expect(called, "tier off records nothing, so there is nothing to hand out").toBe(0);

    const none = await buildSession({});
    await none.tui.stop("exit");
    expect(called, "and a session with no profile at all cannot have called it").toBe(0);
  });
});
