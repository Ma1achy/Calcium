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
const GROUP = /\((?!→)([^()]*)\)/g;
const INV_TOKEN = /\b(I\d+[a-z]?)\b/g;

/** `(→ C09 I5)`, `(→ A01 A.1)`, `(→ C06 I3)`. */
const CROSS = /\(→\s*([AC]\d{2})\s+([^)]+)\)/g;

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
    INV_TOKEN.lastIndex = 0;
    let t;
    while ((t = INV_TOKEN.exec(m[1]))) local.push(t[1]);
  }
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

export const SEAM_FILE = "docs/architecture/A02_tui_kit_architecture.md";
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
  capabilities: "C02",
  corpus: "C08",
  "fake-scheduler": "C03",
  "fake-terminal": "C01",
  "fallback-docker": "C07",
  fixture: "C01",
  fixtures: "C08",
  "frame-scheduler": "C03",
  lifecycle: "C01",
  manifest: "C05",
  "measurement-conformance": "C09",
  patch: "C25",
  "router-decode": "C16",
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
};

/**
 * Where SP3 reads. `docs/components/` is SP1's and SP2's; `docs/archive/` is
 * excluded because it is superseded by construction — `docs/README.md` says the
 * specs win where they disagree, so a stale pointer there is consistent with
 * everything else in that directory, and rewriting a dated working document to
 * cite ids that did not exist when it was written is worse than a pointer nobody
 * should follow.
 */
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
export const SPEC_RULES = ["SP1", "SP2", "SP3", "SP4"];
