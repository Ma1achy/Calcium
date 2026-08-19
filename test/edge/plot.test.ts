// C12 tier 3 — the widths and series that break arithmetic.
//
// Every case here was written from §4 and §9 rather than from the implementation,
// and three of them found defects: the gutter surviving at width 1, x-labels
// butting against each other, and a denormal span asking `toFixed` for 325 digits.
import { describe, expect, it } from "vitest";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { plotAreaRows, plotHeight } from "../../src/presentation/plot/height.js";
import { columnsOf, finiteSamples, seriesRange } from "../../src/presentation/plot/scale.js";
import { curveRows } from "../../src/presentation/plot/curve.js";
import { sparkline } from "../../src/presentation/plot/sparkline.js";
import { stripHeights } from "../../src/presentation/plot/strips.js";
import { lossCurve } from "../support/blocks.js";
import { ASCII_CAPS, FULL_CAPS, MONO_CAPS, measurable, visible } from "../support/render.js";
import { cells } from "../../src/presentation/text.js";
import { glyphs } from "../../src/presentation/blocks/glyphs.js";
import { block, type Plot, type Series } from "../../src/data/viewmodel/index.js";

const m = (): ReturnType<typeof measurable> =>
  measurable({ definitions: [plotDefinition] as never });

const plot = (over: Partial<Plot> & { series: readonly Series[] }): Plot =>
  block({ kind: "plot", id: "edge", form: "line", height: 5, axes: true, ...over });

describe("C12 tier 3 — heights", () => {
  it("T3.1: `height: 0` clamps to 1", () => {
    expect(plotAreaRows({ form: "line", height: 0 })).toBe(1);
    expect(plotHeight({ form: "line", height: 0, axes: true })).toBe(4);
  });

  it("T3.1: a negative or fractional height clamps too", () => {
    expect(plotAreaRows({ form: "line", height: -4 })).toBe(1);
    expect(plotAreaRows({ form: "line", height: 3.7 })).toBe(3);
  });

  it("T3.2: `height: 1` with axes is 4 rows and still renders a curve", () => {
    const b = plot({ height: 1, series: [{ values: lossCurve(10) }] });
    const lines = m().renderToLines(b, 40);
    // The lid, the one area row, the rule, the x-labels (§2).
    expect(lines).toHaveLength(4);
    expect(visible(lines[1] ?? "")).toMatch(/[⠀-⣿─│╭╮╰╯┌┐└┘╶╴]/u);
  });
});

describe("C12 tier 3 — narrow widths", () => {
  it("T3.3: labels go before the plot area is starved, then the axis furniture", () => {
    const b = plot({ series: [{ values: lossCurve(20) }] });

    // Row 0 is the frame's lid now, so the axis is read off the first *area*
    // row — which is row 1 at every width where there is furniture at all.
    // Wide: a label column and the tick beside the top label.
    expect(visible(m().renderToLines(b, 40)[1] ?? "")).toMatch(/[│┤]/u);
    expect(visible(m().renderToLines(b, 40)[1] ?? "")).toMatch(/[0-9]/u);
    // Narrow: no label column, still an axis.
    const narrow = visible(m().renderToLines(b, 8)[1] ?? "");
    expect(narrow).toContain("│");
    expect(narrow).not.toMatch(/[0-9]/u);
    // Narrower still: the furniture goes and the curve takes the width.
    const tiny = visible(m().renderToLines(b, 3)[1] ?? "");
    expect(tiny).not.toContain("│");
  });

  it("T3.4: width 1 renders a single column and does not throw", () => {
    // The case that found the clamp. An unclamped plot of declared height 5
    // rendered nineteen rows here, because the label column and the axis are seven
    // cells and the terminal wrapped every one of them.
    const b = plot({ series: [{ values: lossCurve(20) }] });
    const lines = m().renderToLines(b, 1);
    expect(lines).toHaveLength(8);
    for (const row of lines) expect([...visible(row)].length).toBeLessThanOrEqual(1);
  });

  it("T3.4: and the curve is still drawn, not replaced by a marker", () => {
    const b = plot({ series: [{ values: lossCurve(20) }] });
    expect(visible(m().renderToLines(b, 1).join(""))).toMatch(/[⠀-⣿─│╭╮╰╯┌┐└┘╶╴ ]/u);
  });
});

describe("C12 tier 3 — extreme series", () => {
  it("T3.5: fifteen orders of magnitude scale and clamp to the edges", () => {
    const values = [1e-7, 1, 1e8];
    const range = seriesRange([{ values }], {});
    expect(range).toEqual({ min: 1e-7, max: 1e8 });
    expect(() => m().renderToLines(plot({ series: [{ values }] }), 40)).not.toThrow();
  });

  it("T3.5 (I2): a denormal span does not throw — `toFixed` caps at 100 digits", () => {
    const values = [Number.MIN_VALUE, Number.MIN_VALUE * 2];
    expect(() => m().renderToLines(plot({ series: [{ values }] }), 40)).not.toThrow();
    expect(m().renderToLines(plot({ series: [{ values }] }), 40)).toHaveLength(8);
  });

  it("T3.6: all-negative values compute a real range, with no flat-zero assumption", () => {
    const values = [-5, -4, -3, -2, -1];
    expect(seriesRange([{ values }], {})).toEqual({ min: -5, max: -1 });

    // The curve spans the plot area vertically rather than sitting on a zero line
    // that is not in the data.
    const range = { min: -5, max: -1 };
    const glyphRows = curveRows({ values }, range, 20, 4, FULL_CAPS);
    const inked = glyphRows.map((r) => [...r].some((c) => c !== "⠀"));
    expect(inked[0]).toBe(true);
    expect(inked[3]).toBe(true);
  });

  it("T3.7: values differing in the last float digit are treated as constant", () => {
    // Not literally equal, so `min === max` does not catch it — but the range is
    // 2e-16 wide, and a linear scale over it amplifies float noise into a curve
    // that looks like signal. The span rounds to the same dot row for every
    // sample, which is the flat line the data deserves.
    const values = [1, 1 + Number.EPSILON, 1 + 2 * Number.EPSILON];
    const range = seriesRange([{ values }], {});
    expect(range).toEqual({ min: 1, max: 1 });
    if (range === null) throw new Error("unreachable");

    // One inked row, centred — the flat line a constant series gets. Without the
    // noise floor this drew a full-height curve out of the last bit of three
    // doubles, which is the most misleading thing this component can produce
    // because nothing about it looks degenerate.
    const glyphRows = curveRows({ values }, range, 20, 4, FULL_CAPS);
    const inkedRows = glyphRows.filter((r) => [...r].some((c) => c !== "⠀"));
    expect(inkedRows).toHaveLength(1);
  });

  it("T3.7: but a genuinely small range is not collapsed", () => {
    // The threshold is relative to magnitude, so a denormal span is many orders
    // above its own noise floor and scales normally. A fixed epsilon would have
    // flattened it.
    expect(seriesRange([{ values: [Number.MIN_VALUE, Number.MIN_VALUE * 2] }], {})).toEqual({
      min: Number.MIN_VALUE,
      max: Number.MIN_VALUE * 2,
    });
  });

  it("T3.13: exactly `width × 2` points is one per dot column, no downsampling", () => {
    const values = Array.from({ length: 40 }, (_, i) => i);
    const columns = columnsOf(finiteSamples(values), 40, 40);
    expect(columns).toHaveLength(40);
    for (const column of columns) {
      expect(column.first).toBe(column.last);
      expect(column.min).toBe(column.max);
    }
  });
});

describe("C12 tier 3 — stacking and legends", () => {
  const two: readonly Series[] = [
    { values: lossCurve(20), label: "train" },
    { values: lossCurve(20).map((v) => v * 1.2), label: "val" },
  ];

  it("T3.10 (I6, I7): two series at 1-bit are strips of 4 and 4, labelled in the gutter", () => {
    const b = plot({ height: 8, series: two });
    const lines = measurable({ definitions: [plotDefinition] as never, capabilities: MONO_CAPS })
      .renderToLines(b, 48);

    expect(lines).toHaveLength(11);
    // Labels in the y-label column, on the first row of each strip — never on a
    // row of their own, which is what would push the total past `height`. Row 0
    // is the frame's lid, so the strips start at 1.
    expect(visible(lines[1] ?? "")).toContain("train");
    expect(visible(lines[5] ?? "")).toContain("val");
    expect(visible(lines[2] ?? "")).not.toContain("train");
  });

  it("T3.10 (I6): with colour, the same block overlays instead", () => {
    const b = plot({ height: 8, series: two });
    const colour = measurable({ definitions: [plotDefinition] as never, capabilities: ASCII_CAPS });
    const rendered = colour.renderToLines(b, 48).map(visible).join("\n");

    // Overlaid, so no series label appears in the gutter — the y-labels do.
    expect(rendered).not.toContain("train");
    expect(colour.measure(b, 48)).toBe(11);
  });

  it("T3.11 (I7): three series at height 8 are 4, 2, 2 and total 8", () => {
    const three: readonly Series[] = [
      { values: lossCurve(12), label: "a" },
      { values: lossCurve(12), label: "b" },
      { values: lossCurve(12), label: "c" },
    ];
    const b = plot({ height: 8, series: three });
    const lines = measurable({ definitions: [plotDefinition] as never, capabilities: MONO_CAPS })
      .renderToLines(b, 48);

    expect(lines).toHaveLength(11);
    expect(visible(lines[1] ?? "")).toContain("a");
    expect(visible(lines[5] ?? "")).toContain("b");
    expect(visible(lines[7] ?? "")).toContain("c");
  });

  it("T3.11b (I8): ten series at height 4 is the first plus a legend, still 4 rows", () => {
    const ten: readonly Series[] = Array.from({ length: 10 }, (_, i) => ({
      values: lossCurve(12).map((v) => v + i),
      label: `s${String(i)}`,
    }));
    const b = plot({ height: 4, series: ten });
    const mono = measurable({ definitions: [plotDefinition] as never, capabilities: MONO_CAPS });
    const lines = mono.renderToLines(b, 48);

    expect(lines).toHaveLength(7);
    expect(mono.measure(b, 48)).toBe(7);

    // Named, not dropped. The count is the assertion that matters: a renderer that
    // silently showed one series would pass a row count and fail this.
    const rendered = lines.map(visible).join("\n");
    expect(rendered).toContain("+9 more");
    expect(rendered).toContain("s1");
  });

  it("T3.11c (I7): Σ strips equals height across the whole grid", () => {
    for (let n = 1; n <= 12; n += 1) {
      for (let h = 1; h <= 20; h += 1) {
        const heights = stripHeights(h, n);
        if (heights === null) continue;
        expect(heights.reduce((a, b) => a + b, 0), `n=${String(n)} h=${String(h)}`).toBe(h);
      }
    }
  });
});

describe("C12 tier 3 — no accumulated state", () => {
  it("T3.9: a series arriving one point at a time is correct in isolation each time", () => {
    const registry = m();
    const full = lossCurve(60);
    const seen = new Set<string>();

    for (let n = 1; n <= 60; n += 1) {
      const b = plot({ id: "grow", series: [{ values: full.slice(0, n) }] });
      const lines = registry.renderToLines(b, 48);
      expect(lines, `at ${String(n)} points`).toHaveLength(8);
      seen.add(lines.join("\n"));

      // And rendering the same prefix again gives the same answer — the property a
      // cache keyed on anything but the input would break.
      expect(registry.renderToLines(b, 48).join("\n")).toBe(lines.join("\n"));
    }

    // **Two resolutions, two figures, measured 2026-08-18.** Sixty prefixes give
    // 60/60 distinct frames in braille and 49/60 in box drawing, on this same
    // decaying curve — a loss curve flattens, and the default style has five
    // addressable rows where braille has twenty and one column per cell where
    // braille has two, so successive prefixes in the tail land on the same
    // cells. That is resolution, not memory, and the arm below asserts the
    // stronger figure at the resolution that can express it.
    //
    // The claim this row exists for is carried by the in-loop assertion above:
    // the same prefix rendered twice gives the same frame. `seen.size` is the
    // weaker proxy, and lowering it to fit the default without saying which
    // number moved is how a threshold stops meaning anything.
    expect(seen.size).toBeGreaterThan(45);
  });

  it("T3.9 (braille): the same growth is fully distinguishable at dot resolution", () => {
    const registry = m();
    const full = lossCurve(60);
    const seen = new Set<string>();
    for (let n = 1; n <= 60; n += 1) {
      const b = plot({ id: "grow-braille", plotStyle: "braille", series: [{ values: full.slice(0, n) }] });
      seen.add(registry.renderToLines(b, 48).join("\n"));
    }
    expect(seen.size).toBe(60);
  });
});

describe("C12 tier 3 — sparklines in a cell", () => {
  it("T3.12: a spark narrower than the series windows to the last N points", () => {
    const rising = Array.from({ length: 40 }, (_, i) => i);
    // The last eight, not the first eight and not every fifth: a metric's
    // sparkline is about where it has just been.
    expect(sparkline(rising, 8, FULL_CAPS)).toBe("▁▂▃▄▅▆▇█");
    expect(sparkline(rising.slice(0, 8), 8, FULL_CAPS)).toBe("▁▂▃▄▅▆▇█");
    expect(sparkline([0, 0, 0, 0, 0, 0, 0, 39], 8, FULL_CAPS)).toBe("▁▁▁▁▁▁▁█");
  });

  it("T3.12: and a spark block is one row at every width (I13)", () => {
    const spark = block({
      kind: "plot",
      id: "spark",
      form: "sparkline",
      series: [{ values: lossCurve(40) }],
    });
    for (const width of [1, 4, 8, 12, 80]) {
      expect(m().renderToLines(spark, width), `width ${String(width)}`).toHaveLength(1);
      expect(m().measure(spark, width)).toBe(1);
    }
  });
});

describe("C12 tier 3 — the axis is straight on a wide terminal (I24)", () => {
  // **The reported defect, and it is one cell.** `labelWidth` and `padStart` both
  // default their measurement to `ambiguousWidth: "narrow"`. Four gutters measured
  // and two were told what they were measuring against — so a label carrying an
  // ambiguous-width character was budgeted at one cell and drawn at two, and that
  // row's border sat a column right of every other row's. The rows beside it are
  // padded blanks and are correct, which is what makes it read as a bent axis
  // rather than as a wrong width.
  //
  // **Asserted by measuring, not by matching.** A regex for a border at a fixed
  // offset would pass on a frame where every row is wrong by the same amount;
  // what has to be true is that the rows agree with *each other*.
  const WIDE = { ...FULL_CAPS, ambiguousWidth: "wide" as const };

  /** The cell column each row's axis edge sits in. One value is a straight axis. */
  const edgeColumns = (lines: readonly string[]): readonly number[] => {
    const g = glyphs(WIDE);
    const out: number[] = [];
    for (const row of lines) {
      const chars = [...visible(row)];
      const i = chars.findIndex((c) => c === g.vertical || c === g.teeRight);
      if (i >= 0) out.push(cells(chars.slice(0, i).join(""), "wide"));
    }
    return out;
  };

  // `→` is `East_Asian_Width=Ambiguous` (U+2192), so it is one cell narrow and two
  // wide — the same class as the em dash `formatValue` returns for a non-finite
  // value, and reachable from a label a caller chose.
  const AMBIGUOUS = "a\u2192b";
  const values = [1, 4, 2, 6, 3];

  const cases: readonly Readonly<{ name: string; block: Plot; mono?: boolean }>[] = [
    {
      // The positional path's own gutter, which is the one that never passed the
      // capability at all. 1-bit forces the stack, which is what puts a *series*
      // label — arbitrary text — in the y-label column.
      name: "stacked",
      mono: true,
      block: block({
        kind: "plot", id: "amb-stacked", form: "line", height: 6, axes: true,
        series: [{ label: AMBIGUOUS, values }, { label: "rpm", values }],
      }),
    },
    {
      name: "categorical",
      block: block({
        kind: "plot", id: "amb-cat", form: "bar", height: 3, axes: true,
        categories: [AMBIGUOUS, "rpm", "kPa"], series: [{ values: [3, 7, 5] }],
      }),
    },
    {
      name: "banded",
      block: block({
        kind: "plot", id: "amb-band", form: "violin", height: 6, axes: true,
        categories: [AMBIGUOUS, "rpm"],
        series: [{ values: [1, 2, 3, 4] }, { values: [2, 3, 4, 5] }],
      }),
    },
    {
      name: "matrix",
      block: block({
        kind: "plot", id: "amb-heat", form: "heatmap", height: 3, axes: true,
        series: [
          { label: AMBIGUOUS, values: [1, 5, 3] },
          { label: "rpm", values: [4, 2, 8] },
          { label: "kPa", values: [0, 3, 5] },
        ],
      }),
    },
  ];

  for (const c of cases) {
    it(`T3.17 (I24): ${c.name} — every row's border is in the same column`, () => {
      const kit = measurable({
        definitions: [plotDefinition] as never,
        capabilities: c.mono === true ? { ...WIDE, colourDepth: 1 as const } : WIDE,
      });
      const columns = edgeColumns(kit.renderToLines(c.block, 30));
      expect(columns.length, "there is an axis to be straight").toBeGreaterThan(1); // cells-ok — a row count
      expect(new Set(columns).size, `edge columns: ${columns.join(",")}`).toBe(1);
    });
  }

  it("T3.17 (I24): and the fixture is one the defect could bend", () => {
    // The harness rule: a label with no ambiguous character measures the same in
    // both modes, so every row above would pass against a renderer that ignores
    // the capability entirely. This is the row that says the corpus can tell.
    expect(cells(AMBIGUOUS, "narrow")).toBe(3);
    expect(cells(AMBIGUOUS, "wide")).toBe(4);
  });
});
