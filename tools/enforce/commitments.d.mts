// Types for A03 SP1, so the fire-tests run the same checker `make enforce`
// runs rather than keeping a second copy. A copy would drift, and then the test
// passes while the build check fails — the same reason `source-scans.d.mts`
// exists.

export type Violation = {
  rule: string;
  file: string;
  message: string;
  spec: string;
};

export type Commitment = {
  /** Its number in the list, as written. */
  n: number;
  /** The line's text after the number, citations included. */
  text: string;
  /** 1-indexed, so a violation points at something clickable. */
  line: number;
};

/** Declaration order, which SP2 needs and `invariantsOf` discards. */
export declare function invariantOrderOf(
  file: string,
  readFile?: (file: string) => string,
): string[];

export declare function invariantsOf(
  file: string,
  readFile?: (file: string) => string,
): Set<string>;

export declare function commitmentsOf(
  file: string,
  readFile?: (file: string) => string,
): Commitment[];

export declare function checkCommitments(
  files: readonly string[],
  readFile?: (file: string) => string,
): Violation[];

/** Every component spec, so a new one is covered the day it lands. */
export declare function specFiles(): string[];

/** The ids a spec would declare if renumbered in the order it declares them. */
export declare function expectedOrder(ids: readonly string[]): string[];

/** SP2 — invariants are numbered 1..n, in order, letters beside their base. */
export declare function checkOrdering(
  files: readonly string[],
  readFile?: (file: string) => string,
): Violation[];

export declare const OWNERS: readonly Readonly<{ path: string; spec: string }>[];
export declare const TOPICS: Readonly<Record<string, string>>;
export declare const REFERENCE_EXCEPTIONS: Readonly<Record<string, string>>;

/** Every file SP3 reads. `docs/components/` is SP1's and SP2's. */
export declare function referenceFiles(): string[];

/**
 * SP3 — every invariant reference resolves against its owning spec.
 *
 * `resolved` comes back so the fire-test can assert the resolver saw the corpus:
 * one that silently resolves nothing passes exactly like a clean tree.
 */
export declare function checkReferences(
  files: readonly string[],
  readFile?: (file: string) => string,
  exceptions?: Readonly<Record<string, string>>,
): { violations: Violation[]; resolved: number };

/** SP1, SP2, SP3 — so A03 commitment 14b's equality can see the family. */
export declare const SPEC_RULES: readonly string[];
