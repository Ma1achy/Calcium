// C12 I126 — the extent scratch: each carrier's own extent held in the caller's
// scratch, the block's the union, and a surface's slot carrying its extent and
// its geometry together. Mutated.
//
// **The shape this run exists to catch is a cache that is right about the
// picture and wrong about the slot.** Every mutation here but two leaves the
// frame byte-identical at the first camera and wrong only when something
// *moves* — a range, a cloud, the block extent under a held surface — which is
// §6o's whole argument: a cache fails where two rules both hold, and a suite
// indexed by inputs renders each block once and agrees. So the rows aimed at
// are PR11c and PR11d, which render the moved block against the bare arm, and
// PR11e, which checks the fold against `extentOf` over the concatenation
// rather than against itself.
//
// **The control bypasses the scratch for a cloud's extent.** That is a correct,
// slower answer — every byte and every equality row accepts it — and only
// PR11's *each carrier written once* can see it. A run where the control
// survives is a run that cannot tell held from recomputed, which is the subject.
//
// **Left out, with reasons.** `heldOf` ignoring `from` is I107's identity check
// and c12-plot3d's to mutate, not this run's. The single-surface pass-through
// (`built[0]` handed through rather than copied) is byte-identical either way
// and no row can see it — it is the bench's reading (F1153). The write landing
// before the build (§6o row 8) needs a throwing `trianglesOf`, and the only
// throw there is F508's spread ceiling at 125k faces.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/plot-3d.test.ts test/golden/plot-meshes.test.ts";
const S3 = "src/presentation/plot/scatter3.ts";
const P3 = "src/presentation/plot/project3.ts";

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
    from: "  if (scratch === undefined) return boundsOf(points);\n  const held = scratch.get(points, POINTS_KEY) as HeldPoints | undefined;",
    to: "  if (scratch === undefined || scratch !== undefined) return boundsOf(points);\n  const held = scratch.get(points, POINTS_KEY) as HeldPoints | undefined;",
    why: "a cloud's extent recomputed every frame is a correct, slower answer that every byte row accepts; only PR11's write count sees it, and a run where it survives cannot tell held from recomputed",
  },
  mutations: [
    {
      // **The empty answer as the unit cube** (§6o row 12). An empty cloud
      // beside a surface widens the extent to ±1 and the figure draws smaller
      // inside the box — the wrong-scale failure row 1 exists for. PR11b renders
      // the surface beside an empty cloud against the surface alone; PR11e asks
      // `boundsOf([])` directly.
      name: "EMPTY-IS-UNIT: boundsOf([]) answers the unit cube",
      file: P3,
      from: "  if (points.length === 0) return undefined; // cells-ok — a point count, not a width",
      to: "  if (points.length === 0) return UNIT_EXTENT; // cells-ok — a point count, not a width",
      expect: "PR11b",
    },
    {
      // **The ranges out of the key** (§6o row 10). A grid's points are laid
      // across `xRange`, so the same `heights` under a moved range is a
      // different extent; keyed on the carriers alone the old extent is served
      // and the surface draws at the wrong scale. PR11d moves the range.
      name: "RANGES-NOT-IN-KEY: surfaceKey is constant",
      file: S3,
      from: "  return `${r(sf.xRange)}\\u0000${r(sf.yRange)}`;",
      to: "  return \"\";",
      expect: "PR11d",
    },
    {
      // **The geometry's key unchecked inside a held slot** (§6o row 10). The
      // slot is valid — its carriers and ranges did not move — and the
      // triangles inside it were built against an extent a cloud has since
      // moved. PR11c renders the moved block against the bare arm.
      name: "GEOMETRY-KEY-IGNORED: a held slot's triangles are served whatever the block extent",
      file: S3,
      from: "  if (held?.geometry !== undefined && held.geometry.key === key) return held.geometry.tris;",
      to: "  if (held?.geometry !== undefined) return held.geometry.tris;",
      expect: "PR11c",
    },
    {
      // **The fold's minimum taken as a maximum.** Both arms of `drawnOf` go
      // through `unionOf`, so bare-versus-scratch cannot see it; PR11e checks
      // the fold against `extentOf` over the concatenation, which is the
      // independent reference.
      name: "UNION-MAX-FOR-MIN: unionOf's min is Math.max",
      file: P3,
      from: "    min: { x: Math.min(a.min.x, b.min.x), y: Math.min(a.min.y, b.min.y), z: Math.min(a.min.z, b.min.z) },",
      to: "    min: { x: Math.max(a.min.x, b.min.x), y: Math.max(a.min.y, b.min.y), z: Math.max(a.min.z, b.min.z) },",
      expect: "PR11e",
    },
    {
      // **An empty carrier given a slot** (§6o row 12's clause). Correct and
      // harmless on the frame; PR11 counts the empty cloud's writes at zero.
      name: "EMPTY-TAKES-A-SLOT: pointsExtent consults the store for an empty carrier",
      file: S3,
      from: "  if (points.length === 0) return undefined; // cells-ok — a point count\n  if (scratch === undefined) return boundsOf(points);",
      to: "  if (scratch === undefined) return boundsOf(points);",
      expect: "PR11",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
