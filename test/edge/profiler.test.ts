// C28 — profiler (docs/components/C28_profiler.md §10), tier 3.
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

describe("C28 — profiler, tier 3 spec-first rows", () => {
  it.todo("T3.1 (C28 I5): a frame with no preceding commit (a repaint) → wait is 0 and not negative — not deferred on a component: lands with the recorder in src/shell/profiling/");
  it.todo("T3.2 (C28 I9): a ring of 1 → the report is over one frame and says so — not deferred on a component: lands with the recorder in src/shell/profiling/");
  it.todo("T3.3 (C28 I13): resolution larger than the sampling window → the histogram is empty rather than zero-filled — not deferred on a component: lands with the recorder in src/shell/profiling/");
  it.todo("T3.4 (C28 I17): capture('heap') at tier counters → throws naming the tier required — not deferred on a component: lands with the recorder in src/shell/profiling/");
  it.todo("T3.5 (C28 I17): shutdown with a capture in flight → bounded wait, then abandonment, with the dropped bytes reported — not deferred on a component: lands with the recorder in src/shell/profiling/");
  it.todo("T3.6 (C28 I15): a recording truncated mid-stream → replay reports truncated, and no divergence is raised — not deferred on a component: lands with the recorder in src/shell/profiling/");
  it.todo("T3.7 (C28 I6): a composition that throws after two spans have opened → both close with outcome: 'fallback', neither leaks an open span — not deferred on a component: lands with the recorder in src/shell/profiling/");
  it.todo("T3.8 (C28 I22): every operation after dispose — not deferred on a component: lands with the recorder in src/shell/profiling/");
  it.todo("T3.9 (C28 I26): a resize delivered between a span opening and closing → the span carries the opening width and the crossed-resize tag, and the new width appears nowhere in it — not deferred on a component: lands with the recorder in src/shell/profiling/");
  it.todo("T3.10 (C28 I27): a sampler tick inside suspend()/resume() → suspended: true, and the utilisation figure over that interval is absent rather than 0 — not deferred on a component: lands with the recorder in src/shell/profiling/");
  it.todo("T3.11 (C28 I29): a LiveSpec.fetch rejecting mid-poll → the span closes with the rejection as its outcome, and the profiler issues no retry — not deferred on a component: lands with the recorder in src/shell/profiling/");
});
