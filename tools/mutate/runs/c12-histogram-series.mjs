// C12 I42 — every series on one edge set, and `overlap` meaning grouped.
//
// **The picture asserted a series it did not draw.** A bar with two series and
// no `layout` drew the first and let the legend name both, which is I8's rule
// broken in the arm beside the one whose comment records being fixed for it —
// and a histogram inheriting the default would have shipped it wider.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
// **`binValues` moved to `derive.ts` when the seam grew a caller** (C12 I70,
// C12 §3ak.27). A histogram's binning is a derivation of its series, so it sits
// below both arms with `ecdfSeries` and `densitySeries` rather than inside the
// terminal's bar rasteriser — and these three anchors moved with it.
const DERIVE = "src/presentation/plot/derive.ts";
const DEFN = "src/presentation/plot/definition.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync('npx vitest run test/unit/plot-histogram-series.test.ts 2>&1',
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
    file: DERIVE,
    from: "  const per = series.map((vs) => vs.filter((v): v is number => v !== null && Number.isFinite(v)));",
    to: "  const per = series.slice(0, 1).map((vs) => vs.filter((v): v is number => v !== null && Number.isFinite(v)));",
    why: "binning only the first series returns one count array where the caller expects one per series, so every row about a second series fails; a run that cannot see that cannot see any row below",
  },
  mutations: [
    {
      // **The shipped defect.** Edges from `series[0]` and nothing else.
      name: "the edges come from the first series alone",
      file: DERIVE,
      from: "  const finite = per.flat();",
      to: "  const finite = per[0] ?? [];",
      expect: "HS1",
    },
    // **`Math.min(...vs, lo)` is not a mutation, and measuring is what says
    // so.** `lo` is already the union's minimum, so it is ≤ every series' own
    // and the expression is `lo` again — the row survived, read as a gap in HS1,
    // and is an identity. *Per-series edges and union edges differ only in where
    // `lo` and `hi` come from, which the row above already mutates; there is no
    // second place for that defect to live.* Recorded rather than deleted,
    // because the next reader will reach for the same expression.
    {
      name: "a series with nothing in it is dropped rather than kept at zero",
      file: DERIVE,
      from: "  const counts: number[][] = per.map(() => new Array(binCount).fill(0) as number[]);",
      to: "  const counts: number[][] = per.filter((vs) => vs.length > 0).map(() => new Array(binCount).fill(0) as number[]);",
      expect: "HS1",
    },
    {
      // **`overlap` back to drawing the first one.** The legend still names
      // both, which is what makes it an assertion rather than an omission.
      name: "`overlap` draws the first series and lets the legend name the rest",
      file: DEFN,
      from: '    const spread = (layout === "grouped" || layout === "overlap") && block.series.length > 1; // cells-ok — a series count',
      to: '    const spread = layout === "grouped" && block.series.length > 1; // cells-ok — a series count',
      expect: "HS7",
    },
    {
      // The ordering ruling: orientation decides the renderer, layout the drawing.
      name: "grouped is tested before vertical again",
      file: DEFN,
      from: '    if (spread && block.orientation === "vertical") {',
      to: "    if (false) {",
      expect: "HS4",
    },
    {
      name: "the vertical bands take their own index's colour",
      file: DEFN,
      from: "        (r) => slotOf(r % per), // cells-ok — a series index",
      to: "        (r) => slotOf(r), // cells-ok — a series index",
      expect: "HS6",
    },
    {
      name: "every vertical band carries the composite label",
      file: DEFN,
      from: '        categories: cats.flatMap((c) => block.series.map((_sr, k) => (k === 0 ? c : ""))),',
      to: '        categories: cats.flatMap((c) => block.series.map((sr, k) => `${c} · ${sr.label ?? String(k + 1)}`)),',
      expect: "HS4",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
