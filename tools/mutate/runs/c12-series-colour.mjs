// C12 I38 — colour names an identity, and three renderers held their own copy
// of the decision.
//
// **The rule it replaced was a code comment and no file.** `categoricalForm`'s
// `refFor` doc said *a plain bar is one series across N categories and the
// category is what a colour can name* — true about the grouped bar it was
// written for, general by nothing, and enough to give a histogram's eight bins
// eight colours.
//
// **The rule is the row axis, not the series count.** The first correction read
// eleven reference renderings as the ruling and took the colour off every named
// band as well as off the bins; `ROW_IS_AN_IDENTITY` is the axis it was missing.
// The two mutations that swap it are the ones that would put that back.
//
// **The timeline is the other row this run exists for.** Its rows are tracks, so
// the old row-indexed default was accidentally right there, and the correction
// breaks it silently: three tracks in one colour, every count in the frame still
// correct. Two of the mutations below take its `refFor` away.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const DEFN = "src/presentation/plot/definition.ts";
const MARKS = "src/presentation/plot/marks.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync('npx vitest run test/unit/plot-categorical-colour.test.ts 2>&1',
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
    file: DEFN,
    from: "    const ref = (i < labels.length ? refFor?.(i) : undefined) ?? refOf(s ?? { values: [] }, own);",
    to: "    const ref = \"tone.error\" as ColourRef;",
    why: "every categorical row drawn in one hardcoded tone collapses the grouped bar, the timeline and the stacked layers at once; a run that cannot see that cannot see any row below",
  },
  mutations: [
    {
      // **The shipped defect, exactly as it stood.** DC7 asserts the rule
      // rather than a count — the colour set does not grow with the category
      // count — so this is what it was built against.
      name: "a sliced row indexes the palette by its row again",
      file: DEFN,
      from: "    const ref = (i < labels.length ? refFor?.(i) : undefined) ?? refOf(s ?? { values: [] }, own);",
      to: "    const ref = (i < labels.length ? refFor?.(i) : undefined) ?? slotOf(i);",
      expect: "DC7",
    },
    {
      // The same defect on the histogram specifically, which is the report
      // that started this. Distinct from the row above only in which test
      // names it, and worth its own row because the bins are the case where
      // the colour claimed an identity rather than merely repeating one.
      name: "a sliced row indexes the palette, read through the histogram",
      file: DEFN,
      from: "    const ref = (i < labels.length ? refFor?.(i) : undefined) ?? refOf(s ?? { values: [] }, own);",
      to: "    const ref = (i < labels.length ? refFor?.(i) : undefined) ?? slotOf(i % 8);",
      expect: "DC8",
    },
    {
      // **The axis itself.** Declaring a histogram's bins to be names is the
      // shipped defect stated as data rather than as arithmetic, and it is the
      // one mutation the `Record` makes expressible.
      name: "a histogram declares its bins to be names",
      file: MARKS,
      from: "  histogram: false, autocorrelation: false,",
      to: "  histogram: true, autocorrelation: false,",
      expect: "DC8",
    },
    {
      name: "a correlogram declares its lags to be names",
      file: MARKS,
      from: "  histogram: false, autocorrelation: false,",
      to: "  histogram: false, autocorrelation: true,",
      expect: "DC13",
    },
    {
      // The other direction: a named band declared a slice. This is what the
      // first correction did to every distribution form, and it is the row
      // that would have caught it.
      name: "a box plot declares its bands to be slices",
      file: MARKS,
      from: "  bar: true, boxplot: true, violin: true,",
      to: "  bar: true, boxplot: false, violin: true,",
      expect: "DC10",
    },
    {
      name: "the band renderer stops reading the axis",
      file: DEFN,
      from: "      refOf(block.series[0] ?? { values: [] }, ROW_IS_AN_IDENTITY[block.form] ? ci : 0),",
      to: "      refOf(block.series[0] ?? { values: [] }, 0),",
      expect: "DC10",
    },
    {
      name: "the column renderer stops reading the axis",
      file: DEFN,
      // The line gained a `refFor` when the vertical arm learned to group
      // (C12 I42); the clause under test is the fallback, which is the half a
      // grouped chart does not use.
      from: "        ?? refOf(block.series[0] ?? { values: [] }, ROW_IS_AN_IDENTITY[block.form] ? i : 0); // cells-ok — a column index",
      to: "        ?? refOf(block.series[0] ?? { values: [] }, i); // cells-ok — a column index",
      expect: "DC12",
    },
    {
      // **The wiring, not the mechanism.** `refFor` is correct and unused —
      // the call site is where the timeline's exception lives, so the mutation
      // has to be here rather than in the function.
      name: "the timeline stops declaring that its rows are series",
      file: DEFN,
      from: "      (r) => refOf(block.series[r] ?? { values: [] }, r), // cells-ok — a track index\n",
      to: "",
      expect: "DC9",
    },
    {
      name: "the timeline's refFor answers for track 0 whatever it is asked",
      file: DEFN,
      from: "      (r) => refOf(block.series[r] ?? { values: [] }, r), // cells-ok — a track index",
      to: "      (_r) => refOf(block.series[0] ?? { values: [] }, 0), // cells-ok — a track index",
      expect: "DC9",
    },
    {
      // The fix pointing the other way. A row's interior identities are the
      // one thing colour still separates, and collapsing them is the same
      // defect inverted — which is what DC11 is for.
      name: "a stacked bar's layers all take the first series' colour",
      file: DEFN,
      from: "      : ownedSpans(areaText(content, layout, ctx), built.owners, (k) => refOf(block.series[k] ?? { values: [] }, k), ctx);",
      to: "      : ownedSpans(areaText(content, layout, ctx), built.owners, (_k) => refOf(block.series[0] ?? { values: [] }, 0), ctx);",
      expect: "DC11",
    },
    {
      name: "a grouped bar's rows take the row's slot rather than the series'",
      file: DEFN,
      from: "        (r) => slotOf(r % perSeries), // cells-ok — a series index",
      to: "        (r) => slotOf(r), // cells-ok — a series index",
      expect: "DC2",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
