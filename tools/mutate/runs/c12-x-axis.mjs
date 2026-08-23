// C12 I41 — the positional family's x axis, and the row `axes: true` had been
// reserving for it all along.
//
// **Two of these mutations are for clauses that were wrong when first written**,
// which is why they are here rather than only in the test file: `decimalsFor`
// for `stepDecimals`, which drew an index axis as `0.0 5.0 10.0`, and a linear
// placement under a log domain — ticks chosen by `axisFor` and spaced by the
// linear arm, which is the exact class `yLabels` records of itself.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const AXES = "src/presentation/plot/axes.ts";
const FURN = "src/presentation/plot/furniture.ts";
const MARKS = "src/presentation/plot/marks.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync('npx vitest run test/unit/plot-x-axis.test.ts 2>&1',
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
    file: FURN,
    from: "  return xTickRow(domain, areaWidth, block.xFormat, ctx.capabilities, block.xScale, facing, columnAt);",
    to: "  return xAxis(undefined, areaWidth, ctx.capabilities);",
    why: "a positional form with no numeric row at all fails every row about what the row says; a run that cannot see that cannot see any row below",
  },
  mutations: [
    {
      // The state before this landed: the row reserved and left blank.
      name: "the index domain is not a fallback",
      file: FURN,
      from: "  const max = block.xMax ?? n - 1; // cells-ok — a sample count",
      to: "  const max = block.xMax ?? 0; // cells-ok — a sample count",
      expect: "XA1",
    },
    {
      // **A clause that was wrong when written.** §3d's rule is one precision
      // from the step, and it is the step's own decimals.
      name: "the labels take two significant figures rather than the step's decimals",
      file: AXES,
      from: "  const decimals = axis.step > 0 ? stepDecimals(axis.step) : undefined;",
      to: "  const decimals = decimalsFor(axis.step);",
      expect: "XA1",
    },
    {
      name: "a declared domain does not replace the index",
      file: FURN,
      from: "  const min = block.xMin ?? 0;",
      to: "  const min = 0;",
      expect: "XA2",
    },
    {
      name: "the inferred scale beats the caller's captions",
      file: FURN,
      from: "  if (block.xLabels !== undefined) return xAxis(block.xLabels, areaWidth, ctx.capabilities, facing);",
      to: "",
      expect: "XA3",
    },
    {
      // **The anchor is the label's own, not the value's column.** A label
      // pushed right to clear its neighbour describes where it now is.
      name: "the tick stays at the value's column when its label moves",
      file: AXES,
      from: "    const anchor = start + Math.floor((wide - 1) / 2); // cells-ok — a column position",
      to: "    const anchor = at; // cells-ok — a column position",
      expect: "XA4",
    },
    {
      name: "a label that cannot keep its gap is butted against its neighbour",
      file: AXES,
      from: "    const start = Math.max(free, Math.min(ideal, w - wide)); // cells-ok — a column position",
      to: "    const start = Math.min(Math.max(0, ideal), w - wide); // cells-ok — a column position",
      expect: "XA5",
    },
    {
      name: "a categorical form is given a position axis",
      file: MARKS,
      from: "  bar: false, histogram: false, boxplot: false, violin: false, ridgeline: false,",
      to: "  bar: true, histogram: false, boxplot: false, violin: false, ridgeline: false,",
      expect: "XA6",
    },
    {
      // §3d.1's last row: two correct mappings from the same index.
      name: "the curve's rule places a candlestick's ticks",
      file: FURN,
      from: "    : (t: number): number | null => candleColumn(bars, Math.round(t * Math.max(0, n - 1)), areaWidth, facing); // cells-ok — a bar index",
      to: "    : undefined;",
      expect: "XA7",
    },
    {
      name: "a plain-candles block counts its samples from `series`",
      file: FURN,
      from: "  if (bars !== undefined) return bars.length; // cells-ok — a bar count",
      to: "",
      expect: "XA7",
    },
    {
      // **The other clause that was wrong when written.**
      name: "a log domain is spaced linearly",
      file: AXES,
      from: "  if (!isLog || range.min <= 0 || range.max <= 0) return linear;",
      to: "  return linear;",
      expect: "XA8",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
