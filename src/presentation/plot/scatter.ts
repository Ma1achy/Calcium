/**
 * Scatter, step and ECDF — three folds over the raster that differ only in
 * how adjacent samples are joined (or not joined at all).
 *
 * **scatter** plots dots at sample positions with no interpolation.
 * **step** holds each value horizontally until the next sample, then jumps.
 * **ecdf** sorts the values, computes the cumulative fraction, then steps.
 */
import { BRAILLE_DOTS, createGrid, drawColumnSpan, drawLine, foldBraille, foldRamp, RAMP_DOTS, setDot } from "./raster.js";
import { columnsOf, finiteSamples, rowOf, type Range } from "./scale.js";
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
): readonly string[] {
  const ascii = caps.unicode === "ascii";
  const dots = ascii ? RAMP_DOTS : BRAILLE_DOTS;
  const grid = createGrid(areaWidth * dots.x, areaRows * dots.y);

  const samples = finiteSamples(series.values);
  const columns = columnsOf(samples, series.values.length, grid.dotWidth); // cells-ok — a sample count
  const y = (v: number): number => rowOf(v, range, grid.dotHeight);

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
): readonly string[] {
  const ascii = caps.unicode === "ascii";
  const dots = ascii ? RAMP_DOTS : BRAILLE_DOTS;
  const grid = createGrid(areaWidth * dots.x, areaRows * dots.y);

  const samples = finiteSamples(series.values);
  const columns = columnsOf(samples, series.values.length, grid.dotWidth); // cells-ok — a sample count
  const y = (v: number): number => rowOf(v, range, grid.dotHeight);

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
 * ECDF: the empirical cumulative distribution function.
 *
 * Sort the values, compute the cumulative fraction as y, then draw as a step
 * function. The range is always [0, 1] — the fraction axis.
 */
export function ecdfSeries(series: Series): Series {
  const finite = finiteSamples(series.values);
  if (finite.length === 0) return { ...series, values: [] }; // cells-ok — a sample count

  const sorted = [...finite].sort((a, b) => a.v - b.v);
  const n = sorted.length; // cells-ok — a sample count
  const values: number[] = [];

  for (let i = 0; i < n; i++) {
    values.push((i + 1) / n);
  }

  return { ...series, values };
}
