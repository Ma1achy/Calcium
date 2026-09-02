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

/** One triangle of one surface, in **unit** space. */
export type Tri3 = Readonly<{ a: Vert; b: Vert; c: Vert; series: number }>;

/** What a shaded sample hands back to whoever is composing the raster. */
export type Shaded = Readonly<{
  depth: number;
  value: number | undefined;
  series: number;
  /** The clamped lighting, `[0, 1]`. Ambient is its floor and it is never zero. */
  intensity: number;
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
    out.push({ a: at(ia), b: at(ib), c: at(ic), series });
  }
  return out;
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
  const zOf = (p: Vec3): number => dot(sub(p, basis.eye), basis.forward);
  const vs = [tri.a, tri.b, tri.c];
  const behind = vs.filter((w) => zOf(w.p) <= NEAR);
  if (behind.length === 3) return; // cells-ok — a vertex count
  for (const t of clipNear(vs as [Vert, Vert, Vert], zOf)) {
    const s = t.map((w) => toScreen(w, basis, grid));
    if (s.some((q) => q === null)) continue;
    fill(s as [Screen, Screen, Screen], tri.series, grid, depth, light, span, paint);
  }
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
  zOf: (p: Vec3) => number,
): readonly (readonly [Vert, Vert, Vert])[] {
  const IN = NEAR * (1 + 1e-6);
  const z = v.map((w) => zOf(w.p));
  const out = v.filter((_, i) => (z[i] as number) > NEAR);
  if (out.length === 3) return [v]; // cells-ok — a vertex count
  if (out.length === 0) return []; // cells-ok — a vertex count
  const cut = (a: Vert, b: Vert): Vert => {
    const za = zOf(a.p);
    const zb = zOf(b.p);
    return lerpVert(a, b, (IN - za) / (zb - za));
  };
  const keep = v.filter((_, i) => (z[i] as number) > NEAR) as Vert[];
  const drop = v.filter((_, i) => !((z[i] as number) > NEAR)) as Vert[];
  if (keep.length === 1) { // cells-ok — a vertex count
    const k = keep[0] as Vert;
    return [[k, cut(k, drop[0] as Vert), cut(k, drop[1] as Vert)]];
  }
  // Two kept: the remainder is a quad, which is two triangles sharing a diagonal.
  const [k0, k1] = keep as [Vert, Vert];
  const d = drop[0] as Vert;
  const c0 = cut(k0, d);
  const c1 = cut(k1, d);
  return [[k0, k1, c1], [k0, c1, c0]];
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
  series: number,
  grid: Readonly<{ width: number; height: number }>,
  depth: Depth,
  light: Vec3,
  span: Readonly<{ nearD: number; farD: number }>,
  paint: (i: number, sample: Shaded) => void,
): void {
  const [a, b, c] = s;
  const area = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
  if (!(Math.abs(area) >= 1)) {
    strokeThin(s, series, grid, depth, light, span, paint);
    return;
  }
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
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
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
  series: number,
  grid: Readonly<{ width: number; height: number }>,
  depth: Depth,
  light: Vec3,
  span: Readonly<{ nearD: number; farD: number }>,
  paint: (i: number, sample: Shaded) => void,
): void {
  const pairs: readonly (readonly [Screen, Screen])[] = [
    [s[0], s[1]], [s[1], s[2]], [s[2], s[0]],
  ];
  for (const [p, q] of pairs) {
    const asProjected = (w: Screen): { x: number; y: number; depth: number } => ({
      x: w.x / grid.width, y: w.y / grid.height, depth: w.vp.z,
    });
    strokeSeg(asProjected(p), asProjected(q), grid, depth, (i, t, z) => {
      const n = lerpV(p.n, q.n, t);
      const vp = { ...lerpV(p.vp, q.vp, t), z };
      paint(i, {
        depth: z,
        value: p.v === undefined || q.v === undefined ? p.v ?? q.v : p.v + (q.v - p.v) * t,
        series,
        intensity: shade(n, vp, light, z, span),
      });
    });
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
export function densityGlyph(
  intensity: number,
  caps: Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">,
): string {
  const steps = [...ladderFor("density", caps).steps];
  const k = Math.min(steps.length - 1, Math.max(0, Math.floor(intensity * steps.length))); // cells-ok — a ladder index
  return steps[k] as string;
}
