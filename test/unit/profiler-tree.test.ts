// C28 I30–I34 — the instrumentation seam, and the tree it produces.
//
// **Real rows, not spec-first ones.** The five invariants above landed as prose
// in a spec commit and the code for them landed here, so a todo would be a
// deferral whose condition was already met — this repository's fourth blind spot
// arriving in its own suite.
//
// Every row constructs the state it claims. The fabrication control (I31) is the
// one that matters most: it exists because the code it replaced divided a
// sequence total equally across the blocks in it, and a fabricated number is a
// number — no assertion about a *shape* could tell the two apart. The row is a
// document in which one block is known to cost two orders of magnitude more than
// each of the others, so the two readings give answers 25× apart.
import { describe, expect, it } from "vitest";

import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { fullRegistry } from "../../src/testing/expect-document.js";
import { b } from "../../src/shell/builders/index.js";
import { NO_PROBE, NO_SPAN } from "../../src/data/viewmodel/index.js";
import { createProfiler } from "../../src/shell/profiling/recorder.js";
import type { Tier } from "../../src/shell/profiling/types.js";
import { instrumentRegistry } from "../../src/shell/profiling/registry-probe.js";
import type { ProbeableRegistry } from "../../src/shell/profiling/registry-probe.js";
import type { Profiler } from "../../src/shell/profiling/types.js";
import type { Group } from "../../src/data/viewmodel/index.js";
import type { BlockRegistry } from "../../src/presentation/blocks/index.js";
import type { ProfileReport } from "../../src/shell/profiling/types.js";
import { renderSequenceToLines } from "../../src/presentation/render-lines.js";
import { DARK_THEME, FULL_CAPS } from "../support/render.js";

/**
 * The same double cast `construct.ts` makes, and for the same reason.
 *
 * `BlockRegistry` publishes neither the mutable arrow properties the decoration
 * replaces nor the `probe` slot it sets — deliberately, because a consumer has
 * no reason to touch either and MG24 would be right to ask who reads a
 * published member nothing calls. `ProbeableRegistry` names them structurally,
 * and the cast is the seam. Written here rather than avoided, so the row
 * exercises the production path rather than a friendlier one.
 */
const probeable = (r: unknown): ProbeableRegistry => r as ProbeableRegistry;

/**
 * The registry a shell builds, instrumented — and shown to hold the kinds under
 * test before anything is asserted against it.
 *
 * **`defaults: true` does not include the plot.** `table`, `plot` and `patch`
 * are registered by C11, C12 and C25 through the public `register`, which is
 * what proves C09's extension path; `DEFAULT_DEFINITIONS` holds nineteen kinds
 * and none of the three. A document holding a plot still measures, still
 * produces rows, and still yields a node keyed `plot#pl-1` — because the
 * registry falls back to its error block and the error block wears the block's
 * id. Every figure taken from that node is the error block's.
 *
 * That is why the check is here rather than in a row: a fixture must be shown
 * to respond to the thing under test, and a fallback that answers plausibly is
 * the case where nothing else will say so.
 */
function instrumented(prof: Profiler): BlockRegistry {
  const registry = fullRegistry();
  for (const kind of ["plot", "table", "code"]) {
    if (registry.get(kind) === undefined) {
      throw new Error(`the fixture has no ${kind} renderer, so its figures are the error block's`);
    }
  }
  instrumentRegistry(probeable(registry), prof);
  return registry;
}

/** A monotonic clock the test drives, so no row asserts against a real duration. */
function fakeClock(): { now: () => number; advance: (ms: number) => void } {
  let t = 0;
  return { now: () => t, advance: (ms) => void (t += ms) };
}

function profiler(elapsed: () => number): Profiler {
  return createProfiler({ tier: "spans" }, { elapsed, node: "v22.0.0", cpus: 4 });
}

describe("C28 I30 — the interface is at L0 and only L4 implements it", () => {
  it("T1.30 (C28 I30): NO_PROBE answers every member and records nothing", () => {
    // The seam a component below `src/shell/` actually holds. If any member were
    // missing, a renderer defaulting into it would throw rather than degrade —
    // and the degradation is the whole reason the constant is frozen and shared.
    expect(NO_PROBE.on).toBe(false);
    expect(NO_PROBE.span("raster")).toBe(NO_SPAN);
    expect(Object.isFrozen(NO_PROBE)).toBe(true);
    // Every call is a no-op rather than an error, asserted by making them.
    NO_PROBE.count("x");
    NO_PROBE.gauge("y", 1);
    NO_PROBE.mark("z");
    NO_PROBE.hit("c");
    NO_PROBE.miss("c", "rev");
  });

  it("T1.31 (C28 I30): asProbe() is the L0 view and its spans reach the same recorder", () => {
    // **A narrowing view, not a second implementation.** Two implementations of
    // a span would be two things obliged to agree, and the failure is silent:
    // both record, and the numbers differ by whichever one a call site reached.
    const clock = fakeClock();
    const prof = profiler(clock.now);
    const probe = prof.asProbe();

    prof.beginFrame("input");
    {
      using _s = probe.span("raster");
      clock.advance(7);
    }
    prof.endFrame("frame");

    const spans = prof.report().spans;
    expect(spans?.raster?.count).toBe(1);
    expect(spans?.raster?.max).toBe(7);
  });
});

describe("C28 I31 — an element's cost is measured, never divided out of a total", () => {
  /**
   * Fifty rules and one expensive block, nested two deep.
   *
   * **The two seams need different documents, and finding that out corrected
   * the figures this row was written from.** The plan specified one control —
   * a 200-point plot against fifty rules, the plot at ~99 % of measure cost, on
   * the strength of a table reading `plot` 57 197 ns/measure and `rule` 220 ns.
   * Measured at width 100 in the container, warmed:
   *
   * | | plan | measured |
   * |---|---|---|
   * | `rule` measure | 220 ns | 610 ns |
   * | `plot` measure, 200 points | 57 197 ns | **980 ns** |
   * | `table` measure, 40×3 | 28 928 ns (at 20×3) | 2 880 ns |
   *
   * A plot's height is not derived — C04 §3 refuses a `line` without an
   * explicit one — so **a plot's `measure` reads a number and rasterises
   * nothing**, and there is no document in which it dominates measure. Measure
   * is flat across every kind: 0.16 µs to 8 µs, end to end.
   *
   * So the plot moves to the render seam, where the spread is real
   * (`registry.render`: plot 15 310 µs against rule 123 µs, **125×**), and the
   * measure seam takes the block that actually is expensive to measure — a
   * `notice`, which wraps its text and so measures at 34.6 µs against a rule's
   * 0.73 µs through the instrument, **23.6×**.
   *
   * Under the shape both replaced — one span over the sequence, divided equally
   * — every block reads as 1/52 of the total and every ratio here is exactly 1.
   */
  function measureDocument(): Group {
    const rules = Array.from({ length: 50 }, (_, i) => b.rule(`r${i}`, undefined, { id: `ru${i}` }));
    // `notice(tone, text, glyph?, opts?)` — the id is the *fourth* argument.
    // Passing `{ id }` third types as a `Glyph` and is silently dropped, which
    // is how the first draft of this row asserted against `notice#notice-1`.
    const wordy = b.notice("info", "some long wrapping sentence ".repeat(40), undefined, {
      id: "nt",
    });
    return b.group("column", [b.group("column", rules, { id: "inner" }), wordy], { id: "outer" });
  }

  function renderDocument(): Group {
    const rules = Array.from({ length: 50 }, (_, i) => b.rule(`r${i}`, undefined, { id: `ru${i}` }));
    const plot = b.plot({
      id: "pl-1",
      form: "line",
      height: 40,
      axes: true,
      series: [
        {
          values: Array.from({ length: 2000 }, (_, i) => Math.sin(i / 9) * 50 + 50),
          label: "s",
        },
      ],
    });
    return b.group("column", [b.group("column", rules, { id: "inner" }), plot], { id: "outer" });
  }

  it("T1.32 (C28 I31): on the measure seam, a wrapping notice outweighs a rule", () => {
    // **The fabrication control, on the seam the fabrication was on.**
    // `spent / blocks.length` gave every block in a sequence the same figure, so
    // any ratio between two blocks it produces is exactly 1. Measured here at
    // 23.6×; the threshold is 5, well clear of both.
    //
    // A real clock, deliberately: the two readings are distinguished by relative
    // cost, and a fake clock advanced by the test would supply the very numbers
    // under test — a fake must not supply the behaviour. Warmed first for the
    // same reason the phase rows are: an unwarmed first configuration measures
    // the JIT and nothing else.
    const prof = profiler(() => Number(process.hrtime.bigint()) / 1e6);
    const registry = instrumented(prof);

    const doc = measureDocument();
    for (let i = 0; i < 50; i += 1) registry.measureSequence([doc], 100);
    prof.beginFrame("input");
    for (let i = 0; i < 20; i += 1) registry.measureSequence([doc], 100);
    prof.endFrame("frame");

    const nodes = prof.report().nodes;
    const notice = nodes.find((n) => n.key === "notice#nt")?.self ?? 0;
    const ruleRows = nodes.filter((n) => n.key.startsWith("rule#"));
    const meanRule = ruleRows.reduce((s, n) => s + n.self, 0) / Math.max(1, ruleRows.length);

    expect(nodes.length, "one row per distinct block, not one per kind").toBeGreaterThan(50);
    expect(ruleRows.length, "all fifty rules have their own row").toBe(50);

    // **Against one rule, not against all fifty.** The comparison against the
    // *sum* of fifty is a different claim and it is false: fifty rules together
    // cost more than one notice, which is arithmetic and not attribution.
    expect(
      notice / Math.max(meanRule, Number.EPSILON),
      `notice ${notice.toFixed(3)} ms against a mean rule ${meanRule.toFixed(4)} ms — ` +
        "equal division would put this ratio at exactly 1",
    ).toBeGreaterThan(5);
  });

  it("T1.43 (C28 I31): on the render seam, the plot is the largest node and not one share of 52", () => {
    // **The other half, and the one a reader of the report actually opens.**
    // Render is where the spread lives — `registry.render` costs 123 µs for a
    // rule and 15 310 µs for a 2 000-point plot at height 40 — so this is the
    // row that says the element table names what to fix.
    const prof = profiler(() => Number(process.hrtime.bigint()) / 1e6);
    const registry = instrumented(prof);
    const doc = renderDocument();
    const ctx = { width: 100, theme: DARK_THEME, capabilities: FULL_CAPS, focus: null, tick: 0 };

    for (let i = 0; i < 5; i += 1) void registry.render(doc, ctx);
    prof.beginFrame("input");
    for (let i = 0; i < 5; i += 1) void registry.render(doc, ctx);
    prof.endFrame("frame");

    const nodes = prof.report().nodes;
    const plot = nodes.find((n) => n.key === "plot#pl-1")?.self ?? 0;
    const leaves = nodes.filter((n) => !n.key.startsWith("group#"));
    const ruleRows = nodes.filter((n) => n.key.startsWith("rule#"));
    const meanRule = ruleRows.reduce((s, n) => s + n.self, 0) / Math.max(1, ruleRows.length);

    // **The rank, which needs no threshold at all.** Equal division gives all 52
    // an identical figure, so the largest is whichever the scan reaches first —
    // a rule. Measured, the plot holds 60 % of Σ self on its own.
    const widest = leaves.reduce((a, n) => (n.self > a.self ? n : a), leaves[0] ?? { key: "", self: 0 });
    expect(widest.key, "the most expensive leaf in the document").toBe("plot#pl-1");
    expect(
      plot / Math.max(meanRule, Number.EPSILON),
      `plot ${plot.toFixed(2)} ms against a mean rule ${meanRule.toFixed(4)} ms — ` +
        "equal division would put this ratio at exactly 1",
    ).toBeGreaterThan(20);
  });

  it("T1.33 (C28 I31): calls is kept beside frames, so intra-frame repetition is visible", () => {
    // **The column no duration can replace.** A node measured four times cheaply
    // and one measured once expensively carry the same self time; only
    // `calls / frames` separates them, and repeated work is a defect at any cost.
    const registry = createBlockRegistry({ defaults: true });
    const prof = profiler(() => Number(process.hrtime.bigint()) / 1e6);
    instrumentRegistry(probeable(registry), prof);

    const doc = b.group("column", [b.rule("a", undefined, { id: "r1" })], { id: "g1" });
    prof.beginFrame("input");
    for (let i = 0; i < 3; i += 1) registry.measureSequence([doc], 80);
    prof.endFrame("frame");

    const rule = prof.report().nodes.find((n) => n.key === "rule#r1");
    expect(rule?.frames, "one frame was open for all three passes").toBe(1);
    expect(rule?.calls, "three sequence passes reached the same block").toBeGreaterThanOrEqual(3);
    expect(
      (rule?.calls ?? 0) / (rule?.frames ?? 1),
      "above 1 is work repeated inside one frame",
    ).toBeGreaterThan(1);
  });

  it("T1.34 (C28 I31): a parent reports self time, so a child is not counted twice", () => {
    // An inclusive parent makes the outermost node the widest bar in every tree
    // ever drawn, which tells a reader what they already knew before opening it.
    const clock = fakeClock();
    const prof = profiler(clock.now);

    prof.beginFrame("input");
    {
      using _outer = prof.element("group", "g");
      clock.advance(2); // the parent's own work
      {
        using _inner = prof.element("plot", "p");
        clock.advance(8);
      }
      clock.advance(1);
    }
    prof.endFrame("frame");

    const nodes = prof.report().nodes;
    const parent = nodes.find((n) => n.key === "group#g");
    const child = nodes.find((n) => n.key === "plot#p");
    expect(child?.self).toBe(8);
    expect(parent?.self, "11 inclusive minus the child's 8").toBe(3);
    expect(parent?.total, "the inclusive figure is still available, separately").toBe(11);
  });
});

describe("C28 I31 — what each tier costs the seam it decorates", () => {
  /**
   * A profiler that counts what the seam asked of it.
   *
   * **The report cannot answer this question**, which is what the mutation pass
   * showed: deleting the `prof.on` guard from `registry.measure` so the disabled
   * path takes the recording arm **survived** an assertion that `off` produces
   * no nodes. It survives because `element()` carries its own tier guard and
   * returns `NO_SPAN`, so the report is identical either way and the row was
   * reading the recorder's guard while claiming to read the seam's.
   *
   * What the seam's guard buys is not a figure in the report — it is the
   * `using` scaffolding a call into `measured()` allocates whether or not the
   * span is opened (F867). The only thing that distinguishes the two is whether
   * the call happened, so that is what is counted.
   */
  function counting(prof: Profiler, tally: { element: number }): Profiler {
    return new Proxy(prof, {
      get(target, key) {
        if (key === "element") {
          return (kind: string, id: string): Disposable => {
            tally.element += 1;
            return target.element(kind, id);
          };
        }
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? (value as () => unknown).bind(target) : value;
      },
    });
  }

  function sequenceAt(tier: Tier, tally = { element: 0 }): ProfileReport {
    const prof = createProfiler(
      { tier },
      { elapsed: () => Number(process.hrtime.bigint()) / 1e6, node: process.version, cpus: 1 },
    );
    const registry = instrumented(counting(prof, tally));
    const doc = b.group("column", [b.rule("a", undefined, { id: "r1" })], { id: "g1" });
    prof.beginFrame("input");
    registry.measureSequence([doc], 100);
    prof.endFrame("frame");
    return prof.report();
  }

  it("T1.44 (C28 I31): the counters tier counts, which is the whole of what it is for", () => {
    // **A tier named after counters at which no counter could fire.** Every
    // wrapper this file installs was gated on `prof.on`, and `on` is *spanning*
    // — rank 2 — so at `counters` the seam took the untouched arm and recorded
    // nothing at all. The tier existed, the code read as correct, and the one
    // figure it is named for was structurally unreachable.
    //
    // The three tiers are asserted together because each alone is satisfied by
    // the wrong reading: `off` empty is also what a broken `counters` looks
    // like, and `counters` non-empty is also what a `counters` that opens spans
    // looks like.
    const offTally = { element: 0 };
    const off = sequenceAt("off", offTally);
    expect(off.counters["measure.sequences"], "off records nothing").toBeUndefined();
    expect(off.nodes.length, "and opens no element").toBe(0);
    // **The call, not the consequence.** `nodes.length` is 0 either way; only
    // this separates a seam that declined from a recorder that refused.
    expect(offTally.element, "and the seam did not ask").toBe(0);

    const counters = sequenceAt("counters");
    expect(counters.counters["measure.sequences"], "the sequence was walked once").toBe(1);
    expect(counters.gauges["measure.sequence.blocks"]?.max, "and it held one block").toBe(1);
    expect(
      counters.nodes.length,
      "…and no element span, which is what separates this tier from the next",
    ).toBe(0);

    const countersTally = { element: 0 };
    sequenceAt("counters", countersTally);
    expect(countersTally.element, "counters does not ask either").toBe(0);

    const spansTally = { element: 0 };
    const spans = sequenceAt("spans", spansTally);
    expect(spans.counters["measure.sequences"], "spans counts too, it does not replace").toBe(1);
    expect(spans.nodes.length, "and this is the tier that opens elements").toBeGreaterThan(0);
    expect(spansTally.element, "…because this is the tier that asks").toBeGreaterThan(0);
  });
});

describe("C28 I32 — a tree per frame, retained only for the worst", () => {
  it("T1.35 (C28 I32): an ordinary frame's record carries no tree member at all", () => {
    // **Absent rather than empty.** An empty tree reads as *this frame was not
    // nested*, which is a measurement; absence reads as *not retained*, which is
    // the truth. The row asserts the key is missing, not that it is falsy.
    const clock = fakeClock();
    const prof = createProfiler(
      { tier: "spans", worst: 1 },
      { elapsed: clock.now, node: "v22.0.0", cpus: 4 },
    );

    for (const cost of [1, 50]) {
      prof.beginFrame("input");
      using _s = prof.element("plot", "p");
      clock.advance(cost);
      _s[Symbol.dispose]();
      prof.endFrame("frame");
    }

    const worst = prof.report().worst;
    expect(worst.length, "worst: 1 keeps one").toBe(1);
    expect(worst[0]?.work, "the 50 ms frame, not the 1 ms one").toBe(50);
    expect(worst[0]?.tree?.name, "the kept frame has its tree").toBeDefined();
  });

  it("T1.36 (C28 I32): the retained tree nests, and Σ self over it is the frame's work", () => {
    const clock = fakeClock();
    const prof = createProfiler(
      { tier: "spans", worst: 4 },
      { elapsed: clock.now, node: "v22.0.0", cpus: 4 },
    );

    prof.beginFrame("input");
    {
      using _a = prof.span("compose");
      clock.advance(1);
      {
        using _b = prof.span("measure");
        clock.advance(4);
        {
          using _c = prof.span("elements");
          clock.advance(10);
        }
      }
    }
    prof.endFrame("frame");

    // **The root is the frame, not the first span opened inside it.**
    // `beginFrame` opens `frame` and every span taken before `endFrame` is
    // beneath it, which is what makes a retained tree readable as one frame
    // rather than as a forest.
    const tree = prof.report().worst[0]?.tree;
    expect(tree?.name).toBe("frame");
    const compose = tree?.children[0];
    expect(compose?.name).toBe("compose");
    expect(compose?.children[0]?.name).toBe("measure");
    expect(compose?.children[0]?.children[0]?.name).toBe("elements");

    const sumSelf = (n: NonNullable<typeof tree>): number =>
      n.self + n.children.reduce((s, c) => s + sumSelf(c), 0);
    expect(
      tree === undefined ? -1 : sumSelf(tree),
      "1 + 4 + 10, with nothing double-counted",
    ).toBe(15);
  });
});

describe("C28 I33 — a span survives an await, and the store is built lazily", () => {
  it("T1.37 (C28 I33): two interleaved traces across an await both report their own duration", async () => {
    // **The case the previous shape recorded as nothing, silently.** It held one
    // pointer and dropped any close that did not match it, which is precisely
    // what interleaving produces — so every async span it could have taken
    // reported no error and no measurement.
    const clock = fakeClock();
    const prof = profiler(clock.now);

    prof.beginFrame("input");
    const slow = prof.trace("transport", async () => {
      clock.advance(30);
      await Promise.resolve();
      clock.advance(70);
    });
    const quick = prof.trace("adapt", async () => {
      clock.advance(0);
      await Promise.resolve();
      clock.advance(0);
    });
    await Promise.all([slow, quick]);
    prof.endFrame("frame");

    const spans = prof.report().spans;
    expect(spans?.transport?.count).toBe(1);
    expect(spans?.adapt?.count).toBe(1);
    // The two are distinguishable, which is the whole claim: one pointer would
    // have given the outer close to the inner span or dropped it entirely.
    expect(spans?.transport?.max).toBeGreaterThan(spans?.adapt?.max ?? Infinity);
  });

  it("T1.38 (C28 I33): the async store is built on the transition to a recording tier and not below it", () => {
    // Merely *constructing* an `AsyncLocalStorage` taxes every await in the
    // process — 38 ns to 59 ns on Node v22.23.2, about 55 % — used or not. So the
    // line is drawn at the tier: an application that does not record durations
    // pays nothing, and one that does pays once.
    //
    // **The tier and not the first `trace`**, which is I33 as written and is the
    // narrower claim of the two available. Deferring to the first trace would
    // put the construction inside whatever call happened to be first, and that
    // call would carry the cost of every await in the process starting.
    const clock = fakeClock();
    const counting = createProfiler(
      { tier: "counters" },
      { elapsed: clock.now, node: "v22.0.0", cpus: 4 },
    );
    counting.count("x");
    expect(counting.report().overhead.asyncEnabled, "counters records no durations").toBe(false);

    const off = createProfiler({ tier: "off" }, { elapsed: clock.now, node: "v22.0.0", cpus: 4 });
    expect(off.report().overhead.asyncEnabled, "off pays for nothing at all").toBe(false);

    const spanning = profiler(clock.now);
    expect(
      spanning.report().overhead.asyncEnabled,
      "spans records durations, so the store exists before any trace does",
    ).toBe(true);
  });
});

describe("C28 I34 — the report prices the instrument", () => {
  it("T1.39 (C28 I34): overhead names the spans, the measured clock and the estimate", () => {
    const clock = fakeClock();
    const prof = profiler(clock.now);
    prof.beginFrame("input");
    for (let i = 0; i < 5; i += 1) {
      using _s = prof.span("paint");
      clock.advance(1);
    }
    prof.endFrame("frame");

    const oh = prof.report().overhead;
    expect(oh.spans, "five spans, plus the frame's own").toBeGreaterThanOrEqual(5);
    // `clockNs` is measured against the *injected* clock, so a fake one is
    // cheap and the figure is small — the row asserts it was taken, not what it
    // came to. Asserting a duration here would be asserting the host.
    expect(oh.clockNs).toBeGreaterThanOrEqual(0);
    expect(oh.estimateMs, "spans × 2 reads × clock").toBeCloseTo((oh.spans * 2 * oh.clockNs) / 1e6);
  });
});

describe("C28 I30 — a component's own phases, and the gauge that makes them a claim", () => {
  /**
   * Two documents identical but for the sample count, rendered through the real
   * registry and the real theme.
   *
   * **A ratio, not a duration.** What the phases claim is that they scale with
   * different things, and only a comparison can show that — a single render's
   * figures are satisfied by a renderer that attributes everything to one phase.
   */
  function renderAt(samples: number, height = 12, renders = 5): ProfileReport {
    const prof = profiler(() => Number(process.hrtime.bigint()) / 1e6);
    const registry = instrumented(prof);

    const doc = [
      b.plot({
        id: "p",
        form: "line",
        height,
        axes: true,
        series: [
          {
            values: Array.from({ length: samples }, (_, i) => Math.sin(i / 9) * 50 + 50),
            label: "s",
          },
        ],
      }),
      b.table({
        id: "t",
        columns: [b.col("a"), b.col("b"), b.col("c")],
        rows: Array.from({ length: 40 }, (_, i) => b.row(`r${i}`, { a: `x${i}`, b: "y", c: "z" })),
      }),
      b.code("typescript", "const x = 1;\n".repeat(60), { id: "c" }),
    ];

    // **The second half of the fixture guard, and it caught the first draft.**
    // `code(language, text)` takes the language first, so a swapped pair is two
    // strings in the wrong order and no type error. The block became one row of
    // source titled `const x = 1;…` — and it still tokenised, still painted, and
    // still recorded `code.tokenise` and `code.paint`, so the phase row below
    // passed on it. A block measuring far under what its content implies is the
    // shape that satisfies every assertion about names.
    for (const [block, least] of [
      [doc[0], height],
      [doc[1], 40],
      [doc[2], 60],
    ] as const) {
      if (block === undefined) throw new Error("the fixture lost a block");
      const rows = registry.measure(block, 100);
      if (rows < least) {
        throw new Error(
          `${block.kind}#${block.id} measured ${rows} rows against at least ${least} of content — ` +
            "the fixture is not the document it reads as",
        );
      }
    }

    // **Warmed before anything is recorded.** The first configuration measured
    // in a process pays the JIT for every one after it, and the first draft of
    // T1.42 read 1.98 then 1.58 on two runs of identical code because of it. A
    // ratio taken across two unwarmed configurations is a ratio between two
    // compilation states.
    for (let i = 0; i < 20; i += 1) {
      renderSequenceToLines(registry, doc, 100, { theme: DARK_THEME, capabilities: FULL_CAPS });
    }

    prof.beginFrame("input");
    for (let i = 0; i < renders; i += 1) {
      renderSequenceToLines(registry, doc, 100, {
        theme: DARK_THEME,
        capabilities: FULL_CAPS,
        probe: prof.asProbe(),
      });
    }
    prof.endFrame("frame");
    return prof.report();
  }

  /**
   * The same three plots rendered round-robin into three recorders.
   *
   * **Contemporaneous, because sequential was not reproducible.** Measuring one
   * configuration to completion and then the next makes the ratio between them
   * a ratio between two machine states: adding an unrelated test *before* this
   * one moved the samples axis from a measured 1.0–3.8× to 6.0× and failed the
   * row. Interleaving puts every configuration through the same JIT, the same
   * GC and the same scheduler, so drift is common-mode and divides out.
   */
  function areasInterleaved(
    configs: readonly (readonly [samples: number, height: number])[],
    renders: number,
  ): readonly number[] {
    const registry = fullRegistry();
    const docs = configs.map(([samples, height]) => [
      b.plot({
        id: "p",
        form: "line",
        height,
        axes: true,
        series: [
          { values: Array.from({ length: samples }, (_, i) => Math.sin(i / 9) * 50 + 50), label: "s" },
        ],
      }),
    ]);
    const profs = configs.map(() =>
      profiler(() => Number(process.hrtime.bigint()) / 1e6),
    );

    // **Forty rounds, and the number was measured rather than chosen.** At ten,
    // the first run in a cold process read the base configuration at 30.4 ms
    // against 5.8–10.5 in every later run — the cheapest configuration absorbs
    // the compilation, and it is the denominator. Run inside this file the row
    // passed anyway, borrowing warmth from the tests above it, which is the
    // reliance that broke when a test was inserted before it.
    for (let i = 0; i < 40; i += 1) {
      for (const doc of docs) {
        renderSequenceToLines(registry, doc, 100, { theme: DARK_THEME, capabilities: FULL_CAPS });
      }
    }

    for (const prof of profs) prof.beginFrame("input");
    for (let i = 0; i < renders; i += 1) {
      for (const [j, doc] of docs.entries()) {
        renderSequenceToLines(registry, doc, 100, {
          theme: DARK_THEME,
          capabilities: FULL_CAPS,
          probe: profs[j]!.asProbe(),
        });
      }
    }
    for (const prof of profs) prof.endFrame("frame");

    return profs.map((prof) => prof.report().spans?.["plot.area"]?.sum ?? 0);
  }

  it("T1.40 (C28 I30): each kind's phases are recorded under its own names", () => {
    const r = renderAt(200);
    const named = Object.entries(r.spans ?? {})
      .filter(([, h]) => (h?.count ?? 0) > 0)
      .map(([k]) => k);

    // The plot's three, the table's two, the code's two — and the plot's form,
    // which is what says a `line` and a `surface` are not one renderer.
    for (const phase of [
      "plot.layout",
      "plot.area",
      "plot.furniture",
      "plot.form.line",
      "table.plan",
      "table.rows",
      "code.tokenise",
      "code.paint",
    ]) {
      expect(named, `${phase} recorded`).toContain(phase);
    }
  });

  it("T1.41 (C28 I30): the gauges state the size each phase's cost is against", () => {
    const r = renderAt(200);
    // Without these a duration says a plot was slow. With them it says whether
    // it is linear, which is the difference between a figure and a finding.
    expect(r.gauges["plot.samples"]?.max).toBe(200);
    expect(r.gauges["plot.series"]?.max).toBe(1);
    expect(r.gauges["table.rows"]?.max).toBe(40);
    expect(r.gauges["table.columns"]?.max).toBe(3);
    expect(r.gauges["code.rows"]?.max).toBe(60);
  });

  it("T1.42 (C28 I30): the raster tracks the box, not the sample count", () => {
    // **The control that makes the split mean something**, and the row that had
    // to be rewritten twice. A renderer attributing everything to one phase
    // satisfies T1.40 and T1.41 exactly, so only a comparison separates them —
    // and the first draft asserted the obvious comparison, that ten times the
    // data multiplies the raster. The plot does not work that way.
    //
    // `plot.area.cells`, one render each, width 100:
    //
    // | samples | height | cells |
    // |---|---|---|
    // | 200 | 4 | 700 |
    // | 2 000 | 4 | **700** |
    // | 20 000 | 4 | **700** |
    // | 200 | 40 | 4 300 |
    //
    // The downsampler collapses a series onto the box's columns before anything
    // is drawn, so **100× the data rasterises the identical cell** and the box
    // is the only axis the raster has. That is a finding about C12, and it is
    // the kind the phase split exists to produce: "the plot is slow because of
    // its height" is actionable and "the plot is slow" is not.
    const cellsOf = (r: ProfileReport): number => r.gauges["plot.area.cells"]?.max ?? -1;

    // **The exact half, and it needs no clock.** Two configurations differing
    // by 100× in data produce the same number, so an equality holds here where
    // every timing assertion is a threshold.
    expect(cellsOf(renderAt(2000, 4, 1)), "10× the data, the same raster").toBe(
      cellsOf(renderAt(200, 4, 1)),
    );
    expect(cellsOf(renderAt(20000, 4, 1)), "100× the data, still the same raster").toBe(
      cellsOf(renderAt(200, 4, 1)),
    );
    expect(
      cellsOf(renderAt(200, 40, 1)) / cellsOf(renderAt(200, 4, 1)),
      "and the box is the axis it does have",
    ).toBeGreaterThan(3);

    // **The half the gauge cannot reach.** Equal cells is not equal work: a
    // renderer could visit all 20 000 samples per cell and produce this table
    // unchanged. So the cost is compared too — at the *same* multiplier on each
    // axis, which is what the second draft got wrong by putting 3.3× the height
    // against 10× the samples and reading the two raw ratios against each other.
    //
    // Six cold runs of the interleaved shape, 10× on each axis: height moved
    // the area 4.7–8.9× and the samples 1.6–2.7×, height winning within every
    // run by **2.16× at the closest**. The margin asserted is 1.5, so the worst
    // observed run clears it by 44 %.
    const [base, tall, dense] = areasInterleaved(
      [
        [200, 4],
        [200, 40],
        [2000, 4],
      ],
      15,
    ) as readonly [number, number, number];
    const byHeight = tall / Math.max(base, Number.EPSILON);
    const bySamples = dense / Math.max(base, Number.EPSILON);

    expect(
      byHeight,
      `at 10× each: height ${byHeight.toFixed(1)}× against samples ${bySamples.toFixed(1)}×`,
    ).toBeGreaterThan(bySamples * 1.5);

    // **A third assertion stood here and was removed rather than retuned.** It
    // read `bySamples > 1.2` — the samples are not free either — and failed one
    // run in five at 1.108. Retuning it would have been wrong whatever the
    // number: it asserts the renderer is *worse* than flat in the sample count,
    // so a downsampler that got better at ignoring the series would fail it.
    // What it was guarding — that the renderer reads the series at all — is
    // already exact, in T1.41's `plot.samples` gauge.
  });
});
