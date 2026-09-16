// C12 I131, I135 — the ramp span reads the view depth as project's first dot
// and nothing more, in one function over the corners holding its bounds in
// scalars, and the cull test allocates nothing. Mutated.
//
// **What the goldens cannot see is what the row is for.** Both rewrites are
// the same doubles from the same operations, so every mesh frame holds; a
// last-bit difference from a reordered division, or a behind-eye vertex read
// into the ramp, is what T1.147's and T1.143's seeded corpora and the
// reference forms see.
//
// **Left out, with their reasons.** The span reading through `project` again
// is byte-identical and slower — the mutation the row cannot see, T6.107 says
// so, and only F1169's line ticks can. The four bounds captured by a closure
// again is the same: the same operations in the same order, and only the heap
// sample and the paired bench see a context write (T6.111). The centroid divided once after the
// dot **survived on the first run**: the cull is a sign, and a last-bit change
// in the dot moves no verdict on any corpus the row can hold; T6.107 records
// it and the goldens are what hold the operation order.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/plot-3d.test.ts test/unit/plot-geometry.test.ts test/golden/plot-meshes.test.ts";
const P = "src/presentation/plot/surface3.ts";

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
    file: P,
    from: "    if (z <= NEAR) continue;\n    if (z < nearD || z !== z) nearD = z;",
    to: "    if (z <= NEAR) continue;\n    if (z < nearD || z !== z) nearD = z + 1;",
    why: "the near bound is one too far; T1.147's nearD is off by one against project",
  },
  mutations: [
    {
      // **The near cull dropped**: a vertex at or behind the eye hands the
      // ramp a depth `project` would have refused, and the span keys to it.
      name: "NEAR-DROPPED: the corner pass reads a corner project refuses",
      file: P,
      from: "    if (z <= NEAR) continue;\n    if (z < nearD || z !== z) nearD = z;",
      to: "    if (z < nearD || z !== z) nearD = z;",
      expect: "T1.147",
    },
    {
      // **The depth taken along `up`**: a different dot, read by the span as
      // the depth, and the first projected point is off in more than a bit.
      name: "DEPTH-ALONG-UP: the corner pass dots with the basis's up vector",
      file: P,
      from: "  const f = basis.forward;\n  for (let i = 0; i < corners.length; i += 1) {",
      to: "  const f = basis.up;\n  for (let i = 0; i < corners.length; i += 1) {",
      expect: "T1.147",
    },
    {
      // **The incoming bounds dropped**: the pass starts from open bounds
      // whatever the clouds and paths set, and the enclosing-bounds arm reads
      // the corpus where it expected the hand-in.
      name: "INCOMING-DROPPED: the pass starts from open bounds whatever it is handed",
      file: P,
      from: "  const e = basis.eye;\n  const f = basis.forward;\n  for (let i = 0; i < corners.length; i += 1) {",
      to: "  nearD = Infinity; farD = -Infinity; loV = Infinity; hiV = -Infinity;\n  const e = basis.eye;\n  const f = basis.forward;\n  for (let i = 0; i < corners.length; i += 1) {",
      expect: "T1.147",
    },
    {
      // **The value bounds swapped**: `loV` takes the maximum, and the value
      // arm reads the greatest value where the least was.
      name: "VALUE-SWAPPED: loV takes the maximum",
      file: P,
      from: "      if (v < loV || v !== v || (v === 0 && loV === 0 && 1 / v < 0)) loV = v;",
      to: "      if (v > loV || v !== v || (v === 0 && loV === 0 && 1 / v < 0)) loV = v;",
      expect: "T1.147",
    },
    {
      // **The `NaN` arm dropped from the depth fold**: a comparison alone
      // skips a `NaN` depth where `Math.min` would take it (I135).
      name: "NAN-ARM-DROPPED: the depth fold is a bare comparison",
      file: P,
      from: "    if (z < nearD || z !== z) nearD = z;\n    if (z > farD || z !== z) farD = z;",
      to: "    if (z < nearD) nearD = z;\n    if (z > farD) farD = z;",
      expect: "T1.147",
    },
    {
      // **The signed-zero arm dropped from the value fold**: `+0` then `−0`
      // keeps `+0` for the least where `Math.min` answers `−0` (I135).
      name: "ZERO-ARM-DROPPED: the value fold ignores the sign of zero",
      file: P,
      from: "      if (v < loV || v !== v || (v === 0 && loV === 0 && 1 / v < 0)) loV = v;\n      if (v > hiV || v !== v || (v === 0 && hiV === 0 && 1 / v > 0)) hiV = v;",
      to: "      if (v < loV || v !== v) loV = v;\n      if (v > hiV || v !== v) hiV = v;",
      expect: "T1.147",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
