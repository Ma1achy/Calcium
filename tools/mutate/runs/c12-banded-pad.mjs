// C12 — a banded form's leftover rows, and the check that was named for both
// borders and read one.
//
// **`rowsPer` is `⌊areaRows ÷ n⌋`**, so a height a band count does not divide
// leaves rows to pad. That loop wrote the gutter and the right border with
// nothing between them, putting the two borders in adjacent columns — and
// **every banded fixture in the catalogue happened to divide evenly**, so the
// loop had never drawn a row. The first fixture that did not divide showed
// `││` in three frames.
//
// PC12 is called *every frame's border sits in one column* and checked the
// left one, which is why the corpus was silent: the malformed row's left
// border is in exactly the right place.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const DEFN = "src/presentation/plot/definition.ts";
const CAT = "tools/catalogue-forms.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync('npx vitest run test/unit/plot-catalogue.test.ts 2>&1',
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
    from: "      [{ text: areaText(\" \".repeat(Math.max(0, layout.areaWidth)), layout, ctx) }],",
    to: "      [{ text: \"\" }],",
    why: "PC12's right-border arm reads a padded row's closing column; a padding row with no area at all is the defect it was widened to catch, so a run where this survives cannot see a kill",
  },
  mutations: [
    {
      // **The shipped defect.** The row is short by the whole plot area and the
      // left border is still in the right column.
      name: "the padding row omits its plot area",
      file: DEFN,
      from: "      [{ text: areaText(\" \".repeat(Math.max(0, layout.areaWidth)), layout, ctx) }],",
      to: "      [],",
      expect: "PC12",
    },
    // **A one-cell-short padding row is not a mutation**, and measuring it is
    // what says so: `areaText` pads to `layout.areaWidth` whenever the layout
    // is framed, so shortening the string it is handed changes nothing. The
    // defect was the span being **absent**, which is the row above — and this
    // paragraph is here because the mutation was written, survived, and read as
    // a gap in PC12 until the padding was measured.
    {
      // **The fixture, not the code.** Every banded fixture divided evenly
      // before this one, so the padding loop was unreachable from the corpus —
      // and a green PC12 said nothing about it either way.
      name: "the fixture's height divides its band count again",
      file: CAT,
      from: '      form: "boxplot", height: 7, axes: true, categories: ["capped", "floored", "both"],',
      to: '      form: "boxplot", height: 6, axes: true, categories: ["capped", "floored", "both"],',
      expect: "PC12a",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
