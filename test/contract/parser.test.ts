// C18 tier 2 — contract. The properties C19, C21 and L4 are written against,
// plus §8a replayed row for row.
//
// **T2.11 is the artefact, not a summary of it.** §8a resolved every row by
// hand before any code, and it is indexed by rule interaction rather than by
// input coverage: a row governed by one rule restates that rule, and every
// defect the walk produced lived where two correct statements overlap. The
// replay asserts the *whole* result — kind, tool, argv, residual, validation
// and the rule that fired — because C17's trace replayed correctly over a
// wrong grouping while only text and cursor were checked.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { checkModuleGraph } from "../../tools/enforce/module-graph.mjs";
import { checkSourceScans } from "../../tools/enforce/source-scans.mjs";
import { validateInvocation } from "../../src/data/manifest/index.js";
import { parse, prefixPolicy, tokenise } from "../../src/interaction/parser/index.js";
import type { ParseContext, ParseResult } from "../../src/interaction/parser/index.js";
import { fixture } from "../support/manifest.js";

const ctx = (over: Partial<ParseContext> = {}): ParseContext => ({
  manifest: fixture(),
  binary: "widget",
  lastUuid: "web:v3",
  ...over,
});

/** Everything a row asserts, flattened so one comparison covers the row. */
function shape(r: ParseResult): Record<string, unknown> {
  switch (r.kind) {
    case "app":
    case "local":
      return {
        kind: r.kind,
        tool: r.tool.name,
        argv: [...r.argv],
        residual: [...r.residual],
        valid: r.validation.ok,
      };
    case "builtin":
      return { kind: r.kind, name: r.name, args: [...r.args] };
    case "builtinThenShell":
      return { kind: r.kind, name: r.name, args: [...r.args], rest: r.rest };
    case "shell":
      // `interactive` is part of the row, not an afterthought: a replay that
      // dropped it would agree with an implementation that never sets it (I26).
      return { kind: r.kind, command: r.command, interactive: r.interactive };
    case "error":
      return { kind: r.kind, code: r.error.code };
    default:
      return { kind: r.kind };
  }
}

const app = (
  tool: string,
  argv: readonly string[],
  residual: readonly string[],
  valid = true,
): Record<string, unknown> => ({ kind: "app", tool, argv: [...argv], residual: [...residual], valid });

const local = (
  tool: string,
  argv: readonly string[],
  residual: readonly string[],
  valid = true,
): Record<string, unknown> => ({
  kind: "local",
  tool,
  argv: [...argv],
  residual: [...residual],
  valid,
});

const sh = (command: string, interactive = false): Record<string, unknown> => ({
  kind: "shell",
  command,
  interactive,
});
const bad = (code: string): Record<string, unknown> => ({ kind: "error", code });

/** §8a, verbatim. Grouped by the pair of rules each group is about. */
const TABLE: readonly (readonly [string, Record<string, unknown>])[] = [
  // The prefix against D23's slash
  ["/ps --mine", app("ps", ["ps", "--mine"], ["--mine"])],
  ["/help", local("help", ["help"], [])],
  ["/serving scale web 3", app("serving scale", ["serving", "scale", "web", "3"], ["web", "3"])],
  ["/usr/bin/ls -la", sh("/usr/bin/ls -la")],
  ["//ps", sh("//ps")],
  ["/", bad("no_verb")],
  ["/pss", bad("unknown_verb")],
  ["/zzzzz", bad("unknown_verb")],
  ["/debug dump", local("debug dump", ["debug", "dump"], [])],

  // Built-in interception against operator delegation
  ["cd /tmp", { kind: "builtin", name: "cd", args: ["/tmp"] }],
  ["cd", { kind: "builtin", name: "cd", args: [] }],
  ["cd -", { kind: "builtin", name: "cd", args: ["-"] }],
  ["export A=1", { kind: "builtin", name: "export", args: ["A=1"] }],
  ["cd /tmp && make", { kind: "builtinThenShell", name: "cd", args: ["/tmp"], rest: "make" }],
  ["cd /tmp ; ls", { kind: "builtinThenShell", name: "cd", args: ["/tmp"], rest: "ls" }],
  ["cd /tmp && /ps", { kind: "builtinThenShell", name: "cd", args: ["/tmp"], rest: "widget ps" }],
  ["cd /tmp &&", sh("cd /tmp &&")],
  ["cd /tmp | ls", sh("cd /tmp | ls")],
  ["ls | cd", sh("ls | cd")],
  ["'cd' /tmp", { kind: "builtin", name: "cd", args: ["/tmp"] }],
  ["'/ps'", app("ps", ["ps"], [])],

  // The rewrite against everything it meets
  ["/ps --json | jq '.data[0].uuid'", sh("widget ps --json | jq '.data[0].uuid'")],
  ["/serving scale web | cat", sh("widget serving scale web | cat")],
  ["/ps | /help", sh("widget ps | widget help")],
  ["/zzzzz | cat", sh("widget zzzzz | cat")],
  ['echo "/ps"', sh('echo "/ps"')],
  ["echo '/ps'", sh("echo '/ps'")],
  ["/usr/bin/ls | head", sh("/usr/bin/ls | head")],
  ['cat > "my file.txt"', sh('cat > "my file.txt"')],
  ["ls *.md", sh("ls *.md")],
  ["/tail *.log", app("tail", ["tail", "*.log"], ["*.log"])],

  // `$_`, both halves of I7
  ["echo $_", sh("echo $_")],
  ["/promote $_", app("promote", ["promote", "web:v3"], ["web:v3"])],
  ['/promote "$_"', app("promote", ["promote", "web:v3"], ["web:v3"])],
  ["/promote '$_'", app("promote", ["promote", "$_"], ["$_"], false)],
  [
    "/serving scale web 3 --config=$_",
    app(
      "serving scale",
      ["serving", "scale", "web", "3", "--config=web:v3"],
      ["web", "3", "--config=web:v3"],
    ),
  ],
  ["/promote $_x", app("promote", ["promote", "$_x"], ["$_x"], false)],

  // The marker against everything already in this table (§5a)
  ["/tty vim notes.md", sh("vim notes.md", true)],
  ["/tty", bad("tty_marker_bare")],
  ["/tty cd /x", bad("tty_marker_builtin")],
  ["/tty export A=1", bad("tty_marker_builtin")],
  ["/tty pwd", bad("tty_marker_builtin")],
  ["/tty ls | cat", sh("ls | cat", true)],
  ["ls | /tty vim", sh("ls | widget tty vim")],
  ["/tty /ps", sh("widget ps", true)],
  ["/tty /usr/bin/less f", sh("/usr/bin/less f", true)],
  ['"/tty" vim', sh("vim", true)],
  ["/tty sleep 5 &", bad("background_refused")],
  ["/tty fg", bad("job_control_refused")],
  ["/ttyx vim", bad("unknown_verb")],

  // Refusals against the tokeniser
  ["sleep 5 &", bad("background_refused")],
  ["a && b", sh("a && b")],
  ['echo "a & b"', sh('echo "a & b"')],
  ["sleep 5 & echo x", sh("sleep 5 & echo x")],
  ["fg", bad("job_control_refused")],
  ["echo fg", sh("echo fg")],
  ["&& b", sh("&& b")],

  // Totality against the error path
  ["", { kind: "empty" }],
  ["   ", { kind: "empty" }],
  ["\t", { kind: "empty" }],
  ["'unterminated", bad("parse")],
  ['"unterminated', bad("parse")],
  ["abc\\", bad("parse")],
  ["/ps   ", app("ps", ["ps"], [])],
  ["/ps --status=nonsense", app("ps", ["ps", "--status=nonsense"], ["--status=nonsense"], false)],
  ["/ps --since -1h", app("ps", ["ps", "--since", "-1h"], ["--since", "-1h"], false)],
];

describe("C18 §8a — the classification table, replayed", () => {
  it.each(TABLE)("T2.11: %j", (input, expected) => {
    expect(shape(parse(input, ctx()))).toEqual(expected);
  });

  it("T2.11 (I21): the two rows that depend on a null lastUuid", () => {
    // Kept apart because they need a different context, and folding them into
    // the table by giving every row a context would have hidden which rows the
    // UUID matters to.
    const none = ctx({ lastUuid: null });

    expect(shape(parse("/promote $_", none))).toEqual(bad("no_previous_result"));
    // Lookup precedes expansion: the verb is what the user got wrong.
    expect(shape(parse("/zzz $_", none))).toEqual(bad("unknown_verb"));
  });
});

describe("C18 tier 2 — the properties", () => {
  it("T2.1 (I1): ten thousand adversarial strings yield a result and never a throw", () => {
    const ALPHABET = [
      ..."abc/ ",
      "'",
      '"',
      "\\",
      "|",
      "&",
      "&&",
      ";",
      ">",
      "$_",
      "\t",
      "\u0000",
      "日",
      "👨‍👩‍👧",
      "--flag",
      "cd",
      "fg",
      "/ps",
    ];
    // A fixed walk rather than a random one — C18 is pure, so a corpus that
    // cannot be replayed is a corpus nobody can act on when it fails.
    let seed = 7;
    const next = (n: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };

    const c = ctx();
    for (let i = 0; i < 10_000; i += 1) {
      let input = "";
      for (let j = 0, n = next(9); j <= n; j += 1) {
        input += ALPHABET[next(ALPHABET.length)] as string;
      }
      const result = parse(input, c);
      expect(result.kind, JSON.stringify(input)).toBeTypeOf("string");
    }
  });

  it("T2.5: every ParseResult variant is produced by the table", () => {
    // Exhaustive over the union, which is what it claimed to be while
    // `builtinThenShell` was missing from §2 — T1.9b required the variant and
    // this test was satisfied by a union that did not have it.
    const kinds = new Set(TABLE.map(([input]) => parse(input, ctx()).kind));

    expect([...kinds].sort()).toEqual([
      "app",
      "builtin",
      "builtinThenShell",
      "empty",
      "error",
      "local",
      "shell",
    ]);
  });

  it("T2.6 (I12): a `:` policy reclassifies consistently, and changes nothing else", () => {
    const colon = ctx({ policy: prefixPolicy(":") });

    expect(shape(parse(":ps --mine", colon))).toEqual(app("ps", ["ps", "--mine"], ["--mine"]));
    expect(shape(parse(":ps | cat", colon))).toEqual(sh("widget ps | cat"));
    // The prefix moved; nothing else did.
    expect(shape(parse("/ps --mine", colon))).toEqual(sh("/ps --mine"));
    expect(shape(parse("cd /tmp && make", colon))).toEqual({
      kind: "builtinThenShell",
      name: "cd",
      args: ["/tmp"],
      rest: "make",
    });
    expect(shape(parse("sleep 5 &", colon))).toEqual(bad("background_refused"));
  });

  it("T2.8 (I16): every token's span reconstructs its own source", () => {
    for (const [input] of TABLE) {
      const result = tokenise(input);
      if (!result.ok) continue;
      for (const t of result.value) {
        expect(input.slice(t.start, t.end), `${JSON.stringify(input)} @${t.start}`).not.toBe("");
        // The span is the source, so what falls between spans is separators
        // and nothing else — a token the tokeniser dropped would show here.
        expect(t.end, "spans advance").toBeGreaterThan(t.start);
      }
      // What falls *between* spans is whitespace and nothing else — a token the
      // tokeniser silently dropped shows up here as a gap with content in it.
      // Comparing against the input with whitespace stripped does not work and
      // it is worth saying why: a quoted token's span includes its quotes and
      // its inner spaces, so `cat > "my file.txt"` covers seventeen characters
      // of a sixteen-character strip. The gaps are the assertion.
      let at = 0;
      for (const t of result.value) {
        expect(input.slice(at, t.start).trim(), `gap before @${t.start}`).toBe("");
        at = t.end;
      }
      expect(input.slice(at).trim(), "and the tail").toBe("");
    }
  });

  it("T2.9 (I19): the carried validation is the one computed over the carried residual", () => {
    // **The assertion the single `argv` field made impossible.** With only
    // `argv` on the result, a test can see that a ValidationResult is present
    // and not that it corresponds to anything — so "validation before spawning"
    // was a commitment with no way to check it.
    for (const [input] of TABLE) {
      const r = parse(input, ctx());
      if (r.kind !== "app" && r.kind !== "local") continue;
      expect(r.validation, JSON.stringify(input)).toEqual(
        validateInvocation(r.tool, r.residual),
      );
    }
  });

  it("T2.9b (C05 I21): a shellOnly flag is validated, readable, and absent from argv", () => {
    // **`argv` is what reaches the far side; `residual` is what the user
    // typed.** They were the same array, which is F39: `/inspect <c> --raw` ran
    // `docker inspect <c> --raw` and docker exited 125.
    //
    // Asserted on all three, because the defect is only visible in the gap
    // between them — a version that dropped the flag everywhere would pass an
    // argv assertion and lose the value the shell needs.
    const r = parse("/ps --help", ctx());
    expect(r.kind).toBe("app");
    if (r.kind !== "app") return;

    expect(r.argv, "the far side never sees it").toEqual(["ps"]);
    expect(r.residual, "and the user typed it").toEqual(["--help"]);
    expect(r.validation.ok).toBe(true);
    if (!r.validation.ok) return;
    expect(r.validation.args["help"], "so the shell can act on it").toBe(true);
    expect(r.validation.transmitted, "computed by the walk that knows the grammar").toEqual([]);
  });

  it("T2.9c (C05 I21, F148): a valued flag reaches argv with its value", () => {
    // The other half of T2.9b, and the half that was wrong. Every row here used
    // `--help` — a bool, one token — so the walk's one-push-per-iteration was
    // never asked about a flag that spans two, and `/ps --limit 400` became
    // `ps --limit` at the far side (F148). Five tier-5 rows waited on output
    // that could not arrive, and the deadline said nothing about why.
    //
    // Asserted on all three again, for T2.9b's reason: the displayed line and
    // the invocation are different arrays, and only the gap between them shows
    // a value that was dropped from one and kept in the other.
    const r = parse("/ps --limit 400", ctx());
    expect(r.kind).toBe("app");
    if (r.kind !== "app") return;

    expect(r.argv, "the value is half the flag").toEqual(["ps", "--limit", "400"]);
    expect(r.residual, "and it is what the user typed").toEqual(["--limit", "400"]);
    expect(r.validation.ok).toBe(true);
    if (!r.validation.ok) return;
    expect(r.validation.args["limit"]).toBe(400);
  });

  it("T2.9c (C05 I21): `--` still terminates, so a positional named --help travels", () => {
    // The one case a token comparison could get wrong, and the reason `--`
    // exists: after it, `--help` is an argument and not a flag.
    const r = parse("/ps -- --help", ctx());
    expect(r.kind).toBe("app");
    if (r.kind !== "app") return;
    expect(r.argv).toEqual(["ps", "--", "--help"]);
  });

  it("T2.9 (I19): validateInvocation runs exactly once per parse", () => {
    // **A count, because equality alone survives a second call.** Two calls
    // that agree today are exactly the shape ruling 3 exists to prevent, and
    // the correspondence test above passes under both.
    //
    // Counted through the tool rather than through the module: every walk of
    // `validateInvocation` reads `tool.flags`, so a proxy over the tool the
    // manifest holds counts calls without mocking the import graph — which
    // would replace the thing under test with a copy of it.
    const base = fixture();
    let reads = 0;
    const tools = base.tools.map((t) =>
      new Proxy(t, {
        get(target, prop, receiver) {
          if (prop === "flags") reads += 1;
          return Reflect.get(target, prop, receiver) as unknown;
        },
      }),
    );
    const counted = { ...base, tools } as typeof base;

    // The control: one direct call is one read, so the number below is a count
    // of calls and not of something else. A fixture must be shown to respond to
    // the thing under test before it is asserted against.
    const tool = tools.find((t) => t.name === "ps");
    expect(tool).toBeDefined();
    if (tool === undefined) return;
    reads = 0;
    validateInvocation(tool, ["--status=nonsense"]);
    const perCall = reads;
    expect(perCall, "the proxy sees a call at all").toBeGreaterThan(0);

    reads = 0;
    const r = parse("/ps --status=nonsense", { ...ctx(), manifest: counted });
    expect(r.kind).toBe("app");
    if (r.kind !== "app") return;
    expect(r.validation.ok).toBe(false);
    expect(reads, "one validation per parse").toBe(perCall);
  });

  it("T2.2 (I2): no module state in parser/", () => {
    expect(checkSourceScans(SOURCES).filter((v) => v.rule === "SS24")).toEqual([]);
  });

  it("T2.4 (I15): no import from terminal/ or presentation/", () => {
    expect(checkModuleGraph(SOURCES).filter((v) => v.rule === "MG16")).toEqual([]);
  });
});

const SOURCES = [
  "src/interaction/parser/index.ts",
  "src/interaction/parser/types.ts",
  "src/interaction/parser/tokenise.ts",
  "src/interaction/parser/policy.ts",
  "src/interaction/parser/classify.ts",
  "src/interaction/parser/expand.ts",
  "src/interaction/parser/delegate.ts",
  "src/interaction/parser/parse.ts",
];

describe("C18 §5 — validation is local, and delegated output is not C18's to read", () => {
  it("T2.12 (I6): a malformed invocation is refused synchronously, and C18 can spawn nothing", () => {
    // **Nothing is spawned to discover an invocation is malformed** — an
    // absence claim, and the behavioural half cannot show it: a route that
    // spawned first and validated after would return the same error.
    //
    // What can show it is that `parse` returns a value rather than a promise
    // (there is no point at which a spawn could be awaited) and that C18 has no
    // route to a spawner at all. Zero non-relative imports is the strongest
    // form of that: no `node:child_process`, no transport, no runner, and
    // nothing that could acquire one.
    const files = readdirSync("src/interaction/parser")
      .filter((f) => f.endsWith(".ts"))
      .map((f) => `src/interaction/parser/${f}`);
    const outward: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/^\s*import\s[^;]*?from\s+"([^"]+)"/gmu)) {
        if (!m[1]!.startsWith("./") && !m[1]!.startsWith("../")) outward.push(`${f}: ${m[1]!}`);
      }
    }
    expect(outward, "C18 imports nothing it did not write").toEqual([]);
    expect(files.length, "the corpus is not empty").toBeGreaterThan(4);

    // And the validation is in the returned value, not deferred to a caller.
    const parsed = parse("/ps --nonesuch", ctx());
    expect(parsed instanceof Promise, "nothing to await, so nothing to spawn first").toBe(false);
  });

  it("T2.13 (I13): a delegated line comes back whole, and C18 offers nothing that could parse a reply", () => {
    // C18's half of I13 is the one testable here: it hands the shell a command
    // and has no vocabulary for what comes back. The `raw` block is C23's
    // (`execution.ts`'s shell route), and pretending otherwise would put a
    // second envelope contract in the one place there is deliberately none.
    const delegated = parse("echo hi | jq .", ctx());
    expect(delegated.kind, "delegated, not adapted").toBe("shell");

    // **The surface is the assertion.** Every export takes a *line the user
    // typed* — none takes far-side output, so there is no function to call
    // with a shell's reply even if a caller wanted to.
    const surface = readFileSync("src/interaction/parser/index.ts", "utf8");
    const exported = [...surface.matchAll(/export \{([^}]*)\}/gu)]
      .flatMap((m) => m[1]!.split(","))
      .map((n) => n.trim().replace(/^type\s+/u, ""))
      .filter((n) => n.length > 0);
    expect(exported.sort(), "four entry points, all over typed input").toEqual([
      "parse",
      "prefixPolicy",
      "quote",
      "slashPolicy",
      "tokenise",
    ]);
  });
});
