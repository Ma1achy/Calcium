/**
 * HS1–HS7: more than one histogram on one plot (C12 I42, §3v).
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
