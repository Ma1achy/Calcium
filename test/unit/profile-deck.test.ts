// C28 §3c's deck — every card, built and drawn (docs/components/C28_profiler.md
// §10), tiers 1 and 3.
//
// **Driven over the whole deck rather than a chosen card**, because every claim
// here is about the deck: that no card throws, that none draws a zero that reads
// as measured, that every registered card has a drawing and every drawing a
// card. A suite that picked three cards would test the three that were easy to
// write, which is the shape a totality gate exists to refuse.
//
// **The registry is `construct.ts`'s** — `plot` and `table` registered — and the
// figures are measured through it at 80 **and** 120 columns. F959 is why: the
// figure that condemned the first overview was taken through a registry with no
// `plot` and no `table`, where both fall to `raw` and a plot measures as the
// wrapped lines of its own JSON, 26 rows there against 40 through the real one.
import { describe, expect, it } from "vitest";

import type { Block } from "../../src/data/viewmodel/index.js";
import { createProfiler } from "../../src/shell/profiling/recorder.js";
import type { CommitReason, ProfileReport, Profiler, Tier } from "../../src/shell/profiling/types.js";
import {
  CARDS, DRAWN_CARD_IDS, REGISTERED_CARD_IDS, SECTIONS, cardsOf, profileCard,
} from "../../src/shell/profiling/panes/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import { ASCII_CAPS, FULL_CAPS, measurable } from "../support/render.js";

/**
 * A counter clock, not a wall clock.
 *
 * Every row here asks *what was drawn*, never *how long* — so a monotonic
 * counter gives each span a distinct, reproducible duration and a figure that
 * moved is a figure the code moved.
 */
const counterClock = (): (() => number) => {
  let t = 0;
  return () => (t += 1);
};

const ALL_REASONS = Object.keys({
  input: true, completion: true, resize: true, stream: true, spinner: true,
} satisfies Record<CommitReason, true>) as readonly CommitReason[];

/** One frame under `reason`; `measured` adds spans, a counter, two caches and a gauge. */
const frameOf = (p: Profiler, reason: CommitReason, measured: boolean, cost: number): void => {
  p.commit(reason, false);
  if (reason === "stream") p.commit(reason, false);
  p.beginFrame(reason);
  if (measured) {
    {
      using _a = p.span("compose");
      {
        using _b = p.span("measure");
      }
      {
        using _c = p.span("elements");
      }
    }
    {
      using _d = p.span("paint");
      // **Elements, so `nodes` and `byKind` are populated.** Without them four
      // cards of the deck build a notice and T3.20's *no card throws* is
      // vacuous for exactly the four it most needs to cover — which is how
      // `by-kind`'s construction throw survived a green run of this row and was
      // found by a second consumer instead (F1134).
      for (const kind of ["text", "table", "plot", "kv"]) {
        { using _m = p.element(kind, `${kind}-${String(cost % 3)}`, "measure"); }
        { using _n = p.element(kind, `${kind}-${String(cost % 3)}`, "render"); }
      }
    }
    {
      using _e = p.span("write");
    }
    p.count("bytes.written", 4000 + cost);
    p.gauge("blocks", 12 + (cost % 7));
    p.hit("height");
    p.miss("height", "width");
    p.miss("layout", "absent");
    p.hit("layout");
  }
  p.endFrame("frame");
};

/**
 * The four report fixtures §3c's classification table walks.
 *
 * `sparse` is the row that matters most and is easiest to forget: a session
 * with something in every store but never enough of anything for a form's
 * floor. Every card must answer it with a notice rather than a throw or a zero.
 */
const FIXTURES: Readonly<Record<string, Readonly<{ tier: Tier; seed: (p: Profiler) => void }>>> = {
  empty: { tier: "spans", seed: () => undefined },
  counters: { tier: "counters", seed: (p) => { for (let i = 0; i < 12; i += 1) frameOf(p, "input", false, i); } },
  sparse: { tier: "spans", seed: (p) => { frameOf(p, "input", true, 1); frameOf(p, "stream", true, 2); } },
  full: {
    tier: "spans",
    seed: (p) => {
      for (let i = 0; i < 40; i += 1) {
        frameOf(p, ALL_REASONS[i % ALL_REASONS.length] as CommitReason, true, i);
      }
      // Session-site spans, so the deck's `session` population is not empty —
      // which is the control T1.109b makes over the register and this makes
      // over the frames.
      for (let i = 0; i < 6; i += 1) {
        using _r = p.span("route");
      }
      p.mark("first paint");
    },
  },
};

const reportOf = (name: keyof typeof FIXTURES): ProfileReport => {
  const f = FIXTURES[name];
  if (f === undefined) throw new Error(`no fixture ${name}`);
  const p = createProfiler({ tier: f.tier }, { elapsed: counterClock() });
  f.seed(p);
  return p.report();
};

/** Every block of a card, flattened — a panel's children are not a string. */
const linesOf = (blocks: readonly Block[], width: number): readonly string[] => {
  const { renderToLines } = measurable({ definitions: [plotDefinition, tableDefinition] as never[] });
  return blocks.flatMap((blk) => renderToLines(blk, width));
};

const WIDTHS = [80, 120] as const;
const REGIONS = [
  { w: 80, rows: 24 },
  { w: 120, rows: 40 },
] as const;

describe("C28 §3c — the deck, every card", () => {
  it("T1.115 (C28 I59, C28 I61): every registered card has a drawing and every drawing a card", () => {
    // By equality, at the wiring rather than in the register: a card nobody
    // wrote throws the day someone presses `n` to it, and a drawing for a card
    // that has been removed is dead code that reads as coverage.
    expect(DRAWN_CARD_IDS).toEqual(REGISTERED_CARD_IDS);
    expect(DRAWN_CARD_IDS.length).toBe(CARDS.length);
    expect(SECTIONS.flatMap((s) => cardsOf(s)).map((c) => c.id)).toEqual(CARDS.map((c) => c.id));
  });

  it("T3.20 (C28 I60): no card throws, on any of the four fixtures, at either width", () => {
    // **The claim is over the whole cross-product** — four report shapes × every
    // card × two regions — because C12 refuses rather than degrades and the
    // region is not bounded below. A throw here is the defect F1130 names: it
    // escapes a scheduled callback whose `arm` has already run, so the view
    // stops refreshing with the tier still raised and a frozen pane is
    // indistinguishable from a quiet session.
    for (const name of Object.keys(FIXTURES)) {
      const report = reportOf(name);
      for (const region of REGIONS) {
        for (const spec of CARDS) {
          expect(
            () => profileCard(report, spec.id, region, ASCII_CAPS),
            `${spec.id} on the ${name} report at ${String(region.w)}×${String(region.rows)}`,
          ).not.toThrow();
        }
      }
    }
  });

  it("T3.21 (C28 I11, C28 I23): every card draws something, and an empty one says why", () => {
    // A card that rendered to nothing is indistinguishable from a view whose
    // timer has stopped — which is the failure mode this deck's own finding
    // (F1130) is about, arriving without a throw.
    const empty = reportOf("empty");
    for (const spec of CARDS) {
      const lines = linesOf(profileCard(empty, spec.id, REGIONS[0], ASCII_CAPS), 80);
      expect(lines.length, `${spec.id} draws rows on an empty report`).toBeGreaterThan(2);
      expect(
        lines.join("\n"),
        `${spec.id} names itself, so a reader knows which card is empty`,
      ).toContain(spec.id);
    }
  });

  it("T1.116 (C28 I57): a card over spans states its population on its own face", () => {
    const report = reportOf("full");
    for (const spec of CARDS.filter((c) => c.site !== "none")) {
      const text = linesOf(profileCard(report, spec.id, REGIONS[1], ASCII_CAPS), 120).join("\n");
      expect(text, `${spec.id} names its population`).toContain(`${spec.site}-site spans`);
    }
    // **The two populations are named differently**, which is the assertion —
    // a deck where both footers said the same thing would pass a text match and
    // be the defect (F1127).
    const frameText = linesOf(profileCard(report, "where-the-frame-went", REGIONS[1], ASCII_CAPS), 120).join("\n");
    const sessionText = linesOf(profileCard(report, "far-side-cost", REGIONS[1], ASCII_CAPS), 120).join("\n");
    expect(frameText).toContain("frames in the ring");
    expect(sessionText).toContain("every close since the tier was set");
  });

  it("T1.117 (C28 I58): a per-frame card names the seq it resolved, and says so when it is gone", () => {
    const report = reportOf("full");
    const perFrame = CARDS.filter((c) => c.perFrame === true);
    expect(perFrame.length, "the deck has per-frame cards").toBeGreaterThan(0);

    const seq = report.worst[0]?.seq;
    expect(seq, "the full fixture retains a worst frame").not.toBeUndefined();
    for (const spec of perFrame) {
      const text = linesOf(profileCard(report, spec.id, REGIONS[1], ASCII_CAPS, seq), 120).join("\n");
      expect(text, `${spec.id} carries the frame's own seq`).toContain(`seq ${String(seq ?? -1)}`);
    }

    // **A seq that has left the set is a reading, not an error.** The control is
    // the naive address: an index into a recomputed `worst` silently names a
    // different frame, and nothing on screen changes but the numbers.
    const gone = linesOf(profileCard(report, "element-tree", REGIONS[1], ASCII_CAPS, 999_999), 120).join("\n");
    expect(gone).toContain("has left the retained set");
  });

  it("T3.22 (C28 I60): every card below its form's floor draws the floor it missed", () => {
    // The whole deck at a region no figure fits, and the control below it: the
    // same deck at a region that meets every floor, where a kit refusing
    // everything would fail rather than passing twice.
    const report = reportOf("full");
    const cramped = { w: 80, rows: 4 } as const;
    let refused = 0;
    for (const spec of CARDS) {
      const text = linesOf(profileCard(report, spec.id, cramped, ASCII_CAPS), 80).join("\n");
      if (text.includes("rows and has")) refused += 1;
    }
    expect(refused, "a four-row region refuses most of the deck by naming its floor").toBeGreaterThan(10);

    const roomy = { w: 120, rows: 44 } as const;
    let stillRefused = 0;
    for (const spec of CARDS) {
      const text = linesOf(profileCard(report, spec.id, roomy, ASCII_CAPS), 120).join("\n");
      if (text.includes("rows and has")) stillRefused += 1;
    }
    expect(stillRefused, "and a region that meets every floor refuses none").toBe(0);
  });

  it("T1.118 (C28 I52): the verdict card fits a 24-row terminal at 80 columns", () => {
    // The pane a reader opens first is the one that must not page. Measured
    // through the real registry, at the width the claim is made at.
    for (const name of Object.keys(FIXTURES)) {
      const lines = linesOf(profileCard(reportOf(name), "verdict", REGIONS[0], ASCII_CAPS), 80);
      expect(lines.length, `the verdict on the ${name} report`).toBeLessThanOrEqual(23);
    }
  });

  it("T1.119 (C09 I49): the unicode arm is the terminal's, and the ASCII arm is the default", () => {
    const report = reportOf("full");
    const ascii = linesOf(profileCard(report, "the-instrument", REGIONS[1], ASCII_CAPS), 120).join("\n");
    const full = linesOf(profileCard(report, "the-instrument", REGIONS[1], FULL_CAPS), 120).join("\n");
    expect(ascii).not.toBe(full);
    expect(ascii, "the default carries no ambiguous-width separator").not.toContain("·");
  });
});

void WIDTHS;
