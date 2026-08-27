/**
 * G0–G5 — C12 §3aj's gate, and **the row the gate could not have** (F256).
 *
 * The gate reads *the shared-geometry refactor lands in its own commit and zero
 * golden frames change*. Run for the first time, it passed — and **it also
 * passed against a deliberately broken refactor**, because no golden frame and
 * no catalogue frame constructs the case hazard 1 names. Measured, by counting
 * the branch: **0 hits across 1780 catalogue frames and 0 across the golden
 * suite.**
 *
 * So *zero frames changed* is evidence about the cases the frames construct and
 * nothing else, and the gate needs a companion that constructs the rest. These
 * are it.
 */
import { describe, expect, it } from "vitest";
import { rowOf, seriesRange, FACING_DEFAULT } from "../../src/presentation/plot/scale.js";
import { niceAxis } from "../../src/presentation/plot/axes.js";
import { normalisedOf, pinnedRange } from "../../src/data/viewmodel/range.js";
import type { Facing } from "../../src/presentation/plot/scale.js";
import { plotToSvg, svgFamilyOf, SVG_DEFAULT_LAYOUT } from "../../src/presentation/plot/svg.js";
import { violinColumn, violinRows } from "../../src/presentation/plot/kde.js";
import { FULL_CAPS } from "../support/render.js";
import { b } from "../../src/shell/builders/index.js";
import { DARK_THEME } from "../support/render.js";

const DOWN: Facing = { x: "right", y: "down" };
const UP: Facing = { x: "right", y: "up" };

describe("G — the shared layer, and the rounding that stays behind", () => {
  it("G0 (§3aj hazard 1): a flat line's cell answer is not its normalised one, at every even height", () => {
    // **The case the corpus never builds.** `rowOf` answers `floor(last / 2)`
    // for a constant series; routing that through the normalised layer gives
    // `round(0.5 · last)`, and the two disagree **at every even row count** —
    // not at a rare boundary. 2, 4, 6, 8, 10, 12 all differ by one cell.
    const disagree: number[] = [];
    for (let rows = 1; rows <= 12; rows += 1) {
      const last = rows - 1;
      const range = { min: 7, max: 7 };
      expect(rowOf(5, range, rows, DOWN), `rows=${String(rows)}`).toBe(Math.floor(last / 2));
      // The facing cannot move it: a flat line has no direction to reverse.
      expect(rowOf(5, range, rows, UP)).toBe(rowOf(5, range, rows, DOWN));
      if (Math.floor(last / 2) !== Math.round(0.5 * last)) disagree.push(rows);
    }
    expect(disagree, "every even height, which is why this is not a corner").toEqual([2, 4, 6, 8, 10, 12]);
  });

  it("G2/G5 (§3aj): away from the flat line, rowOf is normalisedOf and a rounding — nothing else", () => {
    // **The gate's G5 asserted directly**: only the rasterisation differs, so
    // the terminal path must be reconstructible from the normalised coordinate.
    // Anything `rowOf` does that this cannot reproduce is geometry that did not
    // move to the shared layer.
    for (const range of [{ min: 0, max: 1 }, { min: -50, max: 50 }, { min: 1e-9, max: 2e-9 }]) {
      for (const rows of [1, 2, 3, 8, 13, 40]) {
        for (const facing of [DOWN, UP]) {
          for (const v of [-100, range.min, (range.min + range.max) / 2, range.max, 100]) {
            expect(
              rowOf(v, range, rows, facing),
              `v=${String(v)} rows=${String(rows)} ${facing.y}`,
            ).toBe(Math.round(normalisedOf(v, range, facing.y !== "down") * Math.max(0, rows - 1)));
          }
        }
      }
    }
  });

  it("G2 (§3aj hazard 1, C04 I29): the clamp is the shared layer's, because it is about the pin", () => {
    // An out-of-range sample is pressed against the bound it exceeded — a
    // statement about the pin and not about cells — so a rasteriser receiving
    // `1.4` would have to know C04 I29 to draw it. It never receives one.
    const range = { min: 0, max: 10 };
    expect(normalisedOf(-5, range, false), "below clamps").toBe(0);
    expect(normalisedOf(15, range, false), "above clamps").toBe(1);
    expect(normalisedOf(15, range, true), "and the facing mirrors after the clamp").toBe(0);
    for (const v of [-1e9, 1e9]) {
      expect(normalisedOf(v, range, false)).toBeGreaterThanOrEqual(0);
      expect(normalisedOf(v, range, false)).toBeLessThanOrEqual(1);
    }
  });

  it("G1 (§3aj): niceAxis is unit-free, so the tick geometry is already shared", () => {
    // **The gate's "measure before starting", as a row.** `niceAxis(range,
    // maxTicks, pin)` takes no width, no capabilities and no `cells()` — so the
    // same ticks serve both targets by construction rather than by agreement,
    // and only the *label rendering* is the terminal's.
    expect(niceAxis.length, "range, maxTicks, pin — and no width").toBe(3);
    const range = { min: 0, max: 97 };
    const a = niceAxis(range, 5, {});
    const b = niceAxis(range, 5, {});
    expect(a).toEqual(b);
    // **Not asserted here: what a pin does to the ticks.** The first draft
    // claimed `yMax: 100` puts 100 at the top and it does not — measured, the
    // last tick stays 97. That is C12's ruling about ticks and this row is about
    // *units*; a guess about a neighbouring behaviour dressed as a corollary is
    // how a row comes to fail for a reason it was not written about.
    expect(niceAxis(range, 5, { yMin: 0, yMax: 100 })).toEqual(niceAxis(range, 5, { yMin: 0, yMax: 100 }));
  });

  it("G1c (§3ak.37): the violin's estimate is sampled at the terminal's width, and that is the refusal", () => {
    // **The refusal `violin` and `ridgeline` keep, stated as a symbol so it can
    // expire.** `SVG_FAMILY` records *their datum is `series` — samples for a
    // kernel estimate — and this path computes no density*, which is true and is
    // not the blocker: a density **could** be computed above both arms, exactly
    // as `densitySeries` already is for the `density` form, at a resolution the
    // shared layer chooses.
    //
    // **What blocks it is where the resolution comes from.** `violinRows` — the
    // default orientation's arm — takes `areaWidth` and evaluates the estimate at
    // one point per **cell**: `const w = Math.max(1, Math.floor(areaWidth))`, then
    // a point per `i < w`. That width is the terminal's runtime columns, which
    // C12 may not read outside `lifecycle.ts` and which the second arm has no
    // analogue for. So a shared curve would be sampled somewhere else, and
    // resampling it to `w` is not the same numbers — the terminal's frames move,
    // and this pass freezes them.
    //
    // **F314 found three derivations computed in a renderer that never reached
    // the seam, and the KDE is that shape**, which is why the check is written
    // down rather than assumed. The difference is that those three were
    // resolution-free — `ecdfSeries` is a function of `values.length`,
    // `densitySeries` takes its 100 as an argument, `binValues` bins — and this
    // one is not.
    //
    // **Asserted by arity, like `G1`**: the day `violinRows` stops taking a
    // width, this row fails and the refusal is re-read against the tree rather
    // than carried (commitment 64).
    // `Function.length` counts parameters before the first default, so this is
    // `series, areaWidth, rowsPerCategory, caps, quartiles?` — five, and the
    // width is the second of them.
    expect(violinRows.length, "series, areaWidth, rowsPerCategory, caps, quartiles — a width among them").toBe(5);
    expect(violinColumn.length, "and its transpose takes a column width too").toBe(5);
    expect(svgFamilyOf("violin"), "so both stay refused").toBeNull();
    expect(svgFamilyOf("ridgeline"), "and so does the form built on the same estimate").toBeNull();

    // **And the estimate really does move with the width**, which is the claim
    // the arity stands for: same data, two widths, different curves — where a
    // shared geometry would give one curve rasterised twice.
    const sr = { label: "s", values: [1, 1, 2, 3, 5, 5, 5, 8, 13] };
    const at = (w: number): string => violinRows(sr, w, 5, FULL_CAPS).join("|");
    expect(at(40), "a wider area is not the narrow one padded").not.toBe(at(20));
  });

  it("G1b (§3aj hazard 3): the layout ladder is cell-bound, and that is the ruling", () => {
    // **Hazard 3 says anything measured in cells stays in cells**, so this row
    // is not a defect report — it records which side of the line `layoutFor`
    // sits on, and fails if someone moves it. `seriesRange`/`pinnedRange` are
    // the value axis and take no width at all.
    expect(seriesRange.length, "series, pin, bars — no width").toBe(3);
    expect(pinnedRange.length, "min, max, pin").toBe(3);
  });
});

describe("G9 — the shared coordinate at a zero span (C04 §3ak)", () => {
  it("G9a: a constant range is mid-ramp, not NaN", () => {
    // `pinnedRange` collapses a constant field to `{v, v}` — C04's own table,
    // *drawn mid-ramp* — and this is the function that turned it into `0 / 0`.
    const flat = pinnedRange(5, 5, {});
    expect(flat, "the range collapses rather than widening").toEqual({ min: 5, max: 5 });
    expect(normalisedOf(5, flat, false)).toBe(0.5);
    expect(normalisedOf(5, flat, true), "and inverting the midpoint is the midpoint").toBe(0.5);
  });

  it("G9b: the clamp cannot repair a NaN, which is why the guard is before it", () => {
    // **The mechanism, stated so a future `??`-style repair does not read as
    // equivalent.** `NaN < 0` is false and `NaN > 1` is false, so a value that
    // fails every comparison passes a guard written as a range check.
    expect(Number.NaN < 0, "a range check cannot see it").toBe(false);
    expect(Number.NaN > 1, "in either direction").toBe(false);
    for (const invert of [false, true]) {
      const t = normalisedOf(5, { min: 5, max: 5 }, invert);
      expect(Number.isNaN(t), `invert=${invert} yields a number`).toBe(false);
    }
  });

  it("G9c: the SVG arm drew a path that painted nothing", () => {
    // The measured defect. A well-formed `<path>` with NaN coordinates is past
    // every containment assertion, every element count and the empty-marks
    // refusal — it rasterises to a blank plot area with correct furniture.
    const flat = b.plot({ id: "flat", form: "line", height: 6, series: [{ label: "s", values: [5, 5, 5] }] });
    const svg = plotToSvg(flat, DARK_THEME) ?? "";
    const d = /<path d="([^"]*)"/u.exec(svg)?.[1] ?? "";
    expect(d, "the curve is drawn").not.toBe("");
    expect(d.includes("NaN"), "and every coordinate is a number").toBe(false);

    // And it sits mid-area, which is where the terminal puts a flat line.
    const ys = [...d.matchAll(/[ML](?:[\d.]+) ([\d.]+)/gu)].map((m) => Number(m[1]));
    const mid = (SVG_DEFAULT_LAYOUT.height * SVG_DEFAULT_LAYOUT.pad
      + SVG_DEFAULT_LAYOUT.height * (1 - SVG_DEFAULT_LAYOUT.gutter)) / 2;
    for (const y of ys) expect(y, "mid-ramp").toBeCloseTo(mid, 6);
  });

  it("G9d: rowOf keeps its own degenerate rounding, so no terminal frame moves", () => {
    // **The half that makes this one function rather than nine** (§3aj hazard 1).
    // `Math.floor(0.5 · last)` and `Math.round(0.5 · last)` differ at every even
    // height, which is what G0 catches — so the guard stays in the renderer and
    // the shared answer is what everything *without* a guard now gets.
    for (const rows of [2, 3, 4, 5, 6, 7, 8]) {
      const last = rows - 1;
      expect(rowOf(5, { min: 5, max: 5 }, rows, FACING_DEFAULT), `${rows} rows`).toBe(Math.floor(last / 2));
    }
    // The two disagree at every even row count, which is the whole reason.
    const differ = [2, 4, 6, 8].filter((rows) => Math.floor((rows - 1) / 2) !== Math.round(0.5 * (rows - 1)));
    expect(differ, "even heights are where the rounding stage shows").toEqual([2, 4, 6, 8]);
  });
});
