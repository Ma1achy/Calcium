// C09 I74 — a unit of the rasterised alphabets is its own cluster unless the
// unit after it can extend it, and the walks take it without the segmenter.
// Mutated.
//
// **The property is a boundary, and a boundary is visible only where the two
// sides differ in width or in what a window keeps.** A mark after a box unit
// measures the same split or whole — the mark is zero cells — so `cells`
// cannot see the split; a window of one cell can, because it keeps the mark
// with its base or drops it. T1.48 asks every walk over every range and every
// extender kind, and the seeded corpus asks them at every width.
//
// **The control is the extender test dropped**: a table unit taken as solo
// whatever follows. T1.48's selector pair measures one cell where two are
// counted, and the window of one over a marked unit loses the mark.
//
// **Left out, with its reason.** *The joiner admitted as a unit that cannot
// extend* was written and survived on the first run: U+200D lies above
// U+0300, so the clause excepting it below U+0300 could never fire and the
// mutation was a no-op. The clause is gone; T6.121 records the survivor.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/text.test.ts test/unit/rows.test.ts test/golden/plot-meshes.test.ts";
const TEXT = "src/presentation/text.ts";
const ROWS = "src/presentation/rows.ts";

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

const results = runPass({
  read,
  write,
  run,
  control: {
    file: TEXT,
    from: "  const n = text.charCodeAt(i + 1);\n  return Number.isNaN(n) || n < 0x300 || soloUnit(n);",
    to: "  const n = text.charCodeAt(i + 1);\n  return true;",
    why: "a table unit is solo whatever follows; T1.48's selector pair measures one cell and the window of one drops the mark",
  },
  mutations: [
    {
      // **The marks' block admitted to the table**: a combining mark is a
      // solo unit, so the unit before it is solo too, and the window of one
      // over a marked braille unit drops the mark.
      name: "MARKS-ADMITTED: the combining marks are in the table",
      file: TEXT,
      from: "export function soloUnit(c: number): boolean {\n  return inRanges(c, CELL_PER_UNIT_RANGES);\n}",
      to: "export function soloUnit(c: number): boolean {\n  return inRanges(c, CELL_PER_UNIT_RANGES) || (c >= 0x300 && c <= 0x36f);\n}",
      expect: "T1.48",
    },
    {
      // **`swallowed` answering zero for every next unit at or above U+0300**:
      // a mark after an SGR is no longer the `m`'s, and the normaliser and the
      // tokeniser part on T1.46's seeded rows.
      name: "SWALLOWED-ALL: the rows arm never segments after an SGR",
      file: ROWS,
      from: "  if (Number.isNaN(next) || next < 0x300 || soloUnit(next)) return 0;",
      to: "  if (Number.isNaN(next) || next < 0x300 || soloUnit(next) || true) return 0;",
      expect: "T1.46",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
