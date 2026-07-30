// C11 tier 2 — the interface, over a fuzz corpus and the generic suite.
//
// The properties here are the ones a caller may rely on without reading the
// implementation: total, pure, cacheless, and registered rather than privileged.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { planColumns, tableDefinition } from "../../src/presentation/table/index.js";
import { psColumns, psTable, TABLE_CORPUS } from "../support/blocks.js";
import { measurable, registry as bareRegistry } from "../support/render.js";
import {
  checkMeasurement,
  DEFAULT_WIDTHS,
  formatReport,
} from "../support/measurement-conformance.js";
import type { ColumnDef, Table } from "../../src/data/viewmodel/index.js";

/** The corner cases a planner has to survive rather than reject (T2.1). */
const FUZZ: readonly (readonly ColumnDef[])[] = Object.freeze([
  [],
  psColumns().slice(0, 1),
  psColumns(),
  // Fifty columns, all the same priority — T3.3's tie rule at scale.
  Array.from({ length: 50 }, (_, i) => ({
    key: `c${String(i)}`,
    label: `c${String(i)}`,
    align: "left" as const,
    priority: 5,
    minWidth: 4,
    sortable: false,
  })),
  // Duplicate priorities interleaved with distinct ones.
  psColumns().map((c) => ({ ...c, priority: c.priority % 20 })),
  // A contradictory pair: minWidth above maxWidth (T3.4).
  [{ key: "x", label: "x", align: "left" as const, priority: 1, minWidth: 20, maxWidth: 4, flex: true, sortable: false }],
  // Values a schema forbids and a boundary may still hand over.
  [{ key: "n", label: "n", align: "left" as const, priority: Number.NaN, minWidth: Number.NaN, sortable: false }],
  [{ key: "f", label: "f", align: "left" as const, priority: 1, minWidth: 3.7, maxWidth: 9.2, flex: true, sortable: false }],
  [{ key: "neg", label: "neg", align: "left" as const, priority: -5, minWidth: -3, sortable: false }],
]);

const WIDTHS: readonly number[] = Object.freeze([
  ...DEFAULT_WIDTHS,
  0,
  1,
  -1,
  -1000,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  7,
  19,
]);

describe("C11 tier 2 — planColumns as an interface", () => {
  it("T2.1 (I7): every corpus entry at every width returns a plan and never throws", () => {
    for (const columns of FUZZ) {
      for (const width of WIDTHS) {
        const plan = planColumns(columns, width);
        expect(Array.isArray(plan.visible)).toBe(true);
        expect(Array.isArray(plan.dropped)).toBe(true);
        expect(plan.gap).toBe(2);
        // Every declared column is accounted for exactly once: kept or dropped.
        const seen = [...plan.visible.map((v) => v.key), ...plan.dropped];
        expect(seen.length, `${String(columns.length)} columns at ${String(width)}`).toBe(columns.length); // cells-ok
        // And at least one survives whenever there was one to keep (I3).
        if (columns.length > 0) expect(plan.visible.length).toBeGreaterThan(0); // cells-ok
      }
    }
  });

  it("T2.2 (I6): no plan holds a negative or fractional width", () => {
    for (const columns of FUZZ) {
      for (const width of WIDTHS) {
        for (const planned of planColumns(columns, width).visible) {
          expect(Number.isInteger(planned.width), `${planned.key} at ${String(width)}`).toBe(true);
          expect(planned.width).toBeGreaterThan(0);
        }
      }
    }
  });

  it("T2.3 (I9): the generic measurement suite passes at all seven widths, flat and expanded", () => {
    const r = measurable({ definitions: [tableDefinition] });
    const report = checkMeasurement(r, TABLE_CORPUS);
    expect(report.failures, formatReport(report)).toEqual([]);

    // Every expansion combination on a five-row fixture — 32 tables, each measured
    // at seven widths. The combination is what catches an arithmetic error that
    // cancels out on a single expanded row.
    const combinations: Table[] = [];
    for (let mask = 0; mask < 32; mask += 1) {
      const expanded = [1, 2, 3, 4, 5].filter((n) => (mask & (1 << (n - 1))) !== 0);
      combinations.push(psTable({ id: `mask-${String(mask)}`, rows: 5, expanded, detail: true }));
    }
    const combined = checkMeasurement(r, combinations);
    expect(combined.failures, formatReport(combined)).toEqual([]);
  });

  it("T2.4 (I2): a dropped column's key reaches every row's expanded detail", () => {
    const r = measurable({ definitions: [tableDefinition] });
    const columns = psColumns();

    for (const width of [60, 80, 100]) {
      const dropped = planColumns(columns, width).dropped;
      expect(dropped.length, `nothing drops at ${String(width)}`).toBeGreaterThan(0); // cells-ok

      const block = psTable({ rows: 3, expanded: [1, 2, 3] });
      const lines = r.renderToLines(block, width);

      for (const key of dropped) {
        const label = columns.find((c) => c.key === key)?.label ?? key;
        // Once per row, not merely somewhere in the frame — "every row's expanded
        // detail" is the claim, and a single shared block would satisfy a weaker
        // assertion while leaving two rows' fields unreachable.
        const hits = lines.filter((line) => line.includes(label)).length; // cells-ok
        expect(hits, `${label} appears ${String(hits)} times at ${String(width)}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("T2.8 (I2, the gap): rows declaring no detail become expandable when columns drop", () => {
    const r = measurable({ definitions: [tableDefinition] });
    // No row declares `detail`, and at 80 three columns drop. Without the derived
    // expandability those three fields are unreachable at this width — which is
    // exactly what D38 exists to prevent.
    const block = psTable({ rows: 3, expanded: [1, 2, 3], detail: false });
    expect(block.rows.every((row) => row.detail === undefined)).toBe(true);

    const plan = planColumns(psColumns(), 80);
    expect(plan.dropped).toEqual(["spark", "kind", "owner", "mr"]);

    const lines = r.renderToLines(block, 80);
    for (const key of plan.dropped) {
      expect(lines.filter((line) => line.includes(key)).length).toBeGreaterThanOrEqual(3); // cells-ok
    }
    // And the marker says so: every row is expandable, so every row draws one.
    expect(r.renderToLines(psTable({ rows: 3 }), 80).slice(1).every((l) => l.includes("▸"))).toBe(true);
  });

  it("T2.5 (I16): `table` is registered through the public register, with no built-in fallback", () => {
    // Removing the registration removes the kind. A registry without it renders a
    // table as `raw` — C09 §2's fallback for an unregistered kind — rather than
    // finding a privileged built-in.
    const bare = bareRegistry();
    expect(bare.kinds).not.toContain("table");
    expect(bare.get("table")).toBeUndefined();

    const registered = bareRegistry([tableDefinition]);
    expect(registered.kinds).toContain("table");
    expect(registered.get("table")).toBe(tableDefinition);

    // The two disagree about the frame, which is what makes the registration
    // load-bearing rather than decorative.
    const block = psTable({ rows: 2 });
    const withIt = measurable({ definitions: [tableDefinition] }).renderToLines(block, 100);
    const withoutIt = measurable({}).renderToLines(block, 100);
    expect(withIt.join("\n")).not.toBe(withoutIt.join("\n"));
    expect(withoutIt.join("\n")).toContain('"kind":"table"');
  });

  it("T2.6 (I11): no mutable module state in table/", () => {
    // A03 SS24 is the scan; this is the assertion the scan serves, and it runs over
    // the real directory rather than a fabricated file.
    const dir = "src/presentation/table";
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThanOrEqual(4); // cells-ok

    for (const file of files) {
      const path = join(dir, file);
      expect(statSync(path).isFile()).toBe(true);
      const source = readFileSync(path, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*/g, "");
      // `let` and `var` at the top level of a module are the state SS24 forbids.
      // Inside a function body they are ordinary locals, so the pattern is anchored
      // to the start of a line.
      expect(source, `${path} holds module state`).not.toMatch(/^(?:let|var)\s/m);
      expect(source, `${path} mutates an exported binding`).not.toMatch(/^export\s+let\s/m);
    }
  });

  it("T2.7 (I7, I11): planColumns holds no cache — equal results, never the same object", () => {
    for (const columns of FUZZ) {
      for (const width of [80, 120]) {
        const first = planColumns(columns, width);
        const second = planColumns(columns, width);
        expect(second).toEqual(first);
        // Deeply equal and distinct. A memo on `(columns, width)` returns the same
        // object and fails here, which is the point: it is a decision to revisit
        // deliberately rather than one to drift into (C11 §2, T6.15).
        expect(second).not.toBe(first);
        expect(second.visible).not.toBe(first.visible);
      }
    }
  });

  it("T2.9 (I15): the plan is identical with and without role: \"expand\"", () => {
    const withRole = psColumns();
    const without = withRole.map((c) => {
      const { role: _role, ...rest } = c;
      return rest;
    });
    expect(withRole.some((c) => c.role === "expand")).toBe(true);

    for (const width of WIDTHS) {
      expect(planColumns(without, width), `at ${String(width)}`).toEqual(planColumns(withRole, width));
    }
  });
});
