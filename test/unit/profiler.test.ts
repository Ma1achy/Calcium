// C28 — profiler (docs/components/C28_profiler.md §10), tier 1.
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
import { describe, it } from "vitest";

describe("C28 — profiler, tier 1 spec-first rows", () => {
  it.todo("T1.1 (C28 I1): at off, a decorated write, measure and span → the ring is never constructed, schedule is never called, and no FinalizationRegistry is registered — not deferred on a component: lands with the recorder in src/shell/profiling/");
  it.todo("T1.3 (C28 I4): a FrameRecord with work: 3, wait: 97 → the report exposes three members and no member equals 100 — not deferred on a component: lands with the recorder in src/shell/profiling/");
  it.todo("T1.4 (C28 I5): two commits at t=0 and t=90, one frame at t=100 → wait is 100, not 10 — not deferred on a component: lands with the recorder in src/shell/profiling/");
  it.todo("T1.5 (C28 I11): at counters, report() has no spans key and no latency key — 'spans' in report is false, asserted rather than spans being empty — not deferred on a component: lands with the recorder in src/shell/profiling/");
  it.todo("T1.6 (C28 I6): a composition returning fallback → counted in excluded.fallback, absent from spans.frame — not deferred on a component: lands with the recorder in src/shell/profiling/");
  it.todo("T1.7 (C28 I7): a group of three children measured through measureChild → the parent's recorded cost is its own, and the derived inclusive figure is the sum — not deferred on a component: lands with the recorder in src/shell/profiling/");
  it.todo("T1.8 (C28 I8): a key differing only in theme → misses.theme is 1 and misses['nothing-changed'] is 0; an identical key that missed → the reverse — not deferred on a component: lands with the recorder in src/shell/profiling/");
  it.todo("T1.9 (C28 I9): a ring of 8 given 20 frames → 8 held, dropped.frames is 12. The two are asserted separately, because a conservation total is satisfied by redistribution — not deferred on a component: lands with the recorder in src/shell/profiling/");
  it.todo("T1.10 (C28 I10): a report over a ring with dropped.frames > 0 → the percentile is labelled over-the-window; with none → it is not — not deferred on a component: lands with the recorder in src/shell/profiling/");
  it.todo("T1.11 (C28 I16): each of 1, 4, 8, 16 → minor, major, incremental, weakcb; the map is total and a fifth number does not compile — not deferred on a component: lands with the recorder in src/shell/profiling/");
  it.todo("T1.12 (C28 I18): setTier from spans to alloc → the ring is empty and the report names the reset — not deferred on a component: lands with the recorder in src/shell/profiling/");
  it.todo("T1.13 (C28 I20): a mark raised between two spans → it is in marks and in no FrameRecord — not deferred on a component: lands with the recorder in src/shell/profiling/");
  it.todo("T1.14 (C28 I22): dispose, then span, count, mark, report → no-ops; dispose again → no-op; capture → throws naming dispose — not deferred on a component: lands with the recorder in src/shell/profiling/");
  it.todo("T1.16 (C28 I23): setTier('spans') from counters, then the view closes → the tier is counters again, not off; and a report with an empty ring renders a notice rather than a plot with no series — not deferred on a component: lands with the recorder in src/shell/profiling/");
  it.todo("T1.71 (C28 I43): a thousand objects tracked under one name, dropped, and collected → created is 1000, finalised is 999, live is 1. The residue is asserted as one and not tolerated as a range, because it is deterministic — always the most recent registration, at every size measured — and a row written as >= 990 would pass a registry reporting half. Runs under --expose-gc; without it the same fixture reports 0 finalised, which is the control — not deferred on a component: lands with the recorder in src/shell/profiling/");
  it.todo("T1.72 (C28 I43): objects tracked under three names, fifty each, dropped and collected → two names report 50 and one reports 49, and the report's own floor names the shortfall as one object rather than one per class. The class it lands on is registration order, so a row naming which of the three is short would be asserting an accident — not deferred on a component: lands with the recorder in src/shell/profiling/");
  it.todo("T1.73 (C28 I43, C28 I1): at off, a thousand track calls → no FinalizationRegistry is constructed, leaks is empty, and the objects are not retained. The retention half is the one that matters: a tracker holding a strong reference to everything it watches is a leak in the instrument that finds leaks — not deferred on a component: lands with the recorder in src/shell/profiling/");
});
