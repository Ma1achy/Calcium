// C08 tier 6 — fail-on-revert. Each names the change that makes it fail.
//
// The form CLAUDE.md asks for: "removing the idempotency guard → T3.14 fails",
// not just an assertion. Every test here fabricates the reverted behaviour and
// shows the check firing, because a guard nobody has watched fail is a guard
// nobody knows the shape of.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CORPUS_SCHEMA,
  authoredRatio,
  checkProvenance,
  createFixtureHandler,
  diffCorpus,
  findSecrets,
  parseCorpus,
  redactText,
} from "../../src/data/fixtures/index.js";
import type { Fixture, RawResult } from "../../src/data/transport/index.js";
import { checkCorpus, checkResult } from "../../src/testing/boundary-conformance.js";
import { fixture as manifestFixture } from "../support/manifest.js";
import { invocation, recorded, result } from "../support/transport.js";
import { fakeWorld, steppableClock, worldResult } from "../support/world.js";

const MANIFEST = manifestFixture();

describe("C08 tier 6 — what breaks when a rule is removed", () => {
  it("T6.1 (I4): reintroducing `Math.random` in the harness → T2.3 fails", () => {
    // The scan, run against fabricated source rather than only against the tree.
    // SS26's lesson: a rule scoped where nothing can violate it reports
    // compliance exactly like a rule that is satisfied.
    const AMBIENT = /\b(?:Math\.random|Date\.now|new Date|performance\.now)\b/;
    expect("const seed = Math.random();").toMatch(AMBIENT);
    expect("const at = Date.now();").toMatch(AMBIENT);

    // And against the real tree, so the fabrication is not the only subject.
    for (const file of readdirSync("src/data/fixtures")) {
      const body = readFileSync(`src/data/fixtures/${file}`, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*/g, "");
      expect(body, file).not.toMatch(AMBIENT);
    }
  });

  it("T6.2 (I1): an authored fixture landing without a note → T2.1 fails", () => {
    const withNote = recorded({ provenance: "authored", capturedAt: null, note: "cannot record" });
    expect(checkProvenance([withNote])).toEqual([]);

    // Strip the note — the exact revert — and the check fires.
    const { note: _dropped, ...withoutNote } = withNote;
    expect(checkProvenance([withoutNote as Fixture])).toHaveLength(1);
  });

  it("T6.3 (I12): a fixture satisfying the adapter but violating the contract → T2.2 fails", () => {
    // The fiction-stopper. This fixture is perfectly well-formed JSON, an
    // adapter would render it happily, and it violates B5 — a failure with no
    // `error.message`. Only holding it to the contract catches that.
    const plausible = recorded({
      provenance: "authored",
      capturedAt: null,
      note: "the daemon cannot be put into this state",
      result: result({ exitCode: 1, stdout: { msg: "it broke" }, stdoutRaw: '{"msg":"it broke"}' }),
    });

    expect(checkProvenance([plausible])).toEqual([]);
    expect(checkCorpus([plausible]).findings.map((f) => f.assertion)).toEqual(["B5"]);
  });

  it("T6.5 (I2): normalising a recording at replay → T2.7 fails", () => {
    // The revert: re-parsing `stdoutRaw` at load whatever the stored
    // `parseError` said. It would turn the most important fixture in any corpus
    // — the malformed one — into a well-formed document, silently.
    const malformed = recorded({
      result: result({ stdout: undefined, stdoutRaw: '{"a":1}', parseError: "trailing content" }),
    });
    const back = parseCorpus(
      JSON.stringify({
        schema: CORPUS_SCHEMA,
        fixtures: [{ ...malformed, result: { ...(malformed.result as RawResult), stdout: undefined } }],
      }),
    );
    expect((back[0]?.result as RawResult).stdout).toBeUndefined();
    expect((back[0]?.result as RawResult).parseError).toBe("trailing content");
  });

  it("T6.6 (I6): defaulting to `live` → T1.8 fails", () => {
    // Frozen is the default so that motion is asked for. A handler defaulting
    // to live would need a clock it was not given, and every golden frame would
    // depend on how long the test took to reach it.
    const h = createFixtureHandler({ fixtures: [], manifest: MANIFEST });
    expect(() => h.advance(1)).toThrow(/"frozen" mode/);
    expect(() => createFixtureHandler({ fixtures: [], manifest: MANIFEST, mode: "live" })).toThrow(
      /requires a clock/,
    );
  });

  it("T6.8 (I7): a query path that throws on an unknown verb → T1.9 fails", () => {
    // The asymmetry with `createFixtureTransport`, which *does* throw on a miss.
    // Same event, opposite correct answers: that serves tests, this serves a
    // demo, and a demo that throws mid-presentation is the failure.
    const h = createFixtureHandler({ fixtures: [], manifest: MANIFEST });
    expect(() => h(invocation({ verb: "nothing", argv: ["nothing"] }))).not.toThrow();
    expect((h(invocation({ verb: "nothing", argv: ["nothing"] })) as RawResult).exitCode).toBe(1);
  });

  it("T6.9 (I10): a response adding or dropping a field → the comparator reports it", () => {
    // The drift the fiction problem hides behind. A `derived` response whose
    // shape has wandered from its source recording is the corpus quietly
    // becoming a fiction one field at a time.
    const source = { data: [{ id: "a", status: "running" }], count: 1 };
    const fix = (stdout: unknown): Fixture =>
      recorded({ result: result({ stdout, stdoutRaw: JSON.stringify(stdout) }) });

    expect(diffCorpus([fix(source)], [fix(source)]).deltaCount).toBe(0);
    expect(
      diffCorpus([fix(source)], [fix({ data: [{ id: "a" }], count: 1 })]).deltaCount,
    ).toBe(1);
    expect(
      diffCorpus([fix(source)], [fix({ data: [{ id: "a", status: "running", extra: 1 }], count: 1 })])
        .deltaCount,
    ).toBe(1);
  });

  it("T6.11 (I18): arming a timer instead of reading the clock → T1.15 fails", async () => {
    // The revert this exists for: a `setInterval` in the handler. The world
    // would then move while nobody asked, and two runs with different real
    // elapsed time would produce different worlds.
    const clock = steppableClock(1_000);
    const world = fakeWorld({ ps: worldResult() });
    const h = createFixtureHandler({
      fixtures: [],
      manifest: MANIFEST,
      world,
      mode: "live",
      clock: clock.now,
    });

    h(invocation({ verb: "ps", argv: ["ps"] }));
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(world.deltas, "something advanced the world without being asked").toEqual([]);

    // And it does advance when asked, so the assertion above is not vacuous.
    clock.set(1_300);
    h(invocation({ verb: "ps", argv: ["ps"] }));
    expect(world.deltas).toEqual([300]);
  });

  it("T6.13 (I17): dropping `schema` from the corpus file → T2.11 fails", () => {
    // Without the version, an old corpus misparses into a plausible-looking
    // wrong shape and the failure surfaces somewhere else entirely.
    expect(() => parseCorpus(JSON.stringify({ fixtures: [] }))).toThrow(/declares no schema/);
    expect(() => parseCorpus(JSON.stringify({ schema: "tui.fixtures/2", fixtures: [] }))).toThrow(
      /this build reads/,
    );
    // The accepting case, so the two above are not passing for the wrong reason.
    expect(parseCorpus(JSON.stringify({ schema: CORPUS_SCHEMA, fixtures: [] }))).toEqual([]);
  });

  it("T6.14 (I8): redacting structure rather than values → T3.13 fails", () => {
    // The revert: dropping the key that held the token instead of rewriting it.
    // The corpus would then describe a far side emitting one fewer field than
    // the real one, and every adapter written to satisfy it would be wrong in
    // production — the fiction problem, arriving through redaction.
    const input = '{"data":[{"id":1,"token":"ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345"}],"count":1}';
    const out = redactText(input);

    expect(findSecrets(out)).toEqual([]);
    expect(Object.keys(JSON.parse(out).data[0])).toEqual(["id", "token"]);
    expect(JSON.parse(out).count).toBe(1);

    // What the reverted behaviour would have produced, shown failing the shape
    // check — so the assertion above is about structure and not about the string.
    const dropped = '{"data":[{"id":1}],"count":1}';
    expect(Object.keys(JSON.parse(dropped).data[0])).not.toEqual(["id", "token"]);
  });

  it("T6.x (I15): a `--diff` that reported value changes → T3.14 fails", () => {
    // A diff reporting every moved timestamp and changed UUID is a diff nobody
    // reads, and "every delta is one adapter line" stops being true the moment
    // most deltas are not.
    const fix = (stdout: unknown): Fixture =>
      recorded({ result: result({ stdout, stdoutRaw: JSON.stringify(stdout) }) });
    const before = fix({ id: "3f2504e0", at: "2026-01-01T00:00:00Z", loss: 0.34 });
    const after = fix({ id: "9a0c0305", at: "2026-07-29T11:00:00Z", loss: 0.31 });
    expect(diffCorpus([before], [after]).deltaCount).toBe(0);
  });

  it("T6.x (§2): a ratio that nothing printed → the report goes silent", () => {
    // The point of computing it is that someone reads it. A corpus drifting
    // toward hand-written must be visible before it is a problem.
    const rows = authoredRatio([
      recorded({ id: "1", verb: "logs", provenance: "authored", capturedAt: null, note: "x" }),
      recorded({ id: "2", verb: "logs", provenance: "authored", capturedAt: null, note: "x" }),
      recorded({ id: "3", verb: "logs" }),
    ]);
    expect(rows[0]?.flagged).toBe(true);
  });

  it("T6.x (A01 §6): a conformance suite that counted its skips as passes", () => {
    // The vacuity failure A03 §2 names. B8 and B6 cannot be answered by a
    // corpus, and reporting them green would make the suite claim more than it
    // checked — which is indistinguishable from checking it, in every report.
    const report = checkCorpus([recorded()]);
    expect(report.findings).toEqual([]);
    expect(report.skipped).not.toEqual([]);
    for (const skip of report.skipped) expect(skip.why.length).toBeGreaterThan(10);
  });

  it("T6.x (B3): a stderr rule that fired on any output → every warning fails", () => {
    // The over-tightening this guards against. B3 says stderr is diagnostics
    // only; failing on non-empty would fail every correct CLI that printed a
    // deprecation notice, and a rule that fires on correct behaviour is one
    // someone turns off.
    expect(checkResult("ps", result({ stderr: "warning: --all is deprecated" }))).toEqual([]);
    expect(checkResult("ps", result({ stderr: '{"rows":[]}' })).map((f) => f.assertion)).toEqual([
      "B3",
    ]);
  });
});
