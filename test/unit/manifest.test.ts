// C05 tier 1 — unit. The loader's transition table, the parser's structural
// rules, longest-match resolution, and every validation row in §3.
import { describe, expect, it } from "vitest";
import { FRAMEWORK_TOOLS } from "../../src/data/manifest/framework.js";
import {
  ARG_TYPES,
  createManifestStore,
  findTool,
  parseManifest,
  validateInvocation,
  visibleTools,
  type ArgType,
} from "../../src/data/manifest/index.js";
import { fixture, raw, toolNamed } from "../support/manifest.js";

/** Errors as `path: message`, which is what a failure should read like. */
function errorsOf(result: ReturnType<typeof parseManifest>): string[] {
  return result.ok ? [] : result.error.map((e) => `${e.path}: ${e.message}`);
}

describe("C05 loader", () => {
  it("T1.1: load from unloaded populates the manifest and leaves it unsealed", () => {
    const store = createManifestStore();
    expect(store.manifest).toBeNull();
    expect(store.sealed).toBe(false);

    const m = fixture();
    store.load(m);

    expect(store.manifest).toBe(m);
    expect(store.sealed).toBe(false);
  });

  it("T1.2: load twice replaces, which is what wiring does before sealing", () => {
    // A01 §5 step 2: the shipped fixture is replaced by one fetched from the far
    // side. Refusing the second load would refuse the only reason this state has
    // an outgoing edge to itself.
    const store = createManifestStore();
    const first = fixture();
    const second = parseManifest({ ...raw(), version: "9.9.9" });
    if (!second.ok) throw new Error("fixture must parse");

    store.load(first);
    store.load(second.value);

    expect(store.manifest).toBe(second.value);
    expect(store.manifest?.version).toBe("9.9.9");
  });

  it("T1.3: seal from loaded seals and leaves the manifest untouched", () => {
    const store = createManifestStore();
    const m = fixture();
    store.load(m);
    store.seal();

    expect(store.sealed).toBe(true);
    expect(store.manifest).toBe(m);
  });
});

describe("C05 parse", () => {
  it("T1.4 (I2): a valid fixture parses and is frozen", () => {
    const result = parseManifest(raw());
    expect(errorsOf(result)).toEqual([]);
    if (!result.ok) return;

    expect(Object.isFrozen(result.value)).toBe(true);
    expect(result.value.binary).toBe("widget");
    // Eight from the fixture, plus the six `tui-kit` ships (C05 §3). Written as
    // the sum rather than 14, so a change to either side names which moved.
    expect(result.value.tools).toHaveLength(8 + FRAMEWORK_TOOLS.length);
    expect(
      result.value.tools.slice(-FRAMEWORK_TOOLS.length).map((t) => t.name),
      "appended, so no index the app could read is shifted",
    ).toEqual(FRAMEWORK_TOOLS.map((t) => t.name));
  });

  it("T1.5 (I3): unknown fields are ignored, at the top level and per tool", () => {
    // The anti-drift direction that matters against a *newer* far side: it adds
    // a field, and an older TUI must keep working rather than refusing to start.
    const source = raw();
    source["experiment"] = { enabled: true };
    (source["tools"] as Record<string, unknown>[])[0]!["futureField"] = ["anything", 1, null];

    const result = parseManifest(source);
    expect(errorsOf(result)).toEqual([]);
    if (!result.ok) return;

    expect("experiment" in result.value).toBe(false);
    expect("futureField" in result.value.tools[0]!).toBe(false);
  });

  it("T1.6 (I3): a malformed known field is an error naming its path, not a throw", () => {
    const source = raw();
    (source["tools"] as Record<string, unknown>[])[0]!["flags"] = "not an array";

    const result = parseManifest(source);
    expect(result.ok).toBe(false);
    expect(errorsOf(result)).toContain('tools[0].flags: "flags" must be an array');
  });

  it("T1.7 (I4): values iff enum, pattern iff pattern", () => {
    const enumWithoutValues = raw();
    delete enumFlag(enumWithoutValues, 0)["values"];
    expect(errorsOf(parseManifest(enumWithoutValues))).toContain(
      'tools[0].flags[0].values: "values" is required and must be a non-empty array for type "enum"',
    );

    const valuesOnNonEnum = raw();
    enumFlag(valuesOnNonEnum, 1)["values"] = ["yes", "no"];
    expect(errorsOf(parseManifest(valuesOnNonEnum))).toContain(
      'tools[0].flags[1].values: "values" is only permitted on type "enum", not "bool"',
    );

    const patternWithoutPattern = raw();
    delete promoteArg(patternWithoutPattern)["pattern"];
    expect(errorsOf(parseManifest(patternWithoutPattern))).toContain(
      'tools[3].args[0].pattern: "pattern" is required and must be a string for type "pattern"',
    );
  });

  it("T1.7b (I4): an unanchored or uncompilable pattern fails at parse, not at validation", () => {
    // The point is *where* it fails. An unanchored pattern accepts substrings —
    // more than the app declared — and an uncompilable one would throw inside
    // `validateInvocation`, which claims to be pure and total.
    const unanchored = raw();
    promoteArg(unanchored)["pattern"] = "[\\w.]+:[\\w]+";
    expect(errorsOf(parseManifest(unanchored)).join("\n")).toMatch(/must be anchored/);

    const escapedDollar = raw();
    promoteArg(escapedDollar)["pattern"] = "^price\\$";
    expect(
      errorsOf(parseManifest(escapedDollar)).join("\n"),
      "a trailing escaped dollar is a literal, not an anchor",
    ).toMatch(/must be anchored/);

    const broken = raw();
    promoteArg(broken)["pattern"] = "^([a-z$";
    expect(errorsOf(parseManifest(broken)).join("\n")).toMatch(/not a valid regular expression/);
  });

  it("T1.7c (I5): ARG_TYPES carries no domain concept", () => {
    // The list is written out **literally**. Derived from ARG_TYPES it would
    // agree with itself and pass on any addition — a rule with nothing to be
    // wrong about, which is the failure A03 §2 exists to name.
    const EXPECTED_ARG_TYPES = [
      "string",
      "int",
      "bool",
      "path",
      "enum",
      "duration",
      "pattern",
    ] as const;
    const _exhaustive: readonly ArgType[] = EXPECTED_ARG_TYPES;
    void _exhaustive;

    expect(
      [...ARG_TYPES].sort(),
      "an ArgType describes a shape, not a domain concept — a uuid is a `pattern`, " +
        "a target is a `string`. Adding either means the framework has begun to know an app's nouns (C05 I5)",
    ).toEqual([...EXPECTED_ARG_TYPES].sort());
  });

  it("T1.8 (I6): duplicate tool names are a parse error, not last-wins", () => {
    // Last-wins is the version that ships quietly: the manifest still loads and
    // one of the two tools is simply never reachable.
    const source = raw();
    const tools = source["tools"] as Record<string, unknown>[];
    tools.push(structuredClone(tools[0]!));

    expect(errorsOf(parseManifest(source)).join("\n")).toMatch(
      /tools\[8\]\.name: duplicate tool "ps", already declared at tools\[0\]/,
    );
  });
});

describe("C05 findTool", () => {
  it("T1.9 (I7): a sub-verb beats its own prefix", () => {
    const match = findTool(fixture(), ["serving", "scale", "web"]);

    expect(match?.tool.name).toBe("serving scale");
    expect(match?.consumed).toBe(2);
    expect(match?.residual).toEqual(["web"]);
  });

  it("T1.10 (I7): the prefix still resolves on its own", () => {
    const match = findTool(fixture(), ["serving"]);

    expect(match?.tool.name).toBe("serving");
    expect(match?.consumed).toBe(1);
    expect(match?.residual).toEqual([]);
  });

  it("T1.11: tokens matching nothing return null", () => {
    expect(findTool(fixture(), ["nonesuch"])).toBeNull();
    expect(findTool(fixture(), [])).toBeNull();
  });

  it("T1.15: a hidden tool is absent from visibleTools and still resolves", () => {
    // Asserted together. Split into two tests both pass while the intent —
    // invocable, not offered — goes missing between them.
    const m = fixture();

    expect(visibleTools(m).map((t) => t.name)).not.toContain("debug dump");
    expect(findTool(m, ["debug", "dump"])?.tool.name).toBe("debug dump");
  });

  it("T1.15b: oneShot survives parsing and is readable by C22's gate", () => {
    expect(toolNamed("dashboard").oneShot).toBe(true);
    expect(toolNamed("ps").oneShot).toBeUndefined();
  });
});

describe("C05 validate", () => {
  const ps = () => toolNamed("ps");
  const scale = () => toolNamed("serving scale");

  function messages(tool: ReturnType<typeof ps>, argv: readonly string[]): string[] {
    const result = validateInvocation(tool, argv);
    return result.ok ? [] : result.errors.map((e) => e.message);
  }

  // T1.12 — one row of §3 per case: the crafted argv fails, the corrected one
  // passes. Both halves matter; a check that rejects everything also "fires".
  const ROWS = [
    { row: "unknown flag", bad: ["--open-mrr"], good: ["--open-mr"], code: "unknown_flag" },
    { row: "unknown short flag", bad: ["-Z"], good: ["-q"], code: "unknown_short_flag" },
    { row: "value on a switch", bad: ["--mine=yes"], good: ["--mine"], code: "unexpected_value" },
    { row: "missing value", bad: ["--status"], good: ["--status=running"], code: "missing_value" },
    { row: "enum member", bad: ["--status=finished"], good: ["--status=failed"], code: "bad_value" },
    { row: "type mismatch", bad: ["--limit=abc"], good: ["--limit=12"], code: "bad_value" },
    { row: "repeated non-repeatable", bad: ["--search=a", "--search=b"], good: ["--search=a"], code: "repeated_flag" },
  ] as const;

  for (const { row, bad, good, code } of ROWS) {
    it(`T1.12 (${row}): fires on the crafted argv and passes on the corrected one`, () => {
      const failed = validateInvocation(ps(), bad);
      expect(failed.ok, `${bad.join(" ")} must be rejected`).toBe(false);
      if (!failed.ok) expect(failed.errors.map((e) => e.code)).toContain(code);

      expect(validateInvocation(ps(), good).ok, `${good.join(" ")} must be accepted`).toBe(true);
    });
  }

  it("T1.12 (missing required positional): fires and passes", () => {
    expect(validateInvocation(scale(), ["web"]).ok).toBe(false);
    expect(validateInvocation(scale(), ["web", "3"]).ok).toBe(true);
  });

  it("T1.12 (too many positionals): fires and passes", () => {
    expect(validateInvocation(scale(), ["web", "3", "extra"]).ok).toBe(false);
    expect(validateInvocation(scale(), ["web", "3"]).ok).toBe(true);
  });

  it("T1.12 (requires unsatisfied): fires and passes", () => {
    expect(messages(scale(), ["web", "3", "--traffic=10"]).join("\n")).toMatch(/--traffic requires --to/);
    expect(validateInvocation(scale(), ["web", "3", "--traffic=10", "--to=canary"]).ok).toBe(true);
  });

  it("T1.12 (conflicts violated): fires and passes", () => {
    // Reported once, and from the flag that declares the conflict. `--overlay`
    // declares nothing back, which is how an app ordinarily writes it.
    const errors = messages(scale(), ["web", "3", "--side-by-side", "--overlay"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/--side-by-side cannot be combined with --overlay/);
    expect(validateInvocation(scale(), ["web", "3", "--side-by-side"]).ok).toBe(true);
  });

  it("T1.16 (I16): both flag-value forms produce the same args", () => {
    // The permissive rule as an equality rather than as two separate passes.
    // Rejecting the space-separated form here would reject an invocation the far
    // side would have run — the one failure mode a pre-spawn gate must not have.
    const spaced = validateInvocation(ps(), ["--status", "running"]);
    const equals = validateInvocation(ps(), ["--status=running"]);

    expect(spaced.ok && equals.ok).toBe(true);
    if (spaced.ok && equals.ok) expect(spaced.args).toEqual(equals.args);
  });

  it("T1.17 (I16, §3): a value beginning with - is refused with the form that works", () => {
    // Both halves in one test. The message is only right if the thing it
    // recommends actually works, and split in two, each half passes while the
    // pair stops being true — `--since=-1h` failing its own duration check would
    // send the reader from one error straight into another.
    const refused = validateInvocation(ps(), ["--since", "-1h"]);
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      const [first] = refused.errors;
      expect(first?.code).toBe("missing_value");
      expect(first?.message).toContain('a value beginning with "-" must use --since=-1h');
      expect(first?.remediation).toBe("write it as --since=-1h");
      expect(first?.details?.["value"]).toBe("-1h");
    }

    const accepted = validateInvocation(ps(), ["--since=-1h"]);
    expect(accepted.ok, "--since=-1h is what the message recommends").toBe(true);
    if (accepted.ok) expect(accepted.args["since"]).toBe("-1h");
  });

  it("T1.18 (I17): a conflict is reported once, whichever side declares it", () => {
    // One-directional is how an app ordinarily writes it, and deduplicating by
    // name order dropped exactly those. Mutual is one mistake, so it stays one
    // error — two would be a worse message rather than a stricter check.
    const oneWay = messages(scale(), ["web", "3", "--side-by-side", "--overlay"]);
    expect(oneWay).toHaveLength(1);
    expect(oneWay[0]).toMatch(/--side-by-side cannot be combined with --overlay/);

    const source = raw();
    const tools = source["tools"] as Record<string, unknown>[];
    const flags = tools[2]!["flags"] as Record<string, unknown>[];
    flags[3]!["conflicts"] = ["side-by-side"]; // --overlay now declares it back
    const parsed = parseManifest(source);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const mutual = validateInvocation(parsed.value.tools[2]!, ["web", "3", "--side-by-side", "--overlay"]);
    expect(mutual.ok).toBe(false);
    if (!mutual.ok) expect(mutual.errors.filter((e) => e.code === "conflicts_violated")).toHaveLength(1);
  });

  it("T1.13: a near-miss carries a suggestion and a distant miss carries none", () => {
    // A wrong suggestion is worse than none — it sends the reader to check a
    // flag that was never the problem.
    const near = validateInvocation(ps(), ["--open-mrr"]);
    expect(near.ok).toBe(false);
    if (!near.ok) {
      expect(near.errors[0]?.remediation).toBe("did you mean --open-mr?");
      expect(near.errors[0]?.details?.["suggestion"]).toBe("open-mr");
    }

    const far = validateInvocation(ps(), ["--zzzzz"]);
    expect(far.ok).toBe(false);
    if (!far.ok) {
      expect(far.errors[0]?.remediation).toBeUndefined();
      expect(far.errors[0]?.details?.["suggestion"]).toBeUndefined();
    }
  });

  it("T1.14 (I9): every failure is an ErrorLike with a non-empty message", () => {
    const result = validateInvocation(scale(), ["--nope", "--traffic=x", "--overlay", "--side-by-side"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.errors.length).toBeGreaterThan(1);
    for (const e of result.errors) {
      expect(typeof e.message).toBe("string");
      expect(e.message.length).toBeGreaterThan(0);
      expect(e.stage).toBe("validation");
    }
  });

  it("a valid invocation returns typed args", () => {
    const result = validateInvocation(ps(), ["--limit=12", "--mine", "--status=running", "--label=a", "--label=b"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.args).toEqual({ limit: 12, mine: true, status: "running", label: ["a", "b"] });
  });

  it("a pattern-typed positional accepts what it declares and rejects the rest", () => {
    // EX5 from the using end: the framework checks the shape and knows nothing
    // about what a target is.
    expect(validateInvocation(toolNamed("promote"), ["family.one:candidate"]).ok).toBe(true);
    expect(validateInvocation(toolNamed("promote"), ["not a target"]).ok).toBe(false);
  });
});

// --- fixture navigation, kept out of the assertions ------------------------

type Bag = Record<string, unknown>;

function toolAt(source: Bag, index: number): Bag {
  return (source["tools"] as Bag[])[index]!;
}

function enumFlag(source: Bag, index: number): Bag {
  return (toolAt(source, 0)["flags"] as Bag[])[index]!;
}

function promoteArg(source: Bag): Bag {
  return (toolAt(source, 3)["args"] as Bag[])[0]!;
}
