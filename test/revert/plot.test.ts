// C12 tier 6 — fail-on-revert.
//
// Each test names the change that makes it fail, per CLAUDE.md: "Removing the
// idempotency guard → T3.14 fails" is the form. The point is not extra coverage —
// it is that a reader who reverts one of these decisions is told which decision
// they reverted, rather than being handed a diff of braille.
import { describe, expect, it } from "vitest";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { plotHeight } from "../../src/presentation/plot/height.js";
import { columnsOf, finiteSamples, rowOf, seriesRange, FACING_DEFAULT } from "../../src/presentation/plot/scale.js";
import { curveRows } from "../../src/presentation/plot/curve.js";
import { createGrid, drawLine, foldBraille, setDot } from "../../src/presentation/plot/raster.js";
import { sparkline } from "../../src/presentation/plot/sparkline.js";
import { stripHeights } from "../../src/presentation/plot/strips.js";
import { lossCurve, plotOf } from "../support/blocks.js";
import { ASCII_CAPS, FULL_CAPS, MONO_CAPS, measurable, visible } from "../support/render.js";
import { gutter } from "../support/plot-forms.js";
import { cells, displayCells } from "../../src/presentation/text.js";
import { smallMultiplesRows } from "../../src/presentation/plot/facet.js";
import { glyphs } from "../../src/presentation/blocks/glyphs.js";
import { block, type Plot, type Series } from "../../src/data/viewmodel/index.js";

const m = (): ReturnType<typeof measurable> =>
  measurable({ definitions: [plotDefinition] as never });

describe("C12 tier 6 — fail-on-revert", () => {
  it("T6.1 (I1): deriving height from series length → T1.1 fails, and streaming plots shift the viewport", () => {
    // The revert: `measure` reading `block.series`. It is prevented by a type —
    // `plotHeight` takes `PlotGeometry`, which has no `series` — so the revert
    // requires widening that parameter first, which is the moment to stop.
    const two = plotOf({ id: "two-points", points: 2, height: 6 });
    const many = plotOf({ id: "many-points", points: 5_000, height: 6 });

    expect(plotHeight(two)).toBe(9);
    expect(plotHeight(many)).toBe(9);
    expect(m().renderToLines(two, 80)).toHaveLength(9);
    expect(m().renderToLines(many, 80)).toHaveLength(9);
  });

  it("T6.2 (I3): dividing by the range without guarding a constant series → T1.5 fails with NaN", () => {
    // The revert: `(v - min) / (max - min)` with no `max === min` branch. A
    // constant series then divides zero by zero and every dot row is `NaN`, which
    // `setDot` discards — so the plot renders *blank* rather than throwing, and the
    // failure is a missing curve rather than an error anybody sees.
    const range = seriesRange([{ values: [3, 3, 3] }], {});
    if (range === null) throw new Error("unreachable");

    const row = rowOf(3, range, 16, FACING_DEFAULT);
    expect(Number.isNaN(row)).toBe(false);
    expect(row).toBe(7);

    const glyphRows = curveRows({ values: [3, 3, 3] }, range, 12, 4, FULL_CAPS, FACING_DEFAULT);
    expect(glyphRows.some((r) => [...r].some((c) => c !== "⠀"))).toBe(true);
  });

  it("T6.3 (I4): letting NaN reach the grid → T1.8 fails", () => {
    // The revert: `finiteSamples` returning every value, or returning values
    // without their indices. Either one closes the gap a filtered sample leaves,
    // and the second is the tempting one — the array is shorter and the curve looks
    // continuous, which is precisely the lie.
    const values = [1, 2, Number.NaN, 4, 5];
    expect(finiteSamples(values).map((s) => s.i)).toEqual([0, 1, 3, 4]);

    const columns = columnsOf(finiteSamples(values), values.length, 10, FACING_DEFAULT);
    const joinable = columns.filter((c, i) => {
      const next = columns[i + 1];
      return next !== undefined && next.iFirst === c.iLast + 1;
    });
    // Three of the four adjacencies are joinable; the one across the hole is not.
    expect(joinable).toHaveLength(2);
  });

  it("T6.4 (I5): downsampling by every-nth-point → T1.10 fails, and spikes vanish", () => {
    // The revert: `columnsOf` keeping one sample per column instead of four. The
    // spike at index 5,000 is not on any stride that lands on a column boundary, so
    // it disappears — and a loss curve with a spike is *about* the spike.
    const values = Array.from({ length: 10_000 }, (_, i) => (i === 5_000 ? 99 : 1));
    const columns = columnsOf(finiteSamples(values), values.length, 112, FACING_DEFAULT);
    expect(columns.filter((c) => c.max === 99)).toHaveLength(1);

    // And every-nth would also have given the column a single value, so `min` and
    // `max` would be equal — the assertion that distinguishes the two strategies.
    const spiked = columns.find((c) => c.max === 99);
    expect(spiked?.min).toBe(1);
  });

  it("T6.5 (I6): overlaying multi-series at 1-bit → T3.10 fails, and the plot is unreadable", () => {
    // The revert: dropping the `colourDepth === 1` branch in `render`. Two braille
    // curves in one grid with no colour cannot be told apart, and there is no dash
    // pattern that survives a 2×4 dot cell.
    const two: readonly Series[] = [
      { values: lossCurve(20), label: "train" },
      { values: lossCurve(20).map((v) => v * 1.2), label: "val" },
    ];
    const b = block({ kind: "plot", id: "two", form: "line", height: 8, axes: true, series: two }) as Plot;
    const mono = measurable({ definitions: [plotDefinition] as never, capabilities: MONO_CAPS });
    const rendered = mono.renderToLines(b, 48).map(visible).join("\n");

    // Stacked: both labels present, each on its own strip's first row.
    expect(rendered).toContain("train");
    expect(rendered).toContain("val");
    expect(mono.renderToLines(b, 48)).toHaveLength(11);
  });

  it("T6.11 (I7): giving each strip a label row → T3.11c fails, and every stacked plot overflows", () => {
    // The revert: pushing a label row before each strip. Σ then becomes
    // `height + n`, and the block renders taller than it measured — C09 I1 broken
    // for every multi-series plot, one row per series.
    for (let n = 1; n <= 12; n += 1) {
      for (let h = 1; h <= 20; h += 1) {
        const heights = stripHeights(h, n);
        if (heights === null) continue;
        expect(heights.reduce((a, b) => a + b, 0), `n=${String(n)} h=${String(h)}`).toBe(h);
      }
    }

    const four: readonly Series[] = Array.from({ length: 4 }, (_, i) => ({
      values: lossCurve(12),
      label: `s${String(i)}`,
    }));
    const b = block({ kind: "plot", id: "four", form: "line", height: 8, axes: true, series: four }) as Plot;
    const mono = measurable({ definitions: [plotDefinition] as never, capabilities: MONO_CAPS });
    expect(mono.renderToLines(b, 48)).toHaveLength(mono.measure(b, 48));
  });

  it("T6.12 (I8): dropping series that do not fit → T3.11b fails", () => {
    // The revert: returning `stripHeights` of zero for the overflow, or slicing the
    // series list to what fits. Both render without error and both lose data
    // silently, which is the one outcome §5 rules out.
    expect(stripHeights(4, 10)).toBeNull();

    const ten: readonly Series[] = Array.from({ length: 10 }, (_, i) => ({
      values: lossCurve(12).map((v) => v + i),
      label: `s${String(i)}`,
    }));
    const b = block({ kind: "plot", id: "ten", form: "line", height: 4, axes: true, series: ten }) as Plot;
    const rendered = measurable({ definitions: [plotDefinition] as never, capabilities: MONO_CAPS })
      .renderToLines(b, 48)
      .map(visible)
      .join("\n");

    expect(rendered).toContain("+9 more");
  });

  it("T6.6 (I9): an ASCII form of different cell dimensions → T2.4 fails", () => {
    // The revert: an ASCII fold with a different dots-per-cell than the grid was
    // sized for — say folding a 2-dot-wide grid one dot at a time. The plot then
    // occupies twice the cells it measured.
    const b = plotOf({ height: 6 });
    const unicode = measurable({ definitions: [plotDefinition] as never, capabilities: FULL_CAPS });
    const ascii = measurable({ definitions: [plotDefinition] as never, capabilities: ASCII_CAPS });

    for (const width of [40, 80, 120]) {
      expect(ascii.renderToLines(b, width)).toHaveLength(unicode.renderToLines(b, width).length);
      for (const row of ascii.renderToLines(b, width)) {
        expect([...visible(row)].length).toBeLessThanOrEqual(width);
      }
    }
  });

  it("T6.7 (I10): writing outside the declared region → T2.3 fails and the frame corrupts", () => {
    // The revert: painting a row without `clampSpans`. This is not hypothetical —
    // it is what the first version of `definition.ts` did, and at width 1 a plot of
    // declared height 5 rendered nineteen rows, because the label column and the
    // axis are seven cells and the terminal wrapped every one of them.
    const b = plotOf({ height: 5 });
    for (const width of [1, 2, 3, 5]) {
      const lines = m().renderToLines(b, width);
      expect(lines, `width ${String(width)}`).toHaveLength(8);
      for (const row of lines) {
        expect([...visible(row)].length, `width ${String(width)}`).toBeLessThanOrEqual(width);
      }
    }
  });

  it("T6.8 (I13): a sparkline occupying two rows → T1.13 fails, and every table row shifts", () => {
    // The revert: a sparkline that wraps, which happens the moment it returns more
    // than `width` cells. A table row containing one then grows, and the table's
    // measured height is wrong for every row below it.
    for (const width of [1, 3, 8, 40, 200]) {
      const out = sparkline(lossCurve(60), width, FULL_CAPS);
      expect(out).not.toContain("\n");
      expect([...out], `width ${String(width)}`).toHaveLength(width);
    }
  });

  it("T6.9 (I14): dropping Bresenham for point-plotting → T1.4 fails and steep curves dot", () => {
    // The revert: `setDot` per sample with no `drawLine` between them. A curve
    // moving faster than one dot column per sample becomes a scatter, and at 2×4
    // subcell density a scatter is indistinguishable from noise.
    const joined = createGrid(20, 40);
    drawLine(joined, 0, 0, 3, 39);
    const dotted = createGrid(20, 40);
    setDot(dotted, 0, 0);
    setDot(dotted, 3, 39);

    const inked = (g: ReturnType<typeof createGrid>): number =>
      foldBraille(g).filter((r) => [...r].some((c) => c !== "⠀")).length;

    expect(inked(joined)).toBe(10);
    expect(inked(dotted)).toBe(2);
  });

  it("T6.10 (I12): making `plot` a privileged built-in → T2.6 fails", () => {
    // The revert: adding `plotDefinition` to `blocks/defaults.ts`. The kind would
    // then work without anybody calling `register`, and the claim that C09's
    // extension path is real — three registrants, none privileged — would be
    // untestable, because the mechanism would no longer be on the only path.
    expect(measurable().kinds).not.toContain("plot");
    expect(m().kinds).toContain("plot");
  });

  it("T6.17 (I24): the gutter measuring against a default width → T3.17 fails, and the axis bends", () => {
    // The revert: dropping `ctx.capabilities.ambiguousWidth` from `gutterSpans`'
    // `padStart`, or from the `labelWidth`/`seriesLabelWidth` call that sizes the
    // column. Either half alone bends it, which is why there were four gutters
    // and two of them were half-right: the two that measured correctly still
    // padded against the default.
    //
    // **One row and not two**, because the failure is one thing: the budget and
    // the drawing disagreeing. Which of the two moved is the diff's job.
    const WIDE = { ...FULL_CAPS, ambiguousWidth: "wide" as const };
    const g = glyphs(WIDE);
    const b = block({
      kind: "plot", id: "revert-amb", form: "bar", height: 3, axes: true,
      categories: ["a\u2192b", "rpm", "kPa"], series: [{ values: [3, 7, 5] }],
    }) as Plot;
    const kit = measurable({ definitions: [plotDefinition] as never, capabilities: WIDE });

    const columns = kit.renderToLines(b, 30).flatMap((row) => {
      const chars = [...visible(row)];
      const i = chars.findIndex((c) => c === g.vertical || c === g.teeRight);
      return i < 0 ? [] : [cells(chars.slice(0, i).join(""), "wide")]; // cells-ok — a row's edge
    });
    expect(new Set(columns).size, `edge columns: ${columns.join(",")}`).toBe(1);
  });

  it("T6.18 (I15, I22): labelling the gutter from a second nicing → YA1 fails, and the mark's own row names another value", () => {
    // **The revert this names has moved once already, which is the finding.**
    // It used to be *`yLabels` calling `niceAxis` directly*, so a log plot was
    // labelled linearly; that was fixed by threading the scale into the second
    // nicing, and the second nicing stayed. `niceAxis` is not idempotent, so the
    // two then disagreed about *range* instead — and the revert available today
    // is `positionalForm` handing the gutter `axisFor(axis.range, …)` rather
    // than the axis its own curve was rasterised against (F210).
    //
    // **Asserted on a frame, because both halves are correct in isolation.**
    // Neither `axisFor` nor `yLabels` can be wrong about this on its own: the
    // claim is that two call sites name one object, and `gutter()` below cannot
    // see it — it composes the two the way the renderer is supposed to.
    const b = block({
      kind: "plot", id: "t618", form: "line", height: 6, axes: true,
      series: [{ values: [1, 8, 30, 3] }],
    });
    const kit = measurable({ definitions: [plotDefinition] as never, capabilities: FULL_CAPS });
    const top = (kit.renderToLines(b, 50).map((r) => visible(r)).find((r) => /┤/u.test(r)) ?? "");
    // 30 is the axis maximum, so the largest mark draws on this row. A second
    // nicing takes `{0, 30}` to `{0, 40}` and writes `40` beside it.
    expect(top.split("┤")[0]?.trim()).toBe("30");
    // And the scale still travels, which is what the earlier revert was about.
    // **Through the placement as well as the ticks** (C04 I81): `axisFor` hands
    // the gutter a range carrying `scale: "log"`, so `rowOf` places `50` at
    // `round(8 · (1 − log10(50) / 3))` = row 3. This used to assert `200`, which
    // is where *linear* placement of log ticks left a label standing — F189's
    // own defect read as the expected value; `50` sat on the bottom row then,
    // colliding with `1`, and was dropped.
    const range = { min: 1, max: 1000 };
    const log = gutter(range, 9, undefined, {}, "log");
    expect(log.map((l) => l.text)).toContain("50");
    expect(log.find((l) => l.text === "50")?.row).toBe(3);
    expect(gutter(range, 9, undefined, {}).map((l) => l.text)).toContain("750");
  });

  it("T6.19 (C12 I10): measuring a facet column in code units → T1.31 fails, and later facets vanish", () => {
    // The revert: `cell.padEnd(facetWidth)` and `row.slice(0, width)`, which is
    // what this did. Facets are the one place in C12 that composes rows another
    // renderer has already **painted**, and both operations count UTF-16 code
    // units — a colour run is fourteen bytes and no columns. `padEnd` saw a
    // 29-byte string as wider than its 26-cell column and padded nothing;
    // `slice` cut at eighty bytes, which was forty visible cells, inside an
    // escape. The catalogue drew one facet of four and the top border of the
    // others, which is the shape of that cut rather than of a missing renderer.
    const ESC = String.fromCharCode(27);
    const styled = `${ESC}[38;5;241m${"A".repeat(20)}${ESC}[0m`;
    // The measurement the reverted code would take, beside the true one.
    expect(styled.length).toBeGreaterThan(20); // cells-ok — a length in code units
    expect(displayCells(styled)).toBe(20); // cells-ok — a cell count
    const four = [{ form: "line" }, { form: "line" }, { form: "line" },
      { form: "line" }] as unknown as readonly Plot[];
    const rows = smallMultiplesRows(four, 80, 1, { capabilities: FULL_CAPS } as never, {
      line: (_b: Plot, w: number) => [`${ESC}[38;5;241m${"A".repeat(w)}${ESC}[0m`],
    } as never);
    expect(displayCells(rows[0]!)).toBe(80); // cells-ok — a cell count
  });

  it("T6.20 (C12 I10): re-painting a composed facet row → T1.33 fails, and escapes print as text", () => {
    // The revert: wrapping the composed row as `line([{ text: r }], …)` in the
    // two facet arms. `clampSpans` measures span text with `cells()`, which
    // counts a painted row's escape bytes as visible — its own documentation
    // says so — so an 80-cell row measured about 120, was truncated, and
    // `stripControl` took the ESC and left the body on screen as literal text.
    //
    // **This was invisible until the row above was fixed.** The old `slice` had
    // already cut the row to 80 code units, so the clamp saw a row it believed
    // fitted and passed it through untouched. One defect masking another, and
    // the correct fix to the first is what exposed the second.
    const b = block({
      kind: "plot", id: "revert-facet", form: "smallmultiples", height: 5, axes: true,
      series: [],
      facets: [
        { kind: "plot", id: "f1", form: "line", height: 5, axes: true, series: [{ values: [1, 3, 2] }] } as Plot,
        { kind: "plot", id: "f2", form: "line", height: 5, axes: true, series: [{ values: [3, 1, 4] }] } as Plot,
      ],
    }) as Plot;
    const ESC = String.fromCharCode(27);
    const k = measurable({ definitions: [plotDefinition] as never, capabilities: FULL_CAPS });
    for (const row of k.renderToLines(b, 80)) {
      expect(row.replace(new RegExp(`${ESC}\\[[0-9;]*m`, "g"), "")).not.toMatch(/\[[0-9;]*m/);
    }
  });

  it("T6.28 (I11, I34): a jittered strip that moves between two renders of one block", () => {
    // **The revert is a counter, and the reason it is a revert rather than a
    // taste.** C12 owns no state and every render is a pure function of block,
    // width and context — so a strip placed from `Math.random`, a clock or a
    // module-level counter is a picture of the renderer. It would fail nothing
    // else: every count agrees, both frames are plausible, and the difference
    // only exists between two renders nobody puts side by side.
    //
    // **Sixty-one samples, and sixty is what made this row pass against the
    // defect it names.** A module counter running 1…60 and then 61…120 gives
    // the same `% 4` in both renders when the count is a multiple of four — the
    // phase resets exactly, the two frames are byte-identical, and a counter is
    // indistinguishable from a hash. Measured, not reasoned: the mutation
    // survived. A count coprime to the jitter's positions is the fixture
    // responding to the thing under test.
    const N = 61; // cells-ok — a sample count, deliberately not a multiple of 4
    expect(N % 4, "the count must not reset the counter's phase").not.toBe(0); // cells-ok — a position count
    const values = Array.from({ length: N }, (_v, i) => 30 + 6 * Math.tan((((i + 0.5) / N) - 0.5) * 2.4));
    const drop = block({
      kind: "plot", id: "rd", form: "violin", height: 3, axes: false,
      categories: ["A"], series: [{ values }],
    }) as Plot;

    const kit = measurable({ definitions: [plotDefinition] as never, capabilities: FULL_CAPS });
    const first = kit.renderToLines(drop, 40); // cells-ok — a frame width
    const second = kit.renderToLines(drop, 40); // cells-ok — a frame width
    expect(second).toEqual(first);

    // **A second kit, because one kit could be memoising.** The claim is that
    // the *renderer* is pure, not that a cache is warm — and a per-instance
    // counter would survive the first assertion by being reset with the kit.
    const other = measurable({ definitions: [plotDefinition] as never, capabilities: FULL_CAPS });
    expect(other.renderToLines(drop, 40)).toEqual(first); // cells-ok — a frame width

    // The fixture responds: the strip is drawn and it is not a rug. `⠁ ⠈ ⠉` are
    // the braille cells whose dots all sit in the top row, so a strip with no
    // jitter draws nothing else — and this row would pass against one.
    const strip = visible(first[2] ?? "");
    expect(strip.trim().length, "the strip is drawn").toBeGreaterThan(0); // cells-ok — a cell count
    const flat = new Set(["\u2801", "\u2808", "\u2809", " "]);
    expect([...strip].some((c) => !flat.has(c)), "and it is jittered, not a rug").toBe(true);
  });

  it("T6.13 (I15): three unconditional y-labels → T3.2 renders outside its rows", () => {
    // Not in §9's list, and it belongs there: §3 made three labels unconditional
    // while T3.2 renders `height: 1` with axes, so the section contradicted its own
    // test. The revert is placing a label at the midpoint row of a one-row area.
    const b = plotOf({ height: 1 });
    const lines = m().renderToLines(b, 40);
    expect(lines).toHaveLength(4);

    // One label, and it is the maximum: the extremes bound the data and the
    // midpoint is interpolation between them, so the midpoint is what goes. Only
    // the plot-area rows are examined — the x-label row carries `epoch 20`, which
    // is a digit and not a y-label.
    // Row 0 is the frame's lid, so the one plot-area row is row 1 (§3f).
    const area = lines.slice(1, 2);
    const labelled = area.filter((row) => /[0-9]/u.test(visible(row)));
    expect(labelled).toHaveLength(1);
    // `1`, not the data's `0.82` — the bounds snap outward to a nice number now
    // (§3d, C04 I29), and the top of a derived range is one of the two ends that
    // does. The revert this row guards is unaffected: it is about *how many*
    // labels a one-row area gets, and the answer is still one.
    expect(visible(area[0] ?? "")).toContain("1");
  });
});
