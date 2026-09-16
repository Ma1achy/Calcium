// C12 I96 — the geometry suite, and whether a whole-shape row can fail.
//
// **The rows here assert figures rather than mechanisms**, which is the shape
// most at risk of passing for the wrong reason: an inked count, a colour count
// and a cluster count are all satisfied by a renderer that is wrong in a
// direction the count does not resolve. §6j's walk found six of the design
// note's §7 clauses were exactly that, before the fixtures existed — so this
// run asks the fixtures the same question the walk asked the note.
//
// **Which rows this run reaches, stated rather than implied.** Seven mutations
// kill GM2, GM3, GM4 and GM8; GM1 is the control. **GM5, GM6, GM7 and GM9 have
// none**, and the reason is the same for all four: each asserts a relation
// between two frames of the *same* renderer — the tilted plane against the flat
// one, a constant field against a varying one, one capability against another,
// the egg-carton against the Gaussian — so a mutation moves both sides and the
// relation survives. That is the property those rows were written for and it is
// also what puts them out of this instrument's reach; the thing that would check
// them is a second implementation, which is §7's reference comparison and not
// this.
//
// **The control is a normal**, not a frame. Every row below reads a picture, so
// a run whose control also read a picture would be answering *does anything
// draw* — which is the question that was already going to pass.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/plot-geometry.test.ts test/unit/plot-surface3d.test.ts";
const SURFACE = "src/presentation/plot/surface3.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: SURFACE,
    // The face normal, which GM1 asserts to six places on three planes. A
    // control has to be a thing the suite asserts rather than merely a change
    // to the subject.
    from:
      "    const nx = uy * vz - uz * vy;\n" +
      "    const ny = uz * vx - ux * vz;\n" +
      "    const nz = ux * vy - uy * vx;",
    to:
      "    const nx = vy * uz - vz * uy;\n" +
      "    const ny = vz * ux - vx * uz;\n" +
      "    const nz = vx * uy - vy * ux;",
    why: "GM1 asserts each coordinate plane's own normal to six places; a run where reversing the cross product survives cannot see a kill",
  },
  mutations: [
    {
      // **A corner's sum skipped** (I137): the third corner of every face
      // no longer accumulates, and the smooth normals part from the reference
      // on every mesh.
      name: "LANE-CORNER-SKIPPED: the third corner does not accumulate its face normal",
      file: SURFACE,
      from: "      q = ic * 3;\n      vertN[q] = (vertN[q] as number) + ax;\n      vertN[q + 1] = (vertN[q + 1] as number) + ay;\n      vertN[q + 2] = (vertN[q + 2] as number) + az;",
      to: "      q = ic * 3;",
      expect: "T1.149",
    },
    {
      // **The vertex record made per corner** (I137, I130): smooth shading
      // shares nothing, and the raster would project a vertex per face.
      name: "RECORD-UNSHARED: a smooth vertex record is made for every corner",
      file: SURFACE,
      from: "    const held = shared[k];\n    if (held !== undefined) return held;\n    const q = k * 3;",
      to: "    const q = k * 3;",
      expect: "T1.149",
    },
    {
      // **The zero normal normalised** (I137): `unit` answers the values
      // unchanged at zero length; dividing gives `NaN`, and the flat grid's
      // degenerate faces carry it.
      name: "ZERO-DIVIDED: unit3 divides at zero length",
      file: SURFACE,
      from: "  return n === 0 ? { x, y, z } : { x: x / n, y: y / n, z: z / n };",
      to: "  return { x: x / n, y: y / n, z: z / n };",
      expect: "T1.149",
    },
    {
      // **The cull's sign test loses its blind spot** (C12 I96, F473). `>= 0` culls
      // the zero-normal faces along with the back ones — the repair §6j
      // declines — and GM4 is the row that says the blind spot is real.
      name: "the cull drops a face whose normal is exactly zero",
      file: SURFACE,
      from: "  return (n.x * (cx - e.x) + n.y * (cy - e.y) + n.z * (cz - e.z)) * tri.skin.cull > 0;",
      to: "  return (n.x * (cx - e.x) + n.y * (cy - e.y) + n.z * (cz - e.z)) * tri.skin.cull >= 0;",
      expect: "GM4",
    },
    {
      // **The cull reads a view-space constant** (C12 I95, F460), which is the
      // orthographic limit. A cube shows the same face count from every
      // camera, so GM3's 2 / 4 / 6 collapses.
      name: "the cull tests the view direction rather than the eye",
      file: SURFACE,
      from: "  return (n.x * (cx - e.x) + n.y * (cy - e.y) + n.z * (cz - e.z)) * tri.skin.cull > 0;",
      to: "  return (n.x * basis.forward.x + n.y * basis.forward.y + n.z * basis.forward.z) * tri.skin.cull > 0;",
      expect: "GM3",
    },
    {
      // **The light stops being view-fixed** (C04 I79, F474). The whole of
      // GM3's second half is that `π/4` is a symmetry plane *of the camera*,
      // so a world-fixed studio light removes the symmetry and the two
      // clusters become three.
      name: "the studio light is world-fixed",
      file: SURFACE,
      from: '  if (light === undefined || light === "studio") return STUDIO;',
      to:
        '  if (light === undefined || light === "studio")\n' +
        "    return unit(viewDir(basis, { x: 0.5, y: 0.7, z: 1 }));",
      expect: "GM3",
    },
    {
      // **The light points along the eye instead of up-and-right.** A headlight
      // lights every visible face of a convex body almost equally, so three
      // intensities become one — the mutation that says GM3's cluster count is
      // reading the shading and not merely the geometry.
      name: "the studio light is a headlight",
      file: SURFACE,
      from: "const STUDIO: Vec3 = unit({ x: 0.5, y: 0.7, z: -1 });",
      to: "const STUDIO: Vec3 = unit({ x: 0, y: 0, z: -1 });",
      expect: "GM3",
    },
    {
      // **A degenerate face is dropped at the cull** (C12 I95, §6j row 4). The
      // repair §6j declines, written the way a reader would reach for it — and
      // GM4's *none of them can be culled* is what refuses it.
      name: "a face with no normal is culled",
      file: SURFACE,
      from: "export function backfaceCulled(tri: Tri3, basis: Basis): boolean {\n  if (tri.skin.cull === 0) return false;",
      to:
        "export function backfaceCulled(tri: Tri3, basis: Basis): boolean {\n" +
        "  if (Math.hypot(tri.fn.x, tri.fn.y, tri.fn.z) < 1e-12) return true;\n" +
        "  if (tri.skin.cull === 0) return false;",
      expect: "GM4",
    },
    {
      // **A zero-projected-area face is dropped rather than stroked** (C12 I94,
      // F456). The edge-on plane is the case the design note scheduled first,
      // and this is the ruling it argued against: the three coordinate planes
      // draw nothing, and GM2 is the row that holds it.
      name: "a triangle under a sample of projected area draws nothing",
      file: SURFACE,
      from: "  if (!(Math.abs(area) >= 1)) {\n    strokeThin(a, b, c, tri, e, grid, depth, light, span, paint);",
      to: "  if (!(Math.abs(area) >= 1)) {",
      expect: "GM2",
    },
    {
      // **The stroke arm takes every triangle**, which is the other direction
      // and the one that reads as harmless. A surface drawn as its own
      // wireframe keeps its silhouette and loses its interior, so the flat
      // plane and the Gaussian grow holes where GM8 asserts zero.
      name: "every triangle takes the stroke arm",
      file: SURFACE,
      from: "  if (!(Math.abs(area) >= 1)) {",
      to: "  if (true) {",
      expect: "GM8",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
