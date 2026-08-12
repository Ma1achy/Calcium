// `tools/scan-cost.mjs` — the regime reporter's own fixture.
//
// **A timing instrument is the natural home for `VERIFYING.md` §9's second
// class**, a figure fabricated from nothing: scanning zero files is extremely
// fast, and `0 ms/pass` prints as a triumph. So the rows below are mostly about
// what it refuses to say, not what it says.
//
// The arithmetic is separated from the timing deliberately — `summarise` and
// `lines` take numbers, so this file asks whether the report is right without
// spending four seconds re-reading `src/` to find out.
import { describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — a `.mjs` instrument with no declarations, like its siblings.
import { lines, measure, median, notices, RECORDED, summarise } from "../../tools/scan-cost.mjs";

const recorded = RECORDED as {
  afterMsPerPass: number;
  afterSuiteS: number;
  beforeSuiteS: number;
  budgetMs: number;
  passes: number;
  regime: string;
};
const sum = summarise as (ms: number, files: number) => {
  files: number;
  msPerPass: number;
  suiteS: number;
  ratio: number;
};

describe("scan-cost — the regime reporter", () => {
  it("SC1: a pass that measured nothing is refused, not reported as fast", () => {
    // The fabricated-from-nothing arm. Zero files is the shape a broken walk
    // produces, and it is indistinguishable from a very quick machine unless
    // something asks.
    expect(() => sum(80, 0), "zero files scanned").toThrow(/nothing to time/u);
    expect(() => sum(0, 179), "zero milliseconds").toThrow(/nothing was measured/u);
    expect(() => sum(Number.NaN, 179), "a non-finite median").toThrow(/nothing was measured/u);
  });

  it("SC2: the suite figure scales by the pass count and the ratio by the record", () => {
    const s = sum(100, 179);
    // `budget.ts`: the suite makes 43 passes. 100 ms x 43 = 4.3 s.
    expect(s.suiteS).toBeCloseTo((100 * recorded.passes) / 1000, 6);
    expect(s.ratio).toBeCloseTo(100 / recorded.afterMsPerPass, 6);
    expect(s.files).toBe(179);
  });

  it("SC3: a machine matching the record reports 1.0x", () => {
    // **The row that gives the ratio its meaning.** A reader seeing 1.0x should
    // be able to conclude the recorded figures carry; if this arm drifted, the
    // number they act on would be wrong in the direction that reads as safe.
    const s = sum(recorded.afterMsPerPass, 179);
    expect(s.ratio.toFixed(1)).toBe("1.0");
    expect(s.suiteS).toBeCloseTo(recorded.afterSuiteS, 1);
  });

  it("SC4: the median is a median, not a mean and not the first sample", () => {
    // An outlier is exactly what a settling host produces, and a mean would
    // carry it into the reported figure. 230 is the measured settling value.
    expect(median([70, 71, 75, 78, 230])).toBe(75);
    expect(median([9, 1, 5])).toBe(5);
  });

  it("SC5: the report names both regimes and the budget", () => {
    // **Both numbers in the run's own output.** A figure that lives only in a
    // source comment is one nobody opens while a job is red, which is the whole
    // reason this instrument prints rather than asserts.
    const out = (lines as (s: unknown) => string[])(sum(120, 179)).join("\n");
    expect(out).toContain(String(recorded.afterMsPerPass));
    expect(out).toContain(String(recorded.beforeSuiteS));
    expect(out).toContain(recorded.regime);
    expect(out).toContain(String(recorded.budgetMs));

    const notes = (notices as (s: unknown) => string[])(sum(120, 179));
    expect(notes, "one notice per thing a foreign reader needs").toHaveLength(3);
    // The instruction the ratio exists to protect.
    expect(notes.join(" ")).toMatch(/re-measure rather than raise/u);
  });

  it("SC6: it measures the real tree, and the tree is not empty", () => {
    // **The end-to-end arm, and it is here because SC1 to SC5 are arithmetic.**
    // Every row above would pass with a `walk` that returns nothing and a timer
    // that never runs — this is the one that touches `src/`.
    //
    // One pass rather than five: the question is whether it measures at all,
    // and the figure itself is deliberately not asserted against a bound. A
    // threshold here would be a time-based assertion under contention (group
    // 12) inside the instrument built to explain contention.
    const s = (measure as (passes?: number) => { files: number; msPerPass: number }) (1);
    expect(s.files, "src/ has more than a hundred files").toBeGreaterThan(100);
    expect(s.msPerPass).toBeGreaterThan(0);
  }, 30_000);
});
