// C23 §5a — the two channels a swallowed failure is reported on, and the four
// statements the catch used to abandon.
//
// **The revert every mutation here restores is what shipped for the life of the
// project**, and its symptom is that there is none: no entry, no message, no
// exit code, and a green suite. F15 took four wrong turns to find for exactly
// that reason. So the interesting question is not whether a mutation is caught
// but whether it is *visible* — and the answer, before this row, was no on every
// one of them.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const SUITE = [
  "test/unit/execution.test.ts",
  "test/integration/session.test.ts",
  "test/contract/history.test.ts",
].join(" ");

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`npx vitest run ${SUITE} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: "src/shell/execution.ts",
    from: "      if (line !== undefined) recordHistory(line, doc);\n      deps.resetFocus();",
    to: "      if (line !== undefined) recordHistory(line, doc);",
    why: "C23 T4.7b asserts `resetFocus` is called between the append and the commit, and it is the row this whole ruling extends — a run in which removing it survives is a run that cannot see a kill",
  },
  mutations: [
    // --- T6.46 — the shipped behaviour, restored -----------------------------
    {
      name: "the bare catch: record nothing",
      file: "src/shell/execution.ts",
      from: "      contain(\"appendAndCommit\", cause);",
      to: "      void cause;",
      expect: "T1.45",
    },
    // --- T6.47 / T6.48 — one channel each ------------------------------------
    {
      name: "keep the collection, drop the notice",
      file: "src/shell/execution.ts",
      from: "    if (!recordFault(stage, cause)) return;\n    if (deps.session().stopping) return;",
      to: "    if (!recordFault(stage, cause)) return;\n    if (true) return;",
      expect: "T1.48",
    },
    {
      name: "keep the notice, drop the collection",
      file: "src/shell/execution.ts",
      from: "    if (faults.includes(text)) return false;\n    faults.push(text);\n    return true;",
      to: "    if (faults.includes(text)) return false;\n    return true;",
      expect: "T3.38",
    },
    // --- T6.49 — the ordering C22 I6 is about --------------------------------
    {
      name: "drain the diagnostics before the release",
      file: "src/shell/session.ts",
      from: "    graph.lifecycle.release();",
      to: "    for (const line of graph.diagnostics()) this.config.stdout.write(`${line}\\n`);\n    graph.lifecycle.release();\n    if (false)",
      expect: "T4.27",
    },
    // --- T6.50 — the statement the catch abandoned ---------------------------
    {
      name: "the catch skips resetFocus again",
      file: "src/shell/execution.ts",
      from: "      try {\n        deps.resetFocus();\n      } catch (second) {",
      to: "      try {\n        if (false) deps.resetFocus();\n      } catch (second) {",
      expect: "T1.47",
    },
    // --- the drain's own sources ---------------------------------------------
    {
      name: "step 3 drains the capability warnings only, as it did",
      file: "src/shell/construct.ts",
      from: "        ...detection.warnings,\n        ...stores.history.warnings,\n        ...pipeline.faults,",
      to: "        ...detection.warnings,",
      expect: "T4.20",
    },
    {
      name: "step 3 forgets C23's faults",
      file: "src/shell/construct.ts",
      from: "        ...stores.history.warnings,\n        ...pipeline.faults,",
      to: "        ...stores.history.warnings,",
      expect: "T4.27",
    },
    // --- the dedup, in both directions ---------------------------------------
    {
      name: "record every occurrence, not the first",
      file: "src/shell/execution.ts",
      from: "    const text = `${stage}: ${String(cause)}`;\n    if (faults.includes(text)) return false;",
      to: "    const text = `${stage}: ${String(cause)}`;",
      expect: "T1.46",
    },
    // --- the notice's provenance ---------------------------------------------
    {
      name: "a defect files itself under `refresh`",
      file: "src/shell/execution.ts",
      from: "\"error\", { origin: \"defect\" }, \"error\"",
      to: "\"error\", { origin: \"refresh\" }, \"error\"",
      expect: "T1.48",
    },
    // --- the class the fabricated ladder found -------------------------------
    {
      name: "a notice with status `error` carries no `error` again",
      file: "src/shell/documents.ts",
      from: "    ...(status === \"error\" ? { error: { message: text } } : {}),",
      to: "",
      expect: "T3.38",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
