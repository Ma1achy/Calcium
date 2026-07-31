/**
 * The `/verb` rewrite, as a splice into the input.
 *
 * C18 §5, I5, I16, I17, I18 — see spec.
 *
 * **A splice, not a re-join.** Everything the user typed that is not a verb
 * token reaches the shell character for character, which is the whole of what
 * delegation buys: globbing, brace expansion, quoting and operator precedence
 * are the user's own shell doing them.
 */

import { quote } from "./tokenise.js";
import type { CommandPolicy, Token } from "./types.js";

/**
 * Is this token one the rewrite may touch?
 *
 * **Rule 4's predicate, plus unquoted** (I17). One slash rule and not two: read
 * without a predicate, "any `/verb` token" rewrites `/usr/bin/ls` one section
 * after D23 said it must not, and `echo "/ps"` one line after the user quoted
 * it. `/` alone yields the empty verb and is left alone — there is nothing to
 * rewrite it to.
 */
function rewritable(token: Token, policy: CommandPolicy): boolean {
  if (token.quoted) return false;
  const verb = policy.verbOf(token);
  return verb !== null && verb !== "";
}

/** The operators after which a command starts. A redirect takes a filename. */
const CONTROL: readonly string[] = Object.freeze(["|", "||", "&&", ";", "&"]);

/**
 * Which token indices a shell would read as a command.
 *
 * **The clause D23 cannot supply.** D23 separates a verb from a path by
 * counting slashes, and `/tmp` has none to count — so `cd /tmp | ls` was
 * delegated as `cd widget tmp | ls`, which is the commonest line in the spec
 * rather than an edge. C18 is deciding what the shell would call a command, so
 * it reads the line the way the shell does: first token, or first after a
 * control operator.
 */
function commandPositions(tokens: readonly Token[]): ReadonlySet<number> {
  const at = new Set<number>();
  let next = true;
  tokens.forEach((token, i) => {
    if (token.kind === "operator") {
      next = CONTROL.includes(token.text);
      return;
    }
    if (next) at.add(i);
    next = false;
  });
  return at;
}

/**
 * The input, with every qualifying `/verb` replaced by `<binary> verb`.
 *
 * **Last to first** (I18): each splice changes the length of the string every
 * earlier-measured span sits in, so applying them in reading order would put
 * the second rewrite inside the first one's inserted text.
 *
 * **The binary is always quoted and the verb never is.** A verb that reached
 * the predicate is a run of unquoted, non-slash, non-whitespace characters, so
 * quoting it would turn `widget ps` into `widget 'ps'` for nothing. The binary
 * is app-supplied and may be a path with a space, so it goes through the quoter
 * unconditionally rather than when it looks like it needs to.
 *
 * `from` lets a `builtinThenShell` rewrite only its remainder while the spans
 * stay measured against the original input (§4).
 */
export function delegated(
  input: string,
  tokens: readonly Token[],
  policy: CommandPolicy,
  binary: string,
  from = 0,
): string {
  let out = input.slice(from);
  const commands = commandPositions(tokens);

  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const token = tokens[i] as Token;
    if (token.start < from) continue;
    if (!commands.has(i)) continue;
    if (!rewritable(token, policy)) continue;

    const verb = policy.verbOf(token) as string;
    const head = out.slice(0, token.start - from);
    const tail = out.slice(token.end - from);
    out = `${head}${quote(binary)} ${verb}${tail}`;
  }

  return out.trim();
}
