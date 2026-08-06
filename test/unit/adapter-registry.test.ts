// C07 tier 1 and 3 — the mapping, the registry and the stream.
//
// The §8 transition table is covered cell by cell, and the §4 mapping row by
// row. What is asserted throughout is that a document came back *and was
// valid* (I5): C07 is the component most likely to hand-build a document under
// stress — exit 2, spawn failure, adapter throw, degraded stream — and an
// invalid one surfaces as a render crash rather than as an error message.
import { describe, expect, it } from "vitest";
import {
  RegistrySealedError,
  createAdapterRegistry,
  exitCodeOf,
} from "../../src/data/adapters/index.js";
import { AdapterSchemaError } from "../../src/data/adapters/types.js";
import type { Adapter, AdapterContext, RawResult } from "../../src/data/adapters/types.js";
import type { AdapterMeta } from "../../src/data/viewmodel/types.js";
import { createNdjsonReader } from "../../src/data/transport/index.js";
import { validateDocument } from "../../src/data/viewmodel/index.js";
import type { ToolDef } from "../../src/data/manifest/index.js";

const CTX: AdapterContext = Object.freeze({
  command: "/ps",
  verb: "ps",
  width: 100,
  userRequestedJson: false,
  flags: {},
  transport: "subprocess",
  origin: "user",
  tool: null,
});

function raw(over: Partial<RawResult> = {}): RawResult {
  return Object.freeze({
    argv: ["prism", "ps", "--json"],
    exitCode: 0,
    signal: null,
    stdout: { name: "web" },
    stdoutRaw: '{"name":"web"}',
    stderr: "",
    durationMs: 12,
    parseError: null,
    cancelled: false,
    timedOut: false,
    overflowed: false,
    ...over,
  });
}

/** An adapter that renders one distinctive block, so "was it called" is visible. */
function markerAdapter(over: Partial<Adapter> = {}): Adapter {
  return {
    schema: "tui.view/1",
    adapt: (r, ctx) => ({
      schema: "tui.view/1",
      command: ctx.command,
      status: "ok",
      blocks: [{ kind: "raw", id: "marker", text: "adapted" }],
      meta: { adapter: "marker", truncated: false },
    }),
    ...over,
  };
}

function valid(doc: unknown): void {
  const v = validateDocument(doc);
  expect(v.ok, v.ok ? "" : v.error.join("; ")).toBe(true);
}

describe("§8 — the transition table, every cell", () => {
  it("T1.1: register in the open state → the adapter is used", () => {
    const registry = createAdapterRegistry();
    registry.register("ps", markerAdapter());
    expect(registry.adapt(raw(), CTX).blocks[0]?.id).toBe("marker");
  });

  it("T1.2: seal → sealed, and previously registered adapters still resolve", () => {
    const registry = createAdapterRegistry({ ps: markerAdapter() });
    expect(registry.sealed).toBe(false);
    registry.seal();
    expect(registry.sealed).toBe(true);
    expect(registry.adapt(raw(), CTX).blocks[0]?.id).toBe("marker");
  });

  it("T1.3 / T3.1: adapt works before and after seal", () => {
    const registry = createAdapterRegistry();
    valid(registry.adapt(raw(), CTX));
    registry.seal();
    valid(registry.adapt(raw(), CTX));
  });

  it("T3.2 (I8): register after seal → throws", () => {
    const registry = createAdapterRegistry();
    registry.seal();
    expect(() => {
      registry.register("ps", markerAdapter());
    }).toThrow(RegistrySealedError);
  });

  it("T3.3: seal twice → a no-op", () => {
    const registry = createAdapterRegistry();
    registry.seal();
    registry.seal();
    expect(registry.sealed).toBe(true);
  });
});

describe("§2 (I2) — resolution order", () => {
  const document = {
    schema: "tui.view/1",
    command: "/ps",
    status: "ok",
    blocks: [{ kind: "raw", id: "from-far-side", text: "already a document" }],
    // **A full `DocumentMeta`, and deliberately so.** This is what the *far side*
    // emitted on stdout, not what an adapter returned — a complete `ViewDocument`
    // that the registry recognises and passes through. `AdapterMeta`'s narrowing
    // is about the adapter's return type and says nothing about this path, which
    // is the distinction a mechanical rewrite of every nine-field `meta:` block
    // could not see. F58b.
    meta: {
      verb: "ps",
      adapter: "far-side",
      exitCode: 0,
      durationMs: 1,
      truncated: false,
      argv: [],
      stderr: "",
      transport: "subprocess",
      origin: "user",
    },
  };

  it("T1.4: a valid document on stdout wins over a registered adapter", () => {
    const registry = createAdapterRegistry({ ps: markerAdapter() });
    const doc = registry.adapt(raw({ stdout: document }), CTX);
    expect(doc.blocks[0]?.id).toBe("from-far-side");
    expect(doc.meta.adapter).toBe("far-side");
  });

  it("T1.5: stdout that is not a document → the adapter is called", () => {
    const registry = createAdapterRegistry({ ps: markerAdapter() });
    expect(registry.adapt(raw(), CTX).blocks[0]?.id).toBe("marker");
  });

  it("T1.6 / T2.7 (I11): no adapter registered → the fallback, and a usable document", () => {
    const registry = createAdapterRegistry();
    const doc = registry.adapt(raw(), CTX);
    expect(doc.blocks.map((b) => b.kind)).toEqual(["rule", "keyValue"]);
    valid(doc);
  });

  it("a payload that merely claims the schema is not taken as a document", () => {
    // Sniffing on the field alone would render an invalid document (I5).
    const registry = createAdapterRegistry();
    const doc = registry.adapt(raw({ stdout: { schema: "tui.view/1", nonsense: true } }), CTX);
    expect(doc.blocks[0]?.id).not.toBe("from-far-side");
    valid(doc);
  });

  it("T4.6: deleting the adapter changes nothing when the far side emits a document", () => {
    // The disposability property, tested directly.
    const withAdapter = createAdapterRegistry({ ps: markerAdapter() });
    const without = createAdapterRegistry();
    const input = raw({ stdout: document });
    expect(withAdapter.adapt(input, CTX)).toEqual(without.adapt(input, CTX));
  });
});

describe("§4 (T1.7) — every row of the mapping table", () => {
  const registry = createAdapterRegistry();

  it("cancelled → partial, output retained, a muted notice appended", () => {
    // T1.8: forty lines retained because the user stopped watching.
    const lines = Array.from({ length: 40 }, (_, i) => ({ line: String(i) }));
    const doc = registry.adapt(raw({ stdout: lines, cancelled: true, exitCode: 130 }), CTX);

    expect(doc.status).toBe("partial");
    expect(doc.error).toBeUndefined();
    const table = doc.blocks.find((b) => b.kind === "table");
    if (table?.kind !== "table") throw new Error("the retained output is gone");
    expect(table.rows).toHaveLength(40);
    expect(doc.blocks.at(-1)?.kind).toBe("notice");
    valid(doc);
  });

  it("T1.9: cancelled with no output → partial with only the notice, not error", () => {
    const doc = registry.adapt(
      raw({ stdout: undefined, stdoutRaw: "", cancelled: true, exitCode: null }),
      CTX,
    );
    expect(doc.status).toBe("partial");
    expect(doc.error).toBeUndefined();
    valid(doc);
  });

  it("T3.20: cancelled and timedOut both set → partial, per the precedence", () => {
    const doc = registry.adapt(raw({ cancelled: true, timedOut: true, exitCode: null }), CTX);
    expect(doc.status).toBe("partial");
  });

  it("T1.10: timedOut → error with a TIMEOUT envelope naming the budget", () => {
    const doc = registry.adapt(raw({ timedOut: true, exitCode: null, durationMs: 30_000 }), CTX);
    expect(doc.status).toBe("error");
    expect(doc.error?.code).toBe("TIMEOUT");
    expect(doc.error?.message).toContain("30000");
    valid(doc);
  });

  it("exit 0 → ok", () => {
    expect(registry.adapt(raw(), CTX).status).toBe("ok");
  });

  it("T1.11: exit 1 with an envelope → carried through, remediation becomes a fill action", () => {
    const doc = registry.adapt(
      raw({
        exitCode: 1,
        stdout: {
          message: "The deployment was rejected.",
          code: "REJECTED",
          stage: "validate",
          remediation: "/validate --fix",
        },
      }),
      CTX,
    );

    expect(doc.status).toBe("error");
    expect(doc.error?.code).toBe("REJECTED");
    expect(doc.error?.stage).toBe("validate");

    const tip = doc.blocks.find((b) => b.kind === "tip");
    if (tip?.kind !== "tip") throw new Error("the remediation is not rendered");
    expect(tip.actions?.[0]).toEqual({ kind: "fill", label: "Use", command: "/validate --fix" });
    valid(doc);
  });

  it("T3.16: a remediation that is not a command → text, no fill action", () => {
    const doc = registry.adapt(
      raw({
        exitCode: 1,
        stdout: { message: "Denied.", remediation: "Contact your administrator." },
      }),
      CTX,
    );
    const tip = doc.blocks.find((b) => b.kind === "tip");
    if (tip?.kind !== "tip") throw new Error("the remediation is not rendered");
    expect(tip.actions).toBeUndefined();
  });

  it("T1.12: exit 1 with no envelope → synthesised from stderr, message non-empty", () => {
    const doc = registry.adapt(
      raw({ exitCode: 1, stdout: undefined, stdoutRaw: "", stderr: "connection refused" }),
      CTX,
    );
    expect(doc.error?.message).toBe("connection refused");
    valid(doc);
  });

  it("exit 1 with neither envelope nor stderr still has a message", () => {
    const doc = registry.adapt(raw({ exitCode: 1, stdout: undefined, stdoutRaw: "" }), CTX);
    expect(doc.error?.message.length ?? 0).toBeGreaterThan(0);
  });

  it("T4.4: exit 2 → a usage block generated from the manifest, not hardcoded", () => {
    const tool: ToolDef = {
      name: "ps",
      local: false,
      summary: "List processes",
      args: [{ name: "filter", type: "string", required: false, summary: "A name filter" }],
      flags: [{ name: "all", short: "a", type: "bool", summary: "Include stopped" }],
    };

    const doc = registry.adapt(raw({ exitCode: 2, stderr: "unknown flag --xyz" }), {
      ...CTX,
      tool,
    });

    expect(doc.status).toBe("error");
    const usage = doc.blocks.find((b) => b.kind === "code");
    if (usage?.kind !== "code") throw new Error("no usage block");
    expect(usage.text).toContain("--all");
    expect(usage.text).toContain("[filter]");
    expect(usage.text).toContain("Include stopped");
    valid(doc);
  });

  it("exit 2 with no manifest entry still produces a valid document", () => {
    valid(registry.adapt(raw({ exitCode: 2, stderr: "bad" }), CTX));
  });

  it("signal → a KILLED_BY_SIGNAL envelope", () => {
    const doc = registry.adapt(raw({ exitCode: null, signal: "SIGKILL" }), CTX);
    expect(doc.error?.code).toBe("KILLED_BY_SIGNAL");
    valid(doc);
  });

  it("anything else → UNEXPECTED_EXIT with stderr as raw", () => {
    const doc = registry.adapt(raw({ exitCode: 7, stderr: "boom" }), CTX);
    expect(doc.error?.code).toBe("UNEXPECTED_EXIT");
    expect(doc.blocks.some((b) => b.kind === "raw" && b.text === "boom")).toBe(true);
    valid(doc);
  });

  it("I6: error is present iff the status is error, on every row", () => {
    const rows: RawResult[] = [
      raw(),
      raw({ cancelled: true }),
      raw({ timedOut: true, exitCode: null }),
      raw({ exitCode: 1, stdout: undefined }),
      raw({ exitCode: 2 }),
      raw({ exitCode: null, signal: "SIGTERM" }),
      raw({ exitCode: 7 }),
    ];
    for (const r of rows) {
      const doc = registry.adapt(r, CTX);
      expect(doc.error !== undefined, `status ${doc.status}`).toBe(doc.status === "error");
      valid(doc);
    }
  });
});

describe("I14 (T1.19, T1.20) — meta.exitCode is finite on every path", () => {
  it("an exit code passes through", () => {
    expect(exitCodeOf(raw({ exitCode: 3 }))).toBe(3);
  });

  it.each([
    ["SIGINT", 130],
    ["SIGTERM", 143],
    ["SIGHUP", 129],
    ["SIGKILL", 137],
  ])("%s → %i, which is 128 + signum", (signal, code) => {
    expect(exitCodeOf(raw({ exitCode: null, signal }))).toBe(code);
  });

  it("an unrecognised signal name → 128; killed, number not derivable", () => {
    expect(exitCodeOf(raw({ exitCode: null, signal: "SIGWHAT" }))).toBe(128);
  });

  it("both null → -1, meaning the process never started", () => {
    expect(exitCodeOf(raw({ exitCode: null, signal: null }))).toBe(-1);
  });

  it("T1.20: the two producers of -1 share the code and split on status", () => {
    // A spawn failure and an abort-before-spawn both never started. Only one of
    // them is a failure, and an abort rendering as an error is the same class of
    // wrong that A01 B4 held before it was corrected.
    const registry = createAdapterRegistry();
    const spawnFailure = registry.adapt(
      raw({ exitCode: null, stdout: undefined, stdoutRaw: "", stderr: "ENOENT" }),
      CTX,
    );
    const aborted = registry.adapt(
      raw({ exitCode: null, stdout: undefined, stdoutRaw: "", cancelled: true, durationMs: 0 }),
      CTX,
    );

    expect(spawnFailure.meta.exitCode).toBe(-1);
    expect(aborted.meta.exitCode).toBe(-1);
    expect(spawnFailure.status).toBe("error");
    expect(aborted.status).toBe("partial");
  });
});

describe("I13 (T1.18) — the registry owns meta", () => {
  it("an adapter's provenance claims are overwritten; its three fields survive", () => {
    const liar: Adapter = {
      schema: "tui.view/1",
      adapt: () => ({
        schema: "tui.view/1",
        command: "wrong",
        status: "ok",
        blocks: [{ kind: "raw", id: "x", text: "x" }],
        meta: { adapter: "declared-name", truncated: true, resultId: "run-42" },
      }),
    };

    const registry = createAdapterRegistry({ ps: liar });
    const doc = registry.adapt(raw({ argv: ["prism", "ps"], stderr: "real" }), CTX);

    // Overwritten from what actually ran.
    expect(doc.meta.origin).toBe("user");
    expect(doc.meta.transport).toBe("subprocess");
    expect(doc.meta.argv).toEqual(["prism", "ps"]);
    expect(doc.meta.stderr).toBe("real");
    expect(doc.meta.exitCode).toBe(0);
    expect(doc.meta.verb).toBe("ps");

    // The three the registry cannot know.
    expect(doc.meta.resultId).toBe("run-42");
    expect(doc.meta.adapter).toBe("declared-name");
    expect(doc.meta.truncated).toBe(true);

    // **And the seven are now unclaimable, not merely overwritten** (F58b).
    // This adapter used to declare all ten and the row proved the registry
    // discarded seven — which is a guarantee about the *registry*, and left the
    // adapter author computing values that never reached a document. Both
    // guarantees are asserted, because they fail independently: the type could
    // narrow while `authoritativeMeta` stopped filling, and every assertion
    // above would still pass.
    //
    // @ts-expect-error — `origin` is typed `never` on `AdapterMeta`. Widening it
    // back to `DocumentMeta` makes this compile, the directive unused, and the
    // file stops building.
    const claimed: AdapterMeta = { origin: "agent" };
    void claimed;
  });
});

describe("§7 (I4) — an adapter's failure is contained", () => {
  const thrower = (): Adapter => ({
    schema: "tui.view/1",
    adapt: () => {
      throw new Error("kaboom");
    },
  });

  it("T3.4: a throwing adapter → fallback output plus a muted notice, status unchanged", () => {
    const registry = createAdapterRegistry({ ps: thrower() });
    const doc = registry.adapt(raw(), CTX);

    expect(doc.status).toBe("ok");
    expect(doc.blocks.some((b) => b.kind === "keyValue")).toBe(true);
    const notice = doc.blocks.find((b) => b.kind === "notice");
    if (notice?.kind !== "notice") throw new Error("the failure is unrecorded");
    expect(notice.tone).toBe("muted");
    expect(notice.text).toContain("kaboom");
    valid(doc);
  });

  it("the contained failure keeps the exit code's status, not ok", () => {
    const registry = createAdapterRegistry({ ps: thrower() });
    expect(registry.adapt(raw({ exitCode: 1, stdout: undefined }), CTX).status).toBe("error");
  });

  it("T3.5: an adapter returning undefined is treated as a throw", () => {
    const registry = createAdapterRegistry({
      ps: { schema: "tui.view/1", adapt: () => undefined as never },
    });
    const doc = registry.adapt(raw(), CTX);
    expect(doc.blocks.some((b) => b.kind === "notice")).toBe(true);
    valid(doc);
  });

  it("T3.6: an adapter returning a structurally invalid document is contained", () => {
    const registry = createAdapterRegistry({
      ps: {
        schema: "tui.view/1",
        adapt: () =>
          ({
            schema: "tui.view/1",
            command: "/ps",
            status: "ok",
            blocks: [{ kind: "notice", id: "", tone: "error", text: "no glyph, empty id" }],
            meta: {},
          }) as never,
      },
    });
    const doc = registry.adapt(raw(), CTX);
    expect(doc.blocks.some((b) => b.kind === "notice" && b.tone === "muted")).toBe(true);
    valid(doc);
  });

  it("T3.15: an envelope whose details are cyclic → contained, message still renders", () => {
    const details: Record<string, unknown> = { a: 1 };
    details["self"] = details;
    const registry = createAdapterRegistry();
    const doc = registry.adapt(
      raw({ exitCode: 1, stdout: { message: "Failed.", details } }),
      CTX,
    );
    expect(doc.error?.message).toBe("Failed.");
    valid(doc);
  });

  it("adapt never throws, whatever the adapter does", () => {
    for (const bad of [
      () => {
        throw new Error("x");
      },
      () => undefined as never,
      () => null as never,
      () => 42 as never,
    ]) {
      const registry = createAdapterRegistry({ ps: { schema: "tui.view/1", adapt: bad } });
      expect(() => registry.adapt(raw(), CTX)).not.toThrow();
    }
  });
});

describe("I7 (T2.5) — a schema mismatch is a startup failure", () => {
  it("at construction, naming the verb", () => {
    expect(() =>
      createAdapterRegistry({ ps: { schema: "tui.view/2" as never, adapt: () => ({}) as never } }),
    ).toThrow(AdapterSchemaError);
    expect(() =>
      createAdapterRegistry({ ps: { schema: "tui.view/2" as never, adapt: () => ({}) as never } }),
    ).toThrow(/"ps"/);
  });

  it("and at register, which is the other way in", () => {
    const registry = createAdapterRegistry();
    expect(() => {
      registry.register("ps", { schema: "tui.view/2" as never, adapt: () => ({}) as never });
    }).toThrow(AdapterSchemaError);
  });

  it("T3.17: an adapter for a verb absent from the manifest registers and is never reached", () => {
    const registry = createAdapterRegistry();
    registry.register("ghost", markerAdapter());
    expect(registry.adapt(raw(), CTX).blocks[0]?.id).not.toBe("marker");
  });
});

describe("I9 (T1.13) — explicit --json", () => {
  it.each([true, false])("a single code block, adapter registered: %s", (registered) => {
    const registry = createAdapterRegistry(registered ? { ps: markerAdapter() } : {});
    const doc = registry.adapt(raw(), { ...CTX, userRequestedJson: true });

    expect(doc.blocks).toHaveLength(1);
    expect(doc.blocks[0]?.kind).toBe("code");
    valid(doc);
  });

  it("even when stdout never parsed, the raw text is what is shown", () => {
    const registry = createAdapterRegistry();
    const doc = registry.adapt(raw({ stdout: undefined, stdoutRaw: "not json" }), {
      ...CTX,
      userRequestedJson: true,
      flags: {},
    });
    const code = doc.blocks[0];
    if (code?.kind !== "code") throw new Error("expected a code block");
    expect(code.text).toBe("not json");
  });
});

describe("§6 — streaming", () => {
  const stream = (over: Partial<AdapterContext> = {}) => ({ ...CTX, ...over, seq: 0 });

  it("T1.17: no adaptPatch → data patches append fallback blocks", () => {
    const registry = createAdapterRegistry({ ps: markerAdapter() });
    const patch = registry.adaptPatch({ kind: "data", value: { id: "a" } }, stream());
    expect(patch?.op).toBe("append");
  });

  it("an adapter with adaptPatch owns the data row", () => {
    const registry = createAdapterRegistry({
      ps: markerAdapter({
        adaptPatch: () => ({ op: "append", block: { kind: "raw", id: "own", text: "own" } }),
      }),
    });
    const patch = registry.adaptPatch({ kind: "data", value: {} }, stream());
    expect(patch?.op === "append" && patch.block.id).toBe("own");
  });

  it("T1.16 / T3.19b: malformed before degraded → null, and no raw block", () => {
    const registry = createAdapterRegistry();
    expect(registry.adaptPatch({ kind: "malformed", line: "junk" }, stream())).toBeNull();
  });

  it("T3.18: an end patch carrying cancelled → a status patch of partial", () => {
    const registry = createAdapterRegistry();
    const patch = registry.adaptPatch(
      { kind: "end", result: raw({ cancelled: true }) },
      { ...stream(), seq: 3 },
    );
    expect(patch).toEqual({ op: "status", status: "partial" });
  });

  it("T3.19c (I12): the line that trips degradation reaches the document", () => {
    // Driven by a real reader over a stream that degrades, because the ordering
    // under test is C06's — a hand-built patch sequence would assert the rule
    // against itself.
    const reader = createNdjsonReader();
    const registry = createAdapterRegistry();

    // Ten good lines, then bad ones until the running ratio crosses 10% at the
    // ten-line floor. Which line trips it is C06's arithmetic, so the test reads
    // it off the patches rather than predicting it — predicting it once already
    // asserted the wrong line and passed for the wrong reason.
    const lines = [
      ...Array.from({ length: 10 }, (_, i) => JSON.stringify({ n: i })),
      "noise, dropped",
      "the tripping line",
      "after one",
      "after two",
    ];

    const patches = lines.flatMap((line) => reader.push(`${line}\n`));
    const kinds = patches.map((p) => p.kind);
    expect(kinds).toContain("degraded");

    // The tripping line is emitted as `malformed` immediately *before* the
    // notice — the ordering this whole test exists for.
    const at = kinds.indexOf("degraded");
    const before = patches[at - 1];
    if (before?.kind !== "malformed") throw new Error("C06 no longer emits the trip line first");

    let seq = 0;
    let text = "";
    for (const patch of patches) {
      const view = registry.adaptPatch(patch, { ...stream(), seq });
      seq += 1;
      if (view?.op === "append" && view.block.kind === "raw") text = view.block.text;
      if (view?.op === "replace" && view.block.kind === "raw") text = view.block.text;
    }

    // The line that tripped it leads the remainder — the whole point of the
    // lookbehind — and the lines after it follow.
    expect(text.split("\n")[0]).toBe(before.line);
    expect(text).toContain("after one");
    expect(text).toContain("after two");

    // And the noise from before the trip is still dropped. Both readings of
    // `malformed` hold at once, which is what §6 actually claims.
    expect(text).not.toContain("noise, dropped");
  });

  it("degradation does not leak from one stream into the next", () => {
    const registry = createAdapterRegistry();
    registry.adaptPatch({ kind: "degraded", reason: "r" }, { ...stream(), seq: 0 });
    registry.adaptPatch({ kind: "malformed", line: "x" }, { ...stream(), seq: 1 });

    // A new stream starts at seq 0 and must start undegraded.
    expect(registry.adaptPatch({ kind: "malformed", line: "y" }, { ...stream(), seq: 0 })).toBeNull();
  });
});
