// C12 I97 — the real meshes, and whether a fixture nobody chose can still be
// asserted wrongly.
//
// **The rows here are about the fixture more than the renderer**, so most of the
// mutations are on the *loader* rather than on `surface3.ts`. That is the
// subject: §6k's finding is that two of the three reasons the meshes were chosen
// for are absent from all three, and the risk it leaves is a suite that reads
// the right file the wrong way round.
//
// **Which rows this reaches, stated.** Five mutations kill RM1, RM3, RM4 and
// RM7. **RM2, RM5 and RM6 have none**, and for §6j's reason again: each compares
// two renders of the same renderer — the teapot against itself at four heights,
// Suzanne flat against smooth, the bunny against a grid — so a mutation moves
// both sides and the relation survives. RM1's own digest check is the control.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/plot-meshes.test.ts";
const OBJ = "test/support/obj.ts";
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
    file: OBJ,
    // **The quad fan, and the first control was vacuous.** Disabling the digest
    // check was the obvious choice and the harness refused it: the digest only
    // throws when the file has changed, and it has not, so the mutation cannot
    // be caught by anything — a fabricated violation with nothing to violate.
    // The fan is asserted twice: Suzanne's 968 faces come from 468 quads, and
    // the parser control row asserts a quad yields two triangles.
    from: "      for (let k = 1; k + 1 < idx.length; k += 1) {",
    to: "      for (let k = 1; k + 1 < idx.length && k < 2; k += 1) {",
    why: "RM1 asserts Suzanne's 968 faces, which come from 468 quads fanned in two; a run where fanning one survives is not reading the fixture",
  },
  mutations: [
    {
      // **The up-axis, which is the finding** (F476). Loaded as the file has it,
      // every mesh lies on its back — and the ink count barely moves, so only
      // the interior holes say so.
      name: "the loader leaves the mesh in the file's own Y-up frame",
      file: OBJ,
      from: "  vertices: m.vertices.map((v) => ({ x: v.x, y: -v.z, z: v.y })),",
      to: "  vertices: m.vertices,",
      expect: "RM1",
    },
    {
      // **The rotation loses its handedness.** `y: v.z` rather than `y: -v.z` is
      // a mirror rather than a rotation, so the mesh is upright and reversed —
      // and the winding with it, which is what RM3's cull sign reads.
      name: "the rotation is a mirror",
      file: OBJ,
      from: "  vertices: m.vertices.map((v) => ({ x: v.x, y: -v.z, z: v.y })),",
      to: "  vertices: m.vertices.map((v) => ({ x: v.x, y: v.z, z: v.y })),",
      expect: "RM3",
    },
    {
      // **Negative face indices read as absolute**, which is the OBJ detail a
      // naive reader gets wrong silently — every face lands on one vertex and
      // the mesh is a point. It is why the parser has a control row.
      name: "negative face indices are not relative to the vertices seen",
      file: OBJ,
      from: "          return n < 0 ? vertices.length + n : n - 1;",
      to: "          return n - 1;",
      expect: "RM1",
    },
    {
      // **The cull ignores `closed`** (C12 I95), so a mesh that declares nothing
      // is culled anyway. RM4's pair is what catches it: the open meshes stop
      // differing from their own culled versions.
      name: "the cull runs whether or not the mesh declares itself closed",
      file: SURFACE,
      from: "  if (s.closed !== true) return 0;",
      to: "",
      expect: "RM4",
    },
    {
      // **The light loses its direction** (C04 I79). A headlight lights a convex
      // body evenly, so the up-and-right ratio collapses toward 1 — which no
      // stripped frame can see and RM7 reads off the colour.
      name: "the studio light points along the eye",
      file: SURFACE,
      from: "const STUDIO: Vec3 = unit({ x: 0.5, y: 0.7, z: -1 });",
      to: "const STUDIO: Vec3 = unit({ x: 0, y: 0, z: -1 });",
      expect: "RM7",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
