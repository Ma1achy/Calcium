// Nested scrollables each draw their own bar, in their own last column
// (C09 I115, ruling 22).
//
// **Two of the mutations are the readings the ruling rejected**, so a survivor
// here would mean the row cannot tell the ruling from its alternatives.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/scrollbar-nested.test.ts";
const C = "src/presentation/blocks/kinds/containers.ts";

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
    // *The outermost draws and the inner declines* — for this fixture the
    // inner is the box of three rows, so a bar gated on a taller interior is
    // exactly that reading.
    name: "the outer draws and the inner declines",
    file: C,
    from: "      if (bar) {\n        const column = scrollbarColumn(",
    to: "      if (bar && interior > 3) {\n        const column = scrollbarColumn(",
    expect: "T1.83",
  },
  {
    // One column shared: the content is not narrowed for the bar, so the
    // inner's bar is pushed onto the outer's column.
    name: "a box does not narrow its content for its bar",
    file: C,
    from: "  const narrow = width - 1; // cells-ok — a width less its bar",
    to: "  const narrow = width; // cells-ok — a width less its bar",
    expect: "T1.83",
  },
  {
    // The bar drawn one cell in from the box's edge.
    name: "the bar sits one column short of the box's last",
    file: C,
    from: "const pad = \" \".repeat(Math.max(0, width - rowCells(row)));",
    to: "const pad = \" \".repeat(Math.max(0, width - rowCells(row) - 1));",
    expect: "T1.83",
  },
];

const results = await runPass({
  read,
  write,
  run,
  control: {
    // **A change the corpus can see**: no box draws a bar.
    file: C,
    from: "      if (bar) {\n        const column = scrollbarColumn(",
    to: "      if (false) {\n        const column = scrollbarColumn(",
    why: "no scroll draws a bar — if this survives, nothing reads the columns",
  },
  mutations: MUTATIONS,
});
console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
