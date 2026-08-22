/**
 * GG1–GG5 — the shape `graph` carries, at both gates (C04 I69, I70 · §3e.1).
 *
 * **Written because reading the diff found only half of it.** The builder's
 * guard landed with the form; `validate.ts` had one entry in `KNOWN_FORMS` and
 * nothing else, so the invariant claiming *refused at both gates* was true on
 * one side and vacuous on the other — which is the shape a reader cannot see,
 * because the sentence is right about the gate they happen to be looking at.
 *
 * Every row here is a fabricated violation: the document is malformed in exactly
 * one way, and the row asserts the fault names the member rather than the block.
 */
import { describe, expect, it } from "vitest";
import { validateDocument } from "../../src/data/viewmodel/validate.js";
import { b } from "../../src/shell/builders/index.js";
import { ONE_PER_FORM } from "../support/plot-forms.js";

/** The validator's complaints about a plot block, as raw text. */
function errs(over: Record<string, unknown>): readonly string[] {
  const r = validateDocument({
    schema: "tui.view/1",
    id: "d",
    command: "x",
    status: "ok",
    meta: {},
    blocks: [{ kind: "plot", id: "p", height: 9, series: [], ...over }],
  } as never);
  // **The block's own faults and nothing else's.** A document envelope that is
  // itself malformed reports four errors of its own, and a control asserting an
  // empty list would fail for a reason that has nothing to do with the member
  // under test — which is how a row comes to be rewritten against the wrong
  // subject.
  return r.ok ? [] : (r.error as unknown[]).map(String).filter((x) => /graph/u.test(x));
}

const NODES = [{ id: "a" }, { id: "b" }, { id: "c" }];
const EDGES = [
  { from: "a", to: "b" },
  { from: "b", to: "c" },
];
const good = { form: "graph", graph: { nodes: NODES, edges: EDGES } };

describe("GG — the graph gate, at both ends", () => {
  it("GG1 (C04 I69): the well-formed graph passes both gates", () => {
    expect(errs(good), "the control, so a refusal below is about its own fault").toEqual([]);
    expect(() =>
      b.plot({ form: "graph", height: 9, series: [], graph: { nodes: NODES, edges: EDGES } }),
    ).not.toThrow();
  });

  it("GG2 (C04 I69): the six malformed shapes are refused, each named by its path", () => {
    // **Indexed by the rule each one breaks**, not by how a caller might slip.
    // The `from` case is the one that is silent otherwise: an edge naming a node
    // nobody declared simply is not drawn, and the figure looks complete.
    const cases: readonly (readonly [string, unknown, string])[] = [
      ["no graph at all", undefined, "no \"graph\""],
      ["empty nodes", { nodes: [], edges: [] }, "graph.nodes"],
      ["a node with no id", { nodes: [{ label: "x" }], edges: [] }, "graph.nodes[0]"],
      [
        "two nodes with one id",
        { nodes: [{ id: "a" }, { id: "a" }], edges: [] },
        "duplicate id",
      ],
      [
        "an edge naming nothing",
        { nodes: NODES, edges: [{ from: "a", to: "zz" }] },
        "names no declared node",
      ],
      [
        "a self-edge",
        { nodes: NODES, edges: [{ from: "a", to: "a" }] },
        "self-edge",
      ],
    ];
    for (const [name, graph, fragment] of cases) {
      const found = errs(graph === undefined ? { form: "graph" } : { form: "graph", graph });
      expect(found.length, `${name}: refused`).toBeGreaterThan(0); // cells-ok — a fault count
      expect(found.join("\n"), `${name}: names its own path`).toContain(fragment);
    }
  });

  it("GG3 (C04 I69, I70): the members are refused off their own form, at both gates", () => {
    // The mirror of GG2: a well-formed graph in the wrong place. Accepted at
    // construction and ignored at render is the worst of the three answers, so
    // both gates say so rather than one silently dropping it (F207).
    const onLine = errs({ form: "line", graph: { nodes: NODES, edges: EDGES } });
    expect(onLine.join("\n"), "a node set on a line").toContain("\"graph\" on form \"line\"");
    const layoutOnLine = errs({ form: "line", graphLayout: "layered" });
    expect(layoutOnLine.join("\n"), "a layout on a line").toContain("\"graphLayout\" on form");

    expect(() =>
      b.plot({ form: "line", height: 9, series: [], graph: { nodes: NODES, edges: EDGES } }),
    ).toThrow(/graph/u);
    expect(() => b.plot({ form: "line", height: 9, series: [], graphLayout: "layered" })).toThrow(
      /graphLayout/u,
    );
  });

  it("GG4 (C04 I69): a form has one data shape, so both fields together is refused", () => {
    const both = errs({
      ...good,
      hierarchy: { label: "root" },
    });
    expect(both.join("\n"), "graph and hierarchy at once").toContain("one data shape");
  });

  it("GG5 (C04 I70): the layout's value set is closed, and the closure is the testable half", () => {
    // **The refusal arm is what carries this member.** Its choice arm has one
    // value and one default, so nothing branches on it — A03 §2's vacuity class
    // in a field, named in `UNCONSUMED_MEMBERS` rather than papered over with a
    // read that decides nothing.
    expect(errs({ ...good, graphLayout: "layered" }), "the only legal value").toEqual([]);
    expect(errs({ ...good, graphLayout: "force" }).join("\n"), "and force is not one").toContain(
      "\"graphLayout\" must be \"layered\"",
    );
  });

  it("GG6 (C04 I69): the fixture the sweeps use exercises the passes it is under test for", () => {
    // **A fixture must be shown to respond to the thing under test.** A graph
    // fixture that happens to be a tree tests `tree`'s code path under a
    // different field name — so this asserts the corpus fixture has the three
    // properties the pipeline exists for, rather than trusting the comment
    // beside it.
    const g = ONE_PER_FORM.graph.graph;
    expect(g, "the fixture carries a graph").toBeDefined();
    const edges = g?.edges ?? [];
    const parents = new Map<string, number>();
    for (const e of edges) parents.set(e.to, (parents.get(e.to) ?? 0) + 1);
    expect(
      [...parents.values()].some((n) => n > 1),
      "a node with two parents — the thing hierarchy cannot express",
    ).toBe(true);
    const pairs = new Set(edges.map((e) => `${e.from}:${e.to}`));
    expect(
      edges.some((e) => pairs.has(`${e.to}:${e.from}`)),
      "a two-cycle, so the reversal pass fires",
    ).toBe(true);
  });
});
