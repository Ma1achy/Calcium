// The disclosure count and the column it takes (C11 I32, rulings 69 and 82).
//
// **Each mutation leaves a table that still plans and still draws a marker** —
// what moves is the count beside it, the cells reserved for it, or which rows
// the reservation is read from.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/table-disclosure.test.ts test/integration/table.test.ts test/integration/capabilities.test.ts";
const PLAN = "src/presentation/table/plan.ts";
const DEFINITION = "src/presentation/table/definition.ts";
const CELLS = "src/presentation/table/cells.ts";

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
    // **As it shipped**: the declared cell, into which `▹+2` is cut.
    name: "no reservation",
    file: PLAN,
    from: "  return planColumns(reserve(cols, at, disclosureCells(hidden)), width);",
    to: "  return planColumns(cols, width);",
    expect: "T1.41 (C11 I32",
  },
  {
    // **One plan**: the reservation for the bound, never narrowed to what dropped.
    name: "the second plan skipped",
    file: PLAN,
    from: "  return planColumns(reserve(cols, at, disclosureCells(hidden)), width);",
    to: "  return bound;",
    expect: "T1.41 (C11 I32",
  },
  {
    // **One plan, the other way**: the reservation for no bound — a count that
    // grows past nine under its own reservation is cut.
    name: "the bound reserves the mark alone",
    file: PLAN,
    from: "  const bound = planColumns(reserve(cols, at, disclosureCells(hideable)), width);",
    to: "  const bound = planColumns(cols, width);",
    expect: "T1.41 (C11 I32",
  },
  {
    name: "the count ignores detail",
    file: DEFINITION,
    from: "  return plan.dropped.length + (row.detail?.length ?? 0); // cells-ok — a count, not a width",
    to: "  return plan.dropped.length; // cells-ok — a count, not a width",
    expect: "T1.42 (C11 I32",
  },
  {
    // **Ruling 69's second carrier dropped**: the mark alone on every row.
    name: "the count is never drawn",
    file: CELLS,
    from: "      const counted = row.expanded !== true && options.hidden > 0 ? `${mark}+${String(options.hidden)}` : mark;",
    to: "      const counted = mark;",
    expect: "T1.42 (C11 I32",
  },
  {
    name: "an expanded row draws its count",
    file: CELLS,
    from: "      const counted = row.expanded !== true && options.hidden > 0 ? `${mark}+${String(options.hidden)}` : mark;",
    to: "      const counted = options.hidden > 0 ? `${mark}+${String(options.hidden)}` : mark;",
    expect: "T1.42 (C11 I32",
  },
  {
    // **§3a row 9**: a count cut from the end is a different number.
    name: "a count too wide is cut, not reduced",
    file: CELLS,
    from: "        : cells(counted, ctx.capabilities.ambiguousWidth) <= planned.width\n          ? counted\n          : mark;",
    to: "        : counted;",
    expect: "T1.42 (C11 I32",
  },
  {
    // **§3a row 10**: the window reserves from its own rows.
    name: "the window's pin removed",
    file: DEFINITION,
    from: "    PINNED.set(windowed, PINNED.get(block) ?? block);",
    to: "",
    expect: "T3.23 (C11 I32",
  },
  {
    name: "N = 0 draws +0",
    file: CELLS,
    from: "row.expanded !== true && options.hidden > 0 ?",
    to: "row.expanded !== true && options.hidden >= 0 ?",
    expect: "T1.42 (C11 I32",
  },
];

const results = await runPass({
  read,
  write,
  run,
  control: {
    // **A change the run's own corpus can see** (F1254): the reservation's
    // arithmetic, which T1.41's `disclosureCells` table reads directly.
    file: PLAN,
    // Re-anchored when the mark's cells became `MARK_CELLS` (the T2.3 regression).
    from: "  return n > 0 ? MARK_CELLS + 1 + String(n).length : MARK_CELLS;",
    to: "  return n > 0 ? MARK_CELLS + 2 + String(n).length : MARK_CELLS;",
    why: "every reservation one cell wider, so T1.41's table fails — if this survives, nothing reads the reservation",
  },
  mutations: MUTATIONS,
});
console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
