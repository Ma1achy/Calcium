/**
 * The 3D scatter — two arms, and the terminal chooses (C12 I87, I88, I89, §3am).
 *
 * **This is the form step 3 ships**, and it is where 3D stops being
 * speculative: everything before it is a camera nothing looks through and a
 * projector nothing draws with.
 *
 * The pipeline is one pass over the cloud, twice: **project every sample to
 * find the depth range**, then **rasterise with the tier and the ramp both
 * keyed to it**. Two passes rather than one, because a tier is relative to the
 * cloud rather than to an absolute distance — a scatter of a hundred points a
 * metre apart and one of a hundred points a kilometre apart both want three
 * tiers, and an absolute bucket gives the second one tier and no depth at all.
 */
import type { Plot, Point3Series } from "../../data/viewmodel/index.js";
import type { RenderContext } from "../blocks/types.js";
import type { ColourValue } from "../theme/types.js";
import { HALF_BLOCK, HALF_BLOCK_LOWER, halfBlockEligible } from "../image/index.js";
import { paint, slot, type Span } from "../blocks/paint.js";
import { markers3 } from "../blocks/glyphs.js";
import { continuousColour } from "../theme/colormap.js";
import { colormapFor } from "./heatmap.js";
import { CELL_ASPECT } from "./aspect.js";
import { plotAreaRows } from "./height.js";
import { seriesRefOf } from "./marks.js";
import {
  basisOf,
  createDepth,
  extentOf,
  project,
  sampleGrid,
  unitOf,
  writeDepth,
  type Depth,
  type Vec3,
} from "./project3.js";

/** A sample that survived the cull, with everything the raster needs about it. */
type Drawn = Readonly<{
  x: number;
  y: number;
  depth: number;
  series: number;
  value: number | undefined;
}>;

/** The three tiers, near first, so an index into this is an index into a marker row. */
const TIERS = 3;

/**
 * Which tier a depth falls in — **near is 0** (C12 I88).
 *
 * A zero span puts everything in the middle tier, which is the same rule
 * `unitOf` takes for a zero extent one file over and the same one the value
 * ramp takes: a degenerate axis has no spread, so every sample sits in the
 * middle of it.
 */
function tierOf(depth: number, near: number, far: number): number {
  if (!(far > near)) return 1;
  const t = (depth - near) / (far - near);
  return Math.min(TIERS - 1, Math.max(0, Math.floor(t * TIERS))); // cells-ok — a tier index
}

/**
 * A reading into `[0, 1]`, **mid-ramp at a zero span** (C04 I74, C12 I89).
 *
 * The field family's rule, read rather than re-derived. It is *not* I86's
 * centre rule, which is about the position extent — both are called a zero
 * extent and only one of them is about geometry.
 */
function ramped(v: number, lo: number, hi: number): number {
  return hi > lo ? (v - lo) / (hi - lo) : 0.5;
}

/** The samples the tier and the ramp are both keyed to, projected once. */
function drawnOf(block: Plot, ctx: RenderContext, aspect: number): readonly Drawn[] {
  const clouds = block.points3 ?? [];
  const all: Vec3[] = [];
  for (const c of clouds) for (const p of c.points) all.push(p);
  const extent = extentOf(all);
  // **The live camera wins and the block's is the fallback** (C04 I75, C12 I83).
  // `RenderContext` carries the one an orbit moves; the member says where the
  // view starts.
  const basis = basisOf(ctx.cameras?.[block.id] ?? block.camera, aspect);
  const out: Drawn[] = [];
  let si = 0;
  for (const c of clouds) {
    for (const p of c.points) {
      const pr = project(basis, unitOf(p, extent));
      // **`null` is the cull, and it happened before the divide** (C12 I86).
      // Nothing downstream can tell a culled sample from a kept one, which is
      // exactly why the refusal is upstream of here.
      if (pr === null) continue;
      out.push({ x: pr.x, y: pr.y, depth: pr.depth, series: si, value: p.value });
    }
    si += 1; // cells-ok — a cloud index
  }
  return out;
}

/** The colour one sample is drawn in, on whichever channel `colourBy` names. */
function colourOf(
  block: Plot,
  ctx: RenderContext,
  d: Drawn,
  clouds: readonly Point3Series[],
  span: Readonly<{ nearD: number; farD: number; loV: number; hiV: number }>,
): ColourValue | undefined {
  const by = block.colourBy ?? "depth";
  if (by === "series") {
    return slot(seriesRefOf(clouds[d.series], d.series), ctx.theme, ctx.capabilities).colour;
  }
  const map = colormapFor(block);
  if (map === undefined) return undefined;
  // **Near is the top of the ramp**, because a perceptual map runs dark to
  // bright and recession reads as falling away rather than as coming forward.
  const t =
    by === "value"
      ? ramped(d.value ?? span.loV, span.loV, span.hiV)
      : 1 - ramped(d.depth, span.nearD, span.farD);
  return continuousColour(map, t, ctx.capabilities);
}

/** The block a tier paints on the colour raster: samples across, samples down. */
const RASTER_TIER: readonly (readonly [number, number])[] = Object.freeze([
  [2, 2], // near
  [1, 2], // mid
  [1, 1], // far
]);

/**
 * The two arms, and everything above this line is shared between them.
 *
 * `reserved` is what the legend has already taken, so the raster is laid out at
 * the width that is left — `axed`'s rule, which this form reaches by composing
 * its own rows rather than by calling it.
 */
export function scatter3dArea(
  block: Plot,
  areaWidth: number,
  ctx: RenderContext,
): readonly (readonly Span[])[] {
  const rows = plotAreaRows(block);
  const w = Math.max(1, Math.floor(areaWidth)); // cells-ok — a cell width
  // **The aspect is the cell's, not the block's.** A terminal cell is about
  // twice as tall as it is wide (`CELL_ASPECT`), so a projection that ignored
  // it would draw a sphere as an ellipse — the one distortion a reader reads as
  // data.
  const half = halfBlockEligible(ctx.capabilities, false);
  const grid = half ? sampleGrid(w, rows, "half") : { width: w, height: rows };
  // **The aspect is the sample's, and the two arms disagree about it.** A
  // terminal cell is `CELL_ASPECT` times taller than it is wide; a half-block
  // sample is half a cell tall, so it is square and the aspect is the plain
  // grid ratio. A glyph-arm sample is a whole cell, so the ratio is divided by
  // the cell's own. Getting this wrong draws a sphere as an ellipse, which is
  // the one distortion a reader reads as data.
  const aspect = grid.width / (grid.height * (half ? 1 : CELL_ASPECT));
  const drawn = drawnOf(block, ctx, aspect);
  const clouds = block.points3 ?? [];

  let nearD = Infinity;
  let farD = -Infinity;
  let loV = Infinity;
  let hiV = -Infinity;
  for (const d of drawn) {
    nearD = Math.min(nearD, d.depth);
    farD = Math.max(farD, d.depth);
    if (d.value !== undefined) {
      loV = Math.min(loV, d.value);
      hiV = Math.max(hiV, d.value);
    }
  }
  const span = { nearD, farD, loV, hiV };

  const depth = createDepth(grid.width, grid.height);
  // **One colour per sample, and `null` is *not drawn*.** A sparse raster has
  // to tell an empty sample from a black one, which a colour cannot do.
  const ink: (ColourValue | undefined)[] = new Array<ColourValue | undefined>(
    grid.width * grid.height, // cells-ok — a sample count
  ).fill(undefined);
  const glyph: number[] = new Array<number>(grid.width * grid.height).fill(-1); // cells-ok — a sample count

  for (const d of drawn) {
    const tier = tierOf(d.depth, nearD, farD);
    const colour = colourOf(block, ctx, d, clouds, span);
    // **The exact position, not the floored one, and the block is centred on
    // it.** The first draft placed a `bw x bh` block at `floor(x) - (bw >> 1)`,
    // which for an even block is half a sample to the **left and up** at every
    // near point — a systematic bias, invisible to arithmetic and to a stripped
    // frame, and about two columns of drift in the refdiff pane against
    // matplotlib's `scatter3D`. Rounding the block's *origin* off the exact
    // coordinate centres it at both parities.
    const fx = d.x * grid.width; // cells-ok — a sample coordinate
    const fy = d.y * grid.height; // cells-ok — a sample coordinate
    const sx = Math.floor(fx); // cells-ok — a sample coordinate
    const sy = Math.floor(fy); // cells-ok — a sample coordinate
    if (half) {
      const [bw, bh] = RASTER_TIER[tier] as readonly [number, number];
      const x0 = Math.round(fx - bw / 2); // cells-ok — a sample coordinate
      const y0 = Math.round(fy - bh / 2); // cells-ok — a sample coordinate
      // **A near point at the frame's edge clips per sample** (C12 I88).
      // `writeDepth` refuses an out-of-bounds coordinate, so the in-bounds part
      // of the block draws and dropping the whole point never happens.
      for (let oy = 0; oy < bh; oy += 1) { // cells-ok — a sample offset
        for (let ox = 0; ox < bw; ox += 1) { // cells-ok — a sample offset
          const px = x0 + ox; // cells-ok — a sample coordinate
          const py = y0 + oy; // cells-ok — a sample coordinate
          if (writeDepth(depth, px, py, d.depth)) ink[py * grid.width + px] = colour; // cells-ok — a sample offset
        }
      }
    } else if (writeDepth(depth, sx, sy, d.depth)) {
      const i = sy * grid.width + sx; // cells-ok — a sample offset
      ink[i] = colour;
      glyph[i] = tier * clouds.length + d.series; // cells-ok — a series index
    }
  }

  return half
    ? halfRows(ink, depth, grid.width, rows)
    : glyphRows(ink, glyph, grid.width, rows, clouds.length, ctx); // cells-ok — a cloud count
}

/**
 * The colour raster, composed into cells — **three glyphs where the image arm
 * needs one** (§3am).
 *
 * A photograph inks every cell so `HALF_BLOCK` with a foreground and a
 * background says everything; a scatter is mostly empty, and a cell inked only
 * below cannot be `HALF_BLOCK` with no foreground, because the terminal paints
 * the top half in whatever the current foreground is.
 */
function halfRows(
  ink: readonly (ColourValue | undefined)[],
  depth: Depth,
  w: number,
  rows: number,
): readonly (readonly Span[])[] {
  // **Drawn-ness is the depth buffer's and never the colour's.** The first
  // draft read `ink[i] === undefined` as *not drawn*, and `continuousColour`
  // returns `undefined` below its own floor — so a sample with no colour
  // available would have read as a sample with nothing in it. It is
  // unreachable today because `halfBlockEligible` requires `colourDepth >= 8`
  // and `CONTINUOUS_FLOOR` is 8, which is **two independent thresholds that
  // happen to agree**: either moving alone turns a drawn point into a blank.
  const drawn = (i: number): boolean => Number.isFinite(depth.z[i]); // cells-ok — a sample offset
  const span = (glyph: string, colour: ColourValue | undefined, bg?: ColourValue): Span =>
    colour === undefined && bg === undefined
      ? { text: glyph }
      : bg === undefined
        ? { text: glyph, style: colour === undefined ? {} : { colour } }
        : { text: glyph, style: colour === undefined ? { background: bg } : { colour, background: bg } };
  const out: Span[][] = [];
  for (let r = 0; r < rows; r += 1) { // cells-ok — a row index
    const line: Span[] = [];
    for (let c = 0; c < w; c += 1) { // cells-ok — a column index
      const ti = r * 2 * w + c; // cells-ok — a sample offset
      const bi = (r * 2 + 1) * w + c; // cells-ok — a sample offset
      const t = drawn(ti);
      const b = drawn(bi);
      if (!t && !b) line.push({ text: " " });
      else if (!b) line.push(span(HALF_BLOCK, ink[ti]));
      else if (!t) line.push(span(HALF_BLOCK_LOWER, ink[bi]));
      else line.push(span(HALF_BLOCK, ink[ti], ink[bi]));
    }
    out.push(line);
  }
  return out;
}

/** The marker arm: one glyph a cell, the tier picking the row and the series the column. */
function glyphRows(
  ink: readonly (ColourValue | undefined)[],
  glyph: readonly number[],
  w: number,
  rows: number,
  clouds: number,
  ctx: RenderContext,
): readonly (readonly Span[])[] {
  const marks = markers3(ctx.capabilities);
  const table = [marks.near, marks.mid, marks.far] as const;
  const out: Span[][] = [];
  for (let r = 0; r < rows; r += 1) { // cells-ok — a row index
    const line: Span[] = [];
    for (let c = 0; c < w; c += 1) { // cells-ok — a column index
      const i = r * w + c; // cells-ok — a sample offset
      const g = glyph[i] ?? -1;
      if (g < 0) {
        line.push({ text: " " });
        continue;
      }
      const tier = Math.floor(g / Math.max(1, clouds)); // cells-ok — a tier index
      const series = g % Math.max(1, clouds); // cells-ok — a series index
      const row = table[Math.min(TIERS - 1, tier)] as readonly string[];
      const colour = ink[i];
      const text = row[series % row.length] ?? (row[0] as string); // cells-ok — a table length
      line.push(colour === undefined ? { text } : { text, style: { colour } });
    }
    out.push(line);
  }
  return out;
}

/** The rows, painted. `FORM_ROWS` takes strings and the legend is composed by the caller. */
export function scatter3dRows(
  block: Plot,
  areaWidth: number,
  ctx: RenderContext,
): readonly string[] {
  return scatter3dArea(block, areaWidth, ctx).map((line) => paint(line));
}
