/**
 * FC1–FC7 — **the curve family's figure, and the terminal reading it back**
 * (C12 I59, I61, I64, I65, §3ak.7).
 *
 * Step 3's rule is that `figureOf` is the terminal's computation **moved**, not
 * re-derived — which is what makes byte-identity a property of the extraction
 * rather than a hope, and it is gated by 1780 baseline frames rather than by
 * these rows. What these rows are for is the half a frame cannot show: that the
 * decisions the two arms now share are the ones the terminal actually
 * rasterises with, and that a member nobody reads yet still means what it says.
 */
import { describe, expect, it } from "vitest";
import {
  curveFigure,
  identityOf,
  legendSlots,
  barFigure,
  baselineOf,
  categoricalDecisions,
  distributionFigure,
  matrixFigure,
  nodesDecisions,
  positionalDecisions,
  tilesFigure,
  scatterFigure,
} from "../../src/presentation/plot/figure.js";
import { legendEntries } from "../../src/presentation/plot/furniture.js";
import { ecdfSeries } from "../../src/presentation/plot/derive.js";
import { FACING_MATRIX, rowOf } from "../../src/presentation/plot/scale.js";
import { DARK_THEME, FULL_CAPS, MONO_CAPS } from "../support/render.js";
import type { Plot } from "../../src/data/viewmodel/index.js";
import type { RenderContext } from "../../src/presentation/blocks/types.js";

const plot = (over: Partial<Plot>): Plot =>
  ({ kind: "plot", id: "p", form: "line", series: [{ values: [1, 3, 2, 5, 4] }], ...over }) as Plot;

const ctxWith = (caps: typeof FULL_CAPS): RenderContext =>
  ({ theme: DARK_THEME, capabilities: caps }) as unknown as RenderContext;

/** Every polyline point in the figure, in order, ignoring the layers. */
const pointsOf = (f: ReturnType<typeof curveFigure>, layer: string): readonly (readonly [number, number])[] =>
  f.marks.filter((d) => d.layer === layer).flatMap((d) =>
    d.mark.kind === "polyline" ? [...d.mark.points] : []);

describe("FC — the curve family's figure (C12 §3ak.7)", () => {
  it("FC1 (C12 I61): a mark's y and the terminal's row are one coordinate, with the facing applied once each side", () => {
    // **The seam's whole claim, as an assertion.** The figure carries `y`
    // uninverted on `[0, 1]`; the terminal multiplies by the last row after
    // applying the facing. If those two ever stop agreeing, the shared layer is
    // saying a position the renderer does not draw — which no frame shows,
    // because a frame that is wrong in both arms is a frame that agrees.
    const block = plot({ series: [{ values: [1, 3, 2, 5, 4] }] });
    const f = curveFigure(block);
    expect(f.value, "the block has data").not.toBeNull();
    const range = f.value!.range;
    const rows = 9;
    const pts = pointsOf(f, "series");
    expect(pts.length, "one point per finite sample").toBe(5);
    for (const [i, [, y]] of pts.entries()) {
      const v = block.series[0]!.values[i]!;
      const mine = Math.round((f.facing.y === "down" ? y : 1 - y) * (rows - 1));
      expect(rowOf(v, range, rows, f.facing), `sample ${String(i)}`).toBe(mine);
    }
    // **And the nicing is the terminal's, not the raw extent** — D1, the
    // disagreement no single decision held. The SVG rasterises against
    // `f.extent` today and must take `f.value.range` at step 4.
    expect(f.extent, "what the data spans").toEqual({ min: 1, max: 5 });
    expect(range.min, "what it is drawn against").toBeLessThanOrEqual(1);
    expect(range.max, "and it is wider, because it is niced").toBeGreaterThanOrEqual(5);
  });

  it("FC2 (C12 I4, I14): a run breaks where the samples stop being consecutive", () => {
    // `curveRows` states this as an adjacency test between dot columns; the
    // figure states it between samples, and the two must mean the same thing or
    // the SVG spans a gap the terminal breaks across.
    const f = curveFigure(plot({ series: [{ values: [1, 2, null, 4, 5] }] }));
    const runs = f.marks.filter((d) => d.layer === "series");
    expect(runs.length, "two runs, not one polyline through the hole").toBe(2);
    const lens = runs.map((d) => (d.mark.kind === "polyline" ? d.mark.points.length : -1));
    expect(lens).toEqual([2, 2]);
    // A run of one is a degenerate polyline rather than a special case — the
    // same shape `drawColumnSpan` gives a lone sample.
    const lone = curveFigure(plot({ series: [{ values: [1, null, null, null, 5] }] }));
    expect(lone.marks.filter((d) => d.layer === "series").length).toBe(2);
  });

  it("FC3 (C12 I62, §3ak.7 C8): the legend is composed once and the swatch is each arm's", () => {
    const block = plot({
      series: [{ values: [1, 2], label: "a" }, { values: [3, 4], label: "b" }],
      annotations: [{ kind: "line", value: 2, label: "target", tone: "warn" }],
    });
    const slots = legendSlots(block);
    expect(slots.map((s) => s.label), "series then annotations — `mergedRow`'s order")
      .toEqual(["a", "b", "target"]);
    expect(slots.map((s) => s.role)).toEqual(["series", "series", "annotation"]);
    expect(slots.every((s) => !("mark" in s)), "no glyph crosses the seam").toBe(true);

    // **The projection is the arm's, and it descends the ladder** (C12 I29). Same
    // slots, two capability sets, and the swatches must differ — a legend whose
    // marks do not change below the colour floor names marks the figure is not
    // drawn with.
    const full = legendEntries(block, ctxWith(FULL_CAPS));
    const mono = legendEntries(block, ctxWith(MONO_CAPS));
    expect(full.map((e) => e.label)).toEqual(slots.map((s) => s.label));
    expect(full.map((e) => e.ref), "and the slot is the figure's, not a second lookup")
      .toEqual(slots.map((s) => s.ref));
    expect(mono[0]!.mark, "1-bit gives the categories distinct marks").not.toBe(mono[1]!.mark);
    expect(full[0]!.mark, "and colour makes them uniform").toBe(full[1]!.mark);
  });

  it("FC4 (C12 I64): a refusal is a figure with no marks, and never a throw", () => {
    for (const series of [[], [{ values: [] }], [{ values: [null, null] }]]) {
      const f = curveFigure(plot({ series: series as Plot["series"] }));
      expect(f.value, "nothing was measured").toBeNull();
      expect(f.extent).toBeNull();
      expect(f.marks, "and a refusal is empty rather than an exception").toEqual([]);
    }
    // **Pinned bounds are not a reading** (§3ak.7 C7). `seriesRange` answers even
    // for an empty series once `yMin`/`yMax` are given, so the figure has an axis
    // — and whether anything was *drawn* is the marks, which is where the
    // terminal's own `hasSamples` gate lives.
    const pinned = curveFigure(plot({ series: [{ values: [] }], yMin: 0, yMax: 1 }));
    expect(pinned.value, "the bounds were declared").not.toBeNull();
    expect(pinned.marks, "and nothing was measured").toEqual([]);
  });

  it("FC5 (C12 I65): the figure describes the block that is drawn, not the one that was written", () => {
    // `ecdf` and `density` derive their series, and the derivation is above both
    // arms — so a caller hands over the derived block and the figure is about
    // that. Handing over the author's block gives a figure about the samples,
    // which is exactly the chart the second arm was drawing (F268).
    // `height` is set because `ticksFor(plotAreaRows(block))` is the tick count,
    // and an undeclared height is one row and therefore two ticks — which would
    // make the gutter assertion below true for a reason that is not the point.
    const authored = plot({ form: "ecdf", height: 8, series: [{ values: [5, 1, 4, 2, 3] }] });
    const drawn = { ...authored, series: authored.series.map((s) => ecdfSeries(s)), yMin: 0, yMax: 1 };
    expect(curveFigure(authored).extent, "the samples").toEqual({ min: 1, max: 5 });
    expect(curveFigure(drawn).extent, "the cumulative fractions").toEqual({ min: 0, max: 1 });
    expect(curveFigure(drawn).value!.labels, "and the gutter is the fraction axis")
      .toEqual(["0.0", "0.5", "1.0"]);
  });

  it("FC6 (C12 I59): the decisions are one computation and the marks are the family's", () => {
    // `positionalForm` draws three families and they differ only in what is drawn
    // at a point. Splitting the decisions out is what stops a caller holding a
    // figure whose marks belong to another family — internally consistent, past
    // every assertion about the decisions, and a different chart.
    const block = plot({ segments: [{ label: "up", value: 1 }, { label: "down", value: 2 }] });
    const d = positionalDecisions(block);
    const f = curveFigure(block);
    expect(Object.keys(d).sort(), "everything but the marks").toEqual(
      ["extent", "facing", "frame", "identity", "legend", "orientation", "value"],
    );
    for (const k of Object.keys(d) as (keyof typeof d)[]) expect(f[k], k).toEqual(d[k]);
    // **One identity list**, so the legend cannot name a set the gutter does not.
    expect(f.identity, "segments replace the series where a form has them").toEqual(["up", "down"]);
    expect(identityOf(block)).toEqual(f.identity);
    expect(f.legend.filter((s) => s.role === "series").map((s) => s.label)).toEqual(f.identity);
  });

  it("FC8 (C12 I62): each mark carries its own slot, so the colour channel survives the seam", () => {
    // **Also missing, also found by mutation.** `FC3` asserts the *legend*'s
    // slots and nothing asserted the marks', so collapsing every curve onto
    // slot one drew four series in one colour past a legend naming four — I25's
    // rule broken in the channel the figure exists to carry.
    const f = curveFigure(plot({
      series: [{ values: [1, 2] }, { values: [3, 4] }, { values: [5, 6] }],
    }));
    const series = f.marks.filter((d) => d.layer === "series");
    expect(series.map((d) => d.seriesIndex), "one slot per series, in order").toEqual([0, 1, 2]);
    expect(series.every((d) => d.ref === undefined), "unresolved — a slot, not a colour").toBe(true);
    // An annotation carries an explicit ref instead, because it is not a category.
    const a = curveFigure(plot({ annotations: [{ kind: "line", value: 2, tone: "warn" }] }));
    const ann = a.marks.filter((d) => d.layer === "annotation");
    expect(ann.map((d) => d.ref)).toEqual(["tone.warn"]);
    expect(ann.every((d) => d.seriesIndex === undefined), "and no categorical slot").toBe(true);
  });

  it("FC9 (C12 I59, F270): the scale reaches the axis, and nothing rendered anywhere else asks", () => {
    // **`yScale` has no rendered fixture in this repository.** It appears in no
    // catalogue variant, so none of the 1780 baseline frames, 890 catalogue
    // frames or 382 golden rows constructs a log axis — dropping the argument
    // from `positionalDecisions` moved nothing and failed nothing, which is
    // F256's lesson arriving on a whole axis mode (F270).
    //
    // A unit row rather than a fixture, deliberately: a catalogue variant would
    // add frames, and this pass's gate is that the corpus does not move.
    const linear = curveFigure(plot({ height: 8, series: [{ values: [1, 1000] }] }));
    const log = curveFigure(plot({ height: 8, yScale: "log", series: [{ values: [1, 1000] }] }));
    expect(log.value!.ticks, "log ticks, not linear ones").not.toEqual(linear.value!.ticks);
    expect(log.value!.ticks.every((t) => t > 0), "and every one is on the scale").toBe(true);
  });

  it("FC7 (C12 I59, §3ak.3): the figure is capability-independent, and the stacked axis is not in it", () => {
    // The rung table read forwards: what changes below the colour floor is not
    // the figure but what the terminal does to it. `stacksAtOneBit` reads
    // `colourDepth`, so the two-tick raw-bounds axis it builds is a projection
    // and `value` stays the niced one at every rung.
    const block = plot({ series: [{ values: [1, 3] }, { values: [2, 4] }] });
    const f = curveFigure(block);
    expect(f.value!.ticks.length, "a niced axis, not two raw bounds").toBeGreaterThan(2);
    // **`orientation` is the family's, never the block's** (§3ak.7 C9). It means
    // something else on the bar and distribution families, so reading it here
    // turns a line plot on its side in the arm that takes the figure and leaves
    // it upright in the arm that does not. *This assertion was missing and the
    // mutation pass is what said so — the row named `orientation` in its title
    // and never mentioned it.*
    expect(curveFigure(plot({ orientation: "horizontal" })).orientation,
      "a curve runs its values up the ordinate whatever the block says").toBe("vertical");
    expect(Object.keys(f).some((k) => /caps|colour|unicode/iu.test(k)), "no capability reaches it")
      .toBe(false);
    // The raw bounds the 1-bit arm rasterises against are still a figure fact —
    // it is the *axis object* built from them that is the projection's.
    expect(f.extent).toEqual({ min: 1, max: 4 });
  });
});

describe("FS — the scatter family's figure (C12 §3ak.7)", () => {
  it("FS1 (C12 I59): the decisions are the curve family's, because `positionalForm` makes them once", () => {
    // **The families are the unit, and this is why.** Both reach the same
    // composer, so the extent, the nicing, the tick count and the facing are one
    // computation — and asserting that keeps a later commit from giving the
    // scatter family a second axis by accident.
    const block = plot({ form: "scatter", height: 8, series: [{ values: [1, 5, 3] }] });
    const c = curveFigure(block), sc = scatterFigure(block);
    for (const k of ["value", "extent", "identity", "orientation", "facing", "frame", "legend"] as const) {
      expect(sc[k], k).toEqual(c[k]);
    }
    expect(sc.marks, "and only the marks differ").not.toEqual(c.marks);
  });

  it("FS2 (C12 I62): a point per finite sample, and a hole is an absence rather than a zero", () => {
    const f = scatterFigure(plot({ form: "scatter", series: [{ values: [1, null, 3] }] }));
    const pts = f.marks.filter((d) => d.layer === "series");
    expect(pts.length, "two samples, two points — the hole is not drawn at zero").toBe(2);
    expect(pts.every((d) => d.mark.kind === "point" && d.mark.role === "point")).toBe(true);
    expect(pts.every((d) => d.mark.kind === "point" && d.mark.size === undefined),
      "a scatter dot's radius is the renderer's, so it does not cross").toBe(true);
  });

  it("FS3 (C12 I62, §3ak.1): a bubble's size IS data, so it crosses normalised", () => {
    // `bubbleRows` reads `block.series[1]` positionally against the first and
    // divides by `max(1, …finite sizes)`. Same normalisation here, or the two
    // arms scale the size channel differently and every bubble is a different
    // size in each.
    // **The value series is the larger one on purpose.** With sizes above the
    // values, `seriesRange` — which spans every member of `series`, F271 — makes
    // the niced maximum *equal* the size maximum, and the mutation that divides
    // by the wrong one survives. The convenient fixture is the one where both
    // readings agree, and the mutation pass is what said so.
    const f = scatterFigure(plot({
      form: "bubble", height: 8,
      series: [{ values: [1, 100, 50] }, { values: [4, 2, null] }],
    }));
    const own = f.marks.filter((d) => d.seriesIndex === 0);
    const sizes = own.map((d) => (d.mark.kind === "point" ? d.mark.size : "not a point"));
    expect(sizes, "normalised against the size series' own maximum").toEqual([1, 0.5, undefined]);
    // **`undefined` rather than `0`**, because a zero radius is a dot the
    // terminal draws and *absent* is not the same statement.
    expect(sizes[2]).toBeUndefined();
    // **F271, asserted rather than described.** The size channel is a member of
    // `series`, so the terminal rasterises it as a second bubble series and the
    // figure says so — correcting it here would be a silent divergence inside a
    // refactor. The day the channel stops being a series, this row fails and the
    // finding is closed by the failure rather than by memory.
    expect(f.marks.filter((d) => d.seriesIndex === 1).length,
      "the channel is drawn as a series — F271, owed").toBe(2);
    expect(f.identity, "and named as one in the legend").toEqual(["series 1", "series 2"]);
  });
});

describe("FB — the bar family's figure (C12 §3ak.7)", () => {
  const bars = (over: Partial<Plot> = {}): Plot => plot({
    form: "bar", height: 8, categories: ["a", "b", "c"],
    series: [{ values: [10, 25, 15] }], ...over,
  });

  it("FB1 (C12 I59): identity is the categories here and the series for a curve, and both are right", () => {
    // The member is *what the figure's slots are named*. A curve's slots are its
    // series; a bar's are its categories — so the legend and the identity are one
    // list there and two here, and conflating them gives a bar chart a legend
    // naming its own rows.
    const f = barFigure(bars());
    expect(f.identity, "the gutter's names").toEqual(["a", "b", "c"]);
    expect(f.legend.map((sl) => sl.label), "and the legend names the series").toEqual(["series 1"]);
    expect(f.identity).not.toEqual(f.legend.map((sl) => sl.label));
    // The curve family's own answer, asserted beside it so the difference is on
    // purpose rather than by omission.
    const c = curveFigure(plot({ series: [{ values: [1, 2], label: "x" }] }));
    expect(c.identity, "a curve's slots are its series").toEqual(["x"]);
    expect(c.legend.map((sl) => sl.label)).toEqual(c.identity);
  });

  it("FB2 (C12 I59, §3ak.7): the extent is zero-anchored, and it is what the horizontal arm draws against", () => {
    // `[10, 25, 15]` anchored at 10 draws nothing for its first category —
    // `barRow` takes `{ base, data.max }` and the column arm nices the same
    // range, so both are in the figure and neither is re-derived.
    const f = barFigure(bars());
    expect(baselineOf(10), "a bar's length is its value, so it starts at zero").toBe(0);
    expect(f.extent, "raw and zero-anchored — what `barRow` takes").toEqual({ min: 0, max: 25 });
    expect(f.value!.range.min, "and the niced axis keeps the anchor").toBe(0);
    // Signed data grows both ways from zero rather than from its own floor.
    expect(barFigure(bars({ series: [{ values: [-5, 10] }] })).extent).toEqual({ min: -5, max: 10 });
  });

  it("FB3 (C12 I59, D11): the orientation is the block's, decided once", () => {
    // The terminal defaults horizontal and the SVG arm defaulted vertical — the
    // same block drawn on its side in one arm, which no rasterisation difference
    // accounts for.
    expect(barFigure(bars()).orientation, "the terminal's default").toBe("horizontal");
    expect(barFigure(bars({ orientation: "vertical" })).orientation).toBe("vertical");
    expect(categoricalDecisions(bars()).orientation, "and the decision is the family's, not the mark's")
      .toBe("horizontal");
  });

  it("FB4 (C12 I62): a rect runs from the baseline, in the figure's space and not the screen's", () => {
    const f = barFigure(bars());
    const rects = f.marks.filter((d) => d.layer === "series");
    expect(rects.length).toBe(3);
    const first = rects[0]!.mark;
    expect(first.kind).toBe("rect");
    if (first.kind !== "rect") throw new Error("not a rect");
    // `x` runs along the identity axis whatever the orientation says — decided
    // once, applied twice, so the two arms cannot transpose differently.
    // **Every slot, not the first one.** Checking `rects[0]` alone passed a
    // mutation that collapsed the rest onto it — the first rect's `x` is `0`
    // either way, so the assertion agreed with the defect. The mutation pass is
    // what said so.
    expect(rects.map((d) => (d.mark.kind === "rect" ? d.mark.x : -1)),
      "one slot per category, in order").toEqual([0, 1 / 3, 2 / 3]);
    expect([first.x, first.w], "category 0 of 3 takes the first third").toEqual([0, 1 / 3]);
    expect(first.y, "and the bar starts at the baseline").toBe(0);
    // **Against the NICED range, which is a ruling and not an accident.** This
    // family has three ranges across two arms: the SVG takes the raw unzeroed
    // one, `barRow` takes raw-zeroed `{ base, data.max }`, and the column arm
    // nices it. The mark takes the niced one — the axis a reader would read off,
    // and F210's rule that the range the figure is drawn against is the range the
    // gutter is labelled from. So `10` of a range niced to `0…30`, not of `25`.
    expect(f.value!.range, "niced past the data's own maximum").toEqual({ min: 0, max: 30 });
    expect(first.h).toBeCloseTo(10 / 30, 6);
    // **F272, asserted rather than described.** Both terminal arms fill from the
    // range floor, so a bar chart of signed data draws no negative bars — read at
    // height 7 the vertical arm rises every bar from `-10` through its own `0`
    // gutter label. The figure says what the terminal draws; the day a bar hangs
    // below zero, this row fails and closes the finding by failing.
    const neg = barFigure(bars({ categories: ["a", "b"], series: [{ values: [-4, 4] }] }));
    const [lo, hi] = neg.marks.filter((d) => d.layer === "series").map((d) => d.mark);
    if (lo?.kind !== "rect" || hi?.kind !== "rect") throw new Error("not rects");
    expect([lo.y, hi.y], "both start at the floor — F272, owed").toEqual([0, 0]);
    expect(lo.h, "and the negative one is the SHORTER bar, not a downward one")
      .toBeLessThan(hi.h);
  });

  it("FB6 (C12 I62, F280): a bar is a measurement and carries no depth; the form picks stem and head", () => {
    // **Measured in the terminal rather than assumed.** `lollipopRow` fills
    // `0 … pos` with `─` and puts `●` at `pos`; `dotplotRow` writes `●` at
    // `pos` and nothing else. A family drawn as one rect for all four forms
    // turns a dot plot into a bar chart — the plausible wrong figure, since both
    // encode the same number.
    const kindsOf = (form: string): readonly string[] =>
      barFigure(bars({ form } as unknown as Partial<Plot>)).marks
        .filter((d) => d.layer === "series")
        .map((d) => d.mark.kind)
        .filter((k, i, all) => all.indexOf(k) === i);
    expect(kindsOf("bar"), "a length").toEqual(["rect"]);
    expect(kindsOf("histogram"), "a length").toEqual(["rect"]);
    expect(kindsOf("lollipop"), "a stem and a head, in that order").toEqual(["rect", "point"]);
    expect(kindsOf("dotplot"), "a head alone — no stem to mistake for a bar").toEqual(["point"]);
    // **No depth, which is what makes a bar reach its own gridline.** A rect
    // with one is a partition member and comes off a unit on every side; that
    // inset shipped on the bar family for the length of a frame read and put the
    // bar of 20 at `x=351` against a `20` gridline at `352` (F280).
    expect(barFigure(bars()).marks.flatMap((d) => (d.mark.kind === "rect" ? [d.mark.depth] : [])))
      .toEqual([undefined, undefined, undefined]);
  });

  it("FB5 (C12 I64): a categorical refusal is empty, and the identity survives it", () => {
    const f = barFigure(bars({ series: [{ values: [] }] }));
    expect(f.value, "nothing was measured").toBeNull();
    expect(f.marks).toEqual([]);
    expect(f.identity, "and the categories are still what the figure would name").toEqual(["a", "b", "c"]);
  });
});

describe("FM — the matrix family's figure (C12 §3ak.7)", () => {
  const grid = (over: Partial<Plot> = {}): Plot => plot({
    form: "heatmap", height: 4,
    series: [{ values: [0, 5], label: "a" }, { values: [10, 20] }], ...over,
  });

  it("FM1 (C12 I60): no value axis, and the ramp still has a domain", () => {
    // The pair is the family's whole shape. Three renderers furnished an axis
    // out of `seriesRange([]) ?? {0, 1}` over readings that are colours — so
    // `value` is null — but the ramp maps a *domain* to a colour, and that
    // domain is a figure fact with no axis over it.
    const f = matrixFigure(grid());
    expect(f.value, "readings that are colours have no axis").toBeNull();
    expect(f.extent, "and the ramp's domain is still shared").toEqual({ min: 0, max: 20 });
    // Empty is a refusal, and it takes the extent with it.
    const none = matrixFigure(grid({ series: [] }));
    expect([none.value, none.extent, none.marks]).toEqual([null, null, []]);
  });

  it("FM2 (C12 I62, §3ak.1): the reading crosses on the mark, because the coordinate is spent on the grid", () => {
    // A matrix cell has no length and no position to carry its value — `point`'s
    // `size` argument one mark along. Each arm turns the normalised reading into
    // a colour at its own depth: `colormapFor` here, `continuousColour` there.
    const f = matrixFigure(grid());
    const cells = f.marks.filter((d) => d.layer === "series");
    expect(cells.length, "one rect per finite cell").toBe(4);
    const vals = cells.map((d) => (d.mark.kind === "rect" ? d.mark.value : "not a rect"));
    expect(vals, "normalised over the extent, uninverted").toEqual([0, 0.25, 0.5, 1]);
    expect(cells.every((d) => d.ref === undefined), "a ramp position is not a palette slot").toBe(true);
    // **The whole grid, not the first cell — the second time this exact mistake
    // was caught by the same instrument.** `FB4` checked `rects[0]` and a
    // mutation collapsing the rest onto it survived, because element zero is at
    // the origin either way. An assertion about the first member of an ordered
    // set is an assertion about nothing that can move.
    const at = cells.map((d) => (d.mark.kind === "rect" ? [d.mark.x, d.mark.y] : []));
    expect(at, "row-major over the unit square: row r of 2, column c of 2")
      .toEqual([[0, 0], [0.5, 0], [0, 0.5], [0.5, 0.5]]);
    const first = cells[0]!.mark;
    if (first.kind !== "rect") throw new Error("not a rect");
    expect([first.w, first.h], "and each cell is one slot of each axis").toEqual([0.5, 0.5]);
  });

  it("FM3 (C12 I61): the facing default is the family's, not the component's", () => {
    // `heatmap.ts` takes `FACING_MATRIX` where every positional form takes
    // `FACING_DEFAULT` — a matrix's first row is at the top, a curve's first
    // value at the bottom — and that difference was reachable from two files.
    expect(matrixFigure(grid()).facing, "the matrix default").toEqual(FACING_MATRIX);
    expect(matrixFigure(grid()).facing).not.toEqual(curveFigure(plot({})).facing);
  });

  it("FM4 (C12 I59): the identity is what the gutter shows, and the file had two answers", () => {
    // Measured writing this: an unlabelled row is `""` to `labelColumnWidth` and
    // `row N` to the overflow notice — two answers to *what is this row called*,
    // twenty-five lines apart. The gutter's wins: it is the one beside the cells.
    expect(matrixFigure(grid()).identity).toEqual(["a", ""]);
    // And it is NOT the positional families' answer, which invents `series N`.
    expect(identityOf(grid()), "the other rule, asserted so the difference is on purpose")
      .toEqual(["a", "series 2"]);
  });
});

describe("FD — the distribution family's figure (C12 §3ak.7)", () => {
  const box = (over: Partial<Plot> = {}): Plot => plot({
    form: "boxplot", height: 8,
    quartiles: [{ min: 0, q1: 2, median: 4, q3: 6, max: 10, mean: 5, outliers: [12] }],
    ...over,
  } as Partial<Plot>);

  it("FD1 (C12 I62): every mark carries a role, and the roles are the family's vocabulary", () => {
    // A median is `┃` at full unicode, `|` in ASCII and a distinct mark below the
    // colour floor; a mean is a different character; an outlier a third. The
    // terminal picks all three from its ladder and the SVG draws a line and two
    // circles. **What both agree about is which of the seven things this is.**
    const roles = distributionFigure(box()).marks
      .flatMap((d) => (d.mark.kind === "point" ? [d.mark.role] : []));
    expect(new Set(roles), "cap, median, mean and outlier — no glyph anywhere")
      .toEqual(new Set(["cap", "median", "mean", "outlier"]));
    expect(roles.filter((r) => r === "cap").length, "one at each whisker's end").toBe(2);
    // A summary with no mean must be distinguishable from one whose mean is its
    // median, which is what `NormalisedSummary` makes optional and why.
    const noMean = distributionFigure(box({
      quartiles: [{ min: 0, q1: 2, median: 4, q3: 6, max: 10, outliers: [] }],
    } as Partial<Plot>));
    expect(noMean.marks.some((d) => d.mark.kind === "point" && d.mark.role === "mean")).toBe(false);
  });

  it("FD2 (C12 §3aj): the extent is the family's own datum, and it has two arms", () => {
    // A boxplot's extent is the whiskers plus outliers; a forest plot's is the
    // interval, because a confidence bound is not a whisker and can reach past
    // the observed range. Two arms of one function, deliberately.
    expect(distributionFigure(box()).extent, "whiskers plus the outlier at 12")
      .toEqual({ min: 0, max: 12 });
    const forest = distributionFigure(box({
      form: "forest",
      quartiles: [{ min: 3, q1: 3, median: 4, q3: 5, max: 5, lower: 1, upper: 9, centre: 4, outliers: [] }],
    } as Partial<Plot>));
    expect(forest.extent, "the interval reaches past the observed range")
      .toEqual({ min: 1, max: 9 });
  });

  it("FD3 (C12 I62): `absent` is a role, so the SVG can refuse where the terminal draws", () => {
    // `normalisedSummary` falls `centre` back to the median, so the summary
    // cannot say *nothing was reported* — a mark at the origin is the plausible
    // wrong figure that would become. The role is what says it.
    const f = distributionFigure(box({
      form: "forest",
      quartiles: [{ min: 1, q1: 1, median: Number.NaN, q3: 2, max: 2, lower: 1, upper: 2, outliers: [] }],
    } as Partial<Plot>));
    const pts = f.marks.filter((d) => d.mark.kind === "point");
    expect(pts.map((d) => (d.mark.kind === "point" ? d.mark.role : "")))
      .toEqual(["absent"]);
  });

  it("FD4 (C12 I59): a dumbbell is two positions and a connector, paired by index", () => {
    const f = distributionFigure(plot({
      form: "dumbbell", categories: ["a", "b"],
      series: [{ values: [1, 3] }, { values: [5, 7] }],
    }));
    expect(f.extent, "both series, because the datum is the pair").toEqual({ min: 1, max: 7 });
    const lines = f.marks.filter((d) => d.mark.kind === "polyline");
    const ends = f.marks.filter((d) => d.mark.kind === "point");
    expect([lines.length, ends.length], "one connector and two ends per pair").toEqual([2, 4]);
    // **The connector is emitted before its ends**, which is `mergedRow`'s order
    // and the order a reader resolves an overlap in.
    expect(f.marks[0]!.mark.kind).toBe("polyline");
    expect(ends.map((d) => d.seriesIndex), "and each end keeps its own slot").toEqual([0, 1, 0, 1]);
  });

  it("FD5 (C12 I64): a refusal is empty, and the identity survives it", () => {
    const f = distributionFigure(box({ quartiles: [] } as Partial<Plot>));
    expect([f.value, f.extent, f.marks]).toEqual([null, null, []]);
    expect(distributionFigure(box({ categories: ["x"] })).identity).toEqual(["x"]);
  });
});

describe("FT / FN — the tiles and nodes families (C12 §3ak.7)", () => {
  const tree3 = {
    label: "root",
    children: [{ label: "a", value: 3 }, { label: "b", value: 1 }],
  };

  it("FT1 (C12 I60): a tiles figure has no axis AND no domain, where a matrix has one of the two", () => {
    // **The pair is what separates the two families.** A matrix reads its numbers
    // as colours — no axis, and the ramp still has a domain. A tiles figure reads
    // them as **areas**, and an area is the reading itself: `hierarchy.ts` divides
    // by the total while it walks, so the positions arrive on the unit interval
    // and there is nothing left for a domain to be over.
    const f = tilesFigure(plot({ form: "treemap", hierarchy: tree3 } as Partial<Plot>));
    expect([f.value, f.extent], "neither an axis nor a domain").toEqual([null, null]);
    const m = matrixFigure(plot({ form: "heatmap", series: [{ values: [1, 2] }] }));
    expect(m.value, "the matrix has no axis either").toBeNull();
    expect(m.extent, "and it does have a domain — this is the difference").not.toBeNull();
  });

  it("FT2 (C12 I62): a treemap's tiles are the unit square, and a strip's depth is a row", () => {
    // **`tiles` and `strips` disagree about whether the root is a node, and both
    // are right for their form.** Measured: `tiles` emits the *children*
    // squarified into the square — a treemap's root is the canvas, not a tile —
    // and `strips` emits the root at depth 0, because a flame's root is its base
    // bar. Two walks in one module that look parallel and are not, and their
    // depths are offset by one as a consequence. Asserted rather than described,
    // because a reader of `hierarchy.ts` sees a matched pair.
    const tm = tilesFigure(plot({ form: "treemap", hierarchy: tree3 } as Partial<Plot>));
    const rects = tm.marks.flatMap((d) => (d.mark.kind === "rect" ? [[d.mark.x, d.mark.y, d.mark.w, d.mark.h]] : []));
    expect(rects, "the children fill the square; the root is the canvas")
      .toEqual([[0, 0, 0.75, 1], [0.75, 0, 0.25, 1]]);
    expect(tm.identity, "so the treemap names two where the flame names three").toEqual(["a", "b"]);
    // **The partition is the true one and the depth rides with it** (F278). A
    // pad is one unit of the *output* — one cell in the terminal, one pixel in
    // SVG — so what crosses is how deeply nested the rect is, and each arm
    // insets by `depth + 1` of its own unit. The whole square here is
    // `0 … 0.75` and `0.75 … 1`: nothing is taken off for legibility, which is
    // what makes a tile's area proportional to its datum rather than to its
    // datum minus the padding.
    expect(tm.marks.flatMap((d) => (d.mark.kind === "rect" ? [d.mark.depth] : [])), "both children are depth 0")
      .toEqual([0, 0]);
    // **A label is a mark keyed to its rect, not a parallel list** (§3ak.12).
    // `identity` is what the *gutter* would show; this is what is written inside
    // the tile, and the renderer needs to find the box to know whether it fits.
    expect(tm.marks.flatMap((d) => (d.mark.kind === "text" ? [[d.seriesIndex, d.mark.text, d.mark.room]] : [])))
      .toEqual([[0, "a", 0.75], [1, "b", 0.25]]);
    // A flame's strips share the line and stack by depth. `h` is one row of the
    // deepest budget, because stating a fraction of the renderer's row count
    // would be this layer guessing at the other's.
    const fl = tilesFigure(plot({ form: "flame", hierarchy: tree3 } as Partial<Plot>));
    const bars = fl.marks.flatMap((d) => (d.mark.kind === "rect" ? [[d.mark.y, d.mark.h]] : []));
    expect(fl.identity, "the root IS a bar here").toEqual(["root", "a", "b"]);
    expect(bars, "two depths, so each is half").toEqual([[0, 0.5], [0.5, 0.5], [0.5, 0.5]]);
    // **`a` is three quarters of the line and `b` one quarter** — the values are
    // spent on width, which is the family's whole reading.
    const widths = fl.marks.flatMap((d) => (d.mark.kind === "rect" ? [d.mark.w] : []));
    expect(widths).toEqual([1, 0.75, 0.25]);
    // **A strip carries `depth: 0`, and the bar family is what settled that**
    // (F280). The member was written when tiles were its only subject, so
    // *absent* had one possible meaning and I gave it the wrong one: a strip is
    // a **partition member** — the bands tile the line and abut each other — so
    // it wants the separating inset, and it encloses nothing, so it wants one
    // unit of it. Absent means *not a partition member at all*, which is a bar:
    // a length read against an axis, drawn exactly to its own gridline.
    expect(fl.marks.flatMap((d) => (d.mark.kind === "rect" ? [d.mark.depth] : [])))
      .toEqual([0, 0, 0]);
  });

  it("FT3 (C12 I61, F273, F276): the facing is live here, and for one commit it was a constant", () => {
    // `flame`, `icicle` and `treemap` all declare `ORIGIN_DEFAULT: null`, so
    // `facingOf` reaches its fallback and the argument decides — where every
    // matrix form declares `"top-left"` and the fallback is dead.
    //
    // **And the argument was `FACING_DEFAULT` for all three** (F276), so the
    // member said `up` for an icicle and the growth direction stayed written in
    // two renderers. Every clause of the paragraph that excused it is true; it
    // is attached to a decision it did not constrain, which is why the three are
    // asserted together rather than one being taken as the family's.
    const facingOfForm = (form: string): unknown =>
      tilesFigure(plot({ form, hierarchy: tree3 } as unknown as Partial<Plot>)).facing;
    expect(facingOfForm("flame"), "only the flame grows up from its root").toEqual({ x: "right", y: "up" });
    expect(facingOfForm("icicle"), "an icicle hangs down from it").toEqual({ x: "right", y: "down" });
    // Measured in the terminal rather than reasoned: `definition.ts` maps
    // `t.y0 * areaRows` to a **row index**, so a treemap's `y0 = 0` is the top
    // edge exactly as an icicle's depth 0 is.
    expect(facingOfForm("treemap"), "and a treemap's y0 is its top").toEqual({ x: "right", y: "down" });
  });

  it("FN1 (C12 §3aj.6): the nodes family stops at its decisions, and there is no `nodesFigure`", () => {
    // **A tree's node positions are a function of its labels' widths in the
    // terminal** — `tdWidth` measures a subtree by the widest label under it — so
    // the topology is shared and the placement is not. A `Mark` is a position, so
    // a figure with marks would carry ONE arm's placement and the other would
    // fail `U1b` for a reason the type cannot express.
    const d = nodesDecisions(plot({ form: "tree", hierarchy: tree3 } as Partial<Plot>));
    expect(Object.keys(d).sort(), "everything but the marks").toEqual(
      ["extent", "facing", "frame", "identity", "legend", "orientation", "value"],
    );
    expect("marks" in d, "and `marks: []` is not the alternative — I64 makes it a refusal").toBe(false);
    expect([d.value, d.extent], "structure is not a reading on a scale").toEqual([null, null]);
    expect(d.identity, "what crosses is what already crossed — `flatten`'s walk")
      .toEqual(["root", "a", "b"]);
  });

  it("FN2 (C12 I59): a graph names its nodes where a tree names its walk", () => {
    const g = nodesDecisions(plot({
      form: "graph",
      graph: { nodes: [{ id: "x", label: "X" }, { id: "y" }], edges: [] },
    } as Partial<Plot>));
    expect(g.identity, "an unlabelled node takes a positional name").toEqual(["X", "node 2"]);
  });
});
