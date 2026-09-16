// C12 I129 — the per-sample path: the lighting on scalars under `shade`'s
// wrapper, the sample handed to the painter as scalars, the thin stroke's
// edges through the scalar segment core. Mutated.
//
// **The shape this run exists to catch is a component crossed in a rewrite
// that moved thirty expressions.** Each is the same arithmetic in the same
// order as the object it replaced; a normal's `y` read from `x`, a view
// position lerped with the wrong corner, a reflection term dropped — each is
// a picture the goldens see and PR15 sees to the bit. The invariant's own
// claim — that nothing is allocated — no row can see: an allocation count
// under a test runner is the runner's, and `tools/bench/alloc3d.mjs` is the
// instrument. So the control is a crossed component the corpus can see and
// not a record built again, which it cannot.
//
// **Left out, with its reason.** The wrapper `shade` reordered to call
// `shadeAt` with `viewPos` before `normal` is a type error, not a mutation;
// `strokeSeg`'s own floor is c12-lines3d's to mutate, and the thin stroke's
// copy is mutated here.
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
    from: "      lane[LANE_NY] = a.ny * ua + b.ny * ub + c.ny * uc;",
    to: "      lane[LANE_NY] = a.nx * ua + b.nx * ub + c.nx * uc;",
    why: "the fill's normal takes its x for its y — the lighting moves on every face, which PR15 and the mesh goldens both see",
  },
  mutations: [
    {
      // **The flip dropped.** A normal facing away is lit as if it faced the
      // eye; the two-sided rule (§6h rows 5 and 7) goes, and a surface seen
      // from below turns to ambient sheet.
      name: "FLIP-DROPPED: the normal is not turned toward the eye",
      file: SF,
      from: "  const flip = rz > 0;",
      to: "  const flip = false;",
      expect: "SF",
    },
    {
      // **The zero-length normal divides.** `unit` hands the zero vector back
      // and `shadeAt` keeps that rule on components; dividing anyway gives
      // `NaN`, and a degenerate face turns from ambient to a hole (F456).
      name: "ZERO-NORMAL-DIVIDES: the scalar core divides a zero-length normal by its length",
      file: SF,
      from: "  const rx = len === 0 ? nx0 : nx0 / len;",
      to: "  const rx = nx0 / len;",
      expect: "SF2b",
    },
    {
      // **The reflection's eye vector unnormalised.** `toEye` was `unit(-vp)`;
      // dividing by nothing leaves the specular term scaled by the distance,
      // and the highlight moves with the camera's radius. PR15 cannot see it —
      // its reference is `shade`, which is this core — so the goldens are the row.
      name: "TO-EYE-UNNORMALISED: the reflection reads the raw view position",
      file: SF,
      from: "  const tx = elen === 0 ? ex : ex / elen;",
      to: "  const tx = ex;",
      expect: "24bit",
    },
    {
      // **The thin stroke's view position lerped from the wrong corner.** The
      // depth is right, the lighting reads `q`'s position at every `t`, and
      // the stroked samples take the far corner's shade.
      name: "THIN-VP-FROM-Q: the stroke's view position is q's",
      file: SF,
      from: "    lane[LANE_VX] = p.vx + (q.vx - p.vx) * t;\n    lane[LANE_VY] = p.vy + (q.vy - p.vy) * t;",
      to: "    lane[LANE_VX] = q.vx;\n    lane[LANE_VY] = q.vy;",
      expect: "PR15 thin",
    },
    {
      // **The thin stroke's copy rounds where `strokeSeg` floors.** F453's
      // defect again, in the second copy of the rule (F1159): sample `i` over
      // `[i − 0.5, i + 0.5)` offsets every stroked edge by up to a sample, and
      // PR15 thin — the referee — sees it.
      name: "SEG-ROUNDED: the thin stroke's copy of the stepping rounds its coordinates",
      file: SF,
      from: "    const px = Math.floor(x0 + (x1 - x0) * t); // cells-ok — a sample coordinate\n    const py = Math.floor(y0 + (y1 - y0) * t); // cells-ok — a sample coordinate\n    const z = p.vz + (q.vz - p.vz) * t;",
      to: "    const px = Math.round(x0 + (x1 - x0) * t); // cells-ok — a sample coordinate\n    const py = Math.round(y0 + (y1 - y0) * t); // cells-ok — a sample coordinate\n    const z = p.vz + (q.vz - p.vz) * t;",
      expect: "PR15 thin",
    },
    {
      // **The step count from the minor axis.** `strokeSeg` steps on the
      // dominant screen axis so no slope leaves gaps; the other axis leaves a
      // shallow edge dotted, which the referee and the meshes' goldens see.
      name: "STEPS-MINOR-AXIS: the thin stroke steps on the shorter axis",
      file: SF,
      from: "  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)))); // cells-ok — a sample count\n  for (let s = 0; s <= steps; s += 1) { // cells-ok — a sample index",
      to: "  const steps = Math.max(1, Math.ceil(Math.min(Math.abs(x1 - x0), Math.abs(y1 - y0)))); // cells-ok — a sample count\n  for (let s = 0; s <= steps; s += 1) { // cells-ok — a sample index",
      expect: "PR15 thin",
    },
    {
      // **The stroke's edge flag ignores the wire.** `wireframe: false` marks
      // its edges anyway and the dots arm draws a cage over a surface that
      // asked for none.
      name: "THIN-EDGE-IGNORES-WIRE: a stroked edge is own regardless of wire",
      file: SF,
      from: "  thinEdge(a, b, e[0] && wire, series, grid, depth, light, span, paint);",
      to: "  thinEdge(a, b, e[0], series, grid, depth, light, span, paint);",
      expect: "WF",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
