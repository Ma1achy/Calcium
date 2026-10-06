// C23 I100 and C21 I19 — a document's exit code agrees with its status and with
// C07 I14: the shell route's code through `exitCodeOf`, a child that never
// started said as such, an `error` document with no code carrying 1, and a PTY
// child killed by a signal carrying no code (ruling 98; F1491; T6.116, C21 T6.23);
// and a line a `⌃c` cleared from the queue recorded, as -1 (F1492; T6.117).
//
// **One mutation per site**, each what shipped: the route's `code ?? 1`, its
// `exited with code 1` for a child with no exit status, the port's `exitCode`
// kept beside the signal's name, `meta()`'s flat 0, and the cleared queue's
// missing record and its code left at the document's default.
//
// **The verdict is read from the FAIL lines** (F1472): only *caught by the named
// row* counts as the row seeing it.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const EXECUTION = "src/shell/execution.ts";
const DOCS = "src/shell/documents.ts";
const RUNNER = "src/data/process/runner.ts";
const FILES = [
  "test/integration/process.test.ts",
  "test/contract/emulator.test.ts",
  "test/unit/error-doc.test.ts",
].join(" ");

const { read, write } = fsIo(ROOT);
const run = () => {
  let out;
  try {
    out = execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 300_000 });
  } catch (e) {
    out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    if (e.killed === true) out = `${out}\nTIMED OUT after 300000ms`;
  }
  const fails = out
    .replace(/\x1b\[[0-9;]*m/g, "")
    .split("\n")
    .filter((l) => /^\s*FAIL\s/.test(l));
  console.error(`  -- FAIL lines: ${fails.length === 0 ? "none" : `\n${fails.join("\n")}`}`);
  return out;
};

const results = runPass({
  read,
  write,
  run,
  control: {
    // **A change the corpus can see** (F1254): every signalled shell command's
    // box says something else.
    file: EXECUTION,
    from: "? `Killed by ${exit.signal}.`",
    to: "? `Stopped by ${exit.signal}.`",
    why: "the shell route's signal box reads `Stopped by` — if this survives, T4.100 is not reading the box",
  },
  mutations: [
    {
      // **What shipped** (F1491): 1 for a signal and for a child that never started.
      name: "T6.116: the shell route's code put back to exit.code ?? 1",
      file: EXECUTION,
      from: "exitCode: cancelled ? 130 : exitCodeOf({ exitCode: exit.code, signal: exit.signal }),",
      to: "exitCode: cancelled ? 130 : (exit.code ?? 1),",
      expect: "T4.100",
    },
    {
      // **What shipped**: an exit the child never returned.
      name: "T6.116: a spawn failure said to have exited with code 1",
      file: EXECUTION,
      from: '? "The command did not start."',
      to: '? "The command exited with code 1."',
      expect: "T4.100",
    },
    {
      // **What shipped in C21** (F1491): the port's 0 kept beside the name.
      name: "C21 T6.23: the PTY port's exitCode kept beside a named signal",
      file: RUNNER,
      from: "resolve({ code: name === null ? exitCode : null, signal: name });",
      to: "resolve({ code: exitCode, signal: name });",
      expect: "T2.9",
    },
    {
      // **What shipped**: `meta()`'s flat 0, so an error notice said exit 0.
      name: "T6.116: compose's default code put back to 0",
      file: DOCS,
      from: "exitCode: spec.exitCode ?? (status === \"error\" ? 1 : 0),",
      to: "exitCode: spec.exitCode ?? 0,",
      expect: "T1.106",
    },
    {
      // **What shipped** (F1492): the cleared line settled and recorded nowhere.
      name: "T6.117: the cleared line's record dropped",
      file: EXECUTION,
      from: "      deps.transcript.settle(item.id, doc);\n      recordHistory(item.line, doc);",
      to: "      deps.transcript.settle(item.id, doc);",
      expect: "T4.101",
    },
    {
      // The record kept and its code the document's default: a success.
      name: "T6.117: the cleared line's code put back to the default 0",
      file: EXECUTION,
      from: '"cancelled before it ran", { origin: "user", exitCode: -1 }),',
      to: '"cancelled before it ran", { origin: "user" }),',
      expect: "T4.101",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
