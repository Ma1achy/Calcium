/**
 * Types for `keymap-table.mjs` — the key ladder as a generated table, so
 * `test/unit/keymap-table.test.ts` type-checks against the shapes the tool runs.
 */
import type { Binding } from "../src/interaction/router/types.js";

export declare const KEYS_DOC: string;
export declare const LADDER_MARK: string;

export type LadderRow = Readonly<{
  text: string;
  cells: ReadonlyMap<string, string>;
  ladder: boolean;
}>;

export declare function tabulate(
  bindings: readonly Binding[],
  order: readonly string[],
): { rows: LadderRow[]; bindings: number; ladder: number };

export declare function renderKeymapTable(
  bindings: readonly Binding[],
  order: readonly string[],
): string;

export declare function liveTable(): string;
