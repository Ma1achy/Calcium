/**
 * SP5 — every `Fnn` citation resolves against a finding that exists.
 *
 * **The findings ledger is the most-cited document in the application and the
 * only one with no citation check.** SP3 proves that every `Inn` reference
 * resolves; specs, source and tests are all covered. `FINDINGS.md` is cited from
 * source comments, from four specs, and from itself, and nothing looked.
 *
 * It was written after step 9 cited `F67` for a finding about local handlers.
 * F67 exists and is about the shell drawing nothing below a certain terminal
 * size — so the citation **resolved, against something real and unrelated**,
 * which is the version that survives review. The replacement was chosen by
 * grepping `^## F6[0-9]`, which cannot see `F70` and above; the true maximum was
 * `F76`, and that number was taken too. `make enforce` was green throughout.
 *
 * This is A03 §2's vacuity class in the one document that had no mechanism at
 * all: a wrong citation reads exactly like a right one, and the cost of checking
 * is a file read.
 *
 * **Known limits, stated because an unrecorded limit reads as strength:**
 *
 *   - It checks that the number **exists**, not that it is the right one. A
 *     citation pointing at a real but unrelated finding — which is precisely
 *     what happened — still passes if the number is live. Nothing can catch
 *     that; `docs/COMMITMENT_INVARIANT_AUDIT.md` §Fourth pass says why one
 *     should not be built.
 *   - It reads the literal `F` followed by digits. A number held in a variable
 *     or built by hand is invisible, which is the blind spot every textual rule
 *     in this suite has.
 *   - **Prose about a bad citation contains the bad citation**, and this cannot
 *     tell discussion from use. Writing A03's rationale for this rule made it
 *     fire on that rationale. Describe such an id rather than spelling it; an
 *     exception list would excuse the file that most needs checking.
 *   - Sub-findings (`F17a`, `F58b`) resolve against their own heading,
 *     and a citation of `F58` resolves whether or not `F58b` exists. They are
 *     separate entries and are indexed separately.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";

const LEDGER = "examples/docker/FINDINGS.md";

/**
 * Where a citation may appear. Anything else is prose about the number.
 *
 * **The repository root is a location, not a list of filenames.** `CLAUDE.md`
 * was named individually and the five other root documents that cite this
 * ledger were not — 92 citations across `CALCIUM_COVERAGE_AUDIT*.md`,
 * `DOCKER_TUI_COMPLETION.md`, `DOCKER_TUI_START_HERE.md` and
 * `DOCKER_TUI_SURFACES.md`, none of them checked. Every one resolves, so
 * nothing was hidden; what was missing was the guarantee.
 *
 * That is this rule's scope failing for the **third** time, and the third time
 * the same way: naming the places thought to matter instead of covering the
 * place and excluding what does not belong. F82 widened it from two code
 * directories to `examples/docker`; F84 is the same sentence about MG24. A
 * document written tomorrow at the root is covered on the day it is written
 * rather than on the day someone remembers this list exists.
 */
const CITED_FROM = [
  "examples/docker/",
  "docs/",
  "src/",
];

/**
 * In scope: one of the directories above, or a document at the repository root.
 *
 * **A root file has no prefix**, which the first version of this widening got
 * wrong — it added `"./"` to the list, and `readdirSync(".")` returns bare
 * names, so nothing matched it *and* `CLAUDE.md` stopped matching the literal
 * entry it used to have. `scanned` fell 306 → 305 and `citations` 687 → 682.
 *
 * A five-citation regression, invisible in the exit status and obvious in the
 * counters, one commit after F82 was filed for exactly that. Kept as the
 * comment rather than tidied away because it is the finding's own argument
 * arriving unprompted.
 */
const inCitedScope = (f) =>
  f === LEDGER || !f.includes("/") || CITED_FROM.some((p) => f.startsWith(p));

/** The headings, which are the only declaration of what exists. */
function declared() {
  const text = readFileSync(LEDGER, "utf8");
  const ids = new Set();
  for (const m of text.matchAll(/^##\s+(F\d+[a-z]?)\b/gmu)) ids.add(m[1]);
  return ids;
}

/**
 * A citation, and the shape is deliberately narrow.
 *
 * `FINDINGS F70`, `(F58b)`, `see F14` — a bare `F1` inside an identifier or a
 * hex string is not one, so the number must be delimited and must not be part of
 * a longer word.
 */
const CITATION = /(?<![A-Za-z0-9_])(F\d+[a-z]?)(?![A-Za-z0-9_])/gu;

/**
 * Its own walk, and that is the whole reason this rule works.
 *
 * `index.mjs` builds `files` from `walk("src")`, so a rule taking that list can
 * only ever see framework source — and every citation of this ledger is in
 * `examples/docker/`, `docs/` or `CLAUDE.md`. The first draft took `files`,
 * scanned nothing, and passed: four fabricated violations, zero firings. A rule
 * whose scope excludes its subject is A03 §2's vacuity class wearing a scan's
 * clothes, and it is invisible because the output is identical to success.
 */
function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e === "node_modules" || e === ".git" || e === "dist" || e === "out") continue;
    const full = `${dir}/${e}`;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(?:ts|mjs|md)$/u.test(e)) out.push(full);
  }
  return out;
}

/**
 * SP4's reader seam, for the same reason: a rule that can only read the real
 * tree can only be tested by damaging it.
 *
 * `scanned` is returned alongside the violations so a test can assert the rule
 * **looked at something**. This one was vacuous twice — once scanning no files,
 * once unable to fire on any number — and both times the output was identical to
 * success. A count is the only thing that tells "clean" from "did not run".
 */
export function checkFindings(io) {
  const readText = io?.read ?? ((f) => readFileSync(f, "utf8"));
  const known = io?.known ?? declared();
  const violations = [];

  // The ledger cites itself constantly — "see F58b", "F66's shape" — and those
  // must resolve too. It is included rather than excused: the entry that cites a
  // finding renumbered out from under it is the likeliest wrong citation there
  // is, and excusing the file would leave the largest source of them unchecked.
  //
  // **`examples/docker`, not its two code directories** — an allow-list over the
  // directory rather than a glob at the files thought to matter. The first
  // version named `examples/docker/src` and `examples/docker/test`, which left
  // every top-level document out: thirteen files and ~250 citations, `TRIAGE.md`
  // alone holding 175. That is the *most*-cited artefact after the ledger, and it
  // is the one whose whole job is to cite.
  //
  // Found by fixing `citations` and comparing the number against the tree, which
  // is the argument for the counter in one line: 415 was checkable and 0 was not.
  // Same mechanism as this rule's first vacuity — a scope that excludes its
  // subject — so it is the third instance of one class, and the fix is the shape
  // that stops it recurring: cover the directory and name the exceptions.
  // FINDINGS F82.
  //
  // **Deduplicated, because the ledger is now reached twice** — once by the walk
  // and once by being named. Without the `Set` it is scanned twice and its 116
  // self-citations are counted twice, which inflates the very number a caller
  // asserts against. Caught by arithmetic: 415 + 250 is 665 and the run said 781.
  const inScope =
    io?.files ??
    [
      ...new Set([
        ...walk("src"),
        ...walk("docs"),
        ...walk("examples/docker"),
        // The root's own documents, not recursed — `walk` would descend into
        // every example and package. The five that cite this ledger live here
        // beside `CLAUDE.md`, which used to be the only one named. F84.
        ...readdirSync(".").filter((e) => e.endsWith(".md")),
        LEDGER,
        "CLAUDE.md",
      ]),
    ].filter(inCitedScope);
  let scanned = 0;
  let citations = 0;

  for (const file of inScope) {
    let text;
    try {
      text = readText(file);
    } catch {
      continue;
    }
    scanned += 1;
    if (!text.includes("F")) continue;

    const lines = text.split("\n");
    for (const [i, line] of lines.entries()) {
      // A heading declares; it does not cite.
      if (/^##\s+F\d/u.test(line)) continue;
      for (const m of line.matchAll(CITATION)) {
        const id = m[1];
        // Only ids in the ledger's range are citations of it. `F1` in a
        // hexadecimal dump or a version string is not, and the ledger starting
        // at F1 means the range is "anything declared, or above the maximum".
        const n = Number(id.replace(/[a-z]$/u, "").slice(1));
        if (n < 1) continue;

        // **Counted here, before the resolution check, and that ordering is the
        // whole point of the field.** It used to be incremented inside the
        // violation branch below, which made `citations` a second name for
        // `violations.length`: always 0 on a clean tree, whether the rule had
        // walked past six hundred citations or had matched nothing at all. That is
        // precisely the "clean is indistinguishable from did-not-run" signal the
        // counter was added to destroy, so the rule shipped vacuous a third time
        // *in the instrument built because it shipped vacuous twice*. FINDINGS F82.
        citations += 1;
        if (known.has(id)) continue;

        const max = Math.max(
          ...[...known].map((k) => Number(k.replace(/[a-z]$/u, "").slice(1))),
        );
        // **A number past the end fires, and the first draft skipped it.**
        //
        // The guard read `n < 1 || n > max` — "out of range, so not a citation"
        // — and the ledger is dense from F1 to F77 with no gaps, so the only
        // thing that could fire was a gap and there were none. The rule was
        // vacuous on the day it was written: three fabricated violations, zero
        // firings, `enforce` green. A03 §2's class in the check meant to close
        // it.
        //
        // And the skipped half was the important one. Inventing a number past
        // the end is the likeliest wrong citation there is — it is what happened
        // twice in step 9 — while a gap requires someone to have deleted a
        // finding. The upper bound is now checked and only a nonsensical `F0`
        // is excused.
        violations.push({
          rule: "SP5",
          file: `${file}:${String(i + 1)}`,
          message:
            `cites ${id}, and ${LEDGER} has no such finding. The ledger runs to F${String(max)}. ` +
            `A number chosen by grepping a prefix — \`^## F6[0-9]\` cannot see F70 — is how ` +
            `this one arrived. Note that a citation resolving against a real but unrelated ` +
            `finding passes here: this rule checks existence, not aim.`,
          spec: "A03 §7a · FINDINGS",
        });
      }
    }
  }

  violations.scanned = scanned;
  violations.citations = citations;
  return violations;
}

const TRIAGE = "examples/docker/TRIAGE.md";

/**
 * SP6 — every finding in the ledger is keyed in the triage, and the triage's
 * declared total equals what it keys.
 *
 * **`TRIAGE.md` certifies itself complete and the certificate is a snapshot.**
 * Its §*How this file was checked* opens *"The inventory is derived, not
 * hand-copied — `grep '^## F' FINDINGS.md` yields 89 ids and every one is keyed
 * in a group above"*, followed by a sum that reaches 89. Measured when this rule
 * was written: **145 distinct findings, 55 of them keyed in no group.** The sum
 * still reached 89, so the arithmetic offered as evidence passed exactly as it
 * did on the day it was true.
 *
 * That is F87's mechanism one level out. F87 found that a total over group sizes
 * cannot see a duplicate placed twice and counted once — a proxy agreeing with
 * itself. This is the same total failing to see **absence**: a sum computed over
 * the groups can only ever describe the groups, so nothing in it can notice ids
 * that were never keyed anywhere. F87 fixed the disjointness half and left the
 * completeness half resting on a number nobody recomputes. FINDINGS F142.
 *
 * **Compared by equality, on `BUILDER_OMISSIONS`' precedent** (A03 §3). The
 * triage's inventory is an exemption list in prose: it says *these are all the
 * findings and here is where each sits*, and a list that is checked as a subset
 * lets an entry outlive its reason unread. Twice today an allow-list disposed of
 * its own stale entry because equality made it mechanical.
 *
 * **Known limits, stated because an unrecorded limit reads as strength:**
 *
 *   - **A bolded id anywhere in a group section counts as keyed.** The triage
 *     keys in two forms — a table row's first cell, and bold in prose — and
 *     nothing distinguishes a key from a mention. Measured: table-cells alone
 *     find 78 and groups 6 and 13 key nothing that way at all. So this proves
 *     *coverage*, not correct placement, exactly as SP5 checks existence and not
 *     aim. A finding bolded in passing inside a group it does not belong to
 *     passes here.
 *   - **Per-group counts are not checked**, for the same reason: with keys and
 *     mentions indistinguishable, a per-group rule would fire on prose. The
 *     remedy taken instead was to delete the duplicate counts, so each group's
 *     size is stated once — group 9 carried *"7 surfaces"* in its heading and
 *     *"Six findings"* in the sentence below it, because F86 was added to the
 *     table and not to the sentence.
 *   - **Follow-up sections share an id.** `## F24 corrected`, `## F37 confirmed
 *     at a cost` and `## F37 closed` are continuations, so a raw `grep -c '^## F'`
 *     answers 148 where the finding count is 145. The first draft of F142 quoted
 *     that grep and was wrong by three, which is the entry's own subject.
 */
export function checkTriageInventory(io) {
  const readText = io?.read ?? ((f) => readFileSync(f, "utf8"));
  const violations = [];

  const ledger = readText(LEDGER);
  const triage = readText(TRIAGE);

  // Distinct, so a follow-up section is the finding it continues.
  const ids = [...new Set([...ledger.matchAll(/^## (F\d+[a-z]?)\b/gmu)].map((m) => m[1]))];

  // A group section runs from its `## N · ` heading to the next `## `, and
  // `Singles` is a group in everything but numbering — leaving it out would make
  // its six findings read as unkeyed.
  const sections = triage.split(/^## /mu).filter((c) => /^(?:\d+ · |Singles)/u.test(c));
  const keyed = new Set(sections.flatMap((c) => [...c.matchAll(/\*\*(F\d+[a-z]?)\*\*/gu)].map((m) => m[1])));

  const unkeyed = ids.filter((id) => !keyed.has(id));
  if (unkeyed.length > 0) {
    violations.push({
      rule: "SP6",
      file: TRIAGE,
      message:
        `${String(unkeyed.length)} of ${String(ids.length)} findings are keyed in no group: ` +
        `${unkeyed.join(" ")}. The inventory claims every id is keyed, and its sum reaches the ` +
        `total either way — a count over the groups can only describe the groups, so it cannot ` +
        `see an id that was never keyed at all (F142, F87 one level out). Key each one, or ` +
        `add a group for the mechanism they share.`,
      spec: "A03 §7a · FINDINGS",
    });
  }

  // The declared total, which is the sentence that went stale. Per-group numbers
  // are not checked — see the limits above — but the total is derivable from the
  // same table and is what the self-check actually asserts.
  //
  // **The limit now carries its measurement, because an unrecorded figure reads
  // as a small gap** (F434). Measured over the tree: **6 of 14 ranking rows
  // disagree with the ids keyed in their own section**, by −1, +1, −3, +1, +4 and
  // −1 — and **the total passes because the errors cancel**. So this check is
  // not merely silent about attribution; it is satisfiable by a document where
  // six rows are wrong.
  //
  // **The failure mode is one move**: write the entry beside the finding it
  // relates to, increment the count on the group the finding belongs to. Two
  // groups, one id, and the sum is unchanged. It happened twice in one session.
  //
  // **Not gated, and the reason is that "keyed" has no definition strong enough
  // yet.** The loose reading — any bolded id in the section — counts a mention
  // in another entry's prose; the strict one, an id opening a paragraph, leaves
  // 8 ids of 435 owned by nothing and puts 7 of 14 rows out. Closing this means
  // reconciling the counts first, and several of them carry prose meaning the
  // column does not ("13 open, 5 closed"). A gate over numbers nobody maintains
  // would be red on arrival and edited to fit.
  const declared = [...triage.matchAll(/^\|\s*(?:\*\*)?(?:\d+|—)(?:\*\*)?\s*\|[^|]*\|\s*(\d+)\s*\|/gmu)].map(
    (m) => Number(m[1]),
  );
  const sum = declared.reduce((a, b) => a + b, 0);
  if (declared.length > 0 && sum !== keyed.size) {
    violations.push({
      rule: "SP6",
      file: TRIAGE,
      message:
        `the ranking table's findings column sums to ${String(sum)} and the groups key ` +
        `${String(keyed.size)} distinct ids. The sum is the document's own evidence that the ` +
        `inventory is derived; it is derived once and nothing recomputes it (F142).`,
      spec: "A03 §7a · FINDINGS",
    });
  }

  violations.ids = ids.length;
  violations.keyed = keyed.size;
  return violations;
}
