#!/usr/bin/env node
// A03 — the enforcement suite. `make enforce`.
// Every failure names: the rule, the file, what it prevents, and the spec.
import { readdirSync, statSync } from "node:fs";
import { checkModuleGraph } from "./module-graph.mjs";
import { checkSourceScans } from "./source-scans.mjs";
import { checkDependencies } from "./dependencies.mjs";

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
const violations = [
  ...checkModuleGraph(files),
  ...checkSourceScans(files),
  ...checkDependencies(),
];

const RED = "\x1b[31m", DIM = "\x1b[2m", GREEN = "\x1b[32m", RESET = "\x1b[0m";

if (violations.length === 0) {
  console.log(`${GREEN}✓${RESET} enforce · ${files.length} files · no violations`);
  process.exit(0);
}

console.error(`${RED}✗ enforce · ${violations.length} violation(s)${RESET}\n`);
for (const v of violations) {
  console.error(`  ${RED}${v.rule}${RESET}  ${v.file}`);
  console.error(`        ${v.message}`);
  console.error(`        ${DIM}declared in ${v.spec}${RESET}\n`);
}
process.exit(1);
