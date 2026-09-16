// C12 I134 — toScreen projects in scalars, and the record is project's to the
// bit. Mutated.
//
// **`project` is the reference and T1.146 compares against it** over every
// vertex the raster stamps; the goldens see whichever divergence reaches a
// frame. The orthographic arm is the one a perspective-only corpus would
// never exercise, which is why the row carries two orthographic cameras.
//
// **The context is not mutated here.** Moving the clip path's closure back
// into `drawTri` fails nothing the tests can see — a context per entry is
// a cost the goldens and the counting probes cannot read — and T6.110
// records that survivor in the spec rather than this file teaching its
// reader to skim a survivors column.
//
// **Nor is the near return.** `if (vz <= NEAR) return null` is what makes
// the record `project`'s as a function, and no row can reach it from the
// raster: `clipNear` cuts at `NEAR · (1 + 1e-6)` and the direct path requires
// every corner beyond `NEAR`, so `toScreen` never sees a vertex at or behind
// the plane. Loosening it to `vz <= 0` survived on the first run — the
// caller is what makes the arm unreachable — and T6.110 records it.
//
// **The control drops the half-shift on `x`**: every vertex lands half a
// frame to the left, T1.146 fails on its first vertex and every mesh golden
// moves.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/plot-3d.test.ts test/golden/plot-meshes.test.ts";
const S3 = "src/presentation/plot/surface3.ts";

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
    from: "  const px = sx * 0.5 + 0.5;\n",
    to: "  const px = sx * 0.5;\n",
    why: "every vertex lands half a frame left; T1.146 fails on its first vertex and every mesh golden moves",
  },
  mutations: [
    {
      // **The orthographic divisor replaced by the view depth**: perspective
      // for every camera. The perspective corpus agrees; the orthographic rows
      // of T1.146 do not.
      name: "ORTHO-DIVISOR: the divisor is the view depth under both projections",
      file: S3,
      from: "  const divisor = basis.orthographic ? basis.distance : vz;\n",
      to: "  const divisor = vz;\n",
      expect: "T1.146",
    },
    {
      // **The aspect fold dropped**: `x` stretched by the aspect on every
      // vertex.
      name: "ASPECT-DROPPED: sx is not divided by the aspect",
      file: S3,
      from: "  const sx = (vx * basis.f) / basis.aspect / divisor;\n",
      to: "  const sx = (vx * basis.f) / divisor;\n",
      expect: "T1.146",
    },
    {
      // **`y` shifted the way `x` is**: the vertical axis inverted.
      name: "Y-UNFLIPPED: py is sy · 0.5 + 0.5",
      file: S3,
      from: "  const py = 0.5 - sy * 0.5;\n",
      to: "  const py = sy * 0.5 + 0.5;\n",
      expect: "T1.146",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
