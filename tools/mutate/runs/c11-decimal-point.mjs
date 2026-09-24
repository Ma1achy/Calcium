// C11 I26 — a column aligned on its decimal point, mutated.
//
// **The run exists because the frame corrected the first implementation.** Every
// count agreed and the column was wrong: clamping each cell's lead to its own
// slack put `0.0372` and `0.941` one cell apart in an 8-cell column, which is a
// worse answer than either alignment. The fix is a fallback taken **per column**,
// and three of the four mutations below are the shapes that fallback can lose.
//
// The command names `table-decimal.test.ts` because that is where I26's rows
// live (F1243 — a mutation reaches only as far as its run's command), and
// `table.test.ts` beside it so a change that pays for the alignment out of the
// ordinary cell path is seen.
//
// Anchors and expectations run by hand on 2026-09-24.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/table-decimal.test.ts test/unit/table.test.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const FILE = "src/presentation/table/cells.ts";

const results = runPass({
  read,
  write,
  run,
  control: {
    file: FILE,
    from: '    const point = align === "decimal" ? options.points?.get(planned.key) : undefined;',
    to: "    const point: number | undefined = undefined;",
    why: "the tree before C11 I26 — `decimal` draws exactly what `right` draws, which is §099's complaint; T2.14's two points land in two columns and the row that cannot see that cannot see the invariant",
  },
  mutations: [
    {
      // **The defect the frame found, restored.** Without the column-level
      // refusal every cell clamps its own lead to its own slack, so a column
      // too narrow for the alignment half-aligns: the points drift by one and
      // every arithmetic check agrees.
      name: "the fallback is taken per cell rather than per column",
      file: FILE,
      from: "    if (int + frac > room) continue;\n    points.set(column.key, int);",
      to: "    points.set(column.key, int);",
      expect: "T2.15",
    },
    {
      // The point stops being a point: every value becomes all integer part,
      // so every cell ends at the same cell — which *is* `right`, arrived at
      // the long way round.
      name: "the integer part is the whole value",
      file: FILE,
      from: "  return at < 0 ? text : text.slice(0, at); // cells-ok — a code-unit offset",
      to: "  return text;",
      expect: "T2.14",
    },
    {
      // **A fallback to the wrong side.** The column gives up on the point and
      // gives up on being a number with it — plausible, because `left` is the
      // default and the arm reads like a special case being removed.
      name: "a column with no room falls back to left",
      file: FILE,
      from: '    const rightish = align === "right" || align === "decimal";',
      to: '    const rightish = align === "right";',
      expect: "T2.15",
    },
    {
      // The fraction is measured without its point, so the column believes it
      // has one cell more than it does and aligns where it cannot — the
      // off-by-one that puts the last digit outside the column.
      name: "the fraction is measured without its point",
      file: FILE,
      from: "      frac = Math.max(frac, cells(text.slice(whole.length), ambiguous)); // cells-ok — a code-unit offset",
      to: "      frac = Math.max(frac, cells(text.slice(whole.length + 1), ambiguous)); // cells-ok — a code-unit offset",
      expect: "T2.15",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
