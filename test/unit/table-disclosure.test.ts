// C11 I32 — the disclosure count and the column it takes (rulings 69, 82).
//
// §3a's classification table, one row at a time where the row is a state at
// rest: the planner half against `planColumns` (T1.41), the drawn half through
// the registry (T1.42), and the window's pin (T3.23).
import { describe, expect, it } from "vitest";

import { planColumns, tableDefinition } from "../../src/presentation/table/index.js";
import { disclosureCells, planDisclosed } from "../../src/presentation/table/plan.js";
import { ASCII_CAPS, measurable, visible } from "../support/render.js";
import { body } from "../support/table-gutter.js";
import type { Block, ColumnDef, Table, TableRow } from "../../src/data/viewmodel/index.js";

const col = (key: string, priority: number, minWidth: number, extra: Partial<ColumnDef> = {}): ColumnDef => ({
  key,
  label: key,
  align: "left",
  priority,
  minWidth,
  sortable: false,
  ...extra,
});
const EXPAND = col("expand", 100, 1, { label: "", role: "expand" });
/** Five data columns of 8, one flexing: 1 + 5·8 + 5 gaps of 2 = 51 cells in all. */
const DATA = [
  col("a", 90, 8, { flex: true }),
  col("b", 80, 8),
  col("c", 70, 8),
  col("d", 60, 8),
  col("e", 50, 8),
];
const COLS: readonly ColumnDef[] = [EXPAND, ...DATA];
const note = (id: string): Block => ({ kind: "raw", id, text: id }) as unknown as Block;
const row = (id: string, over: Partial<TableRow> = {}): TableRow => ({
  id,
  cells: { a: { text: `${id}-a` }, b: { text: "b" }, c: { text: "c" }, d: { text: "d" }, e: { text: "e" } },
  ...over,
});
const table = (rows: readonly TableRow[], columns: readonly ColumnDef[] = COLS): Table => ({
  kind: "table",
  id: "t",
  columns,
  rows,
});
const widthOf = (plan: ReturnType<typeof planColumns>, key: string): number | undefined =>
  plan.visible.find((v) => v.key === key)?.width;

describe("C11 §3a — the disclosure count", () => {
  it("T1.41 (C11 I32): disclosureCells, and planDisclosed against planColumns over §3a's rows 1–6 and 11", () => {
    expect([0, 1, 9, 10, 99, 100].map(disclosureCells), "the mark, then mark + `+` + digits").toEqual([1, 3, 3, 4, 4, 5]);

    // Row 1 — no expand column: the role is the only thing read, so nothing changes.
    expect(planDisclosed(DATA, 30, 5)).toEqual(planColumns(DATA, 30));
    // Row 2 — nothing drops and no detail: the declared cell, and the plan is planColumns'.
    expect(planDisclosed(COLS, 80, 0)).toEqual(planColumns(COLS, 80));

    // Row 4 — N from detail alone at a wide width: three cells, and the flex column pays.
    const wide = planDisclosed(COLS, 80, 2);
    expect(wide.dropped).toEqual([]);
    expect(widthOf(wide, "expand")).toBe(3);
    expect(widthOf(wide, "a"), "the flex column gave up the two").toBe((widthOf(planColumns(COLS, 80), "a") ?? 0) - 2);

    // Row 5 — under pressure: at 51 all six fit declared, and the two reserved
    // cells drop `e` — the one-width-earlier cost §3a states.
    expect(planColumns(COLS, 51).dropped).toEqual([]);
    const tight = planDisclosed(COLS, 51, 1);
    expect(tight.dropped, "the reservation is charged to the drop arithmetic").toEqual(["e"]);
    expect(widthOf(tight, "expand"), "N = 1 dropped + 1 detail").toBe(3);

    // Row 6 — N ≥ 10, and the bound. Ten one-cell columns at width 4: a first
    // plan reserving the declared cell admits one and hides nine, which asks for
    // three cells; the plan at three admits none and hides ten, which needs four.
    // A single pass reserving for its own count cuts that count. The bound
    // reserves for ten from the start, and the count drawn fits.
    const ten = [EXPAND, ...Array.from({ length: 10 }, (_, i) => col(`k${String(i)}`, 50 - i, 1))];
    const narrow = planDisclosed(ten, 4, 0);
    expect(narrow.dropped, "all ten hidden").toHaveLength(10);
    expect(widthOf(narrow, "expand"), "four cells for `▹+10`").toBe(disclosureCells(10));
  });

  it("T1.42 (C11 I32): a rendered table draws ▹+N, ▹ alone, ▿ alone, a blank, (+N at ASCII, and the mark alone below the reservation", () => {
    const registry = measurable({ definitions: [tableDefinition] });
    const lines = (block: Table, width: number, reg = registry): string[] =>
      reg.renderToLines(block, width).map((l) => body(visible(l)));

    // At 40 cells of content `d` and `e` drop — 3 + 8·3 + 3 gaps = 33, and `d`
    // would take it to 43 — so N = 2 dropped + detail.
    const block = table([
      row("r1", { detail: [note("n1")] }),
      row("r2", { detail: [] }),
      row("r3", { detail: [note("n3")], expanded: true }),
      row("r4"),
    ]);
    const drawn = lines(block, 42);
    const lead = (id: string): string => (drawn.find((l) => l.includes(`${id}-a`)) ?? "").slice(0, 4);
    expect(lead("r1"), "collapsed: the mark and what it hides").toBe("▹+3 ");
    expect(lead("r2"), "`detail: []` still hides the dropped two").toBe("▹+2 ");
    expect(lead("r3"), "expanded: the mark alone, the columns where they were").toBe("▿   ");
    expect(lead("r4")).toBe("▹+2 ");
    // Every row starts its first data column at the same cell (rows 7 and 8).
    const starts = ["r1", "r2", "r3", "r4"].map((id) => (drawn.find((l) => l.includes(`${id}-a`)) ?? "").indexOf(`${id}-a`));
    expect(new Set(starts).size, "one axis, whatever each row's marker").toBe(1);

    // Row 3's other half: nothing drops, `detail: []` → the mark alone, no `+0`.
    // A neighbour with detail makes the table reserve three cells, so `+0` would
    // fit — the count is absent because nothing is hidden, not because the
    // column is narrow.
    const open = lines(table([row("r5", { detail: [] }), row("r6"), row("r7", { detail: [note("n7")] })]), 80);
    expect((open.find((l) => l.includes("r5-a")) ?? "").slice(0, 4)).toBe("▹   ");
    expect((open.find((l) => l.includes("r6-a")) ?? "").slice(0, 4), "row 8: not expandable, blank").toBe("    ");
    expect((open.find((l) => l.includes("r7-a")) ?? "").slice(0, 4)).toBe("▹+1 ");

    // Row 11 — ASCII.
    const ascii = measurable({ definitions: [tableDefinition], capabilities: ASCII_CAPS });
    expect((lines(block, 42, ascii).find((l) => l.includes("r1-a")) ?? "").slice(0, 4)).toBe("(+3 ");

    // Row 9 — below the reservation: a two-digit count in a one-cell body. The
    // expand column is the only one admitted and it is truncated (C11 I3), so the
    // count cannot fit — the mark stands alone rather than `▹+1`.
    const many = [EXPAND, ...Array.from({ length: 12 }, (_, i) => col(`k${String(i)}`, 50 - i, 1))];
    const tiny: Table = { kind: "table", id: "m", columns: many, rows: [{ id: "x", cells: {}, detail: [note("n")] }] };
    const cut = lines(tiny, 3);
    const markRow = cut.find((l) => l.startsWith("▹")) ?? "";
    expect(markRow.trimEnd(), "the mark, never a cut count").toBe("▹");
  });

  it("T3.23 (C11 I32): a window without the detail rows plans as its table does", () => {
    const registry = measurable({ definitions: [tableDefinition] });
    // Only the first row carries detail; the window below starts after it.
    const rows = [row("r0", { detail: [note("n0"), note("m0")] }), ...Array.from({ length: 6 }, (_, i) => row(`r${String(i + 1)}`))];
    const block = table(rows);
    const whole = registry.renderToLines(block, 80).map((l) => visible(l));
    const windowed = tableDefinition.window?.(block, 80, 4, 7, () => 1);
    expect(windowed, "the table windows").toBeDefined();
    const slice = windowed?.block as Table;
    expect(slice.rows.some((r) => r.detail !== undefined), "the slice holds no detail row").toBe(false);
    const drawn = registry.renderToLines(slice, 80).map((l) => visible(l));
    for (const id of ["r3", "r4", "r5"]) {
      const a = whole.find((l) => l.includes(`${id}-a`)) ?? "";
      const b = drawn.find((l) => l.includes(`${id}-a`)) ?? "";
      expect(b, `${id} starts every column where the whole table does`).toBe(a);
    }
  });
});
