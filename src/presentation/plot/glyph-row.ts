/**
 * Boxplot, forest and dumbbell — glyph-row forms.
 *
 * No raster. Each category gets one row of horizontal glyphs scaled to the
 * available width. The category label sits in the gutter; the glyphs fill the
 * plot area.
 */
import type { QuartileSummary } from "../../data/viewmodel/index.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";
import { glyphs } from "../blocks/glyphs.js";

type Caps = Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">;

interface GlyphChars {
  whiskerH: string;
  boxLeft: string;
  boxRight: string;
  boxFill: string;
  median: string;
  whiskerLeft: string;
  whiskerRight: string;
  outlier: string;
  filled: string;
  hollow: string;
  line: string;
}

function glyphCharsFor(caps: Caps): GlyphChars {
  const g = glyphs(caps);
  if (caps.unicode === "ascii") {
    return {
      whiskerH: "-", boxLeft: "[", boxRight: "]", boxFill: "=",
      median: "|", whiskerLeft: "|", whiskerRight: "|",
      outlier: "*", filled: g.filled, hollow: g.hollow, line: "-",
    };
  }
  return {
    whiskerH: g.horizontal, boxLeft: "[", boxRight: "]", boxFill: g.bar,
    median: g.vertical, whiskerLeft: g.teeLeft, whiskerRight: g.teeRight,
    outlier: g.dotted, filled: g.filled, hollow: g.hollow, line: g.horizontal,
  };
}

function scaleX(value: number, min: number, max: number, width: number): number {
  if (max === min) return Math.floor(width / 2);
  const t = (value - min) / (max - min);
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.round(clamped * Math.max(0, width - 1));
}


/**
 * One forest-plot row: centre mark with CI bounds.
 * `●────[▬▬▬|▬▬▬]────●`
 */
export function forestRow(
  q: QuartileSummary,
  min: number,
  max: number,
  width: number,
  caps: Caps,
): string {
  const ch = glyphCharsFor(caps);
  const w = Math.max(1, Math.floor(width));

  const row = new Array(w).fill(" ");

  const lower = q.lower ?? q.min;
  const upper = q.upper ?? q.max;
  const centre = q.centre ?? q.median;

  const xLower = scaleX(lower, min, max, w);
  const xUpper = scaleX(upper, min, max, w);
  const xCentre = scaleX(centre, min, max, w);

  for (let i = xLower; i <= xUpper; i++) row[i] = ch.line;
  row[xLower] = ch.filled;
  row[xUpper] = ch.filled;
  row[xCentre] = ch.filled;

  if (q.q1 !== undefined && q.q3 !== undefined) {
    const xQ1 = scaleX(q.q1, min, max, w);
    const xQ3 = scaleX(q.q3, min, max, w);
    row[xQ1] = ch.boxLeft;
    for (let i = xQ1 + 1; i < xQ3; i++) row[i] = ch.boxFill;
    row[xQ3] = ch.boxRight;
    row[scaleX(q.median, min, max, w)] = ch.median;
    row[xCentre] = ch.filled;
  }

  return row.join("");
}

/**
 * One dumbbell row: `●────────○`
 */
export function dumbbellRow(
  v1: number,
  v2: number,
  min: number,
  max: number,
  width: number,
  caps: Caps,
): string {
  const ch = glyphCharsFor(caps);
  const w = Math.max(1, Math.floor(width));

  const x1 = scaleX(v1, min, max, w);
  const x2 = scaleX(v2, min, max, w);

  const row = new Array(w).fill(" ");

  const lo = Math.min(x1, x2);
  const hi = Math.max(x1, x2);
  for (let i = lo; i <= hi; i++) row[i] = ch.line;
  row[x1] = ch.filled;
  row[x2] = ch.hollow;

  return row.join("");
}

/**
 * A box plot as three rows — the UnicodePlots / YouPlot figure.
 *
 * ```
 *        ┌────┬───────┐
 *   ╷────┤    │       ├──────╷
 *   ╵    └────┴───────┘      ╵
 * ```
 *
 * **One row per category could not show a centre and this is why.** The old
 * form drew `[▌▌▌│▌▌▌]` — a filled slab with the median as an interior bar —
 * so the box had no top or bottom edge to read a quartile against, and a mean
 * had nowhere to go that was not already occupied by the fill. The reference
 * spends three rows: the middle carries the whiskers and the spine, and the
 * outer two carry the box's edges. The box is an **outline**, so anything
 * drawn inside it is legible.
 *
 * The glyph table is indexed by row, which is what makes the three rows one
 * figure rather than three drawings that happen to line up.
 */
export function boxplotBand(
  q: QuartileSummary,
  min: number,
  max: number,
  width: number,
  rows: number,
  caps: Caps,
): readonly string[] {
  const w = Math.max(1, Math.floor(width));
  const n = Math.max(1, Math.floor(rows));

  // Row-indexed, exactly as the reference: index 0 is the box's top edge, 1 the
  // spine, 2 the bottom edge. ASCII collapses the corners it cannot spell.
  // **Named slots, never literals** (C09 I22, SS47). The table is row-indexed,
  // which is what makes three rows one figure rather than three drawings that
  // happen to line up; ASCII collapses the corners it cannot spell and the
  // figure still reads.
  const g = glyphs(caps);
  const T = {
    minCap: [g.stubDown, g.teeLeft, g.stubUp],
    whisker: [" ", g.horizontal, " "],
    boxL: [g.topLeft, g.teeRight, g.bottomLeft],
    boxEdge: [g.horizontal, " ", g.horizontal],
    median: [g.teeDown, g.vertical, g.teeUp],
    boxR: [g.topRight, g.teeLeft, g.bottomRight],
    maxCap: [g.stubDown, g.teeRight, g.stubUp],
    mean: g.diamond,
    outlier: g.dotted,
  };

  const at = (v: number): number => {
    const span = max - min;
    const t = span <= 0 ? 0 : (v - min) / span;
    return Math.max(0, Math.min(w - 1, Math.round(t * (w - 1))));
  };

  const xMin = at(q.min), xQ1 = at(q.q1), xMed = at(q.median);
  const xQ3 = at(q.q3), xMax = at(q.max);

  // **Compact is one row and it is the spine, not a different drawing.** A
  // single row taken from the same table keeps the median and the caps; taking
  // a separate renderer is how the two would drift.
  const wanted = n >= 3 ? [0, 1, 2] : n === 2 ? [0, 1] : [1]; // cells-ok — a row count
  const out: string[] = [];

  for (const r of wanted) {
    const row = new Array<string>(w).fill(" ");
    for (let i = xMin + 1; i < xQ1; i += 1) row[i] = T.whisker[r]!;
    for (let i = xQ3 + 1; i < xMax; i += 1) row[i] = T.whisker[r]!;
    for (let i = xQ1 + 1; i < xQ3; i += 1) row[i] = T.boxEdge[r]!;
    row[xMin] = T.minCap[r]!;
    row[xMax] = T.maxCap[r]!;
    row[xQ1] = T.boxL[r]!;
    row[xQ3] = T.boxR[r]!;
    row[xMed] = T.median[r]!;
    // The mean last and only on the spine — a second centre needs its own mark
    // (C04 I53), and drawn on an edge row it would read as a corner.
    if (q.mean !== undefined && Number.isFinite(q.mean) && r === 1) {
      const xm = at(q.mean);
      if (xm !== xMed) row[xm] = T.mean;
    }
    for (const o of q.outliers ?? []) {
      const xo = at(o);
      if (xo >= 0 && xo < w && r === 1) row[xo] = T.outlier;
    }
    out.push(row.join(""));
  }
  while (out.length < n) out.push(" ".repeat(w)); // cells-ok — a row count
  return out;
}
