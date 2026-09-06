/**
 * HS1–HS9: more than one histogram on one plot (C12 I42, §3v), and the rows
 * a form cannot draw (C12 I8).
 *
 * **The edges are the whole of it.** Every row here is about something two
 * series share or something the second one is owed; a row about one series
 * restates the histogram that already worked.
 */
import { describe, expect, it } from "vitest";
import { binValues } from "../../src/presentation/plot/derive.js";
import { block } from "../../src/data/viewmodel/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { FULL_CAPS, measurable } from "../support/render.js";

const kit = (caps = FULL_CAPS) => measurable({ definitions: [plotDefinition], capabilities: caps });
const plain = (l: string): string => l.replace(/\x1b\[[0-9;]*m/gu, "");
const LOW = Array.from({ length: 120 }, (_v, i) => 20 + ((i * 37) % 23) * 0.6); // cells-ok — a sample count
const HIGH = Array.from({ length: 120 }, (_v, i) => 45 + ((i * 53) % 31) * 0.7); // cells-ok — a sample count

describe("HS1 (C12 I42): the edges are the union's, not each series' own", () => {
  it("two separated distributions share one edge set", () => {
    const both = binValues([LOW, HIGH], "sturges");
    const lowAlone = binValues([LOW], "sturges");
    // Shown to be a real separation before anything is asserted about it: the
    // two ranges do not overlap, so per-series edges would differ by a lot.
    expect(Math.max(...LOW)).toBeLessThan(Math.min(...HIGH));
    expect(both.edges).not.toEqual(lowAlone.edges);
    expect(Number(both.edges[0])).toBeCloseTo(Math.min(...LOW), 0);
    expect(Number(both.edges[both.edges.length - 1])).toBeCloseTo(Math.max(...HIGH), 0);
  });

  it("each series is counted into those edges and nothing is lost", () => {
    const { counts } = binValues([LOW, HIGH], "sturges");
    expect(counts).toHaveLength(2); // cells-ok — a series count
    expect(counts[0]!.reduce((a, b) => a + b, 0)).toBe(LOW.length); // cells-ok — a sample count
    expect(counts[1]!.reduce((a, b) => a + b, 0)).toBe(HIGH.length); // cells-ok — a sample count
    expect(counts[0]).toHaveLength(counts[1]!.length); // cells-ok — a bin count
  });

  it("a series with nothing in it keeps its row of zeroes", () => {
    // Dropping it renumbers the groups, so the bin a reader is looking at holds
    // different series in different bins.
    const { counts } = binValues([LOW, [], HIGH], "sturges");
    expect(counts).toHaveLength(3); // cells-ok — a series count
    expect(counts[1]!.every((c) => c === 0)).toBe(true);
    expect(counts[1]).toHaveLength(counts[0]!.length); // cells-ok — a bin count
  });
});

describe("HS2 (C12 I42): the strategy reads the union", () => {
  it("the bin count is not the first series' own", () => {
    const together = binValues([LOW, HIGH], "sturges").counts[0]!.length; // cells-ok — a bin count
    const alone = binValues([LOW], "sturges").counts[0]!.length; // cells-ok — a bin count
    // 240 samples over a wider span is a different Sturges answer from 120 over
    // a narrow one — and if it were not, this row would be vacuous, so the
    // separation above is what makes it mean something.
    expect(together).not.toBe(alone);
  });
});

describe("HS3 (C12 I42): every series reaches the picture", () => {
  const two = (extra: object) => block({
    kind: "plot", id: "hs3", form: "histogram", height: 14, axes: true, legend: "right",
    series: [{ values: LOW, label: "before" }, { values: HIGH, label: "after" }], ...extra,
  });

  it("the default layout draws both, and the legend is not alone in naming them", () => {
    // **The defect this rules out is an assertion, not an omission.** `overlap`
    // drew the first series and let the legend name both, so the picture
    // claimed a series it did not have.
    const rows = kit().renderToLines(two({}), 76).map(plain);
    const body = rows.join("\n");
    expect(body).toContain("before");
    expect(body).toContain("after");
    // A bin only `after` occupies must be inked.
    const afterOnly = rows.filter((r) => /5[05]\.\d.*·\safter/u.test(r));
    expect(afterOnly.some((r) => r.includes("█"))).toBe(true);
  });

  for (const layout of ["grouped", "stacked", "normalised"] as const) {
    it(`${layout} draws every series`, () => {
      const rows = kit().renderToLines(two({ layout }), 76).map(plain);
      const inked = rows.filter((r) => r.includes("█")).length; // cells-ok — a row count
      expect(inked).toBeGreaterThan(0); // cells-ok — a row count
    });
  }
});

describe("HS4 (C12 I42): the vertical arm draws columns, not rows", () => {
  it("a grouped vertical histogram is not the horizontal one", () => {
    // **Vertical is tested before grouped and the order is the ruling.** A
    // grouped vertical bar fell into the horizontal arm and came back as rows:
    // the orientation decides which renderer draws, the layout only what.
    const rows = kit().renderToLines(block({
      kind: "plot", id: "hs4", form: "histogram", height: 14, axes: true, orientation: "vertical",
      series: [{ values: LOW, label: "before" }, { values: HIGH, label: "after" }],
    }), 76).map(plain);
    // A column form has its labels under the frame, not in a gutter beside it.
    expect(rows.some((r) => /┤.*·\safter/u.test(r))).toBe(false);
    expect(rows.filter((r) => r.includes("█")).length).toBeGreaterThan(4); // cells-ok — a row count
  });

  it("the bin edge is under the group and the bands between are blank", () => {
    // A band three cells wide has room for nothing, so composing
    // `20.0 · before` under a column dropped **every** label and the axis came
    // back empty.
    const rows = kit().renderToLines(block({
      kind: "plot", id: "hs4b", form: "histogram", height: 12, axes: true, orientation: "vertical",
      series: [{ values: LOW, label: "before" }, { values: HIGH, label: "after" }],
    }), 76).map(plain);
    expect(rows[rows.length - 1]!.trim()).not.toBe("");
    expect(rows[rows.length - 1]!).not.toContain("·");
  });
});

describe("HS5 (C12 I42): one series is unchanged", () => {
  it("the frame is what it was before any of this", () => {
    const one = block({
      kind: "plot", id: "hs5", form: "histogram", height: 9, axes: true,
      series: [{ values: LOW }],
    });
    const rows = kit().renderToLines(one, 60).map(plain);
    // One row per bin, in a gutter, with the interval as its label.
    expect(rows.filter((r) => /^\[.*\)\s┤/u.test(r) || /^\[.*\]\s┤/u.test(r)).length)
      .toBeGreaterThan(3); // cells-ok — a bin count
    expect(rows.join("\n")).not.toContain("·");
  });
});

describe("HS6 (C12 I42): a grouped bar's columns take their series' colour", () => {
  it("a vertical grouped chart uses as many colours as it has series", () => {
    const lines = kit().renderToLines(block({
      kind: "plot", id: "hs6", form: "bar", height: 10, axes: true, orientation: "vertical",
      layout: "grouped", categories: ["a", "b", "c"],
      series: [{ values: [3, 6, 9], label: "x" }, { values: [4, 7, 2], label: "y" }],
    }), 60);
    const colours = new Set<string>();
    for (const l of lines) for (const m of l.matchAll(/38;2;(\d+;\d+;\d+)m/gu)) colours.add(m[1]!);
    // **Exactly the series count, and `>= 3` was the weak form.** Six bands
    // coloured by their own index give *more* colours, not fewer, so *at least
    // three* passes against the defect it was written for. Two series and the
    // frame's own muted tone is three, and no more.
    expect(colours.size).toBe(3); // cells-ok — a colour count
  });
});

describe("HS7 (C12 I42): a plain bar no longer drops its second series", () => {
  it("two series with no layout are spread rather than one being drawn", () => {
    const rows = kit().renderToLines(block({
      kind: "plot", id: "hs7", form: "bar", height: 6, axes: true, categories: ["a", "b", "c"],
      series: [{ values: [10, 20, 30], label: "first" }, { values: [15, 25, 35], label: "second" }],
    }), 44).map(plain);
    // Six rows of data, not three: every (category, series) pair has one.
    expect(rows.filter((r) => r.includes("┤")).length).toBe(6); // cells-ok — a row count
    expect(rows.join("\n")).toContain("second");
  });
});

describe("HS8 (C12 I8): a category past the last row is named, never dropped", () => {
  // **A bell rather than a uniform, because the strategy is what makes the bins**
  // and Freedman–Diaconis scales its width by the IQR. A uniform 200 samples
  // gives **six** bins — fewer than the eight rows below — so the first draft of
  // this row asserted a state it had not constructed. Summed uniforms give 13.
  const data = Array.from({ length: 200 }, (_v, i) => { // cells-ok — a sample count
    let acc = 0;
    for (let k = 1; k <= 4; k += 1) acc += ((i * (7 * k + 3)) % 29) / 29;
    return 10 + acc * 20;
  });

  it("a histogram whose bins outnumber its rows says how many it withheld", () => {
    // **The measured case, and it is the corpus'** (F319). Two hundred samples
    // under Freedman–Diaconis give eleven bins; the block declares eight rows.
    // The old arm drew the first eight and stopped, so the frame read as a
    // clean unimodal distribution that had ended — with **39 of 200 samples**,
    // the whole right tail, absent and unmentioned.
    const rows = kit().renderToLines(block({
      kind: "plot", id: "hs8", form: "histogram", height: 8, axes: true,
      binning: "freedman-diaconis", series: [{ values: data, label: "s" }],
    }), 80).map(plain);
    const bins = binValues([data], "freedman-diaconis").counts[0]!.length; // cells-ok — a bin count
    expect(bins, "the strategy chose more bins than there are rows").toBeGreaterThan(8); // cells-ok — a row count
    const notice = rows.find((r) => r.includes("more"));
    expect(notice, "the withheld bins are named").toBeDefined();
    // **The count is what the reader needs and the names are the courtesy**, so
    // the assertion is on the number rather than on the list — which truncates
    // at narrow widths and would make this row about the ellipsis.
    expect(notice).toContain(`+${String(bins - 7)} more`); // cells-ok — a bin count
  });

  it("the notice costs a row rather than the declared height", () => {
    // **C12 I1 is the other half.** A notice that grew the plot would trade one
    // silent failure for another: `measure` is what a caller reserved space by,
    // and a form taller than its declaration scrolls whatever is beneath it.
    const spec = {
      kind: "plot", id: "hs8b", form: "histogram", height: 8, axes: true,
      binning: "freedman-diaconis", series: [{ values: data, label: "s" }],
    } as const;
    const short = kit().renderToLines(block(spec), 80).map(plain);
    const roomy = kit().renderToLines(block({ ...spec, id: "hs8c", height: 14 }), 80).map(plain);
    // **Counted against the declaration rather than against a total**, because
    // a total folds the furniture in and would pass for a frame that grew by a
    // row and lost one somewhere else. `area` is every row inside the border.
    const area = (rows: readonly string[]): number => rows.filter((r) => /┤|│/u.test(r)).length; // cells-ok — a row count
    expect(area(short), "eight declared, eight drawn — the notice is one of them").toBe(8); // cells-ok — a row count
    expect(short.some((r) => r.includes("more")), "and it is there").toBe(true);
    expect(area(roomy), "fourteen declared, fourteen drawn").toBe(14); // cells-ok — a row count
    expect(roomy.some((r) => r.includes("more")), "a frame with room says nothing").toBe(false);
    // The furniture is the same either way, so the two totals differ by exactly
    // the declared heights.
    expect(roomy.length - short.length).toBe(6); // cells-ok — a row count
  });
});

describe("HS9 (C12 I8): the rule is about rows, not about histograms", () => {
  it("a plain bar with more categories than rows names the rest too", () => {
    // **The subject is `categoricalForm`**, so a row keyed to the histogram
    // would be the rule tested against the one form that had the defect —
    // which is how I8 came to have two subjects honoured and a third written
    // the way it forbids.
    const cats = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const rows = kit().renderToLines(block({
      kind: "plot", id: "hs9", form: "bar", height: 5, axes: true, categories: cats,
      series: [{ values: [1, 2, 3, 4, 5, 6, 7, 8], label: "s" }],
    }), 60).map(plain);
    const notice = rows.find((r) => r.includes("more"));
    expect(notice, "a bar is short in exactly the same way").toBeDefined();
    expect(notice).toContain("+4 more");
    expect(notice).toContain("e");
    // Four categories drawn, one row spent on the notice, five declared.
    expect(rows.filter((r) => r.includes("┤")).length).toBe(4); // cells-ok — a row count
  });
});
