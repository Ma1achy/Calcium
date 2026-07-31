/**
 * The one tokeniser and the one quoter.
 *
 * C18 §3, I11, I16 — see spec. C19 imports both rather than writing its own:
 * two implementations disagree at unbalanced quotes and escaped spaces, and the
 * symptom is completion offering a candidate that parses differently once
 * accepted. SS30 is that rule, made mechanical.
 *
 * **Operators are tokens** (§3). A regex over the raw input would read the `&`
 * in `echo "a & b"` as backgrounding and the slash in `"/usr/bin"` as D23's;
 * every rule in §4 and §5 asks this list instead.
 *
 * **Spans, because the delegated string is spliced rather than re-joined**
 * (I16). Re-joining tokens loses the user's quoting, which is the one thing
 * delegation exists to preserve.
 */

import type { ErrorLike } from "../../data/viewmodel/types.js";
import type { Result } from "../../data/viewmodel/types.js";
import type { Part, Token } from "./types.js";

/**
 * The operators, longest first.
 *
 * Order is the whole of why `&&` is not two `&`s and `>>` is not two `>`s —
 * I10 refuses a trailing bare `&` and permits `&&`, and a shortest-first walk
 * makes that distinction impossible to draw.
 */
const OPERATORS: readonly string[] = Object.freeze([
  "&&",
  "||",
  ">>",
  "<<",
  "|",
  ">",
  "<",
  ";",
  "&",
]);

function err(message: string, remediation?: string): ErrorLike {
  return Object.freeze({
    message,
    code: "parse",
    stage: "parse",
    ...(remediation === undefined ? {} : { remediation }),
  });
}

/**
 * Split an input into words and operators, or say why it cannot be split.
 *
 * Unterminated quotes and a trailing backslash are errors rather than a silent
 * close (T3.4, T3.5, T3.6): closing them quietly would run something the user
 * did not type, and the shell would have refused the same line.
 */
export function tokenise(input: string): Result<readonly Token[], ErrorLike> {
  const tokens: Token[] = [];

  let i = 0;
  let parts: Part[] = [];
  let start = -1;
  let quoted = false;
  let open = false;

  /** Appended rather than concatenated, so `'$_'` stays distinguishable from `$_`. */
  const add = (text: string, literal: boolean): void => {
    const last = parts[parts.length - 1];
    if (last !== undefined && last.literal === literal) {
      parts[parts.length - 1] = Object.freeze({ text: last.text + text, literal });
      return;
    }
    parts.push(Object.freeze({ text, literal }));
  };

  /** Close the token being built, if one is open. Named `emit` rather than
   * `flush` because SS28 bans a frame flush in `src/interaction/` and a rule
   * whose false positives get it widened is a rule people learn to ignore. */
  const emit = (): void => {
    if (!open) return;
    tokens.push(
      Object.freeze({
        text: parts.map((p) => p.text).join(""),
        start,
        end: i,
        quoted,
        kind: "word" as const,
        parts: Object.freeze(parts),
      }),
    );
    parts = [];
    quoted = false;
    open = false;
  };

  while (i < input.length) {
    const ch = input[i] as string;

    if (/\s/u.test(ch)) {
      emit();
      i += 1;
      continue;
    }

    // Operators only break a token when we are not inside one that quoting
    // began: `echo "a | b"` is a word, and the quote is what says so.
    const operator = OPERATORS.find((op) => input.startsWith(op, i));
    if (operator !== undefined) {
      emit();
      tokens.push(
        Object.freeze({
          text: operator,
          start: i,
          end: i + operator.length,
          quoted: false,
          kind: "operator" as const,
          parts: Object.freeze([Object.freeze({ text: operator, literal: true })]),
        }),
      );
      i += operator.length;
      continue;
    }

    if (!open) {
      open = true;
      start = i;
    }

    if (ch === "'") {
      const close = input.indexOf("'", i + 1);
      if (close === -1) {
        return {
          ok: false,
          error: err(
            "unterminated single quote",
            "close the quote, or escape it with \\' if you meant a literal apostrophe",
          ),
        };
      }
      add(input.slice(i + 1, close), true);
      quoted = true;
      i = close + 1;
      continue;
    }

    if (ch === '"') {
      let j = i + 1;
      const body: Part[] = [];
      let closed = false;
      while (j < input.length) {
        const c = input[j] as string;
        // A backslash inside double quotes escapes, and an escaped `$` is a
        // literal `$` — which is the shell's rule and therefore I20's.
        if (c === "\\" && j + 1 < input.length) {
          body.push(Object.freeze({ text: input[j + 1] as string, literal: true }));
          j += 2;
          continue;
        }
        if (c === '"') {
          closed = true;
          break;
        }
        body.push(Object.freeze({ text: c, literal: false }));
        j += 1;
      }
      if (!closed) {
        return { ok: false, error: err("unterminated double quote", "close the quote") };
      }
      for (const part of body) add(part.text, part.literal);
      quoted = true;
      i = j + 1;
      continue;
    }

    if (ch === "\\") {
      if (i + 1 >= input.length) {
        return {
          ok: false,
          error: err(
            "a backslash at the end of the input escapes nothing",
            "escape it as \\\\ if you meant a literal backslash",
          ),
        };
      }
      add(input[i + 1] as string, true);
      quoted = true;
      i += 2;
      continue;
    }

    add(ch, false);
    i += 1;
  }

  emit();
  return { ok: true, value: Object.freeze(tokens) };
}

/**
 * The one quoter (I11).
 *
 * Single quotes, because they are literal: a value containing `$`, backticks or
 * a newline survives unchanged, and the only character that needs handling is
 * the single quote itself. `'` becomes `'\''` — close, escape, reopen — which is
 * the shell idiom rather than a cleverness, and it round-trips through
 * `tokenise` (C19 T3.4 asserts exactly that).
 *
 * An empty string quotes to `''` rather than nothing, or a token disappears.
 */
export function quote(text: string): string {
  if (text === "") return "''";
  if (/^[A-Za-z0-9_@%+=:,./-]+$/u.test(text)) return text;
  return `'${text.replaceAll("'", `'\\''`)}'`;
}
