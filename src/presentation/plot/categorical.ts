/**
 * Categorical bar forms — bar, histogram, lollipop, dotplot, and the
 * group-3 nested-bar forms (flame, icicle, funnel, gantt, waterfall,
 * streamgraph).
 *
 * All are horizontal bars with category labels in the gutter. The bar's
 * fill encoding reuses `pairFor` from `ramp.ts`.
 */
import type { Series } from "../../data/viewmodel/index.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";
import { pairFor } from "./ramp.js";
import { cells } from "../text.js";
import { glyphs } from "../blocks/glyphs.js";

type Caps = Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">;

/**
 * One horizontal bar of exactly `width` cells, with an optional value label.
 */
export function barRow(
  value: number | null,
  min: number,
  max: number,
  width: number,
  caps: Caps,
  showValue = true,
): string {
  const w = Math.max(1, Math.floor(width));
  const mark = pairFor(caps);
  if (value === null || !Number.isFinite(value)) return mark.absent.padEnd(w);

  const label = showValue ? ` ${String(Math.round(value * 10) / 10)}` : "";
  const labelCells = cells(label, caps.ambiguousWidth);
  const barWidth = Math.max(0, w - labelCells);

  const span = max - min;
  const t = span <= 0 ? 0 : (value - min) / span;
  const fill = Math.round(Math.min(1, Math.max(0, t)) * barWidth);

  const bar = mark.filled.repeat(fill) + mark.empty.repeat(barWidth - fill);
  return (bar + label).slice(0, w);
}

/**
 * A stacked bar: values concatenated end-to-end.
 */
export function stackedBarRow(
  series: readonly Series[],
  categoryIndex: number,
  totalMax: number,
  width: number,
  caps: Caps,
  normalised: boolean,
): string {
  const w = Math.max(1, Math.floor(width));
  const mark = pairFor(caps);
  let sum = 0;
  for (const s of series) sum += (s.values[categoryIndex] ?? 0);
  if (sum === 0) return mark.empty.repeat(w);

  const scale = normalised ? w / sum : (totalMax > 0 ? w / totalMax : 0);
  let used = 0;
  let result = "";
  for (const s of series) {
    const v = s.values[categoryIndex] ?? 0;
    const fill = Math.round(v * scale);
    const clamped = Math.min(fill, w - used);
    result += mark.filled.repeat(clamped);
    used += clamped;
  }
  result += mark.empty.repeat(Math.max(0, w - used));
  return result.slice(0, w);
}

/**
 * A lollipop: a line with an endpoint marker.
 */
export function lollipopRow(
  value: number | null,
  min: number,
  max: number,
  width: number,
  caps: Caps,
): string {
  const w = Math.max(1, Math.floor(width));
  if (value === null || !Number.isFinite(value)) return " ".repeat(w);

  const span = max - min;
  const t = span <= 0 ? 0.5 : (value - min) / span;
  const pos = Math.round(Math.min(1, Math.max(0, t)) * Math.max(0, w - 1));

  const g = glyphs(caps);
  const lineChar = g.horizontal;
  const dot = g.filled;

  const row = new Array(w).fill(" ");
  for (let i = 0; i <= pos; i++) row[i] = lineChar;
  row[pos] = dot;
  return row.join("");
}

/**
 * A dot plot: one mark per category on a shared axis.
 */
export function dotplotRow(
  value: number | null,
  min: number,
  max: number,
  width: number,
  caps: Caps,
): string {
  const w = Math.max(1, Math.floor(width));
  if (value === null || !Number.isFinite(value)) return " ".repeat(w);

  const span = max - min;
  const t = span <= 0 ? 0.5 : (value - min) / span;
  const pos = Math.round(Math.min(1, Math.max(0, t)) * Math.max(0, w - 1));

  const g = glyphs(caps);
  const row = new Array(w).fill(" ");
  row[pos] = g.filled;
  return row.join("");
}

/**
 * Histogram binning: Sturges, Freedman–Diaconis, Scott.
 */
export function binValues(
  values: readonly (number | null)[],
  method: "sturges" | "freedman-diaconis" | "scott" = "sturges",
  maxBins = 40,
): { labels: string[]; counts: number[] } {
  const finite = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (finite.length === 0) return { labels: [], counts: [] }; // cells-ok — a sample count

  const sorted = [...finite].sort((a, b) => a - b);
  const n = sorted.length; // cells-ok — a sample count
  const lo = sorted[0]!;
  const hi = sorted[n - 1]!;
  if (lo === hi) return { labels: [String(lo)], counts: [n] };

  let binCount: number;
  if (method === "freedman-diaconis") {
    const q1 = sorted[Math.floor(n * 0.25)]!;
    const q3 = sorted[Math.floor(n * 0.75)]!;
    const iqr = q3 - q1;
    const binWidth = iqr > 0 ? 2 * iqr * Math.pow(n, -1 / 3) : (hi - lo) / Math.ceil(Math.log2(n) + 1);
    binCount = Math.max(1, Math.min(maxBins, Math.ceil((hi - lo) / binWidth)));
  } else if (method === "scott") {
    const mean = finite.reduce((a, b) => a + b, 0) / n;
    const variance = finite.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    const sd = Math.sqrt(variance);
    const binWidth = sd > 0 ? 3.5 * sd * Math.pow(n, -1 / 3) : (hi - lo) / Math.ceil(Math.log2(n) + 1);
    binCount = Math.max(1, Math.min(maxBins, Math.ceil((hi - lo) / binWidth)));
  } else {
    binCount = Math.max(1, Math.min(maxBins, Math.ceil(Math.log2(n) + 1)));
  }

  const binWidth = (hi - lo) / binCount;
  const labels: string[] = [];
  const counts = new Array(binCount).fill(0) as number[];

  for (let i = 0; i < binCount; i++) {
    const edge = lo + i * binWidth;
    labels.push(String(Math.round(edge * 100) / 100));
  }

  for (const v of finite) {
    let bin = Math.floor((v - lo) / binWidth);
    if (bin >= binCount) bin = binCount - 1;
    if (bin >= 0 && bin < binCount) counts[bin] = (counts[bin] ?? 0) + 1;
  }

  return { labels, counts };
}

/**
 * Funnel: centred decreasing bars.
 */
export function funnelRow(
  value: number | null,
  max: number,
  width: number,
  caps: Caps,
): string {
  const w = Math.max(1, Math.floor(width));
  if (value === null || !Number.isFinite(value) || max <= 0) return " ".repeat(w);

  const mark = pairFor(caps);
  const barW = Math.max(1, Math.round((value / max) * w));
  const pad = Math.floor((w - barW) / 2);
  return " ".repeat(pad) + mark.filled.repeat(barW) + " ".repeat(Math.max(0, w - pad - barW));
}

/**
 * Gantt: bar with start offset.
 */
export function ganttRow(
  start: number,
  duration: number | null,
  min: number,
  max: number,
  width: number,
  caps: Caps,
): string {
  const w = Math.max(1, Math.floor(width));
  if (duration === null || !Number.isFinite(duration)) return " ".repeat(w);

  const mark = pairFor(caps);
  const span = max - min;
  if (span <= 0) return mark.filled.repeat(w);

  const xStart = Math.round(((start - min) / span) * (w - 1));
  const xEnd = Math.round(((start + duration - min) / span) * (w - 1));

  const row = new Array(w).fill(" ");
  for (let i = Math.max(0, xStart); i <= Math.min(w - 1, xEnd); i++) {
    row[i] = mark.filled;
  }
  return row.join("");
}

/**
 * Waterfall: bar with running baseline.
 */
export function waterfallRow(
  value: number | null,
  baseline: number,
  min: number,
  max: number,
  width: number,
  caps: Caps,
  isTotal: boolean,
): string {
  const w = Math.max(1, Math.floor(width));
  if (value === null || !Number.isFinite(value)) return " ".repeat(w);

  const mark = pairFor(caps);
  const span = max - min;
  if (span <= 0) return mark.filled.repeat(w);

  if (isTotal) {
    const x0 = Math.round(((0 - min) / span) * (w - 1));
    const x1 = Math.round(((value - min) / span) * (w - 1));
    const lo = Math.max(0, Math.min(x0, x1));
    const hi = Math.min(w - 1, Math.max(x0, x1));
    const row = new Array(w).fill(" ");
    for (let i = lo; i <= hi; i++) row[i] = mark.filled;
    return row.join("");
  }

  const xBase = Math.round(((baseline - min) / span) * (w - 1));
  const xEnd = Math.round(((baseline + value - min) / span) * (w - 1));
  const lo = Math.max(0, Math.min(xBase, xEnd));
  const hi = Math.min(w - 1, Math.max(xBase, xEnd));

  const row = new Array(w).fill(" ");
  for (let i = lo; i <= hi; i++) row[i] = mark.filled;
  return row.join("");
}
