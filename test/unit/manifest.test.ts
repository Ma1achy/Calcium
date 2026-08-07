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
    // Nine from the fixture, plus the six Calcium ships (C05 §3). Written as
    // the sum rather than 15, so a change to either side names which moved.
    expect(result.value.tools).toHaveLength(9 + FRAMEWORK_TOOLS.length);
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
      /tools\[9\]\.name: duplicate tool "ps", already declared at tools\[0\]/,
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

  it("T1.19b (I23, I24): a flag arm decides, an arm equal to the default is refused, and I19/I20 read both homes", () => {
    const findEdit = (source: Record<string, unknown>): Record<string, unknown> =>
      (source["tools"] as Record<string, unknown>[]).find((t) => t["name"] === "edit")!;
    const flagsOf = (source: Record<string, unknown>): Record<string, unknown>[] =>
      findEdit(source)["flags"] as Record<string, unknown>[];

    // **The arm that has to survive all of this**, first, so the refusals below
    // are not satisfied by a rule that refuses everything. The fixture's `edit`
    // is interactive and carries `--background` with `interactive: false` — the
    // `docker run --detach` shape (F80).
    const clean = parseManifest(raw());
    expect(clean.ok, errorsOf(clean).join("\n")).toBe(true);
    if (!clean.ok) return;
    const tool = clean.value.tools.find((t) => t.name === "edit");
    expect(tool?.interactive, "the verb's default").toBe(true);
    // Asserted on the parsed value, not on the source: `takeOptionalBoolean` was
    // added for this and an unread key is dropped silently under I3's leniency,
    // which looks identical from outside.
    expect(tool?.flags.find((f) => f.name === "background")?.interactive).toBe(false);

    // I23 — an arm equal to the default decides nothing. **Both directions**,
    // because a rule checking one leaves half the vacuous declarations
    // expressible, and it is this refusal that makes the arms on a verb agree.
    const sameAsDefault = raw();
    flagsOf(sameAsDefault)[0]!["interactive"] = true;
    expect(errorsOf(parseManifest(sameAsDefault))).toContain(
      'tools[6].flags[0].interactive: --background declares interactive true and "edit" is ' +
        "already interactive — the flag decides nothing. An arm is the opposite of the " +
        "verb's default, or it is absent",
    );

    const falseOnPlain = raw();
    const ps = (falseOnPlain["tools"] as Record<string, unknown>[])[0]!;
    (ps["flags"] as Record<string, unknown>[])[0]!["interactive"] = false;
    expect(errorsOf(parseManifest(falseOnPlain))).toContain(
      'tools[0].flags[0].interactive: --status declares interactive false and "ps" is ' +
        "already not interactive — the flag decides nothing. An arm is the opposite of the " +
        "verb's default, or it is absent",
    );

    // I24 — I19 read through the flag. `ps` declares nothing, so an arm of
    // `true` is the only way to write the impossible verb here, and a refusal
    // reading the tool's field cannot see it.
    const armWithStreams = raw();
    const ps2 = (armWithStreams["tools"] as Record<string, unknown>[])[0]!;
    ps2["streams"] = true;
    (ps2["flags"] as Record<string, unknown>[])[0]!["interactive"] = true;
    expect(
      errorsOf(parseManifest(armWithStreams)).some((m) =>
        m.includes("is interactive and declares streams"),
      ),
      "an arm re-creates exactly the verb I19 forbids",
    ).toBe(true);

    // The fixture's two local verbs carry no flags, so this row makes one: a
    // local `ps` whose `--status` carries the arm. Built rather than borrowed,
    // and the first attempt asserted `local` on a verb that is not — which the
    // guard caught, and is why the guard is here.
    const armWithLocal = raw();
    const ps3 = (armWithLocal["tools"] as Record<string, unknown>[])[0]!;
    ps3["local"] = true;
    (ps3["flags"] as Record<string, unknown>[])[0]!["interactive"] = true;
    expect(
      errorsOf(parseManifest(armWithLocal)).some((m) => m.includes("is local and interactive")),
      "and the local refusal likewise",
    ).toBe(true);

    // **The row that fails at HEAD before I24** (F118). I20 says `view` is
    // declarable on a flag *and* that it is refused with `interactive`; both
    // halves shipped and they did not meet, so the pair parsed when written this
    // way and was refused when written the other.
    const flagView = raw();
    flagsOf(flagView)[0]!["view"] = true;
    expect(
      errorsOf(parseManifest(flagView)).some((m) => m.includes("declares both view and interactive")),
      "a flag's view against the tool's interactive is the same pair I20 forbids",
    ).toBe(true);
  });

  it("T1.19 (I19): interactive is refused with streams and with local, and accepted alone", () => {
    // **The third half is the one that stops this being a blanket refusal.** A
    // rule that rejected `interactive` outright satisfies the first two
    // assertions exactly, and the field would then be unusable while both
    // negative tests agreed it worked.
    const findEdit = (source: Record<string, unknown>): Record<string, unknown> =>
      (source["tools"] as Record<string, unknown>[]).find((t) => t["name"] === "edit")!;

    const withStreams = raw();
    findEdit(withStreams)["streams"] = true;
    expect(errorsOf(parseManifest(withStreams))).toContain(
      'tools[6].interactive: "edit" is interactive and declares streams — a handoff gives ' +
        "the terminal to the child and a stream reads its stdout into the transcript; " +
        "drop whichever one the verb does not do",
    );

    const withLocal = raw();
    findEdit(withLocal)["local"] = true;
    expect(errorsOf(parseManifest(withLocal))).toContain(
      'tools[6].interactive: "edit" is local and interactive — a local verb is handled ' +
        "in-process and never spawned, so there is no child to hand the terminal to",
    );

    // And the field survives onto the `ToolDef`, which is what C23 reads.
    const clean = parseManifest(raw());
    expect(clean.ok, errorsOf(clean).join("\n")).toBe(true);
    if (!clean.ok) return;
    expect(clean.value.tools.find((t) => t.name === "edit")?.interactive).toBe(true);
    // I3's leniency is not what carried it: an unknown field would be dropped,
    // and a `takeOptionalBoolean` that was never added looks identical from
    // outside unless something asserts the value arrived.
    expect(clean.value.tools.find((t) => t.name === "ps")?.interactive).toBeUndefined();
  });

  it("T1.20 (I20): view is refused with interactive and with oneShot, permitted with streams, and readable from a flag", () => {
    // **The `streams` arm is the one that stops this being a copy of I19.** A
    // rule that refused every combination would satisfy the two negative
    // assertions exactly, and S12's logs view — a streaming source rendered into
    // a pushed view — would be undeclarable while both of them agreed the field
    // worked. That surface is the reason C22 §13a was ruled at all.
    const findEdit = (source: Record<string, unknown>): Record<string, unknown> =>
      (source["tools"] as Record<string, unknown>[]).find((t) => t["name"] === "edit")!;

    const withInteractive = raw();
    findEdit(withInteractive)["view"] = true;
    expect(errorsOf(parseManifest(withInteractive))).toContain(
      'tools[6].view: "edit" declares both view and interactive — on the tool or on a ' +
        "flag, and either way both hand input ownership away, the view to the shell's own " +
        "keymap and the handoff to a child; drop whichever one the verb does not do",
    );

    // **`edit` carries an `interactive: false` arm on `--background` (I23), so
    // dropping the tool's declaration orphans it.** An arm equal to the default
    // decides nothing and is refused, which is the rule doing its job on a
    // fixture edited to say something else — so these rows drop both.
    const withOneShot = raw();
    const e1 = findEdit(withOneShot);
    delete e1["interactive"];
    e1["flags"] = [];
    e1["view"] = true;
    e1["oneShot"] = true;
    expect(errorsOf(parseManifest(withOneShot))).toContain(
      'tools[6].view: "edit" declares both view and oneShot — a one-shot writes one ' +
        "frame and exits without a terminal, and a view is a claim on one that stays",
    );

    // Permitted with `streams`, deliberately — this is S12's shape.
    const withStreams = raw();
    const e2 = findEdit(withStreams);
    delete e2["interactive"];
    e2["flags"] = [];
    e2["view"] = true;
    e2["streams"] = true;
    const streamed = parseManifest(withStreams);
    expect(streamed.ok, errorsOf(streamed).join("\n")).toBe(true);

    // And the field survives onto both declaration sites, which is what C23
    // reads. Asserted rather than assumed: a `takeOptionalBoolean` that was
    // never added drops the key silently under I3's leniency and looks
    // identical from outside.
    const viewTool = raw();
    const e3 = findEdit(viewTool);
    delete e3["interactive"];
    e3["flags"] = [];
    e3["view"] = true;
    const parsed = parseManifest(viewTool);
    expect(parsed.ok, errorsOf(parsed).join("\n")).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.tools.find((t) => t.name === "edit")?.view).toBe(true);
    expect(parsed.value.tools.find((t) => t.name === "ps")?.view).toBeUndefined();
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
