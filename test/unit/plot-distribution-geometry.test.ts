/**
 * D1–D6 — **the distribution family's shared coordinate** (C12 §3aj, C04 §3ak).
 *
 * Family 1's extraction, and the rows exist because **the frames cannot see
 * most of it**. Six open-coded normalisations became one, and the corpora that
 * would catch a divergence do not construct the cases where the six disagreed:
 *
 * | | measured |
 * |---|---|
 * | a zero-span **range** on a distribution form | **0 fixtures**, in either corpus |
 * | `plotDetail` on `ONE_PER_FORM` | **`undefined` on all five forms** |
 * | `quartiles` on `ONE_PER_FORM` | **absent for violin, ridgeline and dumbbell** |
 * | `mean === median` | 1 of 18 boxplot summaries, in the catalogue only |
 *
 * So the extraction landed with **377 golden rows compared and zero snapshots
 * written, and 956 catalogue frames at `e25a2defe7da643d` unchanged** — which is
 * the gate passing, and F256's lesson is that a gate can pass because the branch
 * it governs is taken by nothing. These are the rows that take it.
 */
import { describe, expect, it } from "vitest";
import { normalisedSummary } from "../../src/data/viewmodel/distribution.js";
import { pinnedRange } from "../../src/data/viewmodel/range.js";
import { boxplotColumn, boxplotBand, forestRow, dumbbellRow } from "../../src/presentation/plot/glyph-row.js";
import { rainColumns } from "../../src/presentation/plot/kde.js";
import { ONE_PER_FORM } from "../support/plot-forms.js";
import type { QuartileSummary } from "../../src/data/viewmodel/index.js";

const CAPS = { unicode: "full", ambiguousWidth: "narrow" } as const;
const Q: QuartileSummary = { min: 1, q1: 3, median: 5, q3: 7, max: 9 };
const R = { min: 1, max: 9 };
const DIST = ["boxplot", "violin", "ridgeline", "forest", "dumbbell"] as const;

/** The two inversions at `L = 4`, for D3b's named case. */
const L4 = (t: number): [number, number] => [4 - Math.round(t * 4), Math.round((1 - t) * 4)];

/** Which rows of a column carry ink. */
const inked = (rows: readonly string[]): number[] =>
  rows.flatMap((r, i) => (r.trim() === "" ? [] : [i]));

describe("D — the distribution family's positions", () => {
  it("D1: every position lands on [0,1], and the three fallbacks are resolved here", () => {
    const ns = normalisedSummary(Q, R);
    for (const [name, v] of Object.entries(ns)) {
      if (name === "outliers") continue;
      expect(v as number, `${name} is normalised`).toBeGreaterThanOrEqual(0);
      expect(v as number, `${name} is normalised`).toBeLessThanOrEqual(1);
    }
    expect(ns.min).toBe(0);
    expect(ns.median).toBe(0.5);
    expect(ns.max).toBe(1);

    // **The fallbacks were written out at each call site** — an interval falls
    // back to the whiskers and an estimate to the median (C12 I31) — which is
    // three chances to write one of them differently.
    expect([ns.lower, ns.upper, ns.centre], "absent members fall back").toEqual([ns.min, ns.max, ns.median]);
    const explicit = normalisedSummary({ ...Q, lower: 2, upper: 8, centre: 4 }, R);
    expect([explicit.lower, explicit.upper, explicit.centre]).toEqual([0.125, 0.875, 0.375]);
  });

  it("D2: a zero-span range is mid for every position — and no fixture constructs it", () => {
    // **The case the gate could not see.** Before the extraction the six sites
    // gave three answers here: `scaleX` said mid, `glyph-row`'s two `at`
    // closures said the floor, and `kde.ts` said `span || 1` — a rescale by one,
    // so a flat summary drew at `v - lo`.
    const ns = normalisedSummary({ min: 5, q1: 5, median: 5, q3: 5, max: 5, mean: 5 }, pinnedRange(5, 5, {}));
    for (const key of ["min", "q1", "median", "q3", "max", "lower", "upper", "centre", "mean"] as const) {
      expect(ns[key], `${key} is mid-ramp`).toBe(0.5);
    }

    // And drawn: the box sits mid-column, where it used to sit on the floor.
    const flat = boxplotColumn({ min: 5, q1: 5, median: 5, q3: 5, max: 5 }, 5, 5, 5, 7, CAPS);
    expect(inked(flat), "one row, and it is the middle one").toEqual([3]);

    // **The horizontal forms too, at odd widths.** `scaleX` keeps its own
    // degenerate rounding — `Math.floor(width / 2)` — and `Math.round(0.5 ·
    // width)` differs from it at every odd width, which is the only arithmetic
    // that could plausibly replace it. Even widths agree, so a row that tested
    // only those would pass for both readings.
    for (const w of [3, 5, 7, 9, 11]) {
      const mid = Math.floor(w / 2);
      const forest = [...forestRow({ min: 5, q1: 5, median: 5, q3: 5, max: 5 }, 5, 5, w, CAPS)];
      expect(forest.findIndex((c) => c !== " "), `forest at width ${w}`).toBe(mid);
      const bell = [...dumbbellRow(5, 5, 5, 5, w, CAPS)];
      expect(bell.findIndex((c) => c !== " "), `dumbbell at width ${w}`).toBe(mid);
      expect(mid, `and round(0.5·${w}) would differ`).not.toBe(Math.round(0.5 * w));
    }

    // **A violin's spine, which carried a sixth answer**: `span || 1` rescaled a
    // zero span by one, so a flat summary drew at `v - lo` — a position that is
    // not on the axis at all. Nothing in either corpus is a flat violin.
    // **`rainColumns`, and the assertion is *where*, not *whether*.** A
    // presence check is satisfied by every wrong position.
    //
    // **This row's first claim was wrong and a mutation said so.** It read
    // *`span || 1` was a sixth answer at a zero span*; `pad = (hi - lo) * 0.1
    // || 1` is at least 1 exactly when `hi - lo` is 0, so the span is never
    // zero and that guard is dead code. `kde.ts` already reached mid-ramp by a
    // route nothing stated — which is why the extraction moved no frame here.
    // The row stays because *where the summary sits at a flat range* is still
    // uncovered by both corpora; only the reason changed.
    const flatQ = { min: 5, q1: 5, median: 5, q3: 5, max: 5 };
    const rain = rainColumns({ values: [5, 5, 5] }, flatQ, 5, 5, 21, 5, CAPS, 0, false);
    const spine = rain.find((r) => r.trim() !== "") ?? "";
    const cols = [...spine].flatMap((c, i) => (c === " " ? [] : [i]));
    expect(cols.length, "the summary is drawn").toBeGreaterThan(0);
    // **Centred on mid-ramp**, which is the claim a symmetric figure can make.
    // Every position collapses to one value, so the figure drawn around it is
    // centred there — asserting each column *is* mid would be asserting the
    // glyph run's width instead.
    const mid = 0.5 * ([...spine].length - 1);
    const centre = ((cols[0] ?? 0) + (cols.at(-1) ?? 0)) / 2;
    expect(Math.abs(centre - mid), `centred on mid-ramp, not ${JSON.stringify(cols)}`)
      .toBeLessThanOrEqual(1);
  });

  it("D3: one summary, three renderers — the terminal's rounding is what differs", () => {
    // §3aj G5 for this family: the positions are shared and only the
    // rasterisation is each renderer's. Asserted by reconstructing each
    // renderer's index from the shared coordinate rather than by comparing
    // pictures, which is what makes it a claim about the seam.
    const ns = normalisedSummary(Q, R);
    // **Four rows, not nine, and the height is the fixture.** At nine rows every
    // position of this summary lands on an integer, so `L - round(t·L)` and
    // `round((1 - t)·L)` agree and the row passes for both readings — G5's
    // survivor in this family. `last = 3` with the median at `t = 0.5` is a
    // measured disagreement: 1 by hand, 2 through the shared inversion.
    const rows = 4;
    const last = rows - 1;
    expect(last - Math.round(ns.median * last), "the fixture fires the difference")
      .not.toBe(Math.round((1 - ns.median) * last));

    const column = boxplotColumn(Q, R.min, R.max, 5, rows, CAPS);
    // **Which row carries the median, not which rows carry ink.** `toContain`
    // over the inked set is a containment claim, and at four rows the box's
    // edges occupy both candidate rows — so the mutation moved the spine and
    // the assertion agreed with both readings. Phase 3's two survivors were
    // this same shape.
    const medianRow = column.findIndex((r) => r.includes("├") || r.includes("┤"));
    expect(medianRow, "the spine is where the hand inversion puts it")
      .toBe(last - Math.round(ns.median * last));
    expect(inked(column)).toContain(last - Math.round(ns.min * last));
    expect(inked(column)).toContain(last - Math.round(ns.max * last));

    // The band does not invert — a column index grows the way a value does.
    const w = 21;
    const band = boxplotBand(Q, R.min, R.max, w, 3, CAPS);
    const spine = band[1] ?? "";
    expect([...spine][Math.round(ns.min * (w - 1))], "the left whisker").not.toBe(" ");
    expect([...spine][Math.round(ns.max * (w - 1))], "the right whisker").not.toBe(" ");
  });

  it("D3b: the two roundings genuinely differ, which is why neither moved", () => {
    // **The control on D3's own reason.** If `L - round(t·L)` and
    // `round((1-t)·L)` agreed, the comment justifying the hand inversion would
    // be a sentence that forbids nothing — the vacuity class in prose.
    // **Searched rather than asserted, and the first draft is why.** It named
    // `t·L = 2.5, L = 6` and the two agreed — `1 - 2.5/6` is `0.5833333333333333`
    // and times six is `3.4999999999999996`, which rounds to 3. A stated
    // counter-example that is not one reads exactly like a rule being obeyed,
    // which is the vacuity class in a justification. This row caught it.
    const differ: Array<[number, number]> = [];
    for (let L = 2; L <= 24; L += 1) {
      for (let i = 0; i <= 8 * L; i += 1) {
        const t = i / (8 * L);
        if (L - Math.round(t * L) !== Math.round((1 - t) * L)) differ.push([L, t]);
      }
    }
    expect(differ.length, "the two inversions are not the same function").toBeGreaterThan(0);
    // A named one, so the row says what it found rather than only that it found
    // something: a half rounds away from zero on one side and toward it on the
    // other, so both ends of a symmetric pair round up.
    expect(L4(0.375)).toEqual([2, 3]);
  });

  it("D4: mean absent and mean at the median stay distinguishable", () => {
    // A cell holds one glyph, so the glyph names both (C12 I33, C04 I53). The
    // extraction moved the `Number.isFinite` guard into the summary, so *no
    // mean* is now `ns.mean === undefined` at three call sites instead of three
    // copies of one condition.
    expect(normalisedSummary(Q, R).mean, "no mean in, no mean out").toBeUndefined();
    expect(normalisedSummary({ ...Q, mean: Number.NaN }, R).mean, "nor a non-finite one").toBeUndefined();
    expect(normalisedSummary({ ...Q, mean: 5 }, R).mean, "a mean on the median is still a mean").toBe(0.5);

    const withMean = boxplotColumn({ ...Q, mean: 5 }, R.min, R.max, 5, 7, CAPS).join("\n");
    const without = boxplotColumn(Q, R.min, R.max, 5, 7, CAPS).join("\n");
    expect(withMean, "the collision draws its own glyph").not.toBe(without);
    expect(withMean).toContain("◈");
  });

  it("D5: a non-finite outlier is dropped rather than placed at NaN", () => {
    // C04 §3ak's mechanism one field along: every clamp downstream passes a
    // NaN through, so the drop belongs where the positions are computed.
    const ns = normalisedSummary({ ...Q, outliers: [0, Number.NaN, 10, Number.POSITIVE_INFINITY] }, R);
    expect(ns.outliers, "two finite, clamped into range").toEqual([0, 1]);
  });

  it("D6: plotDetail is the axis ONE_PER_FORM does not cross", () => {
    // **The corpus gap, asserted rather than remembered.** `plotDetail` chooses
    // a boxplot's and a violin's rung (F220), and every representative block in
    // `ONE_PER_FORM` leaves it `undefined` — so a suite indexed by form tests
    // one rung of two. The catalogue crosses it; a per-form row does not.
    //
    // This row is the record: if a representative gains a `plotDetail`, it
    // fails and says the gap closed.
    const carried = DIST.filter((f) => (ONE_PER_FORM[f] as Record<string, unknown>)["plotDetail"] !== undefined);
    expect(carried, "still uncrossed by the per-form corpus").toEqual([]);

    // And three of the five carry no `quartiles` at all, so their
    // representative block has no distribution in it to draw.
    const withQuartiles = DIST.filter((f) => (ONE_PER_FORM[f] as Record<string, unknown>)["quartiles"] !== undefined);
    expect(withQuartiles, "only two of five").toEqual(["boxplot", "forest"]);
  });

  it("D7: a forest row's interval and estimate come from the shared summary", () => {
    const q: QuartileSummary = { ...Q, lower: 2, upper: 8, centre: 4 };
    const ns = normalisedSummary(q, R);
    const w = 17;
    const row = [...forestRow(q, R.min, R.max, w, CAPS)];
    const last = w - 1;
    expect(row[Math.round(ns.lower * last)], "the interval's left tee").not.toBe(" ");
    expect(row[Math.round(ns.upper * last)], "and its right").not.toBe(" ");
    expect(row[Math.round(ns.centre * last)], "the estimate, off the median").not.toBe(" ");
  });
});
