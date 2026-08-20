// `tools/refdiff/pair.mjs` and `reference.py` — the reference comparison's fixture.
//
// **This instrument produced a wrong answer twice before it produced a right
// one, and both were the third manufacture-evidence shape** — real bytes
// reassembled by a wrong model, which is the one that looks like data.
//
//   1. `drawilleplot.show()` hardcodes a 240-pixel resize and calls
//      `Canvas.frame()` with no bounds, so the output is trimmed to the
//      bounding box of the ink. A curve drawn in the wrong half of the plot
//      comes back byte-identical to one drawn in the right half — the grid it
//      is *compared on* is derived from the answer.
//   2. The extent profile read the rightmost inked cell, which for a bar chart
//      is its value readout rather than its bar. Five different bars reported
//      one extent.
//
// Neither was visible from output that looked like braille. So the rows below
// are about the model, not the plumbing.
import { describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — a `.mjs` instrument with no declarations, like its siblings.
import { disagreement, extentError, extentProfile, inkMask, referenceRows } from "../../tools/refdiff/pair.mjs";
import { COLS, ROWS, UNISOLABLE, calciumMask } from "../../tools/refdiff/export-fixtures.js";
import { CATALOGUE_FORMS } from "../../tools/catalogue-forms.js";

const mask = inkMask as (row: string) => string;
const profile = extentProfile as (m: readonly string[]) => readonly number[];
const err = extentError as (a: readonly string[], b: readonly string[]) => { value?: number; why?: string };
const disagree = disagreement as (a: readonly string[], b: readonly string[], rows: number, cols: number) => number;
const ours = calciumMask as (spec: never) => readonly string[];
const theirs = referenceRows as (form: string) => readonly string[] | undefined;
const unisolable = UNISOLABLE as ReadonlyMap<string, string>;
const cols = COLS as number;
const rows = ROWS as number;

describe("refdiff — the grid is the model, not the answer", () => {
  it("RD1: our half declares a grid, and every row fits inside it", () => {
    // **`sparkline` is why the grid is per-form.** It is a fixed-height form —
    // one row whatever height it is handed — so a fixed 16-row grid drew
    // sixteen reference rows against our one and padded the difference with
    // blanks. It scored 10%, which is neither the truth (21.9%) nor obviously
    // wrong. The row below is the general statement of that: a form may render
    // fewer rows than asked, never more, and never a row wider than the grid.
    // **U+2800 is a printing character that looks empty.** The braille blank is
    // what an unused dot cell renders as, and a mask counting it as ink would
    // report every braille form as almost entirely covered — inflating exactly
    // the family the comparison is most useful for.
    expect(mask(" \u2800#\u28ff")).toBe("..##");

    let checked = 0;
    let fixedHeight = 0;
    for (const [form, variants] of Object.entries(CATALOGUE_FORMS)) {
      if (unisolable.has(form)) continue;
      const got = ours(Object.values(variants)[0] as never);
      expect(got.length, `${form}: rows`).toBeGreaterThan(0); // cells-ok — a row count
      expect(got.length, `${form}: rows exceed the grid`).toBeLessThanOrEqual(rows); // cells-ok — a row count
      if (got.length < rows) fixedHeight += 1;
      for (const [i, row] of got.entries()) {
        expect(row.length, `${form}: row ${String(i)} cells`).toBeLessThanOrEqual(cols); // cells-ok — a cell count
      }
      checked += 1;
    }
    // A fixture must be shown to respond to the thing under test: if no form
    // renders short, this row cannot tell a per-form grid from a fixed one.
    expect(fixedHeight, "forms rendering fewer rows than requested").toBeGreaterThan(0); // cells-ok — a form count
    console.log(`refdiff-grid — ${String(checked)}/${String(checked)} rows`);
    expect(checked).toBeGreaterThan(20); // cells-ok — a form count
  });

  it("RD2: the extent profile reads the leading run, not the rightmost ink", () => {
    // Exactly the bar chart's shape: a bar, a gap, a two-cell value readout.
    // Reading the rightmost cell makes all three bars equal; reading the
    // leading run recovers 2 : 4 : 6.
    const withReadout = ["##.....##", "####...##", "######.##"];
    expect(profile(withReadout)).toEqual([1 / 3, 2 / 3, 1]);

    // And the defect it replaced, stated as the thing that must not happen.
    const rightmost = withReadout.map((r) => r.lastIndexOf("#") + 1);
    expect(new Set(rightmost).size, "the defect: one distinct extent for three bars").toBe(1); // cells-ok — a set size
  });

  it("RD3: a form is incomparable rather than compared when the bands differ, and says why", () => {
    expect(err(["##......", "####...."], ["##......", "####...."])).toEqual({ value: 0 });
    // Different band counts must not be silently zipped to the shorter one.
    // Three bands against two is the case that reaches the count comparison —
    // *fewer than two* is checked first and is the more specific statement.
    expect(err(["#.......", "###.....", "#####..."], ["#.......", "###....."]))
      .toEqual({ why: "3 bands vs 2" });
    // Fewer than two bands says nothing about whether lengths agree.
    expect(err(["####...."], ["########"]))
      .toEqual({ why: "fewer than two bands — ours 1, theirs 1" });
    // **The reason is the point of the change.** A bare `undefined` printed a
    // dash, and a dash reads as *this form has no bands* — the opposite of the
    // truth for `bar`, `histogram` and `waffle`, which have shown one since the
    // measure landed and have bands in every frame.
    expect(err(["####...."], ["########"]).why, "an instrument that declines says why").toBeDefined();
  });

  it("RD4: disagreement is 0 for identical frames and 1 for complements", () => {
    const a = Array.from({ length: rows }, () => "#".repeat(cols));
    const b = Array.from({ length: rows }, () => ".".repeat(cols));
    expect(disagree(a, a, rows, cols)).toBe(0);
    expect(disagree(a, b, rows, cols)).toBe(1);
    // **A short frame is scored over the full grid, not over its own length.**
    // `drawilleplot` trims its output to the bounding box of the ink, so a
    // reference three rows short is the live failure mode — it would otherwise
    // score well by having fewer rows in which to be wrong.
    //
    // The obvious case does not test this. Against an all-blank `b`, trimming
    // removes matching numerator and denominator and the fraction stays 1 under
    // either reading; the empty case hits the `total === 0` guard and returns 1
    // for a third reason again. **Both readings agree on the convenient setup**,
    // and a mutation that trimmed the loop survived them both. So the frame
    // below *agrees* on the rows it has and is missing the rest: scored over
    // the grid that is 13/16 wrong, scored over its own length it is perfect.
    const short = Array.from({ length: 3 }, () => "#".repeat(cols));
    expect(disagree(a, short, rows, cols)).toBeCloseTo(13 / 16, 10);
  });

  it("RD5: every form is compared or carries a stated reason, by equality", () => {
    // **The no-silent-caps rule, run over this instrument.** A form absent from
    // a comparison reads exactly like one that passed it — which is how the
    // catalogue reached 26 of 34 with nobody noticing. Derived and compared,
    // not hand-listed.
    const all = new Set(Object.keys(CATALOGUE_FORMS));
    const excluded = new Set(unisolable.keys());
    const missing: string[] = [];
    for (const form of all) {
      if (excluded.has(form)) continue;
      if (theirs(form) === undefined) missing.push(form);
    }
    // The reference's own skip list is the other half of the record; a form in
    // neither place is an unrecorded gap.
    // Kept in step with `reference.py`'s own list — the two halves of one
    // record, and a form in neither is the gap this row exists for.
    const recorded = new Set(["smallmultiples", "pairplot", "treemap", "flame", "icicle"]);
    // `contour` is not here: it is *unisolable* rather than unreferenced, so it
    // leaves through `excluded` above. Both halves of the record still name it.
    expect(new Set(missing), "forms with neither a reference nor a recorded reason").toEqual(recorded);
    for (const form of excluded) expect(all.has(form), `${form} is excluded and is not a form`).toBe(true);
    console.log(`refdiff-coverage — ${String(all.size - excluded.size - missing.length)}/${String(all.size)} rows`);
  });
});
