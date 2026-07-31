/**
 * §4's numbered rules, in order, in one place.
 *
 * C18 §4, §5, I9, I22, I24 — see spec. The order is the subject: checking
 * built-ins after operators sends `cd /tmp && make` to a subshell, checking
 * them before without splitting misparses it, and both are wrong — which is
 * why 2b is a split rather than a reorder.
 */

import { BUILTINS, type Builtin, type Token } from "./types.js";

/** §5's refusals, and the two words that are not a trailing `&`. */
const JOB_CONTROL: readonly string[] = Object.freeze(["fg", "bg", "jobs"]);

const SPLITTERS: readonly string[] = Object.freeze(["&&", ";"]);

export type Shape =
  | Readonly<{ rule: 0; refusal: "background" | "jobControl"; word: string }>
  | Readonly<{ rule: 1 }>
  | Readonly<{ rule: "2a"; name: Builtin; args: readonly Token[] }>
  | Readonly<{ rule: "2b"; name: Builtin; args: readonly Token[]; restFrom: number }>
  | Readonly<{ rule: "2c" | 3 | 5 }>
  | Readonly<{ rule: 4; verb: Token; rest: readonly Token[] }>;

const isBuiltin = (text: string): text is Builtin =>
  (BUILTINS as readonly string[]).includes(text);

/**
 * Which rule fires, and what it needs.
 *
 * `verbOf` is passed rather than imported so the policy stays the only thing
 * that knows about the prefix (I12).
 */
export function classify(
  tokens: readonly Token[],
  verbOf: (t: Token) => string | null,
): Shape {
  // --- rule 0, and it runs first and on tokens (I22) -----------------------
  //
  // On tokens, because `echo "a & b"` has no operator in it: the `&` is inside
  // a word, and only the tokeniser knows that. On *first*, because a refusal is
  // about the whole line rather than about what kind of line it is.
  const last = tokens[tokens.length - 1];
  if (last !== undefined && last.kind === "operator" && last.text === "&") {
    return { rule: 0, refusal: "background", word: "&" };
  }

  // Quoting does not disable it, for the reason interception ignores quoting
  // (§4): `'fg'` is the `fg` builtin in bash, so it still wants a job table
  // there is still no. The two rules would otherwise disagree about the same
  // question — does quoting change what the shell does with this word — where
  // the answer is no for both.
  const first = tokens[0];
  if (first !== undefined && first.kind === "word" && JOB_CONTROL.includes(first.text)) {
    return { rule: 0, refusal: "jobControl", word: first.text };
  }

  // --- rule 1 --------------------------------------------------------------
  if (first === undefined) return { rule: 1 };

  const operatorAt = tokens.findIndex((t) => t.kind === "operator");

  // --- rule 2: a leading built-in ------------------------------------------
  //
  // Quoting does not disable interception: `'cd' /tmp` is the `cd` built-in in
  // bash, so the test is on token text. The `/verb` rewrite is the opposite,
  // and §4 gives the asymmetry its reason.
  if (first.kind === "word" && isBuiltin(first.text)) {
    if (operatorAt === -1) {
      return { rule: "2a", name: first.text, args: tokens.slice(1) };
    }

    const operator = tokens[operatorAt] as Token;
    if (SPLITTERS.includes(operator.text)) {
      // I24: a split needs something to delegate. `cd /tmp &&` is a syntax
      // error, and applying the `cd` before reporting nothing is the one
      // outcome bash does not produce — so it falls through to rule 3 and the
      // shell reports it.
      const remainder = tokens.slice(operatorAt + 1);
      if (remainder.length > 0) {
        return {
          rule: "2b",
          name: first.text,
          args: tokens.slice(1, operatorAt),
          restFrom: operator.end,
        };
      }
      return { rule: 3 };
    }

    // Piping into `cd` is meaningless; the shell reports its own error.
    return { rule: "2c" };
  }

  // --- rule 3 --------------------------------------------------------------
  if (operatorAt !== -1) return { rule: 3 };

  // --- rule 4 --------------------------------------------------------------
  if (verbOf(first) !== null) return { rule: 4, verb: first, rest: tokens.slice(1) };

  // --- rule 5 --------------------------------------------------------------
  return { rule: 5 };
}
