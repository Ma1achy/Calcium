// SS68 — every design rule a spec cites resolves in the registry (A03 SS68;
// review batch 4, round 2).
//
// **The row's controls are the subject here.** A resolver that resolves
// everything and one that resolves nothing are both easy to write and both read
// green on a clean tree — so each arm of the row is mutated: the lookup, the
// statuses it admits, and the vacuity return that stops an empty read passing.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = 'npx vitest run --maxWorkers=3 test/unit/enforce-rules.test.ts -t "SS68"';
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
    // Every citation fires — the row's control file and the real tree both see it.
    file: SCANS,
    from: "        if (known.has(m[0])) continue;\n        violations.push({\n          rule: \"SS68\",",
    to: "        violations.push({\n          rule: \"SS68\",",
    why: "every cited id is reported, so the control file and the tree both fire",
  },
  mutations: [
    {
      // **THE DEFECT**: nothing resolves anything — the state before SS68.
      name: "THE DEFECT: every citation passes",
      file: SCANS,
      from: "        if (known.has(m[0])) continue;\n        violations.push({\n          rule: \"SS68\",",
      to: "        continue;\n        violations.push({\n          rule: \"SS68\",",
      expect: "SS68 fires",
    },
    {
      // **Current only** — history refused, which the specs cite on purpose.
      name: "only current rules resolve",
      file: SCANS,
      from: "  const known = new Set((JSON.parse(registrySource).rules ?? []).map((r) => r.id));",
      to: "  const known = new Set((JSON.parse(registrySource).rules ?? []).filter((r) => r.status === \"current\").map((r) => r.id));",
      expect: "SS68 fires",
    },
    {
      // **The vacuity return removed**: an empty registry passes a silent corpus.
      name: "an empty read passes",
      file: SCANS,
      from: "  if (known.size === 0 || cited === 0) {",
      to: "  if (false) {",
      expect: "SS68 fires",
    },
    {
      // **The architecture documents dropped from the corpus.**
      name: "the corpus reads the components only",
      file: SCANS,
      from: "export const RULE_CITATION_DIRS = Object.freeze([\"docs/components\", \"docs/architecture\"]);",
      to: "export const RULE_CITATION_DIRS = Object.freeze([\"docs/components\"]);",
      expect: "SS68 fires",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
