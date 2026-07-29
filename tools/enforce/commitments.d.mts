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
