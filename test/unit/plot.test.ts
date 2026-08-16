// C12 tier 1 — the rasteriser and the scaling core, in isolation.
//
// Almost everything here is asserted against the *dot grid* rather than against a
// rendered frame, because that is where the two invariants that nearly did not
// compose (I5, I14) actually meet. A row of braille reads as a curve to a person
// and says very little to an assertion; the grid says exactly which columns carry
// ink.
import { describe, expect, it } from "vitest";
import { formatValue, labelWidth, xLabelRow, yLabels } from "../../src/presentation/plot/axes.js";
import { curveRows } from "../../src/presentation/plot/curve.js";
import { plotAreaWidth, plotHeight } from "../../src/presentation/plot/height.js";
import {
  BRAILLE_DOTS,
  createGrid,
  drawLine,
  foldBraille,
  foldRamp,
  setDot,
} from "../../src/presentation/plot/raster.js";
import {
  RAMP_ASCII,
  RAMP_BRAILLE,
  RAMP_DENSITY,
  RAMP_STEPS,
  RAMP_UNICODE,
} from "../../src/presentation/plot/ramp.js";
import { columnsOf, finiteSamples, rowOf, seriesRange } from "../../src/presentation/plot/scale.js";
import { sparkline } from "../../src/presentation/plot/sparkline.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { block, type Plot } from "../../src/data/viewmodel/index.js";
import { DARK_THEME, measurable } from "../support/render.js";
import { stripHeights } from "../../src/presentation/plot/strips.js";
import { cells } from "../../src/presentation/text.js";
import { lossCurve } from "../support/blocks.js";
import { ASCII_CAPS, FULL_CAPS } from "../support/render.js";

/**
 * The dot columns a folded row set inks, so a gap is a fact rather than a look.
 *
 * The two masks are dots 1,2,3,7 and dots 4,5,6,8 — `0x47` and `0xb8`. They were
 * written as `0x57` and `0xa8` first, which puts dot 5 in the left column and
 * loses dot 3 from it, and four tests passed against the mis-decoded grid before
 * one of them failed for the right reason. A harness that decodes wrongly agrees
 * with itself: it is the same defect as a fixture reader parsing by position
 * (A03 §2), and the only thing that caught it was an assertion whose expected
 * value came from the invariant rather than from the code.
 */
const LEFT_COLUMN = 0x47;
const RIGHT_COLUMN = 0xb8;

function inkedColumns(glyphRows: readonly string[]): readonly number[] {
  const out = new Set<number>();
  glyphRows.forEach((line) => {
    [...line].forEach((cell, index) => {
      const mask = cell.codePointAt(0) ?? 0x2800;
      if (cell === " " || mask === 0x2800) return;
      const bits = mask - 0x2800;
      if ((bits & LEFT_COLUMN) !== 0) out.add(index * BRAILLE_DOTS.x);
      if ((bits & RIGHT_COLUMN) !== 0) out.add(index * BRAILLE_DOTS.x + 1);
    });
  });
  return [...out].sort((a, b) => a - b);
}

/** The masks, asserted against the encoder rather than trusted. */
function assertMasksAgree(): void {
  const grid = createGrid(2, 4);
  for (const y of [0, 1, 2, 3]) setDot(grid, 0, y);
  const left = (foldBraille(grid)[0]?.codePointAt(0) ?? 0x2800) - 0x2800;
  if (left !== LEFT_COLUMN) throw new Error(`left mask is ${String(left)}`);
}

/** The interior dot columns with no ink — the property that condemned two figures. */
function interiorGaps(glyphRows: readonly string[]): readonly number[] {
  const inked = inkedColumns(glyphRows);
  const first = inked[0];
  const last = inked[inked.length - 1];
  if (first === undefined || last === undefined) return [];
  const held = new Set(inked);
  const gaps: number[] = [];
  for (let x = first; x <= last; x += 1) if (!held.has(x)) gaps.push(x);
  return gaps;
}

describe("C12 tier 1 — height", () => {
  it("T1.1 (I1): height is the block's, for every form and axes combination", () => {
    expect(plotHeight({ form: "sparkline" })).toBe(1);
    expect(plotHeight({ form: "line", height: 8 })).toBe(8);
    expect(plotHeight({ form: "line", height: 8, axes: false })).toBe(8);
    expect(plotHeight({ form: "line", height: 8, axes: true })).toBe(10);
  });

  it("T1.1 (I1): and it is independent of the series, including empty", () => {
    // The type is the guarantee — `plotHeight` takes `PlotGeometry`, so a series
    // cannot reach it. This asserts the consequence a reader cares about: the
    // same three fields give the same answer whatever the data was.
    const geometry = { form: "line", height: 6, axes: true } as const;
    expect(plotHeight(geometry)).toBe(8);
    expect(plotHeight({ ...geometry })).toBe(8);
  });

  it("T1.1 (I1): the plot area is width − labels − 2, not − 3", () => {
    // The gutter is a space and the `│`, with the data flush against the axis —
    // S04 §3 and S11 §2 both drew two cells and §2 declared three (HEIGHT_AUDIT,
    // the fifth verdict). At width 48 with a 4-cell label column that is 42.
    expect(plotAreaWidth(48, 4, true)).toBe(42);
    expect(plotAreaWidth(48, 4, false)).toBe(48);
  });
});

describe("C12 tier 1 — braille encoding", () => {
  it("T1.2: this file's own column masks agree with the encoder", () => {
    // The harness rule, applied to a decoder rather than to a parameter: a helper
    // that reads the grid wrongly makes every gap assertion below meaningless in
    // the direction that passes. Asserted against `foldBraille` rather than
    // restated, so the two cannot drift.
    expect(() => assertMasksAgree()).not.toThrow();
  });

  it("T1.2: each of the eight dot positions sets its documented bit", () => {
    const expected: readonly (readonly [number, number, number])[] = [
      [0, 0, 0x01], [0, 1, 0x02], [0, 2, 0x04], [0, 3, 0x40],
      [1, 0, 0x08], [1, 1, 0x10], [1, 2, 0x20], [1, 3, 0x80],
    ];

    for (const [x, y, bit] of expected) {
      const grid = createGrid(2, 4);
      setDot(grid, x, y);
      const cell = foldBraille(grid)[0] ?? "";
      expect(cell.codePointAt(0), `dot at (${x},${y})`).toBe(0x2800 + bit);
    }
  });

  it("T1.2: a full cell is U+28FF and an empty one U+2800", () => {
    const empty = createGrid(2, 4);
    expect(foldBraille(empty)[0]?.codePointAt(0)).toBe(0x2800);

    const full = createGrid(2, 4);
    for (let x = 0; x < 2; x += 1) for (let y = 0; y < 4; y += 1) setDot(full, x, y);
    expect(foldBraille(full)[0]?.codePointAt(0)).toBe(0x28ff);
  });

  it("T1.3: a horizontal run produces a continuous row of identical cells", () => {
    const series = { values: Array.from({ length: 40 }, () => 5) };
    const glyphRows = curveRows(series, { min: 0, max: 10 }, 20, 1, FULL_CAPS);
    const line = glyphRows[0] ?? "";

    expect([...new Set([...line])]).toHaveLength(1);
    expect(interiorGaps(glyphRows)).toEqual([]);
  });

  it("T1.4 (I14): a steep segment is connected, not dotted", () => {
    const grid = createGrid(20, 40);
    drawLine(grid, 0, 0, 3, 39);
    const rows = foldBraille(grid);

    // Bresenham's property, stated as the one that matters: every dot row the
    // segment spans carries ink. Plotting the endpoints alone would leave 38 of
    // 40 rows empty, which is what a steep curve looks like without this.
    const inkedRows = rows.filter((line) => [...line].some((c) => c !== "⠀"));
    expect(inkedRows).toHaveLength(10);
  });

  it("T1.4 (I14): and a steep *series* has no interior gap", () => {
    const series = { values: [0, 100, 0, 100, 0, 100] };
    expect(interiorGaps(curveRows(series, { min: 0, max: 100 }, 20, 4, FULL_CAPS))).toEqual([]);
  });
});

describe("C12 tier 1 — degenerate series", () => {
  it("T1.5 (I3): a constant series is a flat centred line with no NaN", () => {
    const range = seriesRange([{ values: [3, 3, 3, 3] }], {});
    expect(range).toEqual({ min: 3, max: 3 });
    if (range === null) throw new Error("unreachable");

    // 16 dot rows, so the centre is 7 — and no division by a zero range.
    expect(rowOf(3, range, 16)).toBe(7);
    expect(Number.isNaN(rowOf(3, range, 16))).toBe(false);

    const glyphRows = curveRows({ values: [3, 3, 3, 3] }, range, 12, 4, FULL_CAPS);
    expect(glyphRows.join("")).not.toContain("NaN");
    // One row of ink, in the middle of four.
    const inked = glyphRows.map((line) => [...line].some((c) => c !== "⠀"));
    expect(inked).toEqual([false, true, false, false]);
  });

  it("T1.5 (I3): all three y-labels show the constant value", () => {
    const labels = yLabels({ min: 3, max: 3 }, 5, "number");
    expect(labels.map((l) => l.text)).toEqual(["3", "3", "3"]);
  });

  it("T1.6 (I3): a single point is one dot at the vertical centre", () => {
    const range = seriesRange([{ values: [7] }], {});
    if (range === null) throw new Error("unreachable");

    const glyphRows = curveRows({ values: [7] }, range, 12, 4, FULL_CAPS);
    const inked = inkedColumns(glyphRows);
    expect(inked).toHaveLength(1);

    // Horizontally centred: `first` and `last` are the same sample, so the rule
    // mapping one to each edge has no answer and the centre picks no side.
    expect(inked[0]).toBe(Math.floor((24 - 1) / 2));
  });

  it("T1.7: an empty series has no samples and no columns", () => {
    expect(finiteSamples([])).toEqual([]);
    expect(columnsOf([], 0, 40)).toEqual([]);
    expect(seriesRange([], {})).toBeNull();
    expect(seriesRange([{ values: [] }], {})).toBeNull();
  });

  it("T1.8 (I4): NaN and Infinity are filtered, and the line breaks at the hole", () => {
    const values = [1, 2, Number.NaN, 4, 5];
    expect(finiteSamples(values).map((s) => s.v)).toEqual([1, 2, 4, 5]);
    expect(finiteSamples(values).map((s) => s.i)).toEqual([0, 1, 3, 4]);

    const range = seriesRange([{ values }], {});
    if (range === null) throw new Error("unreachable");

    // The break is the assertion: the removed sample's column carries no ink and
    // no Bresenham segment spans it. A filter that dropped the index instead
    // would close the gap and pass every other test in this file.
    const gaps = interiorGaps(curveRows({ values }, range, 20, 4, FULL_CAPS));
    expect(gaps.length).toBeGreaterThan(0);
  });

  it("T1.8 (I4): ±Infinity never reaches the grid", () => {
    const values = [1, Number.POSITIVE_INFINITY, 3, Number.NEGATIVE_INFINITY];
    expect(finiteSamples(values).map((s) => s.v)).toEqual([1, 3]);
    expect(seriesRange([{ values }], {})).toEqual({ min: 1, max: 3 });
  });

  it("T1.9: an all-non-finite series is treated as empty", () => {
    expect(seriesRange([{ values: [Number.NaN, Number.POSITIVE_INFINITY] }], {})).toBeNull();
  });

  it("T1.10 (I5): a spike survives downsampling from 10,000 points", () => {
    const values = Array.from({ length: 10_000 }, (_, i) => (i === 5_000 ? 99 : 1));
    const samples = finiteSamples(values);
    const columns = columnsOf(samples, values.length, 112);

    // The column holding the spike keeps it as its maximum. Averaging would give
    // that column ~1.9, and every-nth sampling would miss index 5,000 entirely —
    // which is T6.4's revert, and the reason this is a per-column max.
    const spiked = columns.filter((c) => c.max === 99);
    expect(spiked).toHaveLength(1);

    const range = seriesRange([{ values }], {});
    if (range === null) throw new Error("unreachable");
    const glyphRows = curveRows({ values }, range, 56, 8, FULL_CAPS);
    // Top row inked: the spike reaches the ceiling of the plot area.
    expect([...(glyphRows[0] ?? "")].some((c) => c !== "⠀")).toBe(true);
  });

  it("T1.10 (I5): a column keeps four values, not two", () => {
    // The composition C12 §3 records. `first` and `last` are what I14 joins to
    // its neighbours; `min` and `max` are what I5 preserves. Dropping either pair
    // breaks the other invariant, and this is the assertion that says so.
    const values = [5, 1, 9, 3];
    const columns = columnsOf(finiteSamples(values), 4, 1);
    expect(columns).toEqual([{ x: 0, first: 5, min: 1, max: 9, last: 3, iFirst: 0, iLast: 3 }]);
  });

  it("T1.11: three points spread across the full width and join", () => {
    const values = [1, 5, 2];
    const columns = columnsOf(finiteSamples(values), 3, 112);
    expect(columns.map((c) => c.x)).toEqual([0, 56, 111]);

    const range = seriesRange([{ values }], {});
    if (range === null) throw new Error("unreachable");
    expect(interiorGaps(curveRows({ values }, range, 56, 8, FULL_CAPS))).toEqual([]);
  });
});

describe("C12 tier 1 — labels", () => {
  it("T1.12: y-labels format per yFormat — one case per arm", () => {
    expect(formatValue(0.0372, "number")).toBe("0.037");
    expect(formatValue(0.968, "fraction")).toBe("97%");
    expect(formatValue(96.8, "percent")).toBe("97%");
    expect(formatValue(1536, "bytes")).toBe("1.5 KB");
    expect(formatValue(130, "duration")).toBe("2m 10s");
  });

  it("T1.12b (C04 I41): the two per-cent arms differ on one value", () => {
    // **The row a per-arm table cannot express.** Every line above asserts one
    // arm against its own rule and agrees with itself; the defect was that two
    // arms meant one thing, which is only visible when the same value goes
    // through both.
    //
    // `0.84` is what a fraction-holding producer has and `84%` is what it means.
    // The same number reaching the arm named for what a CLI emits is 0.84 of one
    // per cent, and rounds to `1%`. Neither is wrong; naming them by the
    // rendered form is, because both render a per-cent sign.
    expect(formatValue(0.84, "fraction")).toBe("84%");
    expect(formatValue(0.84, "percent")).toBe("1%");

    // F31's measured case, which is what the old naming got wrong by 100×.
    expect(formatValue(100.2, "percent"), "docker's CPUPerc").toBe("100%");
    expect(formatValue(100.2, "fraction"), "the old `percent`").toBe("10020%");
  });

  it("T1.12c (C04 I41): the arms produce different label widths, so `yFormat` is geometry", () => {
    // **A test that only reads label text passes against a renderer measuring
    // the wrong set.** C12 §3 sizes the gutter with `labelWidth` over the
    // rendered labels, so an arm that changes a label's width changes the plot
    // area — which is why this is an invariant about geometry and not a note
    // about formatting.
    const asFraction = yLabels({ min: 0, max: 1 }, 5, "fraction");
    const asPercent = yLabels({ min: 0, max: 100 }, 5, "percent");

    expect(labelWidth(asFraction), "`100%` is four cells").toBe(4);
    expect(labelWidth(yLabels({ min: 0, max: 0.5 }, 5, "fraction")), "`50%` is three").toBe(3);
    expect(labelWidth(asPercent)).toBe(4);
  });

  it("T1.12: the three labels share one precision, taken from the span", () => {
    // Formatting each on its own magnitude gave `0.86`, `0.4737`, `0.0874` — a
    // midpoint two cells wider than its siblings, widening the label column for
    // precision nobody asked for. Found by reading a rendered frame.
    const labels = yLabels({ min: 0.0874, max: 0.86 }, 5, "number");
    expect(labels.map((l) => l.text)).toEqual(["0.86", "0.47", "0.09"]);
    expect(labelWidth(labels)).toBe(4);
  });

  it("T1.12 (I2): a denormal range formats rather than throwing", () => {
    // `decimalsFor` wanted 325 decimals for a span of 5e-324 and `toFixed` throws
    // above 100, so the RangeError came out of the renderer — I2 broken by a label
    // rather than by the grid. A value that rounds to zero and is not zero goes to
    // exponential, because a floor reading `0` when it is not is wrong in the one
    // direction a reader cannot detect.
    expect(() => yLabels({ min: 5e-324, max: 1e-323 }, 5, "number")).not.toThrow();
    expect(formatValue(5e-324, "number")).toBe("4.9e-324");
    expect(formatValue(1e300, "number")).toBe("1.0e+300");
  });

  it("T1.12 (I15): labels collapse from the middle outward", () => {
    const range = { min: 0, max: 10 };
    expect(yLabels(range, 5, "number").map((l) => l.text)).toEqual(["10", "5", "0"]);
    expect(yLabels(range, 2, "number").map((l) => l.text)).toEqual(["10", "0"]);
    expect(yLabels(range, 1, "number").map((l) => l.text)).toEqual(["10"]);
  });

  it("T1.12 (I15): and they sit at the max, mid and min rows", () => {
    expect(yLabels({ min: 0, max: 10 }, 7, "number").map((l) => l.row)).toEqual([0, 3, 6]);
  });

  it("T3.8: x-labels keep a cell between them or are dropped", () => {
    // Not merely "do not overlap": at width 22 a seven-cell left label and a
    // centred one both wanted cell 7, and `epoch 0epoch …` reads as one label.
    const row = xLabelRow(["epoch 0", "epoch 20", "now"], 22, FULL_CAPS);
    expect(row).not.toContain("0epoch");
    expect(row.length).toBeLessThanOrEqual(22);
  });
});

describe("C12 tier 1 — pinned range", () => {
  it("T1.14: a pin overrides the computed range", () => {
    expect(seriesRange([{ values: [0.2, 0.5, 0.3] }], { yMin: 0, yMax: 1 })).toEqual({ min: 0, max: 1 });
    expect(seriesRange([{ values: [0.2, 0.5, 0.3] }], { yMin: 0 })).toEqual({ min: 0, max: 0.5 });
    expect(seriesRange([{ values: [0.2, 0.5, 0.3] }], { yMax: 1 })).toEqual({ min: 0.2, max: 1 });
  });

  it("T1.14 (C04 I29): out-of-range values clamp to the edge and never widen the pin", () => {
    const range = seriesRange([{ values: [0.2, 1.6, -0.4] }], { yMin: 0, yMax: 1 });
    expect(range).toEqual({ min: 0, max: 1 });
    if (range === null) throw new Error("unreachable");

    // Clamped, not dropped: a series that briefly exceeds its ceiling shows
    // pressed against the ceiling, not as a hole where it was.
    expect(rowOf(1.6, range, 16)).toBe(0);
    expect(rowOf(-0.4, range, 16)).toBe(15);
  });

  it("T1.14: a reversed pin collapses to constant rather than throwing (I2)", () => {
    expect(seriesRange([{ values: [1, 2] }], { yMin: 10, yMax: 1 })).toEqual({ min: 10, max: 10 });
  });
});

describe("C12 tier 1 — sparklines", () => {
  it("T1.13 (I13): exactly one row of exactly `width` cells, at 1, 8 and 80", () => {
    const values = lossCurve(40);
    for (const width of [1, 8, 80]) {
      const out = sparkline(values, width, FULL_CAPS);
      expect(out).not.toContain("\n");
      expect([...out], `width ${String(width)}`).toHaveLength(width);
    }
  });

  it("T1.13: the window is the last `width` points — 8 is not a constant", () => {
    // A01 A.2 says "the last 8 points", which is the case where `width` is 8.
    // C11's `spark` column declares 8 as a minimum and a planner distributing
    // residual can make it wider, so this must be right at any width.
    const rising = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(sparkline(rising, 3, FULL_CAPS)).toBe("▁▅█");
    expect(sparkline(rising, 10, FULL_CAPS)).toBe("▁▂▃▃▄▅▆▆▇█");
  });

  it("T1.13: the minimum is the lowest glyph and the maximum the highest", () => {
    // The property that condemned `0.0372 ▁▂▃▅▆`: normalising within [min, max]
    // puts the maximum sample at `█`, so a sparkline without one is not a
    // sparkline of any data.
    const out = sparkline([4, 1, 9, 3, 7, 2, 8, 5], 8, FULL_CAPS);
    expect(out).toContain("▁");
    expect(out).toContain("█");
  });

  it("T1.13: fewer values than cells are right-anchored", () => {
    // The window is of the *last* points, so three samples in eight cells read as
    // three samples so far, growing rightward — not as a stretched curve that
    // changes shape as it fills.
    expect(sparkline([1, 2, 3], 8, FULL_CAPS)).toBe("     ▁▅█");
  });

  it("T1.13 (I3): a constant window is the middle step, not a division by zero", () => {
    expect(sparkline([5, 5, 5], 3, FULL_CAPS)).toBe("▄▄▄");
  });

  it("T1.13 (I4, I13): a gap keeps its position and draws the absent marker", () => {
    // **This row asserted the defect.** It expected `" ▁█"` — a leading blank
    // where the gap is, which is the same character the right-anchor draws when
    // there are fewer samples than cells. One character, two meanings, and the
    // row was the thing saying it was correct.
    expect(sparkline([Number.NaN, 1, 2], 3, FULL_CAPS)).toBe("?▁█");

    // The interior case, where the old behaviour SHORTENED the row: seven
    // positions came back as six glyphs, and no assertion here counted them.
    expect(sparkline([1, 2, 3, Number.NaN, 7, 8, 9], 12, FULL_CAPS)).toBe("     ▁▂▃?▆▇█");

    // And the two forms agree now, which is the actual claim: the same array
    // breaks the line and marks the sparkline, rather than breaking one and
    // closing the other.
    expect(sparkline([1, 2, 3, Number.NaN, 7, 8, 9], 12, FULL_CAPS)).toHaveLength(12);

    // All-non-finite stays empty (§4), because the line form renders the empty
    // message for the same input — a row of markers would be the sparkline
    // disagreeing with the plot in the other direction.
    expect(sparkline([Number.NaN], 4, FULL_CAPS)).toBe("    ");
    expect(sparkline([], 4, FULL_CAPS)).toBe("    ");
  });

  it("T1.16 (I4, C04 I46a): `null` is the gap a document carries, and it round-trips where `NaN` does not", () => {
    // **The two spellings render identically and only one is a legal document.**
    // `NaN` is what the type could express and `JSON.stringify` writes it as
    // `null`, so the persisted form was already this shape while the declared
    // type forbade it — which is why this row asserts the *serialisation* and not
    // only the glyphs. A row that checked the picture alone passes for both and
    // says nothing about the one that matters.
    expect(sparkline([1, 2, 3, null, 7, 8, 9], 12, FULL_CAPS)).toBe("     ▁▂▃?▆▇█");
    expect(sparkline([1, 2, 3, Number.NaN, 7, 8, 9], 12, FULL_CAPS), "same picture").toBe(
      sparkline([1, 2, 3, null, 7, 8, 9], 12, FULL_CAPS),
    );

    const gapped = [1, null, 3];
    expect(JSON.parse(JSON.stringify(gapped)), "`null` survives itself").toEqual(gapped);
    expect(
      JSON.parse(JSON.stringify([1, Number.NaN, 3])),
      "and `NaN` arrives back as the value the old type forbade",
    ).toEqual(gapped);

    // The line form takes it on the same terms — one guard for both, because
    // `Number.isFinite(null)` is false.
    expect(finiteSamples([1, null, 3])).toEqual([
      { i: 0, v: 1 },
      { i: 2, v: 3 },
    ]);
  });

  it("T1.15 (I16): every ramp step is visible, monotone in ink, and never the pad character", () => {
    // **Asserted over the constants, because the defect is a property of the
    // set.** `RAMP_BRAILLE` began at `U+2800` — BRAILLE PATTERN BLANK — so a
    // sparkline on a wide terminal drew its minimum as whitespace, which the
    // right-anchor already uses for *fewer samples than cells*. Every width and
    // length assertion in this file passed against it, and `cells()` counted it
    // as one, which is what left the arm with nothing looking at it.
    for (const [name, ramp] of [
      ["unicode", RAMP_UNICODE],
      ["ascii", RAMP_ASCII],
      ["braille", RAMP_BRAILLE],
    ] as const) {
      const steps = [...ramp];
      expect(steps, `${name} has eight steps`).toHaveLength(RAMP_STEPS);
      for (const step of steps) {
        expect(step.trim(), `${name}: no step is blank`).not.toBe("");
        expect(cells(step, "narrow"), `${name}: one cell narrow`).toBe(1);
      }
      expect(new Set(steps).size, `${name}: no step repeats`).toBe(RAMP_STEPS);
    }

    // Monotone in ink, which the old set was not either: its dot populations ran
    // 0,1,2,3,4,5,6,8, so the last step was a double jump.
    const dots = [...RAMP_BRAILLE].map((c) =>
      ((c.codePointAt(0) ?? 0) - 0x2800).toString(2).replaceAll("0", "").length,
    );
    expect(dots, "one dot to eight, no gaps").toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    // The measured case: the minimum must not be the padding beside it.
    const drawn = sparkline([0, 5], 6, { ...FULL_CAPS, ambiguousWidth: "wide" });
    expect(drawn).toHaveLength(6);
    expect(drawn[4], "the lowest reading, and it is not a space").not.toBe(" ");
  });

  it("T1.13b (I4): the marker is the same character in every ramp, because absence is not a magnitude", () => {
    // A tiered marker would make a `spark` column read differently on two
    // terminals for the same data — and it would have to be a step of some ramp
    // to be tiered, which is the collision the ASCII choice avoids.
    const WIDE = { ...FULL_CAPS, ambiguousWidth: "wide" as const };
    for (const caps of [FULL_CAPS, ASCII_CAPS, WIDE]) {
      expect(sparkline([1, Number.NaN, 9], 3, caps)).toContain("?");
      expect(cells(sparkline([1, Number.NaN, 9], 3, caps), caps.ambiguousWidth)).toBe(3);
    }
  });

  it("T1.13: the ASCII ramp is used under `unicode: 'ascii'`", () => {
    expect(sparkline([1, 5, 9], 3, ASCII_CAPS)).toBe(".+@");
    expect([...RAMP_ASCII]).toHaveLength(8);
    expect([...RAMP_UNICODE]).toHaveLength(8);
  });
});

describe("C12 tier 1 — the ASCII ramp fold", () => {
  it("T1.2: a ramp cell shows the tallest fill its dots reach", () => {
    // A ramp glyph is a fill height, not a set of dots, so the topmost inked
    // subrow decides it. Taking the lowest would draw the curve's underside.
    const grid = createGrid(1, 8);
    setDot(grid, 0, 7);
    expect(foldRamp(grid, RAMP_UNICODE)[0]).toBe("▁");

    const tall = createGrid(1, 8);
    setDot(tall, 0, 0);
    expect(foldRamp(tall, RAMP_UNICODE)[0]).toBe("█");
  });

  it("T1.2: an un-inked ramp cell is a space", () => {
    expect(foldRamp(createGrid(3, 8), RAMP_UNICODE)[0]).toBe("   ");
  });
});

describe("C12 tier 1 — strip arithmetic", () => {
  it("T3.11 (I7): three series at height 8 are 4, 2, 2 — the remainder leads", () => {
    expect(stripHeights(8, 3)).toEqual([4, 2, 2]);
  });

  it("T3.10 (I7): two series at height 8 are 4 and 4", () => {
    expect(stripHeights(8, 2)).toEqual([4, 4]);
  });

  it("T3.11b (I8): more series than rows is null, never a zero-height strip", () => {
    // A zero-height strip is a series silently dropped, which is the failure I8
    // exists to name. The caller renders the first series plus a legend.
    expect(stripHeights(4, 10)).toBeNull();
    expect(stripHeights(4, 5)).toBeNull();
    expect(stripHeights(4, 4)).toEqual([1, 1, 1, 1]);
  });

  it("T3.11c (I7): Σ strips equals height for n 1..12 × height 1..20", () => {
    // Property-tested rather than spot-checked, because the failure is one row
    // at a time on whichever surface happens to show three series.
    for (let n = 1; n <= 12; n += 1) {
      for (let h = 1; h <= 20; h += 1) {
        const heights = stripHeights(h, n);
        if (heights === null) {
          expect(n, `n=${String(n)} h=${String(h)} returned null`).toBeGreaterThan(h);
          continue;
        }
        const total = heights.reduce((a, b) => a + b, 0);
        expect(total, `n=${String(n)} h=${String(h)}`).toBe(h);
      }
    }
  });
});

describe("C12 I17 — the heatmap", () => {
  const MATRIX = [
    { values: [1, 2, 3, 4, 5, 6, 7, 8], label: "api" },
    { values: [8, 7, 6, 5, 4, 3, 2, 1], label: "db" },
  ] as const;

  const heat = (over: Partial<Plot> = {}): Plot =>
    block({
      kind: "plot",
      id: "hm",
      form: "heatmap",
      height: 2,
      series: [...MATRIX],
      ...over,
    } as Plot);

  const rowsOf = (b: Plot, width = 40, caps = FULL_CAPS): readonly string[] =>
    measurable({ definitions: [plotDefinition], theme: DARK_THEME, capabilities: caps })
      .renderToLines(b, width)
      // The ESC as well as the CSI body: the usual `/\[[0-9;]*m/` leaves a bare
      // `\u001b` behind, which is invisible in a snapshot and is not invisible to
      // an anchored regex.
      .map((l) => l.replace(/\u001b\[[0-9;]*m/gu, ""));

  it("T1.17 (I17): a matrix and a stack of lines with the same data do not render identically", () => {
    // **The row to write first.** Every other assertion about a heatmap passes
    // against a heatmap that fell into the line arm — the height is right, the
    // width is right, the rows are right — so if these two match, the form
    // member is not reaching the renderer and nothing else says so.
    const asLine = block({
      kind: "plot",
      id: "hm",
      form: "line",
      height: 2,
      axes: true,
      series: [...MATRIX],
    } as Plot);

    expect(rowsOf(heat()).join("\n")).not.toBe(rowsOf(asLine).join("\n"));

    // And the difference is the one that matters, not incidental furniture: a
    // heatmap's cells come from the density ramp, which the line form never
    // draws at all.
    const density = [...RAMP_DENSITY];
    expect(rowsOf(heat()).some((r) => density.some((g) => r.includes(g)))).toBe(true);
  });

  it("T1.18 (I17): the range is shared across rows, so equal values draw equal glyphs", () => {
    // **What makes it a matrix rather than a stack of sparklines.** Normalised
    // per row, both rows below would span the full ramp and the picture would say
    // the two containers are equally busy — which is the comparison a heatmap
    // exists to make, inverted.
    const rows = rowsOf(
      heat({
        series: [
          { values: [0, 0, 0, 0], label: "idle" },
          { values: [100, 100, 100, 100], label: "busy" },
        ],
        height: 2,
      }),
    );
    const idle = rows[0] ?? "";
    const busy = rows[1] ?? "";
    expect(idle.trimEnd()).not.toBe(busy.trimEnd());
    expect(idle, "the floor is the ramp's first step").toContain(RAMP_DENSITY[0]);
    expect(busy, "the ceiling is its last").toContain(RAMP_DENSITY[RAMP_STEPS - 1]);
  });

  it("T1.20 (I16, I17): the heatmap's ramp is the density ramp and not the sparkline's", () => {
    // **Asserted as a difference**, because both are eight narrow braille steps:
    // a matrix drawn with `RAMP_BRAILLE` is rows of bar fragments, and every
    // count — width, height, cell total — agrees with it.
    // **The premise first, because without it this row is vacuous under exactly
    // the mutation it was written for.** Setting `RAMP_DENSITY = RAMP_BRAILLE`
    // makes the loop below skip every glyph and pass — the mutation pass reported
    // it CAUGHT ELSEWHERE, by a golden frame, and this row said nothing. A row
    // governed by one rule is a restatement of that rule.
    expect(RAMP_DENSITY, "the two ramps are different sets").not.toBe(RAMP_BRAILLE);
    const onlyBottomFilled = [...RAMP_BRAILLE].filter((g) => !RAMP_DENSITY.includes(g));
    expect(onlyBottomFilled.length, "and they differ in more than one step").toBeGreaterThan(4);

    const rows = rowsOf(heat()).slice(0, 2).join("");
    for (const g of onlyBottomFilled) {
      expect(rows, `${g} fills bottom-up and a grid cell has no vertical axis`).not.toContain(g);
    }
  });

  it("T1.21 (I17): an absent cell is blank and the minimum has ink", () => {
    // The converse of the sparkline's rule, from the other side: `?` is right
    // where a blank is already the padding, and a grid has no padding.
    const rows = rowsOf(
      heat({
        series: [
          { values: [null, null, null, null], label: "stopped" },
          { values: [1, 2, 3, 4], label: "running" },
        ],
        height: 2,
      }),
    );
    expect(rows[0], "a stopped row is quiet").not.toContain("?");
    // Blank *cells* — the label and the axis bar are furniture and stay. What
    // has to be true is that nothing was drawn in the grid, and that a reader
    // can still see which row reported nothing.
    expect(rows[0]).toMatch(/^stopped\s+│\s*$/u);
    expect(rows[1], "and the minimum is still visible").toContain(RAMP_DENSITY[0]);
  });

  it("T1.22 (C12 I18): width goes to columns first, labels truncate, and an unlabelled matrix is never drawn", () => {
    // **The state this refuses was reachable between two ordinary widths**, and
    // the comment above `layoutFor`'s fallback already called it unreadable: the
    // code produced it anyway. So the row sweeps widths rather than picking one.
    const long = heat({
      height: 2,
      series: [
        { values: [1, 2, 3, 4, 5, 6], label: "a-very-long-container-name" },
        { values: [6, 5, 4, 3, 2, 1], label: "another-long-one" },
      ],
    });

    for (const width of [40, 30, 24, 12, 8]) {
      const rows = rowsOf(long, width);
      const body = rows.slice(0, 2).join("");
      const named = /[a-z]/u.test(body);
      const drawn = [...RAMP_DENSITY].some((g) => body.includes(g));
      // The property, and it is an implication rather than two separate claims:
      // cells may only appear beside names. A matrix with no names is what A2
      // refused, and dropping the labels is how the code was producing one.
      expect(drawn && !named, `unlabelled matrix at ${String(width)}`).toBe(false);
    }

    // Rung 3: too narrow for one label cell beside a minimum area — a notice at
    // the declared height, and the height is what I1 makes non-negotiable.
    const tiny = rowsOf(long, 4);
    expect(tiny, "the declared height survives the narrowest width").toHaveLength(4);
    // The prefix, because rung 3 is only reachable below seven cells and a
    // notice that fits there says almost nothing — which is the honest floor
    // rather than a defect. What matters is that it is a *notice*: no ramp glyph
    // appears, so nothing is drawn that a reader would take for data.
    expect(tiny.join("")).toMatch(/Too/u);
    for (const g of [...RAMP_DENSITY]) {
      expect(tiny.join(""), "nothing that reads as a cell").not.toContain(g);
    }
  });

  it("T1.23 (C12 I19): the legend keeps its range where it used to lose it", () => {
    // **The row that justifies refusing `axes: false`, silently losing the thing
    // it exists to state.** Aligned to the plot area, a 26-cell label column left
    // it `⠄⠔⠖⠶⠷⠿⡿⣿  1…` — the swatch survived and the range did not, which is
    // the wrong half by the legend's own argument.
    const long = heat({
      height: 2,
      yFormat: "percent",
      series: [
        { values: [1, 2, 3, 4, 5, 6], label: "a-very-long-container-name" },
        { values: [6, 5, 4, 3, 2, 1], label: "another-long-one" },
      ],
    });

    const legendOf = (w: number): string => rowsOf(long, w).slice(-1)[0] ?? "";
    expect(legendOf(40), "the range, where the old placement cut it").toContain("1% - 6%");

    // The drop order, asserted by narrowing until only one part fits: the swatch
    // goes and the range stays.
    const narrow = legendOf(12);
    expect(narrow, "the range is last to go").toContain("1% - 6%");
    expect(narrow, "and the swatch is what went").not.toContain(RAMP_DENSITY[0]);
  });

  it("T1.19 (C04 I50b): the three refusals, each with its converse", () => {
    expect(() => heat({ axes: false })).toThrow(/axes/u);
    expect(() => heat({ series: [{ values: [1, 2], tone: "ok" }] })).toThrow(/tone/u);
    expect(() =>
      heat({ series: [{ values: [1, 2] }, { values: [1, 2, 3] }] }),
    ).toThrow(/ordinate/u);
    expect(() => block({ kind: "plot", id: "h", form: "heatmap", series: [] } as Plot)).toThrow(
      /height/u,
    );

    // The control: a heatmap declaring none of them constructs. Without it every
    // row above passes for a constructor that refuses every heatmap.
    expect(() => heat()).not.toThrow();
  });

  it("T1.1 (I1): a heatmap's height is declared, and its row count is data", () => {
    // The property the whole component rests on, at the one form where the data
    // has a row count of its own to be confused with.
    expect(plotHeight({ form: "heatmap", height: 4 })).toBe(6);
    expect(rowsOf(heat({ height: 4 })), "two rows of data, four declared, plus two").toHaveLength(6);
    expect(
      rowsOf(heat({ height: 2, series: [...MATRIX, { values: [1, 1, 1, 1, 1, 1, 1, 1], label: "c" }] })),
      "three rows into two still measures two plus two",
    ).toHaveLength(4);
  });

  it("T1.1 (I8): rows that do not fit are named, never dropped in silence", () => {
    const rows = rowsOf(
      heat({
        height: 2,
        series: [...MATRIX, { values: [1, 1, 1, 1, 1, 1, 1, 1], label: "third" }],
      }),
    );
    expect(rows.join("\n")).toContain("+2 more");
    expect(rows.join("\n")).toContain("third");
  });
});
