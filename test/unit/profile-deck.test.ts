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
import type { CaptureResult, CommitReason, ProfileReport, Profiler, Tier } from "../../src/shell/profiling/types.js";
import {
  CARDS, DRAWN_CARD_IDS, REGISTERED_CARD_IDS, SECTIONS, cardsOf, profileCard,
} from "../../src/shell/profiling/panes/index.js";
import { frameSamples } from "../../src/shell/profiling/panes/kit.js";
import { UNATTRIBUTED, foldCpuProfile } from "../../src/shell/profiling/stacks.js";
import type { StackNode } from "../../src/shell/profiling/stacks.js";
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

/**
 * Every block in a card's tree — **a card is a `panel`**, so its figure is a
 * child and a filter over the top level is an absence assertion over a corpus
 * the reader never descended into.
 */
const flat = (blocks: readonly Block[]): readonly Block[] =>
  blocks.flatMap((blk) => [
    blk,
    ...("children" in blk && Array.isArray(blk.children) ? flat(blk.children as Block[]) : []),
  ]);

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

  it("T1.109 (C28 I57): past the ring, one span's two populations differ in size and say so on two cards", () => {
    // **A session longer than the ring**, which is the only state in which the
    // two extractors can be shown to be two: below 512 frames the histogram's
    // count and the sample series' length agree, and a deck that read one
    // population for both would pass every assertion.
    const p = createProfiler({ tier: "spans" }, { elapsed: counterClock() });
    for (let i = 0; i < 600; i += 1) frameOf(p, "input", true, i);
    const report = p.report();

    expect(report.dropped.frames, "the ring overflowed").toBeGreaterThan(0);
    expect(report.timeline.length, "and holds its cap").toBe(512);

    const hist = report.spans?.["compose"];
    expect(hist, "the histogram is unbounded since the tier was set").not.toBeUndefined();
    const samples = frameSamples(report, "compose");
    expect(hist?.count, "the histogram counted every close").toBe(600);
    expect(samples.length, "the ring kept the last 512").toBe(512);
    // **The difference is the assertion.** Two figures of the same name over
    // populations of different sizes, from one report — C28 I57's whole claim, and
    // the thing a card silently picking either would hide.
    expect(hist?.count).not.toBe(samples.length);

    // And the two cards say which they drew, in words that differ.
    const ring = linesOf(profileCard(report, "span-shapes", REGIONS[1], ASCII_CAPS), 120).join("\n");
    const session = linesOf(profileCard(report, "far-side-cost", REGIONS[1], ASCII_CAPS), 120).join("\n");
    expect(ring, "the ring card names the ring and its overflow").toContain("frames in the ring");
    expect(ring).toContain("dropped past it");
    expect(session, "the session card names every close").toContain("every close since the tier was set");
    expect(ring, "and the two are not the same sentence").not.toBe(session);
  });

  it("T1.110 (C28 I58): a recomputed `worst` moves the position and not the card, and the naive address is the control", () => {
    // **One report pair**, which is what makes the control readable: the same
    // two reports drive both the address the deck uses and the address it
    // refuses to use, so the difference is the addressing and nothing else.
    const p = createProfiler({ tier: "spans" }, { elapsed: counterClock() });
    for (let i = 0; i < 20; i += 1) frameOf(p, "input", true, i);
    const before = p.report();
    const third = before.worst[2];
    expect(third, "three frames retained").not.toBeUndefined();

    // **A slower frame arrives, and it has to be genuinely slower**: the clock
    // is a counter, so a frame's cost is the number of reads inside it — a
    // second batch of the same shape is the same cost, and `worst` would not
    // move. Sixteen extra spans is what makes these the worst frames rather
    // than merely the latest, and the row's first assertion is what caught the
    // version that did not.
    for (let i = 0; i < 6; i += 1) {
      p.commit("stream", false);
      p.beginFrame("stream");
      for (let k = 0; k < 16; k += 1) {
        using _slow = p.span("compose");
      }
      p.endFrame("frame");
    }
    const after = p.report();
    expect(after.worst.map((f) => f.seq), "the set moved").not.toEqual(before.worst.map((f) => f.seq));

    // **The card holds a `seq`**, so it draws the frame it named or says it is
    // gone. Either answer is honest; silently drawing a neighbour is not.
    const held = String(third?.seq ?? -1);
    const drawn = linesOf(profileCard(after, "element-tree", REGIONS[1], ASCII_CAPS, third?.seq), 120).join("\n");
    if (after.worst.some((f) => f.seq === third?.seq)) {
      expect(drawn, "still the frame it named").toContain(`seq ${held}`);
    } else {
      expect(drawn, "or named as gone, never replaced").toContain("has left the retained set");
    }

    // **The control, on the same pair**: position 2 of the recomputed set is a
    // different frame, and a card addressed that way would have changed what it
    // shows with nothing on screen saying so.
    expect(after.worst[2]?.seq, "the naive address moved frame").not.toBe(third?.seq);
  });

  it("T1.121 (C28 I57, F1142, F1143): a card declaring two populations states both, and one declaring one states one", () => {
    const report = reportOf("full");
    const footerOf = (id: string): string => {
      const panel = profileCard(report, id, REGIONS[1], ASCII_CAPS)[0];
      const f = (panel as { footer?: string }).footer;
      if (f === undefined) throw new Error(`no footer on ${id}`);
      return f;
    };

    // **Over the register, not over `vitals` by name.** One card draws two
    // rings today; the day a second does is the day a row naming this one stops
    // covering the claim.
    const both = CARDS.filter((c) => c.site !== "none" && c.draws.includes("samples"));
    expect(both.length, "the deck has a card with two populations").toBeGreaterThan(0);
    for (const spec of both) {
      const footer = footerOf(spec.id);
      expect(footer, `${spec.id} states its span population`).toContain(`${spec.site}-site spans`);
      expect(footer, `${spec.id} states its resource population too`).toContain("resource samples");
    }

    // **The control**: a card declaring one of them carries that clause and not
    // the other. A footer printing every clause unconditionally satisfies the
    // first half and tells a reader of `where-the-frame-went` how many resource
    // samples there are, which is a number about a ring it never touches.
    const spansOnly = CARDS.filter((c) => c.site !== "none" && !c.draws.includes("samples"));
    expect(spansOnly.length, "and cards with one").toBeGreaterThan(0);
    for (const spec of spansOnly) {
      expect(footerOf(spec.id), `${spec.id} says nothing of a ring it does not read`).not.toContain(
        "resource samples",
      );
    }
  });

  it("T1.120 (C28 I41, C28 I57, F1142): a session-site name yields no per-frame series, on a report that has one in its frames", () => {
    // **A session-site span closed inside a frame**, which is the state the
    // filter exists for: `frameSpans` accumulates whatever closed since the
    // last reset, so `route` lands in the `FrameRecord` of the window it
    // happened to close in — the window, not a measurement of it (F888's
    // −460.5 ms residue).
    const p = createProfiler({ tier: "spans" }, { elapsed: counterClock() });
    for (let i = 0; i < 4; i += 1) {
      p.commit("input", false);
      p.beginFrame("input");
      {
        using _c = p.span("compose");
      }
      {
        // Opened and closed inside the frame, and still a session-site name.
        using _r = p.span("route");
      }
      p.endFrame("frame");
    }
    const report = p.report();

    // **The precondition, asserted before the absence.** An empty answer from a
    // report that never held the name is the same green for the opposite
    // reason, and that is the version of this row that would have passed with
    // the filter deleted.
    const inFrames = report.timeline.filter((f) => (f.spans["route"] ?? 0) > 0);
    expect(inFrames.length, "the fixture put a session-site span in the frames").toBeGreaterThan(0);
    expect(frameSamples(report, "compose").length, "and the frame-site name is there to be read").toBe(4);

    // The claim.
    expect(frameSamples(report, "route"), "a session-site name has no per-frame series").toEqual([]);
  });

  it("T1.112 (C28 I60): every card with a floor names it below one, and none of them does above", () => {
    // T3.22 asserts the population moves — more than ten refuse when cramped,
    // none when roomy. **This is the per-card form of the same claim**, and the
    // stronger half: the exception is what a count cannot see, and a card that
    // drew a zero instead of a refusal is exactly the card a reader would act
    // on.
    const report = reportOf("full");
    const withFloor = CARDS.filter((c) => c.floor > 1);
    expect(withFloor.length, "most of the deck declares a floor").toBeGreaterThan(20);

    const cramped = { w: 80, rows: 3 } as const;
    for (const spec of withFloor) {
      const blocks = profileCard(report, spec.id, cramped, ASCII_CAPS);
      // **No figure, in either honest form.** A card refuses for the floor —
      // *has 3 rows and has* — or for the datum, when there is nothing to draw
      // before the room question arises; `counters-over-time` is the second on
      // this fixture, and a row demanding the floor sentence from every card
      // would be asserting that the deck checks room before data.
      expect(
        flat(blocks).filter((blk) => blk.kind === "plot"),
        `${spec.id} draws no figure at 3 rows, whichever refusal it has`,
      ).toEqual([]);
      const text = linesOf(blocks, 80).join("\n");
      expect(text, `${spec.id} names itself while refusing`).toContain(spec.id);
      expect(text.trim(), `${spec.id} says something rather than drawing nothing`).not.toBe("");
    }

    // The control, per card rather than as a count: the same deck where every
    // floor is met refuses nothing, so a kit that refused everything fails here
    // rather than passing twice.
    const roomy = { w: 120, rows: 44 } as const;
    for (const spec of CARDS) {
      const text = linesOf(profileCard(report, spec.id, roomy, ASCII_CAPS), 120).join("\n");
      expect(text, `${spec.id} builds where its floor is met`).not.toContain("rows and has");
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

// C28 §3c — the sampled stack card (§9b B19-B24, S17-S19).
//
// **A hand-built `.cpuprofile`, not a captured one.** A real capture samples
// whatever the machine was doing, so a row over it asserts the machine; these
// rows are about what the fold does with a shape, and the shape has to be
// chosen for each one. The real inspector is tier 5's, and `out/render-stacks`
// is where a frame was read.
const frame = (id: number, name: string, children?: readonly number[]) => ({
  id,
  callFrame: { functionName: name, url: `file:///a.js`, lineNumber: id },
  ...(children === undefined ? {} : { children }),
});

/** `(root) → a → b`, with `(idle)` beside them — the shape most rows vary. */
const NODES = [
  frame(1, "(root)", [2, 4]),
  frame(2, "a", [3]),
  frame(3, "b"),
  frame(4, "(idle)"),
];

const captureOf = (
  stacks: CaptureResult["stacks"],
  over: Partial<CaptureResult> = {},
): CaptureResult => Object.freeze({
  kind: "cpu", path: "out/cap/x.cpuprofile", bytes: 128, truncated: false,
  droppedBytes: 0, durationMs: 500, abandoned: false, stacks, ...over,
});

/** A report with captures spliced in — the card reads `captures` and nothing else. */
const withCaptures = (caps: readonly CaptureResult[]): ProfileReport => ({
  ...reportOf("full"), captures: caps,
});

const foldOf = (
  samples: readonly number[],
  timeDeltas: readonly number[],
  nodes: readonly unknown[] = NODES,
): ReturnType<typeof foldCpuProfile> =>
  foldCpuProfile({ nodes: nodes as never, samples, timeDeltas });

const named = (n: StackNode, want: string): StackNode | undefined =>
  n.name === want ? n : n.children.map((c) => named(c, want)).find((x) => x !== undefined);

describe("C28 I62 — the fold", () => {
  it("T1.122 (C28 I62, B19): an unsampled window folds to null, and the nodes were there to be trusted", () => {
    // **The precondition first.** A null for want of nodes is the same green as
    // a null for want of samples, and only one of them is the claim.
    expect(NODES.filter((n) => !n.callFrame.functionName.startsWith("(")), "real frames in the input").toHaveLength(2);
    expect(foldOf([], []), "nothing sampled, so nothing to draw").toBeNull();

    // The control: the same nodes, one sample, a tree.
    const one = foldOf([3], [1_000]);
    expect(one, "a fold that returned null unconditionally fails here").not.toBeNull();
    expect(named(one!.root, "b")?.self).toBe(1_000);
  });

  it("T1.123 (C28 I62, B21, B22): unequal lengths refuse, and an unknown id lands in a named node", () => {
    expect(foldOf([3, 3], [1_000]), "a zip to the shorter would draw part of the window").toBeNull();

    // **Asserted by name, not by the total.** A conservation assertion is
    // satisfied by redistribution: a fold that added the orphaned sample to `b`
    // conserves the total and loses the fact that nothing claimed it.
    const f = foldOf([3, 99], [1_000, 4_000]);
    expect(f).not.toBeNull();
    const orphan = named(f!.root, UNATTRIBUTED);
    expect(orphan?.self, "the sample no node declared, kept and named").toBe(4_000);
    expect(named(f!.root, "b")?.self, "and not folded into a real frame").toBe(1_000);
  });

  it("T1.124 (C28 I63, B20): the synthetic frames leave the tree and the footer says what left", () => {
    const f = foldOf([3, 4], [1_000, 9_000]);
    expect(f).not.toBeNull();
    const all = (n: StackNode): readonly StackNode[] => [n, ...n.children.flatMap(all)];
    expect(all(f!.root).map((n) => n.name), "(idle) is gone at every depth").not.toContain("(idle)");
    expect(f!.excluded["(idle)"], "and its share is carried out with it").toBe(9_000);
    expect(f!.root.total, "the tree is the real frames alone").toBe(1_000);

    const lines = linesOf(
      profileCard(withCaptures([captureOf({ ...f!, foldMs: 0 })]), "sampled-stacks", { w: 120, rows: 20 }, FULL_CAPS),
      120,
    ).join("\n");
    expect(lines, "the excluded share is on the card").toMatch(/9\.00 ms in \(idle\)/u);

    // **The control**: a window with no synthetic frame says so rather than
    // printing an exclusion that never happened.
    const clean = foldOf([3], [1_000]);
    const cleanLines = linesOf(
      profileCard(withCaptures([captureOf({ ...clean!, foldMs: 0 })]), "sampled-stacks", { w: 120, rows: 20 }, FULL_CAPS),
      120,
    ).join("\n");
    expect(cleanLines).toContain("no synthetic frames in the window");
    expect(cleanLines, "and no share is claimed").not.toMatch(/excluded/u);
  });

  it("T1.125 (C28 I62, B23): a capped file and a whole tree are two statements", () => {
    const f = foldOf([3], [1_000]);
    const cap = captureOf({ ...f!, foldMs: 0 }, { truncated: true, droppedBytes: 4_096 });
    const lines = linesOf(
      profileCard(withCaptures([cap]), "sampled-stacks", { w: 120, rows: 20 }, FULL_CAPS),
      120,
    ).join("\n");
    // The figure is drawn — the cap applied to the JSON write and the fold read
    // the object before it, so the tree is whole.
    expect(lines, "the tree is drawn").toMatch(/\bb\b/u);
    expect(lines, "and nothing calls the figure partial").not.toMatch(/truncated|partial/u);
  });
});

describe("C28 I64 — which capture the card draws", () => {
  it("T1.126 (C28 I64; §9b's trace): the last completed capture, in three arrangements", () => {
    const f = foldOf([3], [1_000]);
    const done = captureOf({ ...f!, foldMs: 0 });
    const inFlight = captureOf(null);
    const abandoned = captureOf(null, { abandoned: true, bytes: 0, truncated: true });

    const drawn = (caps: readonly CaptureResult[]): string =>
      linesOf(profileCard(withCaptures(caps), "sampled-stacks", { w: 120, rows: 20 }, FULL_CAPS), 120).join("\n");

    for (const caps of [[done], [done, inFlight], [done, abandoned]]) {
      // **Newest-first would blank on two of these three.** A capture in flight
      // and an abandoned one both carry no tree.
      expect(drawn(caps), `the completed capture is drawn beside ${String(caps.length - 1)} without a tree`)
        .toMatch(/500 ms capture/u);
    }

    // **The frame exclusions are not this card's**, and the precondition comes
    // first: a report with no self-inflicted frames satisfies the absence for
    // the wrong reason. Read on a real frame as *26 self-inflicted frames
    // excluded* under a tree of stack samples — true, about the frame ring, and
    // sitting where a caveat on the figure goes.
    // **A frame the profiler raised itself**, recorded rather than spliced: the
    // clause is generated off `excluded.selfInflicted`, so a report with the
    // field set by hand would assert the footer against a number no recorder
    // produced.
    const own = createProfiler({ tier: "spans" }, { elapsed: counterClock() });
    for (let i = 0; i < 6; i += 1) frameOf(own, "input", true, i);
    own.commit("input", true);
    own.beginFrame("input");
    { using _s = own.span("compose"); }
    own.endFrame("frame");
    const r: ProfileReport = { ...own.report(), captures: [done] };
    expect(r.excluded.selfInflicted, "the fixture has a frame to exclude").toBeGreaterThan(0);
    expect(
      linesOf(profileCard(r, "sampled-stacks", { w: 120, rows: 20 }, FULL_CAPS), 120).join("\n"),
      "and the sampled card does not borrow their clause",
    ).not.toMatch(/self-inflicted frames excluded/u);
    // The control, on a card drawn from the ring, at the same width.
    expect(
      linesOf(profileCard(r, "phases", { w: 120, rows: 20 }, FULL_CAPS), 120).join("\n"),
      "a frame card still carries it",
    ).toMatch(/self-inflicted frames excluded/u);

    // And the two sentences that are not the same sentence.
    expect(drawn([abandoned]), "abandoned names the session ending").toMatch(/abandoned/u);
    expect(drawn([]), "none taken names the verb").toMatch(/\/profile capture/u);
    expect(drawn([abandoned]), "and does not send the reader to take another").not.toMatch(/no capture taken/u);
  });
});

void WIDTHS;
