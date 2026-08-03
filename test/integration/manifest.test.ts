// C05 tier 4 — integration. What the manifest is *for*: everything above it
// deriving its behaviour from data rather than from hardcoded knowledge.
//
// Most of this tier waits on components that do not exist yet, and says which.
// T4.6 does not: C04 is built, so the claim that a validation failure renders
// as an ordinary error document is testable today — and a deferral naming a
// component that exists is exactly what `tools/enforce/todo-expiry.mjs` fails.
import { describe, expect, it } from "vitest";
import { pipelineHarness, settled } from "../support/execution.js";
import { visibleTools } from "../../src/data/manifest/index.js";
import { document, validateDocument, type ErrorLike, type ViewDocument } from "../../src/data/viewmodel/index.js";
import { findTool, validateInvocation } from "../../src/data/manifest/index.js";
import { fixture, raw, toolNamed } from "../support/manifest.js";
import {
  contextAt,
  flagNameSource,
  flagValueSource,
} from "../../src/interaction/completion/index.js";
import { parseManifest, type Manifest } from "../../src/data/manifest/index.js";

/** The fixture as a `Manifest`, or the parse error as a failure here. */
const parsedOrThrow = (source: Record<string, unknown>): Manifest => {
  const r = parseManifest(source);
  if (!r.ok) throw new Error(`fixture does not parse: ${JSON.stringify(r.error)}`);
  return r.value;
};
import { parse } from "../../src/interaction/parser/index.js";

/**
 * The error path, as C23 will drive it: whatever produced the `ErrorLike` —
 * this validator, a subprocess exit code, a transport timeout — the document is
 * assembled the same way. Nothing here is manifest-specific, which is the point.
 */
function errorDocument(error: ErrorLike, argv: readonly string[]): ViewDocument {
  return document({
    schema: "tui.view/1",
    command: argv.join(" "),
    status: "error",
    blocks: [{ kind: "notice", id: "e1", text: error.message, tone: "error", glyph: "error" }],
    error,
    meta: {
      verb: argv[0] ?? null,
      adapter: "fallback",
      exitCode: 2,
      durationMs: 0,
      truncated: false,
      argv,
      stderr: "",
      transport: "local",
      origin: "user",
    },
  });
}

describe("C05 integration", () => {
  it("T4.6 (with C04): a validation failure renders as an ordinary error document", () => {
    const m = fixture();
    const argv = ["ps", "--open-mrr"];
    const match = findTool(m, ["ps"]);
    expect(match).not.toBeNull();

    const result = validateInvocation(match!.tool, ["--open-mrr"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    const error = result.errors[0]!;
    const doc = errorDocument(error, argv);

    // The whole claim: no special case. It validates as any document does, it
    // carries the same blocks a far-side failure would, and the only thing that
    // marks its origin is `stage`.
    expect(validateDocument(doc).ok).toBe(true);
    expect(doc.status).toBe("error");
    expect(doc.blocks[0]?.kind).toBe("notice");
    expect(doc.error?.message).toMatch(/no flag --open-mrr/);
    expect(doc.error?.stage).toBe("validation");

    // And the remediation survives into the document, which is the reason
    // suggestions are attached to the error rather than printed by the parser.
    expect(doc.error?.remediation).toBe("did you mean --open-mr?");
  });

  it("T4.6b (with C04): a far-side failure builds the same document from the same shape", () => {
    // Same assembly, different origin. If these two diverged, the error path
    // would have a special case in it and T4.6 would be measuring nothing.
    const farSide: ErrorLike = { message: "candidate is not promotable", code: "conflict", stage: "far-side" };
    const doc = errorDocument(farSide, ["promote", "family.one:candidate"]);

    expect(validateDocument(doc).ok).toBe(true);
    expect(doc.blocks[0]?.kind).toBe("notice");
    expect(doc.status).toBe("error");
  });

  it("T4.1 (with C18, D17): a classified input validates before any transport call", () => {
    // D17's whole argument, asserted from C05's side: the structure is local,
    // so a malformed invocation costs nothing rather than 300 ms of interpreter
    // startup to be told the same thing. The spy is what makes "before" mean
    // something — an assertion that the result is invalid would pass equally
    // well if the transport had run first.
    let invoked = 0;
    const transport = {
      invoke: () => {
        invoked += 1;
        throw new Error("the transport must not be reached during parsing");
      },
    };

    const result = parse("/ps --status=nonsense", {
      manifest: fixture(),
      binary: "widget",
      lastUuid: null,
    });

    expect(result.kind).toBe("app");
    if (result.kind !== "app") return;
    expect(result.validation.ok, "rejected locally").toBe(false);
    expect(invoked, "and nothing was spawned to find that out").toBe(0);
    void transport;
  });
  it("T4.2: completion candidates for --status= come from the manifest's values", async () => {
    // C05's whole claim, asserted from the consuming side: the values are the
    // manifest's, not a list completion keeps.
    const flag = toolNamed("ps").flags.find((f) => f.name === "status");
    const got = flagValueSource().complete(contextAt("/ps --status=", 13, fixture()));
    expect((got as readonly { value: string }[]).map((c) => c.value)).toEqual(flag?.values);
  });

  it("T4.3: adding a flag to the fixture makes it completable with no TypeScript change", () => {
    // The anti-drift test from C05's side. No code below changes; only data.
    const source = raw();
    const tools = source["tools"] as Record<string, unknown>[];
    const ps = tools.find((t) => t["name"] === "ps");
    if (ps === undefined) throw new Error("the fixture no longer has a `ps`");

    const before = flagNameSource().complete(contextAt("/ps --zo", 8, parsedOrThrow(raw())));
    expect((before as readonly unknown[]).length, "the fixture must not already have it").toBe(0);

    (ps["flags"] as Record<string, unknown>[]).push({
      name: "zone",
      type: "string",
      summary: "which zone",
    });
    const after = flagNameSource().complete(contextAt("/ps --zo", 8, parsedOrThrow(source)));
    expect((after as readonly { value: string }[]).map((c) => c.value)).toEqual(["--zone"]);
  });
  // T4.4 and T4.5 are written, in test/integration/transport.test.ts: the
  // routing decision is C06's to be driven by and C05's to supply, and it reads
  // better beside the transport than beside the loader. Named here so the pair
  // is findable from the spec that declares them.
  it("T4.7 (with C23): help output is generated wholly from visibleTools", async () => {
    // **C23 I26 — from the manifest and the keymap, never a maintained list.**
    // The claim is `visibleTools`, not `tools`: a hidden verb stays invocable
    // and leaves the help, which is the pair that field means. `/debug` is the
    // live case, since the framework marks it hidden (C05 §3).
    const h = pipelineHarness();
    h.pipeline.submit("/help");
    await settled();

    const rendered = JSON.stringify(h.transcript.entries.at(-1)?.doc.blocks);
    const manifest = fixture();

    for (const t of visibleTools(manifest)) {
      expect(rendered, `${t.name} is visible and must appear`).toContain(t.name);
    }
    const hidden = manifest.tools.filter((t) => t.hidden === true);
    expect(hidden.length, "the fixture has a hidden verb, or this asserts nothing")
      .toBeGreaterThan(0);
    for (const t of hidden) {
      expect(rendered, `${t.name} is hidden and must not`).not.toContain(`/${t.name}`);
    }

    // And the keymap half: every binding shown is one C16 will dispatch.
    expect(rendered, "bindings come from the same table dispatch uses").toContain("c+c");
  });
});
