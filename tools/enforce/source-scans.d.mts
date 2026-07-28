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
export declare function checkSourceScans(files: readonly string[]): Violation[];
