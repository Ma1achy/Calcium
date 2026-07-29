// C11 tier 4 — the planner against the S-series, and the table inside C09.
//
// **A03 CP6**: "Every stated column drop order equals `planColumns`' output". The
// drop tables were verified against an independent implementation of the planner
// during specification, so a disagreement here locates a defect on one side or the
// other — and both sides are read from the spec rather than restated, so neither
// can quietly agree with itself.
import { describe, expect, it } from "vitest";
import { focusableRowIds, planColumns, tableDefinition } from "../../src/presentation/table/index.js";
import {
  surfaceColumns,
  surfaceDrops,
  type SurfaceColumn,
} from "../support/surfaces.js";
import { DARK_THEME, FULL_CAPS, measurable } from "../support/render.js";
import { checkMeasurement, formatReport, uncoveredKinds } from "../support/measurement-conformance.js";
import { TABLE_CORPUS, psColumns } from "../support/blocks.js";
import type { ColumnDef, Table } from "../../src/data/viewmodel/index.js";

function defs(columns: readonly SurfaceColumn[]): readonly ColumnDef[] {
  return columns.map((c) => ({
    key: c.key,
    label: c.key,
    align: c.align,
    priority: c.priority,
    minWidth: c.minWidth,
    flex: c.flex,
    sortable: c.sortable,
  }));
}

/** Σ visible widths + gaps — computed here, never from the planner's own helper. */
function occupied(plan: ReturnType<typeof planColumns>): number {
  const widths = plan.visible.map((v) => v.width);
  if (widths.length === 0) return 0; // cells-ok
  return widths.reduce((a, b) => a + b, 0) + (widths.length - 1) * plan.gap; // cells-ok
}

const SURFACES = [
  { file: "docs/surfaces/S03_ps_list.md", label: "S03 ps list", table: 0, drops: 1 },
  { file: "docs/surfaces/S05_serving.md", label: "S05 serving", table: 0, drops: 1 },
  { file: "docs/surfaces/S06_models.md", label: "S06 models · families", table: 0, drops: 1 },
  { file: "docs/surfaces/S06_models.md", label: "S06 models · versions", table: 1, drops: 2 },
] as const;

describe("C11 tier 4 — the planner against the surfaces", () => {
  for (const surface of SURFACES) {
    describe(surface.label, () => {
      const parsed = surfaceColumns(surface.file)[surface.table] ?? [];
      const stated = surfaceDrops(surface.file, surface.drops);

      it("T4.1 (CP6): every field of the column table was read, not just the ones that move a drop", () => {
        // **The parser's own vacuity, and it was live.** `surfaceColumns` read by
        // position, so declaring `Align` shifted `Flex` one right in five files and
        // every flex column silently became false. Nothing failed: flex changes
        // widths, not which columns drop, so the drop-order assertions below all
        // still passed. A positional reader is a fixture that agrees with itself.
        //
        // So each field is asserted to have arrived, per surface, against something
        // only that field can produce.
        expect(parsed.some((c) => c.flex), "no flex column parsed").toBe(true);
        expect(parsed.every((c) => c.align === "left" || c.align === "right")).toBe(true);
        expect(parsed.every((c) => c.truncateFrom === "start" || c.truncateFrom === "end")).toBe(true);
        expect(parsed.every((c) => c.priority > 0), "a priority read as NaN or zero").toBe(true);
        expect(parsed.every((c) => c.minWidth >= 1)).toBe(true);
      });

      it("T4.1 (CP6): the spec's tables were read, not assumed", () => {
        // The vacuity guard. A parser that found nothing would make every
        // assertion below pass having compared two empty sets — test/support's
        // rule about a helper being vacuous in its *answer* rather than in its
        // parameters, one layer out.
        expect(parsed.length, "no column table parsed").toBeGreaterThanOrEqual(6);
        expect(stated.length, "no drop table parsed").toBeGreaterThanOrEqual(3);
        expect(
          stated.some((s) => s.dropped.length > 0),
          "every stated width drops nothing, so the comparison asserts nothing",
        ).toBe(true);
        for (const column of parsed) {
          expect(column.key, `a column parsed with no key in ${surface.file}`).not.toBe("");
          expect(Number.isInteger(column.minWidth)).toBe(true);
          expect(Number.isInteger(column.priority)).toBe(true);
        }
      });

      it("T4.1 (CP6): planColumns drops exactly what the surface states", () => {
        const columns = defs(parsed);
        for (const { width, dropped } of stated) {
          const plan = planColumns(columns, width);
          expect(
            [...plan.dropped].sort(),
            `${surface.label} at ${String(width)}: stated ${JSON.stringify(dropped)}, ` +
              `planned ${JSON.stringify(plan.dropped)}`,
          ).toEqual([...dropped].sort());
        }
      });

      it("T4.1 (I4): the surviving columns stay in declared order at every stated width", () => {
        const columns = defs(parsed);
        const order = parsed.map((c) => c.key);
        for (const { width } of stated) {
          const plan = planColumns(columns, width);
          const seen = plan.visible.map((v) => v.key);
          const expected = order.filter((k) => seen.includes(k));
          expect(seen, `${surface.label} at ${String(width)}`).toEqual(expected);
        }
      });

      it("T4.1 (I5): the plan fits the width at every stated width", () => {
        const columns = defs(parsed);
        for (const { width } of stated) {
          const plan = planColumns(columns, width);
          expect(plan.overflowed, `${surface.label} at ${String(width)} overflowed`).toBe(false);
          expect(occupied(plan), `${surface.label} at ${String(width)}`).toBeLessThanOrEqual(width);
        }
      });
    });
  }

  it("T4.1 (CP6): the comparison fires — a wrong stated set fails", () => {
    // A03 commitment 14 one layer out: the check above is only worth having if it
    // can be shown to fail. `mr` is S03's lowest priority and drops first, so a
    // table claiming nothing drops at 80 is a claim the planner refutes.
    const columns = defs(surfaceColumns("docs/surfaces/S03_ps_list.md")[0] ?? []);
    expect(planColumns(columns, 80).dropped).not.toEqual([]);
  });
});

describe("C11 tier 4 — the table inside C09", () => {
  it("T4.1: registration, measurement and rendering behave as a built-in under the generic suite", () => {
    const registry = measurable({ definitions: [tableDefinition] });
    const report = checkMeasurement(registry, TABLE_CORPUS);
    expect(report.failures, formatReport(report)).toEqual([]);
    // The corpus here is table-only, so the fourteen defaults are legitimately
    // uncovered; what must not be uncovered is the kind this suite is about. A
    // corpus that had stopped containing a table would otherwise pass having
    // measured nothing — the vacuity C09's own suite guards with the same call.
    expect(uncoveredKinds(registry, TABLE_CORPUS)).not.toContain("table");
    expect(report.kindsCovered).toContain("table");
    expect(registry.kinds).toContain("table");
  });

  it("T4.3 (with C10): the same table in both themes has identical geometry", () => {
    const dark = measurable({ definitions: [tableDefinition] });
    const light = measurable({ definitions: [tableDefinition], theme: DARK_THEME });
    for (const block of TABLE_CORPUS) {
      for (const width of [80, 100, 120, 160]) {
        expect(dark.measure(block, width)).toBe(light.measure(block, width));
        expect(dark.renderToLines(block, width).length).toBe(
          light.renderToLines(block, width).length,
        ); // cells-ok
      }
    }
  });

  // `Cell.spark` is in C04's type and C11 renders nothing for it: an inline
  // sparkline is C12's rasterisation (C12 §1, and its `Consumed by` names table
  // cells), and a second implementation here is what C09 I6 forbids one directory
  // over. So the cell renders its text and the series is unread — visible in S03
  // §2, whose figure draws `0.0372` where the mockup drew `0.0372 ▁▂▃▅▆`.
  //
  // Deferred with a blocker rather than left as a comment, because a gap nothing
  // reports is a gap nobody finds: the seam is C11 calling C12's sparkline for a
  // cell's `spark`, same layer and acyclic, and it changes this component.
  it.todo("T4.4: a cell's `spark` renders inline and adds no rows — waits on C12");

  it("T4.6 (I15): focusableRowIds matches the rendered rows in order", () => {
    const registry = measurable({ definitions: [tableDefinition], capabilities: FULL_CAPS });
    const block: Table = {
      kind: "table",
      id: "t",
      columns: psColumns(),
      rows: [
        { id: "r1", cells: { uuid: { text: "a3f9b21" }, age: { text: "2h" } } },
        { id: "r2", cells: { uuid: { text: "7c2d4e1" }, age: { text: "12m" } } },
        { id: "r3", cells: { uuid: { text: "2e8a04c" }, age: { text: "45s" } } },
      ],
      sort: { key: "age", direction: "asc" },
    };

    const ids = focusableRowIds(block);
    const lines = registry.renderToLines(block, 120).slice(1);
    // The rendered rows carry their uuid, so the order on screen is readable from
    // the frame rather than from the fixture — which is what makes this an
    // assertion about the rendering and not about the sort.
    const drawn = lines
      .map((line) => /a3f9b21|7c2d4e1|2e8a04c/.exec(line)?.[0])
      .filter((u): u is string => u !== undefined);

    expect(ids).toEqual(["r3", "r2", "r1"]);
    expect(drawn).toEqual(["2e8a04c", "7c2d4e1", "a3f9b21"]);
  });
});
