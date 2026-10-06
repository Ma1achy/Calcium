// C04 I139 — drift has no period: its second term's period is 37·φ.
// Mutated (C04 T6.104).
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/ramp-registry.test.ts";
const RAMP = "src/presentation/blocks/ramp.ts";

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
    file: RAMP,
    from: "const DRIFT_B = 37 * ((1 + Math.sqrt(5)) / 2);",
    to: "const DRIFT_B = 37;",
    why: "both terms at one period — the row returns every 37 ticks, which T2.117k cannot miss",
  },
  mutations: [
    {
      name: "RATIONAL: the second period back to 53 (T6.104)",
      file: RAMP,
      from: "const DRIFT_B = 37 * ((1 + Math.sqrt(5)) / 2);",
      to: "const DRIFT_B = 53;",
      expect: "T2.117k",
    },
    {
      // A rational multiple dressed as an irrational one: 37 · 1.5 shares the
      // period 111 with 37. The row returns inside the window.
      name: "RATIONAL-MULTIPLE: 37 · 3/2",
      file: RAMP,
      from: "const DRIFT_B = 37 * ((1 + Math.sqrt(5)) / 2);",
      to: "const DRIFT_B = 37 * 1.5;",
      expect: "T2.117k",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
