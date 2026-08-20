// C12 I40 — the merge gave a whole cell to one layer, and three symptoms came
// out of it: the pie's seams, the radar's fragmented rings, and the radar's
// polygons eating each other.
//
// **The corrected test has to be shown it can still see the defect.** LM1 and
// LM2 failed against the shipped code, then failed for a second reason after
// the fix — they filtered the non-braille cells out of a row and read
// neighbours from the filtered array, comparing the last cell of the disc with
// the first cell of the legend's swatch. The index was repaired *after* the fix
// landed, so nothing had watched the repaired form go red. This run is that.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const DEFN = "src/presentation/plot/definition.ts";
/** The guard the whole partition hangs on — spelled once (C12 I44). */
const GUARD = '      if (dots === null || cellKind !== layer.kind) continue;';
/** The tone half of the same rule — two peers name neither of themselves. */
const NEUTRAL = '      if (layer.kind === "curve") cellRef = "tone.muted";';

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync('npx vitest run test/unit/plot-layer-merge.test.ts 2>&1',
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
    from: `${GUARD}\n      bits |= dots;`,
    to: `${GUARD}\n      bits = 0;`,
    why: "a cell whose unioned bits are always zero draws U+2800 — blank — wherever two layers meet, so the disc is holes and the frame is gone; a run that cannot see that cannot see any row below",
  },
  mutations: [
    {
      // **The shipped defect, exactly.** The whole cell to the first layer.
      name: "the first layer to ink a cell keeps the whole cell",
      file: DEFN,
      from: `${GUARD}\n      bits |= dots;\n      cell = String.fromCodePoint(BRAILLE_BASE + bits);`,
      to: "      break;",
      expect: "LM1",
    },
    {
      // The other direction: union, but the last layer's dots replace rather
      // than join. The radar's frame would then erase the polygons under it.
      name: "a later layer's dots replace an earlier layer's",
      file: DEFN,
      from: "      bits |= dots;",
      to: "      bits = dots;",
      expect: "LM1",
    },
    // **The non-braille `break` survived being removed, and the reason is a
    // second guard.** It says *a letter never shares a cell* and it used to be
    // the only thing saying so; C12 I44's kind guard now refuses the union a
    // step earlier, because the radar's labels are a `"curve"` and a curve
    // unions with nothing. The arrangement that would still need the break is a
    // `"surface"` drawing text beside a `"surface"` drawing braille, and no
    // layer stack in the tree is that — the solid pie's wedges are all
    // non-braille, so they meet on the guard's first clause instead.
    //
    // Kept on the asymmetry rather than the odds: it costs one comparison, it
    // states an invariant that should not depend on the partition, and the
    // defect it prevents is silent. What replaces it here is the mutation that
    // *does* fire on the same row — the priority order §3u calls a ruling, and
    // which nothing else turns over.
    {
      name: "the labels are composited under the polygons rather than over them",
      file: DEFN,
      from: '      { glyphRows: radar.labels, ref: "tone.muted", kind: "label" },\n'
        + '      ...radar.polygons.map((glyphRows, i) => ({ glyphRows, ref: seriesRef(i), kind: "curve" as const })),',
      to: '      ...radar.polygons.map((glyphRows, i) => ({ glyphRows, ref: seriesRef(i), kind: "curve" as const })),\n'
        + '      { glyphRows: radar.labels, ref: "tone.muted", kind: "label" },',
      expect: "LM4",
    },
    {
      // The frame is the radar's *last* layer, so a merge that stops after the
      // first two drops it wherever two polygons already met.
      name: "the merge stops after two layers",
      file: DEFN,
      from: `${GUARD}\n      bits |= dots;`,
      to: `${GUARD.replace("if (dots === null", "if (bits !== 0 || dots === null")}\n      bits |= dots;`,
      expect: "LM3",
    },
    {
      // **The ruling, inverted: every layer unions.** This is I40 as it shipped
      // and read as correct for three commits, and its surviving form is a
      // `"context"` layer's dots drawn in a series' colour (C12 I44).
      name: "every layer unions, context included",
      file: DEFN,
      from: GUARD,
      to: "      if (dots === null) continue;",
      expect: "LM3",
    },
    {
      // **The other half of the same arm.** Peers occluding is what shipped
      // between F199 and I44's amendment: nothing mistinted, and blue and green
      // deleted through the crossing that is a slope chart's whole content.
      name: "two peers occlude instead of unioning",
      file: DEFN,
      from: GUARD,
      to: '      if (dots === null || cellKind !== layer.kind || layer.kind === "curve") continue;',
      expect: "LM6",
    },
    {
      // **The tone.** Peers union and the first one names the cell — which is
      // the report the amendment came from, *the orange bleeds onto the blue
      // and green lines*.
      name: "the first peer names a cell two of them share",
      file: DEFN,
      from: NEUTRAL,
      to: "",
      expect: "LM6",
    },
    {
      // And the converse: a wedge boundary greying. At ten segments the small
      // wedges contest cells with both neighbours and a whole sector goes grey.
      name: "a surface boundary names neither wedge",
      file: DEFN,
      from: NEUTRAL,
      to: '      cellRef = "tone.muted";',
      expect: "LM5",
    },
    // **Renaming every wedge to one other kind is an identity, and measuring is
    // what says so.** The merge asks whether two layers share a kind, and a
    // pie's fills are the only layers in their stack — so `"surface"` to
    // `"context"` throughout leaves them peers and changes nothing but a word.
    // The row survived, read as a gap in LM1, and is not one. *Recorded rather
    // than deleted, because the next reader will reach for the same edit.*
    //
    // Making them differ *from each other* is what occludes them, and adjacent
    // wedges are the pair that has to meet.
    {
      name: "the pie's wedges occlude instead of unioning",
      file: DEFN,
      from: '      ref: categoryRef(pl.segmentIndex),\n      kind: "surface" as const,',
      to: '      ref: categoryRef(pl.segmentIndex),\n      kind: (pl.segmentIndex % 2 === 0 ? "surface" : "context") as "surface" | "context",',
      expect: "LM1",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
