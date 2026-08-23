// **A REPO test, and it exists because three package tests could not be one.**
//
// See `banner.test.ts` for what `test/repo/` means. The reason is the same and
// the case is sharper: these three rows lived in `dashboard.test.ts` asserting
// against `bar()`, the app's own run-drawing function — and `bar()` stopped
// being drawn when `Cell.bar` landed. They went on passing six assertions about
// a function no frame reached, for a commit, in a file whose own header says
// *assertions read the rendered output, never the arithmetic the code used*
// (FINDINGS F174).
//
// **The package cannot render a block to lines**, which is why they were written
// that way — `@fmx/calcium` publishes `createTui` and the builders and no
// block-to-lines renderer, so the honest place for a frame assertion about an
// example is here.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { cells } from "@fmx/calcium";
import type { Block, Panel, Table } from "@fmx/calcium";
import { parseNdjson } from "../../src/ndjson.ts";
import { COLUMNS, isLive, join, livePanelBody, percent } from "../../src/dashboard.ts";
import type { Joined, Snapshot } from "../../src/dashboard.ts";
import { measurable } from "../../../../test/support/render.ts";
import { tableDefinition } from "../../../../src/presentation/table/index.ts";

const read = (name: string): string =>
  readFileSync(new URL(`../corpus/${name}`, import.meta.url), "utf8");

const SNAP: Snapshot = {
  containers: parseNdjson(read("ps-all-real.ndjson")).rows,
  stats: parseNdjson(read("stats-real.ndjson")).rows,
  skipped: 0,
};

/** The `table` inside a panel or group body — `dashboard.test.ts`'s own walk. */
function find(from: Block, kind: string): Block | undefined {
  if (from.kind === kind) return from;
  if (from.kind === "panel" || from.kind === "group") {
    for (const child of (from as Panel).children) {
      const inner = find(child, kind);
      if (inner !== undefined) return inner;
    }
  }
  return undefined;
}

function tableIn(block: Block): Table {
  const table = find(block, "table");
  if (table === undefined) throw new Error(`no table inside a ${block.kind}`);
  return table as Table;
}

/**
 * The CPU column, rendered — every row of the live panel at a given width.
 *
 * **`table` is not a C09 default** (C11 registers it), so the kit is handed the
 * definition. A kit without it renders the block as `raw` and still produces
 * lines, which is the option that could have been inert.
 */
function cpuCells(rows: readonly Joined[], width: number): readonly string[] {
  const kit = measurable({ definitions: [tableDefinition as never] });
  const table = tableIn(livePanelBody(rows));
  const lines = kit.renderToLines(table, width);
  // eslint-disable-next-line no-control-regex
  const visible = lines.map((l) => l.replace(/\[[0-9;]*m/gu, ""));
  const header = visible.findIndex((l) => l.includes("CPU"));
  const start = visible[header]?.indexOf("CPU") ?? -1;
  expect(start, "the CPU column must be on screen at this width").toBeGreaterThanOrEqual(0);
  return visible.slice(header + 1).map((l) => l.slice(start, start + cpuWidth()));
}

function cpuWidth(): number {
  const col = COLUMNS.find((c) => c.key === "cpu");
  expect(col, "the dashboard must declare a CPU column").toBeDefined();
  return col!.minWidth;
}

describe("the CPU cell, read from the frame", () => {
  const live = join(SNAP).filter(isLive);

  it("A2 (C04 I51, F174): an absent reading draws a mark, never an empty run", () => {
    // The claim `bar(null).text.trim() === "—"` used to make, asked of the
    // frame instead. An empty run reads as *zero*, and zero is a fact about the
    // container where absence is the absence of one.
    const stopped = join(SNAP).filter((c) => !isLive(c));
    expect(stopped.length).toBeGreaterThan(0);
    for (const c of stopped) expect(c.cpu, c.name).toBeNull();

    const withAbsent: readonly Joined[] = [{ ...live[0]!, cpu: null, name: "absent-cpu" }];
    const [row] = cpuCells(withAbsent, 120);
    expect(row).toBeDefined();
    expect(row).toContain("—");
    expect(row, "an absent bar must not draw the empty glyph").not.toContain("░");
  });

  it("A4 (C09 I28, F174): 780% fills the run and the number keeps counting", () => {
    // Clamping renders a busy container identically to a saturated one, which
    // is the defect `progress` had. Measured in the cell rather than in a
    // function the cell does not call.
    expect(percent("780.00%")).toBe(780);

    const hot: readonly Joined[] = [{ ...live[0]!, cpu: 780, name: "hot" }];
    const [row] = cpuCells(hot, 120);
    expect(row).toContain("780.0%");
    expect(row, "the number must not be clamped with the fill").not.toContain("100.0%");
    expect(row, "the run is full at the ceiling").toContain("█");
  });

  it("C4 (F174): the widest value walk A4 permits is not elided", () => {
    // **Deliberately not the arithmetic.** The row this replaces compared
    // `minWidth` against a string the same module padded *to* `CPU_WIDTH`, so
    // both sides moved together and removing the glyph slot failed nothing —
    // step 1's `STATUS` defect, made again in the file documenting it. The
    // rendered cell has no such symmetry.
    const widest: readonly Joined[] = [{ ...live[0]!, cpu: 999.9, name: "widest" }];
    const [row] = cpuCells(widest, 120);
    expect(row).toContain("999.9%");
    expect(row, "the cell must not truncate its own number").not.toContain("…");
    expect(cells(row!.trimEnd())).toBeLessThanOrEqual(cpuWidth());
  });
});
