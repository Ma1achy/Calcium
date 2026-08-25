/**
 * Scatter, step and ECDF — three folds over the raster that differ only in
 * how adjacent samples are joined (or not joined at all).
 *
 * **scatter** plots dots at sample positions with no interpolation.
 * **step** holds each value horizontally until the next sample, then jumps.
 * **ecdf** sorts the values, computes the cumulative fraction, then steps.
 */
import { BRAILLE_DOTS, createGrid, drawColumnSpan, drawLine, foldBraille, foldRamp, RAMP_DOTS, setDot } from "./raster.js";
import { columnsOf, finiteSamples, rowOf, type Facing, type Range } from "./scale.js";
import { ladderFor } from "./ramp.js";
import type { Series } from "../../data/viewmodel/index.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";

type Caps = Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">;

/**
 * Scatter: dots at each sample position, no Bresenham between them.
 *
 * The raster is the line renderer's raster. The only difference is that
 * adjacent columns are never joined — each sample stands alone.
 */
export function scatterRows(
  series: Series,
  range: Range,
  areaWidth: number,
  areaRows: number,
  caps: Caps,
  facing: Facing,
): readonly string[] {
  const ascii = caps.unicode === "ascii";
  const dots = ascii ? RAMP_DOTS : BRAILLE_DOTS;
  const grid = createGrid(areaWidth * dots.x, areaRows * dots.y);

  const samples = finiteSamples(series.values);
  const columns = columnsOf(samples, series.values.length, grid.dotWidth, facing); // cells-ok — a sample count
  const y = (v: number): number => rowOf(v, range, grid.dotHeight, facing);

  for (const column of columns) {
    if (column.min === column.max) {
      setDot(grid, column.x, y(column.min));
    } else {
      drawColumnSpan(grid, column.x, y(column.max), y(column.min));
    }
  }

  return ascii ? foldRamp(grid, ladderFor("height", caps).steps) : foldBraille(grid);
}

/**
 * Step: hold each value until the next sample, then vertical jump.
 *
 * The step function draws a horizontal line from each sample to the x-position
 * of the next sample, then a vertical line to the next sample's value.
 */
export function stepRows(
  series: Series,
  range: Range,
  areaWidth: number,
  areaRows: number,
  caps: Caps,
  facing: Facing,
): readonly string[] {
  const ascii = caps.unicode === "ascii";
  const dots = ascii ? RAMP_DOTS : BRAILLE_DOTS;
  const grid = createGrid(areaWidth * dots.x, areaRows * dots.y);

  const samples = finiteSamples(series.values);
  const columns = columnsOf(samples, series.values.length, grid.dotWidth, facing); // cells-ok — a sample count
  const y = (v: number): number => rowOf(v, range, grid.dotHeight, facing);

  columns.forEach((column, index) => {
    drawColumnSpan(grid, column.x, y(column.max), y(column.min));

    const next = columns[index + 1];
    if (next === undefined) return;
    if (next.iFirst !== column.iLast + 1) return;

    const yHeld = y(column.last);
    drawLine(grid, column.x, yHeld, next.x, yHeld);
    drawLine(grid, next.x, yHeld, next.x, y(next.first));
  });

  return ascii ? foldRamp(grid, ladderFor("height", caps).steps) : foldBraille(grid);
}

/**
 * A bubble chart's dots — scatter with a **size** channel (C04 §8).
 *
 * **The fourth encoding axis, and the one a terminal has least room for.** A cell
 * is the smallest mark there is, so size is spent on *how many cells* rather than
 * on a radius: a bubble is a run of dots centred on its point, one to five wide.
 * Below that the channel does not exist, which is honest — a 1.4-cell bubble is a
 * 1-cell bubble and pretending otherwise is a size axis that reports nothing.
 *
 * `sizes` is the second series, read positionally against the first.
 */
export function bubbleRows(
  series: Series,
  sizes: Series | undefined,
  range: Range,
  width: number,
  rows: number,
  _caps: Caps,
  facing: Facing,
): readonly string[] {
  // **The grid is in dots, not cells** — `createGrid(w, h)` made a grid one dot
  // per cell, so six of seven bubbles landed on the same four dots and two marks
  // came out of seven points. `scatterRows` multiplies by the dot geometry one
  // line above its own `createGrid` and this did not.
  const dots = _caps.unicode === "ascii" ? RAMP_DOTS : BRAILLE_DOTS;
  const w = Math.max(1, Math.floor(width)) * dots.x; // cells-ok — a dot column count
  const h = Math.max(1, Math.floor(rows)) * dots.y; // cells-ok — a dot row count
  const grid = createGrid(w, h);
  const vals = series.values;
  const sv = sizes?.values ?? [];
  const maxSize = Math.max(1, ...sv.filter((v): v is number => v !== null && Number.isFinite(v)));

  for (const [i, v] of vals.entries()) {
    if (v === null || !Number.isFinite(v)) continue;
    // **This form places its own columns**, which is why the facing enters
    // here as well as in `rowOf` — probe 1 measured exactly this: `bubble`
    // moved under a vertical flip and not a horizontal one (C12 §3ac).
    const at = facing.x === "left" ? vals.length - 1 - i : i; // cells-ok — a sample index
    const x = vals.length <= 1 ? 0 : Math.round((at / (vals.length - 1)) * (w - 1)); // cells-ok — a dot column
    const y = rowOf(v, range, h, facing); // cells-ok — a dot row
    const s = sv[i];
    const radius = s === null || s === undefined || !Number.isFinite(s)
      ? 0
      : Math.round((Math.abs(s) / maxSize) * 2); // cells-ok — a dot radius
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        if (dx * dx + dy * dy > radius * radius + 1) continue; // cells-ok — a dot offset
        setDot(grid, x + dx, y + dy); // cells-ok — a dot offset
      }
    }
  }
  return foldBraille(grid);
}
