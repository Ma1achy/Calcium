// A number column is planned at its widest value (C11 I31, `R-TBL-005`).
//
// **Each mutation leaves a table whose columns are all still planned** — the
// planner is untouched and pure. What moves is the minimum it is handed, which
// decides whether `41208` is drawn whole, dropped, or cut to `4120…`.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/table.test.ts test/contract/table-decimal.test.ts";
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
    // **As it shipped**: the planner reads the declarations and `41208` is cut.
    name: "the plan reads the declared columns",
    file: DEFINITION,
    from: "  return planColumns(effectiveColumns(block), width);",
    to: "  return planColumns(block.columns, width);",
    expect: "T1.40",
  },
  {
    // **Every column raised**: a names column stops truncating.
    name: "every column is a number column",
    file: DEFINITION,
    from: "    if (!numbers.has(c.key)) return c;",
    to: "",
    expect: "T1.40",
  },
  {
    // **The window re-plans from its slice**, so the column after the number
    // starts at a different cell on scroll.
    name: "the window pins only alignment",
    file: DEFINITION,
    from: "        columns: effectiveColumns(block).map((c) => {",
    to: "        columns: block.columns.map((c) => {",
    expect: "T2.16",
  },
  {
    // **Grouped, not bare** — a comma the plan did not ask for widens the
    // column past the value C11 I28 would then draw.
    name: "the widest value is counted from the grouped text",
    file: DEFINITION,
    from: "      widest = Math.max(widest, lead + cells(cell.text.trim(), ambiguous));",
    to: "      widest = Math.max(widest, lead + cells(cell.text.trim(), ambiguous) + 1);",
    expect: "T1.40",
  },
];

const results = await runPass({
  read,
  write,
  run,
  control: {
    // **A change the run's own corpus can see** (F1254): the raise is lost for
    // every column, which is the state before C11 I31.
    file: DEFINITION,
    from: "    return widest > c.minWidth ? { ...c, minWidth: widest } : c;",
    to: "    return c;",
    why: "no column is raised, so T1.40 sees `4120…` — if this survives, nothing reads the plan",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
