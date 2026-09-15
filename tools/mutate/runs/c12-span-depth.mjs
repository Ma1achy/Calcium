// C12 I131 — the ramp span reads the view depth as project's first dot and
// nothing more, and the cull test allocates nothing. Mutated.
//
// **What the goldens cannot see is what the row is for.** Both rewrites are
// the same doubles from the same operations, so every mesh frame holds; a
// last-bit difference from a reordered division, or a behind-eye vertex read
// into the ramp, is what T1.143's seeded corpus and the reference forms see.
//
// **Left out, with their reasons.** The span reading through `project` again
// is byte-identical and slower — the mutation the row cannot see, T6.107 says
// so, and only F1169's line ticks can. The centroid divided once after the
// dot **survived on the first run**: the cull is a sign, and a last-bit change
// in the dot moves no verdict on any corpus the row can hold; T6.107 records
// it and the goldens are what hold the operation order.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/plot-3d.test.ts test/unit/plot-geometry.test.ts test/golden/plot-meshes.test.ts";
const P = "src/presentation/plot/project3.ts";

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
    from: "  return z <= NEAR ? null : z;\n}",
    to: "  return z <= NEAR ? null : z + 1;\n}",
    why: "every depth the span reads is one too far; T1.143's bit-for-bit arm fails on the first projected point",
  },
  mutations: [
    {
      // **The near cull dropped**: a vertex at or behind the eye hands the
      // ramp a depth `project` would have refused, and the span keys to it.
      name: "NEAR-DROPPED: viewDepth answers for a point project refuses",
      file: P,
      from: "  return z <= NEAR ? null : z;\n}",
      to: "  return z;\n}",
      expect: "T1.143",
    },
    {
      // **The depth taken along `up`**: a different dot, read by the span as
      // the depth, and the first projected point is off in more than a bit.
      name: "DEPTH-ALONG-UP: viewDepth dots with the basis's up vector",
      file: P,
      from: "  const f = basis.forward;\n  const z = (p.x - e.x) * f.x + (p.y - e.y) * f.y + (p.z - e.z) * f.z;\n  return z <= NEAR ? null : z;",
      to: "  const f = basis.up;\n  const z = (p.x - e.x) * f.x + (p.y - e.y) * f.y + (p.z - e.z) * f.z;\n  return z <= NEAR ? null : z;",
      expect: "T1.143",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
