/**
 * KDE forms — density, violin, ridgeline.
 *
 * Gaussian kernel density estimation, then three folds over the curve.
 */
import type { Series } from "../../data/viewmodel/index.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";
import { curveRows } from "./curve.js";
import { pairFor } from "./ramp.js";
import type { Range } from "./scale.js";

type Caps = Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">;

function gaussianKernel(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function silvermanBandwidth(values: readonly number[]): number {
  const n = values.length; // cells-ok — a sample count
  if (n <= 1) return 1;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  const iqr = (() => {
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(n * 0.25)] ?? 0;
    const q3 = sorted[Math.floor(n * 0.75)] ?? 0;
    return q3 - q1;
  })();
  const spread = Math.min(sd, iqr / 1.34);
  return spread > 0 ? 1.06 * spread * Math.pow(n, -0.2) : 1;
}

/**
 * Estimate the density at `points` given `data` values and a bandwidth.
 */
export function kde(
  data: readonly number[],
  points: readonly number[],
  bandwidth?: number,
): number[] {
  const h = bandwidth ?? silvermanBandwidth(data);
  const n = data.length; // cells-ok — a sample count
  if (n === 0) return points.map(() => 0);

  return points.map((x) => {
    let sum = 0;
    for (const xi of data) sum += gaussianKernel((x - xi) / h);
    return sum / (n * h);
  });
}

/**
 * Build a density series from raw data: estimate the density and return a
 * Series whose values are the density estimates, suitable for rendering as a
 * line/curve.
 */
export function densitySeries(series: Series, resolution = 100): { series: Series; range: Range } {
  const finite = series.values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (finite.length === 0) return { series: { ...series, values: [] }, range: { min: 0, max: 1 } }; // cells-ok — a sample count

  const sorted = [...finite].sort((a, b) => a - b);
  const lo = sorted[0]!;
  const hi = sorted[sorted.length - 1]!; // cells-ok — a sample count
  const pad = (hi - lo) * 0.1 || 1;

  const points: number[] = [];
  for (let i = 0; i < resolution; i++) {
    points.push(lo - pad + ((hi - lo + 2 * pad) * i) / (resolution - 1));
  }

  const densities = kde(finite, points);
  const maxD = Math.max(...densities);

  return {
    series: { ...series, values: densities },
    range: { min: 0, max: maxD > 0 ? maxD : 1 },
  };
}

/**
 * Render density as a curve using curveRows.
 */
export function densityRows(
  series: Series,
  range: Range,
  areaWidth: number,
  areaRows: number,
  caps: Caps,
): readonly string[] {
  return curveRows(series, range, areaWidth, areaRows, caps);
}

/**
 * A mirrored density shape — wide where density is high, narrow where it is low.
 *
 * For each column, the normalised density maps to a width in rows from the centre
 * outward. The fill pair encodes the body.
 */
export function violinRows(
  series: Series,
  areaWidth: number,
  rowsPerCategory: number,
  caps: Caps,
): readonly string[] {
  const finite = series.values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (finite.length === 0 || rowsPerCategory < 1) { // cells-ok — a sample count
    return Array.from({ length: rowsPerCategory }, () => " ".repeat(areaWidth));
  }

  const points: number[] = [];
  for (let i = 0; i < areaWidth; i++) points.push(i);

  const sorted = [...finite].sort((a, b) => a - b);
  const lo = sorted[0]!;
  const hi = sorted[sorted.length - 1]!; // cells-ok — a sample count
  const pad = (hi - lo) * 0.1 || 1;

  const evalPoints = points.map((i) => lo - pad + ((hi - lo + 2 * pad) * i) / Math.max(1, areaWidth - 1));
  const densities = kde(finite, evalPoints);
  const maxD = Math.max(...densities);
  if (maxD <= 0) return Array.from({ length: rowsPerCategory }, () => " ".repeat(areaWidth));

  const pair = pairFor(caps);
  const mid = Math.floor((rowsPerCategory - 1) / 2);
  const half = mid + 1;

  const grid: string[][] = Array.from({ length: rowsPerCategory }, () =>
    Array.from({ length: areaWidth }, () => " "),
  );

  for (let col = 0; col < areaWidth; col++) {
    const d = densities[col]! / maxD;
    const extent = Math.max(0, Math.round(d * half));
    for (let r = 0; r < extent; r++) {
      const above = mid - r;
      const below = rowsPerCategory - 1 - mid + r;
      if (above >= 0) grid[above]![col] = pair.filled;
      if (below < rowsPerCategory) grid[below]![col] = pair.filled;
    }
  }

  return grid.map((row) => row.join(""));
}

/**
 * A one-sided density profile, rising from the baseline.
 *
 * The violin's shape without the mirror: a ridgeline stacks one profile per
 * series and lets them overlap, so each band is read against the row below it
 * rather than about its own centre.
 */
export function ridgeRows(
  series: Series,
  areaWidth: number,
  rowsPerSeries: number,
  caps: Caps,
): readonly string[] {
  const blank = (): readonly string[] =>
    Array.from({ length: Math.max(0, rowsPerSeries) }, () => " ".repeat(areaWidth));

  const finite = series.values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (finite.length === 0 || rowsPerSeries < 1 || areaWidth < 1) return blank(); // cells-ok — a sample count

  const sorted = [...finite].sort((a, b) => a - b);
  const lo = sorted[0]!;
  const hi = sorted[sorted.length - 1]!; // cells-ok — a sample count
  const pad = (hi - lo) * 0.1 || 1;

  const points: number[] = [];
  for (let i = 0; i < areaWidth; i += 1) {
    points.push(lo - pad + ((hi - lo + 2 * pad) * i) / Math.max(1, areaWidth - 1));
  }
  const densities = kde(finite, points);
  const maxD = Math.max(...densities);
  if (maxD <= 0) return blank();

  const pair = pairFor(caps);
  const grid: string[][] = Array.from({ length: rowsPerSeries }, () =>
    Array.from({ length: areaWidth }, () => " "),
  );

  for (let col = 0; col < areaWidth; col += 1) {
    const d = densities[col]! / maxD;
    const extent = Math.max(0, Math.round(d * rowsPerSeries));
    for (let r = 0; r < extent; r += 1) {
      grid[rowsPerSeries - 1 - r]![col] = pair.filled;
    }
  }

  return grid.map((row) => row.join(""));
}
