/**
 * C18 — the command parser.
 *
 * `tokenise` and `quote` are exported for C19, which must not write its own:
 * two implementations disagree at unbalanced quotes and escaped spaces, and the
 * symptom is completion offering a candidate that parses differently once
 * accepted (I11, SS30).
 */

export { parse } from "./parse.js";
export { tokenise, quote } from "./tokenise.js";
export { slashPolicy, prefixPolicy } from "./policy.js";
export type {
  Builtin,
  Classification,
  CommandPolicy,
  ParseContext,
  ParseResult,
  Part,
  Token,
} from "./types.js";
