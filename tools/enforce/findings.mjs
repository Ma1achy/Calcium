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
 *
 * **The fourth time, and it is the one with a mechanism missing rather than a
 * place missing.** `tools/` and `test/` were added to the walk below with five
 * sentences of justification — *they hold 2 462 finding citations, 19% of the
 * repository's* — and this list was not touched, so `inCitedScope` filtered
 * every one of them straight back out three lines later. **645 files and 2 688
 * citations walked and dropped**, with the rule's own comment reading as though
 * the widening had landed. Measured before applying it, exactly as that comment
 * says was done: **zero pre-existing violations** in the 645, and the only
 * difference on the day is the round's own unfiled numbers — 3 violations
 * against 11, all eight of them F1066–F1069 awaiting the ledger (F1069).
 *
 * A step can name an effect and have no mechanism, and the justification being
 * correct is why nobody looked. The corpus assertion that would have caught it
 * is a fabricated violation for the *scope* rather than for the rule, and the
 * fire-test now carries one.
 */
const CITED_FROM = [
  "examples/docker/",
  "docs/",
  "src/",
  "tools/",
  "test/",
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
/**
 * The four continuation headings, named rather than matched away.
 *
 * A follow-up section shares its finding's id — `## F37 closed` — and is the
 * recorded convention, so it is not a duplicate. Matching *any* heading with
 * text between the id and the dash would excuse a real duplicate written the
 * same way, and the convention is four sections rather than a pattern, so it is
 * a list. Compared by equality below, so a fifth follow-up is a decision and a
 * deleted one is a failure.
 */
const FOLLOW_UPS = Object.freeze(["F37 confirmed at a cost", "F24 corrected", "F37 closed", "F374 closed"]);

function declared() {
  const text = readFileSync(LEDGER, "utf8");
  const ids = new Set();
  for (const m of text.matchAll(/^##\s+(F\d+[a-z]?)\b/gmu)) ids.add(m[1]);
  return ids;
}

/**
 * SP5's other half — **the ledger's ids are unique, and a `Set` cannot say so.**
 *
 * `declared()` collects into a `Set` because the question it answers is *does
 * this id exist*. That makes a duplicate heading invisible: two `## F164`
 * sections resolve every citation to F164 and the rule is green, while the
 * register holds two different findings under one number and a reader following
 * a citation lands on whichever comes first.
 *
 * **Measured, and it had happened.** One duplicate in 1 055 headings — an
 * aborted write that left a heading, a two-row table and nothing else, above the
 * real entry with a different title. Deleted; the count is now 1 054 headings
 * over 1 050 ids, and the four remaining are the named follow-ups.
 *
 * **This is the failure mode a double-allocated finding number produces**, and
 * that happened in the same session, from the other end: two lanes were handed
 * one number and SP5 would have passed on both, because it can see an absence
 * and not a collision. FINDINGS F1047, F1041.
 */
export function checkFindingIds(io) {
  const readText = io?.read ?? ((f) => readFileSync(f, "utf8"));
  const violations = [];
  const seen = new Map();
  const followUps = [];

  for (const m of readText(LEDGER).matchAll(/^##\s+(F\d+[a-z]?)(\s[^—\n]*?)?\s+[—-]/gmu)) {
    const id = m[1];
    const tail = (m[2] ?? "").trim();
    if (tail !== "") {
      followUps.push(`${id} ${tail}`);
      continue;
    }
    seen.set(id, (seen.get(id) ?? 0) + 1);
  }

  const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  if (dupes.length > 0) {
    violations.push({
      rule: "SP5",
      file: LEDGER,
      message:
        `${String(dupes.length)} finding id(s) carry more than one section: ${dupes.join(" ")}. ` +
        `A citation resolves to whichever comes first, and \`declared()\` collects into a Set, ` +
        `so the rule that checks citations cannot see this at all — it answers existence, not ` +
        `uniqueness. Merge them, or give the later one its own number (F1047).`,
      spec: "A03 §7a · FINDINGS",
    });
  }

  // The convention, compared by equality — a fifth continuation is a decision,
  // and a deleted one is a failure rather than a quietly shorter list.
  const unexpected = followUps.filter((f) => !FOLLOW_UPS.includes(f));
  const gone = FOLLOW_UPS.filter((f) => !followUps.includes(f));
  if (unexpected.length > 0 || gone.length > 0) {
    violations.push({
      rule: "SP5",
      file: LEDGER,
      message:
        `the continuation headings are not the stated set` +
        `${unexpected.length > 0 ? ` — new: ${unexpected.join(" · ")}` : ""}` +
        `${gone.length > 0 ? ` — gone: ${gone.join(" · ")}` : ""}. ` +
        `A follow-up shares its finding's id deliberately; the list is what keeps that ` +
        `distinguishable from a duplicate written the same way (F1047).`,
      spec: "A03 §7a · FINDINGS",
    });
  }

  violations.headings = [...seen.values()].reduce((a, b) => a + b, 0) + followUps.length;
  violations.ids = seen.size;
  violations.followUps = followUps.length;
  return violations;
}

/**
 * A citation, and the shape is deliberately narrow.
 *
 * `FINDINGS F70`, `(F58b)`, `see F14` — a bare `F1` inside an identifier or a
 * hex string is not one, so the number must be delimited and must not be part of
 * a longer word.
 *
 * **`U+F900` is the one hex form the word rule does not reach**, because `+` is
 * not a word character while the `x` of `0xF900` and the `u` of `\uF900` both
 * are — so those two were excluded from the day this was written and the Unicode
 * form was not. It fired on a docstring naming a block of the width property, and
 * the failure is the loud kind rather than the quiet one: it invents a citation
 * rather than dropping one. Named as its own lookbehind rather than by adding `+`
 * to the class, so the exclusion says which form it is about.
 */
const CITATION = /(?<![A-Za-z0-9_])(?<!U\+)(F\d+[a-z]?)(?![A-Za-z0-9_])/gu;

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
        // **`tools/` and `test/`, added after they were measured rather than
        // before.** They hold **2 462 finding citations, 19% of the
        // repository's**, and every one was outside this rule until now — the
        // same *scope excludes its subject* class as `examples/docker/src`
        // above, arriving on the two directories where the instruments live.
        // The instruments are the artefacts that cite findings most densely
        // after the register itself, because every rule here carries the
        // finding that produced it.
        //
        // **Measured before widening, so that it lands green rather than red.**
        // A gate red on arrival is a gate edited to fit; this one was clean on
        // arrival apart from the round's own unfiled numbers and two
        // fabrication sentinels, and the sentinels were derived from the
        // ledger's maximum rather than exempted, so the corpus has no
        // exceptions to name. FINDINGS F1047, F1041.
        //
        // **And for one round this walk was the whole of the widening.**
        // `CITED_FROM` was not touched, so `inCitedScope` below dropped all 645
        // files these two lines add — the measurement above was made, written
        // down, and never reached the predicate that decides. Both halves are
        // in now, and the scope has a fabricated violation of its own in the
        // fire-tests, because nothing here could have told the two states
        // apart: a walk that adds files and a filter that removes them reports
        // exactly what a correct scope reports (F1069).
        ...walk("tools"),
        ...walk("test"),
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
  //
  // **Reconciled once, 2026-09-04, and the limit stayed.** Re-measured at 8 of 15
  // rows out (−1, +1, −1, +1, +2, −1, −6, +6), with a fourth shape F434 had not
  // named: F30 was keyed in two groups, so the per-section counts summed to 736
  // against 735 distinct — a truthful column and this sum were not both
  // satisfiable. Ruled one owner per id (F30 → group 4; group 7 cites it unbolded),
  // §13's four ids moved home from the cohort table under §14, and the column
  // rewritten from this reader's own count. Still not gated per row, for the
  // reason above; the figure is here so the next drift is measured against a
  // reconciled column rather than an unknown one.
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

// --- SP12 — the register's open set, readable and compared by equality -------
//
// **The register is the document that says what is left to do, and its open set
// could not be read.** SP6 already records the neighbouring problem in its own
// comment — *"keyed" has no definition strong enough yet* — and stops there.
// This is the next word along: not which rows are keyed, but which are **open**.
//
// **Measured, and the measurement is this session's own mistake.** Surveying the
// register to decide what work remained, a grep for the bolded marker returned
// **16** open findings, and lanes were dispatched against those sixteen. The
// answer is **39**. The twenty-three that were missed are not obscure entries;
// they are rows that write the same fact in a different form:
//
//   `**Open**`            the common form
//   `**OPEN**`            F405
//   `| open |`            F50 — a bare lowercase cell, and a real open defect
//   `Open ·  … **Closed**` F79 — a superseded marker left in place, which reads
//                          as open to any matcher that does not take the last
//
// That is the *a matcher that sees one encoding* class, landing on the register
// itself: the reader reports absence when the value merely changes form, and it
// is worst exactly where the forms accumulated over a long document's life.
//
// **This comment said 33 and seventeen on the day it landed, beside a list of
// 39.** Both numbers came from a draft taken before the reader was finished, and
// 16 + 17 = 33 is self-consistent, which is the whole reason it survived review —
// the arithmetic offered as evidence agrees with itself, exactly as SP6's own
// comment says of the sentence it was written against. The figure is corrected
// here from `TRIAGE_OPEN.length`, which is the only copy anything runs, and the
// mistake is left recorded rather than tidied because it is this rule's own
// subject: **a claim is falsified by being summarised, not by being wrong**, and
// the summary above a correct list is where to look for it. FINDINGS F1031.
//
// **The cost is not hypothetical and it is not the count.** A count that is
// wrong low sends nobody anywhere. What it did was leave twenty-three open findings
// undispatched while the survey read as complete — including F50, a column that
// never grows, sitting open and uncounted beside F701, the finding about the same
// columns that *was* dispatched. A register nobody can query is a register that
// reports whatever the querier's regex happens to spell.
//
// **The vocabulary, and why the last token wins.** Dispositions here are
// *appended* rather than replaced: a row records `Open` when filed and gains
// `**Closed** (F991)` when the sweep resolves it, both left in place because the
// history is the evidence. So the current disposition is the last one written,
// and any reader that takes the first — or that asks whether "open" appears —
// answers about the row's past.
//
// **What this does not reach, stated because an unrecorded limit reads as
// strength.** 208 of 1004 keyed rows state no disposition at all. They are not
// gated here and they are not assumed closed: they are reported as a count, on
// SP6's own precedent that a gate red on arrival is a gate edited to fit. The
// honest reading of those is *unstated*, and turning them into a fourth answer
// is a sweep over the document rather than a rule over it. Second limit: the
// vocabulary is closed by this file, so a row inventing a fifth word reads as
// unstated rather than as a violation — loud in the safe direction, quiet in the
// other, which is the same asymmetry MG24 carries and for the same reason.

/**
 * **The register's open set** — what is left to do, as a list rather than as a
 * query nobody could write correctly.
 *
 * **Thirty-nine when this rule was written**, against the sixteen a `**Open**`
 * grep returns. **Eighteen of the difference are `**Partly**`**, a disposition
 * invented for findings whose remedy landed in part, which every reader in this
 * repository was silently counting as done — the third-state problem the
 * mutation harness has twice (F897, F949), arriving in the document that says
 * what remains.
 *
 * **The count moves and this sentence must not be read as the current one.**
 * That is this rule's own subject arriving in its own prose: a figure written
 * once and left to read as present tense is exactly what the register did to
 * itself. The only current answer is the list below, and the row that checks it
 * derives the number rather than restating it — which is why that row stays
 * green while this paragraph ages. The thirty-nine is kept because the
 * *difference* is the finding, not the total.
 *
 * Ordered by number, which is the order a reader walks it in.
 */
export const TRIAGE_OPEN = Object.freeze([
  "F812", "F1097", "F1100", "F1104",
]);

/** The words a disposition may be written with. */
export const DISPOSITION_WORDS = ["open", "closed", "fixed", "absorbed", "retracted", "withdrawn", "partly", "superseded"];

/** The ones that mean **not done**. `partly` counts as open: part of it is. */
const OPEN_WORDS = new Set(["open", "partly"]);

/**
 * **A marker, and not merely the word.** The first reader here matched the
 * vocabulary anywhere in the row and was wrong in both directions on real rows:
 * F8 ends *"the shell refuses to open"* after a `**Closed**` and read as open,
 * and F247's trailing cell `**gate open**` is a column value rather than a
 * disposition. Prose containing a word is not a claim about the finding's state.
 *
 * So a marker is one of exactly two shapes, both of which a writer chooses
 * deliberately:
 *
 *   a **bold span whose first word** is one of the vocabulary — `**Open**`,
 *   `**Closed** (F991)`, `**Closed by F1017**`, `**OPEN**`
 *
 *   a **table cell holding nothing else** — `| open |`, `| fixed |`
 *
 * `**gate open**` is neither, because its first word is `gate`; *"refuses to
 * open"* is neither, because it is not bold and not alone in a cell.
 *
 * **Two shapes in a row's prose desynchronise the pairing, and both are the
 * writer's to avoid.** `[^*]*` cannot cross a `*`, so a bold span containing
 * one — `**Closed — ruled *no operation*…**` — is not a marker at all and the
 * previous disposition stands. And a bold span whose first character is not a
 * letter — `**1**` in *against **1** open finding* — fails `([A-Za-z]+)`, so
 * its **closing** `**` opens the next match and every marker after it is
 * mis-paired: F1080's row read *open* with `**Closed**` written at the front
 * of its disposition. Both were caught by SP12, which compares the set by
 * equality and is therefore loud in both directions — but the row is the thing
 * to fix, not the regex. In a keyed row, write a number as a word and keep `*`
 * out of a bold span.
 */
const BOLD_MARKER = /\*\*\s*([A-Za-z]+)[^*]*\*\*/gu;

/**
 * A keyed row's **current** disposition, or `null` where it states none.
 *
 * Exported so the rule and its test cannot drift apart, and so a reader who
 * wants the open set gets the same answer the gate has.
 *
 * **The last marker wins**, because dispositions here are appended rather than
 * replaced: a row records `Open` when filed and gains `**Closed** (F991)` when
 * the sweep resolves it, both left in place because the history is the evidence.
 * A reader taking the first answers about the row's past.
 */
export function dispositionOf(row) {
  // **One scan in document order, and not two passes.** The first draft matched
  // bold spans, then cells, and let the second overwrite the first — so two
  // readers of one row could disagree and the later loop won regardless of which
  // marker the writer put last. `F229` is the row that showed it: a bold
  // `**fixed**` and a cell `closed`, agreeing on the answer and disagreeing on
  // the path. They agreed here; nothing made them.
  const marks = [];
  for (const m of row.matchAll(BOLD_MARKER)) {
    const w = m[1].toLowerCase();
    if (DISPOSITION_WORDS.includes(w)) marks.push([m.index ?? 0, w]);
  }
  let at = 0;
  for (const cell of row.split("|")) {
    const w = cell.trim().toLowerCase();
    if (DISPOSITION_WORDS.includes(w)) marks.push([at, w]);
    at += cell.length + 1;
  }
  if (marks.length === 0) return null;
  marks.sort((a, b) => a[0] - b[0]);
  const last = marks[marks.length - 1]?.[1];
  return last !== undefined && OPEN_WORDS.has(last) ? "open" : "closed";
}

/**
 * Each finding's **own** keyed row — the line that opens with its id, in either
 * of the document's two shapes.
 *
 * A mention inside another entry's prose is not this finding's disposition, and
 * reading one is how F79 first measured as open: its id appears in a sentence
 * belonging to F86, which carries its own marker.
 */
export function keyedRows(triage) {
  const rows = new Map();
  for (const line of triage.split("\n")) {
    const m = /^(?:\| )?\*\*F(\d+[a-z]?)\*\*[ |]/u.exec(line.trimStart());
    if (m !== null && !rows.has(m[1])) rows.set(m[1], line);
  }
  return rows;
}

/**
 * SP12 — the open set is a list, compared by equality.
 *
 * `expected` is the register's open set as the last person to change it left it.
 * **Equality and not containment**: a finding that closes must be struck from
 * this list, and one that opens must be added, and a subset check in either
 * direction is silent about the other — measured, in both directions, on C10
 * I39's debt list (T6.97).
 */
/**
 * SP14 — each group heading's tally equals the rows it heads.
 *
 * **The second record of the open set, and it was the only one nobody read.**
 * SP12 gates the set; each `## N ·` heading carries `X open · Y closed · Z with
 * no verdict` for its own section, and closing a finding means editing both.
 * Closing F158 and F1024 meant editing two headings by hand with nothing that
 * would have gone red had neither been touched (F1080).
 *
 * **Why this is gated where `checkTriageInventory`'s per-group counts are
 * not**, which is a live decision recorded above with two reconciliation passes
 * behind it: *keyed* has no definition strong enough, so a gate over it would
 * be red on arrival and edited to fit. A **disposition** has one —
 * `dispositionOf`, which SP12 already compares by equality — so the tallies are
 * exactly derivable today. Run over the corpus before wiring: 14 of 15 headings
 * agreed, the fifteenth (§13) was out by one on `with no verdict`, and four
 * stated a field not at all. Those five were repaired and the shapes
 * normalised, so this is green on arrival with nothing edited to fit.
 *
 * **A heading that states no tally is a violation rather than a pass**, which
 * is the whole of A03 §2 applied to a parser: `**closed**, all 5` and `9 closed
 * · new at F80` each omitted a field, and a reader that shrugs at a missing
 * number is a rule with a way to opt out of itself.
 *
 * `readText` is a parameter so the fabricated violation can drive both arms —
 * a heading that overstates and one that understates — without touching the
 * register.
 */
export function checkGroupTallies(io) {
  const readText = io?.read ?? ((f) => readFileSync(f, "utf8"));
  const violations = [];
  const lines = readText(TRIAGE).split("\n");

  // `keyedRows`' own model — the first line per id, across the whole document —
  // because a per-group walk that counts every occurrence double-counts an id
  // mentioned in a second group's prose, and the two readings differ (F1080).
  const seen = new Set();
  const groups = [];
  let current = null;
  for (const line of lines) {
    const head = /^## (\d+|Singles)(?: · |\b)/u.exec(line);
    if (head !== null) {
      current = { name: head[1], heading: line, open: 0, closed: 0, none: 0 };
      groups.push(current);
      continue;
    }
    const row = /^(?:\| )?\*\*F(\d+[a-z]?)\*\*[ |]/u.exec(line.trimStart());
    if (row === null || seen.has(row[1])) continue;
    seen.add(row[1]);
    if (current === null) continue;
    const d = dispositionOf(line);
    if (d === "open" || d === "partly") current.open += 1;
    else if (d !== null) current.closed += 1;
    else current.none += 1;
  }

  for (const g of groups) {
    const stated = groupTally(g.heading);
    if (stated === null) {
      violations.push({
        rule: "SP14",
        file: TRIAGE,
        spec: "A03 §7a · FINDINGS",
        message:
          `group ${g.name}'s heading states no tally. A heading with no numbers in it cannot ` +
          `disagree with its rows, which is the vacuity class one list over: write ` +
          `\`X open · Y closed · Z with no verdict\`, spelling a zero as \`none\`.`,
      });
      continue;
    }
    const wrong = [];
    if (stated.open !== g.open) wrong.push(`open ${String(stated.open)} against ${String(g.open)}`);
    if (stated.closed !== g.closed) wrong.push(`closed ${String(stated.closed)} against ${String(g.closed)}`);
    if (stated.none !== g.none) wrong.push(`with no verdict ${String(stated.none)} against ${String(g.none)}`);
    if (wrong.length > 0) {
      violations.push({
        rule: "SP14",
        file: TRIAGE,
        spec: "A03 §7a · FINDINGS",
        message:
          `group ${g.name}'s heading disagrees with the rows it heads — ${wrong.join("; ")}. ` +
          `The heading is the second record of the open set and SP12 gates the first; a group ` +
          `whose tally is stale reads as settled work and is the reason a closure has to edit ` +
          `two places (F1080).`,
      });
    }
  }

  violations.groups = groups.length;
  return violations;
}

/**
 * A heading's stated tally, or `null` when it states none.
 *
 * `**closed**` spells zero open, which is how thirteen of the fifteen headings
 * read and is worth keeping — a reader scanning for work looks for a word, not
 * a digit. `none` spells zero anywhere a count is expected. Deliberately **not**
 * reading `unread`: that is the ranking table's vocabulary for a *consumer*, and
 * the first draft of F1080 rewrote four cells having read one as the other.
 */
function groupTally(heading) {
  const open = /(?:^|[^\d])(\d+|none) open\b/u.exec(heading);
  const closed = /(?:^|[^\d])(\d+|none) closed\b/u.exec(heading);
  const none = /(?:^|[^\d])(\d+|none) with no verdict\b/u.exec(heading);
  const zeroOpen = /\*\*closed\*\*/u.test(heading);
  if ((open === null && !zeroOpen) || closed === null || none === null) return null;
  const count = (m) => (m === null || m[1] === "none" ? 0 : Number(m[1]));
  return { open: count(open), closed: count(closed), none: count(none) };
}

export function checkOpenSet(io, expected = TRIAGE_OPEN) {
  const readText = io?.read ?? ((f) => readFileSync(f, "utf8"));
  const violations = [];
  const rows = keyedRows(readText(TRIAGE));

  const found = [];
  let unstated = 0;
  for (const [id, row] of rows) {
    const d = dispositionOf(row);
    if (d === null) unstated += 1;
    else if (d === "open") found.push(`F${id}`);
  }
  found.sort((a, b) => Number(a.slice(1).replace(/\D/gu, "")) - Number(b.slice(1).replace(/\D/gu, "")));

  const listed = [...expected].sort((a, b) => Number(a.slice(1).replace(/\D/gu, "")) - Number(b.slice(1).replace(/\D/gu, "")));
  const appeared = found.filter((x) => !listed.includes(x));
  const cleared = listed.filter((x) => !found.includes(x));

  if (appeared.length > 0) {
    violations.push({
      rule: "SP12",
      file: TRIAGE,
      spec: "A03 §7a · FINDINGS",
      message:
        `${String(appeared.length)} finding(s) read as open and are not on the register's ` +
        `open set — ${appeared.join(", ")}. The set is what says what is left; a row that ` +
        `opens without joining it is work nobody can query for.`,
    });
  }
  if (cleared.length > 0) {
    violations.push({
      rule: "SP12",
      file: "tools/enforce/findings.mjs",
      spec: "A03 §7a · FINDINGS",
      message:
        `${String(cleared.length)} entr(y/ies) on the open set no longer read as open — ` +
        `${cleared.join(", ")}. Compared by equality so the list can only shrink deliberately; ` +
        `a subset check would let a closed finding sit on it unread.`,
    });
  }

  violations.open = found.length;
  violations.unstated = unstated;
  violations.rows = rows.size;
  return violations;
}
