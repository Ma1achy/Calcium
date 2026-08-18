/**
 * Pie and radar — circle forms using the braille dot grid.
 *
 * Braille's 2:4 dot ratio cancels the terminal cell's ~2:1 aspect ratio,
 * making circles appear round.
 */
import type { Segment, Series } from "../../data/viewmodel/index.js";
import { BRAILLE_DOTS, createGrid, setDot, foldBraille } from "./raster.js";
import { glyphForMask, strokePolyline } from "./linedraw.js";





/**
 * The circle's centre and radii, **in cells**, computed once.
 *
 * **One geometry, two vocabularies.** The outline was measured in cell space
 * and the fill in dot space, each with its own centre and its own radius, so
 * the boundary sat beside the interior rather than around it. A braille cell is
 * 2 dots wide and 4 tall, so the dot-space figures are this one scaled — never
 * derived a second time.
 *
 * The horizontal radius is twice the vertical because a terminal cell is about
 * twice as tall as it is wide, and a single radius therefore draws an ellipse
 * standing on end.
 */
type CircleGeometry = Readonly<{ cx: number; cy: number; rx: number; ry: number }>;

function geometryFor(w: number, h: number): CircleGeometry {
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const ry = Math.max(1, Math.min(Math.floor(cy), Math.floor(cx / 2)));
  return { cx, cy, rx: ry * 2, ry };
}

/** The same figure in the braille dot grid: 2 dots per cell across, 4 down. */
function inDots(g: CircleGeometry): CircleGeometry {
  return { cx: g.cx * 2 + 0.5, cy: g.cy * 4 + 1.5, rx: g.rx * 2, ry: g.ry * 4 };
}

/** Cell-space points tracing an ellipse, deduplicated. */
function ellipsePoints(g: CircleGeometry, steps: number): (readonly [number, number])[] {
  const pts: [number, number][] = [];
  let prev: [number, number] | null = null;
  for (let i = 0; i < steps; i += 1) {
    const a = (2 * Math.PI * i) / steps;
    const px = Math.round(g.cx + g.rx * Math.cos(a));
    const py = Math.round(g.cy + g.ry * Math.sin(a));
    if (prev === null || px !== prev[0] || py !== prev[1]) {
      pts.push([px, py]);
      prev = [px, py];
    }
  }
  return pts;
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
  const w = Math.max(0, Math.floor(areaWidth));
  const h = Math.max(0, Math.floor(areaRows));
  const blank = (): PieLayer => ({
    glyphRows: foldBraille(createGrid(Math.max(1, w) * dots.x, Math.max(1, h) * dots.y)),
    segmentIndex: 0,
  });
  if (w === 0 || h === 0) return [blank()];

  const g = geometryFor(w, h);
  const gd = inDots(g);
  if (gd.rx < 2) return [blank()];

  const total = segments.reduce((a, sg) => a + Math.max(0, sg.value), 0);
  if (total <= 0) return [blank()];

  const minFrac = minSegmentFraction(gd.rx);
  const visible: { label: string; fraction: number; originalIndex: number }[] = [];
  let otherFrac = 0;

  for (let i = 0; i < segments.length; i += 1) { // cells-ok — a segment count
    const sg = segments[i]!;
    const frac = sg.value / total;
    if (frac < minFrac) { otherFrac += frac; }
    else { visible.push({ label: sg.label, fraction: frac, originalIndex: i }); }
  }
  if (otherFrac > 0) visible.push({ label: "other", fraction: otherFrac, originalIndex: segments.length }); // cells-ok — a segment count

  const layers: PieLayer[] = [];
  // **The fill only.** The boundary used to be drawn into the same braille grid
  // as the fill, in the same colour, so a segment's arc and its interior were
  // one mark and the joins between segments read as noise. The outline is a
  // separate layer in the cell grid now — `circleOutline`, on this geometry.
  let angle = -Math.PI / 2;
  for (const seg of visible) {
    const grid = createGrid(w * dots.x, h * dots.y);
    const endAngle = angle + seg.fraction * 2 * Math.PI;
    fillArc(grid, gd, angle, endAngle);
    layers.push({ glyphRows: foldBraille(grid), segmentIndex: seg.originalIndex });
    angle = endAngle;
  }
  return layers;
}

/**
 * The circle's boundary as box-drawing glyphs, in **cell** coordinates.
 *
 * Independent of the fill, and that is the point: a crisp outline with a
 * braille interior is the best either vocabulary can do, and neither can do it
 * alone. Returns rows of `areaWidth` cells with blanks where the circle does
 * not pass.
 */
export function circleOutline(
  areaWidth: number,
  areaRows: number,
  corners: "rounded" | "sharp",
): readonly string[] {
  const w = Math.max(0, Math.floor(areaWidth));
  const h = Math.max(0, Math.floor(areaRows));
  if (w === 0 || h === 0) return Array.from({ length: h }, () => "");

  const mask: number[][] = Array.from({ length: h }, () => Array.from({ length: w }, () => 0));
  const g = geometryFor(w, h);
  strokePolyline(mask, ellipsePoints(g, Math.max(24, g.rx * 4)), true);
  return mask.map((row) => row.map((m) => glyphForMask(m, corners)).join(""));
}

/**
 * A radar's spokes and one closed polygon per series, in **cell** coordinates.
 *
 * One grid per series so the caller can colour each independently — the radar
 * was a single monochrome braille grid, which is why every series in it read as
 * one shape.
 */
export function radarOutlines(
  series: readonly Series[],
  categories: readonly string[],
  areaWidth: number,
  areaRows: number,
  corners: "rounded" | "sharp",
): readonly (readonly string[])[] {
  const w = Math.max(0, Math.floor(areaWidth));
  const h = Math.max(0, Math.floor(areaRows));
  const n = categories.length; // cells-ok — a category count
  if (w === 0 || h === 0 || n === 0) return [];

  const g = geometryFor(w, h);
  const all = series.flatMap((ss) =>
    ss.values.filter((v): v is number => v !== null && Number.isFinite(v)),
  );
  const maxV = Math.max(...all, 1);
  const render = (mask: number[][]): readonly string[] =>
    mask.map((row) => row.map((m) => glyphForMask(m, corners)).join(""));

  return series.map((sr) => {
    const mask: number[][] = Array.from({ length: h }, () => Array.from({ length: w }, () => 0));
    const pts: (readonly [number, number])[] = [];
    for (let i = 0; i < n; i += 1) {
      const v = sr.values[i];
      const t = v !== null && v !== undefined && Number.isFinite(v) ? Math.max(0, v / maxV) : 0;
      const a = (2 * Math.PI * i) / n - Math.PI / 2;
      pts.push([
        Math.round(g.cx + g.rx * t * Math.cos(a)),
        Math.round(g.cy + g.ry * t * Math.sin(a)),
      ]);
    }
    strokePolyline(mask, pts, true);
    return render(mask);
  });
}

/**
 * The radar's frame — the outer ring and one spoke per category.
 *
 * Drawn under the series so a reader can see what a vertex is measured
 * against; without it a polygon is a shape with no scale behind it.
 */
export function radarFrame(
  categories: readonly string[],
  areaWidth: number,
  areaRows: number,
  corners: "rounded" | "sharp",
): readonly string[] {
  const w = Math.max(0, Math.floor(areaWidth));
  const h = Math.max(0, Math.floor(areaRows));
  const n = categories.length; // cells-ok — a category count
  if (w === 0 || h === 0 || n === 0) return Array.from({ length: h }, () => "");

  // **The ring, and deliberately not the spokes.** A spoke is a straight line
  // at an arbitrary angle, and an axis-aligned stroke draws it as a staircase;
  // five of them inside a seventeen-by-nine figure filled the interior with
  // steps and the polygons became unreadable. The ring is what a vertex is
  // measured against, and it costs one closed curve.
  const g = geometryFor(w, h);
  const mask: number[][] = Array.from({ length: h }, () => Array.from({ length: w }, () => 0));
  strokePolyline(mask, ellipsePoints(g, Math.max(24, g.rx * 4)), true);
  return mask.map((row) => row.map((m) => glyphForMask(m, corners)).join(""));
}

function fillArc(
  grid: ReturnType<typeof createGrid>,
  g: CircleGeometry,
  startAngle: number, endAngle: number,
): void {
  for (let dy = -g.ry; dy <= g.ry; dy += 1) {
    for (let dx = -g.rx; dx <= g.rx; dx += 1) {
      const nx = dx / g.rx;
      const ny = dy / g.ry;
      if (nx * nx + ny * ny > 1) continue;
      // The angle is taken on the *circularised* offsets, or an ellipse's
      // segments would not be the fractions they were cut as.
      let a = Math.atan2(ny, nx);
      let start = startAngle;
      let end = endAngle;
      while (a < start) a += 2 * Math.PI;
      while (end < start) end += 2 * Math.PI;
      if (a >= start && a <= end) setDot(grid, Math.round(g.cx + dx), Math.round(g.cy + dy));
    }
  }
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
