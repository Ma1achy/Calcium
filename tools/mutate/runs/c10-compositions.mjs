// C10 I47, §4k.4 — the compositions are one case table, and T2.48 asks each
// case whether its frame answers its facts. Mutated (C10 T6.125, T6.126).
//
// **T6.126 is the arm the row exists for**: an owed case that can be
// constructed. It is fabricated by marking a drawn case owed, which is the
// state the tree reaches the day an owed composition acquires its subject.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/theme.test.ts";
const CONTAINERS = "src/presentation/blocks/kinds/containers.ts";
const CASES = "test/support/compositions.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
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
    file: CASES,
    from: '    name: "stale + running",',
    to: '    name: "stale and running",',
    why: "a case no longer named as §4k.2 names it — T2.48 holds the two sets equal",
  },
  mutations: [
    {
      name: "the stale panel drawn as though fresh at the notice and the recede (T6.125)",
      file: CONTAINERS,
      from: "    const noticePart = block.staleForMs === undefined\n",
      to: "    const noticePart = true\n",
      also: [
        {
          file: CONTAINERS,
          from: "    const childTheme = block.staleForMs === undefined ? undefined : recede(ctx.theme);",
          to: "    const childTheme = undefined;",
        },
      ],
      expect: "T2.48",
    },
    {
      name: "a constructible case marked owed (T6.126)",
      file: CASES,
      from: '    row: 6,\n    name: "stale + running",\n',
      to: '    row: 6,\n    name: "stale + running",\n    owed: "fabricated — the case is drawn",\n',
      expect: "T2.48",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
