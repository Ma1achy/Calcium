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
import type { Glyph } from "../../data/viewmodel/types.js";
import type { TerminalCapabilities } from "../../terminal/capabilities.js";
import { cells } from "../text.js";

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

  // Sort indicators — the active column's header (C11 §4, A01 A.4).
  sortAsc: string;
  sortDesc: string;

  // Progress.
  progressFull: string;
  progressEmpty: string;

  /**
   * The residue marker's lead, on a bounded region (C04 I49).
   *
   * **A slot and never a literal** — F122's rule. The fallback is `~` and not
   * `...`, and T2.5 is what decided it: every pair is 1:1 by cell count, and
   * three dots are three cells where `⋯` is one. That is the same
   * measurement that made the ASCII truncation marker `~` (C04 §5), reached a
   * second time by a rule rather than by an author.
   */
  residue: string;
}>;

const UNICODE: GlyphSet = Object.freeze({
  residue: "\u22ef",
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

  sortAsc: "↑",
  sortDesc: "↓",

  progressFull: "█",
  progressEmpty: "░",
});

const ASCII: GlyphSet = Object.freeze({
  residue: "~",
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

  sortAsc: "^",
  sortDesc: "v",

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

// --- the `Glyph` vocabulary (C04 §5, C09 §4) --------------------------------

/**
 * Both renderings of every glyph a *block* can name.
 *
 * Separate from `GlyphSet` deliberately. `GlyphSet` is the set C09 draws from
 * on its own account — borders, spinner frames, progress bars — and its rôles
 * are internal. This is the vocabulary C04 exposes, and its members are chosen
 * by what the surfaces illustrate rather than by what the renderers happen to
 * need. Merging them would let an internal rôle leak into the block schema, and
 * a schema field is much harder to take back than a private constant.
 *
 * The rôles overlap in places and the characters are shared. That is fine: the
 * two tables agreeing is a property, not a coincidence to be enforced away.
 */
const GLYPH_TABLE: Readonly<Record<Glyph, readonly [unicode: string, ascii: string]>> =
  Object.freeze({
    ok: ["✓", "+"],
    warn: ["▲", "!"],
    error: ["✗", "x"],
    info: ["ℹ", "i"],
    pending: ["◌", "."],
    working: ["◐", "%"],
    running: ["●", "*"],
    queued: ["○", "o"],
    cancelled: ["⊘", "/"],
    expand: ["▸", ">"],
    collapse: ["▾", "v"],
    live: ["▌", "|"],
    bullet: ["•", "-"],
  });

/** The pairs, for the test that asserts each is 1:1 by cell count (I5). */
export const GLYPH_SUBSTITUTIONS: readonly (readonly [string, string])[] = Object.freeze(
  Object.values(GLYPH_TABLE).map((pair) => Object.freeze([pair[0], pair[1]]) as readonly [string, string]),
);

export const GLYPH_TOKENS: readonly Glyph[] = Object.freeze(
  Object.keys(GLYPH_TABLE) as Glyph[],
);

/**
 * A block's glyph slot, resolved against capabilities. The single place either
 * character enters a frame.
 */
export function glyphFor(token: Glyph, caps: Pick<TerminalCapabilities, "unicode">): string {
  const pair = GLYPH_TABLE[token];
  return caps.unicode === "ascii" ? pair[1] : pair[0];
}

/**
 * The cells a resolved glyph occupies, without needing capabilities.
 *
 * This is what the 1:1 rule is *for*. `measure` receives width and no
 * capability record (C04 §5), so it can only be correct if both renderings are
 * the same width — and T2.5 asserts that over the whole table rather than
 * trusting the two columns above to stay in step.
 */
export function glyphCells(token: Glyph): number {
  // narrow-ok — the two renderings of one slot are compared against each
  // other, and the comparison holds under either convention: an ambiguous
  // pair is 1:1 at narrow and 2:2 at wide. Passing a capability here would
  // make a property of the table depend on the terminal reading it.
  return cells(GLYPH_TABLE[token][0]); // narrow-ok
}
