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
