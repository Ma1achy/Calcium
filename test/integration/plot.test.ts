// C12 tier 4 — C12 against C09, C02, C10 and C11.
//
// The seams, and one of them is the reason `sparkline` is a function at all: a
// `Cell.spark` cannot come through the registry, so C11 imports C12 directly and
// the two must produce the same glyphs from the same values.
import { describe, expect, it } from "vitest";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { plotDefinition, sparkline } from "../../src/presentation/plot/index.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import { PLOT_CORPUS, lossCurve, plotOf, psTable } from "../support/blocks.js";
import {
  ASCII_CAPS,
  DARK_THEME,
  FULL_CAPS,
  MONO_CAPS,
  measurable,
  visible,
} from "../support/render.js";
import { checkMeasurement } from "../../src/testing/measurement-conformance.js";
import { createTranscriptStore } from "../../src/viewport/transcript/index.js";
import { RenderCache } from "../../src/shell/render-cache.js";
import { createViewport } from "../../src/viewport/viewport/index.js";
import { measureSequence } from "../support/viewport.js";
import { doc } from "../support/blocks.js";
import { block, type Plot } from "../../src/data/viewmodel/index.js";

const withPlot = (): ReturnType<typeof measurable> =>
  measurable({ definitions: [plotDefinition] as never });

describe("C12 tier 4 — with C09", () => {
  it("T4.1: a registered `plot` behaves as a built-in under the generic suite", () => {
    const m = withPlot();
    expect(checkMeasurement(m, PLOT_CORPUS).failures).toEqual([]);

    // And through `measureSequence`, which is the path a document takes: a plot's
    // height contributes exactly what `measure` said it would.
    const r = createBlockRegistry({});
    r.register(plotDefinition as never);
    const one = plotOf({ height: 6 });
    const two = plotOf({ id: "second", height: 4 });
    expect(r.measureSequence([one, two], 80)).toBe(r.measure(one, 80) + r.measure(two, 80));
  });

  it("T4.1: and it is not in the defaults — the extension path is the only path", () => {
    expect(createBlockRegistry({}).kinds).not.toContain("plot");
  });
});

describe("C12 tier 4 — with C02", () => {
  it("T4.2 (I9): ASCII and Unicode agree on row and column counts exactly", () => {
    const unicode = measurable({ definitions: [plotDefinition] as never, capabilities: FULL_CAPS });
    const ascii = measurable({ definitions: [plotDefinition] as never, capabilities: ASCII_CAPS });

    // **The grid, not the row.** I9 says the two forms occupy an identical cell
    // grid — same width, same height, same measured rows. It does not say each row
    // has the same trimmed length, and it cannot: braille has two dot columns per
    // cell and the ramp has one, so the same sample lands in a different cell and
    // the rightmost inked cell of a given row differs by one. Asserting per-row
    // equality was a stricter claim than the invariant, and it failed on a real
    // difference that is not a defect.
    for (const b of PLOT_CORPUS) {
      for (const width of [40, 60, 80, 120]) {
        const u = unicode.renderToLines(b, width);
        const a = ascii.renderToLines(b, width);
        expect(a.length, `${b.id} at ${String(width)}`).toBe(u.length);
        expect(ascii.measure(b, width)).toBe(unicode.measure(b, width));
        for (const row of [...a, ...u]) {
          expect([...visible(row)].length, `${b.id} at ${String(width)}`).toBeLessThanOrEqual(width);
        }
      }
    }
  });

  it("T4.2 (I9): the ASCII axis is `+-|` and carries no box drawing", () => {
    const ascii = measurable({ definitions: [plotDefinition] as never, capabilities: ASCII_CAPS });
    const rendered = ascii.renderToLines(plotOf({}), 60).map(visible).join("\n");
    expect(rendered).toContain("+");
    expect(rendered).toContain("|");
    expect(rendered).not.toContain("└");
    expect(rendered).not.toContain("│");
  });
});

describe("C12 tier 4 — with C10", () => {
  it("T4.3: geometry is identical at every colour depth", () => {
    const depths = [24, 8, 4, 1] as const;
    const single = plotOf({ height: 6 });

    const shapes = depths.map((colourDepth) => {
      const m = measurable({
        definitions: [plotDefinition] as never,
        capabilities: { ...FULL_CAPS, colourDepth },
        theme: DARK_THEME,
      });
      return m.renderToLines(single, 60).map((row) => [...visible(row)].length);
    });

    for (const shape of shapes) expect(shape).toEqual(shapes[0]);
  });

  it("T4.3: only the 1-bit multi-series case changes form, and not its total height", () => {
    const two = plotOf({ id: "two", height: 8, series: 2 });
    const colour = measurable({ definitions: [plotDefinition] as never, capabilities: FULL_CAPS });
    const mono = measurable({ definitions: [plotDefinition] as never, capabilities: MONO_CAPS });

    expect(mono.measure(two, 60)).toBe(colour.measure(two, 60));
    // **The form changes and the *place* of the name changes with it.** Stacked
    // strips carry each series' label in the gutter; overlaid, the same name is
    // in a legend. Asserting the name is absent with colour was true until the
    // legend landed, and the legend naming the series is what it is for — so the
    // row now says where, which is the distinction it was reaching for.
    const gutterOf = (rows: readonly string[]): string =>
      rows.map((r) => r.split(/[│|┤+]/u)[0] ?? "").join("");
    expect(gutterOf(mono.renderToLines(two, 60).map(visible)), "stacked names its strips")
      .toContain("series 1");
    expect(gutterOf(colour.renderToLines(two, 60).map(visible)), "overlaid does not")
      .not.toContain("series 1");
  });
});

describe("C12 tier 4 — with C11", () => {
  it("T4.4: `sparkline` is the seam, and both sides produce the same glyphs", () => {
    // The reason the export exists (C12 §2): a cell is not a block, so C11 cannot
    // reach the rasteriser through the registry. What must hold is that the block
    // form and the cell form agree — `b.spark(…)` and a `spark` column are the
    // same series at the same width.
    const values = lossCurve(12);
    const cell = sparkline(values, 8, FULL_CAPS);

    const spark = block({
      kind: "plot",
      id: "spark",
      form: "sparkline",
      series: [{ values }],
    }) as Plot;
    const rendered = visible(withPlot().renderToLines(spark, 8)[0] ?? "");

    expect(rendered).toBe(cell);
    expect([...cell]).toHaveLength(8);
  });

  it("T4.4: a sparkline contributes zero extra rows to a table", () => {
    // Asserted from C12's side, as §2 says. The table's own height is C11's, and a
    // cell carrying a series must not change it — which is what makes C11's column
    // planning indifferent to a spark.
    const m = measurable({ definitions: [tableDefinition, plotDefinition] as never });
    const table = psTable({ rows: 4 });
    expect(m.measure(table, 120)).toBe(1 + 4);
  });

  it("T4.4: and the function is right at any width, not only at 8", () => {
    // C11's `spark` column declares a minimum of 8 with no flex, but a planner
    // distributing residual can make it wider — so 8 is a floor, not an
    // assumption, and A01 A.2's "last 8 points" is the case where width is 8.
    for (const width of [1, 4, 8, 13, 40]) {
      expect([...sparkline(lossCurve(40), width, FULL_CAPS)], `width ${String(width)}`).toHaveLength(
        width,
      );
    }
  });
});

describe("C12 tier 4 — a growing series", () => {
  it("T4.6: a series growing by one point re-renders at constant height", () => {
    // The property S11 depends on absolutely: a run's block is the same height at
    // epoch 2 and epoch 200, which is the only reason following a long run leaves
    // room for anything else. The viewport half of this is C13's and C14's.
    const m = withPlot();
    const full = lossCurve(200);
    const heights = new Set<number>();
    const rowCounts = new Set<number>();

    for (const n of [2, 5, 20, 100, 200]) {
      const b = block({
        kind: "plot",
        id: "watch",
        form: "line",
        height: 6,
        axes: true,
        series: [{ values: full.slice(0, n) }],
      }) as Plot;
      heights.add(m.measure(b, 80));
      rowCounts.add(m.renderToLines(b, 80).length);
    }

    expect([...heights]).toEqual([9]);
    expect([...rowCounts]).toEqual([9]);
  });

  it("T4.5: a plot in an expanded table row shifts blocks by its height", () => {
    const store = createTranscriptStore();
    const viewport = createViewport(store, { width: 80, height: 10, measureSequence });
    const plot = plotOf({ id: "p", form: "line", height: 6, points: 40 });
    store.append(doc({ blocks: [block({ kind: "raw", id: "before", text: "before" })] }));
    const id = store.append(doc({ blocks: [block({ kind: "raw", id: "x", text: "x" })] }), {
      streaming: true,
    });
    const before = viewport.scroll.totalRows;

    store.patch(id, { op: "append", block: plot });

    // The plot's declared height is what the transcript grew by — a `line` plot
    // measures its `height` exactly (C12), so this is the delta with no slack.
    expect(viewport.scroll.totalRows - before).toBe(measureSequence([plot], 80));
  });
  // C13 landed and supplies the streaming half — a series patched tick by tick
  // into a held document. "Does not move the viewport" is the other half, and a
  // viewport is what does not exist.
  it("T4.7: a live plot re-renders one entry, and its siblings keep their cache", () => {
    // **The animation claim, tested where it can run.** The plan's version is a
    // tier-5 row counting bytes on the wire; `node-pty` has no prebuild for this
    // container, so thirteen of sixteen tier-5 files fail to *load* and a row
    // written there would be unverified. The mechanism the byte count is a proxy
    // for is here: `RenderCache` keys on `(rev, width, focus, theme)`, a patch
    // bumps one entry's `rev`, and every sibling is a hit.
    const cache = new RenderCache();
    const lines = (n: number): readonly string[] => [`row ${String(n)}`];
    for (const id of ["a", "b", "c"]) cache.set(id, 1, 80, "", "dark", lines(1));

    // One entry patched: its own slot misses and the other two hit.
    cache.set("b", 2, 80, "", "dark", lines(2));
    expect(cache.get("b", 1, 80, "", "dark"), "the patched entry's old rev is gone").toBeUndefined();
    for (const id of ["a", "c"]) {
      expect(cache.get(id, 1, 80, "", "dark"), `${id} is untouched`).toEqual(["row 1"]);
    }
    // And the patched entry's *new* rev is what it was given.
    expect(cache.get("b", 2, 80, "", "dark")).toEqual(["row 2"]);
    // A width change misses everywhere, which is the other axis of the key: a
    // resize is not a patch, and nothing is reusable across it.
    for (const id of ["a", "b", "c"]) {
      expect(cache.get(id, id === "b" ? 2 : 1, 81, "", "dark"), `${id} at a new width`).toBeUndefined();
    }
    expect(cache.size, "and no slot is added by a patch").toBe(3); // cells-ok — a slot count
  });

  it("T4.8 (C12 I1): a hundred patches never move the plot, and the gutter widens once", () => {
    // **The wrinkle exercised deliberately rather than discovered later.** The
    // gutter's *width* is data-dependent — `layoutFor` sizes it from the y-range
    // — so a value crossing 99 → 100 widens the label column and shifts the plot
    // area one column sideways on that tick. It never breaks I1, which is about
    // rows, and it has an escape valve: pin `yMin`/`yMax`.
    const m = withPlot();
    const heights = new Set<number>();
    const gutters = new Set<number>();
    for (let n = 1; n <= 100; n += 1) { // cells-ok — a tick count
      const b = block({
        kind: "plot", id: "live", form: "line", height: 6, axes: true,
        series: [{ values: Array.from({ length: 12 }, (_, i) => (n * (i + 1)) / 12) }],
      });
      const rows = m.renderToLines(b, 60).map(visible);
      heights.add(rows.length); // cells-ok — a row count
      gutters.add((rows.find((r) => r.includes("┤")) ?? "").indexOf("┤")); // cells-ok — a column index
    }
    expect(heights.size, "the height never moves").toBe(1); // cells-ok — a set size
    expect(gutters.size, "and the gutter does, exactly where the digits do")
      .toBeGreaterThan(1); // cells-ok — a set size

    // Pinned, it does not: the escape valve, asserted so it is a documented
    // answer rather than folklore.
    const pinned = new Set<number>();
    for (let n = 1; n <= 100; n += 1) { // cells-ok — a tick count
      const b = block({
        kind: "plot", id: "live", form: "line", height: 6, axes: true, yMin: 0, yMax: 100,
        series: [{ values: Array.from({ length: 12 }, (_, i) => (n * (i + 1)) / 12) }],
      });
      const rows = m.renderToLines(b, 60).map(visible);
      pinned.add((rows.find((r) => r.includes("┤")) ?? "").indexOf("┤")); // cells-ok — a column index
    }
    expect(pinned.size, "pinned, the gutter holds still").toBe(1); // cells-ok — a set size
  });

  it("T4.6: a streamed series does not move the viewport", () => {
    const store = createTranscriptStore();
    const viewport = createViewport(store, { width: 80, height: 6, measureSequence });
    const id = store.append(
      doc({ blocks: [plotOf({ id: "p", form: "line", height: 6, points: 10 })] }),
      { streaming: true },
    );
    store.append(doc({ blocks: [block({ kind: "raw", id: "r", text: "reading" })] }));
    for (let i = 0; i < 30; i += 1) {
      store.append(doc({ blocks: [block({ kind: "raw", id: `f${i}`, text: `filler ${i}` })] }));
    }
    viewport.scrollToBottom();
    viewport.scrollBy(-4);
    const visibleBefore = viewport.visible();

    // The series grows; its declared height does not, so nothing moves at all.
    for (let tick = 0; tick < 20; tick += 1) {
      store.patch(id, {
        op: "replace",
        blockId: "p",
        block: plotOf({ id: "p", form: "line", height: 6, points: 10 + tick * 5 }),
      });
    }

    expect(viewport.visible().entries).toEqual(visibleBefore.entries);
  });
});
