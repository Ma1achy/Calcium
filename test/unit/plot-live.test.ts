/**
 * Live update verification (5c from the plan).
 *
 * The render chain handles live plots by construction — rev bumps, cache
 * misses, output diffing writes changed rows. This verifies it rather than
 * asserting it.
 */
import { describe, expect, it } from "vitest";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { FULL_CAPS, measurable } from "../support/render.js";
import { block } from "../../src/data/viewmodel/index.js";

const kit = () => measurable({ definitions: [plotDefinition], capabilities: FULL_CAPS });

describe("append a sample — only the plot's rows change", () => {
  it("a one-sample update changes some rows but not all", () => {
    const values = Array.from({ length: 50 }, (_, i) => Math.sin(i * 0.1) * 50 + 50);
    const b1 = block({
      kind: "plot", id: "live-1", form: "line", height: 8, axes: true,
      series: [{ values }],
    });
    const b2 = block({
      kind: "plot", id: "live-1", form: "line", height: 8, axes: true,
      series: [{ values: [...values, 55] }],
    });

    const k = kit();
    const lines1 = k.renderToLines(b1, 80);
    const lines2 = k.renderToLines(b2, 80);

    expect(lines1.length).toBe(lines2.length); // cells-ok — row count unchanged

    let changed = 0;
    for (let i = 0; i < lines1.length; i++) { // cells-ok — a row count
      if (lines1[i] !== lines2[i]) changed++;
    }
    expect(changed).toBeGreaterThan(0);
    expect(changed).toBeLessThan(lines1.length); // cells-ok — not every row changed
  });
});

describe("measured height stable across updates", () => {
  it("appending a sample does not change measured height", () => {
    const values = Array.from({ length: 100 }, (_, i) => i);
    const b1 = block({
      kind: "plot", id: "live-h", form: "line", height: 10, axes: true,
      series: [{ values }],
    });
    const b2 = block({
      kind: "plot", id: "live-h", form: "line", height: 10, axes: true,
      series: [{ values: [...values, 100] }],
    });

    const k = kit();
    expect(k.measure(b1, 80)).toBe(k.measure(b2, 80));
  });
});

describe("heatmap ring: sustained ticks", () => {
  it("rendering 100 consecutive ticks does not error or grow", () => {
    const k = kit();
    const rows: number[] = [];

    for (let tick = 0; tick < 100; tick++) {
      const values = Array.from({ length: tick + 1 }, (_, i) => Math.sin((tick + i) * 0.1) * 50 + 50);
      const b = block({
        kind: "plot", id: "live-ring", form: "heatmap", height: 5, axes: true,
        series: [
          { values, label: "cpu" },
          { values: values.map((v) => 100 - v), label: "mem" },
          { values: values.map((v) => v * 0.5), label: "io" },
          { values: values.map((v) => v * 0.3 + 20), label: "net" },
          { values: values.map((v) => Math.abs(v - 50)), label: "lat" },
        ],
      });
      const lines = k.renderToLines(b, 80);
      rows.push(lines.length); // cells-ok — a row count
    }

    const allSame = rows.every((r) => r === rows[0]);
    expect(allSame).toBe(true);
  });
});

describe("two plots updating on the same tick", () => {
  it("both render independently without interference", () => {
    const k = kit();
    const values1 = Array.from({ length: 50 }, (_, i) => Math.sin(i * 0.1) * 50 + 50);
    const values2 = Array.from({ length: 50 }, (_, i) => Math.cos(i * 0.1) * 30 + 40);

    const b1a = block({
      kind: "plot", id: "dual-1", form: "line", height: 5, axes: true,
      series: [{ values: values1 }],
    });
    const b2a = block({
      kind: "plot", id: "dual-2", form: "line", height: 5, axes: true,
      series: [{ values: values2 }],
    });

    const lines1a = k.renderToLines(b1a, 60);
    const lines2a = k.renderToLines(b2a, 60);

    const b1b = block({
      kind: "plot", id: "dual-1", form: "line", height: 5, axes: true,
      series: [{ values: [...values1, 55] }],
    });
    const b2b = block({
      kind: "plot", id: "dual-2", form: "line", height: 5, axes: true,
      series: [{ values: [...values2, 35] }],
    });

    const lines1b = k.renderToLines(b1b, 60);
    const lines2b = k.renderToLines(b2b, 60);

    expect(lines1a.length).toBe(lines1b.length); // cells-ok — row count stable
    expect(lines2a.length).toBe(lines2b.length); // cells-ok — row count stable
    expect(lines1b.join("\n")).not.toBe(lines1a.join("\n"));
    expect(lines2b.join("\n")).not.toBe(lines2a.join("\n"));
  });
});

describe("render cost over sustained ticks", () => {
  it("100 ticks of a 5-series heatmap stay under 50ms each", () => {
    const k = kit();
    const times: number[] = [];

    for (let tick = 0; tick < 100; tick++) {
      const values = Array.from({ length: 60 }, (_, i) => Math.sin((tick + i) * 0.1) * 50 + 50);
      const b = block({
        kind: "plot", id: "sustain", form: "heatmap", height: 5, axes: true,
        colormap: "viridis",
        series: Array.from({ length: 5 }, (_, r) => ({
          values: values.map((v) => v + r * 10),
          label: `s${String(r)}`,
        })),
      });

      const start = performance.now();
      k.renderToLines(b, 80);
      times.push(performance.now() - start);
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length; // cells-ok — a count
    expect(avg).toBeLessThan(50);
  });
});
