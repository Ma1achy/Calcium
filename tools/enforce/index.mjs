#!/usr/bin/env node
// A03 — the enforcement suite. `make enforce`.
// Every failure names: the rule, the file, what it prevents, and the spec.
import { existsSync, readdirSync, statSync } from "node:fs";
import { checkFindings, checkTriageInventory } from "./findings.mjs";
import {
  checkFunctionConsumers,
  checkModuleGraph,
  checkOneStorePerComponent,
  checkSeamConsumers,
  componentSeamSignal,
  nameExactnessSignal,
  publicSurfaceUseSignal,
} from "./module-graph.mjs";
import { checkSourceScans, checkMarks, checkControlBytes } from "./source-scans.mjs";
import { checkDependencies, checkPhantomImports } from "./dependencies.mjs";
import {
  checkCommitments,
  checkOrdering,
  checkTestRowIds,
  checkReferences,
  checkSectionReferences,
  checkSeamFour,
  checkInvariantCoverage,
  referenceFiles,
  specFiles,
} from "./commitments.mjs";

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e === "node_modules" || e === "dist" || e === "out") continue;
    const p = `${dir}/${e}`;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e) && !/\.d\.ts$/.test(e)) out.push(p);
  }
  return out;
}

const files = walk("src");
// The consumers written from the public surface, for the by-use signal alone —
// nothing here gates on them, and `enforce` still governs `src/`. Skipped by the
// walk above and not by a separate one, because a second walk is where they
// would drift.
//
// **This sentence said *the two* and the change below made it three.** Caught by
// reading the diff rather than by any assertion: a mechanical rewrite's tests
// verify the transformation, never whether the prose above it is still true.
// **Discovered, not listed** — and this is the third site that named the two by
// hand. `Makefile`'s `check` and `test` were the other two, and both carry
// comments recording that they exist *because an example's declared script was
// invoked by nothing* (F150). A third example arriving and being invisible here
// is the same defect one turn later, so the population is the directory and the
// exception is named: anything under `examples/` with a `package.json` is a
// consumer, and a directory without one is not yet a package.
const examples = readdirSync("examples", { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(`examples/${e.name}/package.json`))
  .flatMap((e) => walk(`examples/${e.name}`))
  .sort();
const specs = specFiles();
const references = referenceFiles();
const { violations: refViolations, resolved } = checkReferences(references);
// SP8 — the same question for `§`, which nothing asked. **Reported and not
// gated on its first landing**, and the reason is SP3's own history: SP3 shipped
// with its two findings already fixed, and this one arrived with 120 across 58
// targets. A gate that fails on a hundred pre-existing citations is switched off
// rather than fixed, which is A03 §2's lesson about every rule in its list.
// Numbering C04's `gapBefore` heading — a section 26 pointers already named —
// closed the largest class on the first run; the counter is what keeps the rest
// visible rather than quietly true.
const sectionRefs = checkSectionReferences(
  references.filter((f) =>
    !f.startsWith("docs/notes/") && f !== "docs/COMMITMENT_INVARIANT_AUDIT.md"
    && f !== "CLAUDE.md" && f !== "docs/README.md"),
);
const sectionsDangling = sectionRefs.violations.filter((v) => !/nothing before it says/u.test(v.message));
const sectionsUnowned = sectionRefs.violations.length - sectionsDangling.length;
const sectionTargets = new Set(
  sectionsDangling.map((v) => /cites ([A-Z]\d\d §[\w.]+)/u.exec(v.message)?.[1] ?? v.file),
).size;
// SP9's own numbers, computed once and reported beside the gate — the list is
// the evidence and the count is what a reader watches move.
const coverage = checkInvariantCoverage(specs, walk("test"));

const violations = [
  ...checkModuleGraph(files),
  // MG23 — one store per component above L0. SS29 folded here: as a source
  // scan its only in-scope file would have been its own exception.
  ...checkOneStorePerComponent(files),
  ...checkSeamConsumers(files),
  ...checkFunctionConsumers(files),
  ...checkSourceScans(files),
  // SS52 — the control-character class over the tree the *tools* read, which is
  // wider than the one `SCANS` walks. `files` is `walk("src")`, so widening
  // SS43's scope string alone would have changed nothing; and putting `test/`
  // into `files` would place every other scan in scope of the tests, which is a
  // different decision (F236).
  ...checkControlBytes([...files, ...walk("test"), ...walk("tools")]),
  // SS47 — a mark the framework draws and cannot substitute. Its own function
  // rather than a row of `SCANS`, for MG27's reason: the subject is a string
  // literal's contents, its exemptions carry reasons, and it has the
  // bidirectional arm a path allow-list cannot express.
  ...checkMarks(files),
  ...checkDependencies(),
  ...checkPhantomImports(files),
  // The specs are enforced too. A03 governs the source; SP1 governs the
  // documents the source is written against, because a commitment nothing
  // enforces diverges from the implementation without anything going red.
  ...checkCommitments(specs),
  // SP2 — the numbers locate what they name. SP3 — and everything that cites
  // one of them resolves, which for eleven hundred references nothing did.
  ...checkOrdering(specs),
  ...checkTestRowIds(specs),
  // SP4 — Seam 4 and its owners agree, both directions. The only artefact
  // several components write to and none owns, wrong at every one that touched
  // it, because every row exists twice and nothing compared the copies.
  ...checkSeamFour(),
  // SP5 — the findings ledger is the most-cited document in the app and was the
  // only one with no citation check. Written after a wrong number resolved
  // against a real, unrelated finding with enforce green.
  ...checkFindings(),
  ...checkTriageInventory(),
  // SP9 — an invariant nothing names is a claim no row was written against, and
  // it reads exactly like one that is satisfied. SP1 paired a commitment to an
  // invariant and nothing paired an invariant to a check, so *every invariant is
  // cited* was a convention held by hand — 86 of 768 were not (F357, F361).
  ...coverage.violations,
  ...refViolations,
];

const RED = "\x1b[31m", DIM = "\x1b[2m", GREEN = "\x1b[32m", RESET = "\x1b[0m";

// Computed only for the summary line — it gates nothing, and computing it beside
// the violations would invite someone to push it into the list. F94.
const seam = componentSeamSignal(files);
// F105/F160 as one class. MG24 matches a member by name and not by owner, so a
// member whose name several types declare is one the rule cannot be exact about.
// Printed for F142's reason: a number in prose is a snapshot, and this one has to
// move when the tree does or it goes quiet the way the blind spot did.
const exactness = nameExactnessSignal(files);
// Roadmap 48 — the residue F160 said was the shape that could work, now that
// both consumers exist. The same name-matching in the direction where it cannot
// lie: a collision only ever clears, so this list under-reports and cannot
// over-report. A03 §9.
const surface = publicSurfaceUseSignal(files, examples);

if (violations.length === 0) {
  console.log(
    `${GREEN}✓${RESET} enforce · ${files.length} files · ${specs.length} specs · ` +
      `${resolved} invariant references resolved · no violations\n` +
      // **A reported signal, never a gate.** MG24 gates on a file boundary and
      // A02 Seam 4 describes a component one; this is the difference, printed so
      // the number is visible rather than buried in F94. It is a count and not a
      // verdict — most of it is legitimate — so what it is good for is movement.
      `  ${DIM}invariant coverage · ${String(coverage.uncited)} of ` +
      `${String(coverage.declared)} invariants named by no test row, all listed ` +
      `(SP9, gated by equality)${RESET}\n` +
      `  ${DIM}section citations · ${String(sectionsDangling.length)} of ` +
      `${String(sectionRefs.resolved + sectionsDangling.length)} resolve to no section, across ` +
      `${String(sectionTargets)} targets; ${String(sectionsUnowned)} more name no document ` +
      `(SP8, reported not gated)${RESET}\n` +
      `  ${DIM}seam signal · ${seam.withinComponent.length}/${seam.members} published members ` +
      `never called outside their own component (F94, reported not gated)${RESET}\n` +
      `  ${DIM}name exactness · MG24 is exact for ${exactness.exact}/${exactness.members} ` +
      `members; the rest share a name with another owner — ${exactness.shared.join(", ")} ` +
      `(F105/F160, reported not gated)${RESET}\n` +
      `  ${DIM}public surface by use · ${surface.candidates.length}/${surface.members} ` +
      `published members named by neither example — ${surface.concentrated.join(", ")}; ` +
      `${surface.ambiguous} of ${surface.cleared} clearings are ambiguous and none can list, ` +
      `${surface.testOnly} named only in an example's tests (roadmap 48, reported not gated)${RESET}` +
      // The residue itself, behind a flag. A summary line is what a gate can
      // afford and a read needs the names — and printing them unasked would put
      // ninety lines of *not a violation* above every clean run, which is how a
      // signal stops being read at all.
      (process.argv.includes("--surface")
        ? `\n\n  ${DIM}${surface.candidates.join("\n  ")}${RESET}`
        : ""),
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
