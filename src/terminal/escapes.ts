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

/**
 * DECSET 2026 — synchronised update. C03's, and the only mode outside C01's set.
 *
 * The pair is *transactional*, not stateful: it opens and closes around one
 * write and never persists across one. That is the whole reason C03 may emit it
 * without contending with C01's ownership of terminal mode state — there is no
 * state to own. `held` never contains it, and release never has to undo it.
 */
export const SYNC_UPDATE = mode("\x1b[?2026h", "\x1b[?2026l");

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
export type SgrStyle = Readonly<{
  colour?:
    | Readonly<{ kind: "rgb"; hex: string }>
    | Readonly<{ kind: "ansi256"; index: number }>
    | Readonly<{ kind: "ansi16"; index: number }>;
  bold?: boolean;
  dim?: boolean;
  inverse?: boolean;
  underline?: boolean;
}>;

/** Closes every attribute `sgr` can open. One reset, not five selective ones. */
export const SGR_RESET = "\x1b[0m";

/**
 * A style as the sequence that turns it on.
 *
 * **The depth comes from the tag, never from the format** (C10 I18). A hex
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

  const colour = style.colour;
  if (colour !== undefined) {
    switch (colour.kind) {
      case "rgb": {
        const [r, g, b] = rgbOf(colour.hex);
        params.push(38, 2, r, g, b);
        break;
      }
      case "ansi256":
        params.push(38, 5, clampIndex(colour.index, 255));
        break;
      case "ansi16": {
        // 0–7 are 30–37; 8–15 are the bright set, 90–97. Not `38;5;n` with a
        // low index: a terminal at four-bit depth is one that does not
        // necessarily understand the 256-colour form at all.
        const i = clampIndex(colour.index, 15);
        params.push(i < 8 ? 30 + i : 90 + (i - 8));
        break;
      }
    }
  }

  return params.length === 0 ? "" : `\x1b[${params.join(";")}m`;
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
