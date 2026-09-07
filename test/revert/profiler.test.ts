// C28 — profiler (docs/components/C28_profiler.md §10), tier 6.
//
// Spec-first rows. C28's spec landed alone, ahead of its code, so every
// invariant it declares is named here and nowhere else yet — SP9 is what makes
// that a requirement rather than a courtesy: an invariant no row names is a
// claim nothing was written against, and it reads exactly like one that is
// satisfied.
//
// Each row carries the explicit no-blocker marker rather than a "waits on C28"
// clause, and that is TD3's ruling rather than an omission: COMPONENT_SOURCES
// may not name a path before the path exists, because a missing path reads as
// "not implemented" forever and silently exempts every deferral pointing at it.
// C28 gains its entry on the commit that makes src/shell/profiling/recorder.ts
// real, and from then on these expire the way every other deferral does.
//
// Generated from the spec's own §10 rows, so the two cannot drift apart by
// transcription; a row edited here and not there is a diff a reader can see.
import { describe, expect, it } from "vitest";

import { createProfiler } from "../../src/shell/profiling/recorder.js";

describe("C28 — profiler, tier 6 spec-first rows", () => {
  it.todo("T6.1 (C28 I4): summing wait into work → T1.3 and T4.3 fail. The number most likely to be helpfully collapsed by someone tidying a table, which is why it has a row rather than a paragraph — not deferred on a component: lands with the module each row names");
  it.todo("T6.2 (C28 I3): recording a span with performance.measure → T1.2 fails on the entry count, not on the duration — not deferred on a component: lands with the module each row names");
  it.todo("T6.3 (C28 I6): counting a fallback frame in the durations → T1.6 fails — not deferred on a component: lands with the module each row names");
  it.todo("T6.4 (C28 I7): reporting inclusive cost at a container → T1.7 fails — not deferred on a component: lands with the module each row names");
  it.todo("T6.5 (C28 I11): zeroing spans at counters instead of omitting it → T1.5 fails — not deferred on a component: lands with the module each row names");
  it.todo("T6.6 (C28 I1): constructing the ring at off → T1.1 and T4.1 fail — not deferred on a component: lands with the module each row names");
  it.todo("T6.7 (C28 I18): merging the ring across a setTier → T1.12 fails — not deferred on a component: lands with the module each row names");
  it.todo("T6.8 (C28 I15): reporting a truncated recording as a divergence → T3.6 fails, and the failure names the false-positive it would have caused — not deferred on a component: lands with the module each row names");
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

  it.todo("T6.10 (C28 I27): drawing a suspended sample as 0 rather than as a gap → T3.10 fails. A zero in a utilisation series is a reading, and this one is an absence — not deferred on a component: lands with the module each row names");
});
