// C07 tier 1 and 3 — the fallback.
//
// Built and tested before the registry, because it is the primary case rather
// than the degraded one (§5, commitment 3). Every branch here is reachable from
// a far side nobody controls, so the assertions are about totality as much as
// about shape: I3 says any JSON, any malformed stdout, produces a valid
// non-empty document, and "valid" is checked by C04's validator rather than by
// eye.
import { describe, expect, it } from "vitest";
import {
  MAX_COLUMNS,
  MAX_ROWS,
  createFallbackAdapter,
  fallbackBlocks,
} from "../../src/data/adapters/fallback.js";
import { createAdapterRegistry } from "../../src/data/adapters/index.js";
import type { AdapterContext, RawResult } from "../../src/data/adapters/types.js";
import { validateDocument } from "../../src/data/viewmodel/index.js";
import type { Block, ColumnDef } from "../../src/data/viewmodel/index.js";

const CTX: AdapterContext = Object.freeze({
  command: "/ps",
  verb: "ps",
  width: 100,
  userRequestedJson: false,
  transport: "fixture",
  origin: "user",
  tool: null,
});

function raw(over: Partial<RawResult> = {}): RawResult {
  return Object.freeze({
    argv: ["prism", "ps", "--json"],
    exitCode: 0,
    signal: null,
    stdout: undefined,
    stdoutRaw: "",
    stderr: "",
    durationMs: 7,
    parseError: null,
    cancelled: false,
    timedOut: false,
    overflowed: false,
    ...over,
  });
}

/**
 * The fallback over a parsed value, as a document.
 *
 * `stdoutRaw` is guarded here for the same reason the fallback guards it: one
 * of these cases is a cyclic value, and an unguarded `JSON.stringify` in the
 * harness would report the harness's throw as the subject's.
 */
function adapt(stdout: unknown, over: Partial<RawResult> = {}) {
  let text = "";
  try {
    text = JSON.stringify(stdout) ?? "";
  } catch {
    text = "";
  }
  // **Through the registry, not the adapter directly** (F58b). An adapter's
  // return is no longer a complete `ViewDocument` — `AdapterMeta` carries the
  // three keys it owns and the registry fills the other seven — so validating
  // one straight from `adapt()` asserts against a half-built artefact. The
  // registry with no adapters registered routes to the fallback, which is the
  // production path this file is about.
  return createAdapterRegistry({}).adapt(raw({ stdout, stdoutRaw: text, ...over }), CTX);
}

function kinds(blocks: readonly Block[]): readonly string[] {
  return blocks.map((b) => b.kind);
}

/**
 * The keys of the columns that name a field.
 *
 * A generated table leads with a `role: "expand"` column that names none (§5), and
 * it sits outside `MAX_COLUMNS` — so every assertion about *which fields* a table
 * shows filters it out, and the assertions about the marker are separate and
 * explicit.
 */
function fieldKeys(columns: readonly ColumnDef[]): readonly string[] {
  return columns.filter((c) => c.role === undefined).map((c) => c.key);
}

describe("T1.14 (§5) — every shape in the table", () => {
  it("an object of scalars → rule + keyValue", () => {
    const doc = adapt({ name: "web", replicas: 3, healthy: true });
    expect(kinds(doc.blocks)).toEqual(["rule", "keyValue"]);
    expect(validateDocument(doc).ok).toBe(true);
  });

  it("an array of uniform objects → rule + table", () => {
    const doc = adapt([
      { id: "a", state: "running" },
      { id: "b", state: "exited" },
    ]);
    expect(kinds(doc.blocks)).toEqual(["rule", "table"]);

    const table = doc.blocks[1];
    if (table?.kind !== "table") throw new Error("expected a table");
    // The marker column leads and is not a field (§5): C11 draws the expand glyph
    // only where a column declares the rôle, and a generated table's producer is
    // this adapter. It carries no key because it names no field.
    expect(table.columns[0]?.role).toBe("expand");
    expect(fieldKeys(table.columns)).toEqual(["id", "state"]);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[1]?.cells["state"]?.text).toBe("exited");
  });

  it("an object containing one array of uniform objects → keyValue + table", () => {
    const doc = adapt({
      total: 2,
      items: [
        { id: "a", size: "1" },
        { id: "b", size: "2" },
      ],
    });
    expect(kinds(doc.blocks)).toEqual(["rule", "keyValue", "table"]);
  });

  it("anything else → a code block", () => {
    const doc = adapt({ nested: { a: { b: 1 } } });
    expect(kinds(doc.blocks)).toEqual(["rule", "code"]);
  });

  it("unparseable stdout → a raw block of stdoutRaw", () => {
    const doc = createFallbackAdapter().adapt(
      raw({ stdout: undefined, stdoutRaw: "<html>502 Bad Gateway</html>", parseError: "…" }),
      CTX,
    );
    expect(kinds(doc.blocks)).toEqual(["raw"]);
    const block = doc.blocks[0];
    if (block?.kind !== "raw") throw new Error("expected raw");
    expect(block.text).toContain("502");
  });

  it("empty stdout at exit 0 → a notice, not a blank document", () => {
    const doc = createAdapterRegistry({}).adapt(raw({ stdout: undefined, stdoutRaw: "  \n" }), CTX);
    expect(kinds(doc.blocks)).toEqual(["notice"]);
    expect(validateDocument(doc).ok).toBe(true);
  });
});

describe("T1.15, T3.13b (§5) — the caps", () => {
  it("T1.15: twenty distinct keys → eight columns, by first appearance", () => {
    const keys = Array.from({ length: 20 }, (_, i) => `k${String(i)}`);
    const row = Object.fromEntries(keys.map((k) => [k, "v"]));
    const doc = adapt([row, row]);

    const table = doc.blocks[1];
    if (table?.kind !== "table") throw new Error("expected a table");
    // **The cap bounds fields, and the marker is not one** (§5). Eight fields plus
    // the marker, not seven fields and a marker — charging the affordance a field
    // would hide data in order to reveal that data is hidden.
    expect(fieldKeys(table.columns)).toHaveLength(MAX_COLUMNS);
    expect(table.columns).toHaveLength(MAX_COLUMNS + 1);
    expect(fieldKeys(table.columns)).toEqual(keys.slice(0, MAX_COLUMNS));
    // Priority descends with position, so C11 drops the last-appearing first. The
    // marker outranks every field, so it survives every width (C11 I3).
    expect(table.columns[1]?.priority).toBeGreaterThan(
      table.columns[MAX_COLUMNS]?.priority ?? 0,
    );
    expect(table.columns[0]?.priority).toBeGreaterThan(table.columns[1]?.priority ?? 0);
  });

  it("T3.13b: 100,000 uniform rows → 2,000 rows, truncated, and a notice naming the drop", () => {
    const rows = Array.from({ length: 100_000 }, (_, i) => ({ id: String(i) }));
    const doc = adapt(rows);

    const table = doc.blocks[1];
    if (table?.kind !== "table") throw new Error("expected a table");
    expect(table.rows).toHaveLength(MAX_ROWS);
    expect(doc.meta?.truncated).toBe(true);

    const notice = doc.blocks[2];
    if (notice?.kind !== "notice") throw new Error("truncation must be stated, never silent");
    expect(notice.text).toContain("98000");
    expect(validateDocument(doc).ok).toBe(true);
  });

  it("an untruncated table leaves `truncated` false", () => {
    expect(adapt([{ id: "a" }]).meta?.truncated).toBe(false);
  });
});

describe("T3.8–T3.12 — the shapes that are easy to crash on", () => {
  it("T3.8: stdout is null → a code block, not a crash", () => {
    const doc = adapt(null);
    expect(kinds(doc.blocks)).toEqual(["rule", "code"]);
    expect(validateDocument(doc).ok).toBe(true);
  });

  it.each([42, "x", true])("T3.9: the bare scalar %p → a code block", (value) => {
    expect(kinds(adapt(value).blocks)).toEqual(["rule", "code"]);
  });

  it("T3.10: an empty array → a table with an empty message, not a blank document", () => {
    const doc = adapt([]);
    const table = doc.blocks[1];
    if (table?.kind !== "table") throw new Error("expected a table");
    expect(table.rows).toHaveLength(0);
    expect(table.emptyMessage).not.toBe("");
    expect(validateDocument(doc).ok).toBe(true);
  });

  it("T3.11: a ragged array → a code block; the fallback never invents structure", () => {
    const doc = adapt([{ a: 1, b: 2 }, { a: 1 }]);
    expect(kinds(doc.blocks)).toEqual(["rule", "code"]);
  });

  it("T3.11b: an array of mixed types → a code block", () => {
    expect(kinds(adapt([{ a: 1 }, "two", 3]).blocks)).toEqual(["rule", "code"]);
  });

  it("uniformity is order-insensitive: the same keys written twice is one shape", () => {
    const doc = adapt([
      { a: 1, b: 2 },
      { b: 3, a: 4 },
    ]);
    expect(kinds(doc.blocks)).toEqual(["rule", "table"]);
  });

  it("T3.12: a nested object in a row → JSON text in the cell, never flattened", () => {
    const doc = adapt([
      { id: "a", labels: { tier: "web" } },
      { id: "b", labels: { tier: "api" } },
    ]);

    const table = doc.blocks[1];
    if (table?.kind !== "table") throw new Error("expected a table");
    expect(fieldKeys(table.columns)).toEqual(["id", "labels"]);
    expect(table.rows[0]?.cells["labels"]?.text).toBe('{"tier":"web"}');
  });

  it("T3.14: ANSI and control characters never enter a block", () => {
    // A tool that colours its own JSON cannot inject styling (SS14 forbids the
    // literal here, so it is built from its code point).
    const esc = String.fromCodePoint(0x1b);
    const doc = adapt([{ name: `${esc}[31mred${esc}[0m` }]);

    const table = doc.blocks[1];
    if (table?.kind !== "table") throw new Error("expected a table");
    expect(table.rows[0]?.cells["name"]?.text).toBe("[31mred[0m");
    expect(JSON.stringify(doc)).not.toContain(esc);
  });

  it("a value that will not serialise is contained, not thrown", () => {
    const cyclic: Record<string, unknown> = { name: "a" };
    cyclic["self"] = cyclic;
    expect(() => adapt([{ v: cyclic }, { v: cyclic }])).not.toThrow();
  });
});

describe("T2.4 (I3) — the fallback is total", () => {
  // A thousand arbitrary values, deterministically generated: I1 forbids
  // randomness in an adapter, and a fuzz corpus that differs per run would make
  // a failure unreproducible in exactly the case worth reproducing.
  function* corpus(): Generator<unknown> {
    const atoms: unknown[] = [null, 0, -1, 1.5, "", "x", true, false, [], {}];
    for (const a of atoms) {
      yield a;
      yield [a];
      yield [a, a];
      yield { a };
      yield { a, b: a };
      yield [{ a }, { a }];
      yield [{ a }, { b: a }];
      yield { list: [{ a }, { a }], n: 1 };
      yield [[a]];
      yield { deep: { deeper: { deepest: a } } };
    }
    for (let i = 0; i < 900; i += 1) {
      const width = (i % 7) + 1;
      yield Array.from({ length: (i % 5) + 1 }, () =>
        Object.fromEntries(
          Array.from({ length: width }, (_, k) => [`k${String(k)}`, i % 2 === 0 ? i : `v${String(i)}`]),
        ),
      );
    }
  }

  it("a thousand arbitrary values → a valid, non-empty document each time, no throw", () => {
    let count = 0;
    for (const value of corpus()) {
      count += 1;
      const doc = adapt(value);
      expect(doc.blocks.length, `empty document for ${JSON.stringify(value)}`).toBeGreaterThan(0);
      const validity = validateDocument(doc);
      expect(validity.ok, `invalid for ${JSON.stringify(value)}: ${JSON.stringify(validity)}`).toBe(
        true,
      );
    }
    expect(count).toBeGreaterThanOrEqual(1_000);
  });
});

describe("T2.1 (I1) — adapters are pure", () => {
  it("the same input a hundred times → deeply equal documents", () => {
    const value = { items: [{ id: "a" }, { id: "b" }], total: 2 };
    const first = adapt(value);
    for (let i = 0; i < 100; i += 1) expect(adapt(value)).toEqual(first);
  });

  it("blocks are frozen at every depth", () => {
    const table = adapt([{ id: "a" }]).blocks[1];
    if (table?.kind !== "table") throw new Error("expected a table");
    expect(Object.isFrozen(table)).toBe(true);
    expect(Object.isFrozen(table.rows[0])).toBe(true);
  });
});

describe("§6 — one value renders the same way streamed as batched", () => {
  it("a data patch's blocks match the batched ones for the same value", () => {
    // T4.5's property at unit scope: the heading is the only difference, and it
    // is a difference the stream path asks for rather than a divergence.
    const value = { id: "a", state: "running" };
    const streamed = fallbackBlocks(value, { heading: null, prefix: "s" });
    const batched = fallbackBlocks(value, { heading: "ps", prefix: "s" });

    expect(kinds(streamed.blocks)).toEqual(["keyValue"]);
    expect(kinds(batched.blocks)).toEqual(["rule", "keyValue"]);
  });
});
