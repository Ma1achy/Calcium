// A03 SP1 — every commitment cites an invariant or names whose rule it is.
//
// This is the audit of 2026-07-29 turned into a rule so it cannot recur. That
// audit read 355 invariants against 358 commitments by hand and found 103
// mismatches: 57 commitments nothing enforced, 46 invariants nothing agreed to.
// The cause was not carelessness in any one spec — it was that the two lists
// were written as parallel prose with nothing checking they agreed, so a
// commitment could be added, or an invariant deleted, and no artefact noticed.
//
// A word-overlap heuristic over the corpus is far too noisy to be that artefact:
// commitments are the *readable* form, so they deliberately share few words with
// the invariant they summarise. What makes the check exact instead of fuzzy is
// that the audit produced **categories**, and the categories become markers a
// spec writes down. Three forms, from A02 §1:
//
//   3. …text… (I5)              backed by one invariant — the common case
//   7. …text… (I3, I4)          the readable form of several
//   6. …text… (→ C09 I5)        someone else's rule, cross-referenced
//
// A commitment with none of them fails. So does one citing a local invariant
// that does not exist, and one cross-referencing a spec or invariant that does
// not exist — the dangling citation is the failure mode a citation rule invites,
// and it would otherwise turn "cites an invariant" into "contains a bracket".
//
// **Cross-references to architecture documents are cited by section**, not by
// invariant, because A01–A04 declare no invariants: A03's SS and MG rules are
// the architecture's invariants in enforceable form. `(→ A01 A.1)`.

import { readFileSync, readdirSync } from "node:fs";

const COMPONENTS = "docs/components";

/** `- **I5** — …` and `- **I20a** — …`. */
const INVARIANT = /^-\s+\*\*(I\d+[a-z]?)\*\*/gm;

/** A numbered commitment line inside the Commitments section. */
const COMMITMENT = /^(\d+)\.\s+(.*)$/;

/**
 * `(I5)`, `(I3, I4)`, `(I13, D50)` — a local citation, possibly among others.
 *
 * The leading `(?!→)` is load-bearing: without it `(→ C04 I20)` reads as a local
 * citation of `I20` and the rule reports a dangling reference in the one spec
 * that got the cross-reference right. Found by running it, not by reading it.
 */
const LOCAL = /\((?!→)(?:[^()]*?[\s,])?(I\d+[a-z]?)(?:[\s,][^()]*?)?\)/g;

/** `(→ C09 I5)`, `(→ A01 A.1)`, `(→ C06 I3)`. */
const CROSS = /\(→\s*([AC]\d{2})\s+([^)]+)\)/g;

function specPath(id) {
  const files = readdirSync(COMPONENTS);
  const hit = files.find((f) => f.startsWith(`${id}_`));
  return hit === undefined ? null : `${COMPONENTS}/${hit}`;
}

/** Every invariant id a spec declares. */
export function invariantsOf(file, readFile = (f) => readFileSync(f, "utf8")) {
  const ids = new Set();
  const src = readFile(file);
  INVARIANT.lastIndex = 0;
  let m;
  while ((m = INVARIANT.exec(src))) ids.add(m[1]);
  return ids;
}

/**
 * The Commitments section's numbered lines.
 *
 * Bounded by the heading and the next `---`, so a numbered list anywhere else in
 * the document — §4's routes, a wiring checklist — is not mistaken for one. That
 * boundary is the whole reason this parses rather than greps.
 */
export function commitmentsOf(file, readFile = (f) => readFileSync(f, "utf8")) {
  const lines = readFile(file).split("\n");
  const out = [];
  let inside = false;

  for (const [i, line] of lines.entries()) {
    if (/^##\s+.*Commitments\s*$/.test(line)) { inside = true; continue; }
    if (!inside) continue;
    if (/^---\s*$/.test(line) || /^##\s/.test(line)) break;

    const m = COMMITMENT.exec(line);
    if (m !== null) out.push({ n: Number(m[1]), text: m[2], line: i + 1 });
  }

  return out;
}

function citations(text) {
  const local = [];
  const cross = [];
  LOCAL.lastIndex = 0;
  let m;
  while ((m = LOCAL.exec(text))) local.push(m[1]);
  CROSS.lastIndex = 0;
  while ((m = CROSS.exec(text))) cross.push({ spec: m[1], target: m[2].trim() });
  return { local, cross };
}

export function checkCommitments(files, readFile = (f) => readFileSync(f, "utf8")) {
  const violations = [];
  const invariantCache = new Map();

  const invariants = (file) => {
    if (!invariantCache.has(file)) invariantCache.set(file, invariantsOf(file, readFile));
    return invariantCache.get(file);
  };

  for (const file of files) {
    const own = invariants(file);
    const id = (file.split("/").pop() ?? "").slice(0, 3);

    for (const c of commitmentsOf(file, readFile)) {
      const { local, cross } = citations(c.text);

      if (local.length === 0 && cross.length === 0) {
        violations.push({
          rule: "SP1",
          file: `${file}:${String(c.line)}`,
          spec: "A02 §1 · A03 §5",
          message:
            `commitment ${String(c.n)} cites nothing. A commitment with no ` +
            `invariant is a promise nothing enforces — cite one as \`(I5)\`, ` +
            `several as \`(I3, I4)\`, or another spec's as \`(→ C09 I5)\`. ` +
            `If it is none of those, it is a § detail rather than a commitment.`,
        });
        continue;
      }

      for (const ref of local) {
        if (!own.has(ref)) {
          violations.push({
            rule: "SP1",
            file: `${file}:${String(c.line)}`,
            spec: "A02 §1 · A03 §5",
            message:
              `commitment ${String(c.n)} cites ${ref}, which ${id} does not ` +
              `declare. A dangling citation reads as backed and is not — which ` +
              `is what a citation rule invites if nothing resolves the target.`,
          });
        }
      }

      for (const ref of cross) {
        // Architecture documents declare no invariants (A03's rules are theirs),
        // so a cross-reference to one names a section and is not resolved here.
        if (ref.spec.startsWith("A")) continue;

        const target = specPath(ref.spec);
        if (target === null) {
          violations.push({
            rule: "SP1",
            file: `${file}:${String(c.line)}`,
            spec: "A02 §1 · A03 §5",
            message: `commitment ${String(c.n)} cross-references ${ref.spec}, which is not a spec.`,
          });
          continue;
        }

        const wanted = /^(I\d+[a-z]?)/.exec(ref.target);
        if (wanted !== null && !invariants(target).has(wanted[1])) {
          violations.push({
            rule: "SP1",
            file: `${file}:${String(c.line)}`,
            spec: "A02 §1 · A03 §5",
            message:
              `commitment ${String(c.n)} cross-references ${ref.spec} ${wanted[1]}, ` +
              `which ${ref.spec} does not declare. A cross-reference that does not ` +
              `resolve is the overclaim it was meant to replace, one indirection on.`,
          });
        }
      }
    }
  }

  return violations;
}

/** Every component spec. Named here so a new one is covered the day it lands. */
export function specFiles() {
  return readdirSync(COMPONENTS)
    .filter((f) => /^C\d{2}_.*\.md$/.test(f))
    .map((f) => `${COMPONENTS}/${f}`)
    .sort();
}
