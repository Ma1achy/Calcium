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
import { arrows3, glyphs, markers3 } from "../blocks/glyphs.js";
import { cells } from "../text.js";
import {
  axisLines,
  boxEdges,
  clipProject,
  farCorner,
  originOf,
  ticks3,
  type Axis3,
  type Seg3,
} from "./axes3.js";
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
  type Basis,
  type Depth,
  type Projected,
  type Vec3,
} from "./project3.js";

/** A label placed in cells: billboarded, horizontal, and it wins its cells. */
type Placed = Readonly<{ row: number; col: number; text: string }>;

/** How short a projected axis has to be before its labels come off, in cells. */
const EDGE_ON = 1;

/**
 * How far a label sits beyond its tick, in normalised units.
 *
 * `TICK_OUT` matches `axes3`'s own tick length and `LABEL_GAP` is the blank
 * between the mark and the text — the same two-part spacing the 2-D gutter has,
 * where `AXIS_GUTTER` is the gap and the label column is the text.
 */
const TICK_OUT = 0.07;
const LABEL_GAP = 0.13;
/**
 * How far outside its ticks an axis name sits.
 *
 * **Measured, and there is a window rather than a floor.** Too close and the
 * name collides with the nearest tick label plus its gap; too far and its
 * anchor leaves the frame, where the clamp pushes it back onto its neighbours.
 * Swept over the default camera at 80 cells, three axes, at two name lengths:
 *
 * ```
 * NAME_OUT    5-character names drawn    2-character
 *   0.42            0 of 3                  0 of 3
 *   0.55            0 of 3                  3 of 3
 *   0.70            3 of 3                  3 of 3     <- taken
 *   0.85            1 of 3                  1 of 3
 * ```
 *
 * **The 0.42 row is the one that reads as a bug and is not.** A one-character
 * name fits where a five-character one does not, so `x`, `y` and `z` all drew
 * and `ALPHA` drew nowhere — a label rule that works exactly until somebody
 * names an axis.
 */
const NAME_OUT = 0.7;

/** A point pushed along a direction. */
const along = (p: Vec3, d: Vec3, k: number): Vec3 =>
  ({ x: p.x + d.x * k, y: p.y + d.y * k, z: p.z + d.z * k });



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

/** The samples, the frame they sit in, and the basis all three are projected through. */
type Scene = Readonly<{ drawn: readonly Drawn[]; basis: Basis; lo: Vec3; hi: Vec3 }>;

/**
 * The samples the tier and the ramp are both keyed to, projected once.
 *
 * **The extent comes back with them**, because the reference frame is the
 * *data's* extent (C12 I92) and computing it twice would be two answers to one
 * question the moment a filter appeared between them.
 */
function drawnOf(block: Plot, ctx: RenderContext, aspect: number): Scene {
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
  return { drawn: out, basis, lo: extent.min, hi: extent.max };
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
 * A projected segment into the sample grid, depth-tested (C12 I90).
 *
 * **Stepped on the dominant screen axis**, so a shallow line inks one sample
 * per column and a steep one per row — the ordinary rule, and the reason a
 * segment never leaves gaps at either slope.
 *
 * `writeDepth` refuses an out-of-bounds sample, so a line running off the frame
 * clips per sample exactly as a near point's block does (C12 I88) rather than
 * being dropped at the segment.
 */
function strokeSeg(
  pa: Projected,
  pb: Projected,
  grid: Readonly<{ width: number; height: number }>,
  depth: Depth,
  paint: (i: number) => void,
): void {
  const x0 = pa.x * grid.width;
  const y0 = pa.y * grid.height;
  const x1 = pb.x * grid.width;
  const y1 = pb.y * grid.height;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)))); // cells-ok — a sample count
  for (let i = 0; i <= steps; i += 1) { // cells-ok — a sample index
    const t = i / steps; // cells-ok — a sample index
    const px = Math.round(x0 + (x1 - x0) * t); // cells-ok — a sample coordinate
    const py = Math.round(y0 + (y1 - y0) * t); // cells-ok — a sample coordinate
    const z = pa.depth + (pb.depth - pa.depth) * t;
    if (writeDepth(depth, px, py, z)) paint(py * grid.width + px); // cells-ok — a sample offset
  }
}

/** The frame's marks, by the segment's dominant screen direction. */
function frameMark(
  pa: Projected,
  pb: Projected,
  ctx: RenderContext,
): string {
  const g = glyphs(ctx.capabilities);
  return Math.abs(pb.y - pa.y) > Math.abs(pb.x - pa.x) ? g.vertical : g.horizontal;
}

/**
 * The reference frame — the box, the three axis lines, their ticks and their
 * labels (C12 I90, I91, I92).
 *
 * **Drawn into the same depth buffer as the data**, which is what *the axes
 * never occlude the data* means read from the other side: the frame sits at the
 * back and a sample in front of it wins the cell.
 *
 * Labels come back rather than being drawn here, because they are **cell**
 * resolution over a sub-cell raster and the cells do not exist until the raster
 * is composed.
 */
function frameOf(
  block: Plot,
  scene: Scene,
  grid: Readonly<{ width: number; height: number }>,
  rows: number,
  depth: Depth,
  ctx: RenderContext,
  paint: (i: number, mark: string) => void,
): readonly Placed[] {
  const placement = block.axes3 ?? "corner";
  const boxMode = block.box3 ?? "back";
  // **One computation, two consumers** (C12 I90, F444). The three back faces
  // meet at this corner by construction, so `boxEdges` reads it rather than
  // deriving the same three signs.
  const corner = farCorner(scene.basis);
  const origin = originOf(block.origin3 ?? "auto", scene.lo, scene.hi);

  const stroke = (seg: Seg3): readonly [Projected, Projected] | null => {
    const p = clipProject(scene.basis, seg);
    if (p === null) return null;
    const mark = frameMark(p[0], p[1], ctx);
    strokeSeg(p[0], p[1], grid, depth, (i) => { paint(i, mark); });
    return p;
  };

  for (const e of boxEdges(corner, boxMode)) stroke(e);
  if (placement === false) return [];

  const style = block.axisStyle3 ?? {};
  const lines = axisLines(placement, scene.basis, origin);
  const spanOf = (v: Vec3, k: Axis3): readonly [number, number] => {
    const spec = style[k];
    if (spec?.range !== undefined) return spec.range;
    const lo = k === "x" ? scene.lo.x : k === "y" ? scene.lo.y : scene.lo.z;
    const hi = k === "x" ? scene.hi.x : k === "y" ? scene.hi.y : scene.hi.z;
    void v;
    return [lo, hi];
  };

  // **Ordered by projected extent, descending** — the collision rule's own
  // priority, and the reason an edge-on axis needs no clause of its own: a zero
  // extent sorts last and has no labels to place (C12 I91).
  const measured = lines.map((line) => {
    const p = clipProject(scene.basis, line.seg);
    const extent = p === null
      ? 0
      : Math.hypot((p[1].x - p[0].x) * grid.width, (p[1].y - p[0].y) * rows); // cells-ok — a cell extent
    return { line, p, extent };
  }).sort((a, b) => b.extent - a.extent);

  const taken = new Set<number>();
  const placed: Placed[] = [];
  const put = (anchor: Vec3, text: string): void => {
    if (text === "") return;
    const pr = project(scene.basis, anchor);
    if (pr === null) return;
    // **Depth-tested at the anchor and drawn over** (C12 I92). A string is not a
    // sample: testing every cell would draw half a label, which reads as
    // corruption rather than as occlusion. One test, at the point the label
    // names — so a label behind the cloud is not drawn, and one in front is
    // drawn whole.
    //
    // **This is what makes `axes3: "origin"` readable.** Its lines cross inside
    // the figure by construction, so its labels sit where the data is; without
    // the test they printed over the helix and the frame read as noise.
    const ax = Math.floor(pr.x * grid.width); // cells-ok — a sample coordinate
    const ay = Math.floor(pr.y * grid.height); // cells-ok — a sample coordinate
    if (ax >= 0 && ay >= 0 && ax < grid.width && ay < grid.height) { // cells-ok — a bound
      const held = depth.z[ay * grid.width + ax] as number; // cells-ok — a sample offset
      if (held < pr.depth - 1e-6) return;
    }
    const row = Math.round(pr.y * rows - 0.5); // cells-ok — a row index
    const wide = cells(text, ctx.capabilities.ambiguousWidth); // cells-ok — a label width
    // **Clamped into the frame rather than dropped at its edge.** The first
    // draft refused a label whose centred position ran past a margin, which is
    // a *cosmetic* reason to lose a reading — and it fell hardest on the long
    // names it was least able to spare: `x` drew and `ALPHA` never did, at any
    // clearance, because the longer string was the one that overflowed. A label
    // that does not fit the frame at all is still refused; one that fits
    // somewhere is moved.
    if (row < 0 || row >= rows || wide > grid.width) return; // cells-ok — a bound
    const col = Math.max(0, Math.min(grid.width - wide, Math.round(pr.x * grid.width - wide / 2))); // cells-ok — a column index
    // **Drop the later**, `niceAxis`'s own rule: a label whose cells another
    // has already claimed is not drawn, and the order above is the priority.
    //
    // **A blank is claimed on each side, and the frame is why.** Overlap alone
    // let two labels abut: `1` and `0.5` at adjacent columns claimed disjoint
    // cells, both drew, and the frame read `10.5` — one number that is neither
    // of them. Two labels touching are unreadable without overlapping, so the
    // reservation is the label **plus its gap**, which is the same rule the
    // y-gutter's own spacing has one dimension down.
    for (let i = -1; i <= wide; i += 1) { // cells-ok — a column offset
      if (taken.has(row * grid.width + col + i)) return; // cells-ok — a cell offset
    }
    for (let i = -1; i <= wide; i += 1) taken.add(row * grid.width + col + i); // cells-ok — a cell offset
    placed.push({ row, col, text });
  };

  for (const { line, extent } of measured) {
    const spec = style[line.axis];
    if (spec?.show === false) continue;
    // **Keep the line, drop the labels** (C12 I91). The axis is still
    // information about orientation when its scale is unreadable, which is why
    // the stroke below runs whatever the extent is.
    const p = clipProject(scene.basis, line.seg);
    if (p !== null) {
      const mark = frameMark(p[0], p[1], ctx);
      strokeSeg(p[0], p[1], grid, depth, (i) => { paint(i, mark); });
    }
    if (extent < EDGE_ON) continue;
    const [lo, hi] = spanOf(scene.lo, line.axis);
    for (const t of ticks3(line.axis, line, lo, hi, spec, spec?.format ?? block.yFormat)) {
      const pt = clipProject(scene.basis, { a: t.on, b: t.out });
      if (pt !== null) {
        const mark = frameMark(pt[0], pt[1], ctx);
        strokeSeg(pt[0], pt[1], grid, depth, (i) => { paint(i, mark); });
      }
      // **Pushed along `outward`, not scaled from the origin.** The first draft
      // multiplied the whole position vector by 1.35, which moves a point near
      // the origin barely at all and one near the corner a long way — so the
      // tick labels landed *inside* the box, over the data, and read as noise
      // rather than as a scale. The frame is what said so; no assertion about a
      // label's presence could have.
      put(along(t.on, line.outward, TICK_OUT + LABEL_GAP), t.text);
    }
    // **The name sits at the axis's midpoint, pushed further out than its
    // ticks** — matplotlib's placement, and the frame is what argued for it.
    // Past the positive end it collided: x and y both run *to* the anchor
    // corner, so both names and a shared tick landed on one cell and the frame
    // read `xy1`. The midpoint is the one point on an axis that no other axis
    // shares.
    // **The arrowhead, by the axis's direction on screen** (C04 I77). It exists
    // because `axes3: "origin"` extends both ways from a crossing and a reader
    // has to know which end is positive — but it is honoured at every
    // placement, because a caller who asks for it has asked for it.
    if (spec?.arrow === true && p !== null) {
      const a3 = arrows3(ctx.capabilities);
      const dx = (p[1].x - p[0].x) * grid.width; // cells-ok — a cell extent
      const dy = (p[1].y - p[0].y) * rows; // cells-ok — a cell extent
      const head = Math.abs(dy) > Math.abs(dx)
        ? (dy < 0 ? a3.up : a3.down)
        : (dx < 0 ? a3.left : a3.right);
      // **Past the positive end along the axis**, not at it: the positive ends
      // of x and y are the anchor corner itself, where both their last ticks
      // land, so a head placed there loses the collision every time.
      const tip = { ...line.seg.b };
      const k = line.axis;
      const beyond = k === "x" ? { ...tip, x: tip.x * 1.18 }
        : k === "y" ? { ...tip, y: tip.y * 1.18 } : { ...tip, z: tip.z * 1.18 };
      put(along(beyond, line.outward, TICK_OUT), head);
    }
    const name = spec?.label ?? line.axis;
    const mid = { x: (line.seg.a.x + line.seg.b.x) / 2, y: (line.seg.a.y + line.seg.b.y) / 2, z: (line.seg.a.z + line.seg.b.z) / 2 };
    put(along(mid, line.outward, NAME_OUT), name);
  }
  return placed;
}

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
  const scene = drawnOf(block, ctx, aspect);
  const drawn = scene.drawn;
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
  // **The frame's own mark, parallel to the tier code** (C12 I90). A frame cell
  // is not a tier and not a series, so encoding it into `glyph`'s arithmetic
  // would make one number mean two things — which is `SHARES_CELLS`' own lesson
  // in a different array.
  const mark: (string | undefined)[] = new Array<string | undefined>(
    grid.width * grid.height, // cells-ok — a sample count
  ).fill(undefined);

  // **Drawn first, and the depth buffer is what puts it behind.** Order does not
  // decide occlusion here — `writeDepth` is strictly nearer-wins — so the frame
  // going in first is a reading convenience rather than a rule.
  const frameInk = slot("tone.muted", ctx.theme, ctx.capabilities).colour;
  const labels = frameOf(block, scene, grid, rows, depth, ctx, (i, m) => {
    ink[i] = frameInk;
    mark[i] = m;
  });

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
          if (writeDepth(depth, px, py, d.depth)) { // cells-ok — a sample offset
            ink[py * grid.width + px] = colour; // cells-ok — a sample offset
            mark[py * grid.width + px] = undefined; // cells-ok — a sample offset
          }
        }
      }
    } else if (writeDepth(depth, sx, sy, d.depth)) {
      const i = sy * grid.width + sx; // cells-ok — a sample offset
      ink[i] = colour;
      mark[i] = undefined;
      glyph[i] = tier * clouds.length + d.series; // cells-ok — a series index
    }
  }

  const composed = half
    ? halfRows(ink, depth, grid.width, rows)
    : glyphRows(ink, glyph, mark, grid.width, rows, clouds.length, ctx); // cells-ok — a cloud count
  return overlay(composed, labels, frameInk, grid.width); // cells-ok — a cell width
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
  mark: readonly (string | undefined)[],
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
      const framed = mark[i];
      const g = glyph[i] ?? -1;
      if (g < 0) {
        const colour = ink[i];
        line.push(
          framed === undefined ? { text: " " }
          : colour === undefined ? { text: framed }
          : { text: framed, style: { colour } },
        );
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

/**
 * The labels, over the composed cells (C12 I92).
 *
 * **Text wins the whole cell**, which is the one place in this component where
 * the two resolutions meet: a label is cell-resolution and the raster is
 * sub-cell, so half a cell of label is not a thing. The spans are rebuilt
 * rather than patched, because a `Span` carries text *and* style and splicing
 * into the middle of one would leave two halves claiming one style.
 */
function overlay(
  composed: readonly (readonly Span[])[],
  labels: readonly Placed[],
  colour: ColourValue | undefined,
  w: number,
): readonly (readonly Span[])[] {
  if (labels.length === 0) return composed; // cells-ok — a label count
  const rows = composed.map((line) => [...line]);
  for (const l of labels) {
    const line = rows[l.row];
    if (line === undefined) continue;
    const chars = [...l.text];
    for (let i = 0; i < chars.length; i += 1) { // cells-ok — a character index
      const c = l.col + i; // cells-ok — a column index
      if (c < 0 || c >= w) continue; // cells-ok — a column index
      line[c] = colour === undefined
        ? { text: chars[i] as string }
        : { text: chars[i] as string, style: { colour } };
    }
  }
  return rows;
}

/** The rows, painted. `FORM_ROWS` takes strings and the legend is composed by the caller. */
export function scatter3dRows(
  block: Plot,
  areaWidth: number,
  ctx: RenderContext,
): readonly string[] {
  return scatter3dArea(block, areaWidth, ctx).map((line) => paint(line));
}
