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
  /** Rows the prompt occupies, capped at half the terminal (S01 §3). */
  promptRows: number;
  /** Rows it wanted before the cap; above `promptRows` the prompt windows. */
  promptWanted: number;
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

  // **The prompt is capped at half the terminal** (S01 §3). Pasting two hundred
  // lines is a real thing people do (C17 T5.2), and an uncapped prompt consumes
  // the whole frame and leaves the viewport at zero — the transcript vanishes
  // while you are typing, which is the moment you most want it.
  const wanted = Math.max(1, deps.promptRows(size.columns, PROMPT_GUTTER));
  const promptRows = Math.max(1, Math.min(wanted, Math.floor(size.rows / 2)));

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
    /** What the prompt asked for, before the cap. Beyond it, S01 §3 windows. */
    promptWanted: wanted,
  });
}

/**
 * S01 §3's sum, checked **before any output is written**.
 *
 * The four regions must total exactly `rows`. One too many and the frame
 * scrolls the alternate screen — the failure that corrupts state the
 * application can no longer see or correct — and one too few leaves a row of
 * the previous frame showing through.
 *
 * Returned rather than thrown: a frame that cannot be composed coherently is
 * still better than a crash mid-session, and the caller draws the fallback.
 * The clamps above mean this cannot fail today, which is exactly why it is
 * asserted — a clamp is a fact about the current arithmetic, and this is a
 * claim about the frame.
 */
export function heightsSum(f: Composed): boolean {
  return HEADER_ROWS + f.region.height + f.promptRows + FOOTER_ROWS === f.size.rows;
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
