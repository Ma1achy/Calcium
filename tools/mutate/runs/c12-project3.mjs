// C12 I86 and I84 — the projection's degenerates and the buffer. Mutated.
//
// **The row that matters is PR1's**, and the reason is the asymmetry between the
// five cases: four produce `NaN` and stop everything, so almost any assertion
// catches them. The fifth produces a finite coordinate inside the frame. The
// mutation that removes the cull therefore has to be caught by a row that knows
// the *wrong answer looks right* — and a row asserting bounds, or reading a
// frame, is satisfied by it.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/plot-3d.test.ts";
const P = "src/presentation/plot/project3.ts";

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
    file: P,
    // The near plane itself, asserted by PR2's control at one unit in front.
    from: "export const NEAR = 0.01;",
    to: "export const NEAR = 100;",
    why: "PR2's control projects a sample one unit ahead; a run where moving the near plane past it survives cannot see a kill",
  },
  mutations: [
    {
      // **The classic bug, and the whole reason PR1 is written first.** The cull
      // goes and the divide runs on a negative z: every sample behind the eye
      // lands inside the frame, mirrored through the origin.
      name: "the cull is gone — a negative view z divides anyway",
      file: P,
      from: "  if (z <= NEAR) return null;",
      to: "",
      expect: "PR1",
    },
    {
      // **The cull moved AFTER the divide**, which is the plausible mistake
      // rather than the careless one: it reads as a bounds check and it is one,
      // on a number that has already lost the sign it needed.
      name: "the cull is after the divide, on the projected coordinate",
      file: P,
      from: "  if (z <= NEAR) return null;\n  const x = dot(d, basis.right);",
      to: "  const x = dot(d, basis.right);",
      also: [{
        file: P,
        from: "  return { x: sx * 0.5 + 0.5, y: 0.5 - sy * 0.5, depth: z };",
        to: "  const px = sx * 0.5 + 0.5;\n  if (px < 0 || px > 1) return null;\n  return { x: px, y: 0.5 - sy * 0.5, depth: z };",
      }],
      expect: "PR1",
    },
    {
      // `z < 0` rather than `z <= NEAR`: a sample exactly at the eye survives
      // and divides by zero.
      name: "the near plane is zero, so the eye itself projects",
      file: P,
      from: "  if (z <= NEAR) return null;",
      to: "  if (z < 0) return null;",
      expect: "PR2",
    },
    {
      // **A zero extent maps to the minimum rather than the centre.** It is the
      // arm that looks most like the non-degenerate one, and it is wrong in a
      // direction nothing downstream can see: the figure is drawn against an
      // edge instead of through the middle.
      name: "a zero extent maps to the axis's minimum",
      file: P,
      from: "  hi === lo ? 0 : ((v - lo) / (hi - lo)) * 2 - 1;",
      to: "  hi === lo ? -1 : ((v - lo) / (hi - lo)) * 2 - 1;",
      expect: "PR4",
    },
    {
      // The guard removed entirely — the loud form, and the one PR5 is for.
      name: "a zero extent divides by zero",
      file: P,
      from: "  hi === lo ? 0 : ((v - lo) / (hi - lo)) * 2 - 1;",
      to: "  ((v - lo) / (hi - lo)) * 2 - 1;",
      expect: "PR4",
    },
    {
      // **The sample grid as a constant**, which is what the design note's own
      // figures invite: 80 x 48 is a measurement at 80x24 cells.
      name: "the sample grid is the measurement's own figure",
      file: P,
      from: "    ? { width: w, height: h * 2 } // cells-ok — two samples a cell, down",
      to: "    ? { width: 80, height: 48 } // cells-ok — two samples a cell, down",
      expect: "PR7",
    },
    {
      // **The scratch buffer**, which is the optimisation a 30fps orbit invites
      // and which SS24 cannot see because it is declared `const`.
      name: "the depth buffer is a module-level scratch array",
      file: P,
      from: "  const z = new Float32Array(w * h);\n  z.fill(Infinity);",
      to: "  const z = SCRATCH.length >= w * h ? SCRATCH.subarray(0, w * h) : new Float32Array(w * h);\n  z.fill(Infinity);",
      also: [{
        file: P,
        from: "export function createDepth(",
        to: "const SCRATCH = new Float32Array(4096);\n\nexport function createDepth(",
      }],
      expect: "PR8",
    },
    {
      // The depth test made inclusive, so a tie overwrites — which is the
      // difference between a stable draw order and one that depends on
      // rasterisation order.
      name: "the depth test accepts an equal depth",
      file: P,
      from: "  if (!(q < (d.z[i] as number))) return false;",
      to: "  if (!(q <= (d.z[i] as number))) return false;",
      expect: "PR8b",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
