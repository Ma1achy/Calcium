// C08 tier 2 — contract. The properties the harness owes anyone using it.
//
// T2.2 is the important one and it is at the bottom: fixtures held to the A01
// B1–B8 *contract* by the same code that holds a real CLI to it, not to the
// schema they were written from. C08 §1's whole argument is that a fixture
// agreeing with its schema proves nothing, because the schema is where it came
// from.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CORPUS_SCHEMA,
  CorpusError,
  REDACTED,
  checkProvenance,
  createFixtureHandler,
  findSecrets,
  parseCorpus,
  redactText,
  serialiseCorpus,
} from "../../src/data/fixtures/index.js";
import { createFixtureTransport } from "../../src/data/transport/index.js";
import type { Fixture, RawPatch, RawResult } from "../../src/data/transport/index.js";
import { checkCorpus, checkResult, formatReport } from "../../src/testing/boundary-conformance.js";
import { fixture as manifestFixture } from "../support/manifest.js";
import { invocation, recorded, result } from "../support/transport.js";

const MANIFEST = manifestFixture();

describe("C08 §2 — the corpus file", () => {
  it("T2.11 (I17): a round trip through the file preserves every fixture", () => {
    const corpus: readonly Fixture[] = [
      recorded({ id: "ps/empty" }),
      recorded({
        id: "logs/stream",
        verb: "logs",
        argv: ["logs", "--follow"],
        result: [
          { kind: "data", value: { line: "one" } },
          { kind: "end", result: result({ stdout: undefined, stdoutRaw: "" }) },
        ] as readonly RawPatch[],
      }),
      recorded({
        id: "validate/malformed",
        provenance: "authored",
        capturedAt: null,
        note: "the far side cannot be made to truncate a stream on demand",
        result: result({ stdout: undefined, stdoutRaw: "{not json", parseError: "unexpected token" }),
      }),
    ];

    expect(parseCorpus(serialiseCorpus(corpus))).toEqual(corpus);
  });

  it("T2.11 (I17): a corpus with no schema fails the load and says what it wanted", () => {
    expect(() => parseCorpus(JSON.stringify({ fixtures: [] }))).toThrow(CorpusError);
    expect(() => parseCorpus(JSON.stringify({ fixtures: [] }))).toThrow(/declares no schema/);
  });

  it("T2.11 (I17): an unrecognised schema fails, naming both versions", () => {
    // The failure has to name the file's version and the build's, or the reader
    // goes to the source to find out what it wanted.
    const text = JSON.stringify({ schema: "tui.fixtures/0", fixtures: [] });
    expect(() => parseCorpus(text)).toThrow(/tui\.fixtures\/0/);
    expect(() => parseCorpus(text)).toThrow(new RegExp(CORPUS_SCHEMA.replace("/", "\\/")));
  });

  it("T2.11: the version is not silently upgraded on write", () => {
    expect(JSON.parse(serialiseCorpus([])).schema).toBe(CORPUS_SCHEMA);
  });

  it("T2.11: `stdout` is derived from `stdoutRaw`, never stored beside it", () => {
    const stored = JSON.parse(serialiseCorpus([recorded()])) as {
      fixtures: readonly { result: Record<string, unknown> }[];
    };
    expect(stored.fixtures[0]?.result).not.toHaveProperty("stdout");
    expect(stored.fixtures[0]?.result).toHaveProperty("stdoutRaw");
  });

  it("T2.11: a stored parse failure replays as a parse failure", () => {
    // The most important fixture in any corpus is the malformed one, and
    // re-parsing optimistically at load would quietly turn it into a
    // well-formed document.
    const corpus = [
      recorded({
        result: result({ stdout: undefined, stdoutRaw: '{"a":1}', parseError: "trailing content" }),
      }),
    ];
    const back = parseCorpus(serialiseCorpus(corpus));
    expect((back[0]?.result as RawResult).stdout).toBeUndefined();
    expect((back[0]?.result as RawResult).parseError).toBe("trailing content");
  });

  it("T2.11: a corpus claiming it parsed, whose bytes do not, is corrupt and says so", () => {
    const text = JSON.stringify({
      schema: CORPUS_SCHEMA,
      fixtures: [{ ...recorded(), result: { ...result(), stdoutRaw: "{oops", parseError: null } }],
    });
    expect(() => parseCorpus(text)).toThrow(/claims it parsed/);
  });
});

describe("C08 §2 — redaction (I8)", () => {
  const CASES: readonly Readonly<{ name: string; input: string }>[] = [
    { name: "GitHub token", input: '{"token":"ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345"}' },
    { name: "Slack token", input: '{"t":"xoxb-1234567890-abcdefghij"}' },
    { name: "AWS key id", input: '{"key":"AKIAIOSFODNN7EXAMPLE"}' },
    { name: "JWT", input: '{"j":"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVP"}' },
    { name: "bearer header", input: '{"h":"Bearer abcdefghijklmnopqrstuvwx"}' },
    { name: "URL credentials", input: '{"u":"https://alice:hunter2@example.com/x"}' },
    { name: "named secret of any shape", input: '{"api_key":"12"}' },
  ];

  for (const c of CASES) {
    it(`T2.5: ${c.name} is redacted, and the document is still JSON`, () => {
      const out = redactText(c.input);
      expect(out).not.toBe(c.input);
      // Structure survives: it still parses, and it has the same keys.
      expect(Object.keys(JSON.parse(out))).toEqual(Object.keys(JSON.parse(c.input)));
      expect(findSecrets(c.input).length).toBeGreaterThan(0);
      expect(findSecrets(out)).toEqual([]);
    });
  }

  it("T3.13 (I8): structure is untouched — keys, types and array lengths survive", () => {
    // The failure this is written against: dropping the key that held the token
    // rather than rewriting its value. The corpus would then describe a far side
    // emitting one fewer field than the real one, and every adapter written to
    // satisfy it would be wrong in production.
    const input = JSON.stringify({
      data: [
        { id: 1, token: "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345", ok: true },
        { id: 2, token: "ghp_ZYXWVUTSRQPONMLKJIHGFEDCBA543210", ok: false },
      ],
      count: 2,
    });
    const out = JSON.parse(redactText(input)) as {
      data: readonly Record<string, unknown>[];
      count: number;
    };

    expect(out.data).toHaveLength(2);
    expect(Object.keys(out.data[0] ?? {})).toEqual(["id", "token", "ok"]);
    expect(out.data[0]?.id).toBe(1);
    expect(out.data[0]?.ok).toBe(true);
    expect(out.data[1]?.ok).toBe(false);
    expect(out.count).toBe(2);
    expect(out.data[0]?.token).toBe(REDACTED);
  });

  it("T3.13: a home path keeps its shape and loses only the user segment", () => {
    // `/home/«user»/…`, not `«redacted»`. A fixture whose paths all vanished
    // would stop exercising the path handling it was recorded to exercise.
    expect(redactText('{"p":"/home/alice/src/thing.yaml"}')).toBe(
      '{"p":"/home/«user»/src/thing.yaml"}',
    );
    expect(redactText('{"p":"/Users/bob/x"}')).toBe('{"p":"/home/«user»/x"}');
  });

  it("T3.13: line count is preserved for NDJSON", () => {
    const lines = [
      '{"line":1,"token":"ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345"}',
      '{"line":2}',
      '{"line":3,"api_key":"x"}',
    ].join("\n");
    expect(redactText(lines).split("\n")).toHaveLength(3);
    for (const line of redactText(lines).split("\n")) expect(() => JSON.parse(line)).not.toThrow();
  });

  it("T2.5: numbers, booleans and ordinary ids are left alone", () => {
    // The direction that matters as much as catching secrets. A rule matching
    // every long string would redact UUIDs, image digests and commit SHAs —
    // most of what a recording is made of — and a corpus of «redacted»
    // exercises nothing.
    const input = JSON.stringify({
      uuid: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
      sha: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
      digest: "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      count: 42,
      ok: true,
    });
    expect(redactText(input)).toBe(input);
    expect(findSecrets(input)).toEqual([]);
  });
});

describe("C08 §7 — the module and its boundaries", () => {
  it("T2.3 (I4): no ambient clock or random source in the harness source", () => {
    // The scan rule is A03 SS2 and it runs in `make enforce`. This is the same
    // assertion at test scope, so a source change fails here too rather than
    // only in a separate command someone may not run.
    const dir = "src/data/fixtures";
    for (const file of readdirSync(dir)) {
      const source = readFileSync(`${dir}/${file}`, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*/g, "");
      expect(source, `${file} reads a random source`).not.toMatch(/\bMath\.random\b/);
      expect(source, `${file} reads an ambient clock`).not.toMatch(
        /\b(?:Date\.now|new Date|performance\.now|process\.hrtime)\b/,
      );
    }
  });

  it("T2.6, T2.10 (I9, MG8): the harness imports only C05, C06 and its own modules", () => {
    // MG8 as A03 states it — `tui-kit` importing nothing from `prism-tui` — has
    // nothing in this repo to fire at, and a rule with nothing to be wrong about
    // passes exactly like a satisfied one (A03 §2). This is the form this repo
    // can hold: no import reaches outside `src/data/`, so no app type can enter.
    const dir = "src/data/fixtures";
    for (const file of readdirSync(dir)) {
      // Comments stripped first. Without it the scan matched prose — a doc
      // comment containing the words "recording was inconvenient" after a
      // `from` reads as an import to a bare regex, and the rule fails on a file
      // that imports nothing wrong at all.
      const source = readFileSync(`${dir}/${file}`, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*/g, "");
      for (const [, spec] of source.matchAll(/^\s*(?:import|export)[^;]*?from\s*["']([^"']+)["']/gm)) {
        expect(spec, `${file} imports ${spec}`).toMatch(
          /^(?:\.\/|\.\.\/transport\/|\.\.\/manifest\/|node:)/,
        );
      }
    }
  });

  it("T2.4b (I14): no test path constructs a world", () => {
    // C08 I14 and C06 I17. The double in `test/support/world.ts` answers from a
    // table the test wrote and invents nothing, which is why it is not the thing
    // D43 forbids — what that forbids is a test agreeing with an animated world.
    // Anything that *generates* would be, and there is nothing here to import.
    const files = readdirSync("src/data/fixtures");
    expect(files).not.toContain("world-impl.ts");
    // `world.ts` is the interface. If it ever gains a body, this is the line
    // that says so — an interface file exports no runtime value.
    const source = readFileSync("src/data/fixtures/world.ts", "utf8");
    expect(source).not.toMatch(/export\s+(?:function|const|class)\b/);
  });
});

describe("C08 §7 — I13: the transports stay substitutable", () => {
  it("T2.4 (I13): a corpus replays identically through transport and handler", async () => {
    const corpus = [recorded()];
    const transport = createFixtureTransport(corpus);
    const handler = createFixtureHandler({ fixtures: corpus, manifest: MANIFEST });

    const inv = invocation({ verb: "ps", argv: ["ps"] });
    const viaTransport = await transport.invoke(inv);
    const viaHandler = handler(inv) as RawResult;

    expect(viaHandler).toEqual(viaTransport);
  });
});

describe("A01 §6 — the boundary conformance suite", () => {
  it("T2.2 (I12): a well-formed corpus is clean", () => {
    const report = checkCorpus([
      recorded({ id: "ps/empty" }),
      recorded({
        id: "logs/stream",
        verb: "logs",
        result: [
          { kind: "data", value: { line: "one" } },
          { kind: "end", result: result({ stdout: undefined, stdoutRaw: "" }) },
        ] as readonly RawPatch[],
      }),
    ]);
    expect(formatReport(report).join("\n")).toBe("");
    expect(report.checked).toBe(2);
  });

  it("T2.2: the skips are recorded, never counted as passes", () => {
    // A suite that quietly counted an unrunnable assertion as green is the
    // vacuity failure A03 §2 names — indistinguishable from a satisfied one.
    const report = checkCorpus([recorded()]);
    expect(report.skipped.map((s) => s.assertion).sort()).toEqual(["B6", "B8"]);
    for (const skip of report.skipped) expect(skip.why).not.toBe("");
  });

  it("T2.2 (I12): every fixture, recorded and authored alike, is held to it", () => {
    // The claim that matters. An authored fixture satisfies the contract only if
    // someone got it right, and this is the only thing that ever checks.
    const authored = recorded({
      id: "ps/refusal",
      provenance: "authored",
      capturedAt: null,
      note: "the daemon cannot be put into this state on demand",
      result: result({ exitCode: 1, stdout: { message: "refused" }, stdoutRaw: '{"message":"refused"}' }),
    });
    expect(checkProvenance([authored])).toEqual([]);

    // Provenance is clean, the adapter would read it fine — and B5 is violated,
    // because the error is not under `error.message`.
    const report = checkCorpus([authored]);
    expect(report.findings.map((f) => f.assertion)).toEqual(["B5"]);
  });

  const VIOLATIONS: readonly Readonly<{ assertion: string; result: RawResult }>[] = [
    { assertion: "B4", result: result({ exitCode: 7 }) },
    {
      assertion: "B2",
      result: result({ stdout: undefined, stdoutRaw: "{oops", parseError: "unexpected token" }),
    },
    { assertion: "B3", result: result({ stderr: '{"rows":[]}' }) },
    { assertion: "B5", result: result({ exitCode: 1, stdout: {}, stdoutRaw: "{}" }) },
  ];

  for (const v of VIOLATIONS) {
    it(`T6.3: a fixture violating ${v.assertion} fails the suite`, () => {
      // One per row. A suite nobody has watched fail is a suite nobody knows the
      // shape of — and this is the one C08 T6.3 calls the fiction-stopper.
      const findings = checkResult("ps (ps/x)", v.result);
      expect(findings.map((f) => f.assertion)).toContain(v.assertion);
      expect(findings[0]?.means).toContain("violated");
    });
  }

  it("T2.2: stderr that is diagnostics, not payload, is not a violation", () => {
    // B3 says stderr is diagnostics only. Failing on non-empty would fail every
    // correct CLI that printed a deprecation notice, and a rule that fires on
    // correct behaviour is one someone turns off.
    expect(checkResult("ps", result({ stderr: "warning: --all is deprecated\n" }))).toEqual([]);
  });

  it("T2.2: cancellation owes no ErrorLike", () => {
    // B4 — 130 renders as `partial`, not `error` (C07 §4). The output produced
    // before the stop stays useful, and there is no failure to describe.
    expect(checkResult("ps", result({ exitCode: 130, cancelled: true }))).toEqual([]);
  });
});
