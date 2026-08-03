/**
 * `$_`, and only `$_`.
 *
 * C18 §7, I7, I8, I20 — see spec. Expansion follows tokenising, never precedes
 * it (I8), so a value containing a space stays one token — the ordering removes
 * the class of bug rather than relying on the data.
 *
 * **The boundary rule is the shell's own**: `$_` expands where the next
 * character is not a word character. Adopting bash's rule rather than inventing
 * one is the whole argument, because the same string is handed to the shell
 * *unexpanded* when the line is addressed there (I7), and a `$_` meaning two
 * things on two sides of a prefix D20 chose for an unrelated reason is the
 * defect this avoids.
 */

import type { Part, Token } from "./types.js";

const SIGIL = "$_";

/** Applied to a non-literal part; a literal one is returned untouched. */
function expandText(text: string, value: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (!text.startsWith(SIGIL, i)) {
      out += text[i] as string;
      i += 1;
      continue;
    }
    const next = text[i + SIGIL.length];
    // `$_x` names the variable `_x`, which is not this one.
    if (next !== undefined && /[\p{L}\p{N}_]/u.test(next)) {
      out += SIGIL;
      i += SIGIL.length;
      continue;
    }
    out += value;
    i += SIGIL.length;
  }
  return out;
}

/** Does any part of this token ask for the sigil? */
export function needsExpansion(token: Token): boolean {
  return token.parts.some((p: Part) => !p.literal && p.text.includes(SIGIL));
}

/** The token's text with `$_` resolved. Literal parts are never touched. */
export function expand(token: Token, value: string): string {
  return token.parts.map((p) => (p.literal ? p.text : expandText(p.text, value))).join("");
}
