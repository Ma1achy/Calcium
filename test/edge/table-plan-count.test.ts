// C11 T3.24 — a walk plans once per width, and a plan measures no glyph.
//
// **A count, not a clock.** The regression this watches was a 2× on T2.3, and a
// ratio of two timings reads the machine's load as readily as the code — so
// the row counts the operation that multiplied instead: `planDisclosed` calls
// per walk, which scaled with the expanded rows, and `glyphCells` calls per
// plan, which were four. Both are properties of the code at any load.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/presentation/table/plan.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/presentation/table/plan.js")>();
  return { ...actual, planDisclosed: vi.fn(actual.planDisclosed) };
});
vi.mock("../../src/presentation/blocks/glyphs.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/presentation/blocks/glyphs.js")>();
  return { ...actual, glyphCells: vi.fn(actual.glyphCells) };
});

const { planDisclosed } = await import("../../src/presentation/table/plan.js");
const { glyphCells } = await import("../../src/presentation/blocks/glyphs.js");
const { tableDefinition, tableElements } = await import("../../src/presentation/table/index.js");
const { psColumns, psTable } = await import("../support/blocks.js");
const { measurable } = await import("../support/render.js");

const plans = vi.mocked(planDisclosed);
const glyphs = vi.mocked(glyphCells);
const r = measurable({ definitions: [tableDefinition] });
const expandedAll = (n: number) =>
  psTable({ rows: n, expanded: Array.from({ length: n }, (_, i) => i + 1), detail: true });

/** The plans one call makes. */
function counted(call: () => unknown): number {
  plans.mockClear();
  call();
  return plans.mock.calls.length;
}

describe("C11 §3a — the cost of two plans", () => {
  beforeEach(() => {
    plans.mockClear();
    glyphs.mockClear();
  });

  it("T3.24 (C11 I32): planDisclosed calls per walk are independent of the rows, and a plan calls no glyphCells", () => {
    const five = expandedAll(5);
    const fifty = expandedAll(50);
    // The subject exists: every row expanded, so every row asks for its detail.
    expect(fifty.rows.every((row) => row.expanded === true && (row.detail?.length ?? 0) > 0)).toBe(true);

    // **`measure`: one plan, at either count.** A plan per expanded row was 5 and 50.
    // **`measure`: one plan, at either count.** A plan per expanded row was 5 and 50.
    // The definition's own, because the registry around it asks other readers too.
    const measureAt = (t: typeof five) => () => tableDefinition.measure(t, 80, () => 1);
    expect(counted(measureAt(five)), "measure, 5 rows").toBe(1);
    expect(counted(measureAt(fifty)), "measure, 50 rows").toBe(1);
    expect(counted(() => r.measure(fifty, 80)), "through the registry").toBe(counted(() => r.measure(five, 80)));

    // **`window` and `tableElements`**: they plan for more than one reader, so the
    // row asserts the count does not move with the rows rather than its value.
    const windowAt = (t: typeof five) => () => tableDefinition.window?.(t, 80, 0, 6, () => 1);
    expect(counted(windowAt(fifty)), "window").toBe(counted(windowAt(five)));
    const elementsAt = (t: typeof five) => () => tableElements(t, 80, () => 1);
    expect(counted(elementsAt(fifty)), "tableElements").toBe(counted(elementsAt(five)));

    // **A plan measures no glyph**: the mark's cells were taken at import.
    glyphs.mockClear();
    for (const width of [40, 60, 80, 120]) planDisclosed(psColumns(), width, 3);
    expect(glyphs.mock.calls.length, "glyphCells per plan").toBe(0);
  });
});
