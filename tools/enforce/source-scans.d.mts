// Types for A03's scan definitions, so C02's T2.5 can run the same scan
// `make enforce` runs rather than keeping a second copy of the pattern.
// A copy would drift, and then the test passes while the build check fails.

export type Scan = {
  id: string;
  spec: string;
  pattern: RegExp;
  scope: string;
  allow: readonly string[];
  why: string;
};

export type Violation = {
  rule: string;
  file: string;
  message: string;
  spec: string;
};

export declare const SCANS: readonly Scan[];
export declare function checkSourceScans(
  files: readonly string[],
  readFile?: (file: string) => string,
): Violation[];

/**
 * SS47's exemptions, keyed by file, with the reason each rests on — the shape
 * `UNCONSUMED_MEMBERS` and `BUILDER_OMISSIONS` have (F102: an exemption records
 * its premise so the premise can be re-checked).
 */
export declare const MARK_EXEMPTIONS: Readonly<Record<string, string>>;

/** SS47 — a mark the framework draws and cannot substitute (C09 I22). */
export declare function checkMarks(
  files: readonly string[],
  readFile?: (file: string) => string,
  exemptions?: Readonly<Record<string, string>>,
): (Violation & { line: number })[];
