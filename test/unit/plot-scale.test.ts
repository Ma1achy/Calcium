/**
 * SC — a scale transforms the shared coordinate (C04 I81, §3al).
 *
 * **Measured before the rule**: `yScale: "symlog"` and `"time"` chose their
 * ticks and moved no sample — `line/symlog` was a linear curve with symlog tick
 * values at linear rows, `line/time` read raw seconds — and `yScale: "log"` had
 * the same defect on y with no fixture (F189). The rows here read both arms'
 * output and the coordinate itself; each names the mutation that fails it.
 */
import { describe, expect, it } from "vitest";
import { block } from "../../src/data/viewmodel/index.js";
import { normalisedOf, scaled } from "../../src/data/viewmodel/range.js";
import { positionalDecisions } from "../../src/presentation/plot/figure.js";
import { FACING_DEFAULT, rowOf } from "../../src/presentation/plot/scale.js";
import { plotToSvg } from "../../src/presentation/plot/svg.js";
import { DARK_THEME } from "../support/render.js";
import { CATALOGUE_FORMS } from "../../tools/catalogue-forms.js";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — a `.mjs` instrument with no declarations, like its siblings.
import { CAPS, frameFor, stripSgr } from "../../tools/plot-catalogue.mjs";

const caps = CAPS as readonly { name: string; caps: Record<string, unknown> }[];
const frame = frameFor as (s: unknown, c: unknown, w: number) => readonly string[];
const strip = stripSgr as (s: string) => string;
const full = caps.find((c) => c.name === "24bit")?.caps ?? caps[0]!.caps;

/** The gutter's labels, as `row → text`, read from a rendered frame's area rows. */
function gutterLabels(lines: readonly string[], rows: number): Map<number, string> {
  const out = new Map<number, string>();
  // Row 0 is the top rule; the area rows follow it. A label is whatever sits
  // left of the `┤`/`│`/`+`/`|` that opens the area.
  lines.slice(1, rows + 1).forEach((l, i) => {
    const m = /^\s*([^│┤|+\s][^│┤|+]*?)\s*[│┤|+]/.exec(strip(l));
    if (m?.[1] !== undefined && m[1] !== "") out.set(i, m[1]);
  });
  return out;
}

describe("C04 I81 — a scale is a transform on the shared coordinate", () => {
  it("SC1 (C04 I81): symlog and log place a value through the transform; linear and time do not", () => {
    const sym = { min: -1000, max: 1000, scale: "symlog" as const };
    // Linear would put -100 at 0.45 of the span; symlog puts it at
    // (symlog(-100) - symlog(-1000)) / (symlog(1000) - symlog(-1000)).
    const want = (Math.log10(101) * -1 + Math.log10(1001)) / (2 * Math.log10(1001));
    expect(normalisedOf(-100, sym, false)).toBeCloseTo(want, 6);
    expect(normalisedOf(-100, { min: -1000, max: 1000 }, false)).toBeCloseTo(0.45, 6);
    // Odd about zero, so a symmetric range keeps zero at the centre.
    expect(scaled(-7, sym)).toBeCloseTo(-scaled(7, sym), 12);
    expect(normalisedOf(0, sym, false)).toBeCloseTo(0.5, 12);
    // The log family: 100 is mid-way between 10 and 1000, whatever the base.
    for (const scale of ["log", "log2", "ln", { log: 7 }] as const) {
      expect(normalisedOf(100, { min: 10, max: 1000, scale }, false), String(scale)).toBeCloseTo(0.5, 12);
    }
    // A log range that is not wholly positive is linear — the condition
    // `niceLogAxis` falls back on, so samples and ticks fall back together.
    expect(normalisedOf(5, { min: 0, max: 10, scale: "log" }, false)).toBeCloseTo(0.5, 12);
    // `time` is seconds on a linear scale.
    expect(normalisedOf(30, { min: 0, max: 120, scale: "time" }, false)).toBeCloseTo(0.25, 12);
    // Mutation: `scaled` returning `v` for every scale → the first, fourth and
    // fifth assertions fail.
  });

  it("SC2 (C04 I81): line/symlog — the gutter's label and the sample it names share one row map, and the picture is symlog-shaped", () => {
    const spec = CATALOGUE_FORMS.line["symlog"]!;
    const rows = spec.height ?? 10;
    const labels = gutterLabels(frame(spec, full, 80), rows);
    // The transform, read from the frame: at ten rows over ±1000 a linear map
    // puts 0 and -10 on one row (0.5 against 0.505 of the span); symlog spreads
    // them two rows apart and pushes ±100 to within a row of the ends.
    expect([...labels.values()], "the labels a symlog axis keeps at ten rows").toEqual(["1000", "0", "-10", "-1000"]);
    const zeroRow = [...labels.entries()].find(([, t]) => t === "0")![0];
    const tenRow = [...labels.entries()].find(([, t]) => t === "-10")![0];
    expect(tenRow - zeroRow, "-10 is two rows below 0 under symlog").toBe(2);
    // And the label's row is the row a sample of that value is rasterised on:
    // both go through `rowOf` against the axis's own range, which carries the
    // scale the ticks were chosen for.
    const axis = positionalDecisions(block({ kind: "plot", id: "s", ...spec } as never) as never).value!;
    expect(axis.range.scale, "the axis range carries the scale").toBe("symlog");
    expect(rowOf(-10, axis.range, rows, FACING_DEFAULT)).toBe(tenRow);
    expect(rowOf(0, axis.range, rows, FACING_DEFAULT)).toBe(zeroRow);
    expect(rowOf(-100, axis.range, rows, FACING_DEFAULT), "-100 sits one row above the bottom, where the gap rule drops it").toBe(rows - 2);
    // Mutation: `axisFor` returning `axis` without attaching the scale → the
    // scale assertion and the label list fail together (the frame is linear again).
  });

  it("SC3 (C04 I81): line/time — round-interval ticks read as durations, and a declared format wins", () => {
    const spec = CATALOGUE_FORMS.line["time"]!;
    const text = frame(spec, full, 80).map(strip).join("\n");
    expect(text, "two days is 48h").toMatch(/\b48h\b/);
    expect(text, "the top end is a duration").toMatch(/71h 59m/);
    expect(text, "no raw seconds").not.toMatch(/172800|259145/);
    const raw = frame({ ...spec, yFormat: "number" }, full, 80).map(strip).join("\n");
    expect(raw, "a declared format wins over the scale's default").toMatch(/172800/);
    // The second arm formats from the same axis.
    const svg = plotToSvg(block({ kind: "plot", id: "t", ...spec } as never) as never, DARK_THEME) ?? "";
    expect(svg).toMatch(/>48h</);
    expect(svg).not.toMatch(/>172800</);
    // Mutation: `scaleFormat` returning `format` alone → the 48h assertions fail.
  });

  it("SC4 (C04 I81): the SVG arm places a symlog tick through the same transform", () => {
    const spec = CATALOGUE_FORMS.line["symlog"]!;
    const svg = plotToSvg(block({ kind: "plot", id: "s", ...spec } as never) as never, DARK_THEME) ?? "";
    const yOf = (label: string): number => {
      const m = new RegExp(`<text x="[^"]*" y="([^"]*)"[^>]*>${label}</text>`).exec(svg);
      expect(m, `a tick labelled ${label}`).not.toBeNull();
      return Number(m![1]);
    };
    // The symlog picker's decades stop inside the data (its min is -999.6, so
    // -1000 is not a tick); -100 and -10 are, and their ratio is the transform.
    const y0 = yOf("0");
    const yHundred = yOf("-100");
    const yTen = yOf("-10");
    // Linear would put -10 a tenth of the way from 0 to -100; symlog puts it at
    // log10(11) / log10(101), about half.
    const t = (yTen - y0) / (yHundred - y0);
    expect(t).toBeCloseTo(Math.log10(11) / Math.log10(101), 2);
    // Mutation: the SVG tick placement rebuilding `{ min, max }` from
    // `axis.range` (dropping the scale) → `t` is 0.005 and this fails.
  });
});
