/**
 * G3–G5 — the image path, and **the hazards get subjects** (C12 §3aj, phase 3).
 *
 * A hazard with no subject is a hazard nobody can fail, which is the shape
 * §3aj.1 found in the gate itself. So these land with the path rather than
 * after it.
 *
 * **G4's row fires at the seam and not at the output**, because the gate says
 * its violation *is discovered as a wrong-looking image rather than as an
 * error* — an assertion about pixels would be discovering it exactly that way.
 */
import { describe, expect, it } from "vitest";
import { sourceOf } from "../support/source.js";
import sharp from "sharp";
import {
  plotToSvg,
  svgLayout,
  svgPoints,
  SVG_DEFAULT_LAYOUT,
  SVG_FAMILY,
  SVG_FONT_SIZE,
} from "../../src/presentation/plot/svg.js";
import { rowOf, FACING_DEFAULT } from "../../src/presentation/plot/scale.js";
import { normalisedOf } from "../../src/data/viewmodel/range.js";
import { decodePng } from "../../src/presentation/image/index.js";
import { COLORMAPS, sample as sampleMap } from "../../src/presentation/theme/colormap.js";
import { rgbOf } from "../support/theme.js";
import { DARK_THEME as THEME } from "../support/render.js";
import { b } from "../../src/shell/builders/index.js";
import type { PlotForm } from "../../src/data/viewmodel/index.js";

const VALUES = [1, 4, 2, 8, 5, 9, 3, 7];
const RANGE = { min: 1, max: 9 };
const block = b.plot({ id: "p", form: "line", height: 8, series: [{ label: "s", values: VALUES }] });

/**
 * A source file with its comments removed.
 *
 * **Both G-rows below failed on their own documentation first.** `svg.ts`
 * explains *why `layoutFor` is not reachable from this file* and `range.ts`
 * explains *`cells()` is not reachable here* — so a matcher over the raw text
 * reported the violation each was written to deny. **An assertion about a source
 * file that does not strip comments is measuring the prose**, and prose about a
 * mechanism is denser than the mechanism, so the false positive is the likely
 * direction rather than the unlucky one.
 */
const sampleHex = (map: Parameters<typeof sampleMap>[0] | undefined, t: number): string =>
  map === undefined ? "" : sampleMap(map, t);

const src = sourceOf;

describe("G3–G5 — the second renderer", () => {
  it("G3 (§3aj hazard 3): the image path's layout is its own, in its own units", () => {
    // *Anything measured in cells stays in cells; the image renderer needs its
    // own.* So `svgLayout` takes pixels and no capabilities — there is nothing
    // cell-shaped to give it — and its interior is **fractions**, which a cell
    // layout cannot express because a gutter of 3.4 columns is not a gutter.
    expect(svgLayout.length, "width and height, and no caps").toBe(2);
    const layout = svgLayout(800, 400);
    expect(layout.gutter, "a share of the width").toBeGreaterThan(0);
    expect(layout.gutter, "and never a count").toBeLessThan(1);
    expect(layout.pad).toBeLessThan(1);
    // The same fractions at any size: a layout that scaled with the output
    // would be sizing something to content, which is where metrics come back.
    expect(svgLayout(80, 40).gutter).toBe(layout.gutter);

    // **`layoutFor` is not reachable from this file**, which is the ruling
    // rather than an accident — asserted on the artefact, because "we did not
    // import it" is exactly the kind of claim that quietly stops being true.
    const svg = src("src/presentation/plot/svg.ts");
    expect(/\blayoutFor\b/u.test(svg), "the cell ladder stays in the cell path").toBe(false);
    expect(/\bAXIS_GUTTER\b|\bMIN_AREA\b|\blabelWidth\b/u.test(svg), "and so do its constants").toBe(false);
  });

  it("G4 (§3aj hazard 4): the shared layer cannot reach cells(), and the image path never calls it", () => {
    // **At the seam, not at the output.** The gate says this one is discovered
    // as a wrong-looking image; a pixel assertion would be discovering it that
    // way. The seam is structural: `data/` may not import `presentation/`, so
    // `cells()` is not reachable from the shared layer and a shared layout
    // that reached for it would not compile.
    const shared = src("src/data/viewmodel/range.ts");
    expect(/\bcells\s*\(/u.test(shared), "the shared layer does not measure cells").toBe(false);
    expect(/from "\.\.\/\.\.\/presentation/u.test(shared), "and could not if it wanted to").toBe(false);

    // The image path is under the same rule by choice rather than by layer, so
    // it is asserted directly. `cells()` means nothing to a `<text>` element:
    // ambiguous width, grapheme clustering and the wide arm are all facts about
    // a terminal grid.
    const svg = src("src/presentation/plot/svg.ts");
    expect(/\bcells\s*\(/u.test(svg), "the image path never measures a label").toBe(false);
    expect(/ambiguousWidth|TerminalCapabilities/u.test(svg), "and holds no terminal fact").toBe(false);

    // **The control**: the terminal path *does* measure, so the rows above are
    // about the seam rather than about `cells(` being a rare string.
    expect(/\bcells\s*\(/u.test(src("src/presentation/plot/axes.ts")), "the cell path measures").toBe(true);
  });

  it("G5 (§3aj): one block, two paths, one coordinate — only the rasterisation differs", () => {
    // **The gate's G5, asserted rather than described.** Both paths call
    // `normalisedOf`; the terminal one multiplies by `rows - 1` and rounds, the
    // image one multiplies by a pixel height and does not. A sample that
    // disagreed would mean the shared layer is not what one of them uses.
    const rows = 8;
    const layout = SVG_DEFAULT_LAYOUT;
    const top = layout.height * layout.pad;
    const bottom = layout.height * (1 - layout.gutter);
    const points = svgPoints(VALUES, RANGE, layout);
    for (const [i, v] of VALUES.entries()) {
      const t = normalisedOf(v, RANGE, true);
      expect(rowOf(v, RANGE, rows, FACING_DEFAULT), `cells, sample ${String(i)}`).toBe(
        Math.round(t * (rows - 1)),
      );
      expect(points[i]?.[1], `pixels, sample ${String(i)}`).toBeCloseTo(top + (bottom - top) * t, 6);
    }
    // **A pinned range with samples outside it, because the first fixture could
    // not tell the shared layer from a copy of it.** Every value in `1..9` on a
    // range of `1..9` normalises the same whether the clamp runs or not, so a
    // mutation replacing `normalisedOf` with open-coded arithmetic survived the
    // rows above. The clamp is C04 I29 — an out-of-range sample presses against
    // the bound it exceeded — and it is the only thing here a copy gets wrong.
    const pinned = { min: 2, max: 6 };
    const outside = [-40, 2, 4, 6, 40];
    const clamped = svgPoints(outside, pinned, layout);
    expect(clamped[0]?.[1], "far below pins to the floor's pixel").toBeCloseTo(bottom, 6);
    expect(clamped[4]?.[1], "far above pins to the ceiling's").toBeCloseTo(top, 6);
    expect(clamped[0]?.[1], "and never escapes the plot area").toBe(clamped[1]?.[1]);
    expect(clamped[4]?.[1]).toBe(clamped[3]?.[1]);
    // A span under 1, where open-coded arithmetic reaches for a guard the
    // shared layer does not need.
    const narrow = { min: 0, max: 0.5 };
    expect(svgPoints([0, 0.25, 0.5], narrow, layout)[2]?.[1], "a small span is not a special case").toBeCloseTo(top, 6);

    // Ordering agrees between the two, which is the reader-visible consequence:
    // the highest sample is the topmost row and the topmost pixel.
    const hi = VALUES.indexOf(Math.max(...VALUES));
    const lo = VALUES.indexOf(Math.min(...VALUES));
    expect(rowOf(VALUES[hi] as number, RANGE, rows, FACING_DEFAULT)).toBeLessThan(
      rowOf(VALUES[lo] as number, RANGE, rows, FACING_DEFAULT),
    );
    expect(points[hi]?.[1]).toBeLessThan(points[lo]?.[1] as number);
  });

  it("G5b (§3aj): the SVG rasterises, and the ink is where the coordinate says", async () => {
    // **Read the frame, not the string.** An SVG that asserts as text can still
    // be a picture of nothing — `sharp` is the reader, already in the ledger for
    // the catalogue's own frames, so this costs no dependency.
    const svg = plotToSvg(block, THEME);
    expect(svg, "a curve form renders").not.toBeNull();
    const png = await sharp(Buffer.from(svg ?? "")).png().toBuffer();
    const decoded = decodePng(new Uint8Array(png));
    expect(decoded.ok, "the SVG is a valid picture").toBe(true);
    if (!decoded.ok) return;
    expect(decoded.pixels.width).toBe(SVG_DEFAULT_LAYOUT.width);
    expect(decoded.pixels.height).toBe(SVG_DEFAULT_LAYOUT.height);

    // The curve's ink, found by its own colour, and compared against the
    // coordinate rather than against a golden.
    const px = decoded.pixels;
    const [ir, ig, ib] = rgbOf("categorical.c1", THEME);
    let inkTop = px.height;
    let inkBottom = -1;
    for (let y = 0; y < px.height; y += 1) {
      for (let x = 0; x < px.width; x += 1) {
        const i = (y * px.width + x) * 4;
        // The first categorical slot, with the rasteriser's antialiasing
        // tolerated. The ground and the rule are more than 40 per channel away
        // from it, so the window cannot pick up furniture.
        if (
          Math.abs((px.data[i] ?? 0) - ir) < 40 &&
          Math.abs((px.data[i + 1] ?? 0) - ig) < 40 &&
          Math.abs((px.data[i + 2] ?? 0) - ib) < 40
        ) {
          if (y < inkTop) inkTop = y;
          if (y > inkBottom) inkBottom = y;
        }
      }
    }
    expect(inkBottom, "the curve was drawn").toBeGreaterThan(0);
    const layout = SVG_DEFAULT_LAYOUT;
    const top = layout.height * layout.pad;
    const bottom = layout.height * (1 - layout.gutter);
    // The maximum sample is at t=0 and the minimum at t=1, so the ink spans the
    // whole plot area — within a stroke's half-width.
    expect(inkTop, "the peak sits where normalisedOf(9) puts it").toBeCloseTo(top, -1);
    expect(inkBottom, "and the trough where it puts 1").toBeCloseTo(bottom, -1);
  });

  it("G5c: a label places itself, which is the whole of what SVG buys", () => {
    // A `<text>` with `text-anchor="end"` needs no width to sit right-aligned
    // against the gutter. Nothing computed its extent, and that is hazard 4's
    // answer visible in one attribute.
    const svg = plotToSvg(block, THEME) ?? "";
    expect(svg).toContain('text-anchor="end"');
    expect(svg.match(/<text /gu)?.length ?? 0, "one per tick").toBeGreaterThan(1);
    // And a label that would break the document is escaped rather than measured.
    const risky = b.plot({ id: "r", form: "line", height: 4, series: [{ label: "a<b&c", values: [1, 2] }] });
    expect((plotToSvg(risky, THEME) ?? "").includes("a<b&c"), "raw markup never reaches the output").toBe(false);
  });
});
/**
 * **Every form the path claims, driven by one table** (§3aj.3).
 *
 * Two rules carried from the first form, and both are the reason this is
 * parameterised rather than written per form:
 *
 *   1  **the gutter-in-fractions rule is the one convenience violates** — the
 *      mutation that pins it to the output must run against *every* form, not
 *      the first. One `describe.each` makes that structural: the mutation is on
 *      `svgLayout`, so a row per form is a check per form by construction
 *   2  **a form whose samples sit inside its range cannot tell a shared
 *      coordinate from an open-coded one** (G5's survivor). So every row pins a
 *      range and puts samples outside it
 */
const SAMPLES = [-40, 2, 5, 8, 40];
const PIN = { yMin: 2, yMax: 8 } as const;

const supported = (Object.entries(SVG_FAMILY) as [PlotForm, string | null][])
  .filter(([, family]) => family !== null)
  .map(([form]) => form);

describe.each(supported)("G6 — %s", (form) => {
  const made = b.plot({
    id: `f-${form}`,
    form,
    height: 8,
    ...PIN,
    series: [{ label: "s", values: SAMPLES }],
  });

  it("renders, and its ink stays inside the fractional plot area", () => {
    const layout = svgLayout(600, 300);
    const svg = plotToSvg(made, THEME, layout);
    expect(svg, "a claimed form draws something").not.toBeNull();
    if (svg === null) return;
    const left = layout.width * (layout.gutter + layout.pad);
    const right = layout.width * (1 - layout.pad);
    // **Every x in the document, checked against the fractional bounds.** A
    // gutter pinned to a label's width moves `left` and this fails — which is
    // the point of running it per form rather than once.
    const xs = [...svg.matchAll(/(?:\bx|cx|x1|x2)="([-\d.]+)"/gu)]
      .map((m) => Number(m[1]))
      .filter((v) => Number.isFinite(v) && v !== 0);
    expect(xs.length, "the form drew marks with coordinates").toBeGreaterThan(0);
    for (const x of xs) {
      expect(x, `${form}: an x left of the gutter`).toBeGreaterThanOrEqual(left - 8);
      expect(x, `${form}: an x past the right pad`).toBeLessThanOrEqual(right + 1);
    }
    // The gutter is a share: the same fractions at a different output size.
    expect(svgLayout(1200, 600).gutter).toBe(layout.gutter);
  });

  it("clamps a sample outside the pinned range — the shared coordinate, not a copy", () => {
    // **The fixture lesson generalised.** `-40` and `40` against a pin of `2..8`
    // are the only samples an open-coded normalisation gets wrong, and without
    // them this row passes for both readings.
    const layout = SVG_DEFAULT_LAYOUT;
    const range = { min: PIN.yMin, max: PIN.yMax };
    const points = svgPoints(SAMPLES, range, layout);
    const top = layout.height * layout.pad;
    const bottom = layout.height * (1 - layout.gutter);
    expect(points[0]?.[1], `${form}: far below pins to the floor`).toBeCloseTo(bottom, 6);
    expect(points[4]?.[1], `${form}: far above pins to the ceiling`).toBeCloseTo(top, 6);
    expect(points[0]?.[1]).toBe(points[1]?.[1]);
    expect(points[4]?.[1]).toBe(points[3]?.[1]);
    // And the drawn document never puts ink outside the area either.
    const svg = plotToSvg(made, THEME, layout) ?? "";
    const ys = [...svg.matchAll(/(?:\by|cy|y1|y2)="([-\d.]+)"/gu)].map((m) => Number(m[1]));
    for (const y of ys) {
      // Tick labels sit a third of a glyph below their line, so the bound is the
      // area plus that — a number from the type size and never from a metric.
      expect(y, `${form}: ink above the area`).toBeGreaterThanOrEqual(top - 1);
      expect(y, `${form}: ink below the area`).toBeLessThanOrEqual(bottom + SVG_FONT_SIZE);
    }
  });
});

describe("G6b — the two assertions containment could not make", () => {
  // **Both came from survivors, and both are the same class.** The per-form rows
  // assert ink stays *inside the plot area*, which is a containment claim: every
  // wrong answer that is also inside the area satisfies it. A mutation is what
  // separates *correct* from *contained*.

  it("a matrix cell's colour is the coordinate, at a span the open-coded form gets wrong", () => {
    // `continuousColour` clamps for its own reasons, so an unclamped `t` draws
    // the same colour — the mutation bites only where the **span** does, and a
    // density field over `0..0.3` is where. Open-coded, `Math.max(1, span)`
    // squashes every reading into the bottom third of the map.
    const narrow = b.plot({
      id: "m",
      form: "heatmap",
      height: 4,
      colormap: "viridis",
      series: [{ label: "r", values: [0, 0.15, 0.3] }],
    });
    const svg = plotToSvg(narrow, THEME) ?? "";
    const fills = [...svg.matchAll(/<rect x=[^>]*fill="(#[0-9a-f]{6})"/gu)].map((m) => m[1]);
    expect(fills, "one cell per reading").toHaveLength(3);
    expect(new Set(fills).size, "and three different colours, not three near-black ones").toBe(3);
    // The extremes reach the map's ends, which is what a full span means and
    // what a squashed one cannot do.
    const map = COLORMAPS["viridis"];
    expect(fills[0], "the floor is the map's floor").toBe(sampleHex(map, 0));
    expect(fills[2], "the ceiling is the map's ceiling").toBe(sampleHex(map, 1));
  });

  it("a bar's baseline is zero where the range holds it, not the area's floor", () => {
    // The first draft computed `normalisedOf(range.min, …)`, which is `1` by
    // construction — `box.bottom` the long way round. Signed data is what tells
    // the difference: a bar of `-3` grows *down* from zero.
    const signed = b.plot({
      id: "bz",
      form: "bar",
      height: 6,
      series: [{ label: "s", values: [-3, 0, 5] }],
    });
    const layout = SVG_DEFAULT_LAYOUT;
    const svg = plotToSvg(signed, THEME, layout) ?? "";
    const rects = [...svg.matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"/gu)];
    expect(rects, "three bars").toHaveLength(3);
    const bottom = layout.height * (1 - layout.gutter);
    const [neg, , pos] = rects.map((m) => ({ y: Number(m[2]), h: Number(m[4]) }));
    // The negative bar's *top* is the baseline; the positive bar's *bottom* is.
    expect(neg?.y, "the negative bar hangs from the baseline").toBeGreaterThan(layout.height * layout.pad);
    expect((pos?.y ?? 0) + (pos?.h ?? 0), "and the positive one stands on it").toBeCloseTo(neg?.y ?? -1, 3);
    expect(neg?.y, "which is not the area's floor").toBeLessThan(bottom - 1);
  });
});

describe("G7 — the partition itself", () => {
  it("is exhaustive over PlotForm, and every refusal has a reason in the table", () => {
    // **The compiler already proved exhaustiveness** — `satisfies Record<
    // PlotForm, …>` fails to build otherwise — so this row asserts the part it
    // cannot: that the partition is not secretly empty on one side, and that a
    // refused form refuses rather than drawing a plausible wrong figure.
    const all = Object.keys(SVG_FAMILY) as PlotForm[];
    expect(all.length, "every form in the union is keyed").toBeGreaterThan(40);
    expect(supported.length, "and the claimed set is not empty").toBeGreaterThan(15);
    const refused = all.filter((f) => SVG_FAMILY[f] === null);
    expect(refused.length, "nor is the refused set").toBeGreaterThan(15);
    for (const form of refused.slice(0, 6)) {
      const made = b.plot({ id: `r-${form}`, form, height: 4, series: [{ label: "s", values: [1, 2, 3] }] });
      // **A refusal, not a fallback.** A treemap drawn by the curve family
      // measures, rasterises and reads as a chart of something — the plausible
      // wrong figure the placeholder encoding refuses a wrap for.
      expect(plotToSvg(made, THEME), `${form} carries its own geometry`).toBeNull();
    }
  });
});
