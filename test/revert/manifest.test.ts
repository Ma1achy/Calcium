// C05 tier 6 — fail-on-revert. Each names the edit that makes a test fail, so
// the guard is legible from the change rather than from the assertion.
//
// The form is "removing X → T fails", and the value is in the naming: a test
// that only asserts a behaviour tells the next person what broke, while one
// that names the edit tells them what they did.
import { describe, expect, it } from "vitest";
import {
  ARG_TYPES,
  createManifestStore,
  findTool,
  parseManifest,
  validateInvocation,
} from "../../src/data/manifest/index.js";
import { fixture, raw, toolNamed } from "../support/manifest.js";

describe("C05 fail-on-revert", () => {
  it("T6.1 (I10): adding a semantic check — verifying a target exists at validation → T2.2 fails", () => {
    // The temptation is one line: `existsSync` on a `path`, a lookup on a
    // pattern. It would make validation impure, put I/O on every keystroke by
    // way of C18, and start the framework knowing what an app means.
    const promote = toolNamed("promote");

    // Syntactically valid, semantically meaningless. C05 accepts it, and that
    // acceptance is the invariant: rejection is the far side's to make.
    expect(validateInvocation(promote, ["nothing.real:atall"]).ok).toBe(true);

    const withPath = toolNamed("serving scale");
    expect(
      validateInvocation(withPath, ["web", "1", "--config=/no/such/file.toml"]).ok,
      "a path that does not exist is a far-side failure, not a malformed invocation",
    ).toBe(true);
  });

  it("T6.2 (I3): making unknown fields a parse error → T1.5 fails", () => {
    // This is the regression that breaks against a *newer* far side, which is
    // the one direction nobody tests by hand because it needs a future.
    const source = raw();
    source["capabilities"] = ["something", "this", "version", "does", "not", "know"];

    expect(parseManifest(source).ok).toBe(true);
  });

  it("T6.3 (I7): shortest-match resolution → T1.9 fails", () => {
    // Shortest-match works on every single-token verb and fails the day a
    // sub-verb is added, long after anyone is looking.
    const match = findTool(fixture(), ["serving", "scale", "web"]);

    expect(match?.tool.name).toBe("serving scale");
    expect(match?.consumed).toBe(2);
  });

  it("T6.4 (I11): permitting reload after seal → T3.2 fails", () => {
    const store = createManifestStore();
    store.load(fixture());
    store.seal();

    expect(() => store.load(fixture())).toThrow();
  });

  it("T6.5 (I6): last-wins on duplicate names → T1.8 fails", () => {
    // Last-wins loads successfully and makes one of the two tools unreachable,
    // which is the kind of failure that gets diagnosed as "completion is broken".
    const source = raw();
    const tools = source["tools"] as Record<string, unknown>[];
    tools.push({ ...structuredClone(tools[0]!), summary: "the second ps" });

    expect(parseManifest(source).ok).toBe(false);
  });

  it("T6.7 (I2): a parse path that throws on malformed input → T2.3 fails", () => {
    for (const hostile of [undefined, null, 42, "", [], { tools: 7 }, { schema: {}, tools: [[]] }]) {
      expect(() => parseManifest(hostile)).not.toThrow();
      expect(parseManifest(hostile).ok).toBe(false);
    }
  });

  it("T6.9 (I5): adding a domain-specific ArgType → T1.7c fails", () => {
    // The message a build failure should carry: not "ArgType changed" but what
    // to do instead.
    const domainConcepts = ["uuid", "target", "sigil", "family", "candidate", "run", "deployment"];

    for (const concept of domainConcepts) {
      expect(
        [...ARG_TYPES],
        `an ArgType describes a shape, not a domain concept — a ${concept} is a "pattern" ` +
          `or a "string". Adding it means the framework has begun to know an app's nouns (C05 I5)`,
      ).not.toContain(concept);
    }
  });

  it("T6.10 (I14): rejecting `--flag value` pre-spawn → T1.16 fails", () => {
    // The revert that looks like tightening. Requiring `=` is one line and one
    // fewer branch, and it starts refusing invocations the far side would have
    // run — silently, because the user concludes the command is wrong.
    const ps = toolNamed("ps");

    expect(validateInvocation(ps, ["--status", "running"]).ok).toBe(true);
    expect(validateInvocation(ps, ["-n", "5"]).ok).toBe(true);
  });

  it("T6.11 (§3): reverting the `-`-value remediation to a bare message → T1.17 fails", () => {
    // `--since -1h` is a missing-value failure under the permissive rule, and
    // saying only that leaves the reader to discover `=` for themselves. The
    // message and the thing it recommends are asserted together: a remediation
    // that leads to a second error is worse than none.
    const refused = validateInvocation(toolNamed("ps"), ["--since", "-1h"]);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.errors[0]?.remediation).toBe("write it as --since=-1h");

    expect(validateInvocation(toolNamed("ps"), ["--since=-1h"]).ok).toBe(true);
  });

  it("T6.12 (I15): deduplicating conflicts by name order → T1.18 fails", () => {
    // The optimisation this guards: ordering the pair to deduplicate assumes a
    // symmetry the schema never required. It drops one-directional declarations
    // — the ordinary way an app writes them — while the pair is still *seen*,
    // just never reported from the direction that declared it.
    const scale = toolNamed("serving scale");
    const result = validateInvocation(scale, ["web", "3", "--side-by-side", "--overlay"]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const violations = result.errors.filter((e) => e.code === "conflicts_violated");
      expect(violations, "one-directional conflicts are legal and must be reported").toHaveLength(1);
    }
  });

  it.todo("T6.6: hardcoding an enum in the completion module → T4.3 fails — waits on C19");
  it.todo("T6.8 (I12): spawning a local tool → T4.4 fails — waits on C06");
});
