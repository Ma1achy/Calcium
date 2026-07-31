/**
 * What `parse` returns, and what it is given.
 *
 * C18 §2 — see spec.
 */

import type { ErrorLike } from "../../data/viewmodel/types.js";
import type { Manifest, ToolDef, ValidationResult } from "../../data/manifest/types.js";

/** The three the session owns rather than a subshell (§8). */
export type Builtin = "cd" | "export" | "pwd";

export const BUILTINS: readonly Builtin[] = Object.freeze(["cd", "export", "pwd"]);

/**
 * A token, with its source span.
 *
 * **The span is load-bearing, not a convenience** (I16). `builtinThenShell.rest`
 * and every delegated `command` must be the user's own string with quoting
 * intact, and re-joining tokens loses exactly the quoting delegation exists to
 * preserve. C19 needs the same offsets to say what part of the current token
 * sits before the cursor.
 *
 * `text` is the token *after* quotes are removed and escapes applied; the span
 * covers the source it came from, so `'a b'` has `text` of `a b` and a span of
 * five characters.
 */
export type Token = Readonly<{
  text: string;
  start: number;
  end: number;
  quoted: boolean;
  kind: "word" | "operator";
  /**
   * The token in pieces, marked with whether expansion may touch them.
   *
   * **Without this, I7 is unimplementable**, and the shape §2 first declared
   * did not have it. `'$_'` and `$_` both unquote to the text `$_`; the
   * information that one was single-quoted exists only during tokenising, and
   * I8 forbids expanding there. One `quoted` boolean cannot carry it either —
   * `"$_"` is quoted and expands, `'$_'` is quoted and does not.
   *
   * `literal` is true for single-quoted runs and backslash-escaped characters,
   * matching the shell: `\$_` is a literal there too.
   */
  parts: readonly Part[];
}>;

export type Part = Readonly<{ text: string; literal: boolean }>;

export type ParseResult =
  | Readonly<{
      kind: "app";
      tool: ToolDef;
      argv: readonly string[];
      residual: readonly string[];
      validation: ValidationResult;
    }>
  | Readonly<{
      kind: "local";
      tool: ToolDef;
      argv: readonly string[];
      residual: readonly string[];
      validation: ValidationResult;
    }>
  | Readonly<{ kind: "builtin"; name: Builtin; args: readonly string[] }>
  | Readonly<{ kind: "builtinThenShell"; name: Builtin; args: readonly string[]; rest: string }>
  | Readonly<{ kind: "shell"; command: string }>
  | Readonly<{ kind: "empty" }>
  | Readonly<{ kind: "error"; error: ErrorLike }>;

export type ParseContext = Readonly<{
  manifest: Manifest;
  /** For rewriting `/verb` inside a delegated command (I5). May be a path. */
  binary: string;
  lastUuid: string | null;
  policy?: CommandPolicy;
}>;

/**
 * What the policy decides, and the whole of what it decides (F2).
 *
 * `parse` does the rest. A policy that also parsed would be a second parser,
 * and F2's intent is a replaceable prefix rule.
 */
export type Classification =
  | Readonly<{ kind: "app" | "local"; tokens: readonly string[] }>
  | Readonly<{ kind: "builtin"; name: string; tokens: readonly string[] }>
  | Readonly<{ kind: "shell" }>
  | Readonly<{ kind: "empty" }>;

export interface CommandPolicy {
  readonly prefix: string;
  /**
   * Is this the app's own verb, and if so what is left of the token?
   *
   * `null` means "not mine" — the caller falls through to the shell. Returning
   * the verb rather than a boolean is what keeps the prefix in one place: the
   * policy owns both the test and the stripping, so a `:` policy needs no
   * corresponding edit in `parse`.
   */
  verbOf(token: Token): string | null;
}
