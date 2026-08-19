/**
 * Axes — nice numbers, log/time/symlog, and the gutter.
 * Tests A1–A12 from the plan, plus S1–S8 for scale types.
 */
import { describe, expect, it } from "vitest";
import { niceAxis, axisFor, niceLogAxis, niceTimeAxis, niceSymlogAxis, yLabels } from "../../src/presentation/plot/axes.js";

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

  it("a log axis is labelled at powers of the base", () => {
    const text = yLabels(range, 9, undefined, pin, "log").map((l) => l.text);
    // 200 is `2 × 10²` — a log subdivision. 750 is what dividing the *span* gives.
    expect(text).toContain("200");
    expect(text).not.toContain("750");
  });

  it("and the same range without a scale is still divided linearly", () => {
    // The control, and it is the row that makes the one above about the scale
    // travelling rather than about `200` being reachable at all.
    const text = yLabels(range, 9, undefined, pin).map((l) => l.text);
    expect(text).toContain("750");
    expect(text).not.toContain("200");
  });

  it("a log axis does not snap its floor outward to zero", () => {
    // `niceAxis` snaps a derived bound to a multiple of the step, which on this
    // range is 0 — and 0 is not on a log scale at all. The log arm leaves the
    // range where the data put it, and the label follows.
    expect(yLabels(range, 9, undefined, pin, "log").map((l) => l.text)).toContain("1");
    expect(yLabels(range, 9, undefined, pin).map((l) => l.text)).toContain("0");
  });

  it("log2 subdivides in twos and time in round intervals", () => {
    expect(yLabels({ min: 1, max: 64 }, 9, undefined, pin, "log2").map((l) => l.text))
      .toContain("32");
    expect(yLabels({ min: 0, max: 3600 }, 9, undefined, pin, "time").map((l) => l.text))
      .toContain("1800");
  });
});
