// The hand-written declaration beside `build-calcium.mjs`, as every `.mjs` in
// this tree carries one: a `.d.mts` is a second record of a module's exports,
// so the two drift unless they are read together (F1128). Types are as loose as
// the module is — it reads JSON with no schema — and deliberately not invented:
// `Registry` is `unknown`-shaped rather than a transcription of 30 000 lines of
// registry that would be a third record and the one nobody regenerates.

/** A registry record, as the module reads it: JSON with the fields it names. */
export type RuleRecord = {
  id: string;
  title: string;
  text: string;
  status: string;
  sectionKey?: string | null;
  tags?: readonly string[];
  supersedes?: readonly string[];
  supersededBy?: string | null;
  condensedGroup?: string;
  legacyIds?: readonly string[];
  contentDigest: string;
};

/** The whole registry, unconstrained past the members these functions reach. */
export type Registry = Record<string, unknown> & { rules: RuleRecord[] };

export const registryPath: string;
export const outputPath: string;
export const keysOutputPath: string;

export const isBlockRuleId: (id: string) => boolean;
export const blockContentDigest: (renderHtml: unknown) => string;
export const ruleContentDigest: (rule: Pick<RuleRecord, "title" | "text" | "sectionKey">) => string;
export const barSpecimenContentDigest: (specimen: Record<string, unknown>) => string;

export function nextBlockRuleId(usedIds: Iterable<string> | Set<string>): string;
export function reconcileSectionBlockIdentities(input: {
  sectionKey: string;
  fragments: readonly unknown[];
  priorBlocks?: readonly unknown[];
  usedIds: Set<string>;
}): unknown;

export function closureOf(registry: Registry, domains: readonly string[]): Set<string>;

/**
 * Every rule record checked, and the supersession graph walked to its terminus.
 * Throws on the first violation; returns the records by id.
 */
export function validateRuleRecords(ruleList: readonly RuleRecord[]): Map<string, RuleRecord>;

export function loadRegistry(): Registry;
export function spinnerAsciiFrames(registry: Registry, spinner: unknown, seen?: Set<string>): readonly string[];
export function collectionFor(registry: Registry, key: string): readonly unknown[];
export function validateRegistry(registry: Registry): Map<string, RuleRecord>;
export function renderKeysMarkdown(registry: Registry): string;
export function buildHtml(registry: Registry, rawRegistry?: string): string;
export function build(): void;
