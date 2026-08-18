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
 * One boxplot row: `├───[▬▬▬|▬▬▬]────┤  ▪`
 */
export function boxplotRow(
  q: QuartileSummary,
  min: number,
  max: number,
  width: number,
  caps: Caps,
): string {
  const ch = glyphCharsFor(caps);
  const w = Math.max(1, Math.floor(width));

  const xMin = scaleX(q.min, min, max, w);
  const xQ1 = scaleX(q.q1, min, max, w);
  const xMed = scaleX(q.median, min, max, w);
  const xQ3 = scaleX(q.q3, min, max, w);
  const xMax = scaleX(q.max, min, max, w);

  const row = new Array(w).fill(" ");

  row[xMin] = ch.whiskerLeft;
  for (let i = xMin + 1; i < xQ1; i++) row[i] = ch.whiskerH;
  row[xQ1] = ch.boxLeft;
  for (let i = xQ1 + 1; i < xQ3; i++) row[i] = ch.boxFill;
  row[xMed] = ch.median;
  row[xQ3] = ch.boxRight;
  for (let i = xQ3 + 1; i < xMax; i++) row[i] = ch.whiskerH;
  row[xMax] = ch.whiskerRight;

  for (const o of q.outliers ?? []) {
    const xO = scaleX(o, min, max, w);
    if (xO >= 0 && xO < w) row[xO] = ch.outlier;
  }

  return row.join("");
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
