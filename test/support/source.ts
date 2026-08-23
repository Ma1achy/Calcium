/**
 * Source-text assertions, and **the comments come off first**.
 *
 * A rule of the form *this file never writes X* is checked against the file, and
 * a file that explains **why** it never writes X says X in prose. Two rows have
 * already gone red this way — `svg.ts` explaining why `layoutFor` is not
 * reachable from it, `range.ts` explaining that `cells()` is not — so the false
 * positive is the *likely* direction rather than the unlucky one: prose about a
 * mechanism is denser than the mechanism.
 *
 * **And a stripper is exactly the shape that fails silently.** Strip too much and
 * the assertion passes over an empty string, which reads identically to a clean
 * file. That is why `fires` is here beside `sourceOf` rather than left to each
 * caller: **a scan owes a control that still matches**, and a scan-shaped no-op
 * is what the rule looks like without one.
 *
 * Residue, named rather than swept: four other suites strip comments inline —
 * `test/contract/{fixtures,table,public-api}.test.ts`, `test/revert/*` — and
 * none of them carries a control. They are not this commit's subject.
 */
import { readFileSync } from "node:fs";

/** The repository root, from this file's own location. */
const ROOT = new URL("../../", import.meta.url);

/** A source file with block and line comments removed. Path is repo-relative. */
export function sourceOf(rel: string): string {
  return readFileSync(new URL(rel, ROOT), "utf8")
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/^\s*\/\/.*$/gmu, "");
}

/**
 * Whether `pattern` still matches after stripping — **the control half**.
 *
 * Used two ways, and both are needed. Against a file that *should* match, it
 * says the stripper did not eat the code. Against the subject with a violation
 * spliced in, it says the matcher can see the thing the rule forbids.
 */
export function fires(text: string, pattern: RegExp): boolean {
  return new RegExp(pattern.source, pattern.flags.replace(/g/u, "")).test(text);
}

/** A six-digit hex colour literal, which is what C10 owns and a renderer must not. */
export const HEX_LITERAL = /#[0-9a-fA-F]{6}\b/u;
