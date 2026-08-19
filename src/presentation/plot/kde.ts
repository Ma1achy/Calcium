/**
 * KDE forms — density, violin, ridgeline.
 *
 * Gaussian kernel density estimation, then three folds over the curve.
 */
import type { QuartileSummary, Series } from "../../data/viewmodel/index.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";
import { curveRows } from "./curve.js";
import { pairFor } from "./ramp.js";
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
export function violinColumn(
  series: Series,
  colWidth: number,
  rows: number,
  caps: Caps,
  quartiles?: QuartileSummary,
  corners: "rounded" | "sharp" = "rounded",
  adjust?: number,
): readonly string[] {
  const w = Math.max(1, Math.floor(colWidth));
  const n = Math.max(1, Math.floor(rows));
  const blank = (): readonly string[] => Array.from({ length: n }, () => " ".repeat(w));

  const finite = series.values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (finite.length === 0) return blank(); // cells-ok — a sample count

  const sorted = [...finite].sort((a, b) => a - b);
  const lo = sorted[0]!;
  const hi = sorted[sorted.length - 1]!; // cells-ok — a sample count
  const pad = (hi - lo) * 0.1 || 1;
  // Sampled up the rows: row 0 is the top, so the highest value is sampled first.
  const points: number[] = [];
  for (let r = 0; r < n; r += 1) {
    points.push(hi + pad - ((hi - lo + 2 * pad) * r) / Math.max(1, n - 1));
  }
  const densities = kde(finite, points, scaledBandwidth(finite, adjust));
  const maxD = Math.max(...densities);
  if (maxD <= 0) return blank();

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
  for (let r = 0; r < n; r += 1) {
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
): readonly string[] {
  const w = Math.max(1, Math.floor(areaWidth));
  const n = Math.max(1, Math.floor(rowsPerCategory));
  const blank = (): readonly string[] =>
    Array.from({ length: n }, () => " ".repeat(w));

  const finite = series.values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (finite.length === 0) return blank(); // cells-ok — a sample count

  const sorted = [...finite].sort((a, b) => a - b);
  const lo = sorted[0]!;
  const hi = sorted[sorted.length - 1]!; // cells-ok — a sample count
  const pad = (hi - lo) * 0.1 || 1;
  const points: number[] = [];
  for (let i = 0; i < w; i += 1) {
    points.push(lo - pad + ((hi - lo + 2 * pad) * i) / Math.max(1, w - 1));
  }
  const densities = kde(finite, points, scaledBandwidth(finite, adjust));
  const maxD = Math.max(...densities);
  if (maxD <= 0) return blank();

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
  for (let x = 0; x < w; x += 1) {
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
    if (quartiles.mean !== undefined && Number.isFinite(quartiles.mean)) {
      const xm = at(quartiles.mean);
      if (xm !== at(quartiles.median)) put(xm, gl.diamond);
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
): { readonly rows: readonly string[]; readonly baselines: readonly number[] } {
  const w = Math.max(1, Math.floor(areaWidth));
  const h = Math.max(1, Math.floor(areaRows));
  const n = seriesList.length; // cells-ok — a series count
  const blank = Array.from({ length: h }, () => " ".repeat(w));
  if (n === 0) return { rows: blank, baselines: [] }; // cells-ok — a series count

  // Baselines from the bottom up, evenly spaced. The last one sits on the floor
  // so the front curve has the whole area beneath it.
  const step = n === 1 ? 0 : (h - 1) / n; // cells-ok — a row count
  const baseline = (i: number): number => Math.round(h - 1 - i * step); // cells-ok — a row index
  const curveRowsFor = Math.max(1, Math.round(step * OVERLAP)); // cells-ok — a row count

  const gl = glyphs(caps);
  const grid: string[][] = Array.from({ length: h }, () => new Array<string>(w).fill(" "));

  // **One x-axis for every curve, which is the comparison the form makes.**
  // Sampled over its own range each distribution fills the width and the *shift*
  // between them — the thing a ridgeline is read for — disappears entirely: three
  // distributions centred at 2, 4 and 9 would draw as three identical humps.
  const all = seriesList.flatMap((sr) =>
    sr.values.filter((v): v is number => v !== null && Number.isFinite(v)));
  if (all.length === 0) return { rows: blank, baselines: [] }; // cells-ok — a sample count
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
  if (maxD <= 0) return { rows: blank, baselines: [] };

  // Back to front: the highest baseline is the furthest away.
  for (let i = n - 1; i >= 0; i -= 1) { // cells-ok — a series index
    const densities = perSeries[i]!;
    if (densities.length === 0) continue; // cells-ok — a sample count

    const base = baseline(i);
    // **The near curve clears what is behind it before drawing.** Occlusion
    // needs the cells *under* the outline blanked as well as the outline drawn —
    // otherwise a far curve shows through a near one's body and the two read as
    // crossing rather than as one in front.
    for (let x = 0; x < w; x += 1) {
      const top = base - Math.round((densities[x]! / maxD) * curveRowsFor); // cells-ok — a row index
      for (let r = Math.max(0, top); r <= base && r < h; r += 1) grid[r]![x] = " "; // cells-ok — a row index
    }
    for (let x = 0; x < w; x += 1) {
      const top = Math.max(0, base - Math.round((densities[x]! / maxD) * curveRowsFor)); // cells-ok — a row index
      if (top <= base && base < h) grid[top]![x] = gl.horizontal; // cells-ok — a row index
    }
  }
  return { rows: grid.map((r) => r.join("")), baselines: Array.from({ length: n }, (_, i) => baseline(i)) };
}

// **`ridgeRows` is gone, and its epitaph is the finding.** It drew one series
// into a band of its own — a stack of small area charts — and the ridgeline arm
// called it once per band through `bandedForm`. That arrangement removes the one
// thing the form is for: curves rising into the band above, read against their
// neighbours. `ridgelineArea` composes the whole area instead, because overlap
// cannot be expressed one band at a time.

