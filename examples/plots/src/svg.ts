/**
 * The second renderer, and the image a terminal can show.
 *
 * **This file could not have been written a commit ago** (F376). `plotToSvg` was
 * published and described as the second renderer with `ResolvedTheme` and
 * `loadTheme` both interior — so it resolved, type-checked at the call site and
 * could not be called. C24 I29 and MG29 came out of writing it.
 *
 * The chain: `plotToSvg` → `sharp` → PNG → `b.image`. The last step is the one
 * that makes a comparison possible at all, and it degrades on its own ladder —
 * kitty's graphics protocol where the terminal has it, an ordered braille dither
 * where it does not, and `alt` where there are no pixels at all. The dither is
 * the **first** arm rather than the last (C09 I36), which is why `/compare` is
 * worth looking at in an ordinary terminal.
 */
import { b, defaultTheme, loadTheme, plotToSvg } from "@fmx/calcium";
import type { SvgLayout } from "@fmx/calcium";
import type { Block, Plot, ResolvedTheme } from "@fmx/calcium";
import sharp from "sharp";

/**
 * The shipped theme, loaded the way a consumer loads it — **and now that
 * sentence is true.** `tools/svg-baseline.mjs` carried it while calling an
 * interior function, which is F376's own evidence.
 */
const loaded = loadTheme(defaultTheme, "dark");
if (!loaded.ok) throw new Error(`the shipped theme does not load: ${loaded.error.join(", ")}`);
export const THEME: ResolvedTheme = loaded.value.current;

/**
 * The framework's own cell ratio — **not a guess at one.**
 *
 * `imageCells` derives the column count as `round(rows * CELL_ASPECT * aspect)`,
 * with `CELL_ASPECT = 2` (a cell is twice as tall as it is wide). So to get a
 * box back of exactly `cols x rows`, the raster's aspect must be
 * `cols / (rows * 2)` — and picking plausible pixel dimensions instead gave a
 * panel half the width it asked for, which is the third time on this surface
 * that reasoning about a ratio lost to reading the one in use.
 */
const CELL_ASPECT = 2;
/** Raster pixels per cell row; the width follows from the aspect above. */
const CELL_H = 28;
const CELL_W = CELL_H / CELL_ASPECT;

/**
 * The layout that makes the two panels **correspond**.
 *
 * **The default viewBox is 640x320 whatever the block is**, so the SVG arrived
 * at a different aspect from the terminal's cell box and its plot area took up a
 * different share of it — two pictures of one figure that a reader cannot lay
 * over each other, which is the only thing a comparison is for.
 *
 * So the viewBox is the **cell box in pixels** — `cols x rows` at this font's
 * cell ratio — and the gutter is the same *share* of the width the terminal
 * spends on its y-labels. `SvgLayout`'s `gutter` and `pad` are shares in `0..1`
 * precisely so this is expressible.
 */
function layoutFor(cols: number, rows: number): SvgLayout {
  return {
    width: cols * CELL_W,
    height: rows * CELL_H,
    // Four cells of labels and a space, over the width — the terminal's own
    // gutter for a two-digit ordinate at this size.
    gutter: 5 / cols,
    pad: 1 / cols,
  };
}

/** The SVG, or `null` where this arm refuses the form (26 refusals across 6 families). */
export function svgOf(block: Block, cols = 46, rows = 14): string | null {
  return block.kind === "plot" ? plotToSvg(block as Plot, THEME, layoutFor(cols, rows)) : null;
}

/**
 * The figure with its painted ground removed, so the PNG carries alpha.
 *
 * **Better than normalising the luminance, and both arms say so.** `plotToSvg`
 * opens with `<rect width="100%" height="100%" fill="…"/>` — the theme's
 * background, right for a browser and wrong for a terminal that already has one.
 *
 *   - **kitty composites over the cell background**, so a transparent ground
 *     puts the figure straight onto the terminal instead of a slightly darker
 *     rectangle sitting on it. `f=100` keeps the alpha channel.
 *   - **The dither composites over black and honours alpha** — `luminance()`
 *     multiplies by it, and its own comment says transparent is therefore dark,
 *     *the answer that leaves a PNG with an alpha channel looking like the thing
 *     it is a picture of rather than a silhouette*.
 *
 * So one change serves both, where the `linear` map it replaces served the
 * dither by darkening the ink along with the ground. **The assertion is the
 * point**: a `replace` that silently matched nothing would put the ground back
 * and read as working.
 */
function unpainted(svg: string): string {
  const ground = /<rect width="100%" height="100%" fill="[^"]*"\/>/u;
  if (!ground.test(svg)) {
    throw new Error("plotToSvg no longer opens with a background rect — the ground strip is stale");
  }
  return svg.replace(ground, "");
}

/**
 * The same figure as pixels, at `height` rows.
 *
 * **Cached by SVG text**, because a `b.live` part re-renders on every tick and
 * rasterising is the expensive step — and identical SVG means an identical PNG,
 * so the key is the whole answer rather than a proxy for it.
 */
const pngs = new Map<string, string>();

/**
 * Raster rows per terminal row.
 *
 * **A cell is about 28 pixels tall in the font these frames were read with**
 * (DejaVu Sans Mono at 13pt under kitty), so this is near-native for the pixel
 * arm and free for the dither, which averages down to its dot grid regardless.
 *
 * **The residue, stated**: the two arms want different *grounds* even though
 * they can share a raster. The dither needs the figure's ground at zero to have
 * any range left for the ink; kitty would rather have the SVG's own `#141414`,
 * which matches the terminal. Normalising costs the pixel arm a marginally
 * darker rectangle and buys the dither the whole picture, so it is applied to
 * both — and a consumer who knows their protocol can do better, since
 * `imageProtocol` is on the capabilities the framework already hands producers.
 */
const PIXELS_PER_ROW = 28;

export async function imageOf(
  block: Block,
  cols: number,
  rows: number,
  alt: string,
): Promise<Block | null> {
  const drawn = svgOf(block, cols, rows);
  if (drawn === null) return null;
  const svg = unpainted(drawn);
  const key = `${String(cols)}x${String(rows)}:${svg}`;
  let data = pngs.get(key);
  if (data === undefined) {
    // **Rasterised at the dot grid, and the first version was not.**
    //
    // A braille cell is 2×4 dots, so `height` rows is `height * 4` dot rows —
    // and the ordered dither averages the image into exactly that. Asking sharp
    // for `height * 38` pixels gave a 1064×532 PNG downsampled ~9:1, which
    // averages a 1px stroke into a 2% brightening of its neighbourhood and
    // reads as an empty field of noise.
    //
    // Measured rather than reasoned: the SVG paints its own `#141414` ground,
    // so the PNG's mean luminance is **22 of 255** — the signal is entirely in
    // the few percent of pixels that are ink, which is what a 9:1 downsample
    // destroys. Rendering at the dot resolution keeps a stroke one dot wide.
    //
    // **The raster is sized for the terminal's pixels, not for the dither's
    // dots — and it was the other way round.** `height * 4` is the braille dot
    // grid: 56 pixels tall for a 14-row block, which the dither is happy with
    // and kitty then scales up sevenfold. Real pixels arrived blurry because
    // the raster was chosen for the arm that could be seen at the time.
    //
    // **One raster serves both, measured rather than assumed.** With the ground
    // normalised, the dither's output is unchanged across 4x, 12x, 24x and 40x
    // — 42, 41, 41, 41 inked cells of 784. So the resolution never mattered to
    // it, and the earlier belief that the downsample destroyed the stroke was
    // wrong: the ground was the whole of it. That leaves the size free to be
    // whatever the pixel arm wants, and `PIXELS_PER_ROW` is near this font's
    // cell height rather than a guess at a ratio.
    //
    // **And the ground is gone rather than darkened** — see `unpainted`. The SVG paints its own `#141414` — right for a browser
    // and matching the terminal theme — and an *ordered* dither maps luminance
    // to dot density, so a flat 8% ground becomes a regular 8%-dense texture
    // covering most cells. The figure is then drawn inside noise of its own
    // brightness.
    //
    // Measured on one line plot at 14 rows: **511 of 784 cells inked before,
    // 42 after**, and the curve is legible only in the second. `linear` maps
    // 20 → 0 and leaves white where it is, so the ground goes to no dots and
    // the ink keeps its range.
    //
    // A photograph has no flat ground, which is what C09 I36's dither is built
    // for; a rendered figure is nearly all ground. That is a property of the
    // pairing rather than a defect in either (F378).
    const buf = await sharp(Buffer.from(svg), { density: 144 })
      .resize({ width: cols * CELL_W, height: rows * CELL_H, fit: "fill" })
      .png()
      .toBuffer();
    data = buf.toString("base64");
    pngs.set(key, data);
  }
  return b.image({ id: `${block.id}-svg`, data, height: rows, alt });
}
