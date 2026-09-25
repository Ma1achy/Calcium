/**
 * C22 §6 — the frame: chrome, transcript region, prompt.
 *
 * Calcium owns the structure — a one-row header with a rule under it, two rules bounding the
 * prompt, a footer as tall as its blocks, all fixed and never scrolling — and
 * the app decides what goes in the header and the footer. **The footer's
 * height is measured from what the chrome function returns** (I82, §6l), at
 * the frame's width and through the same `measureSequence` C14 uses, so the
 * height and the rows are one measurement. §6k's budget is retired; the
 * transcript is anchored at its tail exactly as it is when the prompt grows,
 * and a footer that grows by a row moves it the same way (§6l.3 row 1).
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

import { NO_SPAN } from "../data/viewmodel/index.js";
import type { Probe } from "../data/viewmodel/index.js";
import { cells, stripControl } from "../presentation/text.js";
import {
  DEFAULT_FOOTER_ROWS,
  HEADER_ROWS,
  HEADER_RULE_ROWS,
  MAX_FOOTER_ROWS,
  PROMPT_GUTTER,
  PROMPT_SUBSTITUTION,
  regionWidth,
  RULE_ROWS,
} from "./config.js";
import type { TerminalSize } from "../terminal/lifecycle.js";
import type { TerminalCapabilities } from "../terminal/capabilities.js";
import type { Block } from "../data/viewmodel/index.js";
import type { Chrome, CopyState, Label, SessionSnapshot } from "./types.js";
import type { OwnerRung } from "../interaction/router/types.js";

/** What the frame is, before anything paints it. */
export type Composed = Readonly<{
  size: TerminalSize;
  now: number;
  header: readonly Block[];
  footer: readonly Block[];
  /**
   * The application's label for the prompt's upper rule, or `null` (I111).
   *
   * **Resolved with the chrome and carried on the frame**, for the reason
   * `footerRows` is: the painter reads one value and the composer reads it
   * once. A label computed at paint time would be a second call into the
   * application from a place that is meant to be pure drawing.
   */
  label: Label | null;
  /**
   * Rows the footer occupies — its blocks' measured height, clamped to
   * `MAX_FOOTER_ROWS`, zero for `[]` (I82). Carried so `heightsSum` and the
   * painter read one number (I80).
   */
  footerRows: number;
  /**
   * Where the transcript sits — C16's `region`, and the width it is drawn at.
   *
   * `width` is the terminal's less `CONTENT_MARGIN_R` (I109): the transcript is
   * resized, measured and rendered at it, and the paint pads what comes back to
   * `size.columns`. C16 reads `top` and `height` and nothing else.
   */
  region: Readonly<{ top: number; height: number; width: number }>;
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
  /**
   * C28's seam (C28 I30, C28 I39). Absent is not recording, and that is the usual case.
   *
   * Here so the `chrome` span brackets **the app's own header and footer
   * builders**, which run inside the frame and were being attributed to
   * Calcium — the one phase in the breakdown whose cost is not this
   * framework's.
   */
  probe?: Probe;
  session: () => SessionSnapshot;
  /**
   * Who owns the keyboard, for the chrome's owner line (§103, R-KEY-004). A
   * frame property, like `size` (C16 §5b).
   *
   * **This was `nativeSelection: () => boolean` and the widening is the ladder
   * arriving.** That member's own argument — *a reader whose mouse has gone
   * dead with nothing on screen saying why has been given a bug* — is §103's
   * *AN OWNER YOU CANNOT SEE IS AN OWNER YOU WILL FIGHT*, stated for one rung
   * of six. Native selection was not the special case; it was the only rung anyone
   * had reached the end of that argument for.
   */
  owner: () => OwnerRung | null;
  /** C16 I44 — whether that owner is still refusing its first activation. */
  ownerArmed: () => boolean;
  /**
   * Entries held out of the frame by copy mode (C14 I34).
   *
   * **Optional, and absent is *nothing held*** — the same terms `ChromeContext`
   * states it on. A composition with no session graph behind it has no hold to
   * report, and a required member here would make every harness that composes a
   * frame declare a zero it cannot be wrong about.
   */
  bufferedEntries?: () => number;
  /** C22 I116 — the live toast's text, or undefined. Optional: absent is *none live*. */
  toast?: () => string | undefined;
  /**
   * The copy rung's mode and size (C14 I55). Optional for `bufferedEntries`'
   * reason: a composition with no session graph has no mode to report.
   */
  copy?: () => CopyState | undefined;
  /** C02's resolved record, for the chrome's marks (A03 SS47). `null` before
   * the session graph exists, which is also when there is no owner. */
  capabilities: () => TerminalCapabilities | null;
  /**
   * C24 I32 — the previous frame's cost, for the chrome.
   *
   * Optional on the same terms as `probe`: a caller with no profiler has no
   * figure, and `undefined` is the value the invariant names for that case
   * rather than a stand-in for one. A row asserting the absence must therefore
   * drive a real session at a real tier, because a fixture that omits this dep
   * answers `undefined` whatever the tier is.
   */
  lastFrame?: () => number | undefined;
  now: () => number;
  size: () => TerminalSize;
  /** C17's `displayRows`, already gutter-aware. C22 passes the gutter (I13). */
  promptRows: (width: number, gutter: typeof PROMPT_GUTTER) => number;
  /**
   * C09's `measureSequence`, for the footer's height (I82). **The same function
   * C14 measures entries with**, so the footer's rows and the footer's height
   * cannot part company at a wrap the way two measurers would.
   */
  measureSequence: (blocks: readonly Block[], width: number) => number;
}>;

/**
 * The app's header and footer, bracketed (C28 I39).
 *
 * **Both under one span**, because the question the phase answers is *how much
 * of this frame is the application's chrome* and two spans firing once each is
 * the same answer written so that nobody adds them up.
 */
function chromeOf(
  deps: ComposeDeps,
  ctx: Parameters<Chrome["header"]>[0],
): { header: readonly Block[]; footer: readonly Block[]; label: Label | null } {
  using _s = deps.probe?.span("chrome") ?? NO_SPAN;
  // **The label is under the same span and for the same reason** (C28 I39):
  // the question is *how much of this frame is the application's chrome*, and a
  // third span firing once would be the same answer written so nobody adds it up.
  const raw = deps.chrome.label?.(ctx) ?? null;
  // A string that strips to nothing is no label — the caller supplying `""` or
  // a line of control characters means the same thing as supplying nothing, and
  // two spellings of absence is how a slot acquires a blank it draws.
  //
  // **Normalised to one shape here** (I114): a caller may return the bare string
  // that shipped or a record naming a hue, and the painter reads one thing. The
  // stripping is the text's either way — a hue name is not drawn, so it is not
  // a channel a control character could travel on.
  const text = raw === null ? null : stripControl(typeof raw === "string" ? raw : raw.text).trim() || null;
  const hue = raw === null || typeof raw === "string" ? undefined : raw.hue;
  const label: Label | null = text === null ? null : hue === undefined ? { text } : { text, hue };
  return { header: deps.chrome.header(ctx), footer: deps.chrome.footer(ctx), label };
}

export function compose(deps: ComposeDeps): Composed {
  // The two single reads. Everything below takes these values.
  const size = deps.size();
  const now = deps.now();
  const session = deps.session();
  const lastFrame = deps.lastFrame?.();
  const capabilities = deps.capabilities();
  const copy = deps.copy?.();
  const toast = deps.toast?.();
  const ctx = {
    session,
    now,
    columns: size.columns,
    owner: deps.owner(),
    ownerArmed: deps.ownerArmed(),
    bufferedEntries: deps.bufferedEntries?.() ?? 0,
    // Spread rather than assigned, so `exactOptionalPropertyTypes` sees the
    // member as absent rather than present-and-undefined: a chrome doing
    // `"lastFrame" in ctx` gets the same answer as one doing `!== undefined`.
    ...(lastFrame === undefined ? {} : { lastFrame }),
    ...(capabilities === null ? {} : { capabilities }),
    ...(copy === undefined ? {} : { copy }),
    ...(toast === undefined ? {} : { toast }),
  };

  const { header, footer, label } = chromeOf(deps, ctx);
  // **The footer is its content** (I82, §6l.4 B): measured at this frame's
  // width, clamped to the maximum the size gate can hold, and zero for `[]` —
  // the lower rule is the prompt's edge, not the footer's head, so a frame
  // with no footer ends on the rule rather than on a blank row (§6l.2 row 3).
  const footerRows =
    footer.length === 0 ? 0 : Math.min(deps.measureSequence(footer, size.columns), MAX_FOOTER_ROWS);

  // **The prompt is capped at half the terminal** (S01 §3). Pasting two hundred
  // lines is a real thing people do (C17 T5.2), and an uncapped prompt consumes
  // the whole frame and leaves the viewport at zero — the transcript vanishes
  // while you are typing, which is the moment you most want it.
  // **The region's width, not the terminal's** (I109, §6l.9 row 4). A typed
  // line is content, and the gutter is a left inset that says nothing about the
  // right edge — so the body is `region.width − PROMPT_GUTTER.first`. Taken
  // before the height, because `promptRows` is what the height subtracts.
  const content = regionWidth(size.columns);
  const wanted = Math.max(1, deps.promptRows(content, PROMPT_GUTTER));
  const promptRows = Math.max(1, Math.min(wanted, Math.floor(size.rows / 2)));

  // Clamped at zero: a terminal too short for chrome plus a prompt gets a
  // transcript of no rows rather than a negative height that would read as an
  // enormous one after a subtraction somewhere downstream. The size gate
  // normally prevents this, and normally is not a guarantee — a resize can
  // arrive between the gate and the frame.
  const height = Math.max(0, size.rows - HEADER_ROWS - HEADER_RULE_ROWS - RULE_ROWS - footerRows - promptRows);

  return Object.freeze({
    size,
    now,
    header,
    footer,
    label,
    footerRows,
    // Below the header and its rule (I87, §6l.7), and one column narrower than
    // the terminal (I109, §6l.9): the transcript is measured and drawn at this,
    // while the paint pads every row to `size.columns`. The frame is the
    // terminal's width and the *document* is narrower — the one distinction a
    // composer can read the wrong side of.
    region: Object.freeze({ top: HEADER_ROWS + HEADER_RULE_ROWS, height, width: content }),
    // **The same height and now the same width as the transcript region** (I28,
    // I109 · §6l.9 row 5). A layer's content is content: `place.ts` centres at
    // `⌊(region.width − width) / 2⌋` and clamps to it, so a centred layer moves
    // by nought or one column and a layer declaring no width is one cell
    // narrower — right for the reason the transcript's rows are. It was the whole
    // terminal, and nothing could see it: a layer floats above the four regions
    // rather than taking rows, so `heightsSum` holds at every width with every
    // layer misplaced, and no component drew a `Placed` at all. A pushed view
    // laid out at `top: 0, height: rows` covers the header, the prompt and the
    // footer — C15 T4.4's opposite.
    overlayRegion: Object.freeze({ width: content, height }),
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
 * **The footer is guessed at `DEFAULT_FOOTER_ROWS`** (§6l.2 row 8): no
 * `ChromeFn` has run yet, so nothing has been measured. The first frame
 * corrects this by `f − 1` rows (I34, §6l.3 row 3), which T1.37 measures — and
 * the default footer is one row, so a default session is corrected by nothing.
 */
export function initialRegionHeight(size: TerminalSize): number {
  return Math.max(0, size.rows - HEADER_ROWS - HEADER_RULE_ROWS - RULE_ROWS - DEFAULT_FOOTER_ROWS - 1);
}

/**
 * The row the prompt's first line is painted on: below the header, the region
 * and the upper rule (I81). **One implementation**, read by the painter's
 * cursor and by anything else that has to name the prompt's row — a caller
 * spelling `top + height` agrees with this today and puts the cursor on the
 * rule the day the rule exists, which is the day this was written.
 */
export function promptTop(f: Composed): number {
  return f.region.top + f.region.height + RULE_ROWS / 2;
}

/**
 * S01 §3's sum, checked **before any output is written**.
 *
 * The header, its rule, the region, the prompt's two rules, the prompt and the footer must total
 * exactly `rows`. One too many and the frame
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
  return (
    HEADER_ROWS + HEADER_RULE_ROWS + f.region.height + RULE_ROWS + f.promptRows + f.footerRows === f.size.rows
  );
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
