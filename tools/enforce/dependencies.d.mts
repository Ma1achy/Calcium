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

/**
 * SS38 — a bare import in `src/` of a package that is not a declared runtime
 * dependency. `readFile` is injected for the same reason every other rule
 * injects it: a rule is only known to work once it has been shown to fire.
 */
export declare function checkPhantomImports(
  files: readonly string[],
  io?: { readFile?: (file: string) => string },
): Violation[];

export declare const DEPENDENCY_RULES: readonly string[];
