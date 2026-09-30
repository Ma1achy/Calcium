// C23 I95, §8a A6.6 — a handoff's notice takes the tone and mark of the status
// it sits on (ruling 91, F1476, T6.110).
//
// **Three ways to break one classification, one per rule that meets in it.**
// The failure arm put back to the tone that shipped, a member dropped from the
// cancel set, and the cancel arm's mark left to the tone's derivation — which
// is the walk's row 5, where the continuation mark and the state's mark claim
// one slot. Each is a change to one arm that leaves the other two correct, so
// a row asserting fields one at a time would pass two of them.
//
// **The verdict is read from the FAIL lines as well as from the report**
// (F1472): `byNamedTest` is a substring over the whole output, so every
// mutation's failing rows are printed here and the named row is checked
// against them rather than trusted.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const EXECUTION = "src/shell/execution.ts";
const FILES = "test/integration/process.test.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  let out;
  try {
    out = execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 300_000 });
  } catch (e) {
    out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    if (e.killed === true) out = `${out}\nTIMED OUT after 300000ms`;
  }
  // The rows that really failed, for F1472's check by eye.
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
    // **A change the corpus can see** (F1254): every handoff's label is the
    // fallback, so no notice names `vim` and every row of T4.93's table moves.
    file: EXECUTION,
    from: 'const headOf = (command: string): string => command.split(/\\s+/u)[0] ?? "shell";',
    to: 'const headOf = (command: string): string => (command === command ? "shell" : command);',
    why:
      "every handoff notice is labelled `shell` rather than `vim` — if this survives, T4.93 "
      + "is not reading the notice the handoff appended",
  },
  mutations: [
    {
      // **What shipped** (F1476): the failure's tone and mark a warning's on an
      // `error` document.
      name: "T6.110: the failure arm's tone put back to warn",
      file: EXECUTION,
      from: ': noticeDoc(line, text, "error", { origin: "user" }, "error"),',
      to: ': noticeDoc(line, text, "warn", { origin: "user" }, "error"),',
      expect: "T4.93",
    },
    {
      // A closed terminal read as a failure: the set is three by the ruling.
      name: "T6.110: SIGHUP dropped from the cancel set",
      file: EXECUTION,
      from: 'new Set(["SIGINT", "SIGTERM", "SIGHUP"])',
      to: 'new Set(["SIGINT", "SIGTERM"])',
      expect: "T4.93",
    },
    {
      // **The walk's row 5**: the cancel keeps its tone and status and takes
      // the continuation mark, because the tone's derivation answers first.
      name: "T6.110: the cancel arm's mark left to the tone's derivation",
      file: EXECUTION,
      from: '"partial", "cancelled")',
      to: '"partial")',
      expect: "T4.93",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
