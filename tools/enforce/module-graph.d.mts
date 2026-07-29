// Types for A03's module-graph rule, so its behaviour can be tested from the
// suite rather than only observed through `make enforce`'s exit code.
import type { Violation } from "./source-scans.d.mts";

export declare function checkModuleGraph(
  files: readonly string[],
  readFile?: (file: string) => string,
): Violation[];

export declare const MODULE_GRAPH_RULES: readonly string[];

/**
 * Which `MODE_OWNERS` rows name an export `escapes.ts` actually has. A row for
 * an absent name cannot fire — the third way a rule comes to have nothing to be
 * wrong about (A03 §2).
 */
export declare function modeOwnersAreReal(readFile?: (file: string) => string): {
  exported: string[];
  missing: string[];
  owned: string[];
};
