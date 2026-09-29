// SS69 — a literal bidi format character in a tracked text file (A03 SS69;
// F1402, review batch 4, class-checks lane).
//
// **Each arm of the rule is mutated, and the controls with them**: the match,
// the exemption skip and its equality arm, the parse of `isBidiFormat`, the
// `git grep` narrowing and the tracked-set control. A scan that fires on
// nothing and one whose corpus is empty are the same green on a clean tree.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = 'npx vitest run --maxWorkers=3 test/unit/enforce-rules.test.ts -t "SS69"';
const SCANS = "tools/enforce/source-scans.mjs";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = await runPass({
  read,
  write,
  run,
  control: {
    // The set control inverted: every well-read set is reported as unread.
    file: SCANS,
    from: "  if (!codePoints.includes(0x202e)) {",
    to: "  if (codePoints.includes(0x202e)) {",
    why: "every row with the real set returns the unread-set violation alone, so the rows expecting one at a line fail",
  },
  mutations: [
    {
      // **THE DEFECT**: nothing fires — the state before SS69.
      name: "THE DEFECT: no character fires",
      file: SCANS,
      from: "        if (!set.has(cp)) continue;\n        holding.add(file);",
      to: "        continue;\n        holding.add(file);",
      expect: "SS69 fires: a literal U+202E",
    },
    {
      // **The exemption list read as a blanket**: every file exempt.
      name: "every file is exempt",
      file: SCANS,
      from: "        if (Object.hasOwn(exemptions, file)) continue;",
      to: "        continue;",
      expect: "SS69 fires: a literal U+202E",
    },
    {
      // **The equality arm removed**: a dead exemption outlives its file.
      name: "a dead exemption passes",
      file: SCANS,
      from: "    if (holding.has(file)) continue;\n    violations.push({\n      rule: \"SS69\",",
      to: "    continue;\n    violations.push({\n      rule: \"SS69\",",
      expect: "SS69's exemptions",
    },
    {
      // **The single-code-point arm of the parse dropped**: the ranges alone,
      // so U+061C, U+200E and U+200F leave the set.
      name: "the parse reads ranges only",
      file: SCANS,
      from: "    if (m[1] !== undefined) out.push(Number.parseInt(m[1], 16));\n    else for",
      to: "    if (m[1] !== undefined) continue;\n    else for",
      expect: "SS69 fires on every member",
    },
    {
      // **The narrowing returns nothing**: `git grep` asked and its answer
      // dropped — a scan that ran and saw no file.
      name: "git grep's answer dropped",
      file: SCANS,
      from: "  return { tracked, files: listed.split(\"\\0\").filter((f) => f !== \"\").sort() };",
      to: "  return { tracked, files: [] };",
      expect: "SS69 reads through git",
    },
    {
      // **The empty-corpus control removed**: no tracked file passes.
      name: "an empty corpus passes",
      file: SCANS,
      from: "  if (tracked === 0) {",
      to: "  if (tracked < 0) {",
      expect: "SS69's vacuity controls",
    },
    {
      // **Binary files read**: `-I` dropped, so a PNG holding the bytes fires.
      name: "binary files are candidates",
      file: SCANS,
      from: "    listed = git([\"grep\", \"-I\", \"-l\", \"-z\", \"-F\", ...patterns]);",
      to: "    listed = git([\"grep\", \"-l\", \"-z\", \"-F\", ...patterns]);",
      expect: "SS69 reads through git",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
