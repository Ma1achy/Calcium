// C11 I26 and §099 — a column aligned on its decimal point.
//
// **§099's figure is the fixture.** The section draws four values — `0.0372`,
// `0.941`, `3e-4`, `1284` — and states the rule they demonstrate: *the column
// declares where the point sits and every cell aligns to it, and an integer
// aligns where its point would be, so `1284` ends exactly where `0.941`'s point
// is*. An alignment that is self-consistent and different fails here rather
// than passing as a variant.
import { describe, expect, it } from "vitest";

import { measurable, FULL_CAPS, DARK_THEME } from "../support/render.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import type { Table } from "../../src/data/viewmodel/index.js";

// A literal ESC byte in a source file is a character nobody can see; the
// escape names itself.
const SGR = /\u001b\[[0-9;]*m/gu;

/** §099's four values, in one column, at a width the caller picks. */
const figure = (align: string, minWidth: number, extra: readonly string[] = []): Table =>
  ({
    kind: "table",
    id: "t",
    columns: [
      { key: "k", label: "metric", align: "left", priority: 10, minWidth: 8, sortable: false },
      { key: "v", label: "value", align, priority: 9, minWidth, sortable: false },
    ],
    rows: [
      { id: "r1", cells: { k: { text: "val loss" }, v: { text: "0.0372" } } },
      { id: "r2", cells: { k: { text: "accuracy" }, v: { text: "0.941" } } },
      { id: "r3", cells: { k: { text: "lr" }, v: { text: "3e-4" } } },
      { id: "r4", cells: { k: { text: "steps" }, v: { text: "1284" } } },
      ...extra.map((text, i) => ({ id: `x${String(i)}`, cells: { k: { text: "extra" }, v: { text } } })),
    ],
  }) as unknown as Table;

const kit = () =>
  measurable({ theme: DARK_THEME, capabilities: FULL_CAPS, definitions: [tableDefinition] as never });

const linesOf = (t: Table, width = 30): readonly string[] =>
  kit()
    .renderToLines(t as never, width)
    .map((l) => l.replace(SGR, ""));

/** The column at which `value` sits in the row holding it, or −1. */
const startOf = (line: string, value: string): number => line.indexOf(value);

describe("C11 I26 — a column aligns on its decimal point", () => {
  it("T2.14 (C11 I26, §099): §099's four values put every point in one cell, and `right` puts them in three", () => {
    const body = linesOf(figure("decimal", 10)).slice(1, 5);
    const points = body.slice(0, 2).map((l) => l.indexOf("0.") + 1);
    // **The two values that HAVE a point line up on it**, which is the claim.
    expect(new Set(points).size, `points at ${JSON.stringify(points)}`).toBe(1);
    const point = points[0]!;

    // **And a value with no point ENDS there** — §099's own sentence, and it is
    // what makes `3e-4` correct for the same reason `1284` is rather than for a
    // rule of its own.
    // **`1,284` and not `1284`, which is C11 I28 arriving at §099's own
    // figure.** The section draws the value ungrouped and cites neither
    // `R-TBL-001` nor `R-TBL-004`; §078 is the sole example for both and its
    // fourth rule is unconditional — *thousands are grouped* — so the rule
    // outranks a figure drawn to demonstrate something else. **The property
    // §099 states survives intact**: `1,284` still ends exactly where `0.941`'s
    // point sits, for the same reason it did at four digits — it is all integer
    // part — and the column's point simply moves one cell right with it.
    for (const [row, value] of [[2, "3e-4"], [3, "1,284"]] as const) {
      const at = startOf(body[row]!, value);
      expect(at, `${value} is drawn`).toBeGreaterThan(0);
      expect(at + value.length, `${value} ends where the point sits`).toBe(point);
    }

    // **The control is the defect the section names**: under `right` the points
    // are in different columns, which is *align: r lines up the LAST character*.
    const right = linesOf(figure("right", 10)).slice(1, 5);
    const rightPoints = right.slice(0, 2).map((l) => l.indexOf("0.") + 1);
    expect(new Set(rightPoints).size, `right puts them at ${JSON.stringify(rightPoints)}`).toBe(2);
  });

  it("T2.15 (C11 I26, C04 I30, R-TBL-005): the point is derived, and a column with no room right-aligns whole", () => {
    // **Derived**: a row with a wider integer part moves the point and nothing
    // else, which is what says the column owns the position rather than the author.
    const narrowInt = linesOf(figure("decimal", 12)).slice(1, 5);
    const widerInt = linesOf(figure("decimal", 12, ["123456.5"])).slice(1, 5);
    expect(widerInt[0]!.indexOf("0."), "a wider integer part moved the point").not.toBe(
      narrowInt[0]!.indexOf("0."),
    );

    // **A column with no room falls back as a COLUMN, to `right`** (C11 I26). The
    // first implementation clamped each cell's lead to its own slack and the
    // points drifted by one — every count agreed and the frame was wrong — so
    // this asserts the whole column agrees, not any one cell's position.
    const cramped = linesOf(figure("decimal", 8)).slice(1, 5);
    const right = linesOf(figure("right", 8)).slice(1, 5);
    expect(cramped, "too narrow to align → identical to `right`").toEqual(right);

    // **Alignment never asks for width**: the row count is the same under all
    // three, at a spread of widths.
    for (const width of [20, 30, 44, 60]) {
      const counts = ["left", "right", "decimal"].map(
        (a) => kit().measure(figure(a, 10) as never, width),
      );
      expect(new Set(counts).size, `one row count at ${String(width)}: ${JSON.stringify(counts)}`).toBe(1);
    }
  });
});

describe("C11 I31 — the window pins the number column's width", () => {
  it.todo("T2.16 (C11 I31, I19, I27): a window plans a number column at the table's widest value — not deferred on a component: specified before the window pins it");
});
