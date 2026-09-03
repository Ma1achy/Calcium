/**
 * Axes — nice numbers, log/time/symlog, and the gutter.
 * Tests A1–A12 from the plan, plus S1–S8 for scale types.
 */
import { describe, expect, it } from "vitest";
import { niceAxis, axisFor, niceLogAxis, niceTimeAxis, niceSymlogAxis, ticksFor } from "../../src/presentation/plot/axes.js";
import { block, type Plot } from "../../src/data/viewmodel/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { plotAreaRows } from "../../src/presentation/plot/height.js";
import { seriesRange } from "../../src/presentation/plot/scale.js";
import { FULL_CAPS, measurable } from "../support/render.js";
import { gutter } from "../support/plot-forms.js";

const pin = {};

describe("A1: nice numbers are nice (2.5 in the set)", () => {
  it("0–100 with 5 ticks includes 25, 50, 75", () => {
    const axis = niceAxis({ min: 0, max: 100 }, 5, pin);
    expect(axis.ticks).toContain(0);
    expect(axis.ticks).toContain(25);
    expect(axis.ticks).toContain(50);
    expect(axis.ticks).toContain(75);
    expect(axis.ticks).toContain(100);
  });
});

describe("A2: precision is uniform", () => {
  it("every label on one axis has the same decimal places", () => {
    const axis = niceAxis({ min: 0.1, max: 0.9 }, 5, pin);
    const places = axis.ticks.map((t) => {
      const s = String(Math.round(t * 1e9) / 1e9);
      const dot = s.indexOf(".");
      return dot === -1 ? 0 : s.length - dot - 1; // cells-ok — a character count
    });
    const maxP = Math.max(...places);
    expect(maxP).toBeLessThanOrEqual(3);
  });
});

describe("A6: the gutter is bounded", () => {
  it("niceAxis terminates on small spans", () => {
    const axis = niceAxis({ min: 0, max: 1e-300 }, 5, pin);
    expect(axis.ticks.length).toBeGreaterThan(0); // cells-ok — a tick count
  });
});

describe("A7: log₁₀ ticks at decades", () => {
  it("1–1000 produces 1, 10, 100, 1000", () => {
    const axis = niceLogAxis({ min: 1, max: 1000 }, 10, "log");
    expect(axis.ticks).toContain(1);
    expect(axis.ticks).toContain(10);
    expect(axis.ticks).toContain(100);
    expect(axis.ticks).toContain(1000);
  });

  it("dense variant includes 2 and 5", () => {
    const axis = niceLogAxis({ min: 1, max: 100 }, 20, "log");
    expect(axis.ticks).toContain(2);
    expect(axis.ticks).toContain(5);
  });
});

describe("A8: log₂ ticks at powers", () => {
  it("1–32 produces 1, 2, 4, 8, 16, 32", () => {
    const axis = niceLogAxis({ min: 1, max: 32 }, 10, "log2");
    expect(axis.ticks).toContain(1);
    expect(axis.ticks).toContain(2);
    expect(axis.ticks).toContain(4);
    expect(axis.ticks).toContain(8);
    expect(axis.ticks).toContain(16);
    expect(axis.ticks).toContain(32);
  });
});

describe("A9: ln labels as decimals", () => {
  it("ticks include e¹ ≈ 2.72", () => {
    const axis = niceLogAxis({ min: 1, max: 10 }, 10, "ln");
    const nearE = axis.ticks.some((t) => Math.abs(t - Math.E) < 0.01);
    expect(nearE).toBe(true);
  });
});

describe("A10: symlog has a linear centre", () => {
  it("values near zero are spaced linearly", () => {
    const axis = niceSymlogAxis({ min: -100, max: 100 }, 10, "symlog");
    const nearZero = axis.ticks.filter((t) => Math.abs(t) <= 1);
    expect(nearZero.length).toBeGreaterThan(0); // cells-ok — a tick count
  });
});

describe("A11: time ticks at round times", () => {
  it(":00 :15 :30 :45, not :23 :46", () => {
    const axis = niceTimeAxis({ min: 0, max: 3600 }, 5);
    for (const t of axis.ticks) {
      expect(t % 60).toBe(0);
    }
  });
});

describe("A12: time label format by span", () => {
  it("seconds produce minute-aligned ticks", () => {
    const axis = niceTimeAxis({ min: 0, max: 300 }, 5);
    expect(axis.step).toBeGreaterThanOrEqual(60);
  });
});

// --- Scale type tests (S1–S8) ---

describe("S1: log₁₀ across forms — same values, same positions", () => {
  it("axisFor with log returns log ticks", () => {
    const axis = axisFor({ min: 1, max: 1000 }, 10, pin, "log");
    expect(axis.ticks).toContain(10);
    expect(axis.ticks).toContain(100);
  });
});

describe("S2: log₂ across forms", () => {
  it("axisFor with log2 returns power-of-2 ticks", () => {
    const axis = axisFor({ min: 1, max: 64 }, 10, pin, "log2");
    expect(axis.ticks).toContain(2);
    expect(axis.ticks).toContain(4);
    expect(axis.ticks).toContain(8);
  });
});

describe("S3: ln renders without error", () => {
  it("axisFor with ln does not throw", () => {
    expect(() => axisFor({ min: 1, max: 100 }, 10, pin, "ln")).not.toThrow();
  });
});

describe("S4: symlog near zero", () => {
  it("values -0.01 and +0.01 produce distinct ticks", () => {
    const axis = axisFor({ min: -10, max: 10 }, 10, pin, "symlog");
    expect(axis.ticks.length).toBeGreaterThan(2); // cells-ok — a tick count
  });
});

describe("S6: log with zero in data", () => {
  it("does not throw — clamped or handled", () => {
    const axis = axisFor({ min: 0, max: 100 }, 5, pin, "log");
    expect(axis.ticks.length).toBeGreaterThan(0); // cells-ok — a tick count
  });
});

describe("S7: log with negative in data", () => {
  it("log does not throw on negative range", () => {
    const axis = axisFor({ min: -10, max: 100 }, 5, pin, "log");
    expect(axis.ticks.length).toBeGreaterThan(0); // cells-ok — a tick count
  });
});

describe("S8: scale on x only", () => {
  it("xScale and yScale are independent — axisFor called per axis", () => {
    const yAxis = axisFor({ min: 0, max: 100 }, 5, pin, "linear");
    const xAxis = axisFor({ min: 1, max: 1000 }, 5, pin, "log");
    expect(yAxis.ticks).toContain(0);
    expect(xAxis.ticks).toContain(100);
  });
});

describe("S9: the labels follow the scale, not just the range (C12 I15, C12 I22)", () => {
  // **The two halves of one axis, disagreeing.** `axisFor` has answered for every
  // scale since the scales landed, and `yLabels` reached straight past it for the
  // linear arm — so `positionalForm` picked log ticks, read only `.range` off
  // them, and the labels were then computed linearly from that range. Nothing
  // failed, because the set nobody drew was the correct one.
  //
  // Asserted on `yLabels` rather than on `axisFor`, which is the distinction: the
  // rows above already prove the log arm picks powers, and every one of them
  // passed while a log plot was labelled `750 · 500 · 250`.
  const range = { min: 1, max: 1000 };

  it("a log axis is labelled at powers of the base, on log rows", () => {
    const labels = gutter(range, 9, undefined, pin, "log");
    const text = labels.map((l) => l.text);
    // Every label is `{1, 2, 5} × 10^k` — a log subdivision. 750 is what
    // dividing the *span* gives, and it is not one.
    for (const t of text) expect([1, 2, 5]).toContain(Number(t) / 10 ** Math.floor(Math.log10(Number(t))));
    expect(text).not.toContain("750");
    // **And the row follows the scale** (C04 I81). This row once expected `200`
    // in the gutter, which it was — at the *linear* row, where log ticks spread
    // out; on log rows they crowd towards the top and the gap rule keeps `50`
    // instead. An interior label sits at its log row and not its linear one.
    const interior = labels.filter((l) => l.row !== 0 && l.row !== 8);
    expect(interior.length).toBeGreaterThan(0); // cells-ok — a label count
    for (const { row, text: t } of interior) {
      const v = Number(t);
      const logRow = Math.round((1 - Math.log10(v) / 3) * 8);
      const linearRow = Math.round((1 - (v - 1) / 999) * 8);
      expect(row, `${t} at its log row`).toBe(logRow);
      expect(row, `${t} not at its linear row`).not.toBe(linearRow);
    }
    // Mutation: `axisFor` not attaching the scale to the range → `50` returns
    // to row 8's neighbourhood and the log-row assertions fail.
  });

  it("and the same range without a scale is still divided linearly", () => {
    // The control, and it is the row that makes the one above about the scale
    // travelling rather than about `200` being reachable at all.
    const text = gutter(range, 9, undefined, pin).map((l) => l.text);
    expect(text).toContain("750");
    expect(text).not.toContain("200");
  });

  it("a log axis does not snap its floor outward to zero", () => {
    // `niceAxis` snaps a derived bound to a multiple of the step, which on this
    // range is 0 — and 0 is not on a log scale at all. The log arm leaves the
    // range where the data put it, and the label follows.
    expect(gutter(range, 9, undefined, pin, "log").map((l) => l.text)).toContain("1");
    expect(gutter(range, 9, undefined, pin).map((l) => l.text)).toContain("0");
  });

  it("log2 subdivides in twos and time in round intervals", () => {
    // Powers of two, and `16` is the interior label that survives on log rows —
    // `32` sits a row below `64` there and the gap rule drops it.
    const twos = gutter({ min: 1, max: 64 }, 9, undefined, pin, "log2").map((l) => l.text);
    for (const t of twos) expect(Math.log2(Number(t)) % 1, `${t} is a power of two`).toBe(0);
    expect(twos).toContain("16");
    // A `time` tick reads as a duration where no format is declared (C04 I81):
    // the half-hour tick is `30m`, not `1800`.
    const time = gutter({ min: 0, max: 3600 }, 9, undefined, pin, "time").map((l) => l.text);
    expect(time).toContain("30m");
    expect(time).not.toContain("1800");
  });
});

/**
 * YA1–YA3: the gutter is labelled from the axis the curve was drawn against
 * (C12 I15, §3d, F210).
 *
 * **A wiring claim, so it is asserted against a rendered frame.** `gutter()`
 * above composes `axisFor` with `yLabels` and cannot see whether the renderer
 * hands the gutter *its own* axis — which is exactly what it did not: it niced
 * once for the curve and `yLabels` niced again for the labels, and `niceAxis` is
 * not idempotent.
 *
 * **The heights matter and are not a round set.** Both heights the golden corpus
 * and the catalogue happen to render are in the agreeing set, which is why 312
 * committed frames and 2313 unit rows all passed over it.
 */
describe("YA1 (C12 I15, §3d): the gutter's scale is the curve's scale", () => {
  const kit = () => measurable({ definitions: [plotDefinition], capabilities: FULL_CAPS });
  const plain = (l: string): string => l.replace(/\x1b\[[0-9;]*m/gu, "");
  const SPAN = [-3.7, 0, 5, 12.4, 8, -1, 12.4, -3.7];

  /** Every non-blank gutter label of a rendered plot, top row first. */
  function labels(height: number, values: readonly number[] = SPAN): readonly string[] {
    return kit()
      .renderToLines(block({
        kind: "plot", id: "ya", form: "line", height, axes: true, series: [{ values }],
      }), 50)
      .map(plain)
      .filter((r) => /┤/u.test(r))
      .map((r) => (r.split("┤")[0] ?? "").trim());
  }

  it("the top label is the axis maximum, at a height where a second nicing widens it", () => {
    // `axisFor({-3.7, 12.4}, ticksFor(16))` is `{-5, 12.5}` at step 2.5. A second
    // pass over that span reaches for step 5 and returns `{-5, 15}` — so the row
    // holding 12.4 was labelled `15`, an error five times the label's precision.
    expect(labels(16)[0]).toBe("12.5");
  });

  it("and the bottom label is the axis minimum on the same frame", () => {
    const rows = labels(16);
    expect(rows[rows.length - 1]).toBe("-5.0");
  });

  it("the largest mark sits on the row that names its value", () => {
    // **The case with no quantisation in it.** A series whose maximum *is* the
    // axis maximum draws on the top area row, so the top label is a statement
    // about that mark and nothing else. The form corpus' `bubble` is this shape
    // — largest value 30, axis `{0, 30}` — and the gutter called that row `40`.
    expect(labels(6, [1, 8, 30, 3])[0]).toBe("30");
  });

  it("no height labels the gutter from a range the curve was not drawn on", () => {
    // The class rather than the instance: 12 of 23 heights diverged for this
    // series, and the two the corpus renders are both in the agreeing set.
    for (let height = 4; height <= 24; height += 1) { // cells-ok — a row count
      const b: Plot = block({
        kind: "plot", id: "ya", form: "line", height, axes: true, series: [{ values: SPAN }],
      }) as Plot;
      const range = axisFor(
        seriesRange(b.series, b) ?? { min: 0, max: 1 },
        ticksFor(plotAreaRows(b)), b, b.yScale,
      ).range;
      const seen = labels(height);
      expect(Number(seen[0]), `height ${height} — top label`).toBeCloseTo(range.max, 6);
      expect(Number(seen[seen.length - 1]), `height ${height} — bottom label`).toBeCloseTo(range.min, 6);
    }
  });
});
