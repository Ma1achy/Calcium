// C28 §7's outputs — the two formats, and what neither of them can carry.
//
// **The exporters are the one part of this component whose defects all produce
// a document that opens.** A viewer draws whatever `ts` it is given, `jq` reads
// whatever lines it is handed, and a trace holding a fabricated timeline is
// well-formed by every check a reader has. So the rows here are not about the
// schema — nothing asserts that `ph` is `"X"` — they are about the three things
// the format has no field for and the document must therefore say: where a span
// actually started, how many frames the session had, and that two of its
// columns are not to be added.
import { describe, expect, it } from "vitest";

import { createProfiler } from "../../src/shell/profiling/recorder.js";
// **Through the root, which is where a consumer reaches them.** The concrete
// file would work and would test nothing about the published surface: the
// barrel beside it exported five constructors against C24 I31 for as long as it
// existed, and what hid that was exactly this — no test importing the way a
// consumer does, so the seam had no reader to be wrong for (F876).
import { toNdjson, toTraceEvents } from "../../src/index.js";
import type { ProfileOptions, Profiler } from "../../src/shell/profiling/types.js";

/** A clock the test drives, on the session's own axis — `elapsed` is
 *  milliseconds since the session began, so it starts at zero. */
function steps(): { now: () => number; at: (ms: number) => void } {
  let t = 0;
  return { now: () => t, at: (ms) => void (t = ms) };
}

function profiler(now: () => number, opts: ProfileOptions = { tier: "spans" }): Profiler {
  return createProfiler(opts, { elapsed: now, node: "v22.0.0", cpus: 1 });
}

type Event = {
  name: string;
  cat: string;
  ph: string;
  ts: number;
  dur?: number;
};

const eventsOf = (json: string): Event[] => (JSON.parse(json) as { traceEvents: Event[] }).traceEvents;
const named = (events: Event[], name: string): Event => {
  const found = events.find((e) => e.name === name);
  if (found === undefined) throw new Error(`no event named ${name} in ${events.map((e) => e.name).join(", ")}`);
  return found;
};

/**
 * One frame whose `compose` span has three milliseconds of its own between two
 * children.
 *
 * The gap is the whole point: it is the parent's self time, it is real, and it
 * is the thing a layout computed from sibling order cannot reproduce.
 */
function frameWithAGap(): string {
  const clock = steps();
  const prof = profiler(clock.now, { tier: "spans", worst: 4 });

  clock.at(0);
  prof.beginFrame("input");
  clock.at(1);
  {
    using _compose = prof.span("compose");
    clock.at(2);
    {
      using _a = prof.span("measure");
      clock.at(7); // five milliseconds, so T1.46 has an exact figure
    }
    clock.at(10); // three milliseconds of the parent's own work
    {
      using _b = prof.span("paint");
      clock.at(12);
    }
    clock.at(13);
  }
  clock.at(14);
  prof.endFrame("frame");

  return toTraceEvents(prof.report());
}

describe("C28 — the trace document", () => {
  it("T1.45 (C28 I35): a child's ts is its own, so the parent's self time stays a gap", () => {
    const events = eventsOf(frameWithAGap());
    const a = named(events, "measure");
    const b = named(events, "paint");

    // **The measured gap, asserted as a figure rather than as an inequality.**
    // `>` is satisfied by any layout that happens to leave room; only the exact
    // three milliseconds says the number came off the clock. A tiler puts
    // `paint` at 7 000 — immediately after `measure` ends — and the parent's own
    // work disappears into a picture with no gaps in it.
    expect(a.ts, "measure opened at 2 ms").toBe(2_000);
    expect(a.dur, "and ran for five").toBe(5_000);
    expect(b.ts, "paint opened at 10 ms, not at 7").toBe(10_000);
    expect(b.ts - (a.ts + (a.dur ?? 0)), "the gap is the parent's self time").toBe(3_000);

    // And the parent contains both, which is what makes the gap legible as
    // self time rather than as dead air between two unrelated bars.
    const parent = named(events, "compose");
    expect(parent.ts).toBe(1_000);
    expect(parent.dur).toBe(12_000);
  });

  it("T1.46 (C28 I35): the conversion to microseconds is applied once", () => {
    const events = eventsOf(frameWithAGap());

    // A second application is a factor of a thousand, and the document it
    // produces still opens: a five-millisecond span becomes a five-second one
    // and every bar keeps its proportions, so the picture is identical and only
    // the axis is wrong.
    expect(named(events, "measure").dur, "5 ms is 5 000 µs").toBe(5_000);
    expect(named(events, "frame").dur, "and the frame's 14 ms is 14 000").toBe(14_000);
  });

  it("T1.47 (C28 I35): the document names the session's frame count beside its own", () => {
    const clock = steps();
    const prof = profiler(clock.now, { tier: "spans", worst: 2 });

    for (let i = 0; i < 8; i += 1) {
      clock.at(i * 100);
      prof.beginFrame("input");
      {
        using _s = prof.span("compose");
        // Rising cost, so which two are worst is decided rather than arbitrary.
        clock.at(i * 100 + i + 1);
      }
      prof.endFrame("frame");
    }

    const doc = JSON.parse(toTraceEvents(prof.report())) as {
      otherData: Record<string, string>;
    };

    // **Read off the document, not off the report.** A reader opening this in
    // Perfetto counts trees; without these two fields the retention policy
    // becomes a measurement, and eight frames become two.
    expect(doc.otherData.framesInSession, "eight frames happened").toBe("8");
    expect(doc.otherData.framesWithTrees, "and two are drawn").toBe("2");
  });

  it("T1.49 (C28 I35): an element and a phase are different categories", () => {
    const clock = steps();
    const prof = profiler(clock.now);

    clock.at(0);
    prof.beginFrame("input");
    {
      using _el = prof.element("plot", "pl-1");
      clock.at(3);
      {
        using _phase = prof.span("plot.area");
        clock.at(5);
      }
      clock.at(6);
    }
    prof.endFrame("frame");

    const events = eventsOf(toTraceEvents(prof.report()));

    // The two feeds are the reason the field exists: one is a block instance the
    // registry seam measured from outside, the other is a phase the component
    // named from inside. A viewer colours by `cat`, so collapsing them makes a
    // plot and the plot's raster the same colour at two depths.
    expect(named(events, "plot#pl-1").cat).toBe("element");
    expect(named(events, "plot.area").cat).toBe("phase");
  });
});

describe("C28 — the appendable form", () => {
  it("T1.48 (C28 I35, C28 I4): each line parses alone and carries no sum", () => {
    const clock = steps();
    const prof = profiler(clock.now);

    for (let i = 0; i < 3; i += 1) {
      clock.at(i * 100);
      prof.commit("input", false);
      clock.at(i * 100 + 10); // ten milliseconds of wait before the frame opens
      prof.beginFrame("input");
      clock.at(i * 100 + 30);
      prof.endFrame("frame");
    }

    const lines = toNdjson(prof.report()).split("\n");
    expect(lines.length, "one line per frame").toBe(3);

    for (const line of lines) {
      // The property the format exists for: a line is readable without the
      // ones around it, which a JSON document's frames are not.
      const frame = JSON.parse(line) as Record<string, number>;
      expect(typeof frame.seq).toBe("number");
      expect(frame.work, "twenty milliseconds of work").toBe(20);
      expect(frame.wait, "and ten of wait").toBe(10);

      // **C28 I4, asserted over the keys rather than over a name.** Forbidding
      // a key called `total` is satisfied by calling it `duration`; what is
      // forbidden is the value, wherever it is written.
      const sum = (frame.work ?? 0) + (frame.wait ?? 0);
      const summing = Object.entries(frame).filter(([k, v]) => k !== "at" && v === sum);
      expect(summing, `no column is work + wait (${String(sum)})`).toEqual([]);
    }
  });
});
