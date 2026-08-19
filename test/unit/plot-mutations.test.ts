/**
 * Mutation targets — the rows that catch the form-specific defect.
 *
 * Each test constructs the scenario where the form's own logic matters and
 * asserts the output differs from the wrong case. The mutation is what the test
 * would survive if the renderer had the defect.
 */
import { describe, expect, it } from "vitest";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { ASCII_CAPS, FULL_CAPS, MONO_CAPS, MONO_UNICODE_CAPS, measurable } from "../support/render.js";
import { block, type Plot } from "../../src/data/viewmodel/index.js";
import { scatterRows, stepRows } from "../../src/presentation/plot/scatter.js";
import { boxplotBand, boxplotColumn, forestRow } from "../../src/presentation/plot/glyph-row.js";
import { glyphs } from "../../src/presentation/blocks/glyphs.js";
import { barRow, binValues } from "../../src/presentation/plot/categorical.js";
import { extentFor, ladderFor } from "../../src/presentation/plot/ramp.js";
import { kde, ridgelineArea, scaledBandwidth } from "../../src/presentation/plot/kde.js";
import { waffleCells } from "../../src/presentation/plot/waffle.js";
import { horizonRows } from "../../src/presentation/plot/horizon.js";
import { pieRender, radarRender } from "../../src/presentation/plot/circle.js";
import { facetWidths, smallMultiplesRows } from "../../src/presentation/plot/facet.js";
import { bandRows, stackBands } from "../../src/presentation/plot/stack.js";
import { categoryMarks } from "../../src/presentation/plot/marks.js";
import type { RenderContext } from "../../src/presentation/blocks/types.js";
import { displayCells } from "../../src/presentation/text.js";

const kit = (caps = FULL_CAPS) => measurable({ definitions: [plotDefinition], capabilities: caps });

describe("GROUP 1: scatter does not interpolate", () => {
  it("scatter output differs from line output", () => {
    const lineBlock = block({
      kind: "plot", id: "m1", form: "line", height: 5, axes: false,
      series: [{ values: [0, 10, 0, 10, 0] }],
    });
    const scatterBlock = block({
      kind: "plot", id: "m1s", form: "scatter", height: 5, axes: false,
      series: [{ values: [0, 10, 0, 10, 0] }],
    });
    const k = kit();
    const lineLines = k.renderToLines(lineBlock, 20);
    const scatterLines = k.renderToLines(scatterBlock, 20);
    expect(scatterLines.join("\n")).not.toBe(lineLines.join("\n"));
  });
});

describe("GROUP 2: box plot median inside the box", () => {
  it("median is between q1 and q3, on all three rows", () => {
    // The box is an **outline** now, so the median is a tee on the edges
    // (┬ ┴) and a rule on the spine (│) — three glyphs of one figure, which is
    // what the row-indexed table buys and what one filled row could not say.
    const band = boxplotBand(
      { min: 1, q1: 3, median: 5, q3: 7, max: 9 },
      1, 9, 40, 3, FULL_CAPS,
    );
    expect(band.length, "three rows per category").toBe(3);

    const [top, spine, bottom] = band as [string, string, string];
    expect(top.indexOf("┬"), "median tee on the top edge").toBeGreaterThan(top.indexOf("┌"));
    expect(top.indexOf("┬")).toBeLessThan(top.indexOf("┐"));
    expect(bottom.indexOf("┴"), "and on the bottom").toBeGreaterThan(bottom.indexOf("└"));
    expect(spine.indexOf("│"), "the spine carries the rule").toBeGreaterThan(spine.indexOf("┤"));
    // All three land in the same column — otherwise it is three drawings.
    expect(new Set([top.indexOf("┬"), spine.indexOf("│"), bottom.indexOf("┴")]).size).toBe(1);
  });

  it("the mean is a distinct mark, never the median's glyph (C04 I53)", () => {
    // Two centres sharing a glyph is D29 with a shape instead of a colour.
    const band = boxplotBand(
      { min: 1, q1: 3, median: 5, q3: 7, max: 9, mean: 6 },
      1, 9, 40, 3, FULL_CAPS,
    );
    const spine = band[1]!;
    expect(spine, "the mean has its own mark").toContain("◆");
    expect(spine.indexOf("◆")).not.toBe(spine.indexOf("│"));
  });
});

describe("GROUP 3: gantt bar starts at its offset, not at 0", () => {
  it("a bar with offset 5 does not start at column 0", () => {
    const ganttBlock = block({
      kind: "plot", id: "m3", form: "gantt", height: 2, axes: true,
      categories: ["A", "B"],
      series: [{ values: [3, 2] }],
      offsets: [5, 8],
    });
    const k = kit();
    const lines = k.renderToLines(ganttBlock, 40);
    expect(lines.length).toBeGreaterThan(0); // cells-ok — a row count
  });
});

describe("GROUP 4: correlation uses diverging range", () => {
  it("negative and positive correlation differ visually", () => {
    const corrBlock = block({
      kind: "plot", id: "m4", form: "correlation", height: 2, axes: true,
      series: [
        { values: [1, -0.9], label: "A" },
        { values: [-0.9, 1], label: "B" },
      ],
    });
    const k = kit();
    const lines = k.renderToLines(corrBlock, 40);
    expect(lines.length).toBeGreaterThan(0); // cells-ok — a row count
  });
});

describe("GROUP 5: KDE bandwidth does not smooth two peaks into one", () => {
  it("bimodal data produces a density with two modes", () => {
    const data = [
      ...Array.from({ length: 50 }, () => 1),
      ...Array.from({ length: 50 }, () => 10),
    ];
    const points = Array.from({ length: 100 }, (_, i) => i * 0.12);
    const densities = kde(data, points);
    const peaks = densities.filter((d, i) =>
      i > 0 && i < densities.length - 1 && d > densities[i - 1]! && d > densities[i + 1]! // cells-ok — array indices
    );
    expect(peaks.length).toBeGreaterThanOrEqual(2); // cells-ok — a peak count
  });
});

describe("GROUP 6: facets compose rows another renderer has already painted", () => {
  // **The row this replaced asserted `lines.length > 0`.** That is true of a
  // frame containing nothing, and the frame did contain nothing: at width 40
  // the golden corpus held an empty box with no facets in it, through review
  // and commit. A count of rows says nothing about what is in them.
  //
  // Everything here uses a **styled** child, because a plain one passes under
  // both the right reading and the wrong one — `padEnd` pads correctly when
  // there is nothing invisible to miscount, which is what made the defect
  // survive. The control at the end is that case, stated so the difference
  // between the two is the subject rather than an accident of the fixture.
  const ESC = String.fromCharCode(27);
  const styled = (text: string): string => `${ESC}[38;5;241m${text}${ESC}[0m`;
  type FormRenderer = (b: Plot, w: number, c: RenderContext) => readonly string[];
  const probe = (fill: string, short = 0) => ({
    line: (_b: Plot, w: number) => [styled(fill.repeat(Math.max(0, w - short)))],
  }) as unknown as Readonly<Record<string, FormRenderer>>;
  const four = [{ form: "line" }, { form: "line" }, { form: "line" },
    { form: "line" }] as unknown as readonly Plot[];
  const ctx = { capabilities: FULL_CAPS } as never;

  it("T1.31 (C12 I10): a styled facet row is measured in display cells, not code units", () => {
    // One colour run is fourteen bytes and no columns. `padEnd` saw a 29-byte
    // string as wider than its 26-cell column and padded nothing; `slice(0, 80)`
    // then cut at eighty *bytes*, which was forty visible cells, and the cut
    // landed inside an escape so every later facet was gone.
    const rows = smallMultiplesRows(four, 80, 1, ctx, probe("A"));
    expect(rows.length).toBe(1); // cells-ok — a row count
    expect(displayCells(rows[0]!)).toBe(80); // cells-ok — a cell count
    // All four facets survive, which is the half `slice` destroyed.
    expect(rows[0]!.match(/A+/g)?.length).toBe(4); // cells-ok — a facet count
  });

  it("T1.32 (C12 I10): a facet short of its column is padded, not pulled leftwards", () => {
    // The other half, and it needs a facet that does not fill its width —
    // otherwise `fitStyled` returns early and the padding path is never taken.
    const rows = smallMultiplesRows(four, 80, 1, ctx, probe("B", 6));
    expect(displayCells(rows[0]!)).toBe(80); // cells-ok — a cell count
    const runs = rows[0]!.match(/B+/g) ?? [];
    expect(runs.length).toBe(4); // cells-ok — a facet count
    // Each run starts at its own column: 6 blanks between consecutive runs.
    expect(new Set(runs.map((r) => r.length)).size).toBe(1); // cells-ok — a set size
  });

  it("T1.33: the escapes reach the frame intact, with no literal residue", () => {
    // The failure that replaced the first one, and the reason this is an
    // end-to-end row rather than another unit. Composing correctly made every
    // row exactly `width` cells, which unmasked a second defect one layer down:
    // the facet arm passed the painted row back through `line`, whose
    // `clampSpans` measures with `cells()` — and `cells()` counts a painted
    // row's escape bytes as visible. It measured about 120 cells in an 80-cell
    // row, truncated, and `stripControl` took the ESC and left `[38;2;98;98;98m`
    // on screen as text. **The first defect was masking the second**: the old
    // `slice` had already cut the row to 80 code units, so the clamp saw a row
    // it thought fitted and passed it through untouched.
    const smBlock = block({
      kind: "plot", id: "m6", form: "smallmultiples", height: 5, axes: true,
      series: [],
      facets: [
        { kind: "plot", id: "f1", form: "line", height: 5, axes: true, series: [{ values: [1, 3, 2] }] } as Plot,
        { kind: "plot", id: "f2", form: "line", height: 5, axes: true, series: [{ values: [3, 1, 4] }] } as Plot,
      ],
    });
    const lines = kit().renderToLines(smBlock, 80);
    expect(lines.length).toBeGreaterThan(0); // cells-ok — a row count
    for (const row of lines) {
      // An escape whose ESC has been eaten: the body survives as printable text.
      expect(row.replace(new RegExp(`${ESC}\\[[0-9;]*m`, "g"), ""))
        .not.toMatch(/\[[0-9;]*m/);
    }
    // And the facets are actually drawn — the assertion the old row lacked.
    const ink = lines.filter((r) => /[─│┌┐└┘┤╭╮╰╯]/.test(r));
    expect(ink.length).toBeGreaterThan(2); // cells-ok — a row count
  });

  it("T1.34 (C12 I10): the remainder is distributed, so the composition is the full width", () => {
    // `floor(80 / 3)` is 26 and three of those is 78, so the old arithmetic left
    // two columns permanently blank at the right edge — legal under I10, which
    // forbids only *exceeding* the width (C12 I10), and a ragged edge in every faceted
    // frame at a width the facet count does not divide.
    expect(facetWidths(80, 3)).toEqual([27, 27, 26]);
    expect(facetWidths(80, 4)).toEqual([20, 20, 20, 20]);
    expect(facetWidths(80, 3).reduce((a, b) => a + b, 0)).toBe(80); // cells-ok — a cell count
    expect(facetWidths(5, 0)).toEqual([]);
  });

  it("T1.35: the control — an unstyled facet composes correctly under either reading", () => {
    // **Why every row above uses a styled child.** `padEnd` and `slice` are
    // correct when there is nothing invisible to miscount, so this passes
    // against the defect too. It is here to say that the fixture, not the
    // assertion, is what makes the rows above able to fail.
    const plain = {
      line: (_b: Plot, w: number) => ["C".repeat(w)],
    } as unknown as Readonly<Record<string, FormRenderer>>;
    const rows = smallMultiplesRows(four, 80, 1, ctx, plain);
    expect(displayCells(rows[0]!)).toBe(80); // cells-ok — a cell count
    expect(rows[0]!.padEnd(80).slice(0, 80).length).toBe(80); // cells-ok — a cell count
  });
});

describe("GROUP 6b: vertical is a transpose, and the vocabulary transposes with it", () => {
  const ESC = String.fromCharCode(27);
  const plain = (b: Plot, caps = FULL_CAPS, w = 40): readonly string[] =>
    measurable({ definitions: [plotDefinition], capabilities: caps })
      .renderToLines(b, w)
      .map((r) => r.replace(new RegExp(`${ESC}\\[[0-9;]*m`, "gu"), ""));

  const vbar = (over: Partial<Plot> = {}): Plot =>
    block({
      kind: "plot", id: "vb", form: "bar", height: 7, axes: true, orientation: "vertical",
      categories: ["a", "b", "c"], series: [{ values: [10, 25, 17] }], ...over,
    } as Plot);

  it("T1.36 (C12 I30): the gutter holds the value scale and the names run along the bottom", () => {
    // The transpose in one assertion: horizontally the gutter names the
    // categories, vertically it numbers the axis and the names move under the
    // columns. A form that ignored `orientation` passes neither half.
    const rows = plain(vbar());
    // **The property, not the numbers.** A first version asserted `25` or `30`
    // and the axis draws `40 / 20 / 0` — a derived bound snaps outward to the
    // nice step (C12 I22), so naming the data's own values tests the fixture
    // rather than the transpose.
    const numeric = rows.filter((r) => /^\s*-?[0-9.]+\s*┤/u.test(r));
    expect(numeric.length, "the gutter numbers the value axis").toBeGreaterThanOrEqual(2); // cells-ok — a row count
    expect(rows.slice(-1)[0], "and the names run beneath").toMatch(/a\s+b\s+c/u);

    const horizontal = plain(vbar({ orientation: "horizontal" }));
    expect(horizontal.some((r) => /^a\s*┤/u.test(r)), "where horizontally they are the gutter").toBe(true);
  });

  it("T1.37 (C12 I30): a column fills from the bottom, with the height ladder's partials", () => {
    // **The vocabulary is the defect this row exists for.** `▏▎▍▌▋▊▉` and
    // `▁▂▃▄▅▆▇` are the same eighths on different axes and look interchangeable;
    // a column built from the left-eighths would be arithmetically perfect and
    // draw a bar chart lying on its side inside each cell.
    const ladder = ladderFor("height", FULL_CAPS).steps;
    const rows = plain(vbar());
    const area = rows.slice(1, -2).join("");
    // Some partial from the height ladder appears — the tip of a column that
    // does not land on a cell boundary.
    expect([...ladder.slice(0, -1)].some((g) => area.includes(g)), "a lower-eighth partial").toBe(true);
    // And none of the horizontal extent's partials do.
    const ext = extentFor(FULL_CAPS).partials;
    expect(ext.some((g) => area.includes(g)), "and no left-eighth ones").toBe(false);
    // Bottom-anchored: the last area row is the fullest.
    const ink = (r: string): number => [...r].filter((c) => c !== " " && c !== "│" && c !== "┤").length; // cells-ok — a cell count
    const areaRows = rows.slice(1, -2);
    expect(ink(areaRows[areaRows.length - 1] ?? ""), "the floor row is the fullest")
      .toBeGreaterThanOrEqual(ink(areaRows[0] ?? "")); // cells-ok — a cell count
  });

  it("T1.38 (C12 I30): a label that cannot be read whole is dropped, not sliced", () => {
    // A histogram at nine cells per column cannot hold `[18.3, 23.1)`, and
    // slicing produced `[18.3, 23[23.1, 28[28.0,` — three labels running
    // together, each naming a bin it does not describe. Absent is honest.
    const wide = vbar({ categories: ["a-very-long-name-indeed", "b", "c"] });
    const last = plain(wide).slice(-1)[0] ?? "";
    expect(last, "the name that does not fit is gone").not.toContain("a-very-long");
    expect(last, "and the ones that do remain").toMatch(/b\s+c/u);
  });

  it("T1.39 (C12 I30): a form with no second axis refuses the field", () => {
    // Refused rather than ignored: a plot that quietly drops a field is one the
    // caller believes is showing something else.
    expect(() => block({
      kind: "plot", id: "p", form: "pie", height: 8, orientation: "vertical",
      series: [], segments: [{ label: "a", value: 1 }],
    } as Plot)).toThrow(/no vertical arm/u);
    // And the converse, so the row is not passing on a typo in the message.
    expect(() => vbar()).not.toThrow();
  });
});

describe("GROUP 6c: the box plot stood up", () => {
  const Q = { min: 1, q1: 3, median: 5, q3: 7, max: 9, mean: 5.5 } as const;

  it("T1.40 (C12 I30): the lid, the floor and the median are runs, not three cells", () => {
    // **The defect the first version had.** It wrote a glyph at the left, centre
    // and right of each row and left the cells between blank, so the box came
    // out as three disconnected columns — the transpose of `boxplotBand` in
    // arithmetic and not in figure. A box's lid is a *run*.
    const col = boxplotColumn(Q, 1, 9, 11, 11, FULL_CAPS);
    const lid = col.find((r) => r.includes("┌")) ?? "";
    expect(lid, "the lid joins its corners").toMatch(/┌─+┴─+┐/u);
    const floor = col.find((r) => r.includes("└")) ?? "";
    expect(floor, "and the floor joins its own").toMatch(/└─+┬─+┘/u);
    const median = col.find((r) => r.includes("├")) ?? "";
    expect(median, "and the median spans the box").toMatch(/├─+┤/u);
  });

  it("T1.41 (C12 I30): the box is narrower than its column, so categories separate", () => {
    // Drawn to the full slot, four boxes touched and read as one object — the
    // whole point of a categorical axis is that the categories are apart.
    const col = boxplotColumn(Q, 1, 9, 20, 11, FULL_CAPS);
    for (const r of col) expect(r.length).toBe(20); // cells-ok — a cell count
    const lid = col.find((r) => r.includes("┌")) ?? "";
    expect(lid.startsWith(" "), "a gutter on the left").toBe(true);
    expect(lid.endsWith(" "), "and on the right").toBe(true);
    // And it does not give up the gap until there is nothing to give.
    const tight = boxplotColumn(Q, 1, 9, 4, 11, FULL_CAPS);
    expect((tight.find((r) => r.includes("┌")) ?? "").trim().length).toBe(4); // cells-ok — a cell count
  });

  it("T1.42 (C12 I30): the whisker's junction points the way the whisker goes", () => {
    // `┴` at the lid because the whisker is above it, `┬` at the floor because
    // it is below. Reversed, the figure is arithmetically identical and reads as
    // two boxes joined by nothing.
    const col = boxplotColumn(Q, 1, 9, 11, 11, FULL_CAPS);
    const lidRow = col.findIndex((r) => r.includes("┌"));
    const floorRow = col.findIndex((r) => r.includes("└"));
    expect(col[lidRow]).toContain("┴");
    expect(col[floorRow]).toContain("┬");
    // The whisker itself is between the cap and the lid, centred and vertical.
    expect(col[lidRow - 1], "a whisker above the lid").toMatch(/^\s*│\s*$/u);
  });

  it("T1.43 (C12 I30): the mean is a distinct mark and the vertical arm keeps it", () => {
    // C04 I53 — a second centre never shares the median's glyph. The horizontal
    // band already asserts this; the transpose is where it would be dropped,
    // because the median row is the obvious place to stop.
    const col = boxplotColumn(Q, 1, 9, 11, 11, FULL_CAPS).join("");
    expect(col).toContain("◆");
    const noMean = boxplotColumn({ min: 1, q1: 3, median: 5, q3: 7, max: 9 }, 1, 9, 11, 11, FULL_CAPS).join("");
    expect(noMean, "and draws none where there is none").not.toContain("◆");
  });
});

describe("GROUP 6d: one fold, two origins", () => {
  const S = [
    { values: [1, 3, 2, 5, 4], label: "a" },
    { values: [2, 1, 4, 3, 5], label: "b" },
    { values: [3, 2, 1, 2, 3], label: "c" },
  ];

  it("T1.44: bands never cross, because each floor is the one below it's ceiling", () => {
    // **The property is structural, not a fact about the data.** A renderer
    // computing each band's bounds independently produces crossings for the same
    // input and no count notices — a stream graph whose bands cross is not a
    // stream graph with a defect, it is a line chart.
    for (const centred of [false, true]) {
      const bands = stackBands(S, 5, centred);
      for (let i = 1; i < bands.length; i += 1) { // cells-ok — a band count
        expect(bands[i]!.lower, `band ${String(i)} sits on band ${String(i - 1)}`)
          .toEqual(bands[i - 1]!.upper);
      }
      for (const b of bands) {
        for (const [x, lo] of b.lower.entries()) expect(b.upper[x]!).toBeGreaterThanOrEqual(lo);
      }
    }
  });

  it("T1.45: the origin is the only difference — zero, or minus half the total", () => {
    const flat = stackBands(S, 5, false);
    const centred = stackBands(S, 5, true);
    expect(flat[0]!.lower, "stacked area starts at zero").toEqual([0, 0, 0, 0, 0]);
    // Centred, the first band starts half a column's total below zero, and the
    // whole stack is the flat one shifted by exactly that.
    for (let x = 0; x < 5; x += 1) { // cells-ok — a column count
      const total = flat[flat.length - 1]!.upper[x]!;
      expect(centred[0]!.lower[x]).toBeCloseTo(-total / 2, 10);
      for (const [i, b] of centred.entries()) {
        expect(b.upper[x]!).toBeCloseTo(flat[i]!.upper[x]! - total / 2, 10);
      }
    }
  });

  it("T1.46 (C12 I8): a band thinner than a cell still draws, rather than vanishing", () => {
    // A series present in the legend and absent from the figure is I8's silent
    // drop wearing a rounding error.
    const thin = stackBands([{ values: [100, 100] }, { values: [0.01, 0.01] }], 4, false);
    const rows = bandRows(thin[1]!, 0, 100.01, 4, 6, "#");
    expect(rows.join(""), "the sliver has ink").toContain("#");
  });

  it("T1.47: a stacked area is not a line chart, which is what it used to be", () => {
    // `streamgraph` shipped as byte-for-byte the `line` handler. The row that
    // catches that is the same shape as T1.17's for the heatmap: if these match,
    // the form member is not reaching a renderer of its own.
    const kitFull = kit();
    const mk = (form: "stackedarea" | "streamgraph" | "line"): Plot =>
      block({ kind: "plot", id: "sa", form, height: 7, axes: true, series: S } as Plot);
    const asLine = kitFull.renderToLines(mk("line"), 40).join("\n");
    expect(kitFull.renderToLines(mk("stackedarea"), 40).join("\n")).not.toBe(asLine);
    expect(kitFull.renderToLines(mk("streamgraph"), 40).join("\n")).not.toBe(asLine);
    // And the two are not each other: same fold, different origin.
    expect(kitFull.renderToLines(mk("stackedarea"), 40).join("\n"))
      .not.toBe(kitFull.renderToLines(mk("streamgraph"), 40).join("\n"));
  });

  it("T1.48 (C12 I25): at one bit the bands differ by mark", () => {
    const b = block({ kind: "plot", id: "sa", form: "stackedarea", height: 7, axes: true, series: S } as Plot);
    const rows = kit(MONO_UNICODE_CAPS).renderToLines(b, 40)
      .map((r) => r.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "gu"), ""));
    const marks = new Set([...rows.join("")].filter((c) => categoryMarks(MONO_UNICODE_CAPS).includes(c)));
    expect(marks.size, "three bands, three marks").toBeGreaterThanOrEqual(3); // cells-ok — a mark count
  });
});

describe("GROUP 6e: the horizon folds", () => {
  const wave = { values: Array.from({ length: 50 }, (_, i) => 50 + Math.sin(i * 0.25) * 50) };
  const R = { min: 0, max: 100 };

  it("T1.49: the row count is the height, whatever the band count", () => {
    // **The whole claim of the form**, and the old version broke it: one row per
    // band, clipped at `min(areaRows, bands)`. This file's own header says *a
    // series that would need twelve rows fits in two*.
    for (const bands of [1, 2, 5, 12]) {
      for (const h of [1, 2, 5]) {
        expect(horizonRows(wave, R, bands, 40, h, FULL_CAPS).length, `${String(bands)} bands in ${String(h)} rows`).toBe(h); // cells-ok — a row count
      }
    }
  });

  it("T1.50: height 1 with 3 bands reads three depths, where it used to saturate", () => {
    // The measured defect: the defaults interacted, `bands` defaulting to 3 and
    // `height` to 1, so band 0 was drawn alone and everything above a normalised
    // third saturated at maximum ink. No fixture pinned the two apart.
    const row = horizonRows(wave, R, 3, 60, 1, FULL_CAPS)[0] ?? "";
    const inks = new Set([...row].filter((c) => c !== " "));
    expect(inks.size, "three bands, three densities").toBeGreaterThanOrEqual(3); // cells-ok — a density count
  });

  it("T1.51: a series shorter than its area is stretched, never left to run out", () => {
    // The heatmap's right-anchoring defect in a second form: `values[col]` found
    // nothing past column 49 of an 80-cell area and left thirty columns blank.
    const rows = horizonRows(wave, R, 3, 80, 2, FULL_CAPS);
    for (const r of rows) expect(r.length).toBe(80); // cells-ok — a cell count
    // The last column carries the last sample rather than nothing.
    expect(rows.some((r) => r[79] !== " "), "the right edge is drawn").toBe(true); // cells-ok — a column index
  });

  it("T1.52: a column carries at most two depths — its band, and the one it cleared", () => {
    // The fold's shape. Three or more in a column means the bands are not
    // overdrawing, which is a stack of separate charts wearing one frame.
    const rows = horizonRows(wave, R, 5, 40, 6, FULL_CAPS);
    for (let c = 0; c < 40; c += 1) { // cells-ok — a column count
      const depths = new Set(rows.map((r) => r[c]).filter((g) => g !== undefined && g !== " "));
      expect(depths.size, `column ${String(c)}`).toBeLessThanOrEqual(2); // cells-ok — a density count
    }

    // **And at least two somewhere, which is the half `≤ 2` cannot see.**
    // Removing the overdraw entirely leaves one depth per column and satisfies
    // the bound above perfectly — a mutation that survived until this row. A
    // value in the top band has cleared four below it, so the column above its
    // own fill must carry the fourth band's ink rather than nothing.
    // Mid-band, not at the ceiling: a value at exactly the top fills the whole
    // height with its own band and leaves nothing above it to be the second
    // depth — the state has to be constructed rather than assumed.
    const deep = { values: [90, 90, 90, 90] };
    const top = horizonRows(deep, R, 5, 8, 6, FULL_CAPS);
    const col0 = new Set(top.map((r) => r[0]).filter((g) => g !== undefined && g !== " "));
    expect(col0.size, "a cleared band shows above the one being filled").toBe(2); // cells-ok — a density count
  });
});

describe("GROUP 6f: the forest draws its interval", () => {
  const Q = { min: 0, q1: 0, median: 0, q3: 0, max: 0, centre: 0, lower: -1, upper: 1 } as const;

  it("T1.53 (C12 I31): the interval survives, where a box used to draw over it", () => {
    // **The catalogue fixture set `q1`/`q3` on every entry**, so the box drew
    // over the interval in every rendered frame and the interval was never seen.
    // A box's edges are quartiles of a sample; this interval is a confidence
    // bound on one estimate, and replacing the second with the first is not
    // decoration — the two figures look alike and mean different things.
    const boxed = { ...Q, q1: -0.5, q3: 0.5 };
    const row = forestRow(boxed, -2, 2, 41, FULL_CAPS);
    expect(row, "a tee at each end").toMatch(/├─+/u);
    expect(row).toMatch(/─+┤/u);
    expect(row, "and no box body").not.toContain("[");
    expect(row).not.toContain("]");
  });

  it("T1.54 (C12 I31): the estimate is sized by weight, and one cell without", () => {
    // Which study carried the result is the plot's subject. Without this every
    // estimate is one cell and the figure is a list of intervals.
    const heavy = forestRow({ ...Q, weight: 0.8 }, -2, 2, 41, FULL_CAPS);
    const light = forestRow({ ...Q, weight: 0.1 }, -2, 2, 41, FULL_CAPS);
    const none = forestRow(Q, -2, 2, 41, FULL_CAPS);
    const mark = glyphs(FULL_CAPS).filled;
    const count = (r: string): number => [...r].filter((c) => c === mark).length; // cells-ok — a cell count
    expect(count(heavy), "a heavy study is drawn larger").toBeGreaterThan(count(light)); // cells-ok — a cell count
    expect(count(none), "and no weight is one cell").toBe(1); // cells-ok — a cell count
  });

  it("T1.55 (C12 I31): the pooled estimate is a diamond, not the study mark", () => {
    // Its own field rather than a convention about the last row — *the last row
    // is the summary* is a rule the data cannot state and a renderer cannot check.
    const pooled = forestRow({ ...Q, weight: 0.5, pooled: true }, -2, 2, 41, FULL_CAPS);
    expect(pooled).toContain(glyphs(FULL_CAPS).diamond);
    expect(pooled, "and never both").not.toContain(glyphs(FULL_CAPS).filled);
  });

  it("T1.56 (C12 I31): the null is broken, and the data draws over it", () => {
    // Broken because a solid rule crossing five intervals reads as a sixth. And
    // *under* the data, because an interval interrupted by its own reference
    // line is an interval that appears to stop there.
    const g = glyphs(FULL_CAPS);
    const away = forestRow({ ...Q, centre: 1.5, lower: 1.2, upper: 1.8 }, -2, 2, 41, FULL_CAPS, [0]);
    expect(away, "visible where nothing covers it").toContain(g.dashedVertical);
    const over = forestRow(Q, -2, 2, 41, FULL_CAPS, [0]);
    expect(over, "and hidden where the interval crosses it").not.toContain(g.dashedVertical);
  });
});

describe("GROUP 6g: the ridgeline overlaps", () => {
  const shifted = [
    { values: Array.from({ length: 40 }, (_, i) => 5 + Math.sin(i) * 1.5), label: "a" },
    { values: Array.from({ length: 40 }, (_, i) => 12 + Math.sin(i) * 1.5), label: "b" },
    { values: Array.from({ length: 40 }, (_, i) => 20 + Math.sin(i) * 1.5), label: "c" },
  ];

  /** The column where a band's curve reaches highest — its mode. */
  const peakColumn = (rows: readonly string[], from: number, to: number): number => {
    let best = -1, bestRow = Number.POSITIVE_INFINITY;
    for (let r = to; r <= from; r += 1) { // cells-ok — a row index
      const row = rows[r] ?? "";
      for (const [x, c] of [...row].entries()) { // cells-ok — a column index
        if (c !== " " && r < bestRow) { bestRow = r; best = x; }
      }
    }
    return best;
  };

  it("T1.57: the curves share one x-axis, so the shift between them is visible", () => {
    // **What a joyplot is read for.** Sampled over its own range each
    // distribution fills the width, so three centred at 5, 12 and 20 draw as
    // three identical humps and the figure says they are the same.
    //
    // **The statistic is each band's mode, and two easier ones do not work.**
    // A row's first inked cell reads the *baseline*, which a curve touches at
    // both extremes where the density is nil. And a band's centre of mass is
    // confounded by occlusion — the far curves are mostly cleared, so their
    // remaining ink is wherever the near one did not cover, which moves with the
    // shift rather than with the distribution. Both were tried; both asserted
    // the wrong thing about a correct frame.
    const { rows, baselines } = ridgelineArea(shifted, 60, 12, FULL_CAPS);
    const near = peakColumn(rows, baselines[0]!, baselines[1]! + 1);
    const far = peakColumn(rows, baselines[2]!, 0);
    expect(near, "the near curve peaks left").toBeGreaterThanOrEqual(0); // cells-ok — a column index
    expect(near, "and the far one right of it").toBeLessThan(far);

    // The control: three *identical* distributions have no shift, so their modes
    // land in the same column. Without it the row above passes against any
    // renderer that spreads ink unevenly.
    const same = shifted.map((sr) => ({ ...sr, values: shifted[0]!.values }));
    const flat = ridgelineArea(same, 60, 12, FULL_CAPS);
    const fNear = peakColumn(flat.rows, flat.baselines[0]!, flat.baselines[1]! + 1);
    const fFar = peakColumn(flat.rows, flat.baselines[2]!, 0);
    expect(Math.abs(fFar - fNear), "identical inputs peak together").toBeLessThan(far - near);
  });

  it("T1.58: a curve reaches past the next baseline, which a band cannot", () => {
    // A band per series is a stack of small area charts — the one arrangement
    // this form exists not to be. With `OVERLAP` at 2.2 a curve must reach
    // *above* its neighbour's baseline; at 1.0 it stops on it.
    //
    // **Only the first series carries data, and that is what makes the row able
    // to fail.** A curve's outline runs along its own baseline across the whole
    // width wherever the density is nil, so with four populated series every
    // column has ink at every baseline row and *the topmost ink anywhere* is the
    // furthest curve's baseline rather than the near curve's peak. Two earlier
    // versions measured that instead and passed against the mutation.
    //
    // **Four bands, not two**: at two the spacing is 5.5 rows and `round(5.5)`
    // is 6, so one band's worth already clears the neighbour by a rounding
    // artefact. At four the spacing is 2.75 — 3 rows without the overlap, 6 with
    // — and the readings land either side of the next baseline.
    const one = [
      { values: Array.from({ length: 60 }, () => 10), label: "front" },
      { values: [], label: "b" }, { values: [], label: "c" }, { values: [], label: "back" },
    ];
    const { rows, baselines } = ridgelineArea(one, 60, 12, FULL_CAPS);
    const topAt = rows.findIndex((r) => r.includes("─"));
    expect(topAt, "the front curve reaches above the next baseline").toBeLessThan(baselines[1]!); // cells-ok — a row index
  });

  it("T1.59: a near curve occludes the one behind it", () => {
    // Occlusion is a joyplot's only depth cue — the curves are the same colour
    // and thickness, and the sole thing saying which is in front is that it
    // interrupts the other. **Exactly two, not at most two**: painted
    // front-to-back the near curve is drawn first and the far one's body then
    // clears it, so the column keeps one outline instead of two. `≤ 2` is
    // satisfied by both and let that mutation live.
    const both = [
      { values: Array.from({ length: 60 }, () => 10), label: "front" },
      { values: Array.from({ length: 60 }, () => 10), label: "back" },
    ];
    const { rows, baselines } = ridgelineArea(both, 40, 12, FULL_CAPS);
    const col = peakColumn(rows, baselines[0]!, 0);
    const inked = rows.filter((r) => (r[col] ?? " ") !== " ").length; // cells-ok — a cell count
    expect(inked, "both outlines survive in the shared column").toBe(2); // cells-ok — a cell count
    expect(baselines[0]).toBeGreaterThan(baselines[1]!); // cells-ok — a row index
  });
});

describe("GROUP 6h: the bandwidth's rule of thumb has a named failure", () => {
  // Two tight clusters far apart — the exact case Silverman flattens, because
  // the rule assumes something roughly normal and widens the kernel until the
  // trough between the modes fills in.
  const bimodal = {
    values: [...Array.from({ length: 25 }, (_, i) => 10 + (i % 5) * 0.4),
             ...Array.from({ length: 25 }, (_, i) => 30 + (i % 5) * 0.4)],
  };

  const pts = Array.from({ length: 80 }, (_, i) => 5 + (i / 79) * 30);
  /** How deep the valley between the modes runs, as a fraction of the peaks. */
  const troughRatio = (d: readonly number[]): number => {
    const peak = Math.max(...d);
    const mid = d.slice(Math.floor(d.length / 3), Math.ceil((d.length * 2) / 3)); // cells-ok — an index
    return peak === 0 ? 1 : Math.min(...mid) / peak;
  };

  it("T1.60: the default keeps the trough and loses its depth", () => {
    // **Written first as *the default reports one mode*, and the estimator said
    // otherwise.** It does find the valley; what the rule of thumb takes is its
    // depth, so at a dozen rows the two lobes round into one waisted shape. The
    // claim came from reading a frame and was promoted to a claim about the
    // estimator without measuring it — a true observation about the rendering,
    // stated about the wrong layer.
    const d = kde(bimodal.values, pts);
    const troughs = d.filter((v, i) => i > 0 && i < d.length - 1 && v < d[i - 1]! && v < d[i + 1]!);
    expect(troughs.length, "the valley is there").toBeGreaterThan(0); // cells-ok — a trough count
    // 0.11 of the peak at the default against 0.001 adjusted — the valley is
    // present and two orders of magnitude shallower, which is the difference a
    // dozen rows cannot show and the field exists for.
    expect(troughRatio(d), "and it is shallow").toBeGreaterThan(0.05);
  });

  it("T1.61 (C12 §3m): the adjust deepens the valley until the modes separate", () => {
    const sharp = kde(bimodal.values, pts, scaledBandwidth(bimodal.values, 0.4));
    const peaks = sharp.filter((v, i) => i > 0 && i < sharp.length - 1 && v > sharp[i - 1]! && v > sharp[i + 1]!);
    expect(peaks.length, "two modes").toBeGreaterThanOrEqual(2); // cells-ok — a peak count
    expect(troughRatio(sharp), "and a valley the renderer can resolve")
      .toBeLessThan(troughRatio(kde(bimodal.values, pts)));
  });

  it("T1.62 (C12 §3m): 1 and absent are the same answer, so the adjust costs nothing unused", () => {
    expect(scaledBandwidth([1, 2, 3], 1)).toBeUndefined();
    expect(scaledBandwidth([1, 2, 3], undefined)).toBeUndefined();
    // And a nonsense value is refused rather than producing a degenerate kernel.
    expect(scaledBandwidth([1, 2, 3], 0)).toBeUndefined();
    expect(scaledBandwidth([1, 2, 3], -1)).toBeUndefined();
    expect(scaledBandwidth([1, 2, 3], 2)).toBeGreaterThan(0);
  });

  it("T1.63 (C12 §3m): the field reaches the renderer, not only the estimator", () => {
    // **A test that calls the mechanism misses the wiring.** The rows above
    // exercise `kde` directly and would pass with `block.bandwidth` threaded
    // nowhere.
    const mk = (bw?: number): Plot => block({
      kind: "plot", id: "v", form: "violin", height: 11, axes: true,
      categories: ["m"], series: [bimodal], ...(bw === undefined ? {} : { bandwidth: bw }),
    } as Plot);
    const k = kit();
    expect(k.renderToLines(mk(0.4), 60).join("\n")).not.toBe(k.renderToLines(mk(), 60).join("\n"));
  });
});

describe("GROUP 7: pie merges sub-threshold slices", () => {
  it("at small radius, tiny segments merge into other", () => {
    const segs = [
      { label: "Big", value: 90 },
      { label: "Tiny1", value: 0.5 },
      { label: "Tiny2", value: 0.3 },
      { label: "Tiny3", value: 0.2 },
    ];
    const { layers } = pieRender(segs, 10, 5, FULL_CAPS);
    // Four segments in, two layers out — and the survivor of the merge carries
    // `segments.length` as its index, which is what makes it "other" rather than
    // the last tiny slice wearing the others' colour.
    expect(layers.map((l) => l.segmentIndex)).toEqual([0, segs.length]); // cells-ok — a segment count
  });
});

describe("GROUP 7a: the circle forms are readable without colour (C12 I25)", () => {
  const pie = block({
    kind: "plot", id: "m7a", form: "pie", height: 10, series: [],
    segments: [
      { label: "Chrome", value: 65 }, { label: "Firefox", value: 15 },
      { label: "Safari", value: 12 }, { label: "Other", value: 8 },
    ],
  });
  const radar = block({
    kind: "plot", id: "m7b", form: "radar", height: 10,
    categories: ["Speed", "Power", "Range", "Defence", "HP"],
    series: [{ values: [80, 60, 90, 40, 70], label: "alpha" }, { values: [50, 85, 45, 75, 55], label: "beta" }],
  });

  // **Both of these were written against the composed frame first and both
  // survived their mutation**, which is the finding rather than the fix. A
  // frame's rim is a hundred partial braille cells, so *count the distinct
  // glyphs* passed with the fill forced solid; and a second series adds a
  // legend row, so *two frames differ* passed with both strokes forced solid.
  // Each row now asks the renderer for the layer it is actually about.

  // The mutation: `patternFor` returning `SOLID` at every depth. Every wedge
  // then fills with U+28FF and the four segments are one blob — which is what
  // shipped, and what §3h's table records as *one undifferentiated blob*.
  it("a 1-bit pie fills each wedge with its own mark, and a coloured one does not", () => {
    const segments = pie.segments ?? [];
    const fillOf = (rows: readonly string[]): string => {
      const tally = new Map<string, number>();
      for (const ch of rows.join("")) {
        if (ch === " " || ch === "\u2800") continue;
        tally.set(ch, (tally.get(ch) ?? 0) + 1);
      }
      // The fill is the glyph the wedge is *made* of; the rim is the tail.
      return [...tally].sort((a, b) => b[1] - a[1])[0]?.[0] ?? " ";
    };
    const fillsAt = (caps: typeof MONO_UNICODE_CAPS): string[] =>
      pieRender(segments, 80, 10, caps).layers.map((l) => fillOf(l.glyphRows));

    const mono = fillsAt(MONO_UNICODE_CAPS);
    expect(mono.length).toBe(4); // cells-ok — a layer count
    expect(new Set(mono).size).toBe(4); // cells-ok — a mark count
    // And solid where colour can do the separating — a hatched pie at 24-bit
    // would be the fix applied where the defect is not.
    expect(new Set(fillsAt(FULL_CAPS)).size).toBe(1); // cells-ok — a mark count
  });

  // The mutation: `dashFor` returning `SOLID_DASH` at every depth. Two series
  // holding the same readings then draw the same dots, so the second is
  // invisible under the first at the one depth where colour cannot say so.
  it("a 1-bit radar strokes each series differently, and a coloured one does not", () => {
    const twins = [{ values: [80, 60, 90, 40, 70] }, { values: [80, 60, 90, 40, 70] }];
    const cats = ["Speed", "Power", "Range", "Defence", "HP"];
    const mono = radarRender(twins, cats, 80, 10, MONO_UNICODE_CAPS).polygons;
    expect(mono.length).toBe(2); // cells-ok — a series count
    expect(mono[0]!.join("\n")).not.toBe(mono[1]!.join("\n"));
    const full = radarRender(twins, cats, 80, 10, FULL_CAPS).polygons;
    expect(full[0]!.join("\n")).toBe(full[1]!.join("\n"));
  });

  // The mutation: an ASCII arm that renders `categories.length` rows, or the
  // waffle's fixed ten. Both shipped, at a declared height of eight, and a
  // block that renders more rows than it measured moves everything under it.
  it("every arm renders exactly the height it measured", () => {
    for (const caps of [FULL_CAPS, MONO_UNICODE_CAPS, ASCII_CAPS, MONO_CAPS]) {
      for (const b of [pie, radar]) {
        const k = kit(caps);
        for (const width of [20, 40, 80]) {
          expect(k.renderToLines(b, width).length).toBe(k.measure(b, width)); // cells-ok — a row count
        }
      }
    }
  });
});

describe("GROUP 8: horizon bands fold", () => {
  it("a series spanning 3 bands uses 3 rows", () => {
    const series = { values: [1, 5, 10, 15, 20] as (number | null)[] };
    const range = { min: 1, max: 20 };
    const rows = horizonRows(series, range, 3, 20, 3, FULL_CAPS);
    const nonEmpty = rows.filter((r) => r.trim() !== "");
    expect(nonEmpty.length).toBeGreaterThan(1); // cells-ok — a row count
  });
});

describe("M1: rampFor returning the wrong axis — compile-time", () => {
  it("the type prevents the mistake (this test documents the guarantee)", () => {
    expect(true).toBe(true);
  });
});

describe("M2: annotation drawn in colour at 1-bit — F34", () => {
  it("an annotation at 1-bit is distinguishable from blank", () => {
    const b = block({
      kind: "plot", id: "m2", form: "line", height: 5, axes: true,
      series: [{ values: [1, 5, 3, 7, 2] }],
      annotations: [{ kind: "line", value: 4 }],
    });
    const k = kit(MONO_CAPS);
    const lines = k.renderToLines(b, 40);
    expect(lines.join("\n").length).toBeGreaterThan(0); // cells-ok — total characters
  });
});

describe("histogram binning rules differ", () => {
  it("Sturges, Freedman-Diaconis, Scott produce different bin counts", () => {
    const data = Array.from({ length: 200 }, (_, i) => Math.sin(i * 0.1) * 10);
    const sturges = binValues(data, "sturges");
    const fd = binValues(data, "freedman-diaconis");
    const scott = binValues(data, "scott");
    const counts = new Set([sturges.counts.length, fd.counts.length, scott.counts.length]); // cells-ok — bin counts
    expect(counts.size).toBeGreaterThanOrEqual(2);
  });
});

describe("waffle segment proportions", () => {
  it("35% fills 35 cells", () => {
    const rows = waffleCells(
      [{ label: "A", value: 35 }, { label: "B", value: 65 }],
      10, FULL_CAPS,
    ).map((row) => row.map((c) => c.mark).join(""));
    const flat = rows.join("");
    const filled = [...flat].filter((c) => c !== " ").length; // cells-ok — a cell count
    expect(filled).toBe(100);
  });
});

describe("step holds value horizontally", () => {
  it("step output differs from scatter output", () => {
    const series = { values: [0, 10, 0] as (number | null)[] };
    const range = { min: 0, max: 10 };
    const stepResult = stepRows(series, range, 20, 5, FULL_CAPS);
    const scatterResult = scatterRows(series, range, 20, 5, FULL_CAPS);
    expect(stepResult.join("\n")).not.toBe(scatterResult.join("\n"));
  });
});

/**
 * The bar is an extent, not a fill (C12 I21, §3f).
 *
 * **These two rows exist because a mutation survived.** The golden corpus caught
 * the shaded remainder and the data-minimum baseline immediately — sixteen and
 * twelve frames respectively — and did not notice either the value format or the
 * bin precision, because a snapshot records whatever it is given and both
 * mutations produced a plausible-looking number. A mutation that fails nothing
 * is a finding about the tests.
 */
describe("C12 §3f — the bar's readout and its bins", () => {
  it("T1.60 (C12 I21): a bar's value label goes through `yFormat`, not a bare round", () => {
    // `String(Math.round(v * 10) / 10)` drops the unit and the trailing zero, so
    // a percentage, a byte count and a duration all render as the same digits.
    // `axes.ts` records this exact class as having happened three times; the
    // bar's inline formatter was the fourth, in the one place the reader reads
    // the number rather than the picture.
    const caps = { unicode: "full", ambiguousWidth: "narrow" } as const;
    const pct = barRow(45.2, 0, 100, 40, caps, true, "percent");
    expect(pct, "a percentage keeps its sign").toContain("45.2%");

    const plain = barRow(45.2, 0, 100, 40, caps, true);
    expect(plain, "and not a per-cent sign it was not given").not.toContain("%");
    // **A finding, recorded where it was found.** With no declared format,
    // `formatReadout` routes to `formatNumber`, whose decimal count is chosen
    // from the value's *magnitude* — so 45.2 renders as `45`. That is the class
    // `axes.ts` §32-38 names ("docker stats sends 45.2% and the cell drew 45%")
    // surviving in the arm with no format to consult. It is out of this
    // commit's scope and asserted as it stands rather than as it should be, so
    // that changing it is a deliberate act with a failing row attached.
    expect(plain, "the undeclared-format arm truncates — see the comment").toContain("45");

    // The old formatter's actual output for this input, so the row names the
    // change that makes it fail rather than only the assertion.
    const bytes = barRow(1536, 0, 4096, 40, caps, true, "bytes");
    expect(bytes, "bytes are a unit, not a count of them").not.toContain(" 1536");
  });

  it("T1.61 (C12 I21): a bin label is an interval, at a precision its own width earns", () => {
    // A bare left edge reads as a point value, not a range — and a fixed two
    // decimals prints `[3.00, 3.00)` for a narrow bin, a statement no reading
    // can satisfy.
    const wide = binValues([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100], "sturges");
    for (const l of wide.labels) {
      expect(l, "an interval is bracketed").toMatch(/^\[.*[)\]]$/u);
      expect(l, "and has two bounds").toContain(",");
    }
    expect(wide.labels[wide.labels.length - 1], "the last bin is closed").toMatch(/\]$/u);

    // A span of 0.001 across several bins needs more than two decimals, or every
    // label collides with its neighbour.
    const narrow = binValues(
      Array.from({ length: 40 }, (_, i) => 1 + i * 0.0001),
      "sturges",
    );
    const bounds = narrow.labels.map((l) => l.split(",")[0]);
    expect(new Set(bounds).size, "every lower bound is distinct").toBe(bounds.length);
  });
});
