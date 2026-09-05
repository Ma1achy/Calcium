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
import type { AxisSpec3, Plot, Point3, Surface3, Tone } from "../../data/viewmodel/index.js";
import type { RenderContext } from "../blocks/types.js";
import type { ColourValue, Style } from "../theme/types.js";
import { assertPictureGlyph } from "../theme/picture.js";
// **`HALF_BLOCK` is gone from this file and that is the finding, not the
// tidy-up** (C12 I104). `▀` was the area raster; it is now one of sixteen
// quadrant masks and `QUADRANTS[3]` is the same character, reached by the
// same cell whenever a top-against-bottom split is the best one. The import
// went unused because the constant was subsumed rather than replaced.
import { halfBlockEligible } from "../image/index.js";
import { paint, slot, type Span } from "../blocks/paint.js";
import { arrows3, glyphs, MARKER3_COLUMNS, markerColumn, markers3 } from "../blocks/glyphs.js";
import { cells } from "../text.js";
import { glyphForMask, LINE_DOWN, LINE_LEFT, LINE_RIGHT, LINE_UP, QUADRANTS } from "./linedraw.js";
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
  AREA_ROWS,
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
  type Extent3,
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
/**
 * What a held slot carries beside its triangles (C12 I107, §6o).
 *
 * **The object carriers are checked by identity and the scalars go in the key**,
 * which is the split that makes one string enough. `block()` deep-freezes — the
 * caller's own array, in place, mutation throwing — so identity is a proxy for
 * content; `xRange` and `yRange` are pairs of numbers rather than payloads, so
 * their *values* go in the key and two structurally equal fresh arrays hit
 * rather than missing.
 */
type HeldGeometry = Readonly<{ from: readonly unknown[]; tris: readonly Tri3[] }>;

/** Every object `trianglesOf` reads, in a fixed order, for the identity check. */
const carriersOf = (sf: Surface3): readonly unknown[] =>
  [sf.vertices, sf.faces, sf.heights, sf.field];

/**
 * Everything else it reads: the scalars, the ranges' values, the extent and the
 * series index (C12 I107).
 *
 * **The extent is here and it is the row nothing else would find** (§6o row 1).
 * It is taken over *every* carrier in the block, so a point cloud gaining a
 * point moves this surface's triangles while the surface does not change — and
 * a key without it draws the figure at the wrong scale, inside the box, with
 * every arithmetic assertion passing.
 *
 * **`series` is here for the same kind of reason** (§6o row 6): it is written
 * into every `Tri3` and read by `colourOf`, so a slot shared between two
 * surfaces colours the second as the first. It is the argument a key written
 * from the signature's first two parameters leaves out.
 */
function geometryKey(sf: Surface3, e: Extent3, series: number): string {
  const r = (v: readonly [number, number] | undefined): string =>
    v === undefined ? "" : `${String(v[0])},${String(v[1])}`;
  return [
    String(series),
    sf.shading ?? "",
    String(sf.wireframe ?? ""),
    sf.closed === true ? "1" : "",
    r(sf.xRange),
    r(sf.yRange),
    String(e.min.x), String(e.min.y), String(e.min.z),
    String(e.max.x), String(e.max.y), String(e.max.z),
  ].join("\u0000");
}

/**
 * `trianglesOf` through the caller's scratch (C12 I107, §6o, FINDINGS F469).
 *
 * **None of `trianglesOf`'s three arguments is the camera**, so an orbit rebuilds
 * an identical answer every frame: measured at 69,451 faces, **194 ms of a
 * 319 ms frame**. F469 named this remedy — caller-owned scratch on
 * `RenderContext` — and recorded it rather than taking it, because C12 I11 makes
 * the wrong version of it the tempting one.
 *
 * **The owner is a carrier and never the `Surface3`** (§6o row 2). C23 I34 hands
 * a live part a *new* block every tick, so a surface built fresh around a cached
 * mesh is a new wrapper holding the same two arrays; keyed on the wrapper this
 * misses every tick and buys nothing on the path that renders most often.
 *
 * **The slot is written after the build and never before** (§6o row 8). A
 * refusal mid-build would otherwise leave an entry for a surface that produced
 * no triangles — wrong the moment another surface reused the same carrier — and
 * the ordering outlives whichever refusal exists at the time.
 *
 * **Absent scratch is a miss and nothing else.** The frame is identical and the
 * cost is what it was; a cache whose absence changes a picture is not a cache,
 * and PR10's control asserts exactly that before it asserts anything else.
 */
function trianglesFor(
  sf: Surface3,
  extent: Extent3,
  series: number,
  ctx: RenderContext,
): readonly Tri3[] {
  const scratch = ctx.scratch;
  if (scratch === undefined) return trianglesOf(sf, extent, series);
  const owner = (sf.faces ?? sf.heights ?? sf.vertices ?? sf) as object;
  const key = geometryKey(sf, extent, series);
  const from = carriersOf(sf);
  const held = scratch.get(owner, key) as HeldGeometry | undefined;
  if (held !== undefined && held.from.length === from.length // cells-ok — a carrier count
    && held.from.every((v, i) => v === from[i])) {
    return held.tris;
  }
  const tris = trianglesOf(sf, extent, series);
  scratch.set(owner, key, { from, tris } satisfies HeldGeometry);
  return tris;
}

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
    // **A loop and never `push(...built)`** (F508). A spread is an argument
    // list: 100,000 elements is fine and 125,000 throws `RangeError: Maximum
    // call stack size exceeded`, from an expression that reads as a
    // concatenation. C12 I11's shape is that the renderer answers rather than
    // refuses, and the largest mesh in the tree is 69,451 faces — under half
    // the ceiling, which is why it never fired. `parseObj` fans quads, so a
    // 63k-quad model is over it.
    for (const t of trianglesFor(sf, extent, si, ctx)) tris.push(t);
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

/**
 * The block a tier paints, in samples across and samples down — **one table,
 * because there is now one grid** (F498).
 *
 * There were two, and the difference between them was never about markers. At
 * the time, the half rung sampled `w × rows·2` and the dot rung `w·2 × rows·4`,
 * so the same apparent size needed two sets of numbers and the second was
 * written as *"doubled in each axis"* against the first. Correct, and correct
 * only while the two grids differed.
 *
 * When the silhouette alphabet took the half rung onto the dot grid the two
 * became one grid, and the doubling that had been compensation turned into a
 * marker drawn at twice the size on one arm and half on the other — near
 * drawing what mid should, and `BR4` measuring one cell against two. **The rule
 * a derived constant follows: when the thing it compensates for goes away, the
 * compensation is the defect.** Third instance of F489 in this file.
 *
 * The heights divide `AREA_ROWS` rather than naming a number, so the table
 * cannot go stale the next time the grid changes without a compile error.
 */
const MARKER_TIER: readonly (readonly [number, number])[] = Object.freeze([
  [4, AREA_ROWS], // near — two cells across, one down
  [2, AREA_ROWS], // mid — one cell each way
  [2, AREA_ROWS / 2], // far — one cell across, half a cell down
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
  /**
    * `px`/`py` are the sample's own coordinates and `from` is the previous
    * painted sample of the same stroke, or `null` at its start — everything a
    * **mask** needs, because a direction belongs to the step rather than to the
    * cell (C12 I102).
    */
  paint: (
    i: number, mark: string, ink: ColourValue | undefined,
    px: number, py: number, from: readonly [number, number] | null, nearer: boolean,
  ) => void,
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
    // **`true`, and it is the mask's rule rather than the colour's** (C12 I102,
    // §3am). The frame is one connected figure — a box edge meets an axis line,
    // an axis line meets its own ticks — and every one of those meetings is two
    // strokes arriving at one cell at the same depth. Painted only on strictly
    // nearer, the second is refused and the frame draws as a scatter of stubs,
    // which is what it did. The **colour** rule is unchanged: `paint` is told
    // which it was and gives the cell away on a tie, so F452's ordering stands.
    let from: readonly [number, number] | null = null;
    strokeSeg(p.a, p.b, grid, depth, (i, _t, _z, nearer, px, py) => {
      paint(i, mark, ink, px, py, from, nearer);
      from = [px, py];
    }, true);
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
      let from: readonly [number, number] | null = null;
      strokeSeg(p.a, p.b, grid, depth, (i, _t, _z, nearer, px, py) => {
        paint(i, mark, ink, px, py, from, nearer);
        from = [px, py];
      }, true);
    }
    if (extent < EDGE_ON) continue;
    const [lo, hi] = spanOf(scene.lo, line.axis);
    for (const t of ticks3(line.axis, line, lo, hi, spec, spec?.format ?? block.yFormat)) {
      const pt = clipProject(scene.basis, { a: t.on, b: t.out });
      if (pt !== null) {
        const mark = frameMark(pt.a, pt.b, ctx);
        let tickFrom: readonly [number, number] | null = null;
        strokeSeg(pt.a, pt.b, grid, depth, (i, _t, _z, nearer, px, py) => {
          paint(i, mark, ink, px, py, tickFrom, nearer);
          tickFrom = [px, py];
        }, true);
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
export function plot3dArea(
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
  // **`auto` rasterises at the *dot* grid and composes at both** (C12 I103).
  // A half-block sample is exactly four braille samples, so one buffer at the
  // finer resolution serves a surface and a line at once — and the choice of
  // rung stops being a property of the block and becomes a property of the
  // **primitive**, which is what F431 measured and never applied: a line is
  // outline all the way through and a surface is 89–96% interior.
  // **`width × 2` by `height × 8`, and the eight is the alphabet's** (C12
  // I105). A cell's silhouette is drawn from the block elements, which offer
  // **nine** levels along an axis — `▁▂▃▄▅▆▇█` and their colour-swapped
  // reflections — and a grid that samples four can only ever quantise to
  // quarters. The alphabet and the sampling have to agree or the finer glyphs
  // are decoration.
  //
  // Braille folds row pairs back to its own `2 × 4`, so a line is unchanged: a
  // diagonal lights one sample a row at either resolution and folds to the same
  // four dot rows.
  const grid =
    sub ? sampleGrid(w, rows)
    : { width: w, height: rows };
  // **The aspect is the sample's, and the two arms disagree about it.** A
  // terminal cell is `CELL_ASPECT` times taller than it is wide; a half-block
  // sample is half a cell tall, so it is square and the aspect is the plain
  // grid ratio. A glyph-arm sample is a whole cell, so the ratio is divided by
  // the cell's own. Getting this wrong draws a sphere as an ellipse, which is
  // the one distortion a reader reads as data.
  // **Derived from the grid, not from the arm** (C12 I105, F495).
  //
  // This read `sub ? 1 : CELL_ASPECT` — a sample is square on the sub-cell arms
  // and a whole cell on the glyph arm — and both halves were true while the
  // sub-cell grid was `2 × 4`: half a cell wide by a quarter of `CELL_ASPECT`
  // tall is square. **Taking the area grid to `2 × 8` made the sample `2 : 1`
  // and the constant a lie**, so the projection squashed and the surface stopped
  // meeting the box drawn around it. Found by someone noticing the Gaussian's
  // lower edges did not line up with its own bounds — the two are drawn from one
  // basis, so a disagreement between them can only be the basis.
  //
  // Stated as arithmetic instead: a sample is `1 / sx` of a cell across and
  // `CELL_ASPECT / sy` down, so its own ratio is `CELL_ASPECT · sx / sy`. That
  // gives `2` on the glyph arm, `1` at `2 × 4` and `0.5` at `2 × 8` — every arm
  // this file has had, from one expression that cannot go stale.
  const sx = grid.width / w; // cells-ok — samples across a cell
  const sy = grid.height / rows; // cells-ok — samples down a cell
  const aspect = grid.width / (grid.height * ((CELL_ASPECT * sx) / sy));
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
  /**
   * Which **kind** of primitive owns each sample (C12 I103).
   *
   * `0` nothing · `1` an area — a marker's block or a surface's fill, which
   * compose as half blocks · `2` an outline — a polyline, a wireframe edge or
   * the reference frame, which compose as dots.
   *
   * **A parallel array rather than a flag folded into `ink`**, for `mark`'s own
   * reason two arrays along: a colour and an owner are different things, and one
   * value meaning both is the mistake `glyph` and `mark` were split to avoid.
   */
  /**
   * **A point is not a silhouette, and that is why there are three kinds**
   * (F498).
   *
   * `AREA` is a surface's fill — a *region*, whose edge is a boundary between
   * two things and wants the nine-level alphabet so the boundary lands where the
   * geometry put it. `MARK` is a point's own block — a *mark*, whose job is to
   * be seen and to be the size its tier says. Quantising a mark's coverage to
   * eighths shrinks it, and worse, makes its apparent size depend on where in
   * the cell it happens to fall: the same point drifts between a full half-block
   * and a two-eighth sliver as the camera turns, which is precisely the wobble
   * the tier table exists to prevent.
   *
   * They shared `AREA` because until the silhouette alphabet existed nothing
   * downstream could tell them apart — one kind was enough while one rule
   * served both. **An invariant is vacuous until its subject exists**, and the
   * day the subject arrived the sharing became a defect with no assertion
   * against it.
   */
  const AREA = 1;
  const OUTLINE = 2;
  const MARK = 3;
  const kind = new Uint8Array(grid.width * grid.height); // cells-ok — a sample count

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
  /**
   * The frame's own mask and its colour, a cell each (C12 I102).
   *
   * **Separate from the data's `bits`**, because the two answer different
   * questions in one cell: the data's mask is the caller's wireframe and the
   * frame's is the reference frame, and a cell holding both must draw the data
   * — `glyphRows`' precedence, and *the axes never occlude the data* (I90).
   * Merging them would make that decision unmakeable.
   */
  const frameBits: number[] = new Array<number>(w * rows).fill(0); // cells-ok — a cell count
  const frameInkAt: (Style | undefined)[] =
    new Array<Style | undefined>(w * rows).fill(undefined); // cells-ok — a cell count

  const at = (target: number[], cx: number, cy: number, b: number): void => {
    if (cx < 0 || cy < 0 || cx >= w || cy >= rows) return; // cells-ok — a bound
    target[cy * w + cx] = (target[cy * w + cx] ?? 0) | b; // cells-ok — a cell offset
  };
  /** One axis-aligned move: the edge it leaves by and the edge it arrives at. */
  const stepInto = (target: number[], ax: number, ay: number, bx: number, by: number): void => {
    if (bx > ax) { at(target, ax, ay, LINE_RIGHT); at(target, bx, by, LINE_LEFT); }
    else if (bx < ax) { at(target, ax, ay, LINE_LEFT); at(target, bx, by, LINE_RIGHT); }
    else if (by > ay) { at(target, ax, ay, LINE_DOWN); at(target, bx, by, LINE_UP); }
    else if (by < ay) { at(target, ax, ay, LINE_UP); at(target, bx, by, LINE_DOWN); }
  };
  const step = (ax: number, ay: number, bx: number, by: number): void =>
    { stepInto(bits, ax, ay, bx, by); };
  /**
   * The frame's link — **no depth test, because `strokeSeg` already ran one**.
   * The data's `link` tests the corner it routes through; here the two cells
   * are both samples the frame won, so the corner between them is only reached
   * when the two differ on both axes, and it takes the same horizontal-first
   * decomposition for the same reason: a diagonal claiming both axes in both
   * cells draws a staircase of `┼`.
   */
  const linkInto = (target: number[], fx: number, fy: number, cx: number, cy: number): void => {
    if (fx === cx && fy === cy) return;
    if (fx !== cx && fy !== cy) { stepInto(target, fx, fy, cx, fy); stepInto(target, cx, fy, cx, cy); }
    else stepInto(target, fx, fy, cx, cy);
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

  const frameStyle: Style = slot("tone.muted", ctx.theme, ctx.capabilities);
  const frameInk = frameStyle.colour;
  // **A focused plot3d lights its frame** (C26 §7, C12 §3al). The frame is this
  // file's and not `furniture.ts`'s, so `Layout.focused` cannot carry it; the
  // focus is read here, where the frame's ink is chosen, and it is the id the
  // session writes — `rowId` is the element's id and a plot's element is its
  // block (`elements()`, `focusFor`). Two inks rather than one flag: the lines
  // take `lineInk` and `overlay` takes `frameInk` for the labels, because the
  // scale keeps `muted` while the enclosure lights up, as the 2-D frame's does.
  const focus = ctx.focus;
  const focused = focus !== null && focus.blockId === block.id && focus.rowId === block.id;
  const lineStyle: Style = focused ? slot("tone.accent", ctx.theme, ctx.capabilities) : frameStyle;
  const lineInk = lineStyle.colour;

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
      const [bw, bh] = MARKER_TIER[tier] as readonly [number, number];
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
            kind[py * grid.width + px] = MARK; // cells-ok — a sample offset
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
      kind[i] = OUTLINE;
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
      // **A wireframe edge is an outline and a fill is an area**, on the same
      // surface and often in the same cell (C12 I103). `sm.edge` is the fill's
      // own sample rather than a second stroke (I95), so the distinction costs
      // nothing here and is what lets a cage draw in dots over a shaded face.
      kind[i] = sm.edge ? OUTLINE : AREA;
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
  // **The frame is cell resolution on every arm, so its mask is too** (C12
  // I102). `link` works in cells and the frame's samples are the grid's, so the
  // conversion is here — one division rather than a second mask at each rung.
  const cellOf = (px: number, py: number): readonly [number, number] =>
    [Math.floor((px * w) / grid.width), Math.floor((py * rows) / grid.height)]; // cells-ok — a cell coordinate
  const labels = frameOf(block, scene, grid, { w, rows }, depth, ctx, (i, m, axisInk, px, py, from, nearer) => {
    // **A tie with the data is still the data's** (C12 I102, F452). The frame
    // paints on equal-or-nearer so that its *own* meetings join — a box edge
    // against an axis line, an axis line against its own tick, every one of
    // them two strokes arriving at one cell at one depth. It must not take a
    // cell tied with a *carrier*, which is what drawing last is for, and the
    // owner of the sample already sitting there is exactly what `mark` records.
    if (!nearer && mark[i] === undefined) return;
    // **The mask carries the frame now, on every arm** (C12 I102). One
    // directional glyph a cell cannot draw a diagonal: a projected box edge
    // stepped `─` at successive rows and read as a dashed staircase, and a tick
    // meeting its axis wrote over the axis instead of joining it. Both are the
    // same defect and the mask answers both — `┬ ┴ ├ ┤` fall out of the four
    // bits rather than being cases.
    const [cx, cy] = cellOf(px, py);
    if (from !== null) {
      const [fx, fy] = cellOf(from[0], from[1]);
      linkInto(frameBits, fx, fy, cx, cy);
    }
    // **The axis's own tone where it has one** (C12 I98). The box and the
    // untoned axes keep `frameInk`, which is what makes a single coloured axis
    // read as one axis rather than as a recoloured frame.
    ink[i] = axisInk ?? lineInk;
    frameInkAt[cy * w + cx] = axisInk === undefined ? lineStyle : { ...lineStyle, colour: axisInk }; // cells-ok — a cell offset
    mark[i] = m;
    kind[i] = OUTLINE;
    // **And the tier code is cleared with it.** `glyphRows` reads `glyph`
    // before `mark`, so a frame cell that won a marker's sample would draw the
    // marker in the frame's colour — a defect the old order could not have,
    // and the one thing reordering had to carry with it.
    glyph[i] = -1;
  });

  /**
   * The frame, as the compose steps see it — **one glyph a cell, resolved from
   * four bits** (C12 I102). Every arm takes the same object, because the frame
   * is furniture and furniture is cell resolution on all of them: its labels
   * already were, and its lines had no reason not to be.
   */
  const frame = {
    bits: frameBits,
    ink: frameInkAt,
    corners: block.plotCorners ?? "rounded",
  } as const;
  const composed =
    half ? mixedRows(ink, depth, kind, w, rows, ctx)
    : arm === "braille" ? brailleRows(ink, depth, mark, frame, w, rows, ctx)
    : glyphRows(ink, glyph, mark, frame, masked ? bits : undefined, w, rows, ctx);
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
/**
 * The lower blocks, `0/8` to `8/8` — nine levels of a horizontal edge (C12 I105).
 *
 * **Swapping the colours reflects the family**, which is why there is no upper
 * set to declare: to fill the top `k/8`, draw `LOWER[8 - k]` with the
 * foreground and background exchanged. Unicode has `▀` and `▔` upward and
 * nothing between them, and it does not need to.
 */
const LOWER: readonly string[] = Object.freeze([
  " ", "\u2581", "\u2582", "\u2583", "\u2584", "\u2585", "\u2586", "\u2587", "\u2588",
]);

/** The left blocks, `0/8` to `8/8` — the same nine levels for a vertical edge. */
const LEFT: readonly string[] = Object.freeze([
  " ", "\u258F", "\u258E", "\u258D", "\u258C", "\u258B", "\u258A", "\u2589", "\u2588",
]);

/**
 * A silhouette cell's glyph, from the **direction of its edge and the fraction
 * it covers** (C12 I105).
 *
 * **The jaggedness was quantisation, not shape.** A shallow edge crossing a run
 * of cells covers 0.40 of one, 0.45 of the next, 0.55 of the third — and an
 * alphabet with two levels rounds those to nothing, nothing, half, so the run
 * flips back and forth and reads as serration. Nine levels put each cell within
 * a sixteenth of the truth, and the flipping stops because the rounding error
 * stops being comparable to the step.
 *
 * **One family for the whole run, and that is the ruling** (F496). The first
 * draft classified each cell — eighths where the two columns agreed to within
 * one sample, the left blocks where one column was nearly full, the quadrant
 * mask for everything between. Measured on a Gaussian it drew **three** eighths
 * and a hundred and five full cells: a silhouette sloping half a row per column
 * puts about four samples between its two columns, so the eighths gate never
 * fired and every edge cell fell to a quadrant. That is a **half**-cell
 * staircase standing in for a ninth-cell one, and it is the whole of what the
 * edges were doing wrong.
 *
 * The repair is not a better classifier. **A silhouette is read as a line, and
 * no per-cell rule can see one** — the same finding as F492's corduroy and
 * F494's serration, arriving a third time. Two families alternating cell to cell
 * read as noise even where each cell is individually the closer fit, because the
 * eye integrates the run and the two families quantise on different ladders.
 *
 * So: **`round(total / 2)` is the mean height of the boundary across the cell**,
 * which makes the drawn area equal to the covered area. Area-preserving is what
 * reconstructs the line: the integral is right in every cell, so the boundary
 * tracks the truth to within a sixteenth and a straight edge draws as a
 * monotone ramp rather than a stair. The only cell this cannot describe is one
 * whose boundary never crosses a side wall — a genuinely vertical edge — and
 * that is the single case taken out first.
 *
 * **The two columns are asymmetric on purpose.** A cell is twice as tall as it
 * is wide, so eight rows and two columns is close to square sampling — and the
 * edges that offend most are the shallow ones, which is exactly where the extra
 * rows go.
 */
function areaGlyph(
  cols: readonly [number, number],
  rowsCovered: readonly number[],
  near: ColourValue | undefined,
  behind: ColourValue | undefined,
  /**
   * The plot's own ground — **what the *uncovered* part of a swapped cell is
   * painted in** (C12 I105).
   *
   * Unicode's block elements run one way: `▁▂▃▄▅▆▇` fill from the **bottom**,
   * and upward there is `▀` and `▔` and nothing between. So a cell whose covered
   * mass sits at the *top* is drawn as its complement with the two colours
   * exchanged — and the exchange needs a colour for the empty half. Left
   * undefined it inherits the terminal's foreground, which is how a Gaussian's
   * base came out streaked with **white**: the whole lower silhouette is
   * top-mass cells, and every one of them painted its empty half in the default
   * ink. Read off the frame; no assertion about coverage could have said it.
   */
  ground: ColourValue | undefined,
): Readonly<{ text: string; fg: ColourValue | undefined; bg: ColourValue | undefined }> {
  const [left, right] = cols;
  const total = left + right; // cells-ok — a sample count
  if (total === 0) return { text: " ", fg: undefined, bg: undefined };

  // **The vertical edge, taken out first because it is the one exception** — and
  // decided by comparing the two spreads rather than by a threshold, because a
  // threshold is what put the eighths out of reach in the first place.
  //
  // A boundary is describable along the axis it varies *least* in. Across the
  // cell it varies by `|left - right|` of `AREA_ROWS`; down the cell it varies by
  // the spread of the row widths, of `BRAILLE_DOTS.x`. Normalise both to the
  // cell and take the smaller: a shallow edge holds its height and draws in the
  // eighths, a vertical one holds its *x* and draws as `▌`, and neither reading
  // is a threshold anyone has to tune. A tie goes to the eighths, which is the
  // finer ladder.
  //
  // Two columns of sampling give the halves and nothing finer, which is honest:
  // `▏▎▍` describe positions this grid cannot resolve, and drawing one would be
  // inventing precision. The eighths of `LEFT` are there for the day the
  // horizontal sampling is worth raising — and F496 says what that costs, since
  // the braille outlines fold out of the same buffer and a shallow line at four
  // samples a row folds to two lit dots where it should light one.
  let widest = 0;
  let narrowest: number = BRAILLE_DOTS.x; // cells-ok — a sample count
  for (let r = 0; r < AREA_ROWS; r += 1) { // cells-ok — a sample index
    const wRow = rowsCovered[r] ?? 0; // cells-ok — a sample count
    if (wRow > widest) widest = wRow; // cells-ok — a sample count
    if (wRow < narrowest) narrowest = wRow; // cells-ok — a sample count
  }
  const acrossCell = Math.abs(left - right) * BRAILLE_DOTS.x; // cells-ok — a sample count
  const downCell = (widest - narrowest) * AREA_ROWS; // cells-ok — a sample count
  if (acrossCell > downCell) { // cells-ok — a sample count
    return left > right
      ? { text: LEFT[BRAILLE_DOTS.x * 2] as string, fg: near, bg: behind } // cells-ok — a sample count
      : { text: LEFT[BRAILLE_DOTS.x * 2] as string, fg: behind ?? ground, bg: near }; // cells-ok — a sample count
  }

  // **Everything else is the mean height, in the eighths.** No second family and
  // no arbitration: whatever this costs a single cell, it is paid consistently
  // along the run, and consistency is what the eye reads as a straight edge.
  const level = Math.round(total / 2); // cells-ok — a sample count
  if (level <= 0) return { text: " ", fg: undefined, bg: undefined };
  if (level >= AREA_ROWS) return { text: LOWER[AREA_ROWS] as string, fg: near, bg: behind };
  // Which end the covered mass sits at — the same count, read from the rows.
  let lowHalf = 0;
  for (let r = AREA_ROWS / 2; r < AREA_ROWS; r += 1) lowHalf += rowsCovered[r] ?? 0; // cells-ok — a sample count
  const atBottom = lowHalf * 2 >= total; // cells-ok — a sample count
  return atBottom
    ? { text: LOWER[level] as string, fg: near, bg: behind }
    : { text: LOWER[AREA_ROWS - level] as string, fg: behind ?? ground, bg: near };
}

/**
 * The sixteen 2×2 masks, by which sub-cells the **foreground** covers.
 *
 * Bit 1 upper-left, 2 upper-right, 4 lower-left, 8 lower-right — `linedraw.ts`'
 * `quadrantGlyph` order, read rather than re-derived, because a second copy of a
 * bit order is a second place for a picture to come out transposed and every
 * count-based assertion agrees with a transpose.
 *
 * **`▀` is `0b0011` and that is the whole argument for this table.** The
 * half-block raster is not an alternative to the quadrant one, it is a *member*
 * of it: where the best two-colour split of a cell is top-against-bottom this
 * picks `▀` and the frame does not move, and where the split runs diagonally it
 * picks `▚` or `▙` and a silhouette stops being a staircase. Same block, same
 * `East_Asian_Width=Ambiguous` arm, same `colourDepth >= 8` floor — the
 * alphabet costs nothing the incumbent did not already cost.
 */
// The table itself is `linedraw.ts`'s `QUADRANTS` — the same sixteen strings in
// the same bit order, held once (C12 I104).

/**
 * **The triangles were tried and they are not here** (C12 I104, F494).
 *
 * `◢ ◣ ◤ ◥` give a true hypotenuse where a quadrant mask can only step, they
 * are BMP, and the mono face covers all four — every capability argument was in
 * their favour. Scored against the surface's own 2×4 coverage with the staircase
 * as the floor, a triangle was drawn only where it fitted strictly better, so it
 * could not lose area to its neighbours.
 *
 * **It still came out serrated, and the reason is not per-cell.** A silhouette's
 * smoothness is a property of a *run* of cells: a staircase is read as a line
 * because every step is the same, and one triangle inside that run cuts a corner
 * the eye was using to follow it. Measured on a Gaussian dome, four cells of a
 * 168-cell figure took a triangle — enough to chip the edge in four places and
 * nowhere near enough to change its character.
 *
 * **The fix would be a run-length decision and not a bigger table**, which is a
 * different algorithm: fit a line across several cells, then distribute the
 * glyphs along it. Recorded here rather than deleted silently, because the next
 * reader will have the same idea and the capability arguments will still all be
 * in its favour.
 */


/**
 * The default rung — **dots for what is outline, half blocks for what is
 * interior, in one cell** (C12 I103).
 *
 * **This is F431's measurement applied per primitive, which is what it was
 * always about and never how it was used.** That finding chose the half block
 * because a *surface* is 89–96% interior, so the dot grid stipples over a colour
 * the cell was going to paint anyway; F482 asked the same question at the other
 * primitive and found an outline figure spends the half rung's second colour on
 * 5.6%–31.1% of its cells. Both are true and neither is about a *block*: the
 * answer differs by what is being drawn, and a `plotStyle` that picks one rung
 * for a whole figure was answering a question nobody has.
 *
 * **One buffer, because a half-block sample is exactly four braille samples.**
 * Everything rasterises at `width × 2` by `height × 4`; a surface's colour for
 * the upper half block is the nearest of its **eight** upper samples and the
 * lower half its eight lower ones, which is the same averaging `halfBlockRows`
 * does one component over.
 *
 * **A cell holding both draws the outline over the area.** The dots take the
 * glyph and the line's colour; the surface's colour becomes the **background**,
 * so a wireframe over a shaded face reads as a cage in front of it rather than
 * as a hole in it. One of the two half-block colours is lost in that cell, which
 * is the whole of what the mixing costs and is why it is stated here rather than
 * left to be discovered.
 */
function mixedRows(
  ink: readonly (ColourValue | undefined)[],
  depth: Depth,
  kind: Uint8Array,
  w: number,
  rows: number,
  ctx: RenderContext,
): readonly (readonly Span[])[] {
  // The plot's ground, for the cells whose glyph is drawn inverted.
  const ground = slot("surface.bg", ctx.theme, ctx.capabilities).colour;
  const AREA = 1;
  const OUTLINE = 2;
  const MARK = 3;
  // **Braille folds the eight rows back to its own four** (C12 I105). The area
  // alphabet needs eight levels a cell and braille has four dot rows; one grid
  // serves both because a line lights the same dot rows either way — a diagonal
  // takes one sample a row at both resolutions and folds to the same four.
  const fold = AREA_ROWS / BRAILLE_DOTS.y; // cells-ok — a sample count
  const dots = createGrid(w * BRAILLE_DOTS.x, rows * BRAILLE_DOTS.y); // cells-ok — a dot count
  for (let y = 0; y < depth.height; y += 1) { // cells-ok — a sample index
    for (let x = 0; x < depth.width; x += 1) { // cells-ok — a sample index
      if (kind[y * depth.width + x] === OUTLINE) { // cells-ok — a sample offset
        setDot(dots, x, Math.floor(y / fold)); // cells-ok — a sample coordinate
      }
    }
  }
  const folded = foldBraille(dots);

  // **The one construction in the plot arm that sets a background** — the other
  // is `sankey.ts`'s `cell`, and the two are what I21's picture-cell admission
  // is about (C10 §4c.1). The check is on the background arm alone: a glyph
  // drawn as ink on the page is §4's own case and needs no admission, while a
  // glyph over a painted region needs to be a **fill** rather than something a
  // reader reads. `assertPictureGlyph` is that condition, and it replaces the
  // one I21 used to state — *the cell carries no text* — which was false of
  // every cell here, all of them braille, quadrants or block elements.
  const span = (glyph: string, colour: ColourValue | undefined, bg?: ColourValue): Span => {
    if (colour === undefined && bg === undefined) return { text: glyph };
    if (bg === undefined) return { text: glyph, style: colour === undefined ? {} : { colour } };
    assertPictureGlyph(glyph, "plot3d mixedRows");
    return { text: glyph, style: colour === undefined ? { background: bg } : { colour, background: bg } };
  };

  /** The nearest sample of a kind in a rectangle of the grid, by colour. */
  /**
   * The nearest drawn sample's colour in a rectangle, among the kinds asked for.
   *
   * **A set rather than one kind** (F498): a cell can hold a point standing in
   * front of a surface, and the half-block rule that draws marks has to colour
   * each half from whatever won those samples — asking for `MARK` alone would
   * leave the surface behind it black.
   */
  const nearestOf = (
    x0: number, y0: number, x1: number, y1: number, ...wants: readonly number[]
  ): ColourValue | undefined => {
    let best = Infinity;
    let out: ColourValue | undefined;
    let found = false;
    for (let y = y0; y < y1; y += 1) { // cells-ok — a sample index
      for (let x = x0; x < x1; x += 1) { // cells-ok — a sample index
        if (x >= depth.width || y >= depth.height) continue;
        const i = y * depth.width + x; // cells-ok — a sample offset
        if (!wants.includes(kind[i] as number)) continue;
        const z = depth.z[i] as number;
        if (!Number.isFinite(z) || z >= best) continue;
        best = z;
        out = ink[i];
        found = true;
      }
    }
    return found ? out : undefined;
  };

  const out: Span[][] = [];
  for (let r = 0; r < rows; r += 1) { // cells-ok — a row index
    const glyphRow = [...(folded[r] ?? "")];
    const line: Span[] = [];
    for (let c = 0; c < w; c += 1) { // cells-ok — a column index
      const x0 = c * BRAILLE_DOTS.x; // cells-ok — a sample coordinate
      const x1 = x0 + BRAILLE_DOTS.x; // cells-ok — a sample coordinate
      const yTop = r * AREA_ROWS; // cells-ok — a sample coordinate
      const yMid = yTop + AREA_ROWS / 2; // cells-ok — a sample coordinate
      const yBot = yTop + AREA_ROWS; // cells-ok — a sample coordinate

      // **Counted before anything is decided** (F497). The count used to be
      // taken *after* the outline branch, which is what let a cell holding one
      // covered sample of sixteen be painted entirely in the fill colour.
      const xMid = x0 + BRAILLE_DOTS.x / 2; // cells-ok — a sample coordinate
      const perRow: number[] = [];
      let left = 0;
      let right = 0;
      let markTop = 0;
      let markBottom = 0;
      for (let dy = 0; dy < AREA_ROWS; dy += 1) { // cells-ok — a sample index
        let inRow = 0;
        for (let dx = 0; dx < BRAILLE_DOTS.x; dx += 1) { // cells-ok — a sample index
          const sx = x0 + dx; // cells-ok — a sample coordinate
          const sy = yTop + dy; // cells-ok — a sample coordinate
          if (sx >= depth.width || sy >= depth.height) continue;
          const k = kind[sy * depth.width + sx]; // cells-ok — a sample offset
          if (k === MARK) { // cells-ok — a sample count
            if (dy * 2 < AREA_ROWS) markTop += 1; else markBottom += 1; // cells-ok — a sample count
            continue;
          }
          if (k !== AREA) continue;
          inRow += 1; // cells-ok — a sample count
          if (sx < xMid) left += 1; else right += 1; // cells-ok — a sample count
        }
        perRow.push(inRow);
      }
      const marks = markTop + markBottom; // cells-ok — a sample count
      // **An outline wins the cell, and the fill only backs it if it owns the
      // cell** (F497).
      //
      // This is where the eighths were being skipped, and the frame said so
      // before any rule did: the box's braille runs *along* the dome's lower
      // silhouette, so a run of edge cells took this branch while their
      // neighbours took the eighths, and the two draw incompatible pictures —
      // one puts the boundary at a ninth of a cell, the other has no boundary at
      // all. Out-of-place jaggedness, in exactly the spots where a line crosses
      // an edge.
      //
      // A cell carries one background, so the choice is binary and the honest
      // rule is **majority**: the fill backs the dots when it owns at least half
      // the cell, and otherwise the ground does. That puts the worst case at
      // half a cell instead of a whole one, and — more to the point — it stops a
      // single covered sample from advertising a full cell of surface.
      const glyph = glyphRow[c] ?? " ";
      if (glyph.codePointAt(0) !== BRAILLE_BLANK && glyph !== " ") {
        const owns = (left + right + marks) * 2 >= AREA_ROWS * BRAILLE_DOTS.x; // cells-ok — a sample count
        line.push(span(
          glyph,
          nearestOf(x0, yTop, x1, yBot, OUTLINE),
          owns ? nearestOf(x0, yTop, x1, yBot, AREA, MARK) : undefined,
        ));
        continue;
      }

      // **A mark keeps the half block** (F498). Its size is the tier's ruling
      // and not the cell's arithmetic, so it is drawn from which *halves* it
      // reaches — the rule this file used before the silhouette alphabet, kept
      // for the primitive that alphabet was never about.
      //
      // Both colours come from `AREA` as well as `MARK`, because a point in
      // front of a surface owns only the samples it won and the rest of the
      // cell is still surface. Asking for `MARK` alone would punch the fill out
      // around every near point.
      if (marks > 0) { // cells-ok — a sample count
        const above = markTop > 0 || left + right > 0 ? // cells-ok — a sample count
          nearestOf(x0, yTop, x1, yMid, AREA, MARK) : undefined;
        const below = markBottom > 0 || left + right > 0 ? // cells-ok — a sample count
          nearestOf(x0, yMid, x1, yBot, AREA, MARK) : undefined;
        if (above === undefined && below === undefined) { line.push({ text: " " }); continue; }
        if (below === undefined) { line.push(span(QUADRANTS[3] as string, above)); continue; }
        if (above === undefined) { line.push(span(QUADRANTS[12] as string, below)); continue; }
        line.push(span(QUADRANTS[3] as string, above, below));
        continue;
      }
      if (left + right === 0) { line.push({ text: " " }); continue; } // cells-ok — a sample count

      // **A full cell is a gradient and keeps the half block**, which is the
      // ruling F492 settled: a raster is read as a field, and a horizontal split
      // tiles into one where a vertical split reads as corduroy.
      if (left + right === AREA_ROWS * BRAILLE_DOTS.x) { // cells-ok — a sample count
        line.push(span(
          QUADRANTS[3] ?? " ",
          nearestOf(x0, yTop, x1, yMid, AREA),
          nearestOf(x0, yMid, x1, yBot, AREA),
        ));
        continue;
      }

      // **The background is what is behind, not the terminal's** (C12 I105).
      // A silhouette cell used to leave it unset, so a nearer surface partly
      // covering a cell dropped whatever was behind it and punched a hole —
      // which is the overlap case, and it is the same defect as the gaps. The
      // depth buffer already holds the answer: the nearest thing among the
      // samples the front object did not take.
      const q = areaGlyph(
        [left, right],
        perRow,
        nearestOf(x0, yTop, x1, yBot, AREA),
        nearestOf(x0, yTop, x1, yBot, OUTLINE),
        ground,
      );
      line.push(q.text === " " ? { text: " " } : span(q.text, q.fg, q.bg));
    }
    out.push(line);
  }
  return out;
}

/**
 * The reference frame as a **mask**, one glyph a cell (C12 I102).
 *
 * **Furniture is cell resolution on every arm**, which its labels already were
 * and its lines had no reason not to be. What it replaces is one directional
 * glyph a sample — `│` or `─` by dominant screen direction — which cannot draw
 * a diagonal: a projected box edge stepped `─` at successive rows and read as a
 * dashed staircase, and a tick meeting its axis overwrote the axis instead of
 * joining it. `┬ ┴ ├ ┤ ┼` fall out of the four bits rather than being cases.
 */
type Frame = Readonly<{
  bits: readonly number[];
  /**
   * The whole `Style` a cell, not its colour (F803). At 1-bit a slot resolves to
   * a weight and no colour — `muted` is dim, `accent` bold — and a frame that
   * kept only `.colour` had nothing for focus to change there while the 2-D
   * frame went dim to bold (F34). The data raster keeps a `ColourValue` a
   * sample: a mark is a colour or nothing, and the half arm has a colour floor.
   */
  ink: readonly (Style | undefined)[];
  corners: "rounded" | "sharp";
}>;

/** The frame's glyph for a cell, or `undefined` where it drew nothing. */
function frameGlyph(frame: Frame, i: number, ctx: RenderContext): string | undefined {
  const m = frame.bits[i] ?? 0; // cells-ok — a cell offset
  return m === 0 ? undefined : glyphForMask(m, frame.corners, ctx.capabilities);
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
  frame: Frame,
  w: number,
  rows: number,
  ctx: RenderContext,
): readonly (readonly Span[])[] {
  // **The sample grid is eight rows a cell and braille has four** (F498). This
  // loop wrote sample row `y` into dot row `y`, which was an identity while the
  // two agreed and became a **doubling** the moment the silhouette alphabet took
  // the grid to `AREA_ROWS`: the top half of the figure drawn at twice its
  // height, the bottom half past the end of the grid and silently dropped.
  //
  // `setDot` refuses an out-of-range dot rather than throwing, so the arm went
  // on rendering — a tall stippled sliver where the figure had been, and no
  // assertion between here and the frame that could tell. **The same fold
  // `mixedRows` applies**, read from the same two constants, because a second
  // spelling of a fold is a second place for the two to drift.
  const fold = AREA_ROWS / BRAILLE_DOTS.y; // cells-ok — a sample count
  // **A frame sample is a hole where the data surrounds it, and the frame's own
  // line where it does not** (F499).
  //
  // The frame's samples are kept out of the dot grid so the axis is not drawn
  // twice — once as dots here and once as its own glyph. But that glyph is only
  // drawn in a cell **with no data dots**, so in a cell that has some, the
  // exclusion pays for a glyph nothing will draw: a z axis standing in front of
  // a dome is one sample column of every cell for the figure's whole height, and
  // took a black stripe out of it from peak to base. Every cell of that stripe a
  // correct `⢸`, every colour right, the extent unchanged — **no count-based
  // assertion sees it**, and only the picture is wrong.
  //
  // Two wrong repairs before this one, and each named the axis this rule needs:
  //
  // - *Any cell with data draws at full density.* Right for the stripe, wrong
  //   for a tick crossing a fringe cell — there the frame's samples are a line,
  //   and drawing them as data painted the box's edge green, detached from the
  //   body, at every place a tick met the silhouette.
  // - *Fill where the cell would have been full.* Circular: it judges the data's
  //   footprint using the frame's own samples. Along the dome's front corner the
  //   box edge runs **on** the silhouette, so the fringe cells came out full and
  //   the taper `⠙⢿⣿⣿⡿⠋` was drawn as the block `⠙⣿⣿⣿⣿⠋`, while the last row —
  //   never full — kept losing its dots.
  //
  // What separates all three is neither a count nor a cell: it is whether the
  // data is on **both sides** of the sample. A hole has data either side of it;
  // a silhouette's edge has data on one; a tick in open ground has none. Tested
  // in dot coordinates rather than within the cell, because the axis is a column
  // and its neighbours are in the cells next door.
  const dots = createGrid(w * BRAILLE_DOTS.x, rows * BRAILLE_DOTS.y); // cells-ok — a dot count
  const whole = createGrid(w * BRAILLE_DOTS.x, rows * BRAILLE_DOTS.y); // cells-ok — a dot count
  const taken: [number, number][] = [];
  for (let y = 0; y < depth.height; y += 1) { // cells-ok — a sample index
    for (let x = 0; x < depth.width; x += 1) { // cells-ok — a sample index
      const i = y * depth.width + x; // cells-ok — a sample offset
      // **The frame's samples are not dots** — it draws one glyph a cell out of
      // its own mask, so lighting them would draw the axis twice. **Excluded per
      // sample and not per cell**: a cell the frame reached may still hold the
      // data's dots, and dropping all eight because one belongs to the frame
      // takes a bite out of the figure at every axis crossing.
      if (!Number.isFinite(depth.z[i])) continue;
      const dy = Math.floor(y / fold); // cells-ok — a dot coordinate
      setDot(whole, x, dy); // cells-ok — a dot coordinate
      if (mark[i] === undefined) setDot(dots, x, dy); // cells-ok — a dot coordinate
      else taken.push([x, dy]); // cells-ok — a dot coordinate
    }
  }
  // **The hole fill**, over the dots the frame took: a dot goes back only where
  // the data holds both sides of it. `whole` starts as the union and is reduced
  // to the data plus its interior holes.
  const lit = (g: typeof dots, x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < g.dotWidth && y < g.dotHeight && g.dots[y * g.dotWidth + x] === 1;
  for (const [x, y] of taken) {
    const across = lit(dots, x - 1, y) && lit(dots, x + 1, y); // cells-ok — a dot coordinate
    const down = lit(dots, x, y - 1) && lit(dots, x, y + 1); // cells-ok — a dot coordinate
    if (!across && !down) whole.dots[y * whole.dotWidth + x] = 0; // cells-ok — a dot offset
  }
  const folded = foldBraille(dots);
  const drawn = foldBraille(whole);
  const out: Span[][] = [];
  for (let r = 0; r < rows; r += 1) { // cells-ok — a row index
    const glyphRow = [...(folded[r] ?? "")];
    const drawnRow = [...(drawn[r] ?? "")];
    const line: Span[] = [];
    for (let c = 0; c < w; c += 1) { // cells-ok — a column index
      const cell = r * w + c; // cells-ok — a cell offset
      let nearest = Infinity;
      let colour: ColourValue | undefined;
      // **Every sample row the cell owns, not every dot row.** The colour and
      // the dots come from the same buffer, so this loop has to walk the cell in
      // the grid's units — `AREA_ROWS` down, `BRAILLE_DOTS.x` across — or the
      // cell takes its colour from the top eighth of itself.
      for (let dy = 0; dy < AREA_ROWS; dy += 1) { // cells-ok — a sample index
        for (let dx = 0; dx < BRAILLE_DOTS.x; dx += 1) { // cells-ok — a sample index
          const x = c * BRAILLE_DOTS.x + dx; // cells-ok — a sample coordinate
          const y = r * AREA_ROWS + dy; // cells-ok — a sample coordinate
          if (x >= depth.width || y >= depth.height) continue;
          const i = y * depth.width + x; // cells-ok — a sample offset
          const z = depth.z[i] as number;
          if (!Number.isFinite(z) || mark[i] !== undefined) continue;
          if (z < nearest) { nearest = z; colour = ink[i]; }
        }
      }
      const glyph = glyphRow[c] ?? " ";
      const framed = frameGlyph(frame, cell, ctx);
      // **The code point and not the character** (A03 SS47). A literal blank
      // braille glyph in framework text is a mark the substitution table cannot
      // reach; `foldBraille` emits `0x2800 + mask`, so the empty cell is the
      // mask being zero and that is what to say.
      if (glyph.codePointAt(0) !== BRAILLE_BLANK) {
        // **Fill the hole; do not adopt the line** (F499).
        //
        // The first cut said *any data at all draws at full density*, which is
        // right for a full cell with a column punched out of it and wrong for a
        // fringe cell with an axis crossing it — there the frame's samples are a
        // **line**, and drawing them as data paints the box's edge in the
        // surface's colour: speckle along the skirt and stray dots detached from
        // the body, at every place a tick meets the silhouette.
        //
        // `drawn` is the data plus the holes the frame punched in it, so the
        // cell draws its own footprint and nothing the frame owns.
        const solid = drawnRow[c] ?? glyph;
        line.push(colour === undefined ? { text: solid } : { text: solid, style: { colour } });
      } else if (framed !== undefined) {
        const fi = frame.ink[cell]; // cells-ok — a cell offset
        line.push(fi === undefined ? { text: framed } : { text: framed, style: fi });
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
  /**
   * The **data's** second channel — a surface's density glyph, on the arm that
   * has no colour to shade with (§6h row 12, F500).
   *
   * This parameter was lost when the reference frame was given its own
   * structure. Before that, one array carried both the data's density glyph and
   * the frame's stroke, and the local that read it was called `framed` — so
   * pulling the frame out looked like it was pulling out everything the array
   * held, and the argument was replaced rather than joined. **A shared channel
   * hides which of its consumers a change is about**, and the name had already
   * picked the wrong one.
   *
   * The cost was total and silent: a surface on the ASCII rung wrote its glyph
   * here, `glyphRows` no longer looked, and the figure came out **empty** — not
   * degraded, not coarse, blank. `SF7` says `expected 0 to be greater than 1`
   * and that is the whole of it.
   */
  mark: readonly (string | undefined)[],
  frame: Frame,
  /**
   * The mask, on the arm that has one — **and `undefined` rather than an array
   * of zeroes**, so *this arm does not use a mask* and *this cell has no edges*
   * are two states rather than one (C12 I101).
   */
  bits: readonly number[] | undefined,
  w: number,
  rows: number,
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
        // **Data, then the data's mask, then the frame's** — `glyphRows`' own
        // precedence extended by one rung (C12 I101, I102, F488). A marker
        // outranks a line through it for F452's reason, and a caller's
        // wireframe outranks the reference frame for I90's: the axes never
        // occlude the data.
        const edges = bits?.[i] ?? 0;
        if (edges !== 0) {
          const colour = ink[i];
          const drawn = glyphForMask(edges, frame.corners, ctx.capabilities);
          line.push(colour === undefined ? { text: drawn } : { text: drawn, style: { colour } });
          continue;
        }
        // **A surface's density glyph is data and outranks the frame** — the
        // rung the precedence gained, in the place the old shared array put it.
        const shaded = mark[i];
        if (shaded !== undefined) {
          // **A frame cell arrives here too** — the frame callback writes its glyph
          // into `mark` and clears `glyph`, so on this arm the box and axes are
          // drawn by this branch and not by `frameGlyph` below. Where the frame
          // owns the cell its `Style` wins, weight and all (F803); a density glyph
          // keeps the sample's colour.
          const fi = frame.ink[i]; // cells-ok — one sample a cell on this arm
          const colour = ink[i];
          line.push(
            fi !== undefined ? { text: shaded, style: fi }
            : colour === undefined ? { text: shaded }
            : { text: shaded, style: { colour } },
          );
          continue;
        }
        const framed = frameGlyph(frame, i, ctx);
        const fi = frame.ink[i]; // cells-ok — a cell offset
        line.push(
          framed === undefined ? { text: " " }
          : fi === undefined ? { text: framed }
          : { text: framed, style: fi },
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
export function plot3dRows(
  block: Plot,
  areaWidth: number,
  ctx: RenderContext,
): readonly string[] {
  return plot3dArea(block, areaWidth, ctx).map((line) => paint(line));
}
