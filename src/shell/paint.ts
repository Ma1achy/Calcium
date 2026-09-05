/**
 * C22 §6 — the frame, as rows.
 *
 * `compose` decides the four regions; this turns them into exactly `rows`
 * strings. It is the last unbuilt piece of C22 and the one S01 §2 and C03 T5.4
 * were waiting for.
 *
 * **Two rules, and each has a failure that corrupts state the application
 * cannot see.**
 *
 * **1. One width per frame.** The size is read once by `compose` and every line
 * below is built from `frame.size.columns`. Nothing here reads a stream, and
 * nothing calls `size()` again. `docs/notes/resize-and-compositor.md` names this
 * the worst failure mode in the system: compose at 100, have the terminal become
 * 80 before the write lands, and 100-cell lines go into 80 columns. The terminal
 * wraps them, wrapping scrolls the alternate screen, and everything below is
 * desynchronised.
 *
 * A resize arriving mid-compose is then the *next* frame's problem, which is
 * correct — C03 sets `contaminated` eagerly at commit time, so the next frame is
 * a full repaint. A frame composed at a width that was true when it started is
 * coherent even if stale; a frame composed at two widths is coherent at neither.
 *
 * **2. The heights sum to `rows`, checked before any output.** S01 §3's
 * arithmetic, asserted rather than assumed. One row too many scrolls the
 * alternate screen; one too few leaves the previous frame showing through.
 *
 * Both are the fallback's zero-row defect one layer up: writing one line more
 * than the terminal has.
 */

import { renderSequenceToLines } from "../presentation/render-lines.js";
import type { RenderScratch } from "../presentation/blocks/types.js";
import { cells, hardWrapCells, sliceCells } from "../presentation/text.js";
import { background, paint as paintSpans, tone } from "../presentation/blocks/paint.js";
import { SGR_RESET, sgr, toTerminalDefault } from "../terminal/escapes.js";
import { promptFor, PROMPT_GUTTER } from "./config.js";
import { composite } from "./composite.js";
import { exact, FrameError } from "./frame-error.js";
import { gutterMatchesPrompt, heightsSum, type Composed } from "./frame.js";
import type { Block } from "../data/viewmodel/index.js";
import type { Placed } from "../viewport/overlay/index.js";
import type { Cell, CellSpan } from "../interaction/editor/index.js";
import type { BlockRegistry } from "../presentation/blocks/index.js";
import { resolveBase } from "../presentation/theme/index.js";
import type { ResolvedTheme } from "../presentation/theme/index.js";
import type { Style } from "../presentation/theme/index.js";
import type { TerminalCapabilities } from "../terminal/capabilities.js";
import { spinnerFrames } from "../presentation/blocks/index.js";

export type PaintDeps = Readonly<{
  registry: BlockRegistry;
  theme: ResolvedTheme;
  capabilities: TerminalCapabilities;
  /** The visible transcript rows, already selected by C14 at this width. */
  transcriptRows: () => readonly string[];
  /** C17's display rows, already wrapped and gutter-aware (C17 §2, I18). */
  promptRows: () => readonly string[];
  /**
   * C15's boxes, placed against the frame's own `overlayRegion` (C22 I28).
   *
   * A function rather than a value for the same reason the two above are, and
   * with the same rule: it is answered from the composed frame's region, never
   * from a fresh one. Two regions for one frame is the two-records defect S01
   * §3 already produced once.
   */
  overlays: () => readonly Placed[];
  /** C17's cursor as a cell in the prompt's own layout (C17 §2). */
  promptCursor: () => Cell;
  /** The session's render scratch (C12 I107), for a 3D plot inside a layer. */
  scratch?: RenderScratch;
  /**
   * The selection's cells, in the prompt's own layout (entry 23, C17 I21).
   *
   * **Cells to style, never cells to add** — I17 with C11 I9. The wash is a
   * style over the same grid, exactly as the patch renderer's added and removed
   * lines already are, so `measure` never sees it and `promptRows` is the same
   * number with a region and without one. **A row of chrome — a marker line, a
   * bracket, a status row — is forbidden by the same invariant**, and that is
   * the constraint at every step rather than a note about this one.
   *
   * Empty when there is no region, so the common case costs one array.
   */
  promptSelection: () => readonly CellSpan[];
  /** Whether the prompt is where keys are going — C16's derived focus. */
  promptFocused: () => boolean;
  /**
   * C19's `spinning`, read **fresh on every paint** (I38).
   *
   * A function rather than a value, and for a sharper reason than the three
   * above: this one changes with the clock rather than with the frame. A value
   * captured when the request started can never become true, which is one of
   * the two wrong implementations I38 names — and it is the one that looks
   * exactly like a correct read of a source that answered quickly.
   */
  spinning: () => boolean;
  /**
   * C19's ghost text, read **fresh on every paint** (I50).
   *
   * The same rule as `spinning` above and for the same reason: the suggestion
   * changes with what is typed, and a value captured when it was computed shows
   * a suggestion for a prefix the user has moved past.
   *
   * **It had no reader at all before this.** `ghost()` was called once in the
   * whole tree — on the accept path, which *inserts* it — so it was computed on
   * every keystroke and invisible until the key that consumed it. C22 T4.7 has
   * claimed the compositing since C22 was written.
   */
  ghost: () => string | null;
  /**
   * Whether the user has turned the theme's background off for this invocation
   * (C22 I66, C10 I25).
   *
   * A function, read fresh at paint for `spinning`'s reason rather than for a
   * new one: `/theme light --no-bg` changes it between frames, and a value
   * captured at construction is the setting the session opened with.
   */
  suppressBackground: () => boolean;
}>;

/**
 * The elision marker S01 §3 puts on a windowed prompt's edges.
 *
 * **`collapseText` already owned this pair and this file declared a second copy
 * of the unicode half** (F122). It is a whole row of its own, squared off by
 * `exact`, so the ASCII form's three cells cost nothing — which is why this is a
 * pair rather than a `Glyph`: C09 I5 requires 1:1 by cell count of the
 * vocabulary, and `...` is not that.
 */
const ELISION: readonly [unicode: string, ascii: string] = Object.freeze(["⋯", "..."]);

/**
 * The glyph C19 §7 draws while a completion is slow.
 *
 * One frame of it rather than an animation: C03 commits on events, not on a
 * ticker, so a rotating spinner would need a timer this layer does not own and
 * must not grow. The claim C19 §7 makes is that the wait is *visible*, and one
 * glyph is that.
 *
 * **Taken from C09's own frames rather than written here** (C09 I22, F122).
 * `spinnerFrames` has returned an ASCII set since it was built and this file
 * hardcoded the unicode first frame two directories away — a mechanism that
 * exists and is not called, which from the call site is indistinguishable from
 * one that does not exist.
 */
function spinnerGlyph(caps: Pick<TerminalCapabilities, "unicode" | "ambiguousWidth">): string {
  return spinnerFrames(caps)[0] ?? "";
}

// `FrameError` and `exact` live in `frame-error.ts` (A03 MG2): `composite.ts`
// needs both and this file needs `composite`, and the cycle that made was the
// one MG2 found on the day it was implemented.

/**
 * `n` rows of `blocks`, rendered at `width` and squared off.
 *
 * Rendering is C09's, through the one implementation — a second render here
 * would be C09 I1's divergence in the place that moves the whole frame.
 */
function region(
  blocks: readonly Block[],
  n: number,
  width: number,
  deps: PaintDeps,
): readonly string[] {
  if (n <= 0) return [];
  const lines =
    blocks.length === 0
      ? []
      : renderSequenceToLines(deps.registry, blocks, width, {
          theme: deps.theme,
          capabilities: deps.capabilities,
        });

  const out: string[] = [];
  for (let i = 0; i < n; i += 1) out.push(exact(lines[i] ?? "", width));
  return out;
}

/**
 * S01 §3 — the prompt, windowed around the cursor when it exceeds its cap.
 *
 * The rows come from C17's single walk and are **not wrapped again here**: a
 * second wrap is the divergence that produces a prompt one row off, and it
 * appears at a wrap boundary, a double-width glyph, or a line that exactly
 * fills its row (C17 I18, S01 §3).
 */
/**
 * The command an entry is drawn with (C22 I33, C14 I20).
 *
 * **Chrome, not a block.** No adapter produced it, `--json` must not contain it,
 * and C13's cap must not count it — so it is drawn here and measured through
 * C14's `chromeRows`, rather than being prepended to the document.
 *
 * **The typed command, never the spawned argv** (C23 I15). The transcript shows
 * `/ps --search=… --open-mr`; `meta.argv` carries `widget ps … --json` and is
 * `/debug`'s to show. That distinction is the one I15 was always about and had
 * nothing to constrain until the command was drawn at all.
 *
 * Wrapped through `hardWrapCells`, which is C09's one implementation — this
 * function is called from both the measurer and the composer, so a second wrap
 * here is the drift C14 I1 exists to prevent, one layer up.
 */
export function commandRows(
  command: string,
  width: number,
  // **The capability, because this function is also the measurer's** (C22
  // I52). `construct.ts` calls it for `chromeRows`, so the prompt cannot be
  // resolved at module scope and both forms must be `PROMPT_GUTTER.first`
  // cells — otherwise the height C14 virtualises against and the row the
  // composer draws disagree about the same entry.
  caps: Pick<TerminalCapabilities, "unicode">,
): readonly string[] {
  if (command === "") return [];
  const body = Math.max(1, width - PROMPT_GUTTER.first);
  const wrapped = hardWrapCells(command, body);
  const prompt = promptFor(caps);
  return wrapped.map((row, i) =>
    (i === 0 ? prompt : " ".repeat(PROMPT_GUTTER.cont)) + row,
  );
}

/**
 * The window the prompt draws, anchored on the cursor (I62, §6e).
 *
 * **It was anchored on the buffer's end, with the deferral naming its own
 * blocker** — *until C17's `cursorCell` is threaded through* — and the blocker
 * had landed: `cursorCell` is on `EditorHandle` and `PaintDeps.promptCursor`
 * already carried it into this file, read forty lines below by `cursorFor`.
 * Two defects lived in the simplification it was still excusing, and both were
 * *at rest* rather than event-mediated, which is why the classification table
 * found them and the trace would not have.
 *
 * **`count` exists because the range test was the defect.** Membership was
 * tested on the painted index — `0 ≤ within < cap` — where a marker row and a
 * content row are the same kind of number, so the row immediately above a
 * marked window mapped to painted 0 and both consumers wrote there: the
 * terminal cursor was drawn **on the elision marker**, and a selection span
 * **washed** it. Returning the content range makes the honest test available
 * to both, and neither consumer was wrong about its own rule.
 */
function promptWindow(
  frame: Composed,
  rows: readonly string[],
  cursor: number,
  // The capability reaches here for the elision marker alone; `promptRegion`
  // holds `deps` and passes it down rather than a second read (C09 I22).
  caps: Pick<TerminalCapabilities, "unicode">,
): PromptWindow {
  const elision = caps.unicode === "ascii" ? ELISION[1] : ELISION[0];
  const cap = frame.promptRows;
  const n = rows.length;
  if (n <= cap) return { rows, first: 0, offset: 0, count: n };

  const at = Math.min(Math.max(0, cursor), n - 1);

  // **A cap of one shows one row and no marker** (S01 §3, commitment 14): the
  // window is the marker plus what follows it, and at `cap = 1` there is
  // nothing to follow — the prompt painted as `⋯` alone with the command
  // nowhere on the screen. The row shown is now the **cursor's** rather than
  // the last; the ruling this row carries is *content beats a marker*, and
  // which row was always incidental to it (§6e.4).
  if (cap === 1) return { rows: [rows[at] ?? ""], first: at, offset: 0, count: 1 };

  // The cursor inside the last window's worth: identical to the tail anchoring
  // this replaced, which is the common frame and is why the change is invisible
  // wherever the cursor already was (T1.21d, T6.49).
  const tail = n - (cap - 1);
  if (at >= tail) {
    return { rows: [elision, ...rows.slice(tail)], first: tail, offset: 1, count: cap - 1 };
  }

  // The head, where the elision is **below**. A marker at each end is what the
  // cursor-following window obliges, and it is not decoration: spans are per
  // row, so dropping the rows outside clips a wash exactly, and without a
  // bottom marker a clipped wash reads as one that ended there (§6e table 4).
  if (at <= cap - 2) {
    return { rows: [...rows.slice(0, cap - 1), elision], first: 0, offset: 0, count: cap - 1 };
  }

  // Mid-buffer, both ends marked. **`cap = 2` leaves no content row**, and the
  // ruling is the marker above plus the cursor's row — the residue being that
  // rows below are elided unmarked there. Reachable despite `MIN_ROWS`: a
  // resize can arrive between the size gate and the frame, which T1.5b already
  // records (§6e table 6).
  const count = cap - 2;
  if (count < 1) return { rows: [elision, rows[at] ?? ""], first: at, offset: 1, count: 1 };

  // **No clamp, and it was written with one.** The mutation pass removed it and
  // nothing failed, which is the *code is dead* disposition rather than a
  // missing row: this branch is entered only when `cap − 2 < at < n − cap + 1`,
  // and those guards already put `first` at or above 1 and `first + count` at or
  // below `n − 1`. A clamp here could never bind, so it would read as careful
  // and forbid nothing — the same finding `menuWindow` gave up twice over
  // (entry 16 step 3). Both markers are justified by the branch's own bounds.
  const first = at - Math.floor((count - 1) / 2);
  return {
    rows: [elision, ...rows.slice(first, first + count), elision],
    first,
    offset: 1,
    count,
  };
}

/**
 * Which of the editor's rows the prompt is showing, and where they land.
 *
 * `first` is the index in the editor's full layout of the first *content* row
 * in the window, `count` is how many content rows there are, and `offset` is
 * how many painted rows precede them — one when a marker is drawn above.
 *
 * **`first` and `count` are a range in editor coordinates and `offset` converts
 * to painted ones**, and keeping the two apart is the whole of I62: a test in
 * painted coordinates cannot distinguish a content row from a marker.
 */
type PromptWindow = Readonly<{
  rows: readonly string[];
  first: number;
  count: number;
  offset: number;
}>;

/** Whether an editor row is one the window draws (I62). */
function shows(window: PromptWindow, row: number): boolean {
  return row >= window.first && row < window.first + window.count;
}

/**
 * The selection wash, applied to a squared-off row (entry 23).
 *
 * **After `exact`, and that is where the full-row half comes from.** The row is
 * already padded to `width`, so a span running to `width` washes the padding
 * too — *selected* rather than *highlighted*. Applying this before the pad would
 * stop at the last cluster, pass every assertion about which characters are in
 * the region, and only be visible in a frame-read.
 *
 * **Reverse video is the 1-bit rung and it is here rather than in the theme.**
 * `resolveBackground` answers `NO_STYLE` where there is no colour, so a wash
 * alone would fall straight from a background to nothing. `inverse` needs no
 * colour at all and is supported essentially everywhere, which is what stops the
 * ladder having a hole in the middle.
 */
function washed(row: string, span: CellSpan, deps: PaintDeps): string {
  const style = selectionStyle(deps);
  const before = sliceCells(row, 0, span.from);
  const inside = sliceCells(row, span.from, span.to);
  const after = sliceCells(row, span.to, cells(row, deps.capabilities.ambiguousWidth));
  return `${before}${paintSpans([{ text: inside, style }])}${after}`;
}

/** The wash, or reverse video where there is no colour to wash with (§4b). */
function selectionStyle(deps: PaintDeps): Style {
  const bg = background("surface.selection", deps.theme, deps.capabilities);
  return bg.background === undefined ? { inverse: true } : bg;
}

function promptRegion(frame: Composed, deps: PaintDeps, width: number): readonly string[] {
  const cap = frame.promptRows;
  const cursor = deps.promptCursor();
  const window = promptWindow(frame, deps.promptRows(), cursor.row, deps.capabilities);
  const windowed = window.rows;
  // **Mapped through the window, not assumed aligned with it.** The prompt
  // windows when it exceeds its cap (S01 §3), so an editor row and a painted
  // row are different numbers whenever a marker is up.
  //
  // **Membership is tested on the editor row and never on the painted one**
  // (I62). `at >= 0 && at < cap` was the version that shipped, and it accepts
  // the row immediately above a marked window — which maps to painted 0, the
  // marker's own row, and washed it.
  const spans = new Map<number, CellSpan>();
  for (const span of deps.promptSelection()) {
    if (shows(window, span.row)) spans.set(span.row - window.first + window.offset, span);
  }

  const out: string[] = [];
  for (let i = 0; i < cap; i += 1) {
    const body = windowed[i] ?? "";
    const gutter = i === 0 ? promptFor(deps.capabilities) : " ".repeat(PROMPT_GUTTER.cont);
    const squared = exact(gutter + body, width);
    const span = spans.get(i);
    out.push(span === undefined ? squared : washed(squared, span, deps));
  }

  // **The spinner is appearance and never geometry** (I38, C19 §7). It goes on
  // after the rows are squared off, into padding the prompt already has, so
  // `measure` never sees it and `cap` is the same number whether a completion
  // is in flight or not. Written into the **cursor's** row because that is
  // where C19 §7 draws it: `❯ /ps --family=⠋`.
  //
  // **It used to be `out.length - 1`, justified as *that is where the cursor
  // is*** — true only while the window was anchored on the buffer's end, and
  // with a marker below the last painted row **is the marker** (§6e table 5).
  // The row is the same one in every case a spinner or ghost is actually up,
  // since a completion is in flight over the token being typed; what changes is
  // that the stated reason is now the reason.
  //
  // Read here rather than passed in, so the value is the one true at paint.
  const last = shows(window, cursor.row)
    ? cursor.row - window.first + window.offset
    : out.length - 1;
  const row = out[last];
  if (row !== undefined && deps.spinning()) {
    const at = cells(row.trimEnd(), deps.capabilities.ambiguousWidth);
    if (at + 1 <= width) out[last] = exact(`${sliceCells(row, 0, at)}${spinnerGlyph(deps.capabilities)}`, width);
    return out;
  }

  // **Ghost text, on the same terms as the spinner** (I50): read fresh, written
  // into padding the row already has, never lengthening it. `measure` therefore
  // never sees it and `cap` is the same number with a suggestion and without
  // one — a suggestion that changed the prompt's height would move the viewport
  // underneath it on every keystroke.
  //
  // **The spinner returned above rather than falling through.** Both draw into
  // the same cells and both are true whenever a `Tab` is in flight over a
  // prefix that also has a static suggestion; showing a stale suggestion beside
  // *still thinking* states two things, one of which is about to stop being
  // true.
  //
  // Dropped rather than truncated when it does not fit. Half a suggestion is a
  // different word, and `Tab` would insert the whole one.
  const suggestion = deps.ghost();
  if (row !== undefined && suggestion !== null && suggestion !== "") {
    const at = cells(row.trimEnd(), deps.capabilities.ambiguousWidth);
    if (at + cells(suggestion, deps.capabilities.ambiguousWidth) <= width) {
      const style = ghostStyle(deps);
      out[last] = exact(`${sliceCells(row, 0, at)}${paintSpans([{ text: suggestion, style }])}`, width);
    }
  }
  return out;
}

/** `muted`, resolved through the theme so the ghost degrades with everything else. */
function ghostStyle(deps: PaintDeps): Style {
  return tone("muted", deps.theme, deps.capabilities);
}

/**
 * The whole frame, exactly `frame.size.rows` lines of `frame.size.columns`
 * cells.
 *
 * Throws rather than returning a short frame: a caller that wrote 39 rows into
 * a 40-row terminal would leave one row of the last frame visible, and a caller
 * that wrote 41 would scroll. Neither is recoverable by the caller, so the
 * frame is refused and C22 draws the fallback.
 */
/**
 * The theme's background, re-established after every reset in a finished row
 * (C22 I65, C10 I25).
 *
 * **One place repairs every reset a row contains**, which the walk did not expect
 * and the implementation settled: `fitStyled` closes a cut line, `composite`
 * writes two per composited row, `paint()` closes each styled run the *shell*
 * draws — and by the time a row reaches here all of them are **inside this
 * string**. `render-frame`'s per-row prefix is the one outside, and it is
 * answered by the row's own leading base landing immediately after it.
 *
 * **And the set is not `SGR_RESET`, which is the correction the code made to the
 * walk.** L1's rendered rows do not contain a full reset at all: Ink closes a
 * foreground run with `39` and a background run with `49`, and the two are not
 * equivalent here. `39` restores the default *foreground* and a base survives
 * it untouched. **`49` restores the default *background* — the terminal's, not
 * ours** — and a patch row ends with exactly that, so the padding after it would
 * show through. The walk counted the sites that write `\x1b[0m` and the property
 * that matters is *returns a channel to the terminal's default*, which `49`
 * satisfies and `39` does not.
 *
 * **Blind spot, stated rather than left to be discovered**: a compound sequence
 * carrying `0` or `49` among other parameters — `\x1b[0;1m` — is not repaired.
 * Nothing in the tree emits one; `sgr()` never writes `0`, and Ink writes both
 * closers alone. It is a measurement rather than a guarantee.
 *
 * **The base is a default and not a span**, which is the whole distinction: a
 * wash sets `background` on the cells between two offsets, and every reset in
 * the tree returns to the *terminal's* default rather than to ours. That is why
 * a selection's wash still wins for its own cells — it sets the channel
 * explicitly — and why the base resumes immediately after it closes.
 *
 * **And every row closes itself**, which is what the walk expected to need a
 * lifecycle change for. A row that ended with the base live would leave an
 * attribute on the wire that outlives the frame — the alternate screen restores
 * cell contents and not SGR state — so `suspend()` and `release()` would each
 * owe a reset, on the cursor shape's third-category path (C01 I20). Closing the
 * row costs the same four bytes and owes nothing: no live attribute ever escapes
 * a single row, so a handoff, a resize, an exit and a fault are all covered by
 * the same rule and none of them needs to know a background exists.
 *
 * Nothing is written where a theme inherits: `sgr(NO_STYLE)` is empty, so the
 * arm every session runs today costs one comparison per frame and produces byte
 * for byte what it produced before.
 */
function based(lines: readonly string[], base: string): readonly string[] {
  if (base === "") return lines;
  return lines.map(
    (line) => `${base}${line.replace(toTerminalDefault(), (seq) => `${seq}${base}`)}${SGR_RESET}`,
  );
}

/** The screen's base, or the empty string where nothing is painted. */
function baseSequence(deps: PaintDeps): string {
  if (deps.suppressBackground()) return "";
  return sgr(resolveBase(deps.theme, deps.capabilities));
}

export function paint(frame: Composed, deps: PaintDeps): readonly string[] {
  if (!heightsSum(frame)) {
    throw new FrameError(
      `frame heights do not sum to ${String(frame.size.rows)} rows: ` +
        `header 1 + viewport ${String(frame.region.height)} + prompt ${String(frame.promptRows)} + footer 1`,
    );
  }

  // **The sibling assertion, which was written and never called** (T4.9, MG25).
  //
  // `gutterMatchesPrompt` sits beside `heightsSum` in `frame.ts` and its own
  // comment says "asserted here rather than only in a test" — and nothing in
  // `src/` named it, so the sentence was false and the check ran nowhere. That
  // is A03 §2's vacuity class in a function: an assertion that cannot fail
  // because it is never evaluated reads exactly like one that holds.
  //
  // Constant-folded rather than frame-dependent, so it costs one comparison and
  // could in principle be checked once. It is checked here because *here* is
  // where its sibling is checked, and an invariant kept somewhere else is the
  // one that gets dropped in the next refactor.
  if (!gutterMatchesPrompt()) {
    throw new FrameError(
      "the prompt gutter does not match the prompt: `displayRows` will disagree " +
        "with the rendered height by a row",
    );
  }

  // **The prompt's height entered the frame twice** (S01 §3, commitment 15).
  // `heightsSum` above cannot see the two disagree — it compares the frame with
  // itself, and the four regions total `rows` whatever number the prompt was
  // composed with. So the number and the rows are compared where they meet.
  // Composed for one row and painted from three, the frame is coherent and
  // describes a different prompt than the editor holds; the screen gets a lone
  // elision marker and the typed command is nowhere on it.
  const promptRowCount = deps.promptRows().length;
  if (promptRowCount !== frame.promptWanted) {
    throw new FrameError(
      `prompt height disagrees: composed from ${String(frame.promptWanted)} rows, ` +
        `painting ${String(promptRowCount)}`,
    );
  }

  // **The one width, read from the composed frame and never from a stream.**
  const width = frame.size.columns;

  // **The layers go on last, and the count is checked after them** (I29). They
  // take no rows — that is why `heightsSum` above holds identically with three
  // overlays open and with none, and why nothing could see that for the whole
  // life of C15 no component drew one at all (S01 §3a).
  const lines = composite(
    [
      ...region(frame.header, 1, width, deps),
      ...transcript(frame, deps, width),
      ...promptRegion(frame, deps, width),
      ...region(frame.footer, 1, width, deps),
    ],
    deps.overlays(),
    {
      registry: deps.registry,
      theme: deps.theme,
      capabilities: deps.capabilities,
      regionTop: frame.region.top,
      region: frame.overlayRegion,
      ...(deps.scratch === undefined ? {} : { scratch: deps.scratch }),
    },
  );

  const painted = based(lines, baseSequence(deps));

  if (painted.length !== frame.size.rows) {
    throw new FrameError(
      `frame is ${String(painted.length)} rows for a ${String(frame.size.rows)}-row terminal`,
    );
  }
  return Object.freeze(painted);
}

/**
 * Where the terminal cursor goes, in frame coordinates, or `null` for hidden
 * (C15 I19, C22 §6a).
 *
 * **The choice is the drawer's and never C17's.** A `cursorCell` that varied
 * with focus would put focus inside a component that has no notion of it, so
 * this reads the focused thing and asks it: the topmost layer states its own
 * through `Placed.cursor`, and a layer without one hides the cursor rather than
 * leaving it blinking at a prompt that is not taking keys — which is the
 * *somewhere invisible* symptom derived focus exists to prevent. Reverse search
 * has one, the completion menu does not, and the confirm does not.
 *
 * **The windowed prompt is the arithmetic half** (§6a trace row 8).
 * `cursorCell.row` indexes the editor's full layout and the prompt paints only
 * `promptRows` of it, so an untranslated row puts the cursor in the transcript.
 * A cursor above the window is hidden rather than clamped to its edge: it
 * genuinely is not on the screen, and a clamped one would claim otherwise.
 */
export function cursorFor(frame: Composed, deps: PaintDeps): Cell | null {
  const placed = deps.overlays();
  const top = placed[placed.length - 1];
  if (top !== undefined) {
    if (top.cursor !== undefined) {
      return {
        row: frame.region.top + top.top + top.cursor.row,
        col: top.left + top.cursor.col,
      };
    }
    // A layer with no cursor of its own hides it — **unless the prompt is still
    // taking keys underneath**, which is the completion menu holding no
    // selection (C22 §6a row 2a, C19 I20). `promptFocused` is the router's
    // precedence rather than a second opinion about it, so the cursor cannot
    // say the prompt is inert while the prompt is answering keys.
    if (!deps.promptFocused()) return null;
  } else if (!deps.promptFocused()) {
    return null;
  }

  const cell = deps.promptCursor();
  const window = promptWindow(frame, deps.promptRows(), cell.row, deps.capabilities);
  // **The editor row, not the painted one** (I62). `within < 0 || within >=
  // cap` was the version that shipped: the row immediately above a marked
  // window gives `within === 0`, which is inside that range and is the elision
  // marker's own painted row, so the terminal cursor was drawn on the marker.
  // The window contains the cursor by construction now, so this is a guard on
  // `promptCursor` and `promptRows` being read separately rather than the
  // hiding policy it used to be.
  if (!shows(window, cell.row)) return null;
  const within = cell.row - window.first + window.offset;

  return { row: frame.region.top + frame.region.height + within, col: cell.col };
}

/**
 * The blank rows the composer draws **above** a short transcript (C14 §2, I19).
 *
 * Bottom-aligned: a half-full transcript sits above the prompt, not under the
 * header, because the prompt is where the eye is and content should grow
 * towards it. **Exported because the pointer has to undo it**: C14 addresses
 * its rows from the top, so `construct.ts`'s `entryAtRegionRow` subtracts this
 * from a region row before asking `entryAtRow`. The two used to agree by being
 * the same expression written twice — the drift the frame path cannot see
 * until a short session's click lands one row wrong (F755). One function, so a
 * change to how the frame aligns moves the click with it.
 */
export function blankRowsAbove(regionHeight: number, rows: number): number {
  return Math.max(0, regionHeight - rows);
}

/** C14 selected these at this width; they are padded, never re-measured. */
function transcript(frame: Composed, deps: PaintDeps, width: number): readonly string[] {
  const rows = deps.transcriptRows();

  // **More rows than the region has is refused, not trimmed** (I35). The trim was
  // `rows[0 … height)` — the *top* of the selection — so a viewport that thought
  // it was three rows taller than the region scrolled to what it believed was the
  // foot of the document and the last three rows were dropped before they reached
  // the screen. `End`, `PageDown` and `↓` all stopped at the same row and nothing
  // anywhere disagreed: `heightsSum` compares the frame with itself and C14 I10
  // compares the viewport with itself, so the only place the two quantities meet
  // is here, where the trim was quietly reconciling them.
  //
  // Unreachable with I34 held, and asserted for the same reason I30 is: a repair
  // at the symptom leaves the component that chose the rows believing it was
  // obeyed.
  if (rows.length > frame.region.height) {
    throw new FrameError(
      `the viewport selected ${String(rows.length)} rows for a ${String(frame.region.height)}-row region`,
    );
  }

  const out: string[] = [];
  const blank = blankRowsAbove(frame.region.height, rows.length);
  for (let i = 0; i < blank; i += 1) out.push(" ".repeat(width));
  for (let i = 0; i < frame.region.height - blank; i += 1) {
    out.push(exact(rows[i] ?? "", width));
  }
  return out;
}
