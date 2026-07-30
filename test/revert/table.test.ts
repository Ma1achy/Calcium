// C11 tier 6 — fail-on-revert.
//
// Each names the *change* that makes it fail. Most of these are edits somebody
// has made in a terminal UI that shipped: a table that scrolls sideways, a sort
// that leaves the detail rows behind, a status cut to a different word.
import { describe, expect, it } from "vitest";
import { planColumns, tableDefinition } from "../../src/presentation/table/index.js";
import { psColumns, psTable } from "../support/blocks.js";
import { measurable, registry as bareRegistry, visible } from "../support/render.js";
import { cells } from "../../src/presentation/text.js";
import { checkSourceScans } from "../../tools/enforce/source-scans.mjs";
import type { ColumnDef, Table } from "../../src/data/viewmodel/index.js";

const r = measurable({ definitions: [tableDefinition] });

describe("C11 tier 6", () => {
  it("T6.1 (I1): introducing horizontal scroll → T1.5's width invariant fails", () => {
    // The revert: planning to the content's width and letting the caller scroll,
    // or dropping the `clampSpans` at the end of a row. Either produces rows wider
    // than the terminal, which the terminal wraps into rows nobody measured.
    const columns = psColumns();
    for (let width = 20; width <= 200; width += 7) {
      const plan = planColumns(columns, width);
      const sum =
        plan.visible.map((v) => v.width).reduce((a, b) => a + b, 0) +
        Math.max(0, plan.visible.length - 1) * plan.gap; // cells-ok
      expect(sum, `plan overflows at ${String(width)}`).toBeLessThanOrEqual(width);

      const block = psTable({ rows: 3, expanded: [1] });
      for (const line of r.renderToLines(block, width)) {
        expect(cells(visible(line)), `row overflows at ${String(width)}`).toBeLessThanOrEqual(width);
      }
    }
  });

  it("T6.2 (I2): dropping a column without adding it to detail → T2.4 fails", () => {
    // The revert: `detailBlocks` returning `row.detail` unchanged. The columns
    // vanish from the header and reappear nowhere, and nothing else in the suite
    // notices — the frame is the right height and every row fits.
    const plan = planColumns(psColumns(), 60);
    expect(plan.dropped).toEqual(["metric", "spark", "age", "kind", "owner", "mr"]);

    const frame = r.renderToLines(psTable({ rows: 2, expanded: [1, 2] }), 60).join("\n");
    for (const key of plan.dropped) {
      expect(frame, `${key} dropped and unreachable`).toContain(key);
    }
  });

  it("T6.12 (I2): tying expandability to a declared detail → T2.8 fails", () => {
    // The revert is one clause: `expandable = detail !== undefined`. It looks like
    // a simplification, and it makes every dropped field unreachable on any row
    // that declared no detail — which at 60 columns is the majority of the data.
    const bare = psTable({ rows: 3, expanded: [1, 2, 3], detail: false });
    expect(bare.rows.every((row) => row.detail === undefined)).toBe(true);

    const frame = r.renderToLines(bare, 60).join("\n");
    expect(frame).toContain("owner");
    expect(frame).toContain("malachy@fmx.io");

    // And the marker: a row with no detail is still expandable, so it still says so.
    expect(visible(r.renderToLines(psTable({ rows: 1 }), 60)[1] ?? "")).toContain("▸");
  });

  it("T6.3 (I4): reordering columns by priority for display → T1.3 fails", () => {
    // The revert: returning the priority-sorted admission list instead of restoring
    // the declared order at step 5. Every column is present and every width fits,
    // so nothing fails except the reader's ability to find a column twice.
    // **The S-series cannot catch this on its own.** S03 declares its eleven
    // columns in descending priority order, so the survivors at 80 are in the same
    // order under either rule and the drop tables agree with a broken planner. The
    // fixture therefore declares an order that differs from its priorities — which
    // is the case every surface happens not to be.
    const columns: readonly ColumnDef[] = [
      { key: "low", label: "low", align: "left", priority: 10, minWidth: 6, sortable: false },
      { key: "high", label: "high", align: "left", priority: 100, minWidth: 6, sortable: false },
      { key: "mid", label: "mid", align: "left", priority: 50, minWidth: 6, sortable: false },
    ];
    expect(planColumns(columns, 40).visible.map((v) => v.key)).toEqual(["low", "high", "mid"]);

    // Under pressure the *set* changes and the order does not: three need 22 cells,
    // so at 21 the two highest priorities survive — in declared order, which puts
    // `high` before `mid` here only because that is how they were declared.
    expect(planColumns(columns, 21).visible.map((v) => v.key)).toEqual(["high", "mid"]);

    const byPriority = [...columns].sort((a, b) => b.priority - a.priority).map((c) => c.key);
    expect(byPriority).toEqual(["high", "mid", "low"]);
    expect(planColumns(columns, 40).visible.map((v) => v.key)).not.toEqual(byPriority);

    // S03's own survivors, for the record — right under both rules, which is the
    // point above.
    expect(planColumns(psColumns(), 80).visible.map((v) => v.key)).toEqual([
      "expand",
      "glyph",
      "uuid",
      "family",
      "status",
      "detail",
      "metric",
      "age",
    ]);
  });

  it("T6.4 (I3): allowing every column to drop → T1.4 fails and the table renders empty", () => {
    // The revert: deleting step 4's forced admission. At any width below the
    // highest-priority column's minimum the table becomes a header and nothing.
    const columns: readonly ColumnDef[] = [
      { key: "only", label: "only", align: "left", priority: 100, minWidth: 40, sortable: false },
    ];
    for (const width of [1, 5, 20, 39]) {
      const plan = planColumns(columns, width);
      expect(plan.visible.length, `nothing survives at ${String(width)}`).toBe(1); // cells-ok
      expect(plan.overflowed).toBe(true);
    }
  });

  it("T6.5 (I8): an unstable sort → T1.11 fails", () => {
    // The revert: dropping the index tiebreak, which most comparators do not need
    // and `Array.prototype.sort` is specified to preserve anyway — until the
    // comparator returns 0 for rows a later refactor made distinguishable.
    const rows = Array.from({ length: 40 }, (_, i) => ({
      id: `r${String(i + 1)}`,
      cells: { family: { text: "identical" } },
    }));
    const block: Table = {
      kind: "table",
      id: "t",
      columns: psColumns(),
      rows,
      sort: { key: "family", direction: "desc" },
    };
    const lines = r.renderToLines(block, 160).slice(1);
    expect(lines.length).toBe(40); // cells-ok
    // Descending on equal keys is still the input order — a comparator negating
    // the tiebreak along with the comparison reverses this.
    const drawn = r.renderToLines({ ...block, rows: rows.map((row, i) => ({ ...row, cells: { ...row.cells, uuid: { text: `u${String(i)}` } } })) }, 160)
      .slice(1)
      .map((line) => /u\d+/.exec(visible(line))?.[0]);
    expect(drawn).toEqual(rows.map((_, i) => `u${String(i)}`));
  });

  it("T6.6 (I8): sorting rows without their details → T1.12 fails — the mockup's bug", () => {
    // The revert that cannot be made here, and the reason it cannot: `detail` is a
    // field of the row (C04), so a permutation carries it. This asserts the
    // structural property, so a refactor lifting detail into a parallel array —
    // which is exactly what the mockup had — fails on this line.
    const block = psTable({ rows: 4, expanded: [1, 2, 3, 4], detail: true, sort: { key: "age", direction: "asc" } });
    for (const row of block.rows) {
      expect(row.detail, `row ${row.id} keeps its own detail`).toBeDefined();
      expect(row.detail?.[0]?.id).toBe(`ps-p${row.id.slice(1)}`);
    }
    // And the frame pairs them: as many detail runs as expanded rows.
    const lines = r.renderToLines(block, 160).slice(1);
    const progressRows = lines.filter((line) => visible(line).includes("epoch")).length; // cells-ok
    expect(progressRows).toBe(4);
  });

  it("T6.7 (I9): ignoring expanded detail in measurement → T2.3 and T4.4 fail with drift", () => {
    // The revert: `1 + rows.length`, which is right for every flat table and wrong
    // by the detail's height for every open one. The viewport drifts by that much,
    // six screenfuls later, which is why it is caught here rather than there.
    const open = psTable({ rows: 5, expanded: [2, 4], detail: true });
    for (const width of [60, 80, 100, 120, 160]) {
      expect(r.measure(open, width), `width ${String(width)}`).toBe(
        r.renderToLines(open, width).length, // cells-ok
      );
      expect(r.measure(open, width)).toBeGreaterThan(1 + 5);
    }
  });

  it("T6.8 (I10): truncating a status column → T1.8 fails", () => {
    // The revert: admitting a column below its minimum to fit one more. `succeeded`
    // cut to `succeed…` reads as a different status, which is worse than the column
    // being absent — and this is the one place in the frame where a half-word is a
    // lie rather than an inconvenience.
    const columns = psColumns();
    for (let width = 20; width <= 200; width += 1) {
      const status = planColumns(columns, width).visible.find((v) => v.key === "status");
      if (status !== undefined) expect(status.width, `width ${String(width)}`).toBeGreaterThanOrEqual(11);
    }
    const line = visible(r.renderToLines(psTable({ rows: 2 }), 60)[1] ?? "");
    expect(line).toContain("running");
    expect(line).not.toContain("runnin…");
  });

  it("T6.9 (I11): caching sort order in module state → T2.6 fails", () => {
    // The scan is the enforcement; this is that the scan sees this directory. SS24
    // scoped to a path that does not exist would report compliance forever, which
    // is SS26's defect and the reason the scope is asserted rather than assumed.
    const fabricated: Record<string, string> = {
      "src/presentation/table/sort.ts": "let lastOrder = null;\n",
    };
    const violations = checkSourceScans(Object.keys(fabricated), (f: string) => fabricated[f] ?? "");
    expect(violations.filter((v) => v.rule === "SS24").length).toBeGreaterThan(0); // cells-ok
  });

  it("T6.10 (I12): making `table` a privileged built-in → T2.5 fails", () => {
    // The revert: adding `tableDefinition` to `blocks/defaults.ts`. The frame is
    // identical and the extension path stops being exercised by the framework
    // itself — which is the whole argument for three registrants rather than one.
    expect(bareRegistry().kinds).not.toContain("table");
    expect(bareRegistry([tableDefinition]).kinds).toContain("table");
  });

  it("T6.11: lexical sort on a numeric column → T1.14 fails", () => {
    // `100` before `2` is the lexical answer and it is wrong on every metric column
    // in the S-series.
    const block: Table = {
      kind: "table",
      id: "t",
      columns: psColumns(),
      rows: [
        { id: "a", cells: { uuid: { text: "u-100" }, metric: { text: "100" } } },
        { id: "b", cells: { uuid: { text: "u-2" }, metric: { text: "2" } } },
        { id: "c", cells: { uuid: { text: "u-10" }, metric: { text: "10" } } },
      ],
      sort: { key: "metric", direction: "asc" },
    };
    const drawn = r
      .renderToLines(block, 160)
      .slice(1)
      .map((line) => /u-\d+/.exec(visible(line))?.[0]);
    expect(drawn).toEqual(["u-2", "u-10", "u-100"]);
  });

  it("T6.13 (I16): recognising the expand column by key rather than role → T3.19 fails", () => {
    // The revert: `key === "expand"`. It works for every surface in the tree and
    // eats a far side's field of that name — and a fallback table over a payload
    // with an `expand` column would show a marker where the data was.
    const columns: readonly ColumnDef[] = [
      { key: "expand", label: "expand", align: "left", priority: 10, minWidth: 8, sortable: false },
    ];
    const block: Table = {
      kind: "table",
      id: "t",
      columns,
      rows: [{ id: "r1", cells: { expand: { text: "data" } }, detail: [] }],
    };
    expect(visible(r.renderToLines(block, 40)[1] ?? "")).toContain("data");
  });

  it("T6.14 (I16): letting planColumns reserve for the expand role → T2.9 fails", () => {
    // The revert: two cells taken off the width when a role column is present, or
    // the role column widened to hold a marker plus a gap. Every drop table in the
    // S-series moves by the same two cells, and each one is a reviewed layout.
    const withRole = psColumns();
    const without = withRole.map((c) => {
      const { role: _role, ...rest } = c;
      return rest;
    });
    for (const width of [60, 80, 100, 120, 160]) {
      expect(planColumns(without, width)).toEqual(planColumns(withRole, width));
    }
  });

  it("T6.15 (I11): memoising planColumns on (columns, width) → T2.7 fails", () => {
    // The reversal C11 §2 records. A memo is invisible in every other test — the
    // results are equal by construction — so identity is the only thing that sees
    // it, and T2.6's scan is the second half.
    const columns = psColumns();
    const first = planColumns(columns, 100);
    const second = planColumns(columns, 100);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
  });
});
