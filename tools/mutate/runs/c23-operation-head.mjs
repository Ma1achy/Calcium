// C23 I76 and C09 I104 — §036's operation surface, mutated.
//
// **The subject is a structural interaction, so the mutations are the arms that
// read as one rule.** §036 draws the head twice and the two differ by *which of
// two correct statements applies*; every mutation below is a build in which one
// of them is applied at both ends, or in which the three stopped states are
// answered by one argument instead of two.
//
// The command names the rows' own file and `table.test.ts`'s neighbour
// `blocks.test.ts`, so a change that pays for the head out of the notice's
// ordinary path is seen (F1243 — a mutation reaches only as far as its command).
//
// Anchors and expectations run by hand on 2026-09-24.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/operation-head.test.ts test/contract/blocks.test.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const DOCS = "src/shell/documents.ts";
const SIMPLE = "src/presentation/blocks/kinds/simple.ts";

const results = runPass({
  read,
  write,
  run,
  control: {
    file: DOCS,
    from: "  return [op.verb, ...numbers, ...outcome].join(sep);",
    to: "  return numbers.length === 0 ? op.verb : `${op.verb} (${numbers.join(sep)})`;",
    why: "the settled head bracketed like the running one — §036 draws it flat, and a row that cannot see `● compacted · (6m 12s · …)` cannot see the half of C23 I76 the walk was written for",
  },
  mutations: [
    {
      // **The empty group.** `()` says *these are the numbers* about no
      // numbers, and it is exactly what an unguarded bracket draws.
      name: "the aside is drawn even with nothing in it",
      file: DOCS,
      from: "    return numbers.length === 0 ? head : `${head} (${numbers.join(sep)})`; // cells-ok — a field count",
      to: "    return `${head} (${numbers.join(sep)})`; // cells-ok — a field count",
      expect: "T1.71",
    },
    {
      // The bar's predicate narrowed to settlement, which is the rule written
      // from one of its two arguments — a cancelled operation keeps its frozen
      // fill, and the frame says progress is being made that is not.
      name: "the bar goes on settlement alone",
      file: DOCS,
      from: '  if (!operationRunning(op) || op.current === undefined || op.total === undefined) return [head];',
      to: '  if ((op.state ?? "running") === "succeeded" || op.current === undefined || op.total === undefined) return [head];',
      expect: "T1.72",
    },
    {
      // **The running head loses its state**, so it stops being a head (C09
      // I46) and wraps — the defect the frame found before the row existed.
      name: "the running head is an ordinary notice and wraps",
      file: DOCS,
      from: '      ? { ...base, state: "running" as const }',
      to: "      ? base",
      expect: "T1.72",
    },
    {
      // The stopped head takes the running mark too, so the `●` the state
      // resolves never arrives and every settled line starts with a spinner
      // frame from a walk that is not walking.
      name: "the stopped head is composed as a running one",
      file: DOCS,
      from: "  const running = operationRunning(op);",
      to: "  const running = true;",
      expect: "T1.71",
    },
    {
      // C09 I104 restored to the unconditional third. Every count agrees; the
      // bar is nineteen cells short and the row begins with blank.
      name: "the label column is reserved whether or not there is a label",
      file: SIMPLE,
      from: '    const labelRoom = block.label === "" ? 0 : Math.max(0, Math.floor(width / 3));',
      to: "    const labelRoom = Math.max(0, Math.floor(width / 3));",
      expect: "T1.71",
    },
    {
      // The column goes and the gap stays — the half-fix, one leading space
      // where §036 puts the bar at the row's own first cell.
      name: "the gap survives the column it separated",
      file: SIMPLE,
      from: "    const gaps = labelRoom === 0 ? 1 : 2;",
      to: "    const gaps = 2;",
      expect: "T1.71",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
