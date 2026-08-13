// C11 tier 4 — the planner against the S-series, and the table inside C09.
//
// **A03 CP6**: "Every stated column drop order equals `planColumns`' output". The
// drop tables were verified against an independent implementation of the planner
// during specification, so a disagreement here locates a defect on one side or the
// other — and both sides are read from the spec rather than restated, so neither
// can quietly agree with itself.
import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { tableElements, planColumns, tableDefinition } from "../../src/presentation/table/index.js";
import {
  surfaceColumns,
  surfaceDrops,
  type SurfaceColumn,
} from "../support/surfaces.js";
import { DARK_THEME, FULL_CAPS, measurable, visible } from "../support/render.js";
import { checkMeasurement, formatReport, uncoveredKinds } from "../../src/testing/measurement-conformance.js";
import { TABLE_CORPUS, psColumns, psTable } from "../support/blocks.js";
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

/**
 * Every S-series column table, **discovered rather than listed**.
 *
 * The list was four entries written by hand, against twelve declared column
 * tables — so eight surfaces' priorities and minimums had never been under
 * width pressure, which is the only thing that checks them. Raising S02's
 * `detail` minimum from 16 to 60 failed nothing, because the composition test
 * asserts height and a minimum bites only when columns compete.
 *
 * **The allow-list rule, and the fifth time this project has taken it**: a
 * check covers the directory and names its exceptions, because a hand-written
 * list stops seeing what is added after it. A column table declared tomorrow is
 * under pressure tomorrow.
 *
 * The pairing is positional — column table *i* against drop column *i + 1* —
 * which is the convention S06 already uses for its two.
 */
const SURFACE_DIR = "docs/surfaces";

function discovered(): readonly { file: string; label: string; table: number; drops: number }[] {
  const out: { file: string; label: string; table: number; drops: number }[] = [];
  for (const name of readdirSync(SURFACE_DIR).filter((f) => /^S\d\d_.*\.md$/.test(f)).sort()) {
    const file = `${SURFACE_DIR}/${name}`;
    surfaceColumns(file).forEach((_columns, table) => {
      out.push({ file, label: `${name.slice(0, 3)} table ${String(table)}`, table, drops: table + 1 });
    });
  }
  return out;
}

const DISCOVERED = discovered();

/**
 * Column tables with no drop declaration to check them against.
 *
 * **Named, not skipped.** Each is a surface stating priorities and minimums and
 * never stating what they do under pressure, so the numbers are prose. Listed by
 * equality below, so a fifth cannot join them quietly and a fixed one cannot
 * stay listed.
 */
const NO_DROP_TABLE = [
  // S02 §6 states its drop order in prose — "Recent's `age` column drops first,
  // then `status`" — and its only `| Width |` table is about the logo.
  "S02 table 0",
  "S02 table 1",
  // The pods sub-table, added with no drop order of its own.
  "S05 table 1",
  // §7's `| Width |` table arranges panels, not columns.
  "S13 table 0",
  // S14 declares no `| Width |` table at all.
  "S14 table 0",
  "S14 table 1",
  // **§5 says outright that it never drops a column** — it sums to 45 cells and
  // the shell's minimum is 60 — so there is nothing to state and nothing to
  // compare. The one entry here that is finished rather than missing.
  "S15 table 0",
] as const;

/**
 * Declarations whose stated order and `planColumns` disagree.
 *
 * **Three looked like disagreements and were one fixture defect** — S02 at 80
 * "dropping" `▲ prism v1.0.0`, S13 and S15 dropping columns their tables never
 * mention. `surfaceDrops` called any `| Width |` table a drop table.
 *
 * **The one that is real arrived when S09 became readable**, which is CP6 doing
 * what it exists for on the first table it had never been pointed at.
 */
const UNRESOLVED = [
  // §7 says `duration` drops below 80. Its three columns are `glyph` 1, `name`
  // 30 and `duration` 6 — 37 cells plus two gaps — so `planColumns` keeps all
  // three at 79 and drops nothing until roughly half that width.
  //
  // **The stated number is about double the threshold the declarations
  // produce**, and which side is wrong is a ruling: either `name`'s minimum of
  // 30 is too small for a test name that truncates from the start, or 80 was
  // written about the terminal rather than about the table. Guessing here would
  // be writing the expectation from the output, which is the one thing CP6
  // exists to prevent.
  "S09 table 0",
] as const;

const EXCLUDED: readonly string[] = [...NO_DROP_TABLE, ...UNRESOLVED];

const SURFACES = DISCOVERED.filter((s) => !EXCLUDED.includes(s.label));

describe("C11 tier 4 — the planner against the surfaces", () => {
  it("T4.1b (CP6): every declared column table is checked, or named as unchecked", () => {
    // The vacuity guard for the discovery itself. A `discovered()` that found
    // nothing would make the whole suite pass by iterating an empty list — the
    // same shape as a parser that reads no columns, one layer further out.
    expect(DISCOVERED.length, "no column tables discovered").toBeGreaterThanOrEqual(12);
    // **Four, and that number is the finding.** Deriving the list did not widen
    // coverage: it showed that eight of the twelve declared column tables have
    // no drop order anything can read. Two state it in prose (S02, S09), one
    // states outright that it never drops (S15), one's `| Width |` table is
    // about panels (S13), one has no such table (S14, twice), and two are
    // sub-tables added without one (S02's Recent, S05's pods). The four that
    // were hand-listed were hand-listed because they were the four that worked.
    expect(SURFACES.length, "everything was excluded").toBeGreaterThanOrEqual(4);

    // The two exclusion lists are different findings and are kept apart: one is
    // a surface that never stated a drop order, the other a surface whose
    // stated order and the planner disagree. Collapsing them would let a defect
    // hide among the gaps.
    expect(new Set(EXCLUDED).size, "a label on both lists").toBe(EXCLUDED.length);

    // Equality, not superset: a new column table with no drop order fails here
    // rather than being silently unchecked, and a gap that gets filled cannot
    // stay on the list.
    const unpaired = DISCOVERED.filter((s) => surfaceDrops(s.file, s.drops).length === 0).map(
      (s) => s.label,
    );
    expect(unpaired.sort()).toEqual([...NO_DROP_TABLE].sort());
    // Equality, so a second cannot join quietly and a ruled one cannot stay.
    expect([...UNRESOLVED].sort()).toEqual(["S09 table 0"]);
  });

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
        // **Two, not six.** The floor was written when this suite covered four
        // hand-listed surfaces whose tables all had twelve-ish columns, and it
        // is a property of those four rather than of a column table: S02's
        // Outstanding has two, S09's has three. A vacuity guard that excludes
        // real subjects is a narrower rule wearing a guard's clothes.
        expect(parsed.length, "no column table parsed").toBeGreaterThanOrEqual(2);
        // Two, for the same reason: three was the smallest of the original
        // four. Two is the floor at which a drop table can say anything — one
        // width where nothing drops and one where something does — and the
        // assertion below is what checks it actually does.
        expect(stated.length, "no drop table parsed").toBeGreaterThanOrEqual(2);
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

  // The seam, and the deferral that named it expired on the commit that made
  // `src/presentation/plot/definition.ts` exist — which is TD0 doing exactly what
  // it is for, one commit after the note above predicted it.
  it("T4.4 (with C12): a cell's `spark` renders inline and adds no rows", () => {
    const registry = measurable({
      definitions: [tableDefinition, plotDefinition],
      capabilities: FULL_CAPS,
    });
    const table = psTable({ id: "spark", rows: 3 });

    // The series is rendered, not ignored. `psTable`'s `spark` cells carry values
    // and no text, so a renderer that read `cell.text` and stopped would produce a
    // blank column and pass every row-count assertion in this file.
    const drawn = registry.renderToLines(table, 160);
    expect(drawn.join("\n")).toMatch(/[▁▂▃▄▅▆▇█]/u);

    // And it costs nothing in height: a spark is one row of exactly its planned
    // width (C12 I13), which is what makes `planColumns` indifferent to it.
    expect(registry.measure(table, 160)).toBe(1 + 3);
    expect(drawn).toHaveLength(1 + 3);
  });

  it("T4.4 (with C12): the spark column is exactly its planned width", () => {
    // Eight cells declared, eight glyphs drawn — one per sample, because a
    // sparkline is not braille and has no subcell resolution to spend (C12 §3).
    // A ninth glyph would push every column after it one cell right of its header.
    const registry = measurable({
      definitions: [tableDefinition, plotDefinition],
      capabilities: FULL_CAPS,
    });
    const table = psTable({ id: "spark-width", rows: 1 });
    const row = visible(registry.renderToLines(table, 160)[1] ?? "");
    const run = /[▁▂▃▄▅▆▇█]+/u.exec(row);

    expect(run).not.toBeNull();
    expect([...(run?.[0] ?? "")]).toHaveLength(8);
  });

  it("T4.6 (I14): focusableRowIds matches the rendered rows in order", () => {
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

    const ids = tableElements(block, 120, registry.measure).map((e) => e.id);
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
