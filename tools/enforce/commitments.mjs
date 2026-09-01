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

import { readFileSync, readdirSync, statSync } from "node:fs";

const COMPONENTS = "docs/components";
const ARCHITECTURE = "docs/architecture";
const SURFACES = "docs/surfaces";

/** `- **I5** — …` and `- **I20a** — …`. */
const INVARIANT = /^-\s+\*\*(I\d+[a-z]?)\*\*/gm;

/** A numbered commitment line inside the Commitments section. */
const COMMITMENT = /^(\d+)\.\s+(.*)$/;

/**
 * A parenthetical that is not a cross-reference. `(I5)`, `(I3, I4)`, `(I13, D50)`.
 *
 * The leading `(?!→)` is load-bearing: without it `(→ C04 I28)` reads as a local
 * citation of `I28` and the rule reports a dangling reference in the one spec
 * that got the cross-reference right. Found by running it, not by reading it.
 *
 * **Every invariant in the group is extracted, not just one.** The first version
 * captured a single id per parenthetical, so `(I5, I99)` resolved `I99` and
 * ignored `I5` — a summary commitment could carry a dangling citation beside a
 * good one and pass. That is the "contains a bracket" degradation this rule
 * exists to prevent, reappearing inside the rule itself, and the third pass over
 * the citation graph is what found it.
 */
/**
 * One paren group, and **every** group — including one opening with `→` (F437).
 *
 * This was `/\((?!→)([^()]*)\)/g`, which took every group that did not *open*
 * with an arrow and then read every `I\d+` inside it as **local**. A group can
 * hold the arrow in the middle — `(I66, §6g, → C10 I25)` — and eight commitments
 * do, so eight cross-references were resolved against the citing spec rather than
 * the cited one. **Wrong in both directions**: silent where the local spec
 * happened to declare the same number, which was 8 of 8, and a false failure the
 * first time one did not.
 */
const GROUP = /\(([^()]*)\)/g;

/**
 * The tokens inside a group, in order, with what re-targets them.
 *
 * `→ Cnn` sets the spec; a **bare** `Cnn` re-targets only once a spec is already
 * set, which is what makes `(→ C04 I73, C10 I31)` attach `I31` to C10 rather
 * than to C04. Before any arrow a bare `Cnn` is left alone.
 *
 * **Stated blind spot**: a commitment writing a cross-reference with no arrow at
 * all — `(C11 I17, I9)` — still reads as local, and deliberately. The intent of
 * the second token there is genuinely ambiguous between C11's and the citing
 * spec's, and a rule that guessed would be resolving a citation against the wrong
 * document in the other direction. The arrow is the mark that says *elsewhere*,
 * and this rule only follows the mark.
 */
const TOKEN = /→\s*([AC]\d{2})|\b([AC]\d{2})\b|\b(I\d+[a-z]?)\b/g;

// `CROSS` is gone: it required a group to **open** with the arrow, which is the
// half of F437 that made a mixed group invisible to the cross arm. Its job is
// done by `TOKEN`'s first alternative, which finds the arrow wherever it falls.

function specPath(id) {
  const files = readdirSync(COMPONENTS);
  const hit = files.find((f) => f.startsWith(`${id}_`));
  return hit === undefined ? null : `${COMPONENTS}/${hit}`;
}

/**
 * Every invariant id a spec declares, **in declaration order**.
 *
 * SP2 needs the order and SP1 needs only membership, so the ordered read is the
 * primary one and `invariantsOf` is it deduped. A second parser for the second
 * question is the drift `todo-expiry.d.mts` exists to prevent: two readers of
 * one corpus disagree eventually, and the one that disagrees quietly is the one
 * nothing is asserting against.
 */
export function invariantOrderOf(file, readFile = (f) => readFileSync(f, "utf8")) {
  const ids = [];
  const src = readFile(file);
  INVARIANT.lastIndex = 0;
  let m;
  while ((m = INVARIANT.exec(src))) ids.push(m[1]);
  return ids;
}

/** Every invariant id a spec declares. */
export function invariantsOf(file, readFile = (f) => readFileSync(f, "utf8")) {
  return new Set(invariantOrderOf(file, readFile));
}

/**
 * The Commitments section's numbered lines.
 *
 * Bounded by the heading and the next `---`, so a numbered list anywhere else in
 * the document — §4's routes, a wiring checklist — is not mistaken for one. That
 * boundary is the whole reason this parses rather than greps.
 */
export function commitmentsOf(file, readFile = (f) => readFileSync(f, "utf8")) {
  const out = [];

  for (const { line, n } of sectionLines(file, /^##\s+.*Commitments\s*$/, readFile)) {
    const m = COMMITMENT.exec(line);
    if (m !== null) out.push({ n: Number(m[1]), text: m[2], line: n });
  }

  return out;
}

/**
 * The lines inside one section — from its heading to the next `---` or heading
 * at the same level or above.
 *
 * **One implementation, because the boundary is the whole difficulty.** A
 * numbered list appears in §4's routes and in a wiring checklist as well as under
 * Commitments; a markdown table appears in a dozen sections. Anything that greps
 * for the row shape rather than bounding the section first finds all of them, and
 * a second copy of the bounding logic is the duplication SP4 itself exists to
 * catch. `commitmentsOf` and `tableColumn` both read through here.
 *
 * `depth` is how many `#` the heading has, so a `###` section ends at the next
 * `###` or `##` and not at a `####` inside it.
 */
export function sectionLines(file, headingRe, readFile = (f) => readFileSync(f, "utf8")) {
  const lines = readFile(file).split("\n");
  const out = [];
  let depth = 0;

  for (const [i, line] of lines.entries()) {
    if (depth === 0) {
      if (!headingRe.test(line)) continue;
      depth = (/^(#+)/.exec(line)?.[1] ?? "##").length;
      continue;
    }
    if (/^---\s*$/.test(line)) break;
    const here = /^(#+)\s/.exec(line);
    if (here !== null && here[1].length <= depth) break;
    out.push({ line, n: i + 1 });
  }

  return out;
}

/**
 * One column of the first markdown table in a section, header and rule dropped.
 *
 * Normalised for comparison: emphasis, backticks and links stripped, whitespace
 * collapsed, lowercased. Two tables that name the same row `Submit` and `Command
 * submit` are drift a checker cannot see through, but `` `cd` / `export` `` and
 * `cd / export` are the same row written by two hands, and failing on that would
 * make the rule about markdown rather than about the architecture.
 */
export function tableColumn(file, headingRe, index = 0, readFile = (f) => readFileSync(f, "utf8")) {
  const out = [];

  for (const { line } of sectionLines(file, headingRe, readFile)) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1);
    if (cells.length <= index) continue;
    const cell = cells[index] ?? "";
    if (/^\s*:?-{2,}:?\s*$/.test(cell)) continue; // the header rule

    const key = cell
      .replace(/`|\*\*|\*|_/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
    if (key !== "") out.push(key);
  }

  // The first row of a markdown table is its header.
  return out.slice(1);
}

function citations(text) {
  const local = [];
  const cross = [];
  GROUP.lastIndex = 0;
  let m;
  while ((m = GROUP.exec(text))) {
    // **One walk per group rather than two passes over the text** (F437). The
    // old shape harvested locals with one regex and cross-references with a
    // second, so a token's *owner* was decided by which pattern reached it
    // first — and neither pattern could see where the arrow fell.
    let spec = null;
    /** Specs an arrow named in this group, and whether an invariant attached. */
    const arrows = new Map();
    TOKEN.lastIndex = 0;
    let t;
    while ((t = TOKEN.exec(m[1]))) {
      if (t[1] !== undefined) { spec = t[1]; if (!arrows.has(spec)) arrows.set(spec, false); continue; }
      if (t[2] !== undefined) { if (spec !== null) { spec = t[2]; if (!arrows.has(spec)) arrows.set(spec, false); } continue; }
      if (spec === null) { local.push(t[3]); continue; }
      arrows.set(spec, true);
      cross.push({ spec, target: t[3] });
    }
    // **An arrow naming a section rather than an invariant is still a citation**
    // — `(→ A02 §1)` is how eight commitments name whose rule they are, and the
    // old two-pass parser counted them because `CROSS` captured everything after
    // the spec id without asking what it was. The walk has to say so explicitly,
    // and this is the line that says it: a spec with no invariant attached
    // contributes a reference with nothing to resolve. Dropping it turned eight
    // correctly-written commitments into *cites nothing*, which is the shape of
    // repair that trades one silent defect for eight loud ones.
    for (const [named, attached] of arrows) {
      if (!attached) cross.push({ spec: named, target: null });
    }
  }
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

        // **One token, because `citations` now attaches each one to its own
        // spec** (F437). This read `/^(I\d+[a-z]?)/` off the start of a target
        // that was *everything after the spec id*, so `(→ C04 I67, I68)`
        // resolved I67 and dropped I68 — ten groups, twenty tokens, half of them
        // never checked. Both halves of that are the same defect: a parser that
        // decides an owner by position rather than by the mark.
        if (ref.target !== null && !invariants(target).has(ref.target)) {
          violations.push({
            rule: "SP1",
            file: `${file}:${String(c.line)}`,
            spec: "A02 §1 · A03 §5",
            message:
              `commitment ${String(c.n)} cross-references ${ref.spec} ${ref.target}, ` +
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

// --- SP2 — invariants are numbered 1..n, in order --------------------------
//
// **A check that existed as a habit rather than a mechanism.** Ordering was
// verified by ad-hoc scripts while the specs were written, caught every time,
// and never became a rule. When the habit stopped the drift resumed: twenty of
// twenty-five specs, and C04 declaring
// `…17, 22, 23, 24, 25, 26, 27, 28, 19, 29, 18, 20, 20a, 33, 32, 31, 30, 21`.
//
// Nothing was missing and nothing dangled, so SP1 was clean throughout — the
// list had simply stopped locating anything. "I17 is the cap" tells a reader
// where to look only if the numbers ascend.
//
// Every instance came from appending an invariant to the end of a *related
// group* rather than the end of the list, which is the right editorial
// instinct. So the fix is to renumber in document order and keep the grouping,
// and this rule is what makes that survive the next edit.

/** `I20a`'s base is `I20`; a plain id has no letter. */
function partsOf(id) {
  const m = /^I(\d+)([a-z]?)$/.exec(id);
  return { base: Number(m[1]), letter: m[2] };
}

/**
 * The ids a spec *should* declare, given the order it declares them in.
 *
 * Document order is authoritative and the numbers move to match. A lettered id
 * inherits the number of the invariant before it — `I20a` means "a variant of
 * I20", so it takes its base's new number rather than the next free one. A
 * positional renumber that ignores this assigns `I25 → I20a` and invents a
 * variant relationship that does not exist; it is the first thing the renumber
 * script got wrong.
 */
export function expectedOrder(ids) {
  const out = [];
  let n = 0;
  for (const id of ids) {
    const { letter } = partsOf(id);
    if (letter === "") n += 1;
    out.push(`I${String(n)}${letter}`);
  }
  return out;
}

/**
 * Which failure this is, so the message says something a reader can act on.
 *
 * Four arms, in priority order, because one mismatch can satisfy several: a
 * duplicated id, a gap, an orphan lettered id and a plain transposition all
 * present as "declared ≠ expected", and the useful sentence is different in
 * each case.
 */
function diagnose(ids, expected) {
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) {
      return (
        `declares ${id} twice. Two invariants under one name means a citation ` +
        `resolves to whichever a reader finds first, and every check here that ` +
        `compares sets sees one member — the failure A03 §2 records for rule ids.`
      );
    }
    seen.add(id);
  }

  for (const [i, id] of ids.entries()) {
    const { base, letter } = partsOf(id);
    if (letter === "") continue;
    const before = i === 0 ? null : ids[i - 1];
    if (before === null || partsOf(before).base !== base) {
      return (
        `declares ${id} where the invariant before it is ${before ?? "nothing"}. ` +
        `A letter means "a variant of I${String(base)}", so it must follow its base ` +
        `immediately — the adjacency is the whole of what the letter communicates.`
      );
    }
  }

  const bases = [...new Set(ids.map((id) => partsOf(id).base))].sort((a, b) => a - b);
  const missing = [];
  for (let n = 1; n <= bases[bases.length - 1]; n += 1) {
    if (!bases.includes(n)) missing.push(`I${String(n)}`);
  }
  if (missing.length > 0) {
    return (
      `has a gap: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not ` +
      `declared. A citation of a missing number is indistinguishable from a typo, ` +
      `and both read as backed.`
    );
  }

  const at = ids.findIndex((id, i) => id !== expected[i]);
  return (
    `declares ${String(ids.length)} invariants out of order: position ` +
    `${String(at + 1)} holds ${ids[at]} where ${expected[at]} belongs. ` +
    `Renumber in document order — the grouping is the right editorial instinct ` +
    `and it is the numbers that move.`
  );
}

/**
 * SP2, one violation per spec.
 *
 * Per-spec rather than per-id: a transposition displaces every invariant after
 * it, so C04 would report sixteen findings about one edit. The message carries
 * the first divergence, which is where a reader starts either way.
 */
export function checkOrdering(files, readFile = (f) => readFileSync(f, "utf8")) {
  const violations = [];

  for (const file of files) {
    const ids = invariantOrderOf(file, readFile);
    // A spec declaring nothing produces no findings and looks compliant — this
    // rule's own vacuity class, and the same one SP1 carries. It is closed in
    // the fire-test, which asserts the corpus size before asserting it is clean.
    if (ids.length === 0) continue;

    const expected = expectedOrder(ids);
    if (ids.every((id, i) => id === expected[i])) continue;

    violations.push({
      rule: "SP2",
      file,
      spec: "A02 §1 · A03 §7a",
      message: `${(file.split("/").pop() ?? "").slice(0, 3)} ${diagnose(ids, expected)}`,
    });
  }

  return violations;
}

// --- SP7 — a test row's number is unique within its spec --------------------
//
// **SP2's argument, applied to the numbers tests actually cite.** SP2 makes
// invariant ids unique and ordered because "I17 is the cap" locates something
// only if the numbers do. A test row is cited the same way and by more readers:
// every test name in this repository opens with one, and a fail-on-revert row
// names the row it breaks.
//
// The rule was missing and the drift was already there — **24 duplicated numbers
// across 12 specs when this first ran**, including five created in a single
// session by appending a group of rows to a tier whose numbering had moved on.
// C01 declares `T3.18c` twice about two different states; C04 declares `T1.16`
// twice, once about row ids and once about `plot`'s height. Both read as backed.
//
// A citation into a duplicated number resolves to whichever a reader finds
// first, which is A03 §2's failure arriving at the citation rather than at the
// rule: nothing is missing and nothing dangles, so SP1 and SP3 stay green and
// the number has simply stopped locating anything.
//
// **`x` is exempt and deliberately so.** A spec under construction writes
// `T3.x` for a row whose number is not yet decided — C26 §8b carries seven —
// and that is a placeholder rather than a claim about a row.

/**
 * `- **T4.13** (…)` as a list item: the tier, the number, the letter.
 *
 * **Leading whitespace is allowed and the anchor stays**, and the mutation pass
 * is what separated those two. Anchoring at column zero reads as strict and is
 * the *under*-matching direction: a tier written as a nested list is skipped
 * silently and the rule goes quiet on it, which is the failure mode this whole
 * family exists to prevent. Dropping the anchor entirely is the other one — a
 * fail-on-revert row naming `- **T4.23**` mid-sentence would read as a second
 * declaration of it.
 *
 * Neither form is in the corpus today: 0 indented rows and 0 mid-line ones,
 * measured 2026-08-13. So this keeps its shape on asymmetry rather than on odds
 * — a rule that stops seeing a section costs a silent gap, and the check costs
 * a character class.
 */
const TEST_ROW = /^[ \t]*- \*\*(T\d+\.(?:\d+[a-z]?|x))\*\*/gm;

/** Every test row id a spec declares, in document order, `x` rows excluded. */
export function testRowsOf(file, readFile = (f) => readFileSync(f, "utf8")) {
  const ids = [];
  const src = readFile(file);
  TEST_ROW.lastIndex = 0;
  let m;
  while ((m = TEST_ROW.exec(src))) {
    if (!m[1].endsWith(".x")) ids.push(m[1]);
  }
  return ids;
}

/**
 * SP7, one violation per spec.
 *
 * Per-spec for SP2's reason: a tier that has drifted usually carries a run of
 * collisions from one edit, and sixteen findings about one append is noise. The
 * message names every duplicate, because unlike a transposition they are not
 * consequences of each other and a reader fixes each one separately.
 */
export function checkTestRowIds(files, readFile = (f) => readFileSync(f, "utf8")) {
  const violations = [];

  for (const file of files) {
    const ids = testRowsOf(file, readFile);
    // The vacuity arm SP2 carries, for the same reason: a spec with no test
    // rows is not evidence of anything, and the fire-test asserts the corpus
    // size before asserting it is clean.
    if (ids.length === 0) continue;

    const seen = new Set();
    const duplicated = [];
    for (const id of ids) {
      if (seen.has(id) && !duplicated.includes(id)) duplicated.push(id);
      seen.add(id);
    }
    if (duplicated.length === 0) continue;

    violations.push({
      rule: "SP7",
      file,
      spec: "A03 §2 · A03 §7a",
      message:
        `${(file.split("/").pop() ?? "").slice(0, 3)} declares ` +
        `${duplicated.join(", ")} twice. A test name citing one of these resolves ` +
        `to whichever row a reader finds first, and every fail-on-revert row that ` +
        `names it names both — the number has stopped locating anything while ` +
        `nothing is missing and nothing dangles.`,
    });
  }

  return violations;
}

// --- SP4 — Seam 4 and its owners agree, both directions --------------------
//
// **The only artefact several components write to and none owns.** A02 Seam 4
// lists every cross-layer sequence and names an owner; each owner's spec lists
// the same sequences in its own section. Two copies, and until this rule nothing
// compared them.
//
// It had been wrong or incomplete at every component that touched it, in a
// different way each time: six rows missing by C20, `resetFocus` recorded as a
// subscription at C16, no owner column until C22, and at C23 a stale submit
// order, `Scroll` with two owners, and three C23-owned rows absent while C23 I13
// claims the table holds all of them. Six errors of six different kinds is not a
// run of bad luck — it is the signature of a duplicated source of truth with no
// reconciliation, the class SS30, SS35, C05 T1.7c and C22's `STEPS` each close in
// their own corner.
//
// **Equality, both directions, and that is the whole design.** Containment in
// either direction misses one of the two failures actually observed: C15–C20's
// rows were missing *from the table*, and C23's were missing *from the spec*.
// Writing the rule found four more of the second kind — `Pop a pushed view`,
// `Stall detected`, `View refresh tick` and `cd` / `export` — which is TD0's
// lesson arriving again, and ACKNOWLEDGED_BACKLOG's: a set compared by
// containment only ever grows.
//
// The alternative was deriving Seam 4 from the component specs. Rejected: the
// table sits inside an argument, and generated content in argued prose goes stale
// in the other direction, where nothing is looking.

/** Where each owner lists the sequences it owns. Both keyed by Seam 4's Effect. */
export const SEAM_OWNERS = Object.freeze({
  C22: Object.freeze({
    file: "docs/components/C22_composition_root.md",
    heading: /^###\s+3c\./,
  }),
  C23: Object.freeze({
    file: "docs/components/C23_execution_pipeline.md",
    heading: /^##\s+4\.\s+Orchestration/,
  }),
});

export const SEAM_FILE = "docs/architecture/A02_calcium_architecture.md";
const SEAM_HEADING = /^###\s+Seam 4/;

/** Seam 4's rows as `{ effect, owner }`, normalised for comparison. */
export function seamRows(readFile = (f) => readFileSync(f, "utf8")) {
  const effects = tableColumn(SEAM_FILE, SEAM_HEADING, 0, readFile);
  const owners = tableColumn(SEAM_FILE, SEAM_HEADING, 2, readFile);
  return effects.map((effect, i) => ({ effect, owner: (owners[i] ?? "").toUpperCase() }));
}

export function checkSeamFour(
  owners = SEAM_OWNERS,
  readFile = (f) => readFileSync(f, "utf8"),
  seam = undefined,
) {
  const violations = [];
  const rows = seam ?? seamRows(readFile);

  // The rule's own vacuity, closed the way SP2 closes its own: a heading that
  // stopped matching would read as "no rows, nothing to disagree with" and pass
  // for exactly the reason it cannot see the table. SS26's failure, and the one
  // this family keeps rediscovering.
  if (rows.length === 0) {
    return [{
      rule: "SP4",
      file: SEAM_FILE,
      spec: "A02 Seam 4 · A03 §7a",
      message:
        "Seam 4's table could not be read — no rows found under the heading. " +
        "An unreadable table reports compliance for the reason it cannot be checked",
    }];
  }

  for (const [id, { file, heading }] of Object.entries(owners)) {
    const declared = new Set(tableColumn(file, heading, 0, readFile));
    const owned = rows.filter((r) => r.owner === id).map((r) => r.effect);

    if (owned.length > 0 && declared.size === 0) {
      violations.push({
        rule: "SP4",
        file,
        spec: "A02 Seam 4 · A03 §7a",
        message:
          `${id} owns ${owned.length} Seam 4 row(s) and declares no orchestration table — ` +
          `half a table cannot be checked against half a convention`,
      });
      continue;
    }

    for (const effect of owned) {
      if (!declared.has(effect)) {
        violations.push({
          rule: "SP4",
          file,
          spec: "A02 Seam 4 · A03 §7a",
          message:
            `Seam 4 gives "${effect}" to ${id}, which does not name it — ` +
            `a row owned by a spec that never mentions it is owned by nobody`,
        });
      }
    }

    const ownedSet = new Set(owned);
    for (const effect of declared) {
      if (!ownedSet.has(effect)) {
        violations.push({
          rule: "SP4",
          file: SEAM_FILE,
          spec: "A02 Seam 4 · A03 §7a",
          message:
            `${id} orchestrates "${effect}" and Seam 4 does not list it — ` +
            `the direction a subset check does not look, and where four rows were found`,
        });
      }
    }
  }

  return violations;
}

// --- SP3 — every invariant reference resolves ------------------------------
//
// **SP1 governs the specs and nothing governed anything else.** SP1 resolves
// citations inside `docs/components/`; the 367 qualified and 1133 bare
// references in `src/`, `test/`, `tools/`, the architecture documents and the
// surfaces were resolved by nobody. A test named `T3.7 (I5)` could cite an
// invariant that does not exist and the suite stayed green — which is the same
// "reads as backed and is not" failure SP1 was built for, on the larger surface
// by an order of magnitude.
//
// It found two defects on the commit it landed, both predating any renumber:
// `src/presentation/patch/lines.ts` citing a bare `I22` that is C10's, and
// `test/integration/capabilities.test.ts` citing bare `I10` and `I13` that are
// C01's in a file about C02.
//
// **The boundary, stated rather than left to be assumed.** SP3 proves every
// reference resolves against its owner. It cannot prove the owner is the
// intended one: a bare id in a misattributed file resolves silently when the
// number happens to exist in both specs — `capabilities.test.ts` was caught only
// because C02 declares no I10. Qualified references (`C10 I21`) are immune and
// are preferred where a file's owner is not obvious from its path. What is *not*
// the answer is qualifying eleven hundred references: that is a diff of pure
// noise, and `T3.7 (I5)` inside `test/unit/capabilities.test.ts` is unambiguous
// to a reader. Stating the limit is what stops the rule being read as stronger
// than it is, which is the failure mode of every entry in A03 §2's list.

/**
 * Which spec a file's bare references belong to.
 *
 * Longest prefix wins, so `src/terminal/lifecycle.ts` beats `src/terminal/`.
 * **An allow-list over directories with its exceptions named**, rather than a
 * narrow pattern: a new file under `src/data/viewmodel/` is covered the day it
 * lands, which a per-file list would not be.
 *
 * A file with references and no owner **fails**. It does not pass. That is
 * SS26's failure mode — the check cannot find what it was asked about, and
 * passing is indistinguishable from being satisfied.
 */
export const OWNERS = [
  { path: "src/terminal/lifecycle", spec: "C01" },
  { path: "src/terminal/escapes", spec: "C01" },
  { path: "src/terminal/capabilities", spec: "C02" },
  { path: "src/terminal/frame-scheduler", spec: "C03" },
  { path: "src/data/viewmodel", spec: "C04" },
  { path: "src/data/manifest", spec: "C05" },
  { path: "src/data/transport", spec: "C06" },
  { path: "src/data/adapters", spec: "C07" },
  { path: "src/data/fixtures", spec: "C08" },
  { path: "src/data/process", spec: "C21" },
  { path: "src/data/text", spec: "C09" },
  { path: "src/presentation/blocks", spec: "C09" },
  { path: "src/presentation/text", spec: "C09" },
  { path: "src/presentation/theme", spec: "C10" },
  { path: "src/presentation/table", spec: "C11" },
  { path: "src/presentation/plot", spec: "C12" },
  { path: "src/presentation/patch", spec: "C25" },
  { path: "src/viewport/transcript", spec: "C13" },
  { path: "src/viewport/viewport", spec: "C14" },
  { path: "src/viewport/overlay", spec: "C15" },
  { path: "src/interaction/router", spec: "C16" },
  { path: "src/interaction/editor", spec: "C17" },
  { path: "src/interaction/parser", spec: "C18" },
  { path: "src/interaction/completion", spec: "C19" },
  { path: "src/interaction/history", spec: "C20" },
  // L4 is the one directory holding two components, so it is the one place the
  // directory rule needs an exception rather than a second directory: C22 is
  // the composition root and everything under `src/shell/` is its, except the
  // execution pipeline. Longest prefix wins, so the second row governs
  // `execution.ts` and the first governs every file added beside it — which is
  // the direction that matters, since C22 is the one still growing files.
  { path: "src/shell", spec: "C22" },
  { path: "src/shell/execution", spec: "C23" },
  // A mutation run is about one component and says so in its filename. Prefix
  // rows rather than a `tools/mutate` row, because a run's bare `I1` means its
  // own component's I1 and there is no single owner for the directory.
  { path: "tools/mutate/runs/c01", spec: "C01" },
  { path: "tools/mutate/runs/c22", spec: "C22" },
  { path: "src/testing", spec: "C09" },
  // C24's builders sit under `src/shell/` because `b` is L4's surface and
  // reuses `blockId` from `documents.ts` — so the C22 row above would claim
  // them by prefix. Longest prefix wins, which is what makes this one line
  // rather than a directory move.
  { path: "src/shell/builders", spec: "C24" },
];

/**
 * Test and support files, by the topic in their name.
 *
 * The six tiers put one component's tests in one file per tier, so the basename
 * is the owner — `test/edge/transport.test.ts` is C06's whatever tier it is in.
 * Written as a map rather than derived from `COMPONENT_SOURCES` because the
 * names are the tests' vocabulary, not the source tree's: `view-model`, `sgr`,
 * `sequence`.
 */
export const TOPICS = {
  "adapter-registry": "C07",
  editor: "C17",
  parser: "C18",
  completion: "C19",
  history: "C20",
  adapters: "C07",
  blocks: "C09",
  builders: "C24",
  "startup-validation": "C24",
  "public-api": "C24",
  "expect-document": "C24",
  refresh: "C23",
  "patch-window": "C25",
  capabilities: "C02",
  corpus: "C08",
  "fake-scheduler": "C03",
  "fake-terminal": "C01",
  "fallback-docker": "C07",
  fixture: "C01",
  fixtures: "C08",
  "frame-scheduler": "C03",
  "block-window": "C09",
  "render-cache": "C22",
  screen: "C22",
  lifecycle: "C01",
  manifest: "C05",
  "measurement-conformance": "C09",
  patch: "C25",
  "router-decode": "C16",
  execution: "C23",
  "router-focus": "C16",
  "router-keymap": "C16",
  "router-dispatch": "C16",
  router: "C16",
  text: "C09",
  plot: "C12",
  process: "C21",
  sequence: "C06",
  session: "C22",
  "session-config": "C22",
  "session-construct": "C22",
  "session-fallback": "C22",
  "session-paint": "C22",
  "session-frame": "C22",
  "session-identity": "C22",
  "session-state": "C22",
  "session-chrome": "C22",
  sgr: "C01",
  "support-harness": "C09",
  table: "C11",
  "text-width": "C09",
  theme: "C10",
  transcript: "C13",
  viewport: "C14",
  overlay: "C15",
  transport: "C06",
  "view-model": "C04",
  world: "C08",
};

/**
 * Files whose invariant ids are not references, each with why.
 *
 * **Asserted still to contain one**, so a stale entry fails — `checkSourceMap`'s
 * both-directions shape. An exception list that only grows is the silent-forever
 * gap the rule exists to close.
 *
 * It is two entries rather than the eight the plan expected, because six of them
 * were a general rule in disguise: in a markdown document every id inside a code
 * span or a fenced block is a *form* being illustrated — `(I3, I4)`,
 * `T3.7 (I5): …`, `- **I1** — text` — and not one occurrence in the corpus is a
 * real reference. Stripping code is the rule; A02, A03, `docs/README.md` and
 * `CLAUDE.md` then need no excuse at all. **The blind spot that buys:** a real
 * reference written inside backticks in a markdown file is skipped silently.
 * Nothing in the corpus does that, and this comment is what someone finds when
 * something eventually does.
 */
export const REFERENCE_EXCEPTIONS = {
  "test/unit/enforce-commitments.test.ts":
    "fabricated specs — `I99` and a synthetic `I20a` that resolve against nothing by design",
  "tools/enforce/commitments.mjs":
    "this file: SP1's and SP2's worked examples, including the `(I5, I99)` hole they document",
  // **Three dated working documents, named one by one rather than by directory.**
  // Each cites a bare invariant in prose whose owner is plain from the paragraph
  // and not to a resolver — `I11 forbids state that survives a render`, `I1,
  // three lines`, `I8's the ones that fit plus a count of the rest`. This is the
  // reason `docs/archive/` is excluded two comments down, applied to a file
  // rather than a tree: **rewriting a dated document to cite ids the way the
  // tool wants falsifies the record it exists to be.**
  //
  // Named individually because the rest of `docs/notes/` resolves today and a
  // directory-wide exemption would stop checking it — an exemption is counted,
  // not widened until it stops costing anything.
  // **`CALCIUM_3D_DESIGN.md` was here and is struck**, by the bidirectional arm
  // rather than by anyone remembering. Its reason named a condition — *the
  // design's premise is open pending a measurement* — the measurement was taken
  // (F431), the note was rewritten against it, and every reference in it now
  // resolves. **A reason that names a condition is one a gate can retire**,
  // which is the shape the deferral problem in CLAUDE.md wants and rarely gets:
  // there, the condition is prose and nothing watches it; here it happened to be
  // *the file being wrong*, which the rule already checks every run.
  "docs/notes/CALCIUM_BLOCK_STATES.md":
    "dated design note; a bare `I1` in a sentence about geometry against content",
  "docs/notes/CALCIUM_ML_BLOCKS.md":
    "dated design note; a bare `I8` naming a ruling that already existed when it was written",
};

/**
 * Where SP3 reads. `docs/components/` is SP1's and SP2's; `docs/archive/` is
 * excluded because it is superseded by construction — `docs/README.md` says the
 * specs win where they disagree, so a stale pointer there is consistent with
 * everything else in that directory, and rewriting a dated working document to
 * cite ids that did not exist when it was written is worse than a pointer nobody
 * should follow.
 */
// --- SP8 — every section reference resolves --------------------------------
//
// **SP3 does this for invariants and nothing did it for sections.** `C12 §3q`
// was cited by three source comments against a section that had never been
// written: the ruling behind it was real and had been a defect three times, and
// its only record was a number three files pointed at. `make enforce` resolved
// `C12 I34` and had no opinion about `C12 §3q`, so a citation read as a source
// and going to find it turned up nothing.
//
// **That is the sixth blind spot arriving on an *address* rather than a claim.**
// CLAUDE.md's instrument asks where a settled claim is written down; this is the
// mechanical half, for the one kind of pointer a machine can follow.
//
// The boundary is SP3's, and for the same reason: this proves a reference
// resolves against its owner, not that the owner is the intended one. A bare
// `§4` in a file about C09 resolves against C09's §4 whether or not C09 §4 is
// what the sentence meant.
//
// **Two failure modes it is built around, both measured on the first run.**
//
// - A heading is not always `## 3a.`: the corpus writes `## 3. Title`,
//   `### 6b — Title` and `### 6a.1 — Title`, and a regex for one of the three
//   declares a document with almost no sections and reports its own corpus as
//   dangling. `### 4-bit:` is why the delimiter must be a dot or whitespace and
//   never a hyphen — otherwise a heading about colour depth declares a §4.
// - A stray digit — `262` written where a section id belongs — is reported,
//   which is right: the text reads as a slip inside `A03 §2`, and a rule that
//   quietly took the longest prefix that resolves would have hidden it.
//   *Written without the section mark here on purpose: this file is scanned
//   like any other, and prose quoting a broken citation is a broken citation.*

/** A section id a document declares — `3`, `3a`, `6a.1`. */
// **`[a-z]*` and not `[a-z]?`, and the difference was 612 citations** (F281).
// One optional letter reads `3ak.12` as `3a` — a real section, so the reference
// resolved, against a document that says something else. The heading `### 3ak.12`
// matched nothing at all, so the whole `3a…`-suffixed family was absent from the
// index while every citation to it was counted as resolved.
const SECTION_HEADING = /^#{2,4}\s+(\d+[a-z]*(?:\.\d+)?)\.?\s/u;

/** `§3a`, `§3ak.12`, `§6a.1` — and `§ 3a`, which the corpus writes in prose. */
const SECTION_TOKEN = /§\s?(\d+[a-z]*(?:\.\d+)?)/gu;

/** Every section id a spec or architecture document declares. */
export function sectionsOf(file, readFile = (f) => readFileSync(f, "utf8")) {
  const out = new Set();
  let src;
  try { src = readFile(file); } catch { return out; }
  let fenced = false;
  for (const line of src.split("\n")) {
    if (FENCE.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const m = SECTION_HEADING.exec(line);
    if (m !== null) out.add(m[1]);
  }
  return out;
}

/** The document a spec id names — a component or an architecture note. */
function docPath(id) {
  const dir = id.startsWith("A") ? ARCHITECTURE : id.startsWith("S") ? SURFACES : COMPONENTS;
  let files;
  try { files = readdirSync(dir); } catch { return null; }
  const hit = files.find((f) => f.startsWith(`${id}_`));
  return hit === undefined ? null : `${dir}/${hit}`;
}

/**
 * Section references, with the same owner and adjacency rules SP3 uses.
 *
 * **Adjacency is qualification** — `C12 §3r` binds to C12 whatever the file's
 * owner is — and a file's owner answers a bare `§3r`. A file with a `§` and no
 * owner is reported rather than skipped, which is SS26: a check that cannot
 * find what it was asked about passes exactly like one that is satisfied.
 */
export function scanSections(file, src, options = {}) {
  const owner = options.owner ?? sectionOwnerOf(file);
  const code = options.code ?? !file.endsWith(".md");
  const out = [];
  let fenced = false;

  for (const [i, raw] of src.split("\n").entries()) {
    if (!code && FENCE.test(raw)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const text = code ? raw : mask(raw);
    if (SECTION_HEADING.test(text)) continue;

    SECTION_TOKEN.lastIndex = 0;
    let m;
    while ((m = SECTION_TOKEN.exec(text))) {
      // The nearest spec id to the left on this line qualifies, which is how
      // the corpus writes it: `C12 §3r`, `A03 §7a`, `see A02 §1 and §4`.
      const before = text.slice(0, m.index);
      const q = /\b([CAS]\d{2})\b(?!.*\b[CAS]\d{2}\b)/u.exec(before);
      out.push({ line: i + 1, id: m[1], spec: q?.[1] ?? owner, qualified: q !== null });
    }
  }
  return out;
}

/**
 * SP8 — every `§` reference resolves against the document that owns it.
 *
 * **The counter is the point**, as it is for SP5: a rule reporting zero over a
 * corpus it cannot read looks exactly like one reporting zero over a clean one,
 * and this rule's whole subject is a pointer that resolves to nothing.
 */
/**
 * The invariants no test row names today — **debt, listed so it can only shrink**
 * (F361, SP9).
 *
 * **Compared by equality and not as a subset**, which is `anchors.mjs`' rule and
 * this repository's own finding: a subset check lets a cleared entry outlive its
 * reason unread. So citing one of these is a build failure until it is struck
 * from here, and an invariant added tomorrow with no row fails immediately.
 *
 * **C12's three are absent on purpose.** I32, I35 and I69 were the ones F357's
 * unsound matcher reported as covered, and they are cited from the rows that
 * cover them rather than listed — a rule's first run should clear something.
 *
 * **`C24 I30` was listed for exactly one commit and struck**, which is the only
 * shape this list may grow in. It was ruled in a spec commit carrying no code —
 * the rule this repository holds for specs — so no row could name it, and listing
 * it said the true thing about that tree. **The equality compare is what made the
 * strike mandatory rather than optional**; a subset check would have let the entry
 * outlive its reason unread, which is this list's own finding.
 *
 * **`C09 I37` and `C09 I38` were the second instance and are struck here**, one
 * commit after the spec that ruled them — the half-block rung and the decode-fault
 * box, whose rows could not exist until `halfBlockRows` and the fault path did.
 * Two instances now, both repaid on the next commit, which is the evidence that
 * the shape is a loan rather than a way to grow the list.
 *
 * **`C09 I26a` and `C11 I18`–`I20` were the third and are struck here**, one
 * commit after the spec that ruled them: the seam's `measureChild`, the action
 * bar's pinned presence, the display order a slice can reverse, and the rule
 * that a window holds at least one row. Three instances, all repaid on the next
 * commit — and the loan is what keeps a spec commit honest rather than green by
 * omission.
 *
 * **`C04 I75`, `C12 I83`, `C12 I84` and `C22 I71` are the fourth**, taken on the
 * spec commit that rules the camera: the block's initial view, the context record
 * it arrives in, the sample grid and its per-render depth buffer, and the render
 * key's sixth axis. No row can name them yet — `CAM1`–`CAM5` and
 * `T4.17e`–`T4.17g` are written in the specs and reference a `Camera` no file
 * declares — and they are struck on the commit that builds it. **Fourth
 * instance, and **four of the five are struck on the commit that builds it**:
 * `T2.4c`, `T4.17e`–`T4.17h` name C04 I75, C12 I83, C12 I85 and C22 I71.
 * `C12 I85` — the focusable-plot ruling the *implementation* found rather than
 * the walk — was added to the loan and repaid within the same arc.
 *
 * **`C12 I84` stays, and it is the first entry here with a condition rather than
 * a commit.** Its subject is a renderer: the sample grid is `width × 1` by
 * `height × 2` and the depth buffer is allocated per render, and **nothing
 * rasterises anything into a sample grid yet**. A row written now would be
 * vacuous — there is no answer for it to be wrong about — and a vacuous row is
 * how this list stops meaning anything. It is struck when `scatter3d` lands,
 * which is the step that gives it a subject.
 *
 * **The distinction is worth naming because it is the one that could rot.** A
 * one-commit loan expires by being noticed; a conditional one expires only if
 * somebody goes and looks. The condition is a symbol — `scatter3d` in
 * `PlotForm` — so picking up that step begins by grepping it, which is the
 * deferral habit CLAUDE.md already carries.
 *
 * **Stated blind spot: the corpus is `.ts` only**, matching what `walk` collects,
 * so an invariant named solely by a `.mjs` fixture reads as uncited. Widening it
 * is not obviously right: `TOPICS["fixture"] = "C01"`, and the bare `I17` in
 * `test/support/fixture.mjs` means **C06's** — it sits forty lines under a
 * qualified `C06 I17` — so the wider corpus would clear `C01 I17` on a citation
 * that is about a different component. The narrow corpus over-reports; the wide
 * one would under-report, silently.
 */
const UNCITED_INVARIANTS = Object.freeze([
  "C01 I15", "C01 I16", "C01 I17", "C03 I11", "C04 I18", "C04 I20", "C04 I21", "C04 I22", "C04 I24",
  "C04 I32", "C04 I33", "C04 I66", "C05 I13", "C05 I14", "C06 I21", "C06 I22", "C06 I23",
  "C07 I16", "C07 I17", "C07 I21", "C08 I16", "C09 I15", "C09 I16", "C10 I18", "C10 I19",
  "C10 I20", "C11 I12", "C14 I11", "C14 I13", "C14 I15", "C14 I16", "C14 I19", "C14 I22",
  "C16 I1", "C16 I16", "C16 I19", "C17 I10", "C17 I14", "C18 I11", "C18 I13", "C18 I23",
  "C18 I6", "C19 I12", "C20 I11", "C20 I25", "C21 I7", "C22 I16", "C22 I39", "C22 I4a",
  "C22 I53", "C22 I57", "C22 I60a", "C23 I10", "C23 I13", "C23 I14", "C23 I23", "C23 I24",
  "C23 I41", "C24 I1", "C24 I10", "C24 I11", "C24 I13", "C24 I14", "C24 I16", "C24 I19",
  "C24 I20", "C24 I22", "C24 I25", "C24 I26", "C24 I28", "C24 I6", "C24 I7", "C25 I10",
  "C25 I11", "C25 I14", "C25 I15", "C25 I16", "C25 I17", "C25 I19a", "C25 I20a", "C25 I20b",
  "C26 I1", "C26 I11", "C26 I15", "C26 I16", "C26 I17", "C26 I20", "C26 I8", "C26 I9",
  // Struck when `scatter3d` lands — its subject is a rasteriser. See above.
  "C12 I84", "C12 I86",
]);

/**
 * A03 SP9 — **every invariant is named by at least one test row** (F357, F361).
 *
 * SP1 pairs a commitment to an invariant and nothing paired an invariant to a
 * check, so *every invariant is cited by some test* was a convention held by
 * hand. Measured with SP3's own reading: **86 of 768 are named by no test row**,
 * worst at C24 (14 of 28) and C26 (8 of 20). C12 I75 states a rule over the
 * corpus and reports five figures; nothing computed one of them.
 *
 * **Its blind spot, and it is the finding this does not close.** This checks an
 * invariant is *named*, never that the row naming it *checks* it. I75's only
 * citation was `FB7`, whose subject is `layout` and whose assertions are rect
 * widths — SP9 would call that covered, and did before AD13 existed.
 * `docs/COMMITMENT_INVARIANT_AUDIT.md` §Fourth pass argues that half is not
 * automatable: matching a citation against what a row asserts is the
 * citation-resolves-against-the-wrong-thing class, which a resolver would get
 * wrong silently.
 *
 * **The attribution is SP3's, and it took four attempts to get right** (F361). A
 * bare `I59` belongs to whichever spec owns the file, and `ownerOf` reaches 6 of
 * 2342 test files for C12 — so outside those a citation must be qualified, which
 * SP3 already forces. `TOKENS` walks a line letting a spec id govern everything
 * after it, because the corpus cites in run-on lists: `C04 I10, I11, I25`.
 *
 * **An equality-compared exemption list, not a subset one** — `anchors.mjs`'
 * shape. A subset check lets a cleared entry outlive its reason unread, and the
 * 86 are debt: the list may only shrink, and an eighty-seventh fails the day it
 * is written. Two matchers agreed on the total and disagreed on the members, so
 * the count is not the evidence and the list is.
 */
export function checkInvariantCoverage(
  specs,
  testFiles,
  readFile = (f) => readFileSync(f, "utf8"),
  exempt = UNCITED_INVARIANTS,
) {
  const cited = new Set();
  for (const f of testFiles) {
    const fallback = ownerOf(f);
    let text;
    try { text = readFile(f); } catch { continue; }
    for (const line of text.split("\n")) {
      let current = null;
      for (const m of line.matchAll(/\b(C\d{2})\b|\b(I\d+[a-z]?)\b/gu)) {
        if (m[1] !== undefined) { current = m[1]; continue; }
        const owner = current ?? fallback;
        if (owner !== null) cited.add(`${owner} ${m[2]}`);
      }
    }
  }

  const uncited = [];
  for (const file of specs) {
    const id = (file.split("/").pop() ?? "").slice(0, 3);
    for (const n of invariantsOf(file, readFile)) {
      if (!cited.has(`${id} ${n}`)) uncited.push(`${id} ${n}`);
    }
  }

  const found = uncited.slice().sort();
  const listed = [...exempt].sort();
  const violations = [];
  const fresh = found.filter((x) => !listed.includes(x));
  const cleared = listed.filter((x) => !found.includes(x));
  if (fresh.length > 0) {
    violations.push({
      rule: "SP9",
      file: "docs/components",
      spec: "A03 §7a · FINDINGS",
      message:
        `${String(fresh.length)} invariant(s) named by no test row and not on ` +
        `the list — ${fresh.join(", ")}. An invariant nothing names is a claim ` +
        `no row was written against, which reads exactly like one that is ` +
        `satisfied. Cite it from the row that covers it, or add a row.`,
    });
  }
  if (cleared.length > 0) {
    violations.push({
      rule: "SP9",
      file: "tools/enforce/commitments.mjs",
      spec: "A03 §7a · FINDINGS",
      message:
        `${String(cleared.length)} entr(y/ies) on the exemption list are now ` +
        `cited — ${cleared.join(", ")}. The list is compared by equality so it ` +
        `can only shrink; remove them. A subset check would let a cleared entry ` +
        `outlive its reason unread.`,
    });
  }
  return { violations, uncited: found.length, declared: specs.reduce((n, f) => n + invariantsOf(f, readFile).size, 0) };
}

export function checkSectionReferences(
  files,
  readFile = (f) => readFileSync(f, "utf8"),
  exceptions = SECTION_EXCEPTIONS,
) {
  const violations = [];
  const declared = new Map();
  let resolved = 0;

  const sections = (spec) => {
    if (!declared.has(spec)) {
      const path = docPath(spec);
      declared.set(spec, path === null ? null : sectionsOf(path, readFile));
    }
    return declared.get(spec);
  };

  for (const file of files) {
    let src;
    try { src = readFile(file); } catch { continue; }
    const excused = exceptions[file] !== undefined;

    for (const ref of scanSections(file, src)) {
      const where = `${file}:${String(ref.line)}`;
      if (ref.spec === null) {
        if (!excused) {
          violations.push({
            rule: "SP8",
            file: where,
            spec: "A02 §1 · A03 §7a",
            message:
              `cites a bare §${ref.id} and nothing before it says which document owns it. ` +
              `Write it as \`C12 §${ref.id}\`, add the file to OWNERS or TOPICS, or name it ` +
              `in SECTION_EXCEPTIONS with why.`,
          });
        }
        continue;
      }

      const own = sections(ref.spec);
      // **A dotted id falls back to its parent and a lettered one does not**,
      // which is the corpus's own grammar rather than a leniency. `§8b.7` names
      // the seventh item *inside* C26 §8b — a numbered line, not a heading — so
      // an index of headings cannot see it and reporting it would be the
      // instrument over-reporting, which is worse than not having one. `§3a` is
      // a **sibling** of `§3` in this corpus (3, 3a, 3b, 3c are four sections),
      // so it must not fall back: `C04 §3a` is cited twenty-five times and C04
      // declares 3 and 3c and no 3a, which is this rule's largest finding and
      // a prefix rule would have hidden it.
      const parent = ref.id.includes(".") ? ref.id.slice(0, ref.id.lastIndexOf(".")) : null;
      // **And the fallback is withdrawn where the parent numbers its own
      // headings** (F281). The paragraph above is right about `§8b.7` and it
      // made a whole class invisible: `§3ak.12` has the same *shape* and means
      // a heading, so thirteen citations to a section that had never been
      // written were counted as **resolved**, in the same run that reports how
      // many resolve to nothing. One notation for two things, and the rule had
      // to pick which to be blind to.
      //
      // **What tells them apart is the parent.** C12 §3ak declares `3ak.1` …
      // `3ak.11` as headings, so a document that numbers its sub-sections that
      // way is not also using inline numbering for the same ids — `§3ak.12`
      // must be one of them. C26 §8b declares no `8b.N` heading at all, so
      // `§8b.7` is an item inside it and still falls back.
      //
      // **Known limit, because an unrecorded one reads as strength**: a
      // *first* sub-section still falls back. `§9c.1` under a `§9c` that has no
      // numbered children resolves, and that is the same shape as `§8b.7`
      // whichever it means. The rule closes the class it can see the grammar
      // for and says so.
      const numbered = own !== null && parent !== null
        && [...own].some((id) => new RegExp(`^${parent.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\.\\d+$`, "u").test(id));
      if (own !== null && (own.has(ref.id) || (parent !== null && !numbered && own.has(parent)))) {
        resolved += 1;
        continue;
      }
      if (excused) continue;
      violations.push({
        rule: "SP8",
        file: where,
        spec: "A02 §1 · A03 §7a",
        message:
          `cites ${ref.spec} §${ref.id}${ref.qualified ? "" : " (bare, by owner)"}, and ` +
          `${ref.spec} has no such section. **A citation reads as a source**: \`C12 §3q\` was ` +
          `pointed at by three source comments and had never been written, which is what this ` +
          `rule exists for.`,
      });
    }
  }

  return { violations, resolved };
}

/** Files whose `§` references are deliberately unresolvable, each with why. */
export const SECTION_EXCEPTIONS = Object.freeze({});

export function referenceFiles() {
  const out = [];
  const walk = (dir, keep) => {
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    for (const e of entries) {
      const p = `${dir}/${e}`;
      if (statSync(p).isDirectory()) walk(p, keep);
      else if (keep.test(e)) out.push(p);
    }
  };

  walk("src", /\.tsx?$/);
  walk("test", /\.(tsx?|mjs|md)$/);
  walk("tools", /\.mjs$/);
  walk("docs/architecture", /\.md$/);
  walk("docs/components", /\.md$/);
  walk("docs/surfaces", /\.md$/);
  walk("docs/behaviours", /\.md$/);
  walk("docs/notes", /\.md$/);
  walk("docs/reference-app", /\.md$/);

  return [
    ...out.filter((f) => !/\.d\.tsx?$/.test(f)),
    "docs/COMMITMENT_INVARIANT_AUDIT.md",
    "docs/README.md",
    "CLAUDE.md",
  ].sort();
}

/**
 * A component spec owns its own invariants, so a bare `I6` inside
 * `docs/components/C14_viewport.md` means `C14 I6`.
 *
 * This is the rule that had never been needed, because `referenceFiles` did not
 * walk `docs/components/`. Adding the directory without it reports 1052
 * violations, nearly all of them a spec citing itself the way every spec in the
 * corpus does — which would read as "the specs are riddled with dangling
 * references" rather than "the resolver has never seen a self-referential file".
 * A check whose first run is that wrong gets switched off, not fixed.
 */
function selfOwner(file) {
  const m = /^docs\/components\/(C\d{2})_/.exec(file);
  return m === null ? null : m[1];
}

/**
 * The same question for **sections**, and it is a wider corpus than invariants.
 *
 * `selfOwner` is SP3's and stays components-only: widening it to the A- and
 * S-series made SP3 claim `docs/surfaces/S13_*.md` as the owner of its own bare
 * `I21`, and the S-series declares no invariants — so a rule about invariants
 * started reporting a document that has none. **One shared owner map for two
 * different vocabularies is the drift, so this is a second function rather than
 * a widened first.**
 */
function sectionOwnerOf(file) {
  const m = /^docs\/(?:components\/(C\d{2})|architecture\/(A\d{2})|surfaces\/(S\d{2}))_/.exec(file);
  if (m !== null) return m[1] ?? m[2] ?? m[3];
  return ownerOf(file);
}

function ownerOf(file) {
  const self = selfOwner(file);
  if (self !== null) return self;

  let best = null;
  for (const o of OWNERS) {
    if (file.startsWith(o.path) && (best === null || o.path.length > best.path.length)) best = o;
  }
  if (best !== null) return best.spec;

  const base = (file.split("/").pop() ?? "").replace(/\.(test|d)?\.?(tsx?|mjs|md)$/, "");
  return TOPICS[base] ?? null;
}

/**
 * Every spec id and every invariant id, in the order they are written.
 *
 * **The resolver reads the way a person reads.** The corpus cites in run-on
 * lists — `C04 I10, I11, I25`, `C09 C9 ↔ I10 + I11` — where one spec id governs
 * everything after it. A resolver that only understood `C04 I10` would call the
 * other two unowned, which in the pairing audit alone is seventy pointers it
 * would either misattribute or refuse.
 */
const TOKENS = /\b(C\d{2})\b|\b(I\d+[a-z]?)\b/g;

/**
 * Where the governing spec resets.
 *
 * A blank line, a heading or a rule ends a paragraph, and prose scope ends with
 * it — otherwise one stray mention of C14 would govern the rest of the file.
 * Inside a paragraph the scope carries across lines, because a blockquote
 * wrapping mid sentence is the corpus's own habit:
 *
 *     > C01 C4 "`release()` is idempotent and emits the inverse of what was
 *     > acquired, in reverse order" ↔ I2 (idempotence) + I6 (inverse, reverse).
 */
const BREAK = /^\s*$|^#{1,6}\s|^---\s*$/;


/**
 * What may sit between a spec id and the invariant it qualifies.
 *
 * Whitespace, and the leaders a wrapped line carries — `*` in a doc comment,
 * `//` in a line comment, `>` in a blockquote. **A qualified reference wraps**,
 * and `lines.ts` had one: `(C10\n * I21)`. Read line by line that is a bare
 * `I21` in a C25 file, which SP3 reported as a defect on its first run. It was
 * the rule that was wrong, and this is why adjacency is measured over the gap
 * rather than over one line.
 */
const SEPARATOR = /^[\s*>/]*$/;

/**
 * **An owner beats proximity, and it is not close.**
 *
 * Proximity is what a reader falls back on when nothing else says; a file's owner
 * says. Four findings on the first run were proximity overruling an owner and
 * every one of them was the rule being wrong rather than the tree:
 * `describe("C12 tier 4 — with C02")` followed by `T4.2 (I9)`, where the nearest
 * mention is C02 and the invariant is plainly C12's; a C04 doc comment naming
 * C11's plan and then citing `(I30)`.
 *
 * So proximity resolves only where there is no owner — the documents — and there
 * it is the only signal available. This is also where the rule's boundary bites:
 * an owner inferred wrongly resolves its bare ids silently whenever the number
 * exists in the wrong spec, which is why a qualified reference is preferred
 * wherever a file's owner is not obvious from its path.
 */
const FENCE = /^\s*```/;
const SPAN = /`[^`]*`/g;

/**
 * Code, blanked to spaces rather than removed, so every offset still points at
 * the character it pointed at. The renumber rewrites by offset and shares this
 * reader; a strip that shortened the line would move every reference after it.
 */
function mask(text) {
  return text.replace(SPAN, (run) => " ".repeat(run.length));
}

/**
 * Every invariant reference in one file, with the spec each resolves to.
 *
 * **One reader, used by two callers.** SP3 asks which of these resolve; the
 * renumber asks where they are. A second scanner for the second question would
 * disagree with the first eventually, and the disagreement would be a renumber
 * that moved an id the rule was not looking at — which is precisely how twelve
 * invariants went missing the last time this was attempted.
 *
 * `spec` is `null` where nothing says which spec owns the reference.
 *
 * `code` decides whether fenced blocks and code spans are read. It is `false`
 * for markdown by default, because in every document outside `docs/components/`
 * an id inside code is a *form* being illustrated and not one occurrence is a
 * real reference. **Inside the specs it is the other way round**: ten references
 * live in fenced type declarations — `// pin the range (I33)`, `// required —
 * see I13` — so the renumber reads them, and anything that widens SP3 to the
 * specs must too.
 */
export function scanReferences(file, src, options = {}) {
  const owner = options.owner ?? ownerOf(file);
  const code = options.code ?? !file.endsWith(".md");
  const out = [];


  let scope = owner;
  let fenced = false;
  let adjacent = null;
  let gap = "";

  for (const [i, raw] of src.split("\n").entries()) {
    if (!code && FENCE.test(raw)) { fenced = !fenced; continue; }
    if (fenced) continue;

    const text = code ? raw : mask(raw);
    if (BREAK.test(text)) { scope = owner; adjacent = null; }


    TOKENS.lastIndex = 0;
    let m;
    let cursor = 0;
    while ((m = TOKENS.exec(text))) {
      gap += text.slice(cursor, m.index);
      cursor = m.index + m[0].length;

      if (m[1] !== undefined) {
        // `C10 I21` — adjacency is explicit qualification and wins over
        // everything, including an owner. Proximity that is *not* adjacent only
        // speaks where no owner does.
        adjacent = m[1];
        gap = "";
        if (owner === null) scope = m[1];
        continue;
      }

      const qualified = adjacent !== null && SEPARATOR.test(gap) ? adjacent : null;
      adjacent = null;
      gap = "";

      out.push({
        line: i + 1,
        start: m.index,
        end: cursor,
        id: m[2],
        spec: qualified ?? scope,
        qualified: qualified !== null,
      });
    }

    gap += `${text.slice(cursor)}\n`;
  }

  return out;
}

export function checkReferences(
  files,
  readFile = (f) => readFileSync(f, "utf8"),
  exceptions = REFERENCE_EXCEPTIONS,
) {
  const violations = [];
  const declared = new Map();
  let resolved = 0;

  const invariants = (spec) => {
    if (!declared.has(spec)) {
      const path = specPath(spec);
      declared.set(spec, path === null ? null : invariantsOf(path, readFile));
    }
    return declared.get(spec);
  };

  for (const file of files) {
    let src;
    try { src = readFile(file); } catch { continue; }

    const excused = exceptions[file] !== undefined;
    let unresolvable = 0;

    for (const ref of scanReferences(file, src)) {
      const where = `${file}:${String(ref.line)}`;

      if (ref.spec === null) {
        unresolvable += 1;
        if (!excused) {
          violations.push({
            rule: "SP3",
            file: where,
            spec: "A02 §1 · A03 §7a",
            message:
              `cites a bare ${ref.id} and nothing before it says which spec owns it. ` +
              `Write it as \`C09 ${ref.id}\`, add the file to OWNERS or TOPICS, or name ` +
              `it in REFERENCE_EXCEPTIONS with why. Skipping it is SS26: a check ` +
              `that cannot find what it was asked about passes exactly like one ` +
              `that is satisfied.`,
          });
        }
        continue;
      }

      const own = invariants(ref.spec);
      if (own !== null && own.has(ref.id)) { resolved += 1; continue; }

      unresolvable += 1;
      if (excused) continue;
      violations.push({
        rule: "SP3",
        file: where,
        spec: "A02 §1 · A03 §7a",
        message:
          `cites ${ref.spec} ${ref.id}${ref.qualified ? "" : " (bare, by owner)"}, which ` +
          `${ref.spec} does not declare. A reference that does not resolve reads as ` +
          `backed and is not — and nothing outside docs/components/ resolved one of ` +
          `these until SP3.`,
      });
    }

    if (excused && unresolvable === 0) {
      violations.push({
        rule: "SP3",
        file,
        spec: "A02 §1 · A03 §7a",
        message:
          `is excused from SP3 — "${exceptions[file]}" — and every reference in it ` +
          `now resolves. The excuse has outlived its reason; remove the entry. An ` +
          `exception list that only grows is the gap this rule closes.`,
      });
    }
  }

  return { violations, resolved };
}

/** SP1, SP2, SP3 — the ids A03 §7a inventories, so 14b's equality can see them. */
// **SP6 was missing from this list for two commits and `make test` was red for
// both.** The rule landed in `findings.mjs`, its row landed in A03's table, its
// fabrications landed in `enforce-commitments.test.ts` — and this list, which is
// how commitment 14b learns a rule exists, was not touched. `npm run enforce`
// was green throughout, because the rule *was* implemented and running; the only
// thing that could see the gap was the suite, and the suite is not what was run.
// That is A03 §2's own subject reaching the list that enforces it.
export const SPEC_RULES = ["SP1", "SP2", "SP3", "SP4", "SP5", "SP6", "SP7", "SP8", "SP9"];
