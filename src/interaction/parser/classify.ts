/**
 * §4's numbered rules, in order, in one place.
 *
 * C18 §4, §5, I9, I22, I24 — see spec. The order is the subject: checking
 * built-ins after operators sends `cd /tmp && make` to a subshell, checking
 * them before without splitting misparses it, and both are wrong — which is
 * why 2b is a split rather than a reorder.
 */

import { BUILTINS, TTY_MARKER, type Builtin, type Token } from "./types.js";

/** §5's refusals, and the two words that are not a trailing `&`. */
const JOB_CONTROL: readonly string[] = Object.freeze(["fg", "bg", "jobs"]);

const SPLITTERS: readonly string[] = Object.freeze(["&&", ";"]);

export type Shape =
  | Readonly<{ rule: 0; refusal: "background" | "jobControl"; word: string }>
  | Readonly<{ rule: 1 }>
  | Readonly<{ rule: "1a"; restFrom: number }>
  | Readonly<{ rule: "1aEmpty" }>
  | Readonly<{ rule: "1aBuiltin"; name: Builtin }>
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
  //
  // **"First token" means the line's command, and a leading marker is not it**
  // (§5a). `/tty fg` is the `fg` built-in with the terminal asked for, and it
  // wants the same job table `fg` wants. Reading position 0 literally let it
  // through — §8a's row found it, because rule 0 and rule 1a are two correct
  // statements about the same token list.
  const first = tokens[0];
  const marked =
    first !== undefined && first.kind === "word" && verbOf(first) === TTY_MARKER;
  const command = marked ? tokens[1] : first;
  if (command !== undefined && command.kind === "word" && JOB_CONTROL.includes(command.text)) {
    return { rule: 0, refusal: "jobControl", word: command.text };
  }

  // --- rule 1 --------------------------------------------------------------
  if (first === undefined) return { rule: 1 };

  const operatorAt = tokens.findIndex((t) => t.kind === "operator");

  // --- rule 1a: the TTY marker (§5a, I25–I27) ------------------------------
  //
  // **Above 2 and 3 because both would otherwise claim the line.** `/tty cd /x`
  // reaches rule 2 with `/tty` as its first token, so it is not a built-in at
  // all and the refusal would never be reached; `/tty ls | cat` has an operator
  // and rule 3 would delegate it whole with the marker still in the string.
  //
  // Below rule 0, because a trailing `&` is refused whether or not the terminal
  // was asked for, and below rule 1 because there is no first token to test.
  //
  // **Quoting does not disable it** (I25), which was ruled the other way and
  // corrected by §8a's `"/tty" vim` row. The marker is a *classification*, and
  // every classification rule in this function is quoting-blind: `'cd'` is the
  // `cd` built-in, `'fg'` is refused, `'/ps'` is the app verb `ps`. Only the
  // rewrite honours quoting, because only the rewrite alters the user's string
  // — and `'/ps'` offers no escape hatch for a `/ps` binary either, so the
  // marker owing one was an argument for a symmetry that does not exist.
  if (marked) {
    const next = tokens[1];
    if (next === undefined) return { rule: "1aEmpty" };

    // I27. The marker forces the shell route, so the built-in would run in a
    // subshell and the session's directory or environment would **silently**
    // not change. Applying it and then handing off is rule 2b's split wearing a
    // marker, and there is no `&&` to justify the reordering — so neither half
    // happens and the conflict is reported.
    if (next.kind === "word" && isBuiltin(next.text)) {
      return { rule: "1aBuiltin", name: next.text };
    }

    return { rule: "1a", restFrom: next.start };
  }

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
