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
  const densities = kde(finite, points);
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
