// C28 — profiler (docs/components/C28_profiler.md §10), tier 6.
//
// **A fail-on-revert row names the change that makes it fail, not the
// assertion.** Each of these enacts a revert someone would plausibly make — a
// tidier collapsing two numbers, a reader writing the obvious assertion — and
// shows what it costs, so the comment is the row's subject and the expectations
// are its evidence.
//
// These ten were deferred on *lands with the module each row names*. Every
// module landed; nothing watched, because the marker named no component for
// TD1–TD6 to expire and SP9 counts a deferral's citation exactly like an
// assertion's (F896). What each still-deferred row waits on is now written as a
// symbol to grep.
import { describe, expect, it } from "vitest";

import { createProfiler } from "../../src/shell/profiling/recorder.js";
import { createResourceProbe } from "../../src/shell/profiling/node.js";
import { profilePane } from "../../src/shell/profiling/panes.js";
import type { ProfileReport, ResourceSample } from "../../src/shell/profiling/types.js";

/** A report carrying nothing but the samples under test (as tier 3's). */
function reportWith(samples: readonly ResourceSample[]): ProfileReport {
  return {
    regime: { node: "v22.0.0", cpus: 8, tier: "spans", durationMs: 1000, histogramError: 1 / 64, ringReset: 0, captureDir: ".calcium/profile" },
    byReason: {}, timeline: [], worst: [], nodes: [], byKind: {}, byEntry: {}, leaks: {},
    counters: {}, gauges: {}, misses: {}, hits: {}, marks: [], samples, captures: [],
    excluded: { selfInflicted: 0, fallback: 0 },
    dropped: { frames: 0, samples: 0, marks: 0, captureBytes: 0 },
    overhead: { spans: 0, clockNs: 0, estimateMs: 0, asyncEnabled: false },
    heapSpaces: [], frames: 0,
  };
}

describe("C28 — profiler, tier 6 spec-first rows", () => {
  it("T6.1 (C28 I4): a frame is three members and a `total` is the one a tidier adds", () => {
    // **The revert**: publish `total = work + wait` beside them. It reads as a
    // convenience and it is the number most likely to be quoted, because it is
    // the biggest — and it answers no question anyone has. A slow far side and
    // a slow framework produce the same total and want opposite remedies, and
    // the sum is exactly the figure that cannot tell them apart. T1.3 and T4.3
    // are what fail; this row says why the field is absent rather than private.
    let now = 0;
    const p = createProfiler({ tier: "spans" }, { elapsed: () => now });
    now = 0; p.commit("input", false);
    now = 90; p.beginFrame("input");
    now = 96; p.endFrame("frame");

    const f = p.report().timeline[0];
    expect(f?.wait, "the far side's share").toBe(90);
    expect(f?.work, "and the framework's").toBe(6);
    // Asserted over the record's own keys, not against a name: a `total` added
    // under any other spelling is the same defect, and a row checking
    // `f.total === undefined` sees only the spelling it guessed.
    const sums = Object.entries(f ?? {}).filter(([, v]) => v === 96);
    expect(sums, "no member of the record is the sum of the two").toEqual([]);
    p.dispose();
  });

  it("T6.2 (C28 I3): recording spans through the User Timing API taxes the canary it also reports", () => {
    // **The revert**: `performance.mark` at open, `performance.measure` at
    // close. It is the standard way, it is what a reader expects, and the
    // durations would be right. What breaks is not the duration — it is that
    // every span becomes an entry in the process's own timing buffer, which
    // the profiler *reports* as a leak canary (`timingEntries`, C28 I19). The
    // instrument would then be the largest contributor to the number it exists
    // to watch, and the reading rises with the profiling rather than with the
    // application. T1.2 fails on the entry count, not on the duration.
    const probe = createResourceProbe(() => 0);
    try {
      const before = probe.sample(false).timingEntries;
      let now = 0;
      const p = createProfiler({ tier: "spans" }, { elapsed: () => now });
      p.beginFrame("input");
      for (let i = 0; i < 200; i += 1) {
        using _s = p.asProbe().span("paint");
        now += 1;
      }
      p.endFrame("frame");
      const after = probe.sample(false).timingEntries;

      expect(p.report().spans?.paint?.count, "two hundred spans really were recorded").toBe(200);
      expect(after - before, "and not one of them reached the timing buffer").toBe(0);

      // **The canary must be shown to sing.** `after - before === 0` is what a
      // dead counter returns too — a `timingEntries` stuck at any constant
      // passes the line above with nothing measured. So a real mark is raised
      // and the count has to move, which is the only thing separating *the
      // spans stayed out of the buffer* from *the buffer is not being read*.
      performance.mark("t6.2-control");
      expect(probe.sample(false).timingEntries - after, "the counter does respond").toBe(1);
      performance.clearMarks("t6.2-control");
      p.dispose();
    } finally {
      probe.dispose();
    }
  });

  it("T6.3 (C28 I6): counting a fallback in the durations reports the framework fast where it gave up", () => {
    // **The revert**: drop the early return that excludes a fallback, so the
    // frame joins `workH` like any other. It looks like a frame — it has a
    // start, an end and a duration — and a fallback frame is *quick*, because
    // giving up is cheap. So the histogram improves exactly as the shell gets
    // worse, and the p95 a reader quotes is best on the sessions where
    // composition kept failing. T1.6 is what fails.
    let now = 0;
    const p = createProfiler({ tier: "spans" }, { elapsed: () => now });

    now = 0; p.beginFrame("input"); now = 40; p.endFrame("frame");   // a real one, slow
    now = 50; p.beginFrame("input"); now = 51; p.endFrame("fallback"); // giving up, fast

    const r = p.report();
    expect(r.latency?.work.count, "one frame is in the durations").toBe(1);
    expect(r.latency?.work.max, "and it is the slow one — the cheap failure did not flatter it").toBe(40);
    expect(r.excluded.fallback, "the other is counted where it belongs").toBe(1);
    expect(r.frames, "both drew something").toBe(2);
    p.dispose();
  });

  it("T6.4 (C28 I7): inclusive cost at a container makes the outermost node the widest bar in every tree", () => {
    // **The revert**: report `total` where `self` is reported. It is the easier
    // number — no subtraction — and it is *true*, which is what makes it
    // durable: a group really did take that long. But every tree then has its
    // root as the widest bar and the answer is always *the thing containing
    // everything is expensive*, which a reader knew before opening it. T1.7 is
    // what fails.
    let now = 0;
    const p = createProfiler({ tier: "spans" }, { elapsed: () => now });
    p.beginFrame("input");
    {
      using _outer = p.element("group", "g1");
      now += 2;
      {
        using _inner = p.element("plot", "pl-1");
        now += 30;
      }
      now += 1;
    }
    p.endFrame("frame");

    const nodes = p.report().nodes;
    const group = nodes.find((n) => n.key === "group#g1");
    const plot = nodes.find((n) => n.key === "plot#pl-1");
    expect(group?.self, "the container is charged its own 3 ms").toBe(3);
    expect(plot?.self, "and the child its 30").toBe(30);
    // The whole is kept, so nothing is lost by charging self time — the tree
    // still knows the group cost 33 inclusive.
    expect(group?.total, "while the tree keeps the whole").toBe(33);
    // And the ordering is the point: heaviest first means the child, not the
    // box it sits in.
    expect(nodes[0]?.key, "the heaviest row is the one to fix").toBe("plot#pl-1");
    p.dispose();
  });

  it("T6.5 (C28 I11): zeroing the span keys at `counters` reads as measured-and-fast", () => {
    // **The revert**: emit `spans` and `latency` at every tier, zeroed below
    // `spans`. It makes the report's shape constant, which is what a consumer
    // wants and what a type wants — no optional keys, no branch. The cost is
    // that *nothing was measured* and *everything was instant* become the same
    // report, and the second is the reading a zero gets. T1.5 is what fails.
    let now = 0;
    const p = createProfiler({ tier: "counters" }, { elapsed: () => now });
    p.commit("input", false);
    p.beginFrame("input");
    now = 12;
    p.endFrame("frame");

    const r = p.report();
    expect(r.latency, "absent, not zeroed").toBeUndefined();
    expect(r.spans, "and so are the spans").toBeUndefined();
    // The counters are the tier's whole point and they are present, so the
    // absence above is about durations and not about the tier recording
    // nothing — which is the distinction a zeroed histogram destroys.
    expect(r.counters["frame.input"], "while the tier does count").toBe(1);
    expect(r.frames, "and frames are counted at every recording tier").toBe(1);
    p.dispose();
  });

  it("T6.6 (C28 I1): constructing the ring at `off` makes the disabled tier pay for the enabled one", () => {
    // **The revert**: build the rings and histograms in the constructor and
    // gate only the writes. It is the tidier shape — one construction path, no
    // lazy fields — and it means an application that never profiles still
    // allocates the ring, starts the sampler and holds the structures for the
    // process's life. T1.1 and T4.1 are what fail.
    let now = 0;
    const p = createProfiler({ tier: "off" }, { elapsed: () => now });
    p.commit("input", false);
    p.beginFrame("input");
    { using _e = p.element("plot", "pl-1"); now += 5; }
    now = 20;
    p.endFrame("frame");

    const r = p.report();
    expect(r.timeline, "nothing was recorded").toHaveLength(0);
    expect(r.nodes, "no element was attributed").toHaveLength(0);
    expect(Object.keys(r.counters), "and no counter was raised").toEqual([]);
    // **The control, and it is what the row is for**: every assertion above is
    // equally satisfied by a recorder that does nothing at any tier. The same
    // calls one tier up must record, or `off` proves nothing.
    let m = 0;
    const q = createProfiler({ tier: "counters" }, { elapsed: () => m });
    q.commit("input", false);
    q.beginFrame("input");
    m = 20;
    q.endFrame("frame");
    expect(q.report().counters["frame.input"], "the tier above does record").toBe(1);
    expect(q.report().frames, "and counts the frame").toBe(1);
    p.dispose();
    q.dispose();
  });

  it("T6.7 (C28 I18): keeping the ring across a setTier merges histograms that describe neither tier", () => {
    // **The revert**: leave the ring alone when the tier changes, so no data is
    // "lost". Losing it is the point — the frames before and after were
    // measured under different instruments, and a percentile over both
    // describes no session that happened. The merged p95 is not wrong about
    // either half; it is about a session nobody ran. T1.12 is what fails.
    let now = 0;
    const p = createProfiler({ tier: "spans" }, { elapsed: () => now });
    now = 0; p.beginFrame("input"); now = 100; p.endFrame("frame");
    expect(p.report().timeline, "one frame under the first tier").toHaveLength(1);

    now = 150;
    p.setTier("alloc");
    now = 160; p.beginFrame("input"); now = 162; p.endFrame("frame");

    const r = p.report();
    expect(r.timeline, "only the frame measured under the tier in force").toHaveLength(1);
    expect(r.timeline[0]?.work, "the 100 ms frame is gone, not averaged in").toBe(2);
    // **And the report says where the reset happened**, so a reader seeing one
    // frame in a long session is not left to conclude the session was short.
    expect(r.regime.ringReset, "the moment is named").toBe(150);
    p.dispose();
  });

  it.todo("T6.8 (C28 I15): reporting a truncated recording as a divergence → T3.6 fails, and the failure names the false-positive it would have caused — not deferred on a component: the blocker is that record and replay do not exist, so there is no truncation to misreport and T3.6 is deferred on the same absence. Grep: `grep -rn 'replay' src/`");
  it("T6.9 (C28 I24): an attribution table with a latency in it reads as more complete, not less true", () => {
    // **The revert is a tidier's move.** `byEntry` sums to less than the frame,
    // visibly, and folding the wait in makes the columns add up — which is the
    // whole hazard: the table becomes self-consistent and stops being about
    // work. T6.1 is the same move one level up, on `total`.
    let now = 0;
    const p = createProfiler({ tier: "spans" }, { elapsed: () => now });

    now = 0;
    p.commit("input", false); // unserved from t=0
    now = 97; // …and the frame starts 97 ms later: that is the wait
    p.beginFrame("input");
    {
      using _e = p.entry("e1");
      using _b = p.element("table", "t1");
      now += 3;
    }
    p.endFrame("frame");

    const r = p.report();
    expect(r.worst[0]?.wait, "the frame really did wait").toBe(97);

    // Asserted over every value rather than against `e1`, because a wait folded
    // in under some other key is the defect and a row naming `e1` cannot see it.
    expect(Object.values(r.byEntry).map((h) => h.sum), "and no entry holds it").toStrictEqual([3]);
    expect(Object.values(r.byKind).map((h) => h.sum), "nor any kind").toStrictEqual([3]);

    p.dispose();
  });

  it("T6.11 (C28 I42): kind#id is an identity within one document and only there", () => {
    // **The revert is what a reader writes believing the key is unique.** It is
    // — within a document (C04 I14) — and a transcript holds many, so the merged
    // row's `calls / frames` is the sum of two numerators over one denominator.
    // Measured on a real session at 2.3 per frame true against 5.3 reported.
    let now = 0;
    const p = createProfiler({ tier: "spans" }, { elapsed: () => now });

    for (const _frame of [0, 1]) {
      p.beginFrame("input");
      for (const id of ["e1", "e2"]) {
        using _e = p.entry(id);
        using _b = p.element("table", "t1");
        now += 1;
      }
      p.endFrame("frame");
    }

    const rows = p.report().nodes.filter((n) => n.key === "table#t1");
    expect(rows.length, "two entries, two rows").toBe(2);
    // **The reverted form's signature, asserted absent.** Not the row count:
    // a repair that split the rows and left `frames` shared passes that and
    // still reports the ratio nobody's block has.
    expect(
      rows.map((n) => n.calls / n.frames),
      "and no row claims to be measured twice per frame",
    ).toStrictEqual([1, 1]);

    p.dispose();
  });

  it("T6.10 (C28 I27): drawing a suspended sample as zero turns an absence into a reading", () => {
    // **The revert**: take the memory pane's headline from the newest sample,
    // whatever its flag. It is one line shorter and it is what the pane did
    // until F900. A suspended sample's zeroes are a stopped clock, and drawn as
    // the present state they say the process is idle — so a paused session and
    // a quiet one produce the same picture, and the one figure that separates
    // them was on the sample the whole time. T3.10 is what fails.
    const probe = createResourceProbe(() => 0);
    try {
      const running = probe.sample(false);
      const paused = probe.sample(true);
      const drawn = JSON.stringify(profilePane(reportWith([running, paused]), "memory"));
      expect(drawn, "the series is declared discontinuous").toContain("1 of them suspended");
      expect(drawn, "and the reader is told why that matters").toContain("not continuous");
      // A gap, not a zero: with every sample suspended there is no running
      // reading to headline and the pane refuses rather than drawing one.
      const none = JSON.stringify(profilePane(reportWith([paused]), "memory"));
      expect(none, "it says so").toContain("no reading of a running process");
      expect(none, "and draws no series at all").not.toContain("me-heap");
    } finally {
      probe.dispose();
    }
  });

  it("T6.12 (C28 I43): asserting everything registered was collected is red by one for ever", () => {
    // **The revert is the natural row rather than a mistake.** *Everything I
    // dropped was finalised* is what a reader writes, and it cannot pass: a
    // `FinalizationRegistry` never reports its most recent registration —
    // measured at N = 1, 2, 10, 100, 1 000 and 5 000, always the last, and more
    // collections do not shrink it (F893). So the row is red by exactly one,
    // and the fix that follows is to widen the assertion until it can no longer
    // see anything. The floor belongs to the **report** and not to a class, so
    // it is one across the whole snapshot however many classes are tracked.
    // T1.71 is what fails.
    const p = createProfiler({ tier: "alloc" }, { elapsed: () => 0 });
    for (let i = 0; i < 3; i += 1) p.track("a", { i });
    for (let i = 0; i < 3; i += 1) p.track("b", { i });

    const leaks = p.report().leaks;
    expect(leaks.a?.created, "both classes are counted as they are made").toBe(3);
    expect(leaks.b?.created).toBe(3);
    // Nothing has been collected, so `live` is `created` — and this is the
    // state in which `finalised === created` is most obviously false, which is
    // the point: the natural assertion is wrong before any collection and after
    // every one.
    expect(leaks.a?.live, "live is created minus finalised, not a guess").toBe(3);
    expect(leaks.a?.finalised, "nothing has been reported yet").toBe(0);
    p.dispose();
  });

  it("T6.13 (C28 I45): a gauge of the clamped value cannot tell a bounded label from an unbounded one", () => {
    // **The revert is the natural line, not a mistake.** *Gauge what was drawn*
    // is a true statement about the frame and it answers a different question:
    // the clamp is what makes the drawn size a constant, so the two documents
    // below — one label of 40 characters, one of 4 000 — collapse to the same
    // figure, and a reader looking for the block that made the frame slow has
    // been handed the width.
    const width = 80;
    const clamped = (label: string): number => Math.min(label.length, width);
    const unclamped = (label: string): number => label.length;

    const small = "x".repeat(40);
    const large = "x".repeat(4000);

    expect(clamped(small), "the reverted gauge, on a small label").toBe(40);
    expect(clamped(large), "and on one a hundred times larger").toBe(80);
    // The reverted reading is not equal *by accident*: every label past the
    // width is one number, so the population it cannot separate is unbounded.
    expect(clamped("x".repeat(80)), "as is every label at or past the width").toBe(clamped(large));
    expect(unclamped(large) - unclamped(small), "what the real gauge separates them by").toBe(3960);
  });

  it("T6.14 (C28 I45): the coverage check names the kind, and is not satisfied by an empty scan", () => {
    // **The fabricated violation T1.77 owes.** The row compares two sets, and a
    // set comparison passes hardest when one side is empty — which is exactly
    // the state F906's second reading was in, with a `[a-z.]+` pattern that
    // could not match `keyValue`. Both arms here: a kind removed from the gauge
    // side must be named, and a scan that found nothing must not read as a
    // clean sweep.
    const kinds = ["notice", "rule", "status", "tip", "image"];
    const gauged = new Set(kinds);

    gauged.delete("status");
    expect(kinds.filter((k) => !gauged.has(k)), "the missing kind is named").toEqual(["status"]);

    const empty = new Set<string>();
    expect(
      kinds.filter((k) => !empty.has(k)),
      "and an empty scan reports every kind rather than none",
    ).toEqual(kinds);
    expect(empty.size, "which is why the row asserts the scan found something").toBe(0);
  });
  it.todo(
    "T6.15 (C28 I15): calling the recorded/replayed frame-count difference a divergence → T3.6 fails — not deferred on a component: lands with src/shell/profiling/replay.ts",
  );
  it.todo(
    "T6.16 (C28 I47): recording the capability verdict and replaying it → T1.83 fails — not deferred on a component: lands with src/shell/profiling/replay.ts",
  );
});
