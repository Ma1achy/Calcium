// Types for A03's scan definitions, so C02's T2.5 can run the same scan
// `make enforce` runs rather than keeping a second copy of the pattern.
// A copy would drift, and then the test passes while the build check fails.

export type Scan = {
  id: string;
  spec: string;
  pattern: RegExp;
  /**
   * **Declared `string`, and several rows carry an array** — SS24, SS40 and
   * SS18 use the list form `scopesOf` accepts. Widening this to
   * `string | readonly string[]` is the honest type and it breaks three tests
   * outside `tools/` that call `startsWith(scan.scope)` on a single-scope row
   * (`test/contract/manifest.test.ts:445`, `view-model.test.ts:288`,
   * `test/revert/capabilities.test.ts:29`). Left narrow, on record, until those
   * three narrow their own reads (Lane E finding, 2026-09-03).
   */
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

/**
 * SS51's subject — the four encoding vocabularies a renderer may not read.
 *
 * Exported so `enforce-rules.test.ts` can assert it equals the string-valued
 * `RAMP_*` exports in `ramp.ts` in both directions: a closed pattern stops
 * seeing a fifth ramp, and silently, which is the failure the arm converts into
 * a red test.
 */
export declare const RAMP_VOCABULARIES: readonly string[];
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

/**
 * SS52 — a literal NUL anywhere the repository's own tools read (F236).
 *
 * Its own function rather than a `SCANS` row, because `checkSourceScans` only
 * ever receives `walk("src")`: widening SS43's scope string would have read as
 * a tightening and changed nothing.
 */
export declare function checkControlBytes(
  files: readonly string[],
  readFile?: (file: string) => string,
): Violation[];

/**
 * SS53 — every allow-list entry is exercised by the file it names. One row per
 * `allow` entry: how many files in scope sit under it, and how many match the
 * rule's pattern outside a comment. `matching === 0` is the violation.
 */
export type AllowCoverage = {
  rule: string;
  allow: string;
  spec: string;
  files: number;
  matching: number;
};
export declare function allowListCoverage(
  files: readonly string[],
  readFile?: (file: string) => string,
  scans?: readonly Scan[],
): AllowCoverage[];
export declare function checkAllowLists(
  files: readonly string[],
  readFile?: (file: string) => string,
  scans?: readonly Scan[],
): Violation[];

/** SS57 — the hex ranges of `EMOJI_VARIATION_BASES`, parsed out of `text.ts`'s source (C09 I45). */
export declare function parseEmojiBases(textSource: string): number[];

/** SS57 — a non-ASCII emoji variation base inside a `src/` string literal, escapes decoded (C09 I45). */
export declare function checkEmojiBases(
  files: readonly string[],
  readFile?: (file: string) => string,
  ranges?: readonly number[],
): (Violation & { line: number })[];

/** SS47 — a mark the framework draws and cannot substitute (C09 I22). */
export declare function checkMarks(
  files: readonly string[],
  readFile?: (file: string) => string,
  exemptions?: Readonly<Record<string, string>>,
): (Violation & { line: number })[];
