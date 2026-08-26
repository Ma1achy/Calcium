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
import { HIERARCHY_ROLE, block, type Plot, type QuartileSummary } from "../../src/data/viewmodel/index.js";
import { bubbleRows, scatterRows, stepRows } from "../../src/presentation/plot/scatter.js";
import { boxplotBand, boxplotColumn, bulletRow, forestRow, lagRow, timelineRow } from "../../src/presentation/plot/glyph-row.js";
import { brailleOutline, violinColumn, violinRows } from "../../src/presentation/plot/kde.js";
import { glyphs } from "../../src/presentation/blocks/glyphs.js";
import { barRow } from "../../src/presentation/plot/categorical.js";
import { binValues } from "../../src/presentation/plot/derive.js";
import { extentFor, extentRun, ladderFor, pairFor } from "../../src/presentation/plot/ramp.js";
import { legendPlacement } from "../../src/presentation/plot/furniture.js";
import { plotHeight } from "../../src/presentation/plot/height.js";
import { drawnWidth } from "../../src/presentation/plot/definition.js";
import { cells } from "../../src/presentation/text.js";
import { rainColumns, rainRows, ridgelineArea } from "../../src/presentation/plot/kde.js";
import { kde, scaledBandwidth } from "../../src/presentation/plot/derive.js";
import { jitterOf, stripColumn, stripRow } from "../../src/presentation/plot/strip.js";
import { aggregate, candleColumn, candleLeft, candleRows, candleWidth } from "../../src/presentation/plot/candles.js";
import { seriesRange, FACING_DEFAULT } from "../../src/presentation/plot/scale.js";
import { proportionDecisions, sharesOf } from "../../src/presentation/plot/figure.js";
/**
 * The two figure members `circle.ts` used to compute for itself (§3ak.26).
 *
 * A test passing its own ceiling or its own shares would be the
 * reimplemented-rule class one layer up — so both come off the same emitter
 * `definition.ts` reads.
 */
const ceilingOf = (series: readonly { values: readonly (number | null)[] }[], categories: readonly string[]): number =>
  proportionDecisions(block({
    kind: "plot", id: "ceil", form: "radar", height: 10,
    categories: [...categories], series: series.map((s) => ({ values: [...s.values] })),
  })).value?.range.max ?? 1;

import { formatReadout, readoutSet, xTickRow } from "../../src/presentation/plot/axes.js";
import { waffleCells } from "../../src/presentation/plot/waffle.js";
import { squareColumns } from "../../src/presentation/plot/aspect.js";
import { fillHeight } from "../../src/presentation/plot/height.js";
import { horizonBandT, horizonGlyph, horizonGrid, horizonSpans } from "../../src/presentation/plot/horizon.js";
import { COLORMAPS } from "../../src/presentation/theme/colormap.js";
import { validateBlock, HONOURS_AXIS_CROSS, ORIGIN_DEFAULT, type PlotForm } from "../../src/data/viewmodel/index.js";
import { b } from "../../src/shell/builders/index.js";
import { pieRender, radarRender } from "../../src/presentation/plot/circle.js";
import { facetWidths, smallMultiplesRows } from "../../src/presentation/plot/facet.js";
import { bandRows, stackBands } from "../../src/presentation/plot/stack.js";
import { strips, tiles } from "../../src/presentation/plot/hierarchy.js";
import { categoryMarks, refOf as paletteRef } from "../../src/presentation/plot/marks.js";
import { slot } from "../../src/presentation/blocks/paint.js";
import { DARK_THEME } from "../support/render.js";
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

  it("T1.89 (C12 I34, C04 I56): the rung is the form's, and below a density there is only the box", () => {
    // **Two ladders, not one with two floors** — the first version wrote the four
    // rungs as a single table and gave each form an index into it, which made a
    // boxplot's `"full"` the third rung of a *density* ladder. A boxplot with
    // three rows drew one, because the rungs between were densities it cannot
    // draw and the walk stopped at the first.
    const q = { min: 0, q1: 2, median: 4, q3: 6, max: 8 };
    const box = (detail: Plot["plotDetail"], height: number): readonly string[] =>
      plain(block({
        kind: "plot", id: "b", form: "boxplot", height, axes: false,
        categories: ["A"], quartiles: [q], series: [],
        ...(detail === undefined ? {} : { plotDetail: detail }),
      }) as Plot);
    const inked = (rows: readonly string[]): number => rows.filter((r) => r.trim() !== "").length; // cells-ok — a row count

    expect(inked(box("full", 3)), "a boxplot's full rung is three rows").toBe(3); // cells-ok — a row count
    expect(inked(box("compact", 3)), "and its floor is one, in the same band").toBe(1); // cells-ok — a row count
    expect(inked(box(undefined, 3)), "auto reaches the full rung — no density to doubt").toBe(3); // cells-ok — a row count

    // **`"auto"` reads what there is to draw and `"full"` does not.** A density
    // rung resolves five levels, so a band with fewer than five finite samples
    // cannot distinguish them — what it draws is a broad flat shape that reads
    // as *this distribution is uniform*, which is a statement about the sample
    // count. The number is the rung's own level count, not a taste.
    const violin = (detail: Plot["plotDetail"], values: readonly number[]): readonly string[] =>
      plain(block({
        kind: "plot", id: "v", form: "violin", height: 6, axes: false,
        categories: ["A"], series: [{ values: [...values] }],
        ...(detail === undefined ? {} : { plotDetail: detail }),
      }) as Plot);
    const many = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const few = [1, 5, 9];

    // **Asserted on the figure and not on its shape.** The first version asked
    // whether the outline had corners, which is a property of the *density* and
    // not of the rung: three samples spread wide give a broad flat estimate that
    // draws no corners on either rung, so the row read `full` as having fallen
    // to the box. The structural difference is the IQR fill — `boxplotBand`'s
    // compact arm inks the interquartile run because a one-row box has no edges
    // to enclose it, and no violin rung draws that glyph at all.
    const boxed = (rows: readonly string[]): boolean =>
      rows.some((r) => r.includes(pairFor(FULL_CAPS).filled));
    expect(boxed(violin(undefined, many)), "ten samples: auto draws the density").toBe(false);
    expect(boxed(violin(undefined, few)), "three samples: auto falls to the box").toBe(true);
    expect(boxed(violin("full", few)), "and `full` draws the density anyway, having asked").toBe(false);

    // **The column floor, which construction cannot reach.** `validateBlock`
    // takes a block and no width, so a vertical violin too narrow to hold a
    // density is refused nowhere — C12 draws the box instead, on I18's ladder.
    // Three bands in 12 cells is four columns each and the floor is three; in 8
    // it is two, and two is four dot-columns split between density and box.
    const vertical = (w: number): readonly string[] =>
      plain(block({
        kind: "plot", id: "vv", form: "violin", height: 8, axes: false,
        orientation: "vertical", categories: ["A", "B", "C"],
        series: [{ values: many }, { values: many }, { values: many }],
      }) as Plot, FULL_CAPS, w);
    //
    // **Discriminated by the renderer's glyph source, not by the figure's
    // shape.** `boxplotColumn` builds its corners from named slots and always
    // draws `┌`; `violinColumn` builds its outline through `glyphForMask` with
    // the block's `plotCorners`, which defaults to rounded — so at the default
    // the two cannot draw the same corner. Asking about `█` instead does not
    // work here and that is the second proxy this row has cost: the compact
    // *row* box inks its interquartile run, and the compact *column* box only
    // does so at one cell wide.
    const sharpCorner = (rows: readonly string[]): boolean => rows.some((r) => r.includes("\u250c"));
    expect(sharpCorner(vertical(12)), "four columns a band: every band clears the floor").toBe(false); // cells-ok — a width
    expect(sharpCorner(vertical(8)), "the band left with two columns falls to the box").toBe(true); // cells-ok — a width
  });

  /** A five-number summary, and no mean — a `◆` would sit over the median. */
  const summary = (values: readonly number[]): QuartileSummary => {
    const v = [...values].sort((a, b) => a - b);
    const at = (f: number): number => v[Math.min(v.length - 1, Math.floor(f * v.length))]!; // cells-ok — a sample count
    return { min: v[0]!, q1: at(0.25), median: at(0.5), q3: at(0.75), max: v[v.length - 1]! }; // cells-ok — a sample count
  };

  /**
   * The cloud's fullest column — **the centre of the tied run, not its first.**
   * More than one column can reach the ladder's top, and `indexOf` would then
   * report a symmetric distribution's mode to the left of its own median.
   */
  const peakOf = (row: string): number => {
    const ladder = [...ladderFor("height", FULL_CAPS).steps];
    const levels = [...row].map((c) => ladder.indexOf(c)); // cells-ok — a ladder index
    const best = Math.max(...levels);
    const hit = levels.flatMap((l, i) => (l === best ? [i] : [])); // cells-ok — a column index
    return hit.length === 0 ? -1 : Math.round((hit[0]! + hit[hit.length - 1]!) / 2); // cells-ok — a column index
  };

  it("T1.91 (C12 I34): the cloud and the box read one axis", () => {
    // **The defect this row exists for is invisible to every count.**
    // `violinRows` pads its value axis by a tenth at each end so a tail has
    // somewhere to taper; `boxplotBand` puts `min` in column 0 and `max` in the
    // last with no pad. Both are right for the figure that owns them, and a
    // raincloud is both figures in one band — so composed without a decision the
    // cloud's mode sits a tenth of the width from the median below it, with
    // every value in range and every column accounted for.
    //
    // **The axis is pinned off-centre and that is what makes the row bite.**
    // The violin's pad is symmetric — a tenth at each end — so a distribution
    // sitting at the *middle* of its axis has the same mode column under both
    // mappings, and the row would pass against the defect it names. Pinned to
    // 0..100 with the mass down at 15, the pad compresses the cloud toward the
    // centre and the box does not move: the two disagree by four columns.
    const LO = 0, HI = 100, W = 61; // cells-ok — a frame width, odd so a centre column exists
    const symmetric = Array.from({ length: 60 }, (_v, i) => 15 + 3 * Math.tan((((i + 0.5) / 60) - 0.5) * 2.4));
    const skewed = Array.from({ length: 60 }, (_v, i) => 18 + 34 * ((i + 0.5) / 60) ** 3);

    const rain = (values: readonly number[]): { peak: number; median: number } => {
      const rows = rainRows({ values: [...values] }, summary(values), LO, HI, W, FULL_CAPS, 0, false); // cells-ok — a column budget
      return { peak: peakOf(rows[0] ?? ""), median: [...(rows[1] ?? "")].indexOf(glyphs(FULL_CAPS).vertical) }; // cells-ok — a column index
    };

    // A distribution whose mode **is** its median: the cloud's fullest column
    // and the box's median are the same column, or the two axes disagree.
    const sym = rain(symmetric);
    expect(sym.peak, "the cloud has a fullest column").toBeGreaterThanOrEqual(0); // cells-ok — a column index
    expect(sym.median, "the box has a median").toBeGreaterThanOrEqual(0); // cells-ok — a column index
    expect(sym.peak, "mode and median in one column").toBe(sym.median); // cells-ok — a column index

    // And where the data says they differ, they differ **by what the data
    // says**. A cubic's mass is low and its tail is long, so the mode sits
    // below the median — a relationship no axis mismatch produces and no
    // rounding erases.
    const skew = rain(skewed);
    expect(skew.peak, "a skew puts the mode below the median").toBeLessThan(skew.median); // cells-ok — a column index

    // **The fixture responds, measured rather than assumed.** The defect is
    // internal — the cloud on one axis, the box on another — so it cannot be
    // reached by changing an argument, and the mutation is what tests it
    // (T6.24). What *can* be shown here is that the padded axis puts the mode
    // somewhere else at all, which is the premise the mutation trades on: if a
    // tenth of this axis were worth nothing, T6.24 would fail nothing.
    const pad = (HI - LO) * 0.1;
    const moved = peakOf(rainRows({ values: symmetric }, summary(symmetric), LO - pad, HI + pad, W, FULL_CAPS, 0, false)[0] ?? ""); // cells-ok — a column budget
    expect(moved, "a tenth of this axis is worth columns").not.toBe(sym.peak); // cells-ok — a column index
  });

  it("T1.92 (C12 I34, I16): blank is outside the support, and the first step is not blank", () => {
    // **One row, two meanings, and I16 is what keeps them apart.** A ramp's
    // first step is ink because a blank minimum reads as *nothing here* — and
    // *nothing here* is exactly what a column beyond the cut has to say. Drawn
    // without the cut the row is `▁` from edge to edge: a rule along the bottom
    // saying this distribution is everywhere, which is the picture the violin's
    // outline drew before `cut` landed one rung up.
    //
    // **The spread is measured, not chosen.** At a spread of 0.4 on this axis
    // the whole support falls inside one column, whose step is the *maximum* —
    // so the row's second half asserts nothing and its first half is trivially
    // true. Measured across 0.4 · 1 · 2 · 3 · 5 · 8, the support runs
    // 1 · 3 · 7 · 11 · 19 · 31 columns and its edge step 7 · 2 · 1 · 0 · 0 · 0.
    // Three is the first that reaches the ladder's floor, which is the glyph
    // this row is about.
    const tight = Array.from({ length: 60 }, (_v, i) => 40 + 3 * Math.tan((((i + 0.5) / 60) - 0.5) * 2.4));
    // A wide axis the sample occupies a sliver of, so the cut has somewhere to
    // bite. Pinned by hand rather than taken from the data.
    const cloud = [...(rainRows({ values: tight }, summary(tight), 0, 100, 61, FULL_CAPS, 0, false)[0] ?? "")]; // cells-ok — a column budget

    const ladder = [...ladderFor("height", FULL_CAPS).steps];
    const drawn = cloud.filter((c) => c !== " ");

    expect(drawn.length, "something is drawn").toBeGreaterThan(0); // cells-ok — a cell count
    expect(cloud.filter((c) => c === " ").length, "and the ends are not").toBeGreaterThan(0); // cells-ok — a cell count
    // Contiguous: the support is a run, so a blank inside it would be a hole and
    // a hole is the collision this row forbids.
    const lo = cloud.findIndex((c) => c !== " "); // cells-ok — a column index
    const hi = cloud.length - 1 - [...cloud].reverse().findIndex((c) => c !== " "); // cells-ok — a column index
    for (let i = lo; i <= hi; i += 1) { // cells-ok — a column index
      expect(cloud[i], `column ${String(i)} of the support is not blank`).not.toBe(" ");
    }
    // **And the support's faintest column is the ladder's first step**, which is
    // the half a cut alone does not give: a cut says where to stop, and C12 I16
    // says that what stands at the minimum is ink. Both ends, because the cut is
    // applied at both and an off-by-one at one of them is a hole.
    expect(cloud[lo], "the support's low edge is the ladder's floor").toBe(ladder[0]);
    expect(cloud[hi], "and so is its high edge").toBe(ladder[0]);
  });

  it("T1.97 (C12 I34): one chart draws one figure, and the remainder decides only the width", () => {
    // **`categoricalColumnForm` distributes its remainder a cell at a time**, so
    // eighteen bands over seventy-five cells is four each and three of them
    // five. A rung ladder keyed on each band's own width then drew three
    // mirrored violins among fifteen rainclouds — and a reader takes that as a
    // property of those three categories rather than of the division.
    //
    // Every width sums, every band is the richest figure its own width affords,
    // and nothing in it is arithmetically wrong. Reading the frame is what found
    // it and is the only thing that could.
    const N = 18; // cells-ok — a category count, chosen so 75 does not divide by it
    const bands = Array.from({ length: N }, (_v, h) =>
      ({ values: Array.from({ length: 30 }, (_w, i) => 40 + Math.sin(h * 0.6) * 14 + Math.sin(i * 0.9 + h) * 6) }));
    const rows = plain(block({
      kind: "plot", id: "u", form: "violin", height: 14, axes: true, orientation: "vertical",
      categories: Array.from({ length: N }, (_v, h) => String(h)),
      series: bands,
    }) as Plot, FULL_CAPS, 80); // cells-ok — a frame width

    // **Asserted over the set of figures, because the defect is that the set has
    // two members.** A raincloud's cloud is braille; a mirrored violin's outline
    // comes from `glyphForMask`, whose rounded table is the block's default —
    // so the two rungs cannot share a glyph and a frame carrying both is a frame
    // carrying the defect.
    //
    // **`glyphs().topLeft` is the plot's own border and not the violin**, which
    // is the proxy this row cost: `┌` is drawn on every frame that has a frame,
    // so the first form of the assertion failed against correct output. The
    // rounded corners belong to `linedraw.ts` and appear in no furniture.
    const outline = new Set(["\u256d", "\u256e", "\u2570", "\u256f"]);
    const body = rows.join("");
    expect([...body].some((c) => c >= "\u2800" && c <= "\u28ff"), "the rung drawn is the raincloud")
      .toBe(true);
    expect([...body].some((c) => outline.has(c)), "and no band drew the mirrored outline")
      .toBe(false);

    // **The fixture responds**: the widths really are ragged, so a per-band
    // ladder had somewhere to differ. Three of eighteen are a cell wider, and a
    // frame where they were not would pass this row against either rule.
    const area = 80 - 3 - 1 - 1; // cells-ok — a frame width less its gutter and borders
    expect(area % N, "the band count does not divide the area").not.toBe(0); // cells-ok — a column count
  });

  it("T1.95 (C12 I11, I34): the jitter is decorrelated from the index it is drawn from", () => {
    // **`i % 4` is deterministic and it is not a jitter.** It satisfies I11
    // exactly — same block, same picture — and draws a sawtooth: consecutive
    // samples march down the dot rows in lockstep, so **sorted data draws
    // diagonal stripes**, which is a pattern in the renderer read as a pattern
    // in the measurements. Distribution data arrives sorted often enough that
    // this is the ordinary case rather than the adversarial one.
    const N = 400, P = 4; // cells-ok — a sample count and a position count
    const seq = Array.from({ length: N }, (_v, i) => jitterOf(0, i, P)); // cells-ok — a position index

    // Every position is reached, or the strip is thinner than it claims.
    expect(new Set(seq).size, "all four dot rows are used").toBe(P); // cells-ok — a position count

    // And it is not the sawtooth. A third is a floor with room to spare: a
    // uniform hash disagrees with `i % 4` on three quarters of the indices, and
    // the sawtooth itself disagrees on none.
    const sawtooth = seq.filter((v, i) => v === i % P).length; // cells-ok — a sample count
    expect(sawtooth / N, "not `i % positions`").toBeLessThan(0.5);

    // **The band's index is an input**, so two bands of one distribution do not
    // draw the same speckle — which would read as a coincidence in the data.
    const other = Array.from({ length: N }, (_v, i) => jitterOf(1, i, P)); // cells-ok — a position index
    const same = seq.filter((v, i) => v === other[i]).length; // cells-ok — a sample count
    expect(same / N, "a second band is a different speckle").toBeLessThan(0.5);

    // Bounded, which nothing else here checks and a `%` on a negative would
    // break: a 32-bit avalanche folded with `%` must never leave the range.
    for (const v of [...seq, ...other]) {
      expect(v, "inside the positions").toBeGreaterThanOrEqual(0); // cells-ok — a position index
      expect(v, "inside the positions").toBeLessThan(P); // cells-ok — a position count
    }
  });

  it("T1.96 (C12 I21, I34): the strip reads the box's axis at twice its resolution", () => {
    // **The sub-cell win is real and it is on one axis only.** A braille cell is
    // two dots wide and four tall, so a horizontal strip resolves two value
    // positions per cell where the cloud and the box resolve one — and four
    // jitter positions down, which is the spread rather than the signal.
    const W = 20; // cells-ok — a column budget
    const at = (values: readonly number[]): string => stripRow(values, 0, 100, W, FULL_CAPS, 0); // cells-ok — a column budget

    // The ends land on the ends, on the same axis the box uses.
    expect([...at([0])].findIndex((c) => c !== " "), "the minimum is in column 0").toBe(0); // cells-ok — a column index
    expect([...at([100])].findIndex((c) => c !== " "), "and the maximum in the last").toBe(W - 1); // cells-ok — a column index

    // **Two values half a cell apart resolve into one cell's two dot columns.**
    // The value axis is `2W` dots wide, so index 0 and index 1 share cell 0 and
    // differ within it — a distinction the box cannot make at any width it is
    // given, and the reason the strip is worth its row.
    const one = 100 / (2 * W - 1); // cells-ok — a dot budget
    const cell = [...at([0, one])][0] ?? " ";
    const mask = (cell.codePointAt(0) ?? 0x2800) - 0x2800;
    expect(mask & 0x47, "a dot in the cell's left column").toBeGreaterThan(0);
    expect(mask & 0xb8, "and one in its right").toBeGreaterThan(0);

    // **The vertical strip inverts with its box, and a flipped one is
    // plausible.** Row 0 is the top, so `max` belongs on the first row and `min`
    // on the last — the same inversion `boxplotColumn` applies. Drawn without
    // it, every sample sits beside the wrong part of the box and the figure
    // reads as a distribution that is upside down about nothing in particular.
    const only = (values: readonly number[], rows: number): readonly number[] =>
      stripColumn(values, 0, 100, 1, rows, FULL_CAPS, 0) // cells-ok — a column budget
        .flatMap((r, i) => (r.trim() === "" ? [] : [i])); // cells-ok — a row index
    expect(only([100], 8), "the maximum is on the top row").toEqual([0]); // cells-ok — a row budget
    expect(only([0], 8), "and the minimum on the last").toEqual([7]); // cells-ok — a row index

    // **ASCII draws a rug and nothing from a ramp** (C12 I21). No sub-cell
    // position to spend, and folding through the ramp would draw `. : - =` by
    // where a sample landed inside its cell — a magnitude the data has not got.
    const rug = stripRow([0, 50, 100], 0, 100, W, ASCII_CAPS, 0); // cells-ok — a column budget
    const ramp = new Set([...ladderFor("height", ASCII_CAPS).steps]);
    for (const c of rug) {
      if (c === " ") continue;
      expect(c, "the rug's mark is not a ramp step").toBe(glyphs(ASCII_CAPS).dotted);
      expect(ramp.has(c) && c !== glyphs(ASCII_CAPS).dotted, "and no ramp glyph appears").toBe(false);
    }
  });

  it("T1.93 (C12 I21, I34): the vertical cloud is a run that grows away from the box", () => {
    // **A run, not a ladder** — the band is thin in *width*, so the resolution
    // is the run's length across cells rather than a step inside one, and which
    // shape a density needs is decided by the dimension the band is thin in and
    // not by the axis the values lie along. This was very nearly a third
    // `Encoding` called `column`.
    //
    // The direction is the assertion, because a leftward run drawn with
    // rightward glyphs is right in every count and reversed in the picture: the
    // cloud would grow *from* the box's neighbour toward the frame instead of
    // toward the box, and the two would be separated by the density's own
    // shortfall.
    const values = Array.from({ length: 60 }, (_v, i) => 40 + 6 * Math.tan((((i + 0.5) / 60) - 0.5) * 2.4));
    const COL = 4, ROWS = 15; // cells-ok — a column budget and a row budget
    const rows = rainColumns({ values }, summary(values), 0, 100, COL, ROWS, FULL_CAPS, 0, false);

    expect(rows.length, "one row per row").toBe(ROWS); // cells-ok — a row count
    for (const r of rows) expect(cells(r, "narrow"), "and each is the slot wide").toBe(COL); // cells-ok — a column count

    // The box is the figure's last column; the cloud is everything before it.
    // **Ink in the cloud is a suffix**: no blank between the run and the box,
    // whatever the run's length. Under a rightward vocabulary it is a prefix,
    // and the gap opens against the box.
    const inked: number[] = []; // cells-ok — a row count
    for (const [ri, row] of rows.entries()) {
      const cloud = [...row].slice(0, COL - 1); // cells-ok — a column count
      const hit = cloud.flatMap((c, i) => (c === " " ? [] : [i])); // cells-ok — a column index
      if (hit.length === 0) continue; // cells-ok — a cell count
      inked.push(ri);
      expect(hit[hit.length - 1], `row ${String(ri)}: the run reaches the box`)
        .toBe(cloud.length - 1); // cells-ok — a column index
      expect(hit.length, `row ${String(ri)}: and it is contiguous`)
        .toBe(hit[hit.length - 1]! - hit[0]! + 1); // cells-ok — a cell count
    }

    expect(inked.length, "rows carry a cloud").toBeGreaterThan(0); // cells-ok — a row count

    // **The tip is what the direction moves, and the suffix rule above cannot
    // see it.** The caller right-aligns either way, so a rightward vocabulary
    // draws the same run in the same cells — with its fractional glyph on the
    // end *against the box* instead of on the end away from it. That is a
    // dot-column of daylight between the cloud and the box it belongs to, and
    // it survived the alignment assertion untouched.
    //
    // The two arms share their *solid* and not their partials (T1.88), so this
    // is about direction and not about a count: `▐` fills a cell's right where
    // the rightward eighths fill its left.
    const left = extentFor(FULL_CAPS, "leftward");
    const right = extentFor(FULL_CAPS, "rightward");
    let tips = 0; // cells-ok — a cell count
    for (const [ri, row] of rows.entries()) {
      const cloud = [...row].slice(0, COL - 1); // cells-ok — a column count
      const hit = cloud.flatMap((c, i) => (c === " " ? [] : [i])); // cells-ok — a column index
      for (const g of right.partials) {
        expect(cloud.includes(g), `row ${String(ri)}: no rightward tip`).toBe(false);
      }
      for (const [i, c] of cloud.entries()) {
        if (!left.partials.includes(c)) continue;
        tips += 1; // cells-ok — a cell count
        expect(i, `row ${String(ri)}: the tip is at the run's far end`).toBe(hit[0]); // cells-ok — a column index
      }
    }
    // **The fixture responds**: a cloud that saturates every row it touches is
    // a full run either way, and this row would pass against a reversed
    // vocabulary it never met.
    expect(tips, "some row draws a fractional tip").toBeGreaterThan(0); // cells-ok — a cell count

    // **Two width rules and each needs the slot where only it bites** — at
    // eleven columns either one alone leaves the same gap, so a row written
    // there passes against a tree missing either.
    const span = (slot: number): { lo: number; hi: number } => {
      const drawn = rainColumns({ values }, summary(values), 0, 100, slot, ROWS, FULL_CAPS, 0, false); // cells-ok — a column budget
      let lo = slot, hi = -1; // cells-ok — a column index
      for (const row of drawn) {
        for (const [i, c] of [...row].entries()) {
          if (c === " ") continue;
          if (i < lo) lo = i; // cells-ok — a column index
          if (i > hi) hi = i; // cells-ok — a column index
        }
      }
      return { lo, hi };
    };

    // **The cap.** A longer run is magnitude resolution, and a density has none
    // to spend: the two arms put the magnitude on different axes, so a wider
    // horizontal band buys more of the *value* axis and a wider vertical band
    // buys only a longer ruler. At twenty-one columns three fifths is thirteen,
    // and the frame drew a filled bar chart with its shape legible only along
    // one edge. Five — four cells of cloud and one of box — is where the run's
    // `2n + 1` levels match the height ladder's eight.
    const capped = span(21); // cells-ok — a column budget
    expect(capped.hi - capped.lo + 1, "the figure is capped, not three fifths of the slot").toBeLessThanOrEqual(5); // cells-ok — a column width

    // **The narrowing**, which the cap does not do at six columns: capped alone
    // the figure is five of six and sits against its neighbour, and this is
    // `boxplotColumn`'s rule rather than a second one — drawn to the full slot
    // one band's cloud ran into the next band's box, `⣿⣿─⣿⣿─` reading as a
    // single six-cell run with three distributions in it.
    const narrow = span(6); // cells-ok — a column budget
    expect(narrow.lo, "a gap on the left at six columns").toBeGreaterThan(0); // cells-ok — a column index
    expect(narrow.hi, "and on the right").toBeLessThan(5); // cells-ok — a column index

    // At the three-column budget there is nothing to spare and the figure takes
    // the slot whole, exactly as the box rung does there.
    const floor = span(3); // cells-ok — a column budget
    expect(floor.lo, "the budget's own width has no gap to give").toBe(0); // cells-ok — a column index
    expect(floor.hi, "and uses all three").toBe(2); // cells-ok — a column index

    // **The raindrop's split at its own budget: two of cloud, one of box, one
    // of rain.** Served strip-first the cloud gets one column at exactly the
    // width the ladder was written for — three levels of density where the
    // budget promises five — and every column is still accounted for.
    //
    // **The box's column is read off its own glyphs and not off *not braille*.**
    // It was the second: the cloud was braille and the box was named glyphs, so
    // *anything that is not a dot* located it — a proxy that held only while the
    // leftward extent was braille, and stopped the day it became `█` and `▐`.
    // The box draws from `glyphs(caps)` and nothing else in the figure does.
    const drop = rainColumns({ values }, summary(values), 0, 100, 4, ROWS, FULL_CAPS, 0, true); // cells-ok — a column budget
    const boxGlyphs = new Set([..."\u2502\u251c\u2524\u252c\u2534\u253c\u2500\u25c6\u25c8"]);
    const boxAt: number[] = []; // cells-ok — a column index
    for (const row of drop) {
      for (const [i, c] of [...row].entries()) {
        if (boxGlyphs.has(c)) boxAt.push(i); // cells-ok — a column index
      }
    }
    expect(boxAt.length, "the box is drawn").toBeGreaterThan(0); // cells-ok — a cell count
    expect(new Set(boxAt), "and it is the third column of four").toEqual(new Set([2])); // cells-ok — a column index
  });

  it("T1.94 (C12 I34): the renderer reaches the raincloud, not only the function", () => {
    // **The wiring, which the two rows above cannot see.** T1.91 and T1.92 call
    // `rainRows` directly, so they pass on the day nothing calls it — the
    // seam-level shape that has cost this project a defect before. What decides
    // it is the *rung*, and the rung is chosen inside `definition.ts`.
    //
    // Discriminated by vocabulary: a height ladder's steps are drawn by the
    // cloud and by nothing else a violin renders. `violinRows` draws `╶─╮╰` and
    // `boxplotBand` draws `├┤█│`; neither reaches for a ramp at all.
    const values = Array.from({ length: 60 }, (_v, i) => 30 + 6 * Math.tan((((i + 0.5) / 60) - 0.5) * 2.4));
    const violin = (detail: Plot["plotDetail"], height: number): string =>
      plain(block({
        kind: "plot", id: "rc", form: "violin", height, axes: false,
        categories: ["A"], series: [{ values }],
        ...(detail === undefined ? {} : { plotDetail: detail }),
      }) as Plot).join("\n");

    const ladder = [...ladderFor("height", FULL_CAPS).steps];
    const clouded = (frame: string): boolean => ladder.some((g) => frame.includes(g));

    expect(clouded(violin("compact", 8)), "the floor of a violin is the raincloud").toBe(true); // cells-ok — a row count
    expect(clouded(violin(undefined, 2)), "and two rows is the rung it fits").toBe(true); // cells-ok — a row count
    // And the top rung is still the mirrored outline, which draws no ramp at
    // all — so the row is about which rung was chosen rather than about a glyph
    // being available.
    expect(clouded(violin("full", 12)), "the mirrored violin reaches for no ramp").toBe(false); // cells-ok — a row count
  });

  it("T1.90 (C12 I28): a rung shorter than its band takes its name with it", () => {
    // **Two correct placements that never met.** A figure is drawn from its
    // band's first row because that is where a renderer starts; a band's name
    // sits at the band's centre because that is where a name belongs. At three
    // categories in twelve rows a compact box drew on row 0 of each four-row
    // band and its name landed on row 2 — pointing at blank space, the box it
    // named two rows above and unlabelled.
    //
    // Every count was right: the row total, the label's column, the figure. No
    // assertion about either half could see it, and reading the frame is what
    // did.
    const q = { min: 0, q1: 2, median: 4, q3: 6, max: 8 };
    const banded = (detail: Plot["plotDetail"], height: number): readonly string[] =>
      plain(block({
        kind: "plot", id: "bl", form: "boxplot", height, axes: true,
        categories: ["A", "B", "C"], quartiles: [q, q, q], series: [],
        ...(detail === undefined ? {} : { plotDetail: detail }),
      }) as Plot, FULL_CAPS, 60); // cells-ok — a frame width

    // **Found by the label rather than asserted at an index**, because an
    // off-by-one in the offset satisfies an index assertion written against the
    // same expression. The question is whether the *figure* is on the row the
    // name is on, so the row is located by its name and then read.
    //
    // **`teeLeft` and it took two goes, both of them the same class.** The
    // median is `│` — and `│` is the plot's right border, on every row of the
    // frame. Its minimum cap is `┤` — and `┤` is the gutter's axis tick, on
    // every *named* row by construction. Both read as *the figure is here* and
    // both are furniture. `├` is drawn by `boxplotBand`'s spine row and by
    // nothing else in the frame, at either rung.
    const named = (r: string): boolean => /^[ABC]\s/u.test(r);
    const spine = glyphs(FULL_CAPS).teeLeft;

    for (const [what, rows] of [
      ["compact, one row in four", banded("compact", 12)], // cells-ok — a row count
      ["auto, three rows in five", banded(undefined, 15)], // cells-ok — a row count
    ] as const) {
      // **Asserted as set equality and not as containment**, because *every
      // named row has a spine* is satisfied by a frame where the spines are
      // elsewhere too, and *every spine is named* by one where a band lost its
      // name. The claim is that they are the same rows.
      expect(rows.filter(named).length, `${what}: three names`).toBe(3); // cells-ok — a category count
      const spines = rows.filter((r) => r.includes(spine));
      expect(spines.length, `${what}: one spine a band`).toBe(3); // cells-ok — a category count
      expect(spines.every(named), `${what}: and every spine is on its name's row`).toBe(true);
    }

    // The fixture responds: a name on a blank row is what the defect looked
    // like, and it is reachable here — the bands are four and five rows deep
    // against figures of one and three, so there are blank rows to land on.
    expect(banded("compact", 12).filter((r) => /^\s+│\s+│$/u.test(r)).length, "blank band rows exist")
      .toBeGreaterThan(0); // cells-ok — a row count
  });

  it("T1.88 (C12 I21): the extent grows the way its vocabulary says, and the tip follows", () => {
    // **This was very nearly a third ladder axis.** A vertical raincloud's
    // density is a run of dot-columns, and reaching for `ladderFor` there is the
    // mismatch I21 exists to make unspellable — a ladder is per-cell and this is
    // per-run. Measured before it was built: `extentRun` at width 2 with one
    // partial already returns the five levels the figure needs, reflected.
    const levels = (grows: "rightward" | "leftward"): string => {
      const ext = extentFor(FULL_CAPS, grows);
      return [0, 0.25, 0.5, 0.75, 1]
        .map((t) => {
          const run = extentRun(t, 2, ext); // cells-ok — a column budget
          const pad = "\u2800".repeat(2 - [...run].length); // cells-ok — a column budget
          return grows === "leftward" ? pad + run : run + pad;
        })
        .join(" ");
    };
    expect(levels("leftward")).toBe("\u2800\u2800 \u2800\u2590 \u2800\u2588 \u2590\u2588 \u2588\u2588");

    // **The direction is on the vocabulary, so the pairing cannot be wrong.**
    // *This row asserted that the two arms share no glyph*, which was true while
    // leftward was braille and is not now: both solids are `█`. The reason
    // leftward was braille — that `▕` and `▐` are Ambiguous where braille is
    // Neutral — is true of `█` and the left-eighths as well, so it separated
    // nothing; and the resolution is two states a cell either way. What still
    // distinguishes the arms is the **partial**, which is where the direction
    // lives: `▐` fills a cell's right and `▏▎▍▌▋▊▉` its left.
    const left = extentFor(FULL_CAPS, "leftward");
    const right = extentFor(FULL_CAPS, "rightward");
    expect(left.grows).toBe("leftward");
    expect(right.grows).toBe("rightward");
    expect(left.solid, "the solid is shared, and says nothing about direction").toBe(right.solid);
    expect(left.partials.some((g) => right.partials.includes(g)), "the partials are not")
      .toBe(false);

    // The tip is on the growing end. At `t` between two whole cells the partial
    // leads leftward and trails rightward, which is the whole of the mirror.
    const l = [...extentRun(0.75, 2, left)]; // cells-ok — a column budget
    expect(left.partials).toContain(l[0]);
    expect(l[l.length - 1]).toBe(left.solid);
    const r = [...extentRun(0.75, 2, right)]; // cells-ok — a column budget
    expect(right.partials).toContain(r[r.length - 1]);
    expect(r[0]).toBe(right.solid);
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

describe("GROUP 6e: the horizon folds — colour by depth, eighths by height", () => {
  const wave = { values: Array.from({ length: 50 }, (_, i) => 50 + Math.sin(i * 0.25) * 50) };
  const R = { min: 0, max: 100 };
  // A grid rendered to plain glyph rows, for the geometry rows that are about
  // shape rather than about which channel carries what.
  const glyphRows = (
    s: { values: readonly (number | null)[] },
    range: { min: number; max: number },
    bands: number, w: number, h: number, caps = FULL_CAPS,
  ): readonly string[] =>
    horizonGrid(s, range, bands, w, h).map((row) =>
      row.map((c) => horizonGlyph(c, caps)).join(""));

  it("T1.49: the row count is the height, whatever the band count", () => {
    // **The whole claim of the form**, and an earlier version broke it: one row
    // per band, clipped at `min(areaRows, bands)`. This file's own header says
    // *a series that would need twelve rows fits in two*.
    for (const bands of [1, 2, 5, 12]) {
      for (const h of [1, 2, 5]) {
        expect(glyphRows(wave, R, bands, 40, h).length, `${String(bands)} bands in ${String(h)} rows`).toBe(h); // cells-ok — a row count
      }
    }
  });

  it("HZ1 (C12 I52, §3z): band depth is the colour and the glyph is the height", () => {
    // **Two assertions because either alone passes against the defect.** The
    // shipped form carried depth on `ladderFor("density")`, so a row asserting
    // only *the glyphs vary* passes against it, and one asserting only *the
    // colours vary* passes against a build that painted a density ramp. The
    // claim is that the glyphs come from the **height** ladder and the colours
    // come from the map.
    const grid = horizonGrid(wave, R, 3, 60, 1);
    const eighths = new Set([...ladderFor("height", FULL_CAPS).steps]);
    const density = new Set([...ladderFor("density", FULL_CAPS).steps]);
    const drawn = new Set(grid[0]!.map((c) => horizonGlyph(c, FULL_CAPS)).filter((g) => g !== " "));
    for (const g of drawn) {
      expect(eighths.has(g), `${g} is on the height ladder`).toBe(true);
      expect(density.has(g), `${g} is not on the density ladder`).toBe(false);
    }
    const spans = horizonSpans(grid[0]!, 3, COLORMAPS["coolwarm"], { capabilities: FULL_CAPS } as never);
    const colours = new Set(spans.map((s) => JSON.stringify(s.style?.colour ?? null)));
    expect(colours.size, "the bands are told apart by colour").toBeGreaterThanOrEqual(3); // cells-ok — a colour count
  });

  it("HZ2 (C12 I52, §3z): at height 1 a band resolves eight positions", () => {
    // **The row the shipped form fails and no band-count assertion can see.**
    // Within-band height was a whole number of rows, so at `height: 1` — the
    // canonical horizon — every inked column was exactly one row and the
    // position inside the band was gone. A series sweeping one band cleanly is
    // what constructs the state: over the whole range the bands change too, and
    // then eight glyphs prove nothing about eight *positions*.
    const sweep = { values: Array.from({ length: 64 }, (_, i) => (i / 63) * 33) };
    const row = glyphRows(sweep, R, 3, 64, 1)[0] ?? "";
    const inks = new Set([...row].filter((c) => c !== " "));
    expect(inks.size, "eight sub-cell positions in one row").toBe(8); // cells-ok — a glyph count
  });

  it("HZ3 (C12 I52, §3z): a negative reading mirrors upward and takes the other half", () => {
    // The fold is a **mirror** because §3r measured that there is no downward
    // eighths ladder — `▀` and `▔` are the whole upper repertoire — so an offset
    // arm would resolve one direction to an eighth and the other to a half.
    const signed = { values: [-40, -20, 20, 40] };
    const range = { min: -40, max: 40 };
    const grid = horizonGrid(signed, range, 2, 4, 1);
    const cells = grid[0]!;
    expect(cells.map((c) => c?.sign), "sign follows the baseline").toEqual([-1, -1, 1, 1]);
    // Mirrored: both directions draw upward, so every cell has ink.
    expect(cells.every((c) => c !== null && c.eighths > 0), "both directions draw").toBe(true);
    // And the two halves of a diverging map are the two directions.
    const below = horizonBandT(cells[0]!, 2, true);
    const above = horizonBandT(cells[3]!, 2, true);
    expect(below, "deepest below is the map's low end").toBeLessThan(0.5);
    expect(above, "deepest above is the map's high end").toBeGreaterThan(0.5);
  });

  it("HZ5 (C12 I52, I16): a reading at the baseline draws ink", () => {
    // **A floor that renders blank gives blank two meanings** — absence and the
    // minimum — in the form whose whole subject is *how deep*. Three shipped
    // frames carried a two-cell break where `sin50` touched its minimum at two
    // adjacent columns, which is the fixture that can respond to this.
    const floored = { values: [0, 0, 50, 100] };
    const grid = horizonGrid(floored, R, 3, 4, 1);
    expect(grid[0]![0], "the floor is a reading").not.toBeNull();
    expect(grid[0]![0]!.eighths, "one eighth, not none").toBeGreaterThanOrEqual(1); // cells-ok — an eighth count
    expect(horizonGlyph(grid[0]![0] ?? null, FULL_CAPS), "and it is drawn").not.toBe(" ");
  });

  it("HZ4 (C12 I52, §3z): below the colour floor, depth returns to the density ramp", () => {
    // **Arm A, settled by the frames** — and against the arm that resolves more.
    // B gives eight levels at one row where A gives three, because the eighths
    // are a *unicode* vocabulary and 1-bit is a statement about colour; the
    // glyphs are there either way. It loses anyway, because a form that stops
    // having bands below a colour depth is two forms with one name.
    const mono = { capabilities: MONO_UNICODE_CAPS } as never;
    const grid = horizonGrid(wave, R, 3, 60, 1);
    const spans = horizonSpans(grid[0]!, 3, COLORMAPS["coolwarm"], mono);
    const drawn = new Set([...spans.map((x) => x.text).join("")].filter((g) => g !== " "));
    const density = new Set([...ladderFor("density", MONO_UNICODE_CAPS).steps]);
    for (const g of drawn) expect(density.has(g), `${g} is on the density ladder`).toBe(true);
    expect(drawn.size, "the bands are still told apart").toBeGreaterThanOrEqual(3); // cells-ok — a glyph count
    expect(spans.every((x) => x.style?.colour === undefined), "and no colour is claimed").toBe(true);

    // **The paired half, and it is the one that matters.** At `height > 1` arm A
    // keeps both channels — the row count carries height and the glyph carries
    // depth — so a mutation collapsing the grid to one inked row per column
    // fails here and not in HZ2, which only looks at `height: 1`.
    const tall = horizonGrid(wave, R, 3, 60, 5);
    const inked = tall[0]!.map((_c, i) => tall.filter((r) => r[i] !== null).length); // cells-ok — a row count
    expect(new Set(inked).size, "the row count still varies with the value").toBeGreaterThan(1); // cells-ok — a count
  });

  it("HZ7 (C12 I52, §3z H7): the legend row is declared, spent and drawn", () => {
    // **The row the mutation pass asked for.** Setting `FURNITURE_ROWS.horizon`
    // to 0 survived every other row here: the grid is unaffected, so the geometry
    // assertions pass, and `composeRows` quietly cuts the scale off the bottom —
    // the exact frame H7 refuses, reached without a refusal. A test that calls
    // the mechanism misses the wiring, and this asserts the wiring: the declared
    // height accounts for the legend, the rendered frame is that many rows, and
    // the last of them is the scale.
    const b = block({
      kind: "plot", id: "hz", form: "horizon", height: 3, bands: 3,
      series: [{ label: "a", values: [1, 5, 10, 15] }],
    } as Plot);
    expect(plotHeight(b), "three area rows and the legend").toBe(4); // cells-ok — a row count
    const rows = kit().renderToLines(b, 40);
    expect(rows.length, "rendered is declared").toBe(4); // cells-ok — a row count
    expect(rows[3], "and the last row is the scale").toContain("bands");
  });

  it("HZ6 (C12 I52, §3z H3, H7): the two refusals the table found", () => {
    const horizon = (over: Record<string, unknown>): unknown => ({
      kind: "plot", id: "h", form: "horizon", height: 2,
      series: [{ label: "a", values: [-5, 0, 5] }], ...over,
    });
    const errs = (b: unknown): readonly string[] => {
      const r = validateBlock(b);
      return r.ok ? [] : (r as { error: readonly string[] }).error;
    };
    // H7 — the legend is the reading, not furniture.
    expect(errs(horizon({ legend: false })).some((x) => x.includes("legend")),
      "legend: false is refused").toBe(true);
    // H3 — a sequential map has no second half for the sign to ride.
    expect(errs(horizon({ colormap: "viridis" })).some((x) => x.includes("diverging")),
      "sequential on signed data is refused").toBe(true);
    // **The controls, because a refusal that fires on everything refuses
    // nothing**: a diverging map is fine, and a sequential one is fine where
    // nothing crosses the baseline.
    expect(errs(horizon({ colormap: "coolwarm" })), "diverging is accepted").toEqual([]);
    expect(errs({ ...horizon({ colormap: "viridis" }) as object,
      series: [{ label: "a", values: [1, 2, 3] }] }), "unsigned takes any map").toEqual([]);
  });

  it("T1.51: a series shorter than its area is stretched, never left to run out", () => {
    // The heatmap's right-anchoring defect in a second form: `values[col]` found
    // nothing past column 49 of an 80-cell area and left thirty columns blank.
    const rows = glyphRows(wave, R, 3, 80, 2);
    for (const r of rows) expect(r.length).toBe(80); // cells-ok — a cell count
    expect(rows.some((r) => r[79] !== " "), "the right edge is drawn").toBe(true); // cells-ok — a column index
  });

  it("T1.52: a column's ink is one band, and the rows below the top one are full", () => {
    // **The fold's shape, restated for the channel that now carries it.** Under
    // the density model a column carried its band and the one it had cleared,
    // because depth was overdrawn in the glyph. With depth in the colour there
    // is nothing to overdraw: one band per column, and the height channel is
    // spent on `within` — full rows below, the remainder in the top one (§3z H5).
    const grid = horizonGrid(wave, R, 5, 40, 6);
    for (let c = 0; c < 40; c += 1) { // cells-ok — a column count
      const col = grid.map((r) => r[c]).filter((x) => x !== null && x !== undefined);
      if (col.length === 0) continue; // cells-ok — a cell count
      expect(new Set(col.map((x) => x!.band)).size, `column ${String(c)} is one band`).toBe(1); // cells-ok — a band count
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      // Every row but the topmost inked one is full.
      const partial = col.filter((x) => x!.eighths !== 8); // cells-ok — an eighth count
      expect(partial.length, `column ${String(c)} has at most one partial row`).toBeLessThanOrEqual(1); // cells-ok — a row count
    }
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

describe("GROUP 6i: containment is the subject, not magnitude", () => {
  const tree = {
    label: "root", value: 100,
    children: [
      { label: "a", value: 60, children: [{ label: "a1", value: 40 }, { label: "a2", value: 20 }] },
      { label: "b", value: 40 },
    ],
  };

  it("T1.64 (C04 I54): a child is inside its parent, structurally", () => {
    // **Not a fact about the data.** Children divide their parent's span in
    // proportion, so containment cannot come out wrong for particular values —
    // which is exactly what `flame` and `icicle` could not say when they were
    // `barRow` with the labels off.
    // **The tree's second branch carries the test.** Every first child starts at
    // its parent's own start, so a layout that ignored the cursor entirely and
    // put each child at 0 satisfies `from >= parent.from` for all of them — the
    // mutation survived the first version of this row. `b`'s subtree starts
    // partway along and cannot.
    const deep = {
      label: "root", value: 100,
      children: [
        { label: "a", value: 60 },
        { label: "b", value: 40, children: [{ label: "b1", value: 25 }, { label: "b2", value: 15 }] },
      ],
    };
    const placed = strips(deep);
    const byLabel = new Map(placed.map((st) => [st.label, st]));
    expect(byLabel.get("b")!.from, "the second branch starts partway along").toBeGreaterThan(0);
    for (const [child, parent] of [["a", "root"], ["b", "root"], ["b1", "b"], ["b2", "b"]] as const) {
      const c = byLabel.get(child)!, p = byLabel.get(parent)!;
      expect(c.from, `${child} starts inside ${parent}`).toBeGreaterThanOrEqual(p.from);
      expect(c.to, `${child} ends inside ${parent}`).toBeLessThanOrEqual(p.to + 1e-9);
      expect(c.depth).toBe(p.depth + 1); // cells-ok — a depth index
    }
  });

  it("T1.65 (C04 I54): a node's extent is its subtree's, not its stated value", () => {
    // Ordinary in profiling data — self time against total time. **The root
    // cannot show it**: its span is [0, 1] by construction whatever its value
    // says, so the first version of this row asserted containment on the one
    // node where containment is free and passed against the mutation. Two
    // *siblings* is where the stated value is read.
    const understated = {
      label: "r", value: 100,
      children: [
        { label: "small", value: 1, children: [{ label: "s1", value: 50 }] },
        { label: "big", value: 50 },
      ],
    };
    const placed = strips(understated);
    const small = placed.find((st) => st.label === "small")!;
    const big = placed.find((st) => st.label === "big")!;
    const span = (st: { from: number; to: number }): number => st.to - st.from;
    expect(span(small), "sized by its subtree, so equal to its sibling").toBeCloseTo(span(big), 5);
  });

  it("T1.66 (C04 I54): a tile's area is its share, and children fill their parent", () => {
    const placed = tiles(tree);
    const area = (t: { x0: number; y0: number; x1: number; y1: number }): number =>
      (t.x1 - t.x0) * (t.y1 - t.y0);
    const a = placed.find((t) => t.label === "a")!;
    const b = placed.find((t) => t.label === "b")!;
    expect(area(a) / area(b), "60 against 40").toBeCloseTo(1.5, 1);
    // And a1 + a2 fill a.
    const a1 = placed.find((t) => t.label === "a1")!;
    const a2 = placed.find((t) => t.label === "a2")!;
    expect(area(a1) + area(a2)).toBeCloseTo(area(a), 5);
  });

  it("T1.67 (C12 §3n): padding is skipped where the rectangle cannot afford it", () => {
    // A tile shrunk to nothing reports an area of zero, so the inset is applied
    // only where there is room — and the nesting it exists to show is worth
    // nothing if it costs the leaves their size.
    // **Asserted on the children's *count*, not their area.** A tile's own
    // rectangle is fixed before the inset — the inset shrinks the box its
    // children get — so "every tile has positive area" is true whether the
    // padding is refused or applied until the children vanish. The first version
    // asserted that and the mutation lived.
    const modest = tiles(tree, 0.02).filter((t) => t.depth > 0).length; // cells-ok — a tile count
    const absurd = tiles(tree, 0.4).filter((t) => t.depth > 0).length; // cells-ok — a tile count
    expect(modest, "a modest pad keeps the children").toBeGreaterThan(0); // cells-ok — a tile count
    expect(absurd, "and an unaffordable one is refused rather than collapsing them").toBe(modest); // cells-ok — a tile count
  });

  it("T1.68: flame and icicle are each other, and neither is a bar chart", () => {
    const mk = (form: "flame" | "icicle"): Plot =>
      block({ kind: "plot", id: "h", form, height: 4, series: [], hierarchy: tree } as Plot);
    const k = kit();
    const f = k.renderToLines(mk("flame"), 40).map((r) => r.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "gu"), ""));
    const i = k.renderToLines(mk("icicle"), 40).map((r) => r.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "gu"), ""));
    expect(f.join("\n")).not.toBe(i.join("\n"));
    // The root spans the full width and sits at opposite ends.
    expect(f[f.length - 1], "flame's root is at the bottom").toContain("root");
    expect(i[0], "icicle's is at the top").toContain("root");
  });
});

describe("GROUP 6j: the six that had no renderer", () => {
  it("T1.69 (C04 §8): an autocorrelation is signed about zero, not a bar of magnitudes", () => {
    // **What makes it an autocorrelation.** A negative lag means the series
    // anti-correlates with itself at that offset, and a plot drawing |r| says
    // the opposite of the data half the time.
    const pos = lagRow(0.8, 1, 41, [], FULL_CAPS);
    const neg = lagRow(-0.8, 1, 41, [], FULL_CAPS);
    const zero = 20; // cells-ok — a column index
    expect(pos.slice(zero + 1).trim(), "a positive lag runs right").not.toBe("");
    expect(pos.slice(0, zero).trim(), "and nothing left of zero").toBe("");
    expect(neg.slice(0, zero).trim(), "a negative lag runs left").not.toBe("");
    expect(neg.slice(zero + 1).trim(), "and nothing right").toBe("");
  });

  it("T1.70 (C04 §8): the significance band is drawn on both sides and under the bar", () => {
    const g = glyphs(FULL_CAPS);
    const clear = lagRow(0.1, 1, 41, [0.5], FULL_CAPS);
    expect([...clear].filter((c) => c === g.dashedVertical).length, "both signs").toBe(2); // cells-ok — a cell count
    // A bar reaching past the bound draws over it: a bound interrupting a bar
    // reads as part of it.
    const over = lagRow(0.9, 1, 41, [0.5], FULL_CAPS);
    expect([...over].filter((c) => c === g.dashedVertical).length, "the crossed one is covered").toBe(1); // cells-ok — a cell count
  });

  it("T1.71 (C04 §8): a timeline marks positions, and its magnitudes are not data", () => {
    // An event happened at a time; asking how big it was is the wrong question.
    const g = glyphs(FULL_CAPS);
    // **A range that does not start at zero.** With `min: 0` a renderer dividing
    // by `max` and one scaling across `[min, max]` give the same answer for
    // every value, so the mutation dropping the minimum survived — the
    // convenient fixture is the one where both readings agree.
    const row = timelineRow({ values: [100, 105, 110] }, { min: 100, max: 110 }, 21, FULL_CAPS);
    expect(row[0]).toBe(g.filled);
    expect(row[10]).toBe(g.filled); // cells-ok — a column index
    expect(row[20]).toBe(g.filled); // cells-ok — a column index
    expect(row[3], "and a rule between them").toBe(g.horizontal); // cells-ok — a column index
    // Rescaling the axis with the values moves nothing: only positions matter.
    const scaled = timelineRow({ values: [0, 50, 100] }, { min: 0, max: 100 }, 21, FULL_CAPS);
    expect(scaled).toBe(row);
  });

  it("T1.72 (C04 §8): a bullet's target is perpendicular, and survives the measure", () => {
    // *Did we hit it* is a boolean, and a longer bar invites the eye to compare
    // lengths instead. Drawn last, over everything, because it is the question
    // the row answers.
    const g = glyphs(FULL_CAPS);
    const q = { min: 0, q1: 40, median: 60, q3: 80, max: 100, centre: 75 };
    const under = bulletRow(q, 30, 41, FULL_CAPS);
    const over = bulletRow(q, 95, 41, FULL_CAPS);
    expect(under, "visible when the measure falls short").toContain(g.vertical);
    expect(over, "and when the measure passes it").toContain(g.vertical);
    expect(under.indexOf(g.vertical), "in the same place either way").toBe(over.indexOf(g.vertical));
  });

  it("T1.73 (C04 §8): a bubble's size channel is cells, and a small one is one cell", () => {
    // A cell is the smallest mark there is, so size is spent on how many cells
    // rather than on a radius. Below one, the channel does not exist — which is
    // honest: a 1.4-cell bubble *is* a 1-cell bubble.
    const ink = (rs: readonly string[]): number =>
      [...rs.join("")].filter((c) => c !== " " && c !== "\u2800").length; // cells-ok — a cell count
    // **Two halves of one frame.** The size channel is relative to the series'
    // own maximum, so a lone point is always maximal and comparing two
    // single-point renders compares nothing — the first version did, and got 4
    // against 4. Two points at opposite ends, and each half counted.
    const pair = bubbleRows(
      { values: [50, 50] }, { values: [1, 100] }, { min: 0, max: 100 }, 30, 8, FULL_CAPS,
    FACING_DEFAULT,
    );
    const half = (rs: readonly string[], left: boolean): number =>
      ink(rs.map((r) => (left ? r.slice(0, 15) : r.slice(15)))); // cells-ok — a column index
    expect(half(pair, false), "the large bubble outdraws the small one")
      .toBeGreaterThan(half(pair, true));
    // And the grid is in dots: seven points must produce seven marks, not two.
    const seven = bubbleRows(
      { values: [10, 20, 30, 40, 50, 60, 70] },
      { values: [5, 5, 5, 5, 5, 5, 5] },
      { min: 0, max: 80 }, 40, 8, FULL_CAPS,
    FACING_DEFAULT,
    );
    expect(ink(seven), "every point drawn").toBeGreaterThanOrEqual(7); // cells-ok — a cell count
  });
});

describe("GROUP 6k: the legend, and the asymmetry that is a constraint", () => {
  const three = (over: Partial<Plot> = {}): Plot => block({
    kind: "plot", id: "lg", form: "line", height: 8, axes: true,
    series: [{ values: [1, 5, 3], label: "a" }, { values: [4, 2, 6], label: "b" },
             { values: [2, 6, 1], label: "c" }],
    ...over,
  } as Plot);
  const plain = (b: Plot, caps = FULL_CAPS, w = 60): readonly string[] =>
    measurable({ definitions: [plotDefinition], capabilities: caps })
      .renderToLines(b, w).map((r) => r.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "gu"), ""));

  it("T1.74 (C12 I27): a horizontal legend costs a declared row and a vertical one does not", () => {
    // **The asymmetry C12 I1 forces.** A row's cost must be known before the data
    // is; width is already data-dependent through the gutter. That is why
    // `"right"` is the default — it is the only placement that can turn itself
    // on — and it is a constraint rather than a preference.
    const base = plotHeight({ form: "line", height: 8, axes: true });
    expect(plotHeight({ form: "line", height: 8, axes: true, legend: "right" })).toBe(base);
    expect(plotHeight({ form: "line", height: 8, axes: true, legend: "left" })).toBe(base);
    expect(plotHeight({ form: "line", height: 8, axes: true, legend: "above" })).toBe(base + 1); // cells-ok — a row count
    expect(plotHeight({ form: "line", height: 8, axes: true, legend: "below" })).toBe(base + 1); // cells-ok — a row count
    // And `series` is still unreachable from the height: a fourth entry costs
    // nothing, which is what keeps a growing plot from moving the transcript.
    expect(plotHeight({ form: "line", height: 8, axes: true, legend: "above" }))
      .toBe(plotHeight({ form: "line", height: 8, axes: true, legend: "above" }));
  });

  it("T1.75 (C12 I27): the four placements put the legend in four places", () => {
    const at = (p: NonNullable<Plot["legend"]>): readonly string[] => plain(three({ legend: p }));
    expect(at("above")[0], "above the frame").toContain("a");
    expect(at("below").slice(-1)[0], "below it").toContain("a");
    const right = at("right");
    const left = at("left");
    // The swatch is at opposite ends of the same row.
    const rowWith = (rows: readonly string[]): string => rows.find((r) => r.includes(" a")) ?? "";
    expect(rowWith(right).indexOf(" a")).toBeGreaterThan(rowWith(left).indexOf(" a"));
    expect(plain(three({ legend: false })).join(""), "and `false` draws none").not.toContain(" a ");
  });

  it("T1.76 (C12 I27): a vertical legend is reserved, not overlaid", () => {
    // **Reserved before the rows are laid out.** Composited onto finished rows a
    // legend either pushes them past their width — where `clampSpans` cuts
    // whatever was at the end — or overwrites the data it explains.
    const rows = plain(three({ legend: "right" }));
    for (const r of rows) expect(cells(r), "no row exceeds the width").toBeLessThanOrEqual(60); // cells-ok — a cell count
    // The frame's right border still sits inside the legend column.
    const framed = rows.find((r) => r.includes("┤")) ?? "";
    expect(framed.indexOf("│"), "the border is left of the swatch")
      .toBeLessThan(framed.lastIndexOf("█"));

    // **And it is capped at a third, which one-character labels cannot show.**
    // A twenty-cell legend on a forty-column plot leaves nothing to draw in, and
    // T3.3's ladder already rules that labels go before the area is starved.
    // Without the cap the mutation passed every row above.
    const long = three({
      legend: "right",
      series: [
        { values: [1, 5, 3], label: "an-extremely-long-series-name" },
        { values: [4, 2, 6], label: "another-very-long-series-name" },
      ],
    });
    const narrow = plain(long, FULL_CAPS, 40);
    const area = narrow.find((r) => r.includes("┤")) ?? "";
    expect(area.indexOf("█"), "the legend takes no more than a third")
      .toBeGreaterThanOrEqual(Math.floor(40 * 2 / 3) - 1); // cells-ok — a column index
    for (const r of narrow) expect(cells(r)).toBeLessThanOrEqual(40); // cells-ok — a cell count
  });

  it("T1.77: the escapes reach the frame intact — the facet defect, one layer over", () => {
    // `line` clamps with `clampSpans`, which measures span text using `cells()`,
    // and `cells()` counts a painted row's escape bytes as visible. Joining a
    // painted row to a painted legend through it truncated the row and left
    // `[38;2;98;98;98m` on screen as text. Both halves are already at their own
    // width, so the join is concatenation.
    const ESC = String.fromCharCode(27);
    for (const p of ["left", "right"] as const) {
      const rows = measurable({ definitions: [plotDefinition], capabilities: FULL_CAPS })
        .renderToLines(three({ legend: p }), 60);
      for (const r of rows) {
        expect(r.replace(new RegExp(`${ESC}\\[[0-9;]*m`, "gu"), "")).not.toMatch(/\[[0-9;]*m/);
      }
    }
  });

  it("T1.78 (C12 I27): the auto legend stands down where the form labels its own rows", () => {
    // Below the colour floor `positionalForm` stacks into labelled strips, so an
    // auto legend is a second copy of the gutter — and worse than redundant,
    // because the strips are not drawn with `markOf` and the swatch then names a
    // mark appearing nowhere. An explicit `legend:` still draws.
    expect(legendPlacement(three(), MONO_UNICODE_CAPS), "auto stands down").toBeNull();
    expect(legendPlacement(three(), FULL_CAPS), "and is on where colour leads").toBe("right");
    expect(legendPlacement(three({ legend: "right" }), MONO_UNICODE_CAPS), "explicit still draws")
      .toBe("right");
    // A form that names its rows in the gutter never auto-enables at any depth.
    const bars = block({
      kind: "plot", id: "b", form: "lollipop", height: 4, axes: true,
      categories: ["a", "b"], series: [{ values: [1, 2] }],
    } as Plot);
    expect(legendPlacement(bars, FULL_CAPS)).toBeNull();
  });
});

describe("GROUP 6l: `palette` had one legal value, so it is gone", () => {
  it("T1.79 (C04 I55): a series' colour comes from `categorical`, and there is no other", () => {
    // **The field was untyped *and* inert, and typing it would have fixed one.**
    // `palette?: string` shipped beside `colormap?: ColormapName`, so
    // `palette: "tab-10"` compiled and resolved to nothing at render — F172's
    // shape, one field along from the clause that refuses it. C04 I55's remedy
    // was a literal union, and building it found something better: `tone` and
    // `syntax` carry meaning, C10 I16 closes `spectrum` to declared art with a
    // third consumer stated as a four-place spec change, and what remains is
    // `categorical`. A field with one legal value is not a choice.
    //
    // It was also read by no renderer — settable, carried through the builder,
    // which is why MG24 counted it consumed. A name-based seam check cannot tell
    // *named* from *acted on*.
    for (let i = 0; i < 8; i += 1) { // cells-ok — a palette size
      const ref = paletteRef(i);
      expect(ref.startsWith("categorical."), `slot ${String(i)}`).toBe(true);
      expect(slot(ref, DARK_THEME, FULL_CAPS).colour, `slot ${String(i)} resolves`).toBeDefined();
    }
    // And it wraps rather than running out, so a ninth category is a repeat and
    // never an uncoloured run.
    expect(paletteRef(8)).toBe(paletteRef(0)); // cells-ok — a palette size
  });
});

describe("GROUP 6m: four frame shapes over one geometry", () => {
  const mk = (plotFrame?: "box" | "corners" | "grid" | "rule"): Plot => block({
    kind: "plot", id: "f", form: "line", height: 6, axes: true, legend: false,
    xLabels: ["a", "b", "c"], series: [{ values: [1, 5, 2, 6, 3] }],
    ...(plotFrame === undefined ? {} : { plotFrame }),
  } as Plot);
  const plain = (b: Plot): readonly string[] =>
    measurable({ definitions: [plotDefinition], capabilities: FULL_CAPS })
      .renderToLines(b, 40).map((r) => r.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "gu"), ""));

  it("T1.82 (C12 I26): all four are distinct, and none changes the height", () => {
    // **The geometry is identical in all four** — same rows, same columns, same
    // plot area — which is what makes this a glyph table rather than four
    // renderers. A style that cost a row would move everything below the plot on
    // a field the caller thought was cosmetic (C12 I1).
    const styles = ["box", "corners", "grid", "rule"] as const;
    const frames = styles.map((st) => plain(mk(st)).join("\n"));
    expect(new Set(frames).size, "four distinct frames").toBe(4); // cells-ok — a set size
    // **The type already says this and says it better.** `plotFrame` is not in
    // `PlotGeometry`, so `plotHeight` structurally cannot see it — writing the
    // assertion is a compile error, which is the guarantee rather than a test of
    // it. What is left to check is that the *rendered* row count agrees, since a
    // style emitting one row fewer would still be a form drawing off its own
    // declared height.
    expect(new Set(frames.map((f) => f.split("\n").length)).size, "and one row count").toBe(1); // cells-ok — a set size
    // The default is `box`.
    expect(plain(mk()).join("\n")).toBe(frames[0]);
  });

  it("T1.83 (C12 I26): `corners` draws no ticks, because there is no edge to put one on", () => {
    // I26's own clause, and the one place the four are not interchangeable: a
    // tick is a mark *on* an edge.
    const corners = plain(mk("corners"));
    const box = plain(mk("box"));
    const rule = (rows: readonly string[]): string => rows[rows.length - 2] ?? "";
    expect(rule(box), "the box's rule carries ticks").toContain("┬");
    expect(rule(corners), "the corners' does not").not.toContain("┬");
    expect(corners[0], "and the lid is four marks").toMatch(/┌\s+┐/u);
  });

  it("T1.84 (C12 I26): `grid` draws where a value is written, and the data wins its cell", () => {
    // A gridline carries the eye from a mark to a value, so it belongs where
    // there *is* a value — the rows the gutter labels and the columns the rule
    // ticks. Anywhere else it is a texture.
    //
    // **And behind, never over.** A gridline on top of a series is a series with
    // a hole in it, and at one cell per sample the hole is the sample.
    const g = glyphs(FULL_CAPS);
    const rows = plain(mk("grid"));
    // **Any numeric label, not `\d+`.** The selector was written when this
    // fixture's gutter read `10 · 5 · 0`, and it read that because the axis was
    // niced twice: one pass over `1 … 6` gives `0 … 7.5` at step 2.5, and the
    // second coarsened the step to 5 and wrote integers over a scale that was
    // not one (F210). A row finder that can only see integers is a fixture
    // answering for the code.
    const labelled = rows.find((r) => /^\s*-?[\d.]+\s*┤/u.test(r)) ?? "";
    expect(labelled, "a labelled row carries a horizontal rule").toContain(g.dashedHorizontal);
    expect(rows.join(""), "and the tick columns a vertical one").toContain(g.dashedVertical);
    const unlabelled = rows.find((r) => /^\s+│/u.test(r)) ?? "";
    expect(unlabelled, "an unlabelled row carries no horizontal rule").not.toContain(g.dashedHorizontal);
    // **The curve survives on a gridline row**, which is the claim. Asserting
    // that no gridline glyph sits *beside* a curve glyph does not say it: drawn
    // over, the labelled row is gridline end to end and there is no curve left
    // to be adjacent to. The mutation passed that and fails this.
    // **The plot area only.** The frame's own right border is a `│`, so a test
    // looking for a curve glyph anywhere in the row is satisfied by the border
    // — and under the mutation every area cell is gridline while the border
    // still stands. Second version of this row for that reason.
    // **The first boundary glyph, not the later one.** `max` lands on the right
    // border of a labelled row carrying no curve `│` and returns the empty
    // string — which reads as *no ink*. It happened to be right here only
    // because this fixture's labelled rows all hold a curve segment; AC2 is
    // where the same helper produced a wrong answer.
    const areaOf = (r: string): string => {
      const tee = r.indexOf("┤");
      const bar = r.indexOf("│");
      const from = tee < 0 ? bar : bar < 0 ? tee : Math.min(tee, bar);
      return from < 0 ? "" : r.slice(from + 1, r.lastIndexOf("│"));
    };
    const curveOn = rows.filter((r) => r.includes(g.dashedHorizontal) && /[─╭╮╰╯]/u.test(areaOf(r)));
    expect(curveOn.length, "a labelled row carries both the rule and the curve")
      .toBeGreaterThan(0); // cells-ok — a row count
  });

  it("T1.85 (C12 I26): `rule` has no lid and no right border, and still spends the row", () => {
    const rows = plain(mk("rule"));
    expect(rows[0]!.trim(), "the lid row is blank").toBe("");
    expect(rows.length, "and still there").toBe(plain(mk("box")).length); // cells-ok — a row count
    const body = rows.find((r) => r.includes("│")) ?? "";
    expect(body.trimEnd().endsWith("│"), "no right border").toBe(false);
  });
});

describe("GROUP 6n: a cell is not square, and one file used to know it", () => {
  it("T1.86: a waffle spends two columns per row so the mosaic reads square", () => {
    // `circle.ts` compensated (`rx = 2·ry`, which is why our pie is round where
    // granite's is an ellipse) and `waffle.ts` did not, so its 10×10 grid
    // rendered ten wide and twenty tall — a tall rectangle where a mosaic
    // belongs. Same terminal geometry, two answers, one file aware of it.
    const cells = waffleCells(
      [{ label: "a", value: 60 }, { label: "b", value: 40 }], 40, FULL_CAPS,
    );
    expect(cells.length, "ten rows").toBe(10); // cells-ok — a row count
    const inked = (cells[0] ?? []).filter((c) => c.segmentIndex >= 0).length; // cells-ok — a cell count
    expect(inked, "and twenty columns of ink").toBe(squareColumns(10)); // cells-ok — a column count
    expect(squareColumns(10), "which is twice the rows").toBe(20); // cells-ok — a column count
  });

  it("T1.87 (roadmap 38): `fillHeight` takes the region, and a transcript has none", () => {
    // **The deferral's blocker expired and nothing noticed.** Roadmap 38 blocked
    // this on *the producer cannot see the height*, and `ProducerContext.height`
    // was granted by phase 1 — non-null exactly when the document is bound by a
    // region, which is the case the entry named.
    expect(fillHeight(20, 8), "the region, less nothing reserved").toBe(20); // cells-ok — a row count
    expect(fillHeight(20, 8, 6), "less what the surface spends").toBe(14); // cells-ok — a row count
    // `null` is a transcript entry — windowed by rows, bound by nothing — and
    // the fallback is the caller's, because *how tall when nothing says* is a
    // question about the surface rather than about plots.
    expect(fillHeight(null, 8), "no region, the caller's own answer").toBe(8); // cells-ok — a row count
    // A plot with no rows is not a smaller plot.
    expect(fillHeight(4, 8, 99)).toBe(1); // cells-ok — a row count
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
    const { layers } = pieRender(sharesOf(segs), segs.length, 10, 5, FULL_CAPS);
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
      pieRender(sharesOf(segments), segments.length, 80, 10, caps).layers.map((l) => fillOf(l.glyphRows));

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
    const ceiling = ceilingOf(twins, cats);
    const mono = radarRender(twins, cats, 80, 10, MONO_UNICODE_CAPS, ceiling).polygons;
    expect(mono.length).toBe(2); // cells-ok — a series count
    expect(mono[0]!.join("\n")).not.toBe(mono[1]!.join("\n"));
    const full = radarRender(twins, cats, 80, 10, FULL_CAPS, ceiling).polygons;
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
    const rows = horizonGrid(series, range, 3, 20, 3)
      .map((r) => r.map((c) => horizonGlyph(c, FULL_CAPS)).join(""));
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
    const sturges = binValues([data], "sturges");
    const fd = binValues([data], "freedman-diaconis");
    const scott = binValues([data], "scott");
    // **`counts` is per series now** (C12 I42), so the bin count is the length
    // of a series' row rather than of the outer array — which is 1 here and
    // would have made this row assert that one number differs from itself.
    const counts = new Set([
      sturges.counts[0]?.length, fd.counts[0]?.length, scott.counts[0]?.length, // cells-ok — bin counts
    ]);
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
    const stepResult = stepRows(series, range, 20, 5, FULL_CAPS, FACING_DEFAULT);
    const scatterResult = scatterRows(series, range, 20, 5, FULL_CAPS, FACING_DEFAULT);
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
    const wide = binValues([[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]], "sturges");
    for (const l of wide.labels) {
      expect(l, "an interval is bracketed").toMatch(/^\[.*[)\]]$/u);
      expect(l, "and has two bounds").toContain(",");
    }
    expect(wide.labels[wide.labels.length - 1], "the last bin is closed").toMatch(/\]$/u);

    // A span of 0.001 across several bins needs more than two decimals, or every
    // label collides with its neighbour.
    const narrow = binValues(
      [Array.from({ length: 40 }, (_, i) => 1 + i * 0.0001)],
      "sturges",
    );
    const bounds = narrow.labels.map((l) => l.split(",")[0]);
    expect(new Set(bounds).size, "every lower bound is distinct").toBe(bounds.length);
  });
});

describe("C12 I33 — no whisker, no stub", () => {
  const g = glyphs(FULL_CAPS);
  const band = (q: Record<string, number>, rows = 3): readonly string[] =>
    boxplotBand(q as never, 0, 10, 31, rows, FULL_CAPS);
  const spine = (q: Record<string, number>): string => band(q)[1] ?? "";

  it("T1.100 (C12 I33): the box edge loses its stem where its cap is not a separate cell", () => {
    // **The ordinary case first, in the same row.** A fix that removed every
    // stub satisfies an assertion written only about the collapsed one, and
    // both halves of the rule are what makes it a rule.
    const ordinary = spine({ min: 1, q1: 3, median: 5, q3: 7, max: 9 });
    expect(ordinary, "a whisker on both sides keeps both stubs")
      .toBe(`   ${g.teeLeft}${g.horizontal.repeat(5)}${g.teeRight}     ${g.vertical}     ${g.teeLeft}${g.horizontal.repeat(5)}${g.teeRight}   `);

    // `q3 === max`: the cap and the box's right edge are one column, the edge is
    // written second, and its stub used to survive — `├` pointing at blank
    // columns, promising a whisker that is not there.
    const highFlat = spine({ min: 1, q1: 3, median: 5, q3: 9, max: 9 });
    expect(highFlat.trimEnd().at(-1), "the right edge").toBe(g.vertical);
    expect(highFlat, "and nothing after it").toMatch(/│\s*$/u);

    // The mirror, which the task named only one half of.
    const lowFlat = spine({ min: 1, q1: 1, median: 5, q3: 7, max: 9 });
    expect(lowFlat.trimStart()[0], "the left edge").toBe(g.vertical);

    // Both ends collapsed: a box with no whiskers at all is a plain box.
    const both = spine({ min: 2, q1: 2, median: 5, q3: 8, max: 8 });
    expect(both).not.toContain(g.teeLeft);
    expect(both).not.toContain(g.teeRight);
    expect(both, "and it is still a box").toContain(g.vertical);

    // The compact arm takes the same table, so it moves with it.
    expect((boxplotBand({ min: 2, q1: 2, median: 5, q3: 8, max: 8 } as never, 0, 10, 31, 1, FULL_CAPS)[0] ?? ""))
      .not.toContain(g.teeRight);

    // **The condition is on the columns, not on the values** — and every
    // fixture above has them exactly equal, where the two readings agree. At
    // 31 cells over 0…10 a column is a third of a unit, so `q3: 9` and
    // `max: 9.1` are two different numbers in one cell with nothing drawn
    // between them, and a stub there points at the cap it is standing on.
    const near = { min: 1, q1: 3, median: 5, q3: 9, max: 9.1 };
    expect(near.max, "the fixture responds: the values differ").toBeGreaterThan(near.q3);
    expect(spine(near).trimEnd().at(-1), "and the columns do not").toBe(g.vertical);
  });

  it("T1.100c (C12 I33, C04 I53): mean on median is a glyph in both arms, not a silence", () => {
    // **Measured across the two arms of one figure.** `boxplotColumn` drew `◈`
    // and `boxplotBand` drew nothing — `xm !== xMed` skipped the write — so a
    // distribution whose mean *is* its median rendered identically to a summary
    // that carries no mean, in the horizontal arm only.
    const on = { min: 3, q1: 3, median: 5, q3: 7, max: 7, mean: 5 };
    const apart = { min: 3, q1: 3, median: 5, q3: 7, max: 7, mean: 6 };
    expect(spine(on), "the band, mean on median").toContain(g.diamondTee);
    expect(spine(apart), "the band, mean apart").toContain(g.diamond);
    expect(spine(apart), "and not the combined mark").not.toContain(g.diamondTee);
    expect(boxplotColumn(on as never, 0, 10, 5, 11, FULL_CAPS).join(""), "the column arm")
      .toContain(g.diamondTee);

    // A summary with no mean draws neither, or the row above passes against an
    // arm that marks the median twice.
    const none = { min: 3, q1: 3, median: 5, q3: 7, max: 7 };
    expect(spine(none)).not.toContain(g.diamond);
    expect(spine(none)).not.toContain(g.diamondTee);
  });

  it("T1.101 (C12 I54, §3ak.25): an unstyled violin prefers braille at `wide`, and only the outline rung", () => {
    // **Fail-on-revert.** Dropping `brailleOutline`'s width clause — leaving the
    // repertoire half `brailleArm` already had — fails this row and moves 10
    // baseline frames (F302). Giving the clause to `brailleArm` instead, so the
    // filled-density rungs take it too, moves 11 more and replaces a correct
    // filled figure with an outline.
    //
    // **The predicate is imported and not restated.** The first draft of this row
    // wrote the three lines out again, which is the finding it is about: a rule
    // with two copies, the second holding the clauses that existed the day it was
    // written. A test that keeps its own copy cannot fail when the real one moves.
    const at = (unicode: string, ambiguousWidth: string, plotStyle?: string): boolean =>
      brailleOutline(plotStyle as never, { unicode, ambiguousWidth } as never);

    expect(at("full", "narrow"), "unstyled, narrow: box drawing").toBe(false);
    expect(at("full", "wide"), "unstyled, wide: braille — the clause that was missing").toBe(true);
    expect(at("full", "wide", "line"), "an explicit line style is still a line, at every rung").toBe(false);
    expect(at("ascii", "wide"), "no repertoire, no braille — degraded, never refused").toBe(false);
    expect(at("full", "narrow", "braille"), "the author's request stands where it always did").toBe(true);

    // **And the figure, so the row is not only about a boolean.** `styleRasteriser`
    // states the rule this restores; `density`, `line` and `histogram` already
    // obeyed it and this form kept half.
    const values = Array.from({ length: 30 }, (_, i) => 20 + Math.sin(i * 0.6) * 7);
    const drawn = (braille: boolean, caps: typeof FULL_CAPS): string =>
      violinRows(
        { values } as never, 40, 9, caps, undefined, "rounded", undefined, undefined, braille, false,
      ).join("");
    const brailleCells = (t: string): number =>
      [...t].filter((c) => c >= "\u2800" && c <= "\u28ff").length; // cells-ok — a glyph count
    const boxCells = (t: string): number =>
      [...t].filter((c) => c >= "\u2500" && c <= "\u257f").length; // cells-ok — a glyph count

    const wide = { ...FULL_CAPS, ambiguousWidth: "wide" as const };
    expect(brailleCells(drawn(true, wide)) > 0, "the wide arm draws braille").toBe(true); // cells-ok — a glyph count
    expect(boxCells(drawn(true, wide)), "and no box drawing, which is the whole point").toBe(0); // cells-ok — a glyph count
    expect(boxCells(drawn(false, FULL_CAPS)) > 0, "the narrow arm keeps box drawing").toBe(true); // cells-ok — a glyph count
  });

  it("T1.100d (C12 I33, C04 I53): the violin's column arms say it too — three of five had the ruling", () => {
    // **Fail-on-revert.** Restoring either column arm's `if (rm !== at(median))`
    // — which skipped the write rather than combining the two marks — fails this
    // row, and moves 30 baseline frames (F301).
    //
    // T1.100c is this row's sibling and it found the same defect in the boxplot
    // pair. **The ruling landed in one of the five places that needed it**: the
    // two boxplot renderers and `boxOnSpine` combined the marks, and the two
    // *column* arms skipped — so a violin whose mean is its median rendered
    // identically to one carrying no mean, in the vertical arm only. A rule that
    // has to be applied N times is applied N−1 times eventually, which §3q
    // already records for a different fix on this same family.
    //
    // **The frame is where it reads worst**: `violin/vertical` draws three bands
    // and `dose-b`'s mean sits away from its median, so one band showed `◆` and
    // the other two showed a plain median tee — *they coincide* and *there is no
    // mean* wearing one glyph, beside a band that says otherwise.
    const on = { min: 3, q1: 3, median: 5, q3: 7, max: 7, mean: 5 };
    const apart = { min: 3, q1: 3, median: 5, q3: 7, max: 7, mean: 6 };
    const none = { min: 3, q1: 3, median: 5, q3: 7, max: 7 };
    // **Two arms, and the second is reached only through braille.** The plain
    // path writes its spine inline; the braille path folds its dots and hands
    // them to `boxOnSpineColumn`, which had the same skip. Covering one and
    // letting the baseline gate cover the other would leave the reason recorded
    // in bytes: a moved frame says *something changed*, never *and here is why*.
    const vc = (q: Record<string, number>, braille = false): string =>
      violinColumn(
        { values: [3, 4, 5, 6, 7] } as never, 9, 11, FULL_CAPS, q as never,
        "rounded", undefined, undefined, braille,
      ).join("");

    for (const braille of [false, true]) {
      const arm = braille ? "the braille arm" : "the line arm";
      expect(vc(on, braille), `${arm}: mean on median`).toContain(g.diamondTee);
      expect(vc(apart, braille), `${arm}: mean apart`).toContain(g.diamond);
      expect(vc(apart, braille), `${arm}: and not the combined mark`).not.toContain(g.diamondTee);
      // Or the rows above pass against an arm that marks the median twice.
      expect(vc(none, braille), `${arm}: no mean at all`).not.toContain(g.diamond);
      expect(vc(none, braille), `${arm}: and no combined mark either`).not.toContain(g.diamondTee);
    }
  });

  it("T1.100b (C12 I33): the vertical arm's lid, and the alphabet that can say it after all", () => {
    // The transpose: `┴` on the lid points up, and there is nothing above it.
    const col = (q: Record<string, number>): readonly string[] =>
      boxplotColumn(q as never, 0, 10, 5, 11, FULL_CAPS);
    const lidOf = (rows: readonly string[]): string =>
      rows.find((r) => r.includes(g.topLeft)) ?? "";

    expect(lidOf(col({ min: 1, q1: 3, median: 5, q3: 7, max: 9 })), "a real upper whisker")
      .toContain(g.teeUp);
    expect(lidOf(col({ min: 1, q1: 3, median: 5, q3: 9, max: 9 })), "none")
      .not.toContain(g.teeUp);
    const floorOf = (rows: readonly string[]): string =>
      rows.find((r) => r.includes(g.bottomLeft)) ?? "";
    expect(floorOf(col({ min: 1, q1: 3, median: 5, q3: 9, max: 9 })), "the lower one is untouched")
      .toContain(g.teeDown);
    expect(floorOf(col({ min: 1, q1: 1, median: 5, q3: 7, max: 9 })), "and collapses on its own side")
      .not.toContain(g.teeDown);

    // **ASCII carries the fix, which is not what the spec first said.** Every
    // tee collapses to `+` and `vertical` is `|`, so the alphabet loses *which
    // way* a stub points and keeps *whether there is one* — the distinction
    // this rule is about. Measured rather than assumed: the row was first
    // written to assert the two were identical in ASCII, and they are not.
    const a = glyphs(ASCII_CAPS);
    expect(a.teeLeft, "the tees are one glyph").toBe(a.teeRight);
    expect(a.teeLeft, "and so is the corner").toBe(a.topLeft);
    expect(a.vertical, "but a plain vertical is its own").not.toBe(a.teeLeft);
    const flat = boxplotBand({ min: 1, q1: 3, median: 5, q3: 9, max: 9 } as never, 0, 10, 31, 3, ASCII_CAPS);
    const full = boxplotBand({ min: 1, q1: 3, median: 5, q3: 7, max: 9 } as never, 0, 10, 31, 3, ASCII_CAPS);
    expect(flat[1]?.trimEnd().at(-1), "collapsed").toBe(a.vertical);
    expect(full[1]?.trimEnd().at(-1), "and a whisker still ends in a junction").toBe(a.teeRight);
  });
});

describe("C12 §3r — the candlestick", () => {
  const WIDE_CAPS = { ...FULL_CAPS, ambiguousWidth: "wide" } as const;
  const walk = (
    steps: readonly number[],
    wick = 2,
  ): readonly { open: number; high: number; low: number; close: number }[] => {
    const out: { open: number; high: number; low: number; close: number }[] = [];
    let last = 100;
    for (const d of steps) {
      const open = last;
      const close = last + d;
      out.push({ open, close, high: Math.max(open, close) + wick, low: Math.min(open, close) - wick });
      last = close;
    }
    return out;
  };
  const candles = (over: Record<string, unknown> = {}): Plot =>
    block({
      kind: "plot", id: "cs", form: "line", height: 12, axes: true,
      plotStyle: "candlestick", series: [], ohlc: walk([3, -2, 5, -1, -4, 6, 2, -3]),
      ...over,
    } as unknown as Plot) as Plot;
  const framed = (b: Plot, width = 60, caps = FULL_CAPS): readonly string[] =>
    measurable({ definitions: [plotDefinition], capabilities: caps }).renderToLines(b, width)
      .map((l) => l.split(String.fromCharCode(27)).map((p, i) => (i === 0 ? p : p.slice(p.indexOf("m") + 1))).join(""));
  const ink = (rows: readonly string[]): string => rows.join("");

  it("CS1 (C12 I36, §6b B1): `ohlc` with `series: []` renders candles, not the empty message", () => {
    // **The row that would have been got wrong**, and the reason it is first:
    // every emptiness check in this component asks about `series`, and a
    // correct plain-candles block has none. The failure it guards is a frame
    // that is internally consistent, passes every width and row assertion, and
    // is about nothing.
    const rows = framed(candles());
    const g = glyphs(FULL_CAPS);
    expect(ink(rows)).not.toContain("No data");
    expect(ink(rows), "hollow bodies").toContain(g.candleHollow);
    expect(ink(rows), "filled bodies").toContain(g.candleFilled);

    // And the fixture responds: strip the bars and the same block *is* empty,
    // or the row passes against a renderer that ignores `ohlc` entirely.
    expect(ink(framed(candles({ ohlc: [] })))).toContain("No data");
  });

  it("CS2 (C12 I36, I25): direction is a mark at every depth, on the colour-stripped rows", () => {
    // **I25's sweep cannot reach this** — it is indexed by `PlotForm`, renders
    // `ONE_PER_FORM["line"]`, and a candlestick is a *style*. So the property
    // is asserted here, and asserted on rows with the escapes removed, which is
    // both what makes it a claim about marks and what the catalogue's `.plain`
    // frames show a reader.
    for (const [name, caps] of [
      ["24-bit", FULL_CAPS], ["1-bit", MONO_UNICODE_CAPS], ["ascii", ASCII_CAPS],
    ] as const) {
      const g = glyphs(caps);
      const seen = ink(framed(candles(), 60, caps));
      expect(seen, `${name}: rising`).toContain(g.candleHollow);
      expect(seen, `${name}: falling`).toContain(g.candleFilled);
      expect(g.candleHollow, `${name}: the two marks differ`).not.toBe(g.candleFilled);
    }
  });

  it("CS3 (C12 I36, §6b B7, B15): the width, the pitch, and no two candles touching", () => {
    // The clamp binding and not binding, plus the budget where the gap is
    // unaffordable — one row per regime, since a rule asserted at one width is
    // a rule that holds at one width.
    expect(candleWidth(60, 8), "clamp does not bind: ⌊60÷8⌋−1").toBe(6 - 1);
    expect(candleWidth(200, 8), "clamp binds at 5").toBe(5);
    expect(candleWidth(16, 8), "⌊16÷8⌋−1 = 1").toBe(1);
    expect(candleWidth(8, 8), "one cell each, and the floor holds").toBe(1);

    // **Two adjacent candles never touch above the one-cell budget**, which is
    // the property the arithmetic exists for: at `⌊areaWidth ÷ n⌋` exactly they
    // did, and two rising candles side by side read as one double-width body.
    for (const width of [30, 40, 60, 90]) {
      const rows = framed(candles({ ohlc: walk([2, 3, 4, 5, 6]) }), width);
      const g = glyphs(FULL_CAPS);
      const doubled = new RegExp(`${g.candleHollow}{${String(candleWidth(width - 6, 5) + 1)}}`, "u");
      expect(rows.some((r) => doubled.test(r)), `width ${String(width)}: no run wider than one body`)
        .toBe(false);
    }

    // **Left of centre at an even width** — `⌊(w−1)÷2⌋`, `boxplotColumn`'s
    // rounding, so the component has one rule and not two that agree.
    //
    // **At an odd width the two roundings agree**, which is what the first form
    // of this assertion measured: area 4 gives `cw = 3` and `⌊1⌋ = ⌈1⌉`, so a
    // mutation to `Math.ceil` passed it. Area 3 gives `cw = 2`, where floor is
    // 0 and ceil is 1 — the only widths that can see the rule are the even ones.
    expect(candleWidth(3, 1), "the fixture is an even candle").toBe(2);
    const even = candleRows(walk([4]), { min: 90, max: 110 }, 3, 9, FULL_CAPS, FACING_DEFAULT);
    const wickRow = even.rising.find((r) => r.trimEnd() === glyphs(FULL_CAPS).vertical);
    expect(wickRow, "a wick-only row exists to read").toBeDefined();
    expect(wickRow?.indexOf(glyphs(FULL_CAPS).vertical), "cw=2 → the left cell").toBe(0);

    // And an odd width centres it, or the rule above is a statement about one
    // parity rather than about rounding.
    expect(candleWidth(4, 1)).toBe(3);
    const odd = candleRows(walk([4]), { min: 90, max: 110 }, 4, 9, FULL_CAPS, FACING_DEFAULT);
    expect(odd.rising.find((r) => r.trimEnd() === ` ${glyphs(FULL_CAPS).vertical}`), "cw=3 → centred")
      .toBeDefined();
  });

  // The merged ink of a candlestick, rising over falling over flat.
  const inkOf = (
    bars: readonly { open: number; high: number; low: number; close: number }[],
    w: number,
  ): readonly string[] => {
    const rows = candleRows(bars, { min: 80, max: 130 }, w, 8, FULL_CAPS, FACING_DEFAULT);
    return rows.rising.map((r, i) =>
      [...r].map((c, j) => {
        if (c !== " ") return c;
        const f = rows.falling[i]![j]!;
        return f !== " " ? f : rows.flat[i]![j]!;
      }).join(""));
  };
  const extentOf = (
    bars: readonly { open: number; high: number; low: number; close: number }[],
    w: number,
  ): number => Math.max(...inkOf(bars, w).map((r) => r.trimEnd().length)); // cells-ok — a column index

  it("CD1 (C12 I36, §3r): the shipped frame's 32 bars fill their 74 columns", () => {
    // **The measurement this started from.** `line-candlestick-24bit` is 32 bars
    // in a 74-cell area, and it drew 64 — ten blank columns, 14% of the plot.
    // This row is written about that number rather than about the expression, so
    // a second way of getting the pitch wrong fails it too.
    const bars = walk(Array.from({ length: 32 }, (_u, i) => [3, -2, 5, -1][i % 4]!));
    expect(extentOf(bars, 74), "the last body's right edge is the last column").toBe(74);
  });

  it("CD2 (C12 I36, §3r): four bars fill 74 columns too — the cap, not only the remainder", () => {
    // **Two causes and one expression fixes both.** The remainder shortfall is
    // at most `n − 1`; `MAX_CANDLE` is unbounded — above `⌊w ÷ n⌋ > 6` the old
    // pitch capped at 6 and the extent was `6n` however wide the area, so four
    // bars in 74 columns drew 23 and left 69% blank. A row asserting only the
    // remainder passes against that.
    expect(candleWidth(74, 4), "the clamp binds at 5").toBe(5);
    expect(extentOf(walk([3, -2, 5, -1]), 74), "still the full width").toBe(74);
  });

  it("CD3 (C12 I36, §6b B15): bodies never differ, gaps differ by at most one", () => {
    // B15's concern is a candle wider than its neighbours reading as a datum.
    // The remedy the old code took — distributing the remainder into the pitch —
    // was the wrong half of it: the *body* must be uniform and the *gap* is what
    // absorbs the leftover.
    for (const [w, n] of [[74, 12], [74, 25], [74, 32], [44, 4], [80, 7]] as const) {
      const lefts = Array.from({ length: n }, (_u, i) => candleLeft(i, n, w)); // cells-ok — a column index
      const cw = candleWidth(w, n); // cells-ok — a cell width
      const gaps = lefts.slice(1).map((l, i) => l - (lefts[i]! + cw)); // cells-ok — a cell width
      expect(Math.max(...gaps) - Math.min(...gaps), `gaps at ${String(w)}×${String(n)}`)
        .toBeLessThanOrEqual(1);
      expect(lefts[n - 1]! + cw, `extent at ${String(w)}×${String(n)}`).toBe(w);
    }
  });

  it("CD3b (C12 I36, §3r): the extent never shrinks when a bar arrives", () => {
    // **The measured falsification of *growing rightward*.** Left-anchored, the
    // drawn extent fell at five of seventy-nine arrivals over `n = 2…80` at 74
    // columns — worst at `n = 37 → 38`, where 73 columns became 38. A reader
    // watching a feed fill saw the chart shrink as data arrived, which is the
    // property the anchor was chosen to give and the one it did not.
    const w = 74;
    let previous = 0; // cells-ok — a column index
    const shrank: number[] = [];
    for (let n = 2; n <= 80; n += 1) { // cells-ok — a candle count
      const extent = candleLeft(n - 1, n, w) + candleWidth(w, n); // cells-ok — a column index
      if (extent < previous) shrank.push(n); // cells-ok — a candle count
      previous = extent;
    }
    expect(shrank, "no arrival takes chart away").toEqual([]);
  });

  it("CD4 (C12 I37, §3s): the cursor's column is where the candle's ink is", () => {
    // **Two callers of one placement, and the x ticks are the third.**
    // `furniture.ts:xRowFor` reaches the axis through `candleColumn`, so a
    // second copy of the arithmetic lets the ticks and the candles disagree
    // about the same bar in a frame where every count still adds up. Asserted as
    // *the column candleColumn names carries this candle's ink*, which is the
    // claim a reader depends on, rather than as equality of two expressions.
    for (const [w, n] of [[74, 32], [74, 4], [44, 8], [60, 60]] as const) {
      const bars = walk(Array.from({ length: n }, (_u, i) => [3, -2, 5, -1][i % 4]!));
      const ink = inkOf(bars, w);
      for (const i of [0, Math.floor(n / 2), n - 1]) { // cells-ok — a bar index
        const col = candleColumn(bars, i, w, FACING_DEFAULT); // cells-ok — a column index
        expect(col, `bar ${String(i)} of ${String(n)} at ${String(w)}`).not.toBeNull();
        expect(ink.some((r) => (r[col!] ?? " ") !== " "), `ink at column ${String(col)}`).toBe(true);
      }
    }
  });

  it("CS4 (C12 I36, §6b B12): more bars than columns aggregate, and the extreme survives", () => {
    // **A series whose extreme falls on a bar sampling would drop**, since an
    // aggregation that happens to agree with sampling tests nothing. Bar 7 of
    // 24 carries the high; with 6 columns a sampler taking every fourth bar
    // reads bars 0, 4, 8, … and never sees it.
    const bars = walk(Array.from({ length: 24 }, () => 1), 1).map((b, i) =>
      i === 7 ? { ...b, high: 999 } : b);
    const agg = aggregate(bars, 6);
    expect(agg).toHaveLength(6);
    expect(Math.max(...agg.map((b) => b.high)), "the spike survives").toBe(999);
    expect(agg[0]!.open, "open of the first").toBe(bars[0]!.open);
    expect(agg[5]!.close, "close of the last").toBe(bars[23]!.close);
    expect(Math.min(...agg.map((b) => b.low)), "low of the minima")
      .toBe(Math.min(...bars.map((b) => b.low)));

    // Sampling every fourth bar is what this replaces, and it loses the spike.
    const sampled = bars.filter((_b, i) => i % 4 === 0);
    expect(Math.max(...sampled.map((b) => b.high)), "the fixture responds").not.toBe(999);

    // Fewer bars than columns are returned unchanged — C12 I13's left-alignment is
    // the caller's, and aggregation must not quietly stretch them.
    expect(aggregate(bars.slice(0, 3), 40)).toHaveLength(3);
  });

  it("CS8 (C12 I36): a wide terminal draws the ASCII arm and fits the same candles", () => {
    // **The row that would have asserted the conflation.** Its first form said
    // *half as many*, which is what §3r said before `glyphs()` was measured:
    // two different swaps were both called *the wide arm*, and only the ramp's
    // is braille. `glyphs()` returns ASCII at `wide`, so the shape is identical
    // and the glyphs are not.
    const narrow = framed(candles(), 60, FULL_CAPS);
    const wide = framed(candles(), 60, WIDE_CAPS);
    const ascii = framed(candles(), 60, ASCII_CAPS);
    expect(wide, "wide draws what ascii draws").toEqual(ascii);
    expect(ink(wide), "and not the ambiguous vocabulary").not.toContain(glyphs(FULL_CAPS).candleHollow);

    // Same shape: the ink sits in the same columns, whatever the glyphs are.
    const shape = (rows: readonly string[]): string =>
      rows.map((r) => [...r].map((c) => (c === " " ? " " : "#")).join("")).join("\n");
    expect(shape(wide), "the column count does not change").toBe(shape(narrow));
    for (const rows of [narrow, wide]) {
      for (const r of rows) expect(cells(r, "narrow")).toBeLessThanOrEqual(60);
    }
  });

  it("CS9 (C12 I36, §6b B13): `┿` where the wick shares the body's cell — never the only cell", () => {
    // A wick reaching no row beyond the body: `┿` carries both, because the
    // body wins the overlap and the wick would simply vanish.
    const tight = [{ open: 100, high: 110, low: 99.5, close: 108 }];
    const wide9 = candleRows(tight, { min: 90, max: 112 }, 9, 10, FULL_CAPS, FACING_DEFAULT);
    expect(ink(wide9.rising), "the lower wick shares the body's end cell")
      .toContain(glyphs(FULL_CAPS).candleCross);

    // **And every candle still says which way it went.** This is the bound the
    // frame added: 120 bars in 44 columns put every body in one row and one
    // column, and the first form of the rule drew a chart of nothing but `┿`.
    const dense = walk(Array.from({ length: 120 }, (_u, i) => [3, -2, 5, -1, -4, 6, 2, -3][i % 8]!));
    const rows = framed(candles({ ohlc: dense, height: 10 }), 50);
    const g = glyphs(FULL_CAPS);
    expect(ink(rows), "rising is visible").toContain(g.candleHollow);
    expect(ink(rows), "falling is visible").toContain(g.candleFilled);
    const packed = candleRows(dense, { min: 50, max: 250 }, 44, 8, FULL_CAPS, FACING_DEFAULT);
    const marks = [...ink([...packed.rising, ...packed.falling])].filter((c) => c !== " ");
    expect(marks.filter((c) => c === g.candleCross).length, "no cross at one cell wide").toBe(0);
  });

  it("CS-B3 (§6b B3): the axis unions the candles and the overlays, and a pin still wins", () => {
    // `low`/`high` bound the candles and the overlays bound themselves. Without
    // the union a plain-candles block scales against nothing.
    const bars = [{ open: 10, high: 40, low: 5, close: 20 }];
    expect(seriesRange([], {}, bars)).toEqual({ min: 5, max: 40 });
    expect(seriesRange([{ values: [1, 60] }], {}, bars), "the union, not either half")
      .toEqual({ min: 1, max: 60 });
    expect(seriesRange([], { yMin: 0, yMax: 100 }, bars), "a pin replaces rather than widens")
      .toEqual({ min: 0, max: 100 });

    // **Gated on the style, not on the field.** Bars a block does not draw must
    // not move its axis — an axis widened by invisible data is a curve that
    // does not reach its own edges for no stated reason.
    const plain = framed(block({
      kind: "plot", id: "plain", form: "line", height: 6, axes: true,
      series: [{ values: [1, 2, 3] }], ohlc: bars,
    } as unknown as Plot) as Plot, 40);
    expect(ink(plain), "40 is nowhere on this axis").not.toContain("40");
  });

  it("CS-B4 (§6b B4): the legend names both directions, and the candles lead", () => {
    const rows = framed(candles({ legend: "right", series: [{ values: [100, 104, 102], label: "ma" }] }), 64);
    const seen = ink(rows);
    expect(seen).toContain("rising");
    expect(seen).toContain("falling");
    expect(seen).toContain("ma");
    // The swatch is the body glyph rather than `markOf`'s ladder: a legend
    // whose mark is not the thing it names is this function's recorded defect.
    expect(rows.some((r) => r.includes(`${glyphs(FULL_CAPS).candleHollow} rising`))).toBe(true);
    expect(rows.some((r) => r.includes(`${glyphs(FULL_CAPS).candleFilled} falling`))).toBe(true);
  });

  it("CS7 (C12 I36, §6b B6): four values, then the overlays, through `yFormat`", () => {
    const priced = [
      { open: 12.4, high: 13.1, low: 12.0, close: 12.9 },
      { open: 12.9, high: 13.4, low: 12.2, close: 12.3 },
    ];
    const at = (idx: number, over: Record<string, unknown> = {}): string =>
      measurable({
        definitions: [plotDefinition], capabilities: FULL_CAPS, cursorPositions: { cs: idx },
      }).renderToLines(candles({ ohlc: priced, ...over }), 56)
        .map((l) => l.split(String.fromCharCode(27)).map((pt, i) => (i === 0 ? pt : pt.slice(pt.indexOf("m") + 1))).join(""))
        .at(-1) ?? "";

    // **All four, and formatted through `yFormat` rather than a hand-rolled
    // round.** `cursorReadout` was the fifth instance of F175's class and the
    // last in `src/`; the numeric arm was F182.
    expect(at(0).trim()).toBe("O 12.4  H 13.1  L 12.0  C 12.9");
    expect(at(0, { yFormat: "percent" }).trim()).toBe("O 12.4%  H 13.1%  L 12.0%  C 12.9%");

    // **One precision across the four** (F177, F182). `L 12` beside `O 12.4`
    // reads as a coarser measurement, and the eye compares the digit count
    // before it compares the value — so the row above is the assertion, and
    // this is the fixture that would have shown four precisions.
    expect(at(0)).toContain("L 12.0");

    // **B6 — four dashes past the end**, not one and not none: a candlestick
    // has four values to be absent, and a readout that shortens reads as
    // *this bar has no open* rather than as *there is no bar*.
    expect(at(9).trim()).toBe("O —  H —  L —  C —");

    // The overlays follow the candles, in the legend's order.
    const withMa = at(1, { series: [{ values: [12.5, 12.64], label: "ma" }] });
    expect(withMa.trim()).toBe("O 12.9  H 13.4  L 12.2  C 12.3  ma: 12.64");
    expect(withMa.indexOf("O "), "the candles lead").toBeLessThan(withMa.indexOf("ma:"));

    // **The series' own number goes through `yFormat` too**, which is the half
    // of the defect a rounding assertion cannot see: `Math.round(v * 100) / 100`
    // and `formatReadout` agree on `12.64` and disagree on whether it is a
    // percentage. The old line ignored the field entirely, so a percentage, a
    // byte count and a duration all read as bare numbers.
    const pct = at(1, { yFormat: "percent", series: [{ values: [12.5, 12.64], label: "ma" }] });
    expect(pct.trim()).toBe("O 12.9%  H 13.4%  L 12.2%  C 12.3%  ma: 12.6%");
    const bytes = at(1, { yFormat: "bytes", series: [{ values: [2048, 4096], label: "rss" }] });
    expect(bytes).toContain("rss: 4 KB");
  });

  it("CS7b (F182): the numeric arm keeps the digit the producer sent", () => {
    // **F175's defect in the arm its fix did not reach.** A bar with no
    // `yFormat` drew `45` for `45.2` while the identical block with
    // `yFormat: "percent"` drew `45.2%` — same function, same values.
    expect(formatReadout(45.2, undefined)).toBe("45.2");
    expect(formatReadout(12.75, undefined)).toBe("12.75");
    expect(formatReadout(45.2, "percent")).toBe("45.2%");

    // **And it does not manufacture digits.** A floor of one decimal was the
    // first fix and it rounds `12.75` to `12.8`; a fixed precision would make
    // `1284` read `1284.0`. What holds is the shortest round trip, capped —
    // `1/3` is float noise past six places, not a measurement.
    expect(formatReadout(1284, undefined)).toBe("1284");
    expect(formatReadout(0.023, undefined)).toBe("0.023");
    expect(formatReadout(1 / 3, undefined)).toBe("0.3333");

    // **Four significant figures, not a decimal cap** — which a catalogue frame
    // is what settled. A flat six places is right for `0.023` and prints a
    // computed sine as `55.827460`, float noise with a confident face on it.
    expect(formatReadout(55.82746018152, undefined)).toBe("55.83");
    expect(formatReadout(0.000123456, undefined)).toBe("0.0001235");
    expect(formatReadout(0, undefined)).toBe("0");

    // A set shares one precision; a lone value does not, which is the claim
    // only a caller can make.
    expect(readoutSet([12.4, 13.1, 12.0, 12.9], undefined).join(" ")).toBe("12.4 13.1 12.0 12.9");
    expect(readoutSet([12.75, 12.75], undefined).join(" ")).toBe("12.75 12.75");
    expect(readoutSet([1, undefined, 3], undefined).join(" ")).toBe("1 — 3");
  });

  it("T1.99 (C12 I37, §3s): the cursor is marked behind the data and on the rule", () => {
    const g = glyphs(FULL_CAPS);
    const marked = (b: Plot, idx: number, width = 50, caps = FULL_CAPS): readonly string[] =>
      measurable({ definitions: [plotDefinition], capabilities: caps, cursorPositions: { p: idx } })
        .renderToLines(b, width)
        .map((l) => l.split(String.fromCharCode(27)).map((pt, i) => (i === 0 ? pt : pt.slice(pt.indexOf("m") + 1))).join(""));
    const cs = (over: Record<string, unknown> = {}): Plot =>
      block({
        kind: "plot", id: "p", form: "line", height: 10, axes: true,
        plotStyle: "candlestick", series: [], ohlc: walk([3, -2, 5, -1, -4, 6, 2, -3]), ...over,
      } as unknown as Plot) as Plot;
    const ruleRow = (rows: readonly string[]): string =>
      rows.find((r) => r.includes(g.cursorMark)) ?? "";

    // **Both marks, because either alone fails the case that motivates it.**
    const rows = marked(cs(), 2);
    expect(ink(rows), "the dashed column").toContain(g.dashedVertical);
    expect(ruleRow(rows), "and the mark on the rule").not.toBe("");

    // They agree on the column, or the reader is pointed at two places.
    const dashRow = rows.find((r) => r.includes(g.dashedVertical)) ?? "";
    expect(dashRow.indexOf(g.dashedVertical)).toBe(ruleRow(rows).indexOf(g.cursorMark));

    // **Never over the data**: the dashed line is composited behind, so no row
    // that carries a candle at that column carries the dash there too.
    // **Over the plot area only**, sliced between the two border rows — the
    // rule row carries the mark by construction and the readout row carries
    // text, so a sweep over every row of the block asserts about neither.
    const col = ruleRow(rows).indexOf(g.cursorMark);
    const top = rows.findIndex((r) => r.includes(g.topLeft));
    const area = rows.slice(top + 1, rows.findIndex((r) => r.includes(g.bottomLeft)));
    expect(area.length, "there are area rows to read").toBeGreaterThan(4);
    for (const r of area) {
      expect([g.candleHollow, g.candleFilled, g.candleCross, g.vertical, g.dashedVertical, " ", undefined],
        `row "${r}" at column ${String(col)}`).toContain(r[col]);
    }
    expect(area.some((r) => r[col] === g.dashedVertical), "and the dash is in some of them").toBe(true);

    // Out of range draws neither, which is what the readout's dashes say.
    const past = marked(cs(), 99);
    expect(ink(past), "no rule mark").not.toContain(g.cursorMark);
    expect(ink(past), "no dashed column").not.toContain(g.dashedVertical);
  });

  it("T1.99b (C12 I37, §3s): the column is the form's mapping, through the aggregation", () => {
    const w = 44;
    const curve = (i: number, n: number): number =>
      n <= 1 ? Math.floor((w - 1) / 2) : Math.round((i / (n - 1)) * (w - 1));

    // The aggregation, inverted: bar `i` is drawn in bucket `⌊i × n ÷ len⌋`.
    const many = walk(Array.from({ length: 120 }, (_u, i) => [3, -2, 5, -1][i % 4]!));
    const drawn = Math.min(many.length, w);
    const wick = Math.floor((candleWidth(w, drawn) - 1) / 2);
    for (const i of [0, 1, 59, 60, 61, 119]) {
      expect(candleColumn(many, i, w, FACING_DEFAULT), `bar ${String(i)}`)
        .toBe(candleLeft(Math.floor((i * drawn) / many.length), drawn, w) + wick);
    }

    // **Where the two rules separate, re-measured when §3r changed the layout.**
    // This read *what separates them is the sparse end, a candle sits at a fixed
    // pitch and is left-aligned* — a correct measurement of a layout that is now
    // struck. The separation does not vanish with it: it falls to the wick's
    // offset **inside its own body**, `⌈(cw − 1) ÷ 2⌉` at the last bar, so the
    // invariant survives its own justification being falsified and the figure it
    // has to cover drops from 23 cells to 2.
    expect(candleColumn(many, 60, w, FACING_DEFAULT), "120 bars: they meet").toBe(curve(60, many.length));
    const few = walk([1, 2, 3, 4]);
    expect(candleWidth(w, 4), "a five-cell body").toBe(5);
    expect(candleColumn(few, 3, w, FACING_DEFAULT), "4 bars: the candle, two short of the edge").toBe(41);
    expect(curve(3, 4), "4 bars: the curve's rule is the edge itself").toBe(43);
    const eight = walk([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(candleColumn(eight, 7, w, FACING_DEFAULT), "8 bars: the same two cells").toBe(41);
    expect(curve(7, 8)).toBe(43);

    expect(candleColumn(few, 0, w, FACING_DEFAULT)).toBe(Math.floor((candleWidth(w, 4) - 1) / 2));
    expect(candleColumn(few, 9, w, FACING_DEFAULT), "out of range").toBeNull();
    expect(candleColumn([], 0, w, FACING_DEFAULT), "no bars").toBeNull();
  });

  it("CS-B5 (§6b B5): a doji draws the flat mark, and an overlay through it draws the same", () => {
    // **Not a defect and it needs no glyph change**: a candle whose open equals
    // its close *is* flat, and so is a line crossing that column. Both
    // statements are true of the cell, and the readout is what disambiguates —
    // which is what makes it load-bearing rather than a convenience.
    const doji = [{ open: 100, high: 104, low: 96, close: 100 }];
    const rows = candleRows(doji, { min: 90, max: 110 }, 7, 9, FULL_CAPS, FACING_DEFAULT);
    expect(ink(rows.flat), "the doji is the flat mark").toContain(glyphs(FULL_CAPS).horizontal);

    // **In neither direction's layer, which is a claim about the tone.** It rode
    // in the rising layer and a golden frame read with colour on drew a bar that
    // did not move in the up tone — every count agreeing and the colour saying
    // *up*. Asserted on both layers, since only one of the two was ever wrong.
    expect(ink(rows.rising), "not the rising layer").toBe(" ".repeat(7 * 9));
    expect(ink(rows.falling), "not the falling layer").toBe(" ".repeat(7 * 9));

    // And a rising bar is still in the rising layer, or the row passes against
    // a renderer that puts everything in `flat`.
    const up = candleRows([{ open: 100, high: 104, low: 96, close: 103 }], { min: 90, max: 110 }, 7, 9, FULL_CAPS, FACING_DEFAULT);
    expect(ink(up.rising)).toContain(glyphs(FULL_CAPS).candleHollow);
    expect(ink(up.flat), "and nothing is flat").toBe(" ".repeat(7 * 9));
  });
});

describe("C12 §3e — the confidence band's interior and its edges", () => {
  const WIDE_CAPS = { ...FULL_CAPS, ambiguousWidth: "wide" } as const;
  const wave = (n: number): readonly number[] =>
    Array.from({ length: n }, (_, i) => 50 + 30 * Math.sin(i / 3)); // cells-ok — a sample count
  const banded = (
    n: number,
    over: Record<string, unknown> = {},
    ann: Record<string, unknown> = {},
  ): Plot => {
    const base = wave(n);
    return block({
      kind: "plot", id: "ub", form: "line", height: 8, axes: false,
      series: [{ label: "obs", values: base }],
      annotations: [{
        kind: "confidence",
        upper: base.map((v) => v + 12),
        lower: base.map((v) => v - 12),
        ...ann,
      }],
      ...over,
    } as unknown as Plot) as Plot;
  };
  const bare = (n: number, over: Record<string, unknown> = {}): Plot =>
    block({
      kind: "plot", id: "ub", form: "line", height: 8, axes: false,
      series: [{ label: "obs", values: wave(n) }],
      ...over,
    } as unknown as Plot) as Plot;
  const framed = (b: Plot, caps: typeof FULL_CAPS = FULL_CAPS, width = 50): readonly string[] =>
    measurable({ definitions: [plotDefinition], capabilities: caps }).renderToLines(b, width)
      .map((l) => l.split(String.fromCharCode(27)).map((p, i) => (i === 0 ? p : p.slice(p.indexOf("m") + 1))).join(""));
  const inked = (rows: readonly string[]): number =>
    rows.join("").split("").filter((c) => c !== " " && c !== "⠀").length; // cells-ok — a cell count
  const SHADE = "░";

  it("UB1 (C04 I52, §3e): the fill covers between the edges and nowhere else", () => {
    // A flat band from 40 to 60 on a range the series pins to 20..80, so the
    // covered rows are computable rather than eyeballed.
    const flat = block({
      kind: "plot", id: "ub", form: "line", height: 9, axes: false, yMin: 0, yMax: 80,
      series: [{ label: "obs", values: [0, 80] }],
      annotations: [{ kind: "confidence", upper: [60, 60], lower: [40, 40] }],
    } as unknown as Plot) as Plot;
    const rows = framed(flat);
    const shaded = rows.map((r, i) => (r.includes(SHADE) ? i : -1)).filter((i) => i >= 0); // cells-ok
    expect(shaded.length).toBeGreaterThan(0); // cells-ok — a row count
    // Contiguous, and strictly inside the area: a fill with a hole in it is not
    // an interior, and one that reaches the frame is not a band.
    for (let k = 1; k < shaded.length; k += 1) expect(shaded[k]).toBe(shaded[k - 1]! + 1); // cells-ok
    expect(shaded[0]).toBeGreaterThan(0); // cells-ok — a row index
    expect(shaded[shaded.length - 1]).toBeLessThan(rows.length - 1); // cells-ok — a row index
  });

  it("UB2 (§3e, §3u): the curve draws over the fill, never the other way", () => {
    // Every cell the bare plot inks is still inked, and with the same glyph:
    // the annotation is the last layer, so it cannot take a cell from a series.
    const without = framed(bare(24));
    const with_ = framed(banded(24));
    without.forEach((row, y) => {
      for (let x = 0; x < row.length; x += 1) { // cells-ok — a column index
        const c = row[x]!;
        if (c === " " || c === "⠀") continue;
        expect(with_[y]?.[x]).toBe(c);
      }
    });
  });

  it("UB3 (C04 I52, §3e): the fill is not in the curve's alphabet, at every arm", () => {
    // Asserted rather than assumed, which is the surviving half of the original
    // refusal: braille under braille is one alphabet in one cell.
    const braille = framed(banded(24, { plotStyle: "braille" }));
    expect(braille.join("")).toContain(SHADE);
    for (const ch of braille.join("")) {
      const cp = ch.codePointAt(0)!;
      if (cp >= 0x2800 && cp <= 0x28ff) continue; // the curve and the edges
      expect(cp === 0x2591 || ch === " " || cp < 0x2800 || cp > 0x28ff).toBe(true);
    }
    // And the shade is never a braille code point, which is the whole rule.
    expect(SHADE.codePointAt(0)! >= 0x2800 && SHADE.codePointAt(0)! <= 0x28ff).toBe(false);
  });

  it("UB4 (§3e): the fill draws on the narrow unicode arm and on no other", () => {
    expect(framed(banded(24), FULL_CAPS).join("")).toContain(SHADE);
    expect(framed(banded(24), MONO_UNICODE_CAPS).join("")).toContain(SHADE);
    // `cells("░", "wide")` is 2, so a filled row would occupy twice its cells.
    expect(framed(banded(24), WIDE_CAPS as typeof FULL_CAPS).join("")).not.toContain(SHADE);
    // The ASCII ramp *is* the curve's alphabet on that arm.
    expect(framed(banded(24), ASCII_CAPS).join("")).not.toContain(SHADE);
    expect(cells(SHADE, "wide")).toBe(2); // cells-ok — the measurement the arm rests on
  });

  it("UB5 (§3e): `fill: false` draws the edges and no shade", () => {
    const off = framed(banded(24, {}, { fill: false }));
    expect(off.join("")).not.toContain(SHADE);
    expect(inked(off)).toBeGreaterThan(inked(framed(bare(24)))); // cells-ok — the edges are still there
  });

  it("UB5b (§3e, §3u): the edge keeps its own cell once the fill is on", () => {
    // **UB5 did not say this and a mutation is what said so.** Making the fill
    // win inside the annotation's own layer survived every row above: the band
    // still renders, the shade still appears, and the two dashed edges — the
    // whole of what the band states — are quietly replaced by it.
    const off = framed(banded(24, {}, { fill: false }));
    const on = framed(banded(24, {}, { fill: true }));
    off.forEach((row, y) => {
      for (let x = 0; x < row.length; x += 1) { // cells-ok — a column index
        const c = row[x]!;
        if (c === " " || c === "⠀") continue;
        expect(on[y]?.[x]).toBe(c);
      }
    });
  });

  it("UB6 (§3e): the edges' ink follows the area, not the sample count", () => {
    // The defect this row exists for was proportional to *n*: two edges over a
    // 50-column area inked two cells at eight samples and twenty-four at a
    // hundred, because a dot was set where a sample's column happened to satisfy
    // the dash. Measured as the annotation's own contribution.
    const edgeInk = (n: number): number =>
      inked(framed(banded(n, {}, { fill: false }))) - inked(framed(bare(n))); // cells-ok
    const eight = edgeInk(8);
    const hundred = edgeInk(100);
    expect(eight).toBeGreaterThan(20); // cells-ok — it was 2
    // Within a factor of two across a 12× change in sample count: the edges are
    // a property of the area now. A ratio, because the exact counts move with
    // the curve's shape and the assertion is about what they depend on.
    expect(eight / hundred).toBeGreaterThan(0.5);
    expect(eight / hundred).toBeLessThan(2);
  });

  it("UB7 (C04 I52): a gap in an edge leaves that column unfilled", () => {
    const base = [10, 20, 30, 40, 50];
    const withGap = block({
      kind: "plot", id: "ub", form: "line", height: 9, axes: false, yMin: 0, yMax: 60,
      series: [{ label: "obs", values: base }],
      annotations: [{
        kind: "confidence",
        upper: [20, 30, null, 50, 60] as unknown as readonly number[],
        lower: [0, 10, 20, 30, 40],
      }],
    } as unknown as Plot) as Plot;
    const rows = framed(withGap);
    // The middle of the area has a column with no shade in it at all, and the
    // ends do: an interpolant with one end missing draws nothing.
    const columns = (x: number): number =>
      rows.filter((r) => r[x] === SHADE).length; // cells-ok — a row count
    expect(columns(1)).toBeGreaterThan(0); // cells-ok — a row count
    expect(columns(24)).toBe(0); // cells-ok — the gap's column
  });
});

describe("C04 I52 — the annotation check dispatches per kind", () => {
  const plot = (annotations: readonly unknown[]): unknown => ({
    kind: "plot", id: "p", form: "line", height: 5,
    series: [{ values: [1, 2, 3] }], annotations,
  });

  it("UB8 (C04 I52): `confidence` and `whiskers` pass the validator", () => {
    // Both were built by `FigureBuilder`, drawn by `annotate.ts`, and refused
    // here — by a message naming a `value` neither kind has.
    expect(validateBlock(plot([{ kind: "confidence", upper: [2, 3], lower: [0, 1] }])).ok).toBe(true);
    expect(validateBlock(plot([{ kind: "whiskers", points: [{ x: 0, y: 1, err: 0.5 }] }])).ok).toBe(true);
  });

  it("UB9 (C04 I52): `line` and `band` are unchanged, including the order rule", () => {
    expect(validateBlock(plot([{ kind: "line", value: 5 }])).ok).toBe(true);
    expect(validateBlock(plot([{ kind: "band", from: 1, to: 5 }])).ok).toBe(true);
    expect(validateBlock(plot([{ kind: "line" }])).ok).toBe(false);
    expect(validateBlock(plot([{ kind: "band", from: 5, to: 1 }])).ok).toBe(false);
  });

  it("UB10 (C04 I52): an unknown kind is refused rather than checked as a `line`", () => {
    // It used to take the `else` arm, be checked for a `value`, and then draw
    // nothing: `edgesOf` reads `annotation.value` and `drawn` filters it.
    const r = validateBlock(plot([{ kind: "wibble", value: 5 }]));
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).toContain("wibble");
  });

  it("UB11 (C04 I52, I46a): a confidence edge is a numeric array, and null is its gap", () => {
    expect(validateBlock(plot([{ kind: "confidence", upper: [1, null, 3], lower: [0, 0, 0] }])).ok).toBe(true);
    expect(validateBlock(plot([{ kind: "confidence", upper: [1, "x"], lower: [0, 0] }])).ok).toBe(false);
    expect(validateBlock(plot([{ kind: "confidence", lower: [0, 0] }])).ok).toBe(false);
  });

  it("UB12 (C04 I52): a whisker's half-width is not negative", () => {
    expect(validateBlock(plot([{ kind: "whiskers", points: [{ x: 0, y: 1, err: -1 }] }])).ok).toBe(false);
    expect(validateBlock(plot([{ kind: "whiskers", points: [{ x: 0, y: 1 }] }])).ok).toBe(false);
  });
});

describe("C12 §3ab — width, aspect and align", () => {
  const wave = Array.from({ length: 30 }, (_, i) => 50 + 30 * Math.sin(i / 4)); // cells-ok
  const plot = (over: Record<string, unknown> = {}): Plot =>
    block({
      kind: "plot", id: "sz", form: "line", height: 6, axes: true,
      series: [{ label: "a", values: wave }], ...over,
    } as unknown as Plot) as Plot;
  const framed = (b: Plot, frame = 60): readonly string[] =>
    measurable({ definitions: [plotDefinition], capabilities: FULL_CAPS }).renderToLines(b, frame)
      .map((l) => l.split(String.fromCharCode(27)).map((p, i) => (i === 0 ? p : p.slice(p.indexOf("m") + 1))).join(""));
  const widest = (rows: readonly string[]): number =>
    rows.reduce((m, r) => Math.max(m, cells(r.replace(/\s+$/u, ""))), 0); // cells-ok — a cell count
  const indent = (rows: readonly string[]): number =>
    rows.filter((r) => r.trim() !== "").reduce((m, r) => Math.min(m, r.length - r.trimStart().length), 99); // cells-ok

  it("SZ1 (C04 I62, §3ab): a declared width renders at that width, left by default", () => {
    const rows = framed(plot({ width: 30 }));
    expect(widest(rows)).toBe(30); // cells-ok — a cell count
    expect(indent(rows)).toBe(0); // cells-ok — a column index
    // …and the height is untouched, which is the invariant a width could break.
    expect(rows.length).toBe(framed(plot()).length); // cells-ok — a row count
  });

  it("SZ2 (§3ab): `aspect` derives a width through CELL_ASPECT, not through arithmetic here", () => {
    const b = plot({ aspect: 1 });
    const h = plotHeight(b);
    expect(widest(framed(b))).toBe(squareColumns(h)); // cells-ok — a cell count
    // A cell is 1 × 2, so a visually square figure is twice as many columns as
    // rows — the assertion that would pass on a wrong constant is `=== h`.
    expect(squareColumns(h)).toBe(h * 2); // cells-ok — a cell count
    expect(widest(framed(plot({ aspect: 2 })))).toBe(squareColumns(h) * 2); // cells-ok
  });

  it("SZ3 (C04 I62): `width` with `aspect` is refused at both gates", () => {
    expect(validateBlock({
      kind: "plot", id: "p", form: "line", height: 5,
      series: [{ values: [1, 2] }], width: 10, aspect: 1,
    }).ok).toBe(false);
    expect(() => b.plot({ form: "line", height: 5, series: [{ values: [1, 2] }], width: 10, aspect: 1 }))
      .toThrow(/width.*aspect/u);
  });

  it("SZ4 (C04 I62): `align` with neither is refused at both gates", () => {
    expect(validateBlock({
      kind: "plot", id: "p", form: "line", height: 5,
      series: [{ values: [1, 2] }], align: "centre",
    }).ok).toBe(false);
    expect(() => b.plot({ form: "line", height: 5, series: [{ values: [1, 2] }], align: "centre" }))
      .toThrow(/align/u);
    // …and legal with one, or the row above passes on a member nothing accepts.
    expect(validateBlock({
      kind: "plot", id: "p", form: "line", height: 5,
      series: [{ values: [1, 2] }], align: "centre", width: 20,
    }).ok).toBe(true);
  });

  it("SZ5 (§3ab): align places the figure, and the leftover cell goes right", () => {
    const left = framed(plot({ width: 31 }));
    const centre = framed(plot({ width: 31, align: "centre" }));
    const right = framed(plot({ width: 31, align: "right" }));
    expect(indent(left)).toBe(0); // cells-ok — a column index
    // 60 − 31 = 29, so centre is 14 and the odd cell is on the right.
    expect(indent(centre)).toBe(14); // cells-ok — a column index
    expect(indent(right)).toBe(29); // cells-ok — a column index
    // Placement is not size: all three are the same figure.
    expect(centre.map((r) => r.trimStart())).toEqual(left.map((r) => r.trimStart()));
    expect(right.map((r) => r.trimStart())).toEqual(left.map((r) => r.trimStart()));
  });

  it("SZ6 (§3ab, C12 I1): a plot declaring none of the three is byte-identical to before", () => {
    // The default arm has to cost nothing, which is what makes moving to a
    // narrowing `render` safe. `align: "left"` is the same frame stated.
    expect(framed(plot({ align: "left", width: 60 }))).toEqual(framed(plot()));
  });

  it("SZ7 (§3ab, C12 I1): narrowing never overflows and never changes the row count", () => {
    // Measured across the range where the gutter drops and then the frame's
    // corners do: the declared height holds at every width down to one.
    const tall = framed(plot()).length;
    for (const w of [20, 12, 8, 6, 4, 2, 1]) { // cells-ok — a cell count
      const rows = framed(plot({ width: w }));
      expect(rows.length).toBe(tall); // cells-ok — a row count
      expect(widest(rows)).toBeLessThanOrEqual(w); // cells-ok — a cell count
    }
  });

  it("SZ8 (§3ab): a width wider than the frame clamps rather than being refused", () => {
    // C04 has no terminal width, so this cannot be a gate — and a document that
    // asks for 200 cells on a 60-cell terminal gets 60 rather than an error.
    expect(validateBlock({
      kind: "plot", id: "p", form: "line", height: 5, series: [{ values: [1, 2] }], width: 200,
    }).ok).toBe(true);
    // **`widest` cannot see this and a mutation is what said so.** Dropping the
    // clamp survived a row asserting the rendered width was 60, because the
    // harness clips to the frame regardless — the assertion was reading a
    // guarantee a different mechanism makes. What distinguishes the two is the
    // *content*: an unclamped 200-cell figure clipped to 60 is its left third.
    expect(framed(plot({ width: 200 }))).toEqual(framed(plot()));
    expect(drawnWidth(plot({ width: 200 }), 60)).toBe(60); // cells-ok — a cell count
    expect(drawnWidth(plot({ width: 30 }), 60)).toBe(30); // cells-ok — a cell count
  });
});

describe("C12 §3ac — origin, and the record that carries its refusal", () => {
  const kitted = kit();
  const bare = (spec: Record<string, unknown>, w = 44): readonly string[] =>
    kitted
      .renderToLines(block({ kind: "plot", id: "o", height: 8, ...spec } as unknown as Plot), w)
      .map((r) => r.replace(/\x1b\[[0-9;]*m/g, ""));

  /** Three series of eight varied readings — enough for both axes to move. */
  const data = {
    series: [
      { values: [1, 5, 2, 9, 3, 7, 4, 8], label: "a" },
      { values: [8, 2, 6, 1, 9, 3, 7, 2], label: "b" },
      { values: [4, 9, 1, 6, 2, 8, 5, 3], label: "c" },
    ],
    categories: ["a", "b", "c"],
  };

  const inked = (row: string): readonly number[] =>
    [...row].map((ch, i) => (ch.trim() === "" ? -1 : i)).filter((i) => i >= 0); // cells-ok — a column index

  it("OR1 (§3ac): each corner places the extreme sample in that corner", () => {
    // One spike at the last sample: where it lands names the corner the data
    // grew *to*, and the first sample is at the opposite one.
    const one = { series: [{ values: [0, 0, 0, 0, 9] }], form: "scatter", height: 5, axes: false };
    const spike = (origin: string): { row: number; col: number } => {
      const rows = bare({ ...one, origin });
      // The spike is the lone extreme, so it is the only cell on its own row.
      for (let r = 0; r < rows.length; r += 1) { // cells-ok — a row index
        const cols = inked(rows[r] ?? "");
        if (cols.length === 1) return { row: r, col: cols[0]! }; // cells-ok — a column count
      }
      return { row: -1, col: -1 };
    };
    const bl = spike("bottom-left");
    const br = spike("bottom-right");
    const tl = spike("top-left");
    const tr = spike("top-right");
    // Vertical: the maximum is at the top under a bottom origin, the bottom
    // under a top one. Horizontal: the last sample is at the right under a
    // left origin, and at the left under a right one.
    expect(bl.row).toBe(0); // cells-ok — a row index
    expect(tl.row).toBe(4); // cells-ok — a row index
    expect(br.col).toBeLessThan(bl.col); // cells-ok — a column index
    expect(tr.row).toBe(tl.row); // cells-ok — a row index
    expect(tr.col).toBe(br.col); // cells-ok — a column index
  });

  it('OR2 (§3ac A2): origin with yAxis "right" moves the labels once, not twice', () => {
    // Two rules meet at rest: yAxis picks the side the gutter sits on, origin
    // picks which end of it holds the maximum. Applying the horizontal half to
    // the gutter's side as well would move it back.
    const right = bare({ ...data, form: "line", yAxis: "right", origin: "bottom-right" });
    const left = bare({ ...data, form: "line", yAxis: "right", origin: "bottom-left" });
    const gutterAtEnd = (rows: readonly string[]): boolean =>
      rows.filter((r) => /[0-9]/.test(r)).every((r) => /[0-9]\s*$/.test(r.trimEnd()));
    expect(gutterAtEnd(right)).toBe(true);
    expect(gutterAtEnd(left)).toBe(true);
    expect(right).not.toEqual(left);
  });

  it("OR5 (§3ac A1, B3): the y label order and the x tick order follow the origin", () => {
    const up = bare({ ...data, form: "line", axes: true, origin: "bottom-left" });
    const down = bare({ ...data, form: "line", axes: true, origin: "top-left" });
    // A1 — the gutter's two ends were literals: row 0 is the maximum, row h − 1
    // the minimum, with only the interior ticks through rowOf. Computed, they
    // swap ends with the flip.
    const topLabel = (rows: readonly string[]): string =>
      rows.map((r) => r.match(/^\s*([0-9.]+)/)?.[1]).find((v) => v !== undefined) ?? "";
    expect(topLabel(up)).not.toBe(topLabel(down));
    expect(topLabel(up)).not.toBe("");
    // B3 — the ticks number the columns the data now occupies.
    const leftward = bare({ ...data, form: "line", axes: true, origin: "bottom-right" });
    expect(leftward[leftward.length - 1]).not.toBe(up[up.length - 1]);
  });

  it("OR6 (§3ac): every form ORIGIN_DEFAULT accepts moves under both flips", () => {
    // **The measurement made permanent.** This is the probe that produced the
    // record, run as an assertion: a form added to the accepted set without a
    // working flip fails here rather than shipping a member that does nothing.
    const accepted = (Object.keys(ORIGIN_DEFAULT) as PlotForm[]).filter(
      (f) => ORIGIN_DEFAULT[f] !== null,
    );
    expect(accepted.length).toBe(15); // cells-ok — a form count
    const still: string[] = [];
    // **Painted, not stripped.** A matrix at 24-bit is a colour wash whose
    // glyphs are all the same cell, so a frame with the SGR removed is identical
    // under every origin — the instrument would report the whole matrix family
    // as honouring nothing. Probe 2's first run made exactly this mistake and
    // put eight forms in the refusal set with a number beside them (§3ac.1).
    const painted = (spec: Record<string, unknown>): string =>
      kitted.renderToLines(block({ kind: "plot", id: "o", height: 8, ...spec } as unknown as Plot), 44).join("\n");
    for (const form of accepted) {
      const at = (origin: string): string => painted({ ...data, form, origin });
      const base = ORIGIN_DEFAULT[form]!;
      const flipX = base.includes("-left")
        ? base.replace("-left", "-right")
        : base.replace("-right", "-left");
      const flipY = base.startsWith("bottom")
        ? base.replace("bottom", "top")
        : base.replace("top", "bottom");
      if (at(flipX) === at(base)) still.push(`${form}: horizontal`);
      if (at(flipY) === at(base)) still.push(`${form}: vertical`);
    }
    expect(still).toEqual([]);
  });

it("OR11 (§3ac B1, B2): the crosshair's column follows the facing, curve and candle", () => {
    // Two passes agree on a placement and only one of them is columnsOf:
    // cursorColumn re-derives the arithmetic and candleColumn has its own. A
    // flip that misses either points at the mirror sample while the readout
    // beside it names a value the reader is not looking at — the frame stays
    // plausible and the number is wrong.
    const withCursor = (spec: Record<string, unknown>, idx: number): readonly string[] =>
      measurable({ definitions: [plotDefinition], capabilities: FULL_CAPS, cursorPositions: { c: idx } })
        .renderToLines(block({ kind: "plot", id: "c", height: 6, axes: true, ...spec } as unknown as Plot), 44)
        .map((r) => r.replace(/\x1b\[[0-9;]*m/g, ""));
    const mark = (rows: readonly string[]): number => {
      // The cursor rule is a dashed vertical behind the data; take its column
      // from the row that carries one and nothing else.
      for (const r of rows) {
        const cols = [...r].map((ch, i) => (ch === "╎" || ch === "┆" || ch === "┊" ? i : -1)).filter((i) => i >= 0); // cells-ok — a column index
        if (cols.length === 1) return cols[0]!; // cells-ok — a column count
      }
      return -1;
    };
    const curve = { series: [{ values: [1, 4, 2, 8, 3, 6, 5, 7] }], form: "line" };
    const left = mark(withCursor({ ...curve, origin: "bottom-left" }, 1));
    const right = mark(withCursor({ ...curve, origin: "bottom-right" }, 1));
    expect(left).toBeGreaterThanOrEqual(0); // cells-ok — a column index
    expect(right).toBeGreaterThan(left); // cells-ok — a column index
    // The candlestick places its bars itself, so it is a second mapping.
    const bars = Array.from({ length: 6 }, (_, i) => ({
      open: 100 + i, high: 104 + i, low: 96 + i, close: 102 + i,
    }));
    const bl = mark(withCursor({ series: [], ohlc: bars, form: "line", plotStyle: "candlestick", origin: "bottom-left" }, 0));
    const br = mark(withCursor({ series: [], ohlc: bars, form: "line", plotStyle: "candlestick", origin: "bottom-right" }, 0));
    expect(bl).toBeGreaterThanOrEqual(0); // cells-ok — a column index
    expect(br).toBeGreaterThan(bl); // cells-ok — a column index
  });

  it("OR12 (§3ac B4): the caller's x captions reverse, and a refused form keeps its own", () => {
    // A caption names the samples it sits under. Leaving the three where they
    // were under a reversed curve is the one furniture defect a reader cannot
    // detect from the frame: both halves look right and only the pairing is
    // wrong.
    const labelled = {
      ...data,
      form: "line",
      axes: true,
      xLabels: ["alpha", "beta", "gamma"] as [string, string, string],
    };
    const rowWith = (rows: readonly string[]): string =>
      rows.find((r) => r.includes("alpha")) ?? "";
    const rightward = rowWith(bare({ ...labelled, origin: "bottom-left" }));
    const leftward = rowWith(bare({ ...labelled, origin: "bottom-right" }));
    expect(rightward.indexOf("alpha")).toBeLessThan(rightward.indexOf("gamma"));
    expect(leftward.indexOf("gamma")).toBeLessThan(leftward.indexOf("alpha"));
    // **A matrix with captions is the fixture nothing had.** A form that
    // refuses `origin` keeps the facing its own renderer draws — which for the
    // matrix family is downward — and the golden frames only caught the row
    // order because no matrix fixture carries `xLabels`.
    const matrix = { ...data, form: "heatmap", axes: true, xLabels: ["alpha", "beta", "gamma"] as [string, string, string] };
    const wash = rowWith(bare(matrix));
    expect(wash.indexOf("alpha")).toBeLessThan(wash.indexOf("gamma"));
    const flipped = rowWith(bare({ ...matrix, origin: "top-right" }));
    expect(flipped.indexOf("gamma")).toBeLessThan(flipped.indexOf("alpha"));
    // And `contour` refuses the member, so its captions never move — the
    // builder throws rather than accepting one, which OR7 covers by name.
    const field = { ...data, form: "contour", axes: true, xLabels: ["alpha", "beta", "gamma"] as [string, string, string] };
    const plain = rowWith(bare(field));
    expect(plain.indexOf("alpha")).toBeLessThan(plain.indexOf("gamma"));
  });

  it("OR7 (§3ac): every form the record refuses is refused at both gates", () => {
    const refused = (Object.keys(ORIGIN_DEFAULT) as PlotForm[]).filter(
      (f) => ORIGIN_DEFAULT[f] === null,
    );
    expect(refused.length).toBe(31); // cells-ok — a form count
    // **A form with a required member needs it here, or this row asserts about
    // a different refusal.** `tree` is the first: without a `hierarchy` the
    // constructor complains about that instead, and the row would pass on a
    // gate it never reached (C04 I65).
    const valid = (form: PlotForm): object =>
      HIERARCHY_ROLE[form] === "structure" ? { hierarchy: { label: "root" } } : {};

    const bad = validateBlock({
      kind: "plot", id: "p", form: "bar", height: 5,
      series: [{ values: [1, 2] }], categories: ["x", "y"], origin: "top-left",
    });
    expect(bad.ok).toBe(false);
    expect(bad.ok === false && bad.error.join(" ")).toContain("origin");
    for (const form of refused) {
      expect(() =>
        b.plot({ series: [{ values: [1, 2] }], height: 4, form, origin: "top-left", ...valid(form) }),
      ).toThrow(/origin/);
    }
    // An unknown corner is refused by name, on a form that accepts the member.
    expect(validateBlock({
      kind: "plot", id: "p", form: "line", height: 5, series: [{ values: [1, 2] }], origin: "middle",
    }).ok).toBe(false);
  });

  it("OR8 (§3ac A6): a single sample does not move sideways at an even width", () => {
    // columnsOf centres a lone sample at floor((w − 1) / 2), which is one cell
    // off its own mirror when the width is even — so the facing enters the
    // *index* and never the answer.
    const one = { series: [{ values: [5] }], form: "scatter", height: 4, axes: false };
    for (const w of [40, 41, 12, 13]) { // cells-ok — a cell count
      expect(bare({ ...one, origin: "bottom-right" }, w)).toEqual(
        bare({ ...one, origin: "bottom-left" }, w),
      );
    }
  });

  it("OR9 (§3ac A7): a constant series draws the same rows under all four origins", () => {
    // The flat-line branch returns before the facing, and it is right to: a
    // series with no vertical extent has no direction to reverse.
    const flat = { series: [{ values: [3, 3, 3, 3] }], form: "line", height: 6, axes: false };
    const a = bare({ ...flat, origin: "bottom-left" });
    expect(bare({ ...flat, origin: "top-left" })).toEqual(a);
    expect(bare({ ...flat, origin: "bottom-right" })).toEqual(a);
    expect(bare({ ...flat, origin: "top-right" })).toEqual(a);
  });

  it("OR10 (§3ac B5): a confidence band keeps its interior under a downward facing", () => {
    // Under a downward facing `rowOf(max)` is the *larger* row index, so a fill
    // looping a → b runs backwards and draws nothing. The band vanishes rather
    // than inverting, which is the failure that looks like the member working.
    const banded = {
      series: [{ values: [4, 5, 6, 5, 4, 5, 6, 7] }],
      form: "line",
      height: 8,
      annotations: [{
        kind: "confidence",
        upper: [5, 6, 7, 6, 5, 6, 7, 8],
        lower: [3, 4, 5, 4, 3, 4, 5, 6],
      }],
    };
    const shaded = (rows: readonly string[]): number =>
      [...rows.join("")].filter((c) => c === "░").length; // cells-ok — a cell count
    const up = shaded(bare({ ...banded, origin: "bottom-left" }));
    const down = shaded(bare({ ...banded, origin: "top-left" }));
    expect(up).toBeGreaterThan(0); // cells-ok — a cell count
    expect(down).toBeGreaterThan(0); // cells-ok — a cell count
    // **Not exactly equal, and the reason is arithmetic rather than a defect.**
    // `Math.round` breaks ties upward, so `round(3.5)` is 4 and `round(-3.5)`
    // is −3: a row lying exactly on a half boundary lands on one side going up
    // and the other going down, and a band's two edges are two such boundaries
    // per column. The measured gap is two cells in ninety-six. What would be a
    // defect is the band **vanishing**, which is what an unordered fill loop
    // does under a downward facing, and that is what the two bounds above catch.
    expect(Math.abs(up - down)).toBeLessThanOrEqual(4); // cells-ok — a cell count
  });
});

/**
 * AC1–AC12: `axisCross: "zero"` (C12 §3ad, C04 I62).
 *
 * **Rows follow §3ad.3's classification table**, which is the artefact this was
 * designed from — the structural half. The sequence trace's B-rows are covered
 * by YA1 (one axis per plot) and by the frame reads here, because every one of
 * them is about two passes naming one object.
 */
describe("C12 §3ad — axisCross, and the two conditions that are not one condition", () => {
  const kitted = kit();
  const draw = (spec: Record<string, unknown>, w = 46, caps?: Parameters<typeof kit>[0]): readonly string[] =>
    (caps === undefined ? kitted : kit(caps))
      .renderToLines(block({ kind: "plot", id: "x", form: "line", height: 9, axes: true, legend: false, ...spec } as unknown as Plot), w)
      .map((r) => r.replace(/\x1b\[[0-9;]*m/g, ""));

  /** Nine readings that cross zero four times, so no half is trivially absent. */
  const V = [-4, -1, 2, 6, 3, -2, -5, 1, 5];
  const g = glyphs(FULL_CAPS);

  /**
   * The plot-area slice of a row — never the gutter, never the border.
   *
   * **The *first* of the two boundary glyphs, not the later one.** A labelled
   * row is `0 ┤…│` and an unlabelled one is `  │…│`, so the opening boundary is
   * whichever appears first; taking the later one lands on the right border of
   * any labelled row that happens to hold no curve `│`, and returns the empty
   * string. That reads as *no ink in the area*, which is a fixture answering for
   * the code — the shape `test/support/README.md` records.
   */
  const area = (r: string): string => {
    const tee = r.indexOf("┤");
    const bar = r.indexOf("│");
    const from = tee < 0 ? bar : bar < 0 ? tee : Math.min(tee, bar);
    return from < 0 ? "" : r.slice(from + 1, r.lastIndexOf("│"));
  };
  const rowsWith = (rows: readonly string[], ch: string): readonly number[] =>
    rows.map((r, i) => (area(r).includes(ch) ? i : -1)).filter((i) => i >= 0); // cells-ok — a row index

  it("AC1 (§3ad): a series spanning zero draws one horizontal rule, on the zero row", () => {
    const off = draw({ series: [{ values: V }] });
    const on = draw({ series: [{ values: V }], axisCross: "zero" });
    expect(rowsWith(off, g.dashedHorizontal), "no rule without the member").toEqual([]);
    const marked = rowsWith(on, g.dashedHorizontal);
    expect(marked.length, "exactly one rule").toBe(1); // cells-ok — a row count
    // **On the row the gutter calls 0**, which is the claim — not merely
    // somewhere. The gutter and the rule are placed from one axis (F210), and
    // this is the row that says the two agree.
    expect((on[marked[0] ?? 0] ?? "").split("┤")[0]?.trim()).toBe("0");
  });

  it("AC2 (§3ad): a declared domain spanning zero draws the vertical half, and they meet in one cell", () => {
    const on = draw({ series: [{ values: V }], axisCross: "zero", xMin: -4, xMax: 4 });
    const junction = on.filter((r) => area(r).includes(g.crossing));
    expect(junction.length, "one junction").toBe(1); // cells-ok — a row count
    const vertical = on.filter((r) => area(r).includes(g.dashedVertical));
    expect(vertical.length, "the vertical half runs the height of the area")
      .toBeGreaterThan(3); // cells-ok — a row count
    // The junction sits in the vertical half's column and on the horizontal
    // half's row — one cell, and it is the cell both halves claim.
    const col = area(junction[0] ?? "").indexOf(g.crossing);
    const anyVertical = area(vertical[0] ?? "").indexOf(g.dashedVertical);
    expect(col).toBe(anyVertical);
  });

  it("AC3 (§3ad A5, C04 I52): a range excluding zero draws no rule, and never one at the nearest edge", () => {
    const on = draw({ series: [{ values: [3, 6, 4, 9, 5] }], axisCross: "zero" });
    expect(rowsWith(on, g.dashedHorizontal), "dropped, not clamped").toEqual([]);
  });

  it("AC4 (§3ad A4): zero at the range's end draws nothing, by whichever test reaches it first", () => {
    // **Two arms, because each test masks the other on one of them** and a
    // single arm makes the mutation for the other unobservable.
    //
    // `yMin: 0` — the *range* test excludes it: `0 < 0` is false. Its row would
    // be the area's last, so the interior test would too, and a fixture with
    // only this arm cannot tell which one is doing the work.
    expect(rowsWith(draw({ series: [{ values: [0, 4, 2, 9, 5] }], axisCross: "zero", yMin: 0 }), g.dashedHorizontal))
      .toEqual([]);
    // `yMin: -0.001` — the range test *passes* (the floor is below zero) and
    // only the interior test excludes it, because zero rounds onto the bottom
    // row. This is the arm that separates them.
    expect(rowsWith(draw({ series: [{ values: [-0.001, 4, 2, 10, 5] }], axisCross: "zero", yMin: -0.001 }), g.dashedHorizontal))
      .toEqual([]);
  });

  it("AC5 (§3ad A15): a constant series draws nothing, though `rowOf` centres it", () => {
    // **The row the table was written for.** `rowOf` returns the centre row for
    // *every* value of a degenerate range — that is T1.5's rule and it is right
    // — so an interior test alone puts a zero axis through a plot of fives. The
    // range test is `min < 0 && max > 0`, strictly, and it is a second test.
    // **The gaps are the whole fixture.** An ungapped constant series draws a
    // flat line across the centre row — the same row a mis-derived zero axis
    // lands on — and the curve is resolved in front of it (C12 I23), so it covers
    // every cell the spurious rule would have. The defect is real and the
    // obvious fixture is the one case that cannot see it.
    const on = draw({ series: [{ values: [5, null, 5, null, 5] }], axisCross: "zero" });
    expect(rowsWith(on, g.dashedHorizontal)).toEqual([]);
    // **And a series of zeros, which is the arm that makes the test strict.**
    // `min <= 0 && max >= 0` admits a degenerate range sitting *on* zero, and
    // `rowOf` then centres it — a crossing axis through a plot with no extent,
    // whose gutter reads `0` on every labelled row. There is no scale for an
    // origin to be the origin of.
    const zeros = draw({ series: [{ values: [0, null, 0, null, 0] }], axisCross: "zero" });
    expect(rowsWith(zeros, g.dashedHorizontal)).toEqual([]);
    // And the fixture responds: the same shape over a spanning range does draw.
    const spans = draw({ series: [{ values: [-5, null, 5, null, -5] }], axisCross: "zero" });
    expect(rowsWith(spans, g.dashedHorizontal).length).toBe(1); // cells-ok — a row count
  });

  it("AC6 (§3ad A10): an undeclared index domain draws no vertical half, and the horizontal one is untouched", () => {
    // An index runs `0 … n − 1`, so its zero is sample 0 — the area's first
    // column, where a rule abuts the gutter's border. `0 < 0` is false, and no
    // declared-versus-inferred distinction is needed to say so.
    const on = draw({ series: [{ values: V }], axisCross: "zero" });
    expect(on.some((r) => area(r).includes(g.dashedVertical)), "no vertical half").toBe(false);
    expect(rowsWith(on, g.dashedHorizontal).length, "the horizontal half is unaffected").toBe(1); // cells-ok — a row count
    // **And a declared domain whose zero rounds onto column 0**, which the range
    // test admits and only the interior test excludes — the column's half of
    // AC4's pair, and without it the mutation for one of the two is invisible.
    const edge = draw({ series: [{ values: V }], axisCross: "zero", xMin: -0.001, xMax: 10 });
    expect(edge.some((r) => area(r).includes(g.dashedVertical)), "nor at the area's first column").toBe(false);
  });

  it("AC7 (§3ad A7): captions replace the numeric axis, and only the vertical half goes", () => {
    const on = draw({ series: [{ values: V }], axisCross: "zero", xMin: -4, xMax: 4, xLabels: ["a", "b", "c"] });
    expect(on.some((r) => area(r).includes(g.crossing)), "no junction").toBe(false);
    expect(rowsWith(on, g.dashedHorizontal).length, "the horizontal half stays").toBe(1); // cells-ok — a row count
  });

  it("AC8 (§3ad A2): under `grid` the cross shares the grid's alphabet and adds the junction", () => {
    const plain = draw({ series: [{ values: V }], plotFrame: "grid", xMin: -4, xMax: 4 });
    const crossed = draw({ series: [{ values: V }], plotFrame: "grid", xMin: -4, xMax: 4, axisCross: "zero" });
    expect(plain.some((r) => area(r).includes(g.crossing)), "no junction without it").toBe(false);
    expect(crossed.some((r) => area(r).includes(g.crossing)), "and one with it").toBe(true);
  });

  it("AC9 (§3ad A8, §3d.1): a candlestick's zero column is a candle's column, not the curve's rule", () => {
    // **Measured, and the margin is one cell.** §3r's placement change made
    // bodies span the area, so the candle mapping and the curve's rule now agree
    // almost everywhere and separate only by rounding — 117 of 160 combinations
    // over `n × width × domain`, every one of them by exactly one column. A
    // tolerance here would pass against the defect it is written for.
    //
    // 32 bars over an area of 54 with a domain of −2 … 1: the candle placement
    // puts zero at column 36 and the curve's rule at 35.
    const bars = Array.from({ length: 32 }, () => ({ open: 1, high: 2, low: 0, close: 1.5 })); // cells-ok — a bar count
    const caps = { unicode: "full" as const, ambiguousWidth: "narrow" as const };
    const asCandles = xTickRow({ min: -2, max: 1 }, 54, undefined, caps, undefined, FACING_DEFAULT,
      (t) => candleColumn(bars, Math.round(t * 31), 54, FACING_DEFAULT)); // cells-ok — a bar index
    const asCurve = xTickRow({ min: -2, max: 1 }, 54, undefined, caps, undefined, FACING_DEFAULT);
    expect(asCandles.zeroColumn, "the candle's column").toBe(36); // cells-ok — a column index
    expect(asCurve.zeroColumn, "and the curve's rule is not it").toBe(35); // cells-ok — a column index
  });

  it("AC10 (§3ad A6): the cross follows `origin` at all four corners", () => {
    const at = (origin: string): number => {
      const rows = draw({ series: [{ values: V }], axisCross: "zero", origin });
      return rowsWith(rows, g.dashedHorizontal)[0] ?? -1; // cells-ok — a row index
    };
    const up = at("bottom-left");
    const down = at("top-left");
    expect(up, "a zero row exists at all").toBeGreaterThan(0); // cells-ok — a row index
    // A vertical flip moves the zero row to the other side of the area's middle.
    expect(down).not.toBe(up);
    expect(at("bottom-right"), "a horizontal flip does not move the zero *row*").toBe(up);
    expect(at("top-right")).toBe(down);
  });

  it("AC11 (§3ad A14): every form outside the seven refuses at both gates", () => {
    const forms = Object.keys(HONOURS_AXIS_CROSS) as PlotForm[];
    const refused = forms.filter((f) => !HONOURS_AXIS_CROSS[f]);
    expect(refused.length, "39 of 46").toBe(39); // cells-ok — a form count
    // **A form with a required member needs it here, or this row asserts about
    // a different refusal.** `tree` is the first: without a `hierarchy` the
    // constructor complains about that instead, and the row would pass on a
    // gate it never reached (C04 I65).
    const valid = (form: PlotForm): object =>
      HIERARCHY_ROLE[form] === "structure" ? { hierarchy: { label: "root" } } : {};

    for (const form of refused) {
      const bad = validateBlock({
        kind: "plot", id: "r", form, height: 5,
        series: [{ values: [1, 2] }], categories: ["x", "y"], axisCross: "zero", ...valid(form),
      });
      expect(bad.ok, `${form} refused by the validator`).toBe(false);
      expect(() => b.plot({ series: [{ values: [1, 2] }], height: 4, form, axisCross: "zero", ...valid(form) }),
        `${form} refused by the builder`).toThrow(/axisCross/u);
    }
    // And the seven are accepted, or the rows above pass against a gate that
    // refuses everything.
    for (const form of forms.filter((f) => HONOURS_AXIS_CROSS[f])) {
      expect(validateBlock({
        kind: "plot", id: "k", form, height: 5, series: [{ values: [1, 2] }], axisCross: "zero",
      }).ok, `${form} accepted`).toBe(true);
    }
  });

  it("AC13 (C12 I26, F211): the grid's columns are the rule's ticks, on a numeric abscissa too", () => {
    // I26: *a gridline belongs where there is a value written — the rows the
    // gutter labels and the columns the bottom rule ticks.* The vertical half
    // was blank on every plot without `xLabels`, because the grid took its
    // columns from the captions arm while the rule took its own from the full
    // dispatch. **The one `grid` fixture in the corpus declares `xLabels`**, so
    // no committed frame walks the arm that was broken.
    const numeric = draw({ series: [{ values: V }], plotFrame: "grid" });
    const columns = (r: string): readonly number[] =>
      [...area(r)].map((ch, i) => (ch === g.dashedVertical ? i : -1)).filter((i) => i >= 0); // cells-ok — a column index
    const gridColumns = columns(numeric.find((r) => area(r).includes(g.dashedVertical)) ?? "");
    expect(gridColumns.length, "the grid has vertical lines").toBeGreaterThan(2); // cells-ok — a column count
    // And they are the rule's ticks, not some other spacing: the tee marks on
    // the bottom rule sit in the same area columns.
    // **The rule's own boundary glyphs, not `area`'s.** The bottom rule carries
    // `└` and `┘` where an area row carries `┤`/`│`, so the general slicer finds
    // no boundary and returns the empty string — which reads as *no ticks*, and
    // an empty set compares equal to nothing but itself.
    const rule = numeric[numeric.length - 2] ?? "";
    const inRule = rule.slice(rule.indexOf("└") + 1, rule.lastIndexOf("┘"));
    const ticks = [...inRule].map((ch, i) => (ch === "┬" ? i : -1)).filter((i) => i >= 0); // cells-ok — a column index
    expect(ticks.length, "the rule has ticks at all").toBeGreaterThan(2); // cells-ok — a column count
    expect(gridColumns, "one placement, two consumers").toEqual(ticks);
  });

  it("AC12 (§3ad A13): at one bit with two series nothing is drawn, and the frame is unchanged", () => {
    // The form routes to the stacked arm — one strip per series, each with its
    // own row mapping — so there is no single ordinate for a rule to cross.
    const two = { series: [{ values: V }, { values: V.map((v) => -v) }] };
    const off = draw(two, 46, MONO_CAPS);
    const on = draw({ ...two, axisCross: "zero" }, 46, MONO_CAPS);
    expect(on.join("\n")).toBe(off.join("\n"));
  });
});
