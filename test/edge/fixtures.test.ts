// C08 tier 3 — edge cases. The harness half of §7.
//
// The **W** rows — a very large delta, cancelling a succeeded run, a world at
// 10,000 rows — belong to whichever repo owns the domain. What is here is the
// harness's: what it refuses, what it passes through, and what `--diff` reports.
import { describe, expect, it } from "vitest";
import { createFixtureHandler, diffCorpus, formatDiff } from "../../src/data/fixtures/index.js";
import type { Fixture, RawPatch, RawResult } from "../../src/data/transport/index.js";
import { fixture as manifestFixture } from "../support/manifest.js";
import { drain, invocation, recorded, result } from "../support/transport.js";
import { fakeWorld, worldResult } from "../support/world.js";

const MANIFEST = manifestFixture();

describe("C08 §3 — what advance refuses", () => {
  it("T3.1: `advance(0)` never reaches the driver", () => {
    // A driver counting calls would otherwise see motion where there was none.
    const world = fakeWorld();
    const h = createFixtureHandler({ fixtures: [], manifest: MANIFEST, world, mode: "stepped" });
    h.advance(0);
    expect(world.deltas).toEqual([]);
  });

  it("T3.3: a negative delta is rejected, not silently reversed", () => {
    const world = fakeWorld();
    const h = createFixtureHandler({ fixtures: [], manifest: MANIFEST, world, mode: "stepped" });
    expect(() => h.advance(-100)).toThrow(/time does not run backwards/);
    expect(world.deltas).toEqual([]);
  });

  it("T3.3: the rejection happens before the driver, in every mode", () => {
    // Order matters. Checking the mode first would make a negative delta in
    // frozen mode report the wrong problem.
    const h = createFixtureHandler({ fixtures: [], manifest: MANIFEST, mode: "frozen" });
    expect(() => h.advance(-1)).toThrow(/backwards/);
  });

  it("T3.x: a handler with no world advances harmlessly", () => {
    const h = createFixtureHandler({ fixtures: [], manifest: MANIFEST, mode: "stepped" });
    expect(() => h.advance(500)).not.toThrow();
  });
});

describe("C08 §4 — streaming", () => {
  it("T3.8: a patch-array fixture replays as a stream ending in `end`", async () => {
    const fixture = recorded({
      verb: "logs",
      argv: ["logs"],
      result: [
        { kind: "data", value: { line: 1 } },
        { kind: "data", value: { line: 2 } },
        { kind: "end", result: result({ stdout: undefined, stdoutRaw: "" }) },
      ] as readonly RawPatch[],
    });
    const h = createFixtureHandler({ fixtures: [fixture], manifest: MANIFEST });
    const produced = h(invocation({ verb: "logs", argv: ["logs"], streams: true }));

    const patches = await drain(produced as AsyncIterable<RawPatch>);
    expect(patches.map((p) => p.kind)).toEqual(["data", "data", "end"]);
    // Verbatim, including inside the terminal `end` (C06 I20). The `end`
    // result is a RawResult and gets the same treatment as a settled one —
    // which is the place the parity gap was easiest to miss.
    const end = patches.at(-1);
    expect(end?.kind === "end" && end.result.argv).toEqual(["widget", "ps", "--json"]);
  });

  it("T3.7: a stream abandoned mid-iteration terminates, and nothing advanced", async () => {
    const world = fakeWorld();
    const fixture = recorded({
      verb: "logs",
      argv: ["logs"],
      result: [
        { kind: "data", value: { line: 1 } },
        { kind: "data", value: { line: 2 } },
        { kind: "end", result: result() },
      ] as readonly RawPatch[],
    });
    const h = createFixtureHandler({ fixtures: [fixture], manifest: MANIFEST, world, mode: "stepped" });

    const seen: RawPatch[] = [];
    for await (const patch of h(
      invocation({ verb: "logs", argv: ["logs"], streams: true }),
    ) as AsyncIterable<RawPatch>) {
      seen.push(patch);
      break;
    }

    expect(seen).toHaveLength(1);
    expect(world.deltas).toEqual([]);
  });

  it("T3.x: a world answering with a stream is passed through untouched", async () => {
    const patches: readonly RawPatch[] = [
      { kind: "data", value: { from: "world" } },
      { kind: "end", result: worldResult() },
    ];
    const world = fakeWorld({
      logs: {
        [Symbol.asyncIterator]: async function* (): AsyncGenerator<RawPatch> {
          for (const p of patches) yield p;
        },
      },
    });
    const h = createFixtureHandler({ fixtures: [], manifest: MANIFEST, world });
    const seen = await drain(
      h(invocation({ verb: "logs", argv: ["logs"], streams: true })) as AsyncIterable<RawPatch>,
    );
    expect(seen.map((p) => p.kind)).toEqual(["data", "end"]);
  });
});

describe("C08 §2 — `record --diff` (I15)", () => {
  const base = (stdout: unknown): Fixture =>
    recorded({ id: "ps/list-mine", result: result({ stdout, stdoutRaw: JSON.stringify(stdout) }) });

  it("T3.14: corpora differing only in values report nothing, and still print a count", () => {
    // Silence and zero deltas are different outputs. A timestamp that moved, a
    // UUID that changed, a loss that is 0.31 instead of 0.34 — all expected, and
    // a diff that reported them would be one nobody reads.
    const committed = [base({ data: [{ id: "a", loss: 0.34, at: "2026-01-01" }], count: 1 })];
    const fresh = [base({ data: [{ id: "z", loss: 0.31, at: "2026-07-29" }], count: 1 })];

    const diff = diffCorpus(committed, fresh);
    expect(diff.deltaCount).toBe(0);
    expect(diff.matched).toEqual(["ps/list-mine"]);
    expect(formatDiff(diff)[0]).toContain("1 fixtures · 1 match · 0 with deltas");
  });

  it("T3.14 (I15): the count comes before any of the detail", () => {
    // The ordering is the commitment, not a formatting preference. Someone runs
    // this to find out how big the job is, and a header after the detail answers
    // the question only for people who scroll.
    const committed = [base({ data: [{ id: "a", loss_history: [1, 2] }], count: 1 })];
    const fresh = [base({ data: [{ id: "a", metrics: { loss: [1, 2] } }], count: "1" })];

    const lines = formatDiff(diffCorpus(committed, fresh));
    expect(lines[0]).toMatch(/^\d+ fixtures · \d+ match · \d+ with deltas · \d+ structural/);
    expect(lines.findIndex((l) => l.includes("✗"))).toBeGreaterThan(0);
  });

  it("T3.14: an added field, a removed field and a changed type are the three kinds", () => {
    const committed = [base({ data: [{ id: "a", loss_history: [0.1] }], count: 1 })];
    const fresh = [base({ data: [{ id: "a", metrics: { loss: [0.1] } }], count: "1" })];

    const diff = diffCorpus(committed, fresh);
    const deltas = diff.changed[0]?.deltas ?? [];
    const byPath = new Map(deltas.map((d) => [d.path, d]));

    expect(byPath.get("data[].loss_history")?.kind).toBe("removed");
    expect(byPath.get("data[].metrics.loss")?.kind).toBe("added");
    expect(byPath.get("count")).toMatchObject({
      kind: "type-changed",
      before: "number",
      after: "string",
    });
  });

  it("T3.14: array length is not a structural difference", () => {
    // Indices collapse to `[]`. Reporting `data[3].status` as added would bury
    // the real deltas under the corpus's row count.
    const committed = [base({ data: [{ id: "a" }] })];
    const fresh = [base({ data: [{ id: "a" }, { id: "b" }, { id: "c" }] })];
    expect(diffCorpus(committed, fresh).deltaCount).toBe(0);
  });

  it("T3.14: a heterogeneous array reports the union of its elements' fields", () => {
    // The safe direction: an adapter handling a field some elements lack is
    // correct; one assuming a field no element has is not.
    const committed = [base({ data: [{ id: "a" }] })];
    const fresh = [base({ data: [{ id: "a" }, { id: "b", extra: true }] })];
    expect(diffCorpus(committed, fresh).changed[0]?.deltas).toEqual([
      { path: "data[].extra", kind: "added", before: null, after: "boolean" },
    ]);
  });

  it("T3.14: null is its own type, not an object", () => {
    // A field going from null to an object is exactly what an adapter must
    // handle, and a merged reading would hide it.
    const diff = diffCorpus([base({ owner: null })], [base({ owner: { name: "x" } })]);
    expect(diff.changed[0]?.deltas.map((d) => `${d.path}:${d.kind}`)).toEqual([
      "owner:type-changed",
      "owner.name:added",
    ]);
  });

  it("T3.14: fixtures that appeared and vanished are counted separately", () => {
    const diff = diffCorpus(
      [recorded({ id: "ps/one" }), recorded({ id: "ps/gone" })],
      [recorded({ id: "ps/one" }), recorded({ id: "ps/new" })],
    );
    expect(diff.added).toEqual(["ps/new"]);
    expect(diff.removed).toEqual(["ps/gone"]);
    expect(formatDiff(diff).join("\n")).toContain("1 gone from the far side");
  });

  it("T3.14: a streaming fixture's structure comes from its patches, not only `end`", () => {
    // A diff reading `end` alone would be blind to the shape of everything that
    // arrived before it, which for a live view is the entire payload.
    const stream = (value: unknown): Fixture =>
      recorded({
        id: "logs/follow",
        verb: "logs",
        result: [
          { kind: "data", value },
          { kind: "end", result: result({ stdout: undefined, stdoutRaw: "" }) },
        ] as readonly RawPatch[],
      });

    const diff = diffCorpus([stream({ line: "x", ts: 1 })], [stream({ line: "x", at: "z" })]);
    expect(diff.changed[0]?.deltas.map((d) => d.path).sort()).toEqual([
      "patches[].at",
      "patches[].ts",
    ]);
  });

  it("T3.14: the report is stable — same corpora, same lines", () => {
    // A report whose order depends on iteration order shows up as changed in
    // review when nothing changed.
    const committed = [base({ z: 1, a: 2, m: 3 })];
    const fresh = [base({ z: "1", a: "2", m: "3" })];
    expect(formatDiff(diffCorpus(committed, fresh))).toEqual(
      formatDiff(diffCorpus(committed, fresh)),
    );
    expect(diffCorpus(committed, fresh).changed[0]?.deltas.map((d) => d.path)).toEqual([
      "a",
      "m",
      "z",
    ]);
  });

  it("T3.14 (I15): the header carries the authored ratio", () => {
    // Where the number is *read*. A ratio nothing prints is a field, not a
    // report, and this is the command someone runs when they care.
    const corpus = [
      recorded({ id: "logs/x", verb: "logs", provenance: "authored", capturedAt: null, note: "x" }),
      recorded({ id: "ps/y", verb: "ps" }),
    ];
    const lines = formatDiff(diffCorpus(corpus, corpus), corpus);
    expect(lines.join("\n")).toContain("2 fixtures · 1 authored (50%)");
    expect(lines.join("\n")).toContain("logs is majority-authored");
  });

  it("T3.11: an older cliVersion still replays; the mismatch is a `--diff` concern", async () => {
    const old = recorded({ cliVersion: "1.0.0" });
    const h = createFixtureHandler({ fixtures: [old], manifest: MANIFEST });
    const answered = h(invocation({ verb: "ps", argv: ["ps"] })) as RawResult;

    // Replay does not inspect the version — I2 is byte-for-byte, and a version
    // check at replay would be normalisation by another name.
    expect(answered.exitCode).toBe(0);
    expect(diffCorpus([old], [recorded({ cliVersion: "2.4.0" })]).deltaCount).toBe(0);
  });
});
