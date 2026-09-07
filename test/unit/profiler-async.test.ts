// C28 §4's async seams — the far side, measured apart from the work it causes.
//
// **Every span this component had before these was synchronous.** `trace` was
// built, tested against interleaving, and had no caller anywhere in `src/` —
// MG25 is the gate that says so, and it fired on all three decorators here the
// moment they were written and before they were wired. So the whole far-side
// round trip was time the report attributed to nothing: a frame that waited
// 400 ms on a subprocess and one that spent 400 ms in a bad adapter produced the
// same report, which is the question this component exists to answer.
//
// The rows are indexed by what a *total* cannot tell apart: waiting from
// working, one concurrent fetch from another, and a decorator that measures a
// stream from one that changes it.
import { describe, expect, it } from "vitest";

import {
  instrumentAdapters,
  instrumentTransport,
} from "../../src/shell/profiling/async-probe.js";
import { createProfiler } from "../../src/shell/profiling/recorder.js";
import { PHASE_GROUP } from "../../src/shell/profiling/types.js";
import type { Profiler, TraceFn } from "../../src/shell/profiling/types.js";
import type {
  AdapterRegistry,
  RawPatch,
  RawResult,
} from "../../src/data/adapters/types.js";
import type { TransportRouter } from "../../src/data/transport/types.js";
import type { ViewDocument } from "../../src/data/viewmodel/index.js";
import { buildGraph, fakeClock } from "../support/session.js";

/**
 * A clock the test drives, and a sleep that moves it.
 *
 * **Not fake timers.** The seams here are real promises, so the awaits have to
 * resolve on the real microtask queue while the *measured* axis stays under the
 * test's control — two clocks in a harness must agree, and the way they agree
 * is that only one of them is time.
 */
function driven(): {
  now: () => number;
  at: (ms: number) => void;
  /** Synchronous cost, for a seam that is synchronous. */
  spend: (ms: number) => void;
  wait: <T>(ms: number, value: T) => Promise<T>;
} {
  let t = 0;
  return {
    now: () => t,
    at: (ms) => void (t = ms),
    spend: (ms) => void (t += ms),
    wait: async <T>(ms: number, value: T): Promise<T> => {
      await Promise.resolve();
      t += ms;
      return value;
    },
  };
}

const profiler = (now: () => number, tier: "off" | "spans" = "spans"): Profiler =>
  createProfiler({ tier }, { elapsed: now, node: "v22.0.0", cpus: 1 });

const RAW: RawResult = Object.freeze({
  argv: Object.freeze(["ps", "--json"]),
  exitCode: 0, signal: null, stdout: {}, stdoutRaw: "{}", stderr: "",
  durationMs: 0, parseError: null, cancelled: false, timedOut: false, overflowed: false,
});

const DOC = Object.freeze({ blocks: [], meta: {} }) as unknown as ViewDocument;

/** A router whose two calls take exactly as long as the row says. */
function fakeRouter(
  clock: ReturnType<typeof driven>,
  opts: Readonly<{ invokeMs?: number; patches?: readonly RawPatch[]; gapMs?: number }> = {},
): TransportRouter & { calls: () => number; closed: () => number } {
  let calls = 0;
  let closed = 0;
  return {
    for: () => {
      calls += 1;
      return {
        invoke: async () => clock.wait(opts.invokeMs ?? 0, RAW),
        stream: (): AsyncIterable<RawPatch> => ({
          async *[Symbol.asyncIterator]() {
            try {
              for (const p of opts.patches ?? []) yield await clock.wait(opts.gapMs ?? 0, p);
            } finally {
              // An abandoned generator runs its `finally` on `return()`. A
              // decorator that does not call it leaves the subprocess reader
              // attached, and every timing assertion stays green.
              closed += 1;
            }
          },
        }),
      };
    },
    busy: false,
    inFlight: null,
    calls: () => calls,
    closed: () => closed,
  };
}

/** An adapter registry that costs a stated number of milliseconds. */
function fakeAdapters(
  clock: ReturnType<typeof driven>,
  ms: number,
): AdapterRegistry & { calls: () => number } {
  let calls = 0;
  let t = 0;
  return {
    register: () => {},
    seal: () => void (t = 0),
    get sealed(): boolean {
      return t === 0;
    },
    adapt: (): ViewDocument => {
      calls += 1;
      // **Synchronously.** The first draft used the async `wait`, so the clock
      // moved after `adapt` had returned and the sync span around it measured
      // zero — a fixture that does not respond to the thing under test, and it
      // read as the decorator being broken.
      clock.spend(ms);
      return DOC;
    },
    adaptPatch: () => null,
    calls: () => calls,
  } as unknown as AdapterRegistry & { calls: () => number };
}

describe("C28 — the seams that cross a promise", () => {
  it("T1.18 (C28 I36): the far side and the work it causes are different columns", async () => {
    const clock = driven();
    const prof = profiler(clock.now);
    const router = instrumentTransport(fakeRouter(clock, { invokeMs: 40 }), prof);
    const adapters = instrumentAdapters(fakeAdapters(clock, 5), prof);

    await router.for("ps").invoke({} as never);
    adapters.adapt(RAW, {} as never);

    const spans = prof.report().spans ?? {};
    expect(spans.transport?.sum, "the far side took forty").toBe(40);
    expect(spans.adapt?.sum, "and the adapter five").toBe(5);

    // **The groups are the row, not the numbers.** Forty-five milliseconds in
    // one column is a shrug; forty of far side and five of compute says which
    // of the two a reader can do anything about — and `adapt` was filed under
    // `far side` until F881, which put the actionable half in the column that
    // means *not yours*.
    expect(PHASE_GROUP.transport).toBe("far side");
    expect(PHASE_GROUP.adapt).toBe("compute");
  });

  it("T1.19 (C28 I36, C28 I33): concurrent live fetches attribute to their own parents", async () => {
    const clock = driven();
    const prof = profiler(clock.now);
    const trace: TraceFn = prof.trace.bind(prof);

    // **The test drives the clock, not the fetches.** The first draft let each
    // fetch advance a shared counter as it ran, and two concurrent timelines
    // cannot be represented that way: each span then measures its own duration
    // *plus whatever the other advanced while it was open*, which read as 60
    // for a 10 and a 30. One clock and two gates the test opens in order is
    // what makes the two durations independent.
    const gate = (): { promise: Promise<null>; open: () => void } => {
      let open!: () => void;
      const promise = new Promise<null>((res) => {
        open = () => res(null);
      });
      return { promise, open };
    };
    const slowGate = gate();
    const quickGate = gate();

    clock.at(0);
    const slow = trace("livefetch", () => slowGate.promise);
    const quick = trace("livefetch", () => quickGate.promise);

    clock.at(10);
    quickGate.open();
    await quick;

    clock.at(30);
    slowGate.open();
    await slow;

    // **Four figures, because only one pair of durations satisfies all four.**
    // Nesting is the failure the fork prevents, and it is visible here: a span
    // opened inside the other reports self time, so a nested 10 and 30 give
    // `min` 10, `max` 20 and `sum` 30 — same `count`, three different numbers.
    // Asserting `count` alone agrees with the defect.
    const live = (prof.report().spans ?? {}).livefetch;
    expect(live?.count, "two fetches").toBe(2);
    expect(live?.min, "the quick one is its own ten").toBe(10);
    expect(live?.max, "the slow one its own thirty").toBe(30);
    expect(live?.sum, "and neither is inside the other").toBe(40);
  });

  it("T1.20 (C28 I36): the stream span holds the wait and not the work", async () => {
    const clock = driven();
    const prof = profiler(clock.now);
    const patches: RawPatch[] = Array.from({ length: 5 }, () => ({ kind: "data", value: 1 }));
    const router = instrumentTransport(fakeRouter(clock, { patches, gapMs: 20 }), prof);

    for await (const _p of router.for("logs").stream({} as never)) {
      // The consumer's own work, which must land outside the span.
      await clock.wait(10, null);
    }

    // Five patches at 20 ms of far side and 10 of consumer: 100 against 150 of
    // wall clock. A span around the loop reports 150 whichever half is slow.
    const stream = (prof.report().spans ?? {}).stream;
    expect(stream?.count, "one span per patch, plus the one that ends it").toBe(6);
    expect(stream?.sum, "and only the far side's share of the time").toBe(100);
  });

  it("T1.21 (C28 I36): at tier off nothing is recorded and nothing is swallowed", async () => {
    const clock = driven();
    const prof = profiler(clock.now, "off");
    const inner = fakeRouter(clock, { invokeMs: 40 });
    const adapterInner = fakeAdapters(clock, 5);
    const router = instrumentTransport(inner, prof);
    const adapters = instrumentAdapters(adapterInner, prof);

    const raw = await router.for("ps").invoke({} as never);
    const doc = adapters.adapt(RAW, {} as never);

    expect(prof.report().spans ?? {}, "no span").toEqual({});
    // **An empty report is also what a decorator that dropped the call looks
    // like**, so the counts are what separate the two — and the values have to
    // come back, which no timing assertion checks.
    expect(inner.calls(), "the router was still consulted").toBe(1);
    expect(adapterInner.calls(), "and the adapter still ran").toBe(1);
    expect(raw, "and its result is the inner one").toBe(RAW);
    expect(doc).toBe(DOC);
  });

  it("T1.22 (C28 I36): the local route is compute, and is not the input path's handler", async () => {
    const clock = driven();
    const prof = profiler(clock.now);
    const trace: TraceFn = prof.trace.bind(prof);

    await trace("local", () => clock.wait(12, null));

    expect((prof.report().spans ?? {}).local?.sum).toBe(12);
    // Two names for two things. `handler` is whichever key handler
    // `router.dispatch` resolves to, which is why it sits with `decode` and
    // `route`; a local verb route produces a document in this process.
    expect(PHASE_GROUP.local).toBe("compute");
    expect(PHASE_GROUP.handler).toBe("input");
  });

  it("T1.23 (C28 I36, C06 I9): the decorated stream yields exactly what the source did", async () => {
    const clock = driven();
    const patches: RawPatch[] = [
      { kind: "data", value: 1 },
      { kind: "malformed", line: "x" },
      { kind: "degraded", reason: "r" },
      { kind: "data", value: 2 },
      { kind: "end", result: RAW },
    ];

    // **Both arms of the decorator**, because `prof.on` returns the source
    // untouched at `off` and the wrapped iterator at `spans` — two code paths,
    // and only one of them can be wrong.
    for (const tier of ["off", "spans"] as const) {
      const prof = profiler(clock.now, tier);
      const router = instrumentTransport(fakeRouter(clock, { patches, gapMs: 1 }), prof);
      const seen: RawPatch[] = [];
      for await (const p of router.for("logs").stream({} as never)) seen.push(p);

      // This is the only defect here that changes what a user reads, and every
      // timing row above stays green through it.
      expect(seen, `${tier}: same patches, same order`).toEqual(patches);
      expect(seen.filter((p) => p.kind === "end").length, `${tier}: exactly one end`).toBe(1);
      expect(seen[seen.length - 1]?.kind, `${tier}: and it is last`).toBe("end");
    }

    // **And the path a `for await` takes when the consumer stops early** — a
    // cancel, or a throw in the body. C06 I9 promises exactly one `end` on
    // every termination path, and a generator abandoned without `return()`
    // leaves the source's `finally` unrun and its reader attached. Nothing in
    // the report changes when that breaks, which is why it is asserted on the
    // source rather than on a span.
    const prof = profiler(clock.now);
    const inner = fakeRouter(clock, { patches, gapMs: 1 });
    const router = instrumentTransport(inner, prof);
    for await (const _p of router.for("logs").stream({} as never)) break;
    expect(inner.closed(), "the source is closed when the consumer leaves early").toBe(1);
  });
});

describe("C28 — the root actually applies them", () => {
  it("T1.24 (C28 I36, C22 I93): a graph built with a profiler records the local route", async () => {
    // **Every row above calls a decorator directly, and all six pass on the day
    // `construct.ts` stops applying them.** MG25 says a decorator is called
    // from somewhere in `src/`; it cannot say the right profiler reached it, or
    // that `PipelineDeps.trace` is read at the other end. This is a real graph,
    // a real shipped verb, and the span arriving in the report.
    //
    // `local` rather than `transport` because a local verb needs no far side —
    // the wiring under test is `construct.ts` → `PipelineDeps.trace` →
    // `execution.ts`, and a subprocess would only add a way for the row to fail
    // for a reason that is not the one it names.
    const clock = fakeClock();
    const prof = createProfiler(
      { tier: "spans" },
      { elapsed: clock.now, node: process.version, cpus: 1 },
    );
    const { graph } = await buildGraph({}, { columns: 100, rows: 30 }, prof);

    graph.pipeline.submit("/help");
    await Promise.resolve();
    await Promise.resolve();

    const spans = prof.report().spans ?? {};
    expect(spans.local?.count, "the local route was bracketed").toBeGreaterThanOrEqual(1);
  });
});
