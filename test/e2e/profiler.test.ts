// C28 — profiler (docs/components/C28_profiler.md §10), tier 5.
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

describe("C28 — profiler, tier 5 spec-first rows", () => {
  it.todo("T5.1 (C28 I14): a recorded PTY session that types, submits, streams, scrolls and resizes → replayed, the frames are byte-identical to the recording's — not deferred on a component: lands with record and replay");
  it.todo("T5.2 (C28 I14): the same recording replayed twice → the two runs' frames are identical to each other — not deferred on a component: lands with record and replay");
  it.todo("T5.3 (A01 Appendix B): make profile against dist/ through the public surface → the six budget figures and the three Appendix B rows, each with its regime — not deferred on a component: lands with record and replay");
  it.todo("T5.4 (C28 I8): the T5.1 recording replayed → misses['nothing-changed'] is 0. On a replayed input the count is deterministic, which is the only regime in which asserting it is honest (D2) — not deferred on a component: lands with record and replay");
});
