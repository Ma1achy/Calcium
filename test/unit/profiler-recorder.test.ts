// C28 I3 — a span records the time that passes *inside* it.
//
// **This file exists because a mutation survived.** `OVERLAYS-BESIDE` moved a
// span so it closed before the call it names, and nothing in the suite failed.
// The row that was supposed to catch it — T1.61's residue clause — reads the
// recorded sums under `buildSession`'s injected clock, and that clock is a
// counter: `() => (t += 1)`, advancing once per *read*. Under it every leaf span
// records exactly 1, whether it wraps a millisecond of work or nothing at all.
// Measured, on the session T1.61 builds: `overlays` count 6, sum 6, max 1.
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
        using _a = p.element("table", "t1");
        work(2);
      }
      {
        using _b = p.element("rule", "r1");
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
    // single frame makes `calls` and `frames` agree by construction and the
    // ratio says nothing.
    for (const _frame of [0, 1]) {
      p.beginFrame("input");
      for (const id of ["e1", "e2"]) {
        using _e = p.entry(id);
        using _b = p.element("table", "t1");
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
    expect(rows.map((n) => n.calls), "each keeps its own calls").toStrictEqual([2, 2]);
    expect(rows.map((n) => n.frames), "and its own frames").toStrictEqual([2, 2]);
    expect(rows.map((n) => n.calls / n.frames), "so nothing is measured twice per frame").toStrictEqual([1, 1]);

    p.dispose();
  });

  it("T1.68 (C28 I42): an element measured outside every entry scope is in nodes and byKind and in no entry, and the shortfall is that element", () => {
    const { profiler: p, work } = stepping();

    p.beginFrame("input");
    {
      using _e = p.entry("e1");
      using _b = p.element("table", "t1");
      work(2);
    }
    // The chrome: measured every frame, belonging to no entry.
    {
      using _c = p.element("pills", "chrome.header.left");
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
      using _b = p.element("table", "t1");
      work(ms);
      p.endFrame("frame");
    }

    const r = p.report();
    const row = r.nodes.find((n) => n.key === "table#t1");

    expect(r.byEntry.e1?.sum, "the entry totals both frames").toBe(5);
    expect(r.byEntry.e1?.count, "over two closes").toBe(2);
    expect(row?.self, "and the element's own row is the same work, not a second copy").toBe(5);
    expect(row?.calls, "counted once per close").toBe(2);

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
        using _a = p.element("rule", "r1");
        work(1);
      }
      using _b = p.element("table", "t1");
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
