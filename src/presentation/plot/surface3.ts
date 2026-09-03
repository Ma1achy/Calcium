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
  project,
  strokeSeg,
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

/** A vertex with everything a sample interpolated from it needs. */
type Vert = Readonly<{ p: Vec3; n: Vec3; v: number | undefined }>;

/**
 * What a whole surface decides, held once and shared by reference across its
 * triangles (C12 I95).
 *
 * `cull` is `0` for *do not*, and otherwise the sign the mesh's own signed
 * volume gave — never the caller's winding (§6i row 3, F461).
 */
export type Skin = Readonly<{ cull: 0 | 1 | -1; wire: boolean | "over" }>;

/**
 * One triangle of one surface, in **unit** space.
 *
 * **`fn` is the face's own normal and it is not the shading normal.** Under
 * `shading: "smooth"` the vertices carry averages, and an average over adjacent
 * faces does not describe any face's orientation — so the cull reads this and
 * the lighting reads `a.n`/`b.n`/`c.n` (§6i row 12). The smooth arm computed it
 * already; storing it costs nothing.
 *
 * **`edges` is which of `ab`, `bc`, `ca` the *caller* drew**, in that order,
 * matching `fill`'s `w0`/`w1`/`w2`. A height field's cell diagonal is not one
 * of them; a mesh's triangles are all the structure a mesh has (§6i row 9).
 */
export type Tri3 = Readonly<{
  a: Vert;
  b: Vert;
  c: Vert;
  fn: Vec3;
  edges: readonly [boolean, boolean, boolean];
  series: number;
  skin: Skin;
}>;

/** What a shaded sample hands back to whoever is composing the raster. */
export type Shaded = Readonly<{
  depth: number;
  value: number | undefined;
  series: number;
  /** The clamped lighting, `[0, 1]`. Ambient is its floor and it is never zero. */
  intensity: number;
  /** On one of the caller's own edges, within `EDGE_HALF` of a sample (C12 I95). */
  edge: boolean;
}>;

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
export function trianglesOf(s: Surface3, extent: Extent3, series: number): readonly Tri3[] {
  const pts = surfacePoints(s).map((p) => unitOf(p, extent));
  const idx = facesOf(s);
  const mask = edgeMask(s, idx.length); // cells-ok — a face count
  const skin: Skin = { cull: cullSign(s, pts, idx), wire: s.wireframe ?? false };
  const flat = s.shading === "flat";
  // The face normals, unnormalised — their length is twice the area, which is
  // what makes the accumulation below area-weighted without a second term.
  const faceN = idx.map(([a, b, c]) =>
    cross(sub(pts[b] as Vec3, pts[a] as Vec3), sub(pts[c] as Vec3, pts[a] as Vec3)));
  const vertN: Vec3[] = pts.map(() => ({ x: 0, y: 0, z: 0 }));
  if (!flat) {
    for (let f = 0; f < idx.length; f += 1) { // cells-ok — a face index
      const n = faceN[f] as Vec3;
      for (const k of idx[f] as readonly [number, number, number]) {
        const acc = vertN[k] as Vec3;
        vertN[k] = { x: acc.x + n.x, y: acc.y + n.y, z: acc.z + n.z };
      }
    }
    for (let k = 0; k < vertN.length; k += 1) vertN[k] = unit(vertN[k] as Vec3); // cells-ok — a vertex index
  }
  const values = valuesOf(s, pts.length); // cells-ok — a vertex count
  const out: Tri3[] = [];
  for (let f = 0; f < idx.length; f += 1) { // cells-ok — a face index
    const [ia, ib, ic] = idx[f] as readonly [number, number, number];
    const fn = unit(faceN[f] as Vec3);
    const at = (k: number): Vert => ({
      p: pts[k] as Vec3,
      n: flat ? fn : (vertN[k] as Vec3),
      v: values[k],
    });
    out.push({
      a: at(ia),
      b: at(ib),
      c: at(ic),
      fn,
      edges: mask[f] as readonly [boolean, boolean, boolean],
      series,
      skin,
    });
  }
  return out;
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
  for (const [a, b, c] of idx) {
    v += dot(pts[a] as Vec3, cross(pts[b] as Vec3, pts[c] as Vec3));
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

/** A vertex projected into sample coordinates, carrying its view position. */
type Screen = Readonly<{ x: number; y: number; vp: Vec3; n: Vec3; v: number | undefined }>;

const lerpV = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t,
});

const lerpVert = (a: Vert, b: Vert, t: number): Vert => ({
  p: lerpV(a.p, b.p, t),
  n: lerpV(a.n, b.n, t),
  v: a.v === undefined || b.v === undefined ? a.v ?? b.v : a.v + (b.v - a.v) * t,
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
  paint: (i: number, sample: Shaded) => void,
): void {
  if (backfaceCulled(tri, basis)) return;
  const zOf = (p: Vec3): number => dot(sub(p, basis.eye), basis.forward);
  const vs = [tri.a, tri.b, tri.c];
  const behind = vs.filter((w) => zOf(w.p) <= NEAR);
  if (behind.length === 3) return; // cells-ok — a vertex count
  for (const t of clipNear(vs as [Vert, Vert, Vert], tri.edges, zOf)) {
    const s = t.v.map((w) => toScreen(w, basis, grid));
    if (s.some((q) => q === null)) continue;
    fill(s as [Screen, Screen, Screen], tri, t.e, grid, depth, light, span, paint);
  }
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
  const c = {
    x: (tri.a.p.x + tri.b.p.x + tri.c.p.x) / 3,
    y: (tri.a.p.y + tri.b.p.y + tri.c.p.y) / 3,
    z: (tri.a.p.z + tri.b.p.z + tri.c.p.z) / 3,
  };
  return dot(tri.fn, sub(c, basis.eye)) * tri.skin.cull > 0;
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
  v: readonly [Vert, Vert, Vert],
  edges: readonly [boolean, boolean, boolean],
  zOf: (p: Vec3) => number,
): readonly Readonly<{ v: readonly [Vert, Vert, Vert]; e: readonly [boolean, boolean, boolean] }>[] {
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
  const cut = (a: number, b: number): { w: Vert; on: number } => {
    const va = v[a] as Vert;
    const vb = v[b] as Vert;
    const za = zOf(va.p);
    const zb = zOf(vb.p);
    return { w: lerpVert(va, vb, (IN - za) / (zb - za)), on: between(a, b) };
  };
  const orig = (i: number): { w: Vert; on: number } => ({ w: v[i] as Vert, on: ON[i] as number });
  const shape = (
    p: { w: Vert; on: number },
    q: { w: Vert; on: number },
    r: { w: Vert; on: number },
  ): Readonly<{ v: readonly [Vert, Vert, Vert]; e: readonly [boolean, boolean, boolean] }> => {
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
function toScreen(
  w: Vert,
  basis: Basis,
  grid: Readonly<{ width: number; height: number }>,
): Screen | null {
  const pr = project(basis, w.p);
  if (pr === null) return null;
  return {
    x: pr.x * grid.width,
    y: pr.y * grid.height,
    vp: viewDir(basis, sub(w.p, basis.eye)),
    n: viewDir(basis, w.n),
    v: w.v,
  };
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
  s: readonly [Screen, Screen, Screen],
  tri: Tri3,
  e: readonly [boolean, boolean, boolean],
  grid: Readonly<{ width: number; height: number }>,
  depth: Depth,
  light: Vec3,
  span: Readonly<{ nearD: number; farD: number }>,
  paint: (i: number, sample: Shaded) => void,
): void {
  const [a, b, c] = s;
  const series = tri.series;
  const area = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
  if (!(Math.abs(area) >= 1)) {
    strokeThin(s, tri, e, grid, depth, light, span, paint);
    return;
  }
  // **The edge lengths, folded once** (C12 I95, §6i row 8). `w0` is twice the
  // sub-triangle's area, so `w0 / |ab|` is the perpendicular distance to `ab`
  // in samples — and the whole test is skipped when no edge of this triangle
  // is the caller's, which is every triangle of a surface with no wireframe.
  const wire = tri.skin.wire !== false && (e[0] || e[1] || e[2]);
  const len: readonly [number, number, number] = [
    Math.hypot(b.x - a.x, b.y - a.y),
    Math.hypot(c.x - b.x, c.y - b.y),
    Math.hypot(a.x - c.x, a.y - c.y),
  ];
  const lo = (f: (q: Screen) => number): number =>
    Math.max(0, Math.floor(Math.min(f(a), f(b), f(c)))); // cells-ok — a sample coordinate
  const hi = (f: (q: Screen) => number, n: number): number =>
    Math.min(n - 1, Math.floor(Math.max(f(a), f(b), f(c)))); // cells-ok — a sample coordinate
  const x0 = lo((q) => q.x);
  const x1 = hi((q) => q.x, grid.width);
  const y0 = lo((q) => q.y);
  const y1 = hi((q) => q.y, grid.height);
  const sign = area > 0 ? 1 : -1;
  for (let py = y0; py <= y1; py += 1) { // cells-ok — a sample coordinate
    for (let px = x0; px <= x1; px += 1) { // cells-ok — a sample coordinate
      // **The sample's centre, which is `+0.5` because every writer here floors**
      // (F453): sample `i` covers `[i, i + 1)`, so its centre is `i + 0.5`.
      const cx = px + 0.5;
      const cy = py + 0.5;
      const w0 = ((b.x - a.x) * (cy - a.y) - (cx - a.x) * (b.y - a.y)) * sign;
      const w1 = ((c.x - b.x) * (cy - b.y) - (cx - b.x) * (c.y - b.y)) * sign;
      const w2 = ((a.x - c.x) * (cy - c.y) - (cx - c.x) * (a.y - c.y)) * sign;
      // **A shared edge is claimed by both triangles or by neither, and
      // floating point decides which** (C12 I104, F493).
      //
      // The test was `w < 0`, which accepts a sample exactly *on* an edge — so
      // two triangles sharing one both take it, and the depth test settles it.
      // That is right in exact arithmetic. In floating point the two compute the
      // same edge from **different operands**, so a sample on it can evaluate to
      // `-1e-13` for both and be dropped by both: a **crack**, one sample wide,
      // along every shared edge in the mesh.
      //
      // **It was invisible until the grid doubled.** At `width × 1` the cracks
      // fell between samples; at `width × 2` there are four times as many
      // chances to land on one, and they surfaced as half-cell holes punched
      // into a solid surface — which reads as a rendering fault and is a
      // sampling one. Found by looking at a magnified frame, not by any
      // assertion about coverage.
      //
      // The epsilon is relative to the triangle's own area so it scales with the
      // mesh, and it errs toward double coverage, which `writeDepth` already
      // resolves.
      const eps = Math.abs(area) * 1e-6;
      if (w0 < -eps || w1 < -eps || w2 < -eps) continue;
      const m = Math.abs(area);
      const [ua, ub, uc] = [w1 / m, w2 / m, w0 / m];
      // **Depth interpolates linearly across the screen triangle**, which is not
      // perspective-correct and is deliberate: `strokeSeg` interpolates its `z`
      // the same way, and a wireframe edge z-fighting its own face *because the
      // two primitives interpolate differently* is a defect no assertion about
      // either one alone would find.
      const z = a.vp.z * ua + b.vp.z * ub + c.vp.z * uc;
      if (!writeDepth(depth, px, py, z)) continue; // cells-ok — a sample coordinate
      const n = {
        x: a.n.x * ua + b.n.x * ub + c.n.x * uc,
        y: a.n.y * ua + b.n.y * ub + c.n.y * uc,
        z: a.n.z * ua + b.n.z * ub + c.n.z * uc,
      };
      const vp = {
        x: a.vp.x * ua + b.vp.x * ub + c.vp.x * uc,
        y: a.vp.y * ua + b.vp.y * ub + c.vp.y * uc,
        z,
      };
      paint(py * grid.width + px, { // cells-ok — a sample offset
        depth: z,
        value: blend(a.v, b.v, c.v, ua, ub, uc),
        series,
        intensity: shade(n, vp, light, z, span),
        edge: wire
          && ((e[0] && w0 / (len[0] as number) < EDGE_HALF)
            || (e[1] && w1 / (len[1] as number) < EDGE_HALF)
            || (e[2] && w2 / (len[2] as number) < EDGE_HALF)),
      });
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
function strokeThin(
  s: readonly [Screen, Screen, Screen],
  tri: Tri3,
  e: readonly [boolean, boolean, boolean],
  grid: Readonly<{ width: number; height: number }>,
  depth: Depth,
  light: Vec3,
  span: Readonly<{ nearD: number; farD: number }>,
  paint: (i: number, sample: Shaded) => void,
): void {
  const series = tri.series;
  const pairs: readonly (readonly [Screen, Screen, boolean])[] = [
    [s[0], s[1], e[0]], [s[1], s[2], e[1]], [s[2], s[0], e[2]],
  ];
  // **All three still stroke, and only the caller's carry `edge`.** A degenerate
  // triangle is a line whichever member is set, so the arm that keeps it does
  // not change; what changes is which of its three strokes a wireframe paints.
  for (const [p, q, own] of pairs) {
    const asProjected = (w: Screen): { x: number; y: number; depth: number } => ({
      x: w.x / grid.width, y: w.y / grid.height, depth: w.vp.z,
    });
    // **Strictly nearer**: this arm writes a colour, and a colour has one
    // question — a tie belongs to whoever drew first (C12 I101, F452).
    strokeSeg(asProjected(p), asProjected(q), grid, depth, (i, t, z) => {
      const n = lerpV(p.n, q.n, t);
      const vp = { ...lerpV(p.vp, q.vp, t), z };
      paint(i, {
        depth: z,
        value: p.v === undefined || q.v === undefined ? p.v ?? q.v : p.v + (q.v - p.v) * t,
        series,
        intensity: shade(n, vp, light, z, span),
        edge: own && tri.skin.wire !== false,
      });
    }, false);;
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
  // **A zero-length normal survives as itself** (F456). `dot` is then `0`, so
  // the face takes ambient and nothing divides by anything.
  const raw = unit(normal);
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
  const n = raw.z > 0 ? { x: -raw.x, y: -raw.y, z: -raw.z } : raw;
  const nl = dot(n, light);
  const lit = nl > 0 ? nl : 0;
  const toEye = unit({ x: -viewPos.x, y: -viewPos.y, z: -viewPos.z });
  const r = { x: 2 * nl * n.x - light.x, y: 2 * nl * n.y - light.y, z: 2 * nl * n.z - light.z };
  const rv = dot(r, toEye);
  const spec = rv > 0 ? SPECULAR * Math.pow(rv, SHINE) : 0;
  const far = span.farD > span.nearD ? (depth - span.nearD) / (span.farD - span.nearD) : 0;
  const i = (AMBIENT + DIFFUSE * lit + spec) * (1 - FALLOFF * far);
  return i < 0 ? 0 : i > 1 ? 1 : i;
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

export function densityGlyph(
  intensity: number,
  caps: Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">,
): string {
  const steps = [...ladderFor("density", caps).steps];
  const k = Math.min(steps.length - 1, Math.max(0, Math.floor(intensity * steps.length))); // cells-ok — a ladder index
  return steps[k] as string;
}
