// C12 I139 — the geometry is lanes: position, normal and value lanes per
// raster vertex, an index lane per face, an eight-double screen slot under a
// stamp lane with the negation marking a refused vertex and three spare slots
// for the clip path's cuts. Mutated (T6.115, F1184).
//
// **The frame cannot show most of it.** The lanes hold the same doubles at
// another address, so the goldens hold either. What sees a cut is the shape
// row — T1.149's lane order and count against the object reference, T1.151's
// count on the straddling frames and its stamp-by-stamp read against
// `project`, T1.147's span from lanes with no faces, T1.143's cull against the
// allocating form.
//
// **The control is one raster vertex too many.** `makeLanes(n + 1, faces)`
// changes no byte of any frame — the extra slot is never named by a face — and
// T1.149's count and PR12b see it.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/plot-3d.test.ts test/unit/plot-surface3d.test.ts test/golden/plot-meshes.test.ts";
const SF = "src/presentation/plot/surface3.ts";
const SC = "src/presentation/plot/scatter3.ts";

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
    file: SF,
    from: "  const lanes = makeLanes(n, faces);",
    to: "  const lanes = makeLanes(n + 1, faces);",
    why: "one raster vertex no face names: no byte of any frame moves and T1.149's count and PR12b see it",
  },
  mutations: [
    {
      // **The index lane off by one.** Every smooth face after the first names
      // the vertex before the one it meant; the picture is a different mesh.
      name: "INDEX-OFF-BY-ONE: a smooth face's index is one below its vertex",
      file: SF,
      from: "        idxLane[f * 3 + m] = j;",
      to: "        idxLane[f * 3 + m] = j > 0 ? j - 1 : j;",
      expect: "T1.149",
    },
    {
      // **The negated stamp not written.** A refused vertex is projected again
      // at every corner that names it, and the straddling count climbs.
      name: "REFUSAL-UNSTAMPED: a refused vertex is projected at every corner",
      file: SF,
      from: "  L.stamps[k] = shown ? frame.stamp : -frame.stamp;",
      to: "  if (shown) L.stamps[k] = frame.stamp;",
      expect: "T1.151",
    },
    {
      // **The spare slots aliased onto the last vertex.** A cut overwrites the
      // last vertex's record under its stamp; the straddling frame reads the
      // cut where it wanted the vertex.
      name: "SPARE-ALIASED: the cuts land in the last vertex's slot",
      file: SF,
      from: "      const slot = L.count + spare;",
      to: "      const slot = L.count - 1;",
      expect: "T1.151",
    },
    {
      // **The span reads the index lane's length.** Lanes built with no faces
      // fold nothing and the span comes back open.
      name: "SPAN-BY-FACES: the corner pass runs over the index lane's length",
      file: SF,
      from: "  for (let i = 0; i < lanes.count; i += 1) { // cells-ok — a corner index",
      to: "  for (let i = 0; i < lanes.idx.length / 3; i += 1) { // cells-ok — a corner index",
      expect: "T1.147",
    },
    {
      // **The cull reads the normal lane for a position.** The centroid is a
      // sum of unit normals and the allocating form disagrees.
      name: "CULL-FROM-NORMALS: the centroid is read from the normal lane",
      file: SF,
      from: "  const L = tri.lanes;\n  const P = L.pos;\n  const o = tri.f * 3;",
      to: "  const L = tri.lanes;\n  const P = L.nrm;\n  const o = tri.f * 3;",
      expect: "T1.143",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
