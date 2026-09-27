// A01 §Host assumptions — the Node floor is Unicode 17's. NF1 and NF2 were run
// under the real v22.22.0 binary (Unicode 16.0) and failed, naming it; this run
// covers NF3's set: one example, and one lockfile root, left on the old range.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/node-floor.test.ts";

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
    file: "test/unit/node-floor.test.ts",
    from: "const RANGE = \">=22.22.1 <23\";",
    to: "const RANGE = \">=22.22.2 <23\";",
    why: "the expected range moved a patch — every declaration now disagrees with it",
  },
  mutations: [
    {
      name: "EXAMPLE-LEFT: the plots example keeps the old range",
      file: "examples/plots/package.json",
      from: "\"node\": \">=22.22.1 <23\"",
      to: "\"node\": \">=22\"",
      expect: "NF3 (A01 §Host assumptions)",
    },
    {
      name: "LOCK-LEFT: the minimal example's lockfile root keeps the old range",
      file: "examples/minimal/package-lock.json",
      // Anchored on the root entry's own line — the one followed by the
      // `../..` entry. A first draft inserted a second `engines` key instead,
      // and JSON.parse keeps the last duplicate: vacuous.
      from: "\"node\": \">=22.22.1 <23\"\n      }\n    },\n    \"../..\": {",
      to: "\"node\": \">=22\"\n      }\n    },\n    \"../..\": {",
      expect: "NF3 (A01 §Host assumptions)",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
