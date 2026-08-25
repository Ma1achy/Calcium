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
  svgFamilyOf,
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
import { tiles } from "../../src/presentation/plot/hierarchy.js";
import { refOf } from "../../src/presentation/plot/marks.js";
import { curveFigure, distributionFigure } from "../../src/presentation/plot/figure.js";
import { resolve } from "../../src/presentation/theme/index.js";
import { DARK_THEME as THEME } from "../support/render.js";
import { b } from "../../src/shell/builders/index.js";
import { ONE_PER_FORM } from "../support/plot-forms.js";
import type { PlotForm } from "../../src/data/viewmodel/index.js";

/** A slot's hex at this arm's one depth — the same call the renderer makes. */
const hexOf = (ref: string): string => {
  const { colour } = resolve(ref as `${string}.${string}`, THEME, { colourDepth: 24 });
  if (colour === undefined || colour.kind !== "rgb") throw new Error(`no rgb for ${ref}`);
  return colour.hex;
};

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
    // **The range is the figure's now, and this row re-derived it** (C12 §3ak.10).
    //
    // It read *the maximum sample is at t=0 and the minimum at t=1, so the ink
    // spans the whole plot area*, which was true while this arm rasterised
    // against the data's own extent. The shared axis is **niced** — it reaches
    // past the data to a round number, which is what puts the same curve on the
    // same scale in both arms (D1) — so the peak is no longer at the ceiling and
    // the row's premise was false the moment the seam moved.
    //
    // Read rather than recomputed: a test that derives the coordinate itself is
    // a third place for the two arms to disagree, which is the thing this whole
    // pass removes. `toBeCloseTo(…, -1)` keeps the stroke's half-width tolerance.
    const range = curveFigure(block).value!.range;
    const at = (v: number): number => top + (bottom - top) * normalisedOf(v, range, true);
    expect(inkTop, "the peak sits where the shared axis puts 9").toBeCloseTo(at(Math.max(...VALUES)), -1);
    expect(inkBottom, "and the trough where it puts the minimum").toBeCloseTo(at(Math.min(...VALUES)), -1);
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

/**
 * **A form's datum, which this table assumed there was one of.**
 *
 * Every row here built `series: [{ values: SAMPLES }]`, and the distribution
 * family's is `quartiles` — a boxplot's `series` is `[]` and its summaries are
 * the data (C04 I57's shape). So the first three forms of family 1 rendered
 * `null` against a table that had already claimed them, and `G7b` said so.
 *
 * **The samples-outside-the-pin rule needs its equivalent here.** A quartile
 * form ranges over `quartileRange`, which no `yMin`/`yMax` reaches, so the
 * thing that plays the clamp's part is an **outlier past the whiskers** — the
 * one member that widens the extent. Every summary below has one.
 */
const HIERARCHY = {
  label: "root", value: 100,
  children: [
    { label: "a", value: 60, children: [{ label: "a1", value: 35 }, { label: "a2", value: 25 }] },
    { label: "b", value: 40, children: [{ label: "b1", value: 40 }] },
  ],
};

const datumFor = (form: PlotForm): Record<string, unknown> => {
  // **`flame` and `icicle` have two datum shapes and the corpus picks one.**
  // `ONE_PER_FORM` gives both of them `categories` + `series` — the terminal's
  // `legacyDepthBars` arm — and no `hierarchy` at all. The SVG arm draws the
  // *tiles*, so its representative has to carry the datum the tiles come from.
  // Same lesson as `plotStyle` and `quartiles`, a third time: **a per-form
  // corpus takes one datum per form, and a form with two gets one of them
  // arbitrarily.**
  if (svgFamilyOf(form) === "tiles") return { series: [], hierarchy: HIERARCHY };
  // **A third datum shape in one table**, and the builder refuses without it:
  // `b.plot({ form: "tree" })` with no `hierarchy` throws, because a tree with
  // no tree has no figure to fall back to (C04 I65). `graph` carries its own
  // shape again — a node list and an edge list, which is what `hierarchy`
  // cannot express (C04 I69).
  if (form === "tree") return { series: [], hierarchy: HIERARCHY };
  if (form === "graph") {
    return {
      series: [],
      graph: {
        nodes: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
        edges: [{ from: "a", to: "b" }, { from: "a", to: "c" }, { from: "b", to: "d" }, { from: "c", to: "d" }],
      },
    };
  }
  if (svgFamilyOf(form) !== "distribution") return { series: [{ label: "s", values: SAMPLES }], ...PIN };
  if (form === "dumbbell") {
    return { series: [{ label: "a", values: [2, 5, 8] }, { label: "b", values: [8, 3, 4] }], ...PIN };
  }
  // **A forest plot has no outliers to draw**, so giving it some widens the
  // axis by data its figure has no place for — and the terminal does the same,
  // which is why the fixture rather than the renderer is what was wrong. Its
  // equivalent of *a sample outside the pin* is an **interval past the
  // whiskers**, the one member `quartileRange`'s second arm exists for.
  if (form === "forest") {
    return {
      series: [],
      categories: ["one", "two"],
      quartiles: [
        { min: 4, q1: 5, median: 6, q3: 7, max: 8, lower: -40, upper: 9, centre: 6 },
        { min: 4, q1: 5, median: 6, q3: 7, max: 8, lower: 3, upper: 40, centre: 6, weight: 0.8 },
      ],
    };
  }
  return {
    series: [],
    categories: ["one", "two"],
    quartiles: [
      { min: 2, q1: 3, median: 5, q3: 7, max: 8, mean: 5.2, outliers: [-40] },
      { min: 3, q1: 4, median: 5, q3: 6, max: 7, outliers: [40] },
    ],
  };
};

describe.each(supported)("G6 — %s", (form) => {
  const made = b.plot({
    id: `f-${form}`,
    form,
    height: 8,
    ...datumFor(form),
  } as Parameters<typeof b.plot>[0]);

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
    //
    // **The distribution family has no clamp to fire, and that is a claim
    // rather than an exemption.** Its range is `quartileRange`, which no
    // `yMin`/`yMax` reaches and which *includes the outliers* — so nothing is
    // ever outside it. The equivalent assertion is the other side of the same
    // mechanism: the extreme outlier **defines** the edge, so its mark sits on
    // it. A row that skipped these forms would be an exemption with no claim in
    // it, and the mutation *outliers do not widen the extent* would have no
    // killer here.
    if (svgFamilyOf(form) === "distribution") {
      const layout = SVG_DEFAULT_LAYOUT;
      const top = layout.height * layout.pad;
      const bottom = layout.height * (1 - layout.gutter);
      const left = layout.width * (layout.gutter + layout.pad);
      const right = layout.width * (1 - layout.pad);
      const svg = plotToSvg(made, THEME, layout) ?? "";
      // **Horizontal is the family's default**, matching the terminal, so the
      // value axis is x and the two outliers define its ends.
      const xs = [...svg.matchAll(/(?:\bcx|\bx)="([-\d.]+)"/gu)]
        .map((m) => Number(m[1]))
        .filter((x) => x >= left - 1 && x <= right + 1);
      expect(xs.length, `${form}: the figure has extent along the value axis`).toBeGreaterThan(0);
      // A mark is centred on its value and is a pixel wide, so its left edge is
      // half a pixel short — the bound names that rather than rounding it away.
      expect(Math.min(...xs), `${form}: the extreme reaches the left edge`).toBeLessThanOrEqual(left + 1);
      expect(Math.min(...xs), `${form}: and does not overrun it`).toBeGreaterThanOrEqual(left - 1);
      expect(Math.max(...xs), `${form}: the other extreme reaches the right`).toBeGreaterThanOrEqual(right - 2);
      void top; void bottom;
      return;
    }
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

/**
 * G8 — **a form is claimed and its datum is not** (F259).
 *
 * G7 asks whether the *form* is one this path draws. That is one of two
 * questions, and the corpus behind it — `ONE_PER_FORM`, one representative
 * block per member — cannot ask the second, because `plotStyle` is an axis it
 * never crosses. A `line` is claimed; a `line` **carrying candles** is a
 * different block that the same claim covers.
 */
describe("G8 — a claimed form whose datum this path cannot read", () => {
  const OHLC = [
    { open: 10, high: 14, low: 8, close: 12 },
    { open: 12, high: 16, low: 11, close: 11 },
    { open: 11, high: 13, low: 9, close: 13 },
  ] as const;

  it("G8a: candles are refused rather than drawn as an empty axis", () => {
    // **Measured before it was fixed**: this returned a full frame with five
    // gridlines labelled 0, 0.25, 0.5, 0.75, 1 — `seriesRange([])` is `null`
    // and the fallback furnished an axis out of nothing — while the terminal
    // drew three candles spanning 8 to 16.
    const candles = b.plot({
      id: "c", form: "line", height: 6, plotStyle: "candlestick", series: [], ohlc: [...OHLC],
    });
    expect(plotToSvg(candles, THEME), "the datum is ohlc and nothing here reads it").toBeNull();
  });

  it("G8b: a moving average over candles is refused too — the worse of the two", () => {
    // **The range came from the average alone.** Ticks 11 to 12 against data
    // spanning 8 to 16, with a line drawn confidently across them: not a blank
    // a reader questions but a chart of the wrong thing. The empty-marks clause
    // cannot reach this one, because the average draws a mark.
    const withMa = b.plot({
      id: "m", form: "line", height: 6, plotStyle: "candlestick",
      series: [{ label: "ma", values: [11, 12, 12] }], ohlc: [...OHLC],
    });
    expect(plotToSvg(withMa, THEME), "an average is not a picture of the candles").toBeNull();
  });

  it("G8c: furniture with no ink is a refusal, and that is a second clause", () => {
    // `series: []` on a plain form and an all-`null` series both reach the
    // renderer with a range nobody declared. Two clauses because two failures:
    // this one is caught by counting marks and G8b is not.
    const bare = b.plot({ id: "d", form: "line", height: 6, series: [] });
    expect(plotToSvg(bare, THEME), "no series is no picture").toBeNull();

    const nulls = b.plot({ id: "f", form: "line", height: 6, series: [{ label: "n", values: [null, null, null] }] });
    expect(plotToSvg(nulls, THEME), "a series that draws nothing is no picture").toBeNull();
  });

  it("G8e: a flipped ordinate is refused, and all four origins were identical", () => {
    // **Measured**: `svgPoints` passes `invert: true` unconditionally, so
    // `top-left`, `bottom-left`, `top-right` and `bottom-right` produced
    // byte-identical output — the first sample's y was 288 in every one. The
    // terminal honours `origin`; this arm did not, so the same block drew the
    // right way up in one and upside down in the other.
    const flipped = b.plot({
      id: "o", form: "line", height: 6, origin: "top-left",
      series: [{ label: "s", values: [1, 9] }],
    });
    expect(plotToSvg(flipped, THEME), "an ordinate this path cannot flip").toBeNull();

    // And the default is not refused, which is what makes the clause a clause
    // rather than a ban on the field.
    const upright = b.plot({
      id: "u", form: "line", height: 6, origin: "bottom-left",
      series: [{ label: "s", values: [1, 9] }],
    });
    expect(plotToSvg(upright, THEME), "the default origin still renders").not.toBeNull();
  });

  it("G8f: an annotation is DROPPED, and that is recorded rather than refused", () => {
    // **The third axis, and the line falls differently here.** A reference line
    // at 5 labelled `target` reaches the renderer and nothing draws it — the
    // six `<line>` elements in the output are gridlines. Measured, like the
    // other two.
    //
    // **It is not refused, because the picture it leaves is true.** A dropped
    // `ohlc` leaves a chart of the wrong thing and a flipped ordinate leaves one
    // upside down; a missing annotation leaves a correct curve with a claim
    // absent from beside it. **Refuse a false figure, record an incomplete
    // one** — and this row is the record, so the day annotations land it fails
    // and says what changed.
    const annotated = b.plot({
      id: "a", form: "line", height: 6,
      series: [{ label: "s", values: [1, 9] }],
      annotations: [{ kind: "line", value: 5, label: "target" }],
    });
    const svg = plotToSvg(annotated, THEME);
    expect(svg, "the curve still renders").not.toBeNull();
    expect((svg ?? "").includes("target"), "and the annotation is not in it — F259's residue").toBe(false);
  });

  it("G8d: and a form that does draw is untouched by any clause", () => {
    // **The control.** Every clause refuses, so a bug in any of them reads as
    // *everything is refused*, which passes every row above.
    expect(plotToSvg(block, THEME), "the ordinary curve still renders").not.toBeNull();
    const heat = b.plot({
      id: "h", form: "heatmap", height: 4, colormap: "viridis",
      series: [{ label: "r", values: [0, 1, 2, 3] }],
    });
    expect(plotToSvg(heat, THEME), "and so does a matrix").not.toBeNull();
  });
});

describe("G6c — the distribution family, where containment says nothing", () => {
  const QS = [
    { min: 2, q1: 3, median: 5, q3: 7, max: 8, mean: 6 },
    { min: 1, q1: 2, median: 3, q3: 4, max: 9 },
  ];
  const boxplot = (extra: Record<string, unknown> = {}): Parameters<typeof plotToSvg>[0] =>
    b.plot({
      id: "bx", form: "boxplot", height: 8, series: [],
      categories: ["a", "b"], quartiles: QS, ...extra,
    } as Parameters<typeof b.plot>[0]);
  const layout = svgLayout(600, 300);
  const box = {
    left: layout.width * (layout.gutter + layout.pad),
    right: layout.width * (1 - layout.pad),
    top: layout.height * layout.pad,
    bottom: layout.height * (1 - layout.gutter),
  };
  const rects = (svg: string): Array<Record<string, number>> =>
    [...svg.matchAll(/<rect ([^>]*)\/>/gu)].map((m) => {
      const out: Record<string, number> = {};
      for (const a of m[1]?.matchAll(/(\w[\w-]*)="([-\d.]+)"/gu) ?? []) out[a[1] as string] = Number(a[2]);
      return out;
    });

  it("G6c: a category's figure takes three fifths of its slot, not the slot", () => {
    // **Containment cannot see this.** A box drawn to the full slot is inside
    // the plot area and inside its own category — and the categories touch,
    // which is a categorical axis saying they are not separate.
    // Horizontal by default, so a category's slot runs down the area and the
    // figure's extent across it is a **height**.
    const svg = plotToSvg(boxplot(), THEME, layout) ?? "";
    const slot = (box.bottom - box.top) / 2;
    const bodies = rects(svg).filter((r) => (r["width"] ?? 0) > 1 && (r["height"] ?? 0) > 1);
    const tallest = Math.max(...bodies.map((r) => r["height"] ?? 0));
    expect(tallest, "three fifths of the slot").toBeCloseTo(slot * 0.6, 3);
    expect(tallest, "and not the whole slot").not.toBeCloseTo(slot, 3);
  });

  it("G6c2: the vertical arm inverts, so the maximum sits above the minimum", () => {
    // **The transpose lost draws every figure upside down inside the area**,
    // which every containment assertion and every element count still passes.
    // Built `vertical` explicitly, because the family's default is horizontal
    // and a horizontal figure has no inversion to lose.
    const svg = plotToSvg(boxplot({ orientation: "vertical" }), THEME, layout) ?? "";
    const ys = rects(svg).map((r) => r["y"] ?? 0).filter((y) => y >= box.top - 1 && y <= box.bottom + 1);
    // Category b spans 1..9 against a's 2..8 on a range of 1..9, so b reaches
    // both the ceiling and the floor — the extremes, not a count.
    expect(Math.min(...ys), "something reaches the ceiling").toBeLessThan(box.top + (box.bottom - box.top) * 0.1);
    expect(Math.max(...ys), "and something the floor").toBeGreaterThan(box.top + (box.bottom - box.top) * 0.85);

    // **A mirrored figure has the same extremes**, which is why the two lines
    // above survived the mutation that drops the inversion. What differs is
    // *which* value is at the top: category a's median is 5 and b's is 3 on a
    // range of 1..9, so a's median rail sits **above** b's — and reflected, it
    // sits below. Asserted through the widest rails, which are the medians.
    // The median rail is the **widest** horizontal mark — the full box width,
    // where a whisker cap is half of it. Filtering on *wide and thin* alone
    // caught the caps too, which is how the first attempt compared a cap to a
    // median and read 141 against 11.5.
    const thin = rects(svg).filter((r) => (r["height"] ?? 0) <= 2 && (r["width"] ?? 0) > 2);
    const widest = Math.max(...thin.map((r) => r["width"] ?? 0));
    const rails = thin
      .filter((r) => Math.abs((r["width"] ?? 0) - widest) < 0.01)
      .sort((p, q) => (p["x"] ?? 0) - (q["x"] ?? 0));
    expect(rails.length, "a median rail per category").toBe(2);
    expect(rails[0]?.["y"] ?? 0, "category a's median is 5 and b's is 3, so a's rail is higher")
      .toBeLessThan(rails[1]?.["y"] ?? 0);
  });

  it("G6c3: a mean is drawn only where the summary has one", () => {
    // A circle per mean, and `QS` has exactly one. `?? ns.median` would put a
    // marker on every summary — the reading *the mean coincides with the
    // median*, said about data that never had a mean (C04 I53).
    const svg = plotToSvg(boxplot(), THEME, layout) ?? "";
    // **A diamond, not a circle** — the terminal draws the mean as the glyph
    // and the outliers as dots, so the two are told apart by shape at the same
    // colour. A grey circle inside a filled box was the first version and the
    // frame is what said it was invisible.
    expect([...svg.matchAll(/<polygon /gu)].length, "one mean").toBe(1);
    expect([...svg.matchAll(/<circle /gu)].length, "and no outliers in this fixture").toBe(0);

    const both = plotToSvg(boxplot({ quartiles: [QS[0], { ...QS[1], mean: 3 }] }), THEME, layout) ?? "";
    expect([...both.matchAll(/<polygon /gu)].length, "two means").toBe(2);
  });

  it("G6c4: a forest plot ranges over its interval, not its whiskers", () => {
    // The clip happens with `quartileRange` behaving correctly — the caller
    // chooses the arm, which is where a per-family renderer diverges.
    const wide = b.plot({
      id: "fr", form: "forest", height: 6, series: [], categories: ["a"],
      quartiles: [{ min: 4, q1: 5, median: 6, q3: 7, max: 8, lower: 1, upper: 11, centre: 5 }],
    } as Parameters<typeof b.plot>[0]);
    const svg = plotToSvg(wide, THEME, layout) ?? "";
    const xs = rects(svg).flatMap((r) => [r["x"] ?? 0, (r["x"] ?? 0) + (r["width"] ?? 0)])
      .filter((x) => x >= box.left - 1 && x <= box.right + 1);
    // **What this row is for is unchanged and its premise moved** (C12 §3ak.10).
    // It asserted the interval spans the area *edge to edge*, which held while
    // the arm rasterised against `quartileRange`'s own output. The shared axis is
    // niced past it, so the interval now spans its share of a wider range — and
    // the question the row exists to ask is still answerable: **does this plot
    // range over its interval or over its whiskers?**
    //
    // Ranged over the whiskers, 4..8 of a 1..11 interval would sit inside the
    // middle third. Ranged over the interval, the ends sit where the shared axis
    // puts 1 and 11 — read from the figure rather than derived a second time.
    const fRange = distributionFigure(wide).value!.range;
    const atX = (v: number): number => box.left + (box.right - box.left) * normalisedOf(v, fRange, false);
    expect(Math.min(...xs), "the interval's left end is where the axis puts 1")
      .toBeCloseTo(atX(1), -1);
    expect(Math.max(...xs), "and its right end where the axis puts 11").toBeCloseTo(atX(11), -1);
    expect(atX(8) - atX(4), "the whiskers alone would be a third of that span")
      .toBeLessThan((Math.max(...xs) - Math.min(...xs)) * 0.6);

    // **The ends clamp under either arm, so they cannot tell them apart.** An
    // interval of 1..11 ranged over the whiskers 4..8 still reaches both edges,
    // because `normalisedOf` clamps — the survivor that said so. The
    // **estimate** is where the two disagree: `centre: 5` is 0.4 of 1..11 and
    // 0.25 of 4..8.
    const estimate = rects(svg).filter((r) => (r["width"] ?? 0) > 2 && (r["height"] ?? 0) > 2);
    expect(estimate.length, "the estimate is drawn").toBeGreaterThan(0);
    const cx = (estimate[0]?.["x"] ?? 0) + (estimate[0]?.["width"] ?? 0) / 2;
    const t = (cx - box.left) / (box.right - box.left);
    // **The discriminator survives the seam moving; only its arithmetic reads
    // from somewhere else.** Under the raw interval 1..11 the estimate sat at
    // 0.4 and under the whiskers 4..8 at 0.25, which is what separates the two
    // arms of `quartileRange`. The shared axis is niced past the interval, so
    // both numbers change and **the gap between them does not** — the row asks
    // the same question with the figure's range instead of a literal.
    expect(t, "where the shared axis puts the estimate").toBeCloseTo(normalisedOf(5, fRange, false), 2);
    const whiskers = normalisedOf(5, { min: 4, max: 8 }, false);
    expect(Math.abs(t - whiskers), "and not where the whiskers would put it")
      .toBeGreaterThan(0.05);
  });
});

describe("G6d — the tiles family, and every default checked against the terminal", () => {
  const HIER = {
    label: "root", value: 100,
    children: [
      { label: "a", value: 60, children: [{ label: "a1", value: 35 }, { label: "a2", value: 25 }] },
      { label: "b", value: 40, children: [{ label: "b1", value: 40 }] },
    ],
  };
  const tileBlock = (form: "treemap" | "flame" | "icicle"): Parameters<typeof plotToSvg>[0] =>
    b.plot({ id: form, form, height: 8, series: [], hierarchy: HIER } as Parameters<typeof b.plot>[0]);
  const tl = svgLayout(600, 300);
  const area = {
    left: tl.width * (tl.gutter + tl.pad),
    right: tl.width * (1 - tl.pad),
    top: tl.height * tl.pad,
    bottom: tl.height * (1 - tl.gutter),
  };
  // **The clip rectangles are rects too**, and counting them read 10 nodes for
  // 5 — the same shape as reading the background rect as a mark. A tile carries
  // a `fill`; a clip's rectangle carries nothing but geometry, which is what
  // separates them without a marker attribute.
  const boxes = (svg: string): Array<Record<string, number>> =>
    [...svg.matchAll(/<rect ([^>]*?fill="[^"]*"[^>]*?)\/>/gu)].map((m) => {
      const o: Record<string, number> = {};
      for (const at of m[1]?.matchAll(/([a-zA-Z][\w-]*)="([-\d.]+)"/gu) ?? []) o[at[1] as string] = Number(at[2]);
      return o;
    }).filter((r) => (r["width"] ?? 0) > 1);

  it("G6d1: a tile sits where tiles() puts it, on the unit square", () => {
    // **A position, not a containment.** Every tile is inside the area under any
    // wrong layout that keeps the unit square; what is asserted is that the
    // shared function's coordinates are the ones drawn.
    // Sorted by depth, because the renderer paints parents before children —
    // that ordering *is* how nesting reads without a border per node.
    //
    // **The pad is gone from this call and the row is stronger for it** (F278).
    // It used to read `tiles(HIER, 1 / max(w, h))` — the layout-time pad — which
    // is one unit of *this* output and therefore cannot be in a figure both arms
    // read. The partition is now the true one and the inset is `depth + 1` px,
    // applied here, so the expression below is the ruling rather than a
    // restatement of the renderer.
    const expected = [...tiles(HIER, 0)].sort((p, q) => p.depth - q.depth);
    const drawn = boxes(plotToSvg(tileBlock("treemap"), THEME, tl) ?? "");
    expect(drawn.length, "one rect per node").toBe(expected.length);
    for (const [i, t] of expected.entries()) {
      const inset = t.depth + 1;
      expect(drawn[i]?.["x"], `tile ${i} x`).toBeCloseTo(area.left + t.x0 * (area.right - area.left) + inset, 3);
      expect(drawn[i]?.["y"], `tile ${i} y`).toBeCloseTo(area.top + t.y0 * (area.bottom - area.top) + inset, 3);
    }
    // **And the ring is what the inset is for, so it is asserted rather than
    // implied.** A uniform inset separates siblings and puts a child's shared
    // edge exactly on its parent's — the frame that found F278 — so a row that
    // only checked *the tiles are inside the area* would have agreed with it.
    const depths = expected.map((t) => t.depth);
    const deeper = depths.findIndex((d) => d > (depths[0] ?? 0));
    expect(deeper, "the fixture has a child to nest").toBeGreaterThan(0);
    expect(
      (drawn[deeper]?.["x"] ?? 0) - (drawn[0]?.["x"] ?? 0),
      "a child starting on its parent's own left edge is inset one further, so the parent shows",
    ).toBeCloseTo(1, 3);
  });

  it("G6d2: a tile's fill is the slot its index names — a separate claim", () => {
    // **The fill is a different row from the position**, which is the lesson of
    // three families in a row: a rect has coordinates the rows checked and a
    // datum they did not.
    const svg = plotToSvg(tileBlock("treemap"), THEME, tl) ?? "";
    // The ground is the first rect; the tiles follow, in depth order.
    const fills = [...svg.matchAll(/<rect [^>]*fill="(#[0-9a-f]{6})"/gu)].map((m) => m[1]).slice(1);
    const expected = [...tiles(HIER, 0)].sort((p, q) => p.depth - q.depth).map((t) => hexOf(refOf(t.index)));
    expect(fills.length).toBe(expected.length);
    for (const [i, f] of fills.entries()) expect(f, `tile ${i} takes ${refOf(i)}`).toBe(expected[i]);
  });

  it("G6d3: flame grows up from depth 0 and icicle grows down — the terminal's flag", () => {
    // **Checked against hierarchyStripRows, not against the convention.** Its
    // rowFor is `areaRows - 1 - depth` for a flame and `depth` for an icicle,
    // and family 1's orientation default came out transposed by being read the
    // other way round.
    const rootY = (form: "flame" | "icicle"): number => {
      const drawn = boxes(plotToSvg(tileBlock(form), THEME, tl) ?? "");
      const widest = Math.max(...drawn.map((r) => r["width"] ?? 0));
      return drawn.find((r) => Math.abs((r["width"] ?? 0) - widest) < 0.01)?.["y"] ?? 0;
    };
    const mid = (area.top + area.bottom) / 2;
    expect(rootY("flame"), "a flame's root is at the foot").toBeGreaterThan(mid);
    expect(rootY("icicle"), "an icicle's root is at the head").toBeLessThan(mid);
  });

  it("G6d4 (F278): the PARTITION is a proportion and the inset is not", () => {
    // **The row used to claim the inset was the proportion, and it was true of a
    // pad that could not cross the seam.** `tiles(root, 1 / max(w, h))` insets at
    // layout time by one unit of *this* output — one pixel — where the terminal
    // insets by one cell, and neither number is a figure's to hold. So the
    // partition crosses and the inset does not (F278), which splits the old
    // claim in two and this row asserts both halves.
    const measured = (px: number): Readonly<{ share: number; inset: number }> => {
      const l = svgLayout(px, px / 2);
      const left = l.width * (l.gutter + l.pad);
      const w = l.width * (1 - l.pad) - left;
      const drawn = boxes(plotToSvg(tileBlock("treemap"), THEME, l) ?? "");
      const widest = Math.max(...drawn.map((r) => r["width"] ?? 0));
      // A depth-0 tile starts at the area's own left edge, so whatever it is
      // offset by is the inset.
      const first = drawn.find((r) => Math.abs((r["width"] ?? 0) - widest) < 0.01);
      // Added back, because the tile drawn is the partition minus the inset.
      return { share: (widest + 2) / w, inset: (first?.["x"] ?? 0) - left };
    };
    const small = measured(300);
    const large = measured(1200);
    expect(small.share, "the partition is the same share of the area at either size")
      .toBeCloseTo(large.share, 3);
    // **One unit, not one share** — which is the half that used to be missing,
    // and it is the half a resolution sweep is blind to when the tolerance is
    // wide enough to cover a pixel at both sizes.
    expect(small.inset, "a depth-0 tile is inset one unit at 300px").toBeCloseTo(1, 3);
    expect(large.inset, "and one unit at 1200px — the same pixel, not the same fraction")
      .toBeCloseTo(1, 3);
  });

  it("G6d5: a label clips itself and nothing measures it", () => {
    // §3aj hazard 4. The terminal truncates a name to the cells its tile has,
    // which it can do because it measures text. A clipPath is the renderer's
    // own mechanism: the label places itself and stops itself.
    const svg = plotToSvg(tileBlock("treemap"), THEME, tl) ?? "";
    // A leaf's name rather than the root's: `tiles()` places the root as the
    // whole square and its children over it, so whether the root gets a text
    // element is a property of the layout and not of the labelling.
    expect(svg, "the names are drawn").toContain(">a1<");
    expect(svg, "every leaf, not one").toContain(">b1<");
    expect([...svg.matchAll(/<clipPath /gu)].length, "one clip per named tile").toBeGreaterThan(0);
    expect(svg, "and every label uses one").toMatch(/<text [^>]*clip-path="url\(#/u);
    const risky = b.plot({
      id: "r", form: "treemap", height: 6, series: [],
      hierarchy: { label: "a<b&c", value: 1, children: [{ label: "x", value: 1 }] },
    } as Parameters<typeof b.plot>[0]);
    expect((plotToSvg(risky, THEME) ?? "").includes("a<b&c"), "raw markup never reaches the output").toBe(false);
  });

  it("G6d6: a treemap has no value axis, because its readings are areas", () => {
    // The matrix family's ruling one family along, and the **frame** is what
    // said it: a treemap drew ticks at 0, 0.25, 0.5, 0.75, 1 — furnished out of
    // seriesRange([]) — beside a figure whose readings are sizes.
    for (const form of ["treemap", "flame", "icicle"] as const) {
      const svg = plotToSvg(tileBlock(form), THEME, tl) ?? "";
      expect([...svg.matchAll(/text-anchor="end"/gu)].length, `${form} draws no value ticks`).toBe(0);
    }
    // The control: a form that does have one still draws it, so a zero above is
    // a decision rather than a renderer that stopped ticking.
    const curve = b.plot({ id: "cv", form: "line", height: 6, series: [{ label: "s", values: [1, 4, 2] }] });
    expect([...(plotToSvg(curve, THEME, tl) ?? "").matchAll(/text-anchor="end"/gu)].length)
      .toBeGreaterThan(0);
  });

  it("G6d7: no hierarchy is a refusal, because the terminal draws its other arm", () => {
    // flame and icicle fall back to legacyDepthBars without one — a bar chart of
    // depths, which is the bar family's geometry. **Both corpora pick that
    // arm**: ONE_PER_FORM and the catalogue's default variant each give these
    // two categories + series and no hierarchy.
    for (const form of ["treemap", "flame", "icicle"] as const) {
      const bare = b.plot({ id: form, form, height: 6, series: [{ label: "s", values: [3, 2, 1] }] });
      expect(plotToSvg(bare, THEME, tl), `${form} without a hierarchy`).toBeNull();
    }
  });
});

describe("G6e — the nodes family, where the placement is per-arm", () => {
  const HIER = {
    label: "root", value: 100,
    children: [
      { label: "a", value: 60, children: [{ label: "a1", value: 35 }, { label: "a2", value: 25 }] },
      { label: "b", value: 40 },
    ],
  };
  const GRAPH = {
    nodes: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
    edges: [{ from: "a", to: "b" }, { from: "a", to: "c" }, { from: "b", to: "d" }, { from: "c", to: "d" }],
  };
  const nl = svgLayout(600, 300);
  const nArea = {
    left: nl.width * (nl.gutter + nl.pad),
    right: nl.width * (1 - nl.pad),
    top: nl.height * nl.pad,
    bottom: nl.height * (1 - nl.gutter),
  };
  const treeAt = (extra: Record<string, unknown> = {}): Parameters<typeof plotToSvg>[0] =>
    b.plot({ id: "tr", form: "tree", height: 8, series: [], hierarchy: HIER, ...extra } as Parameters<typeof b.plot>[0]);
  const nodeRects = (svg: string): Array<Record<string, number>> =>
    [...svg.matchAll(/<rect ([^>]*?rx="2"[^>]*?)\/>/gu)].map((m) => {
      const o: Record<string, number> = {};
      for (const at of m[1]?.matchAll(/([a-zA-Z][\w-]*)="([-\d.]+)"/gu) ?? []) o[at[1] as string] = Number(at[2]);
      return o;
    });

  it("G6e1: every node is the same size, taken from the busiest layer", () => {
    // **The frame caught the first version.** A node sized to its own layer's
    // share made a node alone in its layer span the whole figure — a leaf drawn
    // as wide as the root. The terminal sizes a node to *its label*, which this
    // arm cannot do (§3aj hazard 4), so the font-independent equivalent is one
    // size for all of them.
    const rs = nodeRects(plotToSvg(treeAt(), THEME, nl) ?? "");
    expect(rs.length, "one box per named node").toBe(5);
    const widths = new Set(rs.map((r) => r["width"]));
    expect(widths.size, "one width, not one per layer").toBe(1);
    const heights = new Set(rs.map((r) => r["height"]));
    expect(heights.size, "and one height").toBe(1);
  });

  it("G6e2: a sparse layer is centred, not stretched", () => {
    // The other half of the same defect: a single-node layer offset to the
    // left while its children sit under the middle. Asserted as a position —
    // the root's centre against the area's — because *inside the area* is true
    // of every wrong answer here.
    const rs = nodeRects(plotToSvg(treeAt(), THEME, nl) ?? "");
    const top = rs.reduce((m, r) => ((r["y"] ?? 0) < (m["y"] ?? 0) ? r : m), rs[0]!);
    const centre = (top["x"] ?? 0) + (top["width"] ?? 0) / 2;
    expect(centre, "the root sits on the area's centre").toBeCloseTo((nArea.left + nArea.right) / 2, 1);
  });

  it("G6e3: the default layout is topDown, which is what the terminal picks", () => {
    // `chooseLayout` returns the **first** of `["topDown", "leftRight",
    // "outline"]` whose size fits, and an SVG has no budget, so everything
    // fits and the terminal would pick `topDown`. Read out of the source
    // rather than chosen — family 1's orientation default came out transposed
    // by being read the other way round.
    const plain = nodeRects(plotToSvg(treeAt(), THEME, nl) ?? "");
    const down = nodeRects(plotToSvg(treeAt({ treeLayout: "topDown" }), THEME, nl) ?? "");
    expect(plain, "no layout named is topDown").toEqual(down);

    // And `leftRight` is the transpose, so depth runs along x instead of y.
    const right = nodeRects(plotToSvg(treeAt({ treeLayout: "leftRight" }), THEME, nl) ?? "");
    expect(new Set(down.map((r) => r["y"])).size, "topDown puts each depth on its own y").toBe(3);
    expect(new Set(right.map((r) => r["x"])).size, "leftRight puts each depth on its own x").toBe(3);
  });

  it("G6e4: `outline` is refused, because it is a listing and not a placement", () => {
    // An indented text listing drawn as boxes would be a different figure from
    // the terminal's — the plausible wrong figure the `null` arm refuses.
    expect(plotToSvg(treeAt({ treeLayout: "outline" }), THEME, nl), "outline has no node placement").toBeNull();
  });

  it("G6e5: a graph's edges are diagonals, which the terminal cannot draw", () => {
    // `strokePolyline` steps orthogonally because a diagonal step would claim
    // two cells at once. An SVG path draws any angle, so an edge goes where it
    // goes — a per-arm difference in what is **possible** rather than chosen.
    const svg = plotToSvg(b.plot({ id: "g", form: "graph", height: 8, series: [], graph: GRAPH } as Parameters<typeof b.plot>[0]), THEME, nl) ?? "";
    const paths = [...svg.matchAll(/<path d="M([-\d.]+) ([-\d.]+) L([-\d.]+) ([-\d.]+)"/gu)];
    expect(paths.length, "an edge per segment").toBeGreaterThan(0);
    const slanted = paths.filter((m) => Math.abs(Number(m[1]) - Number(m[3])) > 1 && Math.abs(Number(m[2]) - Number(m[4])) > 1);
    expect(slanted.length, "at least one runs at an angle").toBeGreaterThan(0);
  });

  it("G6e6: a dummy node routes an edge and draws no box", () => {
    // The Sugiyama pipeline inserts them to carry an edge across a layer, and
    // a box there would be a node the graph does not have. `labelOf` answers
    // `""` for one, which is how the caller tells them apart.
    // **The fixture has to span a layer, and `GRAPH` does not.** Its four
    // edges all join adjacent layers, so the pipeline inserts no dummy and the
    // row read four segments against four — passing for both readings, which
    // is the fixture lesson in its third family.
    //
    // `a → b → c` with `a → c` puts `c` two layers below `a`, so that edge is
    // carried by one waypoint and becomes **two** segments.
    const spanning = {
      nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
      edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "a", to: "c" }],
    };
    const svg = plotToSvg(b.plot({ id: "gs", form: "graph", height: 8, series: [], graph: spanning } as Parameters<typeof b.plot>[0]), THEME, nl) ?? "";
    expect(nodeRects(svg).length, "three declared nodes, three boxes").toBe(3);
    expect([...svg.matchAll(/<path /gu)].length, "four segments for three edges — one is carried").toBe(4);
  });

  it("G6e7: a reversed edge is reported, as the terminal reports it", () => {
    // C12 I58. An edge reversed to make the graph acyclic is drawn pointing the
    // way it is not, and a reader who is not told reads the dependency
    // backwards. **The frame is what said it was missing.**
    const cyclic = {
      nodes: [{ id: "a" }, { id: "b" }],
      edges: [{ from: "a", to: "b" }, { from: "b", to: "a" }],
    };
    const svg = plotToSvg(b.plot({ id: "gc", form: "graph", height: 8, series: [], graph: cyclic } as Parameters<typeof b.plot>[0]), THEME, nl) ?? "";
    expect(svg, "the count and the word").toContain("1 reversed");
    // And an acyclic graph says nothing, so the notice is a claim rather than
    // furniture that is always there.
    const clean = plotToSvg(b.plot({ id: "g", form: "graph", height: 8, series: [], graph: GRAPH } as Parameters<typeof b.plot>[0]), THEME, nl) ?? "";
    expect(clean.includes("reversed"), "nothing to report").toBe(false);
  });

  it("G6e8: neither form draws a value axis", () => {
    // A tree's readings are its structure and a graph's are its edges. Second
    // family running where the ticks came from `seriesRange([]) ?? {0,1}` and
    // the frame is what caught them.
    for (const blk of [treeAt(), b.plot({ id: "g", form: "graph", height: 8, series: [], graph: GRAPH } as Parameters<typeof b.plot>[0])]) {
      const svg = plotToSvg(blk, THEME, nl) ?? "";
      expect([...svg.matchAll(/text-anchor="end"/gu)].length, "no value ticks").toBe(0);
    }
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
    // **Every one, not the first six.** A sample is the same blind spot one
    // level down from the one G8 is about: it tests the rule against the forms
    // you already had in mind.
    //
    // The sample was there for a reason — `b.plot({ form: "tree", series })`
    // throws, because a tree with no `hierarchy` has no figure to fall back to
    // (C04 I65) — and the reason is `ONE_PER_FORM`'s whole job. It is a
    // `Record<PlotForm, Plot>`, so a member with no representative does not
    // compile, and the six became twenty-seven for the cost of an import.
    for (const form of refused) {
      expect(svgFamilyOf(form), `${form} is refused by the table`).toBeNull();
      // **A refusal, not a fallback.** A treemap drawn by the curve family
      // measures, rasterises and reads as a chart of something — the plausible
      // wrong figure the placeholder encoding refuses a wrap for.
      expect(plotToSvg(ONE_PER_FORM[form], THEME), `${form} carries its own geometry`).toBeNull();
    }
  });

  it("G7b: a CLAIMED form draws marks, so a missing family branch cannot hide", () => {
    // **This row exists because a mutation survived** and the survivor was
    // right about the code. Disabling the partition — `svgFamilyOf(form) ===
    // null → null` — changed nothing, because `marks()` switches on the family
    // and returns `[]` for an unclaimed one, so G8c's empty-marks clause
    // refuses it a few lines later. **Two guards, one ruling**, and the
    // partition is the one §3aj.3 commits to.
    //
    // They agree today by construction and they will stop agreeing the moment a
    // family is claimed in `SVG_FAMILY` before its branch exists in `marks()`
    // — which is what every family in the completion plan does on its first
    // commit. Then the block refuses **as though the form were unclaimed**, and
    // the empty-marks clause has masked an unbuilt renderer as an empty plot.
    //
    // So the guard is here rather than in the mutation pass: a claimed form
    // must put ink on the page.
    // **`ONE_PER_FORM` is the corpus for the *refused* side and not for this
    // one**, and family 2 is why: two of the three tile forms have a
    // representative built on the datum shape the SVG arm does not draw. A
    // guard that a claimed form puts ink on the page has to hand it the form's
    // own data, or it measures the corpus rather than the renderer.
    for (const form of supported) {
      const made = b.plot({ id: `c-${form}`, form, height: 6, ...datumFor(form) } as Parameters<typeof b.plot>[0]);
      const svg = plotToSvg(made, THEME);
      expect(svg, `${form} is claimed, so it renders`).not.toBeNull();
      const ink = (svg ?? "").split("\n").filter((l) => /^<(path|rect x|circle)/u.test(l));
      expect(ink.length, `${form} puts ink on the page rather than furniture alone`).toBeGreaterThan(0);
    }
  });
});
