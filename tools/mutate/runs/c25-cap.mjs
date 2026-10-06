// C25 I14, I11, I24 — the collapsed form's hunk cap (C25 T6.10).
//
// **The row-count cut needs two edits**: the admission told to ignore the
// next hunk's rows, and the render clipping to the budget. Either alone is a
// different defect — the first overruns the cap, the second draws fewer rows
// than `measure` counts — and T3.10 is written against the pair: a hunk header
// drawn with its line cut off.
//
// Anchors checked for uniqueness before the pass (F219), atomic `fsIo` (F237).
import { execSync } from "node:child_process";
import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CAP = "src/presentation/patch/cap.ts";
const DEFINITION = "src/presentation/patch/definition.ts";

const FILES = "test/contract/patch-window.test.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 300_000 });
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
    file: CAP,
    from: "  return block.expanded === true ? null : capPlan(block, width);",
    to: "  return capPlan(block, width);",
    why: "expanded no longer sets the cap aside — T2.18 asserts the expanded form's height",
  },
  mutations: [
    {
      name: "the cap cut by row count rather than at a hunk boundary",
      file: CAP,
      from: "    if (shown > 0 && rows + next + 1 > cap) break;",
      to: "    if (shown > 0 && rows + 1 > cap) break;",
      also: [
        {
          file: DEFINITION,
          from: "    if (capped !== null) {\n      out.push(line([{ text: moreText(",
          to: "    if (capped !== null) {\n      out.length = Math.min(out.length, (whole.cap ?? 0) - 1);\n      out.push(line([{ text: moreText(",
        },
      ],
      expect: "T3.10",
    },
    {
      name: "the first hunk not always admitted",
      file: CAP,
      from: "    if (shown > 0 && rows + next + 1 > cap) break;",
      to: "    if (rows + next + 1 > cap) break;",
      expect: "T2.18",
    },
    {
      name: "the gutter taken from the admitted hunks rather than the whole block (C25 I21a)",
      file: CAP,
      from: "hunks: block.hunks.slice(0, capped.shown), numberWidth: numberWidth(block) };",
      to: "hunks: block.hunks.slice(0, capped.shown) };",
      expect: "T2.18",
    },
    {
      name: "the fold's collapse writes false rather than removing the field (C25 I11)",
      file: CAP,
      from: "  const { expanded: _expanded, ...rest } = block;\n  return rest;",
      to: "  return { ...block, expanded: false };",
      expect: "T2.18",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
