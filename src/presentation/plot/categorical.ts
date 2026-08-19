/**
 * Categorical bar forms — bar, histogram, lollipop, dotplot, and the
 * group-3 nested-bar forms (flame, icicle, funnel, gantt, waterfall,
 * streamgraph).
 *
 * All are horizontal bars with category labels in the gutter.
 *
 * **The bar encodes `extent`, not `fill`** (I21). It reused `pairFor` — the
 * gauge vocabulary — so every bar drew a solid run *and a shaded track out to
 * the full width*, which reads as a percent-complete meter. The shade carried
 * nothing: it was not modulated by any value. A comparison bar's only signal is
 * its length, so the remainder is blank and the tip carries the fraction.
 */
import type { Series } from "../../data/viewmodel/index.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";
import { extentFor, extentRun, pairFor } from "./ramp.js";
import { categoryMarks } from "./marks.js";
import { formatReadout } from "./axes.js";
import type { Plot } from "../../data/viewmodel/index.js";
import { cells } from "../text.js";
import { glyphs } from "../blocks/glyphs.js";

type Caps = Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">;

/**
 * Decimals for a bin edge — enough that two adjacent edges differ.
 *
 * The same argument as an axis step's precision (C12 I22): a label rounded past
 * the gap between it and its neighbour prints two identical bounds, and a bin
 * `[3, 3)` is a statement that no reading can satisfy.
 */
function binPlaces(binWidth: number): number {
  if (!Number.isFinite(binWidth) || binWidth <= 0) return 2;
  const magnitude = Math.floor(Math.log10(binWidth));
  return Math.max(0, Math.min(6, 1 - magnitude));
}

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
  format?: Plot["yFormat"],
): string {
  const w = Math.max(1, Math.floor(width));
  const ext = extentFor(caps);
  if (value === null || !Number.isFinite(value)) return ext.absent.padEnd(w);

  // **`formatReadout`, not a hand-rolled round.** The old line was
  // `String(Math.round(value * 10) / 10)` — it dropped trailing zeros, ignored
  // `yFormat` entirely, and rendered a percentage, a byte count and a duration
  // all as bare numbers. `axes.ts` records this exact class as having happened
  // three times before; this was the fourth, in the one place a reader reads
  // the number rather than the picture.
  const label = showValue ? ` ${formatReadout(value, format)}` : "";
  const labelCells = cells(label, caps.ambiguousWidth);
  const barWidth = Math.max(0, w - labelCells);

  const span = max - min;
  const t = span <= 0 ? 0 : (value - min) / span;
  const run = extentRun(t, barWidth, ext);
  const pad = " ".repeat(Math.max(0, barWidth - cells(run, caps.ambiguousWidth)));
  return (run + pad + label).slice(0, w);
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
  const ext = extentFor(caps);
  let sum = 0;
  for (const s of series) sum += (s.values[categoryIndex] ?? 0);
  if (sum === 0) return " ".repeat(w);

  // **Each layer takes its own mark, and colour is the second channel.** Every
  // segment drew `mark.filled` and the whole row carried one `ColourRef`, so a
  // stacked bar could not show where one series ended — not by glyph, and not by
  // tone either. At `colourDepth: 1` that is a solid run saying nothing, which
  // is C12 I25's subject: two things a reader must tell apart differ by mark,
  // never by colour alone.
  //
  // The ladder is the density one, taken from the top down, because a stack is
  // read as adjacent bands rather than as a scale — neighbouring layers want
  // maximum contrast, not adjacent steps.
  const marks = categoryMarks(caps);
  const scale = normalised ? w / sum : (totalMax > 0 ? w / totalMax : 0);
  let used = 0;
  let result = "";
  for (let i = 0; i < series.length; i += 1) { // cells-ok — a series count
    const v = series[i]?.values[categoryIndex] ?? 0;
    const fill = Math.round(v * scale);
    const clamped = Math.min(fill, w - used);
    result += (marks[i % marks.length] ?? ext.solid).repeat(clamped); // cells-ok — a ladder length
    used += clamped;
  }
  // Blank, not shaded — the remainder of a stacked bar is the part of the
  // total nothing accounts for, and shading it makes it look like a layer.
  result += " ".repeat(Math.max(0, w - used));
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

  // **A bin is an interval, and the label said it was a point.** The old line
  // pushed the rounded *left edge* alone — `0.03` — with no upper bound and no
  // notation saying it was a range at all, so a histogram's ordinate read as a
  // list of values rather than as bins. Half-open brackets, per YouPlot: every
  // bin takes `[lo, hi)` and the last takes `]`, because the last bin is where
  // the maximum lands and `floor((v - lo) / binWidth)` clamps it there.
  //
  // Decimal-aligned by padding the left number, so a column of intervals reads
  // down its own separator rather than ragged.
  const places = binPlaces(binWidth);
  const edges: string[] = [];
  for (let i = 0; i <= binCount; i++) edges.push((lo + i * binWidth).toFixed(places));
  const widest = edges.reduce((m, e) => Math.max(m, e.length), 0); // cells-ok — a digit count
  for (let i = 0; i < binCount; i++) {
    const a = (edges[i] ?? "").padStart(widest);
    const b = (edges[i + 1] ?? "").padStart(widest);
    labels.push(`[${a}, ${b}${i === binCount - 1 ? "]" : ")"}`);
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
