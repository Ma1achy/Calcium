// C28 — profiler (docs/components/C28_profiler.md §10), tier 2.
//
// **These were seven todos, and their condition had been met on both halves.**
// The deferral read *lands with the recorder in `src/shell/profiling/`, and
// T2.4 with SS58* — the recorder is real, SS58 is in the scan table, and T2.4
// had already been written in `test/unit/profiler-seams.test.ts`, so the file
// was holding a duplicate of an implemented row and six rows whose blocker had
// gone. That is the deferral class the repo has now found four times: the
// condition is written where the deferral is, and the thing that satisfies it
// is written somewhere else, so nobody holding either half is looking at the
// other and neither half is wrong.
//
// **What tier 2 is for here is the instrument's own fixture.** This repository
// has found five of its own instruments wrong — a reader that guessed an
// encoding, a probe rebuilt from intent, a capture that read nothing — so a
// profiler must be shown *right* and not merely cheap. T2.1 is the fixture and
// T2.2 is its negative control, and neither is worth anything without the
// other: an instrument that reports 5 ms for a 5 ms wait and 5 ms for an empty
// span passes T2.1 exactly.
import { describe, expect, it } from "vitest";

import { createProfiler } from "../../src/shell/profiling/recorder.js";
import { PANES, profilePane } from "../../src/shell/profiling/panes.js";
import type {
  ResourceProbe,
  ResourceSample,
  ProfileReport,
} from "../../src/shell/profiling/types.js";

/** The real clock, in milliseconds — the axis `elapsed` is defined on. */
const realElapsed = (): number => Number(process.hrtime.bigint()) / 1e6;

/** Spin. `setTimeout` would measure the event loop rather than the span. */
function busy(ms: number): void {
  const until = realElapsed() + ms;
  while (realElapsed() < until) {
    /* deliberate */
  }
}

const SAMPLE: ResourceSample = Object.freeze({
  at: 0,
  rss: 0, heapUsed: 0, heapTotal: 0, external: 0, arrayBuffers: 0,
  heapLimit: 0,
  cpuUser: 0, cpuSystem: 0,
  loopUtilisation: 0,
  loopDelayMax: 0, loopDelayP50: 0, loopDelayP99: 0,
  loopDelayResolutionMs: 10, loopDelaySamples: 0,
  gc: Object.freeze({ minor: 0, major: 0, incremental: 0, weakcb: 0 }),
  gcPauseMs: 0,
  majorPageFaults: 0, involuntaryContextSwitches: 0,
  handles: Object.freeze({}),
  timingEntries: 0,
  suspended: false,
});

/**
 * A probe reading off a scripted series, counting how often it was asked.
 *
 * `loop` overrides the delay fields, because `SAMPLE` carries
 * `loopDelaySamples: 0` — an honest default, and one that means *no window has
 * passed*. A row about what a delay figure carries needs a figure (F1005).
 */
function scriptedProbe(
  heap: readonly number[],
  loop?: Readonly<Partial<Pick<ResourceSample, "loopDelaySamples" | "loopDelayP50" | "loopDelayMax">>>,
): ResourceProbe & { calls: () => number } {
  let i = 0;
  let calls = 0;
  return {
    sample(suspended: boolean): ResourceSample {
      calls += 1;
      const at = i;
      i += 1;
      return { ...SAMPLE, ...loop, at, heapUsed: heap[Math.min(at, heap.length - 1)] ?? 0, suspended };
    },
    spaces: () => Object.freeze([]),
    dispose: () => {},
    calls: () => calls,
  };
}

/** A schedule the test fires by hand, so a sampler's cadence is a count. */
function heldSchedule(): { fire: () => boolean; armed: () => number } {
  let pending: (() => void) | null = null;
  let armed = 0;
  const schedule = (fn: () => void): Disposable => {
    pending = fn;
    armed += 1;
    return { [Symbol.dispose]: () => void (pending = null) };
  };
  return Object.assign(schedule, {
    fire: (): boolean => {
      const fn = pending;
      pending = null;
      if (fn === null) return false;
      fn();
      return true;
    },
    armed: () => armed,
  }) as unknown as { fire: () => boolean; armed: () => number };
}

describe("C28 — profiler, tier 2", () => {
  it("T2.1 (C28 I2, the instrument's own fixture, real clock): the three readings against known inputs", () => {
    const schedule = heldSchedule() as unknown as (fn: () => void, ms: number) => Disposable;
    // Rising, then falling. A heap series is the one reading here with a shape,
    // and the shape is what a consumer draws.
    const probe = scriptedProbe([10, 20, 40, 80, 40, 20]);
    const prof = createProfiler(
      { tier: "spans", sampleMs: 1 },
      { elapsed: realElapsed, probe, schedule, node: process.version, cpus: 1 },
    );

    // **The duration.** A floor, not a window: the row asserts the span saw the
    // wait, and a ceiling here would be an assertion about this machine.
    prof.beginFrame("input");
    {
      using _s = prof.span("compose");
      busy(5);
    }
    prof.endFrame("frame");

    // **The counter.** Exact, because a count has no host in it.
    for (let i = 0; i < 1000; i += 1) prof.count("ticks");

    for (let i = 0; i < 6; i += 1) (schedule as unknown as { fire: () => boolean }).fire();

    const report = prof.report();
    const measured = report.spans?.compose?.max ?? 0;
    const counted = report.counters.ticks ?? 0;
    const heap = report.samples.map((s) => s.heapUsed);

    // All three printed, because a row asserting a floor should say what it got.
    console.log(
      `T2.1 · span ${measured.toFixed(3)} ms for a 5 ms wait · counter ${String(counted)} · heap ${heap.join(" ")}`,
    );

    expect(measured, "a 5 ms busy-wait is at least 4 ms of span").toBeGreaterThanOrEqual(4);
    expect(counted, "a thousand increments").toBe(1000);
    // Rising then falling, asserted as the shape rather than as six figures:
    // a probe returning the same number six times satisfies any per-element
    // check and has no shape at all.
    expect(heap.length, "six samples").toBe(6);
    const peak = heap.indexOf(Math.max(...heap));
    expect(peak, "the peak is inside the series, not at either end").toBeGreaterThan(0);
    expect(peak).toBeLessThan(heap.length - 1);
    expect(heap.slice(0, peak + 1), "rising to it").toEqual([...heap.slice(0, peak + 1)].sort((a, b) => a - b));
    expect(heap.slice(peak), "and falling after").toEqual([...heap.slice(peak)].sort((a, b) => b - a));
  });

  it("T2.2 (C28 I2, the negative control, real clock): an empty span reports its own cost, not its subject's", () => {
    const prof = createProfiler(
      { tier: "spans" },
      { elapsed: realElapsed, node: process.version, cpus: 1 },
    );

    prof.beginFrame("input");
    for (let i = 0; i < 200; i += 1) {
      using _s = prof.span("empty");
    }
    prof.endFrame("frame");

    const hist = prof.report().spans?.empty;
    const empty = hist?.p50 ?? 0;
    // **Both bounds printed, 400× apart.** Without this row T2.1 is satisfied
    // by an instrument that answers 5 ms to everything — the five-of-five class
    // arriving inside the tool built to end it.
    console.log(
      `T2.2 · empty span p50 ${(empty * 1000).toFixed(2)} µs, max ${((hist?.max ?? 0) * 1000).toFixed(2)} µs, against T2.1's 4 000 µs floor`,
    );
    expect(empty, "an empty span is under ten microseconds").toBeLessThanOrEqual(0.01);
  });

  it("T2.3 (C28 I13): the resolution travels with the delay figure", () => {
    const schedule = heldSchedule() as unknown as (fn: () => void, ms: number) => Disposable;
    // **A window behind the figure, because a row about what a figure carries
    // needs one** (F1005). This read `scriptedProbe([0])`, whose sample carries
    // `loopDelaySamples: 0` — no observation at all — and the sweep below then
    // passed on a pane drawing *0.00 ms at resolution 10 ms — a floor, not a
    // reading* over a histogram that had never been written to. The row was
    // green on precisely the state I13's second clause exists to refuse, which
    // is the fixture-responds rule arriving in the fixture's own defaults.
    const probe = scriptedProbe([0], { loopDelaySamples: 4, loopDelayP50: 0.004 });
    const prof = createProfiler(
      { tier: "spans", sampleMs: 1 },
      { elapsed: realElapsed, probe, schedule, node: process.version, cpus: 1 },
    );
    (schedule as unknown as { fire: () => boolean }).fire();

    const sample = prof.report().samples[0];
    expect(sample?.loopDelayResolutionMs, "the resolution is on the sample").toBe(10);

    // **The second half, and the one the field exists for.** A p50 of 0.004 ms
    // over four observations is *under 10 ms* and not *nothing*, so a figure
    // printed alone reports a precision the histogram does not have. The
    // invariant is not that nobody draws it — the memory pane does — but that
    // the resolution and the qualifier travel with it wherever it is drawn.
    //
    // **The two are told apart by the count, not by the value** (F1005). Zero
    // samples and a genuine sub-floor reading are the same three numbers, and
    // the sentence written for the second was being printed over the first
    // until `loopDelaySamples` existed to separate them.
    //
    // **Asserted over every pane rather than the one that draws it**, because a
    // row naming `memory` passes on the day a second pane starts printing the
    // figure on its own, which is exactly when the invariant first has
    // something to be wrong about.
    const report = prof.report();
    for (const pane of PANES) {
      const text = JSON.stringify(profilePane(report, pane));
      if (!text.includes("loop delay p50")) continue;
      expect(text, `${pane} draws the p50 with its resolution`).toContain("at resolution 10 ms");
      expect(text, `${pane} says what the figure is`).toContain("a floor, not a reading");
    }
  });

  // T2.4 (C28 I21) is in `test/unit/profiler-seams.test.ts`, with SS59's row
  // beside it. It needs `checkSourceScans` and a fabricated violation placed in
  // a named file, which is the enforcement harness rather than the profiler's,
  // and splitting a rule's row from its control would put the two halves in
  // different files for the sake of a directory name.

  it("T2.5 (C28 I19): sampling is on the schedule, not on the frame", () => {
    const held = heldSchedule();
    const schedule = held as unknown as (fn: () => void, ms: number) => Disposable;
    const probe = scriptedProbe([0]);
    const prof = createProfiler(
      { tier: "spans", sampleMs: 1000 },
      { elapsed: realElapsed, probe, schedule, node: process.version, cpus: 1 },
    );

    // Sixty seconds at sixty frames a second. `performance.getEntries()` is
    // read exactly once inside `sample`, so counting calls counts reads — and
    // F853's buffer is the thing that gets worse the more often it is read.
    for (let i = 0; i < 3600; i += 1) {
      prof.beginFrame("input");
      {
        using _s = prof.span("compose");
      }
      prof.endFrame("frame");
    }

    expect(probe.calls(), "3 600 frames sample nothing").toBe(0);

    for (let i = 0; i < 60; i += 1) (held as unknown as { fire: () => boolean }).fire();
    expect(probe.calls(), "sixty intervals sample sixty times").toBe(60);
  });

  it("T2.6 (C28 I12): a frame with one real commit in it is not self-inflicted", () => {
    const prof = createProfiler(
      { tier: "spans" },
      { elapsed: realElapsed, node: process.version, cpus: 1 },
    );

    // `spinner` is the reason a profiler pane refreshing on its own timer
    // raises; `own` is what marks it as the profiler's rather than the app's.
    prof.commit("spinner", true);
    prof.commit("input", false);
    prof.beginFrame("input");
    prof.endFrame("frame");

    const frame = prof.report().timeline[0];
    expect(frame?.selfInflicted, "one real commit is enough to make it real").toBe(false);
    expect(prof.report().excluded.selfInflicted, "and nothing was excluded").toBe(0);

    // The control, because `false` is also what a field nobody sets reports.
    const own = createProfiler(
      { tier: "spans" },
      { elapsed: realElapsed, node: process.version, cpus: 1 },
    );
    own.commit("spinner", true);
    own.beginFrame("spinner");
    own.endFrame("frame");
    // **A self-inflicted frame leaves the timeline entirely** — counted, and in
    // no duration — so the control is the count and not the flag. Reading the
    // flag here finds `undefined`, which is what a frame that was never
    // recorded and a frame that was recorded as false both look like.
    expect(own.report().timeline.length, "a frame the profiler raised alone is not in the timeline").toBe(0);
    expect(own.report().excluded.selfInflicted, "it is counted as excluded").toBe(1);
  });

  it("T2.7 (C28 I25): the timing-entry figure is a count, and says so", () => {
    const schedule = heldSchedule() as unknown as (fn: () => void, ms: number) => Disposable;
    const probe: ResourceProbe = {
      sample: (suspended) => ({ ...SAMPLE, timingEntries: 42, suspended }),
      spaces: () => Object.freeze([]),
      dispose: () => {},
    };
    const prof = createProfiler(
      { tier: "spans", sampleMs: 1 },
      { elapsed: realElapsed, probe, schedule, node: process.version, cpus: 1 },
    );
    (schedule as unknown as { fire: () => boolean }).fire();

    const report: ProfileReport = prof.report();
    expect(report.samples[0]?.timingEntries).toBe(42);

    // **The label is the invariant, not the number.** Forty-two entries with no
    // attribution is a canary; forty-two rendered as though the profiler knew
    // whose they were is a claim it cannot make, and the pane is where a figure
    // turns into a sentence.
    const text = JSON.stringify(profilePane(report, "memory"));
    expect(text, "the count is drawn").toContain("42");
    expect(text, "with what it cannot say beside it").toContain("the profiler raises no marks");
  });
});
