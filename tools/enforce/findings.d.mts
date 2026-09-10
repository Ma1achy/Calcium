// Types for SP5, so the suite drives the same code `make enforce` runs rather
// than keeping a second copy of the citation reader. A copy would drift, and
// then the test passes while the tree is wrong.

export type Violation = {
  rule: string;
  file: string;
  message: string;
  spec: string;
};

/**
 * The violations, plus two counters the tests need.
 *
 * **`scanned` and `citations` are not diagnostics.** This rule shipped vacuous
 * twice — once with a file list that held none of the files that cite the
 * ledger, once unable to fire on any number — and both times its output was
 * indistinguishable from success. A count is the only thing that tells "clean"
 * from "did not run", so it is part of the return rather than something a
 * caller could forget to ask for.
 *
 * **`citations` counts every citation walked past, resolving or not** — not the
 * failures, which are `length`. It was implemented as the latter and was
 * therefore always equal to `violations.length`, reporting **0** on a tree
 * holding 412 real citations across 66 files: the third vacuity, inside the
 * counter built to prevent the first two. So a caller asserting `citations > 0`
 * is asserting that the regex and the scope work *together*, which is the pair
 * that failed both earlier times and which `scanned` alone cannot show.
 * FINDINGS F82.
 */
export type FindingsResult = Violation[] & {
  scanned: number;
  citations: number;
};

export type FindingsIo = {
  /** Overrides the ledger's declared ids. */
  known?: ReadonlySet<string>;
  /** Overrides the files walked. */
  files?: readonly string[];
  /** Overrides the file reader. */
  read?: (file: string) => string;
};

/** SP5 — every `Fnn` citation resolves against a finding that exists. */
export declare function checkFindings(io?: FindingsIo): FindingsResult;

/**
 * SP6's counters, on `FindingsResult`'s precedent and for the same reason.
 *
 * **`ids` and `keyed` are the whole point of the rule.** The paragraph SP6
 * replaces certified the inventory complete with a sum over the groups, which
 * cannot see an id that was never keyed at all — so it read as clean while 55 of
 * 145 findings sat outside it. A rule that answers only "no violations" repeats
 * that failure in code: a caller asserting `keyed === ids` is asserting the
 * comparison happened, which an exit status cannot say. FINDINGS F142.
 */
export type TriageResult = Violation[] & {
  /** Distinct findings in the ledger — follow-up sections fold into their id. */
  ids: number;
  /** Distinct ids bolded inside a group section. Coverage, not placement. */
  keyed: number;
};

/** SP6 — every finding is keyed in the triage, and the declared total is derived. */
export declare function checkTriageInventory(io?: FindingsIo): TriageResult;

// --- SP12 — the register's open set -----------------------------------------
//
// **This file is a hand-written declaration beside a `.mjs`, and nothing checks
// the two against each other.** That is how the first attempt at SP12 shipped a
// commit whose own typecheck was red: the four exports existed in the module and
// the suite ran them, and `tsc` reads this file and knew none of them. Runtime
// and types disagreed and only a per-commit check could say so — the working
// tree was red too, and `npm run enforce` was green throughout. A pair of
// artefacts where one is the contract and the other is the behaviour wants the
// question asked in both directions; here it is asked in neither, and saying so
// is the honest version of adding four lines.

/** The words a disposition may be written with, in the register's own vocabulary. */
export declare const DISPOSITION_WORDS: readonly string[];

/**
 * The register's open set — every keyed row reading `open` or `partly`.
 *
 * Compared **by equality**, so it can only change deliberately: a subset check
 * in either direction is silent about the other side, measured both ways on C10
 * I39's debt list.
 */
export declare const TRIAGE_OPEN: readonly string[];

/**
 * A keyed row's **current** disposition, or `null` where it states none.
 *
 * A *marker*, not a word: a bold span whose first word is one of the vocabulary,
 * or a table cell holding nothing else — so prose containing "open" is not a
 * claim about a finding's state. The **last** marker wins, because dispositions
 * are appended rather than replaced. FINDINGS F1031.
 */
export declare function dispositionOf(row: string): "open" | "closed" | null;

/** Each finding's own keyed row, by id — a mention in another entry's prose is not one. */
export declare function keyedRows(triage: string): Map<string, string>;

/**
 * SP12's counters, on `FindingsResult`'s precedent and for its reason.
 *
 * **`unstated` is the one that matters.** 332 of 1008 rows state no disposition,
 * and they are counted rather than gated; a rule answering only "no violations"
 * cannot distinguish a register everyone has dispositioned from one nobody has.
 */
export type OpenSetResult = Violation[] & {
  /** Rows reading open — what is left to do. */
  open: number;
  /** Rows stating no disposition at all. Reported, not gated. */
  unstated: number;
  /** Keyed rows walked, so "clean" is distinguishable from "did not run". */
  rows: number;
};

/** SP12 — the register's open set is a list compared by equality. */
export declare function checkOpenSet(io?: FindingsIo, expected?: readonly string[]): OpenSetResult;
