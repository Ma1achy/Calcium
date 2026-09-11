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
import { MONO_UNICODE_CAPS, measurable, visible } from "../support/render.js";
import { glyphFor } from "../../src/presentation/blocks/glyphs.js";
import { cells } from "../../src/presentation/text.js";
import type { Cell, ColumnDef, Table } from "../../src/data/viewmodel/index.js";
import type { TerminalCapabilities } from "../../src/terminal/capabilities.js";

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

  /**
   * **A declaration with nowhere to fire** (I22, F1032, and F50 from the other
   * side).
   *
   * A column with no `flex` is allocated its `minWidth` by step 6 and never
   * grows, so `maxWidth` is a ceiling on nothing. F50 recorded the consequence
   * as a consumer shape — `/diff`'s PATH declared `maxWidth: 72`, had no `flex`
   * and drew at 20 cells with 80 empty beside it — and §3's step 7 used to say
   * *clamp each column*, which is the sentence a surface author reads before
   * writing one. In the one consumer in the tree, **26 of 26 `maxWidth`
   * declarations sit on columns with no `flex`**.
   *
   * The row is a **deep equality over the whole sweep**, not a spot check: the
   * claim is that the field cannot change a plan, and one width is a claim about
   * one width. The control is the last block — the same cap on a `flex` column
   * *does* move the plan — without which this row passes just as well against a
   * planner that ignores `maxWidth` entirely, which is the vacuity it is written
   * to avoid.
   *
   * It also pins the reversal. Making `maxWidth` imply growth is a real option
   * and it is not taken: it would relay out every table declaring one, and it
   * contradicts step 8's decision to leave residual width unused. This fails the
   * day someone takes it, which is what makes that a decision rather than a
   * drift — T2.7's argument, one field over.
   */
  /** A one-column table of a single bar cell, planned at `width`. */
  const barCell = (width: number, cell: Cell): Table => ({
    kind: "table",
    id: "i23",
    columns: [{ key: "cpu", label: "CPU", align: "left", priority: 1, minWidth: width, sortable: false }],
    rows: [{ id: "r", cells: { cpu: cell } }],
  });

  /** The cell alone, with the header dropped and the styling stripped. */
  const drawn = (block: Table, caps: TerminalCapabilities, trim = true): string => {
    const kit = measurable({ definitions: [tableDefinition], capabilities: caps });
    const line = kit.renderToLines(block, 40)[1];
    expect(line, "the table drew a row").toBeDefined();
    return trim ? visible(line ?? "").trimEnd() : visible(line ?? "");
  };

  it("T1.26 (I23): a toned bar cell draws its mark, and the series takes what the mark leaves", () => {
    // **At 1-bit with Unicode**, which is the rung the claim is about: a fixture
    // that also drops Unicode moves two capabilities and cannot say which one
    // the behaviour follows. With no colour the mark is the whole of what
    // separates a busy container from a quiet one (C12 I25).
    const bar = { value: 101.2, max: 100, format: "percent" } as const;
    const toned = drawn(barCell(17, { text: "", bar, tone: "error", glyph: "warn" }), MONO_UNICODE_CAPS);
    expect(cells(toned), "exactly the planned width").toBe(17);
    expect(toned, "the mark C04 I6 obliges").toContain(glyphFor("warn", MONO_UNICODE_CAPS));
    expect(toned, "and the number the bar is for").toContain("101.2%");

    // **The control is the same cell with no glyph**, and it is what says the
    // lead came out of the series rather than out of the column: same width,
    // longer run. Before I23 the two were byte-identical.
    const bare = drawn(barCell(17, { text: "", bar }), MONO_UNICODE_CAPS);
    expect(cells(bare), "the column is unmoved").toBe(17);
    const run = (l: string): number => (l.match(/[█░]/gu) ?? []).length;
    expect(run(bare) - run(toned), "the mark is paid for out of the run").toBe(
      cells(`${glyphFor("warn", MONO_UNICODE_CAPS)} `),
    );
  });

  it("T1.28 (I23): the slot is the column's, so one marked row does not shorten its own run alone", () => {
    // **The equality is the assertion, not either number.** Spent per cell the
    // marked row gets a run two shorter than its neighbour, every count right,
    // and the band boundary becomes where the axis changes length — which is
    // C12 I20's *99 draws 37 and 100 draws 36* in the other allowance.
    //
    // Read as an **offset in the frame** rather than by counting run
    // characters: a run is `█░` at one rung and braille at another, so a matcher
    // for either reports absence when the value changes form.
    const both = (marked: boolean): readonly string[] => {
      const kit = measurable({ definitions: [tableDefinition], capabilities: MONO_UNICODE_CAPS });
      const block: Table = {
        kind: "table",
        id: "i23-col",
        columns: [{ key: "cpu", label: "CPU", align: "left", priority: 1, minWidth: 17, sortable: false }],
        rows: [
          {
            id: "hot",
            cells: {
              cpu: marked
                ? { text: "", bar: { value: 85.2, max: 100, format: "percent" }, tone: "error", glyph: "warn" }
                : { text: "", bar: { value: 85.2, max: 100, format: "percent" } },
            },
          },
          { id: "cool", cells: { cpu: { text: "", bar: { value: 45.2, max: 100, format: "percent" } } } },
        ],
      };
      return kit.renderToLines(block, 40).slice(1).map((l) => visible(l));
    };

    const [hot, cool] = both(true);
    expect(hot, "two rows drew").toBeDefined();
    expect(cool).toBeDefined();
    expect(cells(hot ?? ""), "the plan holds on the marked row").toBe(17);
    expect(cells(cool ?? ""), "and on the one beside it").toBe(17);
    expect(hot, "the mark C04 I6 obliges").toContain(glyphFor("warn", MONO_UNICODE_CAPS));
    expect(cool, "and the row beside it has none").not.toContain(glyphFor("warn", MONO_UNICODE_CAPS));
    // **Where the run begins, not where the number sits.** The number is
    // right-aligned inside the cell, so it does not move for the lead and an
    // assertion on its offset passes under a per-cell lead exactly as well —
    // the first draft of this row made that mistake twice in four lines.
    const lead = cells(`${glyphFor("warn", MONO_UNICODE_CAPS)} `);
    const runsAt = (l: string): number => l.search(/\S/u);
    expect(runsAt(cool ?? ""), "the unmarked row's slot is blank and its run starts after it").toBe(lead);
    expect(runsAt(hot ?? ""), "where the marked row's mark starts").toBe(0);

    // **The control**, so the row cannot pass by measuring a column that
    // reserves nothing: with neither cell marked the slot is not spent and both
    // runs begin at the first cell.
    const [plainHot, plainCool] = both(false);
    expect(runsAt(plainHot ?? ""), "nothing is reserved").toBe(0);
    expect(runsAt(plainCool ?? ""), "on either row").toBe(0);
  });

  it("T1.27 (I23): the mark is dropped where it does not fit, and at no width above that", () => {
    // **A sweep rather than a chosen width**, because a chosen width is the
    // judgement this invariant stopped making. I23's first form dropped the mark
    // wherever "the plan leaves no room for both" and the frame falsified it: at
    // 3 a toned cell draws `▲ …` where an untoned one draws `10…` for 101.2, and
    // C12 I20 already ruled on that comparison — a truncated number is a
    // different number.
    const mark = glyphFor("warn", MONO_UNICODE_CAPS);
    const lead = cells(`${mark} `);
    const held: number[] = [];
    for (let w = 1; w <= 20; w += 1) {
      const cell = drawn(barCell(w, { text: "", bar: { value: 101.2, max: 100, format: "percent" }, tone: "error", glyph: "warn" }), MONO_UNICODE_CAPS, false);
      expect(cells(cell), `the plan is the plan at ${String(w)}`).toBe(w);
      if (cell.includes(mark)) held.push(w);
    }
    // Every width that holds the lead, and only those — the boundary is an
    // arithmetic rather than a taste.
    expect(held, "the mark is present from the first width that fits it").toEqual(
      Array.from({ length: 20 - lead + 1 }, (_, i) => i + lead),
    );
  });

  it("T3.21 (I23): the cell holds its plan across a convention change", () => {
    // **Stated blind spot.** This was written for a two-cell glyph at
    // `ambiguousWidth: "wide"` and no such glyph exists: C09 I48 resolves an
    // Ambiguous slot to its ASCII half there, so both renderings of every slot
    // are one cell and the lead is two at either arm. What is asserted is that
    // the cell holds its plan and the lead still comes out of the series at
    // both — the day a token's two renderings differ in width it is C09 T2.5
    // that goes red, not this row. Kept because the arm it covers is the one
    // C12 I24's four crooked gutters were made of.
    const bar = { value: 101.2, max: 100, format: "percent" } as const;
    const wide = { ...MONO_UNICODE_CAPS, ambiguousWidth: "wide" as const };
    for (const caps of [MONO_UNICODE_CAPS, wide]) {
      const toned = drawn(barCell(17, { text: "", bar, tone: "error", glyph: "warn" }), caps, false);
      const bare = drawn(barCell(17, { text: "", bar }), caps, false);
      const at = caps.ambiguousWidth;
      expect(cells(toned, at), `the plan holds at ${at}`).toBe(17);
      expect(cells(bare, at), `and for the control at ${at}`).toBe(17);
      // **What this can see, and what it cannot.** Once the cell is 17 and ends
      // with the same number, *the run is shorter by the lead* is arithmetic
      // rather than an observation — asserting it is decoration. The three
      // independent claims are the width, the mark and the number whole: a fix
      // that made room by dropping the value would hold the first two.
      expect(toned, `the mark at ${at}`).toContain(glyphFor("warn", caps));
      expect(toned, `and the value whole at ${at}`).toContain("101.2%");
      expect(bare, `the control carries it too at ${at}`).toContain("101.2%");
    }
  });

  it("T1.25 (I22): `maxWidth` on a column with no `flex` cannot change a plan, at any width", () => {
    const drop = (c: ColumnDef): ColumnDef => {
      const { maxWidth: _capped, ...rest } = c;
      return rest as ColumnDef;
    };
    const SHAPES: readonly (readonly ColumnDef[])[] = [
      [{ key: "a", label: "a", align: "left", priority: 90, minWidth: 8, maxWidth: 40, sortable: false }],
      [
        { key: "a", label: "a", align: "left", priority: 90, minWidth: 8, maxWidth: 40, sortable: false },
        { key: "b", label: "b", align: "left", priority: 80, minWidth: 8, flex: true, sortable: false },
      ],
      [
        { key: "a", label: "a", align: "left", priority: 90, minWidth: 8, maxWidth: 40, sortable: false },
        { key: "b", label: "b", align: "left", priority: 80, minWidth: 8, maxWidth: 12, sortable: false },
      ],
      // F50's `/diff`: the fixed column first, the flexible one second.
      [
        { key: "kind", label: "kind", align: "left", priority: 90, minWidth: 10, maxWidth: 72, sortable: false },
        { key: "path", label: "path", align: "left", priority: 80, minWidth: 12, flex: true, sortable: false },
      ],
      // F50's `/ps`: one flex column swallowing the residual, a capped one after it.
      [
        { key: "name", label: "name", align: "left", priority: 90, minWidth: 10, flex: true, sortable: false },
        { key: "ports", label: "ports", align: "left", priority: 80, minWidth: 10, maxWidth: 30, sortable: false },
      ],
    ];

    let compared = 0;
    for (const shape of SHAPES) {
      const bare = shape.map((c) => (c.flex === true ? c : drop(c)));
      for (let width = 1; width <= 200; width += 1) {
        expect(planColumns(shape, width), `shape ${shape.map((c) => c.key).join("+")} at ${String(width)}`).toEqual(
          planColumns(bare, width),
        );
        compared += 1; // cells-ok — a plan count
      }
    }
    expect(compared, "the sweep must be the size it claims").toBe(1000);

    // **The control**, and without it the sweep above is satisfied by a planner
    // that never reads `maxWidth` at all: on a `flex` column the cap fires.
    const capped: readonly ColumnDef[] = [
      { key: "a", label: "a", align: "left", priority: 90, minWidth: 8, maxWidth: 20, flex: true, sortable: false },
      { key: "b", label: "b", align: "left", priority: 80, minWidth: 8, flex: true, sortable: false },
    ];
    expect(planColumns(capped, 120).visible.map((v) => v.width)).toEqual([20, 98]);
    expect(planColumns(capped.map(drop), 120).visible.map((v) => v.width)).toEqual([59, 59]);
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

// ---------------------------------------------------------------------------
// C11 §5a — the window, and the three things a slice moves.
// ---------------------------------------------------------------------------

/** A sortable column whose kind flips under a slice (F429). */
const flip = (): Table => ({
  kind: "table",
  id: "flip",
  columns: [
    { key: "name", label: "Name", align: "left", priority: 1, minWidth: 8, sortable: true },
    { key: "v", label: "V", align: "right", priority: 2, minWidth: 5, sortable: true },
  ],
  rows: [
    { id: "a", cells: { name: { text: "alpha" }, v: { text: "2" } } },
    { id: "b", cells: { name: { text: "bravo" }, v: { text: "10" } } },
    // **The one non-numeric value.** Every row above it parses as a number, so
    // `kindOf` calls the column text *because of this cell alone* — and a window
    // that drops it re-classifies the column as numeric.
    { id: "c", cells: { name: { text: "charl" }, v: { text: "abc" } } },
  ],
  sort: { key: "v", direction: "asc" },
});

const barred = (): Table => ({
  kind: "table",
  id: "bar",
  columns: [{ key: "name", label: "Name", align: "left", priority: 1, minWidth: 8, sortable: false }],
  rows: [
    { id: "r0", cells: { name: { text: "row-0" } } },
    // The only row declaring actions, so the bar's presence hangs on this row
    // surviving a slice (I18).
    {
      id: "r1",
      cells: { name: { text: "row-1" } },
      actions: [{ kind: "exec", label: "⏎ open", command: "open" }],
    },
    { id: "r2", cells: { name: { text: "row-2" } } },
  ],
});

const windowOf = (block: Table, from: number, to: number, width = 40) => {
  const out = tableDefinition.window?.(block, width, from, to, registry.measure);
  if (out === undefined) throw new Error("table declares no window");
  return out;
};

describe("C11 §5a — the window", () => {
  it("T1.20 (I19): a slice keeps display order, and re-deriving it would reverse this one", () => {
    // **The measurement, not the argument.** `sortedRows` looks like a
    // permutation, so sort-then-slice looks idempotent — and `kindOf` reads the
    // values *present*, so the slice classifies differently from the block.
    const block = flip();
    const whole = registry.renderToLines(block, 40).slice(1).map((l) => visible(l).trim().split(/\s+/)[0]);
    expect(whole, "text order, because `abc` is in the column").toEqual(["bravo", "alpha", "charl"]);

    // `[1, 3)` is the header plus the first two rows in display order.
    const w = windowOf(block, 0, 3);
    const rows = registry.renderToLines(w.block, 40).slice(1).map((l) => visible(l).trim().split(/\s+/)[0]);
    expect(rows, "the window shows what the block showed at those offsets").toEqual(["bravo", "alpha"]);

    // **The control, and it is the defect this field exists for.** The same two
    // rows without the flag re-sort as a numeric column and come back reversed —
    // with the same count, the same height and the same `skipRows`.
    const unpinned: Table = { ...(w.block as Table), presorted: false };
    const reversed = registry
      .renderToLines(unpinned, 40)
      .slice(1)
      .map((l) => visible(l).trim().split(/\s+/)[0]);
    expect(reversed, "re-derived, the slice reverses itself").toEqual(["alpha", "bravo"]);
    expect(registry.measure(unpinned, 40), "and nothing about the height moves").toBe(
      registry.measure(w.block, 40),
    );
  });

  it("T1.22 (C09 I33, C04 I68, C11 I20): a floored table is kept whole; its un-floored sibling is sliced with its pins", () => {
    // **No test had constructed a floored table.** The registry's floor branch
    // (`windowable = floorOf(block) > 0 ? undefined : …`) was exercised by a
    // `logs` block alone, and `table` is the kind whose window carries pins —
    // `presorted` and `actionBar` — so the un-windowed shape is the one where a
    // slice would have re-sorted. Both siblings here, so the pair shows the
    // branch is live rather than restating one arm of it.
    const kit = measurable({ definitions: [tableDefinition] });
    const table = psTable({ rows: 6 });
    const own = kit.measure(table, 40); // header + six rows
    expect(own).toBe(7);
    const tall: Table = { ...table, minHeight: own + 4 };
    expect(kit.measure(tall, 40), "the floor pads (C09 I33)").toBe(own + 4);

    // **The un-floored sibling is windowed, and the window pins what it derived.**
    const plain = kit.registry.windowSequence([table], 40, 2, 5);
    const piece = plain.blocks[0] as Table;
    expect(piece, "a new block, not the original").not.toBe(table);
    expect(piece.presorted, "the slice's order is pinned (C11 I19)").toBe(true);
    expect(piece.showHeader, "the window opens below the header").toBe(false);
    expect(piece.rows.map((r) => r.id), "rows at offsets 2, 3 and 4 — the header is row 0").toEqual(["r2", "r3", "r4"]);
    expect(kit.measure(piece, 40) - plain.skipRows, "and the window is exactly the three rows asked for").toBe(3);
    // Read the frame: three body rows, no header, in display order.
    const sliced = kit.renderToLines(piece, 40).map((l) => visible(l));
    expect(sliced).toHaveLength(3);
    expect(sliced.map((l) => /[0-9a-f]{7}/.exec(l)?.[0]), "uuids of rows 2–4").toEqual(["7c2d4e1", "2e8a04c", "f410d99"]);

    // **The floored sibling is the block itself, paid out of slack** (C04 I68).
    const kept = kit.registry.windowSequence([tall], 40, 2, 5);
    expect(kept.blocks[0], "the floored block is the block").toBe(tall);
    expect(kept.skipRows, "the rows above the window are slack").toBe(2);
    expect((kept.blocks[0] as Table).presorted, "so it carries no pin it never needed").toBeUndefined();

    // Read the frame: the whole table, header first, then four blank rows of
    // floor — which is what "kept whole" costs, and C09 I33 says padding is all of it.
    const whole = kit.renderToLines(tall, 40).map((l) => visible(l));
    expect(whole).toHaveLength(own + 4);
    expect(whole[0], "the header is drawn").toMatch(/uuid/i);
    expect(whole.slice(1, own).map((l) => /[0-9a-f]{7}/.exec(l)?.[0]), "every row, in the block's order").toEqual([
      "a3f9b21", "7c2d4e1", "2e8a04c", "f410d99", "b1c7e34", "a3f9b21",
    ]);
    expect(whole.slice(own).every((l) => l.trim() === ""), "the floor is blank rows under the table").toBe(true);
  });

  it("T1.21 (I18): the bar's presence is pinned, in both directions", () => {
    const block = barred();
    const total = registry.measure(block, 40);
    // header + 3 rows + blank + labels
    expect(total).toBe(6);

    // **Direction one — the slice drops the row that declares `actions`.** The
    // range covers the bar, so the bar must be drawn; derived from the slice it
    // would not be.
    const overBar = windowOf(block, 4, 6);
    expect((overBar.block as Table).actionBar, "the bar is declared").toBe(true);
    expect(
      registry.measure(overBar.block, 40) - overBar.skipRows - overBar.dropRows,
      "and the window is exactly the two rows asked for",
    ).toBe(2);

    // **Direction two — the slice keeps the row that declares `actions` and the
    // range does not reach the bar.** Derived, this window would draw a bar in
    // the middle of a scrolled table.
    const midTable = windowOf(block, 2, 3);
    expect((midTable.block as Table).actionBar, "no bar here").toBe(false);
    expect((midTable.block as Table).rows.map((r) => r.id), "and it is the row with actions").toEqual([
      "r1",
    ]);
    expect(registry.measure(midTable.block, 40), "one row, no bar").toBe(1);
  });

  it("T1.22 (I20): neither end of a table is a row, and a window holds one anyway", () => {
    const block = barred();

    // `[0, 1)` — the header alone. A bodyless table measures `header + 1`, so a
    // window with no rows would answer 2 for a range of 1, with the surplus
    // *after* the header where `skipRows` cannot reach it.
    const head = windowOf(block, 0, 1);
    expect((head.block as Table).rows.length, "a row is kept").toBeGreaterThan(0);
    expect(head.skipRows, "nothing leads it").toBe(0);
    expect(head.dropRows, "and the kept row is charged to the trailing residual").toBe(1);
    const headRow = registry.renderToLines(head.block, 40)[0] ?? "";
    expect(visible(headRow), "the header, not the empty message").toContain("Name");

    // `[5, 6)` — the bar's label row alone. A bar whose existence derives from
    // the rows cannot be drawn beside none, so the nearest row leads it.
    const bar = windowOf(block, 5, 6);
    expect((bar.block as Table).rows.length, "a row is kept").toBeGreaterThan(0);
    expect(bar.skipRows, "and charged to the leading residual").toBe(2);
    expect(bar.dropRows).toBe(0);
    expect((bar.block as Table).showHeader, "the header is out of range").toBe(false);
  });
});
