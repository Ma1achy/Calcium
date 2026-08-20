// C12 I47 and I48 — the gutter on both sides, and the callout.
//
// **The row this run exists for is T6.32.** The walk's own ruling for a
// spanning last column — *take the midpoint* — lands on the row the
// cell-resolution shortcut gives, so a mutation restoring the shortcut would
// have survived against the spec as written. The ruling was corrected by
// running the code; this is the run that keeps the correction honest.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const DEFN = "src/presentation/plot/definition.ts";
const FURN = "src/presentation/plot/furniture.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync('npx vitest run test/unit/plot-y-axis.test.ts 2>&1',
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
    from: "  const callout = layout.callouts?.get(row);",
    to: "  const callout = undefined;",
    why: "with no callout ever resolved the right gutter is a plain mirror, so every YC row is about nothing — a run where this survives cannot see a kill on any callout row below",
  },
  mutations: [
    {
      // **The defect the request would have shipped**, and the one no arithmetic
      // assertion catches: 16-21% of values land a row off the line they name.
      name: "the callout's row is recomputed from its value",
      file: DEFN,
      from: "  const row = lastInkRow(glyphRows, layout.areaWidth);",
      to: "  const row = rowOf(v, seriesRange(block.series, block) ?? { min: 0, max: 1 }, layout.areaRows);",
      expect: "YC2",
    },
    {
      // The walk's own ruling, which the implementation disproved. It answers
      // *6* where the sample is in 7 — the shortcut's row exactly.
      name: "a spanning last column takes its midpoint",
      file: DEFN,
      from: "    return Math.abs(here.top - from) >= Math.abs(here.bottom - from) ? here.top : here.bottom; // cells-ok — a row index",
      to: "    return Math.floor((here.top + here.bottom) / 2); // cells-ok — a row index",
      expect: "YC2",
    },
    {
      name: "two callouts on a row drop the mark",
      file: DEFN,
      from: "    shared: into.has(at),",
      to: "    shared: false,",
      expect: "YC4",
    },
    {
      // The other half of C12 I8's rule: the *earlier* series keeps the row and
      // the later one is the silent loss instead.
      name: "the earlier series keeps a contested row",
      file: DEFN,
      from: "  into.set(at, {",
      to: "  if (into.has(at)) return;\n  into.set(at, {",
      expect: "YC4",
    },
    {
      // *Your data is here* is more specific than *this row is 5200* — and the
      // argument reaches only the gutter the callout is written in.
      name: "a callout takes the left gutter's row too",
      file: FURN,
      from: "  const drawsLabel = label !== \"\" && layout.labelColumn > 0;",
      to: "  const drawsLabel = label !== \"\" && layout.labelColumn > 0 && layout.callouts?.get(row) === undefined;",
      expect: "YC3",
    },
    {
      // A column sized from the ticks alone truncates every callout wider than
      // its axis, which is most of them: a tick is a nice number and a last
      // value is not.
      name: "the right column is sized from the tick labels alone",
      file: DEFN,
      from: "    ? Math.max(wanted, calloutWidth(block, caps.ambiguousWidth))",
      to: "    ? wanted",
      expect: "YC1",
    },
    {
      // **The carrier at one bit.** Bold is what a series slot already resolves
      // to through `MONO.emphasised`, so this is invisible in colour and
      // invisible without it.
      name: "the callout is carried by weight rather than by a mark",
      file: FURN,
      from: "      { text: `${bare ? \" \" : g.calloutTee} `, style: muted },",
      to: "      { text: `${bare ? \" \" : g.teeLeft} `, style: muted },",
      expect: "YC8",
    },
    {
      // Finding 1: the tick rule tested *a label exists* where it meant *this
      // side draws it*, and a right axis is the first layout to separate them.
      name: "the left tick asks whether a label exists rather than whether it is drawn",
      file: FURN,
      from: "  const drawsLabel = label !== \"\" && layout.labelColumn > 0;",
      to: "  const drawsLabel = label !== \"\";",
      expect: "YA2b",
    },
    {
      // Finding 3: `"rule"` is a left rule and a bottom rule and no right one.
      name: "the right gutter mirrors the left gutter's bare predicate",
      file: FURN,
      from: 'const BARE_RIGHT_EDGE: ReadonlySet<FrameStyle> = new Set<FrameStyle>(["corners", "rule"]);',
      to: 'const BARE_RIGHT_EDGE: ReadonlySet<FrameStyle> = new Set<FrameStyle>(["corners"]);',
      expect: "YA7",
    },
    {
      // Finding 2: three callers gated `yLabels` on the *left* column, so a
      // right axis computed no labels at all.
      name: "the labels are gated on the left column again",
      file: FURN,
      from: "  return layout.labelColumn > 0 || (layout.rightColumn ?? 0) > 0;",
      to: "  return layout.labelColumn > 0;",
      expect: "YA2",
    },
    {
      // The ladder's order: the right column is the copy and goes first.
      name: "the left column is dropped before the right",
      file: DEFN,
      from: "  if (right > 0 && width - left - AXIS_GUTTER - FRAME_RIGHT >= MIN_AREA) {",
      to: "  if (left > 0 && width - right - AXIS_GUTTER - FRAME_RIGHT >= MIN_AREA) {",
      expect: "YA6",
    },
    {
      // The 1-bit stacked arm, which is the capability `yCallout` would
      // otherwise be accepted at and ignored at.
      name: "the stacked arm resolves no callouts",
      file: DEFN,
      from: "    calloutInto(callouts, block, strip.layer.glyphRows, index, layout, base);",
      to: "    void strip; void index;",
      expect: "YC8b",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
