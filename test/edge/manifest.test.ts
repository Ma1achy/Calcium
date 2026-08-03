// C05 tier 3 — edge cases. The loader's illegal transitions, the argv forms
// that look like typos and are not, and the manifests an app can legitimately
// write that have no sensible reading.
import { describe, expect, it } from "vitest";
import {
  createManifestStore,
  findTool,
  parseManifest,
  validateInvocation,
  type ToolDef,
} from "../../src/data/manifest/index.js";
import { FRAMEWORK_TOOLS } from "../../src/data/manifest/framework.js";
import { fixture, largeManifest, raw, toolNamed } from "../support/manifest.js";
import { contextAt, verbSource } from "../../src/interaction/completion/index.js";

function parsedOrThrow(source: unknown) {
  const result = parseManifest(source);
  if (!result.ok) throw new Error(result.error.map((e) => `${e.path}: ${e.message}`).join("; "));
  return result.value;
}

function errorText(source: unknown): string {
  const result = parseManifest(source);
  return result.ok ? "" : result.error.map((e) => `${e.path}: ${e.message}`).join("\n");
}

describe("C05 loader edges", () => {
  it("T3.1: seal before load throws", () => {
    const store = createManifestStore();
    expect(() => store.seal()).toThrow(/before a manifest is loaded/);
    expect(store.sealed).toBe(false);
  });

  it("T3.2 (I11): load after seal throws", () => {
    // The whole reason the store has states. A manifest swapped mid-session
    // leaves completion offering flags the parser rejects.
    const store = createManifestStore();
    const first = fixture();
    store.load(first);
    store.seal();

    expect(() => store.load(fixture())).toThrow(/sealed/);
    expect(store.manifest, "the failed load must not have taken effect").toBe(first);
  });

  it("T3.3: seal twice is a no-op", () => {
    const store = createManifestStore();
    store.load(fixture());
    store.seal();

    expect(() => store.seal()).not.toThrow();
    expect(store.sealed).toBe(true);
  });
});

describe("C05 parse edges", () => {
  it("T3.4: an empty tools array parses, and findTool always returns null", () => {
    // The shell must still open. An app with no verbs is unusual, not malformed.
    const m = parsedOrThrow({ ...raw(), tools: [] });

    // `appTools` is what the app wrote; `tools` is that plus the framework's
    // six, which `parseManifest` appends to every manifest (C05 §3). Asserted
    // on the partition rather than on `tools` being empty — the original read
    // `tools` and went red the day the six landed, because nothing re-ran it.
    expect(m.appTools).toEqual([]);
    expect(m.tools.map((t) => t.name)).toEqual(FRAMEWORK_TOOLS.map((t) => t.name));
    expect(findTool(m, ["ps"])).toBeNull();
    expect(findTool(m, [])).toBeNull();
  });

  it("T3.11: a requires cycle is a parse error, not an infinite loop at validation", () => {
    const source = raw();
    const flags = (source["tools"] as Record<string, unknown>[])[2]!["flags"] as Record<string, unknown>[];
    flags[0]!["requires"] = ["traffic"]; // --to requires --traffic, which requires --to

    expect(errorText(source)).toMatch(/"requires" forms a cycle: --to → --traffic → --to/);
  });

  it("T3.11b: a flag requiring itself is the same cycle, one step shorter", () => {
    const source = raw();
    const flags = (source["tools"] as Record<string, unknown>[])[2]!["flags"] as Record<string, unknown>[];
    flags[0]!["requires"] = ["to"];

    expect(errorText(source)).toMatch(/forms a cycle/);
  });

  it("T3.12: conflicts naming a flag that does not exist is a parse error", () => {
    // A relation pointing at nothing can never fire, and reads at validation
    // time as a rule that is simply never violated.
    const source = raw();
    const flags = (source["tools"] as Record<string, unknown>[])[2]!["flags"] as Record<string, unknown>[];
    flags[2]!["conflicts"] = ["nonesuch"];

    expect(errorText(source)).toMatch(/conflicts "--nonesuch", which this tool does not declare/);
  });

  it("T3.13: a tool name with more spaces than any invocation supplies never matches", () => {
    const source = raw();
    (source["tools"] as unknown[]).push({
      name: "a b c d e f",
      local: true,
      summary: "six tokens",
      args: [],
      flags: [],
    });
    const m = parsedOrThrow(source);

    expect(findTool(m, ["a", "b"])).toBeNull();
    expect(findTool(m, ["a", "b", "c", "d", "e", "f"])?.tool.name).toBe("a b c d e f");
  });

  it("T3.14: 5,000 tools parse within budget and findTool stays sub-millisecond", () => {
    const source = largeManifest(5000);
    const size = JSON.stringify(source).length;

    const parseStart = process.hrtime.bigint();
    const m = parsedOrThrow(source);
    const parseMs = Number(process.hrtime.bigint() - parseStart) / 1e6;

    expect(m.appTools).toHaveLength(5000);
    expect(m.tools).toHaveLength(5000 + FRAMEWORK_TOOLS.length);
    expect(size, "the spec names 10 MB; a smaller document would test a budget nobody set").toBeGreaterThan(
      9_000_000,
    );
    expect(parseMs, `parsing ${(size / 1e6).toFixed(1)} MB took ${parseMs.toFixed(0)} ms`).toBeLessThan(2000);

    // The first call builds the index; every later one is the steady state that
    // C19 pays per keystroke.
    findTool(m, ["group0", "verb0"]);
    const lookups = 1000;
    const start = process.hrtime.bigint();
    for (let i = 0; i < lookups; i++) findTool(m, [`group${i % 100}`, `verb${i}`, "subject"]);
    const perCallUs = Number(process.hrtime.bigint() - start) / 1000 / lookups;

    expect(perCallUs, `findTool averaged ${perCallUs.toFixed(2)} µs per call`).toBeLessThan(1000);
  });

  it("T3.15: duplicate flag names within one tool are a parse error", () => {
    const source = raw();
    const flags = (source["tools"] as Record<string, unknown>[])[0]!["flags"] as Record<string, unknown>[];
    flags.push({ name: "mine", type: "bool", summary: "again" });

    expect(errorText(source)).toMatch(/duplicate flag "--mine", already declared at flags\[1\]/);
  });

  it("T3.16: a short flag colliding across two flags of one tool is a parse error", () => {
    const source = raw();
    const flags = (source["tools"] as Record<string, unknown>[])[0]!["flags"] as Record<string, unknown>[];
    flags.push({ name: "monitor", short: "m", type: "bool", summary: "collides with --mine" });

    expect(errorText(source)).toMatch(/short flag "-m" is already taken by "--mine"/);
  });

  it("T3.17: unicode in tool and flag names parses and resolves", () => {
    const source = raw();
    (source["tools"] as unknown[]).push({
      name: "café ausführen",
      local: true,
      summary: "unicode all the way down",
      args: [],
      flags: [{ name: "größe", type: "int", summary: "how big" }],
    });
    const m = parsedOrThrow(source);

    const match = findTool(m, ["café", "ausführen"]);
    expect(match?.tool.name).toBe("café ausführen");
    expect(validateInvocation(match!.tool, ["--größe=3"]).ok).toBe(true);
  });

  it("T3.17b: completion matches unicode names on grapheme boundaries", () => {
    // The prefix is matched in the tokeniser's coordinate system, so a match
    // must still land on a cluster boundary. `ü` here is a combining sequence,
    // which is where a naive code-unit prefix test cuts a character in half.
    const source = raw();
    const tools = source["tools"] as Record<string, unknown>[];
    tools.push({
      name: "au\u0308sfu\u0308hren",
      local: false,
      summary: "run, with combining marks",
      args: [],
      flags: [],
    });
    const m = parsedOrThrow(source);

    const offered = verbSource(() => m).complete(
      contextAt("/au\u0308s", 6, m),
    ) as readonly { value: string }[];
    expect(offered.map((c) => c.value)).toContain("/au\u0308sfu\u0308hren");

    // And the negative control: a prefix cut mid-cluster matches nothing rather
    // than matching by accident.
    const cut = verbSource(() => m).complete(contextAt("/aus", 4, m)) as readonly { value: string }[];
    expect(cut.map((c) => c.value)).not.toContain("/au\u0308sfu\u0308hren");
  });
});

describe("C05 validation edges", () => {
  const ps = () => toolNamed("ps");
  const scale = () => toolNamed("serving scale");
  const tail = () => toolNamed("tail");

  function args(tool: ToolDef, argv: readonly string[]): Record<string, unknown> {
    const result = validateInvocation(tool, argv);
    if (!result.ok) throw new Error(result.errors.map((e) => e.message).join("; "));
    return result.args as Record<string, unknown>;
  }

  it("T3.5: a tool with no args and no flags validates bare and rejects any argument", () => {
    const serving = toolNamed("serving");

    expect(validateInvocation(serving, []).ok).toBe(true);
    expect(validateInvocation(serving, ["anything"]).ok).toBe(false);
    expect(validateInvocation(serving, ["--anything"]).ok).toBe(false);
  });

  it("T3.6: a variadic positional accepts zero, one and many", () => {
    expect(args(tail(), [])["paths"]).toEqual([]);
    expect(args(tail(), ["a.log"])["paths"]).toEqual(["a.log"]);
    expect(args(tail(), ["a.log", "b.log", "c.log"])["paths"]).toEqual(["a.log", "b.log", "c.log"]);
  });

  it("T3.7: everything after -- is positional, including tokens that look like flags", () => {
    // A path named `--weird` is why this exists.
    const result = args(tail(), ["--", "--status=running", "-q", "--"]);
    expect(result["paths"]).toEqual(["--status=running", "-q", "--"]);
  });

  it("T3.8: a flag value containing = keeps everything after the first one", () => {
    expect(args(ps(), ["--search=a=b"])["search"]).toBe("a=b");
  });

  it("T3.9: an empty flag value is an empty string, distinct from absent", () => {
    expect(args(ps(), ["--search="])["search"]).toBe("");
    expect("search" in args(ps(), [])).toBe(false);
  });

  it("T3.10: clustered short flags expand, and are rejected if any takes a value", () => {
    expect(args(ps(), ["-mq"])).toEqual({ mine: true, quiet: true });

    // `-mn` where `-n` wants a value has no sane reading: the rest of the
    // cluster is either its value or more flags, and guessing would make one
    // string mean two things on two tools.
    const clustered = validateInvocation(ps(), ["-mn"]);
    expect(clustered.ok).toBe(false);
    if (!clustered.ok) {
      expect(clustered.errors.map((e) => e.code)).toContain("clustered_value_flag");
      expect(clustered.errors[0]?.remediation).toMatch(/on its own/);
    }
  });

  it("a short flag on its own takes a value, by = or by the next token", () => {
    expect(args(ps(), ["-n=5"])["limit"]).toBe(5);
    expect(args(ps(), ["-n", "5"])["limit"]).toBe(5);
  });

  it("a long flag takes a value by the next token, because the far side accepts that form", () => {
    // Rejecting `--status running` pre-spawn would reject an invocation that
    // would have worked — the one failure mode a pre-spawn gate must not have.
    expect(args(ps(), ["--status", "running"])["status"]).toBe("running");

    // And a flag left dangling before another flag is still the missing-value
    // error rather than swallowing it.
    const dangling = validateInvocation(ps(), ["--status", "--mine"]);
    expect(dangling.ok).toBe(false);
    if (!dangling.ok) expect(dangling.errors.map((e) => e.code)).toContain("missing_value");
  });

  it("T3.18: the missing-value message recommends `=` only when there is something to recommend", () => {
    // T1.13's principle, applied to a second message: a wrong suggestion is
    // worse than none, because it sends the reader to check something that was
    // never the problem.

    // Nothing follows, so a recommendation would be a guess at what the user
    // meant to type.
    const last = validateInvocation(ps(), ["--since"]);
    expect(last.ok).toBe(false);
    if (!last.ok) {
      expect(last.errors[0]?.message).toBe("--since requires a value");
      expect(last.errors[0]?.remediation).toBeUndefined();
    }

    // What follows is a flag this tool declares, so the user meant it as a flag.
    // `--status=--mine` is not what anyone was reaching for.
    const declared = validateInvocation(ps(), ["--status", "--mine"]);
    expect(declared.ok).toBe(false);
    if (!declared.ok) {
      expect(declared.errors[0]?.message).toBe("--status requires a value");
      expect(declared.errors[0]?.remediation).toBeUndefined();
    }

    // A short flag gets the short form back, not the long one — the message
    // shows the user their own input.
    const short = validateInvocation(ps(), ["-n", "-3"]);
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.errors[0]?.remediation).toBe("write it as -n=-3");
  });

  it("a repeatable flag collects, and a non-repeatable one does not", () => {
    expect(args(ps(), ["--label=a", "--label=b", "--label=c"])["label"]).toEqual(["a", "b", "c"]);
    expect(validateInvocation(ps(), ["--limit=1", "--limit=2"]).ok).toBe(false);
  });

  it("a duration is checked for shape and nothing else", () => {
    expect(args(ps(), ["--since=90m"])["since"]).toBe("90m");
    expect(args(ps(), ["--since=1h30m"])["since"]).toBe("1h30m");
    expect(validateInvocation(ps(), ["--since=soon"]).ok).toBe(false);
  });

  it("every error from one bad invocation is reported, not just the first", () => {
    // An app fixing an invocation wants every complaint at once.
    const result = validateInvocation(scale(), ["--nope", "--traffic=x"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(3); // unknown flag, bad int, two missing positionals
    }
  });
});
