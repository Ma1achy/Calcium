// C28 — profiler (docs/components/C28_profiler.md §10), tier 3.
//
// **Eleven deferrals whose stated blocker had landed, and nothing could say so.**
// Each carried *not deferred on a component: lands with the recorder in
// `src/shell/profiling/`*. The recorder landed. TD1–TD6 watch a **component id**
// and these named none, so there was nothing to expire; SP9 wants an invariant
// to be **named** by a row, and a deferral's title names one exactly as an
// assertion's does. Two gates satisfied by the shape of one sentence, each for
// its own reason, which is why neither read as a hole — F896, where the figure
// is that twenty invariants across seven components were in that state.
//
// (Written without quoting a deferral's call form: `collectTodos` reads source
// text and cannot tell a comment from code, which is why `todo-expiry.test.ts`
// excludes itself. TD6 fired on this paragraph's first draft.)
//
// **And the eleven were not one thing.** One marker covered rows with three
// dispositions: subjects that had existed all round, subjects that exist
// nowhere in `src/`, and one naming methods that were never built beside a flag
// that was. What stays deferred below says which, as a symbol to grep.
import { describe, expect, it } from "vitest";

import { createProfiler } from "../../src/shell/profiling/recorder.js";
import { createResourceProbe } from "../../src/shell/profiling/node.js";
import { profilePane } from "../../src/shell/profiling/panes.js";
import type { ProfileReport, ResourceSample, Tier } from "../../src/shell/profiling/types.js";

/**
 * A report carrying nothing but the samples under test.
 *
 * Built by hand rather than driven through a profiler because the sampler's
 * ring is filled by the injected timer and a row about **what a consumer does
 * with a flag** should not also be a row about when the timer fires.
 */
function reportWith(samples: readonly ResourceSample[]): ProfileReport {
  return {
    regime: { node: "v22.0.0", cpus: 8, tier: "spans", durationMs: 1000, histogramError: 1 / 64, ringReset: 0, captureDir: ".calcium/profile" },
    byReason: {}, timeline: [], worst: [], nodes: [], byKind: {}, byEntry: {}, leaks: {},
    counters: {}, gauges: {}, misses: {}, hits: {}, marks: [], samples, captures: [],
    excluded: { selfInflicted: 0, fallback: 0 },
    dropped: { frames: 0, samples: 0, marks: 0, captureBytes: 0, captures: 0 },
    overhead: { spans: 0, clockNs: 0, estimateMs: 0, asyncEnabled: false },
    heapSpaces: [], frames: 0,
  };
}

/** A clock the row drives, so a duration is a fact rather than a timing hope. */
function clock(): { now: () => number; at: (t: number) => void } {
  let t = 0;
  return { now: () => t, at: (v: number) => { t = v; } };
}

describe("C28 — profiler, tier 3 spec-first rows", () => {
  it("T3.1 (C28 I5): wait runs from the earliest unserved commit, and a repaint waits zero", () => {
    // **Three commits, not one, because one cannot tell the two readings
    // apart.** `wait` from the earliest and `wait` from the latest agree
    // whenever there is a single commit, which is the shape every convenient
    // fixture has. The gap between 10 and 40 is the whole invariant.
    const c = clock();
    const p = createProfiler({ tier: "spans" }, { elapsed: c.now });

    c.at(10); p.commit("input", false);
    c.at(25); p.commit("stream", false);
    c.at(40); p.commit("stream", false);
    c.at(50); p.beginFrame("input");
    c.at(60); p.endFrame("frame");

    const first = p.report().timeline[0];
    expect(first?.wait, "50 − 10, the commit the reader has been waiting on").toBe(40);
    expect(first?.wait, "not 50 − 40, which is the last one to arrive").not.toBe(10);

    // **The repaint: a frame nobody asked for.** `endFrame` cleared the mark,
    // so there is no unserved commit and the subtraction has no left operand.
    // Zero rather than negative, and zero rather than the previous frame's —
    // a repaint that inherits a stale mark reports the wait of a frame that was
    // already served.
    c.at(90); p.beginFrame("resize");
    c.at(95); p.endFrame("frame");
    const repaint = p.report().timeline[1];
    expect(repaint?.wait, "no commit was outstanding").toBe(0);
    expect(repaint?.work, "and it still measures its own work").toBe(5);
  });

  it("T3.2 (C28 I9): a ring of one holds the last frame and counts the four it dropped", () => {
    // A bound that discards silently and a session that only had one frame
    // produce the same report. `dropped` is what separates them, and it is
    // asserted **beside** the held count rather than as a total: a sum over
    // held-plus-dropped is satisfied by redistribution, which is the defect the
    // ring's own header records.
    const c = clock();
    const p = createProfiler({ tier: "spans", ring: 1 }, { elapsed: c.now });

    for (let i = 0; i < 5; i += 1) {
      c.at(100 * i); p.beginFrame("input");
      c.at(100 * i + 7); p.endFrame("frame");
    }

    const r = p.report();
    expect(r.timeline, "the bound is one").toHaveLength(1);
    expect(r.dropped.frames, "and four went").toBe(4);
    expect(r.frames, "while the count of frames drawn is not the ring's size").toBe(5);

    // The one held is the **last**, not the first: a bound that kept the oldest
    // would report a session's opening as its present state.
    expect(r.timeline[0]?.at, "the newest survives").toBe(400);

    // The control: the same five frames with room for them drops nothing, so
    // the figure above is the bound's doing and not the recorder's.
    const c2 = clock();
    const q = createProfiler({ tier: "spans", ring: 16 }, { elapsed: c2.now });
    for (let i = 0; i < 5; i += 1) {
      c2.at(100 * i); q.beginFrame("input");
      c2.at(100 * i + 7); q.endFrame("frame");
    }
    expect(q.report().dropped.frames, "nothing dropped when the ring is big enough").toBe(0);
  });

  it("T3.3 (C28 I13): over a window shorter than the resolution every delay figure is at the floor, and carries it", async () => {
    // **The edge the row names, and the invariant it can actually assert.**
    // Sampled immediately, the loop histogram has had no window: measured,
    // `max` is 0 and both percentiles are 0.000511 ms — three figures under a
    // 10 ms resolution, which is to say under the instrument's own floor.
    //
    // I13's remedy is that the resolution **travels with** the figure, and it
    // does. F898 held open which of two remedies it wanted — qualify, or omit —
    // and F1005 rules **both, at different layers**: the recorder keeps the
    // zero-filled histogram because that is what it holds, and the consumer
    // prints nothing when `loopDelaySamples` is zero. A percentile under the
    // floor is a statement about the instrument; a *maximum* of zero is an
    // existence claim about the loop, and no resolution printed beside it
    // qualifies that reading.
    //
    // So this row has two arms, and the interesting cell is the boundary: a
    // floor reading and an absence are the same three numbers in the sample and
    // must not be the same on the screen.
    const { createResourceProbe } = await import("../../src/shell/profiling/node.js");
    const probe = createResourceProbe();
    try {
      const s = probe.sample(false, 0);
      expect(s.loopDelayResolutionMs, "the resolution is on the sample").toBe(10);
      for (const [name, v] of [
        ["max", s.loopDelayMax], ["p50", s.loopDelayP50], ["p99", s.loopDelayP99],
      ] as const) {
        expect(v, `${name} is a number, not a gap`).toBeTypeOf("number");
        expect(v, `${name} is under the resolution — a floor, not a reading`)
          .toBeLessThan(s.loopDelayResolutionMs);
      }
      // The control on the qualification itself: without the resolution beside
      // them these three are indistinguishable from a loop that never blocked,
      // which is the reading I13 exists to prevent.
      expect(s.loopDelayResolutionMs, "and it is not zero, which would qualify nothing")
        .toBeGreaterThan(0);

      // **The second arm** (F1005): the sample says how many delays are behind
      // the figures, and with none behind them the pane prints no figure. The
      // count is what separates a floor from an absence, and it is zero here for
      // the same reason the figures are — no window has passed.
      expect(s.loopDelaySamples, "no window, so no samples").toBe(0);
      const empty = JSON.stringify(profilePane(reportWith([s]), "memory"));
      // **The label and its value together, because the notice is on two rows.**
      // The first draft read `toContain("— no window sampled yet")` and survived
      // deleting the maximum's own branch: the p50's copy of the notice
      // satisfied it. An assertion over a pane's whole text is a proxy for the
      // row it means, and two rows carrying one sentence is where the proxy
      // parts company with its subject.
      expect(empty, "the maximum is the absence and not a figure").toContain(
        '{"label":"loop delay max","value":"— no window sampled yet"}',
      );
      expect(empty, "and the p50 says so too, with the resolution").toContain(
        '{"label":"loop delay p50","value":"— no window sampled yet, at resolution 10 ms"}',
      );

      // **And the control, which has to be a sample that did have a window.**
      // Without it the assertion above is satisfied by a pane that never prints
      // a maximum at all, which is the same green for the opposite defect.
      const measured = { ...s, loopDelaySamples: 4, loopDelayMax: 12.5, loopDelayP50: 0.5 };
      const drawn = JSON.stringify(profilePane(reportWith([measured]), "memory"));
      expect(drawn, "a measured maximum is the figure").toContain(
        '{"label":"loop delay max","value":"12.5 ms"}',
      );
      expect(drawn, "the p50 is the figure and its floor").toContain(
        '"loop delay p50","value":"0.50 ms at resolution 10 ms — a floor, not a reading"',
      );
      expect(drawn, "and no row claims an absence").not.toContain("— no window sampled yet");
    } finally {
      probe.dispose();
    }
  });

  it("T3.4 (C28 I17): capture refuses below `deep` and names both tiers, at every tier below it", async () => {
    // **The refusal is the feature.** A capture that runs at `counters` returns
    // a file the process cannot have filled, and a reader opening a 0-byte heap
    // snapshot concludes the heap is empty rather than that the tier was wrong.
    //
    // Over every tier below `deep` rather than one of them: a guard written as
    // `tier === "off"` refuses the tier a caller is least likely to be on and
    // passes the three they are.
    for (const tier of ["off", "counters", "spans", "alloc"] as const satisfies readonly Tier[]) {
      const p = createProfiler({ tier }, { elapsed: () => 0 });
      // **A rejection, not a synchronous throw**, because `capture` is `async`
      // — so a caller writing `try { p.capture(k) } catch` around an
      // un-awaited call catches nothing and gets an unhandled rejection
      // instead. I22's word is *throws*, which for an async function is this;
      // the row awaits so the distinction is asserted rather than assumed.
      let message = "";
      try {
        await p.capture("heap");
      } catch (err) {
        message = err instanceof Error ? err.message : String(err);
      }
      expect(message, `${tier} names the tier required`).toContain('needs tier "deep"');
      expect(message, `${tier} names the tier it is on`).toContain(`"${tier}"`);
    }
  });

  it("T3.5 (C28 I17): a capture still running at shutdown is waited for, bounded, then recorded as abandoned", async () => {
    // A clock the test drives, so the bound is a number of ticks rather than a
    // wall-clock second — and an inspector whose capture never settles, which
    // is the state the row is about and the one a real inspector reaches only
    // under a heap snapshot of a large process.
    let now = 0;
    const pending = new Promise<never>(() => undefined);
    let scheduled = 0;
    const p = createProfiler(
      { tier: "deep", captureDir: "/tmp/none" },
      {
        elapsed: () => now,
        schedule: (fn, _ms) => {
          scheduled += 1;
          now += 10;
          queueMicrotask(fn);
          return { [Symbol.dispose]: () => undefined };
        },
        inspector: {
          capture: () => pending,
          dispose: () => undefined,
        },
      },
    );

    // Started and never awaited: the row is about shutdown, not about the
    // caller. The rejection is caught so the test does not fail on it.
    void p.capture("cpu").catch(() => undefined);

    // **The wait is bounded and it says what it gave up on.** An unbounded one
    // is a shell that will not exit; the return value is what the caller
    // reports instead of guessing.
    const still = await p.drain(50);
    expect(still, "the capture is still running when the bound expires").toBe(1);
    expect(scheduled, "and the bound was reached by waiting, not by returning").toBeGreaterThan(0);

    p.dispose();
    const r = p.report();
    const abandoned = r.captures.filter((c) => c.abandoned);
    expect(abandoned.length, "the abandoned capture is named").toBe(1);
    expect(abandoned[0]?.path, "with the path the report had promised").toContain("cpu-");
    expect(abandoned[0]?.bytes, "no bytes were written").toBe(0);
    // **A count, not a byte figure.** How much an abandoned capture would have
    // written is unknowable, and a `droppedBytes` of 0 reads as *nothing was
    // lost* — the shape C28 I13 exists to forbid.
    expect(r.dropped.captures, "and the count says one was lost").toBe(1);
    expect(r.dropped.captureBytes, "while the byte total stays honest at zero").toBe(0);
  });

  it("T3.5b (C28 I17): a capture that finishes inside the bound is not abandoned", async () => {
    // **The control.** Without it the row above passes on a `drain` that never
    // waits and a `dispose` that marks everything abandoned.
    let now = 0;
    const p = createProfiler(
      { tier: "deep", captureDir: "/tmp/none" },
      {
        elapsed: () => now,
        schedule: (fn) => {
          now += 10;
          queueMicrotask(fn);
          return { [Symbol.dispose]: () => undefined };
        },
        inspector: {
          capture: (kind, path) =>
            Promise.resolve({
              kind,
              path,
              bytes: 128,
              truncated: false,
              droppedBytes: 0,
              durationMs: 1,
              abandoned: false,
            }),
          dispose: () => undefined,
        },
      },
    );
    await p.capture("cpu");
    expect(await p.drain(50), "nothing is in flight").toBe(0);
    p.dispose();
    const r = p.report();
    expect(r.captures.some((c) => c.abandoned), "and nothing is marked abandoned").toBe(false);
    expect(r.dropped.captures, "with no loss counted").toBe(0);
  });
  // **T3.6 is written and running in `test/unit/profiler-gauges.test.ts`.** The
  // deferral for it stood here as well, saying *record and replay do not exist*
  // — and they do, and the row had been written against them. Two records of one
  // row, and the deferral is the one that reads as the state of the work (F919).
  it("T3.7 (C28 I6): a composition that throws with two spans open closes both, and the frame is excluded", () => {
    // **A throw mid-frame is the case where a span leaks**, and a leaked span
    // is worse than a missing one: it stays open, `freezeTree` gives it the
    // frame's remaining time, and the tree names a node that never finished as
    // the widest thing in it. `using` closes on scope exit however the scope
    // ends, and this row is what says the frame path uses it rather than a
    // hand-written close on the happy line.
    const c = clock();
    const p = createProfiler({ tier: "spans" }, { elapsed: c.now });

    c.at(0); p.beginFrame("input");
    try {
      using _outer = p.asProbe().span("compose");
      c.at(5);
      using _inner = p.asProbe().span("paint");
      c.at(9);
      throw new Error("the composition failed");
    } catch {
      // The shell's own fallback path: it catches, and the frame still ends.
    }
    c.at(12); p.endFrame("fallback");

    const r = p.report();
    expect(r.frames, "a fallback is a frame that reached the terminal").toBe(1);

    // **Excluded from the durations, not merely marked.** A fallback is a
    // frame's absence rather than its cost, so a latency histogram that counts
    // it reports the framework as fast on the frames where it gave up.
    expect(r.latency?.work.count, "no work figure took it").toBe(0);
    expect(r.excluded.fallback, "and the exclusion is counted rather than silent").toBe(1);

    // **C28 I6's second clause is recorded and cannot be read** (F899). The record
    // in the ring carries `outcome: "fallback"`; `report()` builds `timeline`
    // and `worst` from `drawn`, which is filtered to `outcome === "frame"`, so
    // the frame that gave up appears in no projection and the only published
    // trace of it is the count above. The row asserts the absence rather than
    // stepping over it, so the day a projection carries it this fails and gets
    // rewritten.
    expect(r.timeline.map((f) => f.outcome), "no fallback reaches the timeline").toEqual([]);
    expect(r.worst.map((f) => f.outcome), "nor the worst list").toEqual([]);

    // Neither span is still open: both have a real self time, and neither was
    // handed the frame's tail by `freezeTree`.
    const spans = r.spans;
    expect(spans, "the tier is `spans`, so the key is present").toBeDefined();
    expect(spans?.compose?.count, "the outer closed").toBe(1);
    expect(spans?.paint?.count, "the inner closed").toBe(1);
    expect(spans?.paint?.max, "at its own duration, 9 − 5").toBe(4);
    expect(spans?.compose?.max, "self time, so the inner is not counted twice").toBe(5);
  });

  it("T3.8 (C28 I22): every operation after dispose, and the one that throws throws about dispose", () => {
    // T1.14 rules the shape at tier 1; this is the exhaustive arm, because the
    // invariant is over **every** operation and a row naming three of them is
    // green on the day a fourth starts writing after dispose.
    const c = clock();
    const p = createProfiler({ tier: "spans" }, { elapsed: c.now });
    c.at(10); p.beginFrame("input");
    c.at(20); p.endFrame("frame");
    const before = JSON.stringify(p.report());

    p.dispose();
    p.dispose(); // idempotent — the second is a no-op, not a second teardown

    c.at(30);
    p.commit("input", false);
    p.beginFrame("input");
    { using _e = p.element("plot", "pl-1"); }
    { using _n = p.entry("e-1"); }
    p.endFrame("frame");
    p.setTier("alloc");
    p.asProbe().count("after");
    p.asProbe().mark("after");
    p.asProbe().track("after", {});

    const after = p.report();
    expect(after.counters.after, "a counter raised after dispose is not recorded").toBeUndefined();
    expect(after.timeline, "and no frame joined the ring").toHaveLength(1);
    expect(after.frames, "nor the drawn count").toBe(1);
    expect(after.regime.tier, "setTier is a no-op too, so the report still says what it was").toBe("spans");
    expect(JSON.stringify({ ...after, regime: { ...after.regime, durationMs: 0 } }),
      "the whole report is unchanged but for its own duration").toBe(
      JSON.stringify({ ...JSON.parse(before) as object, regime: { ...(JSON.parse(before) as { regime: object }).regime, durationMs: 0 } }),
    );
  });

  it("T3.9 (C28 I26): a span open across a resize keeps its opening width and is tagged", () => {
    let now = 0;
    const p = createProfiler({ tier: "spans" }, { elapsed: () => (now += 1) });
    p.resized(100);
    p.beginFrame("input");

    // One span that spans the resize, and one opened after it. The second is
    // the control: without it the row passes on an implementation that tags
    // every span and pins every width to the first one it saw.
    const crossing = p.span("measure");
    p.resized(60);
    crossing[Symbol.dispose]();
    // **Opened after the crossing one closes, so the two are siblings.** Opened
    // inside it they nest, and the assertion below would be reading a child of
    // the span it is contrasting with rather than a peer.
    const after = p.span("paint");
    after[Symbol.dispose]();
    p.endFrame("frame");

    const tree = p.report().worst[0]?.tree;
    const byName = new Map((tree?.children ?? []).map((c) => [c.name, c]));
    expect(byName.get("measure")?.width, "the width it opened at, not the one it closed at").toBe(
      100,
    );
    expect(byName.get("measure")?.crossedResize, "and the tag that says so").toBe(true);
    expect(byName.get("paint")?.width, "a span opened after the resize carries the new width").toBe(
      60,
    );
    expect(byName.get("paint")?.crossedResize, "and is not tagged").toBe(false);
  });
  it("T3.10 (C28 I27): a suspended sample is carried, and no pane draws one as the present state", () => {
    // **`suspended` was on `ResourceSample` from the first commit and no
    // consumer read it** (F900). A sample taken while the session is suspended
    // has a loop that was not turning and a process that was not working: its
    // zeroes are a stopped clock, and the memory pane took every headline
    // figure from the newest sample whatever its flag. An idle machine and a
    // paused one produce the same picture, which is the reading I27 names.
    const probe = createResourceProbe();
    try {
      const running = probe.sample(false, 0);
      const paused = probe.sample(true, 0);

      // The first clause, and it is the parameter coming back — asserted so the
      // second clause has something to be about.
      expect(paused.suspended, "the flag is carried").toBe(true);
      expect(running.suspended).toBe(false);

      // **The headline skips it.** With a suspended sample newest, the figures
      // must still come from the last running one; the series may hold both,
      // and the caption has to say the series is not continuous.
      const mixed = JSON.stringify(profilePane(reportWith([running, paused]), "memory"));
      expect(mixed, "the pane says how many were suspended").toContain("1 of them suspended");
      expect(mixed, "and why that matters to the series").toContain("not continuous");

      // **Every sample suspended is a refusal, not a drawing.** There is no
      // reading of a running process to headline, and a pane that fell back to
      // the newest sample anyway would present a stopped clock as the answer.
      const allPaused = JSON.stringify(profilePane(reportWith([paused, paused]), "memory"));
      expect(allPaused, "it refuses").toContain("no reading of a running process");
      expect(allPaused, "and draws no series").not.toContain("me-heap");

      // The control: with nothing suspended the pane is unchanged — a guard
      // that qualified every report would satisfy both arms above.
      const clean = JSON.stringify(profilePane(reportWith([running, running]), "memory"));
      expect(clean, "no suspension, no caveat").not.toContain("suspended");
      expect(clean, "and the series is drawn").toContain("me-heap");
    } finally {
      probe.dispose();
    }
  });

  it("T3.10b (C28 I27, C28 I28): a tick inside suspend() itself is already labelled, and one inside resume() still is", () => {
    // **The boundary, which T4.5's arms step over.** That row ticks the sampler
    // between the calls; this one ticks it *from inside* them, which is the case
    // the ordering ruling exists for. The flag is set before the terminal is
    // released and cleared after it is reacquired, so the two windows a tick can
    // fall into — while `suspend()` runs, and while `resume()` runs — are both
    // on the suspended side. The other order leaves a window whose width is
    // whatever the call costs, and a sample in it is exactly the reading C28 I28
    // refuses.
    let tick: (() => void) | null = null;
    const flags: boolean[] = [];
    const profiler = createProfiler(
      { tier: "spans" },
      {
        elapsed: () => 0,
        probe: {
          sample: (suspended: boolean) => {
            flags.push(suspended);
            return { at: 0, suspended } as unknown as ResourceSample;
          },
          spaces: () => [],
          dispose: () => undefined,
        },
        schedule: (fn: () => void): Disposable => {
          tick = fn;
          return { [Symbol.dispose]: () => void (tick = null) };
        },
      },
    );
    const sample = (): void => {
      const fn = tick;
      if (fn === null) throw new Error("the sampler is not armed");
      fn();
    };

    // A lifecycle that samples from inside each transition — the tick lands
    // *during* the call rather than between two of them.
    const lifecycle = {
      suspend: (): void => sample(),
      resume: (): void => sample(),
    };
    const decorated = {
      suspend: (): void => {
        profiler.setSuspended(true);
        lifecycle.suspend();
      },
      resume: (): void => {
        lifecycle.resume();
        profiler.setSuspended(false);
      },
    };

    sample(); // before
    decorated.suspend(); // during the release
    sample(); // inside the interval
    decorated.resume(); // during the reacquire
    sample(); // after

    expect(flags, "the two boundary ticks fall on the suspended side").toEqual([
      false, // before
      true, //  inside suspend()
      true, //  the interval
      true, //  inside resume() — still not reacquired
      false, // after
    ]);

    // **The control: the reverse order, which is the mutation this row names.**
    // Setting the flag after the release and clearing it before the reacquire
    // leaves both boundary ticks reading `false` — two samples of a process that
    // was not the foreground, labelled as though it were, and the interval's own
    // tick is unaffected so no count-based assertion sees the difference.
    flags.length = 0;
    const reversed = {
      suspend: (): void => {
        lifecycle.suspend();
        profiler.setSuspended(true);
      },
      resume: (): void => {
        profiler.setSuspended(false);
        lifecycle.resume();
      },
    };
    profiler.setSuspended(false);
    sample();
    reversed.suspend();
    sample();
    reversed.resume();
    sample();
    expect(flags, "the control: the reverse order loses both boundaries").toEqual([
      false,
      false, // inside suspend() — the flag is not set yet
      true,
      false, // inside resume() — the flag is already cleared
      false,
    ]);
    profiler.dispose();
  });

  it("T3.11 (C28 I29): a rejecting fetch closes its span, and the profiler adds no retry", async () => {
    // **`finally`, not `then`.** A span recorded on the success path only is
    // invisible for exactly the polls that went wrong, so a live part whose
    // fetch is failing shows as a part that is not being fetched at all — the
    // absence-indistinguishable-from-failure shape, in a duration.
    const c = clock();
    const p = createProfiler({ tier: "spans" }, { elapsed: c.now });

    let calls = 0;
    const boom = new Error("the far side hung up");
    const failing = async (): Promise<never> => {
      calls += 1;
      c.at(30);
      return Promise.reject(boom);
    };

    c.at(10);
    let caught: unknown = null;
    try {
      await p.trace("livefetch", failing);
    } catch (err) {
      caught = err;
    }

    expect(caught, "the rejection reaches the caller unchanged, by identity").toBe(boom);
    const r = p.report();
    expect(r.spans?.livefetch?.count, "and the span was recorded anyway").toBe(1);
    expect(r.spans?.livefetch?.max, "at the real duration, 30 − 10").toBe(20);

    // **The retry assertion, and it is the half a duration cannot give.**
    // C24 §5 owns the backoff; a profiler that re-ran the call to get a clean
    // measurement would double every failing poll against the far side, and
    // the only witness is the call count.
    expect(calls, "the profiler called it once").toBe(1);
  });

});
