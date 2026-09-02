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
import type { AxisSpec3, Plot, Point3, Tone } from "../../data/viewmodel/index.js";
import type { RenderContext } from "../blocks/types.js";
import type { ColourValue } from "../theme/types.js";
import { HALF_BLOCK, HALF_BLOCK_LOWER, halfBlockEligible } from "../image/index.js";
import { paint, slot, type Span } from "../blocks/paint.js";
import { arrows3, glyphs, MARKER3_COLUMNS, markerColumn, markers3 } from "../blocks/glyphs.js";
import { cells } from "../text.js";
import { glyphForMask, LINE_DOWN, LINE_LEFT, LINE_RIGHT, LINE_UP } from "./linedraw.js";
import { BRAILLE_DOTS, createGrid, foldBraille, setDot } from "./raster.js";
import {
  axisLines,
  boxEdges,
  clipProject,
  farCorner,
  type Clipped,
  originOf,
  ticks3,
  type Axis3,
  type Seg3,
} from "./axes3.js";
import { continuousColour, shadeColour } from "../theme/colormap.js";
import { colormapFor } from "./heatmap.js";
import { CELL_ASPECT } from "./aspect.js";
import {
  densityGlyph,
  drawTri,
  edgeIntensity,
  lightDirOf,
  surfacePoints,
  trianglesOf,
  type Tri3,
} from "./surface3.js";
import { plotAreaRows } from "./height.js";
import { seriesRefOf } from "./marks.js";
import {
  basisOf,
  createDepth,
  equalDepth,
  extentOf,
  project,
  sampleGrid,
  strokeSeg,
  unitOf,
  writeDepth,
  type Basis,
  type Depth,
  type Projected,
  type Vec3,
} from "./project3.js";

/** A label placed in cells: billboarded, horizontal, and it wins its cells. */
/**
 * A label, and **its own colour when its axis has one** (C12 I98).
 *
 * The colour rides on the label rather than on the pass, because `overlay`
 * takes one ink for every label it draws and a per-axis tone is the first
 * property a label carries that the pass cannot.
 */
type Placed = Readonly<{ row: number; col: number; text: string; ink?: ColourValue }>;

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
  /**
   * The marker table's column — **resolved here, where the cloud is, and not
   * in the compose step** (C12 I99).
   *
   * `glyphRows` is handed a packed integer and no clouds, so the only place
   * that can see a series' `marker` is the loop that walks the series. Carrying
   * the answer costs a number a sample; threading the cloud list down to the
   * decode would put a data lookup two layers from the data.
   */
  column: number;
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

/**
 * A projected polyline segment, with the readings at its **clipped** ends
 * (C12 I93).
 *
 * `va` and `vb` are the `value` interpolated to wherever the near-plane clip
 * left the endpoint, which is why `clipProject` hands its parameters back.
 */
type Stroke = Readonly<{
  a: Projected;
  b: Projected;
  va: number | undefined;
  vb: number | undefined;
  series: number;
}>;

/**
 * What a cloud and a path have in common, and all that colour and the legend
 * read of either (C04 I78).
 *
 * **One index space, clouds first**, so a caller with one of each gets two
 * palette slots — and the same numbering `identityOf` spells out in the legend.
 */
type Identity = Readonly<{ tone?: Tone; label?: string }>;

/** The samples, the paths, the faces, the frame they sit in, and the basis for all of it. */
type Scene = Readonly<{
  drawn: readonly Drawn[];
  strokes: readonly Stroke[];
  tris: readonly Tri3[];
  identities: readonly Identity[];
  basis: Basis;
  lo: Vec3;
  hi: Vec3;
}>;

/**
 * The samples the tier and the ramp are both keyed to, projected once.
 *
 * **The extent comes back with them**, because the reference frame is the
 * *data's* extent (C12 I92) and computing it twice would be two answers to one
 * question the moment a filter appeared between them.
 */
function drawnOf(block: Plot, ctx: RenderContext, aspect: number): Scene {
  const clouds = block.points3 ?? [];
  const paths = block.lines3 ?? [];
  const skins = block.surfaces3 ?? [];
  const all: Vec3[] = [];
  for (const c of clouds) for (const p of c.points) all.push(p);
  // **Both carriers, or the frame describes a different document** (C04 I78,
  // C12 §6g row 1). Taking the extent from the clouds alone leaves a
  // lines-only block normalising against `extentOf([])`'s unit cube: on
  // screen, inside the box, and drawn to the wrong scale — which no bounds
  // assertion and no ink comparison can see. That is T6.77.
  for (const l of paths) for (const p of l.points) all.push(p);
  // **And the fourth**, on the same rule (C04 I79, C12 §6h row 10). A surface
  // normalised against a cloud somewhere else has its relief flattened, and
  // that is the truth — the drawn geometry *is* the normalised one — but a
  // surface left out of the extent entirely draws against the unit cube.
  for (const sf of skins) for (const p of surfacePoints(sf)) all.push(p);
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
      out.push({
        x: pr.x, y: pr.y, depth: pr.depth, series: si,
        column: markerColumn(c.marker, si),
        value: p.value,
      });
    }
    si += 1; // cells-ok — a cloud index
  }
  const strokes: Stroke[] = [];
  for (const l of paths) {
    const pts = l.points;
    const n = pts.length; // cells-ok — a point count
    // **A closing segment at three points or more** (C04 I78). At two it
    // retraces the segment already drawn and at one it is zero-length, and the
    // rule lives here rather than in the loop below so a reader can see which
    // input it is about.
    const last = l.closed === true && n >= 3 ? n : n - 1; // cells-ok — a segment count
    for (let i = 0; i < last; i += 1) { // cells-ok — a segment index
      const p0 = pts[i] as Point3;
      const p1 = pts[(i + 1) % n] as Point3;
      const c = clipProject(basis, { a: unitOf(p0, extent), b: unitOf(p1, extent) });
      if (c === null) continue;
      // **Interpolated to the clipped end and not to the original one.** The
      // clip moved the endpoint, so a reading left at the vertex behind the
      // eye is the colour of a point the reader cannot see.
      const at = (t: number): number | undefined =>
        p0.value === undefined || p1.value === undefined
          ? p0.value ?? p1.value
          : p0.value + (p1.value - p0.value) * t;
      strokes.push({ a: c.a, b: c.b, va: at(c.ta), vb: at(c.tb), series: si });
    }
    si += 1; // cells-ok — a path index
  }
  // **Normals come from the normalised geometry** (C12 I94, §6h row 1), which is
  // why the triangles are built here with the extent in hand rather than by the
  // renderer with the surface alone.
  const tris: Tri3[] = [];
  for (const sf of skins) {
    tris.push(...trianglesOf(sf, extent, si));
    si += 1; // cells-ok — a surface index
  }
  return {
    drawn: out,
    strokes,
    tris,
    identities: [...clouds, ...paths, ...skins],
    basis,
    lo: extent.min,
    hi: extent.max,
  };
}

/**
 * The colour one **sample** is drawn in, on whichever channel `colourBy` names.
 *
 * **The three readings rather than a `Drawn`** (C12 I93): a polyline's colour
 * varies *along* a segment under `"depth"` and `"value"`, so the caller is a
 * per-sample loop with an interpolated depth and an interpolated value and no
 * point to hand over. Under `"series"` it is one colour for the whole line,
 * because that channel is categorical and a line has one identity.
 */
function colourOf(
  block: Plot,
  ctx: RenderContext,
  reading: Readonly<{ depth: number; value: number | undefined; series: number }>,
  identities: readonly Identity[],
  span: Readonly<{ nearD: number; farD: number; loV: number; hiV: number }>,
): ColourValue | undefined {
  const by = block.colourBy ?? "depth";
  if (by === "series") {
    return slot(
      seriesRefOf(identities[reading.series], reading.series),
      ctx.theme,
      ctx.capabilities,
    ).colour;
  }
  const map = colormapFor(block);
  if (map === undefined) return undefined;
  // **Near is the top of the ramp**, because a perceptual map runs dark to
  // bright and recession reads as falling away rather than as coming forward.
  const t =
    by === "value"
      ? ramped(reading.value ?? span.loV, span.loV, span.hiV)
      : 1 - ramped(reading.depth, span.nearD, span.farD);
  return continuousColour(map, t, ctx.capabilities);
}

/** The block a tier paints on the colour raster: samples across, samples down. */
const RASTER_TIER: readonly (readonly [number, number])[] = Object.freeze([
  [2, 2], // near
  [1, 2], // mid
  [1, 1], // far
]);

/**
 * The same three blocks at the dot grid — **doubled in each axis, so apparent
 * size is what survives the change of rung** (C12 I100).
 *
 * A braille sample is half a half-block sample across and half of it down, so
 * carrying `RASTER_TIER` over unchanged would draw every marker at a quarter of
 * the area it has on the rung beside this one — and the near tier, whose whole
 * job is to be the biggest, would come out the size the *far* tier is today.
 * The arm exists to draw a line more finely, not to shrink the points.
 */
const BRAILLE_TIER: readonly (readonly [number, number])[] = Object.freeze([
  [4, 4], // near
  [2, 4], // mid
  [2, 2], // far
]);

/** Which rung this block draws at (C12 I87, I100, §3am). */
type Arm = "half" | "braille" | "mask" | "glyph";

/**
 * `auto` is the terminal's and a named arm is the caller's (C12 I87, §3am).
 *
 * **The floor is `unicode` alone and `ambiguousWidth` does not bind**, because
 * `⣿` is one cell at both width conventions — which is the reason `halfblock.ts`
 * gives for why the braille arm has never met the problem `▀` has.
 *
 * **Below its floor the named arm degrades rather than refusing.** `plotStyle:
 * "line"` sets that precedent one family over — `lineDrawRows` falls to
 * `+ - |` — and the reason is stronger here: a construction error for a
 * *terminal's* capability would make one document valid on one machine and
 * invalid on another, which C04 cannot express and should not (§6m row 6).
 */
function armOf(
  block: Plot,
  caps: RenderContext["capabilities"],
): Arm {
  const ps = block.plotStyle;
  if (ps === "marker") return "glyph";
  if (ps === "braille" && caps.unicode !== "ascii") return "braille";
  // **No floor**, because `glyphForMask` already has one: it falls to `+ - |`
  // at `ascii` and at `ambiguousWidth: "wide"` rather than refusing, which is
  // the same degradation `lineDrawRows` gives the 2D family (C12 I101, I54).
  if (ps === "line") return "mask";
  return halfBlockEligible(caps, false) ? "half" : "glyph";
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
  /**
   * The plot area in **cells**, which is what a label is placed in — and which
   * is not `grid` (C12 I100, F489).
   *
   * **`rows` was already here and `w` was not, and the asymmetry is the
   * defect.** A label's row was computed from `rows` and its column from
   * `grid.width`, because on both existing arms `grid.width === w`: the
   * half-block rung is `width × 1` across and the glyph arm is one sample a
   * cell. The braille rung is the first that is `width × 2`, and there the
   * column, the width bound and the collision key were all in sample units
   * while the row was in cells.
   */
  area: Readonly<{ w: number; rows: number }>,
  depth: Depth,
  ctx: RenderContext,
  paint: (i: number, mark: string, ink?: ColourValue) => void,
): readonly Placed[] {
  const { w: areaW, rows } = area;
  const placement = block.axes3 ?? "corner";
  const boxMode = block.box3 ?? "back";
  // **One computation, two consumers** (C12 I90, F444). The three back faces
  // meet at this corner by construction, so `boxEdges` reads it rather than
  // deriving the same three signs.
  const corner = farCorner(scene.basis);
  const origin = originOf(block.origin3 ?? "auto", scene.lo, scene.hi);

  const stroke = (seg: Seg3, ink?: ColourValue): Clipped | null => {
    const p = clipProject(scene.basis, seg);
    if (p === null) return null;
    const mark = frameMark(p.a, p.b, ctx);
    // **`false`: the frame writes a colour and a colour has one question**
    // (C12 I101). It draws last and loses a tie to the data by construction —
    // F452's ruling — so painting on equal here would take back every cell the
    // reordering exists to give away.
    strokeSeg(p.a, p.b, grid, depth, (i) => { paint(i, mark, ink); }, false);
    return p;
  };

  /**
   * An axis's own colour, or `undefined` for the frame's (C12 I98, §6l row 1).
   *
   * **Not applied to `boxEdges` above**, and that is the ruling rather than an
   * omission: a box edge runs parallel to an axis, so attributing it would give
   * `box3: "full"` twelve edges in three colours.
   */
  const inkOf = (spec: AxisSpec3 | undefined): ColourValue | undefined =>
    spec?.tone === undefined
      ? undefined
      : slot(`tone.${spec.tone}`, ctx.theme, ctx.capabilities).colour;

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
      : Math.hypot((p.b.x - p.a.x) * grid.width, (p.b.y - p.a.y) * rows); // cells-ok — a cell extent
    return { line, p, extent };
  }).sort((a, b) => b.extent - a.extent);

  const taken = new Set<number>();
  const placed: Placed[] = [];
  const put = (anchor: Vec3, text: string, ink?: ColourValue): void => {
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
    if (row < 0 || row >= rows || wide > areaW) return; // cells-ok — a bound
    const col = Math.max(0, Math.min(areaW - wide, Math.round(pr.x * areaW - wide / 2))); // cells-ok — a column index
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
      if (taken.has(row * areaW + col + i)) return; // cells-ok — a cell offset
    }
    for (let i = -1; i <= wide; i += 1) taken.add(row * areaW + col + i); // cells-ok — a cell offset
    placed.push({ row, col, text, ...(ink === undefined ? {} : { ink }) });
  };

  for (const { line, extent } of measured) {
    const spec = style[line.axis];
    if (spec?.show === false) continue;
    // **The axis's own colour, carried to its line, its ticks and its label**
    // (C12 I98). One lookup per axis rather than per sample.
    const ink = inkOf(spec);
    // **Keep the line, drop the labels** (C12 I91). The axis is still
    // information about orientation when its scale is unreadable, which is why
    // the stroke below runs whatever the extent is.
    const p = clipProject(scene.basis, line.seg);
    if (p !== null) {
      const mark = frameMark(p.a, p.b, ctx);
      strokeSeg(p.a, p.b, grid, depth, (i) => { paint(i, mark, ink); }, false);
    }
    if (extent < EDGE_ON) continue;
    const [lo, hi] = spanOf(scene.lo, line.axis);
    for (const t of ticks3(line.axis, line, lo, hi, spec, spec?.format ?? block.yFormat)) {
      const pt = clipProject(scene.basis, { a: t.on, b: t.out });
      if (pt !== null) {
        const mark = frameMark(pt.a, pt.b, ctx);
        strokeSeg(pt.a, pt.b, grid, depth, (i) => { paint(i, mark, ink); }, false);
      }
      // **Pushed along `outward`, not scaled from the origin.** The first draft
      // multiplied the whole position vector by 1.35, which moves a point near
      // the origin barely at all and one near the corner a long way — so the
      // tick labels landed *inside* the box, over the data, and read as noise
      // rather than as a scale. The frame is what said so; no assertion about a
      // label's presence could have.
      put(along(t.on, line.outward, TICK_OUT + LABEL_GAP), t.text, ink);
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
      const dx = (p.b.x - p.a.x) * grid.width; // cells-ok — a cell extent
      const dy = (p.b.y - p.a.y) * rows; // cells-ok — a cell extent
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
      put(along(beyond, line.outward, TICK_OUT), head, ink);
    }
    const name = spec?.label ?? line.axis;
    const mid = { x: (line.seg.a.x + line.seg.b.x) / 2, y: (line.seg.a.y + line.seg.b.y) / 2, z: (line.seg.a.z + line.seg.b.z) / 2 };
    put(along(mid, line.outward, NAME_OUT), name, ink);
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
  const arm = armOf(block, ctx.capabilities);
  const half = arm === "half";
  const masked = arm === "mask";
  // **The two arms that paint a tier as a *block* rather than as a glyph**, and
  // the distinction the code needs more often than the arm's name: a sample is
  // sub-cell on both, so a marker is an area and a line is a run of samples.
  //
  // **Written as `arm !== "glyph"` and that was F489's own class a third time**,
  // in the predicate added to fix the first two. The mask arm is not the glyph
  // arm and is not sub-cell either — its grid is cells — so a near marker asked
  // for a `4 × 4` block of *cells*, `glyph[]` was never written, and the whole
  // cloud composed to blanks: 23 inked cells against the glyph arm's 131, all
  // of them the frame. The members have to be listed, because *not the other
  // one* stops being a definition at three.
  const sub = half || arm === "braille";
  const grid =
    half ? sampleGrid(w, rows, "half")
    : arm === "braille" ? sampleGrid(w, rows, "braille")
    : { width: w, height: rows };
  // **The aspect is the sample's, and the two arms disagree about it.** A
  // terminal cell is `CELL_ASPECT` times taller than it is wide; a half-block
  // sample is half a cell tall, so it is square and the aspect is the plain
  // grid ratio. A glyph-arm sample is a whole cell, so the ratio is divided by
  // the cell's own. Getting this wrong draws a sphere as an ellipse, which is
  // the one distortion a reader reads as data.
  // **Both sub-cell samples are square and the glyph arm's is not.** A cell is
  // `CELL_ASPECT` times taller than wide; a half-block sample is half a cell
  // tall, and a braille sample is half a cell wide and a *quarter* tall — which
  // is the same ratio again. So the correction is the arm's granularity rather
  // than the rung's, and it is `sub` for that reason.
  const aspect = grid.width / (grid.height * (sub ? 1 : CELL_ASPECT));
  const scene = drawnOf(block, ctx, aspect);
  const drawn = scene.drawn;

  let nearD = Infinity;
  let farD = -Infinity;
  let loV = Infinity;
  let hiV = -Infinity;
  const reading = (depth: number, value: number | undefined): void => {
    nearD = Math.min(nearD, depth);
    farD = Math.max(farD, depth);
    if (value !== undefined) {
      loV = Math.min(loV, value);
      hiV = Math.max(hiV, value);
    }
  };
  for (const d of drawn) reading(d.depth, d.value);
  // **The ramps span both carriers** (C04 I78). A path outside the cloud's
  // depth range would otherwise saturate at one end of the map, and the tier
  // and the ramp would be keyed to different sets — two answers to *how far is
  // far* in one figure.
  for (const st of scene.strokes) {
    reading(st.a.depth, st.va);
    reading(st.b.depth, st.vb);
  }
  // **And the surfaces**, or a landscape under a cloud saturates one end of the
  // map and the depth cue keys to a set the picture does not hold (C04 I79).
  // Projected here rather than threaded back from `drawTri`, because a culled
  // vertex has no depth and the span must not be told otherwise.
  for (const t of scene.tris) {
    for (const w of [t.a, t.b, t.c]) {
      const pr = project(scene.basis, w.p);
      if (pr !== null) reading(pr.depth, w.v);
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

  /**
   * The box-drawing mask — **four edge bits a cell, resolved after all strokes**
   * (C12 I101, §3am).
   *
   * Parallel to `mark` and not packed into it, for `mark`'s own reason one array
   * along: a literal glyph and an accumulator are two different things and one
   * number meaning both is `SHARES_CELLS`' lesson in a third place. Allocated on
   * every arm because the cost is one `Array` of the cell count and the branch
   * that would avoid it is a second place to be wrong about which arm is live.
   */
  const bits: number[] = new Array<number>(w * rows).fill(0); // cells-ok — a cell count

  /**
   * Link two cells a step apart — **both directions, and a diagonal claims
   * both axes** (C12 I101).
   *
   * `strokePolyline` steps axis-aligned so every move crosses exactly one edge;
   * `strokeSeg` steps on the dominant screen axis, so the other may also advance
   * by one and the move crosses a *corner*. The cell that corner passes through
   * is **not** drawn, because nothing tested its depth — so a diagonal
   * contributes both axes' bits to the cells it actually leaves and enters, and
   * the picture is a staircase of corner glyphs rather than a line through a
   * cell no depth test claimed. Inventing that cell is the one thing this arm
   * must not do: it would draw a wireframe edge in front of a surface that owns
   * the cell.
   */
  const at = (cx: number, cy: number, b: number): void => {
    if (cx < 0 || cy < 0 || cx >= w || cy >= rows) return; // cells-ok — a bound
    bits[cy * w + cx] = (bits[cy * w + cx] ?? 0) | b; // cells-ok — a cell offset
  };
  /** One axis-aligned move: the edge it leaves by and the edge it arrives at. */
  const step = (ax: number, ay: number, bx: number, by: number): void => {
    if (bx > ax) { at(ax, ay, LINE_RIGHT); at(bx, by, LINE_LEFT); }
    else if (bx < ax) { at(ax, ay, LINE_LEFT); at(bx, by, LINE_RIGHT); }
    else if (by > ay) { at(ax, ay, LINE_DOWN); at(bx, by, LINE_UP); }
    else if (by < ay) { at(ax, ay, LINE_UP); at(bx, by, LINE_DOWN); }
  };
  /**
   * Link two cells a step apart, **through the corner when the step is
   * diagonal** — and the corner is depth-tested like any other sample.
   *
   * `strokePolyline` steps axis-aligned so every move crosses exactly one edge
   * and the mask is unambiguous; `strokeSeg` steps on the dominant screen axis,
   * so the other may advance too and the move crosses a **corner cell** the
   * walk does not visit. Read off the frame: without it a run of diagonal steps
   * gives every cell four bits — `┼` at each — because a cell is both entered
   * and left on two axes, so a staircase drew as a column of crossings.
   *
   * **The corner is a cell the segment really passes through, not one invented
   * to make the glyph tidy**, which is why it takes the same depth test as
   * every other sample: claimed on equal-or-nearer, and where it is occluded
   * the link falls back to the dominant axis alone — two bits rather than four,
   * so the join degrades to a stub instead of to a crossing.
   *
   * Returns the corner's offset when it claimed one, so the caller can give it
   * the same colour as the samples either side. A cell with bits and no ink
   * would draw the mask uncoloured, which reads as the frame's rather than the
   * data's.
   */
  const link = (
    from: readonly [number, number] | null, x: number, y: number, z: number,
  ): number | null => {
    if (from === null) return null;
    const [fx, fy] = from;
    if (x !== fx && y !== fy) {
      if (writeDepth(depth, x, fy, z) || equalDepth(depth, x, fy, z)) {
        step(fx, fy, x, fy);
        step(x, fy, x, y);
        return fy * w + x; // cells-ok — a cell offset
      }
    }
    step(fx, fy, x, y);
    return null;
  };

  const frameInk = slot("tone.muted", ctx.theme, ctx.capabilities).colour;

  for (const d of drawn) {
    const tier = tierOf(d.depth, nearD, farD);
    const colour = colourOf(block, ctx, d, scene.identities, span);
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
    if (sub) {
      const [bw, bh] = (half ? RASTER_TIER : BRAILLE_TIER)[tier] as readonly [number, number];
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
      // **Packed against the table's width and not the cloud count** (C12
      // I99). It was `tier * clouds.length + series`, decoded with `% clouds`
      // — correct, and it made the encoding a function of the *document*: a
      // block with six clouds and one with three packed the same tier into
      // different integers. The column is now the table's own, so the packing
      // is a property of the alphabet and the decode needs nothing from the
      // block at all.
      glyph[i] = tier * MARKER3_COLUMNS + d.column; // cells-ok — a table width
    }
  }

  // **The points are already in, and that is the rule rather than the
  // layering** (C12 I93, §6g row 6). `writeDepth` is strictly nearer, so
  // first-drawn wins a tie — and a trajectory's vertices sit at *exactly* its
  // own cloud's depths. Stroke the paths first and every marker in the path is
  // swallowed by the line through it, on a frame where nothing is occluded.
  for (const st of scene.strokes) {
    // **One glyph a sample on the marker arm**, `│` or `─` by dominant screen
    // direction — the box's own mark since step 4. Box-drawing joins are
    // refused with their mechanism in §3ao: a mask cell carries four bits
    // resolved after all strokes, and a strictly-nearer test refuses the
    // second edge at exactly the shared vertex a join needs.
    // **A data path is dots on the braille arm and a glyph only below it.**
    // The whole of what the arm buys is a line at twice the resolution in each
    // axis, so writing a literal `│` here would spend it on the one primitive
    // it was measured for (F482).
    const glyphMark = arm === "glyph" ? frameMark(st.a, st.b, ctx) : undefined;
    // **The mask's own cursor.** A direction is a property of the *step*, so the
    // walk has to remember where it was — and it updates on a tie as well,
    // because a tied sample is exactly the shared vertex the second depth rule
    // exists for and dropping it there would break the join it came for.
    let prev: readonly [number, number] | null = null;
    strokeSeg(st.a, st.b, grid, depth, (i, t, z, nearer, px, py) => {
      if (masked) {
        const corner = link(prev, px, py, z);
        prev = [px, py];
        // The corner takes the step's own colour, or a cell with edges and no
        // ink draws the mask in nothing and reads as the frame's.
        if (corner !== null) {
          ink[corner] = colourOf(
            block, ctx, { depth: z, value: st.va ?? st.vb, series: st.series },
            scene.identities, span,
          );
          glyph[corner] = -1;
        }
        // **Equal-or-nearer for the mask, strictly-nearer for the colour**
        // (C12 I101, §3am). The bits are in; the ink is not this sample's.
        if (!nearer) return;
      }
      // **Interpolated per sample under the two ramp arms** (C12 I93). The
      // depth is here at every step, and one colour for a segment crossing the
      // figure contradicts the cue the whole form rests on.
      const v =
        st.va === undefined || st.vb === undefined
          ? st.va ?? st.vb
          : st.va + (st.vb - st.va) * t;
      ink[i] = colourOf(block, ctx, { depth: z, value: v, series: st.series }, scene.identities, span);
      // **A line writes a literal glyph and never a tier code** (C12 I93,
      // §6g row 5). `glyph` packs `tier x MARKER3_COLUMNS + column` and a line
      // is neither, so a line index reaching it would decode as some cloud's
      // shape at some depth — the cell is cleared rather than encoded.
      //
      // **The packing changed under this comment and the comment survived it**,
      // which is why it names the constant now: it read `tier x clouds +
      // series` and `% clouds`, a decode that no longer exists (C12 I99).
      mark[i] = glyphMark;
      glyph[i] = -1;
    }, masked);
  }

  // **The surfaces go in after the marks and before the frame** (C12 I94,
  // §6h row 11). Ties go to whoever drew first, so points and lines keep their
  // cells against a surface they sit on — and a height field's boundary *is* the
  // extent's boundary by construction, so a full-extent surface takes the box's
  // coincident edges. That is F452's ruling arriving where the coincidence is
  // structural rather than incidental.
  const lit = lightDirOf(block.light3, scene.basis);
  for (const t of scene.tris) {
    const wire = t.skin.wire;
    drawTri(t, scene.basis, grid, depth, lit, span, (i, sm) => {
      // **`wireframe: true` writes depth and paints nothing but the edges**
      // (C12 I95, §6i row 11). The depth write already happened — `drawTri`
      // calls it before this — so the face occludes what is behind it and the
      // surface is a solid whose interior is not painted rather than a
      // transparent cage. **The ink has to be cleared with it**, or a nearer
      // carrier's colour survives at a sample it has just lost, which is I90's
      // rule about the frame's write one carrier along. Hidden-line rather than
      // see-through, because a committed frame cannot be orbited.
      if (wire === true && !sm.edge) {
        ink[i] = undefined;
        mark[i] = undefined;
        glyph[i] = -1;
        return;
      }
      const base = colourOf(block, ctx, sm, scene.identities, span);
      // **An edge under `"over"` is its own face at half the intensity**
      // (§6i row 13): the only rule that cannot collapse into a fill whose own
      // range is `0.1332 … 0.7871`, and it keeps the shading and the depth
      // attenuation on the edge rather than pinning it to a constant.
      const k = sm.edge ? edgeIntensity(sm.intensity, wire) : sm.intensity;
      // **The shading scales the colour in linear light** (C12 I94, F455), and
      // the intensity arrives already clamped, because the ratio that makes the
      // field recoverable from hue holds over `[0, 1]` and nowhere else.
      ink[i] = base === undefined ? undefined : shadeColour(base, k);
      // **The glyph arm's second channel** (§6h row 12): the colour carries the
      // field and the mark carries the shading, which is F436's retracted claim
      // holding on the arm that kept two carriers.
      //
      // **`sub` and not `!half`, and reading the frame is what said so** (C12
      // I100, F489). This was `half ? undefined : …`, correct while *not half*
      // meant *the glyph arm*. On the braille rung it wrote a density glyph at
      // every surface sample, which `brailleRows` then read as a frame mark and
      // withheld from the dot grid — measured, the bottom dot row of a shaded
      // surface's cells was set **3 times against 76** for the rows above it,
      // and the picture was a plausible stipple rather than an obvious fault.
      mark[i] = sub ? undefined : densityGlyph(k, ctx.capabilities);
      glyph[i] = -1;
    });
  }

  // **The frame goes in last, and it is a rule about ties rather than a reading
  // convenience** (C12 I90, F452). It used to draw first under a comment saying
  // *order does not decide occlusion here* — which is false, and false in
  // exactly the case that matters: `writeDepth` is **strictly** nearer, so a
  // tie goes to whoever drew first, and data sitting at the box's own depth is
  // not a curiosity. The extent *is* the data's, so the extreme samples lie on
  // the box by construction, and a wireframe of a bounding volume coincides
  // with it entirely — drawn first, the frame took every one of those cells and
  // painted the reader's own geometry in `tone.muted`.
  //
  // Nothing else moves: a frame edge genuinely in front of a sample still wins,
  // because that test is unchanged and is what `box3: "full"` means.
  const labels = frameOf(block, scene, grid, { w, rows }, depth, ctx, (i, m, axisInk) => {
    // **The axis's own tone where it has one** (C12 I98). The box and the
    // untoned axes keep `frameInk`, which is what makes a single coloured axis
    // read as one axis rather than as a recoloured frame.
    ink[i] = axisInk ?? frameInk;
    mark[i] = m;
    // **And the tier code is cleared with it.** `glyphRows` reads `glyph`
    // before `mark`, so a frame cell that won a marker's sample would draw the
    // marker in the frame's colour — a defect the old order could not have,
    // and the one thing reordering had to carry with it.
    glyph[i] = -1;
  });

  const composed =
    half ? halfRows(ink, depth, grid.width, rows)
    : arm === "braille" ? brailleRows(ink, depth, mark, w, rows)
    : glyphRows(ink, glyph, mark, masked ? bits : undefined, w, rows, ctx, block.plotCorners ?? "rounded");
  // **`w` and not `grid.width`, which were the same number until this arm.**
  // Both call sites read the sample grid where they meant the cell width, and
  // both were right by coincidence on every rung that existed (F489).
  return overlay(composed, labels, frameInk, w); // cells-ok — a cell width
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

/**
 * The empty braille cell — `foldBraille`'s `0x2800 + mask` with no dots set.
 *
 * Named rather than written as a character, because a literal here is a mark the
 * substitution table cannot reach (A03 SS47) — and named rather than inlined,
 * because `0x2800` in a comparison reads as a magic number where this reads as
 * the question being asked.
 */
const BRAILLE_BLANK = 0x2800;

/**
 * The dot grid, composed into cells — **one colour a cell, and the data owns it**
 * (C12 I100, §6m rows 1 and 2).
 *
 * **Built through `raster.ts` rather than beside it.** `foldBraille` holds the
 * dot-to-bit order, and a second copy of that order is a second place for the
 * picture to come out transposed — which every count-based assertion would agree
 * with, because a transpose preserves counts. One extra `Uint8Array` is the
 * price of the order living in one file.
 *
 * **The data wins the cell and the frame draws where the data did not**, which
 * is `glyphRows`' own precedence — `glyph` before `mark` — and *the axes never
 * occlude the data* read from the other side (C12 I90). §6m row 2 headlined this
 * the other way round while citing the precedence correctly beneath it, and the
 * code is what settled it (F488).
 *
 * **A cell's colour is its nearest drawn sample's and never a mean** (C12 I100).
 * The depth buffer is the authority on drawn-ness, which is `halfRows`' rule one
 * function up; a mean of two clouds' colours is a third colour naming neither.
 *
 * **An empty cell is a space and not `⠀`.** U+2800 is a blank braille glyph, so
 * a frame full of them measures right and reads as ink-less texture rather than
 * as nothing — and every other sparse raster in this component emits a space.
 */
function brailleRows(
  ink: readonly (ColourValue | undefined)[],
  depth: Depth,
  mark: readonly (string | undefined)[],
  w: number,
  rows: number,
): readonly (readonly Span[])[] {
  const dots = createGrid(w * BRAILLE_DOTS.x, rows * BRAILLE_DOTS.y); // cells-ok — a dot count
  for (let y = 0; y < depth.height; y += 1) { // cells-ok — a sample index
    for (let x = 0; x < depth.width; x += 1) { // cells-ok — a sample index
      const i = y * depth.width + x; // cells-ok — a sample offset
      // The frame's samples are not dots — they are a glyph the cell may take
      // if no data reached it, so lighting them would draw the axis twice.
      if (mark[i] === undefined && Number.isFinite(depth.z[i])) setDot(dots, x, y);
    }
  }
  const folded = foldBraille(dots);
  const out: Span[][] = [];
  for (let r = 0; r < rows; r += 1) { // cells-ok — a row index
    const glyphRow = [...(folded[r] ?? "")];
    const line: Span[] = [];
    for (let c = 0; c < w; c += 1) { // cells-ok — a column index
      let nearest = Infinity;
      let colour: ColourValue | undefined;
      let framed: string | undefined;
      let framedInk: ColourValue | undefined;
      let framedAt = Infinity;
      for (let dy = 0; dy < BRAILLE_DOTS.y; dy += 1) { // cells-ok — a dot index
        for (let dx = 0; dx < BRAILLE_DOTS.x; dx += 1) { // cells-ok — a dot index
          const x = c * BRAILLE_DOTS.x + dx; // cells-ok — a sample coordinate
          const y = r * BRAILLE_DOTS.y + dy; // cells-ok — a sample coordinate
          if (x >= depth.width || y >= depth.height) continue;
          const i = y * depth.width + x; // cells-ok — a sample offset
          const z = depth.z[i] as number;
          if (!Number.isFinite(z)) continue;
          const m = mark[i];
          if (m !== undefined) {
            if (z < framedAt) { framedAt = z; framed = m; framedInk = ink[i]; }
            continue;
          }
          if (z < nearest) { nearest = z; colour = ink[i]; }
        }
      }
      const glyph = glyphRow[c] ?? " ";
      // **The code point and not the character** (A03 SS47). A literal blank
      // braille glyph in framework text is a mark the substitution table cannot
      // reach; `foldBraille` emits `0x2800 + mask`, so the empty cell is the
      // mask being zero and that is what to say.
      if (glyph.codePointAt(0) !== BRAILLE_BLANK) {
        line.push(colour === undefined ? { text: glyph } : { text: glyph, style: { colour } });
      } else if (framed !== undefined) {
        line.push(framedInk === undefined ? { text: framed } : { text: framed, style: { colour: framedInk } });
      } else {
        line.push({ text: " " });
      }
    }
    out.push(line);
  }
  return out;
}

/** The marker arm: one glyph a cell, the tier picking the row and `marker` the column. */
function glyphRows(
  ink: readonly (ColourValue | undefined)[],
  glyph: readonly number[],
  mark: readonly (string | undefined)[],
  /**
   * The mask, on the arm that has one — **and `undefined` rather than an array
   * of zeroes**, so *this arm does not use a mask* and *this cell has no edges*
   * are two states rather than one (C12 I101).
   */
  bits: readonly number[] | undefined,
  w: number,
  rows: number,
  ctx: RenderContext,
  corners: "rounded" | "sharp",
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
        // **Data, then the mask, then the frame** — `glyphRows`' own precedence
        // extended by one rung (C12 I101, F488). A marker outranks a line
        // through it for F452's reason, and a caller's wireframe outranks the
        // frame's own stroke for I90's: the axes never occlude the data.
        const edges = bits?.[i] ?? 0;
        const drawn = edges !== 0 ? glyphForMask(edges, corners, ctx.capabilities) : framed;
        line.push(
          drawn === undefined ? { text: " " }
          : colour === undefined ? { text: drawn }
          : { text: drawn, style: { colour } },
        );
        continue;
      }
      const tier = Math.floor(g / MARKER3_COLUMNS); // cells-ok — a tier index
      const column = g % MARKER3_COLUMNS; // cells-ok — a table width
      const row = table[Math.min(TIERS - 1, tier)] as readonly string[];
      const colour = ink[i];
      // **The far row is five glyphs and one reading**, so a named shape is
      // honoured here and invisible — `· ∙ • ˙ ‧` at one cell is a dot. A limit
      // of the alphabet rather than of this lookup (C12 I99, F484).
      const text = row[column] ?? (row[0] as string); // cells-ok — a table width
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
    // **The label's own ink where its axis set one** (C12 I98, §6l row 2). This
    // pass took one colour for every label, which is the one place in the frame
    // where the colour is a property of the *pass* rather than of the thing
    // drawn — so a per-axis tone is the first property it could not carry.
    const own = l.ink ?? colour;
    for (let i = 0; i < chars.length; i += 1) { // cells-ok — a character index
      const c = l.col + i; // cells-ok — a column index
      if (c < 0 || c >= w) continue; // cells-ok — a column index
      line[c] = own === undefined
        ? { text: chars[i] as string }
        : { text: chars[i] as string, style: { colour: own } };
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
