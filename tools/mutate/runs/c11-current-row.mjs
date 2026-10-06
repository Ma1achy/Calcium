// C11 I33, §5d — the current row: the mark, the pick ground and the weight,
// with the mark's cells reserved on every row (ruling 89, F1474; T6.36, T6.37).
//
// **Four ways to break it, one per carrier and one for the geometry.** The
// reservation keyed on the value rather than the presence (T6.36), the ground
// dropped (T6.37), the weight dropped, and the lead left inside the column's
// width rather than taken off it, which is the one that puts a row over the
// block's edge.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass, strip } from "../mutate.mjs";

const ROOT = process.cwd();
const DEFINITION = "src/presentation/table/definition.ts";
const CELLS = "src/presentation/table/cells.ts";
const FILES = "test/unit/table-current.test.ts test/edge/table-current.test.ts test/revert/table-current.test.ts";

const CONTROL = {
  // **A change the corpus can see** (F1254): no table has a lead column, so
  // nothing is marked, reserved or grounded.
  file: DEFINITION,
  from: "    const leadKey =\n      block.current === undefined\n        ? undefined",
  to: "    const leadKey =\n      block.current !== null\n        ? undefined",
  why:
    "the lead column is never found, so no row carries the mark or the reservation — "
    + "if this survives, the rows are not reading the current row at all",
};

const MUTATIONS = [
  {
    // **T6.36**: the slot goes with the mark, so a current naming no row —
    // a chooser the wheel scrolled past it — moves every label left.
    name: "T6.36: the reservation keyed on the value",
    file: DEFINITION,
    from: "      block.current === undefined\n        ? undefined",
    to: "      block.current === undefined || !block.rows.some((r) => r.id === block.current)\n        ? undefined",
    expect: "T1.43",
  },
  {
    // **T6.37**: the mark and the weight on the page, the row not one thing.
    name: "T6.37: the current row takes no ground",
    file: DEFINITION,
    from: ': on === "focusGround" ? focusGround : isCurrent ? pickGround : null;',
    to: ': on === "focusGround" ? focusGround : null;',
    expect: "T1.43",
  },
  {
    // **The weight**: the carrier that survives one bit.
    name: "the current row's first cell is not bold",
    file: CELLS,
    from: "options.current.key === whole.key ? { ...inked, bold: true } : inked;",
    to: "options.current.key === whole.key ? inked : inked;",
    expect: "T1.43",
  },
  {
    // **The lead inside the width**: the cell is fitted to the whole column
    // and the lead drawn beside it, so the row runs past the block's edge.
    name: "the lead is not taken off the column",
    file: CELLS,
    from: "  const rest = { ...planned, width: planned.width - used };",
    to: "  const rest = planned;",
    expect: "T3.25",
  },
];

const { read, write } = fsIo(ROOT);

/**
 * **Which rows failed, printed after every run** (F1472). The pass reports
 * `caught` when the named row's id is anywhere in the output, and vitest prints
 * a passing row's line under a file where another row failed, so the verdict
 * alone cannot say the named row went red. The `FAIL` lines can.
 */
const named = () => {
  const hit = [{ name: "control", ...CONTROL }, ...MUTATIONS].find((m) => read(m.file).includes(m.to));
  return hit === undefined ? "the clean tree" : hit.name;
};
const run = () => {
  const label = named();
  let out;
  try {
    out = execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 300_000 });
  } catch (e) {
    const both = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    out = e.killed === true ? `${both}\nTIMED OUT after 300000ms` : both;
  }
  const fails = [...new Set(strip(out).split("\n").filter((l) => /^\s*FAIL\s/u.test(l)).map((l) => l.trim()))];
  console.log(`── ${label}: ${String(fails.length)} FAIL line(s)`);
  for (const l of fails) console.log(`   ${l}`);
  return out;
};

const results = runPass({
  read,
  write,
  run,
  control: CONTROL,
  mutations: MUTATIONS,
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
