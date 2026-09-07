// C28 §7's outputs — the two formats, and what neither of them can carry.
//
// **The exporters are the one part of this component with no invariant of its
// own until I35.** A trace document is well-formed whatever `ts` it holds, a
// viewer draws it without complaint, and every defect this file covers produces
// a picture a reader would believe. So the rows here are not about the schema:
// they are about the three things the format has no field for and the document
// must therefore say — where a span actually started, how many frames the
// session had, and that two of its columns are not to be added.
import { describe, it } from "vitest";

describe("C28 — the trace document", () => {
  it.todo("T1.45 (C28 I35): a retained tree whose parent has self time between two children — the second child's ts exceeds the first's ts + dur by that gap, and neither child's ts is a function of its sibling; laying children end to end inside their parent produces a document a viewer draws without complaint — not deferred on a component: lands with the exporters");
  it.todo("T1.46 (C28 I35): a span of 5 ms — dur is 5 000; microseconds against this component's milliseconds is the one conversion in the file, and applying it twice is a factor of a thousand that still opens as a profile — not deferred on a component: lands with the exporters");
  it.todo("T1.47 (C28 I35): eight frames at worst: 2 — otherData.framesInSession is 8 and framesWithTrees is 2; counting the drawn trees is I32's retention policy read as a measurement — not deferred on a component: lands with the exporters");
  it.todo("T1.49 (C28 I35): a tree holding both an element node and a phase span — their cat values differ; one category collapses the two feeds a reader has to tell apart into one colour — not deferred on a component: lands with the exporters");
});

describe("C28 — the appendable form", () => {
  it.todo("T1.48 (C28 I35, C28 I4): three frames as NDJSON — three lines, each parsing on its own, and no key on any of them equal to work + wait — not deferred on a component: lands with the exporters");
});
