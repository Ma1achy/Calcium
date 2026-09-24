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

/**
 * SS65 — where a registry glyph lives when it is not in `glyphs.ts`, and why.
 * The premise is recorded so it can be re-checked rather than inherited, and an
 * entry whose mark has arrived is itself a violation (C09 I88).
 */
export declare const GLYPH_HOMES: Readonly<Record<string, string>>;

/**
 * SS65 — every `current` registry glyph resolves to a mark `glyphs.ts` can draw,
 * or is named in `GLYPH_HOMES`. SS64 is a collision rule and cannot see a mark
 * with no character at all (C09 I88, R-TAB-001, R-COR-003).
 */
export declare function checkGlyphPresence(
  registrySource?: string,
  glyphSource?: string,
  homes?: Readonly<Record<string, string>>,
): Violation[];

/** SS67 — one surface's disposition against the floor's table (C10 I60). */
export interface SurfaceRole {
  readonly role: "text" | "gated" | "ink" | "excluded";
  readonly gate?: string;
  readonly why?: string;
}

/** SS67 — every surface a renderer names, and what the floor does about it (C10 I60, R-THM-004). */
export declare const SURFACE_ROLES: Readonly<Record<string, SurfaceRole>>;

/**
 * SS67 — every `"surface.X"` a renderer names outside `theme/` has a disposition
 * in `SURFACE_ROLES`, and every entry is named by some renderer (C10 I60).
 */
export declare function checkTextGrounds(
  files: readonly string[],
  readFile?: (file: string) => string,
  roles?: Readonly<Record<string, SurfaceRole>>,
): (Violation & { line: number })[];

/** SS63 — the hex ranges of a named table in `text.ts`, parsed out of its source (C09 I48). */
export declare function parseRangeTable(textSource: string, name: string): number[];

/** SS63 — a glyph's recorded `widthClass` against what `cells()` measures (C09 I48, R-GLY-003). */
export declare function checkGlyphWidthClass(
  registrySource?: string,
  textSource?: string,
): Violation[];

/** SS64 — a domain table in `glyphs.ts`, read as `token: ["domain", …],` lines (R-GLY-003). */
export declare function parseDomainTable(source: string, name: string): Record<string, string[]>;

/**
 * SS64 — a mark unique inside the domains it appears in, across the registry,
 * `GLYPH_TABLE` and `GlyphSet` (R-GLY-003, R-GLY-002).
 */
export declare function checkMarkDomains(
  registrySource?: string,
  glyphSource?: string,
): Violation[];
