// Types for SS54, the refusal register — so the fabrication rows in
// `enforce-rules.test.ts` type-check against the same shapes `make enforce` runs.
import type { Violation } from "./source-scans.d.mts";

export type RefusalPremise =
  | { absent: string; in?: "src" | "package.json" }
  | { present: string; in?: "src" | "package.json" }
  | { unverifiable: string };

export type Refusal = {
  id: string;
  where: string;
  premise: RefusalPremise;
  why: string;
};

export type RefusalRow = {
  id: string;
  kind: "absent" | "present" | "unverifiable";
  symbol?: string;
  /** `null` for an unverifiable premise, which is counted and never judged. */
  holds: boolean | null;
};

export declare const REFUSALS: readonly Refusal[];
export declare function corpusOf(
  files?: readonly string[],
  readFile?: (file: string) => string,
): string;
export declare function resolveRefusals(
  register?: readonly Refusal[],
  corpus?: string,
  manifest?: string,
): RefusalRow[];
export declare function checkRefusals(
  register?: readonly Refusal[],
  corpus?: string,
  manifest?: string,
): Violation[];
export declare function unverifiableRefusals(register?: readonly Refusal[]): string[];
