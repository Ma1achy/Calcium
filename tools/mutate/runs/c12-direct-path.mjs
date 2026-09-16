// C12 I128 — the direct path: a triangle wholly in front of the near plane is
// handed to the fill without the clip, one flat screen record a vertex, scalar
// bookkeeping in the fill and explicit edges in the thin stroke. Mutated.
//
// **The shape this run exists to catch is a rewrite that moved an expression.**
// Every line here is the same arithmetic in the same order as the objects it
// replaced, and the goldens hold 458 frames of it; a component read from the
// wrong basis vector, an edge length paired with the wrong edge, a thin edge
// left out — each is a picture the goldens or a WF row can see. The direct
// path itself is the one thing they cannot: taking the clip on every triangle
// is byte-identical and slower, which is what the control is, and only PR13's
// `plot3d.clip` count sees it.
//
// **Left out, with its reason.** The scalar view depths in `drawTri` reordered
// (`f.x * (p.x − e.x)` for `(p.x − e.x) * f.x`) are the same double, since
// multiplication commutes exactly; a mutation that changes no bit is not a
// mutation. `shade` is untouched by the rewrite and c12-surface3d owns it.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/plot-3d.test.ts test/unit/plot-surface3d.test.ts test/golden/plot-meshes.test.ts";
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
    file: SF,
    from: "  if (za > NEAR && zb > NEAR && zc > NEAR) {\n    const sa = screenOf(tri.a, basis, grid, frame);",
    to: "  if (za > NEAR && zb > NEAR && zc > NEAR && false) {\n    const sa = screenOf(tri.a, basis, grid, frame);",
    why: "every triangle takes the clip — the same three vertices back, byte-identical and slower; only PR13's count of the front cameras sees it",
  },
  mutations: [
    {
      // **Never clip.** A straddling face goes to the direct path, a corner
      // behind the plane projects to `null`, and the face vanishes where the
      // clip would have drawn its front part up to the cut. WF8 draws that cut.
      name: "NEVER-CLIP: a straddling triangle takes the direct path",
      file: SF,
      from: "  if (za > NEAR && zb > NEAR && zc > NEAR) {\n    const sa = screenOf(tri.a, basis, grid, frame);",
      to: "  if (za > NEAR || zb > NEAR || zc > NEAR) {\n    const sa = screenOf(tri.a, basis, grid, frame);",
      expect: "WF8",
    },
    {
      // **A view component from the wrong basis vector.** `vy` read along
      // `right` skews every view position; the lighting reads it through
      // `toEye`, and the frame moves.
      name: "VIEW-Y-ALONG-RIGHT: the view position's y is its x",
      file: SF,
      // Anchored on the scalar the projection and both record arms read (C12 I134).
      from: "  const vy = dx * u.x + dy * u.y + dz * u.z;",
      to: "  const vy = dx * r.x + dy * r.y + dz * r.z;",
      expect: "24bit",
    },
    {
      // **An edge length paired with the wrong edge.** The edge band's width
      // is `w / len`; the second edge measured by the first's length draws the
      // band at the wrong width — **and survived WF5 on the first run**, because
      // a grid cell's legs are equal and the meshes' faces near enough to it
      // that no sample moved. PR13b draws a 1 : 4 scalene triangle under every
      // cyclic vertex order; the band is the geometry's, so the sets agree, and
      // under this mutation which edge gets the wrong length changes with the
      // order.
      name: "EDGE-LENGTH-CROSSED: the second edge's band uses the first edge's length",
      file: SF,
      from: "            || (e[1] && w1 / len1 < EDGE_HALF)",
      to: "            || (e[1] && w1 / len0 < EDGE_HALF)",
      expect: "PR13b",
    },
    {
      // **A thin edge left out.** The explicit edges replaced a `pairs` array;
      // dropping the third draws a sub-sample triangle with two of its three
      // sides, which the meshes' goldens see because most bunny faces are thin.
      name: "THIN-EDGE-DROPPED: the closing edge of a thin triangle is not stroked",
      file: SF,
      from: "  thinEdge(b, c, e[1] && wire, series, grid, depth, light, span, paint);\n  thinEdge(c, a, e[2] && wire, series, grid, depth, light, span, paint);",
      to: "  thinEdge(b, c, e[1] && wire, series, grid, depth, light, span, paint);",
      expect: "24bit",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
