// C09 I77 — the styled measurer's one-pass scan takes a unit of the rasterised
// alphabets at `narrow` as one cell. Mutated (T6.123, F1202).
//
// **A measure is visible only where two answers differ**, so every mutation
// here changes the count: the set admitted at `wide`, where box drawing is two
// cells and the scan says one; the set widened past the table, where a CJK
// ideograph is two and the scan says one. T1.51 holds the scan against the
// stripped cluster walk over every arm at both modes.
//
// **The control counts a table unit as two.** Every braille row in T1.51's
// corpus fails, and the sweep that asserts the scan's own count fails with it.
//
// **Blind spot, stated.** The arm's *absence* is not a mutation the suite can
// see: with the arm removed the fall-through answers every row through `cells`
// and the bytes are the same — only the bench sees the cost, which is what
// F1202's close carries. And a next-unit test *added* to the arm would survive
// for the reason I77 gives: the extender ends the scan itself.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/text.test.ts test/golden/plot-meshes.test.ts";
const TEXT = "src/presentation/text.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const BUFFER = 256 * 1024 * 1024;
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: BUFFER });
  } catch (e) {
    if (e.killed === true) return "the suite did not return — timed out";
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const ARM = '    if (ambiguous === "narrow" && soloUnit(c)) {\n      total += 1;\n      i += 1;\n      continue;\n    }\n    return cells(text.replace(sgrPattern(), ""), ambiguous);';

const results = runPass({
  read,
  write,
  run,
  control: {
    file: TEXT,
    from: ARM,
    to: ARM.replace("      total += 1;\n      i += 1;", "      total += 2;\n      i += 1;"),
    why: "a table unit counted as two: every braille row measures double and T1.51's sweep disagrees with the scan",
  },
  mutations: [
    {
      // **Admitted at `wide`**: box drawing is Ambiguous and two cells there
      // (I65); the scan would say one for every rail and every gridline.
      name: "WIDE-ADMITTED: the narrow test dropped from the arm",
      file: TEXT,
      from: ARM,
      to: ARM.replace('if (ambiguous === "narrow" && soloUnit(c)) {', "if (soloUnit(c)) {"),
      expect: "T1.51",
    },
    {
      // **The set widened past the table**: a CJK ideograph is two cells and
      // would be counted as one.
      name: "SET-WIDENED: a unit up to U+9FFF taken as one cell",
      file: TEXT,
      from: ARM,
      to: ARM.replace('if (ambiguous === "narrow" && soloUnit(c)) {', 'if (ambiguous === "narrow" && (soloUnit(c) || (c >= 0x4e00 && c <= 0x9fff))) {'),
      expect: "T1.51",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
