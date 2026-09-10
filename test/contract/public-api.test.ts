// C24 T2.1 (I2) — the eleven absent components are not reachable from any entry
// point, and T2.3 (I8) — the dev-only entries stay out of the production bundle.
//
// **This is the test that had nothing to be false about until C24 existed.**
// `src/index.ts` was `export {}`, so "not reachable from any entry point" was
// true of a surface with no entries, and "absent from the production bundle" was
// true of a bundle with no root. Both read as satisfied and neither could fail —
// A03 §2's vacuity class holding two invariants open rather than two rules.
//
// The first run found `BlockRegistry`, one of the eleven, named in
// `src/testing/index.ts` — `renderToLines(registry: BlockRegistry, …)`. Two
// consequences, and the second is the one that mattered: a consumer could see
// the type and could not construct one, because `createBlockRegistry` is
// exported from no entry, so both functions were uncallable from outside the
// repo. They were never part of §7's specified surface; they had been written in
// `src/testing/` because a test was their first caller, and `shell/paint.ts`
// then came to depend on them for real frame composition. They live in
// `presentation/render-lines.ts` now, and MG26 is the mechanical half.
import { describe, expect, it } from "vitest";
import { existsSync, globSync, readFileSync } from "node:fs";

/** §3's absent list, verbatim. */
const ELEVEN = [
  "TerminalLifecycle", "FrameScheduler", "TranscriptStore", "Viewport",
  "OverlayManager", "InputRouter", "LineEditor", "HistoryStore",
  "ProcessRunner", "AdapterRegistry", "BlockRegistry",
] as const;

/**
 * The entry points, **read from `package.json` rather than listed here**.
 *
 * The hand-written list this replaces was three long and the manifest had four:
 * `./profiling` landed with C28 and no scan in this file ever looked at it. A
 * second record of a set is a set that drifts, and the direction it drifts in is
 * always *the new one is missing* — which makes every rule below quietly narrower
 * than it reads.
 */
const ENTRIES: readonly string[] = (() => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
    exports: Record<string, { default: string }>;
  };
  return Object.values(manifest.exports).map((e) =>
    e.default.replace(/^\.\/dist\//u, "src/").replace(/\.js$/u, ".ts"),
  );
})();

/**
 * Comments are prose about the rule, not violations of it — and this file's own
 * entry points explain at length which components they exclude, by name. A scan
 * counting raw occurrences would report every entry as violating, which is the
 * inverse of MG25's trap and the same lesson: prose about a mechanism inflates
 * every textual signal of its existence.
 */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("C24 T2.1 (I2) — the eleven are unreachable", () => {
  it("every one of the eleven is a real declaration in src/", () => {
    // The non-vacuity guard, and it is not ceremony. A rename — `Viewport` to
    // `ViewportState`, say — would empty the assertion below of content while
    // leaving it green, which is SS26 exactly: a check that cannot find what it
    // was asked about passes like one that is satisfied.
    const tree = sourceTree();
    for (const name of ELEVEN) {
      expect(tree, `${name} is in §3's absent list and declared nowhere`).toContain(name);
    }
  });

  it("no entry point names one of the eleven", () => {
    for (const entry of ENTRIES) {
      const src = code(entry);
      const found = ELEVEN.filter((n) => new RegExp(`\\b${n}\\b`).test(src));
      expect(found, `${entry} reaches an absent component`).toEqual([]);
    }
  });
});

describe("C24 T2.3 (I8) — testing and fixtures are dev-only", () => {
  it("no entry but the dev ones mentions them, and the runtime entry imports neither", () => {
    const runtime = code("src/index.ts");
    // Type-only imports erase, so the claim is about value imports. C08's
    // `WorldDriver` comes from `data/fixtures/` — L0 — and not from the
    // `@fmx/calcium/fixtures` entry, which is the distinction that keeps this true.
    const valueImports = [...runtime.matchAll(/^import\s+(?!type)[^;]*from\s+"([^"]+)"/gm)].map(
      (m) => m[1] ?? "",
    );
    const reexports = [...runtime.matchAll(/^export\s+(?!type)\{[^}]*\}\s*from\s+"([^"]+)"/gm)].map(
      (m) => m[1] ?? "",
    );

    for (const spec of [...valueImports, ...reexports]) {
      expect(spec, "the runtime entry value-imports a dev-only module").not.toMatch(
        /\.\/(testing|fixtures)\//,
      );
    }
  });
});

/** The whole of `src/` as text, for the guard above. */
function sourceTree(): string {
  return globSync("src/**/*.ts")
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
}

describe("C24 §7 — the published surface answers for itself", () => {
  it("T2.5 (C24 I7): Measure's signature has no tick, and RenderContext's does", () => {
    // **Read from the declaration, because the claim is about a signature.**
    // A runtime call cannot show a parameter's absence: `measure(b, w, child)`
    // type-checks and runs identically whether or not a fourth animation clock
    // is declared, so the only artefact that can be wrong here is the text.
    const types = readFileSync("src/data/viewmodel/types.ts", "utf8");
    const at = types.indexOf("export type Measure<");
    expect(at, "the declaration is where it was").toBeGreaterThan(0);
    const measure = types
      .slice(at, types.indexOf("=> number;", at))
      .replace(/\/\*[\s\S]*?\*\//gu, "");

    const params = [...measure.matchAll(/^ {2}(\w+)\??:/gmu)].map((m) => m[1]);
    expect(params, "block, width, the child measurer and C28's seam — and no clock").toEqual([
      "block", "width", "measureChild", "probe",
    ]);

    // **The control that makes the absence mean something.** `tick` exists, on
    // the context the *renderer* gets — so the scan is reading a real division
    // rather than a word nothing in this file uses. Appearance animates;
    // geometry never does, and a `tick` on `Measure` is how it would start.
    const ctxTypes = readFileSync("src/presentation/blocks/types.ts", "utf8");
    expect(ctxTypes, "the clock is on the render side").toMatch(/^\s+(?:readonly )?tick[?]?:/mu);
    expect(measure, "and not on the measure side").not.toContain("tick");
  });

  it("T2.6 (C24 I10): only createTui reaches I/O from the runtime entry, and the exceptions are named", () => {
    // **Resolved through the entry rather than scanned in it.** `src/index.ts`
    // is a barrel: it holds no statements, so a scan *of* it finds no I/O
    // whatever the surface does. The question I10 asks is what a consumer can
    // *call*, so each value export is resolved to its defining module and that
    // module is asked.
    const entry = code("src/index.ts");
    const exports: { name: string; module: string }[] = [];
    for (const m of entry.matchAll(/export \{([^}]*)\} from "([^"]+)"/gu)) {
      for (const raw of (m[1] ?? "").split(",")) {
        const name = raw.trim();
        if (name === "" || name.startsWith("type ")) continue;
        exports.push({ name, module: m[2] ?? "" });
      }
    }
    expect(exports.length, "a surface to measure").toBeGreaterThan(20);

    const IO = /from "node:(?:fs|child_process|net|http|https|dgram|readline|tty)"|process\.(?:stdout|stdin|stderr|exit)\b/u;
    const reaching = new Set<string>();
    for (const { name, module } of exports) {
      const base = "src/" + module.replace(/^\.\//u, "").replace(/\.js$/u, "");
      const path = existsSync(base + ".ts") ? base + ".ts" : base + "/index.ts";
      if (IO.test(code(path))) reaching.add(name);
    }

    /**
     * **Compared by equality, and `b` is why the row exists** (F927).
     *
     * `createTui` opens the terminal, and that is the invariant's whole
     * exception. `b.image({ path })` reads the file synchronously at
     * construction — a real second one, published, and unnamed for as long as
     * I10 had no row. The read is in the right *layer* (`presentation/` must
     * never open a file: a renderer doing I/O at frame cadence makes `measure`
     * and `render` disagree the moment the file changes between them) and the
     * comment that says so answers where, not whether.
     *
     * Membership would let a third arrive behind it unread, which is the
     * failure MG25's own equality arm was added for.
     */
    const ALLOWED = new Set(["createTui", "b"]);
    expect([...reaching].sort(), "the entry's I/O surface, entire").toEqual([...ALLOWED].sort());
  });

  it("T2.12 (C24 I13): the testing entry ships the document assertions, and degradesTo1Bit lives nowhere else", async () => {
    const testing = await import("../../src/testing/index.js");
    expect(typeof testing.expectDocument, "the entry point").toBe("function");

    // **Built, not listed.** A row asserting `"degradesTo1Bit" in NAMES` is
    // satisfied by the list it was written from; the assertion object is the
    // artefact a consumer actually receives.
    const assertions = testing.expectDocument({
      schema: "tui.view/1",
      command: "x",
      status: "ok",
      meta: {
        verb: null, adapter: "shell", stderr: "", exitCode: 0, durationMs: 1,
        truncated: false, argv: ["x"], transport: "subprocess", origin: "user",
      },
      // **A `scroll` around it, because that is the shape the sweep could not
      // read** (F925). A flat document exercises the assertion and not the walk.
      blocks: [
        {
          kind: "scroll", id: "s", height: 4,
          children: [{ kind: "notice", id: "n", tone: "error", text: "the build failed" }],
        },
      ],
    } as never);
    expect(typeof assertions.degradesTo1Bit, "B04's compliance sweep, shipped").toBe("function");
    expect(assertions.degradesTo1Bit(), "and it runs against a real document").toBe(assertions);

    // **And nowhere else**, which is the half that makes I13 a claim about the
    // module rather than about a function: a consumer reaching it through the
    // runtime entry would have no reason to take the dev-only one.
    const runtime = await import("../../src/index.js");
    expect(Object.keys(runtime), "not on the runtime entry").not.toContain("degradesTo1Bit");
    expect(Object.keys(runtime), "nor is the builder of it").not.toContain("expectDocument");
  });

  it("T2.13 (C24 I14): the measurer's own functions are public, and they are the same functions", async () => {
    const api = await import("../../src/index.js");
    const text = await import("../../src/presentation/text.js");
    const table = await import("../../src/presentation/table/plan.js");

    for (const name of ["planColumns", "cells", "truncate"] as const) {
      expect(typeof (api as Record<string, unknown>)[name], name).toBe("function");
    }
    // **By identity, not by name.** A consumer measuring with a re-exported copy
    // still disagrees with the measurer the day the two diverge, and C09 I1's
    // whole point is that the disagreement is silent — so the row asserts the
    // function object, which no copy can satisfy.
    expect(api.cells, "the measurer's own `cells`").toBe(text.cells);
    expect(api.truncate, "and its `truncate`").toBe(text.truncate);
    expect(api.planColumns, "and the table's planner").toBe(table.planColumns);

    // The non-vacuity guard: the functions do something a `.length` would get
    // wrong, which is the reason they are published at all.
    expect(api.cells("日本"), "a wide cluster is two cells each").toBe(4);
    expect("日本".length, "and `.length` says otherwise").toBe(2);
  });

  it("T2.14 (C24 I19): a hook's argument type has its producers on the same entry", async () => {
    const api = await import("../../src/index.js");
    // `CompletionSource` is a type, so the assertion is on what *builds* its
    // argument: a consumer implementing the hook must be able to derive the
    // `CompletionContext` it receives rather than hand-build a literal that
    // agrees with the test rather than with the derivation.
    for (const name of ["contextAt", "parseManifest"] as const) {
      expect(typeof (api as Record<string, unknown>)[name], name).toBe("function");
    }
    // **And they compose, which is I19's actual claim.** `parseManifest`'s
    // output is `contextAt`'s third argument, so a consumer implementing the
    // hook derives its `CompletionContext` from a manifest rather than writing a
    // literal that agrees with the test instead of with the derivation.
    const parsed = api.parseManifest({
      schema: "tui.manifest/1",
      binary: "widget",
      version: "2.4.0",
      tools: [
        {
          name: "image list",
          local: false,
          summary: "list images",
          args: [{ name: "subject", type: "string", required: false, summary: "what to act on" }],
          flags: [{ name: "all", short: "a", type: "bool", summary: "every one" }],
        },
      ],
    });
    expect(parsed.ok, "the manifest a consumer would parse").toBe(true);
    if (!parsed.ok) return;

    const ctx = api.contextAt("image list --a", 14, parsed.value);
    expect(ctx.tool?.name, "the derivation resolved the tool from the manifest").toBe("image list");
    expect(ctx.prefix, "and the prefix under the cursor").toBe("--a");
    expect(ctx.slot.kind, "and the slot it is completing").toBe("flagName");

    // The non-vacuity guard: the same line with no manifest resolves no tool, so
    // the row above is reading the manifest rather than the string.
    expect(api.contextAt("image list --a", 14, null).tool, "no manifest, no tool").toBeNull();
  });

  it("T2.15 (C24 I22): a grammar registered through the public factory reaches the frame", async () => {
    const api = await import("../../src/index.js");
    const testing = await import("../../src/testing/index.js");
    expect(typeof api.registerGrammar, "a factory you can import").toBe("function");

    const doc = (language: string) =>
      ({
        schema: "tui.view/1", command: "x", status: "ok",
        meta: {
          verb: null, adapter: "shell", stderr: "", exitCode: 0, durationMs: 1,
          truncated: false, argv: ["x"], transport: "subprocess", origin: "user",
        },
        blocks: [{ kind: "code", id: "c", language, text: "const x = 1;" }],
      }) as never;

    /**
     * **And install, which is the half the export list cannot show** (F93, C09
     * I23). The asymmetry this API exists to refuse is an exported block kind
     * with an unexported grammar — a factory a consumer can import and cannot
     * install — and a row asserting only that `registerGrammar` exists passes
     * on a registry that discards its argument.
     *
     * Read in colour, because the whole difference is SGR: `lines()` strips it
     * unless asked, and stripped output reports a correctly highlighted frame
     * and an unhighlighted one as the same string.
     */
    const before = testing.expectDocument(doc("calcium-probe-lang")).lines(60, { colour: true });
    expect(before.join(""), "an unknown language is drawn in the body tone alone").not.toMatch(
      /\u001b\[38;2;198;120;221m/u,
    );

    api.registerGrammar("calcium-probe-lang", (() => ({
      name: "calcium-probe-lang",
      keywords: { keyword: "const" },
      contains: [],
    })) as never);

    const after = testing.expectDocument(doc("calcium-probe-lang")).lines(60, { colour: true });
    expect(after.join(""), "the registered keyword is toned by the theme").toMatch(
      /\u001b\[38;2;198;120;221mconst/u,
    );

    // The control that says the tone is the grammar's doing and not the
    // language name's: a built-in produces the same keyword colour.
    expect(
      testing.expectDocument(doc("javascript")).lines(60, { colour: true }).join(""),
      "the shipped set draws it the same way",
    ).toMatch(/\u001b\[38;2;198;120;221mconst/u);
  });

  it("T2.16 (C24 I26): a consumer can build a ProducerContext, with the real measurer in it", async () => {
    const testing = await import("../../src/testing/index.js");
    const ctx = testing.producerContext();
    // **The frame's own arithmetic.** A producer tested against a reimplemented
    // measurer asserts against something the user never sees — which is exactly
    // what the reference app did, and what deleting its copy found (F37).
    expect(typeof ctx.measure, "the measurer is in it").toBe("function");
    expect(ctx.measure({ kind: "text", id: "t", text: "ok" } as never, 40)).toBeGreaterThan(0);

    // `localContext` adds `ask`, and its default is the **decline** path — C23
    // I36's own semantics, so a handler tested without a scripted answer takes
    // the route `Esc` takes rather than a stub's.
    const local = testing.localContext();
    expect(typeof local.ask, "the confirm seam").toBe("function");
    const YES_NO = [{ key: "yes", label: "Delete" }, { key: "no", label: "Cancel" }];

    // **Unmarked, which is the case the rule exists for** (F926). The shell
    // falls back to the *last* choice because a destructive verb offers the safe
    // option last; this fake said *first*, so a consumer's handler tested here
    // deleted where a user pressing `Esc` would have cancelled.
    await expect(local.ask({ question: "Delete?", choices: YES_NO } as never)).resolves.toBe("no");

    // And a marked one wins, so the row above is reading the fallback rather
    // than the ordering.
    await expect(
      local.ask({
        question: "Delete?",
        choices: [{ key: "yes", label: "Delete", default: true }, { key: "no", label: "Cancel" }],
      } as never),
    ).resolves.toBe("yes");

    // The failed-validation arm: `args` is empty unless a test says what was
    // parsed, so a handler tested without one takes the path a malformed
    // invocation takes (C22 I66).
    expect(local.args, "no scripted parse, no arguments").toEqual({});
  });

  it("T2.17 (C24 I6, C24 I28): LiveSpec declares what to fetch and how to draw it, and no driving policy", () => {
    // **Classified and compared by equality**, because an absence assertion over
    // a type nobody enumerated is satisfied by every field it cannot see. An
    // eleventh field fails this until someone says which of the three it is —
    // which is the moment to notice that it is a fourth.
    const CLASSIFIED: Readonly<Record<string, "identity" | "declaration" | "rendering">> = {
      id: "identity",
      title: "identity",
      every: "declaration",
      fetch: "declaration",
      source: "declaration",
      derive: "declaration",
      staleAfter: "declaration",
      render: "rendering",
      renderError: "rendering",
      renderLoading: "rendering",
    };

    const declared = readFileSync("src/shell/builders/types.ts", "utf8");
    const start = declared.indexOf("export type LiveSpec");
    const body = declared
      .slice(start, declared.indexOf("\nexport ", start + 10))
      .replace(/\/\*[\s\S]*?\*\//gu, "");
    const fields = [...body.matchAll(/^ {4}(?:readonly )?([A-Za-z][A-Za-z0-9]*)\??:/gmu)].map((m) => m[1]);

    expect(fields.slice().sort(), "the whole surface, classified").toEqual(
      Object.keys(CLASSIFIED).slice().sort(),
    );
    // The reader can see the extractor works before believing the comparison.
    expect(fields.length, "over a non-empty type").toBeGreaterThan(5);

    // **I6's actual subject is the driver, not `every`.** What is not
    // configurable is the pausing and the retrying — I28 says so in those words,
    // citing I6 — so the row names the knobs that would make it configurable.
    for (const forbidden of ["pause", "retry", "backoff", "whenHidden", "eager", "poll"]) {
      expect(fields, forbidden).not.toContain(forbidden);
    }
  });
});
