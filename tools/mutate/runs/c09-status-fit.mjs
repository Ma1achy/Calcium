// C09 I31, I34, §3a-quater; C04 I66; C24 §4b — a status with no height is
// fitted at its layout width, and `b.status` declares none. Mutated (C09
// T6.137–T6.138, C24 T6.22).
//
// **The survivor this run was written against is a tautology.** `render`
// allocates from the same `statusHeight` as `measure`, so the two agree about
// the row count whatever the fit is; a fit one row short shows up only as a
// message cut at `…`. T3.98's first draft asserted agreement alone and would
// have passed every mutation below that shortens the fit — which is why it
// reads the words as well.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/edge/status.test.ts test/contract/blocks.test.ts test/contract/builders.test.ts " +
  "test/unit/execution.test.ts";
const STATUS = "src/presentation/blocks/kinds/status.ts";
const BUILDERS = "src/shell/builders/index.ts";

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
    file: STATUS,
    from: "  if (block.height === undefined) return statusRowsFor(block, width);",
    to: "  if (block.height === undefined) return statusRowsFor(block, width) + 1;",
    why: "a fit one row tall is one row of slack in every fitted box — T3.98's F-figures and T1.40's measured 3 both see it",
  },
  mutations: [
    {
      name: "MEASURE-ONE: a box with no height measures one row (T6.137)",
      file: STATUS,
      from: "  if (block.height === undefined) return statusRowsFor(block, width);",
      to: "  if (block.height === undefined) return 1;",
      expect: "T3.98",
    },
    {
      name: "MEASURE-ONE, seen through the builder (T6.137)",
      file: STATUS,
      from: "  if (block.height === undefined) return statusRowsFor(block, width);",
      to: "  if (block.height === undefined) return 1;",
      expect: "T4.8",
    },
    {
      name: "EMPTY-BANNER: statusRowsFor counts a banner `empty` never draws (T6.138, F10)",
      file: STATUS,
      from: 'rung.tag !== "none" && block.state !== "empty" ? 1 : 0;',
      to: 'rung.tag !== "none" ? 1 : 0;',
      expect: "T3.98",
    },
    {
      name: "DECLARED-AGAIN: framedStatus declares its old 1 and 2 (C24 T6.22)",
      file: BUILDERS,
      from: "      message: err.message,\n      state,\n",
      to: "      message: err.message,\n      state,\n      height: retryInMs === null ? 1 : 2,\n",
      expect: "T4.8",
    },
    {
      name: "MARK-UNCOUNTED: the fit wraps the message without the mark's cells",
      file: STATUS,
      from: '? `${"x".repeat(MARK_CELLS)} ` : "";',
      to: '? "" : "";',
      expect: "T3.98",
    },
    {
      name: "LINE-UNCOUNTED: the fit leaves out the activity line",
      file: STATUS,
      from: '  const lineRows = line === "" ? 0 : 1;\n  return rows',
      to: "  const lineRows = 0;\n  return rows",
      expect: "T3.98",
    },
    {
      name: "RENDER-DECLARED-ONLY: render floors an absent height to one row",
      file: STATUS,
      from: "    const height = statusHeight(block, width);",
      to: "    const height = Math.max(1, Math.floor(block.height ?? 1));",
      expect: "T3.98",
    },
    {
      name: "FIT-IGNORED: a declared height is re-sized by the fit",
      file: STATUS,
      from: "  if (block.height === undefined) return statusRowsFor(block, width);",
      to: "  return statusRowsFor(block, width);",
      expect: "T2.182",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
