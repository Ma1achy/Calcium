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

export declare const STORE_SYMBOLS: Readonly<Record<string, string>>;

/** MG20's realness check, for MG23's enumerated store symbols. */
export declare function storeNamesAreReal(
  files: readonly string[],
  readFile?: (f: string) => string,
): string[];

/** MG23 — a component in L1–L3 imports at most one store (C23 §2, I14). */
export declare function checkOneStorePerComponent(
  files: readonly string[],
  readFile?: (f: string) => string,
): Violation[];
