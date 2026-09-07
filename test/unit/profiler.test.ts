// C28 — profiler (docs/components/C28_profiler.md §10), tier 1.
//
// **This file was fifteen spec-first todos and is now one row and one deferral.**
// Every one of them carried the explicit no-blocker marker — TD3's ruling, since
// COMPONENT_SOURCES may not name a path before the path exists — and the clause
// they carried said *lands with the recorder in `src/shell/profiling/`*. The
// recorder landed. Nothing expired them, because TD1–TD6 watch a **component
// id** and these named none, so the marker that was correct on the day it was
// written became the reason nobody looked again.
//
// That is the deferral class at its fifth instance and its worst shape: not a
// condition satisfied elsewhere, but a condition phrased so that no rule has a
// subject to watch. The remedy is not a new gate — matching *"lands with the
// recorder"* against *the recorder exists* is the citation-resolving-against-
// the-wrong-thing class the audit argues against automating. It is the habit:
// picking up an entry begins by grepping what its claims resolve to at HEAD.
import { describe, expect, it } from "vitest";

import { createProfiler } from "../../src/shell/profiling/recorder.js";
import { PANES, profilePane } from "../../src/shell/profiling/panes.js";
import type { Block, Notice } from "../../src/data/viewmodel/index.js";
import type { Tier } from "../../src/shell/profiling/types.js";

/** A counter clock. Every row here asks *what was drawn*, never *how long*. */
const counterClock = (): (() => number) => {
  let t = 0;
  return () => (t += 1);
};

const noticesIn = (blocks: readonly Block[]): readonly Notice[] =>
  blocks.filter((x): x is Notice => x.kind === "notice");

const plotIds = (blocks: readonly Block[]): readonly string[] =>
  blocks.filter((x) => x.kind === "plot").map((x) => x.id ?? "?");

describe("C28 — profiler, tier 1 spec-first rows", () => {
  it("T1.16 (C28 I23): an empty ring at `spans` draws a notice in every pane and no plot at all", () => {
    // **T1.16.** C28 I23's second clause is *a pane with no data draws a notice
    // and never an empty plot, because an empty plot reads as* measured, and
    // zero. `overview` and `distribution` implemented it against the **tier**,
    // which is a different question with the same answer in every state the
    // suite had ever built: `latency` is emitted whenever the tier is `spans`
    // or above, so an empty ring makes it present at `count: 0` with every
    // percentile 0, and the panes drew four and five zero bars (F895).
    //
    // **Over the whole of `PANES`, not the pane that broke.** The two that were
    // right were right by accident of what they had to hand — `frame` and
    // `memory` have no tier-shaped field to reach for — so a row naming
    // `overview` would have been satisfied by the accident and blind to the
    // next pane written from the same template.
    const p = createProfiler({ tier: "spans" }, { elapsed: counterClock() });
    const report = p.report();

    // The state the row is about, asserted rather than assumed: a fixture that
    // quietly recorded a frame would make every assertion below vacuous.
    expect(report.timeline, "nothing was recorded").toHaveLength(0);
    expect(report.latency?.work.count, "and `latency` is present anyway — the defect's premise").toBe(0);

    for (const pane of PANES) {
      const blocks = profilePane(report, pane);
      expect(plotIds(blocks), `${pane} draws no plot over an empty ring`).toEqual([]);
      expect(noticesIn(blocks).length, `${pane} says so`).toBeGreaterThan(0);
    }
  });

  it("T1.16b (C28 I23): the empty-ring notice is not the low-tier notice, in either direction", () => {
    // **The half that counting notices cannot see, and the half that found the
    // third instance.** `frame` guards on the data and printed *raise the tier
    // to `spans`* while the tier was `spans` — correct branch, tier's sentence,
    // green under any row that asserts a notice exists. So the assertion is the
    // text: at a spanning tier no notice may instruct a raise, and below one
    // every notice that mentions the tier must still do so.
    const at = (tier: Tier): readonly string[] => {
      const p = createProfiler({ tier }, { elapsed: counterClock() });
      const report = p.report();
      return PANES.flatMap((pane) => noticesIn(profilePane(report, pane)).map((n) => n.text));
    };

    for (const text of at("spans")) {
      expect(text, "nothing tells a reader on `spans` to raise the tier").not.toMatch(/raise the tier/iu);
      expect(text, "nor that the tier is below `spans`").not.toMatch(/tier is below/iu);
    }

    // The control, and it is the one that stops the repair being *delete the
    // sentence*: below a spanning tier the tier is the true answer and has to
    // survive. A guard widened until it says the same neutral thing everywhere
    // passes the arm above perfectly.
    const low = at("counters");
    expect(low.some((t) => /raise the tier/iu.test(t)), "`counters` still says to raise it").toBe(true);
    expect(low.some((t) => /tier is below/iu.test(t)), "and still says why").toBe(true);
  });

  it("T1.16c (C28 I23): its control — a recorded session still draws every plot", () => {
    // A guard widened until it refuses everything passes both rows above. This
    // is the arm that fails if the empty-ring branch is taken when there is
    // data, and it names the ids rather than counting them: a pane that drew
    // one plot instead of two would pass a count and be missing the answer.
    const p = createProfiler({ tier: "spans" }, { elapsed: counterClock() });
    for (let i = 0; i < 6; i += 1) {
      p.beginFrame("input");
      {
        using _s = p.span("paint");
      }
      p.endFrame("frame");
    }
    const report = p.report();
    expect(report.latency?.work.count, "six frames are in the ring").toBe(6);

    expect(plotIds(profilePane(report, "overview"))).toEqual(["ov-latency", "ov-coalesce"]);
    expect(plotIds(profilePane(report, "frame"))).toEqual(["fr-spans"]);
    expect(plotIds(profilePane(report, "distribution"))).toEqual(["di-quantiles", "di-spans", "di-worst"]);
  });

  it.todo("T1.16d (C28 I23): setTier('spans') from counters, then the view closes → the tier is counters again, not off — not deferred on a component: the blocker is a caller of profilePane in src/ that opens and closes a pane, and there is none; profilePane is a pure function from a report to blocks and raises no tier. It arrives with the drawing round. Grep: `grep -rn 'profilePane' src/ | grep -v profiling/`");
});
