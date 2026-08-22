// C12 family 1 — the distribution family's shared coordinate.
//
// **The frames cannot catch most of this**, which is why the run exists and why
// the goldens are in the file list: their presence is what makes each row's
// `expect` a claim about *which* instrument caught it, and here the answer is
// almost always a unit row.
//
// Measured before the pass was written, in both corpora:
//
//   a zero-span range on a distribution form   0 fixtures
//   plotDetail on ONE_PER_FORM                 undefined, all five forms
//   quartiles on ONE_PER_FORM                  absent for violin, ridgeline, dumbbell
//   mean === median                            1 of 18 summaries, catalogue only
//
// So the extraction landed at 377 golden rows with zero snapshots written and
// 956 catalogue frames unchanged, and that is the gate passing over branches
// nothing takes — F256's shape. These mutations take them.
//
// Anchors checked for uniqueness before the pass (F219), atomic `fsIo` (F237).
import { execSync } from "node:child_process";
import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const SHARED = "src/data/viewmodel/distribution.ts";
const GLYPH = "src/presentation/plot/glyph-row.ts";
const KDE = "src/presentation/plot/kde.ts";

const FILES =
  "test/unit/plot-distribution-geometry.test.ts test/unit/plot.test.ts " +
  "test/golden/plot.test.ts test/golden/plot-forms.test.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 300_000 });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.killed === true ? `${out}\nTIMED OUT after 300000ms` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: SHARED,
    from: "    median: at(q.median),",
    to: "    median: at(q.q1),",
    why: "the median drawn at the first quartile — every box plot's spine in the wrong place",
  },
  mutations: [
    {
      // **The forest plot's fallbacks, which were three lines at each call
      // site.** An interval falling back to the *median* rather than the
      // whiskers draws a zero-width interval on every summary that omits its
      // bounds — and the catalogue has five of those, so it reads as a
      // deliberate point estimate.
      name: "an absent interval falls back to the median instead of the whiskers",
      file: SHARED,
      from: "    lower: at(q.lower ?? q.min),\n    upper: at(q.upper ?? q.max),",
      to: "    lower: at(q.lower ?? q.median),\n    upper: at(q.upper ?? q.median),",
      expect: "D1",
    },
    {
      // **The non-finite drop moved out**, so a `mean: NaN` places a diamond at
      // NaN and every clamp downstream passes it through — C04 §3ak's mechanism
      // one field along. The glyph lands nowhere and the row is silent.
      name: "a non-finite mean is normalised rather than dropped",
      file: SHARED,
      from: "    ...(mean !== undefined && Number.isFinite(mean) ? { mean: at(mean) } : {}),",
      to: "    ...(mean !== undefined ? { mean: at(mean) } : {}),",
      expect: "D4",
    },
    {
      // **A non-finite outlier, same shape one member along.** Filtering is
      // where the positions are computed because that is the only place all
      // three renderers pass through.
      name: "a non-finite outlier is kept",
      file: SHARED,
      from: "    outliers: (q.outliers ?? []).filter((o) => Number.isFinite(o)).map(at),",
      to: "    outliers: (q.outliers ?? []).map(at),",
      expect: "D5",
    },
    {
      // **Hazard 1, in this family — and this row's first form was a no-op.**
      // It replaced `Math.floor(width / 2)` with `Math.round(0.5 · (width - 1))`,
      // which the source comment claimed differ at every even width. **They are
      // equal at every width**, so the mutation changed nothing, survived, and
      // indicted the sentence rather than the tests. Measured: they differ at
      // every *odd* width against `Math.round(0.5 · width)`, which is this.
      //
      // **No frame in either corpus is flat**, which is the finding this run is
      // built around, so the killer is a unit row.
      name: "the flat row's rounding moves into the shared layer",
      file: GLYPH,
      from: "  if (max === min) return Math.floor(width / 2);",
      to: "  if (max === min) return Math.round(0.5 * width);",
      expect: "D2",
    },
    {
      // **The hand inversion replaced by the shared one.** `L - round(t·L)` is
      // not `round((1 - t)·L)` — searched, and they differ at `L = 4, t = 0.375`
      // — so this is the rounding stage moving, which is what hazard 1 forbids
      // and what D3b's control keeps from being a vacuous sentence.
      name: "a box plot's column inverts through the shared coordinate",
      file: GLYPH,
      from: "  return Math.max(0, Math.min(last, last - Math.round(t * last))); // cells-ok — a row index",
      to: "  return Math.max(0, Math.min(last, Math.round((1 - t) * last))); // cells-ok — a row index",
      expect: "D3",
    },
    {
      // **The band inverted like its transpose.** Its first form was
      // algebraically the identity — `(t·(max-min) + min - min) / (max-min)` is
      // `t` — so it survived by changing nothing, the second no-op in this run
      // and the same lesson as the first: a mutation is a claim, and a claim
      // that cannot be false is not one.
      //
      // A column index grows the way a value does and a row index does not, so
      // the band and the column differ **only** in the inversion. Mirroring it
      // is the plausible wrong figure: whiskers, box and spine all present, all
      // reflected, and every containment assertion satisfied.
      //
      // **A frame catches this one**, which is the split the goldens are in the
      // file list to report: `boxplot · full · 40`, `· 80` and both ascii arms.
      // The band is drawn in the corpus at a non-degenerate range, so mirroring
      // it moves eight snapshots — and the flat cases in the same run move none.
      name: "the band inverts, like the column it is a transpose of",
      file: GLYPH,
      from: "  const at = (t: number): number => Math.max(0, Math.min(last, Math.round(t * last))); // cells-ok — a column index",
      to: "  const at = (t: number): number => Math.max(0, Math.min(last, Math.round((1 - t) * last))); // cells-ok — a column index",
      expect: "golden",
    },
    {
      // **The pad removed, which is what `kde.ts`'s degenerate answer actually
      // rested on.**
      //
      // A row was written here first claiming `span || 1` was a sixth answer at
      // a zero span. It survived, and the survivor was right: `pad = (hi - lo)
      // * 0.1 || 1` is **at least 1 exactly when `hi - lo` is 0**, so
      // `span = hi - lo + 2·pad` is never zero and the guard is dead code.
      // These functions already reached mid-ramp, by a route nothing stated.
      //
      // **Third no-op in this run**, and the three share a cause: each was
      // written from what the source *says* rather than from what it *does*.
      // The pass is the only thing that asks.
      //
      // So the mutation is on the mechanism that is real. Dropping the pad's
      // fallback makes a flat summary's span genuinely zero, and the shared
      // coordinate answers mid where the old arithmetic would divide by it.
      // **A frame catches this one too** — `violin · full · 40` and its
      // siblings — for the same reason: `rainColumns` draws in the corpus.
      name: "the pad's fallback goes, and a flat summary's span is really zero",
      file: KDE,
      from: "  const ns = normalisedSummary(quartiles, { min: lo - pad, max: hi + pad });\n  const at = (t: number): number =>\n    Math.max(0, Math.min(w - 1, Math.round(t * (w - 1)))); // cells-ok — a column index",
      to: "  const ns = { q1: 0, q3: 0, median: 0, min: 0, max: 0, lower: 0, upper: 0, centre: 0, outliers: [] };\n  const at = (t: number): number =>\n    Math.max(0, Math.min(w - 1, Math.round(t * (w - 1)))); // cells-ok — a column index",
      expect: "golden",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
