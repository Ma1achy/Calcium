// A walk plans once per width, and a plan measures no glyph (C11 I32, §3a's
// cost paragraph; the T2.3 regression).
//
// **Every mutation here is equivalent in what it draws** — `planColumns` is
// pure, so a plan taken twice is the same plan — and each one restores a cost
// the regression paid. So no golden and no rendering row can kill them; T3.24's
// operation count is the only row that can, and a survivor means it went blind.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/edge/table-plan-count.test.ts test/unit/table-disclosure.test.ts";
const PLAN = "src/presentation/table/plan.ts";
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
    // **As it shipped at 4e3c7153**: `measure` plans once per expanded row.
    name: "measure plans per row",
    file: DEFINITION,
    from: "    for (const row of block.rows) total += detailHeight(block, row, w, measureChild, planOf);",
    to: "    for (const row of block.rows) total += detailHeight(block, row, w, measureChild);",
    expect: "T3.24 (C11 I32",
  },
  {
    // `unitsOf`, which `window` walks.
    name: "unitsOf plans per row",
    file: DEFINITION,
    from: "    out.push({ rows: 1 + detailHeight(block, row, width, measureChild, planOf), row, bar: false });",
    to: "    out.push({ rows: 1 + detailHeight(block, row, width, measureChild), row, bar: false });",
    expect: "T3.24 (C11 I32",
  },
  {
    name: "tableElements' heights plan per row",
    file: DEFINITION,
    from: "    const height = 1 + detailHeight(block, r, w, measureChild, planOf);",
    to: "    const height = 1 + detailHeight(block, r, w, measureChild);",
    expect: "T3.24 (C11 I32",
  },
  {
    // The second reader in the same loop — the row caught at the class, not the instance.
    name: "tableElements' row detail plans per row",
    file: DEFINITION,
    from: "    const detail = rowDetail(block, r, w, planOf);",
    to: "    const detail = rowDetail(block, r, w);",
    expect: "T3.24 (C11 I32",
  },
  {
    // **The walk's plan not held**: shared, and planned again on every ask.
    name: "the shared plan re-plans on every ask",
    file: DEFINITION,
    from: "  return () => (plan ??= plannedColumns(block, bodyWidth(width)));",
    to: "  return () => (plan = plannedColumns(block, bodyWidth(width)));",
    expect: "T3.24 (C11 I32",
  },
  {
    // **The mark measured per call**, as at 4e3c7153.
    name: "the mark measured per call",
    file: PLAN,
    from: "  return n > 0 ? MARK_CELLS + 1 + String(n).length : MARK_CELLS;",
    to: '  const mark = Math.max(glyphCells("expand"), glyphCells("collapse"));\n  return n > 0 ? mark + 1 + String(n).length : mark;',
    expect: "T3.24 (C11 I32",
  },
];

const results = await runPass({
  read,
  write,
  run,
  control: {
    // **A change the run's own corpus can see**: the reservation one cell wider,
    // which T1.41's `disclosureCells` table reads directly.
    file: PLAN,
    from: "  return n > 0 ? MARK_CELLS + 1 + String(n).length : MARK_CELLS;",
    to: "  return n > 0 ? MARK_CELLS + 2 + String(n).length : MARK_CELLS;",
    why: "every reservation one cell wider, so T1.41 fails — if this survives, the command runs nothing",
  },
  mutations: MUTATIONS,
});
console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
