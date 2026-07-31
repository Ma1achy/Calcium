/**
 * The buffer as clusters, and the only place text is taken apart.
 *
 * C17 §2, I1, I2 — see spec. Every operation in this component counts
 * positions a cursor can occupy, which is a grapheme index and never a code
 * unit: `"👨‍👩‍👧".length` is 8, `"日本".length` is 2 where the terminal draws 4,
 * and an editor that is grapheme-aware in most places is one where a family
 * emoji breaks whichever operation was missed (commitment 13).
 *
 * **The segmenter is C09's**, not one built here. `graphemes` and
 * `clusterWidth` come from `presentation/text.ts`, which owns the single
 * `Intl.Segmenter` for the whole tree — a second one would be a second answer
 * to "where does a cluster end", agreeing today and parting on whichever ZWJ
 * sequence two Unicode versions disagree about. It is the `cells()` argument
 * one layer down, and the same reason C11 sorts through `compareByGrapheme`
 * rather than building its own.
 *
 * **`// graphemes-ok` marks are claims, not suppressions** (SS40,
 * test/support/README.md): each says the expression operates on a cluster
 * array, where index arithmetic is what the rule is asking for.
 */

import { clusterWidth, graphemes } from "../../presentation/text.js";

export { clusterWidth, graphemes };

/**
 * C17 I9 — control characters stripped on insert, `\n` alone surviving.
 *
 * **Not `stripControl`**, and the divergence is deliberate rather than
 * duplication. C09's filter keeps `\t` because a `code` block renders one and
 * `expandTabs` gives it a width; a command line has no tab stops, and Tab is
 * the completion key rather than text (C19). So the editor's rule is stricter
 * by exactly one character, which is I9 as written.
 *
 * `\r` goes with the rest: a pasted CRLF file would otherwise put a carriage
 * return inside the buffer, and a `\r` that reaches the frame makes a measured
 * row and a rendered row disagree (C09 I18).
 */
export function stripForBuffer(text: string): string {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (ch === "\n") {
      out += ch;
      continue;
    }
    if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) continue;
    // An unpaired surrogate, which is what a truncated UTF-8 read produces
    // mid-cluster. Replaced rather than kept (T3.16): it is not text, it makes
    // `text` invalid for anything downstream that re-encodes it, and a buffer
    // holding one is a command that cannot be sent. Replaced rather than
    // dropped, because a position silently vanishing from a paste is the same
    // class as C09's wrap deleting a glyph.
    out += cp >= 0xd800 && cp <= 0xdfff ? "\uFFFD" : ch;
  }
  return out;
}

/** How many positions a cursor can occupy in `text`, minus one. */
export function count(text: string): number {
  return graphemes(text).length; // graphemes-ok
}

/** The cursor clamped to a valid position (I1). */
export function clamp(cursor: number, total: number): number {
  if (!Number.isFinite(cursor)) return 0;
  return Math.min(Math.max(0, Math.floor(cursor)), total);
}

/**
 * `text` split at a grapheme index.
 *
 * Every edit is expressed as this plus a join, so no operation needs its own
 * idea of where a cluster ends — which is what makes I2 a property of one
 * function rather than a habit spread over eight.
 */
export function splitAt(text: string, at: number): Readonly<{ head: string; tail: string }> {
  const clusters = graphemes(text);
  const i = clamp(at, clusters.length); // graphemes-ok
  return {
    head: clusters.slice(0, i).join(""), // graphemes-ok
    tail: clusters.slice(i).join(""), // graphemes-ok
  };
}

/** The text between two grapheme indices, in either order. */
export function sliceBetween(text: string, a: number, b: number): string {
  const clusters = graphemes(text);
  const lo = clamp(Math.min(a, b), clusters.length); // graphemes-ok
  const hi = clamp(Math.max(a, b), clusters.length); // graphemes-ok
  return clusters.slice(lo, hi).join(""); // graphemes-ok
}

/** `text` with the clusters between two indices removed. */
export function removeBetween(text: string, a: number, b: number): string {
  const clusters = graphemes(text);
  const lo = clamp(Math.min(a, b), clusters.length); // graphemes-ok
  const hi = clamp(Math.max(a, b), clusters.length); // graphemes-ok
  return clusters.slice(0, lo).join("") + clusters.slice(hi).join(""); // graphemes-ok
}
