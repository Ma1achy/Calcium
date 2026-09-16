// C12 I138 — a sub-cell triangle is not walked when every cell its edge samples
// can reach already holds a depth at or nearer than its nearest corner. Mutated.
//
// **The frame cannot show the cut.** A skipped triangle would have written
// nothing, so the goldens hold 458 frames of either build; what a row sees is
// the count `plot3d.hidden` — which is what the control moves — and the two
// rounding cases the margins exist for, each constructed so that a check
// without its margin marks a triangle the walk writes.
//
// **Left out, with its reason.** The bound made strict (`<` for `<=`) marks
// fewer triangles and every one it marks is hidden — conservative, and no row
// can see it; the paired bench is what would.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/plot-surface3d.test.ts test/golden/plot-meshes.test.ts";
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
    from: "  if (hiddenThin(a, b, c, grid, depth)) {",
    to: "  if (false && hiddenThin(a, b, c, grid, depth)) {",
    why: "the check removed: no byte of any frame moves and the count is zero; T1.150's count arm alone sees it",
  },
  mutations: [
    {
      // **The depth margin dropped.** `1` against `1e-20`: the far sample is
      // `0`, the cell holds `fround(1e-20)`, and the check marks the triangle.
      name: "Z-MARGIN-DROPPED: the floor is the nearest corner exactly",
      file: SF,
      from: "  const zlo = Math.fround(Math.min(a.vz, b.vz, c.vz) - zspan * MARGIN);",
      to: "  const zlo = Math.fround(Math.min(a.vz, b.vz, c.vz) - zspan * 0);",
      expect: "T1.150",
    },
    {
      // **The coordinate margin dropped.** The corner at `x = 1` on a 49-wide
      // grid: the walk floors to cell 0, the check scans from cell 1.
      name: "X-MARGIN-DROPPED: the cells are the corners' floors exactly",
      file: SF,
      from: "  const dx = Math.max(Math.abs(minx), Math.abs(maxx)) * MARGIN;",
      to: "  const dx = Math.max(Math.abs(minx), Math.abs(maxx)) * 0;",
      expect: "T1.150",
    },
    {
      // **The scan ignored.** Past the quick reject every triangle is hidden;
      // the corpus arm paints through a marked triangle and the goldens move.
      name: "SCAN-IGNORED: a cell above the floor does not unmark",
      file: SF,
      from: "      if (!((z[row + xx] as number) <= zlo)) return false;",
      to: "      if (!((z[row + xx] as number) <= zlo)) continue;",
      expect: "T1.150",
    },
    {
      // **The quick reject inverted.** A nearer first cell returns *walk*, so
      // almost nothing is marked and the bunny's count collapses.
      name: "QUICK-REJECT-INVERTED: a nearer corner cell means walk",
      file: SF,
      from: "  if (fx >= 0 && fy >= 0 && fx < w && fy < h && !((z[fy * w + fx] as number) <= zlo)) return false;",
      to: "  if (fx >= 0 && fy >= 0 && fx < w && fy < h && ((z[fy * w + fx] as number) <= zlo)) return false;",
      expect: "T1.150",
    },
    {
      // **The count dropped.** The skip happens and nothing records it.
      name: "COUNT-DROPPED: a skipped triangle is not counted",
      file: SF,
      from: "    depth.hidden[0] = (depth.hidden[0] as number) + 1;",
      to: "    depth.hidden[0] = (depth.hidden[0] as number) + 0;",
      expect: "T1.150",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
