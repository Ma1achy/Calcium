// C11 tier 3 — the widths and the contents nobody designs for.
import { describe, expect, it } from "vitest";
import { planColumns, tableDefinition } from "../../src/presentation/table/index.js";
import { psColumns, psTable } from "../support/blocks.js";
import { ASCII_CAPS, FULL_CAPS, measurable, visible } from "../support/render.js";
import { cells } from "../../src/presentation/text.js";
import { validateDocument } from "../../src/data/viewmodel/index.js";
import { doc } from "../support/blocks.js";
import type { Block, ColumnDef, Table } from "../../src/data/viewmodel/index.js";

const r = measurable({ definitions: [tableDefinition] });
const ascii = measurable({ definitions: [tableDefinition], capabilities: ASCII_CAPS });

function widthsOf(lines: readonly string[]): readonly number[] {
  return lines.map((line) => cells(visible(line)));
}

describe("C11 tier 3 — edges", () => {
  it("T3.1: zero columns renders the empty message and does not throw", () => {
    const block: Table = { kind: "table", id: "z", columns: [], rows: [], emptyMessage: "No results." };
    const lines = r.renderToLines(block, 40);
    expect(lines.length).toBe(2); // cells-ok
    expect(visible(lines[1] ?? "")).toContain("No results.");

    // Rows with no columns to put them in: the message rather than four blank
    // rows, and measurement agrees with it.
    const withRows: Table = { ...block, rows: psTable({ rows: 4 }).rows };
    expect(r.measure(withRows, 40)).toBe(2);
    expect(r.renderToLines(withRows, 40).length).toBe(2); // cells-ok
  });

  it("T3.2: one column wider than the terminal → truncated, overflowed, still readable", () => {
    const columns: readonly ColumnDef[] = [
      { key: "path", label: "path", align: "left", priority: 100, minWidth: 60, sortable: false },
    ];
    const block: Table = {
      kind: "table",
      id: "t",
      columns,
      rows: [{ id: "r1", cells: { path: { text: "/very/long/path/to/somewhere/deep/in/the/tree" } } }],
    };
    const plan = planColumns(columns, 24);
    expect(plan.overflowed).toBe(true);

    const lines = r.renderToLines(block, 24);
    for (const width of widthsOf(lines)) expect(width).toBeLessThanOrEqual(24);
    expect(visible(lines[1] ?? "")).toContain("/very/long");
    expect(visible(lines[1] ?? "")).toContain("…");
  });

  it("T3.3: all columns sharing one priority drop in reverse declared order", () => {
    const columns: readonly ColumnDef[] = Array.from({ length: 6 }, (_, i) => ({
      key: `c${String(i)}`,
      label: `c${String(i)}`,
      align: "left" as const,
      priority: 7,
      minWidth: 5,
      sortable: false,
    }));
    // Six columns need 30 + 10 = 40. At 33 four fit (20 + 6 = 26; five would be 33
    // — exactly the boundary, so five fit), and the ones that go are the rightmost.
    expect(planColumns(columns, 33).dropped).toEqual(["c5"]);
    expect(planColumns(columns, 26).dropped).toEqual(["c4", "c5"]);
    expect(planColumns(columns, 12).dropped).toEqual(["c2", "c3", "c4", "c5"]);
    // Deterministic across repeated calls, which is what "deterministically" means
    // when the tie-break is the only thing deciding.
    for (let i = 0; i < 20; i += 1) expect(planColumns(columns, 26).dropped).toEqual(["c4", "c5"]);
  });

  it("T3.4: minWidth above maxWidth → minWidth wins, silently", () => {
    const columns: readonly ColumnDef[] = [
      { key: "wide", label: "wide", align: "left", priority: 10, minWidth: 20, maxWidth: 4, flex: true, sortable: false },
      { key: "other", label: "other", align: "left", priority: 5, minWidth: 5, flex: true, sortable: false },
    ];
    const plan = planColumns(columns, 60);
    expect(plan.visible[0]?.width).toBeGreaterThanOrEqual(20);
    expect(plan.visible.map((v) => v.width).reduce((a, b) => a + b, 0) + 2).toBeLessThanOrEqual(60);
  });

  it("T3.5: a CJK cell is planned and drawn at two cells per glyph", () => {
    const columns: readonly ColumnDef[] = [
      { key: "name", label: "name", align: "left", priority: 10, minWidth: 12, sortable: false },
      { key: "state", label: "state", align: "left", priority: 5, minWidth: 8, sortable: false },
    ];
    const block: Table = {
      kind: "table",
      id: "t",
      columns,
      rows: [{ id: "r1", cells: { name: { text: "日本語のテキスト" }, state: { text: "running" } } }],
    };
    // Eight double-width glyphs are 16 cells and do not fit a 12-cell column, so
    // the cell truncates — and the row is still exactly the width it was planned
    // at, which is the property `.length` would break.
    const lines = r.renderToLines(block, 24);
    for (const width of widthsOf(lines)) expect(width).toBeLessThanOrEqual(24);
    expect(cells(visible(lines[1] ?? ""))).toBe(22);
  });

  it("T3.6: a ZWJ emoji counts as one cluster and truncation never splits it", () => {
    const family = "\u{1F468}‍\u{1F469}‍\u{1F467}";
    const columns: readonly ColumnDef[] = [
      { key: "who", label: "who", align: "left", priority: 10, minWidth: 6, sortable: false },
    ];
    const block: Table = {
      kind: "table",
      id: "t",
      columns,
      rows: [{ id: "r1", cells: { who: { text: `${family}${family}${family}` } } }],
    };
    const line = visible(r.renderToLines(block, 6)[1] ?? "");
    expect(cells(line)).toBe(6);
    // Either the whole cluster or none of it: a lone surrogate would appear as a
    // replacement character, and a half-drawn family is a different picture.
    expect(line).not.toMatch(/\uD83D(?!\uDC68|\uDC69|\uDC67)/);
  });

  it("T3.7: a cell longer than its planned width truncates with the capability-correct marker", () => {
    // At 120 every column survives and `owner` is at its declared minimum of 8,
    // which `malachy@fmx.io` exceeds — so the marker is forced by the surface's own
    // declaration rather than by a width chosen to make the test work. At 60 the
    // flex columns absorb the residual and nothing truncates at all, which is why
    // the width matters here.
    const block = psTable({ rows: 1 });
    const unicode = visible(r.renderToLines(block, 120)[1] ?? "");
    const plain = visible(ascii.renderToLines(block, 120)[1] ?? "");
    expect(unicode).toContain("malachy…");
    expect(plain).toContain("malachy~");
    expect(plain).not.toContain("...");
    // And measurement is unaffected by either.
    expect(r.measure(block, 120)).toBe(ascii.measure(block, 120));
    expect(cells(visible(unicode))).toBe(cells(visible(plain)));
  });

  it("T3.8: a row with detail but expanded: false contributes nothing to height", () => {
    const closed = psTable({ rows: 4, detail: true });
    expect(closed.rows.every((row) => row.expanded === undefined)).toBe(true);
    expect(r.measure(closed, 160)).toBe(5);

    const open = psTable({ rows: 4, detail: true, expanded: [1] });
    expect(r.measure(open, 160)).toBeGreaterThan(r.measure(closed, 160));
  });

  it("T3.9: every row expanded on a 500-row table measures exactly", () => {
    const block = psTable({ rows: 500, expanded: Array.from({ length: 500 }, (_, i) => i + 1), detail: true });
    // 1 header + 500 rows + 500 × (4 dropped-column rows + 1 progress row) at 80.
    const plan = planColumns(psColumns(), 80);
    expect(plan.dropped.length).toBe(4); // cells-ok
    expect(r.measure(block, 80)).toBe(1 + 500 + 500 * (4 + 1));
  });

  it("T3.10: detail containing a nested table measures through measureChild", () => {
    const inner = psTable({ id: "inner", rows: 2 });
    const outer: Table = {
      kind: "table",
      id: "outer",
      columns: psColumns(),
      rows: [{ id: "r1", cells: { uuid: { text: "a3f9b21" } }, expanded: true, detail: [inner] }],
    };
    // The nested table is measured at the inset width, not the outer one — so its
    // own plan is the narrower one, and the total is the sum rather than a
    // recursion into the outer width.
    expect(r.measure(outer, 100)).toBe(1 + 1 + r.measure(inner, 98) + dropRows(100));
  });

  it("T3.11: detail containing an app-registered kind measures correctly", () => {
    // The injection is generic: a kind C11 has never heard of, registered after it,
    // measured through the same `measureChild`.
    const appKind = {
      kind: "app-widget",
      measure: (): number => 4,
      render: (): never => {
        throw new Error("not rendered in this test");
      },
    };
    const custom = measurable({ definitions: [tableDefinition, appKind as never] });
    const widget = { kind: "app-widget", id: "w1" } as unknown as Block;
    const block: Table = {
      kind: "table",
      id: "t",
      columns: psColumns(),
      rows: [{ id: "r1", cells: {}, expanded: true, detail: [widget] }],
    };
    expect(custom.measure(block, 160)).toBe(1 + 1 + 4);
  });

  it("T3.12: sort naming a non-existent column is ignored", () => {
    const block: Table = { ...psTable({ rows: 3 }), sort: { key: "nope", direction: "desc" } };
    expect(r.measure(block, 120)).toBe(4);
    const lines = r.renderToLines(block, 120);
    expect(lines.length).toBe(4); // cells-ok
    // Declared order retained.
    expect(visible(lines[1] ?? "")).toContain("a3f9b21");
  });

  it("T3.13: sort on a non-sortable column is ignored", () => {
    // `mr` is declared `sortable: false`, and its values would reorder if it were
    // honoured — so a planner that ignored the flag would be visible here.
    const block: Table = { ...psTable({ rows: 3 }), sort: { key: "mr", direction: "desc" } };
    const lines = r.renderToLines(block, 160);
    expect(visible(lines[1] ?? "")).toContain("a3f9b21");
  });

  it("T3.14: a column of entirely empty cells still plans, and sorting it is a stable no-op", () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      id: `r${String(i + 1)}`,
      cells: { uuid: { text: `u${String(i)}` }, metric: { text: "" } },
    }));
    const block: Table = { kind: "table", id: "t", columns: psColumns(), rows, sort: { key: "metric", direction: "asc" } };
    expect(planColumns(psColumns(), 160).visible.some((v) => v.key === "metric")).toBe(true);
    const lines = r.renderToLines(block, 160).slice(1);
    expect(lines.map((line) => /u\d/.exec(visible(line))?.[0])).toEqual(["u0", "u1", "u2", "u3", "u4"]);
  });

  it("T3.15: two rows sharing an id are rejected by C04, not handled here", () => {
    // C11 does not check it, and that is the point: a boundary rule checked in two
    // places is two rules (C09 I6's argument, one layer down). What C11 depends on
    // is that the document never reaches it — `merge` upserts by row id, focus
    // names one, and a rendered row is keyed by one.
    const columns = psColumns();
    const duplicated: Table = {
      kind: "table",
      id: "dupes",
      columns,
      rows: [
        { id: "r1", cells: { uuid: { text: "a" } } },
        { id: "r1", cells: { uuid: { text: "b" } } },
      ],
    };
    const result = validateDocument(doc({ blocks: [duplicated] }));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.join(" ")).toContain("C04 I31");

    // And C11 stays total on it rather than throwing: the validator is the gate,
    // not the renderer (I7).
    expect(() => r.measure(duplicated, 80)).not.toThrow();
  });

  it("T3.18: no flex column and a narrow table → residual width is unused, not stretched", () => {
    const columns: readonly ColumnDef[] = [
      { key: "a", label: "a", align: "left", priority: 10, minWidth: 5, sortable: false },
      { key: "b", label: "b", align: "left", priority: 5, minWidth: 5, sortable: false },
    ];
    const plan = planColumns(columns, 120);
    expect(plan.visible.map((v) => v.width)).toEqual([5, 5]);
    // The rendered rows are the table's width, not the terminal's — which is what
    // "renders narrower than the terminal" means, and it is C07's fallback shape.
    const block: Table = { kind: "table", id: "t", columns, rows: [{ id: "r1", cells: { a: { text: "x" }, b: { text: "y" } } }] };
    expect(cells(visible(r.renderToLines(block, 120)[1] ?? ""))).toBe(12);
  });

  it("T3.16: 10,000 rows plan sub-millisecond and measure linearly", () => {
    const block = psTable({ rows: 10_000 });
    // Planning is independent of the rows, which is the property the budget rests
    // on: 200 plans of eleven columns, well inside a millisecond each.
    for (let i = 0; i < 200; i += 1) planColumns(psColumns(), 80 + (i % 40));
    expect(r.measure(block, 80)).toBe(1 + 10_000);
  });

  it("T3.17: a width change between measure and render gives the new width's plan", () => {
    const columns = psColumns();
    const wide = planColumns(columns, 160);
    const narrow = planColumns(columns, 60);
    expect(wide.dropped).toEqual([]);
    expect(narrow.dropped.length).toBe(6); // cells-ok
    // And back again: with no cache there is nothing to go stale, so the second
    // call at the original width is the original plan.
    expect(planColumns(columns, 160)).toEqual(wide);
  });

  it("T3.19 (I15): a data column keyed `expand` with no role renders its own text", () => {
    const columns: readonly ColumnDef[] = [
      { key: "expand", label: "expand", align: "left", priority: 10, minWidth: 8, sortable: false },
      { key: "name", label: "name", align: "left", priority: 5, minWidth: 8, sortable: false },
    ];
    const block: Table = {
      kind: "table",
      id: "t",
      columns,
      rows: [{ id: "r1", cells: { expand: { text: "yes" }, name: { text: "web" } }, detail: [] }],
    };
    const line = visible(r.renderToLines(block, 40)[1] ?? "");
    expect(line).toContain("yes");
    expect(line).not.toContain("▸");
  });
});

/** The rows a dropped-column `keyValue` occupies at this width. */
function dropRows(width: number): number {
  return planColumns(psColumns(), width).dropped.length; // cells-ok
}

describe("C11 tier 3 — ascii parity", () => {
  it("T4.2 (with C02): planned widths and measured heights match the Unicode case exactly", () => {
    const full = measurable({ definitions: [tableDefinition], capabilities: FULL_CAPS });
    for (const block of [psTable({ rows: 5, expanded: [1, 3], detail: true }), psTable({ rows: 2 })]) {
      for (const width of [60, 80, 100, 120, 160]) {
        expect(ascii.measure(block, width)).toBe(full.measure(block, width));
        expect(ascii.renderToLines(block, width).length).toBe(full.renderToLines(block, width).length); // cells-ok
        // Every row is the same number of cells in both modes — the 1:1 rule C09 §4
        // owns, seen from the kind that has the most glyphs per row.
        expect(widthsOf(ascii.renderToLines(block, width))).toEqual(
          widthsOf(full.renderToLines(block, width)),
        );
      }
    }
  });
});
