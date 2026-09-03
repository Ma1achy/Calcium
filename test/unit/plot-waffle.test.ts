/**
 * WA — the waffle's hundred squares are a partition (C12 I108, §3ak.26).
 *
 * **The allocation was shared and wrong in both arms at once** (F305). Row 7 of
 * the proportion family's table ruled the square assignment *shared* and was
 * right; what it did not ask was whether the shared function summed. It did
 * not: `Math.round` per segment, filled greedily against `pos < 100`, gave
 * `50/50/1` fifty, fifty and **no square at all** for the 1% — while the legend
 * beside it read `█ Sliver 1%` — and gave `1/1/1` thirty-three each with the
 * hundredth square drawn as `surface.border`. Both frames were committed
 * baselines and both had been read.
 *
 * The rows here read the grid, both arms' output, and the fixture — the frame,
 * not only the arithmetic.
 */
import { describe, expect, it } from "vitest";
import { block } from "../../src/data/viewmodel/index.js";
import type { Segment } from "../../src/data/viewmodel/index.js";
import { WAFFLE_ROWS, waffleGrid } from "../../src/presentation/plot/figure.js";
import { waffleCells } from "../../src/presentation/plot/waffle.js";
import { plotToSvg } from "../../src/presentation/plot/svg.js";
import { DARK_THEME } from "../support/render.js";
import { CATALOGUE_FORMS } from "../../tools/catalogue-forms.js";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — a `.mjs` instrument with no declarations, like its siblings.
import { CAPS, frameFor, stripSgr } from "../../tools/plot-catalogue.mjs";

const caps = CAPS as readonly { name: string; caps: Record<string, unknown> }[];
const frame = frameFor as (s: unknown, c: unknown, w: number) => readonly string[];
const strip = stripSgr as (s: string) => string;

const seg = (values: readonly number[]): Segment[] =>
  values.map((value, i) => ({ label: `s${String(i)}`, value }));

/** Squares owned per segment, read back from the grid rather than trusted. */
function countsOf(grid: readonly number[], n: number): number[] {
  const counts = new Array<number>(n).fill(0);
  for (const owner of grid) if (owner >= 0) counts[owner] = (counts[owner] ?? 0) + 1;
  return counts;
}

/**
 * The allocation before C12 I108, reimplemented as the control: independent
 * `Math.round` per segment, greedy fill, `-1` for whatever is left.
 */
function roundedGrid(segments: readonly Segment[]): readonly number[] {
  const sum = segments.reduce((a, sg) => a + sg.value, 0);
  const scale = sum > 0 ? 100 / sum : 0;
  const grid = new Array<number>(100).fill(-1);
  let pos = 0;
  segments.forEach((sg, idx) => {
    const count = Math.round(sg.value * scale);
    for (let i = 0; i < count && pos < 100; i += 1) grid[pos++] = idx;
  });
  return grid;
}

const FULL = { unicode: "full", ambiguousWidth: "narrow", colourDepth: 24 } as const;

describe("C12 I108 — the hundred squares partition the segments", () => {
  it("WA1 (C12 I108, §3ak.26): largest remainder — 50/50/1 → 50/49/1, 1/1/1 → 34/33/33, tie to the first", () => {
    const over = waffleGrid(seg([50, 50, 1]));
    expect(countsOf(over, 3), "over-100: the sliver owns a square").toEqual([50, 49, 1]);
    expect(over.includes(-1), "over-100: no square is unowned").toBe(false);

    const under = waffleGrid(seg([1, 1, 1]));
    // **The tie-break is a decision and this is where it is asserted**: three
    // equal remainders of a third, one square over, and it goes to the earlier
    // segment. `33/34/33` would be arithmetically as good and is a different
    // picture.
    expect(countsOf(under, 3), "under-100: the extra square goes to the first").toEqual([34, 33, 33]);
    expect(under.includes(-1), "under-100: no square is unowned").toBe(false);

    // The catalogue's `default` sums to exactly a hundred and does not move.
    expect(countsOf(waffleGrid(seg([65, 25, 10])), 3)).toEqual([65, 25, 10]);

    // A hundred squares, whatever the shares sum to.
    for (const values of [[3, 3, 3, 1], [7, 11, 13], [0.1, 0.2, 99.7], [1, 200], [5, 0, 5]]) {
      const grid = waffleGrid(seg(values));
      expect(grid.length).toBe(WAFFLE_ROWS * WAFFLE_ROWS);
      expect(countsOf(grid, values.length).reduce((a, c) => a + c, 0), `${values.join("/")} sums to a hundred`).toBe(100);
      expect(grid.includes(-1), `${values.join("/")} leaves nothing unowned`).toBe(false);
    }
    // A negative value is a share of nothing — clamped as `sharesOf` clamps it.
    expect(countsOf(waffleGrid(seg([-5, 50, 50])), 3)).toEqual([0, 50, 50]);

    // **The one exception**: shares of nothing own nothing.
    const zero = waffleGrid(seg([0, 0, 0]));
    expect(zero.every((o) => o === -1), "all-zero: every square unowned").toBe(true);
    expect(waffleGrid([]).every((o) => o === -1), "no segments: every square unowned").toBe(true);

    // **The control**: the old allocation fails the two rows above, in the two
    // directions the fixtures were built to show.
    expect(countsOf(roundedGrid(seg([50, 50, 1])), 3), "control: rounding dropped the sliver").toEqual([50, 50, 0]);
    expect(roundedGrid(seg([1, 1, 1])).filter((o) => o === -1).length, "control: rounding left a square").toBe(1);
  });

  it("WA2 (C12 I108): the legend names no share the mosaic lacks — over every catalogue waffle, in both arms", () => {
    const variants = Object.entries(CATALOGUE_FORMS.waffle);
    expect(variants.length, "the corpus has the fixtures this row reads").toBeGreaterThanOrEqual(4);
    for (const [name, spec] of variants) {
      const segments = spec.segments ?? [];
      const total = segments.reduce((a, sg) => a + sg.value, 0);
      const grid = waffleGrid(segments);
      const counts = countsOf(grid, segments.length);

      // The terminal arm: every segment with a share has a cell carrying its index.
      const rows = waffleCells(segments, 20, FULL);
      const inked = new Set(rows.flat().map((c) => c.segmentIndex));
      // The SVG arm: every segment with a share has a rect in its palette slot.
      const svg = plotToSvg(block({ kind: "plot", id: "w", ...spec } as never), DARK_THEME);
      expect(svg, `${name}: the second arm draws`).not.toBeNull();
      const fills = new Map<string, number>();
      for (const m of (svg ?? "").matchAll(/<rect [^>]*fill="(#[0-9a-f]{6})"/g)) fills.set(m[1]!, (fills.get(m[1]!) ?? 0) + 1);

      segments.forEach((sg, i) => {
        if (total > 0 && sg.value > 0) {
          expect(counts[i], `${name}: "${sg.label}" (${String(sg.value)}) owns a square`).toBeGreaterThan(0);
          expect(inked.has(i), `${name}: "${sg.label}" is inked in the terminal mosaic`).toBe(true);
        }
      });
      if (total > 0) {
        // Distinct fills in the SVG: one per owning segment, plus none for `-1`
        // (the grid has none) — a hundred squares over exactly the owners.
        const owners = counts.filter((c) => c > 0).length;
        const squareFills = [...fills.values()].filter((c) => c <= 100 && c > 0);
        expect(squareFills.reduce((a, c) => a + c, 0), `${name}: the SVG mosaic is a hundred squares`).toBeGreaterThanOrEqual(100);
        expect(owners, `${name}: every owner has a colour`).toBeLessThanOrEqual(fills.size);
      }
    }
    // The control fails on `over-100`: the old allocation gave "Sliver" nothing.
    const over = CATALOGUE_FORMS.waffle["over-100"]!.segments ?? [];
    expect(countsOf(roundedGrid(over), over.length)[2]).toBe(0);
  });

  it("WA3 (C12 I108, §3ak.26): the `waffle/all-zero` fixture responds — the `scale = 0` arm, reached", () => {
    const zero = CATALOGUE_FORMS.waffle["all-zero"]!;
    const dflt = CATALOGUE_FORMS.waffle["default"]!;
    expect((zero.segments ?? []).every((sg) => sg.value === 0), "the fixture is all zero").toBe(true);
    expect(waffleGrid(zero.segments ?? []).every((o) => o === -1)).toBe(true);

    const cellsZero = waffleCells(zero.segments ?? [], 20, FULL).flat();
    const cellsDflt = waffleCells(dflt.segments ?? [], 20, FULL).flat();
    expect(cellsZero.every((c) => c.segmentIndex === -1), "every terminal cell is unowned").toBe(true);
    expect(cellsDflt.some((c) => c.segmentIndex >= 0), "and the default's are not — the fixture differs where the rule governs").toBe(true);

    const svgZero = plotToSvg(block({ kind: "plot", id: "w", ...zero } as never), DARK_THEME);
    const svgDflt = plotToSvg(block({ kind: "plot", id: "w", ...dflt } as never), DARK_THEME);
    expect(svgZero).not.toBeNull();
    expect(svgZero === svgDflt, "the SVG document differs from the default's").toBe(false);
    // **The legend reads `0%` for every segment** — the mosaic draws nothing of
    // them and the reading says so. Before the ruling the slots carried names and
    // swatches with no reading at all, in both arms (see the findings record).
    const texts = [...(svgZero ?? "").matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
    for (const sg of zero.segments ?? []) {
      expect(texts, `the legend names "${sg.label}" and reads 0% beside it`).toContain(`${sg.label} 0%`);
    }
    // And the terminal legend says the same — read from the frame.
    const text = frame(zero, caps[0]!.caps, 80).map((l) => strip(l)).join("\n");
    for (const sg of zero.segments ?? []) expect(text).toMatch(new RegExp(`${sg.label} +0%`));
    expect(text.includes("No data"), "an all-zero waffle is not `No data.` — the pie's answer, recorded as a split").toBe(false);
  });
});
