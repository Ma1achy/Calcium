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
    from: "      if (dots === null) continue;\n      bits |= dots;",
    to: "      if (dots === null) continue;\n      bits = 0;",
    why: "a cell whose unioned bits are always zero draws U+2800 — blank — wherever two layers meet, so the disc is holes and the frame is gone; a run that cannot see that cannot see any row below",
  },
  mutations: [
    {
      // **The shipped defect, exactly.** The whole cell to the first layer.
      name: "the first layer to ink a cell keeps the whole cell",
      file: DEFN,
      from: "      if (dots === null) continue;\n      bits |= dots;\n      cell = String.fromCodePoint(BRAILLE_BASE + bits);",
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
    {
      // **The non-braille guard**, which is the clause that keeps a category
      // name off a polygon. Without the break a later braille layer replaces
      // the letter with a glyph made of its own dots.
      name: "a letter is unioned with the polygons over it",
      file: DEFN,
      from: "        if (dots === null) break;\n        bits = dots;",
      to: "        bits = dots ?? 0;",
      expect: "LM4",
    },
    {
      // The frame is the radar's *last* layer, so a merge that stops after the
      // first two drops it wherever two polygons already met.
      name: "the merge stops after two layers",
      file: DEFN,
      from: "      if (dots === null) continue;\n      bits |= dots;",
      to: "      if (dots === null || bits !== 0) continue;\n      bits |= dots;",
      expect: "LM3",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
