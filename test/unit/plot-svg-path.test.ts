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
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { plotToSvg, svgLayout, svgPoints, SVG_DEFAULT_LAYOUT } from "../../src/presentation/plot/svg.js";
import { rowOf, FACING_DEFAULT } from "../../src/presentation/plot/scale.js";
import { normalisedOf } from "../../src/data/viewmodel/range.js";
import { decodePng } from "../../src/presentation/image/index.js";
import { b } from "../../src/shell/builders/index.js";

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
const src = (rel: string): string =>
  readFileSync(new URL(rel, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/^\s*\/\/.*$/gmu, "");

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
    const svg = src("../../src/presentation/plot/svg.ts");
    expect(/\blayoutFor\b/u.test(svg), "the cell ladder stays in the cell path").toBe(false);
    expect(/\bAXIS_GUTTER\b|\bMIN_AREA\b|\blabelWidth\b/u.test(svg), "and so do its constants").toBe(false);
  });

  it("G4 (§3aj hazard 4): the shared layer cannot reach cells(), and the image path never calls it", () => {
    // **At the seam, not at the output.** The gate says this one is discovered
    // as a wrong-looking image; a pixel assertion would be discovering it that
    // way. The seam is structural: `data/` may not import `presentation/`, so
    // `cells()` is not reachable from the shared layer and a shared layout
    // that reached for it would not compile.
    const shared = src("../../src/data/viewmodel/range.ts");
    expect(/\bcells\s*\(/u.test(shared), "the shared layer does not measure cells").toBe(false);
    expect(/from "\.\.\/\.\.\/presentation/u.test(shared), "and could not if it wanted to").toBe(false);

    // The image path is under the same rule by choice rather than by layer, so
    // it is asserted directly. `cells()` means nothing to a `<text>` element:
    // ambiguous width, grapheme clustering and the wide arm are all facts about
    // a terminal grid.
    const svg = src("../../src/presentation/plot/svg.ts");
    expect(/\bcells\s*\(/u.test(svg), "the image path never measures a label").toBe(false);
    expect(/ambiguousWidth|TerminalCapabilities/u.test(svg), "and holds no terminal fact").toBe(false);

    // **The control**: the terminal path *does* measure, so the rows above are
    // about the seam rather than about `cells(` being a rare string.
    expect(/\bcells\s*\(/u.test(src("../../src/presentation/plot/axes.ts")), "the cell path measures").toBe(true);
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
    const svg = plotToSvg(block);
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    const decoded = decodePng(new Uint8Array(png));
    expect(decoded.ok, "the SVG is a valid picture").toBe(true);
    if (!decoded.ok) return;
    expect(decoded.pixels.width).toBe(SVG_DEFAULT_LAYOUT.width);
    expect(decoded.pixels.height).toBe(SVG_DEFAULT_LAYOUT.height);

    // The curve's ink, found by its own colour, and compared against the
    // coordinate rather than against a golden.
    const px = decoded.pixels;
    let inkTop = px.height;
    let inkBottom = -1;
    for (let y = 0; y < px.height; y += 1) {
      for (let x = 0; x < px.width; x += 1) {
        const i = (y * px.width + x) * 4;
        // #6ea8fe, with the rasteriser's antialiasing tolerated.
        if ((px.data[i + 2] ?? 0) > 200 && (px.data[i] ?? 0) < 160 && (px.data[i] ?? 0) > 60) {
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
    const svg = plotToSvg(block);
    expect(svg).toContain('text-anchor="end"');
    expect(svg.match(/<text /gu)?.length ?? 0, "one per tick").toBeGreaterThan(1);
    // And a label that would break the document is escaped rather than measured.
    const risky = b.plot({ id: "r", form: "line", height: 4, series: [{ label: "a<b&c", values: [1, 2] }] });
    expect(plotToSvg(risky).includes("a<b&c"), "raw markup never reaches the output").toBe(false);
  });
});
