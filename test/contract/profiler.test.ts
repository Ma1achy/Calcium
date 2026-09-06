// C28 — profiler (docs/components/C28_profiler.md §10), tier 2.
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

describe("C28 — profiler, tier 2 spec-first rows", () => {
  it.todo("T2.1 (C28 I2, the instrument's own fixture, real clock): a span wrapping a deliberate 5 ms busy-wait reports ≥ 4 ms; a counter incremented 1 000 times reports exactly 1 000; a probe returning a rising then falling heap is reported rising then falling. The counter and the probe assert exactly, the duration asserts a floor, and the row prints all three — not deferred on a component: lands with the recorder in src/shell/profiling/, and T2.4 with SS-P");
  it.todo("T2.2 (C28 I2, the negative control, real clock): an empty span reports ≤ 10 µs — the span machinery's own cost, and not its subject's. Without this row T2.1 is satisfied by an instrument that reports the same figure for any input, which is the five-of-five class arriving in the tool built to end it. The two bounds are 400× apart and both are printed beside the assertion — not deferred on a component: lands with the recorder in src/shell/profiling/, and T2.4 with SS-P");
  it.todo("T2.3 (C28 I13): a sample at resolution: 10 → loopDelay.resolutionMs is 10, and no consumer of the report reads loopDelay.p50 as a delay — not deferred on a component: lands with the recorder in src/shell/profiling/, and T2.4 with SS-P");
  it.todo("T2.4 (C28 I21): the source scan SS-P over src/, with node.ts allow-listed; the allow-listed file is shown to still trigger the pattern, so the exemption is exercised — not deferred on a component: lands with the recorder in src/shell/profiling/, and T2.4 with SS-P");
  it.todo("T2.5 (C28 I19): a 60-second run at 60 fps → getEntries is read at most once per sampler interval, asserted by counting probe calls rather than by timing — not deferred on a component: lands with the recorder in src/shell/profiling/, and T2.4 with SS-P");
  it.todo("T2.6 (C28 I12): a frame raised by one profiler commit and one real commit → selfInflicted is false — not deferred on a component: lands with the recorder in src/shell/profiling/, and T2.4 with SS-P");
  it.todo("T2.7 (C28 I25): the report's timing-entry figure → a count, with no site, and carrying the label that says the profiler raises no marks of its own — not deferred on a component: lands with the recorder in src/shell/profiling/, and T2.4 with SS-P");
});
