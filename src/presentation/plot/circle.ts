/**
 * Pie and radar — circle forms using the braille dot grid.
 *
 * Braille's 2:4 dot ratio cancels the terminal cell's ~2:1 aspect ratio,
 * making circles appear round.
 */
import type { Segment, Series } from "../../data/viewmodel/index.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";
import { BRAILLE_DOTS, createGrid, setDot, foldBraille } from "./raster.js";

type Caps = Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">;

function drawCircle(grid: ReturnType<typeof createGrid>, cx: number, cy: number, r: number): void {
  const steps = Math.max(60, Math.floor(r * 4));
  for (let i = 0; i < steps; i++) {
    const angle = (2 * Math.PI * i) / steps;
    const x = Math.round(cx + r * Math.cos(angle));
    const y = Math.round(cy + r * Math.sin(angle));
    setDot(grid, x, y);
  }
}

function drawArc(
  grid: ReturnType<typeof createGrid>,
  cx: number, cy: number, r: number,
  startAngle: number, endAngle: number,
): void {
  const arcLen = endAngle - startAngle;
  const steps = Math.max(20, Math.floor(Math.abs(arcLen) * r));
  for (let i = 0; i <= steps; i++) {
    const angle = startAngle + (arcLen * i) / steps;
    const x = Math.round(cx + r * Math.cos(angle));
    const y = Math.round(cy + r * Math.sin(angle));
    setDot(grid, x, y);
  }
}

function drawRadialLine(
  grid: ReturnType<typeof createGrid>,
  cx: number, cy: number, r: number, angle: number,
): void {
  const steps = Math.max(10, Math.floor(r));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(cx + r * t * Math.cos(angle));
    const y = Math.round(cy + r * t * Math.sin(angle));
    setDot(grid, x, y);
  }
}

/**
 * Minimum-segment ruling: below some fraction a slice is less than a dot
 * wide, and drawing it is a lie. The threshold depends on the radius.
 */
function minSegmentFraction(radius: number): number {
  const circumference = 2 * Math.PI * radius;
  return circumference > 0 ? 1 / circumference : 1;
}

/**
 * Pie chart in braille. Segments below the minimum-segment threshold are
 * merged into "other".
 *
 * At ASCII, degrades to a textual fallback (the waffle handles that at the
 * FORM_ROWS level).
 */
export type PieLayer = Readonly<{ glyphRows: readonly string[]; segmentIndex: number }>;

/**
 * Per-segment braille layers for coloured rendering.
 *
 * Each segment gets its own grid with its arc fill + the shared outline.
 * The caller assigns colours per layer.
 */
export function pieLayers(
  segments: readonly Segment[],
  areaWidth: number,
  areaRows: number,
): readonly PieLayer[] {
  const dots = BRAILLE_DOTS;
  const emptyGrid = createGrid(areaWidth * dots.x, areaRows * dots.y);
  const cx = Math.floor(emptyGrid.dotWidth / 2);
  const cy = Math.floor(emptyGrid.dotHeight / 2);
  const r = Math.min(cx, cy) - 1;

  if (r < 2) return [{ glyphRows: foldBraille(emptyGrid), segmentIndex: 0 }];

  const total = segments.reduce((a, s) => a + Math.max(0, s.value), 0);
  if (total <= 0) return [{ glyphRows: foldBraille(emptyGrid), segmentIndex: 0 }];

  const minFrac = minSegmentFraction(r);
  const visible: { label: string; fraction: number; originalIndex: number }[] = [];
  let otherFrac = 0;

  for (let i = 0; i < segments.length; i++) { // cells-ok — a segment count
    const s = segments[i]!;
    const frac = s.value / total;
    if (frac < minFrac) { otherFrac += frac; }
    else { visible.push({ label: s.label, fraction: frac, originalIndex: i }); }
  }
  if (otherFrac > 0) visible.push({ label: "other", fraction: otherFrac, originalIndex: segments.length }); // cells-ok — a segment count

  const layers: PieLayer[] = [];

  let angle = -Math.PI / 2;
  for (const seg of visible) {
    const grid = createGrid(areaWidth * dots.x, areaRows * dots.y);
    const endAngle = angle + seg.fraction * 2 * Math.PI;

    drawArc(grid, cx, cy, r, angle, endAngle);
    drawRadialLine(grid, cx, cy, r, angle);
    fillArc(grid, cx, cy, r, angle, endAngle);

    layers.push({ glyphRows: foldBraille(grid), segmentIndex: seg.originalIndex });
    angle = endAngle;
  }

  return layers;
}

function fillArc(
  grid: ReturnType<typeof createGrid>,
  cx: number, cy: number, r: number,
  startAngle: number, endAngle: number,
): void {
  const rSq = r * r;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > rSq) continue;
      const a = Math.atan2(dy, dx);
      let normA = a;
      let normStart = startAngle;
      let normEnd = endAngle;
      while (normA < normStart) normA += 2 * Math.PI;
      while (normEnd < normStart) normEnd += 2 * Math.PI;
      if (normA >= normStart && normA <= normEnd) {
        setDot(grid, cx + dx, cy + dy);
      }
    }
  }
}

/**
 * Radar chart in braille. Spokes from centre, closed polygon per series.
 *
 * At ASCII, degrades to a labelled value table.
 */
export function radarRows(
  series: readonly Series[],
  categories: readonly string[],
  areaWidth: number,
  areaRows: number,
  _caps: Caps,
): readonly string[] {
  const dots = BRAILLE_DOTS;
  const grid = createGrid(areaWidth * dots.x, areaRows * dots.y);
  const cx = Math.floor(grid.dotWidth / 2);
  const cy = Math.floor(grid.dotHeight / 2);
  const r = Math.min(cx, cy) - 1;
  const n = categories.length; // cells-ok — a category count

  if (r < 2 || n === 0) return foldBraille(grid);

  drawCircle(grid, cx, cy, r);

  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    drawRadialLine(grid, cx, cy, r, angle);
  }

  for (const s of series) {
    let prevX = -1, prevY = -1;
    let firstX = -1, firstY = -1;
    for (let i = 0; i < n; i++) {
      const v = s.values[i] ?? 0;
      const allVals = series.flatMap((ss) => ss.values.filter((vv): vv is number => vv !== null && Number.isFinite(vv)));
      const maxV = Math.max(...allVals, 1);
      const t = Number.isFinite(v) && v !== null ? Math.max(0, (v as number) / maxV) : 0;
      const angle = (2 * Math.PI * i) / n - Math.PI / 2;
      const px = Math.round(cx + r * t * Math.cos(angle));
      const py = Math.round(cy + r * t * Math.sin(angle));
      setDot(grid, px, py);
      if (prevX >= 0) {
        const steps = Math.max(10, Math.floor(Math.sqrt((px - prevX) ** 2 + (py - prevY) ** 2)));
        for (let j = 0; j <= steps; j++) {
          setDot(grid, Math.round(prevX + (px - prevX) * j / steps), Math.round(prevY + (py - prevY) * j / steps));
        }
      } else {
        firstX = px;
        firstY = py;
      }
      prevX = px;
      prevY = py;
    }
    if (firstX >= 0 && prevX >= 0) {
      const steps = Math.max(10, Math.floor(Math.sqrt((firstX - prevX) ** 2 + (firstY - prevY) ** 2)));
      for (let j = 0; j <= steps; j++) {
        setDot(grid, Math.round(prevX + (firstX - prevX) * j / steps), Math.round(prevY + (firstY - prevY) * j / steps));
      }
    }
  }

  return foldBraille(grid);
}

/**
 * ASCII radar fallback: a labelled value table.
 */
export function radarAsciiRows(
  series: readonly Series[],
  categories: readonly string[],
  width: number,
): readonly string[] {
  const rows: string[] = [];
  for (let i = 0; i < categories.length; i++) { // cells-ok — a category count
    const label = categories[i] ?? "";
    const vals = series.map((s) => {
      const v = s.values[i];
      return v !== null && v !== undefined && Number.isFinite(v) ? String(Math.round(v * 10) / 10) : "-";
    }).join(" ");
    const row = `${label}: ${vals}`;
    rows.push(row.slice(0, width).padEnd(width));
  }
  return rows;
}
