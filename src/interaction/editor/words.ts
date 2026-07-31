/**
 * Three character classes, and the motion over them.
 *
 * C17 §3, I13, I17 — see spec. Word motion in a shell is not word motion in
 * prose: `/ps --status=running` has to stop at each meaningful piece so a flag
 * value can be edited without the motion swallowing the flag.
 *
 * **The motion skips whitespace in the direction of travel, then consumes one
 * maximal run of a single non-whitespace class** (I17). §3's worked example
 * used to claim a stop *inside* the whitespace, which the algorithm cannot
 * produce and T1.7 asserted anyway; T1.11 — two consecutive `killTo("wordLeft")`
 * yielding both words — is what settles it, since a no-skip rule kills the
 * single space between them. The edit trace (§7a) found the pair.
 *
 * **The two directions stop at different indices, and that is the design.**
 * Right stops at the end of each run, left at its start; where a gap separates
 * two runs those are different positions. Nothing here tries to make them
 * mirror each other.
 */

import { graphemes } from "./graphemes.js";

export type CharClass = "word" | "punct" | "space";

/**
 * Classified by the cluster's first code point.
 *
 * A cluster, not a character: a combining mark or a ZWJ joiner belongs to the
 * letter it decorates, and classifying it separately would put a word boundary
 * inside `é` or inside a family emoji.
 *
 * **Letters are not ASCII letters.** `日本` is alphanumeric here, which is what
 * makes `wordLeft` over CJK take the word rather than one glyph, and `_` joins
 * them because an identifier is one word to anyone editing a command.
 */
export function classify(cluster: string): CharClass {
  const ch = cluster[0] ?? "";
  if (ch === "") return "space";
  if (/\s/u.test(ch)) return "space";
  if (/[\p{L}\p{N}_]/u.test(ch)) return "word";
  return "punct";
}

/**
 * Where `wordRight` lands from `at`, as a grapheme index.
 *
 * At the end of the buffer it returns the end — a no-op rather than a wrap
 * (T3.4), and a buffer of only whitespace is traversed to its end rather than
 * looping (T3.5), because the skip always advances when there is whitespace to
 * skip.
 */
export function wordRight(text: string, at: number): number {
  const cs = graphemes(text);
  const n = cs.length; // graphemes-ok
  let i = Math.min(Math.max(0, at), n);

  while (i < n && classify(cs[i] as string) === "space") i += 1;
  if (i >= n) return n;

  const run = classify(cs[i] as string);
  while (i < n && classify(cs[i] as string) === run) i += 1;
  return i;
}

/** Where `wordLeft` lands from `at`. The mirror image in code, not in result. */
export function wordLeft(text: string, at: number): number {
  const cs = graphemes(text);
  let i = Math.min(Math.max(0, at), cs.length); // graphemes-ok

  while (i > 0 && classify(cs[i - 1] as string) === "space") i -= 1;
  if (i <= 0) return 0;

  const run = classify(cs[i - 1] as string);
  while (i > 0 && classify(cs[i - 1] as string) === run) i -= 1;
  return i;
}
