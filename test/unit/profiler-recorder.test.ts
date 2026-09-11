// C28 I3 — a span records the time that passes *inside* it.
//
// **This file exists because a mutation survived.** `OVERLAYS-BESIDE` moved a
// span so it closed before the call it names, and nothing in the suite failed.
// The row that was supposed to catch it — T1.61's residue clause — reads the
// recorded sums under `buildSession`'s injected clock, and that clock is a
// counter: `() => (t += 1)`, advancing once per *read*. Under it every leaf span
// records exactly 1, whether it wraps a millisecond of work or nothing at all.
// Measured, on the session T1.61 builds: `overlays` count 6, sum 6, max 1 —
// count 3, sum 3 since C22 I96 laid the overlays out once per frame (F941),
// and the argument is unchanged: every leaf reads 1 under a counter clock.
//
// So the sentence in T1.61 — *only the sum says they were called around the work
// rather than beside it* — named a mechanism that harness does not have. It is
// F883's shape again: falsifiable in principle, unfalsifiable in this tree.
//
// The distinction needs a clock the **callee** advances, which is what an
// injected stepping clock gives and a counter cannot. Both arms are here,
// because the zero arm is what makes the five mean anything: a recorder that
// reports 0 for every span would satisfy the second row alone.
//
// This is the recorder-core file. T1.1 and T1.3–T1.17 land here.
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import { Leaks } from "../../src/shell/profiling/leaks.js";
import { createProfiler } from "../../src/shell/profiling/recorder.js";
import { createRecording } from "../../src/shell/profiling/record.js";
import { parseRecording } from "../../src/shell/profiling/replay.js";
import type { ResourceProbe, ResourceSample } from "../../src/shell/profiling/types.js";

describe("C28 — the recorder's span, over a clock its subject advances", () => {
  it("T1.2 (C28 I3): a span over a callee advancing the clock 5 ms records 5; the same span closed beside that callee records 0", () => {
    let now = 0;
    // The stand-in for work: it costs time, and it costs it *while called*.
    // A counter clock cannot express this, which is the whole point of the row.
    const work = (ms: number): void => void (now += ms);

    const entriesBefore = performance.getEntries().length;
    const p = createProfiler({ tier: "spans" }, { elapsed: () => now });

    {
      using _around = p.span("compose");
      work(5);
    }

    {
      using _beside = p.span("measure");
    }
    work(5);

    const report = p.report();
    const spans = report.spans ?? {};

    expect(spans.compose?.sum, "the span that brackets the work carries it").toBe(5);
    expect(spans.measure?.sum, "the span that closes beside it carries nothing").toBe(0);
    expect(spans.measure?.count, "and is still opened, so a count cannot tell them apart").toBe(1);

    // C28 I3's second half. The recorder reads the injected clock and nothing
    // else; a `performance.mark` would put this instrument in the buffer it is
    // meant to be measuring, and would leak into any host reading User Timing.
    expect(
      performance.getEntries().length,
      "the recorder writes no User Timing entries",
    ).toBe(entriesBefore);

    p.dispose();
  });
});

describe("C28 I42 — an element belongs to the entry it was drawn for", () => {
  /**
   * A recorder over a clock the callee advances, so a duration means something.
   * A counter clock advances per read and makes every leaf span 1 (F887).
   */
  const stepping = (): Readonly<{
    profiler: ReturnType<typeof createProfiler>;
    work: (ms: number) => void;
  }> => {
    let now = 0;
    return {
      profiler: createProfiler({ tier: "spans" }, { elapsed: () => now }),
      work: (ms: number): void => void (now += ms),
    };
  };

  it("T1.17 (C28 I24, C28 I42): an entry's histogram is its elements' work, and the frame's wait is in no entry and no kind", () => {
    const { profiler: p, work } = stepping();

    p.beginFrame("input");
    {
      using _e = p.entry("e1");
      {
        using _a = p.element("table", "t1", "measure");
        work(2);
      }
      {
        using _b = p.element("rule", "r1", "measure");
        work(1);
      }
    }
    p.endFrame("frame");

    const r = p.report();

    expect(r.byEntry.e1?.sum, "the entry carries its elements' work").toBe(3);
    expect(r.byEntry.e1?.count, "both elements, not one").toBe(2);

    // **The wait is nowhere.** Asserted over every value rather than against a
    // named row, because a wait folded in under some *other* key is the defect
    // and a row naming `e1` cannot see it (C28 I24).
    const entryFigures = Object.values(r.byEntry).map((h) => h.sum);
    const kindFigures = Object.values(r.byKind).map((h) => h.sum);
    expect(entryFigures, "no entry holds a latency").toStrictEqual([3]);
    expect(kindFigures.reduce((a, b) => a + b, 0), "and no kind does either").toBe(3);

    p.dispose();
  });

  it("T1.67 (C28 I42): two entries holding a block with the same id are two rows, each with its own calls", () => {
    const { profiler: p, work } = stepping();

    // Two frames, so `frames` can be wrong in the way the merged form was: a
    // single frame makes the count and `frames` agree by construction and the
    // ratio says nothing.
    for (const _frame of [0, 1]) {
      p.beginFrame("input");
      for (const id of ["e1", "e2"]) {
        using _e = p.entry(id);
        using _b = p.element("table", "t1", "measure");
        work(1);
      }
      p.endFrame("frame");
    }

    const rows = p.report().nodes.filter((n) => n.key === "table#t1");

    expect(rows.map((n) => n.entry).sort(), "one row per entry").toStrictEqual(["e1", "e2"]);
    // **Both halves.** A repair that split the rows and left `frames` taken
    // across the pair passes a row asserting only the count, and the ratio is
    // the reading that misleads — 2 calls over 2 frames is 1, and the merged
    // form reported 4 over 2.
    expect(rows.map((n) => n.measures), "each keeps its own measures").toStrictEqual([2, 2]);
    expect(rows.map((n) => n.frames), "and its own frames").toStrictEqual([2, 2]);
    expect(
      rows.map((n) => n.measures / n.frames),
      "so nothing is measured twice per frame",
    ).toStrictEqual([1, 1]);

    p.dispose();
  });

  it("T1.68 (C28 I42): an element measured outside every entry scope is in nodes and byKind and in no entry, and the shortfall is that element", () => {
    const { profiler: p, work } = stepping();

    p.beginFrame("input");
    {
      using _e = p.entry("e1");
      using _b = p.element("table", "t1", "measure");
      work(2);
    }
    // The chrome: measured every frame, belonging to no entry.
    {
      using _c = p.element("pills", "chrome.header.left", "measure");
      work(5);
    }
    p.endFrame("frame");

    const r = p.report();
    const chrome = r.nodes.find((n) => n.key === "pills#chrome.header.left");

    expect(chrome?.entry, "no entry claims it").toBeUndefined();
    expect(r.byKind.pills?.sum, "the kind does").toBe(5);
    expect(Object.keys(r.byEntry), "and byEntry names only the entry").toStrictEqual(["e1"]);

    // **The shortfall is a reading, not a discrepancy** — and it is the chrome's
    // whole cost. A `byEntry` summing to `Σ nodes.self` would mean the chrome had
    // been filed under some entry, which is the wrong attribution rather than the
    // absent one.
    const nodeSelf = r.nodes.reduce((sum, n) => sum + n.self, 0);
    const entrySelf = Object.values(r.byEntry).reduce((sum, h) => sum + h.sum, 0);
    const kindSelf = Object.values(r.byKind).reduce((sum, h) => sum + h.sum, 0);
    expect(kindSelf, "byKind partitions the whole population").toBe(nodeSelf);
    expect(nodeSelf - entrySelf, "byEntry falls short by exactly the chrome").toBe(5);

    p.dispose();
  });

  it("T1.69 (C28 I42): an entry's histogram accumulates across frames while each element keeps its own row", () => {
    const { profiler: p, work } = stepping();

    for (const ms of [2, 3]) {
      p.beginFrame("input");
      using _e = p.entry("e1");
      using _b = p.element("table", "t1", "measure");
      work(ms);
      p.endFrame("frame");
    }

    const r = p.report();
    const row = r.nodes.find((n) => n.key === "table#t1");

    expect(r.byEntry.e1?.sum, "the entry totals both frames").toBe(5);
    expect(r.byEntry.e1?.count, "over two closes").toBe(2);
    expect(row?.self, "and the element's own row is the same work, not a second copy").toBe(5);
    expect(row?.measures, "counted once per close").toBe(2);

    p.dispose();
  });

  // **No caller nests an entry scope today**, and the row says so rather than
  // implying otherwise: the shell's loop opens one per entry and closes it
  // before the next, so a handle that cleared would be correct in the tree as it
  // stands. Kept for `SpanHandle`'s reason — closing through the saved value
  // rather than through *whatever was current* is what makes composition
  // correct — and because the failure it guards is the one that hides: an entry
  // losing its tail reads as a shortfall, and a shortfall reads as chrome.
  it("T1.70 (C28 I42): the entry scope restores rather than clears, so work after a nested scope is still the outer entry's", () => {
    const { profiler: p, work } = stepping();

    p.beginFrame("input");
    {
      using _outer = p.entry("e1");
      {
        using _inner = p.entry("e2");
        using _a = p.element("rule", "r1", "measure");
        work(1);
      }
      using _b = p.element("table", "t1", "measure");
      work(4);
    }
    p.endFrame("frame");

    const r = p.report();
    expect(r.byEntry.e2?.sum, "the nested scope takes its own").toBe(1);
    // **A clear would put this in no entry at all** — and a shortfall reads as
    // chrome, which is where the wrong answer hides (F892b).
    expect(r.byEntry.e1?.sum, "and the outer one resumes after it").toBe(4);

    p.dispose();
  });
});

describe("C28 I43 — leak counting, and the floor it cannot get under", () => {
  /**
   * A collector, supplied by the row rather than by the runner.
   *
   * **`--expose-gc` is not on the suite's command line and this row does not
   * ask for it.** A flag the runner supplies is a flag `npx vitest run <file>`
   * omits, and the row would then read zero finalised — which is a real reading
   * of a real registry and says nothing at all. Acquiring it here means the row
   * cannot silently stop measuring. `node:v8` is allowed in a test; C28 I21
   * scopes its ban to `src/`.
   */
  const collector = (): (() => void) => {
    setFlagsFromString("--expose-gc");
    return runInNewContext("gc") as () => void;
  };

  /**
   * Give the runtime turns to run the callbacks.
   *
   * **`setImmediate`, never `setTimeout`.** The suite fakes `setTimeout` (see
   * `vitest.config.ts`), so a drain written the obvious way runs synchronously,
   * finalisation callbacks never fire, and the row reads **0 finalised** —
   * a fixture defect indistinguishable from a registry that does not work.
   * Measured while writing this: 0 with `setTimeout`, 99 with `setImmediate`.
   */
  const drain = async (turns = 5): Promise<void> => {
    for (let i = 0; i < turns; i += 1) await new Promise((r) => setImmediate(r));
  };

  it("T1.71 (C28 I43): a thousand tracked, dropped and collected → 999 finalised, and the one that stays is the floor", async () => {
    const gc = collector();
    const p = createProfiler({ tier: "counters" }, { elapsed: () => 0 });

    let held: object[] = [];
    for (let i = 0; i < 1000; i += 1) {
      const o = { i };
      p.track("thing", o);
      held.push(o);
    }
    held = [];
    gc();
    await drain();

    const leaks = p.report().leaks;
    expect(leaks.thing?.created, "created is exact — it is a counter").toBe(1000);
    // **Asserted as 999 and not as a range**, because the residue is
    // deterministic: always the most recent registration, at N = 1, 2, 10, 100,
    // 1 000 and 5 000, over eight repeats, and further collections do not shrink
    // it. A row written `>= 990` would pass a registry that reported half.
    expect(leaks.thing?.finalised, "one short, and always the last registered").toBe(999);
    expect(leaks.thing?.live, "so `live` has a floor of one that no correct code removes").toBe(1);

    p.dispose();
  });

  it("T1.71b (C28 I43): the control — the same fixture without a collection reports nothing finalised", async () => {
    // **The arm above is only a measurement if this one is zero.** It says the
    // count follows reachability rather than registration, and it is what a
    // registry that fired on `register` would fail (F893).
    const p = createProfiler({ tier: "counters" }, { elapsed: () => 0 });

    let held: object[] = [];
    for (let i = 0; i < 1000; i += 1) {
      const o = { i };
      p.track("thing", o);
      held.push(o);
    }
    held = [];
    await drain();

    const leaks = p.report().leaks;
    expect(leaks.thing?.created, "all thousand were registered").toBe(1000);
    expect(leaks.thing?.finalised, "and none reported without a collection").toBe(0);

    p.dispose();
  });

  it("T1.72 (C28 I43): the floor is one object in the whole report, not one per class", async () => {
    const gc = collector();
    const p = createProfiler({ tier: "counters" }, { elapsed: () => 0 });

    let held: object[] = [];
    for (const name of ["alpha", "beta", "gamma"]) {
      for (let i = 0; i < 50; i += 1) {
        const o = { name, i };
        p.track(name, o);
        held.push(o);
      }
    }
    held = [];
    gc();
    await drain();

    const leaks = p.report().leaks;
    const finalised = Object.values(leaks).map((l) => l.finalised);
    // **The multiset, not the names.** Which class comes up short is
    // registration order, so a row naming `gamma` would be asserting an
    // accident — it is the last one registered and nothing more.
    expect([...finalised].sort((a, b) => a - b), "two whole, one short by one").toStrictEqual([49, 50, 50]);
    expect(finalised.reduce((a, b) => a + b, 0), "149 of 150 across the report").toBe(149);

    p.dispose();
  });

  it("T1.73 (C28 I43, C28 I1): at off nothing is armed, and nothing is retained", async () => {
    const gc = collector();

    // The lazy half, on the tracker itself: a registry built at construction
    // would make `off` cost a process-wide handle for a session that never
    // profiles, and nothing in a report could show it.
    const idle = new Leaks();
    expect(idle.armed, "no registry until something is tracked").toBe(false);
    idle.track("x", {});
    expect(idle.armed, "and one as soon as something is").toBe(true);

    // **The retention half, which is the one that matters.** A tracker holding
    // a strong reference to everything it watches is a leak inside the
    // instrument built to find leaks — and it would report `live: 0` for ever
    // while being the cause. Asserted through a registry of the row's own, so
    // the thing under test is not also the witness.
    const p = createProfiler({ tier: "off" }, { elapsed: () => 0 });
    let outside = 0;
    const witness = new FinalizationRegistry(() => { outside += 1; });
    let held: object[] = [];
    for (let i = 0; i < 1000; i += 1) {
      const o = { i };
      p.track("thing", o);
      witness.register(o, "thing");
      held.push(o);
    }
    held = [];
    gc();
    await drain();

    expect(p.report().leaks, "off counts nothing").toStrictEqual({});
    expect(outside, "and holds nothing — 999, the same floor the arm has").toBe(999);

    p.dispose();
  });
});

describe("C28 — the frame record, the ring, and the end of a profiler's life", () => {
  /** A profiler over a clock the caller advances. */
  const at = (
    tier: "off" | "counters" | "spans" | "alloc" | "deep",
    ring?: number,
  ): Readonly<{ p: ReturnType<typeof createProfiler>; set: (ms: number) => void }> => {
    let now = 0;
    return {
      p: createProfiler(
        { tier, ...(ring === undefined ? {} : { ring }) },
        { elapsed: () => now },
      ),
      set: (ms: number): void => void (now = ms),
    };
  };

  it("T1.3 (C28 I4): a frame is three members and none of them is the sum", () => {
    const { p, set } = at("spans");
    set(0);
    p.commit("input", false);
    set(97);
    p.beginFrame("input");
    set(100);
    p.endFrame("frame");

    const frame = p.report().worst[0];
    expect(frame?.work, "rendering, which is the framework's efficiency").toBe(3);
    expect(frame?.wait, "and the coalescing window, which is its policy").toBe(97);
    // **No member equals 100**, asserted over every numeric field rather than
    // against a named one: the defect is a `total` reappearing under *some*
    // name, and a row naming `total` cannot see it come back as `elapsed`.
    const numbers = Object.entries(frame ?? {}).filter(([, v]) => typeof v === "number");
    expect(numbers.map(([k]) => k).filter((k) => (frame as unknown as Record<string, number>)[k] === 100))
      .toStrictEqual([]);

    p.dispose();
  });

  it("T1.4 (C28 I5): the wait is measured from the earliest commit still unserved, not the latest", () => {
    const { p, set } = at("spans");
    set(0);
    p.commit("input", false); // the one a reader has been waiting on
    set(90);
    p.commit("stream", false); // and a later one, coalesced into the same frame
    set(100);
    p.beginFrame("input");
    p.endFrame("frame");

    // **100, not 10.** Taking the latest reports how long the *last* cause
    // waited, which is near zero on a busy stream and says the session is
    // responsive while the first keystroke is still on screen unanswered.
    expect(p.report().worst[0]?.wait).toBe(100);

    p.dispose();
  });

  it("T1.5 (C28 I11): below `spans` the report omits the keys rather than zeroing them", () => {
    const { p } = at("counters");
    p.count("thing");
    p.beginFrame("input");
    p.endFrame("frame");

    const r = p.report();
    // **`in`, not a truthiness or an emptiness check.** A zeroed histogram is
    // falsy in none of the ways a reader tests, and `spans: {}` reads as
    // *measured, and nothing took time* — which is the false statement the
    // omission exists to avoid.
    expect("spans" in r, "no spans key at all").toBe(false);
    expect("latency" in r, "and no latency key").toBe(false);
    expect(r.counters.thing, "while what this tier does record is there").toBe(1);

    p.dispose();
  });

  it("T1.6 (C28 I6): a fallback frame is counted and kept out of the durations", () => {
    const { p, set } = at("spans");
    set(0);
    p.beginFrame("input");
    {
      using _s = p.span("compose");
      set(50);
    }
    p.endFrame("fallback");

    set(60);
    p.beginFrame("input");
    set(63);
    p.endFrame("frame");

    const r = p.report();
    expect(r.excluded.fallback, "the composition that failed is counted").toBe(1);
    // **And absent from the durations**, which is the half that matters: a
    // fallback is a frame that did not happen, and folding its cost into the
    // work histogram makes the p95 a statement about failures.
    expect(r.worst.map((f) => f.work), "only the frame that drew").toStrictEqual([3]);
    expect(r.latency?.work.count, "one frame in the histogram, not two").toBe(1);

    p.dispose();
  });

  it("T1.7 (C28 I7): a container is charged its own time and the tree keeps the whole", () => {
    const { p, set } = at("spans");
    set(0);
    p.beginFrame("input");
    {
      using _parent = p.element("group", "outer", "measure");
      set(2);
      // Three children of three each: the parent's own five is what is left
      // when they are taken out, and the three must differ from it or a row
      // asserting `self` cannot tell subtraction from a coincidence.
      for (const [id, closesAt] of [["a", 5], ["b", 8], ["c", 11]] as const) {
        using _child = p.element("raw", id, "measure");
        set(closesAt);
      }
      set(14);
    }
    p.endFrame("frame");

    const nodes = p.report().nodes;
    const parent = nodes.find((n) => n.key === "group#outer");
    const children = nodes.filter((n) => n.key.startsWith("raw#"));

    // **Self at the container, so `Σ nodes.self` is the frame's real cost.** An
    // inclusive parent repeats every child and the widest bar is always the
    // outermost one, which tells a reader nothing.
    expect(parent?.total, "the whole, from open to close").toBe(14);
    expect(children.reduce((n, c) => n + c.self, 0), "the children's own").toBe(9);
    expect(parent?.self, "and the parent keeps only what it did itself").toBe(5);

    p.dispose();
  });

  it("T1.9 (C28 I9): a ring of eight given twenty frames holds eight and reports twelve dropped, separately", () => {
    const { p, set } = at("spans", 8);
    for (let i = 0; i < 20; i += 1) {
      set(i * 10);
      p.beginFrame("input");
      set(i * 10 + 1);
      p.endFrame("frame");
    }

    const r = p.report();
    // **Two assertions, never a total.** *Seen* is satisfied by redistribution:
    // held and dropped can both be wrong in opposite directions and the sum
    // still reads correct.
    expect(r.timeline.length, "the bound is the bound").toBe(8);
    expect(r.dropped.frames, "and what it discarded is counted, not derived").toBe(12);
    // The oldest went, not the newest: a ring that dropped the tail would hold
    // eight records and describe the start of a session nobody is asking about.
    expect(r.timeline.map((f) => f.seq), "the last eight").toStrictEqual([13, 14, 15, 16, 17, 18, 19, 20]);

    p.dispose();
  });

  it("T1.12 (C28 I18): raising the tier empties the ring and the report names where", () => {
    const { p, set } = at("spans");
    for (let i = 0; i < 3; i += 1) {
      set(i * 10);
      p.beginFrame("input");
      set(i * 10 + 4);
      p.endFrame("frame");
    }
    expect(p.report().timeline.length, "three frames at `spans`").toBe(3);

    set(500);
    p.setTier("alloc");

    const r = p.report();
    // Histograms from two tiers must never merge: a `spans` frame and an
    // `alloc` frame are not measurements of the same thing, and a p95 across
    // the boundary is a number describing neither.
    expect(r.timeline, "the ring is empty").toStrictEqual([]);
    expect(r.regime.ringReset, "and the report says when it was emptied").toBe(500);
    expect(r.regime.tier, "at the tier now in force").toBe("alloc");

    p.dispose();
  });

  it("T1.13 (C28 I20): a mark is on the session timeline and inside no frame", () => {
    const { p, set } = at("spans");
    set(0);
    p.beginFrame("input");
    {
      using _a = p.span("compose");
      set(5);
    }
    set(7);
    p.mark("halfway");
    {
      using _b = p.span("paint");
      set(9);
    }
    p.endFrame("frame");

    const r = p.report();
    expect(r.marks, "an instant, at the time it happened").toStrictEqual([{ at: 7, label: "halfway" }]);
    // **And in no `FrameRecord`.** A mark folded into a frame's spans becomes a
    // phase with no duration, which every table then divides by something.
    const frame = r.worst[0];
    expect(Object.keys(frame?.spans ?? {}), "the frame holds spans and nothing else").toStrictEqual([
      "compose",
      "paint",
    ]);

    p.dispose();
  });

  it("T1.14 (C28 I22): after dispose everything is a no-op, twice is a no-op, and capture says why", async () => {
    const { p, set } = at("deep");
    set(0);
    p.beginFrame("input");
    set(3);
    p.endFrame("frame");
    const before = p.report();

    p.dispose();
    p.dispose(); // idempotent — a second close must not throw or double-release

    // Every recording operation, after the fact.
    {
      using _s = p.span("compose");
      set(99);
    }
    p.count("thing");
    p.mark("later");
    p.track("thing", {});
    p.beginFrame("input");
    p.endFrame("frame");

    const after = p.report();
    expect(after.frames, "no frame was added").toBe(before.frames);
    expect(after.counters.thing, "no counter appeared").toBeUndefined();
    expect(after.marks, "no mark was recorded").toStrictEqual([]);
    expect(after.leaks, "and nothing was tracked").toStrictEqual({});

    // **`capture` throws where the rest are silent, and the difference is the
    // point**: a no-op capture returns no path, and a caller awaiting a file
    // would wait for one that was never going to arrive.
    await expect(p.capture("cpu")).rejects.toThrow(/dispose/u);
  });
});

describe("C28 I1 — at `off`, nothing is armed and nothing accumulates", () => {
  it("T1.1 (C28 I1): a write, a measure and a span at `off` arm no sampler, register nothing, and leave the ring empty", () => {
    // **Two levels, and this row is the lower one.** At the session level `off`
    // means no profiler object exists at all — `isRecording` is the gate and
    // T1.59 is the row, through a callback that never fires. Here the recorder
    // is built directly and asked to work, which is the case a caller reaches
    // by asking for `off` explicitly: nothing may accumulate, and nothing that
    // outlives the call may be armed.
    let scheduled = 0;
    const p = createProfiler(
      { tier: "off" },
      {
        elapsed: () => 0,
        schedule: (_fn, _ms) => {
          scheduled += 1;
          return { [Symbol.dispose]: () => undefined };
        },
      },
    );

    p.count("bytes.written", 480);
    p.gauge("series.length", 200);
    {
      using _s = p.span("compose");
    }
    {
      using _e = p.element("table", "t1", "measure");
    }
    p.beginFrame("input");
    p.endFrame("frame");
    p.mark("here");

    // **The sampler is the process-wide handle.** `monitorEventLoopDelay` and a
    // `PerformanceObserver` outlive every frame, and a profiler that armed them
    // at `off` would be the leak it exists to find (C28 I21's neighbourhood).
    expect(scheduled, "no sampler was armed").toBe(0);

    const r = p.report();
    expect(r.timeline, "and the ring holds nothing").toStrictEqual([]);
    expect(r.frames, "no frame was counted").toBe(0);
    expect(r.nodes, "no element was attributed").toStrictEqual([]);
    expect(r.counters, "and no counter recorded").toStrictEqual({});
    expect(r.marks).toStrictEqual([]);
    expect(r.leaks, "nothing registered — T1.73 has the retention half").toStrictEqual({});
    expect("spans" in r, "with the keys omitted rather than zeroed").toBe(false);

    // **The control.** Every assertion above is satisfied by a recorder that
    // does nothing at any tier, and that is a defect this file has met before
    // (F869: a tier named `counters` at which no counter could fire). The same
    // calls at `counters` must move the same numbers.
    const on = createProfiler({ tier: "counters" }, { elapsed: () => 0 });
    on.count("bytes.written", 480);
    on.beginFrame("input");
    on.endFrame("frame");
    on.mark("here");
    const live = on.report();
    expect(live.counters["bytes.written"], "the same calls record at `counters`").toBe(480);
    expect(live.frames, "and a frame is counted").toBe(1);
    expect(live.marks.length, "and a mark is kept").toBe(1);

    p.dispose();
    on.dispose();
  });
});

describe("C28 I53 — the sampler's stamp is off the recorded channel", () => {
  /** A probe that echoes the stamp it was handed, so the axis is observable. */
  const echoing = (): ResourceProbe => ({
    sample: (suspended, at) => ({ at, suspended }) as unknown as ResourceSample,
    spaces: () => [],
    dispose: () => undefined,
  });

  it("T1.102 (C28 I53): a tick reads `sampleClock` and not the recorded `elapsed`; with no `sampleClock` it reads `elapsed`, and the recording sees every tick", () => {
    // **A periodic reader cannot sit on a positional channel** (F971). Measured
    // live against replay with every mono read tagged by its caller: every
    // reader agreed to the count except the resource probe's stamp — 2 against
    // 0 over a three-second session, 5 against 0 over a six-second one — and
    // even at equal counts the tick lands between two of the session's reads
    // at a position a replay cannot reproduce. So the stamp comes from a clock
    // the recording never wraps, and this row drives the real tap rather than a
    // counter standing in for it.
    const lines: string[] = [];
    const rec = createRecording((line) => void lines.push(line));
    let reads = 0;
    const elapsed = rec.mono(() => (reads += 1) * 1.5);
    let stamps = 0;
    const sampleClock = (): number => 1_000 + (stamps += 1);
    let tick: (() => void) | null = null;
    const hold = (fn: () => void): Disposable => {
      tick = fn;
      return { [Symbol.dispose]: () => void (tick = null) };
    };
    const fire = (): void => {
      const fn = tick;
      if (fn === null) throw new Error("the sampler is not armed");
      fn();
    };

    const p = createProfiler({ tier: "spans" }, { elapsed, sampleClock, probe: echoing(), schedule: hold });
    // Construction is on the recorded channel and deterministic: the 2 002
    // reads of the clock-cost measurement and the start stamp — equal on both
    // sides of a replay, and stated so the figure below is the ticks' alone.
    const atConstruction = reads;
    expect(atConstruction, "the cost measurement and the start stamp").toBe(2_003);

    fire();
    fire();
    fire();
    expect(reads - atConstruction, "three ticks, and not one read on the recorded clock").toBe(0);
    expect(p.report().samples.map((x) => x.at), "each sample stamped from the sampler's own clock").toEqual([
      1_001, 1_002, 1_003,
    ]);
    p.dispose();
    rec.end();
    expect(parseRecording(lines.join("")).mono.length, "the recording holds exactly what the tap saw").toBe(reads);

    // **The control: the state the tree was in.** With no sampler clock the
    // tick stamps from `elapsed`, one recorded read per tick — so the row above
    // is shown to be able to see the channel, and the default for a profiler
    // built without a recording is still the spans' own axis.
    const bareLines: string[] = [];
    const bare = createRecording((line) => void bareLines.push(line));
    let bareReads = 0;
    const bareElapsed = bare.mono(() => (bareReads += 1) * 1.5);
    const q = createProfiler({ tier: "spans" }, { elapsed: bareElapsed, probe: echoing(), schedule: hold });
    const built = bareReads;
    fire();
    fire();
    expect(bareReads - built, "the control: two ticks, two recorded reads").toBe(2);
    expect(q.report().samples.map((x) => x.at), "stamped from `elapsed` itself").toEqual([
      (built + 1) * 1.5,
      (built + 2) * 1.5,
    ]);
    q.dispose();
    bare.end();
    expect(parseRecording(bareLines.join("")).mono.length, "and the recording carries them").toBe(bareReads);
  });
});
