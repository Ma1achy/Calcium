// Records the braille alphabet's sub-cell steps — eighths of a cell (ruling 32's
// amendment of 2026-09-28; C09 I135, §7j; `R-PRG-002`).
//
//     node tools/design/register-braille-steps.mjs [--dir <dir>]
//
// **A one-shot, kept for `register-sel.mjs`'s reason**: the registry is the
// normative source and the edit has to be auditable after it has run.
//
// **Why a field on the record and not a new alphabet.** `R-PRG-002` already says
// *sub-cell progress uses braille*, and the braille record's own placement reads
// *sub-cell — eight positions per column*; what it did not carry was the eight.
// The person approved `⡀⡄⡆⡇⣇⣧⣷⣿` — the left dot column filling bottom to top,
// then the right — so the steps are the record's, and `BAR_STYLES.braille` in the
// tree is held equal to them by C09 T2.158.
//
// **It lands with the builder, the checker and the tree, never alone**: the
// builder draws the steps and the three-cell frames from them, the checker
// requires both, and T2.158 compares the tree's steps by equality.
//
// **Every write is asserted**: a run on a registry that already holds the steps
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

// U+2840, 2844, 2846, 2847, 28C7, 28E7, 28F7, 28FF — by code point, so the
// source cannot be misread as a look-alike.
const STEPS = [0x2840, 0x2844, 0x2846, 0x2847, 0x28c7, 0x28e7, 0x28f7, 0x28ff].map((c) => String.fromCodePoint(c));

if (serialise(registry) !== raw) fail("the registry does not round-trip at indent 2");
const at = registry.bars.findIndex((b) => b.id === "braille");
const bar = registry.bars[at];
if (bar === undefined) fail("no braille bar");
else if ("steps" in bar) {
  if (JSON.stringify(bar.steps) !== JSON.stringify(STEPS)) fail(`braille already carries steps ${JSON.stringify(bar.steps)}, not the approved eight`);
  else {
    console.log("already recorded · braille.steps is the approved eight, nothing written");
    process.exit(0);
  }
} else {
  // **The premises, re-measured rather than carried**: the record is current,
  // cites the placement rule, says sub-cell, and its full cell is the last step.
  if (bar.status !== "current") fail(`braille is ${String(bar.status)}, not current`);
  if (!bar.ruleIds.includes("R-PRG-002")) fail("braille does not cite R-PRG-002");
  if (!/sub-cell/u.test(bar.placement)) fail(`braille's placement does not say sub-cell: ${JSON.stringify(bar.placement)}`);
  if (bar.filled !== STEPS.at(-1)) fail(`braille's filled ${JSON.stringify(bar.filled)} is not the last step`);
  if (registry.bars.some((b) => "steps" in b)) fail("another bar already carries steps");
}
if (failed > 0) stop();

// After `empty`, so the alphabet's characters read together.
const next = {};
for (const [key, value] of Object.entries(bar)) {
  next[key] = value;
  if (key === "empty") next.steps = STEPS;
}
registry.bars[at] = next;
writeFileSync(registryPath, serialise(registry));

// Read back: the write is the claim, and this is what checks it.
const after = JSON.parse(readFileSync(registryPath, "utf8")).bars.find((b) => b.id === "braille");
if (JSON.stringify(after?.steps) !== JSON.stringify(STEPS) || JSON.stringify(Object.keys(after)) !== JSON.stringify(["id", "filled", "empty", "steps", "status", "ruleIds", "placement"])) {
  console.error("FAIL · braille.steps did not land as written");
  process.exit(1);
}
console.log(`recorded braille.steps = ${STEPS.join("")}`);
