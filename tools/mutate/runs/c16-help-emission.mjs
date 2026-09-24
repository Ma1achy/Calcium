// C16 I57, C23 I79 — `?` and `F1` emit the keymap entry, mutated.
//
// **Every mutation here puts back one of a submission's three side effects**,
// which is the whole failure mode: the entry still appears, so a reader looking
// only at the transcript sees help working while the draft is gone or the
// history holds a line nobody typed.
//
// The control is the route as it shipped before the ruling: the action submits
// the line. Restored, F1 clears the draft — a run that cannot see that cannot
// see anything below it.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/surface.test.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: "src/shell/keys.ts",
    from: '    helpKeymap: () => void deps.emit("/help keys"),\n',
    to: '    helpKeymap: () => void deps.submit("/help keys"),\n',
    why: "the shipped route before C16 I57 — the key submits, so the draft clears and history records a line nobody typed",
  },
  mutations: [
    {
      // I28 arriving at the emission: the prompt cleared as a submission's is.
      name: "the emission clears the prompt",
      file: "src/shell/execution.ts",
      from: "    if (handler === undefined) return;\n    const startedAt = deps.elapsed();\n",
      to: "    if (handler === undefined) return;\n    deps.editor.clear();\n    const startedAt = deps.elapsed();\n",
      expect: "T1.109",
    },
    {
      // I29 arriving at the emission: the line recorded as though typed.
      name: "the emission records the line in history",
      file: "src/shell/execution.ts",
      from: "      appendAndCommit(carded(completeLocal(produced, { command: line, verb, argv, durationMs: deps.elapsed() - startedAt })));\n",
      to: "      appendAndCommit(carded(completeLocal(produced, { command: line, verb, argv, durationMs: deps.elapsed() - startedAt })));\n      deps.history.append(line, 0);\n",
      expect: "T1.109",
    },
    {
      // The emission dropped: nothing appends, and nothing else changes.
      name: "the emission appends nothing",
      file: "src/shell/execution.ts",
      from: "    const result = classify(line);\n    if (result.kind !== \"local\") return;\n    const verb = result.tool.name;\n",
      to: "    const result = classify(line);\n    if (result.kind === \"local\") return;\n    const verb = result.tool.name;\n",
      expect: "T1.109",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
