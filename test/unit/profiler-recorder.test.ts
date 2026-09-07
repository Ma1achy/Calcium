// C28 I3 — a span records the time that passes *inside* it.
//
// **This file exists because a mutation survived.** `OVERLAYS-BESIDE` moved a
// span so it closed before the call it names, and nothing in the suite failed.
// The row that was supposed to catch it — T1.61's residue clause — reads the
// recorded sums under `buildSession`'s injected clock, and that clock is a
// counter: `() => (t += 1)`, advancing once per *read*. Under it every leaf span
// records exactly 1, whether it wraps a millisecond of work or nothing at all.
// Measured, on the session T1.61 builds: `overlays` count 6, sum 6, max 1.
//
// So the sentence in T1.61 — *only the sum says they were called around the work
// rather than beside it* — named a mechanism that harness does not have. It is
// F883's shape again: falsifiable in principle, unfalsifiable in this tree.
//
// The distinction needs a clock the **callee** advances, which is what an
// injected stepping clock gives and a counter cannot. Both arms are here,
// because the zero arm is what makes the five mean anything: a recorder that
// reports 0 for every span would satisfy the second row alone.
//
// This is the recorder-core file. T1.1 and T1.3–T1.17 land here.
import { describe, expect, it } from "vitest";

import { createProfiler } from "../../src/shell/profiling/recorder.js";

describe("C28 — the recorder's span, over a clock its subject advances", () => {
  it("T1.2 (C28 I3): a span over a callee advancing the clock 5 ms records 5; the same span closed beside that callee records 0", () => {
    let now = 0;
    // The stand-in for work: it costs time, and it costs it *while called*.
    // A counter clock cannot express this, which is the whole point of the row.
    const work = (ms: number): void => void (now += ms);

    const entriesBefore = performance.getEntries().length;
    const p = createProfiler({ tier: "spans" }, { elapsed: () => now });

    {
      using _around = p.span("compose");
      work(5);
    }

    {
      using _beside = p.span("measure");
    }
    work(5);

    const report = p.report();
    const spans = report.spans ?? {};

    expect(spans.compose?.sum, "the span that brackets the work carries it").toBe(5);
    expect(spans.measure?.sum, "the span that closes beside it carries nothing").toBe(0);
    expect(spans.measure?.count, "and is still opened, so a count cannot tell them apart").toBe(1);

    // C28 I3's second half. The recorder reads the injected clock and nothing
    // else; a `performance.mark` would put this instrument in the buffer it is
    // meant to be measuring, and would leak into any host reading User Timing.
    expect(
      performance.getEntries().length,
      "the recorder writes no User Timing entries",
    ).toBe(entriesBefore);

    p.dispose();
  });
});
