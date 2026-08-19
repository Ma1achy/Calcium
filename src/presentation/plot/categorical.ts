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
import { extentFor, extentRun, ladderFor, pairFor } from "./ramp.js";
import { markOf } from "./marks.js";
import { formatReadout } from "./axes.js";
import type { Plot } from "../../data/viewmodel/index.js";
import { cells } from "../text.js";
import { glyphs } from "../blocks/glyphs.js";

type Caps = Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">;
/** Choosing a mark needs the depth as well as the alphabet — see `markOf`. */
type MarkCaps = Caps & Pick<TerminalCapabilities, "colourDepth">;

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
  /**
   * The cells to keep for the number, for **every** row of this chart.
   *
   * **Taken per row it inverts** (C12 I20, §3b). At `max: 100` in 40 cells, 99
   * drew 37 and 100 drew 36 — a larger value, a shorter bar — because `100` is
   * a column wider than `99` and each run was scaled against what its own label
   * left. Every count in both rows was right.
   *
   * Absent, the row falls back to its own label's width, which is what a lone
   * `barRow` outside a chart can know.
   */
  allowance?: number,
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
  const own = cells(label, caps.ambiguousWidth);
  const labelCells = showValue ? Math.max(own, allowance ?? own) : 0; // cells-ok — a label width
  const barWidth = Math.max(0, w - labelCells);

  const span = max - min;
  const t = span <= 0 ? 0 : (value - min) / span;
  const run = extentRun(t, barWidth, ext);
  const pad = " ".repeat(Math.max(0, barWidth - cells(run, caps.ambiguousWidth)));
  // Right-aligned in the allowance, so the numbers line up under each other and
  // every run starts and ends on the same scale.
  const gap = " ".repeat(Math.max(0, labelCells - own)); // cells-ok — a label width
  return (run + pad + gap + label).slice(0, w);
}

/**
 * One **column** of a vertical bar chart, top row first.
 *
 * The horizontal bar's transpose, and the vocabulary transposes with it (C12 I30):
 * `barRow` fills from the left with `extentFor`'s left-eighths, this fills from
 * the bottom with the **height** ladder's lower-eighths. They look
 * interchangeable and encode different axes, which is the mismatch `ramp.ts` was
 * written about.
 *
 * **`ladderFor("height", caps)` rather than `RAMP_UNICODE`.** A renderer names
 * the axis it draws and never a vocabulary (C12 I21, SS51), and this is the one
 * place in the component where the two ramps are a step apart in meaning and
 * identical to the eye.
 *
 * Returns exactly `rows` strings of exactly `width` cells each.
 */
export function barColumn(
  value: number | null,
  min: number,
  max: number,
  width: number,
  rows: number,
  caps: Caps,
  showValue = false,
  format?: Plot["yFormat"],
): readonly string[] {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(rows));
  const blank = " ".repeat(w);
  if (value === null || !Number.isFinite(value)) return Array.from({ length: h }, () => blank);

  const span = max - min;
  const t = span <= 0 ? (value > min ? 1 : 0) : (value - min) / span;
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;

  const ladder = ladderFor("height", caps);
  const steps = ladder.steps;
  const top = steps[steps.length - 1] ?? "#"; // cells-ok — a ladder length
  // Height in eighths of a cell, then split into whole cells and a remainder.
  const eighths = Math.round(clamped * h * (steps.length)); // cells-ok — a ladder length
  const whole = Math.floor(eighths / steps.length); // cells-ok — a ladder length
  const part = eighths % steps.length; // cells-ok — a ladder length

  const out: string[] = [];
  for (let r = 0; r < h; r += 1) {
    const fromBottom = h - 1 - r; // cells-ok — a row index
    if (fromBottom < whole) out.push(top.repeat(w));
    else if (fromBottom === whole && part > 0) out.push((steps[part - 1] ?? top).repeat(w)); // cells-ok — a ladder index
    else out.push(blank);
  }
  if (!showValue) return out;

  // **The number above the run, and dropped rather than shrunk** (C12 I20,
  // §3b). The horizontal arm takes the label out of the row's width because
  // there the run *is* the axis; here the column is read against the value
  // scale in the gutter, so a bar shortened to fit its number would draw a
  // value its own axis contradicts.
  const text = formatReadout(value, format);
  const wide = cells(text, caps.ambiguousWidth); // cells-ok — a label width
  // Wider than its column would truncate — a different number — or spill into
  // the neighbouring band and label the wrong bar.
  if (wide > w) return out; // cells-ok — a label width
  // The topmost inked row, or the baseline where nothing is inked: a bar of no
  // height has its top where the ink would have started.
  const inked = part > 0 ? whole + 1 : whole; // cells-ok — a row count
  const at = h - 1 - inked; // cells-ok — a row index
  if (at < 0) return out; // cells-ok — a row index
  const left = Math.floor((w - wide) / 2); // cells-ok — a column position
  out[at] = " ".repeat(left) + text + " ".repeat(w - left - wide);
  return out;
}

/**
 * A row whose cells belong to different series — the text, and which series
 * holds each cell (`-1` where none does).
 *
 * A single string cannot be coloured per segment, and a stack is segments by
 * definition. The caller spans it.
 */
export type BandRow = Readonly<{ text: string; owners: readonly number[] }>;

/**
 * A stacked bar: values concatenated end-to-end.
 *
 * **Each layer takes its own colour, and the mark is the fallback.** The whole
 * row used to carry one `ColourRef` keyed on the *category*, so a four-quarter
 * stack of two series drew four colours naming the quarters and none naming
 * `direct` or `referral` — the legend beside it answered a question the bars
 * did not ask. `owners` carries which series holds each cell so the caller can
 * span them.
 *
 * **And `markOf`, not `categoryMarks` directly**, which is a second defect in
 * the same three lines. Reading the ladder here gave every layer its own mark at
 * *every* colour depth, so a 24-bit stack was hatched — texture doing work tone
 * was already doing, which I29 calls a claim rather than a redundancy. `markOf`
 * is uniform above the colour floor and varies below it, and that rule belongs
 * in one place.
 */
export function stackedBarRow(
  series: readonly Series[],
  categoryIndex: number,
  totalMax: number,
  width: number,
  caps: MarkCaps,
  normalised: boolean,
): BandRow {
  const w = Math.max(1, Math.floor(width));
  const ext = extentFor(caps);
  let sum = 0;
  for (const s of series) sum += (s.values[categoryIndex] ?? 0);
  const empty = { text: " ".repeat(w), owners: new Array<number>(w).fill(-1) }; // cells-ok — a sentinel owner
  if (sum === 0) return empty;

  const scale = normalised ? w / sum : (totalMax > 0 ? w / totalMax : 0);
  let used = 0;
  let result = "";
  const owners: number[] = [];
  for (let i = 0; i < series.length; i += 1) { // cells-ok — a series count
    const v = series[i]?.values[categoryIndex] ?? 0;
    const fill = Math.round(v * scale);
    const clamped = Math.min(fill, w - used);
    result += (markOf(i, caps) || ext.solid).repeat(clamped);
    for (let c = 0; c < clamped; c += 1) owners.push(i); // cells-ok — a cell count
    used += clamped;
  }
  // Blank, not shaded — the remainder of a stacked bar is the part of the
  // total nothing accounts for, and shading it makes it look like a layer.
  result += " ".repeat(Math.max(0, w - used));
  for (let c = used; c < w; c += 1) owners.push(-1); // cells-ok — a sentinel owner
  return { text: result.slice(0, w), owners: owners.slice(0, w) };
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
): { labels: string[]; counts: number[]; edges: string[] } {
  const finite = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (finite.length === 0) return { labels: [], counts: [], edges: [] }; // cells-ok — a sample count

  const sorted = [...finite].sort((a, b) => a - b);
  const n = sorted.length; // cells-ok — a sample count
  const lo = sorted[0]!;
  const hi = sorted[n - 1]!;
  if (lo === hi) return { labels: [String(lo)], counts: [n], edges: [String(lo), String(lo)] };

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
  // **The edges are returned as well as consumed** (C12 I30). A vertical
  // histogram labels its bottom axis with the *boundary* rather than the
  // interval: `[18.3, 23.1)` needs twelve cells and a nine-cell column drops it,
  // so the axis came back empty. `18.3` under the column's left edge is what
  // matplotlib draws and what the width affords.
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

  return { labels, counts, edges };
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
