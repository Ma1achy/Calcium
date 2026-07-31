/**
 * The completion vocabulary.
 *
 * C19 §2, §3, §4 — see spec.
 *
 * Two fields here carry a ruling each, and both would read as arbitrary without
 * the sentence attached: `tokens` is C18's span-carrying `Token` rather than a
 * string list, and `delimiter` belongs to the candidate rather than to the
 * engine.
 */

import type { ArgDef, FlagDef, Token, Tone, ToolDef } from "./deps.js";

/**
 * What is being completed, decided by where the cursor sits.
 *
 * **`cursor` is a code-unit offset into `input`, not a grapheme index** (I5).
 * Token spans are code-unit offsets, so every derivation of `prefix` and
 * `replace` is arithmetic in that space; mixing the two mis-slices the first
 * line containing an emoji, and the symptom is a candidate inserted over half a
 * cluster rather than an error. C17's cursor *is* a grapheme index, so the
 * conversion is real — and it belongs to L4, at the seam. A component holding
 * two coordinate systems eventually reads one in the other's arithmetic.
 */
export type CompletionContext = Readonly<{
  input: string;
  cursor: number;
  /**
   * C18's tokens, spans and all (I5, C18 ruling 4).
   *
   * A `readonly string[]` cannot answer any of the three questions asked of it.
   * `prefix` is a question about offsets rather than text — token text has
   * quotes removed, so `'ab cd'` is five characters over a seven-character span.
   * Acceptance needs a range, which only `start` supplies. And `kind` carries
   * command position, so `ls | gre` is an executable slot; on a string list that
   * word sits at index 2 and reads as a positional.
   */
  tokens: readonly Token[];
  tokenIndex: number;
  /** The part of the current token before the cursor. */
  prefix: string;
  /** What acceptance replaces: the current token's `start` to the cursor. */
  replace: Readonly<{ start: number; end: number }>;
  tool: ToolDef | null;
  slot: Slot;
}>;

export type Slot =
  | Readonly<{ kind: "verb" }>
  | Readonly<{ kind: "executable" }>
  | Readonly<{ kind: "flagName" }>
  | Readonly<{ kind: "flagValue"; flag: FlagDef }>
  | Readonly<{ kind: "positional"; arg: ArgDef }>
  | Readonly<{ kind: "path" }>
  | Readonly<{ kind: "none" }>;

/** The union as a runtime list, so T2.7 can be exhaustive over it. */
export const SLOT_KINDS = Object.freeze([
  "verb",
  "executable",
  "flagName",
  "flagValue",
  "positional",
  "path",
  "none",
] as const satisfies readonly Slot["kind"][]);

export type Candidate = Readonly<{
  value: string;
  /** Shown if it differs from the inserted text. */
  display?: string;
  /** Right-aligned hint in the menu. */
  detail?: string;
  tone?: Tone;
  /**
   * What follows the value when it is accepted whole (I16). Default `" "`.
   *
   * **The candidate's, not the engine's.** A directory wants `/`, a flag taking
   * a value wants `=`, a finished word wants a space — and only the source knows
   * which. The engine cannot tell a directory from a file, and only C05 says
   * whether a flag takes a value, so one engine-level rule is wrong for two of
   * the three.
   *
   * It is also what makes `Tab` twice work without a press counter: a unique
   * match closes its token, so the second press is in the next slot, and the
   * ambiguous case reaches the menu because a common prefix is inserted
   * *without* one (§5).
   */
  delimiter?: string;
}>;

export interface CompletionSource {
  readonly id: string;
  readonly slots: readonly Slot["kind"][];
  readonly dynamic: boolean;
  /** Dynamic only; default 60_000. */
  readonly ttlMs?: number;
  complete(ctx: CompletionContext): readonly Candidate[] | Promise<readonly Candidate[]>;
}

export type CompletionResult = Readonly<{
  seq: number;
  candidates: readonly Candidate[];
  commonPrefix: string;
  superseded: boolean;
}>;

/**
 * What acceptance produces: one replacement, applied as one edit (I11).
 *
 * A range and a string rather than a sequence of insertions, because C17 makes
 * an edit an undo unit and a candidate inserted character by character is N of
 * them (T6.10).
 */
export type Acceptance = Readonly<{
  start: number;
  end: number;
  text: string;
}>;

export class CompletionError extends Error {
  override readonly name = "CompletionError";
}
