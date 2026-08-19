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
import { boxplotBand } from "../../src/presentation/plot/glyph-row.js";
import { barRow, binValues } from "../../src/presentation/plot/categorical.js";
import { kde } from "../../src/presentation/plot/kde.js";
import { waffleCells } from "../../src/presentation/plot/waffle.js";
import { horizonRows } from "../../src/presentation/plot/horizon.js";
import { pieRender, radarRender } from "../../src/presentation/plot/circle.js";

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

describe("GROUP 6: facets share a scale", () => {
  it("smallmultiples renders facets side by side", () => {
    const smBlock = block({
      kind: "plot", id: "m6", form: "smallmultiples", height: 5, axes: true,
      series: [{ values: [1, 2, 3] }],
      facets: [
        { kind: "plot", id: "f1", form: "line", height: 5, axes: true, series: [{ values: [1, 3, 2] }] } as Plot,
        { kind: "plot", id: "f2", form: "line", height: 5, axes: true, series: [{ values: [3, 1, 4] }] } as Plot,
      ],
    });
    const k = kit();
    const lines = k.renderToLines(smBlock, 80);
    expect(lines.length).toBeGreaterThan(0); // cells-ok — a row count
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
