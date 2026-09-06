// C26 §5 — the element seam, and the four predicates that carry it.
//
// **Its own file, for `block-window.test.ts`'s reason.** That check was added to
// three suites and a fabricated violation changed nothing, because no corpus in
// any of them held the one kind that declared a window. *An invariant is vacuous
// until its subject exists, and a check that cannot find what it was asked about
// passes exactly like one that is satisfied* (A03 §2, SS26). So the corpus here
// is `TABLE_CORPUS` — `table` was the only kind declaring `elements` when this
// was written; `pills` and `mosaic` have their own files and `plot`'s copy is the
// last `describe` here — and the vacuity guard is asserted before the property.
//
// **Four fabrications, one per predicate**, because the generic sweep is the
// whole value of the seam and a sweep nobody has watched fail is a sweep nobody
// has checked. `window`'s conformance earned its keep exactly this way: two
// fabrications against `patch` each failed exactly one row.
//
// The corpus is the shared one rather than a local literal. A suite that builds
// its own blocks carries its own premise about what a table is, and the fixture
// already covers expanded rows, details and a sort — the three things that move
// every offset beneath them.
import { describe, expect, it } from "vitest";

import { checkElements, formatElementReport } from "../../src/testing/navigation-conformance.js";
import type { NavigableRegistry } from "../../src/testing/navigation-conformance.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { PLOT_CORPUS, TABLE_CORPUS, tableOf } from "../support/blocks.js";
import { ALL_FORMS, ONE_PER_FORM } from "../support/plot-forms.js";
import { buildGraph } from "../support/session.js";
import type { InputEvent, Key } from "../../src/interaction/router/types.js";
import { measurable, visible } from "../support/render.js";
import { ROW_GUTTER, block, childWidths, placeable } from "../../src/data/viewmodel/index.js";
import type { Block } from "../../src/data/viewmodel/index.js";
import type { NavElement } from "../../src/presentation/blocks/index.js";

/** `table` is registered rather than a default — C11 registers it (C09 §3). */
const nav = (): NavigableRegistry =>
  measurable({ definitions: [tableDefinition] }).registry as unknown as NavigableRegistry;

/** A registry whose `elementsOf` is bent, to prove the sweep can see it. */
function bent(mutate: (e: readonly NavElement[]) => readonly NavElement[]): NavigableRegistry {
  const real = nav();
  return {
    measure: (b, w) => real.measure(b, w),
    get: (k) => real.get(k),
    elementsOf: (b, w) => mutate(real.elementsOf(b, w)),
  };
}

const kinds = (r: ReturnType<typeof checkElements>): readonly string[] => [
  ...new Set(r.failures.map((f) => f.predicate)),
];

describe("C26 §5 — one declaration, keyboard and pointer", () => {
  it("T2.16 (C26 I4, I5, I6): the corpus is clean, and it is a corpus", () => {
    const report = checkElements(nav(), TABLE_CORPUS);
    expect(report.failures, formatElementReport(report)).toEqual([]);

    // **The subject, before the claim.** `formatElementReport` refuses to call an
    // empty sweep clean, and this is the assertion that makes the refusal moot.
    expect(report.checked, "elements were actually walked").toBeGreaterThan(50);
    expect(report.kinds, "the kind that declares them is covered").toContain("table");
  });

  it("T2.17 (C26 I7): the window × elements agreement is live, and it holds", () => {
    // **This row was the assertion that it was vacuous, and it failed on the
    // commit that added `table.window`** — which is the whole reason a vacuity
    // is asserted rather than described. `window` had two implementers and
    // `elements` had one, the intersection was empty, and the strongest
    // predicate here had no subject; `table` is now in both.
    const report = checkElements(nav(), TABLE_CORPUS);
    expect(report.agreements, "table declares both").toBeGreaterThan(0);
    expect(report.failures.map((f) => f.predicate), formatElementReport(report)).not.toContain(
      "window-agreement",
    );
    expect(formatElementReport(report)).not.toContain("VACUOUS");
  });

  it("T2.17a (C26 I7): the agreement has a subject — an element shifted by one", () => {
    // **The fabricated violation, because the predicate was declared in the type
    // and emitted nowhere for as long as it was vacuous.** A window whose
    // elements are all one row lower is exactly F134's shape at this seam: a
    // position computed over the whole block against a slice that moved.
    const real = nav();
    const bentWindow: NavigableRegistry = {
      measure: (b, w) => real.measure(b, w),
      elementsOf: (b, w) => real.elementsOf(b, w),
      get: (k) => {
        const d = real.get(k);
        if (d?.window === undefined) return d;
        const w = d.window;
        return {
          ...d,
          window: (block, width, from, to, measureChild) => {
            const out = w(block, width, from, to, measureChild);
            return { ...out, skipRows: out.skipRows + 1 };
          },
        };
      },
    };

    const report = checkElements(bentWindow, TABLE_CORPUS);
    expect(report.failures.map((f) => f.predicate), formatElementReport(report)).toContain(
      "window-agreement",
    );
  });

  it("T2.18: an empty sweep is refused, not reported as clean", () => {
    // The counter, not the status. A corpus of kinds that declare no elements is
    // the shape a sweep over the wrong fixtures takes — fast, green, and blind.
    const report = checkElements(nav(), [
      { kind: "notice", id: "n1", tone: "info", text: "nothing here" } as Block,
    ]);
    expect(report.checked).toBe(0);
    expect(formatElementReport(report)).toContain("an empty sweep is not a clean one");
  });

  it("T2.19: a fabricated violation of each predicate fails exactly its own", () => {
    // 1 — containment: a row past the end of the block it came from.
    const over = checkElements(
      bent((es) => es.map((e, i) => (i === 0 ? { ...e, rows: { from: e.rows.from, to: 9999 } } : e))),
      TABLE_CORPUS,
    );
    expect(kinds(over), formatElementReport(over)).toContain("containment");

    // 2 — reading order: the list reversed. A renderer walks it in order, so a
    // reversed list is a `↓` that goes up.
    const reversed = checkElements(
      bent((es) => [...es].reverse()),
      TABLE_CORPUS,
    );
    expect(kinds(reversed)).toContain("order");

    // 3 — disjointness: every element collapsed onto the same two rows, so two
    // elements at one level claim one cell and a click resolves to both.
    const merged = checkElements(
      bent((es) => es.map((e) => ({ ...e, rows: { from: 0, to: 2 } }))),
      TABLE_CORPUS,
    );
    expect(kinds(merged)).toContain("disjoint");

    // 4 — stability: an implementation that reads a counter. The signature does
    // not forbid it and nothing else here would notice.
    let n = 0;
    const drifting = checkElements(
      bent((es) => {
        n += 1;
        return es.map((e) => ({ ...e, id: `${e.id}-${String(n)}` }));
      }),
      TABLE_CORPUS,
    );
    expect(kinds(drifting)).toContain("stability");
  });

  it("T2.20 (C26 I3): the positions are a function of width, and fit at each", () => {
    // **Which is why the sweep runs four widths.** A detail that wraps at 20 and
    // not at 120 moves every row beneath it, so a single-width sweep cannot see
    // an offset that is right only at that width.
    const r = nav();
    const block = TABLE_CORPUS.find((b) => b.id === "ps-detail");
    expect(block, "the detail fixture is in the corpus").toBeDefined();
    if (block === undefined) return;

    for (const width of [20, 120]) {
      const es = r.elementsOf(block, width);
      expect(es.length, `rows exist at ${String(width)}`).toBeGreaterThan(0);
      expect(es.at(-1)?.rows.to, `and fit at ${String(width)}`).toBeLessThanOrEqual(
        r.measure(block, width),
      );
    }
  });
});

describe("C26 §5 — the offsets are measure's arithmetic", () => {
  it("T2.23: the first element sits below the header, and at the top without one", () => {
    // **A row that is *about* the header offset.** The mutation dropping it was
    // caught only by T2.21, whose assertion is about a panel's border and sees
    // this by accident — a kill nobody named is the harness's CAUGHT ELSEWHERE,
    // and it means no row is watching the thing that broke.
    const r = nav();
    const withHeader = tableOf(3, "h");
    expect(r.elementsOf(withHeader, 80)[0]?.rows.from, "below the header").toBe(1);

    const without = block({ ...withHeader, id: "nh", showHeader: false });
    expect(r.elementsOf(without, 80)[0]?.rows.from, "no header, no offset").toBe(0);
  });

  it("T2.24: an expanded row's element spans its detail, and the next starts after", () => {
    // The offsets are `measure`'s arithmetic and must stay its arithmetic. A
    // second summation that agreed today would disagree the first time either
    // changed — so this asserts the two against each other rather than against
    // a constant.
    const r = nav();
    const detail = TABLE_CORPUS.find((x) => x.id === "ps-detail");
    expect(detail, "the detail fixture is in the corpus").toBeDefined();
    if (detail === undefined) return;

    const es = r.elementsOf(detail, 80);
    for (let i = 1; i < es.length; i += 1) {
      expect(es[i]?.rows.from, "no gap and no overlap between rows").toBe(es[i - 1]?.rows.to);
    }
    const tall = es.filter((e) => e.rows.to - e.rows.from > 1);
    expect(tall.length, "the fixture has an expanded row, so one element is taller").toBeGreaterThan(0);
  });
});

describe("C26 §8b — what the three walks could not do", () => {
  it("T2.21 (§8b.5): a table inside a panel is reachable", () => {
    // **The defect all three walks had.** Each iterated a document's top level
    // and stopped, so a table nested in a panel could not be focused, moved
    // through or activated — by keyboard or, once it exists, by pointer.
    const r = measurable({ definitions: [tableDefinition] }).registry;
    const inner = tableOf(3, "inner");
    const found = r.elementsIn([block({ kind: "panel", id: "p1", title: "Containers", children: [inner] })], 80);

    expect(found.map((f) => f.element.id)).toEqual(["r1", "r2", "r3"]);
    expect(
      found.every((f) => f.blockId === "inner"),
      "attributed to the table, not the panel",
    ).toBe(true);
    // Sequence-local, so they sit below the panel's own top border.
    expect(found[0]?.element.rows.from, "below the panel's top border").toBeGreaterThan(0);
  });

  it("T2.22 (§8b.6): two tables sharing a row id stay addressable", () => {
    // `liveRows` concatenated row ids across every table and `focusFor` resolved
    // to the first block holding one, so two tables each carrying `r1` drew the
    // highlight on the wrong one. `tableOf` numbers its rows `r1..rn`, so two of
    // them collide by construction — which is the state the defect needed and
    // the reason this uses the shared fixture rather than inventing ids.
    const r = measurable({ definitions: [tableDefinition] }).registry;
    const found = r.elementsIn([tableOf(2, "a"), tableOf(2, "b")], 80);

    const ids = found.map((f) => f.element.id);
    expect(ids, "the element ids do collide").toEqual(["r1", "r2", "r1", "r2"]);
    expect(
      new Set(found.map((f) => `${f.blockId}/${f.element.id}`)).size,
      "and the (block, element) pair does not",
    ).toBe(found.length);
  });
});

describe("C26 §5c — a plot's `copy` is its series (C12 I85)", () => {
  // **Measured before the rule**: `plot` declared one element with no `copy`, and
  // `copyElement` filters `undefined` and returns early — so `y` on a focused
  // line plot did nothing and said nothing. The empty-block class `containers.ts`
  // closed for its children, one kind along.
  const plotNav = (): NavigableRegistry =>
    measurable({ definitions: [tableDefinition, plotDefinition] }).registry as unknown as NavigableRegistry;

  it("T2.25 (C12 I85, C26 I17): every element a plot with series declares carries a copy, and none without", () => {
    const r = plotNav();
    const corpus = [...PLOT_CORPUS, ...ALL_FORMS.map((f) => ONE_PER_FORM[f])].filter(
      (b): b is Block & { kind: "plot" } => b.kind === "plot",
    );
    let declared = 0;
    let withSeries = 0;
    for (const b of corpus) {
      for (const width of [20, 80]) {
        for (const e of r.elementsOf(b, width)) {
          declared += 1;
          if (b.series.length > 0) { // cells-ok — a series count
            withSeries += 1;
            expect(e.copy, `${b.id} @${String(width)} has series, so it has a copy`).toBeDefined();
            expect(e.copy, `${b.id} @${String(width)} copies something`).not.toBe("");
          } else {
            expect("copy" in e, `${b.id} @${String(width)}: no series, no member`).toBe(false);
          }
        }
      }
    }
    // **The subject, before the claim** — seven cursorable forms and the line
    // corpus declare, so an empty sweep here would be a corpus that lost `plot`.
    expect(declared, "elements were actually walked").toBeGreaterThan(20);
    expect(withSeries, "and the ones with series were among them").toBeGreaterThan(20);

    // **The camera arm, both ways.** `plot3d` is the one form that declares an
    // element and carries no `series` — its data is `points3` — so the omission
    // has a subject; a line plot with a camera keeps its copy.
    const orbiting = block({ ...ONE_PER_FORM.plot3d, id: "orbit", camera: {} });
    const e3 = r.elementsOf(orbiting, 80);
    expect(e3, "the camera declares the element").toHaveLength(1);
    expect("copy" in (e3[0] ?? {}), "and a plot3d has no flat shape to copy").toBe(false);
    const turned = block({ ...ONE_PER_FORM.line, id: "turned", camera: {} });
    expect(r.elementsOf(turned, 80)[0]?.copy).toBeDefined();
  });

  it("T2.26 (C12 I85): a two-series line copies as TSV — header, one row per index, blank where shorter or a gap", () => {
    const r = plotNav();
    const two = block({
      kind: "plot",
      id: "two",
      form: "line",
      height: 5,
      axes: true,
      series: [
        { label: "loss", values: [1, 2.5, 3] },
        { label: "val", values: [4, null] },
      ],
    });
    const at80 = r.elementsOf(two, 80);
    expect(at80).toHaveLength(1);
    expect(at80[0]?.copy).toBe("loss\tval\n1\t4\n2.5\t\n3\t");
    // **Source, never rendering**: the same text at a width where the frame
    // cannot hold every sample as a separate column.
    expect(r.elementsOf(two, 20)[0]?.copy).toBe(at80[0]?.copy);

    // The header's default is the legend's own, not a blank.
    const unlabelled = block({ ...two, id: "u", series: [{ values: [7] }, { label: "b", values: [8] }] });
    expect(r.elementsOf(unlabelled, 80)[0]?.copy).toBe("series 1\tb\n7\t8");
  });

  it("T3.49 (C26 I17, C12 I85): `y` on a focused plot lands its series in the one clipboard", async () => {
    // **The reader's side of the defect.** Before the member existed this
    // sequence left the kill buffer empty and the frame unchanged — a no-op no
    // frame assertion could see.
    const key = (name: string): Key => ({ name, ctrl: false, meta: false, shift: false, sequence: name });
    const press = (name: string): InputEvent => ({ kind: "key", key: key(name) });
    const { graph } = await buildGraph();
    graph.transcript.append({
      schema: "tui.view/1",
      command: "/plot",
      status: "ok",
      blocks: [
        { kind: "plot", id: "p", form: "line", height: 5, axes: true, series: [{ label: "train", values: [1, 2] }] },
      ],
      meta: {
        verb: "plot", adapter: "passthrough", exitCode: 0, durationMs: 0, truncated: false,
        argv: [], stderr: "", transport: "local", origin: "user",
      },
    } as never);
    graph.router.dispatch(press("down"));
    expect(graph.focus.current.at, "↓ lands on the plot").toBe("liveBlock");
    graph.router.dispatch(press("y"));
    graph.router.dispatch(press("escape"));
    graph.editor.yank();
    expect(graph.editor.text).toBe("train\n1\n2");
  });
});

describe("C26 §5 — the lifted list, in both axes (C09 §2)", () => {
  // **Measured before any of this was written, by reading the frame** (F756,
  // F757). `elementsIn` lifted rows and never columns, and reset every child to
  // the *container's* top: two 39-wide tables in an 80-column `row` group both
  // answered `cols [0, 39)`, a panel's table answered its rows one above where
  // the frame drew them, and two tables in a `column` group or a `panel`
  // overlapped exactly. Every one of those lists passed T2.16's sweep, because
  // the sweep runs `elementsOf` block by block and the defect is in the lift.
  const kit = () => measurable({ definitions: [tableDefinition] });
  const plain = (lines: readonly string[]): readonly string[] => lines.map(visible);
  const at = (
    found: ReturnType<ReturnType<typeof kit>["registry"]["elementsIn"]>,
    blockId: string,
    id: string,
  ) => {
    const e = found.find((f) => f.blockId === blockId && f.element.id === id)?.element;
    if (e === undefined) throw new Error(`no ${blockId}/${id}`);
    return { rows: [e.rows.from, e.rows.to], cols: [e.cols.from, e.cols.to] };
  };

  /** A registry whose per-block answer is the lifted list, so T2.16's sweep can read it. */
  const lifted = (): NavigableRegistry => {
    const r = kit().registry;
    return {
      measure: (b, w) => r.measure(b, w),
      get: (k) => r.get(k),
      elementsOf: (b, w) => r.elementsIn([b], w).map((f) => f.element),
    };
  };

  const rowGroup = (a: Block, b: Block, more: readonly Block[] = []): Block =>
    block({ kind: "group", id: "g", direction: "row", children: [a, b, ...more] });
  const columnGroup = (a: Block, b: Block): Block =>
    block({ kind: "group", id: "g", direction: "column", children: [a, b] });
  const panel = (children: readonly Block[]): Block =>
    block({ kind: "panel", id: "p", title: "T", children: [...children] });

  it("T2.29 (C26 I4, I6; C09 §2): two 39-wide tables in an 80-column row — the second sits at cols [40, 79), and the frame agrees", () => {
    const k = kit();
    const a = tableOf(2, "a");
    const b = tableOf(2, "b");
    const g = rowGroup(a, b);

    // **The gutter is measured, not assumed.** `childWidths` gives 39 + 39 at 80,
    // so the one column left is the gutter, and the second child's origin is 40.
    expect(childWidths(g as never, 80), "the shares").toEqual([39, 39]);
    expect(ROW_GUTTER).toBe(1);

    const found = k.registry.elementsIn([g], 80);
    expect(at(found, "a", "r1")).toEqual({ rows: [1, 2], cols: [0, 39] });
    expect(at(found, "b", "r1"), "lifted by the first's share plus the gutter").toEqual({ rows: [1, 2], cols: [40, 79] });

    // Read from the frame: the second header begins at the column the element does.
    const frame = plain(k.renderToLines(g, 80));
    expect(frame[0]?.indexOf("Name", 1), "the second `Name` on the header row").toBe(40);
    expect(frame[1]?.indexOf("row 1", 1), "and the second `row 1` beneath it").toBe(40);
  });

  it("T2.30 (C26 I4, I5, I6): containment, disjointness and stability hold of the lifted list across blocks; order within each — and a fabricated old walk fails disjointness", () => {
    const a = tableOf(2, "a");
    const b = tableOf(2, "b");
    const corpus: readonly Block[] = [
      rowGroup(a, b),
      columnGroup(a, b),
      panel([a, b]),
      // Nested: a panel inside a row, so both origins compose.
      rowGroup(a, panel([b])),
      // Three children, so `placeable` drops one at the sweep's narrowest width.
      rowGroup(a, b, [tableOf(1, "c")]),
    ];
    const report = checkElements(lifted(), corpus);
    // **Reading order is a per-block predicate.** Across blocks the lifted list
    // is the document's order — `↓` leaves the first table's last row for the
    // second table's first, wherever the second is drawn (C26 §4c) — so two
    // tables side by side are listed block by block and not row by row, and the
    // sweep's `order` is asserted within each block below rather than here.
    const across = report.failures.filter((f) => f.predicate !== "order");
    expect(across, formatElementReport(report)).toEqual([]);
    expect(report.checked, "the subject, before the claim").toBeGreaterThan(20);
    const r = kit().registry;
    for (const container of corpus) {
      for (const width of [20, 80]) {
        const perBlock = new Map<string, NavElement[]>();
        for (const f of r.elementsIn([container], width)) {
          perBlock.set(f.blockId, [...(perBlock.get(f.blockId) ?? []), f.element]);
        }
        for (const [id, es] of perBlock) {
          for (let i = 1; i < es.length; i += 1) {
            const p = es[i - 1];
            const e = es[i];
            if (p === undefined || e === undefined) throw new Error("unreachable");
            expect(
              e.rows.from > p.rows.from || (e.rows.from === p.rows.from && e.cols.from >= p.cols.from),
              `${id} at ${String(width)}: ${e.id} after ${p.id}`,
            ).toBe(true);
          }
        }
      }
    }

    // **The fabricated violation is the shipped walk**: columns not lifted. Both
    // tables' `r1` then share rows [1, 2) and cols [0, 39) in the row group.
    const unlifted: NavigableRegistry = {
      ...lifted(),
      elementsOf: (bl, w) =>
        lifted()
          .elementsOf(bl, w)
          .map((e) => ({ ...e, cols: { from: 0, to: e.cols.to - e.cols.from } })),
    };
    const failing = checkElements(unlifted, [rowGroup(a, b)]);
    expect(kinds(failing), "two blocks sharing cells is what the pointer cannot resolve").toContain("disjoint");
  });

  it("T2.31 (C26 I4; C09 §2): a panel's children start one row and one column in, a column's follow one another, an unplaced child holds nothing", () => {
    const k = kit();
    const a = tableOf(2, "a");
    const b = tableOf(2, "b");

    // Panel: `r1` is on the frame's row 2 (border, header, r1) at column 1.
    const p = panel([a, b]);
    const inPanel = k.registry.elementsIn([p], 40);
    expect(at(inPanel, "a", "r1")).toEqual({ rows: [2, 3], cols: [1, 39] });
    const frame = plain(k.renderToLines(p, 40));
    expect(frame[2]?.indexOf("row 1"), "the frame draws it there").toBe(1);
    // The second child begins where the first's measured rows end.
    expect(at(inPanel, "b", "r1").rows, "after a's three rows").toEqual([5, 6]);
    expect(frame[5]?.indexOf("row 1"), "the frame's second `row 1`").toBe(1);

    // Below three columns the rails are dropped and the child is at column 0.
    expect(at(k.registry.elementsIn([panel([a])], 2), "a", "r1")).toEqual({ rows: [2, 3], cols: [0, 1] });

    // Column group: second table after the first's height, both at column 0.
    const inColumn = k.registry.elementsIn([columnGroup(a, b)], 40);
    expect(at(inColumn, "b", "r1")).toEqual({ rows: [4, 5], cols: [0, 40] });

    // Row group at width 4: shares of 1, and the third child is not placed —
    // the frame draws two, so the list holds two (C04 §3).
    const narrow = rowGroup(a, b, [tableOf(1, "c")]);
    expect(placeable(narrow as never, 4)).toBe(2);
    const inNarrow = k.registry.elementsIn([narrow], 4);
    expect(new Set(inNarrow.map((f) => f.blockId)), "the unplaced child contributes nothing").toEqual(new Set(["a", "b"]));
    expect(at(inNarrow, "b", "r1").cols).toEqual([2, 3]);

    // A `gapBefore` on a row-group child adds no row: the renderer ignores it.
    const gapped = rowGroup(a, block({ ...b, gapBefore: true }));
    expect(at(k.registry.elementsIn([gapped], 40), "b", "r1").rows).toEqual([1, 2]);
  });
});
