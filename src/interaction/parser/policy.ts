/**
 * The prefix rule, and the whole of what is pluggable (F2, I12).
 *
 * C18 §4 — see spec. The policy answers one question: is this token the app's
 * own verb, and what is the verb? Everything else — built-ins, operators,
 * refusals — is `parse`'s and identical under every policy, which is what stops
 * a replaceable prefix from becoming a replaceable parser.
 */

import type { CommandPolicy, Token } from "./types.js";

/**
 * D20 and D23, in one function.
 *
 * D23's clause is the second test: a slash *after position 0* means a path, so
 * `/usr/bin/ls` is separated from `/ps` permanently and without asking the
 * manifest anything. `/` alone yields the empty string rather than `null` —
 * it *is* addressed to the app, and §6 gives it its own error rather than
 * letting an empty verb reach the suggester, which would answer with every
 * one- and two-character verb in the manifest.
 */
export const slashPolicy: CommandPolicy = Object.freeze({
  prefix: "/",
  verbOf(token: Token): string | null {
    if (token.kind !== "word") return null;
    if (!token.text.startsWith("/")) return null;
    const rest = token.text.slice(1);
    return rest.includes("/") ? null : rest;
  },
});

/** For F2's other consumers, and for T2.6. */
export function prefixPolicy(prefix: string): CommandPolicy {
  return Object.freeze({
    prefix,
    verbOf(token: Token): string | null {
      if (token.kind !== "word") return null;
      if (!token.text.startsWith(prefix)) return null;
      const rest = token.text.slice(prefix.length);
      return rest.includes("/") ? null : rest;
    },
  });
}
