#!/usr/bin/env node
// A03 — the enforcement suite. `make enforce`.
// Every failure names: the rule, the file, what it prevents, and the spec.
import { readdirSync, statSync } from "node:fs";
import { checkModuleGraph } from "./module-graph.mjs";
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
  ...refViolations,
];

const RED = "\x1b[31m", DIM = "\x1b[2m", GREEN = "\x1b[32m", RESET = "\x1b[0m";

if (violations.length === 0) {
  console.log(
    `${GREEN}✓${RESET} enforce · ${files.length} files · ${specs.length} specs · ` +
      `${resolved} invariant references resolved · no violations`,
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
