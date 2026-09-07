/**
 * WX — a whisker sits at its own `x` (C04 I52, C12 I109).
 *
 * **The member was read by neither arm.** `whiskersRows` spread the points
 * evenly by index and the SVG arm agreed, so `x` was dead in both — and the
 * catalogue's `line/whiskers`, with `x: i` on every sample, drew the same
 * frame either way and could not have said so. These rows read the fixture
 * that can.
 */
import { describe, expect, it } from "vitest";
import { block } from "../../src/data/viewmodel/index.js";
import { plotToSvg } from "../../src/presentation/plot/svg.js";
import { DARK_THEME } from "../support/render.js";
import { CATALOGUE_FORMS } from "../../tools/catalogue-forms.js";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — a `.mjs` instrument with no declarations, like its siblings.
import { CAPS, frameFor, stripSgr } from "../../tools/plot-catalogue.mjs";

const caps = CAPS as readonly { name: string; caps: Record<string, unknown> }[];
const frame = frameFor as (s: unknown, c: unknown, w: number) => readonly string[];
const strip = stripSgr as (s: string) => string;
const ascii = caps.find((c) => c.name === "ascii")!.caps;

/** Every whisker polyline's x in an SVG document, in document order. */
function whiskerXs(svg: string): number[] {
  // A whisker is a vertical two-point path: `M x y1 L x y2` with one x.
  return [...svg.matchAll(/<path d="M([\d.]+) [\d.]+ L([\d.]+) [\d.]+"/g)]
    .filter((m) => m[1] === m[2])
    .map((m) => Number(m[1]));
}

describe("C04 I52 — a whisker's x is where it sits", () => {
  it("WX1 (C04 I52, C12 I109): the SVG arm places a whisker on the sample its x names", () => {
    const spec = CATALOGUE_FORMS.line["whiskers"]!;
    const svg = plotToSvg(block({ kind: "plot", id: "w", ...spec } as never) as never, DARK_THEME) ?? "";
    const points = [...svg.matchAll(/<circle cx="([\d.]+)"/g)].map((m) => Number(m[1]));
    const whiskers = whiskerXs(svg);
    expect(points.length, "twelve samples").toBe(12);
    expect(whiskers.length, "twelve whiskers").toBe(12);
    // `x: i` on each sample — the whisker's column is the sample's column.
    // **This holds under the old index spread too**, because `x: i` *is* the
    // index lattice; it is the control, and WX2 is the row that separates them.
    expect(whiskers).toEqual(points);
  });

  it("WX2 (C04 I52, C12 I109): whiskers-placed — three whiskers at 2 · 3 · 9 of twelve sit there, not at the ends and the middle", () => {
    const spec = CATALOGUE_FORMS.line["whiskers-placed"]!;
    const svg = plotToSvg(block({ kind: "plot", id: "w", ...spec } as never) as never, DARK_THEME) ?? "";
    const points = [...svg.matchAll(/<circle cx="([\d.]+)"/g)].map((m) => Number(m[1]));
    const whiskers = whiskerXs(svg);
    expect(whiskers.length).toBe(3);
    expect(whiskers, "each whisker on its sample's column").toEqual([points[2], points[3], points[9]]);
    // Spread by index the three would be at the first, middle and last sample;
    // read as a ratio, (x3 - x2) / (x9 - x2) is 1/7 here and 1/2 there.
    const t = (whiskers[1]! - whiskers[0]!) / (whiskers[2]! - whiskers[0]!);
    // The SVG writes three decimals, so the ratio is exact to about 1e-5.
    expect(t).toBeCloseTo(1 / 7, 4);
    // Mutation: `annotationMarks` placing by `i / (n - 1)` again → `t` is 0.5.
  });

  it("WX3 (C04 I52, C12 I109): the terminal arm agrees — the ascii whiskers stand on the placed columns", () => {
    const spec = CATALOGUE_FORMS.line["whiskers-placed"]!;
    const lines = frame(spec, ascii, 80).map(strip);
    // The area's rows are between the two rules; a whisker is a run of `|`
    // inside them. The frame's own borders are the columns holding `|` or `+`
    // (a tick row's `+`) on every area row; a whisker column is any other
    // column holding a `|`.
    const area = lines.slice(1).filter((l) => /[|+]/.test(l) && !/^\s*\++-/.test(l));
    const rule = new Map<number, number>();
    const bar = new Set<number>();
    for (const row of area) [...row].forEach((ch, c) => {
      if (ch === "|" || ch === "+") rule.set(c, (rule.get(c) ?? 0) + 1);
      if (ch === "|") bar.add(c);
    });
    const border = [...rule.entries()].filter(([, n]) => n === area.length).map(([c]) => c);
    const cols = [...bar].filter((c) => !border.includes(c)).sort((a, b) => a - b);
    expect(cols.length, "three whisker columns").toBe(3);
    const t = (cols[1]! - cols[0]!) / (cols[2]! - cols[0]!);
    // 1/7 of the span, to within the rounding of one column at this width.
    expect(t).toBeGreaterThan(0.05);
    expect(t).toBeLessThan(0.25);
    // Mutation: `whiskerAt` ignoring `xDomain` → the middle whisker is half-way and `t` is 0.5.
  });
});
