/**
 * The 3D pipeline's first three stages — normalise, project, cull — the depth
 * buffer beside them, and the depth-tested segment walk that is its only
 * non-trivial caller (C12 §3al, C12 I84, C12 I86, C12 I93).
 *
 * **`strokeSeg` lives here rather than in one renderer** because it has three:
 * the axis lines, the polyline carrier, and the surface's degenerate arm, which
 * strokes a triangle too thin to fill (C12 I94). A second copy of the stepping
 * loop is a second place for the floor convention to drift, which is exactly
 * the defect F453 was.
 *
 * **The cull is on view `z` and it happens before the divide**, which is the
 * whole reason these live in one file. Four of the five degenerate cases are
 * loud: a divide by zero gives `Infinity`, then `NaN`, and every stage after it
 * stops. The fifth is silent — a sample behind the eye divides to a **finite
 * coordinate inside the frame**, mirrored through the origin — so the figure
 * grows a plausible extra lobe rather than losing one, and neither a bounds
 * assertion nor a frame read can see it. View space is the only place the
 * information still exists.
 *
 * **Nothing here holds state.** C12 I11 forbids anything surviving a render and
 * permits a local, which is why `createDepth` allocates rather than returning a
 * shared array — and why PR8 asserts the *second* call, since a module-level
 * buffer is correct on the first by construction.
 */
import { CAMERA_DEFAULT, type Camera } from "../../data/viewmodel/index.js";

export type Vec3 = Readonly<{ x: number; y: number; z: number }>;

/**
 * The near plane, in **view units** (C12 I86).
 *
 * The data normalises into `[−1, 1]³` and the default camera sits at distance
 * 10, so the near face of anything real is nine units away: this clips nothing
 * and bounds the divide, which is the whole of what the constant is for.
 */
export const NEAR = 0.01;

/**
 * Which rung a figure is rasterised at, and therefore how many samples a cell
 * holds (C12 I84).
 *
 * **Half blocks for a surface and braille for an outline** — a scatter and a
 * wireframe are boundary all the way through, so the dot grid's four times the
 * samples are all signal; a shaded surface is 89–96% interior, where the dot
 * grid stipples over a colour the cell was going to paint anyway (F431).
 */
export type Rung = "half" | "braille";

/**
 * The sample grid a block of `width × height` **cells** projects into (C12 I84).
 *
 * **`80 × 48` is a measurement of this rule at 80×24 cells and not a constant.**
 * The projection scales to the grid, the grid to the block, and the block to
 * whatever region it is given — the chain every raster in this component uses.
 */
export function sampleGrid(width: number, height: number, rung: Rung): Readonly<{ width: number; height: number }> {
  const w = Math.max(1, Math.floor(width)); // cells-ok — a cell count
  const h = Math.max(1, Math.floor(height)); // cells-ok — a cell count
  return rung === "half"
    ? { width: w, height: h * 2 } // cells-ok — two samples a cell, down
    : { width: w * 2, height: h * 4 }; // cells-ok — 2×4 dots a cell
}

/** A point set's per-axis bounds. */
export type Extent3 = Readonly<{ min: Vec3; max: Vec3 }>;

/** The bounds of a set. An empty set is the unit cube, so nothing divides by nothing. */
export function extentOf(points: readonly Vec3[]): Extent3 {
  // cells-ok — a point count, not a width
  if (points.length === 0) return { min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } }; // cells-ok — a point count
  let lo = points[0] as Vec3;
  let hi = lo;
  for (const p of points) {
    lo = { x: Math.min(lo.x, p.x), y: Math.min(lo.y, p.y), z: Math.min(lo.z, p.z) };
    hi = { x: Math.max(hi.x, p.x), y: Math.max(hi.y, p.y), z: Math.max(hi.z, p.z) };
  }
  return { min: lo, max: hi };
}

/**
 * One axis into `[−1, 1]`, and **a zero extent maps to the centre** (C12 I86).
 *
 * Not to the minimum and not to `NaN`. A degenerate axis has no spread, so every
 * sample sits in the middle of it — which draws a coplanar set as a **line** and
 * a coincident set as a **point**, both of which are the truth. The coplanar,
 * collinear and coincident cases differ only in how many axes take this arm.
 */
const axis = (v: number, lo: number, hi: number): number =>
  hi === lo ? 0 : ((v - lo) / (hi - lo)) * 2 - 1;

/** A point into the unit cube. */
export function unitOf(p: Vec3, e: Extent3): Vec3 {
  return {
    x: axis(p.x, e.min.x, e.max.x),
    y: axis(p.y, e.min.y, e.max.y),
    z: axis(p.z, e.min.z, e.max.z),
  };
}

/** The camera resolved into an eye and an orthonormal frame. */
export type Basis = Readonly<{
  eye: Vec3;
  right: Vec3;
  up: Vec3;
  forward: Vec3;
  /** `1 / tan(fov / 2)`, folded once rather than per sample. */
  f: number;
  aspect: number;
  orthographic: boolean;
}>;

export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
/**
 * A vector normalised, **and a zero-length one comes back unchanged rather than
 * as `NaN`** — which is `axis`'s rule one dimension up: the caller that produced
 * it is degenerate and the picture it draws is empty, not corrupt.
 *
 * **This is the whole of the surface's *undefined normal* case** (C12 I94,
 * F456). The design note's remedy — *refuse the face rather than dividing by
 * its length* — names a divide that has never been in this pipeline: a face
 * whose cross product is the zero vector gets the zero vector back, `dot(0, l)`
 * is `0`, and it shades at ambient. Refusing it would contradict I86, which
 * already draws a collapsed set rather than dropping it.
 */
export const unit = (a: Vec3): Vec3 => {
  const n = Math.hypot(a.x, a.y, a.z);
  return n === 0 ? a : { x: a.x / n, y: a.y / n, z: a.z / n };
};

/** The field of view, in degrees. One number, because a plot is not a camera rig. */
const FOV = 42;

/**
 * Where the camera is, and the frame it looks along (C12 I83).
 *
 * The eye orbits the origin: `azimuth` about the vertical axis, `elevation`
 * above the horizontal plane, at `distance`. **`distance: 0` puts the eye on the
 * target**, every sample lands at or behind the near plane, and the picture is
 * empty — which is what standing inside the data looks like and is why it is not
 * a construction error (C12 I86).
 */
export function basisOf(camera: Partial<Camera> | undefined, aspect: number): Basis {
  const c: Camera = camera === undefined ? CAMERA_DEFAULT : { ...CAMERA_DEFAULT, ...camera };
  const ce = Math.cos(c.elevation);
  const eye: Vec3 = {
    x: c.distance * ce * Math.cos(c.azimuth),
    y: c.distance * ce * Math.sin(c.azimuth),
    z: c.distance * Math.sin(c.elevation),
  };
  // Looking at the origin. `z` is up, which is the convention the data uses:
  // a height field is `z = f(x, y)`.
  const forward = unit(sub({ x: 0, y: 0, z: 0 }, eye));
  // **`up` is derived rather than given**, so a camera directly overhead has a
  // degenerate right vector — `unit` returns it unchanged rather than `NaN`, and
  // the figure collapses to a line, which is what looking straight down a pole
  // gives you.
  const right = unit(cross(forward, { x: 0, y: 0, z: 1 }));
  const up = cross(right, forward);
  return {
    eye,
    right,
    up,
    forward,
    f: 1 / Math.tan((FOV * Math.PI) / 360),
    aspect,
    orthographic: c.projection === "orthographic",
  };
}

/** A sample on the screen, in `[0, 1]²`, with its view depth. */
export type Projected = Readonly<{ x: number; y: number; depth: number }>;

/**
 * A **direction** into the camera's frame (C12 I94).
 *
 * Not a point: no eye is subtracted, so this rotates rather than transforms —
 * which is what a normal needs. `z` is along `forward`, so a normal pointing
 * back at the reader has a **negative** `z`, and that sign is what the
 * two-sided flip reads.
 *
 * **The flip reads this and never the screen winding.** A degenerate triangle's
 * screen area is a *signed* zero — `1/area` measures `−Infinity` — so a winding
 * test answers from a sign nobody set (F456).
 */
export function viewDir(basis: Basis, v: Vec3): Vec3 {
  return { x: dot(v, basis.right), y: dot(v, basis.up), z: dot(v, basis.forward) };
}

/**
 * World to screen, **culled before the divide** (C12 I86).
 *
 * `null` is *behind the near plane*, and it is the only refusal here. It applies
 * to the orthographic arm as well: there is no divide to protect, and a sample
 * behind the reader is behind the reader.
 *
 * **The lateral bound is not here and that is deliberate.** A point is one
 * sample and `writeDepth` ignores an out-of-range coordinate, so clipping it
 * twice would be two rules for one question. A *triangle* is not one sample and
 * needs a real lateral cull, which arrives with the surface (step 6).
 */
export function project(basis: Basis, p: Vec3): Projected | null {
  const d = sub(p, basis.eye);
  const z = dot(d, basis.forward);
  if (z <= NEAR) return null;
  const x = dot(d, basis.right);
  const y = dot(d, basis.up);
  // The orthographic arm keeps the view coordinates and drops the divide; the
  // depth is the same number either way, which is what lets one buffer serve
  // both.
  const sx = basis.orthographic ? x / basis.aspect : (x * basis.f) / basis.aspect / z;
  const sy = basis.orthographic ? y : (y * basis.f) / z;
  return { x: sx * 0.5 + 0.5, y: 0.5 - sy * 0.5, depth: z };
}

/** The depth buffer: one `Float32Array`, cleared to `+Infinity`. */
export type Depth = Readonly<{ width: number; height: number; z: Float32Array }>;

/**
 * A buffer for one render, sized from the sample grid (C12 I84, C12 I11).
 *
 * **Allocated here rather than shared**, and the distinction is load-bearing
 * rather than pedantic: a module-level buffer is exactly the state C12 I11 forbids,
 * *and* it is the wrong size the first time a region changes. About 60 KB at
 * 120×30, and the figure moves with the region rather than being a budget.
 */
export function createDepth(width: number, height: number): Depth {
  const w = Math.max(1, Math.floor(width)); // cells-ok — a sample count
  const h = Math.max(1, Math.floor(height)); // cells-ok — a sample count
  const z = new Float32Array(w * h);
  z.fill(Infinity);
  return { width: w, height: h, z };
}

/**
 * The depth test. `true` when this sample is nearer than what is there.
 *
 * **Strictly nearer, and the comparison is in the buffer's own precision**
 * (F454). A tie is meant to be stable — two coplanar primitives at the same
 * depth draw in the order they are given, which is what lets the frame go in
 * last and lose its cells to data lying on the box. It was not: `z` is a
 * `double` and `d.z` is a `Float32Array`, so storing a value rounds it, and a
 * second writer handing over the **identical double** wins whenever that
 * rounding went up. About half of all ties, chosen by the last bits of a
 * number nobody looks at, and invisible to any assertion comparing the two
 * depths — as doubles they are equal.
 *
 * `Math.fround` is the whole fix: compare what will be stored against what is
 * stored. A wireframe over its own surface still needs the bias the design
 * names rather than a tie-break here.
 *
 * Out of bounds returns `false` rather than throwing — `setDot`'s rule one file
 * over, and for its reason: a rasteriser that has to bounds-check every call has
 * the check in the wrong place.
 */
export function writeDepth(d: Depth, x: number, y: number, z: number): boolean {
  if (x < 0 || y < 0 || x >= d.width || y >= d.height) return false;
  const i = y * d.width + x; // cells-ok — a sample offset
  const q = Math.fround(z);
  if (!(q < (d.z[i] as number))) return false;
  d.z[i] = q;
  return true;
}

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
 *
 * **Floored, not rounded, and it is the same defect F445 fixed one function
 * over** (F453). A rounded sample puts sample `i` over `[i − 0.5, i + 0.5)`
 * where every other writer in this file puts it over `[i, i + 1)`: the glyph
 * arm floors a point's coordinate and the raster arm's `round(fx − bw/2)` is
 * `floor(fx)` at the unit tier. Mixing the two conventions offsets a line from
 * its own vertices by up to a sample — so a trajectory drifts off the markers
 * it passes through, and the tie the draw order depends on never happens
 * because the two writers are never talking about the same cell.
 */
export function strokeSeg(
  pa: Projected,
  pb: Projected,
  grid: Readonly<{ width: number; height: number }>,
  depth: Depth,
  paint: (i: number, t: number, z: number) => void,
): void {
  const x0 = pa.x * grid.width;
  const y0 = pa.y * grid.height;
  const x1 = pb.x * grid.width;
  const y1 = pb.y * grid.height;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)))); // cells-ok — a sample count
  for (let i = 0; i <= steps; i += 1) { // cells-ok — a sample index
    const t = i / steps; // cells-ok — a sample index
    const px = Math.floor(x0 + (x1 - x0) * t); // cells-ok — a sample coordinate
    const py = Math.floor(y0 + (y1 - y0) * t); // cells-ok — a sample coordinate
    const z = pa.depth + (pb.depth - pa.depth) * t;
    if (writeDepth(depth, px, py, z)) paint(py * grid.width + px, t, z); // cells-ok — a sample offset
  }
}
