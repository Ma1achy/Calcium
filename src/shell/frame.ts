/**
 * C22 §6 — the frame: chrome, transcript region, prompt.
 *
 * Calcium owns the structure — a one-row header, a footer of the session's
 * declared budget, both fixed and never scrolling — and the app decides what
 * goes in them. **The budget is a number from config, never a value a chrome
 * function returns** (I79, §6k): a per-frame height would make the footer the
 * second thing beside the prompt that pushes the transcript.
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
import {
  DEFAULT_FOOTER_ROWS,
  HEADER_ROWS,
  PROMPT_GUTTER,
  PROMPT_SUBSTITUTION,
} from "./config.js";
import type { TerminalSize } from "../terminal/lifecycle.js";
import type { Block } from "../data/viewmodel/index.js";
import type { Chrome, SessionSnapshot } from "./types.js";

/** What the frame is, before anything paints it. */
export type Composed = Readonly<{
  size: TerminalSize;
  now: number;
  header: readonly Block[];
  footer: readonly Block[];
  /** Rows the footer occupies — the session's budget, carried so `heightsSum` and the painter read one number (I80). */
  footerRows: number;
  /** Where the transcript sits — C16's `region`, `{ top, height }`. */
  region: Readonly<{ top: number; height: number }>;
  /**
   * How big a layer may be — C15's `Region`, `{ width, height }`.
   *
   * **The viewport region, not the terminal** (I28, S01 §3a). Every number
   * C15 returns is relative to this, and the drawer adds `region.top`.
   */
  overlayRegion: Readonly<{ width: number; height: number }>;
  /** Rows the prompt occupies, capped at half the terminal (S01 §3). */
  promptRows: number;
  /** Rows it wanted before the cap; above `promptRows` the prompt windows. */
  promptWanted: number;
}>;

export type ComposeDeps = Readonly<{
  chrome: Chrome;
  session: () => SessionSnapshot;
  /** Copy mode, for the chrome. A frame property, like `size` (C16 §5b). */
  copyMode: () => boolean;
  now: () => number;
  size: () => TerminalSize;
  /** C17's `displayRows`, already gutter-aware. C22 passes the gutter (I13). */
  promptRows: (width: number, gutter: typeof PROMPT_GUTTER) => number;
}>;

export function compose(deps: ComposeDeps): Composed {
  // The two single reads. Everything below takes these values.
  const size = deps.size();
  const now = deps.now();
  // The footer's budget (§6k, I79). `HEADER_ROWS` is a constant of one and this
  // is not, which is the whole of the ruling: a number from config, validated
  // against the size gate, and never asked of the chrome function.
  const footerRows = deps.chrome.footerRows;

  const session = deps.session();
  const ctx = { session, now, columns: size.columns, copyMode: deps.copyMode() };

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
  const height = Math.max(0, size.rows - HEADER_ROWS - footerRows - promptRows);

  return Object.freeze({
    size,
    now,
    header: deps.chrome.header(ctx),
    footer: deps.chrome.footer(ctx),
    footerRows,
    region: Object.freeze({ top: HEADER_ROWS, height }),
    // **The same height as the transcript region** (I28). It was the whole
    // terminal, and nothing could see it: a layer floats above the four regions
    // rather than taking rows, so `heightsSum` holds at every width with every
    // layer misplaced, and no component drew a `Placed` at all. A pushed view
    // laid out at `top: 0, height: rows` covers the header, the prompt and the
    // footer — C15 T4.4's opposite.
    overlayRegion: Object.freeze({ width: size.columns, height }),
    promptRows,
    /** What the prompt asked for, before the cap. Beyond it, S01 §3 windows. */
    promptWanted: wanted,
  });
}

/**
 * The region height a session opens at, for the one moment before a frame exists.
 *
 * `compose` is the authority (I34) and overwrites this on the first render. This
 * is here rather than in the construction root so that the subtraction has one
 * implementation: a caller spelling `size.rows - 3` agrees with this today and
 * silently disagrees the moment the chrome changes, which is the drift C09 I1
 * names one layer down.
 *
 * A one-row prompt, which is what a session opens with — an empty buffer lays out
 * as one row.
 *
 * **`footerRows` is the session's budget** (§6k.2 row 5). Defaulted so the one
 * caller that does not yet pass it still compiles; until it does, the first
 * frame corrects this by `footerRows − 1` rows (I34), which T1.37 measures.
 */
export function initialRegionHeight(size: TerminalSize, footerRows = DEFAULT_FOOTER_ROWS): number {
  return Math.max(0, size.rows - HEADER_ROWS - footerRows - 1);
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
  // **With the budget the frame was composed with** (I80), not a constant: a
  // constant here would hold at every budget while the painter drew a footer of
  // a different height, and the sum would agree with itself.
  return HEADER_ROWS + f.region.height + f.promptRows + f.footerRows === f.size.rows;
}

/**
 * The gutter C22 passes must match the prompt it draws, or `displayRows`
 * disagrees with the rendered height by a row (T4.9).
 *
 * Asserted here rather than only in a test, because the two are declared in one
 * file and read in two — and the failure is a prompt one row off, months later.
 */
export function gutterMatchesPrompt(): boolean {
  // **Both forms, not the one in force** (C22 I52, C09 I22). The prompt is a
  // capability pair and `commandRows` is also the measurer's, so a form of a
  // different width would make `chromeRows` and the composed row disagree about
  // the same entry — and it would do so only on the terminals nobody develops
  // on. Checking the resolved prompt would pass on every machine that has the
  // unicode one, which is every machine this has ever been run on.
  // narrow-ok — `glyphs.ts`'s argument exactly: the two forms of one gutter
  // are compared with each other, and the equality holds under either
  // convention.
  return PROMPT_SUBSTITUTION.every((form) => PROMPT_GUTTER.first === cells(form)); // narrow-ok
}
