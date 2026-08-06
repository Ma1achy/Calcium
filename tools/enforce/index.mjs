#!/usr/bin/env node
// A03 — the enforcement suite. `make enforce`.
// Every failure names: the rule, the file, what it prevents, and the spec.
import { readdirSync, statSync } from "node:fs";
import { checkFindings } from "./findings.mjs";
import {
  checkFunctionConsumers,
  checkModuleGraph,
  checkOneStorePerComponent,
  checkSeamConsumers,
  componentSeamSignal,
} from "./module-graph.mjs";
import { checkSourceScans } from "./source-scans.mjs";
import { checkDependencies, checkPhantomImports } from "./dependencies.mjs";
import {
  checkCommitments,
  checkOrdering,
  checkReferences,
  checkSeamFour,
  referenceFiles,
  specFiles,
} from "./commitments.mjs";

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = `${dir}/${e}`;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e) && !/\.d\.ts$/.test(e)) out.push(p);
  }
  return out;
}

const files = walk("src");
const specs = specFiles();
const references = referenceFiles();
const { violations: refViolations, resolved } = checkReferences(references);
const violations = [
  ...checkModuleGraph(files),
  // MG23 — one store per component above L0. SS29 folded here: as a source
  // scan its only in-scope file would have been its own exception.
  ...checkOneStorePerComponent(files),
  ...checkSeamConsumers(files),
  ...checkFunctionConsumers(files),
  ...checkSourceScans(files),
  ...checkDependencies(),
  ...checkPhantomImports(files),
  // The specs are enforced too. A03 governs the source; SP1 governs the
  // documents the source is written against, because a commitment nothing
  // enforces diverges from the implementation without anything going red.
  ...checkCommitments(specs),
  // SP2 — the numbers locate what they name. SP3 — and everything that cites
  // one of them resolves, which for eleven hundred references nothing did.
  ...checkOrdering(specs),
  // SP4 — Seam 4 and its owners agree, both directions. The only artefact
  // several components write to and none owns, wrong at every one that touched
  // it, because every row exists twice and nothing compared the copies.
  ...checkSeamFour(),
  // SP5 — the findings ledger is the most-cited document in the app and was the
  // only one with no citation check. Written after a wrong number resolved
  // against a real, unrelated finding with enforce green.
  ...checkFindings(),
  ...refViolations,
];

const RED = "\x1b[31m", DIM = "\x1b[2m", GREEN = "\x1b[32m", RESET = "\x1b[0m";

// Computed only for the summary line — it gates nothing, and computing it beside
// the violations would invite someone to push it into the list. F94.
const seam = componentSeamSignal(files);

if (violations.length === 0) {
  console.log(
    `${GREEN}✓${RESET} enforce · ${files.length} files · ${specs.length} specs · ` +
      `${resolved} invariant references resolved · no violations\n` +
      // **A reported signal, never a gate.** MG24 gates on a file boundary and
      // A02 Seam 4 describes a component one; this is the difference, printed so
      // the number is visible rather than buried in F94. It is a count and not a
      // verdict — most of it is legitimate — so what it is good for is movement.
      `  ${DIM}seam signal · ${seam.withinComponent.length}/${seam.members} published members ` +
      `never called outside their own component (F94, reported not gated)${RESET}`,
  );
  process.exit(0);
}

console.error(`${RED}✗ enforce · ${violations.length} violation(s)${RESET}\n`);
for (const v of violations) {
  console.error(`  ${RED}${v.rule}${RESET}  ${v.file}`);
  console.error(`        ${v.message}`);
  console.error(`        ${DIM}declared in ${v.spec}${RESET}\n`);
}
process.exit(1);
