// C12 I127 — the ramp span over each surface's referenced vertices, once each,
// held beside the triangles. Mutated.
//
// **The shape this run exists to catch is a set that is almost the right set.**
// The corner walk this replaced visited every corner of every face; the held
// set is its support. The two sets that differ from it are *every vertex* —
// which includes a vertex no face references, in the extent and drawn nowhere
// — and *no vertex*, which keys the ramps to the clouds and paths alone. Both
// leave every count and every bounds assertion standing; PR12 tells the first
// apart on the frame with a stray placed nearest the eye, and the mesh goldens
// at 24-bit tell the second, because the depth ramp moves.
//
// **The control is the span skipping the surfaces at the read.** That is the
// old *clouds only* defect one carrier along (C04 I79), and the goldens must
// see it — a run where they do not is a run whose goldens cannot see the ramp,
// and nothing below would mean anything.
//
// **Left out, with its reason.** The single-surface pass-through of the held
// `corners` array is byte-identical to a copy and no row can see it; the
// order of the set is a first-occurrence order and every fold over it is
// order-independent, so a shuffled set is not a mutation either.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/plot-3d.test.ts test/unit/plot-surface3d.test.ts test/golden/plot-meshes.test.ts";
const S3 = "src/presentation/plot/scatter3.ts";
const SF = "src/presentation/plot/surface3.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const BUFFER = 256 * 1024 * 1024;
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: BUFFER });
  } catch (e) {
    if (e.killed === true) return "the suite did not return — timed out";
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: S3,
    from: "  const span = spanOverCorners(scene.basis, scene.corners, nearD, farD, loV, hiV);",
    to: "  const span = spanOverCorners(scene.basis, [], nearD, farD, loV, hiV);",
    why: "the ramps keyed to the clouds and paths alone — C04 I79's defect at the read; the mesh goldens must move or they cannot see the ramp",
  },
  mutations: [
    {
      // **Every vertex, referenced or not.** A stray in the extent and drawn
      // nowhere becomes the nearest reading and the depth ramp moves. PR12
      // places one nearest the eye and compares the frame with the mesh alone.
      name: "SPAN-EVERY-VERTEX: the referenced set is every vertex",
      file: SF,
      from: "    for (let m = 0; m < 3; m += 1) { // cells-ok — a corner index\n      const k = face[m] as number;\n      if (seen[k] === 1) continue;",
      to: "    for (let m = 0; m < (f === 0 ? count : 3); m += 1) { // cells-ok — a corner index\n      const k = f === 0 ? m : face[m] as number;\n      if (seen[k] === 1) continue;",
      expect: "PR12",
    },
    {
      // **No vertex.** The set is built empty, the ramps key to nothing the
      // surface holds, and PR12b's count is the row that names it; the goldens
      // move too.
      name: "CORNERS-EMPTY: the referenced set is never filled",
      file: SF,
      from: "      corners.push({ p: pts[k] as Vec3, v: values[k] });",
      to: "      seen[k] = 1;",
      expect: "PR12b",
    },
    {
      // **The value dropped from the set.** The depth ramp is unmoved and the
      // value ramp keys to nothing a surface holds; SF5 colours a height field
      // by value and reads the colours off the frame.
      name: "CORNER-VALUE-DROPPED: a corner carries no value",
      file: SF,
      from: "      corners.push({ p: pts[k] as Vec3, v: values[k] });",
      to: "      corners.push({ p: pts[k] as Vec3, v: undefined });",
      expect: "SF5",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
