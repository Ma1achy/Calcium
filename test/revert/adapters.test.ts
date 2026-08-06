// C07 tier 6 — fail-on-revert. Each names the change that makes a test fail,
// and asserts the thing that would stop holding rather than restating it.
import { describe, expect, it } from "vitest";
import { createAdapterRegistry, createFallbackAdapter } from "../../src/data/adapters/index.js";
import type { Adapter, AdapterContext, RawResult } from "../../src/data/adapters/types.js";
import { createNdjsonReader } from "../../src/data/transport/index.js";
import { validateDocument } from "../../src/data/viewmodel/index.js";
import { checkSourceScans } from "../../tools/enforce/source-scans.mjs";
import type { ViewPatch } from "../../src/data/viewmodel/index.js";

const CTX: AdapterContext = Object.freeze({
  command: "/ps",
  verb: "ps",
  width: 100,
  userRequestedJson: false,
  transport: "subprocess",
  origin: "user",
  tool: null,
});

function raw(over: Partial<RawResult> = {}): RawResult {
  return {
    argv: ["prism", "ps", "--json"],
    exitCode: 0,
    signal: null,
    stdout: { name: "web" },
    stdoutRaw: '{"name":"web"}',
    stderr: "",
    durationMs: 4,
    parseError: null,
    cancelled: false,
    timedOut: false,
    overflowed: false,
    ...over,
  };
}

const marker: Adapter = {
  schema: "tui.view/1",
  adapt: (r, ctx) => ({
    schema: "tui.view/1",
    command: ctx.command,
    status: "ok",
    blocks: [{ kind: "raw", id: "marker", text: "adapted" }],
    meta: { adapter: "marker", truncated: false },
  }),
};

describe("C07 fail-on-revert", () => {
  it("T6.1 (I2): checking registered adapters before the identity path → T1.4 fails", () => {
    // The revert, as the difference it makes: an adapter left in place after the
    // far side converged would keep winning, and deleting it would then change
    // the rendering — which is exactly the surprise the ordering exists to
    // prevent. Disposability stops being mechanical the moment this flips.
    const document = {
      schema: "tui.view/1" as const,
      command: "/ps",
      status: "ok" as const,
      blocks: [{ kind: "raw" as const, id: "from-far-side", text: "converged" }],
      // A complete `DocumentMeta`: this is what the far side emitted, not what
      // an adapter returned. `AdapterMeta` narrows the adapter's return and says
      // nothing about the identity path. F58b.
      meta: {
        verb: "ps",
        adapter: "far-side",
        exitCode: 0,
        durationMs: 1,
        truncated: false,
        argv: [],
        stderr: "",
        transport: "subprocess" as const,
        origin: "user" as const,
      },
    };

    const registry = createAdapterRegistry({ ps: marker });
    expect(registry.adapt(raw({ stdout: document }), CTX).blocks[0]?.id).toBe("from-far-side");

    // Adapter-first would have answered this instead.
    const adapterFirst = marker.adapt(raw({ stdout: document }), CTX);
    expect(adapterFirst.blocks[0]?.id).toBe("marker");
  });

  it("T6.2 (I3): a fallback branch that throws on an unexpected shape → T2.4 fails", () => {
    // The shapes a branchy fallback misses, all reachable from a far side.
    for (const shape of [null, 42, "x", true, [], [{ a: 1 }, { b: 2 }], { a: { b: 1 } }]) {
      expect(() =>
        createFallbackAdapter().adapt(raw({ stdout: shape, stdoutRaw: "" }), CTX),
      ).not.toThrow();
    }
  });

  it("T6.3 (I4): letting an adapter's throw propagate → T3.4 fails and the session dies", () => {
    const thrower: Adapter = {
      schema: "tui.view/1",
      adapt: () => {
        throw new Error("kaboom");
      },
    };

    // Uncontained is what the revert looks like from the call site.
    expect(() => thrower.adapt(raw(), CTX)).toThrow("kaboom");
    // Contained is what C23 gets, and the data still renders.
    const doc = createAdapterRegistry({ ps: thrower }).adapt(raw(), CTX);
    expect(doc.blocks.some((b) => b.kind === "keyValue")).toBe(true);
    expect(validateDocument(doc).ok).toBe(true);
  });

  it("T6.4 (I6): mapping cancelled to error → T1.8 and T1.9 fail", () => {
    // Forty log lines retained because the user stopped watching. As an error
    // the document would carry an `error` it has no business carrying, and the
    // transcript would report a failure that did not happen.
    const lines = Array.from({ length: 40 }, (_, i) => ({ n: String(i) }));
    const doc = createAdapterRegistry().adapt(
      raw({ stdout: lines, cancelled: true, exitCode: 130 }),
      CTX,
    );

    expect(doc.status).toBe("partial");
    expect(doc.error).toBeUndefined();

    // And the revert's shape: exit 130 read as a code rather than the
    // `cancelled` flag being authoritative.
    const byExitCode = (r: RawResult): string => (r.exitCode === 130 ? "error" : "ok");
    expect(byExitCode(raw({ exitCode: 130, cancelled: true }))).toBe("error");
  });

  it("T6.6 (I9): special-casing a verb under --json → T1.13 fails", () => {
    const registry = createAdapterRegistry({ ps: marker });
    for (const verb of ["ps", "promote", null]) {
      const doc = registry.adapt(raw(), { ...CTX, verb, userRequestedJson: true });
      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0]?.kind).toBe("code");
    }
  });

  it("T6.7 (I5): a failure path that skips validation → T2.3 fails", () => {
    // An adapter whose document is structurally invalid: an empty id, and a
    // notice toned `error` with no glyph. Unvalidated it reaches the renderer,
    // where the failure is a crash in C09 rather than a message here.
    const invalid: Adapter = {
      schema: "tui.view/1",
      adapt: () =>
        ({
          schema: "tui.view/1",
          command: "/ps",
          status: "ok",
          blocks: [{ kind: "notice", id: "", tone: "error", text: "no glyph" }],
          meta: {},
        }) as never,
    };

    expect(validateDocument(invalid.adapt(raw(), CTX)).ok).toBe(false);
    expect(validateDocument(createAdapterRegistry({ ps: invalid }).adapt(raw(), CTX)).ok).toBe(true);
  });

  it("T6.8 (I11): making a verb require an adapter → T2.7 fails", () => {
    const doc = createAdapterRegistry().adapt(raw(), CTX);
    expect(doc.blocks.length).toBeGreaterThan(0);
    expect(validateDocument(doc).ok).toBe(true);
  });

  it("T6.9 (§5): flattening nested objects into columns → T3.12 fails", () => {
    const doc = createFallbackAdapter().adapt(
      raw({
        stdout: [
          { id: "a", labels: { tier: "web", zone: "eu" } },
          { id: "b", labels: { tier: "api", zone: "us" } },
        ],
        stdoutRaw: "",
      }),
      CTX,
    );

    const table = doc.blocks[1];
    if (table?.kind !== "table") throw new Error("expected a table");
    // Flattening would have produced `labels.tier` and `labels.zone` — structure
    // the tool never declared, in a table that looks authoritative.
    expect(table.columns.filter((c) => c.role === undefined).map((c) => c.key)).toEqual([
      "id",
      "labels",
    ]);
  });

  it("T6.10 (I7): deferring schema checks to first use → T2.5 fails", () => {
    // At construction, before a session exists. Deferred, the same mistake is a
    // verb that fails the first time a user runs it — possibly in production,
    // possibly the tenth command in.
    expect(() =>
      createAdapterRegistry({ ps: { schema: "tui.view/2" as never, adapt: () => ({}) as never } }),
    ).toThrow(/tui\.view\/2/);
  });

  it("T6.11 (I13): letting an adapter's meta through unmodified → T1.18 fails", () => {
    // **The lie is now unwritable, and that is F58b's fix arriving in this row.**
    // This used to construct an adapter that set `origin` and `transport`, assert
    // the registry overwrote them, and then assert the adapter really had written
    // them — the last line proving the guard was doing work rather than agreeing
    // with a well-behaved double.
    //
    // `AdapterMeta` carries only the three keys the registry honours, so the
    // adapter cannot express the lie at all. The runtime guard stays and this row
    // now pins both halves: the type refuses, and `authoritativeMeta` still fills.
    const liar: Adapter = {
      schema: "tui.view/1",
      adapt: (r, ctx) => ({
        ...marker.adapt(r, ctx),
        // @ts-expect-error — `origin` is the registry's (I13). Widening
        // `AdapterMeta` back to `DocumentMeta` makes this line compile, the
        // directive unused, and the file stops building.
        meta: { origin: "agent" as const, transport: "local" as const },
      }),
    };

    const doc = createAdapterRegistry({ ps: liar }).adapt(raw(), CTX);
    expect(doc.meta.origin, "the registry fills it regardless").toBe("user");
    expect(doc.meta.transport).toBe("subprocess");

    // And the honoured key still comes through, so the guard is not simply
    // discarding everything an adapter says.
    const honest: Adapter = {
      schema: "tui.view/1",
      adapt: (r, ctx) => ({ ...marker.adapt(r, ctx), meta: { adapter: "mine" } }),
    };
    expect(createAdapterRegistry({ ps: honest }).adapt(raw(), CTX).meta.adapter).toBe("mine");
  });

  it("T6.12 (I12): dropping the malformed patch before degraded → T3.19c fails", () => {
    // Every degraded stream loses its first remainder line, silently, because
    // C06 classifies a line before it tests the ratio.
    const reader = createNdjsonReader();
    const lines = [
      ...Array.from({ length: 10 }, (_, i) => JSON.stringify({ n: i })),
      "first bad",
      "the tripping line",
      "after",
    ];
    const patches = lines.flatMap((line) => reader.push(`${line}\n`));
    const at = patches.findIndex((p) => p.kind === "degraded");
    const trip = patches[at - 1];
    if (trip?.kind !== "malformed") throw new Error("C06 no longer emits the trip line first");

    const registry = createAdapterRegistry();
    let seq = 0;
    let text = "";
    for (const patch of patches) {
      const view: ViewPatch | null = registry.adaptPatch(patch, { ...CTX, seq });
      seq += 1;
      if ((view?.op === "append" || view?.op === "replace") && view.block.kind === "raw") {
        text = view.block.text;
      }
    }

    expect(text.split("\n")[0]).toBe(trip.line);
  });

  it("T6.5 (I1): reading the clock inside an adapter → T2.1 and T2.2 fail", () => {
    const violations = checkSourceScans(
      ["src/data/adapters/docker.ts"],
      () => "const now = Date.now();",
    );
    expect(violations.map((v) => v.rule)).toContain("SS1");
  });

  it("randomness in an adapter is caught by SS3 and SS2, neither of which is SS1", () => {
    // SS3 is the adapter-purity rule; SS2 arrived with C08 and spans all of
    // `src/`, because no file here has business calling `Math.random` and a rule
    // scoped to the fixture directory would stop seeing new ones.
    //
    // Two rules over one defect is not duplication to be cleaned up. They fail
    // for different reasons — an adapter that is not a pure function of its
    // input, and a draw from a source nothing seeded — and either could be
    // narrowed later without the other going quiet.
    const violations = checkSourceScans(
      ["src/data/adapters/docker.ts"],
      () => "const id = Math.random().toString(36);",
    );
    expect(violations.map((v) => v.rule).sort()).toEqual(["SS2", "SS3"]);
    expect(violations.map((v) => v.rule)).not.toContain("SS1");
  });
});
