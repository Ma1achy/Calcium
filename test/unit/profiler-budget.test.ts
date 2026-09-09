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
import { readFileSync, readdirSync, statSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { BUDGET, checkBudget, checkLeaks, checkPhases, formatBudget, formatLeaks } from "../../src/testing/index.js";
import { createProfiler } from "../../src/shell/profiling/recorder.js";
import { SPAN_SITE } from "../../src/shell/profiling/types.js";
import type { Histogram, ProfileReport, SpanName, TreeNode } from "../../src/shell/profiling/types.js";
import { buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";

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
      histogramError: 1 / 64, ringReset: 0, captureDir: ".calcium/profile",
    },
    byReason: {},
    timeline: [],
    worst: [],
    nodes: [],
    byKind: {},
    byEntry: {},
    leaks: {},
    counters: {},
    gauges: {},
    misses: {},
    hits: {},
    marks: [],
    samples: [],
    captures: [],
    excluded: { selfInflicted: 0, fallback: 0 },
    dropped: { frames: 0, samples: 0, marks: 0, captureBytes: 0, captures: 0 },
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

/**
 * A real session that painted, with a report out of it.
 *
 * Shared by the rows below rather than built in each: what they assert about is
 * one session's arithmetic, and three sessions would let a row pass against a
 * shape a sibling never saw.
 */
async function profiled(): Promise<{ report: ProfileReport }> {
  let seen: ProfileReport | null = null;
  const { tui } = await buildSession({
    profile: {
      tier: "spans",
      elapsed: (() => {
        let t = 0;
        return () => (t += 1);
      })(),
      onReport: (r) => void (seen = r),
    },
  });
  await tui.stop("exit");
  const got = seen as ProfileReport | null;
  if (got === null) throw new Error("no report arrived");
  return { report: got };
}

const row = (b: ReturnType<typeof checkBudget>, name: string) => {
  const found = b.rows.find((r) => r.row === name);
  if (found === undefined) throw new Error(`no row ${name}`);
  return found;
};

describe("C28 — the budget table", () => {
  it("T1.10 (C28 I10): a percentile over a ring that dropped frames says so in its own text", () => {
    // **The qualification travels with the figure, not with the report.** A
    // reader quoting a p95 is reading this line; `dropped.frames` is two levels
    // away in a structure they are not looking at. And the direction matters —
    // a bound drops the oldest first and a tail is what a bound loses, so an
    // unqualified percentile over a truncated ring is wrong in the direction
    // that reassures.
    const hist: Histogram = {
      count: 40, min: 1, p50: 4, p95: 9, p99: 12, max: 14, sum: 200, mean: 5, error: 1 / 64,
    };
    const truncated = report({
      latency: { work: hist, wait: hist },
      dropped: { frames: 118, samples: 0, marks: 0, captureBytes: 0, captures: 0 },
    });

    for (const name of ["median-frame", "p95-frame"] as const) {
      const r = row(checkBudget(truncated), name);
      expect(r.state, `${name} is measured`).toBe("measured");
      if (r.state !== "measured") continue;
      expect(r.text, `${name} names the window`).toContain("over the window, not the session");
      // The count, not merely the fact. "Some frames were dropped" and "118 of
      // 158 were dropped" are different readings of the same p95, and only the
      // second lets a reader decide whether to believe it.
      expect(r.text, `${name} says how many`).toContain("118");
    }

    // **The control, and it is the whole row.** A label appended
    // unconditionally passes every assertion above and makes every report read
    // as truncated — which is the same defect pointing the other way, a caveat
    // that is always there being a caveat nobody reads.
    const whole = report({ latency: { work: hist, wait: hist } });
    for (const name of ["median-frame", "p95-frame"] as const) {
      const r = row(checkBudget(whole), name);
      expect(r.state).toBe("measured");
      if (r.state !== "measured") continue;
      expect(r.text, `${name} is unqualified when the ring held everything`).not.toContain("over the window");
    }
  });

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
  it("T1.62 (C28 I40): spans.frame is self time, strictly below the frame's work", async () => {
    const { report } = await profiled();
    const spans = report.spans ?? {};
    const work = report.latency?.work;
    if (work === undefined) throw new Error("no latency at tier spans");

    const frame = spans.frame;
    if (frame === undefined) throw new Error("no frame span");

    // **Strictly below, by more than the bucketing can explain.** A conservation
    // bound alone is satisfied by feeding `record` the node's `total` — the two
    // become equal and every sum still adds up (F885).
    expect(frame.sum).toBeLessThan(work.sum * (1 - work.error));

    const parts = Object.entries(spans)
      .filter(([name]) => name !== "frame")
      .reduce((n, [, h]) => n + (h?.sum ?? 0), 0);
    expect(frame.sum + parts, "the parts and the frame's own work fit inside it").toBeLessThanOrEqual(
      work.sum * (1 + work.error),
    );
  });

  it("T1.63 (C28 I40): make profile takes its shares against the work, not against the frame span", () => {
    // **The subject moved and this row is how that was noticed.** The table was
    // computed inside `tools/profile.mjs` until C28 I41; it is `checkPhases` now,
    // for the reason the budget check is in the harness — a reading computed in
    // a script is a reading no row can be written against, which is how the
    // negative residue went unasserted (F888). The arithmetic is asserted from
    // the source because the defect is a denominator and a running tool prints
    // only the quotient.
    const src = readFileSync("src/testing/profile.ts", "utf8");
    expect(src, "the whole is latency.work").toContain("report.latency?.work.sum");
    expect(src, "and never the frame span's self time").not.toMatch(
      /work = .*spans\.frame/,
    );
    expect(src, "and the residue is printed rather than absorbed").toContain("unaccounted");
  });
});

describe("C28 — every declared span is opened", () => {
  it("T1.60 (C28 I39): every SpanName member is opened somewhere under src/", () => {
    // **By equality against the union's own members.** A written list is
    // satisfied by the list, which is exactly the case this exists for: a member
    // added to `SpanName` and never wired passes any check whose corpus is its
    // own table. The scan is MG30 and this row is the same question asked of the
    // shipped tree, so a rule accidentally disabled is still caught here.
    const declared = new Set(
      [...(/export type SpanName =([\s\S]*?);/.exec(
        readFileSync("src/shell/profiling/types.ts", "utf8"),
      )?.[1] ?? "").matchAll(/"([a-z]+)"/g)].map((m) => m[1] ?? ""),
    );
    expect(declared.size, "the union was read, not an empty match").toBeGreaterThan(10);

    const opened = new Set<string>();
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = `${dir}/${name}`;
        if (statSync(path).isDirectory()) {
          walk(path);
          continue;
        }
        if (!path.endsWith(".ts")) continue;
        const body = readFileSync(path, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/(^|[^:])\/\/.*$/gm, "$1");
        for (const m of body.matchAll(/\b(?:span|trace)\(\s*"([a-z.]+)"/g)) opened.add(m[1] ?? "");
      }
    };
    walk("src");

    expect([...declared].filter((n) => !opened.has(n)), "declared and never opened").toEqual([]);
  });

  it("T1.61 (C28 I39): the four frame-path spans fire, and the phases fit inside the work", async () => {
    const { report } = await profiled();
    const spans = report.spans ?? {};

    for (const name of ["chrome", "overlays", "paint", "assemble"]) {
      expect(spans[name]?.count ?? 0, `${name} was opened`).toBeGreaterThan(0);
    }

    // **What this harness can and cannot say.** `profiled()` injects a counter
    // clock — `() => (t += 1)` — which advances once per *read*, not per unit of
    // work. Under it every leaf span records exactly 1 whether it brackets its
    // subject or closes beside it: `overlays` here is count 3, sum 3, max 1. So
    // no sum asserted from this session distinguishes a span from an adjacency,
    // and an earlier version of this row claimed one did. Bracketing is T1.2's
    // row, over a clock the callee advances.
    //
    // What survives the counter clock is containment — a read inside a span is a
    // read inside the frame — and the call **count**, which is what says the
    // wiring reaches both sites.
    const work = report.latency?.work.sum ?? 0;
    const parts = Object.entries(spans).reduce((n, [, h]) => n + (h?.sum ?? 0), 0);
    expect(parts, "every span together fits inside the frames' work").toBeLessThanOrEqual(work);

    // **One layout per frame** (C22 I96). `renderFrame` lays the overlays out
    // once through the one wrapper and hands the layout to both `paint()` and
    // `cursorFor()`. This row asserted `2 * frames` on purpose for as long as
    // each function took its own — a row asserting a disagreement is green for
    // exactly as long as the defect is (F941) — so it now counts the remedy: a
    // second call site reaching the wrapper, or `deps.overlays()` directly,
    // fails here either way.
    expect(
      spans.overlays?.count ?? 0,
      "one overlay layout per frame, through the measured wrapper",
    ).toBe(report.frames);
  });
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
  // --- C28 I41: two populations, one denominator -------------------------------

  it("T1.64 (C28 I41): every span found inside a frame's tree is declared `frame`, and every one opened outside a frame is declared `session`", async () => {
    // **Both populations in one session.** A keystroke opens `decode`, `route`
    // and `handler` between frames and then causes one, so a session that types
    // exercises each side of the partition without a far side or a local verb.
    const stdin = fakeStdin();
    let seen: ProfileReport | null = null;
    const { tui } = await buildSession({
      stdin: stdin as unknown as NodeJS.ReadStream,
      profile: {
        tier: "spans",
        elapsed: (() => { let t = 0; return () => (t += 1); })(),
        onReport: (r) => void (seen = r),
      },
    });
    for (let i = 0; i < 4; i += 1) {
      stdin.emit("x");
      await new Promise((r) => setImmediate(r));
    }
    await tui.stop("exit");
    const got = seen as ProfileReport | null;
    if (got === null) throw new Error("no report arrived");

    // **Measured from the trees, not restated from the table.** `frameRoot` is
    // nulled at frame end, so a span opened between frames roots itself and
    // cannot appear here — which is what makes this able to disagree.
    const inTrees = new Set<string>();
    const walk = (n: TreeNode): void => {
      inTrees.add(n.name);
      for (const c of n.children) walk(c);
    };
    for (const f of [...got.worst, ...got.timeline]) if (f.tree !== undefined) walk(f.tree);
    inTrees.delete("frame");

    // `frame` is excluded from both sides, as C28 I41 says: it is the bracket the
    // other two are measured against, not a member of either. Filed as
    // `session` here it would be the one name the row is certain about and the
    // one it would get wrong.
    const opened = Object.keys(got.spans ?? {}).filter(
      (n) => n in SPAN_SITE && SPAN_SITE[n as SpanName] !== "frame-itself",
    );
    const outside = opened.filter((n) => !inTrees.has(n));
    const inside = opened.filter((n) => inTrees.has(n));

    // The row cannot pass by having nothing to disagree with: a run that opened
    // no spans, or that kept no trees, satisfies every assertion below.
    expect(inside.length, "spans were observed inside a frame").toBeGreaterThan(4);
    expect(outside.length, "and spans were observed outside one").toBeGreaterThan(0);

    for (const name of inside) {
      expect(SPAN_SITE[name as SpanName], `${name} was found in a frame's tree`).toBe("frame");
    }
    for (const name of outside) {
      expect(SPAN_SITE[name as SpanName], `${name} was opened but never in a tree`).toBe("session");
    }
  });

  it("T1.65 (C28 I41): a report holding both populations → the session spans carry no share and the residue is not negative", () => {
    // The measured shape of F888, at the ratio that produced it: 755.9 ms of
    // between-frame work beside 2515.7 ms of in-frame work, against 2946.3 ms.
    const r = report({
      frames: 611,
      latency: { work: hist({ sum: 2946.3 }), wait: hist() },
      spans: {
        react: hist({ sum: 1605.0 }),
        assemble: hist({ sum: 760.7 }),
        elements: hist({ sum: 71.2 }),
        chrome: hist({ sum: 24.5 }),
        measure: hist({ sum: 24.5 }),
        compose: hist({ sum: 12.4 }),
        paint: hist({ sum: 9.0 }),
        overlays: hist({ sum: 5.5 }),
        write: hist({ sum: 2.9 }),
        local: hist({ sum: 643.4 }),
        handler: hist({ sum: 97.0 }),
        route: hist({ sum: 8.1 }),
        decode: hist({ sum: 7.4 }),
        frame: hist({ sum: 102.4 }),
      },
    });
    const phases = checkPhases(r);

    const inFrameSpans = phases.inFrame.flatMap((row) => [...row.spans]);
    for (const name of ["local", "handler", "route", "decode"]) {
      expect(inFrameSpans, `${name} is not divided by the frames' work`).not.toContain(name);
    }
    for (const row of phases.session) {
      expect(row.share, `${String(row.group)} carries no share`).toBeNull();
    }

    // **The sign is the assertion.** Summing the two populations gave -460.5 ms,
    // and nothing else about the table looked wrong.
    expect(phases.residue, "the residue is not negative").toBeGreaterThanOrEqual(0);
    expect(phases.residue, "and is the whole minus the in-frame parts").toBeCloseTo(
      2946.3 - 2515.7 - 102.4,
      1,
    );
    expect(phases.session.map((row) => row.ms).reduce((a, b) => a + b, 0)).toBeCloseTo(755.9, 1);
  });

  it("T1.66 (C28 I41): a report whose spans are all in-frame → the residue is exactly work − parts − frame, and the session table is empty rather than absent", () => {
    // **The other arm.** A partition that files everything as in-frame satisfies
    // T1.65 — the session list is empty, so its `share === null` loop passes
    // vacuously and the residue is unchanged. This is the state C28 I41 replaced,
    // and only asserting both directions separates them.
    const r = report({
      frames: 3,
      latency: { work: hist({ sum: 100 }), wait: hist() },
      spans: {
        react: hist({ sum: 40 }),
        assemble: hist({ sum: 30 }),
        "group.place": hist({ sum: 5 }),
        frame: hist({ sum: 10 }),
      },
    });
    const phases = checkPhases(r);

    expect(phases.session, "no span here is opened outside a frame").toEqual([]);
    expect(phases.residue, "work − (40 + 30 + 5) − 10").toBeCloseTo(15, 6);

    // The component sub-span has no `SPAN_SITE` entry and no phase, and is
    // in-frame by construction — a definition only renders inside a frame. It
    // counts towards the parts, or the residue absorbs work that was measured.
    const noPhase = phases.inFrame.find((row) => row.group === "no phase");
    expect(noPhase?.ms, "`group.place` is counted, not dropped").toBe(5);

    // **The third arm, and it guards the signal rather than the answer.** The
    // residue is what made C28 I41 findable, and it did so by going *negative* —
    // so a `Math.max(0, …)` anywhere on that line would be invisible to both
    // rows above, which only ever see a well-formed report. A report whose
    // parts exceed its work is the state a misfiling produces, and the row says
    // the table reports it rather than absorbing it.
    const crossed = checkPhases(
      report({
        frames: 1,
        latency: { work: hist({ sum: 10 }), wait: hist() },
        spans: { react: hist({ sum: 40 }), frame: hist({ sum: 1 }) },
      }),
    );
    expect(crossed.residue, "a residue below zero is reported, not clamped").toBeCloseTo(-31, 6);
    const row = crossed.inFrame.find((r) => r.group === "unaccounted");
    expect(row?.note, "and it says what a negative one means").toContain("below zero");
  });
});

describe("C28 — the leak table", () => {
  const stat = (created: number, finalised: number) => ({ created, finalised, live: created - finalised });

  it("T1.74 (C28 I43): a run that collected nothing and a leak are the same figures, and `collected` is what tells them apart", () => {
    // **Identical rows, opposite readings.** Both say *this class made a
    // thousand and let none go*. One is a leak; the other is a process that has
    // not been under memory pressure. No per-row figure separates them, which is
    // why the distinguisher is on the report.
    const quiet = checkLeaks(report({ leaks: { thing: stat(1000, 0) } }));
    expect(quiet.collected, "nothing was collected anywhere in this run").toBe(false);
    expect(quiet.rows[0]?.note, "so the row refuses to be a reading about the class").toContain(
      "not a reading about this class",
    );

    const held = checkLeaks(
      report({ leaks: { thing: stat(1000, 0), other: stat(50, 49) } }),
    );
    expect(held.collected, "something was collected, so retention means something").toBe(true);
    const row = held.rows.find((r) => r.name === "thing");
    expect(row?.liveShare, "the share is the shape, and one run only supports a shape").toBe(1);
    expect(row?.note, "and now the row will say it").toContain("held");

    // The floor, named rather than left as an off-by-one for a reader to chase.
    const floor = held.rows.find((r) => r.name === "other");
    expect(floor?.live, "one short, which is the floor and not a leak").toBe(1);
    expect(floor?.note).toContain("at the floor");
    expect(held.floor, "and the report states it").toBe(1);

    // The formatter carries the caveat in both directions, because a table
    // whose caveat only appears in one state is a table nobody reads twice.
    expect(formatLeaks(quiet)).toContain("No collection was observed");
    expect(formatLeaks(held)).toContain("floor of 1");
  });
});

describe("C28 I44 — the cheap tier records everything cheap", () => {
  it("T1.76 (C28 I44): frames are counted at `counters`, and the bytes row is measured rather than refused with a falsehood", () => {
    const p = createProfiler({ tier: "counters" }, { elapsed: () => 0 });
    for (let i = 0; i < 12; i += 1) {
      p.beginFrame("input");
      p.count("bytes.written", 4000);
      p.endFrame("frame");
    }
    const r = p.report();
    expect(r.frames, "twelve frames drew, whatever their durations cost to keep").toBe(12);

    // **The other half, and it is where the falsehood was printed.** A repair
    // that counted frames and left this refusing would satisfy a row asserting
    // only the count. `needs: "no frame was committed in this session"` was the
    // one thing the reader was told, and it was false about the session (F894).
    const bytes = checkBudget(r).rows.find((row) => row.row === "bytes-per-frame");
    expect(bytes?.state, "the numerator and the denominator are both here").toBe("measured");
    if (bytes?.state !== "measured") return;
    expect(bytes.value, "48 000 B over twelve frames").toBeCloseTo(4000, 6);

    p.dispose();

    // **`off` is the control.** A zero there is the true answer, so a repair
    // that counted unconditionally would be as wrong in the other direction and
    // this is what says so.
    const none = createProfiler({ tier: "off" }, { elapsed: () => 0 });
    for (let i = 0; i < 12; i += 1) {
      none.beginFrame("input");
      none.endFrame("frame");
    }
    expect(none.report().frames, "nothing is recorded at `off`, so zero is true").toBe(0);
    none.dispose();
  });
});
