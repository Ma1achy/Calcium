// C11 tier 1 — the planner, the sort, and the arithmetic of a measured table.
//
// The widths are S03's, because its eleven columns are the set the drop tables
// were verified against during specification. `test/integration/table.test.ts`
// holds the comparison against what the spec *states*; this file holds the
// properties that must hold whatever a surface declares.
import { describe, expect, it } from "vitest";
import { COLUMN_GAP, planColumns, tableDefinition, tableElements } from "../../src/presentation/table/index.js";

/**
 * The drawn order of a table's rows (C26 §5).
 *
 * **`focusableRowIds` was this, and it is gone.** C26 commitment 11: the
 * declaration a pointer and a keyboard both read replaces it rather than
 * standing beside it, because two mechanisms agreeing is not one mechanism.
 * The rows below assert *order*, which is what they always asserted.
 */
const drawnOrder = (block: Table, width = 160): readonly string[] =>
  tableElements(block, width, registry.measure).map((e) => e.id);
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { psColumns, psTable } from "../support/blocks.js";
import { measurable, visible } from "../support/render.js";
import { cells } from "../../src/presentation/text.js";
import type { ColumnDef, Table } from "../../src/data/viewmodel/index.js";

/** Σ visible widths + gaps, computed here rather than taken from the plan. */
function occupied(plan: ReturnType<typeof planColumns>): number {
  const widths = plan.visible.map((v) => v.width);
  if (widths.length === 0) return 0; // cells-ok
  return widths.reduce((a, b) => a + b, 0) + (widths.length - 1) * plan.gap; // cells-ok
}

function keys(plan: ReturnType<typeof planColumns>): readonly string[] {
  return plan.visible.map((v) => v.key);
}

const registry = measurable({ definitions: [tableDefinition] });

describe("C11 tier 1 — planColumns", () => {
  it("T1.1: eight columns at 160 → all visible, and the widths fit", () => {
    const eight = psColumns().slice(0, 8);
    const plan = planColumns(eight, 160);
    expect(plan.dropped).toEqual([]);
    expect(plan.visible.length).toBe(8); // cells-ok
    expect(occupied(plan)).toBeLessThanOrEqual(160);
  });

  it("T1.2: columns drop lowest-priority-first at 120, 100, 80 and 60", () => {
    const columns = psColumns();
    expect(planColumns(columns, 120).dropped).toEqual([]);
    expect(planColumns(columns, 100).dropped).toEqual(["spark", "mr"]);
    expect(planColumns(columns, 80).dropped).toEqual(["spark", "kind", "owner", "mr"]);
    expect(planColumns(columns, 60).dropped).toEqual(["metric", "spark", "age", "kind", "owner", "mr"]);
  });

  it("T1.3 (I4): dropping a middle-priority column leaves the rest in declared order", () => {
    // `kind` sits between `age` and `owner` in priority and eighth in declared
    // order, so a planner sorting for display would put `owner` and `mr` before
    // the columns that outrank them.
    const plan = planColumns(psColumns(), 80);
    expect(keys(plan)).toEqual(["expand", "glyph", "uuid", "family", "status", "detail", "metric", "age"]);
    expect(plan.dropped).toEqual(["spark", "kind", "owner", "mr"]);
  });

  it("T1.4 (I3): width 20 with a 40-cell highest-priority column → one column, overflowed", () => {
    const columns: readonly ColumnDef[] = [
      { key: "wide", label: "wide", align: "left", priority: 100, minWidth: 40, sortable: false },
      { key: "other", label: "other", align: "left", priority: 50, minWidth: 5, sortable: false },
    ];
    const plan = planColumns(columns, 20);
    expect(keys(plan)).toEqual(["wide"]);
    expect(plan.overflowed).toBe(true);
    expect(plan.visible[0]?.width).toBe(20);
    expect(plan.dropped).toEqual(["other"]);
  });

  it("T1.5 (I5): the width sum invariant holds at every width from 20 to 200", () => {
    const columns = psColumns();
    for (let width = 20; width <= 200; width += 1) {
      const plan = planColumns(columns, width);
      expect(plan.visible.length, `nothing visible at ${String(width)}`).toBeGreaterThan(0); // cells-ok
      if (plan.overflowed) {
        expect(plan.visible.length).toBe(1); // cells-ok
        expect(plan.visible[0]?.width).toBeLessThanOrEqual(width);
        continue;
      }
      expect(occupied(plan), `overflows at ${String(width)}`).toBeLessThanOrEqual(width);
    }
  });

  it("T1.6: flex columns absorb residual width evenly, remainder to the leftmost", () => {
    const columns: readonly ColumnDef[] = [
      { key: "a", label: "a", align: "left", priority: 30, minWidth: 5, flex: true, sortable: false },
      { key: "b", label: "b", align: "left", priority: 20, minWidth: 5, flex: true, sortable: false },
      { key: "c", label: "c", align: "left", priority: 10, minWidth: 5, sortable: false },
    ];
    // 15 minimums + 4 gaps = 19; at 26 there are 7 cells to share between two
    // flex columns, so 4 and 3 with the extra going left.
    const plan = planColumns(columns, 26);
    expect(plan.visible.map((v) => v.width)).toEqual([9, 8, 5]);
    expect(occupied(plan)).toBe(26);
  });

  it("T1.7: maxWidth clamps, and the freed width redistributes to other flex columns", () => {
    const columns: readonly ColumnDef[] = [
      { key: "a", label: "a", align: "left", priority: 30, minWidth: 5, maxWidth: 6, flex: true, sortable: false },
      { key: "b", label: "b", align: "left", priority: 20, minWidth: 5, flex: true, sortable: false },
    ];
    // 10 + 2 = 12; at 30 there are 18 to share. `a` takes 1 and stops at its
    // maximum; the other 17 all land on `b`.
    const plan = planColumns(columns, 30);
    expect(plan.visible.map((v) => v.width)).toEqual([6, 22]);
    expect(occupied(plan)).toBe(30);
  });

  it("T1.8 (I10): a column whose minWidth equals its longest value is dropped, not shrunk", () => {
    // S03's `status` declares 11 — "succeeded" plus a glyph — which is the surface
    // saying "whole or dropped". At every width where it survives it is at least
    // that wide, and where it cannot be it is absent rather than cut.
    const columns = psColumns();
    for (let width = 20; width <= 200; width += 1) {
      const plan = planColumns(columns, width);
      const status = plan.visible.find((v) => v.key === "status");
      if (status === undefined) continue;
      expect(status.width, `status shrunk at ${String(width)}`).toBeGreaterThanOrEqual(11);
    }
  });

  it("T1.9: measurement is header + rows, and + detail for each expanded row", () => {
    const flat = psTable({ rows: 4 });
    expect(registry.measure(flat, 120)).toBe(5);

    // One expanded row, whose detail is the synthesised dropped-columns block. At
    // 120 nothing drops, so the only detail is the row's own — none here.
    const expanded = psTable({ rows: 4, expanded: [2] });
    expect(registry.measure(expanded, 120)).toBe(5);

    // At 80 four columns drop — `spark` joined the set when S03 §3 split the metric
    // from its series — so an expanded row gains a four-row `keyValue`.
    expect(registry.measure(expanded, 80)).toBe(5 + 4);
  });

  it("T1.10: an empty table measures 2, not 0", () => {
    const empty: Table = { kind: "table", id: "e", columns: [], rows: [], emptyMessage: "No results." };
    expect(registry.measure(empty, 80)).toBe(2);
    expect(registry.renderToLines(empty, 80).length).toBe(2); // cells-ok
  });

  it("T1.11 (I8): sorting is stable across a hundred shuffles", () => {
    // Every row shares one sort key, so a stable sort is the identity on order and
    // an unstable one is visibly not.
    for (let round = 0; round < 100; round += 1) {
      const rows = Array.from({ length: 12 }, (_, i) => ({
        id: `r${String(i + 1)}`,
        cells: { family: { text: "same" }, uuid: { text: `u${String(i)}` } },
      }));
      const block: Table = {
        kind: "table",
        id: "t",
        columns: psColumns(),
        rows,
        sort: { key: "family", direction: round % 2 === 0 ? "asc" : "desc" },
      };
      expect(drawnOrder(block)).toEqual(rows.map((r) => r.id));
    }
  });

  it("T1.12 (I8): sorting a table with three expanded rows keeps each detail with its parent", () => {
    // Each detail names its own parent, so the pairing is readable from the frame
    // rather than inferred from a shape. This is the mockup's original bug (A01
    // A.2) and the assertion has to be able to see it: a detail that travelled to
    // the wrong row would still produce the right number of lines.
    const ages = ["3d", "45s", "2h", "12m", "1h 12m"];
    const block: Table = {
      kind: "table",
      id: "t",
      columns: psColumns(),
      rows: ages.map((age, i) => ({
        id: `r${String(i + 1)}`,
        cells: { uuid: { text: `uuid-${String(i + 1)}` }, age: { text: age } },
        ...(i % 2 === 0
          ? {
              expanded: true,
              detail: [
                { kind: "notice" as const, id: `n${String(i + 1)}`, tone: "muted" as const, text: `belongs to r${String(i + 1)}` },
              ],
            }
          : {}),
      })),
      sort: { key: "age", direction: "asc" },
    };

    // 160, so nothing drops and the only detail is the row's own — the pairing is
    // then the whole of what is being asserted.
    expect(planColumns(psColumns(), 160).dropped).toEqual([]);
    const lines = registry.renderToLines(block, 160).slice(1);

    const order = drawnOrder(block);
    expect(order).toEqual(["r2", "r4", "r5", "r3", "r1"]);

    for (const id of order) {
      const at = lines.findIndex((line) => line.includes(`uuid-${id.slice(1)}`));
      expect(at, `${id} not drawn`).toBeGreaterThanOrEqual(0);
      // r1, r3 and r5 are the expanded ones; the rest must be followed by another
      // row rather than by somebody else's detail.
      if (id === "r1" || id === "r3" || id === "r5") {
        expect(lines[at + 1], `${id}'s detail did not follow it`).toContain(`belongs to ${id}`);
      } else {
        expect(lines[at + 1] ?? "", `${id} acquired a detail`).not.toContain("belongs to");
      }
    }
  });

  it("T1.13 (I8): measured height is identical before and after a sort", () => {
    const flat = psTable({ rows: 5, expanded: [1, 4] });
    const sorted = psTable({ rows: 5, expanded: [1, 4], sort: { key: "age", direction: "desc" } });
    for (const width of [60, 80, 100, 120, 160]) {
      expect(registry.measure(sorted, width)).toBe(registry.measure(flat, width));
    }
  });

  it("T1.14: a numeric column orders 2, 10, 100 numerically", () => {
    const block: Table = {
      kind: "table",
      id: "t",
      columns: psColumns(),
      rows: [
        { id: "r1", cells: { metric: { text: "100" } } },
        { id: "r2", cells: { metric: { text: "2" } } },
        { id: "r3", cells: { metric: { text: "10" } } },
      ],
      sort: { key: "metric", direction: "asc" },
    };
    expect(drawnOrder(block)).toEqual(["r2", "r3", "r1"]);
  });

  it("T1.15: a duration column orders 45s, 12m, 2h, 3d by magnitude", () => {
    const block: Table = {
      kind: "table",
      id: "t",
      columns: psColumns(),
      rows: [
        { id: "d", cells: { age: { text: "3d" } } },
        { id: "m", cells: { age: { text: "12m" } } },
        { id: "h", cells: { age: { text: "2h" } } },
        { id: "s", cells: { age: { text: "45s" } } },
        // Multi-part, which lexical order would put between `1h` and `2h` and
        // magnitude puts after both.
        { id: "hm", cells: { age: { text: "1h 12m" } } },
      ],
      sort: { key: "age", direction: "asc" },
    };
    expect(drawnOrder(block)).toEqual(["s", "m", "hm", "h", "d"]);
  });

  it("T1.16 (I13): missing values sort last ascending and descending", () => {
    const rows = [
      { id: "empty", cells: { metric: { text: "" } } },
      { id: "high", cells: { metric: { text: "9" } } },
      { id: "absent", cells: {} },
      { id: "low", cells: { metric: { text: "1" } } },
    ];
    const asc: Table = { kind: "table", id: "t", columns: psColumns(), rows, sort: { key: "metric", direction: "asc" } };
    const desc: Table = { ...asc, sort: { key: "metric", direction: "desc" } };

    expect(drawnOrder(asc)).toEqual(["low", "high", "empty", "absent"]);
    // Last either way — a null is an absence of rank, not the bottom of one. The
    // missing rows also keep their relative order, which is I8 over I13.
    expect(drawnOrder(desc)).toEqual(["high", "low", "empty", "absent"]);
  });

  it("T1.17 (I15): the expand marker fills a role column, and only a role column", () => {
    const collapsed = psTable({ rows: 2 });
    const opened = psTable({ rows: 2, expanded: [1] });

    // At 80, three columns drop, so every row is expandable (I2) and the marker is
    // drawn. `▸` collapsed, `▾` open.
    const first = registry.renderToLines(collapsed, 80)[1] ?? "";
    const openedFirst = registry.renderToLines(opened, 80)[1] ?? "";
    expect(first).toContain("▸");
    expect(openedFirst).toContain("▾");

    // The same table with the role removed: no marker anywhere, and the column
    // renders its own cell text instead.
    const roleless: Table = {
      ...collapsed,
      columns: collapsed.columns.map((c) => {
        const { role: _role, ...rest } = c;
        return rest;
      }),
      rows: collapsed.rows.map((r) => ({ ...r, cells: { ...r.cells, expand: { text: "#" } } })),
    };
    const rolelessFirst = registry.renderToLines(roleless, 80)[1] ?? "";
    expect(rolelessFirst).not.toContain("▸");
    expect(rolelessFirst).toContain("#");
  });

  it("T1.18 (I17): the bar's height follows the data, and never focus", () => {
    const withActions = psTable({ rows: 2 });
    const acted: Table = {
      ...withActions,
      rows: withActions.rows.map((r, i) =>
        i === 0 ? { ...r, actions: [{ kind: "fill" as const, label: "≡ logs", command: "/ps --logs" }] } : r,
      ),
    };

    // One row taller than the same table without actions.
    // **Two rows, and the figures are what said so.** Every surface drawing a
    // bar draws a blank above it, and the gap cannot come from `gapBefore` —
    // that applies between blocks in a sequence, and a table cannot ask the
    // sequence for a gap after itself.
    expect(registry.measure(acted, 160)).toBe(registry.measure(withActions, 160) + 2);

    // **Three ways, and the three-way equality is the assertion.** A bar drawn
    // only when a row is focused satisfies the first comparison exactly, and
    // gives a block two heights for one document — focus moves without `rev`
    // moving, so C14 keeps answering with the old one (I17).
    const onRow = measurable({
      definitions: [tableDefinition],
      focus: { blockId: acted.id, rowId: acted.rows[0]!.id },
    });
    const elsewhere = measurable({
      definitions: [tableDefinition],
      focus: { blockId: acted.id, rowId: acted.rows[1]!.id },
    });

    const heights = [
      registry.measure(acted, 160),
      onRow.measure(acted, 160),
      elsewhere.measure(acted, 160),
    ];
    expect(new Set(heights).size, `measured ${heights.join(", ")} under three focus states`).toBe(1);

    // And rendered agrees with measured in every one of them (I9).
    for (const kit of [registry, onRow, elsewhere]) {
      expect(kit.renderToLines(acted, 160).length).toBe(kit.measure(acted, 160)); // cells-ok
    }
  });

  it("T1.19 (I17): the bar carries the focused row's actions, and is blank with none", () => {
    const base = psTable({ rows: 2 });
    const acted: Table = {
      ...base,
      rows: base.rows.map((r, i) => ({
        ...r,
        actions: [
          i === 0
            ? { kind: "fill" as const, label: "≡ logs", command: "/ps --logs" }
            : { kind: "fill" as const, label: "⚡ events", command: "/ps --events" },
        ],
      })),
    };

    const last = (kit: typeof registry): string => kit.renderToLines(acted, 160).at(-1) ?? "";

    const first = measurable({
      definitions: [tableDefinition],
      focus: { blockId: acted.id, rowId: acted.rows[0]!.id },
    });
    const second = measurable({
      definitions: [tableDefinition],
      focus: { blockId: acted.id, rowId: acted.rows[1]!.id },
    });

    expect(last(first)).toContain("≡ logs");
    expect(last(first), "and not the other row's").not.toContain("⚡ events");
    expect(last(second)).toContain("⚡ events");

    // **The blank case is what stops the row being conditional in the renderer
    // while looking unconditional in the measurer.** Without it a `return` on
    // no-focus passes both assertions above and loses a row.
    expect(last(registry).trim(), "no focus, and the row is still there").toBe("");
  });

  it("T1.17 (I15): a row that cannot be expanded draws no marker", () => {
    // At 160 nothing drops and no row declares detail, so nothing is expandable —
    // and a marker that did nothing when pressed would be worse than none.
    const plan = planColumns(psColumns(), 160);
    expect(plan.dropped).toEqual([]);
    expect(registry.renderToLines(psTable({ rows: 2 }), 160)[1] ?? "").not.toContain("▸");
  });

  it("T1.18 (C04 I30): a column truncates from the end it declares", () => {
    // The end characters are *removed* from — so `start` keeps the leaf, which is
    // S14's key column, R01's image tag and S05's pod hash. Both directions are
    // exactly the planned width and both place one marker.
    const columns = (from: "start" | "end"): readonly ColumnDef[] => [
      { key: "key", label: "key", align: "left", priority: 10, minWidth: 12, sortable: false, truncateFrom: from },
    ];
    const rows = [{ id: "r1", cells: { key: { text: "ui.show_banner" } } }];

    const draw = (from: "start" | "end"): string =>
      visible(registry.renderToLines({ kind: "table", id: "t", columns: columns(from), rows }, 12)[1] ?? "");

    // 14 characters into 12 cells: 11 kept plus a one-cell marker, from whichever
    // end the column declared.
    expect(draw("end")).toBe("ui.show_ban…");
    expect(draw("start")).toBe("…show_banner");
    expect(cells(draw("end"))).toBe(cells(draw("start")));

    // The default is `end`, so a column that says nothing renders as it did before
    // the field existed.
    const silent = columns("end").map(({ truncateFrom: _t, ...rest }) => rest);
    expect(visible(registry.renderToLines({ kind: "table", id: "t", columns: silent, rows }, 12)[1] ?? "")).toBe(
      draw("end"),
    );
  });

  it("the gap is two cells, and it is the plan's own number", () => {
    expect(COLUMN_GAP).toBe(2);
    expect(planColumns(psColumns(), 160).gap).toBe(COLUMN_GAP);
  });
});

describe("C11 — an element's `copy` is its source, not its rendering (C26 §5c)", () => {
  const registry = createBlockRegistry({ defaults: true });
  const copyOf = (block: Table, width: number): string =>
    tableElements(block, width, registry.measure)[0]?.copy ?? "";

  it("T1.42 (C26 §5c): the copy carries every declared column, including dropped ones", () => {
    // **The mutation this row exists for is a copy taken from the rendering.**
    // At 60 cells `planColumns` drops most of this table's twelve columns, and
    // a copy assembled from what survives is *what is on screen* — which passes
    // every assertion about what is on screen and is wrong about exactly the
    // thing semantic copy exists for.
    const block = psTable();
    const narrow = copyOf(block, 60);
    const wide = copyOf(block, 200);

    const dropped = planColumns(psColumns(), 60).dropped;
    expect(dropped.length, "the width really does drop columns").toBeGreaterThan(0);

    expect(narrow, "the same text at every width — the data, not the view").toBe(wide);

    // And it is the declared count, not the surviving one.
    expect(narrow.split("\t").length).toBe(psColumns().length);
  });

  it("T1.43 (C26 §5c): the copy is untruncated, and carries no rendered decoration", () => {
    // A value longer than any column's `maxWidth` at this width: the painted
    // cell ends in an ellipsis and the copy does not. The row also asserts the
    // expand column's marker is absent — a glyph nobody typed, which a copy
    // taken from cells would carry.
    const base = psTable({ rows: 1 });
    const long = "a-very-long-family-name-that-will-not-fit-in-any-column";
    const row = base.rows[0];
    if (row === undefined) throw new Error("fixture has no row");
    const block: Table = {
      ...base,
      rows: [{ ...row, cells: { ...row.cells, family: { text: long } } }],
    };

    const copy = copyOf(block, 60);

    expect(copy, "the whole value").toContain(long);
    expect(copy, "no elision marker").not.toContain("…");
    expect(copy.split("\t")[0], "the expand column contributes its cell, not a marker").toBe(
      block.rows[0]?.cells["expand"]?.text ?? "",
    );
  });
});
