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
