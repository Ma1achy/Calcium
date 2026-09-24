// C10 I57 — the landing record, mutated.
//
// **The subject is a table of true statements, which is the hardest thing to
// gate.** Fifteen rows naming fifteen symbols that all resolve pass exactly like
// a checker that reads nothing, so the mutations here attack the reading rather
// than the rows: a symbol that no longer exists, a file that does not, and a
// name that was renamed rather than deleted — which is the failure a `grep -l`
// over the repository would miss, because the replacement is in the same file.
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const MD = "docs/design/language/MILESTONES.md";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync("npx vitest run test/contract/theme.test.ts 2>&1", { cwd: ROOT, encoding: "utf8", timeout: 300_000 });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: MD,
    // The heading gone, so the section is unfindable and the table parses
    // empty. **Anchored on more than the number**, because the sibling run
    // `c10-carriers.mjs` learnt this the expensive way: renaming `4k.5` to
    // `4k.5x` left the regex matching, and a control that cannot fail reports
    // thoroughness.
    from: "## The landing record — one row per MR, and the symbol that proves it",
    to: "## The landing recordx — one row per MR, and the symbol that proves it",
    why: "with the section unfindable the table parses empty; a run where this survives cannot see a kill",
  },
  mutations: [
    {
      // **THE DEFECT: a seam reverted and the record not updated.** This is the
      // whole reason the table exists — M9 renamed `PushedSurface` to
      // `ChildSurface`, and a revert would put the old name back in the same
      // file, so a check for *the file still mentions a surface* would pass.
      name: "THE DEFECT: M9's seam named by the symbol it retired",
      file: MD,
      from: "| **M9** | no pushed views — the surface re-homed onto `child` | `ChildSurface` |",
      to: "| **M9** | no pushed views — the surface re-homed onto `child` | `PushedSurface` |",
      expect: "T2.58",
    },
    {
      // A row naming a file that is not there. The two failures are separate
      // arms in the gate because they fail for different reasons and a reader
      // meeting one needs to know which.
      name: "a row names a file that does not exist",
      file: MD,
      from: "| `ownerEpoch` | `src/interaction/router/router.ts` |",
      to: "| `ownerEpoch` | `src/interaction/router/routes.ts` |",
      expect: "T2.58",
    },
    {
      // Half the table gone. The count is asserted because a parse that started
      // matching nothing would otherwise report every remaining row resolving
      // — which is true, and useless.
      name: "the table loses its rows and every one that remains still resolves",
      file: MD,
      from: "| **M5** | one ownership ladder, with explicit verdicts | `Verdict` | `src/interaction/router/types.ts` |",
      to: "",
      expect: "T2.58",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
