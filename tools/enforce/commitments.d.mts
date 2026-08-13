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

/** SP7 — every test row id a spec declares, in document order, `x` rows excluded. */
export declare function testRowsOf(
  file: string,
  readFile?: (file: string) => string,
): string[];

/** SP7 — a test row's number is unique within its spec. */
export declare function checkTestRowIds(
  files: readonly string[],
  readFile?: (file: string) => string,
): Violation[];

export declare const OWNERS: readonly Readonly<{ path: string; spec: string }>[];
export declare const TOPICS: Readonly<Record<string, string>>;
export declare const REFERENCE_EXCEPTIONS: Readonly<Record<string, string>>;

/** Every file SP3 reads. `docs/components/` is SP1's and SP2's. */
export declare function referenceFiles(): string[];

export type Reference = {
  /** 1-indexed. */
  line: number;
  /** Offsets into that line, valid against the original text. */
  start: number;
  end: number;
  id: string;
  /** `null` where nothing says which spec owns it. */
  spec: string | null;
  /** Whether a spec id sat immediately before it, wrapped lines included. */
  qualified: boolean;
};

/**
 * Every invariant reference in one file. SP3 asks which resolve; the renumber
 * asks where they are — and a second scanner for the second question would
 * eventually disagree with the first.
 */
export declare function scanReferences(
  file: string,
  src: string,
  options?: Readonly<{ owner?: string | null; code?: boolean }>,
): Reference[];

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

/** Lines inside one section, bounded by the next `---` or heading at that level. */
export declare function sectionLines(
  file: string,
  headingRe: RegExp,
  readFile?: (f: string) => string,
): { line: string; n: number }[];

/** One column of a section's first markdown table, normalised for comparison. */
export declare function tableColumn(
  file: string,
  headingRe: RegExp,
  index?: number,
  readFile?: (f: string) => string,
): string[];

export declare const SEAM_FILE: string;
export declare const SEAM_OWNERS: Readonly<Record<string, Readonly<{ file: string; heading: RegExp }>>>;

/** Seam 4's rows, normalised. */
export declare function seamRows(
  readFile?: (f: string) => string,
): { effect: string; owner: string }[];

/** SP4 — Seam 4 and each owner's orchestration table agree, both directions. */
export declare function checkSeamFour(
  owners?: Readonly<Record<string, Readonly<{ file: string; heading: RegExp }>>>,
  readFile?: (f: string) => string,
  seam?: readonly { effect: string; owner: string }[],
): Violation[];
