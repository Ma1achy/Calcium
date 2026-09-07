// C28 §4's async seams — the far side, measured apart from the work it causes.
//
// **Every span this component had before these was synchronous.** `trace` was
// built, tested and had no caller anywhere in `src/`, so the whole far-side
// round trip — invoke, stream, adapt, a live part's fetch, a completion racing a
// route — was time the report attributed to nothing. A frame that waited 400 ms
// on a subprocess and one that spent 400 ms in a bad adapter produced the same
// report, which is the question this component exists to answer.
//
// The rows are indexed by what a *total* cannot tell apart: waiting from
// working, one concurrent fetch from another, and a decorator that measures a
// stream from one that changes it.
import { describe, it } from "vitest";

describe("C28 — the seams that cross a promise", () => {
  it.todo("T1.18 (C28 I36): a route whose transport takes 40 ms and whose adapt takes 5 — spans.transport is 40 and spans.adapt is 5, and their groups are far side and compute; one number covering both is the reading the split exists to end, because a slow far side and a slow adapter want opposite remedies and only one of them is this framework's to apply — not deferred on a component: lands with the async brackets");
  it.todo("T1.19 (C28 I36, C28 I33): two live parts fetching concurrently, one 10 ms and one 30 — livefetch has count 2, max 30 and sum 40, and neither node is the other's child; this is the case the single-pointer shape recorded as nothing, with no error — not deferred on a component: lands with the async brackets");
  it.todo("T1.20 (C28 I36): a stream of five patches, the far side pausing 20 ms before each and the consumer taking 10 between them — spans.stream.sum is about 100 and not about 140; the bracket is around next(), so the consumer's work is outside it by construction and a span around the loop reports one number both a slow far side and a slow shell produce — not deferred on a component: lands with the async brackets");
  it.todo("T1.21 (C28 I36): the same route at tier off, with the seams' own call counts beside the report — no span is recorded and each decorated seam is called exactly as often as the undecorated one; an empty spans is also what a decorator that swallowed the call looks like — not deferred on a component: lands with the async brackets");
  it.todo("T1.22 (C28 I36): a local verb handler taking 12 ms — spans.local is 12 and its group is compute; handler is the input path's name and groups as input, so one name for both files a document-producing route in the column a reader scans for keystroke latency — not deferred on a component: lands with the async brackets");
  it.todo("T1.23 (C28 I36, C06 I9): the decorated stream yields exactly the patches the undecorated one does, in order, with exactly one end last — a decorator that drops, reorders or duplicates a patch is invisible to every timing row above, and it is the only defect here that changes what the user sees — not deferred on a component: lands with the async brackets");
});
