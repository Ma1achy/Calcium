/**
 * Horizon chart — bands folded and stacked, colour by depth.
 *
 * The only form designed for limited vertical space. A series that would
 * need twelve rows fits in two.
 */
import type { Series } from "../../data/viewmodel/index.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";
import { ladderFor } from "./ramp.js";
import type { Range } from "./scale.js";

type Caps = Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">;

/**
 * The fold: every band occupies **the same rows**, deeper ones overdrawing.
 *
 * **The old version drew one row per band, which is the thing a horizon chart
 * exists not to do.** This file's own header says *a series that would need
 * twelve rows fits in two*, and the implementation beneath it spent one row per
 * band and clipped at `min(areaRows, bands)` — so `height: 1, bands: 3` drew
 * band 0 alone and everything above a normalised third saturated at maximum ink.
 * The defaults interacted to produce it, and no fixture pinned the two apart.
 *
 * The fold is d3-horizon's and Byron & Wattenberg's before it. Split the range
 * into `bands` slices; each slice is drawn across the *full* height, scaled to
 * itself, and the slices are painted in order so a deeper one covers a lighter.
 * A column therefore carries at most two intensities — the band the value is in,
 * filling the bottom `within` of the height, and the band below it above that,
 * which is full because the value cleared it entirely.
 *
 * That is what buys the compression: `bands` times the vertical resolution in
 * the same rows, paid for in a colour axis the reader has to learn.
 */
export function horizonRows(
  series: Series,
  range: Range,
  bands: number,
  areaWidth: number,
  areaRows: number,
  caps: Caps,
): readonly string[] {
  const w = Math.max(1, Math.floor(areaWidth));
  const h = Math.max(1, Math.floor(areaRows));
  const nBands = Math.max(1, Math.floor(bands));
  const ramp = [...ladderFor("density", caps).steps];
  const top = ramp.length - 1; // cells-ok — a ramp step count

  // Band depth reads up the ramp, so the deepest band is the densest glyph and
  // the first is visible rather than nearly blank.
  const inkFor = (band: number): string =>
    ramp[Math.max(0, Math.min(top, Math.round(((band + 1) / nBands) * top)))] ?? ramp[top] ?? " "; // cells-ok — a ramp index

  const span = range.max - range.min;
  const values = series.values;
  const n = values.length; // cells-ok — a sample count

  // **Sampled across the whole width, in both directions.** The old expression
  // was `n <= w ? col : floor(col / w * n)` — so a 50-point series in an 80-cell
  // area read `values[col]` and found nothing past column 49, leaving thirty
  // columns blank at the right. That is the heatmap's right-anchoring defect in
  // a second form: a series shorter than its area is *stretched*, never left to
  // run out. One expression covers both directions and cannot disagree with
  // itself.
  const grid = Array.from({ length: h }, () => new Array<string>(w).fill(" "));
  for (let col = 0; col < w; col += 1) {
    const idx = n <= 1 || w <= 1 ? 0 : Math.round((col / (w - 1)) * (n - 1)); // cells-ok — a sample index
    const v = values[idx];
    if (v === null || v === undefined || !Number.isFinite(v)) continue;

    const t = span > 0 ? (v - range.min) / span : 0.5;
    const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
    const scaled = clamped * nBands;
    const band = Math.min(nBands - 1, Math.floor(scaled)); // cells-ok — a band index
    const within = scaled - band;
    // At least one row of ink for any value above the floor: a reading that
    // rounds to nothing is a reading the chart does not report.
    const fill = clamped <= 0 ? 0 : Math.max(1, Math.round(within * h)); // cells-ok — a row count

    for (let r = 0; r < h; r += 1) {
      const fromBottom = h - 1 - r; // cells-ok — a row index
      if (fromBottom < fill) grid[r]![col] = inkFor(band);
      else if (band > 0) grid[r]![col] = inkFor(band - 1); // cells-ok — a band index
    }
  }
  return grid.map((r) => r.join(""));
}
