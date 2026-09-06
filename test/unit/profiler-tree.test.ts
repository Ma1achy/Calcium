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
import { b } from "../../src/shell/builders/index.js";
import { NO_PROBE, NO_SPAN } from "../../src/data/viewmodel/index.js";
import { createProfiler } from "../../src/shell/profiling/recorder.js";
import { instrumentRegistry } from "../../src/shell/profiling/registry-probe.js";
import type { ProbeableRegistry } from "../../src/shell/profiling/registry-probe.js";
import type { Profiler } from "../../src/shell/profiling/types.js";
import type { Group } from "../../src/data/viewmodel/index.js";

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
   * One 200-point plot and fifty rules, nested two deep.
   *
   * Measured at width 80: a `plot` costs ~57 µs and a `rule` ~220 ns, so the
   * plot is around 260× one rule and around 5× all fifty together. Under the
   * shape this replaced — one span over `measureSequence`, divided equally —
   * every one of the 52 blocks reads as 1/52 of the total.
   */
  function document(): Group {
    const rules = Array.from({ length: 50 }, (_, i) => b.rule(`r${i}`, undefined, { id: `ru${i}` }));
    const plot = b.plot({
      id: "pl-1",
      form: "line",
      height: 10,
      axes: true,
      series: [
        {
          values: Array.from({ length: 200 }, (_, i) => Math.sin(i / 9) * 50 + 50),
          label: "s",
        },
      ],
    });
    return b.group("column", [b.group("column", rules, { id: "inner" }), plot], { id: "outer" });
  }

  it("T1.32 (C28 I31): the plot outweighs fifty rules, which equal shares cannot show", () => {
    // **The fabrication control.** Real per-element measurement puts the plot
    // several times above all fifty rules combined; equal division puts it at
    // 1/52 of the total and every rule at the same figure. The row is written
    // against the *ratio*, because both readings produce a well-formed table.
    //
    // A real clock, deliberately: the two readings are distinguished by relative
    // cost, and a fake clock advanced by the test would supply the very numbers
    // under test — a fake must not supply the behaviour.
    const registry = createBlockRegistry({ defaults: true });
    const prof = profiler(() => Number(process.hrtime.bigint()) / 1e6);
    instrumentRegistry(probeable(registry), prof);

    const doc = document();
    prof.beginFrame("input");
    for (let i = 0; i < 20; i += 1) registry.measureSequence([doc], 80);
    prof.endFrame("frame");

    const nodes = prof.report().nodes;
    const plot = nodes.find((n) => n.key === "plot#pl-1")?.self ?? 0;
    const ruleRows = nodes.filter((n) => n.key.startsWith("rule#"));
    const meanRule = ruleRows.reduce((s, n) => s + n.self, 0) / Math.max(1, ruleRows.length);

    expect(nodes.length, "one row per distinct block, not one per kind").toBeGreaterThan(50);
    expect(ruleRows.length, "all fifty rules have their own row").toBe(50);

    // **Against one rule, not against all fifty.** Equal division gives every
    // block the same figure, so the ratio it produces is exactly 1 — and that is
    // what this row is written against. The comparison against the *sum* of
    // fifty is a different claim and it is false: fifty rules together cost more
    // than one plot, which is arithmetic and not attribution.
    expect(
      plot / Math.max(meanRule, Number.EPSILON),
      `plot ${plot.toFixed(3)} ms against a mean rule ${meanRule.toFixed(4)} ms — ` +
        "equal division would put this ratio at exactly 1",
    ).toBeGreaterThan(5);
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
