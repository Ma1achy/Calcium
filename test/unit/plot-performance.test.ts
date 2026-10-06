/**
 * Performance tests — render cost per tick.
 *
 * **In references, not milliseconds, since RULING-a** (F1406, F1447). The rows
 * below asserted `< 150` ms each, and before that `< 50` (F809), and both were a
 * function of the machine: the 60×20 heatmap rendered in 17–22 ms idle and read
 * 54.6 ms on the CI runner, and the one-sample update below went red at 2.91
 * against 2 under the golden lane's load with no `src/` change. A wider ceiling
 * only moves the load at which it flips.
 *
 * So each subject is timed against `reference()` — a fixed workload of the same
 * kind, run interleaved with it in this process (`support/paired.ts`) — and the
 * ceiling is written in those units. Measured 2026-10-03 in the devcontainer
 * with other lanes building (load 9–13 on 11 CPUs), medians of fifteen rounds
 * across three runs: line 0.8–3.7, small multiples 2.0–4.1, pie 0.5–1.3, KDE
 * 0.5–1.0, heatmap 1.5–3.5. **25 is about six times the worst of those**, so a
 * contended run has room and a quadratic regression or a hang, which multiplies
 * the cost by tens, still fails. The milliseconds are printed with every
 * reading and asserted on by nothing.
 */
const RENDER_CEILING_REFS = 25;
import { describe, expect, it } from "vitest";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { FULL_CAPS, measurable } from "../support/render.js";
import { block, type Plot } from "../../src/data/viewmodel/index.js";
import { ONE_PER_FORM } from "../support/plot-forms.js";
import { kde } from "../../src/presentation/plot/derive.js";
import { describeReading, paired, reference } from "../support/paired.js";

const kit = () => measurable({ definitions: [plotDefinition], capabilities: FULL_CAPS });

/** The subject's cost in references, with the reading for a failure message. */
function costInReferences(subject: () => unknown): { refs: number; why: string } {
  const r = paired(subject, reference, { floorMs: 20 });
  return { refs: r.ratio, why: describeReading(r) };
}

function renderCost(b: Plot, width: number): { refs: number; why: string } {
  const k = kit();
  return costInReferences(() => k.renderToLines(b, width));
}

describe("render cost per tick", () => {
  it("500-point line at 80 columns — the common case", () => {
    const b = block({
      kind: "plot", id: "perf-line", form: "line", height: 10, axes: true,
      series: [{ values: Array.from({ length: 500 }, (_, i) => Math.sin(i * 0.1) * 50 + 50) }],
    });
    const { refs, why } = renderCost(b, 80);
    expect(refs, why).toBeLessThan(RENDER_CEILING_REFS);
  });

  it("36-form small-multiples at 120 columns — the worst case", () => {
    const facets = Object.values(ONE_PER_FORM).slice(0, 6);
    const b = block({
      kind: "plot", id: "perf-sm", form: "smallmultiples", height: 10, axes: true,
      series: [{ values: [1] }],
      facets: facets as Plot[],
    });
    const { refs, why } = renderCost(b, 120);
    expect(refs, why).toBeLessThan(RENDER_CEILING_REFS);
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
    const { refs, why } = renderCost(b, 40);
    expect(refs, why).toBeLessThan(RENDER_CEILING_REFS);
  });

  it("KDE with 1000 samples", () => {
    const data = Array.from({ length: 1000 }, (_, i) => Math.sin(i * 0.01) * 10 + Math.random() * 2);
    const points = Array.from({ length: 100 }, (_, i) => -12 + i * 0.24);
    const { refs, why } = costInReferences(() => kde(data, points));
    expect(refs, why).toBeLessThan(RENDER_CEILING_REFS);
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
    const { refs, why } = renderCost(b, 80);
    expect(refs, why).toBeLessThan(RENDER_CEILING_REFS);
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
    const b2 = block({
      kind: "plot", id: "perf-inc", form: "line", height: 10, axes: true,
      series: [{ values: [...values, 55] }],
    });

    // **Paired, and that is the whole repair** (F1406). The two arms used to be
    // timed one after the other, twenty renders each, so a burst of load
    // between them landed on one operand: 2.91 against 2 with nothing changed.
    // Interleaved round by round, the median read 0.92–1.05 at load 9–13.
    const r = paired(() => k.renderToLines(b2, 80), () => k.renderToLines(b1, 80), { floorMs: 20 });
    expect(r.ratio, describeReading(r)).toBeLessThan(2);
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
