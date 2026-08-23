// C12 I20 — the number's allowance, and the number above a standing bar.
//
// **The inversion is the row worth the run.** *The number takes the width it
// needs and the run takes the residual* is right, and taken per row it made a
// larger value draw a shorter bar: at max 100 in 40 cells, 99 drew 37 cells and
// 100 drew 36. Every row was individually correct, which is why no assertion
// about one bar could see it and why BV1 asserts an ordering over a chart.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CAT = "src/presentation/plot/categorical.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync('npx vitest run test/unit/plot-bar-values.test.ts 2>&1',
      { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: CAT,
    from: "  if (!showValue) return out;",
    to: "  return out;",
    why: "a vertical bar that never writes its number fails every row about where the number goes; a run that cannot see that cannot see any row below",
  },
  mutations: [
    {
      // **The shipped defect.** Each row scaled against its own label's width.
      name: "the allowance is the row's own label again",
      file: CAT,
      from: "  const labelCells = showValue ? Math.max(own, allowance ?? own) : 0; // cells-ok — a label width",
      to: "  const labelCells = showValue ? own : 0; // cells-ok — a label width",
      expect: "BV1",
    },
    {
      name: "the numbers are left-aligned in their allowance",
      file: CAT,
      from: "  return (run + pad + gap + label).slice(0, w);",
      to: "  return (run + pad + label + gap).slice(0, w);",
      expect: "BV2",
    },
    {
      // The transpose done wrongly: beside the run rather than above it.
      name: "the standing number is written at the bar's base",
      file: CAT,
      from: "  const at = h - 1 - inked; // cells-ok — a row index",
      to: "  const at = h - 1; // cells-ok — a row index",
      expect: "BV3",
    },
    {
      // **The clause a reader would not predict**: the tallest bar is the one
      // that loses its number, and clamping instead of dropping puts it over
      // the bar's own top row.
      name: "a bar at the ceiling has its number clamped into the figure",
      file: CAT,
      from: "  if (at < 0) return out; // cells-ok — a row index",
      to: "  if (at < 0) { out[0] = text.padEnd(w); return out; } // cells-ok — a row index",
      expect: "BV4",
    },
    {
      name: "a number wider than its column is truncated rather than dropped",
      file: CAT,
      from: "  if (wide > w) return out; // cells-ok — a label width",
      to: "  if (wide > w) { out[0] = text.slice(0, w); return out; } // cells-ok — a label width",
      expect: "BV5",
    },
    {
      // The partial top cell: a bar of 3½ cells has its top on the fourth row,
      // and ignoring the half puts the number *on* it.
      name: "the partial top cell is not counted as inked",
      file: CAT,
      from: "  const inked = part > 0 ? whole + 1 : whole; // cells-ok — a row count",
      to: "  const inked = whole; // cells-ok — a row count",
      expect: "BV3",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
