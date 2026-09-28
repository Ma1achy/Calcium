// Records the ASCII rung's one cadence — 120 ms for every set (question 40;
// C09 I112, `R-MOT-011`).
//
//     node tools/design/register-ascii-interval.mjs [--dir <dir>]
//
// **A one-shot, kept for `register-sel.mjs`'s reason**: the registry is the
// normative source and the edit has to be auditable after it has run.
//
// **Why a policy field and not a field per set.** Question 40's premise was that
// the registry records no ASCII interval to share — every set's `intervalMs` is
// its Unicode rung's, and the nine sets sharing `|/-\` sit at nine intervals.
// The ruling is one cadence for the whole rung, so it is one number, on the
// policy every set's rung is resolved under; twenty-seven copies of 120 would be
// twenty-seven places for one to drift. `R-MOT-011` joins the policy's citations
// because it is the rule the number satisfies per rung (ruling 30).
//
// **It lands with the builder and the tree, never alone**: the builder draws the
// ASCII keyframes over it and the fallback table prints it, and T2.73 holds the
// tree's rung equal to it.
//
// **Every write is asserted**: a run on a registry that already holds the field
// is a no-op that says so, and anything else that does not match exits non-zero
// having written nothing.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dirAt = args.indexOf("--dir");
const dir = dirAt >= 0 ? resolve(args[dirAt + 1]) : resolve(here, "../../docs/design/language");
const registryPath = join(dir, "calcium-registry.json");

const raw = readFileSync(registryPath, "utf8");
const registry = JSON.parse(raw);
const serialise = (r) => `${JSON.stringify(r, null, 2)}\n`;
let failed = 0;
const fail = (m) => { console.error(`  ${m}`); failed += 1; };
const stop = () => { console.error(`FAIL · ${failed} problems, nothing written`); process.exit(1); };

const MS = 120;
const policy = registry.spinnerPolicy;

if (serialise(registry) !== raw) fail("the registry does not round-trip at indent 2");
if (policy === undefined) fail("no spinnerPolicy");
else if ("asciiIntervalMs" in policy) {
  if (policy.asciiIntervalMs !== MS) fail(`asciiIntervalMs is already ${String(policy.asciiIntervalMs)}, not ${String(MS)}`);
  else {
    console.log(`already recorded · spinnerPolicy.asciiIntervalMs is ${String(MS)}, nothing written`);
    process.exit(0);
  }
} else {
  if (JSON.stringify(policy.ruleIds) !== JSON.stringify(["R-MOT-005"])) fail(`spinnerPolicy cites ${JSON.stringify(policy.ruleIds)}, not ["R-MOT-005"]`);
  const rule = registry.rules.find((r) => r.id === "R-MOT-011");
  if (rule?.status !== "current") fail("R-MOT-011 is not a current rule");
  // **The premise, re-measured rather than carried** (question 40): the three
  // shared ASCII alphabets at more than one interval. If they already agreed,
  // the ruling would have nothing to do and this script should not run.
  const current = registry.spinners.filter((sp) => sp.status === "current");
  const byPattern = new Map();
  for (const sp of current) {
    if (!Array.isArray(sp.asciiPattern)) continue;
    const key = sp.asciiPattern.join("");
    byPattern.set(key, [...(byPattern.get(key) ?? []), sp.intervalMs]);
  }
  const spread = [...byPattern.entries()].filter(([, ms]) => ms.length > 1 && new Set(ms).size > 1);
  if (spread.length !== 3) fail(`${String(spread.length)} shared ASCII alphabets at more than one interval, not the three question 40 measured`);
  if (!current.some((sp) => sp.intervalMs === MS)) fail(`no set runs at ${String(MS)} ms at its Unicode rung`);
}
if (failed > 0) stop();

// After `terminalResolution`, before `ruleIds`, so the citation stays last.
const next = {};
for (const [key, value] of Object.entries(policy)) {
  if (key === "ruleIds") {
    next.asciiIntervalMs = MS;
    next.ruleIds = [...value, "R-MOT-011"];
  } else next[key] = value;
}
registry.spinnerPolicy = next;
writeFileSync(registryPath, serialise(registry));

// Read back: the write is the claim, and this is what checks it.
const after = JSON.parse(readFileSync(registryPath, "utf8")).spinnerPolicy;
if (after.asciiIntervalMs !== MS || JSON.stringify(after.ruleIds) !== JSON.stringify(["R-MOT-005", "R-MOT-011"])) {
  console.error("FAIL · spinnerPolicy did not land as written");
  process.exit(1);
}
console.log(`recorded spinnerPolicy.asciiIntervalMs = ${String(MS)}; ruleIds ${after.ruleIds.join(", ")}`);
