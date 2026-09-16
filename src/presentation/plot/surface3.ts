/**
 * The shaded surface — normals, lighting and a depth-tested triangle raster
 * (C12 I94, C12 §6h, C04 I79).
 *
 * **On this rung the lighting is the picture.** The silhouette is 4–11% of the
 * samples and every interior sample is a colour (F431), so the studio light,
 * the specular and the depth attenuation are what a half-block surface is read
 * by rather than a refinement on top of an outline.
 *
 * **Two zeros run through this file and they want opposite remedies** (F456).
 * A face with **zero 3D area** has no normal, gets the zero vector back from
 * `unit`, and shades at ambient — nothing divides by its length, here or
 * anywhere, so the design note's *refuse the face* names a divide the pipeline
 * has never contained. A face with **zero projected area** has a perfectly good
 * normal — an edge-on plane's is the plane's own — and it is the *rasteriser*
 * that divides: `1/area` measures `−Infinity` and the barycentric weights come
 * back `NaN`. That one is answered by stroking rather than filling.
 *
 * **Nothing here holds state**, per C12 I11: the normals are built per render
 * beside the geometry they describe.
 */
import type { Light3, Point3, Surface3 } from "../../data/viewmodel/index.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";
import { ladderFor } from "./ramp.js";
import {
  cross,
  dot,
  NEAR,
  hypot2,
  hypot3,
  sub,
  unit,
  unitOf,
  viewDir,
  writeDepth,
  type Basis,
  type Depth,
  type Extent3,
  type Vec3,
} from "./project3.js";

/**
 * A vertex as the raster reads it. `p`, `n` and `v` are the geometry's and
 * never move; `rec`, `s` and `stamp` are the raster's own record on it (C12
 * I130) — the screen projection taken under a frame stamp, read back only
 * under that same stamp, so a projection from the last camera is never
 * reused. The object lives in the caller's scratch (I107) and nowhere else.
 *
 * **`rec` is allocated once and written in place.** A held vertex is
 * old-generation, and a fresh record stored on it every frame is a write
 * barrier and a promotion per projection — F1152's class, measured again on
 * F1166's first cut: `toScreen` self time rose while its call count fell.
 * `s` is this frame's answer: `rec` when the vertex projects, `null` when it
 * is behind the eye.
 */
/** A raster vertex as a record — what `cornersOf` and `geometryFrom` exchange with a row; the raster reads the lanes (C12 I139). */
export type Corner = Readonly<{ p: Vec3; n: Vec3; v: number | undefined }>;

/**
 * The geometry as lanes (C12 I139, F1184).
 *
 * A raster vertex is a referenced mesh vertex under smooth shading, in
 * first-reference order, and a face corner under flat; `idx` names three per
 * face. `screen` holds the per-frame record — `S_STRIDE` doubles a vertex under
 * `stamps` (C12 I130), with `SPARE` slots past the last vertex for the clip
 * path's cut vertices; `spareValue` carries those slots' values.
 */
export type Lanes = Readonly<{
  count: number;
  pos: Float64Array;
  nrm: Float64Array;
  value: readonly (number | undefined)[];
  idx: Uint32Array;
  screen: Float64Array;
  stamps: Int32Array;
  spareValue: (number | undefined)[];
}>;

export type RasterFrame = { readonly stamp: number; projected: number };

export type Geometry3 = Readonly<{ tris: readonly Tri3[]; lanes: Lanes }> & { frame: number };

export type Skin = Readonly<{ cull: 0 | 1 | -1; wire: boolean | "over" }>;

/** A face over its geometry's lanes: `idx[f · 3 … f · 3 + 2]` are its corners (C12 I139). */
export type Tri3 = Readonly<{
  f: number;
  lanes: Lanes;
  fn: Vec3;
  edges: readonly [boolean, boolean, boolean];
  series: number;
  skin: Skin;
}>;

/** The screen slot's layout (C12 I139): eight doubles a raster vertex. */
const S_STRIDE = 8;
const S_X = 0;
const S_Y = 1;
const S_VX = 2;
const S_VY = 3;
const S_VZ = 4;
const S_NX = 5;
const S_NY = 6;
const S_NZ = 7;
/** Slots past the last vertex for the clip path's cut vertices — two triangles share at most two cuts. */
const SPARE = 3;

/** The lanes for `count` raster vertices and `faces` faces, unfilled. */
function makeLanes(count: number, faces: number): Lanes {
  return {
    count,
    pos: new Float64Array(count * 3), // cells-ok — a vertex count
    nrm: new Float64Array(count * 3), // cells-ok — a vertex count
    value: new Array<number | undefined>(count).fill(undefined), // cells-ok — a vertex count
    idx: new Uint32Array(faces * 3), // cells-ok — a face count
    screen: new Float64Array((count + SPARE) * S_STRIDE), // cells-ok — a vertex count
    stamps: new Int32Array(count), // cells-ok — a vertex count
    spareValue: new Array<number | undefined>(SPARE).fill(undefined), // cells-ok — a slot count
  };
}

/** A raster vertex's value: the value list's, or a spare slot's (C12 I139). */
function valueAt(L: Lanes, k: number): number | undefined {
  return k < L.count ? L.value[k] : L.spareValue[k - L.count];
}

/** A raster vertex read back as a record — for rows and the clip path, not the raster (C12 I139). */
export function cornerAt(L: Lanes, k: number): Corner {
  const q = k * 3;
  return {
    p: { x: L.pos[q] as number, y: L.pos[q + 1] as number, z: L.pos[q + 2] as number },
    n: { x: L.nrm[q] as number, y: L.nrm[q + 1] as number, z: L.nrm[q + 2] as number },
    v: L.value[k],
  };
}

/** A face's three corners as records, in `idx` order (C12 I139). */
export function cornersOf(t: Tri3): readonly [Corner, Corner, Corner] {
  const L = t.lanes;
  const o = t.f * 3;
  return [cornerAt(L, L.idx[o] as number), cornerAt(L, L.idx[o + 1] as number), cornerAt(L, L.idx[o + 2] as number)];
}

/** A raster vertex's screen slot read back as a record (C12 I130, I139). */
export function screenAt(
  L: Lanes,
  k: number,
): Readonly<{ x: number; y: number; vx: number; vy: number; vz: number; nx: number; ny: number; nz: number }> {
  const S = L.screen;
  const o = k * S_STRIDE;
  return {
    x: S[o + S_X] as number, y: S[o + S_Y] as number,
    vx: S[o + S_VX] as number, vy: S[o + S_VY] as number, vz: S[o + S_VZ] as number,
    nx: S[o + S_NX] as number, ny: S[o + S_NY] as number, nz: S[o + S_NZ] as number,
  };
}

/** Writes a raster vertex's screen slot — for a row that places a record by hand (C12 I138, I139). */
export function placeScreen(
  L: Lanes,
  k: number,
  x: number,
  y: number,
  vz: number,
  vx = 0,
  vy = 0,
  nx = 0,
  ny = 0,
  nz = 1,
): void {
  const S = L.screen;
  const o = k * S_STRIDE;
  S[o + S_X] = x;
  S[o + S_Y] = y;
  S[o + S_VX] = vx;
  S[o + S_VY] = vy;
  S[o + S_VZ] = vz;
  S[o + S_NX] = nx;
  S[o + S_NY] = ny;
  S[o + S_NZ] = nz;
}

/**
 * A geometry from explicit corners and faces — the shape a row builds a
 * triangle in, with the normals it chooses (C12 I139). Every corner is a raster
 * vertex in order; a face normal not given is `unit(cross(b − a, c − a))`.
 */
export function geometryFrom(
  corners: readonly Corner[],
  faces: readonly (readonly [number, number, number])[],
  shape: Readonly<{
    fn?: readonly Vec3[];
    edges?: readonly (readonly [boolean, boolean, boolean])[];
    series?: number;
    skin?: Skin;
  }> = {},
): Geometry3 {
  const count = corners.length; // cells-ok — a vertex count
  const lanes = makeLanes(count, faces.length); // cells-ok — a face count
  for (let k = 0; k < count; k += 1) { // cells-ok — a vertex index
    const c = corners[k] as Corner;
    const q = k * 3;
    lanes.pos[q] = c.p.x;
    lanes.pos[q + 1] = c.p.y;
    lanes.pos[q + 2] = c.p.z;
    lanes.nrm[q] = c.n.x;
    lanes.nrm[q + 1] = c.n.y;
    lanes.nrm[q + 2] = c.n.z;
    (lanes.value as (number | undefined)[])[k] = c.v;
  }
  const skin: Skin = shape.skin ?? { cull: 0, wire: false };
  const series = shape.series ?? 0;
  const tris: Tri3[] = new Array<Tri3>(faces.length); // cells-ok — a face count
  for (let f = 0; f < faces.length; f += 1) { // cells-ok — a face index
    const face = faces[f] as readonly [number, number, number];
    const o = f * 3;
    lanes.idx[o] = face[0];
    lanes.idx[o + 1] = face[1];
    lanes.idx[o + 2] = face[2];
    const a = (corners[face[0]] as Corner).p;
    const b = (corners[face[1]] as Corner).p;
    const c = (corners[face[2]] as Corner).p;
    const fn = shape.fn?.[f] ?? unit(cross(sub(b, a), sub(c, a)));
    tris[f] = { f, lanes, fn, edges: shape.edges?.[f] ?? [true, true, true], series, skin };
  }
  return { tris, lanes, frame: 0 };
}

/** What a shaded sample hands back to whoever is composing the raster. */
/**
 * The painter, **called with the sample as scalars** (C12 I129): the sample's
 * offset, its view-space depth, its interpolated value, the series, the
 * clamped lighting `[0, 1]` — ambient is its floor and it is never zero —
 * and whether it lies on one of the caller's own edges within `EDGE_HALF` of
 * a sample (I95). No record is built per sample, which is the invariant.
 */
type Painter = (
  i: number,
  depth: number,
  value: number | undefined,
  series: number,
  intensity: number,
  edge: boolean,
) => void;

/**
 * The shading terms, and **they sum to 1 by construction** (C12 I94, F457).
 *
 * They were `0.2 / 0.8 / 0.4`, which sums to 1.4 — so the clamp below was the
 * third-largest term in the formula rather than a guard, and what it removed
 * was almost all of the specular. Measured at the specular's own maximum, where
 * the normal is the half-vector between the light and the view: ambient and
 * diffuse reach `0.9501` alone, the specular takes it to `1.3501`, and clamping
 * the intensity leaves **0.0499 of 0.4000 — 12.5%**. On viridis's mid entry
 * that is `(33, 145, 140)` against `(32, 142, 137)`, three parts in 255.
 *
 * **And clamping the colour component instead is refused by F455's mechanism.**
 * It gives a real highlight and it lets the intensity reach 1.4, where a channel
 * clips — and a clipped channel rotates hue, so viridis's field ratio falls from
 * 3.91× to 0.01× and plasma's from 9.20× to 0.00×. That is the same gamut
 * argument F455 used to kill the two-channel scheme, arriving on the scheme
 * F455 endorsed.
 *
 * **F455 measured intensities 0.2–1.0 and no document recorded the interval.**
 * These numbers make the shipped range the measured range, which is the whole
 * of why they are these numbers.
 */
const AMBIENT = 0.2;
const DIFFUSE = 0.6;
const SPECULAR = 0.2;
/** The Phong exponent. Tight, so a highlight reads as curvature rather than as a wash. */
const SHINE = 16;
/** How much the far end of the figure dims. One multiply and a free depth cue. */
const FALLOFF = 0.3;

/**
 * How near an edge a sample has to be, **in samples** (C12 I95, §6i rows 7–8).
 *
 * **The wireframe is not a second primitive and there is no depth bias**, which
 * is the ruling this constant replaces. The design note asked for *one number,
 * stated in the spec rather than tuned until it looks right* — and measured,
 * the number does not exist: `strokeSeg` floors its coordinates and steps on
 * the dominant screen axis where `fill` samples at `+0.5` centres, so an edge
 * disagrees with its **own** face by a median `1.60e-2` and a maximum
 * `4.31e-1`, against a sample row of `4.17e-2` on a figure spanning 2. Swept,
 * bias 0 draws 22.6% of edge samples, `1e-3` draws 27.6%, and the ceiling of
 * 55.4% costs `3e-1` — 15% of the whole figure's depth, which a far wireframe
 * would then punch through near geometry with (F462).
 *
 * `w0` is twice the sub-triangle's area, so `w0 / |ab|` is the perpendicular
 * distance to edge `ab` **in samples**. The edge is then the fill's own write:
 * no second rasteriser, no bias, no z-fight constructible, and hidden-line
 * removal exact rather than approximate — an edge sample is occluded exactly
 * when its face's sample is. Being in screen samples, it does not move with the
 * mesh's density.
 */
const EDGE_HALF = 0.7;

/**
 * What `wireframe: "over"` scales an edge's intensity by (C12 I95, §6i row 13).
 *
 * **A ratio and not a value, because a value cannot separate everywhere.** The
 * fill's own intensity spans `0.1332 … 0.7871` over a Gaussian, so an edge
 * pinned to any constant collides with the fill wherever the fill reaches it.
 * Halving keeps the shading and the depth attenuation on the edge and separates
 * at every intensity — worst case `0.1332` against `0.0666`, at the ambient
 * floor. On the glyph arm the same number moves the density ramp down, so one
 * rule serves both arms.
 *
 * **It applies to `"over"` alone**, because what it buys is separation from a
 * fill: under `wireframe: true` the edge *is* the surface and dimming it would
 * darken the whole picture for nothing to contrast with.
 */
const EDGE_DIM = 0.5;

/**
 * Below this the mesh's volume decides nothing (C12 I95, §6i row 5).
 *
 * A closed mesh in unit space has a volume of the same order as the cube's own
 * **8** — `unitOf` normalises the extent, so a thin closed slab measures
 * `8.0000` rather than something small — while a mesh whose winding cancels
 * itself measures `1e-15` to `1e-16`. Fifteen orders separate them, so the
 * threshold is not a tuning.
 */
const VOLUME_EPS = 1e-9;

/**
 * The studio key light, in **view** space (C04 I79).
 *
 * Up and to the right of wherever the reader is looking. A pure headlight lights
 * everything facing the reader equally, so a sphere reads as a flat disc — the
 * normal and the view direction coincide at the centre and fall off
 * symmetrically. Offset, and a terminator crosses the surface.
 */
const STUDIO: Vec3 = unit({ x: 0.5, y: 0.7, z: -1 });
const HEADLIGHT: Vec3 = { x: 0, y: 0, z: -1 };

/**
 * Where the light points **from the surface toward the source**, in view space.
 *
 * **Studio and headlight are applied after the world-to-view rotation and a
 * world-fixed light before it** — one branch, not a second code path. The
 * explicit `{ azimuth, elevation }` is the escape hatch for the case where a
 * fixed light is wanted, and it is the one that has a dead angle.
 */
export function lightDirOf(light: Light3 | undefined, basis: Basis): Vec3 {
  if (light === undefined || light === "studio") return STUDIO;
  if (light === "headlight") return HEADLIGHT;
  const ce = Math.cos(light.elevation);
  return unit(viewDir(basis, {
    x: ce * Math.cos(light.azimuth),
    y: ce * Math.sin(light.azimuth),
    z: Math.sin(light.elevation),
  }));
}

/** Every position a surface holds, in **data** space — what the extent is taken over. */
export function surfacePoints(s: Surface3): readonly Vec3[] {
  if (s.vertices !== undefined) return s.vertices;
  return gridPoints(s);
}

/** A height field's grid points, row-major, in data space. */
function gridPoints(s: Surface3): readonly Vec3[] {
  const h = s.heights;
  if (h === undefined || h.length === 0) return []; // cells-ok — a grid height
  const rows = h.length; // cells-ok — a grid height
  const cols = (h[0] as readonly number[]).length; // cells-ok — a grid width
  const [x0, x1] = s.xRange ?? [0, 1];
  const [y0, y1] = s.yRange ?? [0, 1];
  const out: Vec3[] = [];
  for (let j = 0; j < rows; j += 1) { // cells-ok — a row index
    const row = h[j] as readonly number[];
    for (let i = 0; i < cols; i += 1) { // cells-ok — a column index
      out.push({
        x: cols === 1 ? x0 : x0 + ((x1 - x0) * i) / (cols - 1), // cells-ok — a grid width
        y: rows === 1 ? y0 : y0 + ((y1 - y0) * j) / (rows - 1), // cells-ok — a grid height
        z: row[i] as number,
      });
    }
  }
  return out;
}

/**
 * A surface's triangles, **normalised, with normals** (C12 I94, §6h rows 1 and 6).
 *
 * **The normals are computed in unit space and that is a ruling** (§6h row 1).
 * The geometry a normal describes has to be the geometry on screen: computed in
 * data space, a surface a thousand times wider than it is tall shades flat while
 * drawing as a mountain range. It also means the degenerate face is made *here*
 * rather than supplied by the caller — a zero-width `xRange` collapses an axis
 * through `unitOf` and leaves **8 of 8** faces with the zero vector, measured,
 * from a mesh with perfectly good area in data space.
 *
 * **Smooth accumulates raw cross products and normalises once** (§6h row 6).
 * That is area-weighted by construction, so a zero-area face contributes
 * nothing — where averaging *unit* normals by count would let it pull its
 * neighbours toward an answer it does not have.
 */
/**
 * The triangles and the referenced vertices together (C12 I127, §6o row 15).
 *
 * **One corner per distinct referenced vertex and never one per face corner.**
 * The ramp span takes a minimum and a maximum over the set, and a minimum over
 * a multiset is the minimum over its support — so a bunny vertex on six faces
 * is projected once toward the same answer (F1154). **A vertex no face
 * references is not here**, as it was not in the corner walk this replaces: it
 * is in the extent, because `surfacePoints` returns it, and in nothing that is
 * drawn.
 */
/** `unit` over three scalars (C12 I137): `hypot3` and three divisions, or the values unchanged at zero length, as `unit` answers. */
function unit3(x: number, y: number, z: number): Vec3 {
  const n = hypot3(x, y, z);
  return n === 0 ? { x, y, z } : { x: x / n, y: y / n, z: z / n };
}

export function geometryOf(s: Surface3, extent: Extent3, series: number): Geometry3 {
  const src = surfacePoints(s);
  const count = src.length; // cells-ok — a vertex count
  const pts: Vec3[] = new Array<Vec3>(count);
  for (let k = 0; k < count; k += 1) pts[k] = unitOf(src[k] as Vec3, extent); // cells-ok — a vertex index
  const idx = facesOf(s);
  const faces = idx.length; // cells-ok — a face count
  const mask = edgeMask(s, faces);
  const skin: Skin = { cull: cullSign(s, pts, idx), wire: s.wireframe ?? false };
  const flat = s.shading === "flat";
  // **The normals in two lanes** (C12 I137, F1181). The face normal is
  // `cross(sub(b, a), sub(c, a))` written out — the same six differences and
  // six products in the same order — unnormalised, so its length is twice the
  // area and the accumulation below is area-weighted without a second term.
  // The vertex sum adds the lane's three per corner in face order, exactly as
  // the object form summed, so every double is the same double; what was
  // three objects a face and three more a face corner is two typed lanes.
  const faceN = new Float64Array(faces * 3); // cells-ok — a face count
  const vertN = new Float64Array(count * 3); // cells-ok — a vertex count
  for (let f = 0; f < faces; f += 1) { // cells-ok — a face index
    const face = idx[f] as readonly [number, number, number];
    const ia = face[0];
    const ib = face[1];
    const ic = face[2];
    const a = pts[ia] as Vec3;
    const b = pts[ib] as Vec3;
    const c = pts[ic] as Vec3;
    const ux = b.x - a.x;
    const uy = b.y - a.y;
    const uz = b.z - a.z;
    const vx = c.x - a.x;
    const vy = c.y - a.y;
    const vz = c.z - a.z;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const o = f * 3;
    faceN[o] = nx;
    faceN[o + 1] = ny;
    faceN[o + 2] = nz;
    if (!flat) {
      // Accumulated unnormalised (§6j row 7): a large face moves a shared
      // vertex's normal more than a sliver does.
      const ax = nx;
      const ay = ny;
      const az = nz;
      let q = ia * 3;
      vertN[q] = (vertN[q] as number) + ax;
      vertN[q + 1] = (vertN[q + 1] as number) + ay;
      vertN[q + 2] = (vertN[q + 2] as number) + az;
      q = ib * 3;
      vertN[q] = (vertN[q] as number) + ax;
      vertN[q + 1] = (vertN[q + 1] as number) + ay;
      vertN[q + 2] = (vertN[q + 2] as number) + az;
      q = ic * 3;
      vertN[q] = (vertN[q] as number) + ax;
      vertN[q + 1] = (vertN[q + 1] as number) + ay;
      vertN[q + 2] = (vertN[q + 2] as number) + az;
    }
  }
  const values = valuesOf(s, count);
  // **The lanes** (C12 I139): a raster vertex per referenced mesh vertex in
  // first-reference order under smooth shading — one lane index for every face
  // that names it (I130) — and one per face corner under flat, where the
  // normal is the face's. The index lane is written first so the count is
  // known before the position and normal lanes are sized.
  const slotOf = new Int32Array(count).fill(-1); // cells-ok — a vertex count
  const idxLane = new Uint32Array(faces * 3); // cells-ok — a face count
  let n = 0;
  for (let f = 0; f < faces; f += 1) { // cells-ok — a face index
    const face = idx[f] as readonly [number, number, number];
    for (let m = 0; m < 3; m += 1) { // cells-ok — a corner index
      const k = face[m] as number;
      if (flat) {
        idxLane[f * 3 + m] = n;
        n += 1;
      } else {
        let j = slotOf[k] as number;
        if (j < 0) {
          j = n;
          slotOf[k] = j;
          n += 1;
        }
        idxLane[f * 3 + m] = j;
      }
    }
  }
  const lanes = makeLanes(n, faces);
  lanes.idx.set(idxLane);
  const pos = lanes.pos;
  const nrm = lanes.nrm;
  const value = lanes.value as (number | undefined)[];
  const written = new Uint8Array(n); // cells-ok — a vertex count
  const out: Tri3[] = new Array<Tri3>(faces);
  for (let f = 0; f < faces; f += 1) { // cells-ok — a face index
    const face = idx[f] as readonly [number, number, number];
    const o = f * 3;
    // **The face normal, `unit` over the lane's three** (I137).
    const fn = unit3(faceN[o] as number, faceN[o + 1] as number, faceN[o + 2] as number);
    for (let m = 0; m < 3; m += 1) { // cells-ok — a corner index
      const k = face[m] as number;
      const j = idxLane[o + m] as number;
      if (written[j] === 1) continue;
      written[j] = 1;
      const p = pts[k] as Vec3;
      const q = j * 3;
      pos[q] = p.x;
      pos[q + 1] = p.y;
      pos[q + 2] = p.z;
      if (flat) {
        nrm[q] = fn.x;
        nrm[q + 1] = fn.y;
        nrm[q + 2] = fn.z;
      } else {
        // **The vertex normal, once per raster vertex**: `unit` over the sum lane (I137).
        const vq = k * 3;
        const vn = unit3(vertN[vq] as number, vertN[vq + 1] as number, vertN[vq + 2] as number);
        nrm[q] = vn.x;
        nrm[q + 1] = vn.y;
        nrm[q + 2] = vn.z;
      }
      value[j] = values[k];
    }
    out[f] = { f, lanes, fn, edges: mask[f] as readonly [boolean, boolean, boolean], series, skin };
  }
  return { tris: out, lanes, frame: 0 };
}

/**
 * The ramp span over a surface's referenced vertices, from the bounds the
 * clouds and paths set — **one function, scalars, one record** (C12 I131, I135).
 *
 * **The depth is `project`'s first dot in place** (I131): the same three
 * subtractions and three products in the same order, and a corner at or behind
 * `NEAR` is skipped exactly where `project` refuses it — `<=`, so the frozen
 * `NaN` arm is `project`'s too. **The bounds are parameters and locals, and no
 * closure captures them** (I135): V8 keeps a captured variable in a context
 * object, whose slots hold tagged values, so a double assigned to one is a heap
 * number allocated on every assignment — four a corner over 35,947 corners a
 * bunny frame when the span was a closure (F1175). **The folds are comparisons
 * carrying `Math.min`'s and `Math.max`'s answers exactly** — the `NaN` arm on
 * both bounds, the signed-zero arm on the values — because `Math.min` over a
 * bound that arrives as a parameter keeps the loop-carried value tagged and
 * boxes it on every iteration: 22.5 MB a twenty-frame heap with `Math.min`,
 * nothing with these, nothing with `Math.min` over `nearD - 0` either, which
 * names the representation and not the arithmetic (I135). The depth has no
 * zero arm because a depth past `NEAR` is positive.
 */
export function spanOverCorners(
  basis: Basis,
  lanes: Lanes,
  nearD: number,
  farD: number,
  loV: number,
  hiV: number,
): Readonly<{ nearD: number; farD: number; loV: number; hiV: number }> {
  const e = basis.eye;
  const f = basis.forward;
  const P = lanes.pos;
  const V = lanes.value;
  for (let i = 0; i < lanes.count; i += 1) { // cells-ok — a corner index
    const q = i * 3;
    const px = P[q] as number;
    const py = P[q + 1] as number;
    const pz = P[q + 2] as number;
    const z = (px - e.x) * f.x + (py - e.y) * f.y + (pz - e.z) * f.z;
    if (z <= NEAR) continue;
    if (z < nearD || z !== z) nearD = z;
    if (z > farD || z !== z) farD = z;
    const v = V[i];
    if (v !== undefined) {
      if (v < loV || v !== v || (v === 0 && loV === 0 && 1 / v < 0)) loV = v;
      if (v > hiV || v !== v || (v === 0 && hiV === 0 && 1 / v > 0)) hiV = v;
    }
  }
  return { nearD, farD, loV, hiV };
}

/**
 * Which of each triangle's three edges the **caller** drew (C12 I95, §6i row 9).
 *
 * **A height field is triangulated before it is drawn, and the diagonal is not
 * an edge.** `facesOf` splits every cell into `[a, b, c]` and `[a, c, d]`, so
 * the diagonal is the first triangle's `ca` and the second's `ab` — one per
 * cell, and on a 9×9 grid that is **64** edges the caller never drew, against
 * the grid's own 144. Rendered with all three marked, a 6×6 Gaussian gives 258
 * edge samples to 36 interior and no cell is legible; masked, it gives 168 to
 * 126 and the grid reads.
 *
 * **A mesh's mask is all true**, because a mesh's triangles are all the
 * structure it has — so a dense mesh's wireframe is solid, which is honest
 * rather than a defect.
 */
function edgeMask(
  s: Surface3,
  faces: number,
): readonly (readonly [boolean, boolean, boolean])[] {
  if (s.vertices !== undefined) {
    return new Array<readonly [boolean, boolean, boolean]>(faces).fill([true, true, true]); // cells-ok — a face count
  }
  const out: (readonly [boolean, boolean, boolean])[] = [];
  for (let f = 0; f < faces; f += 2) { // cells-ok — a face index
    out.push([true, true, false], [false, true, true]);
  }
  return out.slice(0, faces); // cells-ok — a face count
}

/**
 * The signed volume of a closed mesh, and the sign the cull reads (C12 I95,
 * §6i rows 3 and 5, F461).
 *
 * **`closed` licenses this, and that is its second power.** The obvious UV
 * sphere — rings by segments, two triangles a quad in grid order — measures
 * **−4.16** and is wound *inward*, so trusting the winding culls the front and
 * draws the back. Two-sided shading then lights the far hemisphere correctly,
 * which makes the result a plausible hollow shell rather than a bug: oriented
 * from the volume, the natural and reversed spheres produce byte-identical
 * masks, and no assertion about a colour or a silhouette separates them.
 *
 * **Inconsistent winding is not covered, and the sensitivity is inverted
 * relative to the damage.** Half a sphere reversed cancels to `1e-15` and the
 * guard refuses to cull at all — the safe answer — while one face in eight
 * leaves a confident `−3.12` and gets about 32 faces of 2304 wrong in silence.
 * The badly wound mesh is caught and the mildly wound one is not.
 *
 * `unitOf` is an affine map with a positive scale per axis, so it preserves
 * orientation and the sign here is the sign in data space.
 */
function cullSign(
  s: Surface3,
  pts: readonly Vec3[],
  idx: readonly (readonly [number, number, number])[],
): 0 | 1 | -1 {
  if (s.closed !== true) return 0;
  let v = 0;
  // `dot(a, cross(b, c))` written out, term by term in its order (C12 I137).
  for (let f = 0; f < idx.length; f += 1) { // cells-ok — a face index
    const face = idx[f] as readonly [number, number, number];
    const a = pts[face[0]] as Vec3;
    const b = pts[face[1]] as Vec3;
    const c = pts[face[2]] as Vec3;
    v += a.x * (b.y * c.z - b.z * c.y) + a.y * (b.z * c.x - b.x * c.z) + a.z * (b.x * c.y - b.y * c.x);
  }
  v /= 6;
  return Math.abs(v) < VOLUME_EPS ? 0 : v < 0 ? -1 : 1;
}

/** The triangles, by arm: a mesh states them and a grid implies two per cell. */
function facesOf(s: Surface3): readonly (readonly [number, number, number])[] {
  if (s.faces !== undefined) return s.faces;
  const h = s.heights;
  if (h === undefined || h.length < 2) return []; // cells-ok — a grid height
  const rows = h.length; // cells-ok — a grid height
  const cols = (h[0] as readonly number[]).length; // cells-ok — a grid width
  const out: [number, number, number][] = [];
  const at = (i: number, j: number): number => j * cols + i; // cells-ok — a grid offset
  for (let j = 0; j + 1 < rows; j += 1) { // cells-ok — a row index
    for (let i = 0; i + 1 < cols; i += 1) { // cells-ok — a column index
      out.push([at(i, j), at(i + 1, j), at(i + 1, j + 1)]);
      out.push([at(i, j), at(i + 1, j + 1), at(i, j + 1)]);
    }
  }
  return out;
}

/**
 * The field, per vertex — **and the member it comes from is per arm** (C04 I79).
 *
 * A height field's `field` is a grid parallel to `heights`, so colour and height
 * are independent; a mesh's is the `value` already on each `Point3`, because a
 * mesh has no grid to be parallel to. One member meaning both would be a grid
 * indexed by a vertex number.
 */
function valuesOf(s: Surface3, count: number): readonly (number | undefined)[] {
  if (s.vertices !== undefined) return s.vertices.map((p: Point3) => p.value);
  const src = s.field ?? s.heights;
  if (src === undefined) return new Array<undefined>(count).fill(undefined); // cells-ok — a vertex count
  const out: (number | undefined)[] = [];
  for (const row of src) for (const v of row) out.push(v);
  return out;
}

const lerpV = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t,
});

/** A vertex through the clip path: a lane vertex by index, or a cut with no slot yet (C12 I139). */
type ClipVert = { p: Vec3; n: Vec3; v: number | undefined; k: number };

const lerpClipVert = (a: ClipVert, b: ClipVert, t: number): ClipVert => ({
  p: lerpV(a.p, b.p, t),
  n: lerpV(a.n, b.n, t),
  v: a.v === undefined || b.v === undefined ? a.v ?? b.v : a.v + (b.v - a.v) * t,
  k: -1,
});

/**
 * One triangle, clipped at the near plane, rasterised and shaded (C12 I94).
 *
 * **Clipped into one or two triangles rather than dropped** (§6h row 15). That
 * is F450's ruling on the carrier that covers the most area: dropping a face
 * whose near corner is behind the eye makes a surface tear open as the camera
 * enters it, and the field value and the smooth normal are interpolated to the
 * new vertices exactly as step 5 interpolates a polyline's reading to `ta`.
 */
export function drawTri(
  tri: Tri3,
  basis: Basis,
  grid: Readonly<{ width: number; height: number }>,
  depth: Depth,
  light: Vec3,
  span: Readonly<{ nearD: number; farD: number }>,
  paint: Painter,
  frame?: RasterFrame,
): boolean {
  if (backfaceCulled(tri, basis)) return false;
  const L = tri.lanes;
  const o = tri.f * 3;
  const ia = L.idx[o] as number;
  const ib = L.idx[o + 1] as number;
  const ic = L.idx[o + 2] as number;
  // **The records decide the path** (C12 I139): `toScreen` refuses a corner at
  // or behind the plane on the expression the three view depths were read by,
  // so three records is the direct path and none is a face wholly behind.
  const pa = screenOf(L, ia, basis, grid, frame);
  const pb = screenOf(L, ib, basis, grid, frame);
  const pc = screenOf(L, ic, basis, grid, frame);
  if (pa && pb && pc) {
    fill(L, ia, ib, ic, tri, tri.edges, grid, depth, light, span, paint);
    return false;
  }
  if (!pa && !pb && !pc) return false;
  // **The clip path**, taken only when a corner is at or behind the plane; the
  // return value is what lets the caller count it. **In its own function**
  // (C12 I134, F1173): its closure captured `basis`, and a captured parameter
  // is a context allocated on every entry to this function — before the cull,
  // for every triangle — not only on the path that builds the closure.
  return clipPath(tri, ia, ib, ic, basis, grid, depth, light, span, paint, frame);
}

/** The clip path of `drawTri`, holding the one closure the raster builds per straddling face (C12 I134). */
function clipPath(
  tri: Tri3,
  ia: number,
  ib: number,
  ic: number,
  basis: Basis,
  grid: Readonly<{ width: number; height: number }>,
  depth: Depth,
  light: Vec3,
  span: Readonly<{ nearD: number; farD: number }>,
  paint: Painter,
  frame: RasterFrame | undefined,
): boolean {
  const L = tri.lanes;
  const zOf = (p: Vec3): number => dot(sub(p, basis.eye), basis.forward);
  const clipVert = (k: number): ClipVert => {
    const c = cornerAt(L, k);
    return { p: c.p, n: c.n, v: c.v, k };
  };
  const vs: readonly [ClipVert, ClipVert, ClipVert] = [clipVert(ia), clipVert(ib), clipVert(ic)];
  // **A cut vertex takes a spare slot** (C12 I139): projected as a lane vertex
  // is, counted as one was, and read by the same fill.
  let spare = 0;
  for (const t of clipNear(vs, tri.edges, zOf)) {
    let drawn = true;
    for (let m = 0; m < 3 && drawn; m += 1) { // cells-ok — a corner index
      const w = t.v[m] as ClipVert;
      if (w.k >= 0) continue;
      if (spare >= SPARE) throw new Error("the clip path cut more vertices than it has slots for");
      const slot = L.count + spare;
      L.spareValue[spare] = w.v;
      spare += 1;
      w.k = slot;
      if (frame !== undefined) frame.projected += 1;
      if (!toScreenAt(L, slot, w.p.x, w.p.y, w.p.z, w.n.x, w.n.y, w.n.z, basis, grid)) drawn = false;
    }
    if (!drawn) continue;
    fill(L, (t.v[0] as ClipVert).k, (t.v[1] as ClipVert).k, (t.v[2] as ClipVert).k, tri, t.e, grid, depth, light, span, paint);
  }
  return true;
}

/**
 * Backface culling, **per face and oriented by the mesh** (C12 I95, §6i rows
 * 1–3).
 *
 * Exported so a row can call it rather than restate its arithmetic — `shade`'s
 * rule one function along, and F459's lesson about a row that writes the
 * formula out and then agrees with any version of it.
 *
 * **The direction to the eye is this face's, never a view-space constant.** The
 * design note's `dot(normal, view) < 0` is the orthographic limit: measured on
 * a 2304-face sphere the two disagree on **7.29%** of faces at `distance: 6`
 * and **34.03%** at 1.5, and the constant answers *48.18% visible* at every
 * distance because a view-space `z` test cannot read the eye's position at all,
 * while the truth `(1 − r/d)/2` falls from 41.67% to 16.67% (F460). *Removes
 * ~half the faces of a sphere* is the same limit — the cull removes **58%** at
 * distance 6 and **83%** at 1.5, or 44.5% by face count rather than by area,
 * because a UV sphere's polar faces are slivers.
 *
 * **A face with no normal is never culled**: `unit` hands the zero vector back,
 * `dot` is `0`, and `0 > 0` is false — the same rule that shades it at ambient.
 */
export function backfaceCulled(tri: Tri3, basis: Basis): boolean {
  if (tri.skin.cull === 0) return false;
  // **Scalars, in the order the `Vec3` forms had them** (C12 I131, F1169), read
  // from the position lane by the face's indices (I139): the centroid's
  // components, its difference from the eye, `dot`'s sum — and nothing
  // allocated, 69,451 times a bunny frame.
  const L = tri.lanes;
  const P = L.pos;
  const o = tri.f * 3;
  const a = (L.idx[o] as number) * 3;
  const b = (L.idx[o + 1] as number) * 3;
  const c = (L.idx[o + 2] as number) * 3;
  const cx = ((P[a] as number) + (P[b] as number) + (P[c] as number)) / 3;
  const cy = ((P[a + 1] as number) + (P[b + 1] as number) + (P[c + 1] as number)) / 3;
  const cz = ((P[a + 2] as number) + (P[b + 2] as number) + (P[c + 2] as number)) / 3;
  const e = basis.eye;
  const n = tri.fn;
  return (n.x * (cx - e.x) + n.y * (cy - e.y) + n.z * (cz - e.z)) * tri.skin.cull > 0;
}

/**
 * The near-plane clip: 0, 1 or 2 vertices behind, giving 1, 2 or 1 triangles.
 *
 * **The target is just inside the plane, not on it** — `clipProject`'s ruling
 * one primitive along (F450). `project` culls on `z <= NEAR` inclusive, so a
 * vertex moved to exactly the near plane is refused by the function the clip
 * exists to get it past.
 */
function clipNear(
  v: readonly [ClipVert, ClipVert, ClipVert],
  edges: readonly [boolean, boolean, boolean],
  zOf: (p: Vec3) => number,
): readonly Readonly<{ v: readonly [ClipVert, ClipVert, ClipVert]; e: readonly [boolean, boolean, boolean] }>[] {
  const IN = NEAR * (1 + 1e-6);
  const z = v.map((w) => zOf(w.p));
  const inFront = (i: number): boolean => (z[i] as number) > NEAR;
  const kept = [0, 1, 2].filter(inFront); // cells-ok — a vertex index
  if (kept.length === 3) return [{ v, e: edges }]; // cells-ok — a vertex count
  if (kept.length === 0) return []; // cells-ok — a vertex count
  const dropped = [0, 1, 2].filter((i) => !inFront(i)); // cells-ok — a vertex index
  // **Every output vertex carries which of the caller's edges it lies on**, as
  // three bits (§6i row 10). An original vertex `i` lies on edges `i` and
  // `(i + 2) % 3`; a vertex cut from `(x, y)` lies on the one edge between them.
  // Two output vertices then share an edge exactly when their bits intersect —
  // and the shared bit is unique, because two triangle vertices meet on one side.
  const ON = [0b101, 0b011, 0b110]; // vertex 0 → edges ca,ab · 1 → ab,bc · 2 → bc,ca
  const between = (x: number, y: number): number =>
    1 << ((x + y === 1 ? 0 : x + y === 3 ? 1 : 2)); // cells-ok — an edge index
  const cut = (a: number, b: number): { w: ClipVert; on: number } => {
    const va = v[a] as ClipVert;
    const vb = v[b] as ClipVert;
    const za = zOf(va.p);
    const zb = zOf(vb.p);
    return { w: lerpClipVert(va, vb, (IN - za) / (zb - za)), on: between(a, b) };
  };
  const orig = (i: number): { w: ClipVert; on: number } => ({ w: v[i] as ClipVert, on: ON[i] as number });
  const shape = (
    p: { w: ClipVert; on: number },
    q: { w: ClipVert; on: number },
    r: { w: ClipVert; on: number },
  ): Readonly<{ v: readonly [ClipVert, ClipVert, ClipVert]; e: readonly [boolean, boolean, boolean] }> => {
    const kept3 = [[p, q], [q, r], [r, p]].map(([x, y]) => {
      const shared = (x as { on: number }).on & (y as { on: number }).on;
      if (shared === 0) return false;
      // The lowest set bit names the edge, and there is only ever one.
      return edges[31 - Math.clz32(shared & -shared)] === true; // cells-ok — an edge index
    });
    return { v: [p.w, q.w, r.w], e: kept3 as [boolean, boolean, boolean] };
  };
  if (kept.length === 1) { // cells-ok — a vertex count
    const k = kept[0] as number;
    return [shape(orig(k), cut(k, dropped[0] as number), cut(k, dropped[1] as number))];
  }
  // Two kept: the remainder is a quad, which is two triangles sharing a diagonal
  // — and the diagonal is not one of the caller's edges, which is what `shape`
  // works out rather than being told.
  const [k0, k1] = kept as [number, number];
  const d = dropped[0] as number;
  const c0 = cut(k0, d);
  const c1 = cut(k1, d);
  return [shape(orig(k0), orig(k1), c1), shape(orig(k0), c1, c0)];
}

/**
 * A clipped vertex into sample coordinates. `null` is the cull, and it should
 * not fire.
 *
 * **The normal is rotated into view space here**, which is the one place it can
 * be: the light is a view-space constant, so a `dot` against a world-space
 * normal is two spaces multiplied together. **It is in range and it is
 * plausible** — the product of two unit vectors is in `[−1, 1]` whichever frames
 * they are in, so the ambient floor holds, nothing is `NaN`, and every assertion
 * about the intensity passes. The frame is what says otherwise: a Gaussian came
 * out with its peak at ambient and its rim lit, which is the shading inside out.
 *
 * `viewDir` is a rotation, so it preserves length and leaves the zero vector
 * alone — the degenerate face survives the transform as a degenerate face — and
 * it commutes with the interpolation below, so a smooth normal may be rotated
 * per vertex rather than per sample.
 */
/**
 * The vertex's projection for this frame, taken once (C12 I130). Under a
 * frame the record on the vertex is read back when its stamp is the frame's;
 * without one — the tests' direct calls — every corner projects, as before.
 */
function screenOf(
  L: Lanes,
  k: number,
  basis: Basis,
  grid: Readonly<{ width: number; height: number }>,
  frame: RasterFrame | undefined,
): boolean {
  if (frame === undefined) return toScreen(L, k, basis, grid);
  const held = L.stamps[k] as number;
  if (held === frame.stamp) return true;
  if (held === -frame.stamp) return false;
  const shown = toScreen(L, k, basis, grid);
  L.stamps[k] = shown ? frame.stamp : -frame.stamp;
  frame.projected += 1;
  return shown;
}

/** A lane vertex projected into its own slot (C12 I139). */
function toScreen(L: Lanes, k: number, basis: Basis, grid: Readonly<{ width: number; height: number }>): boolean {
  const q = k * 3;
  return toScreenAt(
    L, k,
    L.pos[q] as number, L.pos[q + 1] as number, L.pos[q + 2] as number,
    L.nrm[q] as number, L.nrm[q + 1] as number, L.nrm[q + 2] as number,
    basis, grid,
  );
}

function toScreenAt(
  L: Lanes,
  slot: number,
  px0: number,
  py0: number,
  pz0: number,
  nx0: number,
  ny0: number,
  nz0: number,
  basis: Basis,
  grid: Readonly<{ width: number; height: number }>,
): boolean {
  // **One record, eight numbers in a slot** (C12 I128, I139): `viewDir(basis,
  // sub(p, eye))` and `viewDir(basis, n)` component by component, each `dot`
  // in its own order, where this was a `Projected`, a `sub` and two `Vec3`s a
  // vertex.
  const dx = px0 - basis.eye.x;
  const dy = py0 - basis.eye.y;
  const dz = pz0 - basis.eye.z;
  const r = basis.right;
  const u = basis.up;
  const f = basis.forward;
  // **The position in scalars** (C12 I134, F1174): `vz` is `project`'s `z`,
  // `vx` its `x` and `vy` its `y` — the same `sub` and the same three `dot`s —
  // so the near cull, the divisor, the fold of `f` and the aspect and the
  // half-and-shift follow in `project`'s expression order, and the record is
  // `project`'s to the bit (T1.146) without its vector and its return.
  const vz = dx * f.x + dy * f.y + dz * f.z;
  if (vz <= NEAR) return false;
  const vx = dx * r.x + dy * r.y + dz * r.z;
  const vy = dx * u.x + dy * u.y + dz * u.z;
  const divisor = basis.orthographic ? basis.distance : vz;
  const sx = (vx * basis.f) / basis.aspect / divisor;
  const sy = (vy * basis.f) / divisor;
  const px = sx * 0.5 + 0.5;
  const py = 0.5 - sy * 0.5;
  const S = L.screen;
  const o = slot * S_STRIDE;
  S[o + S_X] = px * grid.width;
  S[o + S_Y] = py * grid.height;
  S[o + S_VX] = vx;
  S[o + S_VY] = vy;
  S[o + S_VZ] = vz;
  S[o + S_NX] = nx0 * r.x + ny0 * r.y + nz0 * r.z;
  S[o + S_NY] = nx0 * u.x + ny0 * u.y + nz0 * u.z;
  S[o + S_NZ] = nx0 * f.x + ny0 * f.y + nz0 * f.z;
  return true;
}

/**
 * The fill, **with the stroke arm below one sample of area** (C12 I94, §6h row 4).
 *
 * One threshold covers three cases that look unrelated and are one: the edge-on
 * plane, whose projected area is exactly zero and whose barycentric weights are
 * therefore `NaN`; the sub-sample triangle of a dense mesh, which a scanline
 * fill misses entirely and which is how a 69k-triangle bunny fills with holes;
 * and the genuinely degenerate face, which is collinear on screen because a
 * projective map preserves collinearity. **A test at exact zero leaves a
 * discontinuity at 89.999°** — the surface vanishing a hair before it goes
 * edge-on, then reappearing as a line.
 *
 * **The lateral cull is the clamp**, which is what `project`'s own comment
 * defers here: a point is one sample and `writeDepth` refuses an out-of-range
 * coordinate, but a triangle is an area and scanning the part of it that is off
 * the frame is unbounded work for no ink.
 */
function fill(
  L: Lanes,
  ia: number,
  ib: number,
  ic: number,
  tri: Tri3,
  e: readonly [boolean, boolean, boolean],
  grid: Readonly<{ width: number; height: number }>,
  depth: Depth,
  light: Vec3,
  span: Readonly<{ nearD: number; farD: number }>,
  paint: Painter,
): void {
  // **The three records read from their slots** (C12 I139) — the same doubles
  // the records held, at another address.
  const S = L.screen;
  const A = ia * S_STRIDE;
  const B = ib * S_STRIDE;
  const C = ic * S_STRIDE;
  const ax = S[A + S_X] as number;
  const ay = S[A + S_Y] as number;
  const bx = S[B + S_X] as number;
  const by = S[B + S_Y] as number;
  const cx = S[C + S_X] as number;
  const cy = S[C + S_Y] as number;
  const series = tri.series;
  const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
  // **A triangle under one cell of projected area is stroked, not filled**
  // (C12 I95, F453): a sample centre can miss every such triangle and a shape
  // of thousands of them would vanish.
  if (!(Math.abs(area) >= 1)) {
    strokeThin(L, ia, ib, ic, tri, e, grid, depth, light, span, paint);
    return;
  }
  const avx = S[A + S_VX] as number;
  const avy = S[A + S_VY] as number;
  const avz = S[A + S_VZ] as number;
  const anx = S[A + S_NX] as number;
  const any = S[A + S_NY] as number;
  const anz = S[A + S_NZ] as number;
  const bvx = S[B + S_VX] as number;
  const bvy = S[B + S_VY] as number;
  const bvz = S[B + S_VZ] as number;
  const bnx = S[B + S_NX] as number;
  const bny = S[B + S_NY] as number;
  const bnz = S[B + S_NZ] as number;
  const cvx = S[C + S_VX] as number;
  const cvy = S[C + S_VY] as number;
  const cvz = S[C + S_VZ] as number;
  const cnx = S[C + S_NX] as number;
  const cny = S[C + S_NY] as number;
  const cnz = S[C + S_NZ] as number;
  const va = valueAt(L, ia);
  const vb = valueAt(L, ib);
  const vc = valueAt(L, ic);
  const wire = tri.skin.wire !== false && (e[0] || e[1] || e[2]);
  const lane = depth.lane;
  // **Scalar edge lengths, bounds and weights** (C12 I128): the arithmetic the
  // vector forms had, in the order they had it, with nothing allocated.
  const len0 = hypot2(bx - ax, by - ay);
  const len1 = hypot2(cx - bx, cy - by);
  const len2 = hypot2(ax - cx, ay - cy);
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))); // cells-ok — a sample coordinate
  const x1 = Math.min(grid.width - 1, Math.floor(Math.max(ax, bx, cx))); // cells-ok — a sample coordinate
  const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))); // cells-ok — a sample coordinate
  const y1 = Math.min(grid.height - 1, Math.floor(Math.max(ay, by, cy))); // cells-ok — a sample coordinate
  const sign = area > 0 ? 1 : -1;
  const m = Math.abs(area);
  const eps = m * 1e-6;
  for (let py = y0; py <= y1; py += 1) { // cells-ok — a sample coordinate
    for (let px = x0; px <= x1; px += 1) { // cells-ok — a sample coordinate
      const cxs = px + 0.5;
      const cys = py + 0.5;
      const w0 = ((bx - ax) * (cys - ay) - (cxs - ax) * (by - ay)) * sign;
      const w1 = ((cx - bx) * (cys - by) - (cxs - bx) * (cy - by)) * sign;
      const w2 = ((ax - cx) * (cys - cy) - (cxs - cx) * (ay - cy)) * sign;
      if (w0 < -eps || w1 < -eps || w2 < -eps) continue;
      const ua = w1 / m;
      const ub = w2 / m;
      const uc = w0 / m;
      const z = avz * ua + bvz * ub + cvz * uc;
      if (!writeDepth(depth, px, py, z)) continue; // cells-ok — a sample coordinate
      // **The six interpolated scalars and the depth into the lane** (C12 I136).
      lane[LANE_NX] = anx * ua + bnx * ub + cnx * uc;
      lane[LANE_NY] = any * ua + bny * ub + cny * uc;
      lane[LANE_NZ] = anz * ua + bnz * ub + cnz * uc;
      lane[LANE_VX] = avx * ua + bvx * ub + cvx * uc;
      lane[LANE_VY] = avy * ua + bvy * ub + cvy * uc;
      lane[LANE_VZ] = z;
      lane[LANE_DEPTH] = z;
      shadeAt(lane, light, span);
      paint(
        py * grid.width + px, // cells-ok — a sample offset
        z,
        blend(va, vb, vc, ua, ub, uc),
        series,
        lane[LANE_INTENSITY] as number,
        wire
          && ((e[0] && w0 / len0 < EDGE_HALF)
            || (e[1] && w1 / len1 < EDGE_HALF)
            || (e[2] && w2 / len2 < EDGE_HALF)),
      );
    }
  }
}

/**
 * A triangle too thin to fill, stroked along its three edges (§6h rows 4 and 14).
 *
 * **The value interpolates along the edge by `t` and not barycentrically**,
 * because the barycentric weights are exactly what this arm exists to avoid
 * computing.
 */
/**
 * Whether a sub-cell triangle can write no sample, so its edges need not be
 * walked (C12 I138, F1183).
 *
 * **The bound is the walk's own arithmetic.** An edge sample's depth is
 * `p.vz + (q.vz − p.vz) · t` for `t` in `[0, 1]` — at least the smaller
 * endpoint less the subtraction's rounding, which is under an ulp of the
 * larger magnitude — so the triangle's floor is its nearest corner less a
 * relative margin of `1e-9`, through `Math.fround` as `writeDepth` takes the
 * sample. The walk's coordinate is `(p.x / width) · width`, the corner's to
 * within an ulp and one cell below it when the corner sits on an integer —
 * `(1 / 49) · 49` is `0.9999999999999999` — while the interpolation at `t = 1`
 * lands on or above the far endpoint's floor; so the cells are the corners'
 * floors widened by the same margin and clamped to the grid, where
 * `writeDepth` refuses. A cell at or under the floor refuses every sample the
 * triangle could put in it, the depth test being strict.
 *
 * **The nearest corner's own cell first**, because most of the triangles this
 * does not mark fail there, and the scan is then never entered.
 */
export function hiddenThin(
  L: Lanes,
  ia: number,
  ib: number,
  ic: number,
  grid: Readonly<{ width: number; height: number }>,
  depth: Depth,
): boolean {
  const S = L.screen;
  const A = ia * S_STRIDE;
  const B = ib * S_STRIDE;
  const C = ic * S_STRIDE;
  const ax = S[A + S_X] as number;
  const ay = S[A + S_Y] as number;
  const avz = S[A + S_VZ] as number;
  const bx = S[B + S_X] as number;
  const by = S[B + S_Y] as number;
  const bvz = S[B + S_VZ] as number;
  const cx = S[C + S_X] as number;
  const cy = S[C + S_Y] as number;
  const cvz = S[C + S_VZ] as number;
  const z = depth.z;
  const w = grid.width;
  const h = grid.height;
  const zspan = Math.max(Math.abs(avz), Math.abs(bvz), Math.abs(cvz));
  const zlo = Math.fround(Math.min(avz, bvz, cvz) - zspan * MARGIN);
  const fx = Math.floor(ax); // cells-ok — a sample coordinate
  const fy = Math.floor(ay); // cells-ok — a sample coordinate
  if (fx >= 0 && fy >= 0 && fx < w && fy < h && !((z[fy * w + fx] as number) <= zlo)) return false; // cells-ok — a sample offset
  const minx = Math.min(ax, bx, cx);
  const maxx = Math.max(ax, bx, cx);
  const miny = Math.min(ay, by, cy);
  const maxy = Math.max(ay, by, cy);
  const dx = Math.max(Math.abs(minx), Math.abs(maxx)) * MARGIN;
  const dy = Math.max(Math.abs(miny), Math.abs(maxy)) * MARGIN;
  const x0 = Math.max(0, Math.floor(minx - dx)); // cells-ok — a sample coordinate
  const x1 = Math.min(w - 1, Math.floor(maxx + dx)); // cells-ok — a sample coordinate
  const y0 = Math.max(0, Math.floor(miny - dy)); // cells-ok — a sample coordinate
  const y1 = Math.min(h - 1, Math.floor(maxy + dy)); // cells-ok — a sample coordinate
  for (let yy = y0; yy <= y1; yy += 1) { // cells-ok — a sample coordinate
    const row = yy * w; // cells-ok — a sample offset
    for (let xx = x0; xx <= x1; xx += 1) { // cells-ok — a sample coordinate
      if (!((z[row + xx] as number) <= zlo)) return false;
    }
  }
  return true;
}

/** The relative margin `hiddenThin` widens its bounds by — far above an ulp, far below a cell (C12 I138). */
const MARGIN = 1e-9;

function strokeThin(
  L: Lanes,
  ia: number,
  ib: number,
  ic: number,
  tri: Tri3,
  e: readonly [boolean, boolean, boolean],
  grid: Readonly<{ width: number; height: number }>,
  depth: Depth,
  light: Vec3,
  span: Readonly<{ nearD: number; farD: number }>,
  paint: Painter,
): void {
  // **Asked before the edges are walked** (C12 I138): a triangle whose every
  // reachable cell already holds a nearer depth writes nothing, and on the
  // bunny that is four of five — counted, since the frame cannot show it.
  if (hiddenThin(L, ia, ib, ic, grid, depth)) {
    depth.hidden[0] = (depth.hidden[0] as number) + 1;
    return;
  }
  const series = tri.series;
  const wire = tri.skin.wire !== false;
  // **Three explicit edges, not a `pairs` array of tuples** (C12 I128), through
  // a module function rather than a closure of this call (I129).
  thinEdge(L, ia, ib, e[0] && wire, series, grid, depth, light, span, paint);
  thinEdge(L, ib, ic, e[1] && wire, series, grid, depth, light, span, paint);
  thinEdge(L, ic, ia, e[2] && wire, series, grid, depth, light, span, paint);
}

/**
 * One edge of a thin triangle, stroked (C12 I129). **`strokeSeg`'s stepping,
 * restated in its own loop** — the dominant-axis count, F453's floor, the
 * depth lerped by `t`, `writeDepth` strictly nearer — because a callback is a
 * closure and a context per edge (F1159). The two copies are held to one
 * rule by PR15's thin half, which restates it a third time as the referee.
 * The per-sample lerps are `lerpV`'s expression, `a + (b − a) · t`, on
 * components, and `shadeAt` is `shade`'s arithmetic; nothing is allocated.
 */
function thinEdge(
  L: Lanes,
  ip: number,
  iq: number,
  own: boolean,
  series: number,
  grid: Readonly<{ width: number; height: number }>,
  depth: Depth,
  light: Vec3,
  span: Readonly<{ nearD: number; farD: number }>,
  paint: Painter,
): void {
  const S = L.screen;
  const P = ip * S_STRIDE;
  const Q = iq * S_STRIDE;
  const pvx = S[P + S_VX] as number;
  const pvy = S[P + S_VY] as number;
  const pvz = S[P + S_VZ] as number;
  const pnx = S[P + S_NX] as number;
  const pny = S[P + S_NY] as number;
  const pnz = S[P + S_NZ] as number;
  const qvx = S[Q + S_VX] as number;
  const qvy = S[Q + S_VY] as number;
  const qvz = S[Q + S_VZ] as number;
  const qnx = S[Q + S_NX] as number;
  const qny = S[Q + S_NY] as number;
  const qnz = S[Q + S_NZ] as number;
  const pv = valueAt(L, ip);
  const qv = valueAt(L, iq);
  // The normalised coordinates `strokeSeg` took, multiplied back as it did.
  const lane = depth.lane;
  const x0 = ((S[P + S_X] as number) / grid.width) * grid.width;
  const y0 = ((S[P + S_Y] as number) / grid.height) * grid.height;
  const x1 = ((S[Q + S_X] as number) / grid.width) * grid.width;
  const y1 = ((S[Q + S_Y] as number) / grid.height) * grid.height;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)))); // cells-ok — a sample count
  for (let s = 0; s <= steps; s += 1) { // cells-ok — a sample index
    const t = s / steps; // cells-ok — a sample index
    const px = Math.floor(x0 + (x1 - x0) * t); // cells-ok — a sample coordinate
    const py = Math.floor(y0 + (y1 - y0) * t); // cells-ok — a sample coordinate
    const z = pvz + (qvz - pvz) * t;
    if (!writeDepth(depth, px, py, z)) continue;
    lane[LANE_NX] = pnx + (qnx - pnx) * t;
    lane[LANE_NY] = pny + (qny - pny) * t;
    lane[LANE_NZ] = pnz + (qnz - pnz) * t;
    lane[LANE_VX] = pvx + (qvx - pvx) * t;
    lane[LANE_VY] = pvy + (qvy - pvy) * t;
    lane[LANE_VZ] = z;
    lane[LANE_DEPTH] = z;
    shadeAt(lane, light, span);
    paint(
      py * grid.width + px, // cells-ok — a sample offset
      z,
      pv === undefined || qv === undefined ? pv ?? qv : pv + (qv - pv) * t,
      series,
      lane[LANE_INTENSITY] as number,
      own,
    );
  }
}

/** Three readings under barycentric weights, `undefined` surviving as `undefined`. */
function blend(
  va: number | undefined,
  vb: number | undefined,
  vc: number | undefined,
  ua: number,
  ub: number,
  uc: number,
): number | undefined {
  if (va === undefined || vb === undefined || vc === undefined) return va ?? vb ?? vc;
  return va * ua + vb * ub + vc * uc;
}

/**
 * The lighting at one sample, clamped to `[0, 1]` (C12 I94).
 *
 * **The normal is flipped toward the eye here, per sample** (§6h rows 5 and 7).
 * Per *face* would seam the silhouette under smooth shading, where per sample is
 * continuous — the flip happens exactly where `n · l` is zero, so nothing steps.
 * And it reads the **view-space `z`** rather than the screen winding, because a
 * degenerate triangle's screen area is a signed zero and a winding test would
 * answer from a sign nobody set.
 *
 * **Two-sided is the right default for a plot**: an open height field is seen
 * from below as often as from above, and one-sided lighting draws its underside
 * as a flat ambient sheet. It makes winding order irrelevant to shading — it
 * stays relevant to culling, which is a different question and a later step.
 *
 * **The ambient term is not optional.** Without it a face turned fully away is
 * black and reads as a **hole** rather than a surface, which is worse than being
 * wrong about the light.
 */
export function shade(
  normal: Vec3,
  viewPos: Vec3,
  light: Vec3,
  depth: number,
  span: Readonly<{ nearD: number; farD: number }>,
): number {
  // **The object form is the wrapper** (C12 I129): the arithmetic lives in
  // `shadeAt` on the components, so the reference and the per-sample path are
  // one function — **over a lane per call** (I136): the reference is per
  // figure and per test row, and the raster's lane is on its depth record.
  const lane = new Float64Array(8); // cells-ok — the lane's slots
  lane[LANE_NX] = normal.x;
  lane[LANE_NY] = normal.y;
  lane[LANE_NZ] = normal.z;
  lane[LANE_VX] = viewPos.x;
  lane[LANE_VY] = viewPos.y;
  lane[LANE_VZ] = viewPos.z;
  lane[LANE_DEPTH] = depth;
  shadeAt(lane, light, span);
  return lane[LANE_INTENSITY] as number;
}

/**
 * The lane's layout (C12 I136): the normal, the view position, the depth in,
 * the intensity out. Slot numbers rather than a record, because the record is
 * the allocation this exists to remove.
 */
const LANE_NX = 0;
const LANE_NY = 1;
const LANE_NZ = 2;
const LANE_VX = 3;
const LANE_VY = 4;
const LANE_VZ = 5;
const LANE_DEPTH = 6;
const LANE_INTENSITY = 7;

/**
 * `shade` on scalars (C12 I129) — `unit`, the flip, `dot`, `unit` again and
 * the reflection, each on components in the same operation order, with no
 * record built. The comments on the arithmetic are `shade`'s and are kept
 * with it. **Every input is read from the lane and the answer is written to
 * it** (I136), never passed or returned:
 * this function's bytecode is past V8's inlining size, so it is a real call
 * from `fill` and `thinEdge`, and each double argument to a real call is a
 * heap number — seven in and one out per painted sample, 33.6 MB of a
 * twenty-frame bunny heap before the lane (F1176).
 */
function shadeAt(
  lane: Float64Array,
  light: Vec3,
  span: Readonly<{ nearD: number; farD: number }>,
): void {
  const nx0 = lane[LANE_NX] as number;
  const ny0 = lane[LANE_NY] as number;
  const nz0 = lane[LANE_NZ] as number;
  const vx = lane[LANE_VX] as number;
  const vy = lane[LANE_VY] as number;
  const vz = lane[LANE_VZ] as number;
  const depth = lane[LANE_DEPTH] as number;
  // **A zero-length normal survives as itself** (F456): `unit`'s rule — the
  // hypot, and the divide only when it is not zero — so `dot` is then `0`, the
  // face takes ambient and nothing divides by anything.
  const len = hypot3(nx0, ny0, nz0);
  const rx = len === 0 ? nx0 : nx0 / len;
  const ry = len === 0 ? ny0 : ny0 / len;
  const rz = len === 0 ? nz0 : nz0 / len;
  // **The flip's tie at `raw.z === 0` is not reachable and there is no
  // tie-break here** (F464). It looks like it needs one: reversing a mesh's
  // winding negates every normal **exactly** — measured, 1728 of 1728 vertex
  // normals and every face normal — so the two windings would pick *opposite*
  // representatives at exactly zero. A lexicographic fall-through to `x` then
  // `y` was written, and it changed **nothing**, because the value cannot be
  // reached: the plane `x = 0` viewed from a camera inside it gives a
  // view-space `z` of `6.123e-17` rather than `0`, which is `Math.cos(π/2)`.
  // The two windings' residue is the **rasteriser's** shared-edge tie instead,
  // and it is recorded on I95 rather than repaired here.
  const flip = rz > 0;
  const nx = flip ? -rx : rx;
  const ny = flip ? -ry : ry;
  const nz = flip ? -rz : rz;
  const nl = nx * light.x + ny * light.y + nz * light.z;
  const lit = nl > 0 ? nl : 0;
  const ex = -vx;
  const ey = -vy;
  const ez = -vz;
  const elen = hypot3(ex, ey, ez);
  const tx = elen === 0 ? ex : ex / elen;
  const ty = elen === 0 ? ey : ey / elen;
  const tz = elen === 0 ? ez : ez / elen;
  const rv = (2 * nl * nx - light.x) * tx + (2 * nl * ny - light.y) * ty + (2 * nl * nz - light.z) * tz;
  const spec = rv > 0 ? SPECULAR * Math.pow(rv, SHINE) : 0;
  const far = span.farD > span.nearD ? (depth - span.nearD) / (span.farD - span.nearD) : 0;
  const i = (AMBIENT + DIFFUSE * lit + spec) * (1 - FALLOFF * far);
  lane[LANE_INTENSITY] = i < 0 ? 0 : i > 1 ? 1 : i;
}

/**
 * The glyph arm's mark for one sample — **the second channel this arm has and
 * the half-block arm does not** (C12 I94, §6h row 12).
 *
 * F436 retracted *field in the colour, shading in the density* because the rung
 * changed and both readings began writing the same sample. On the arm that kept
 * two carriers the claim holds unchanged: the colour carries the field and the
 * glyph carries the shading, and below the colour floor the glyph carries the
 * whole picture rather than a silhouette.
 *
 * `ladderFor("density")` rather than a ramp of this file's own — the existing
 * axis, braille at unicode and `.:-=+*#@` at ASCII, so no encoding axis is
 * widened and the ambiguous-width question is already answered.
 */
/** What `wireframe: "over"` scales an edge's intensity by. Exported so a row reads it. */
export const edgeIntensity = (intensity: number, wire: boolean | "over"): number =>
  wire === "over" ? intensity * EDGE_DIM : intensity;

/** The density ladder's steps for a capability set, read once per render rather than per write (C12 I132). */
export function densitySteps(caps: Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">): readonly string[] {
  return [...ladderFor("density", caps).steps];
}

/** The step an intensity selects, on steps already read: floor of intensity × steps, clamped to the ladder. */
export function densityGlyphOf(steps: readonly string[], intensity: number): string {
  const k = Math.min(steps.length - 1, Math.max(0, Math.floor(intensity * steps.length))); // cells-ok — a ladder index
  return steps[k] as string;
}
