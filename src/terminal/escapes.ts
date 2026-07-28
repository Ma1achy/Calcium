/**
 * Every escape-sequence literal in the codebase (C01 I1, A03 SS14, SS15).
 *
 * Shared utility. No functions, no state — a caller that needed logic here
 * would be a caller doing something C01 should be doing.
 *
 * **Each mode is an enter/leave pair.** A caller cannot reach for half of one,
 * and the inverse is written beside the thing it inverts rather than derived at
 * the call site — which is what makes C01 I6 (release emits the inverse of
 * `held`) a lookup rather than a second implementation that can disagree.
 *
 * Ownership of the *modes* is separate from ownership of the *digits*: the
 * literals live here, and A03 MG20 asserts which component may import each one.
 */

export type Mode = Readonly<{ enter: string; leave: string }>;

const mode = (enter: string, leave: string): Mode => Object.freeze({ enter, leave });

/** DECSET 1049 — alternate screen buffer. The only hard capability (A01 D28). */
export const ALT_SCREEN = mode("\x1b[?1049h", "\x1b[?1049l");

/** DECSET 25 — cursor visibility. Inverted sense: entering *hides*. */
export const CURSOR = mode("\x1b[?25l", "\x1b[?25h");

/** DECSET 2004 — bracketed paste. */
export const BRACKET_PASTE = mode("\x1b[?2004h", "\x1b[?2004l");

/**
 * DECSET 1002 + 1006 — button-event tracking and SGR extended coordinates.
 *
 * One key holding two sequences, because they are acquired and released as a
 * unit: 1002 without 1006 reports coordinates that break past column 223.
 * The leave order is the reverse of the enter order — I6 applied inside a
 * single key rather than only across `held`.
 */
export const MOUSE = mode("\x1b[?1002h\x1b[?1006h", "\x1b[?1006l\x1b[?1002l");
