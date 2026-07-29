/**
 * C09 §4 — the substitution table, and the rule that governs it.
 *
 * **Every substitution is 1:1 by column count** (I5). This is not tidiness: a
 * measurer works in cells, and a fallback glyph that is two cells where the
 * original was one makes every measured height wrong — for users with a
 * non-UTF-8 locale, and only for them, which is the hardest kind of report to
 * act on.
 *
 * The ellipsis is the case that catches people, and it is the reason the ASCII
 * truncation marker is `~` rather than `...` (C04 §5).
 *
 * `bmp` takes the Unicode set. Every glyph here is in the basic plane, and
 * `ascii` is for terminals that cannot draw beyond it at all — a terminal that
 * has box drawing and no astral planes still gets `┌` and `✓`.
 */
import type { TerminalCapabilities } from "../../terminal/capabilities.js";

/**
 * One name per glyph rôle. The two sets are declared side by side rather than
 * as a lookup keyed on the Unicode character, so a new rôle cannot be added
 * without deciding its fallback — and T2.5 asserts every pair is 1:1.
 */
export type GlyphSet = Readonly<{
  // Box drawing — panel borders, rules.
  horizontal: string;
  vertical: string;
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  teeLeft: string;
  teeRight: string;

  // Status — steps, notices, cells.
  tick: string;
  cross: string;
  filled: string;
  hollow: string;
  dotted: string;
  blocked: string;
  warning: string;
  bar: string;

  // Progress.
  progressFull: string;
  progressEmpty: string;
}>;

const UNICODE: GlyphSet = Object.freeze({
  horizontal: "─",
  vertical: "│",
  topLeft: "┌",
  topRight: "┐",
  bottomLeft: "└",
  bottomRight: "┘",
  teeLeft: "├",
  teeRight: "┤",

  tick: "✓",
  cross: "✗",
  filled: "●",
  hollow: "○",
  dotted: "◌",
  blocked: "⊘",
  warning: "▲",
  bar: "▌",

  progressFull: "█",
  progressEmpty: "░",
});

const ASCII: GlyphSet = Object.freeze({
  horizontal: "-",
  vertical: "|",
  topLeft: "+",
  topRight: "+",
  bottomLeft: "+",
  bottomRight: "+",
  teeLeft: "+",
  teeRight: "+",

  tick: "+",
  cross: "x",
  filled: "*",
  hollow: "o",
  dotted: ".",
  blocked: "/",
  warning: "!",
  bar: "|",

  progressFull: "#",
  progressEmpty: ".",
});

/** The pairs, for the test that asserts each is 1:1 (T2.5). */
export const SUBSTITUTIONS: readonly (readonly [string, string])[] = Object.freeze(
  (Object.keys(UNICODE) as (keyof GlyphSet)[]).map(
    (key) => Object.freeze([UNICODE[key], ASCII[key]]) as readonly [string, string],
  ),
);

/**
 * The set a renderer draws from. Capabilities arrive through the context and
 * never from the environment (I3) — a renderer probing for itself is the bug
 * that draws a table in ASCII beside a sparkline in Unicode.
 */
export function glyphs(caps: Pick<TerminalCapabilities, "unicode">): GlyphSet {
  return caps.unicode === "ascii" ? ASCII : UNICODE;
}

/**
 * The spinner's frames, one per tick (§2). Both sets are four cells' worth of
 * rotation with no width change between frames — a spinner whose frames differ
 * in width shifts everything on its row every 80ms.
 */
export function spinnerFrames(caps: Pick<TerminalCapabilities, "unicode">): readonly string[] {
  return caps.unicode === "ascii"
    ? Object.freeze(["-", "\\", "|", "/"])
    : Object.freeze(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]);
}
