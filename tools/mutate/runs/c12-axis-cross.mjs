// C12 §3ad — `axisCross: "zero"`, the two conditions that are not one condition,
// and the grid's tick columns.
//
// **The first two mutations are the walk's A15 row from both sides.** Dropping
// the range test leaves the interior test, which a constant series passes —
// `rowOf` centres a degenerate range by construction. Dropping the interior test
// leaves the range test, which zero-at-the-edge passes. Each half is correct on
// its own and neither is the rule.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const DEF = "src/presentation/plot/definition.ts";
const AXES = "src/presentation/plot/axes.ts";
const FURN = "src/presentation/plot/furniture.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(
      "npx vitest run test/unit/plot-mutations.test.ts test/golden/plot-forms.test.ts 2>&1",
      { cwd: ROOT, encoding: "utf8", timeout: 300_000 },
    );
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.code === "ETIMEDOUT" ? `${out}\nTIMED OUT` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: FURN,
    from: '    x === column ? (on ? g.crossing : g.dashedVertical) : on ? g.dashedHorizontal : " ", // cells-ok — a column index',
    to: '    x === column || on ? g.crossing : " ", // cells-ok — a column index',
    why: "every cross cell becomes the junction mark, so no row that distinguishes the two halves can hold; a run that cannot see that cannot see any row below",
  },
  mutations: [
    {
      // **A15 from one side.** The interior test survives and a constant series
      // passes it, because `rowOf` centres a degenerate range.
      name: "the range test goes and the interior test stands alone",
      file: DEF,
      from: "  const straddles = crossing && range.min < 0 && range.max > 0;",
      to: "  const straddles = crossing;",
      expect: "AC5",
    },
    {
      // **A15 from the other.** The range test survives and zero-at-the-edge
      // passes it, so a `yMin: 0` plot draws a rule on its own bottom row.
      name: "the interior test goes and the range test stands alone",
      file: DEF,
      from: "  const zeroRow = zeroAt !== null && zeroAt > 0 && zeroAt < layout.areaRows - 1 ? zeroAt : null; // cells-ok — a row index",
      to: "  const zeroRow = zeroAt; // cells-ok — a row index",
      expect: "AC4",
    },
    {
      // The range test as `<=` / `>=` rather than strictly: zero at an end
      // passes, which is A4 by the other road.
      name: "the range test admits zero at an end",
      file: DEF,
      from: "  const straddles = crossing && range.min < 0 && range.max > 0;",
      to: "  const straddles = crossing && range.min <= 0 && range.max >= 0;",
      expect: "AC5",
    },
    {
      // §3ad A6 — the cross is placed by `rowOf` and takes the facing with it.
      name: "the cross ignores the origin",
      file: DEF,
      from: "  const zeroAt = straddles ? rowOf(0, range, layout.areaRows, facing) : null;",
      to: "  const zeroAt = straddles ? rowOf(0, range, layout.areaRows, FACING_DEFAULT) : null;",
      expect: "AC10",
    },
    {
      // §3ad A8 / §3d.1's last row — the zero column is the form's placement,
      // not the curve's rule. Two correct mappings from one position.
      name: "the zero column takes the curve's rule for a candlestick too",
      file: AXES,
      from: "    ? columnAt?.(xPositionOf(0, axis.range, scale))",
      to: "    ? undefined",
      expect: "AC9",
    },
    {
      // §3ad A10 — the domain test is what excludes an index, whose zero is
      // sample 0 and whose rule would abut the gutter's border.
      name: "the zero column is drawn at the area's edge",
      file: AXES,
      from: "  const zeroColumn = zero !== null && zero !== undefined && zero > 0 && zero < w - 1 ? zero : null; // cells-ok — a column index",
      to: "  const zeroColumn = zero !== null && zero !== undefined ? zero : null; // cells-ok — a column index",
      expect: "AC6",
    },
    {
      // **F211 restored.** The grid took its columns from the captions arm, so a
      // numeric abscissa drew no vertical gridlines while the rule below it
      // carried five ticks.
      name: "the grid takes its columns from the captions arm",
      file: DEF,
      from: "  const gridTicks = xaxis.tickColumns;",
      to: "  const gridTicks = xAxis(block.xLabels, layout.areaWidth, ctx.capabilities).tickColumns;",
      expect: "AC13",
    },
    {
      // §3ad.4 — dashed, because a solid horizontal half and the curve are the
      // same glyph and the zero row reads as one continuous line.
      name: "the cross is drawn in the frame's solid alphabet",
      file: FURN,
      from: '    x === column ? (on ? g.crossing : g.dashedVertical) : on ? g.dashedHorizontal : " ", // cells-ok — a column index',
      to: '    x === column ? (on ? g.crossing : g.vertical) : on ? g.horizontal : " ", // cells-ok — a column index',
      expect: "AC1",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
