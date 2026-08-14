/**
 * Every escape-sequence literal in the codebase (C01 I1, A03 SS14, SS15).
 *
 * Shared utility, and **no state** — a caller that needed state here would be a
 * caller doing something C01 should be doing. It holds functions where a
 * sequence takes a parameter (`cursorTo`, `sgr`, and the setting below); an
 * earlier version of this sentence said *no functions* and had been false since
 * `cursorTo` landed.
 *
 * **Three categories, and the difference decides where release lives.**
 *
 *   - A **mode** is an enter/leave pair. A caller cannot reach for half of one,
 *     and the inverse is written beside the thing it inverts rather than derived
 *     at the call site — which is what makes C01 I6 (release emits the inverse
 *     of `held`) a lookup rather than a second implementation that can disagree.
 *   - An **SGR** sequence holds nothing: no inverse to emit at release, never in
 *     `held`, and MG20 has nothing to say about it. See below.
 *   - A **setting** has persistent state like a mode and no inverse like an SGR
 *     sequence. **Its undo is a third value, not the negation of anything**, so
 *     writing one as a `mode()` would make `held` and I6 false about the same
 *     bytes: release would emit a *leave* that is really *set to default*, and
 *     those are different claims (C01 I20).
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

/**
 * DECSET 2026 — synchronised update. C03's, and the only mode outside C01's set.
 *
 * The pair is *transactional*, not stateful: it opens and closes around one
 * write and never persists across one. That is the whole reason C03 may emit it
 * without contending with C01's ownership of terminal mode state — there is no
 * state to own. `held` never contains it, and release never has to undo it.
 */
export const SYNC_UPDATE = mode("\x1b[?2026h", "\x1b[?2026l");

// --- settings ---------------------------------------------------------------

/** The three shapes `DECSCUSR` can name (C01 I20, C22 §6f). */
export type CursorShape = "block" | "underline" | "beam";

/**
 * A resolved cursor style.
 *
 * **Shape and blink are one wire parameter, not two axes**, which is the fact
 * the walk turned on: `CSI Ps SP q` encodes both, so *make the current shape
 * steady* is unsayable and every blink transition re-emits the whole style. The
 * type carries the pair for that reason rather than for convenience.
 */
export type CursorStyle = Readonly<{ shape: CursorShape; blink: boolean }>;

/** `DECSCUSR`'s parameter per shape. The digits live here, as SS15 requires. */
const SHAPE_CODE: Readonly<Record<CursorShape, readonly [steady: number, blinking: number]>> =
  Object.freeze({
    block: Object.freeze([2, 1] as const),
    underline: Object.freeze([4, 3] as const),
    beam: Object.freeze([6, 5] as const),
  });

/**
 * `DECSCUSR` — the cursor's shape, and the file's one **setting**.
 *
 * `reset` is `0`, which is the terminal's **configured** default and therefore
 * the user's own setting — not the negation of any value we wrote, and that is
 * exactly why this is not a `mode()`. Nothing can un-write a `DECSCUSR`: *emit
 * nothing* is reachable only before the first emission, so the rule that governs
 * it is about a transition rather than a value, and C01 holds the record that
 * makes that expressible (C01 I20, C22 I63).
 */
export const CURSOR_SHAPE = Object.freeze({
  set: (style: CursorStyle): string =>
    `\x1b[${String(SHAPE_CODE[style.shape][style.blink ? 1 : 0])} q`,
  reset: "\x1b[0 q",
});

// --- SGR ------------------------------------------------------------------
//
// Not a mode. An SGR sequence styles one run of text and holds nothing: it has
// no inverse to emit at release, it never enters C01's `held` set, and MG20 —
// which assigns each *mode* export to exactly one owning component — has
// nothing to say about it (C01 I1).
//
// It lives here because I1 puts escape literals here and this is one. Its only
// caller is C09 §3, which is the first runtime edge from L1 to L0-terminal.

/**
 * The parameters of one SGR sequence, in the order they are written.
 *
 * Structural rather than an import of C10's `Style`: `terminal/` is L0 and
 * `presentation/theme/` is L1, so the type cannot come from there without the
 * edge running the wrong way. C09 passes a `Style`, which satisfies this shape.
 */
export type SgrColour =
  | Readonly<{ kind: "rgb"; hex: string }>
  | Readonly<{ kind: "ansi256"; index: number }>
  | Readonly<{ kind: "ansi16"; index: number }>;

export type SgrStyle = Readonly<{
  colour?: SgrColour;
  /**
   * The second colour channel (C10 §4a). Same three tags, a different parameter
   * base — 48 rather than 38, and 40/100 rather than 30/90.
   */
  background?: SgrColour;
  bold?: boolean;
  dim?: boolean;
  inverse?: boolean;
  underline?: boolean;
}>;

/** Closes every attribute `sgr` can open. One reset, not five selective ones. */
/**
 * Cursor to row 1, column 1.
 *
 * Here rather than in the frame path because **every escape literal lives in
 * this file** (A03 SS14, C01 I1) — the rule has no exception for "obvious" ones,
 * and `\x1b[H` looks obvious in the same way `\x1b[2J` does, which is the one
 * that would clear the scrollback.
 *
 * Not paired with a clear: the frame writes exactly `rows` full-width lines, so
 * every cell is overwritten and a clear would only add a flash.
 */
export const CURSOR_HOME = "\x1b[H";

/**
 * Cursor to a 0-based row and column.
 *
 * `CURSOR_HOME` generalised, and here for its reason: every escape literal
 * lives in this file. CUP is 1-based on the wire and every coordinate above
 * this line is 0-based, so the conversion is here rather than at each call —
 * one place to be off by one, and it is the place with the test.
 *
 * Clamped at the origin rather than trusting the caller: a negative row reaches
 * the terminal as `\x1b[0;3H`, which most terminals read as row 1 and some read
 * as an error, and the difference only shows on someone else's machine.
 */
export const cursorTo = (row: number, col: number): string =>
  `\x1b[${String(Math.max(0, Math.floor(row)) + 1)};${String(Math.max(0, Math.floor(col)) + 1)}H`;

/**
 * Every SGR sequence, for measuring a line that already carries them.
 *
 * Here for SS14's reason and not as a convenience: the pattern contains the
 * escape byte, so writing it in `presentation/text.ts` puts an escape literal
 * in a second file — which is the rule C01 I1 exists to keep at one. C09 owns
 * *what display width means*; this file owns *what an escape looks like*, and
 * `displayCells` is the join.
 *
 * A fresh regex per call rather than a shared one: `g` carries `lastIndex`
 * across calls, and a shared instance walked by two callers skips matches for
 * whichever runs second. That is a defect that appears only under interleaving,
 * which is the worst kind to find in a frame path.
 */
export const sgrPattern = (): RegExp => /\x1b\[[0-9;]*m/g;

export const SGR_RESET = "\x1b[0m";

/**
 * A style as the sequence that turns it on.
 *
 * **The depth comes from the tag, never from the format** (C10 I24). A hex
 * string is a hex string whether the terminal has twenty-four bits or four, so a
 * writer that inspects the value instead of the tag is a writer that eventually
 * emits truecolour to a sixteen-colour terminal. The switch below is the whole
 * reason the tag exists, and it is the only place in the tree that reads it.
 *
 * Returns `""` for a style with nothing set, so a caller can concatenate
 * unconditionally without emitting a reset for unstyled text.
 */
export function sgr(style: SgrStyle): string {
  const params: number[] = [];

  if (style.bold === true) params.push(1);
  if (style.dim === true) params.push(2);
  if (style.underline === true) params.push(4);
  if (style.inverse === true) params.push(7);

  if (style.colour !== undefined) params.push(...channel(style.colour, "fg"));
  if (style.background !== undefined) params.push(...channel(style.background, "bg"));

  return params.length === 0 ? "" : `\x1b[${params.join(";")}m`;
}

/**
 * One colour channel's parameters. Foreground and background differ only in
 * their bases, and writing them once is what stops the two drifting — the
 * failure being a background emitted as `38` and painting the text instead of
 * behind it, which looks like a theme bug rather than a base off by ten.
 */
function channel(colour: SgrColour, where: "fg" | "bg"): readonly number[] {
  const extended = where === "fg" ? 38 : 48;

  switch (colour.kind) {
    case "rgb": {
      const [r, g, b] = rgbOf(colour.hex);
      return [extended, 2, r, g, b];
    }
    case "ansi256":
      return [extended, 5, clampIndex(colour.index, 255)];
    case "ansi16": {
      // 0–7 are 30–37 (40–47 behind); 8–15 are the bright set, 90–97 (100–107).
      // Not `38;5;n` with a low index: a terminal at four-bit depth is one that
      // does not necessarily understand the 256-colour form at all.
      const i = clampIndex(colour.index, 15);
      const [plain, bright] = where === "fg" ? [30, 90] : [40, 100];
      return [i < 8 ? plain + i : bright + (i - 8)];
    }
  }
}

/** `#rrggbb` or `#rgb` to its three components. Malformed input reads as black. */
function rgbOf(hex: string): readonly [number, number, number] {
  const h = hex.startsWith("#") ? hex.slice(1) : hex;
  const full =
    h.length === 3 ? `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}` : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return [0, 0, 0];
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

function clampIndex(index: number, max: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.min(max, Math.max(0, Math.floor(index)));
}
