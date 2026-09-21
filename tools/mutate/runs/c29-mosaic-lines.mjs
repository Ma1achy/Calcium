// C29 1.7 — the mosaic's axes on the engine's rule, and the cut moved from the
// geometry to the paint. Mutated.
//
// **This is the step whose frames move, and every gate was green either way.**
// 458 goldens, 2,440 baseline frames and 6,281 rows all passed before MS10 and
// MS11 existed, because no fixture renders a mosaic whose weights are unequal
// at a width they do not divide. So the rows below are the only thing standing
// between this arithmetic and a silent rewrite of it.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/mosaic.test.ts test/contract/rows-arm.test.ts " +
  "test/contract/navigation-mosaic.test.ts test/edge/blocks.test.ts";
const M = "src/data/viewmodel/mosaic.ts";
const C = "src/presentation/blocks/kinds/containers.ts";

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
    file: M,
    // Every grid line one cell. The grid parses, the regions are in the right
    // order and the heights still agree; only the widths collapse. A pass that
    // cannot see this reads the parse and not the arithmetic.
    from: "    isCells(s) ? fixed[i]! : Math.max(1, share[i] ?? 0), // cells-ok — a cell count",
    to: "    isCells(s) ? fixed[i]! : 1, // cells-ok — a cell count",
    why: "the grid still parses and every region keeps its order; only the division collapses",
  },
  mutations: [
    {
      // **The leftover to the earliest line** — `spread`'s rule, which is what
      // this replaced. It agrees with largest remainder on equal weights, so
      // every mosaic that declares no shares is blind to it (C04 I42, F1219).
      name: "the leftover goes to the earliest line rather than the largest fraction",
      file: M,
      from: '  const share = largestRemainder(weights, Math.max(0, budget), "largest-remainder");',
      to: '  const share = largestRemainder(weights, Math.max(0, budget), "none");',
      expect: "MS10",
    },
    {
      // **The floor of one lost.** A proportion below a cell rounds to nothing,
      // and a three-column grid stops asking for three cells — which is the
      // premise C1 rests on and the reason the cut is reachable at all.
      name: "a line whose proportion falls below a cell is zero",
      file: M,
      from: "    isCells(s) ? fixed[i]! : Math.max(1, share[i] ?? 0), // cells-ok — a cell count",
      to: "    isCells(s) ? fixed[i]! : (share[i] ?? 0), // cells-ok — a cell count",
      expect: "MS11",
    },
    {
      // **Fixed shares divided with the weights.** A `{cells: n}` line becomes a
      // suggestion, which is exactly what C04 I44 refuses — and the totals still
      // sum to the width, so nothing about the arithmetic looks wrong.
      name: "a fixed cell count is weighted like a proportion",
      file: M,
      from: "  const weights = shares.map((s) => (isCells(s) ? 0 : s));",
      to: "  const weights = shares.map((s) => (isCells(s) ? s.cells : s));",
      expect: "MS10",
    },
    {
      // **The floor taken off the budget first**, which is what `GROW` with a
      // minimum means and the wrong verb for this field (C29 §8a C10). A
      // declared `[1, 3]` at 8 answers `[3, 5]`; every width is distorted and
      // every total still agrees.
      name: "a line is a grower with a minimum rather than a proportion with a floor",
      file: M,
      from: "  const budget = total - fixed.reduce((a, b) => a + b, 0); // cells-ok — a cell count",
      to: "  const budget = total - fixed.reduce((a, b) => a + b, 0) - weights.filter((w) => w > 0).length; // cells-ok — a cell count",
      expect: "MS10",
    },
    {
      // **The cut removed from the paint** (C29 §8a C9). With the clamp gone
      // from the geometry there is nothing else bounding a region: `placeRows`
      // takes the pieces and a height and no width at all, so an over-full grid
      // writes a row wider than the block. F1211, one container over.
      name: "a region reaching past the grid is drawn whole",
      file: C,
      from: "  const w = Math.min(rect.width, width - rect.left); // cells-ok — a cell count",
      to: "  const w = rect.width; // cells-ok — a cell count",
      expect: "MS11",
    },
    {
      // The other axis, so the run says which one each row holds.
      name: "a region reaching below the grid is drawn whole",
      file: C,
      from: "  const h = Math.min(rect.height, height - rect.top); // cells-ok — a row count",
      to: "  const h = rect.height; // cells-ok — a row count",
      expect: "MS11",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
