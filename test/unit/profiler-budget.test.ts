// A01 Appendix B, filled — C28 §10's tier-1 rows for the headless budget face.
//
// **The appendix is a six-row decision gate that has been empty since it was
// written**, and its own instruction is *fill this from real numbers; do not
// estimate*. Four rows a `ProfileReport` can answer. Two it cannot, and the
// rows below are mostly about those: a gate table with a plausible zero in it
// closes an experiment nobody ran.
import { describe, it } from "vitest";

describe("C28 — the budget table", () => {
  it.todo("T1.25 (C28 I37): a report with 12 frames and 480 KB in counters bytes.written — the bytes row reads 40 KB per frame, is not crossed against the appendix's 100 KB, and prints both figures; a threshold quoted without the measurement beside it is a verdict a reader cannot check — not deferred on a component: lands with the headless budget face");
  it.todo("T1.26 (C28 I37): a report at tier counters, which carries no latency — the two frame-construction rows come back unanswerable naming the tier, not 0; zero here reads as a frame that took no time, which is the one answer that would close the gate — not deferred on a component: lands with the headless budget face");
  it.todo("T1.27 (C28 I37): a full deep report where every answerable row is measured — resize corruption and Page Down latency are still unanswerable, each naming what it would need; an unanswerable that appears only on an empty report cannot be told from a report with nothing in it — not deferred on a component: lands with the headless budget face");
  it.todo("T1.28 (C28 I37): a report whose p95 is 20 ms against the appendix's 16 — crossed is true and the formatted table marks that row; any crossing justifies the experiment, so a table rendering a crossing the same as a pass buries the single thing it exists to say — not deferred on a component: lands with the headless budget face");
  it.todo("T1.29 (C28 I37): a report where every answerable row passes — the verdict is undecided and names the two rows it lacks, never closed; the appendix's own sentence, none crossed means M-T6 is closed, is a two-valued reading of a table with six rows and four answers — not deferred on a component: lands with the headless budget face");
  it.todo("T1.50 (C28 I37, C22 I93): a real graph built with a profiler, one frame committed, checkBudget over the report it produces — the bytes row is measured; every other row builds a report literal, which agrees with ProfileReport by construction and would keep agreeing on the day session.ts's counter is renamed, and the failure that produces is an unanswerable — this module's honest-looking answer and therefore the one nothing would question — not deferred on a component: lands with the headless budget face");
});

describe("C28 — the report's way out", () => {
  it.todo("T1.58 (C28 I38): a session started with profile tier spans and an onReport, then stopped — onReport is called exactly once and the report it receives has a non-empty heapSpaces; the count and the heap spaces are one row on purpose, because called twice is a report a consumer would append twice and an empty heapSpaces is what taking the report after dispose produces — a correct-looking document with one field silently emptied — not deferred on a component: lands with the headless budget face");
  it.todo("T1.59 (C28 I38): a session started with no profile at all — onReport cannot have been called, and a session at tier off does not call it either; an absent callback and an empty report are the two readings of nothing came back, and only one of them is true here — not deferred on a component: lands with the headless budget face");
});
