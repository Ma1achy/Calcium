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
import { measurable } from "../support/render.js";
import { block } from "../../src/data/viewmodel/index.js";
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
