/**
 * VM1–VM4: the mirrored rung is a mirror (C12 I39, §3i).
 *
 * **A sweep over the extents, not a case per shape.** The defect was one row
 * of ink at every even height and none at any odd one, so a suite that picks a
 * height tests whichever side of the parity it happened to pick — which is what
 * the golden corpus did: its horizontal violin's band height is odd, so four
 * vertical frames moved under the fix and no horizontal frame did, out of 284.
 *
 * **Asserted on the ink either side of the spine**, because that is the thing a
 * reader sees. Counting rows drawn, or asserting the row indices the edges land
 * on, both pass on a figure whose rule is half a cell off its own axis — the
 * arithmetic was self-consistent throughout, which is C12 §3q's lesson one form
 * along.
 */
import { describe, expect, it } from "vitest";
import { violinColumn, violinRows } from "../../src/presentation/plot/kde.js";
import { FULL_CAPS, ASCII_CAPS } from "../support/render.js";
import type { QuartileSummary, Series } from "../../src/data/viewmodel/index.js";

/** Bimodal and skewed, so a symmetric answer is not an accident of the data. */
const SAMPLES: Series = {
  values: Array.from({ length: 240 }, (_v, i) => // cells-ok — a sample count
    (i % 3 === 0 ? 34 : 58) + Math.sin(i * 1.7) * 6 + ((i * 7) % 11) - 5), // cells-ok — a sample count
};
const Q: QuartileSummary = { min: 24, q1: 38, median: 47, q3: 57, max: 72 };
const SHARED = { min: 24, max: 72 };
/** Every extent the rung can be handed, both parities, from the floor upward. */
const EXTENTS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

const inked = (s: string): boolean => s.trim().length > 0;

/** The row every column of the figure is drawn on — the rule runs the whole width. */
function spineRowOf(rows: readonly string[]): number {
  const full = rows.findIndex((r) => inked(r) && !r.includes(" ".repeat(4)));
  return full;
}

describe("VM1 (C12 I39): the horizontal arm mirrors about its spine at every extent", () => {
  for (const caps of [FULL_CAPS, ASCII_CAPS]) {
    for (const n of EXTENTS) {
      it(`${n} rows · ${caps.unicode ? "unicode" : "ascii"}`, () => {
        const rows = violinRows(SAMPLES, 61, n, caps, Q, "rounded", undefined, SHARED);
        const spine = spineRowOf(rows);
        expect(spine).toBeGreaterThanOrEqual(0); // cells-ok — a row index
        const above = rows.slice(0, spine).filter(inked).length; // cells-ok — a row count
        const below = rows.slice(spine + 1).filter(inked).length; // cells-ok — a row count
        expect({ n, above, below }).toEqual({ n, above: below, below });
      });
    }
  }
});

describe("VM2 (C12 I39): the vertical arm mirrors about its spine at every extent", () => {
  for (const caps of [FULL_CAPS, ASCII_CAPS]) {
    for (const w of EXTENTS) {
      it(`${w} columns · ${caps.unicode ? "unicode" : "ascii"}`, () => {
        const grid = violinColumn(SAMPLES, w, 15, caps, Q, "rounded", undefined, SHARED)
          .map((r) => [...r]);
        const width = grid[0]?.length ?? 0;
        // The spine is the one column with ink in every row.
        const spine = Array.from({ length: width }, (_c, x) => x) // cells-ok — a column count
          .findIndex((x) => grid.every((r) => (r[x] ?? " ") !== " "));
        expect(spine).toBeGreaterThanOrEqual(0); // cells-ok — a column index
        const has = (x: number): boolean => grid.some((r) => (r[x] ?? " ") !== " ");
        const left = Array.from({ length: spine }, (_c, x) => x).filter(has).length; // cells-ok — a column count
        const right = Array.from({ length: width - spine - 1 }, (_c, i) => spine + 1 + i).filter(has).length; // cells-ok — a column count
        expect({ w, left, right }).toEqual({ w, left: right, right });
      });
    }
  }
});

describe("VM3 (C12 I39): the figure keeps its slot, and the spare cell precedes it", () => {
  // **Both halves matter and only one is obvious.** Returning fewer rows than
  // asked is within contract — the floor arm already does — but the band's
  // label is placed at `⌊rows ÷ 2⌋` of what comes back and its tick at
  // `x + ⌊w ÷ 2⌋`, so the padding side is what decides whether either lands on
  // the spine. Asserted here rather than in the compositor because that is
  // where the choice is made.
  for (const n of EXTENTS) {
    it(`${n} rows: the array is ${n} long and the spine sits at its midpoint`, () => {
      const rows = violinRows(SAMPLES, 61, n, FULL_CAPS, Q, "rounded", undefined, SHARED);
      expect(rows).toHaveLength(n); // cells-ok — a row count
      expect(spineRowOf(rows)).toBe(Math.floor(n / 2)); // cells-ok — a row index
    });
  }
  for (const w of EXTENTS) {
    it(`${w} columns: each row is ${w} wide and the spine sits at its midpoint`, () => {
      const grid = violinColumn(SAMPLES, w, 15, FULL_CAPS, Q, "rounded", undefined, SHARED);
      for (const r of grid) expect(r).toHaveLength(w); // cells-ok — a column count
      const cells = grid.map((r) => [...r]);
      const spine = Array.from({ length: w }, (_c, x) => x) // cells-ok — a column count
        .findIndex((x) => cells.every((r) => (r[x] ?? " ") !== " "));
      expect(spine).toBe(Math.floor(w / 2)); // cells-ok — a column index
    });
  }

  // **The floor arm, which the sweep above cannot reach** — it starts at three
  // and the fill is drawn below two. The mutation that dropped the padding
  // there survived a green run of sixty-two rows, which is the whole argument
  // for the pass.
  //
  // **And only the vertical arm has to pad.** `categoricalColumnForm` pushes
  // each band's strings into one composed row, so a short one moves every band
  // to its right; `bandedForm` stacks rows and centres a figure shorter than
  // its band, which is why the horizontal floor arm may return one row for a
  // slot of two and the label still lands on it.
  for (const w of [1, 2]) {
    it(`${w} column(s): the fill still fills its slot`, () => {
      const grid = violinColumn(SAMPLES, w, 15, FULL_CAPS, Q, "rounded", undefined, SHARED);
      for (const r of grid) expect(r).toHaveLength(w); // cells-ok — a column count
      expect(grid.some((r) => r.trim().length > 0)).toBe(true);
    });
  }
});

describe("VM4 (C12 I39): the fixture responds to the thing under test", () => {
  // `test/support/README.md`'s rule. A violin drawn from data with no spread
  // is a flat line at every extent, and *symmetric* is then true of nothing —
  // so the corpus has to be shown asymmetric before the assertion means
  // anything. Reflecting the figure and comparing is what shows it.
  it("an even extent is one cell shorter than its slot, and an odd one is not", () => {
    const at = (n: number): number =>
      violinRows(SAMPLES, 61, n, FULL_CAPS, Q, "rounded", undefined, SHARED)
        .filter(inked).length; // cells-ok — a row count
    expect(at(7)).toBe(at(8));
    expect(at(9)).toBe(at(10));
    expect(at(9)).toBeGreaterThan(at(7)); // cells-ok — a row count
  });

  it("the figure is not flat — its widest row is wider than its narrowest", () => {
    const rows = violinRows(SAMPLES, 61, 9, FULL_CAPS, Q, "rounded", undefined, SHARED)
      .filter(inked)
      .map((r) => r.trimEnd().length - r.length + r.trimStart().length); // cells-ok — a cell count
    expect(Math.max(...rows)).toBeGreaterThan(Math.min(...rows)); // cells-ok — a cell count
  });
});
