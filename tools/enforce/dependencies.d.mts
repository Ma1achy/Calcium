// Types for A03's supply-chain rule, so the section-scoping in `justifiedIn`
// can be tested against a synthetic document rather than only against the real
// DEPENDENCIES.md.
import type { Violation } from "./source-scans.d.mts";

export declare function justifiedIn(doc: string): Set<string>;
export declare function checkDependencies(io?: {
  readFile?: (file: string) => string;
  exists?: (file: string) => boolean;
  tree?: Iterable<readonly [string, string]>;
}): Violation[];

export declare const DEPENDENCY_RULES: readonly string[];
