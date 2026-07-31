/**
 * C22 §6 — the frame: chrome, transcript region, prompt.
 *
 * `tui-kit` owns the structure — one chrome row each, fixed, never scrolling —
 * and the app decides what goes in them.
 *
 * **Two values are sampled exactly once per frame, and both have a reason with
 * a failure attached.**
 *
 *   - `now`, so header and footer cannot straddle a second boundary and print
 *     two times in one frame (I13a). C01 I12's rule, one layer up.
 *   - `columns`, because a frame composed against two widths wraps, and a wrap
 *     scrolls the alternate screen — the one failure that corrupts state the
 *     application cannot see (C01 §5). C01 §5 says the per-frame snapshot
 *     belongs with whoever writes the frame path. This is that path, and
 *     `size()` is the accessor it asked for.
 *
 * Both are read at the top of `compose` and passed down. Nothing below re-reads
 * either, which is what `ChromeContext` carrying values rather than functions
 * makes structural.
 */

import { cells } from "../presentation/text.js";
import { PROMPT, PROMPT_GUTTER } from "./config.js";
import type { TerminalSize } from "../terminal/lifecycle.js";
import type { Block } from "../data/viewmodel/index.js";
import type { ChromeFn, SessionSnapshot } from "./types.js";

/** What the frame is, before anything paints it. */
export type Composed = Readonly<{
  size: TerminalSize;
  now: number;
  header: readonly Block[];
  footer: readonly Block[];
  /** Where the transcript sits — C16's `region`, `{ top, height }`. */
  region: Readonly<{ top: number; height: number }>;
  /** How big a layer may be — C15's `Region`, `{ width, height }`. */
  overlayRegion: Readonly<{ width: number; height: number }>;
  /** Rows the prompt occupies, from C17's single walk (C17 §2). */
  promptRows: number;
}>;

export type ComposeDeps = Readonly<{
  chrome: Readonly<{ header: ChromeFn; footer: ChromeFn }>;
  session: () => SessionSnapshot;
  now: () => number;
  size: () => TerminalSize;
  /** C17's `displayRows`, already gutter-aware. C22 passes the gutter (I13). */
  promptRows: (width: number, gutter: typeof PROMPT_GUTTER) => number;
}>;

/**
 * One chrome row top, one bottom (§6). Named rather than inlined so the
 * arithmetic below reads as a subtraction of known parts.
 */
const HEADER_ROWS = 1;
const FOOTER_ROWS = 1;

export function compose(deps: ComposeDeps): Composed {
  // The two single reads. Everything below takes these values.
  const size = deps.size();
  const now = deps.now();

  const session = deps.session();
  const ctx = { session, now, columns: size.columns };

  const promptRows = Math.max(1, deps.promptRows(size.columns, PROMPT_GUTTER));

  // Clamped at zero: a terminal too short for chrome plus a prompt gets a
  // transcript of no rows rather than a negative height that would read as an
  // enormous one after a subtraction somewhere downstream. The size gate
  // normally prevents this, and normally is not a guarantee — a resize can
  // arrive between the gate and the frame.
  const height = Math.max(0, size.rows - HEADER_ROWS - FOOTER_ROWS - promptRows);

  return Object.freeze({
    size,
    now,
    header: deps.chrome.header(ctx),
    footer: deps.chrome.footer(ctx),
    region: Object.freeze({ top: HEADER_ROWS, height }),
    overlayRegion: Object.freeze({ width: size.columns, height: size.rows }),
    promptRows,
  });
}

/** The prompt's rendered first-row prefix. C17 holds no geometry (C17 I10). */
export function promptPrefix(): string {
  return PROMPT;
}

/**
 * The gutter C22 passes must match the prompt it draws, or `displayRows`
 * disagrees with the rendered height by a row (T4.9).
 *
 * Asserted here rather than only in a test, because the two are declared in one
 * file and read in two — and the failure is a prompt one row off, months later.
 */
export function gutterMatchesPrompt(): boolean {
  return PROMPT_GUTTER.first === cells(PROMPT);
}
