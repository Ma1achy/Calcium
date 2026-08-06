// C05 tier 2 — contract. The properties C18, C19, C06 and L4 are written
// against, plus the two that are structural: exhaustiveness over ArgType and
// the module graph.
import { describe, expect, it } from "vitest";
import { checkModuleGraph } from "../../tools/enforce/module-graph.mjs";
import { checkSourceScans, SCANS } from "../../tools/enforce/source-scans.mjs";
import {
  ARG_TYPES,
  findTool,
  parseManifest,
  suggestName,
  validateInvocation,
  type ArgType,
  type Manifest,
} from "../../src/data/manifest/index.js";
import { fixture, raw, toolNamed } from "../support/manifest.js";

const SOURCES = [
  "src/data/manifest/index.ts",
  "src/data/manifest/types.ts",
  "src/data/manifest/parse.ts",
  "src/data/manifest/find.ts",
  "src/data/manifest/validate.ts",
  "src/data/manifest/store.ts",
];

/** Every path in a value, so freezing can be asserted at depth rather than at the top. */
function everyObject(value: unknown, out: object[] = []): object[] {
  if (value === null || typeof value !== "object") return out;
  out.push(value);
  for (const child of Object.values(value)) everyObject(child, out);
  return out;
}

describe("C05 contract", () => {
  it("T2.1 (I1): the parsed manifest is frozen at every depth", () => {
    // A shallow freeze leaves `tools[2].flags[0].values` mutable, and a test
    // that only probes the top level passes anyway.
    const m = fixture();
    const nodes = everyObject(m);

    expect(nodes.length).toBeGreaterThan(30);
    for (const node of nodes) expect(Object.isFrozen(node)).toBe(true);
  });

  it("T2.2 (I8): validateInvocation is pure — same answer every time, and no I/O", () => {
    const tool = toolNamed("serving scale");
    const argv = ["web", "3", "--to=canary", "--traffic=10", "--config=/etc/widget.toml"];
    const first = validateInvocation(tool, argv);

    for (let i = 0; i < 100; i++) {
      expect(validateInvocation(tool, argv)).toEqual(first);
    }

    // The I/O half is structural rather than observational: a `path` argument
    // is the one place a filesystem check would be tempting, and T6.1 is what a
    // semantic check trips over. `/etc/widget.toml` does not exist in the
    // container, and validation accepts it — which it could not do if it looked.
    expect(first.ok).toBe(true);
  });

  it("T2.3 (I2): a thousand malformed inputs produce errors, never a throw", () => {
    // No Math.random (SS2, and an irreproducible failure is worse than none):
    // the corpus is a deterministic permutation of hostile shapes at every
    // position a manifest has.
    const shapes: unknown[] = [
      undefined,
      null,
      0,
      -1,
      -0,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER,
      "",
      " ",
      "tui.manifest/1",
      "tui.manifest/2",
      "null",
      "[]",
      "{ truncated",
      true,
      false,
      [],
      [null],
      [undefined],
      ["", ""],
      {},
      { name: 1 },
      { nested: { deeply: { junk: [1, 2, 3] } } },
      [[[[[]]]]],
      { toString: null },
      Object.create(null),
      new Map(),
      new Set(),
      /^regex$/,
      new Error("not a manifest"),
      Symbol("tool"),
      () => "a function where a value was expected",
    ];

    // Every position a manifest has: the four root fields, the eight fields a
    // tool declares, the same on a flag and on a positional, and each of those
    // containers replaced wholesale.
    const rootKeys = ["schema", "binary", "version", "tools"];
    const memberKeys = ["name", "local", "summary", "args", "flags", "type", "values", "pattern"];

    let cases = 0;
    const survives = (input: unknown): void => {
      expect(() => parseManifest(input)).not.toThrow();
      cases++;
    };
    const tools = (source: Record<string, unknown>): Record<string, unknown>[] =>
      source["tools"] as Record<string, unknown>[];

    for (const shape of shapes) {
      survives(shape);

      for (const key of rootKeys) {
        const source = raw();
        source[key] = shape;
        survives(source);
      }

      for (const key of memberKeys) {
        const onTool = raw();
        tools(onTool)[0]![key] = shape;
        survives(onTool);

        const onFlag = raw();
        (tools(onFlag)[0]!["flags"] as Record<string, unknown>[])[0]![key] = shape;
        survives(onFlag);

        // `promote`'s positional, which is where the `pattern` rules live.
        const onArg = raw();
        (tools(onArg)[3]!["args"] as Record<string, unknown>[])[0]![key] = shape;
        survives(onArg);
      }

      // Containers replaced wholesale rather than field by field.
      const wholeTool = raw();
      tools(wholeTool)[0] = shape as Record<string, unknown>;
      survives(wholeTool);

      const wholeFlag = raw();
      (tools(wholeFlag)[0]!["flags"] as unknown[])[0] = shape;
      survives(wholeFlag);

      const wholeArg = raw();
      (tools(wholeArg)[3]!["args"] as unknown[])[0] = shape;
      survives(wholeArg);

      const appended = raw();
      (appended["tools"] as unknown[]).push(shape);
      survives(appended);
    }

    expect(cases, "a thousand malformed inputs (C05 T2.3)").toBeGreaterThanOrEqual(1000);
  });

  it("T2.4: every ArgType has a validator, and adding one without a validator fails the build", () => {
    // The compile-time half is `Record<ArgType, Check>` in validate.ts. This is
    // the runtime half: each type actually rejects something, so a table of
    // no-op validators — exhaustive and worthless — does not pass.
    const rejected: Record<ArgType, readonly [string, string]> = {
      string: ["string", ""], // accepts everything; asserted separately below
      path: ["path", ""],
      int: ["int", "abc"],
      bool: ["bool", "maybe"],
      enum: ["enum", "nonesuch"],
      duration: ["duration", "soon"],
      pattern: ["pattern", "no colon here"],
    };

    for (const type of ARG_TYPES) {
      const [, bad] = rejected[type];
      const tool = {
        name: "probe",
        local: true,
        summary: "",
        flags: [],
        args: [
          {
            name: "subject",
            type,
            required: true,
            summary: "",
            ...(type === "enum" ? { values: ["only"] } : {}),
            ...(type === "pattern" ? { pattern: "^\\w+:\\w+$" } : {}),
          },
        ],
      } as const;

      const result = validateInvocation(tool, [bad]);
      if (type === "string" || type === "path") {
        // These two accept any string by design — a path that does not exist is
        // a far-side failure (I10), not a malformed invocation.
        expect(result.ok, `${type} accepts any string`).toBe(true);
      } else {
        expect(result.ok, `${type} must reject "${bad}"`).toBe(false);
      }
    }
  });

  it("T2.5 (I12): every tool resolves to exactly one execution route", () => {
    // `local` is a boolean, so the type makes both-at-once impossible; what this
    // asserts is that the route is *decided by the manifest* and by nothing else
    // — C06 reads this field and has no second source.
    for (const tool of fixture().tools) {
      expect(typeof tool.local, `${tool.name} must declare a route`).toBe("boolean");
    }

    const routes = fixture().tools.map((t) => (t.local ? "local" : "spawn"));
    expect(routes).toContain("local");
    expect(routes, "the fixture must exercise both routes or this proves nothing").toContain("spawn");
  });

  it("T2.6 (I15, MG5): C05 imports nothing from terminal/, presentation/ or above", () => {
    expect(checkModuleGraph(SOURCES)).toEqual([]);
  });

  it("T2.7: parseManifest accepts its own serialised output", () => {
    // **Serialising emits `appTools`** (§3): what round-trips is what the app
    // wrote, and parse re-derives the framework's six. So the property is
    // *sharper* than round-tripping a flat list — it asserts the derivation is
    // deterministic as well as that nothing is lost.
    //
    // Emitting `tools` instead is what makes it false, and instructively: the
    // output then contains rows the parser added, and re-parsing them hits §3's
    // collision check, which cannot tell an app declaring `clear` from a
    // re-parse of output that already contains it.
    const first = fixture();
    const serialised = { ...first, tools: first.appTools, appTools: undefined };
    const round = parseManifest(JSON.parse(JSON.stringify(serialised)));

    expect(round.ok).toBe(true);
    if (!round.ok) return;
    expect(round.value, "equal, framework rows and all").toEqual(first);
  });

  it("T2.7c (I22): --help is on every tool, and only in `tools`", () => {
    // **Reserved, not asked for** — a per-app `--help` is a per-app discipline
    // and one app forgetting it is a verb with no help, which reads exactly
    // like a verb nobody asked about.
    const m = fixture();
    for (const t of m.tools) {
      expect(t.flags.some((f) => f.name === "help"), `${t.name} has --help`).toBe(true);
      expect(t.flags.find((f) => f.name === "help")?.shellOnly, "and it never travels").toBe(true);
    }

    // **Absent from `appTools`, which is what makes T2.7 hold.** The first
    // version appended inside `parseTool`, so the flag went into both — and the
    // round-trip then re-parsed a manifest already carrying it and hit the
    // reserved-name check. T2.7 found it, one test below.
    for (const t of m.appTools) {
      expect(t.flags.some((f) => f.name === "help"), `${t.name} in appTools`).toBe(false);
    }
  });

  it("T2.7d (I22): an app declaring --help fails at parse, as one declaring `clear` does", () => {
    const src = raw();
    const tools = src["tools"] as Record<string, unknown>[];
    const first = tools[0] as Record<string, unknown>;
    first["flags"] = [{ name: "help", type: "bool", summary: "mine" }];

    const result = parseManifest(src);
    expect(result.ok, "reserved, so it collides rather than shadowing").toBe(false);
    if (result.ok) return;
    expect(result.error.map((x) => x.message).join(" ")).toMatch(/reserves on every verb/u);
  });

  it("T2.7e (I21): shellOnly is refused on a valued flag and on a short form", () => {
    // **The narrowness is the ruling.** A switch spans one token, so the strip
    // is a comparison; a valued flag spans tokens the parser would have to
    // re-derive, and a short clusters with others in one token.
    const cases = [
      [{ name: "fmt", type: "string", shellOnly: true, summary: "x" }, /switches only/u],
      [{ name: "fmt", type: "bool", short: "f", shellOnly: true, summary: "x" }, /cannot have a short form/u],
    ] as const;

    for (const [over, pattern] of cases) {
      const src = raw();
      const tools = src["tools"] as Record<string, unknown>[];
      (tools[0] as Record<string, unknown>)["flags"] = [over];
      const result = parseManifest(src);
      expect(result.ok, JSON.stringify(over)).toBe(false);
      if (result.ok) continue;
      expect(result.error.map((x) => x.message).join(" ")).toMatch(pattern);
    }
  });

  it("T2.7b (§3): serialising `tools` rather than `appTools` is rejected, and says why", () => {
    // The control for the test above. Without it, T2.7 passes on an
    // implementation that never appends the framework's rows at all — the
    // property would hold trivially and mean nothing.
    const first = fixture();
    const wrong = parseManifest(JSON.parse(JSON.stringify({ ...first, appTools: undefined })));

    expect(wrong.ok, "the framework's own rows collide with themselves").toBe(false);
    if (wrong.ok) return;
    expect(wrong.error.map((e) => e.message).join("\n")).toContain("Calcium ships");
  });

  it("T2.8 (I8): findTool caches by identity, and a second manifest does not observe the first's", () => {
    // The first cache in the tree, so the purity claim is asserted rather than
    // argued. The second half is the load-bearing one: keyed on *content* — a
    // hash of binary and version, say — two manifests differing only in a field
    // the key ignored would share an index, and that passes every other test in
    // this file.
    const m = fixture();
    expect(findTool(m, ["serving", "scale", "web"])).toEqual(findTool(m, ["serving", "scale", "web"]));

    // Same content, different object, one extra tool. If the second observed
    // the first's index, the new tool would not resolve.
    const source = raw();
    // The name shares no prefix with anything in the fixture, so a miss is a
    // miss rather than a fallback to a shorter match.
    (source["tools"] as unknown[]).push({
      name: "quarantine hold",
      local: false,
      summary: "hold a candidate",
      args: [],
      flags: [],
    });
    const extended = parseManifest(source);
    if (!extended.ok) throw new Error("fixture must parse");

    expect(findTool(m, ["quarantine", "hold"]), "the original manifest never had it").toBeNull();
    expect(findTool(extended.value, ["quarantine", "hold"])?.tool.name).toBe("quarantine hold");

    // And the reverse direction: the original still answers as it did, so the
    // second manifest did not overwrite a shared entry.
    expect(findTool(m, ["serving"])?.tool.name).toBe("serving");
  });

  it("T2.9 (I18): the exported suggester is the one the flag path uses, tie-break included", () => {
    // **Asserted on the tie, because that is the only case two implementations
    // would disagree about.** Any distance-2 suggester agrees that `--open-mrr`
    // means `--open-mr`; what varies is which of two equidistant candidates
    // wins, and a test written against a manifest with no ties in it passes for
    // both answers. C05's answer is declaration order — first at the minimum.
    const tool = toolNamed("ps");
    const names = tool.flags.map((f) => f.name);

    // `limit` and `label` both sit at distance 2 from `labit`, and `limit` is
    // declared first. The direct call and the validator must agree on that, not
    // merely both return something.
    expect(suggestName("labit", names)).toBe("limit");

    const result = validateInvocation(tool, ["--labit=1"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const unknown = result.errors.find((e) => e.code === "unknown_flag");
    expect(unknown?.details?.["suggestion"]).toBe(suggestName("labit", names));

    // And the cutoff, from the other side: nothing within 2 of this.
    expect(suggestName("zzzzzzz", names)).toBeUndefined();
  });

  it("T2.6b (SS35): one Result in the tree, and the rule that keeps it that way fires", () => {
    const scan = SCANS.find((s) => s.id === "SS35");
    expect(scan, "SS35 must exist").toBeDefined();

    // Scope reaches these files — SS26's lesson, which reported compliance for a
    // day by scoping to a directory that did not exist.
    for (const f of SOURCES) expect(f.startsWith(scan!.scope)).toBe(true);
    expect(checkSourceScans(SOURCES)).toEqual([]);

    const fabricated = checkSourceScans(
      ["src/data/manifest/types.ts"],
      () => "export type Result<T, E> = { ok: true; value: T } | { ok: false; errors: E };",
    );
    expect(fabricated.map((v) => v.rule)).toContain("SS35");

    // And it does not fire on the import that every one of these files makes.
    const importing = checkSourceScans(
      ["src/data/manifest/parse.ts"],
      () => 'import {\n  type Manifest,\n  type Result,\n} from "./types.js";',
    );
    expect(importing, "importing the one Result is the correct thing to do").toEqual([]);
  });
});

describe("C05 as C19 will read it", () => {
  it("flags, enum values and sub-verbs are all reachable from the manifest alone", () => {
    // Not C19's tests — C19 does not exist. This asserts the *data* is present
    // to satisfy them, so that when it lands, nothing here has to change.
    const m: Manifest = fixture();
    const ps = m.tools.find((t) => t.name === "ps");

    expect(ps?.flags.map((f) => f.name)).toContain("status");
    expect(ps?.flags.find((f) => f.name === "status")?.values).toEqual(["running", "failed", "queued"]);
    expect(m.tools.map((t) => t.name)).toContain("serving scale");
  });
});
