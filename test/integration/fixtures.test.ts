// C08 tier 4 — integration. C08 with C06 and C21.
//
// T4.6 is the one that matters: the recording round trip. It is the assertion
// that the format C08 records into is the one C06 consumes, and it is a test
// rather than an argument because "the types line up" is exactly the kind of
// claim that is true until a field is added.
import { describe, expect, it } from "vitest";
import {
  createFixtureHandler,
  parseCorpus,
  record,
  recordAll,
  serialiseCorpus,
} from "../../src/data/fixtures/index.js";
import {
  createFixtureTransport,
  createSubprocessTransport,
} from "../../src/data/transport/index.js";
import type { RawPatch, RawResult } from "../../src/data/transport/index.js";
import type { Exit } from "../../src/data/process/types.js";
import { fixture as manifestFixture } from "../support/manifest.js";
import { clockOf, drain, fakeRunner, invocation } from "../support/transport.js";
import { fakeClock } from "../support/fake-scheduler.js";

const MANIFEST = manifestFixture();
const CAPTURED_AT = "2026-07-29T10:00:00.000Z";

function subprocess(stdout: string, exit: Exit = { code: 0, signal: null }) {
  const clock = clockOf(fakeClock());
  const runner = fakeRunner(() => ({ stdout: [stdout], exit }));
  return {
    clock,
    runner,
    transport: createSubprocessTransport({ binary: "widget", runner, clock }),
  };
}

describe("C08 §2 — the recording round trip", () => {
  it("T4.6: record → corpus file → replay is deep-equal to what the CLI returned", async () => {
    // The joint the component rests on. Recording composes over the subprocess
    // transport rather than spawning for itself, so there is no second
    // implementation of "what a run looks like" to disagree with the first.
    const payload = '{"data":[{"id":"a","status":"running"}],"count":1}';
    const { transport } = subprocess(payload);

    const fixture = await record(
      { id: "ps/list", verb: "ps", argv: ["ps", "--mine"] },
      { transport, capturedAt: CAPTURED_AT, cliVersion: "2.4.0" },
    );

    const direct = await transport.invoke(
      invocation({ verb: "ps", argv: ["ps", "--mine"] }),
    );

    // Through disk, not just through memory: the format decision that stores
    // `stdoutRaw` and derives `stdout` is only sound if it survives a round trip.
    const corpus = parseCorpus(serialiseCorpus([fixture]));
    const replayed = await createFixtureTransport(corpus).invoke(
      invocation({ verb: "ps", argv: ["ps", "--mine"] }),
    );

    expect(replayed.stdout).toEqual(direct.stdout);
    expect(replayed.stdoutRaw).toBe(direct.stdoutRaw);
    expect(replayed.exitCode).toBe(direct.exitCode);
    expect(replayed.stderr).toBe(direct.stderr);
    expect(replayed.parseError).toBe(direct.parseError);
  });

  it("OPEN QUESTION (C06 I15): the two transports disagree about `argv`", async () => {
    // Found by writing T4.6, and left as a finding rather than fixed here.
    //
    // `createSubprocessTransport` reports the argv it actually spawned, binary
    // included. `createFixtureTransport` rewrites `result.argv` to
    // `withJson(inv.argv)` on every replay (C06 §3), and it has no binary to put
    // in front — so the same verb reports a different command depending on which
    // transport answered.
    //
    // That matters because of D49: `meta.argv` exists to answer "what actually
    // ran" without re-running it, and the first agent feature is the one that
    // must trust it. C06 I15 says a caller cannot tell the transports apart, and
    // here a caller can, by reading `argv[0]`. C06's shared parity suite asserts
    // nothing about `argv`, which is why this survived to be found here.
    //
    // The corpus is not the problem — it *stores* the full recorded argv and the
    // transport discards it. Whether the fix is for replay to keep the recorded
    // argv, or for the fixture transport to take a `binary`, is a C06 decision
    // and belongs in a C06 spec change, not in C08's implementation.
    //
    // This test pins the current behaviour so the divergence cannot be closed
    // silently: whoever fixes C06 gets a failure here that names the question.
    const { transport } = subprocess('{"ok":true}');
    const fixture = await record(
      { id: "ps/one", verb: "ps", argv: ["ps"] },
      { transport, capturedAt: CAPTURED_AT, cliVersion: null },
    );

    expect((fixture.result as RawResult).argv).toEqual(["widget", "ps", "--json"]);

    const replayed = await createFixtureTransport([fixture]).invoke(
      invocation({ verb: "ps", argv: ["ps"] }),
    );
    expect(replayed.argv).toEqual(["ps", "--json"]);
  });

  it("T4.6: a recording carries provenance, capture time and CLI version", async () => {
    const { transport } = subprocess('{"ok":true}');
    const fixture = await record(
      { id: "ps/one", verb: "ps", argv: ["ps"] },
      { transport, capturedAt: CAPTURED_AT, cliVersion: "2.4.0" },
    );

    expect(fixture.provenance).toBe("recorded");
    expect(fixture.capturedAt).toBe(CAPTURED_AT);
    expect(fixture.cliVersion).toBe("2.4.0");
    // Injected, not read (I4). A recorder that read `Date.now()` would be the
    // one module in C08 that could not be tested for what it writes.
    expect(fixture.capturedAt).not.toMatch(new RegExp(String(new Date().getFullYear() + 1)));
  });

  it("T4.6 (I8): redaction runs at capture, so a secret never reaches disk", async () => {
    const { transport } = subprocess(
      '{"registry":{"api_key":"ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345"},"count":1}',
    );
    const fixture = await record(
      { id: "cfg/show", verb: "config", argv: ["config"] },
      { transport, capturedAt: CAPTURED_AT, cliVersion: null },
    );

    const stored = serialiseCorpus([fixture]);
    expect(stored).not.toContain("ghp_ABCDEFG");
    // Structure survives — same keys, same types, same count.
    const back = (parseCorpus(stored)[0]?.result as RawResult).stdout as {
      registry: Record<string, unknown>;
      count: number;
    };
    expect(Object.keys(back.registry)).toEqual(["api_key"]);
    expect(back.count).toBe(1);
  });

  it("T4.6: `stdout` and `stdoutRaw` agree after redaction", async () => {
    // They would not if redaction ran twice, on the text and on the tree
    // separately. `stdout` is re-derived from the redacted text for that reason.
    const { transport } = subprocess('{"token":"xoxb-1234567890-abcdefghij"}');
    const fixture = await record(
      { id: "auth/whoami", verb: "whoami", argv: ["whoami"] },
      { transport, capturedAt: CAPTURED_AT, cliVersion: null },
    );
    const stored = fixture.result as RawResult;
    expect(stored.stdout).toEqual(JSON.parse(stored.stdoutRaw));
  });

  it("T4.6: a failing invocation records as a failure, not as an absence", async () => {
    const body = '{"error":{"message":"no such run","code":"NOT_FOUND"}}';
    const { transport } = subprocess(body, { code: 1, signal: null });
    const fixture = await record(
      { id: "ps/missing", verb: "ps", argv: ["ps", "nope"] },
      { transport, capturedAt: CAPTURED_AT, cliVersion: null },
    );
    expect((fixture.result as RawResult).exitCode).toBe(1);
    expect((fixture.result as RawResult).stdout).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("T4.6: `recordAll` preserves request order so a corpus file diffs cleanly", async () => {
    const { transport } = subprocess('{"ok":true}');
    const fixtures = await recordAll(
      [
        { id: "c", verb: "ps", argv: ["ps", "c"] },
        { id: "a", verb: "ps", argv: ["ps", "a"] },
        { id: "b", verb: "ps", argv: ["ps", "b"] },
      ],
      { transport, capturedAt: CAPTURED_AT, cliVersion: null },
    );
    expect(fixtures.map((f) => f.id)).toEqual(["c", "a", "b"]);
  });
});

describe("C08 §3 — stepped mode with a stream (T4.3)", () => {
  it("T4.3 (with C06): patches arrive in order, `end` last", async () => {
    const fixture = {
      id: "logs/follow",
      verb: "logs",
      argv: ["logs", "--follow"],
      provenance: "recorded" as const,
      capturedAt: CAPTURED_AT,
      cliVersion: "2.4.0",
      result: [
        { kind: "data", value: { line: 1 } },
        { kind: "data", value: { line: 2 } },
        { kind: "degraded", reason: "line exceeded the cap" },
        { kind: "data", value: { line: 3 } },
        {
          kind: "end",
          result: {
            argv: ["logs", "--follow", "--json"],
            exitCode: 0,
            signal: null,
            stdout: undefined,
            stdoutRaw: "",
            stderr: "",
            durationMs: 12,
            parseError: null,
            cancelled: false,
            timedOut: false,
          },
        },
      ] as readonly RawPatch[],
    };

    const handler = createFixtureHandler({
      fixtures: [fixture],
      manifest: MANIFEST,
      mode: "stepped",
    });

    const patches = await drain(
      handler(
        invocation({ verb: "logs", argv: ["logs", "--follow"], streams: true }),
      ) as AsyncIterable<RawPatch>,
    );

    expect(patches.map((p) => p.kind)).toEqual(["data", "data", "degraded", "data", "end"]);
    expect(patches.filter((p) => p.kind === "end")).toHaveLength(1);
  });
});
