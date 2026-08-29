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

/** Members whose absence from the rest of `src/` is deliberate, each with why (MG24). */
export declare const UNCONSUMED_MEMBERS: Readonly<Record<string, string>>;

/** Which component owns a file, by longest `OWNERS` prefix; unowned files are their own. */
export declare function componentOf(file: string): string;

/**
 * MG24's wide reading — members never called outside their own component.
 * Reported in the summary, never gated on: 27% of the surface qualifies. F94.
 */
export declare function componentSeamSignal(
  files: readonly string[],
  readFile?: (file: string) => string,
): { members: number; withinComponent: string[] };

/**
 * MG24 — a member of an `export interface` under `src/` is named somewhere else
 * under `src/`. A component complete on its own side of a seam, with nothing on
 * the other (A02 Seam 4).
 */
export declare function checkSeamConsumers(
  files: readonly string[],
  readFile?: (f: string) => string,
  allowed?: Readonly<Record<string, string>>,
): Violation[];

/** Functions whose absence from the rest of `src/` is deliberate, each with why (MG25). */
export declare const UNCONSUMED_FUNCTIONS: Readonly<Record<string, string>>;

/**
 * MG25 — an exported function or class under `src/` is named somewhere else
 * under `src/`. MG24's blind spot: a producer expressed as free functions rather
 * than as an interface. The allow-list is compared by equality, so an entry that
 * no longer excuses anything is itself a violation.
 */
/**
 * MG29 — an exported function whose parameter type is not published (C24 I29).
 *
 * `readFile` is a parameter so the fabricated violation can un-publish a type
 * without touching the tree, which is the only way to drive a rule whose subject
 * is the entry point's own export list.
 */
export declare function checkExportedArguments(
  files: readonly string[],
  readFile?: (f: string) => string,
): Violation[];

export declare function checkFunctionConsumers(
  files: readonly string[],
  readFile?: (f: string) => string,
  allowed?: Readonly<Record<string, string>>,
): Violation[];

/**
 * MG27 — a field a block type carries that no builder sets (C24 I20, F114).
 *
 * `omissions` is a parameter rather than only a module constant so the
 * fabricated violation can drive both arms: a field with a recorded reason must
 * be excused, and an entry naming a field the builder now sets must itself
 * fire. A rule tested only against its real allow-list tests one of the two.
 */
export declare function checkBuilderCoverage(
  files: readonly string[],
  readFile?: (f: string) => string,
  omissions?: Readonly<Record<string, string>>,
  /**
   * Injected for the same reason `omissions` is: a rule tested only against its
   * real list tests one of its two arms. This one has two of its own — a builder
   * that sets a field claimed unbuildable, and an entry naming a field no kind
   * carries.
   */
  never?: Readonly<Record<string, string>>,
): Violation[];

/** MG27's reasons, keyed `Kind.field`. */
export declare const BUILDER_OMISSIONS: Readonly<Record<string, string>>;

/**
 * MG27's reasons keyed by **field**, for fields carried by an intersected base
 * and therefore on every kind at once — one entry rather than nineteen copies
 * of one sentence.
 */
export declare const BUILDER_NEVER: Readonly<Record<string, string>>;

/**
 * Roadmap 48 — the public surface by **use**: members of the types
 * `src/index.ts` exports, against both examples' own sources. Reported, never
 * gated (A03 §9).
 *
 * `candidates` is the residue, and the direction is the point: a name collision
 * can only ever *clear*, so the list under-reports and cannot over-report.
 * `ambiguous` is how many clearings a collision could account for.
 */
export declare function publicSurfaceUseSignal(
  files: readonly string[],
  exampleFiles: readonly string[],
  readFile?: (f: string) => string,
): {
  members: number;
  candidates: string[];
  cleared: number;
  ambiguous: number;
  testOnly: number;
  concentrated: string[];
};
