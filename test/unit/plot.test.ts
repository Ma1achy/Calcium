// C12 tier 1 — the rasteriser and the scaling core, in isolation.
//
// Almost everything here is asserted against the *dot grid* rather than against a
// rendered frame, because that is where the two invariants that nearly did not
// compose (I5, I14) actually meet. A row of braille reads as a curve to a person
// and says very little to an assertion; the grid says exactly which columns carry
// ink.
import { describe, expect, it } from "vitest";
import { formatValue, labelWidth, niceAxis, xLabelRow } from "../../src/presentation/plot/axes.js";
import { gutter } from "../support/plot-forms.js";
import { curveRows } from "../../src/presentation/plot/curve.js";
import { plotAreaWidth, plotHeight } from "../../src/presentation/plot/height.js";
import { composeRows } from "../../src/presentation/plot/furniture.js";
import {
  BRAILLE_DOTS,
  createGrid,
  drawLine,
  foldBraille,
  foldRamp,
  setDot,
} from "../../src/presentation/plot/raster.js";
import {
  ladderFor,
  pairFor,
  RAMP_ASCII,
  RAMP_BRAILLE,
  RAMP_DENSITY,
  RAMP_STEPS,
  RAMP_UNICODE,
} from "../../src/presentation/plot/ramp.js";
import { columnsOf, finiteSamples, rowOf, seriesRange, FACING_DEFAULT } from "../../src/presentation/plot/scale.js";
import { sparkline } from "../../src/presentation/plot/sparkline.js";
import { valueBar } from "../../src/presentation/plot/bar.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { block, validateBlock, type Plot } from "../../src/data/viewmodel/index.js";
import { DARK_THEME, measurable, visible } from "../support/render.js";
import { stripHeights } from "../../src/presentation/plot/strips.js";
import { cells } from "../../src/presentation/text.js";
import { lossCurve } from "../support/blocks.js";
import { ASCII_CAPS, FULL_CAPS, MONO_UNICODE_CAPS } from "../support/render.js";

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
    // 8 + 3: the frame's lid, the axis rule, then the x-labels (§2, FRAME_ROWS).
    expect(plotHeight({ form: "line", height: 8, axes: true })).toBe(11);
  });

  it("T1.1 (I1): and it is independent of the series, including empty", () => {
    // The type is the guarantee — `plotHeight` takes `PlotGeometry`, so a series
    // cannot reach it. This asserts the consequence a reader cares about: the
    // same three fields give the same answer whatever the data was.
    const geometry = { form: "line", height: 6, axes: true } as const;
    expect(plotHeight(geometry)).toBe(9);
    expect(plotHeight({ ...geometry })).toBe(9);
  });

  it("T1.1b (I24): the compositor reconciles its rows against the declared height", () => {
    // **A guard whose trigger has not fired, kept on the asymmetry** and given a
    // test that constructs the state, because a mutation that fails nothing is a
    // finding about the tests. No form routed through `composeRows` gets the
    // count wrong today — the mutation pass swapping the clamp out killed
    // nothing — and four forms outside it do: `radar` and `horizon` declare
    // `axedFurniture` and draw none of it, measuring three rows more than they
    // render, and `smallmultiples`/`pairplot` return whatever the facet layout
    // produced. That is the state this exists for, one seam away.
    //
    // Padding rather than throwing: I2 says no series input throws, and the
    // caller is a renderer. A short block is filled and a long one is cut, so
    // the declared height is what ships whatever a form does.
    expect(composeRows(5, ["top"], ["a", "b"], ["rule", "labels"])).toEqual([
      "top", "a", "b", "rule", "labels",
    ]);
    // Short by two — the form forgot its furniture.
    expect(composeRows(5, [], ["a", "b", "c"], [])).toEqual(["a", "b", "c", "", ""]);
    // Long by two — the form spent rows it never declared, which is the failure
    // that moves every block below it.
    expect(composeRows(3, ["top"], ["a", "b"], ["rule", "labels"])).toEqual(["top", "a", "b"]);
  });

  it("T1.1 (I1): the plot area is width − labels − 2 − the frame's right edge", () => {
    // The gutter is a space and the `│`, with the data flush against the axis —
    // S04 §3 and S11 §2 both drew two cells and §2 declared three (HEIGHT_AUDIT,
    // the fifth verdict). **The third cell is the frame's right edge and not a
    // margin**, which is the distinction that verdict turned on: a margin is a
    // habit from charts that have one, and a border is a mark. At width 48 with
    // a 4-cell label column that is 41.
    expect(plotAreaWidth(48, 4, true)).toBe(41);
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
    const glyphRows = curveRows(series, { min: 0, max: 10 }, 20, 1, FULL_CAPS, FACING_DEFAULT);
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
    expect(interiorGaps(curveRows(series, { min: 0, max: 100 }, 20, 4, FULL_CAPS, FACING_DEFAULT))).toEqual([]);
  });
});

describe("C12 tier 1 — degenerate series", () => {
  it("T1.5 (I3): a constant series is a flat centred line with no NaN", () => {
    const range = seriesRange([{ values: [3, 3, 3, 3] }], {});
    expect(range).toEqual({ min: 3, max: 3 });
    if (range === null) throw new Error("unreachable");

    // 16 dot rows, so the centre is 7 — and no division by a zero range.
    expect(rowOf(3, range, 16, FACING_DEFAULT)).toBe(7);
    expect(Number.isNaN(rowOf(3, range, 16, FACING_DEFAULT))).toBe(false);

    const glyphRows = curveRows({ values: [3, 3, 3, 3] }, range, 12, 4, FULL_CAPS, FACING_DEFAULT);
    expect(glyphRows.join("")).not.toContain("NaN");
    // One row of ink, in the middle of four.
    const inked = glyphRows.map((line) => [...line].some((c) => c !== "⠀"));
    expect(inked).toEqual([false, true, false, false]);
  });

  it("T1.5 (I3): all three y-labels show the constant value", () => {
    const labels = gutter({ min: 3, max: 3 }, 5, "number");
    expect(labels.map((l) => l.text)).toEqual(["3", "3", "3"]);
  });

  it("T1.6 (I3): a single point is one dot at the vertical centre", () => {
    const range = seriesRange([{ values: [7] }], {});
    if (range === null) throw new Error("unreachable");

    const glyphRows = curveRows({ values: [7] }, range, 12, 4, FULL_CAPS, FACING_DEFAULT);
    const inked = inkedColumns(glyphRows);
    expect(inked).toHaveLength(1);

    // Horizontally centred: `first` and `last` are the same sample, so the rule
    // mapping one to each edge has no answer and the centre picks no side.
    expect(inked[0]).toBe(Math.floor((24 - 1) / 2));
  });

  it("T1.7: an empty series has no samples and no columns", () => {
    expect(finiteSamples([])).toEqual([]);
    expect(columnsOf([], 0, 40, FACING_DEFAULT)).toEqual([]);
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
    const gaps = interiorGaps(curveRows({ values }, range, 20, 4, FULL_CAPS, FACING_DEFAULT));
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
    const columns = columnsOf(samples, values.length, 112, FACING_DEFAULT);

    // The column holding the spike keeps it as its maximum. Averaging would give
    // that column ~1.9, and every-nth sampling would miss index 5,000 entirely —
    // which is T6.4's revert, and the reason this is a per-column max.
    const spiked = columns.filter((c) => c.max === 99);
    expect(spiked).toHaveLength(1);

    const range = seriesRange([{ values }], {});
    if (range === null) throw new Error("unreachable");
    const glyphRows = curveRows({ values }, range, 56, 8, FULL_CAPS, FACING_DEFAULT);
    // Top row inked: the spike reaches the ceiling of the plot area.
    expect([...(glyphRows[0] ?? "")].some((c) => c !== "⠀")).toBe(true);
  });

  it("T1.10 (I5): a column keeps four values, not two", () => {
    // The composition C12 §3 records. `first` and `last` are what I14 joins to
    // its neighbours; `min` and `max` are what I5 preserves. Dropping either pair
    // breaks the other invariant, and this is the assertion that says so.
    const values = [5, 1, 9, 3];
    const columns = columnsOf(finiteSamples(values), 4, 1, FACING_DEFAULT);
    expect(columns).toEqual([{ x: 0, first: 5, min: 1, max: 9, last: 3, iFirst: 0, iLast: 3 }]);
  });

  it("T1.11: three points spread across the full width and join", () => {
    const values = [1, 5, 2];
    const columns = columnsOf(finiteSamples(values), 3, 112, FACING_DEFAULT);
    expect(columns.map((c) => c.x)).toEqual([0, 56, 111]);

    const range = seriesRange([{ values }], {});
    if (range === null) throw new Error("unreachable");
    expect(interiorGaps(curveRows({ values }, range, 56, 8, FULL_CAPS, FACING_DEFAULT))).toEqual([]);
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
    const asFraction = gutter({ min: 0, max: 1 }, 5, "fraction");
    const asPercent = gutter({ min: 0, max: 100 }, 5, "percent");

    expect(labelWidth(asFraction), "`100%` is four cells").toBe(4);
    expect(labelWidth(gutter({ min: 0, max: 0.5 }, 5, "fraction")), "`50%` is three").toBe(3);
    expect(labelWidth(asPercent)).toBe(4);
  });

  it("T1.12 (§3d): labels share one precision, and it is the step's own", () => {
    // **Two rulings, one row.** The precision is shared — formatting each label
    // on its own magnitude gave `0.86`, `0.4737`, `0.0874`, a midpoint two cells
    // wider than its siblings — and it now comes from the **step** rather than
    // the span, which is the smallest gap two adjacent labels can differ by.
    //
    // And the shared precision is *kept in the string*: `Number(v.toFixed(2))`
    // stripped the trailing zero, so one precision came out as three — `0.2`
    // beside `0.15` beside `0.1`, which is the exact thing sharing prevents
    // (F177).
    const labels = gutter({ min: 0.0874, max: 0.86 }, 8, "number");
    const texts = labels.map((l) => l.text);
    expect(texts).toEqual(["1.0", "0.5", "0.0"]);
    expect(new Set(texts.map((t) => t.split(".")[1]?.length)).size, "one precision").toBe(1);
    expect(labelWidth(labels), "and the column is narrower for it").toBe(3);
  });

  it("T1.12 (§3d): a step's decimals are exact, not two significant figures", () => {
    // `decimalsFor` answers *two significant figures of this magnitude*, which is
    // right for a lone value and over-answers about a step: a step of 5 came back
    // as one place, so an integer ladder drew `40.0 · 35.0 · 30.0`. Read from a
    // frame at height 20 — the common height of 8 has too few rungs to show it.
    const integers = gutter({ min: 0, max: 40 }, 20, "number");
    expect(integers.map((l) => l.text)).toContain("35");
    expect(integers.map((l) => l.text).some((t) => t.includes(".")), "no spurious decimal").toBe(
      false,
    );

    // **The row that separates the step from the span**, which the first version
    // did not: `decimalsFor(40)` and `stepDecimals(5)` are both zero, so a
    // mutation swapping them survived sixteen assertions. Here the step is 2.5
    // over a span of 10 — one place against the span's zero — and reading the
    // span rounds every quarter-tick to an integer it is not.
    const quarters = gutter({ min: 0, max: 10 }, 12, "number").map((l) => l.text);
    expect(quarters, "a 2.5 step needs the place the span says it does not").toContain("7.5");
    expect(quarters).toContain("2.5");
  });

  it("T1.12 (§3d, C04 I29): the bounds snap outward, and a pinned bound never moves", () => {
    // **The rule interaction this pass exists for.** Loose labelling extends the
    // range so the ends are round; a pinned axis exists so two plots can be
    // compared, and one that silently grew would defeat exactly that. So the
    // snap is per end.
    const derived = gutter({ min: 3, max: 87 }, 8, "number");
    expect(derived[0]?.text, "a derived top snaps up to a nice number").toBe("100");

    const pinnedTop = gutter({ min: 3, max: 87 }, 8, "number", { yMax: 87 });
    expect(pinnedTop[0]?.text, "a declared top is the top").toBe("87");

    const pinnedBoth = gutter({ min: 3, max: 87 }, 8, "number", { yMin: 3, yMax: 87 });
    expect(pinnedBoth[0]?.text).toBe("87");
    expect(pinnedBoth[pinnedBoth.length - 1]?.text).toBe("3");
  });

  it("T1.12 (§3d): a tick that would abut its neighbour is dropped", () => {
    // The density rule, and it was read from a frame: a five-tick ceiling over
    // eight rows put `50%` and `25%` on rows 4 and 5, because `rowOf` rounds and
    // eight rows cannot evenly host five ticks. Two labels touching read as one
    // two-line label.
    // **The case that actually abuts, found by sweeping rather than assumed.**
    // The first version swept `0 … 100` at five heights and never produced two
    // adjacent rows, so removing the rule failed nothing — sixteen assertions
    // agreeing about a clause none of them reached. At height 3 a range of
    // `5 … 63` snaps to `0 … 100` with a step of 50, and the three ticks land on
    // rows 0, 1 and 2: the midpoint touches both ends.
    const tight = gutter({ min: 5, max: 63 }, 3, "number");
    expect(tight.map((l) => l.row), "the abutting midpoint is dropped").toEqual([0, 2]);
    expect(tight.map((l) => l.text)).toEqual(["100", "0"]);

    for (const [lo, hi, h] of [
      [0, 100, 3], [0, 100, 5], [0, 100, 8], [0, 100, 12], [0, 100, 20],
      [5, 63, 3], [5, 63, 4], [392, 960, 4], [0, 7, 3], [2, 29, 4], [0.087, 0.86, 9],
    ] as const) {
      const rows = gutter({ min: lo, max: hi }, h, "number").map((l) => l.row);
      const gaps = rows.slice(1).map((r, i) => r - (rows[i] ?? 0));
      expect(
        gaps.every((g) => g >= 2),
        `${String(lo)}..${String(hi)} at height ${String(h)}: rows ${rows.join(",")}`,
      ).toBe(true);
    }
  });

  it("T1.12 (I2, F178): a step that underflows to zero does not poison the range", () => {
    // **The hang, and it was three modules from its cause.** A denormal span
    // underflows `10 ** exponent`, so `niceNumber` returns 0, `floor(min / 0) * 0`
    // is `NaN`, and the rasteriser's `x === ex` stop condition is never true
    // against `NaN` — `drawLine` runs forever. Every count in `niceAxis` agreed.
    const axis = niceAxis({ min: 5e-324, max: 1e-323 }, 3, {});
    expect(Number.isFinite(axis.range.min) && Number.isFinite(axis.range.max)).toBe(true);
    expect(axis.range, "a step it cannot pick leaves the range alone").toEqual({
      min: 5e-324,
      max: 1e-323,
    });
    expect(axis.ticks.every((t) => Number.isFinite(t))).toBe(true);
  });

  it("T1.12 (I2): a denormal range formats rather than throwing", () => {
    // `decimalsFor` wanted 325 decimals for a span of 5e-324 and `toFixed` throws
    // above 100, so the RangeError came out of the renderer — I2 broken by a label
    // rather than by the grid. A value that rounds to zero and is not zero goes to
    // exponential, because a floor reading `0` when it is not is wrong in the one
    // direction a reader cannot detect.
    expect(() => gutter({ min: 5e-324, max: 1e-323 }, 5, "number")).not.toThrow();
    expect(formatValue(5e-324, "number")).toBe("4.9e-324");
    expect(formatValue(1e300, "number")).toBe("1.0e+300");
  });

  it("T1.12 (I15): labels collapse from the middle outward", () => {
    const range = { min: 0, max: 10 };
    expect(gutter(range, 5, "number").map((l) => l.text)).toEqual(["10", "5", "0"]);
    expect(gutter(range, 2, "number").map((l) => l.text)).toEqual(["10", "0"]);
    expect(gutter(range, 1, "number").map((l) => l.text)).toEqual(["10"]);
  });

  it("T1.12 (I15): and they sit at the max, mid and min rows", () => {
    expect(gutter({ min: 0, max: 10 }, 7, "number").map((l) => l.row)).toEqual([0, 3, 6]);
  });

  it("T3.8: x-labels keep a cell between them or are dropped", () => {
    // Not merely "do not overlap": at width 22 a seven-cell left label and a
    // centred one both wanted cell 7, and `epoch 0epoch …` reads as one label.
    const row = xLabelRow(["epoch 0", "epoch 20", "now"], 22, FULL_CAPS);
    expect(row).not.toContain("0epoch");
    expect(row.length).toBeLessThanOrEqual(22);
  });
});

describe("C12 I23 — annotations", () => {
  const kit = (caps = FULL_CAPS): ReturnType<typeof measurable> =>
    measurable({ definitions: [plotDefinition as never], capabilities: caps });

  const plotWith = (annotations: unknown[]): ReturnType<typeof block> =>
    block({
      kind: "plot",
      id: "ann",
      form: "line",
      height: 8,
      axes: true,
      yMin: 0,
      yMax: 100,
      series: [{ values: [10, 20, 30, 40, 50, 60, 70, 80] }],
      annotations,
    } as never);

  it("T1.30 (I23): an annotation is dashed, so it is not a series at any depth", () => {
    // **The carrier is shape, not tone** (F34). Asserted as a *difference*
    // between the annotated and unannotated frames rather than against a glyph:
    // each frame alone is a plausible plot, and the defect this refuses is one
    // that reads as data.
    const bare = kit().renderToLines(plotWith([]), 50).map(visible);
    const lined = kit().renderToLines(plotWith([{ kind: "line", value: 50 }]), 50).map(visible);

    expect(lined).not.toEqual(bare);
    expect(lined).toHaveLength(bare.length);

    // **The cells the annotation added, not the row it is on.** The first
    // version matched `/\S\s\S/` against the whole row and the *gutter*
    // satisfies it — `100% │` is a non-blank, a blank and a non-blank — so a
    // solid line passed and the mutation was caught by a golden frame instead.
    // A row is three things; only one of them is the subject.
    const marks: number[] = [];
    lined.forEach((row, i) => {
      [...row].forEach((ch, x) => {
        if (ch !== ([...(bare[i] ?? "")][x] ?? " ") && ch.trim() !== "") marks.push(x);
      });
    });
    expect(marks.length, "the line is drawn").toBeGreaterThan(2);
    const gaps = marks.slice(1).map((x, i) => x - (marks[i] ?? 0));
    expect(
      gaps.every((g) => g > 1),
      `a dashed line leaves a cell between its marks — columns ${marks.join(",")}`,
    ).toBe(true);
  });

  it("T1.30 (I23): a band is two lines, and it is one statement", () => {
    const band = kit().renderToLines(plotWith([{ kind: "band", from: 25, to: 75 }]), 50).map(visible);
    const bare = kit().renderToLines(plotWith([]), 50).map(visible);
    const changed = band.filter((l, i) => l !== bare[i]);
    expect(changed, "two edges, and no fill between them").toHaveLength(2);

    // And the same two rows a pair of lines would produce — the band is not a
    // second mechanism, which is what makes six chart types folds of two kinds.
    const pair = kit()
      .renderToLines(plotWith([{ kind: "line", value: 25 }, { kind: "line", value: 75 }]), 50)
      .map(visible);
    expect(band).toEqual(pair);
  });

  it("T1.30 (I23, C04 I29): an edge off the scale is dropped, never clamped", () => {
    // **The one place an annotation differs from a sample.** C04 I29 clamps data
    // because pressing it against a ceiling is honest; a claim about *where* a
    // value sits, moved onto a scale it is outside, says the limit is somewhere
    // it is not.
    const bare = kit().renderToLines(plotWith([]), 50).map(visible);
    const outside = kit().renderToLines(plotWith([{ kind: "line", value: 500 }]), 50).map(visible);
    expect(outside, "nothing is drawn, and nothing is drawn at the ceiling").toEqual(bare);
  });

  it("T1.30 (I23): annotations are drawn behind every series", () => {
    // A reference line that overwrote a sample would hide the thing it exists
    // to be compared against. Layers resolve first-non-blank, so this is an
    // assertion about the order they are appended in.
    const flat = {
      kind: "plot" as const, id: "dense", form: "line" as const, height: 4, axes: false,
      yMin: 0, yMax: 1,
      series: [{ values: Array.from({ length: 60 }, () => 0.5) }],
    };
    const withLine = kit()
      .renderToLines(block({ ...flat, annotations: [{ kind: "line", value: 0.5 }] } as never), 40)
      .map(visible);
    const withoutLine = kit().renderToLines(block(flat as never), 40).map(visible);
    expect(withLine, "a flat series on the annotation's own row wins every cell").toEqual(
      withoutLine,
    );
  });

  it("T1.30 (I23): at ascii the line is cell resolution, and not the ramp fold", () => {
    // **Read from a frame.** `foldRamp` encodes height — a declared stand-in for
    // position (I21) — so a one-dot annotation folded by ink weight came out as
    // `# # # #`, heavier than the curve beside it and indistinguishable from a
    // flat series.
    // **The cells the annotation added**, not a whole row — a row carries the
    // axis rule and the curve, so asserting on it tests those too and the first
    // version did exactly that.
    const bare = kit(ASCII_CAPS).renderToLines(plotWith([]), 50).map(visible);
    const lined = kit(ASCII_CAPS)
      .renderToLines(plotWith([{ kind: "line", value: 100 }]), 50)
      .map(visible);

    const added = new Set<string>();
    lined.forEach((row, i) => {
      [...row].forEach((ch, x) => {
        if (ch !== ([...(bare[i] ?? "")][x] ?? " ") && ch.trim() !== "") added.add(ch);
      });
    });
    expect([...added], "a dash, and nothing from the height ramp").toEqual(["-"]);
  });

  it("T1.30 (C04 I52): a band's edges are finite and ordered, or it is not a document", () => {
    const bad = (annotations: unknown[]): readonly string[] => {
      const v = validateBlock(plotWith(annotations));
      return v.ok ? [] : v.error;
    };
    expect(bad([{ kind: "band", from: 85, to: 60 }]).join(" ")).toContain("above");
    expect(bad([{ kind: "line", value: Number.NaN }]).join(" ")).toContain("finite");
    expect(bad([{ kind: "band", from: 0, to: 10 }]), "a good one passes").toEqual([]);

    // **And the series check still runs**, which is what the extracted helper is
    // for: written as a guard at the top of `plot` it returned early for every
    // plot carrying no annotation — deleting the validation below it.
    const noAnnotations = block({
      kind: "plot", id: "p", form: "line", height: 4, series: [{ values: [1, "x"] }],
    } as never);
    expect(validateBlock(noAnnotations).ok, "a bad series is still refused").toBe(false);
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
    expect(rowOf(1.6, range, 16, FACING_DEFAULT)).toBe(0);
    expect(rowOf(-0.4, range, 16, FACING_DEFAULT)).toBe(15);
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

  it("T1.13 (I13): fewer values than cells fill from the left, and nothing moves as they arrive", () => {
    // **The old row asserted the other anchor and its comment argued for this
    // one.** *"Three samples so far, growing rightward — not as a stretched
    // curve that changes shape as it fills"* is true of both anchors, because
    // what it argues against is *stretching*. The second assertion is the one
    // that tells them apart, and it is the behaviour that sentence describes: a
    // glyph already drawn stays where it is when the next sample lands. C12 §B3.
    expect(sparkline([1, 2, 3], 8, FULL_CAPS)).toBe("▁▅█     ");
    expect(sparkline([1, 2, 3, 4], 8, FULL_CAPS).startsWith("▁")).toBe(true);
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
    expect(sparkline([1, 2, 3, Number.NaN, 7, 8, 9], 12, FULL_CAPS)).toBe("▁▂▃?▆▇█     ");

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
    expect(sparkline([1, 2, 3, null, 7, 8, 9], 12, FULL_CAPS)).toBe("▁▂▃?▆▇█     ");
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
    // padding already uses for *fewer samples than cells*. Every width and
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

    // The measured case: the minimum must not be the padding beside it. Index 0
    // since C12 §B3 — the readings fill from the left and the pad is the tail.
    const drawn = sparkline([0, 5], 6, { ...FULL_CAPS, ambiguousWidth: "wide" });
    expect(drawn).toHaveLength(6);
    expect(drawn[0], "the lowest reading, and it is not a space").not.toBe(" ");
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

  /** The rows as the terminal receives them — styling intact. */
  const styledRowsOf = (b: Plot, width = 40, caps = FULL_CAPS): readonly string[] =>
    measurable({ definitions: [plotDefinition], theme: DARK_THEME, capabilities: caps })
      .renderToLines(b, width);

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

    // And the difference is the one that matters, not incidental furniture —
    // **stated at both rungs, because C12 I29 moved which channel carries it.**
    // Above 8-bit a cell is a painted blank and the background is the reading;
    // below it, the density ramp takes over. Asserting the ramp alone was true
    // until painting landed and then failed while I17 held perfectly.
    const painted = measurable({ definitions: [plotDefinition], theme: DARK_THEME, capabilities: FULL_CAPS })
      .renderToLines(heat(), 40);
    expect(painted.some((r) => /\u001b\[48;/u.test(r)), "the matrix paints its cells").toBe(true);

    const density = [...RAMP_DENSITY];
    expect(
      rowsOf(heat(), 40, MONO_UNICODE_CAPS).some((r) => density.some((g) => r.includes(g))),
      "and falls back to the ramp where colour cannot carry it",
    ).toBe(true);
  });

  it("T1.18 (I17): the range is shared across rows, so equal values draw equal glyphs", () => {
    // **What makes it a matrix rather than a stack of sparklines.** Normalised
    // per row, both rows below would span the full ramp and the picture would say
    // the two containers are equally busy — which is the comparison a heatmap
    // exists to make, inverted.
    const spec = heat({
      series: [
        { values: [0, 0, 0, 0], label: "idle" },
        { values: [100, 100, 100, 100], label: "busy" },
      ],
      height: 2,
    });

    // **The shared range is the claim, and the ramp is only how it used to be
    // read.** C12 I29 made the cell a painted blank above 8-bit, so the floor
    // stopped being `RAMP_DENSITY[0]` and this row failed against a renderer
    // that was answering it correctly. Both rungs now, floor and ceiling on
    // each, which is the property rather than the channel.
    const painted = measurable({ definitions: [plotDefinition], theme: DARK_THEME, capabilities: FULL_CAPS })
      .renderToLines(spec, 40);
    const bg = (row: string): readonly string[] => [...row.matchAll(/\u001b\[48;[0-9;]*m/gu)].map((m) => m[0]);
    expect(new Set(bg(painted[0] ?? "")).size, "one colour across an all-equal row").toBe(1); // cells-ok — a set size
    expect(new Set(bg(painted[1] ?? "")).size, "and one across the other").toBe(1); // cells-ok — a set size
    expect(bg(painted[0] ?? "")[0], "the two rows are not the same colour")
      .not.toBe(bg(painted[1] ?? "")[0]);

    const rows = rowsOf(spec, 40, MONO_UNICODE_CAPS);
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

  it("T1.21 (I17, C12 I29): an absent cell and the minimum are distinguishable at every rung", () => {
    // The converse of the sparkline's rule, from the other side: `?` is right
    // where a blank is already the padding, and a grid has no padding.
    //
    // **This row used to assert the ramp glyph, which is the mechanism rather
    // than the property**, and C12 I29 moved the mechanism: above 8-bit a cell is
    // a painted blank and the *background* is the reading. The minimum stopped
    // having a glyph and the row failed while the invariant it names held
    // perfectly. So it now asks the question I17 actually poses — can a reader
    // tell *nothing happened* from *the least that happened* — at both rungs of
    // the ladder, which is stronger than what it replaced.
    const spec = heat({
      series: [
        { values: [null, null, null, null], label: "stopped" },
        { values: [1, 2, 3, 4], label: "running" },
      ],
      height: 2,
    });

    const plain = rowsOf(spec);
    expect(plain[0], "a stopped row is quiet").not.toContain("?");
    // Blank *cells* — the label and the axis bar are furniture and stay. The
    // tick, not the plain border: the row is labelled, and §3f's rule is that a
    // labelled row carries one wherever it is reached.
    expect(plain[0]).toMatch(/^stopped\s+┤\s*$/u);

    // Rung 1 — colour leads. The minimum is a painted **blank**, so the carrier
    // is a background sequence, and the absent row has none.
    const painted = styledRowsOf(spec, 40, FULL_CAPS);
    expect(painted[1], "the minimum is painted").toMatch(/\u001b\[48;/u);
    expect(painted[0], "and nothing paints an absent row").not.toMatch(/\u001b\[48;/u);

    // **And the cell is blank, which is the half a background check misses.**
    // A renderer that painted the background *and* kept the density glyph
    // satisfies every assertion above and is exactly the dithered speckle C12 I29
    // exists to end — a foreground glyph occupies its cell whatever colour goes
    // behind it. Found by mutation: swapping the space back for the glyph killed
    // nothing until this row existed.
    const grid = (rowsOf(spec, 40, FULL_CAPS)[1] ?? "").split("┤")[1] ?? "";
    expect(grid.trim(), "a painted cell carries no glyph").toBe("");

    // Rung 3 — no colour to lead with, so the density ramp carries it again.
    // Without this the row would pass against a renderer that painted at every
    // depth and left a 1-bit terminal with an empty grid.
    const mono = rowsOf(spec, 40, MONO_UNICODE_CAPS);
    expect(mono[1], "and the ramp carries it where colour cannot").toContain(RAMP_DENSITY[0]);
    expect(mono[0]).toMatch(/^stopped\s+┤\s*$/u);

    // **The legend descends the same ladder as the cell**, and it has to be
    // asserted separately: the rung is chosen from whether `continuousColour`
    // answers, not from whether a colormap is *named*, and the block names one
    // at every depth. Asking the wrong question drew eight blank cells where the
    // swatch belongs — a legend with a hole in it, the same width as a correct
    // one. Another mutation survivor before this row.
    expect(mono.slice(-1)[0] ?? "", "the swatch returns where the bar cannot")
      .toContain(RAMP_DENSITY[0]);
  });

  it("T1.24 (C12 §3o): a matrix shorter than its width stretches, and can be anchored", () => {
    // **The reported defect**: *AXES | MASSIVE GAP OF NOTHING | HEAT MAP* — the
    // `"window"` arm emits `null` for the leading columns when there are fewer
    // readings than cells, and `null` is a blank. Correct for a live feed, where
    // the column a reading occupies must not move; worth less than the width,
    // which is what the report said.
    const sparse = heat({ series: [{ values: [1, 5, 3, 9], label: "r" }], height: 1 });
    const stretched = rowsOf(sparse, 40, MONO_UNICODE_CAPS)[0] ?? "";
    const area = stretched.split("┤")[1] ?? "";
    expect(area.trimStart(), "no blank fringe").toBe(area);
    expect(area.trimEnd().length, "and the readings fill the width").toBeGreaterThan(20); // cells-ok — a cell count

    // The anchor is still available, and it is what it was.
    const anchored = rowsOf({ ...sparse, matrixAnchor: "window" } as Plot, 40, MONO_UNICODE_CAPS)[0] ?? "";
    const anchoredArea = anchored.split("┤")[1] ?? "";
    expect(anchoredArea.startsWith(" "), "blanks at the left").toBe(true);
    expect(anchoredArea.trimEnd().endsWith(" "), "and the newest at the right").toBe(false);

    // And `left` is the third: the *oldest* column is the fixed one.
    const leftward = rowsOf({ ...sparse, matrixAnchor: "left" } as Plot, 40, MONO_UNICODE_CAPS)[0] ?? "";
    const leftArea = leftward.split("┤")[1] ?? "";
    expect(leftArea.startsWith(" "), "no blanks at the left").toBe(false);
    expect(leftArea.trimEnd().length, "and blanks at the right").toBeLessThan(20); // cells-ok — a cell count
  });

  it("T1.19b (C04 I50b): the refusal is the matrix family's, not the heatmap's", () => {
    // `checkHeatmap` tested `form === "heatmap"` and C04 I50b's reason — the scale
    // legend is the only thing saying what a cell means — is true of all eight.
    // Found by `utilisation` accepting the flag and rendering 18 rows into 16.
    for (const form of ["heatmap", "calendar", "correlation", "confusion",
      "spectrogram", "latency", "density2d", "utilisation"] as const) {
      expect(() => block({
        kind: "plot", id: "m", form, height: 2, axes: false,
        series: [{ values: [1, 2] }],
      } as Plot), form).toThrow(/axes: false/u);
    }
    // And the converse, so the row is not passing on a message that never fires.
    expect(() => block({
      kind: "plot", id: "m", form: "line", height: 2, axes: false,
      series: [{ values: [1, 2] }],
    } as Plot)).not.toThrow();
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

    // **Both bounds, not the dash.** C12 I29 made the swatch a colour bar and
    // granite's shape brackets it — `1% ▮▮▮▮▮▮▮▮ 6%` — so the bounds now sit at
    // the two ends they name rather than trailing the swatch together. What I19
    // claims is that the *range* survives, and that is what is asserted.
    const wide = legendOf(40);
    expect(wide, "the lower bound, where the old placement cut it").toContain("1%");
    expect(wide, "and the upper").toContain("6%");

    // The drop order, asserted by narrowing until only one rung fits: the
    // swatch goes and the range stays, in whichever form still fits.
    const narrow = legendOf(12);
    expect(narrow, "the range is last to go").toContain("1% - 6%");
    expect(narrow, "and the swatch is what went").not.toContain(RAMP_DENSITY[0]);
    // **From the styled rows, because `rowsOf` strips SGR** — asserted against
    // the plain text this could not fail, which is an absence assertion that
    // asserts nothing. The painted bar has to be looked for where it would be.
    const narrowStyled = styledRowsOf(long, 12).slice(-1)[0] ?? "";
    expect(narrowStyled, "including its painted form").not.toMatch(/\u001b\[48;/u);
    // And the fixture responds: at a width that fits, the bar *is* painted.
    expect(styledRowsOf(long, 40).slice(-1)[0] ?? "", "the fixture can show a bar at all")
      .toMatch(/\u001b\[48;/u);
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

describe("C12 I20 — the value bar, the `fill` encoding", () => {
  const draw = (spec: Parameters<typeof valueBar>[0], width = 20, caps = FULL_CAPS): string =>
    valueBar(spec, width, caps);

  it("T1.25 (I20, C09 I28): the fill clamps at the scale's top and the number does not", () => {
    // **One ruling for both fill forms now.** A per-core CPU percentage has no
    // knowable ceiling, so a bar that stopped at its top would draw a busy
    // container exactly like a saturated one — asserted as a *difference*,
    // because each frame alone is plausible and the defect was that they matched.
    const over = draw({ value: 101.2, max: 100, format: "percent" });
    const full = draw({ value: 100, max: 100, format: "percent" });

    // `101.2%`, not `101%` — a bar's number is a readout and not a tick (F175).
    expect(over).toContain("101.2%");
    expect(over).not.toBe(full);
    expect(cells(over, "narrow"), "and the run still stops at its cells").toBe(20);

    // **A large overshoot, because 101 of 100 does not distinguish the clamp.**
    // The mutation pass found this: unclamping the fill survived every row here,
    // since `round(1.012 * run)` is already `run` and the width is held by the
    // truncation either way. At 500% an unclamped run is 75 cells in a 20-cell
    // column, so the *number* is what the truncation eats — the reading
    // disappears and the bar looks merely full.
    const wild = draw({ value: 500, max: 100, format: "percent" }, 20);
    expect(cells(wild, "narrow")).toBe(20);
    expect(wild, "the number survives an overshoot of any size").toContain("500.0%");
  });

  it("T1.26 (I20, C04 I50c): an absent value is a mark, not an empty run", () => {
    // **The one geometry where an empty drawing is a legible value.** A blank
    // grid cell means nothing was reported; a blank run means zero. So absence
    // is a mark here and a blank in a heatmap — the same question answered per
    // geometry, which is the encoding rule applied to absence.
    const absent = draw({ value: null, max: 100 });
    const zero = draw({ value: 0, max: 100, format: "percent" });

    expect(absent.trim(), "an em-dash at unicode").toBe("—");
    expect(absent).not.toBe(zero);
    expect(zero, "zero draws an empty run and says so").toContain("0%");
    expect(draw({ value: null, max: 100 }, 20, ASCII_CAPS).trim()).toBe("-");
  });

  it("T1.27 (I20): exactly `width` cells at every width, and the run takes the residual", () => {
    for (const width of [1, 4, 8, 20, 80]) {
      const drawn = draw({ value: 42, max: 100, format: "percent" }, width);
      expect(cells(drawn, "narrow"), `width ${String(width)}`).toBe(width);
      expect(drawn).not.toContain("\n");
    }

    // Below the minimum run the number is the whole cell: a two-cell bar is not
    // a bar, it is a decoration that looks like data.
    expect(draw({ value: 42, max: 100, format: "percent" }, 5).trim()).toBe("42.0%");
    // And the run grows with the width rather than the number doing so.
    const narrow = draw({ value: 50, max: 100, format: "percent" }, 12);
    const wide = draw({ value: 50, max: 100, format: "percent" }, 30);
    expect([...wide].filter((c) => c === "█").length).toBeGreaterThan(
      [...narrow].filter((c) => c === "█").length,
    );
  });

  it("T1.27 (I20, C12 I3): a scale with no extent has no proportion", () => {
    // `max === min` is a division by zero one form over, and the honest answer
    // is an empty run — *zero of nothing* — rather than a full one.
    const flat = draw({ value: 5, max: 0, min: 0, format: "number" });
    expect(flat).not.toContain("█");
    expect(flat).toContain("5");
  });

  it("T1.27 (I20): the alphabet substitutes, which is the reason this is not the app's", () => {
    // `examples/docker` threaded a `unicode` flag by hand because an adapter has
    // no capabilities (F43, F54), and at `LANG=C` its blocks passed through
    // untouched beside a plot that had correctly degraded.
    const drawn = draw({ value: 60, max: 100, format: "percent" }, 20, ASCII_CAPS);
    expect(drawn).toContain("#");
    expect(drawn).not.toContain("█");
    expect(cells(drawn, "narrow")).toBe(20);
  });
});

describe("C12 I21 — the encoding rule", () => {
  it("T1.28 (I21): every ladder serves the axis it is keyed under, and the stand-in is declared", () => {
    // **Asserted over the vocabulary, not over a call**, because the property is
    // of the table: a ladder under the wrong key is the defect, and it does not
    // compile — so what a row can still add is that `serves` and `substitutes`
    // say what the type cannot, which is *which* of two correct axes is an
    // equivalence and which is a stand-in.
    for (const caps of [FULL_CAPS, ASCII_CAPS, { ...FULL_CAPS, ambiguousWidth: "wide" as const }]) {
      expect(ladderFor("height", caps).serves.height, `height at ${caps.unicode}`).toBe(true);
      expect(ladderFor("density", caps).serves.density, `density at ${caps.unicode}`).toBe(true);
    }

    // The two-axis case, which is why `serves` is flags and not a list.
    const ascii = ladderFor("density", ASCII_CAPS);
    expect(ascii.serves).toEqual({ height: true, density: true });
    expect(ascii.substitutes, "ASCII *is* density and *stands in for* height").toEqual(["height"]);

    // And a single-axis ladder marks no substitution: `RAMP_DENSITY` on a grid
    // is the axis itself, so there is nothing being stood in for.
    expect(ladderFor("density", FULL_CAPS).substitutes).toBeUndefined();
    expect(ladderFor("height", FULL_CAPS).serves.density, "a height ladder is not a density one").toBe(
      false,
    );
  });

  it("T1.29 (I21): a renderer asks for an axis, and `fill` is not reachable through the ladders", () => {
    // `fill` is a pair, not a ladder: the run is the axis, so a value picks how
    // many rather than which. A single type over both would make `filled`/`empty`
    // a two-rung ladder, and then nothing would stop it being indexed.
    expect(ladderFor("height", FULL_CAPS).steps).toHaveLength(RAMP_STEPS);
    expect(ladderFor("density", FULL_CAPS).steps).toHaveLength(RAMP_STEPS);

    const pair = pairFor(FULL_CAPS);
    expect(pair.encodes).toBe("fill");
    expect(pair.filled).not.toBe(pair.empty);
    expect(pair.absent, "and absence is neither of them").not.toBe(pair.empty);

    // The capability read that stopped being the app's (F43, F54).
    expect(pairFor(ASCII_CAPS).filled).toBe("#");
  });
});
