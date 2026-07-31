// C01 I12a — the size accessor §5 deferred until it had a caller and a rule.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const SUITE = "test/edge/lifecycle.test.ts";

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
  // Its kill is not in doubt: T3.18b asserts the returned pair.
  control: {
    file: "src/terminal/lifecycle.ts",
    from: "    return Object.freeze({ columns: stdout.columns, rows: stdout.rows });",
    to: "    return Object.freeze({ columns: -1, rows: -1 });",
    why: "T3.18b asserts size() returns the terminal's dimensions",
  },
  mutations: [
    {
      name: "size() caches at construction instead of reading per call",
      file: "src/terminal/lifecycle.ts",
      from: "    size: snapshotSize,",
      to: "    size: (() => { const once = snapshotSize(); return () => once; })(),",
      expect: "T3.18b",
    },
    {
      name: "size() reads each dimension twice",
      file: "src/terminal/lifecycle.ts",
      from: "    return Object.freeze({ columns: stdout.columns, rows: stdout.rows });",
      to: "    return Object.freeze({ columns: stdout.columns && stdout.columns, rows: stdout.rows });",
      expect: "T3.18b",
    },
    {
      name: "size() does not freeze",
      file: "src/terminal/lifecycle.ts",
      from: "    return Object.freeze({ columns: stdout.columns, rows: stdout.rows });",
      to: "    return { columns: stdout.columns, rows: stdout.rows };",
      expect: "T3.18b",
    },
    {
      name: "size() is gated on acquired, as everything else here is",
      file: "src/terminal/lifecycle.ts",
      from: "    size: snapshotSize,",
      to: '    size: () => { if (state !== "acquired") throw new Error("not acquired"); return snapshotSize(); },',
      expect: "T3.18c",
    },
    {
      name: "onWinch stops sharing the accessor's snapshot",
      file: "src/terminal/lifecycle.ts",
      from: "    const size = snapshotSize();\n    for (const cb of resizeSubscribers) cb(size);",
      to: "    for (const cb of resizeSubscribers) cb(snapshotSize());",
      expect: "T3.17",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
