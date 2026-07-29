// C08 tier 1 — unit. The harness half (§7): the resolver, the modes, the
// generator, the provenance rules.
//
// The **W** rows of C08 §7 — a run advancing epochs, a mutating verb changing
// the world, a world at scale — are not here and are not deferred. They assert
// Prism-domain behaviour, they belong to `prism-tui` and `docker-tui` (A04 §1),
// and tagging them was the point of the spec commit that preceded this one. A
// backlog nothing in this repo can ever clear is one people learn to scroll past.
import { describe, expect, it } from "vitest";
import {
  MANIFEST_VERB,
  authoredRatio,
  checkProvenance,
  createFixtureHandler,
  createRng,
  formatRatio,
} from "../../src/data/fixtures/index.js";
import type { RawResult } from "../../src/data/transport/index.js";
import { fixture as manifestFixture } from "../support/manifest.js";
import { invocation, recorded, result } from "../support/transport.js";
import { fakeWorld, steppableClock, worldResult } from "../support/world.js";

const MANIFEST = manifestFixture();

function handler(over: Partial<Parameters<typeof createFixtureHandler>[0]> = {}) {
  return createFixtureHandler({ fixtures: [], manifest: MANIFEST, ...over });
}

async function answer(
  produced: RawResult | AsyncIterable<RawResult> | ReturnType<ReturnType<typeof handler>>,
): Promise<RawResult> {
  return produced as RawResult;
}

describe("C08 §3 — the seeded generator", () => {
  it("T1.14 (I3): same seed, same sequence, over a thousand draws", () => {
    const a = createRng(42);
    const b = createRng(42);
    const left = Array.from({ length: 1000 }, () => a.next());
    const right = Array.from({ length: 1000 }, () => b.next());
    expect(left).toEqual(right);
  });

  it("T1.14 (I3): different seeds diverge", () => {
    const a = Array.from({ length: 50 }, ((r) => () => r.next())(createRng(1)));
    const b = Array.from({ length: 50 }, ((r) => () => r.next())(createRng(2)));
    expect(a).not.toEqual(b);
  });

  it("T1.14: every draw is in [0, 1)", () => {
    const rng = createRng(7);
    for (let i = 0; i < 5000; i += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("T1.14: `int` stays in range, and an empty range answers `lo`", () => {
    const rng = createRng(9);
    for (let i = 0; i < 1000; i += 1) {
      const value = rng.int(3, 7);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThan(7);
    }
    // Not a throw: `int(3, 3)` means "none", and a world generator would
    // otherwise carry a guard at every call site for the empty case.
    expect(rng.int(3, 3)).toBe(3);
    expect(rng.int(5, 1)).toBe(5);
  });

  it("T1.14: a float or a huge seed still gives a reproducible sequence", () => {
    // Coerced to int32 at construction. Untouched, the sequence would depend on
    // floating-point representation and "same seed, same world" would hold
    // everywhere except one machine.
    expect(createRng(1.5).next()).toBe(createRng(1).next());
    expect(createRng(2 ** 40 + 3).next()).toBe(createRng((2 ** 40 + 3) | 0).next());
  });

  it("T1.14: `pick` from an empty array throws rather than returning undefined", () => {
    expect(() => createRng(1).pick([])).toThrow(/nothing to choose/);
  });
});

describe("C08 §2 — provenance", () => {
  it("T1.x (I1): an authored fixture without a note is a problem", () => {
    const problems = checkProvenance([
      recorded({ id: "a", provenance: "authored", capturedAt: null }),
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.message).toMatch(/authored without a note/);
  });

  it("T1.x (I1): an authored fixture with a note is clean", () => {
    const problems = checkProvenance([
      recorded({
        id: "a",
        provenance: "authored",
        capturedAt: null,
        note: "the daemon cannot be made to emit a truncated stream on demand",
      }),
    ]);
    expect(problems).toEqual([]);
  });

  it("T1.x: a blank note does not satisfy the rule", () => {
    const problems = checkProvenance([
      recorded({ id: "a", provenance: "authored", capturedAt: null, note: "   " }),
    ]);
    expect(problems).toHaveLength(1);
  });

  it("T1.x: a recording with no capturedAt, and an authored one that has one", () => {
    const problems = checkProvenance([
      recorded({ id: "a", capturedAt: null }),
      recorded({ id: "b", provenance: "authored", note: "why", capturedAt: "2026-01-01T00:00:00Z" }),
    ]);
    expect(problems.map((p) => p.fixtureId)).toEqual(["a", "b"]);
  });

  it("T1.x: two fixtures with one id", () => {
    const problems = checkProvenance([recorded({ id: "same" }), recorded({ id: "same" })]);
    expect(problems[0]?.message).toMatch(/duplicate id/);
  });

  it("T1.x (§2): the authored ratio is per verb, worst first", () => {
    const rows = authoredRatio([
      recorded({ id: "1", verb: "ps" }),
      recorded({ id: "2", verb: "ps" }),
      recorded({ id: "3", verb: "logs", provenance: "authored", capturedAt: null, note: "x" }),
      recorded({ id: "4", verb: "logs", provenance: "authored", capturedAt: null, note: "x" }),
      recorded({ id: "5", verb: "logs" }),
    ]);
    expect(rows.map((r) => r.verb)).toEqual(["logs", "ps"]);
    expect(rows[0]?.flagged).toBe(true);
    expect(rows[1]?.flagged).toBe(false);
  });

  it("T1.x (§2): the report names the majority-authored verb", () => {
    const lines = formatRatio(
      authoredRatio([
        recorded({ id: "1", verb: "logs", provenance: "authored", capturedAt: null, note: "x" }),
        recorded({ id: "2", verb: "ps" }),
      ]),
    );
    expect(lines[0]).toContain("2 fixtures · 1 authored (50%)");
    expect(lines.join("\n")).toContain("logs is majority-authored");
  });
});

describe("C08 §4 — query resolution", () => {
  it("T1.10: a verb with both a fixture and world support replays the fixture", async () => {
    const world = fakeWorld({ ps: worldResult() });
    const h = handler({ fixtures: [recorded()], world });
    const answered = await answer(h(invocation({ verb: "ps", argv: ["ps"] })));

    expect(answered.stdout).toEqual({ rows: [] });
    // Route 1 short-circuits: the world was never consulted at all.
    expect(world.queried).toEqual([]);
  });

  it("T1.11 (I7): `query` returning null falls through to the generic failure", async () => {
    const world = fakeWorld({});
    const h = handler({ world });
    const answered = await answer(h(invocation({ verb: "unknown", argv: ["unknown"] })));

    expect(world.queried).toEqual(["unknown"]);
    expect(answered.exitCode).toBe(1);
    expect(answered.stdout).toMatchObject({ error: { code: "NO_FIXTURE" } });
  });

  it("T1.9 (I7): no fixture and no world → a failure result, not a throw", async () => {
    const answered = await answer(handler()(invocation({ verb: "nope", argv: ["nope"] })));
    expect(answered.exitCode).toBe(1);
    expect(answered.stdout).toMatchObject({ error: { message: expect.stringContaining("nope") } });
  });

  it("T1.9: the route-3 failure carries ErrorLike and a remediation", async () => {
    // B5's floor, so it degrades through C07's ordinary failure path and renders
    // as a notice rather than as a crash mid-presentation.
    const answered = await answer(handler()(invocation({ verb: "scale", argv: ["scale"] })));
    const error = (answered.stdout as { error: { message: string; remediation: string } }).error;
    expect(error.message).toContain("scale");
    expect(error.remediation).toContain("record --against");
  });

  it("T1.x: the world answers when no fixture matches", async () => {
    const world = fakeWorld({ ps: worldResult() });
    const answered = await answer(handler({ world })(invocation({ verb: "ps", argv: ["ps"] })));
    expect(answered.stdout).toEqual({ from: "world" });
  });

  it("T1.x: argv is part of the match, not just the verb", async () => {
    const h = handler({ fixtures: [recorded({ argv: ["ps", "--mine"] })] });
    const miss = await answer(h(invocation({ verb: "ps", argv: ["ps"] })));
    expect(miss.exitCode).toBe(1);

    const hit = await answer(h(invocation({ verb: "ps", argv: ["ps", "--mine"] })));
    expect(hit.exitCode).toBe(0);
  });
});

describe("C08 §1a — the manifest endpoint", () => {
  it("T2.9 (I11): `__manifest__` is answered from the supplied manifest", async () => {
    const answered = await answer(
      handler()(invocation({ verb: MANIFEST_VERB, argv: [MANIFEST_VERB] })),
    );
    expect(answered.exitCode).toBe(0);
    expect(answered.stdout).toEqual(JSON.parse(JSON.stringify(MANIFEST)));
  });

  it("T2.9: it is answered before the routes, so no app records its own", async () => {
    // A fixture claiming the verb does not win. B6 is a property of any far
    // side, and answering it from route 1 would make every app record it.
    const world = fakeWorld({ [MANIFEST_VERB]: worldResult() });
    const h = handler({ fixtures: [recorded({ verb: MANIFEST_VERB, argv: [MANIFEST_VERB] })], world });
    const answered = await answer(h(invocation({ verb: MANIFEST_VERB, argv: [MANIFEST_VERB] })));

    expect(answered.stdout).toEqual(JSON.parse(JSON.stringify(MANIFEST)));
    expect(world.queried).toEqual([]);
  });
});

describe("C08 §3 — modes", () => {
  it("T1.8 (I6): the default is frozen, and frozen refuses to advance", () => {
    const world = fakeWorld();
    const h = handler({ world });
    expect(() => h.advance(100)).toThrow(/"frozen" mode/);
    expect(world.deltas).toEqual([]);
  });

  it("T1.8 (I6): stepped moves only when asked", async () => {
    const world = fakeWorld({ ps: worldResult() });
    const h = handler({ world, mode: "stepped" });

    await answer(h(invocation({ verb: "ps", argv: ["ps"] })));
    expect(world.deltas).toEqual([]);

    h.advance(250);
    expect(world.deltas).toEqual([250]);
  });

  it("T1.13 (I4): live without a clock throws at construction", () => {
    expect(() => handler({ mode: "live" })).toThrow(/requires a clock/);
  });

  it("T1.13 (I17): a clock passed to a non-live mode is refused, not ignored", () => {
    // Ignoring it produces a demo that does not move for reasons nothing
    // reports, which is worse than a construction error.
    expect(() => handler({ mode: "stepped", clock: () => 0 })).toThrow(/takes no clock/);
  });

  it("T1.15 (I17): live advances by the clock's elapsed reading, per query", async () => {
    const clock = steppableClock(1_000);
    const world = fakeWorld({ ps: worldResult() });
    const h = handler({ world, mode: "live", clock: clock.now });

    // The first query establishes the baseline; there is no elapsed yet.
    await answer(h(invocation({ verb: "ps", argv: ["ps"] })));
    expect(world.deltas).toEqual([]);

    clock.set(1_400);
    await answer(h(invocation({ verb: "ps", argv: ["ps"] })));
    expect(world.deltas).toEqual([400]);

    clock.set(1_900);
    await answer(h(invocation({ verb: "ps", argv: ["ps"] })));
    expect(world.deltas).toEqual([400, 500]);
  });

  it("T1.15 (I17): a clock that does not move produces no motion", async () => {
    const clock = steppableClock(1_000);
    const world = fakeWorld({ ps: worldResult() });
    const h = handler({ world, mode: "live", clock: clock.now });

    for (let i = 0; i < 5; i += 1) await answer(h(invocation({ verb: "ps", argv: ["ps"] })));
    expect(world.deltas).toEqual([]);
  });

  it("T1.15 (I17): nothing advances between queries — pull, never push", async () => {
    // The assertion that a timer would break. If anything scheduled, the world
    // would move while nobody asked, and reproducibility would depend on real
    // elapsed time rather than on (seed, elapsed).
    const clock = steppableClock(1_000);
    const world = fakeWorld({ ps: worldResult() });
    const h = handler({ world, mode: "live", clock: clock.now });

    await answer(h(invocation({ verb: "ps", argv: ["ps"] })));
    clock.set(60_000);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(world.deltas).toEqual([]);
  });

  it("T1.15 (I17): explicit advance in live mode is refused", () => {
    const clock = steppableClock();
    const h = handler({ world: fakeWorld(), mode: "live", clock: clock.now });
    expect(() => h.advance(100)).toThrow(/injected clock is what drives it/);
  });

  it("T1.12 (I5): the world value the driver held is untouched by the harness", async () => {
    // The harness never mutates a world — it calls `advance` and the driver
    // assigns its own cell. What is asserted here is the harness's half: the
    // result object handed back is not the one the driver returned, so a caller
    // holding the previous value still has it.
    const shared = worldResult();
    const world = fakeWorld({ ps: shared });
    const answered = await answer(handler({ world })(invocation({ verb: "ps", argv: ["ps"] })));

    expect(answered).not.toBe(shared);
    expect(shared.argv).toEqual(result().argv);
  });
});
