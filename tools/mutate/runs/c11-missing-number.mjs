// A missing number is the absent mark (C11 I29, `R-TBL-003`).
//
// **Each mutation leaves a table that renders every row it had** — the rows,
// the widths and the alignments are untouched. What moves is one cell's
// contents, which is the cell §078 says a reader misreads as zero or as a
// rendering failure.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/table.test.ts";
const CELLS = "src/presentation/table/cells.ts";
const KIND = "src/presentation/table/kind.ts";
const DEFINITION = "src/presentation/table/definition.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const MUTATIONS = [
  {
    // **As it shipped**: a missing number is a blank.
    name: "the definition passes no unknown set",
    file: DEFINITION,
    from: "{ expandable, on, marked, points, aligns, grouping, unknown, ends });",
    to: "{ expandable, on, marked, points, aligns, grouping, ends });",
    expect: "T1.38",
  },
  {
    // **A text column takes the dash** — a value in a names column.
    name: "every column is a number column",
    file: KIND,
    from: '    if (columnKind(block.rows, column.key) !== "text") out.add(column.key);',
    to: "    out.add(column.key);",
    expect: "T1.38",
  },
  {
    // **At the column's edge**, two cells right of the digits above it.
    name: "the dash ignores the decimal end",
    file: DEFINITION,
    from: "{ expandable, on, marked, points, aligns, grouping, unknown, ends });",
    to: "{ expandable, on, marked, points, aligns, grouping, unknown });",
    expect: "T1.38",
  },
  {
    name: "the dash takes the default tone",
    file: CELLS,
    from: "        text: pad(padStart(pairFor(ctx.capabilities).absent, end), planned.width),\n        style: tone(\"muted\",",
    to: "        text: pad(padStart(pairFor(ctx.capabilities).absent, end), planned.width),\n        style: tone(\"default\",",
    expect: "T1.38",
  },
  {
    // **A glyph read as absence** — the warn mark replaced by a dash.
    name: "a glyph-only cell is missing",
    file: CELLS,
    from: "(cell === undefined || (isMissing(cell.text) && cell.glyph === undefined))",
    to: "(cell === undefined || isMissing(cell.text))",
    expect: "T1.38",
  },
  {
    // **One rung for every terminal** — `—` where ASCII has none.
    name: "the mark ignores the rung",
    file: CELLS,
    from: "        text: pad(padStart(pairFor(ctx.capabilities).absent, end), planned.width),",
    to: '        text: pad(padStart("\\u2014", end), planned.width),',
    expect: "T1.38",
  },
];

const results = await runPass({
  read,
  write,
  run,
  control: {
    // **A change the run's own corpus can see** (F1254): the dash is a zero,
    // the one thing §078 says it must never be.
    file: CELLS,
    from: "        text: pad(padStart(pairFor(ctx.capabilities).absent, end), planned.width),",
    to: '        text: pad(padStart("0", end), planned.width),',
    why: "a missing number draws 0, so T1.38's dash assertions fail — if this survives, nothing reads the missing cell",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
