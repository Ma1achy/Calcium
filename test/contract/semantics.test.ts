// C09 §7h — the semantic node (§107, R-ACC-001, parked 29).
//
// **Read against the registry's own elements, never against the painted rows.**
// A node is what a block is; a row is what it looks like at one width. A test
// reading rows would agree with a node derived from them, which is the thing
// §107's *the cell grid is a projection* rules out.
import { describe, expect, it } from "vitest";

import { block, type Block, type KnownBlockKind } from "../../src/data/viewmodel/index.js";
import { GLYPH_SUBSTITUTIONS } from "../../src/presentation/blocks/glyphs.js";
import { roleOf, SEMANTIC_ROLES, semanticsOf, type SemanticNode } from "../../src/presentation/blocks/semantics.js";
import { patchDefinition } from "../../src/presentation/patch/definition.js";
import { plotDefinition } from "../../src/presentation/plot/definition.js";
import { tableDefinition } from "../../src/presentation/table/definition.js";
import { ONE_PER_KIND } from "../support/blocks.js";
import { registry } from "../support/render.js";

const R = registry([tableDefinition, plotDefinition, patchDefinition] as never);
const nodeOf = (b: Block, width = 80): SemanticNode => semanticsOf(b, width, R.elementsOf);
const walk = (n: SemanticNode): SemanticNode[] => [n, ...n.children.flatMap(walk)];

/** C09 I117's label field per kind — `null` where the kind has none. */
const NAME_FIELD: Readonly<Record<KnownBlockKind, string | null>> = {
  rule: "label", progress: "label", control: "label", choice: "label",
  notice: "text", tip: "text", code: "language", patch: "path", panel: "title",
  status: "message", image: "alt",
  keyValue: null, table: null, comparison: null, steps: null, logs: null, events: null,
  plot: null, pills: null, tape: null, mosaic: null, scroll: null, group: null,
  terminal: null, raw: null,
};

describe("C09 §7h — every block, every element", () => {
  it("T2.177 (C09 I116): a role for every known kind", () => {
    // **The control is the twenty-five, both ways**: the table's keys are the
    // corpus's, which is keyed by `KnownBlockKind` and exhaustive by type.
    expect(Object.keys(SEMANTIC_ROLES).sort()).toEqual(Object.keys(ONE_PER_KIND).sort());
    expect(Object.keys(SEMANTIC_ROLES)).toHaveLength(25);
    for (const [kind, b] of Object.entries(ONE_PER_KIND)) expect(roleOf(b), kind).toBe(SEMANTIC_ROLES[kind as KnownBlockKind]);

    expect(roleOf(block({ kind: "notice", id: "n", tone: "error", glyph: "error", text: "x" }))).toBe("alert");
    expect(roleOf(block({ kind: "notice", id: "n", tone: "warn", glyph: "warn", text: "x" }))).toBe("note");
    expect(roleOf({ kind: "faulty", id: "f" } as unknown as Block), "an application's own kind").toBe("document");
  });

  it("T2.178 (C09 I117): id, role, name and value from the block", () => {
    const GLYPH_MARKS = new Set(GLYPH_SUBSTITUTIONS.map(([u]) => u));
    for (const [kind, b] of Object.entries(ONE_PER_KIND) as [KnownBlockKind, Block][]) {
      const n = nodeOf(b);
      expect(n.id, kind).toBe(b.id);
      const field = NAME_FIELD[kind];
      const want = field === null ? "" : String((b as unknown as Record<string, unknown>)[field] ?? "");
      expect(n.name, `${kind}'s name is its ${field ?? "(none)"}`).toBe(want);
      if (field !== null) expect(want, `${kind}: the fixture has a label to name it by`).not.toBe("");
      // No SGR, no glyph, no colour, anywhere in the tree.
      for (const node of walk(n)) {
        for (const text of [node.name, node.valueText ?? ""]) {
          expect(text, `${kind} ${node.id}`).not.toContain(String.fromCharCode(27));
          for (const ch of text) expect(GLYPH_MARKS.has(ch), `${kind} ${node.id} carries ${ch}`).toBe(false);
        }
      }
    }
    expect(nodeOf(ONE_PER_KIND.progress)).toMatchObject({ value: 3, valueText: "3 of 10" });
    expect(nodeOf(ONE_PER_KIND.control)).toMatchObject({ value: 0.42, valueText: "3e-4" });
    expect(nodeOf(ONE_PER_KIND.status).state, "a retrying status is busy").toEqual(["busy"]);
    expect(nodeOf(block({ kind: "status", id: "s", state: "error", message: "m", height: 6 })).state, "an error is not").toEqual([]);
    expect(nodeOf(block({ kind: "notice", id: "n", tone: "info", text: "t", streaming: true })).state).toEqual(["busy"]);
    const stale = block({ kind: "panel", id: "p", title: "t", staleForMs: 4000, children: [] });
    expect(nodeOf(stale).state, "a panel with a stale reading").toEqual(["stale"]);
    expect(nodeOf(ONE_PER_KIND.panel).state, "and one without").toEqual([]);
  });

  it("T2.179 (C09 I118, C26 I8, C09 I113): children are children's nodes or elements'", () => {
    const table = block({
      kind: "table",
      id: "t",
      columns: [{ key: "name", label: "name", align: "left", priority: 1, minWidth: 4, sortable: false }],
      rows: [
        { id: "r1", cells: { name: { text: "one" } }, actions: [{ kind: "exec", label: "open", command: "/open one" }] },
        { id: "r2", cells: { name: { text: "two" } } },
        { id: "r3", cells: { name: { text: "three" } } },
      ],
    });
    const g = nodeOf(block({ kind: "group", id: "g", direction: "column", children: [{ kind: "rule", id: "hr", label: "Rows" }, table] }));
    expect(g.role).toBe("group");
    expect(g.children.map((c) => [c.id, c.role])).toEqual([["hr", "separator"], ["t", "table"]]);
    const rows = g.children[1]?.children ?? [];
    const elements = R.elementsOf(table, 80);
    expect(rows.map((r) => r.id), "the table's rows are its elements").toEqual(elements.map((e) => e.id));
    expect(rows.map((r) => r.position), "in order, with their place").toEqual(rows.map((_, i) => ({ index: i + 1, of: rows.length })));
    // **Literal, not re-derived**: a row that computed the expectation with the
    // node's own formula agreed with it whatever the formula was (the mutation
    // pass found it). `r1` acts, so it confirms; every row declares a copy.
    expect(rows.map((r) => [r.id, r.actions]), "each element's own affordances").toEqual([
      ["r1", ["confirm", "copy"]],
      ["r2", ["copy"]],
      ["r3", ["copy"]],
    ]);

    // **The width is the render's** (C09 I113): a shedding keyValue's rows are
    // targets at 9 columns and not at 60, and the node follows.
    const kv = block({
      kind: "keyValue",
      id: "k",
      rows: [
        { label: "endpoint", value: "https://api.internal.example/v2" },
        { label: "region", value: "eu-west-1" },
      ],
    });
    expect(nodeOf(kv, 9).children.map((c) => c.id)).toEqual(R.elementsOf(kv, 9).map((e) => e.id));
    expect(nodeOf(kv, 9).children).toHaveLength(2);
    expect(nodeOf(kv, 60).children, "nothing sheds, nothing to reach").toEqual([]);
  });

  it.todo("T2.180 (C09 I116, C09 I118): a tree reads tree and its rows treeitem — not deferred on a component: specified ahead of the code in this commit");
});
