/**
 * YA1–YA7, YC1–YC9 and YC10–YC11: the gutter on both sides, and the callout
 * (C12 I47, I48, I122).
 *
 * **The rows follow §6c's two artefacts.** The table's cells are structural —
 * two rules that hold at rest — and the trace's are the ladder, where a rung is
 * reached only because the one above it did not fit. Both shapes are here
 * because a gutter has structure and a ladder has a sequence.
 */
import { describe, expect, it } from "vitest";
import { block } from "../../src/data/viewmodel/index.js";
import { validateBlock, validateDocument } from "../../src/data/viewmodel/validate.js";
import type { Plot } from "../../src/data/viewmodel/index.js";
import { plotToSvg, SVG_DEFAULT_LAYOUT } from "../../src/presentation/plot/svg.js";
import { DARK_THEME } from "../support/render.js";
import { b } from "../../src/shell/builders/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { FULL_CAPS, measurable } from "../support/render.js";
import { cells } from "../../src/presentation/text.js";
import { legendPlacement } from "../../src/presentation/plot/furniture.js";

const kit = (caps = FULL_CAPS) => measurable({ definitions: [plotDefinition], capabilities: caps });
const plain = (l: string): string => l.replace(/\x1b\[[0-9;]*m/gu, "");
const MONO_CAPS = { ...FULL_CAPS, colourDepth: 1 as const };

const wave = (n: number, k = 1): number[] =>
  Array.from({ length: n }, (_v, i) => 50 + 40 * Math.sin((i / n) * Math.PI * 2 * k)); // cells-ok — a sample count

function rows(extra: object, w = 60, caps = FULL_CAPS): readonly string[] {
  return kit(caps).renderToLines(block({
    kind: "plot", id: "ya", form: "line", height: 8, axes: true, legend: false,
    series: [{ values: wave(40), label: "alpha" }], ...extra,
  }), w);
}
const bare = (extra: object, w = 60, caps = FULL_CAPS): string[] => rows(extra, w, caps).map(plain);

/** Everything left of the first edge glyph, and everything right of the last. */
const EDGE = /[│┤├┣]/u;
function gutters(row: string): { left: string; right: string } {
  const first = row.search(EDGE);
  const last = row.split("").reduce((m, c, i) => (EDGE.test(c) ? i : m), -1); // cells-ok — a column index
  if (first < 0) return { left: "", right: "" };
  return { left: row.slice(0, first).trim(), right: last > first ? row.slice(last + 1).trim() : "" };
}
const areaRowsOf = (r: readonly string[]): string[] => r.filter((l) => EDGE.test(l));

describe("YA1 (C12 I47): `both` renders one set of labels on two sides", () => {
  it("the left and right readings are equal, row for row", () => {
    const area = areaRowsOf(bare({ yAxis: "both" })).map(gutters);
    // **Equality of the two sets, not each being correct on its own.** A second
    // `yLabels` call would satisfy a per-side assertion and could still disagree
    // about a precision or a row; only the pair can say it did not.
    expect(area.map((g) => g.left)).toEqual(area.map((g) => g.right));
    expect(area.filter((g) => g.left !== "").length).toBeGreaterThan(1);
  });
});

describe("YA2 (C12 I47): `right` moves the labels rather than copying them", () => {
  it("no left readings, and the same strings on the right at the same rows", () => {
    const left = areaRowsOf(bare({})).map(gutters);
    const right = areaRowsOf(bare({ yAxis: "right" })).map(gutters);
    expect(right.every((g) => g.left === "")).toBe(true);
    expect(right.map((g) => g.right)).toEqual(left.map((g) => g.left));
  });

});

describe("YA2b (C12 I47): the tick belongs to the side that draws the label", () => {
  it("the left edge carries no tick, because there is nothing for one to join", () => {
    // **The gutter's *content* is empty either way**, so the row above passes
    // against a left border still drawing `┤` — which the mutation pass is what
    // said. A tick joins a label to its axis; with the label on the other side
    // the stub points out at a column zero cells wide.
    const area = areaRowsOf(bare({ yAxis: "right" }));
    expect(area.every((r) => r[r.search(EDGE)] === "│")).toBe(true);
    // The fixture responds: the same rows *do* carry ticks with the axis left.
    expect(areaRowsOf(bare({})).some((r) => r[r.search(EDGE)] === "┤")).toBe(true);
  });
});

describe("YA2 (C12 I47): `right` shifts the plot area", () => {
  it("the plot area starts further left", () => {
    const at = (extra: object): number => areaRowsOf(bare(extra))[0]!.search(EDGE);
    expect(at({ yAxis: "right" })).toBeLessThan(at({}));
  });
});

describe("YA3 (C12 I47, I1): the mirror costs width and never a row", () => {
  it("every yAxis value renders the same row count", () => {
    const counts = (["left", "right", "both", false] as const).map((yAxis) => bare({ yAxis }).length);
    expect(new Set(counts).size).toBe(1);
  });
});

describe("YA4 (C12 I47, §3f): both columns are straight at `wide`", () => {
  it("an ambiguous-width row label keeps both borders in one column", () => {
    // `café` is Ambiguous, so a terminal reporting `wide` measures it at five
    // cells and a default measurement at four — the exact drift §3f names, now
    // reachable on two gutters instead of one.
    //
    // **The other two labels are short on purpose.** They were `beta` and `gamma`
    // and the row could not fail: `gamma` is five code units, so a width measured
    // in code units returned the same 5 as one measured in cells and the frame
    // did not move. Two cells each, so `café` is strictly the widest in cells (5)
    // and strictly not in code units (4) — the only shape in which the two
    // measurements disagree about the answer rather than about one label.
    //
    // **The edges are `+` here and not `│`**, which is CS8's finding read from
    // the other side: box-drawing is Ambiguous too, so `glyphs()` hands a `wide`
    // terminal its ASCII set. A row matcher written for the unicode alphabet
    // finds nothing and passes an emptiness check.
    const wide = { ...FULL_CAPS, ambiguousWidth: "wide" as const };
    const anyEdge = /[│┤├┣|+]/u;
    const frame = kit(wide).renderToLines(block({
      kind: "plot", id: "ya", form: "bar", height: 3, axes: true, yAxis: "both",
      categories: ["café", "ab", "cd"], series: [{ values: [30, 70, 45] }],
    }), 48).map(plain).filter((l) => /^\s*\S+\s[|+]/u.test(l));
    expect(frame.length).toBe(3);
    // **Cell columns, not string indices** (F665's second half). This row measured
    // `search()` and `reduce()` over code units, and a label whose drift it exists
    // to catch is exactly a label whose cell count and character count differ:
    // `café` is five cells in four characters at `wide`, so the correctly aligned
    // frame reports edges at string 5 and string 6 and the row fails while every
    // edge sits at cell 6. It passed before only because `é` measured 1, which is
    // the same reason the row could not see the drift it names — vacuous in one
    // direction and wrong in the other, from one missing width.
    const columnsOf = (row: string, pick: (hits: number[]) => number): number => {
      const hits: number[] = [];
      let column = 0;
      for (const ch of row) {
        if (anyEdge.test(ch)) hits.push(column);
        column += cells(ch, wide.ambiguousWidth); // cells-ok — a cell column, which is the subject
      }
      return hits.length === 0 ? -1 : pick(hits);
    };
    const firsts = new Set(frame.map((r) => columnsOf(r, (h) => h[0] ?? -1)));
    const lasts = new Set(frame.map((r) => columnsOf(r, (h) => h[h.length - 1] ?? -1)));
    expect(firsts.size, "one left edge column").toBe(1);
    expect(lasts.size, "one right edge column").toBe(1);

    // **And *which* column, from a literal** — because one column is satisfied by
    // every uniformly wrong width. Measured with `labelColumnWidth` mutated to
    // count code units: the edges stayed in one column and moved together, so
    // both assertions above passed with the defect in. `café` is the widest label
    // at five cells — c·a·f are one each and `é` is two under `wide` — and the
    // gutter is one, so the left edge is at cell 6. The number is written out
    // rather than computed from `cells()`, which is the function under suspicion.
    expect([...firsts][0], "café is 5 cells at wide, plus one gutter").toBe(6);
  });
});

describe("YA5 (C12 I47, I27): the legend sits outside the axis", () => {
  it("`both` with a right legend puts the swatch past the right edge glyph", () => {
    const frame = bare({
      yAxis: "both", legend: "right",
      series: [{ values: wave(40), label: "alpha" }, { values: wave(40, 2), label: "beta" }],
    }, 72);
    const withBoth = frame.find((r) => EDGE.test(r) && r.includes("alpha"));
    expect(withBoth).toBeDefined();
    const last = withBoth!.split("").reduce((m, c, i) => (EDGE.test(c) ? i : m), -1);
    expect(withBoth!.indexOf("alpha")).toBeGreaterThan(last);
  });
});

describe("YA6 (C12 I47, §6c.2): the right column is dropped before the left", () => {
  it("there is a width where `left` is labelled and `both` is left-only", () => {
    const labelled = (extra: object, w: number): { left: boolean; right: boolean } => {
      const g = areaRowsOf(bare(extra, w)).map(gutters);
      return { left: g.some((x) => x.left !== ""), right: g.some((x) => x.right !== "") };
    };
    // The rung, found by sweeping rather than asserted at a width this fixture
    // happens to reach — the ladder's thresholds move with the label's own width.
    const widths = Array.from({ length: 40 }, (_v, i) => i + 8); // cells-ok — a cell width
    const rung = widths.find((w) => labelled({}, w).left && !labelled({ yAxis: "both" }, w).right);
    expect(rung).toBeDefined();
    expect(labelled({ yAxis: "both" }, rung!).left).toBe(true);
    // And it recovers: some wider width carries both.
    expect(widths.some((w) => w > rung! && labelled({ yAxis: "both" }, w).right)).toBe(true);
  });
});

describe("YA7 (C12 I47, I18, I26): the mirror takes the left gutter's shape, not its glyphs", () => {
  it("a heatmap's row names mirror", () => {
    const frame = kit().renderToLines(block({
      kind: "plot", id: "ya", form: "heatmap", height: 3, axes: true, yAxis: "both",
      series: [
        { values: [1, 2, 3, 4], label: "one" },
        { values: [4, 3, 2, 1], label: "two" },
        { values: [2, 2, 2, 2], label: "three" },
      ],
    }), 48).map(plain).filter((r) => EDGE.test(r));
    expect(frame.map((r) => gutters(r).right)).toEqual(["one", "two", "three"]);
  });

  it("`rule` draws the right label and no edge beside it", () => {
    // The cell mirroring the glyph would get wrong: `"rule"` is a left rule and
    // a bottom rule and *no right one*, which is what the style is.
    const frame = bare({ yAxis: "both", plotFrame: "rule" }).filter((r) => EDGE.test(r));
    const top = frame.find((r) => r.trimEnd().endsWith("100"));
    expect(top).toBeDefined();
    expect(top).toMatch(/\s100\s*$/u);
    expect(top!.slice(top!.search(EDGE) + 1)).not.toMatch(EDGE);
  });
});

// --- the callout -------------------------------------------------------------

const CALLOUT = /[┣#]/u;
const calloutRows = (r: readonly string[]): number[] =>
  r.map((l, i) => (CALLOUT.test(l) ? i : -1)).filter((i) => i >= 0); // cells-ok — a row index

describe("YC1 (C12 I48): one callout per series, at that series' own row", () => {
  it("three series ending on three rows give three callouts", () => {
    const three = [
      { values: wave(40), label: "alpha" },
      { values: wave(40).map((v) => 100 - v), label: "beta" },
      { values: wave(40, 0.2), label: "gamma" },
    ];
    const frame = bare({ yAxis: "both", yCallout: "last", series: three });
    const marks = calloutRows(frame);
    // A rule keying every callout to one row passes nothing here.
    expect(marks.length).toBe(3);
    expect(new Set(marks).size).toBe(3);
    const texts = marks.map((i) => gutters(frame[i]!).right);
    expect(texts).toEqual(expect.arrayContaining(["43.74", "56.26", "87.64"]));
  });

  it("each is drawn in its own series' colour", () => {
    const styled = rows({
      yAxis: "both", yCallout: "last",
      series: [
        { values: wave(40), label: "alpha" },
        { values: wave(40).map((v) => 100 - v), label: "beta" },
      ],
    }).filter((r) => CALLOUT.test(plain(r)));
    const colours = styled.map((r) => /\x1b\[[0-9;]*m(?=[^\x1b]*\d)/gu.exec(r.split(/[┣]/u)[1] ?? "")?.[0]);
    expect(new Set(colours.filter(Boolean)).size).toBe(2);
  });
});

describe("YC2 (C12 I48, I37): the callout's row is the row of the ink", () => {
  // At height 8 the braille rasteriser folds four dot rows to a cell, and
  // `rowOf(v, range, 8)` disagrees with `⌊rowOf(v, range, 32) ÷ 4⌋` for about
  // one value in six. 7.2 of 0..100 is inside that band: the ink is on area
  // row 7 and the cell-resolution answer is 6.
  //
  // **`plotStyle: "braille"` is the fixture responding, and the default is the
  // other mapping.** A `line` renders through `lineDrawRows` by default, which
  // maps at cell resolution — so this row written without the style asserts
  // against the arithmetic it is trying to rule out, and agrees with it.
  const tail = [...wave(39), 7.2];
  const pinned = { yMin: 0, yMax: 100, plotStyle: "braille" as const, series: [{ values: tail }] };

  it("the fixture responds: the descending stroke ends on area row 7", () => {
    // **Rendered in the layout the callout will use**, not a narrower one: the
    // area width decides which samples share the last column, so an ink check
    // taken without the right gutter is about a different final column.
    const area = bare({ ...pinned, yAxis: "both", yCallout: "last" }).filter((r) => EDGE.test(r));
    const lastCell = (r: string): string => {
      const first = r.search(EDGE);
      const last = r.split("").reduce((m, c, i) => (EDGE.test(c) ? i : m), -1); // cells-ok — a column index
      return [...r.slice(first + 1, last)].at(-1) ?? " ";
    };
    const inked = area.map((r, i) => (/[\u2801-\u28ff]/u.test(lastCell(r)) ? i : -1)).filter((i) => i >= 0);
    // Two rows: the sample's own dot and the tail of the line that reached it.
    expect(inked).toEqual([6, 7]);
  });

  it("and the callout is there, not on the cell-resolution row", () => {
    const area = bare({ ...pinned, yAxis: "both", yCallout: "last" }).filter((r) => EDGE.test(r));
    expect(calloutRows(area)).toEqual([7]);
  });
});

describe("YC3 (C12 I48): a callout takes the right gutter and leaves the left tick", () => {
  it("the row carrying a callout still carries its left reading", () => {
    // 100 is a tick row and the top of the range, so a series ending there puts
    // both on one row — which is the only way to see which gutter each rule owns.
    const frame = bare({
      yAxis: "both", yCallout: "last", yMin: 0, yMax: 100,
      series: [{ values: [...wave(39), 100], label: "alpha" }],
    }).filter((r) => EDGE.test(r));
    const row = frame[calloutRows(frame)[0]!]!;
    expect(gutters(row).left).toBe("100");
    expect(gutters(row).right).toBe("100");
    expect(row).toMatch(/┤/u);
  });
});

describe("YC4 (C12 I48, I8): two callouts on a row — the later wins and says so", () => {
  it("one number and a `+`, not two rows and not a silence", () => {
    const same = [
      { values: [...wave(39), 60], label: "alpha" },
      { values: [...wave(39, 2), 60], label: "beta" },
    ];
    const frame = bare({ yAxis: "both", yCallout: "last", yMin: 0, yMax: 100, series: same })
      .filter((r) => EDGE.test(r));
    const marks = calloutRows(frame);
    expect(marks.length).toBe(1);
    expect(gutters(frame[marks[0]!]!).right).toBe("60+");
  });
});

describe("YC5 (C12 I48, I1): the callout costs width and never a row", () => {
  it("the row count is the same on and off", () => {
    const on = bare({ yAxis: "both", yCallout: "last" }).length;
    const off = bare({ yAxis: "both" }).length;
    expect(on).toBe(off);
  });
});

describe("YC6 (C12 I48): the value goes through formatReadout", () => {
  it("yFormat reaches the callout", () => {
    // Asserted on a *formatted* reading rather than on a number: a bare-number
    // assertion agrees with a renderer that ignores `yFormat` entirely, which
    // is F175's class and the reason CS7 is written the way it is.
    //
    // `fraction` and not `percent` — T1.12b's own pair. `percent` says the value
    // *is* a percentage, so `0.84` reads `0.8%`; `fraction` says it is a share
    // of one, which is what a 0..1 domain means.
    const frame = bare({
      yAxis: "both", yCallout: "last", yFormat: "fraction", yMin: 0, yMax: 1,
      series: [{ values: [0.1, 0.4, 0.84] }],
    }).filter((r) => EDGE.test(r));
    // `formatReadout`'s answer, which is not `formatValue`'s: T1.12b's `84%` is
    // the *label* path, and CS7b's rule for a lone reading keeps the digit the
    // producer sent rather than fixing a precision.
    expect(gutters(frame[calloutRows(frame)[0]!]!).right).toBe("84.0%");
  });
});

describe("YC7 (C12 I47, I48, C04 I60): the refusals, at both gates", () => {
  const doc = (plot: object): readonly string[] => {
    const r = validateDocument({
      version: 1,
      blocks: [{ kind: "plot", id: "p", form: "line", series: [{ values: [1, 2] }], height: 4, ...plot }],
    });
    // **Only this rule's errors.** The envelope is deliberately minimal, so the
    // document also fails its schema row — and a converse asserted on *no
    // errors at all* would fail for a reason that has nothing to do with the
    // axis.
    return r.ok ? [] : r.error.filter((m) => /yAxis|yCallout|ordinate|gutter|curve/u.test(m));
  };
  const built = (plot: object): string | null => {
    try { b.plot({ series: [{ values: [1, 2] }], height: 4, ...plot } as never); return null; }
    catch (e) { return String(e); }
  };

  it("a callout with no right gutter", () => {
    expect(doc({ yCallout: "last" }).join()).toMatch(/right gutter and there is none/u);
    expect(built({ yCallout: "last" })).toMatch(/right gutter and there is none/u);
    expect(doc({ yCallout: "last", yAxis: "right" })).toEqual([]);
    expect(built({ yCallout: "last", yAxis: "right" })).toBeNull();
  });

  it("a callout on a form with no per-series curve", () => {
    const bar = { form: "bar", categories: ["a", "b"], yAxis: "right" as const, yCallout: "last" as const };
    expect(doc(bar).join()).toMatch(/no per-series curve/u);
    expect(built(bar)).toMatch(/no per-series curve/u);
  });

  it("a moved axis on a form with no gutter", () => {
    expect(doc({ form: "pie", yAxis: "both" }).join()).toMatch(/draws no y gutter/u);
    expect(built({ form: "pie", yAxis: "both" })).toMatch(/draws no y gutter/u);
    expect(doc({ form: "pie" })).toEqual([]);
  });

  it("`false` on a matrix, whose row labels are its ordinate", () => {
    const heat = { form: "heatmap", axes: true, yAxis: false as const };
    expect(doc(heat).join()).toMatch(/a row label is the ordinate/u);
    expect(built(heat)).toMatch(/a row label is the ordinate/u);
    expect(doc({ form: "heatmap", axes: true, yAxis: "both" as const })).toEqual([]);
  });

  it("the union itself", () => {
    expect(doc({ yAxis: "middle" }).join()).toMatch(/"yAxis" must be/u);
    expect(doc({ yCallout: "first" }).join()).toMatch(/"yCallout" must be/u);
  });
});

describe("YC8 (C12 I48, I25): at one bit the carrier is a mark", () => {
  it("a callout row differs from a tick row on the colour-stripped frame", () => {
    // At `colourDepth: 1` a series slot resolves through `MONO`, where
    // `emphasised` *is* `{ bold: true }` — so weight cannot be the channel that
    // separates a callout from the series it names. Asserted with colour
    // stripped, which is what makes it a claim about the mark.
    const frame = bare({ yAxis: "both", yCallout: "last" }, 60, MONO_CAPS).filter((r) => EDGE.test(r));
    const marks = calloutRows(frame);
    expect(marks.length).toBe(1);
    const ticks = frame.filter((r) => /┤/u.test(r) && !CALLOUT.test(r));
    expect(ticks.length).toBeGreaterThan(0);
    expect(frame[marks[0]!]).toMatch(/┣/u);
  });

});

describe("YC8b (C12 I48): the arm below the colour floor, not only the mark", () => {
  it("the stacked arm keeps its callouts", () => {
    // **The arm, not the mark.** Above one series at `colourDepth: 1`
    // `positionalForm` stops overlaying and stacks into labelled strips, so a
    // callout map built only in the overlaid arm accepts `yCallout` and draws
    // nothing on exactly the terminals where a reader most needs the number
    // spelled out. The row above calls the mechanism and passes on the day
    // nothing calls it.
    const frame = bare({
      yAxis: "both", yCallout: "last", yMin: 0, yMax: 100,
      series: [
        { values: [...wave(39), 20], label: "alpha" },
        { values: [...wave(39, 2), 80], label: "beta" },
      ],
    }, 60, MONO_CAPS).filter((r) => EDGE.test(r));
    // The fixture responds: it really did stack, so the gutter holds names.
    expect(frame.some((r) => gutters(r).left === "alpha")).toBe(true);
    expect(frame.some((r) => gutters(r).left === "beta")).toBe(true);
    const marks = calloutRows(frame);
    expect(marks.length).toBe(2);
    expect(marks.map((i) => gutters(frame[i]!).right)).toEqual(["20", "80"]);
  });
});

describe("YC8 (C12 I48, I25): ASCII has a mark for it too", () => {
  it("the callout tick is `#` where every junction is `+`", () => {
    const ascii = { ...FULL_CAPS, unicode: "ascii" as const, colourDepth: 1 as const };
    const frame = bare({ yAxis: "both", yCallout: "last" }, 60, ascii).filter((r) => /[|+#]/u.test(r));
    expect(frame.some((r) => r.includes("#"))).toBe(true);
  });
});

describe("YC9 (C12 I48, I4): a trailing gap names the last finite sample", () => {
  it("the callout is the last value drawn, on the ink that drew it", () => {
    const withGap = [...wave(38), 22, null];
    const noGap = [...wave(38), 22];
    const g = bare({ yAxis: "both", yCallout: "last", yMin: 0, yMax: 100, series: [{ values: withGap }] })
      .filter((r) => EDGE.test(r));
    const n = bare({ yAxis: "both", yCallout: "last", yMin: 0, yMax: 100, series: [{ values: noGap }] })
      .filter((r) => EDGE.test(r));
    expect(gutters(g[calloutRows(g)[0]!]!).right).toBe("22");
    expect(calloutRows(g)).toEqual(calloutRows(n));
  });
});

/**
 * TL1–TL3: the same anchor carrying a name (C12 I55, §3ag).
 *
 * **`"name"` and `"both"` are asserted against `"last"` rather than against a
 * fixed row**, because the claim is that they are one mechanism: a row set that
 * agreed with a hand-written expectation and disagreed with `"last"` would be
 * two mechanisms that happen to land together on this fixture.
 */
describe("TL1 (C12 I55): a name takes the value's anchor, not its own", () => {
  it("the callout rows are identical for `last`, `name` and `both`, at eight heights", () => {
    for (const height of [4, 5, 6, 8, 10, 12, 16, 20]) {
      const at = (yCallout: string): number[] =>
        calloutRows(bare({ height, yAxis: "both", yCallout, series: [
          { values: wave(40), label: "alpha" },
        ] }).filter((r) => EDGE.test(r)));
      const last = at("last");
      // The fixture responds: there is something to compare at every height.
      expect(last.length, `height ${String(height)}`).toBeGreaterThan(0);
      expect(at("name"), `height ${String(height)}`).toEqual(last);
      expect(at("both"), `height ${String(height)}`).toEqual(last);
    }
  });
});

describe("TL2 (C12 I55): `both` writes the pair, and a shared row still says so", () => {
  it("the name leads and the number ends the string", () => {
    const frame = bare({ yAxis: "both", yCallout: "both", series: [
      { values: wave(40), label: "alpha" },
    ] }).filter((r) => EDGE.test(r));
    const text = gutters(frame[calloutRows(frame)[0]!]!).right;
    expect(text).toMatch(/^alpha /u);
    expect(text).toMatch(/[\d.]+$/u);
  });

  it("two series ending on one row give the later, plus a one-cell `+` (C12 I48)", () => {
    // Two series with identical values end on the same row by construction, so
    // the collision is the fixture rather than an accident of the sampling.
    const same = wave(40);
    const frame = bare({
      height: 6, yAxis: "both", yCallout: "both", yMin: 0, yMax: 100,
      series: [{ values: same, label: "alpha" }, { values: same, label: "beta" }],
    }).filter((r) => EDGE.test(r));
    const marks = calloutRows(frame);
    expect(marks.length).toBe(1);
    const text = gutters(frame[marks[0]!]!).right;
    expect(text).toMatch(/^beta /u);
    expect(text.endsWith("+")).toBe(true);
    // **Not `+N`** — the count is what C12 I48 refused, because it cannot be
    // sized before the column it is being sized for (§3ag.4).
    expect(text).not.toMatch(/\+\d/u);
  });
});

describe("TL3 (C12 I55): a name at the line's end is the legend, and `last` is not", () => {
  const twoSeries = [
    { values: wave(40), label: "alpha" },
    { values: wave(40).map((v) => 100 - v), label: "beta" },
  ];
  const drawn = (extra: object): string[] =>
    kit().renderToLines(block({
      kind: "plot", id: "tl3", form: "line", height: 8, axes: true,
      yAxis: "both", series: twoSeries, ...extra,
    }), 60).map(plain);
  const hasSwatchFor = (rowsIn: readonly string[]): boolean =>
    rowsIn.some((r) => gutters(r).right.includes("alpha"));

  it("`last` keeps the automatic legend — it names a value, not an identity", () => {
    expect(hasSwatchFor(drawn({ yCallout: "last" }))).toBe(true);
  });

  it("`name` and `both` suppress it, because the identity is already on the line", () => {
    for (const yCallout of ["name", "both"] as const) {
      const b0 = block({
        kind: "plot", id: "tl3", form: "line", height: 8, axes: true,
        yAxis: "both", series: twoSeries, yCallout,
      });
      // **The rule and the frame, because neither alone is the claim.** The
      // placement asserts what was decided; the frame asserts that the decision
      // reached the render — a seam-level row passes on the day nothing calls it.
      expect(legendPlacement(b0 as Parameters<typeof legendPlacement>[0], FULL_CAPS), yCallout)
        .toBeNull();
      const frame = drawn({ yCallout });
      expect(frame.join("\n"), yCallout).toContain("alpha");
      expect(calloutRows(frame.filter((r) => EDGE.test(r))).length, yCallout).toBeGreaterThan(0);
    }
  });

  it("`last` is not suppressed at the rule, which is where the two arms part", () => {
    const b0 = block({
      kind: "plot", id: "tl3", form: "line", height: 8, axes: true,
      yAxis: "both", series: twoSeries, yCallout: "last",
    });
    expect(legendPlacement(b0 as Parameters<typeof legendPlacement>[0], FULL_CAPS)).toBe("right");
  });

  it("an explicit `legend` still draws, exactly as it does for the 1-bit strips", () => {
    const frame = drawn({ yCallout: "name", legend: "right" });
    expect(frame.join("\n")).toContain("beta");
    // **The width is the observable**: an explicit legend takes columns the
    // suppressed one does not, so the two frames cannot be the same shape.
    expect(frame.join("\n")).not.toBe(drawn({ yCallout: "name" }).join("\n"));
  });
});

/**
 * TL4–TL5: the two survivors, and both were findings about the tests.
 *
 * **C04 I60's `yCallout` refusals had no row at all.** Reverting `DRAWS` to
 * `yc !== "last"` killed nothing, because nothing anywhere asserted that a
 * callout is refused on a form with no curve to end or with no right gutter to
 * write in — so the widening this commit made was untestable and the rule it
 * widened was untested.
 */
describe("TL4 (C12 I55, C04 I60): every drawing arm reaches the refusals", () => {
  const errs = (plot: object): readonly string[] => {
    const r = validateDocument({
      version: 1,
      blocks: [{ kind: "plot", id: "p", form: "line", series: [{ values: [1, 2] }], height: 4, ...plot }],
    });
    return r.ok ? [] : r.error.filter((m) => /yCallout/u.test(m));
  };

  it("no right gutter refuses `last`, `name` and `both` alike", () => {
    for (const yCallout of ["last", "name", "both"] as const) {
      expect(errs({ yCallout }), yCallout).not.toEqual([]);
      expect(errs({ yCallout }).join(" "), yCallout).toContain(yCallout);
    }
    // The fixture responds: the same block with a right gutter passes the rule.
    for (const yCallout of ["last", "name", "both"] as const) {
      expect(errs({ yCallout, yAxis: "both" }), yCallout).toEqual([]);
    }
  });

  it("a form with no per-series curve refuses all three", () => {
    for (const yCallout of ["last", "name", "both"] as const) {
      const e = errs({ form: "treemap", yAxis: "both", yCallout });
      expect(e.join(" "), yCallout).toMatch(/no per-series curve/u);
    }
  });

  it("`none` and absent are refused by neither", () => {
    expect(errs({ yCallout: "none" })).toEqual([]);
    expect(errs({})).toEqual([]);
  });

  it("an unknown value is named with all four", () => {
    expect(errs({ yCallout: "end" }).join(" ")).toContain('"none", "last", "name" or "both"');
  });
});

describe("TL5 (C12 I55, C12 I25): an unlabelled series is named, never blank", () => {
  it("two unlabelled series take the legend's own wording", () => {
    // **C12 I25 in the gutter rather than in the swatch.** Two blank callouts
    // are told apart by colour alone, which is the rule's whole subject — and
    // the legend already answers it with `series N`, so a second answer here
    // would be a second vocabulary for one fact.
    const same = wave(40);
    const frame = bare({
      height: 6, yAxis: "both", yCallout: "name", yMin: 0, yMax: 100,
      series: [{ values: same }, { values: same.map((v) => 100 - v) }],
    }).filter((r) => EDGE.test(r));
    const texts = calloutRows(frame).map((i) => gutters(frame[i]!).right);
    expect(texts.length).toBe(2);
    for (const t of texts) expect(t).not.toBe("");
    expect(new Set(texts).size).toBe(2);
  });
});

describe("TL6 (C12 I55, C12 I6): below the colour floor the strips already say the name", () => {
  const two = [
    { values: wave(40), label: "alpha" },
    { values: wave(40).map((v) => 100 - v), label: "beta" },
  ];
  const at = (yCallout: string): string[] =>
    bare({ height: 8, yAxis: "both", yCallout, series: two }, 60, MONO_CAPS)
      .filter((r) => EDGE.test(r));

  it("`name` writes no callout, because the gutter already holds it twice", () => {
    // **Found by reading the frame and by nothing else.** The positional family
    // stacks below the colour floor and `stackedRows` writes each name in the y
    // gutter; C12 I47 then mirrors that name to the right. A name callout was
    // the third copy on the same row.
    const rowsIn = at("name");
    expect(calloutRows(rowsIn)).toEqual([]);
    // The fixture responds twice over: the names are present from the strips,
    // and the same block above the colour floor does draw callouts.
    expect(rowsIn.join("\n")).toContain("alpha");
    expect(calloutRows(bare({ height: 8, yAxis: "both", yCallout: "name", series: two })
      .filter((r) => EDGE.test(r))).length).toBeGreaterThan(0);
  });

  it("`both` degrades to the value, which is the one thing the strips do not say", () => {
    const both = at("both");
    const last = at("last");
    expect(calloutRows(both)).toEqual(calloutRows(last));
    for (const i of calloutRows(both)) {
      expect(gutters(both[i]!).right).toBe(gutters(last[i]!).right);
    }
    // And it is a number, not a name — or the equality above would hold with
    // both arms writing the same wrong thing.
    expect(gutters(both[calloutRows(both)[0]!]!).right).toMatch(/^[\d.]+$/u);
  });
});

describe("YC10 (C12 I122): a callout draws with or without a right axis, and both arms agree", () => {
  // **The member's whole product, both arms** (F994, §3ak.50h). 9 of the 15
  // cells disagreed: every `yAxis` that is not `"right"` or `"both"` — the
  // default included — drew the callout in the SVG and nothing in the terminal,
  // because `definition.ts` gated the whole right-column maximum on
  // `sides.right` where `rightRoom` has always gated only the labels' half.
  const AXES = [undefined, false, "left", "right", "both"] as const;
  const CALLS = ["last", "name", "both"] as const;
  const WANT = { last: "10", name: "alpha", both: "alpha 10" } as const;

  const plot = (ya: (typeof AXES)[number], yc: (typeof CALLS)[number]): Plot =>
    block({
      kind: "plot", id: "yc10", form: "line", height: 6, axes: true, legend: false,
      yFormat: "number", series: [{ label: "alpha", values: [2, 6, 4, 10] }],
      ...(ya === undefined ? {} : { yAxis: ya }), yCallout: yc,
    }) as Plot;

  /**
   * **Read positionally, past the plot area's right edge.** `10` is also this
   * figure's top axis label, so a substring test over the frame reports a
   * callout wherever the scale happens to name the same number — the first
   * form of this row did exactly that and called three cells agreeing.
   */
  const terminalCallout = (p: Plot, want: string): boolean =>
    kit().renderToLines(p, 30).map(plain).some((r) => {
      const last = [...r].reduce((m, c, i) => (/[│┤├┣┐┘]/u.test(c) ? i : m), -1); // cells-ok — a column index
      return last >= 0 && r.slice(last + 1).includes(want);
    });

  const svgCallout = (p: Plot, want: string): boolean =>
    [...(plotToSvg(p, DARK_THEME, SVG_DEFAULT_LAYOUT) ?? "").matchAll(/<text\s[^>]*>([^<]*)<\/text>/gu)]
      .some((m) => m[1] === want);

  it("all fifteen cells, and the arms answer alike in every one", () => {
    const disagree: string[] = [];
    for (const ya of AXES) {
      for (const yc of CALLS) {
        const p = plot(ya, yc);
        const t = terminalCallout(p, WANT[yc]);
        const s = svgCallout(p, WANT[yc]);
        if (t !== s) disagree.push(`yAxis ${String(ya)} · yCallout ${yc}: terminal ${String(t)}, svg ${String(s)}`);
        // Not merely equal: both must actually draw it, or a renderer that drew
        // no callouts anywhere would satisfy the comparison in all fifteen.
        if (!t || !s) disagree.push(`yAxis ${String(ya)} · yCallout ${yc}: neither arm drew "${WANT[yc]}"`);
      }
    }
    expect(disagree, "the callout is written by both arms at every `yAxis`").toEqual([]);
  });

  it("nine of the fifteen are documents the model refuses, which YC7 asserts and this records", () => {
    // The agreement above is reachable only by handing a renderer a `Plot`
    // directly: C04 I60's fourth refusal still forbids these nine, and the day
    // it is lifted this row fails and says so.
    const refused: string[] = [];
    for (const ya of AXES) {
      for (const yc of CALLS) {
        if (validateBlock(plot(ya, yc)).ok) continue;
        refused.push(`${String(ya)}/${yc}`);
      }
    }
    expect(refused).toHaveLength(9); // cells-ok — a cell count
    expect(refused.every((r) => !r.startsWith("right") && !r.startsWith("both"))).toBe(true);
  });
});

describe("YC11 (C12 I122): a column grown for a callout alone carries no mirrored labels", () => {
  // **Found by reading the frame and by nothing else.** With the right column's
  // width the only signal, `yAxis: false` drew `├ 5` and `├ 0` down the side of
  // a plot that had switched the axis off — while every cell of YC10 reported
  // the arms agreeing.
  const right = (extra: object): readonly string[] =>
    kit().renderToLines(block({
      kind: "plot", id: "yc11", form: "line", height: 6, axes: true, legend: false,
      yFormat: "number", series: [{ label: "alpha", values: [2, 6, 4, 10] }], ...extra,
    }), 30).map(plain).map((r) => {
      const last = [...r].reduce((m, c, i) => (/[│┤├┣┐┘└]/u.test(c) ? i : m), -1); // cells-ok — a column index
      return last < 0 ? "" : r.slice(last + 1).trim();
    });

  it("`yAxis: false` writes the callout and no scale", () => {
    const gutter = right({ yAxis: false, yCallout: "both" });
    expect(gutter.filter((g) => g !== "")).toEqual(["alpha 10"]);
  });

  it("a left axis with a callout column writes no scale on the right", () => {
    // **The cell the first draft of this row did not drive, and the mutation
    // pass is what said so.** Deleting the guard — `mirrored = label` — survived
    // every assertion here, because at `yAxis: false` the row label is empty
    // anyway: the guard and its absence agree at that input, so the row was
    // asserting a rule against a state where the rule has nothing to do.
    //
    // A **left** axis makes the labels exist and a callout makes the right
    // column exist, and `rightLabels` is false — which is the only shape where
    // *a column is room rather than a request* can be violated.
    // `yCallout: "last"` writes the value alone where `"both"` carries the
    // series name with it — asserted as measured rather than as guessed, which
    // is what the first form of this assertion got wrong.
    const gutter = right({ yAxis: "left", yCallout: "last" }).filter((g) => g !== "");
    expect(gutter, "the callout alone, and no mirrored scale").toEqual(["10"]);
  });

  it("and the left column is not widened by the callout either", () => {
    // **The second survivor of the same pass, and it survived the first repair
    // too.** Widening the *left* column by `max(wanted, calloutWidth(…))`
    // survived every YA row because those fixtures declare no callout — and
    // then survived this row's own first form, which asked for `yCallout:
    // "last"` over values reaching 10. The scale there reads `10`/`5`/`0` and
    // the callout reads `10`: both two cells wide, so the maximum is the width
    // already there and the mutation has nothing to be wrong about.
    //
    // **A frame that constructs a callout is not yet a frame where a wider
    // callout can be seen.** What the row needs is a callout *wider than the
    // scale*, which is a property of the numbers and the label rather than of
    // the fields being set — a single-digit axis and an eleven-cell name
    // (C12 I47: a callout is only ever written on the right).
    const NAME = "utilisation";
    const fixture = (extra: object): string[] => kit().renderToLines(block({
      kind: "plot", id: "yc11l", form: "line", height: 6, axes: true, legend: false,
      yFormat: "number", yAxis: "left",
      series: [{ label: NAME, values: [2, 6, 4, 9] }], ...extra,
    }), 30).map(plain);
    const withCallout = fixture({ yCallout: "name" });
    const without = fixture({});

    const leftWidth = (lines: readonly string[]): number =>
      Math.max(0, ...lines.filter((l) => EDGE.test(l)).map((l) => l.search(EDGE))); // cells-ok — a column index

    // **The property this row rests on, asserted rather than assumed.** Without
    // it the row passes on a fixture where both arms agree, which is what the
    // first form did.
    expect(
      cells(NAME, FULL_CAPS.ambiguousWidth),
      "the callout has to be wider than the scale it must not size",
    ).toBeGreaterThan(leftWidth(without));
    expect(leftWidth(withCallout), "the callout is on the right, so the left is unchanged").toBe(
      leftWidth(without),
    );
    // The control: the callout did arrive, so the comparison is between two
    // frames that differ rather than two renders of the same block.
    expect(withCallout.join("\n")).toContain(NAME);
    expect(without.join("\n")).not.toContain(NAME);
    expect(leftWidth(without), "and there is a left column to widen").toBeGreaterThan(0);
  });

  it("the control: `yAxis: \"right\"` keeps its ticks beside the same callout", () => {
    const gutter = right({ yAxis: "right", yCallout: "last" }).filter((g) => g !== "");
    expect(gutter).toContain("10");
    expect(gutter.length).toBeGreaterThan(1); // cells-ok — a label count
    expect(gutter.filter((g) => g !== "10")).toEqual(["5", "0"]);
  });
});
