/**
 * KDE forms — density, violin, ridgeline.
 *
 * Gaussian kernel density estimation, then three folds over the curve.
 */
import type { QuartileSummary, Series } from "../../data/viewmodel/index.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";
import { curveRows } from "./curve.js";
import { extentFor, extentRun, ladderFor, pairFor } from "./ramp.js";
import { boxplotBand, boxplotColumn } from "./glyph-row.js";
import { cells } from "../text.js";
import { glyphForMask, strokePolyline } from "./linedraw.js";
import { glyphs } from "../blocks/glyphs.js";
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
  // **0.9, not 1.06 — the constant belongs to the estimator below it.**
  // Silverman gives `1.06 · σ̂ · n^(-1/5)` for the *standard-deviation* form and
  // `0.9 · min(σ̂, IQR/1.34) · n^(-1/5)` for the robust one. This used 1.06 with
  // the robust estimator, which is neither rule and oversmooths by 18%.
  //
  // Measured on `[1,1,1,1,2,3,5,5,5,5]` — the bimodal case a violin exists to
  // show — the old constant put the normalised density's floor at **0.72**, so
  // every column saturated and the traced outline came out a rectangle. The
  // corrected constant is a real fix and not a sufficient one: a ten-point
  // sample genuinely does not support strong bimodality at any rule-of-thumb
  // bandwidth, which is why `bandwidth` is a parameter rather than only a rule.
  const spread = Math.min(sd, iqr / 1.34);
  return spread > 0 ? 0.9 * spread * Math.pow(n, -0.2) : 1;
}

/**
 * The rule of thumb, scaled by the caller's `bandwidth` (C12 §3m).
 *
 * **A multiplier, which is seaborn's `bw_adjust` and for its reason**: a
 * bandwidth in the data's own units means nothing until you know the data, so an
 * absolute field would have every caller computing Silverman themselves in order
 * to scale it.
 *
 * `undefined` and `1` are the same answer, and both leave `kde` to its own
 * default — so the adjust costs nothing where nobody asks for it.
 */
export function scaledBandwidth(data: readonly number[], adjust?: number): number | undefined {
  if (adjust === undefined || !Number.isFinite(adjust) || adjust <= 0 || adjust === 1) return undefined;
  return silvermanBandwidth(data) * adjust;
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
export function densitySeries(
  series: Series,
  resolution = 100,
  adjust?: number,
): { series: Series; range: Range } {
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

  const densities = kde(finite, points, scaledBandwidth(finite, adjust));
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
 * The violin **stood up** — `violinRows` transposed (C12 I30).
 *
 * ```
 *      ╭──╮
 *     ╭╯  ╰╮
 *    ╭╯ ┌┐ ╰╮      the box, on the spine
 *    │  │◆│  │
 *    ╰╮ └┘ ╭╯
 *     ╰╮  ╭╯
 *      ╰──╯
 * ```
 *
 * **The conventional orientation, which is why it is here rather than owed.**
 * seaborn and matplotlib both draw a violin vertically by default; the
 * horizontal arm is the terminal's accommodation, not the chart's. The value
 * axis runs up the rows and the density spreads across the columns, which is the
 * same maths on the other axis and the same three traps:
 *
 * - **The offset is rounded once and applied both ways.** Rounding each edge
 *   independently is not symmetric — `Math.round` breaks ties toward +∞ — and a
 *   violin asymmetric by a cell is wrong in a way only a mirror assertion sees.
 * - **Both edges are stroked in the same direction.** `strokePolyline` steps one
 *   axis before the other, so a ring drawn forwards and back disagrees with
 *   itself wherever the density changes quickly, which is where a violin is
 *   interesting.
 * - **No end caps**, so the tails taper into the axis instead of being stopped
 *   by a wall.
 */
/**
 * **The columns a violin's outline actually covers**, which is not all of them.
 *
 * A kernel estimate is defined everywhere, so evaluated across a *shared* value
 * axis it returns a near-zero density far outside its own data — and a
 * near-zero density draws the two edges on the rows either side of the centre,
 * which is a pair of flat lines running to the frame's edge. Three violins then
 * look like three shapes with infinite tails.
 *
 * seaborn's answer is `cut`: extend the estimate that many bandwidths past the
 * extreme datapoints and stop. Two is its default and it is what this uses. The
 * spine still runs the full width — it is the axis, and the marks sit on it —
 * but the outline stops where the data stops having anything to say.
 */
const CUT = 2;

function supported(
  points: readonly number[],
  sorted: readonly number[],
  bandwidth: number,
): { first: number; last: number } {
  const lo = sorted[0]! - CUT * bandwidth;
  const hi = sorted[sorted.length - 1]! + CUT * bandwidth; // cells-ok — a sample count
  let first = -1; // cells-ok — a sentinel index
  let last = -1; // cells-ok — a sentinel index
  for (let i = 0; i < points.length; i += 1) { // cells-ok — a sample count
    if (points[i]! < lo || points[i]! > hi) continue;
    if (first < 0) first = i;
    last = i;
  }
  return first < 0 ? { first: 0, last: points.length - 1 } : { first, last }; // cells-ok — a sample count
}

/**
 * The raincloud — a one-sided cloud over the compact box (C12 §3i, I34).
 *
 * ```
 *    ▁▂▄▆███▆▄▂▁                 row 0   the density, growing away from the box
 *  ├──┤███│███├──┤  ▪ ▪          row 1   `boxplotBand` at one row, unchanged
 * ```
 *
 * **Two rows hold what five hold, and the mirror is what pays for it.** A
 * classic violin is symmetric about its spine, so the reflected half carries no
 * information — dropping it buys the summary row outright. Allen et al. (2019)
 * rather than an abbreviation invented here.
 *
 * **The cloud is sampled on the box's axis and this is the whole of the joint.**
 * `violinRows` pads its value axis by a tenth at each end so a tail has
 * somewhere to taper; `boxplotBand` puts `min` in column 0 and `max` in the last
 * with no pad. Each is right for the figure that owns it, and composing them
 * without deciding puts the cloud's mode a tenth of the width from the median it
 * sits above — in a frame where every value is in range and every count agrees.
 * The box wins, because the ladder's promise is that the same figure appears at
 * every rung and a box that shifts when a row is added above it is a different
 * box.
 *
 * What the pad bought is bought by the cut instead: the estimate still stops two
 * bandwidths past the data, by the mechanism already ruled for that.
 *
 * **Blank is outside the support; the ladder's first step is an estimate near
 * zero** (I16). One row, two meanings, and they must not collide — a ramp's
 * first step is ink precisely because a blank minimum reads as *nothing here*,
 * which is what a column beyond the cut has to say. Without the cut the row
 * draws `▁` from edge to edge: a flat line saying *this distribution is
 * everywhere*, which is the picture the violin's outline drew before `cut`
 * landed one rung up.
 */
export function rainRows(
  series: Series,
  quartiles: QuartileSummary | undefined,
  min: number,
  max: number,
  areaWidth: number,
  caps: Caps,
  adjust?: number,
): readonly string[] {
  const w = Math.max(1, Math.floor(areaWidth));
  const blank = " ".repeat(w);
  // The box is `boxplotBand`'s compact arm and not a second drawing of one —
  // the rung ladder is one figure gaining parts, not four figures.
  const box = quartiles === undefined ? blank : boxplotBand(quartiles, min, max, w, 1, caps)[0] ?? blank;

  const finite = series.values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (finite.length === 0) return [blank, box]; // cells-ok — a sample count

  const sorted = [...finite].sort((a, b) => a - b);
  // **`boxplotBand`'s own mapping, inverted.** Its `at(v)` is
  // `round((v − min) ÷ (max − min) × (w − 1))`, so column `i` is the value
  // below — and the two agreeing is the finding this function is written
  // around, not an incidental.
  const span = max - min;
  const points = Array.from({ length: w }, (_, i) => min + (span * i) / Math.max(1, w - 1));
  const bw = scaledBandwidth(finite, adjust);
  const densities = kde(finite, points, bw);
  const maxD = Math.max(...densities);
  if (maxD <= 0) return [blank, box];
  const support = supported(points, sorted, bw ?? silvermanBandwidth(finite));

  // **The axis, not a ramp** (I21). A cloud cell is a column of a vertical
  // axis — the band is thin in *height*, so the resolution is inside one cell
  // and a ladder is the only shape that fits.
  const ladder = [...ladderFor("height", caps).steps];
  const top = ladder.length - 1; // cells-ok — a ladder length
  const cloud = points.map((_p, i) => {
    if (i < support.first || i > support.last) return " ";
    return ladder[Math.round((densities[i]! / maxD) * top)] ?? " ";
  });
  return [cloud.join(""), box];
}

export function violinColumn(
  series: Series,
  colWidth: number,
  rows: number,
  caps: Caps,
  quartiles?: QuartileSummary,
  corners: "rounded" | "sharp" = "rounded",
  adjust?: number,
  shared?: { min: number; max: number },
): readonly string[] {
  const w = Math.max(1, Math.floor(colWidth));
  const n = Math.max(1, Math.floor(rows));
  const blank = (): readonly string[] => Array.from({ length: n }, () => " ".repeat(w));

  const finite = series.values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (finite.length === 0) return blank(); // cells-ok — a sample count

  const sorted = [...finite].sort((a, b) => a - b);
  // **The shared value axis, where the caller has one** (C12 §3q). Scaled to its
  // own extent each violin fills its band, so a tight distribution and a wide
  // one draw the *same* shape — and comparing the categories is the whole of
  // what the form is for. Third instance: `ridgelineArea` had it, and the two
  // arms had it separately.
  const lo = shared?.min ?? sorted[0]!;
  const hi = shared?.max ?? sorted[sorted.length - 1]!; // cells-ok — a sample count
  const pad = (hi - lo) * 0.1 || 1;
  // Sampled up the rows: row 0 is the top, so the highest value is sampled first.
  const points: number[] = [];
  for (let r = 0; r < n; r += 1) {
    points.push(hi + pad - ((hi - lo + 2 * pad) * r) / Math.max(1, n - 1));
  }
  const bw = scaledBandwidth(finite, adjust);
  const densities = kde(finite, points, bw);
  const maxD = Math.max(...densities);
  if (maxD <= 0) return blank();
  // `bw` is undefined unless the caller asked for an adjustment, in which case
  // `kde` computes Silverman's itself — so the cut has to ask for the same one.
  const support = supported(points, sorted, bw ?? silvermanBandwidth(finite));

  // Two columns is the floor for an outline: a left and a right edge sharing a
  // column are one line and say nothing about width.
  if (w < 2) { // cells-ok — a column count
    const pair = pairFor(caps);
    return densities.map((d) => (d / maxD > 0.05 ? pair.filled : " "));
  }

  const left0 = Math.floor((w - 1) / 2); // cells-ok — a column index
  const right0 = Math.ceil((w - 1) / 2); // cells-ok — a column index
  const half = Math.max(1, Math.floor(w / 2)); // cells-ok — a column count
  const midCol = (w - 1) / 2; // cells-ok — a column index
  const edge = (r: number, sign: number): number => {
    const off = Math.round((densities[r]! / maxD) * half);
    const c = sign < 0 ? left0 - off : right0 + off;
    return Math.max(0, Math.min(w - 1, c)); // cells-ok — a column index
  };

  const mask: number[][] = Array.from({ length: n }, () => new Array<number>(w).fill(0));
  const leftEdge: [number, number][] = [];
  const rightEdge: [number, number][] = [];
  for (let r = support.first; r <= support.last; r += 1) {
    leftEdge.push([edge(r, -1), r]);
    rightEdge.push([edge(r, 1), r]);
  }
  strokePolyline(mask, leftEdge, false);
  strokePolyline(mask, rightEdge, false);

  const spineCol = Math.round(midCol); // cells-ok — a column index
  const gl = glyphs(caps);

  // The spine is a full-height rule drawn under the outline, for the two reasons
  // its horizontal twin has: a summary mark in a tail would otherwise float on a
  // cell with nothing under it, and an outline cell carrying one edge bit
  // renders as a stub rather than joining its neighbour.
  const grid: string[][] = mask.map((row) =>
    row.map((m, x) => {
      const g = glyphForMask(m, corners, caps);
      return g === " " && x === spineCol ? gl.vertical : g;
    }),
  );

  if (quartiles !== undefined) {
    const span = hi - lo + 2 * pad;
    const at = (v: number): number =>
      Math.max(0, Math.min(n - 1, n - 1 - Math.round(((v - (lo - pad)) / (span || 1)) * (n - 1)))); // cells-ok — a row index
    const put = (r: number, ch: string): void => {
      if (r >= 0 && r < n) grid[r]![spineCol] = ch; // cells-ok — a row index
    };
    put(at(quartiles.q1), gl.horizontal);
    put(at(quartiles.q3), gl.horizontal);
    put(at(quartiles.median), gl.teeRight);
    if (quartiles.mean !== undefined && Number.isFinite(quartiles.mean)) {
      const rm = at(quartiles.mean);
      if (rm !== at(quartiles.median)) put(rm, gl.diamond);
    }
  }

  return grid.map((r) => r.join(""));
}

/**
 * The raincloud **stood up** — `rainRows` transposed (C12 §3i, I30, I34).
 *
 * ```
 *   ⣿⣿│      the cloud grows leftward, away from the box's column
 *  ⢸⣿⣿┴
 *   ⣿⣿█
 *   ⢸⣿─
 *    ⣿█
 *    ⢸┬
 *     │
 * ```
 *
 * **A run rather than a ladder, and that is I21's finding rather than an
 * implementation detail.** A ladder is per-cell and an extent is per-run, and
 * which shape a density needs is decided by the dimension its *band* is thin in
 * — not by the axis the values lie along. A horizontal band has one row, so all
 * the resolution is inside a cell and only a ladder fits. A vertical band has
 * two or three columns, so the resolution is the run's length and a ladder has
 * nothing to index. This was very nearly written as a third `Encoding` called
 * `column`; opening `ramp.ts` to build it showed `extentRun` at width 2 with one
 * partial already returning the five levels, reflected.
 *
 * **The box takes one column and the cloud takes the rest**, which is where the
 * three-column budget comes from: two columns of cloud is four dot-columns and
 * five levels, and the box needs the third. Two columns for both is four
 * dot-columns split between them, too coarse to carry a shape.
 */
const CLOUD_CELLS = 4;

export function rainColumns(
  series: Series,
  quartiles: QuartileSummary | undefined,
  min: number,
  max: number,
  colWidth: number,
  rows: number,
  caps: Caps,
  adjust?: number,
): readonly string[] {
  const slot = Math.max(1, Math.floor(colWidth));
  const n = Math.max(1, Math.floor(rows));
  // **`boxplotColumn`'s own narrowing, and the frame is what asked for it.**
  // Drawn to the full slot at eleven cells a band, one band's cloud ran into the
  // next band's box: `⣿⣿─⣿⣿─` reads as a single six-cell run, and the three
  // distributions read as one field. The box rung already solves this — three
  // fifths of the slot, centred, which is matplotlib's `widths=0.6` — and the
  // two rungs of one ladder must separate their bands the same way or the
  // figure changes character when a row is added. At the three-column budget
  // there is nothing to spare and it takes the slot, exactly as the box does.
  //
  // **And capped, because a longer run is magnitude resolution and a density
  // has none to spend.** The two arms put the magnitude on different axes: a
  // ladder step is *inside* a cell, so a wider horizontal band buys more of the
  // value axis; a run is *across* cells, so a wider vertical band buys nothing
  // but a longer ruler for a number nobody reads off one. Drawn to three fifths
  // of a twenty-five-cell band the cloud was fourteen solid cells a row — a
  // filled bar chart with the shape legible only along its left edge.
  //
  // Four is derived rather than chosen: a leftward run of `n` cells with one
  // partial resolves `2n + 1` levels, and the height ladder resolves eight, so
  // four is where the vertical arm reads the same number of levels the
  // horizontal arm does.
  const w = Math.min(slot >= 5 ? Math.max(3, Math.round(slot * 0.6)) : slot, CLOUD_CELLS + 1); // cells-ok — a column width
  const padL = Math.floor((slot - w) / 2); // cells-ok — a column width
  const padR = slot - w - padL; // cells-ok — a column width
  // **The compact vertical box is one column wide**, which `boxplotColumn`
  // already draws — below five cells it takes its slot whole, and at one cell
  // its interior is inked because there are no sides to enclose it (I33).
  const box = quartiles === undefined
    ? Array.from({ length: n }, () => " ")
    : boxplotColumn(quartiles, min, max, 1, n, caps); // cells-ok — a column budget
  const cloudW = w - 1; // cells-ok — a column count
  const beside = (r: number, run: string): string =>
    " ".repeat(padL) +
    " ".repeat(Math.max(0, cloudW - cells(run, caps.ambiguousWidth))) +
    run + (box[r] ?? " ") + " ".repeat(padR);
  const blank = (): readonly string[] => Array.from({ length: n }, (_v, r) => beside(r, ""));

  if (cloudW < 1) return boxplotColumn(quartiles ?? { min, q1: min, median: min, q3: min, max }, min, max, slot, n, caps); // cells-ok — a column count
  const finite = series.values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (finite.length === 0) return blank(); // cells-ok — a sample count

  const sorted = [...finite].sort((a, b) => a - b);
  // **`boxplotColumn`'s mapping, inverted** — its `at(v)` counts rows down from
  // the top, so row 0 is `max`. The cloud and the box read one axis; see
  // `rainRows` for why that is the joint rather than a convenience.
  const span = max - min;
  const points = Array.from(
    { length: n },
    (_v, r) => min + (span * (n - 1 - r)) / Math.max(1, n - 1),
  );
  const bw = scaledBandwidth(finite, adjust);
  const densities = kde(finite, points, bw);
  const maxD = Math.max(...densities);
  if (maxD <= 0) return blank();
  const support = supported(points, sorted, bw ?? silvermanBandwidth(finite));

  // **The direction is on the vocabulary and not on the call.** A leftward run
  // handed rightward glyphs draws its tip on the wrong end — a picture correct
  // in every count and reversed — so `extentFor` carries it and the pairing is
  // unspellable.
  const ext = extentFor(caps, "leftward");
  return points.map((_p, r) =>
    beside(r, r < support.first || r > support.last ? "" : extentRun(densities[r]! / maxD, cloudW, ext)),
  );
}

/**
 * A violin — the density's **outline**, mirrored about a centre line.
 *
 * ```
 *     ╭───╮
 *   ╭─╯   ╰─╮
 * ──┤ ├─┼─┤ ├──
 *   ╰─╮   ╭─╯
 *     ╰───╯
 * ```
 *
 * **Solid fill was the defect and an outline is the fix.** The old form painted
 * every cell from the centre out to the density-scaled edge, so a violin was a
 * silhouette: a slab whose shape you could only read at its boundary, and which
 * left no interior to draw a box in. A violin *is* a box plot that also shows
 * the distribution, so the interior has to stay empty.
 *
 * **Nothing new is built to draw it.** `strokePolyline` already traces an
 * arbitrary closed path with two y-values per column, so the ring is the upper
 * edge left to right, then the mirrored lower edge right to left, and
 * `glyphForMask` turns the edge mask into `╭╮╰╯─│`.
 *
 * **The pie's rim and the radar's ring used to be cited here and are not any
 * more**, because they left this vocabulary: `strokePolyline` steps north,
 * south, east and west, which is a shallow slope's staircase in a line chart
 * and a blocky polygon in a circle. A violin's outline is two functions of `x`
 * with one y-value each, which is the case the cell grid does draw well —
 * `circle.ts`'s header carries the distinction.
 */
export function violinRows(
  series: Series,
  areaWidth: number,
  rowsPerCategory: number,
  caps: Caps,
  quartiles?: QuartileSummary,
  corners: "rounded" | "sharp" = "rounded",
  adjust?: number,
  shared?: { min: number; max: number },
): readonly string[] {
  const w = Math.max(1, Math.floor(areaWidth));
  const n = Math.max(1, Math.floor(rowsPerCategory));
  const blank = (): readonly string[] =>
    Array.from({ length: n }, () => " ".repeat(w));

  const finite = series.values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (finite.length === 0) return blank(); // cells-ok — a sample count

  const sorted = [...finite].sort((a, b) => a - b);
  // The shared value axis — see `violinColumn` above (C12 §3q).
  const lo = shared?.min ?? sorted[0]!;
  const hi = shared?.max ?? sorted[sorted.length - 1]!; // cells-ok — a sample count
  const pad = (hi - lo) * 0.1 || 1;
  const points: number[] = [];
  for (let i = 0; i < w; i += 1) {
    points.push(lo - pad + ((hi - lo + 2 * pad) * i) / Math.max(1, w - 1));
  }
  const bw = scaledBandwidth(finite, adjust);
  const densities = kde(finite, points, bw);
  const maxD = Math.max(...densities);
  if (maxD <= 0) return blank();
  // `bw` is undefined unless the caller asked for an adjustment, in which case
  // `kde` computes Silverman's itself — so the cut has to ask for the same one.
  const support = supported(points, sorted, bw ?? silvermanBandwidth(finite));

  // **Two rows is the floor for an outline**, because an upper and a lower edge
  // that share a row are one line and say nothing about width. Below that the
  // caller gets the fill, which at one row is honest about being a summary.
  if (n < 2) { // cells-ok — a row count
    const pair = pairFor(caps);
    const row = points.map((_p, i) => (densities[i]! / maxD > 0.05 ? pair.filled : " "));
    return [row.join("")];
  }

  // **The offset is rounded once and applied both ways.** Rounding each edge
  // independently — `round(mid - off)` and `round(mid + off)` — is not
  // symmetric, because `Math.round` breaks ties toward +∞: at an offset of 1.5
  // about a centre of 2.5 the edges land on rows 2 and 4, whose mirror is 3.
  // A violin that is asymmetric by a row is a violin that is wrong, and it is
  // invisible in anything but a mirror assertion.
  const upper0 = Math.floor((n - 1) / 2);
  const lower0 = Math.ceil((n - 1) / 2);
  const half = Math.max(1, Math.floor(n / 2));
  const mid = (n - 1) / 2;
  const edge = (i: number, sign: number): number => {
    const off = Math.round((densities[i]! / maxD) * half);
    const r = sign < 0 ? upper0 - off : lower0 + off;
    return Math.max(0, Math.min(n - 1, r));
  };

  // **Both edges left to right, and that is what makes the mirror exact.**
  // Stroking one ring — upper forwards, lower backwards — is the obvious shape
  // and it is not symmetric: `strokePolyline` steps vertically before it steps
  // horizontally, so a rise on the forward pass puts its vertical run one
  // column left of where the same rise puts it on the backward pass. The two
  // halves then disagree by a column wherever the density changes quickly,
  // which is exactly where a violin is interesting.
  //
  // Two open strokes in the same direction, plus the two end closures written
  // explicitly, is symmetric by construction rather than by argument.
  const mask: number[][] = Array.from({ length: n }, () => new Array<number>(w).fill(0));
  const upper: [number, number][] = [];
  const lower: [number, number][] = [];
  for (let x = support.first; x <= support.last; x += 1) {
    upper.push([x, edge(x, -1)]);
    lower.push([x, edge(x, 1)]);
  }
  // **No end caps.** Closing the ring drew a vertical wall at each extreme, so
  // the figure was a capped blob rather than a shape that tapers into the axis.
  // A violin's tails go to nothing and meet the centre line; they are not
  // stopped by a bar.
  strokePolyline(mask, upper, false);
  strokePolyline(mask, lower, false);

  const spineRow = Math.round(mid);
  const gl = glyphs(caps);

  // **The spine is a full-width rule, drawn before the outline.** Two defects
  // shared one cause: the summary marks sat on a row with nothing under them
  // wherever the body was narrow, so a median or a mean in a tail appeared to
  // float outside the shape. And an outline cell carrying a single edge bit
  // renders as a stub — `╴` — rather than joining its neighbour, so a fast
  // density change left visible gaps. A rule across the whole area gives every
  // mark something to sit on and closes the joins along the centre.
  const grid: string[][] = mask.map((r, y) =>
    r.map((m) => {
      const g = glyphForMask(m, corners, caps);
      return g === " " && y === spineRow ? gl.horizontal : g;
    }),
  );

  // The box, on the spine. A violin is a box plot that also shows the
  // distribution, so this is not decoration — it is the other half of the form.
  if (quartiles !== undefined) {
    const span = hi - lo + 2 * pad;
    const at = (v: number): number =>
      Math.max(0, Math.min(w - 1, Math.round(((v - (lo - pad)) / (span || 1)) * (w - 1))));
    const put = (x: number, ch: string): void => {
      if (x >= 0 && x < w) grid[spineRow]![x] = ch;
    };
    put(at(quartiles.q1), gl.vertical);
    put(at(quartiles.q3), gl.vertical);
    put(at(quartiles.median), gl.teeDown);
    // **When the mean lands on the median, say so.** Skipping the diamond
    // avoided hiding the median tee, which was right, and left a band with no
    // mean mark beside two bands that had one — so *they coincide* read as *it
    // is missing*, and a reader has no way to tell those apart. A cell holds one
    // glyph, so the glyph names both.
    if (quartiles.mean !== undefined && Number.isFinite(quartiles.mean)) {
      const xm = at(quartiles.mean);
      put(xm, xm === at(quartiles.median) ? gl.diamondTee : gl.diamond);
    }
  }

  return grid.map((r) => r.join(""));
}

/**
 * The joyplot: curves that rise **into** the band above (C12 §3l).
 *
 * ```
 *      ╭─╮
 *   ╭──╯ ╰──╮        each curve overlaps the one behind it
 *  ╭╯╭─╮    ╰╮
 * ─╯╭╯ ╰──╮ ╭╯
 *  ╭╯     ╰─╯
 * ─╯
 * ```
 *
 * **The overlap is the form.** Drawn into disjoint bands — one series per slot,
 * nothing crossing — a ridgeline is a stack of small area charts, and Joy
 * Division's cover is famous for the one thing that arrangement removes. The
 * point is that a tall distribution reaches past its own row and is read against
 * its neighbours; without it there is no reason to prefer this over facets.
 *
 * **Drawn back to front, so the nearer curve occludes.** A joyplot's depth cue is
 * occlusion and nothing else: the curves are the same colour and the same
 * thickness, and the only thing saying which is in front is that it interrupts
 * the other. Painting front-to-back would leave the far curves drawn over the
 * near ones and the stack would read inside out.
 *
 * The baselines are evenly spaced over the area and each curve is allowed
 * `OVERLAP` times that spacing — 2.2 is what `ggridges` defaults to and what
 * reads as a ridge rather than as a stack.
 */
const OVERLAP = 2.2;

export function ridgelineArea(
  seriesList: readonly Series[],
  areaWidth: number,
  areaRows: number,
  caps: Caps,
  adjust?: number,
  corners: "rounded" | "sharp" = "rounded",
): {
  readonly rows: readonly string[];
  readonly baselines: readonly number[];
  /**
   * **Which curve owns each cell**, or -1 where nothing does.
   *
   * The rows alone cannot be coloured: the curves overlap by construction, so
   * a row carries cells from two or three of them and there is no per-row
   * answer. The caller had been asking `baselines.indexOf(row)`, which is -1
   * on every row that is not a baseline — so every ridge drew in the fallback
   * colour and only the four baselines were tinted. Four coloured rules over a
   * monochrome tangle is what a ridgeline is not.
   */
  readonly owners: readonly (readonly number[])[];
} {
  const w = Math.max(1, Math.floor(areaWidth));
  const h = Math.max(1, Math.floor(areaRows));
  const n = seriesList.length; // cells-ok — a series count
  const blank = Array.from({ length: h }, () => " ".repeat(w));
  const nothing = { rows: blank, baselines: [], owners: blank.map(() => []) };
  if (n === 0) return nothing; // cells-ok — a series count

  // Baselines from the bottom up, evenly spaced. The last one sits on the floor
  // so the front curve has the whole area beneath it.
  const step = n === 1 ? 0 : (h - 1) / n; // cells-ok — a row count
  const baseline = (i: number): number => Math.round(h - 1 - i * step); // cells-ok — a row index
  const curveRowsFor = Math.max(1, Math.round(step * OVERLAP)); // cells-ok — a row count

  const grid: string[][] = Array.from({ length: h }, () => new Array<string>(w).fill(" "));
  const owners: number[][] = Array.from({ length: h }, () => new Array<number>(w).fill(-1)); // cells-ok — a sentinel owner

  // **One x-axis for every curve, which is the comparison the form makes.**
  // Sampled over its own range each distribution fills the width and the *shift*
  // between them — the thing a ridgeline is read for — disappears entirely: three
  // distributions centred at 2, 4 and 9 would draw as three identical humps.
  const all = seriesList.flatMap((sr) =>
    sr.values.filter((v): v is number => v !== null && Number.isFinite(v)));
  if (all.length === 0) return nothing; // cells-ok — a sample count
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = (hi - lo) * 0.1 || 1;
  const points = Array.from({ length: w }, (_, x) =>
    lo - pad + ((hi - lo + 2 * pad) * x) / Math.max(1, w - 1));

  // **And one density scale, for the same reason.** Normalised per curve, a
  // series of ten samples and one of a thousand draw the same height, so the
  // figure says the distributions are equally concentrated when they are not.
  const perSeries = seriesList.map((sr) => {
    const finite = sr.values.filter((v): v is number => v !== null && Number.isFinite(v));
    return finite.length === 0 ? [] : kde(finite, points, scaledBandwidth(finite, adjust)); // cells-ok — a sample count
  });
  const maxD = Math.max(0, ...perSeries.flat());
  if (maxD <= 0) return nothing;

  // Back to front: the highest baseline is the furthest away.
  for (let i = n - 1; i >= 0; i -= 1) { // cells-ok — a series index
    const densities = perSeries[i]!;
    if (densities.length === 0) continue; // cells-ok — a sample count

    const base = baseline(i);
    // **The near curve clears what is behind it before drawing.** Occlusion
    // needs the cells *under* the outline blanked as well as the outline drawn —
    // otherwise a far curve shows through a near one's body and the two read as
    // crossing rather than as one in front.
    // **The curve is stroked, not stippled.** Writing one `─` at each column's
    // top row leaves a rising curve as a row of disconnected dashes with no
    // vertical joins — the shape is in the data and not on the screen. The
    // violin arm has always gone through `strokePolyline` + `glyphForMask`;
    // this did not, and it is the same curve.
    const tops: [number, number][] = [];
    for (let x = 0; x < w; x += 1) {
      const top = Math.max(0, base - Math.round((densities[x]! / maxD) * curveRowsFor)); // cells-ok — a row index
      tops.push([x, top]);
      for (let r = top; r <= base && r < h; r += 1) { // cells-ok — a row index
        grid[r]![x] = " ";
        owners[r]![x] = -1; // cells-ok — a sentinel owner
      }
    }
    const mask: number[][] = Array.from({ length: h }, () => new Array<number>(w).fill(0));
    strokePolyline(mask, tops, false);
    for (let r = 0; r < h; r += 1) {
      for (let x = 0; x < w; x += 1) {
        if (mask[r]![x] === 0) continue;
        const g = glyphForMask(mask[r]![x]!, corners, caps);
        if (g === " ") continue;
        grid[r]![x] = g;
        owners[r]![x] = i; // cells-ok — a series index
      }
    }
  }
  return {
    rows: grid.map((r) => r.join("")),
    baselines: Array.from({ length: n }, (_, i) => baseline(i)),
    owners,
  };
}

// **`ridgeRows` is gone, and its epitaph is the finding.** It drew one series
// into a band of its own — a stack of small area charts — and the ridgeline arm
// called it once per band through `bandedForm`. That arrangement removes the one
// thing the form is for: curves rising into the band above, read against their
// neighbours. `ridgelineArea` composes the whole area instead, because overlap
// cannot be expressed one band at a time.

