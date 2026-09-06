// C28 — profiler (docs/components/C28_profiler.md §10), tier 4.
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

describe("C28 — profiler, tier 4 spec-first rows", () => {
  it.todo("T4.1 (C28 I1): a real constructGraph with profile absent → the graph is byte-identical to one built without the field, and no profiler object exists — not deferred on a component: lands with the seams wired through construct.ts");
  it.todo("T4.2 (C28 I7, I8, I24): a real session appending twenty entries and scrolling → byEntry names twenty ids, byKind names the kinds present, and both are work-only. The nothing-changed zero is not asserted here: D2 rules it deterministic only over a replayed input, so it is T5.4's and a live session cannot carry it — not deferred on a component: lands with the seams wired through construct.ts");
  it.todo("T4.3 (C28 I4): a stream at 1 000 lines/s → wait tracks C03's 33 ms window and work does not — not deferred on a component: lands with the seams wired through construct.ts");
  it.todo("T4.4 (C28 I12): the profiler view open → its own frames are excluded and excluded.selfInflicted is non-zero — not deferred on a component: lands with the seams wired through construct.ts");
  it.todo("T4.5 (C28 I28): a handoff() interval spanning two sampler ticks → the samples exist, carry the interval's mark, and report no CPU figure across it — not deferred on a component: lands with the seams wired through construct.ts");
});
