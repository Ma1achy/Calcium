/**
 * Horizon chart — bands folded about a baseline, **colour by depth and height
 * by position within the band** (C12 I52, §3z).
 *
 * The only form designed for limited vertical space. A series that would need
 * twelve rows fits in two.
 *
 * **Both channels used to be one channel.** Band depth rode
 * `ladderFor("density")` — a glyph ramp — so the alphabet that encodes height
 * was already spent, and within-band height was a whole number of rows. At
 * `height: 1`, which is the canonical horizon and the compression the form
 * exists for, every inked column was therefore exactly one row and the only
 * variation in the frame was the glyph. This file's own header said the
 * compression is *paid for in a colour axis the reader has to learn* while
 * `DEFAULT_COLORMAP.horizon` was `null`: the price charged and the goods never
 * delivered.
 *
 * **The ladder this needed was already here, under the axis it actually
 * encodes.** `ladderFor("height")` is `▁▂▃▄▅▆▇█` with the braille substitution
 * at `ambiguousWidth: "wide"` and the ASCII arm below that — no new glyph table,
 * the same shape the contour's sixteen cases had. `ramp.ts` states that a
 * mapped type makes *`ladderFor("density")` returns a height ramp* unspellable,
 * and that is true and is about the **ladder**; nothing checks that a
 * *renderer* names the axis it draws, which is the blind spot this form fell
 * into. The name was even right for what the code did — depth *was* an ink
 * density — and wrong for what the form is.
 *
 * **The fold mirrors rather than offsets, and §3r is what forces it**: Unicode's
 * eighths are a complete ladder upward and `▀`/`▔` are the whole of the downward
 * repertoire, so an offset arm would resolve one direction to an eighth and the
 * other to a half — precision at one end reading as precision at both. The sign
 * therefore rides the channel that has room, a diverging map's two halves.
 */
import type { Plot, Series } from "../../data/viewmodel/index.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";
import type { RenderContext } from "../blocks/types.js";
import { tone, wash, type Span } from "../blocks/paint.js";
import { continuousColour } from "../theme/colormap.js";
import type { Colormap } from "../theme/colormap.js";
import type { ColourValue, Style } from "../theme/types.js";
import { formatValue } from "./axes.js";
import { ladderFor } from "./ramp.js";
// **The fold is `figure.ts`'s now** (C12 I71, §3ak.29). `within` is a fraction
// of a band and `eighths` is how many of a cell's eight sub-rows that buys —
// the geometry and the raster, one line apart in the loop below.
import { horizonBands, horizonBaseline, horizonBandT } from "./figure.js";
import type { Range } from "./scale.js";

type Caps = Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">;

/** Sub-cell positions one row of the height ladder resolves. */
export const EIGHTHS_PER_ROW = 8;

/**
 * One cell of a horizon, or `null` where the column has no reading.
 *
 * **`eighths` is per cell and not per column**, so a multi-row horizon composes
 * without a second rule: the rows below the top inked one are full and the top
 * one carries the remainder (§3z H5). At `height: 1` that collapses to *the
 * cell is the remainder*, which is why the two agree there rather than meeting
 * there.
 */
export type HorizonCell = Readonly<{
  /** 0 nearest the baseline, `bands − 1` deepest. */
  band: number;
  /** `1` above the baseline, `-1` below it. */
  sign: 1 | -1;
  /** Ink in this cell, 1–8. A cell with none is `null` rather than 0. */
  eighths: number;
}>;

/**
 * Whether any reading falls on the far side of the baseline (§3z H3).
 *
 * The gates use this: a signed series needs a map with two halves, and a
 * sequential one would draw a trough in the same ramp as a peak.
 */
export function horizonIsSigned(series: Series, range: Range): boolean {
  const baseline = horizonBaseline(range);
  return series.values.some((v) => v !== null && Number.isFinite(v) && v < baseline);
}

/**
 * The grid a horizon draws, in cells — **pure geometry, no colour and no
 * capabilities** (I52, §3z).
 *
 * Rows run top to bottom, columns left to right. Separated from the painting
 * because the two channels are resolved by different things: the band is
 * arithmetic and the glyph is a capability question, and computing them
 * together is what let one alphabet carry both.
 */
export function horizonGrid(
  series: Series,
  range: Range,
  bands: number,
  areaWidth: number,
  areaRows: number,
): readonly (readonly (HorizonCell | null)[])[] {
  const w = Math.max(1, Math.floor(areaWidth)); // cells-ok — a cell width
  const h = Math.max(1, Math.floor(areaRows)); // cells-ok — a row count
  // **The fold, taken rather than recomputed.** Baseline, band and `within` are
  // the figure's; what is left here is the resampling onto columns and the spend
  // on eighths, both of which need a grid.
  const folded = horizonBands(series, range, bands);
  const count = folded.length; // cells-ok — a sample count
  const grid: (HorizonCell | null)[][] = Array.from({ length: h }, () =>
    new Array<HorizonCell | null>(w).fill(null));

  for (let col = 0; col < w; col += 1) { // cells-ok — a column index
    // **Sampled across the whole width, in both directions.** A series shorter
    // than its area is stretched, never left to run out at the right — the
    // heatmap's right-anchoring defect in a second form, and one expression
    // covers both directions so it cannot disagree with itself.
    const idx = count <= 1 || w <= 1 ? 0 : Math.round((col / (w - 1)) * (count - 1)); // cells-ok — a sample index
    const cell = folded[idx];
    if (cell === null || cell === undefined) continue;
    const { band, sign, within } = cell;

    // **A finite reading always draws ink** (I52, I16 one form along). A floor
    // that renders blank gives blank two meanings — absence and the minimum —
    // in the form whose whole subject is *how deep*.
    const total = Math.max(1, Math.min(h * EIGHTHS_PER_ROW,
      Math.round(within * h * EIGHTHS_PER_ROW))); // cells-ok — an eighth count
    const full = Math.floor(total / EIGHTHS_PER_ROW); // cells-ok — a row count
    const remainder = total - full * EIGHTHS_PER_ROW; // cells-ok — an eighth count

    for (let r = 0; r < h; r += 1) { // cells-ok — a row index
      const fromBottom = h - 1 - r; // cells-ok — a row index
      if (fromBottom < full) grid[r]![col] = { band, sign, eighths: EIGHTHS_PER_ROW };
      else if (fromBottom === full && remainder > 0) grid[r]![col] = { band, sign, eighths: remainder };
    }
  }
  return grid;
}

/**
 * A cell's glyph, from the ladder for the axis it encodes (I52, §3z).
 *
 * `ladderFor("height")` and not `"density"` — the eighths, with the braille
 * substitution at `ambiguousWidth: "wide"` and ASCII below that, all of which
 * `ramp.ts` already answers.
 */
export function horizonGlyph(cell: HorizonCell | null, caps: Caps): string {
  if (cell === null) return " ";
  const steps = [...ladderFor("height", caps).steps];
  const top = steps.length - 1; // cells-ok — a ramp index
  return steps[Math.max(0, Math.min(top, cell.eighths - 1))] ?? steps[top] ?? " "; // cells-ok — a ramp index
}

/**
 * The depth ramp used where there is no colour (§3z, ruling 4 arm A).
 *
 * **Below `CONTINUOUS_FLOOR` the design has one channel for two data**, which is
 * where it started. This arm keeps depth — the compression the form exists for
 * — and loses the within-band height, which is today's behaviour and the
 * smaller of the two changes. §3z carries the alternative and the frame is what
 * chooses between them.
 */
export function horizonDepthGlyph(cell: HorizonCell | null, bands: number, caps: Caps): string {
  if (cell === null) return " ";
  const steps = [...ladderFor("density", caps).steps];
  const top = steps.length - 1; // cells-ok — a ramp index
  const n = Math.max(1, Math.floor(bands)); // cells-ok — a band count
  return steps[Math.max(0, Math.min(top, Math.round(((cell.band + 1) / n) * top)))] ?? steps[top] ?? " "; // cells-ok — a ramp index
}

/**
 * One row of cells as painted spans (I52, §3z).
 *
 * **The glyph carries height and the style carries depth**, which is the whole
 * ruling expressed at the one place both are known. Runs of identical style are
 * merged, as `heatSpans` does — a span per cell is correct and emits an SGR
 * sequence per column.
 *
 * **Where colour cannot carry the band, the glyph does** and the height channel
 * is what gives way (§3z ruling 4, arm A). `continuousColour` is what declines,
 * returning `undefined` below `CONTINUOUS_FLOOR` — so the condition is *can
 * colour carry it*, never *is a colormap named*, which is the distinction
 * `matrixFurniture`'s legend already records one file along.
 */
export function horizonSpans(
  row: readonly (HorizonCell | null)[],
  bands: number,
  map: Colormap | undefined,
  ctx: RenderContext,
): readonly Span[] {
  const caps = ctx.capabilities;
  const diverging = map?.kind === "diverging";
  const colourOf = (cell: HorizonCell): ColourValue | undefined =>
    map === undefined ? undefined : continuousColour(map, horizonBandT(cell, bands, diverging), caps);

  // One probe decides the arm for the whole row rather than per cell: a row
  // that lost colour in some cells and not others would be two encodings in one
  // line, which is the collision this form is being fixed for.
  const painted = map !== undefined
    && continuousColour(map, 0.5, caps) !== undefined;

  const out: Span[] = [];
  let run = "";
  let runStyle: Style | undefined;
  const flush = (): void => {
    if (run === "") return;
    out.push(runStyle === undefined ? { text: run } : { text: run, style: runStyle });
    run = "";
  };

  for (const cell of row) {
    const glyph = painted
      ? horizonGlyph(cell, caps)
      : horizonDepthGlyph(cell, bands, caps);
    const colour = painted && cell !== null ? colourOf(cell) : undefined;
    const style: Style | undefined = colour === undefined ? undefined : { colour };
    if (style?.colour !== runStyle?.colour) {
      flush();
      runStyle = style;
    }
    run += glyph;
  }
  flush();
  return out;
}

/**
 * The band scale, which is the reading (I52, §3z H7).
 *
 * **A horizon with no legend is a picture of coloured noise**, which is I19's
 * argument for a matrix's scale arriving on the one other form whose channel is
 * a colour a reader has to learn. `legend: false` is refused at both gates for
 * that reason rather than silently dropping the row.
 *
 * The baseline is named in the middle where the data is signed, so the two
 * halves of the map read as two directions rather than as one long ramp.
 */
export function horizonLegendSpans(
  range: Range,
  bands: number,
  signed: boolean,
  map: Colormap | undefined,
  format: Plot["yFormat"],
  ctx: RenderContext,
): readonly Span[] {
  const caps = ctx.capabilities;
  const muted = tone("muted", ctx.theme, caps);
  const diverging = map?.kind === "diverging";
  const n = Math.max(1, Math.floor(bands)); // cells-ok — a band count
  const baseline = horizonBaseline(range);
  const painted = map !== undefined && continuousColour(map, 0.5, caps) !== undefined;
  const steps = [...ladderFor("density", caps).steps];

  /**
   * **A painted blank, never a block glyph** (C10 I21, SS47). `wash` exists so a
   * colormap value reaches a cell as a *background* and cannot land on a mark
   * the framework would otherwise have to substitute — the heatmap's legend is
   * the same call. A literal `█` here is a mark with no `Glyph` slot and no
   * capability arm, which SS47 caught on the commit that wrote it.
   */
  const cellFor = (band: number, sign: 1 | -1): Span => {
    if (!painted) {
      const top = steps.length - 1; // cells-ok — a ramp index
      const g = steps[Math.max(0, Math.min(top, Math.round(((band + 1) / n) * top)))] ?? " "; // cells-ok — a ramp index
      return { text: g, style: muted };
    }
    const t = horizonBandT({ band, sign }, n, diverging);
    const colour = map === undefined ? undefined : continuousColour(map, t, caps);
    return colour === undefined ? { text: " ", style: muted } : wash(1, colour);
  };

  const out: Span[] = [{ text: formatValue(range.min, format), style: muted }, { text: " " }];
  if (signed) {
    for (let b = n - 1; b >= 0; b -= 1) out.push(cellFor(b, -1)); // cells-ok — a band index
    out.push({ text: ` ${formatValue(baseline, format)} `, style: muted });
  }
  for (let b = 0; b < n; b += 1) out.push(cellFor(b, 1)); // cells-ok — a band index
  out.push({ text: " " }, { text: formatValue(range.max, format), style: muted });
  out.push({ text: `  ${String(n)} bands`, style: muted }); // cells-ok — a band count
  return out;
}
