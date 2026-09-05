// C12 I117, §3aq — `legendHitAt`: the legend's placement inverted by search
// through the map that drew it (F775's method), never a second formula.
//
// **The legend is located in the painted frame first**, and every row below
// asks the inverse about a cell the frame shows — a swatch, a label's last
// character, the blank before a swatch, the ` +n` tail — so a row is about
// where the reader sees the entry and not about where the arithmetic puts it.
import { describe, expect, it } from "vitest";

import { block, type Plot } from "../../src/data/viewmodel/index.js";
import { legendHitAt, plotDefinition } from "../../src/presentation/plot/index.js";
import { FULL_CAPS, measurable } from "../support/render.js";

const SGR = /\x1b\[[0-9;]*m/gu;
const strip = (s: string): string => s.replace(SGR, "");
const ctx = { capabilities: FULL_CAPS };
const frameOf = (b: Plot, width: number): readonly string[] =>
  measurable({ definitions: [plotDefinition] }).renderToLines(b, width).map(strip);

const two = (extra: Partial<Plot> = {}): Plot =>
  block({
    kind: "plot", id: "p", form: "line", height: 5, axes: true,
    series: [
      { values: [10, 20, 30, 40, 50], label: "train" },
      { values: [90, 80, 70, 60, 55], label: "val" },
    ],
    ...extra,
  }) as Plot;

/** `label`'s row in the frame and the column of the swatch two cells before it. */
function locate(frame: readonly string[], label: string): { row: number; swatch: number; last: number } {
  const row = frame.findIndex((l) => l.includes(` ${label}`));
  expect(row, `the frame names ${label}`).toBeGreaterThanOrEqual(0);
  const at = frame[row]!.indexOf(` ${label}`);
  return { row, swatch: at - 1, last: at + label.length };
}

describe("C12 I117 — legendHitAt, against legends located in painted frames (T1.129)", () => {
  it("T1.129 (C12 I117): a right legend — the swatch and the label hit, the blank before the swatch and the area do not", () => {
    const b = two();
    const frame = frameOf(b, 60);
    const t = locate(frame, "train");
    const v = locate(frame, "val");
    expect(v.row, "one entry per area row, in palette order").toBe(t.row + 1);

    expect(legendHitAt(b, 60, ctx, t.swatch, t.row), "train's swatch").toBe(0);
    expect(legendHitAt(b, 60, ctx, t.last, t.row), "train's last letter").toBe(0);
    expect(legendHitAt(b, 60, ctx, v.swatch, v.row), "val's swatch").toBe(1);
    expect(legendHitAt(b, 60, ctx, v.swatch + 2, v.row), "val's first letter").toBe(1);
    // The blank before the swatch is the gap `legendColumn` writes, not the entry.
    expect(legendHitAt(b, 60, ctx, v.swatch - 1, v.row), "the leading blank").toBeNull();
    // Inside the area, at the same row: the crosshair's cell, not the legend's.
    expect(legendHitAt(b, 60, ctx, 20, v.row), "the area").toBeNull();
    expect(legendHitAt(b, 60, ctx, 1, v.row), "the gutter").toBeNull();
    // Below the last entry the column is blank; below the area it is the rule.
    expect(legendHitAt(b, 60, ctx, v.swatch, v.row + 1), "the empty legend row").toBeNull();
    expect(legendHitAt(b, 60, ctx, v.swatch, frame.length - 1), "the x-label row").toBeNull();
    // The legend column and the area are complementary: the frame's right edge is left of the swatch.
    expect(frame[v.row]!.indexOf("│", 10), "the border stands before the legend").toBeLessThan(v.swatch);
  });

  it("T1.129 (cont., C12 I117): a left legend — the same entries, at the frame's left, and the lid is not an entry", () => {
    const b = two({ legend: "left" });
    const frame = frameOf(b, 60);
    const v = locate(frame, "val");
    expect(v.swatch, "the left legend's swatch is at column 1 — after `legendColumn`'s blank").toBe(1);
    expect(legendHitAt(b, 60, ctx, v.swatch, v.row)).toBe(1);
    expect(legendHitAt(b, 60, ctx, v.last, v.row)).toBe(1);
    expect(legendHitAt(b, 60, ctx, 0, v.row), "the blank").toBeNull();
    expect(legendHitAt(b, 60, ctx, v.swatch, 0), "the lid row above the area").toBeNull();
    const t = locate(frame, "train");
    expect(legendHitAt(b, 60, ctx, t.swatch, t.row)).toBe(0);
  });

  it("T1.129 (cont., C12 I117): a horizontal legend below — entries along one row, the separator and the tail are nothing", () => {
    const b = two({ legend: "below" });
    const frame = frameOf(b, 60);
    const t = locate(frame, "train");
    const v = locate(frame, "val");
    expect(v.row, "one row").toBe(t.row);
    expect(t.row, "the last row").toBe(frame.length - 1);
    expect(legendHitAt(b, 60, ctx, t.swatch, t.row)).toBe(0);
    expect(legendHitAt(b, 60, ctx, t.last, t.row)).toBe(0);
    expect(legendHitAt(b, 60, ctx, v.swatch, v.row)).toBe(1);
    expect(legendHitAt(b, 60, ctx, v.last, v.row)).toBe(1);
    // The two-cell separator between the entries.
    expect(legendHitAt(b, 60, ctx, t.last + 1, t.row), "first separator cell").toBeNull();
    expect(legendHitAt(b, 60, ctx, v.swatch - 1, t.row), "second separator cell").toBeNull();
    expect(legendHitAt(b, 60, ctx, t.swatch, t.row - 1), "the x-label row above it").toBeNull();

    // Four series in a narrow row: what fits, then ` +n`, and the tail is nothing.
    const four = block({
      kind: "plot", id: "q", form: "line", height: 5, axes: true, legend: "below",
      series: ["alpha", "bravo", "charlie", "delta"].map((label, i) => ({ label, values: [i, i + 1, i + 2] })),
    }) as Plot;
    const narrow = frameOf(four, 28);
    const tail = narrow[narrow.length - 1]!;
    const plus = tail.indexOf("+");
    expect(plus, "the count of the rest is drawn").toBeGreaterThan(0);
    expect(tail, "and not every series fits").not.toContain("delta");
    expect(legendHitAt(four, 28, ctx, plus, narrow.length - 1), "the `+n` tail").toBeNull();
    expect(legendHitAt(four, 28, ctx, plus + 1, narrow.length - 1)).toBeNull();
    const a = locate(narrow, "alpha");
    expect(legendHitAt(four, 28, ctx, a.swatch, a.row), "what fits still answers").toBe(0);
  });

  it("T1.129 (cont., C12 I117): only a series answers — an annotation's entry, and every entry of a form whose series cannot hide, are null", () => {
    const annotated = block({
      kind: "plot", id: "a", form: "line", height: 5, axes: true,
      series: [{ values: [10, 20, 30, 40, 50], label: "train" }],
      annotations: [
        { kind: "line", value: 25, label: "target" },
        { kind: "line", value: 45, label: "ceiling" },
      ],
    }) as Plot;
    const frame = frameOf(annotated, 60);
    const t = locate(frame, "train");
    const g = locate(frame, "target");
    const c = locate(frame, "ceiling");
    expect(legendHitAt(annotated, 60, ctx, t.swatch, t.row), "the series row").toBe(0);
    expect(legendHitAt(annotated, 60, ctx, g.swatch, g.row), "an annotation is not a series").toBeNull();
    expect(legendHitAt(annotated, 60, ctx, c.last, c.row)).toBeNull();

    // A bar's explicit legend draws, and `hidden` would mean *recomputed* there (C04 I99).
    const bars = block({
      kind: "plot", id: "b", form: "bar", height: 5, axes: true, legend: "right",
      series: [{ values: [3, 5, 2], label: "one" }, { values: [1, 4, 6], label: "two" }],
    }) as Plot;
    const barFrame = frameOf(bars, 60);
    const one = locate(barFrame, "one");
    expect(legendHitAt(bars, 60, ctx, one.swatch, one.row), "a bar's legend entry").toBeNull();
    // And a plot with no legend at all answers nothing anywhere.
    const alone = block({ kind: "plot", id: "s", form: "line", height: 5, axes: true, series: [{ values: [1, 2, 3], label: "solo" }] }) as Plot;
    for (let col = 0; col < 60; col += 7) expect(legendHitAt(alone, 60, ctx, col, 2)).toBeNull();
  });
});
