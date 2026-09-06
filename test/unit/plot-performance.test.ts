/**
 * Performance tests — render cost per tick.
 *
 * **One ceiling, with both figures beside it** (F809; F262's shape). The rows
 * below asserted `< 50` each, under a header that named 16 ms as the target —
 * a figure no row here has met: the 60×20 heatmap renders in **17–22 ms** on an
 * idle developer machine (three runs, 2026-09-05) and read **54.6 ms** on the CI
 * runner the same day, which `make regime` measured at **2.7×** the recorded
 * machine on the scan benchmark. A 50 ms ceiling over a 19 ms render leaves a
 * 2.7× host no room, so the row's verdict was a function of the runner's load:
 * green on two runs, red on the third, no `src/` change between them. The
 * ceiling is the asymmetry, not the odds — a green run costs nothing extra and a
 * load-dependent red costs a session — and a quadratic regression or a hang
 * still fails: 150 is under three times the runner's own reading.
 */
const RENDER_CEILING_MS = 150;
import { describe, expect, it } from "vitest";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { FULL_CAPS, measurable } from "../support/render.js";
import { block, type Plot } from "../../src/data/viewmodel/index.js";
import { ONE_PER_FORM } from "../support/plot-forms.js";
import { kde } from "../../src/presentation/plot/derive.js";

const kit = () => measurable({ definitions: [plotDefinition], capabilities: FULL_CAPS });

function timeRender(b: Plot, width: number, iterations = 10): number {
  const k = kit();
  k.renderToLines(b, width);
  const start = performance.now();
  for (let i = 0; i < iterations; i++) k.renderToLines(b, width);
  return (performance.now() - start) / iterations;
}

describe("render cost per tick", () => {
  it("500-point line at 80 columns — the common case", () => {
    const b = block({
      kind: "plot", id: "perf-line", form: "line", height: 10, axes: true,
      series: [{ values: Array.from({ length: 500 }, (_, i) => Math.sin(i * 0.1) * 50 + 50) }],
    });
    const ms = timeRender(b, 80);
    expect(ms).toBeLessThan(RENDER_CEILING_MS);
  });

  it("36-form small-multiples at 120 columns — the worst case", () => {
    const facets = Object.values(ONE_PER_FORM).slice(0, 6);
    const b = block({
      kind: "plot", id: "perf-sm", form: "smallmultiples", height: 10, axes: true,
      series: [{ values: [1] }],
      facets: facets as Plot[],
    });
    const ms = timeRender(b, 120);
    expect(ms).toBeLessThan(RENDER_CEILING_MS);
  });

  it("pie at radius 20 — Bresenham circle", () => {
    const b = block({
      kind: "plot", id: "perf-pie", form: "pie", height: 20,
      series: [],
      segments: [
        { label: "A", value: 40 },
        { label: "B", value: 30 },
        { label: "C", value: 20 },
        { label: "D", value: 10 },
      ],
    });
    const ms = timeRender(b, 40);
    expect(ms).toBeLessThan(RENDER_CEILING_MS);
  });

  it("KDE with 1000 samples", () => {
    const data = Array.from({ length: 1000 }, (_, i) => Math.sin(i * 0.01) * 10 + Math.random() * 2);
    const points = Array.from({ length: 100 }, (_, i) => -12 + i * 0.24);
    const start = performance.now();
    for (let i = 0; i < 10; i++) kde(data, points);
    const ms = (performance.now() - start) / 10;
    expect(ms).toBeLessThan(RENDER_CEILING_MS);
  });

  it("60×20 heatmap with continuous palette — the monitor load", () => {
    const rows = Array.from({ length: 20 }, (_, r) => ({
      values: Array.from({ length: 60 }, (_, c) => Math.sin((r + c) * 0.1) * 50 + 50),
      label: `r${String(r)}`,
    }));
    const b = block({
      kind: "plot", id: "perf-heat", form: "heatmap", height: 20, axes: true,
      series: rows,
      colormap: "viridis",
    });
    const ms = timeRender(b, 80);
    expect(ms).toBeLessThan(RENDER_CEILING_MS);
  });
});

describe("incremental rendering", () => {
  it("a one-sample update is not much slower than the initial render", () => {
    const values = Array.from({ length: 500 }, (_, i) => Math.sin(i * 0.1) * 50 + 50);
    const b1 = block({
      kind: "plot", id: "perf-inc", form: "line", height: 10, axes: true,
      series: [{ values }],
    });
    const k = kit();
    k.renderToLines(b1, 80);
    const start1 = performance.now();
    for (let i = 0; i < 20; i++) k.renderToLines(b1, 80);
    const ms1 = (performance.now() - start1) / 20;

    const b2 = block({
      kind: "plot", id: "perf-inc", form: "line", height: 10, axes: true,
      series: [{ values: [...values, 55] }],
    });
    const start2 = performance.now();
    for (let i = 0; i < 20; i++) k.renderToLines(b2, 80);
    const ms2 = (performance.now() - start2) / 20;

    expect(ms2 / ms1).toBeLessThan(2);
  });
});

describe("memory", () => {
  it("100 braille grids at 80×24 allocate without error", () => {
    const facets = Array.from({ length: 10 }, (_, i) =>
      block({
        kind: "plot", id: `mem-${String(i)}`, form: "scatter", height: 5, axes: true,
        series: Array.from({ length: 10 }, (_, j) => ({
          values: Array.from({ length: 50 }, (_, k) => Math.sin((i + j + k) * 0.1)),
        })),
      }),
    );
    const k = kit();
    expect(() => {
      for (const f of facets) k.renderToLines(f, 80);
    }).not.toThrow();
  });
});
