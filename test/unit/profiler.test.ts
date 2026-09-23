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
import type { Tier } from "../../src/shell/profiling/types.js";
import { CARDS, profileCard } from "../../src/shell/profiling/panes/index.js";
import type { Block, Notice } from "../../src/data/viewmodel/index.js";

/** A counter clock. Every row here asks *what was drawn*, never *how long*. */
const counterClock = (): (() => number) => {
  let t = 0;
  return () => (t += 1);
};

/**
 * Every block of a card, flattened.
 *
 * **A card is a `panel` and its figure is a child of it**, so a filter over the
 * top level sees one block of kind `panel` and no plot at all — which is the
 * same empty answer a card that drew nothing gives. The rows below assert on
 * absences, and an absence assertion over a corpus the reader never descended
 * into is the strongest green for the worst defect.
 */
const flat = (blocks: readonly Block[]): readonly Block[] =>
  blocks.flatMap((blk) => [
    blk,
    ...("children" in blk && Array.isArray(blk.children) ? flat(blk.children as Block[]) : []),
  ]);

const noticesIn = (blocks: readonly Block[]): readonly Notice[] =>
  flat(blocks).filter((x): x is Notice => x.kind === "notice");

const plotIds = (blocks: readonly Block[]): readonly string[] =>
  flat(blocks).filter((x) => x.kind === "plot").map((x) => x.id ?? "?");

/**
 * The cards a report with frames and spans — and nothing else — can draw.
 *
 * **Measured, then read.** Every card not here is absent for a reason the
 * fixture states: it has no resource sample (the vitals, the loop, memory, the
 * heap spaces, the system counters), no retained tree (the flame, the icicle,
 * the named tree, the clock), no cache, no gauge, no leak, no mark and no
 * far-side span. The list is the reading rather than a snapshot: a card
 * appearing here is a card drawing a figure over data the fixture does not hold,
 * and one leaving is a card that has stopped answering.
 */
const DRAWS_ON_SPANS: readonly string[] = [
  "verdict", "vitals", "frame-cost", "where-the-frame-went", "the-flow",
  "element-tree", "flame", "named-tree", "frame-on-a-clock", "phases",
  "composition", "span-shapes", "spans-compared", "against-the-budget",
  "work-against-wait", "by-reason", "co-variance", "the-pairs",
];

/** The region every row here draws at — a 24-row terminal at 80 columns. */
const REGION = { w: 80, rows: 24 } as const;

const cardsOfReport = (report: Parameters<typeof profileCard>[0]): readonly (readonly [string, readonly Block[]])[] =>
  CARDS.map((c) => [c.id, profileCard(report, c.id, REGION)] as const);

describe("C28 — profiler, tier 1 spec-first rows", () => {
  it("T1.16 (C28 I23): an empty ring at `spans` draws a notice in every card and no plot at all", () => {
    // **T1.16.** C28 I23's second clause is *a pane with no data draws a notice
    // and never an empty plot, because an empty plot reads as* measured, and
    // zero. `overview` and `distribution` implemented it against the **tier**,
    // which is a different question with the same answer in every state the
    // suite had ever built: `latency` is emitted whenever the tier is `spans`
    // or above, so an empty ring makes it present at `count: 0` with every
    // percentile 0, and the panes drew four and five zero bars (F895).
    //
    // **Over the whole deck, not the card that broke.** The two panes that were
    // right were right by accident of what they had to hand — `frame` and
    // `memory` had no tier-shaped field to reach for — so a row naming
    // `overview` would have been satisfied by the accident and blind to the next
    // one written from the same template. The deck is thirty-seven cards from
    // five templates, so the argument is stronger here than it was there.
    const p = createProfiler({ tier: "spans" }, { elapsed: counterClock() });
    const report = p.report();

    // The state the row is about, asserted rather than assumed: a fixture that
    // quietly recorded a frame would make every assertion below vacuous.
    expect(report.timeline, "nothing was recorded").toHaveLength(0);
    expect(report.latency?.work.count, "and `latency` is present anyway — the defect's premise").toBe(0);

    for (const [id, blocks] of cardsOfReport(report)) {
      expect(plotIds(blocks), `${id} draws no plot over an empty ring`).toEqual([]);
    }

    // **A card with a figure says why there is none; a card with no figure is
    // counted rather than excluded.** `the-instrument` is a `kv` of the
    // profiler's own cost — spans measured, frames dropped, the tier, the node
    // version — every one of which is a count that exists at `off`, so a notice
    // there would be a card refusing to draw numbers it holds. One of
    // thirty-seven, named here so the exemption is a row and not a filter that
    // quietly widens (the *count an exemption* rule).
    const textCards = CARDS.filter((c) => c.form === null).map((c) => c.id);
    expect(textCards, "the cards that draw no figure at any tier").toEqual(["the-instrument"]);
    for (const [id, blocks] of cardsOfReport(report)) {
      if (textCards.includes(id)) continue;
      expect(noticesIn(blocks).length, `${id} says so`).toBeGreaterThan(0);
    }
  });

  it("T1.16b (C28 I23): the empty-ring notice is not the low-tier notice, in either direction", () => {
    // **The half that counting notices cannot see, and the half that found the
    // third instance.** `frame` guards on the data and printed *raise the tier
    // to `spans`* while the tier was `spans` — correct branch, tier's sentence,
    // green under any row that asserts a notice exists. So the assertion is the
    // text: at a spanning tier no notice may instruct a raise, and below one
    // every notice that mentions the tier must still do so.
    // **The card's whole text, not its notices.** The tier and its remedy are in
    // the panel's generated footer — one place for every card, rather than the
    // two drawings of thirty-seven that happened to reach for a duration — and a
    // corpus of `notice` blocks cannot see a panel's footer. An assertion that
    // reads a narrower corpus than the reader's eye is how a sentence goes
    // missing from thirty-five cards with a row still green (F1137).
    const at = (tier: Tier): readonly string[] => {
      const p = createProfiler({ tier }, { elapsed: counterClock() });
      const report = p.report();
      return cardsOfReport(report).map(([, blocks]) => JSON.stringify(blocks));
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

    // **The set of cards that draw, named rather than counted.** A deck that
    // drew one figure where it owes seven satisfies a count and is missing the
    // answer; and the set is the reading — every card absent from it is absent
    // for a stated reason, which is what a report holding frames and spans but
    // no resource sample, no retained tree, no cache and no gauge *should*
    // produce. The list moving is a finding either way round.
    const drew = cardsOfReport(report)
      .filter(([, blocks]) => plotIds(blocks).length > 0)
      .map(([id]) => id);
    expect(drew, "the cards a frames-and-spans report can draw").toEqual(DRAWS_ON_SPANS);
  });

  it("T1.88 (C28 I12): a commit inside `own` is the profiler's, and a mixed frame is not", () => {
    const report = (build: (p: ReturnType<typeof createProfiler>) => void) => {
      const p = createProfiler({ tier: "spans" }, { elapsed: counterClock() });
      build(p);
      return p.report();
    };

    // Every commit bracketed → the frame is the profiler's own and excluded.
    const mine = report((p) => {
      p.own(() => p.commit("stream", false));
      p.beginFrame("stream");
      p.endFrame("frame");
    });
    expect(mine.excluded.selfInflicted, "a frame only the profiler raised").toBe(1);

    // **The mutation this row exists for.** C28 I12 says *every* commit that raised
    // it, and a rule reading *any* is satisfied by the first — so a frame the
    // reader also asked for must not be excluded, or the histograms lose the
    // frames a reader actually waited on.
    const mixed = report((p) => {
      p.own(() => p.commit("stream", false));
      p.commit("input", false);
      p.beginFrame("input");
      p.endFrame("frame");
    });
    expect(mixed.excluded.selfInflicted, "one the reader also raised").toBe(0);

    // And the bracket is not sticky: a throw inside it restores the depth, so
    // the next frame is the reader's.
    const after = report((p) => {
      expect(() =>
        p.own(() => {
          throw new Error("a surface failed mid-refresh");
        }),
      ).toThrow("mid-refresh");
      p.commit("input", false);
      p.beginFrame("input");
      p.endFrame("frame");
    });
    expect(after.excluded.selfInflicted, "after a throw inside the bracket").toBe(0);
  });

  // **T1.16d is struck with the tier-for-a-lifetime rule** (R-EXA-082, F1254).
  // It opened the pushed
  // view at `counters`, watched the tier rise to `spans` and fall back to
  // `counters` rather than to `off`, and counted `setTier` exactly twice so that
  // a close calling it on every path could not pass by reading the right tier.
  // There is nothing that raises a tier: `/profile` is a transcript entry and
  // holds `() => ProfileReport | null`, which is a reader with no recorder
  // behind it (C28 §3c). The rule the row protected — a raise resets the ring
  // (I18) — is asserted at the recorder, where it is about the recorder.
});
