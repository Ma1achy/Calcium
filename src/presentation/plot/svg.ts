/**
 * The second renderer — **SVG, and the layout is its own** (C12 §3aj, phase 3).
 *
 * **SVG rather than PNG, and the reason is hazard 4.** A rasterised label needs
 * font metrics to be placed; an SVG label is a `<text>` element that places
 * itself. So the whole of what `cells()` does for the terminal path —
 * ambiguous width, grapheme clustering, the wide arm — has no counterpart here
 * and needs none, and `sharp` turns the result into a PNG for the kitty path
 * with no new dependency: it is already in the ledger for the catalogue's own
 * frames.
 *
 * **But that is a consequence of hazard 3, not a property of SVG**, and the two
 * are listed as independent hazards. An SVG label needs no metrics *because this
 * layout never sizes anything to fit a label* — the gutter is a fraction of the
 * width. The moment a shared layout sized a gutter to its longest label, this
 * path would need metrics to agree with it, and hazard 4 would be back. **Hazard
 * 3 is what makes hazard 4 free**, and violating either violates both.
 *
 * **What this is not: `ansiToSvg`.** `tools/catalogue-png.mjs` already writes
 * SVG, and it writes a *picture of a terminal* — `maxCols · CELL_W`, one glyph
 * per cell, every coordinate a cell coordinate scaled up. It inherits every
 * cell-shaped decision the frame made, which is exactly what this path exists
 * not to be. Two things called SVG in one repository, and only one of them is a
 * second renderer.
 */
import { normalisedOf, type PinnedRange } from "../../data/viewmodel/range.js";
import { seriesRange } from "./scale.js";
import { niceAxis } from "./axes.js";
import type { Plot } from "../../data/viewmodel/index.js";

/**
 * The image path's layout — **its own units, and no cells anywhere** (§3aj
 * hazard 3).
 *
 * *Anything measured in cells stays in cells; the image renderer needs its own.*
 * So this takes pixels and spends them as **fractions**: `gutter` is a share of
 * the width rather than a count of anything. That is what lets a label place
 * itself, and it is the reason `layoutFor` is not reachable from this file.
 *
 * **Fractions rather than pixels for the interior**, so the same layout serves
 * any output size — which the terminal path cannot do, because a cell is not
 * divisible and a gutter of 3.4 columns is not a gutter.
 */
export type SvgLayout = Readonly<{
  /** The viewBox, in px. The only absolute numbers here. */
  width: number;
  height: number;
  /** Shares of the width and height. `0..1`. */
  gutter: number;
  pad: number;
}>;

/**
 * Type size in px — **a constant rather than a member**, because nothing outside
 * this file names it and a member nobody sets is an export nothing consumes.
 * It sizes nothing: the label places itself, so this is the glyph height and
 * never an input to a layout (§3aj hazard 4).
 */
export const SVG_FONT_SIZE = 12;

export const SVG_DEFAULT_LAYOUT: SvgLayout = Object.freeze({
  width: 640,
  height: 320,
  // **A tenth of the width, not the widest label.** Sizing to content is what
  // would drag metrics back in, and it is `layoutFor`'s job precisely because
  // cells cannot overflow gracefully and pixels can.
  gutter: 0.1,
  pad: 0.04,
});

/** A layout at a size. Takes no capabilities, and there is nothing to give it. */
export function svgLayout(width: number, height: number): SvgLayout {
  return { ...SVG_DEFAULT_LAYOUT, width: Math.max(1, width), height: Math.max(1, height) };
}

/** `<` and `&` in a label. The whole of the escaping an SVG `<text>` needs. */
function escape(text: string): string {
  return text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
}

/** A number with three decimals, so the output is byte-stable across platforms. */
function n(v: number): string {
  return (Math.round(v * 1000) / 1000).toString();
}

/**
 * A plot's samples in the SVG's pixel space — **from the shared coordinate**.
 *
 * `normalisedOf` is the same function `rowOf` calls, so the two paths cannot
 * disagree about where a value sits: one multiplies by `rows - 1` and rounds,
 * the other multiplies by a pixel height and does not. **That is §3aj G5** —
 * only the rasterisation differs — and it is asserted rather than described.
 */
export function svgPoints(
  values: readonly (number | null)[],
  range: PinnedRange,
  layout: SvgLayout,
): readonly (readonly [number, number] | null)[] {
  const left = layout.width * (layout.gutter + layout.pad);
  const right = layout.width * (1 - layout.pad);
  const top = layout.height * layout.pad;
  const bottom = layout.height * (1 - layout.gutter);
  const span = Math.max(1, values.length - 1); // cells-ok — a sample count
  return values.map((v, i) => {
    if (v === null || !Number.isFinite(v)) return null;
    const x = left + ((right - left) * i) / span;
    // `invert` is `true` because a curve's values face up and SVG's y grows
    // down — the same fact `FACING_DEFAULT` carries for the terminal path,
    // spelled here because L0 does not hold `Facing` (§3ac).
    const y = top + (bottom - top) * normalisedOf(v, range, true);
    return [x, y] as const;
  });
}

/**
 * A line plot as SVG.
 *
 * **One form**, because the point of the second commit is that the hazards get
 * subjects rather than that the catalogue gets a second output. Every other form
 * is the same three ingredients — the shared range, the shared coordinate, and a
 * layout in fractions — and adding them is work rather than a decision.
 */
export function plotToSvg(block: Plot, layout: SvgLayout = SVG_DEFAULT_LAYOUT): string {
  const range = seriesRange(block.series, block) ?? { min: 0, max: 1 };
  const axis = niceAxis(range, 5, block);
  const left = layout.width * (layout.gutter + layout.pad);
  const top = layout.height * layout.pad;
  const bottom = layout.height * (1 - layout.gutter);

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(layout.width)} ${n(layout.height)}" ` +
      `width="${n(layout.width)}" height="${n(layout.height)}">`,
    `<rect width="100%" height="100%" fill="#101014"/>`,
  ];

  // **The labels place themselves.** `text-anchor="end"` at the gutter's right
  // edge, and nothing here knows or asks how wide the string is — which is the
  // whole of hazard 4's answer, visible in one attribute.
  for (const tick of axis.ticks) {
    const y = top + (bottom - top) * normalisedOf(tick, range, true);
    parts.push(
      `<line x1="${n(left)}" y1="${n(y)}" x2="${n(layout.width * (1 - layout.pad))}" y2="${n(y)}" ` +
        `stroke="#2a2a33" stroke-width="1"/>`,
      `<text x="${n(left - 6)}" y="${n(y + SVG_FONT_SIZE / 3)}" text-anchor="end" ` +
        `font-size="${n(SVG_FONT_SIZE)}" font-family="monospace" fill="#8a8a99">` +
        `${escape(String(tick))}</text>`,
    );
  }

  for (const series of block.series) {
    const points = svgPoints(series.values, range, layout);
    const d = points
      .map((p, i) => (p === null ? "" : `${i === 0 || points[i - 1] === null ? "M" : "L"}${n(p[0])} ${n(p[1])}`))
      .filter((seg) => seg !== "")
      .join(" ");
    if (d !== "") {
      parts.push(`<path d="${d}" fill="none" stroke="#6ea8fe" stroke-width="2"/>`);
    }
  }

  parts.push("</svg>");
  return parts.join("\n");
}
