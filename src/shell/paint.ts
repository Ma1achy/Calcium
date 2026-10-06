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
import type { Motion, RenderScratch } from "../presentation/blocks/types.js";
import { cells, fitStyled, hardWrapCells, sliceCells } from "../presentation/text.js";
import { neutraliseControl } from "../data/text.js";
import {
  background,
  based,
  focusShapeStyle,
  paint as paintSpans,
  isBand,
  selectionStyle,
  tone,
  withBackground,
  type Span,
} from "../presentation/blocks/paint.js";
import { SGR_RESET, sgr, sgrPattern } from "../terminal/escapes.js";
import { HEADER_ROWS, HEADER_RULE_ROWS, MIN_COLUMNS, promptFor, PROMPT_GUTTER } from "./config.js";
import { glyphs, scrollbarColumn, scrollbarSet } from "../presentation/blocks/index.js";
import { composite, type LayerView } from "./composite.js";
import type { ChromeCache, ChromeRole } from "./chrome-cache.js";
import { exact, FrameError } from "./frame-error.js";
import { gutterMatchesPrompt, heightsSum, promptTop, type Composed } from "./frame.js";
import type { Label } from "./types.js";
import type { Block, EchoChip } from "../data/viewmodel/index.js";
import { echoRows, type EchoCaps } from "./echo.js";
import type { Placed } from "../viewport/overlay/index.js";
import type { Cell, CellSpan } from "../interaction/editor/index.js";
import type { BlockRegistry } from "../presentation/blocks/index.js";
import { resolveBase, resolveHueBand, resolveTone } from "../presentation/theme/index.js";
import type { ResolvedTheme } from "../presentation/theme/index.js";
import type { Style } from "../presentation/theme/index.js";
import type { TerminalCapabilities } from "../terminal/capabilities.js";
import { NO_SPAN } from "../data/viewmodel/index.js";
import type { Probe } from "../data/viewmodel/index.js";
import { spinnerFrames } from "../presentation/blocks/index.js";

export type PaintDeps = Readonly<{
  registry: BlockRegistry;
  theme: ResolvedTheme;
  capabilities: TerminalCapabilities;
  /** The reader's motion preference (C09 I99); absent is `"full"`. */
  motion?: Motion;
  /** C22 I102 — the session's chrome cache; absent in a harness that paints once. */
  chrome?: ChromeCache;
  /**
   * C28's seam (I30). Absent is not recording, and that is the usual case.
   */
  probe?: Probe;
  /** The visible transcript rows, already selected by C14 at this width. */
  transcriptRows: () => readonly string[];
  /** C17's display rows, already wrapped and gutter-aware (C17 §2, I18). */
  promptRows: () => readonly string[];
  /**
   * Are the prompt's rows a **replacing question's** rather than the editor's
   * (C23 I73, I74, §7f, §101)?
   *
   * **The gutter is the whole of what this changes here.** `❯ ` and its
   * continuation spaces are the editor's mark, and a question drawn under them
   * is a box indented two cells with a prompt character on its top border —
   * which is what shipped for one run of T4.70. The spinner and the ghost go
   * with it for the same reason: both are appearance written into the
   * **editor's** row, and there is no editor row here.
   */
  promptReplaced: () => boolean;
  /**
   * C15's boxes, placed against the frame's own `overlayRegion` (C22 I28).
   *
   * A function rather than a value for the same reason the two above are, and
   * with the same rule: it is answered from the composed frame's region, never
   * from a fresh one. Two regions for one frame is the two-records defect S01
   * §3 already produced once.
   */
  overlays: () => readonly Placed[];
  /**
   * A layer's own row offset, as the wheel left it (C16 I74). Optional: absent
   * is *every layer at its top*, which is every frame nobody has wheeled.
   */
  layerScroll?: (id: string) => number;
  /**
   * A layer's boxes' offsets and the box its keys move (C22 I141). Absent is
   * every layer unscrolled.
   */
  layerView?: (id: string) => LayerView;
  /**
   * C14's scroll, for the transcript's bar (C14 I62), and whether focus is in
   * the transcript — the thumb's tone. Absent draws no bar, which is a harness
   * that paints a frame with no viewport behind it.
   */
  transcriptBar?: () => Readonly<{ topRow: number; totalRows: number; focused: boolean }>;
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
  /**
   * Which cells of the prompt are a chip's (C17 I26, §5c).
   *
   * **Off the same walk the rows came from**, like the selection above and for
   * the same reason: a ground measured anywhere else parts company with the
   * drawn row at exactly the boundaries the seam exists for. Geometry is
   * untouched — cells to style, never cells to add.
   *
   * Empty when the prompt holds no chip, so the common case costs one array.
   */
  promptChips: () => readonly CellSpan[];
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
 * One rule row (C22 I81, I87, §6l.4 A, §6l.7): the `horizontal` glyph across the full
 * width, in the muted tone at every depth and **plain at 1-bit** — a rule is
 * geometry, and one that needed colour to read would be F34's class. The glyph
 * comes from C09's table so the ASCII tier gets `-` from the same place every
 * other rule in the frame does.
 */
function rule(width: number, deps: PaintDeps, label: Label | null = null): string {
  const glyph = glyphs(deps.capabilities).horizontal;
  const mark = labelSpansOf(label, width, deps);
  if (mark === null) {
    const text = glyph.repeat(width);
    if (deps.capabilities.colourDepth === 1) return text;
    return paintSpans([{ text, style: tone("muted", deps.theme, deps.capabilities) }]);
  }
  return paintSpans(mark);
}


/**
 * The upper rule's spans when a label is drawn, or `null` when it is shed.
 *
 * **Inline-end with one trailing glyph, and painted as a ground** (§069,
 * `R-COL-003`): *a name is a THING, and things take a ground*. `bgElev` is the
 * design's rest-ground for a thing (`R-BLK-490`); the rule's own glyphs keep
 * the muted tone they always had, so the row is the same row with a span in it.
 *
 * **Shed by the frame, never by the caller** (`R-BLK-175` ranks it 1 of 4 in
 * the whole degradation order). Two conditions, and neither is a number chosen
 * here. The first is `MIN_COLUMNS` — §069's *at 60 columns the label drops
 * before anything else, and the frame still works*, which names the narrowest
 * width the frame draws at at all: at that width the label is gone and the
 * three rules are not, which is what *still works* means as a mechanism.
 *
 * **It is `<=` rather than `<`, and the difference is the whole rule.** A
 * strict comparison against a private copy of 60 is unreachable: below 60 there
 * is no frame — `fallback.ts` replaces it with the *Needs 60x24* notice — so the
 * label's floor could only ever fire where the rule it sits on does not exist.
 * A mutation setting that copy to 0 survived, which is how it was found: A03
 * §2's vacuity class, arriving as two constants that had to agree with nothing
 * holding them together.
 *
 * The second is derived rather than chosen: the label is gone whenever it would
 * not leave at least one rule glyph to its left — a label that filled the row
 * would have stopped being a label.
 *
 * **At 1-bit there is no ground, so the label takes the unpainted rung, `[name]`**
 * (C22 I147, §6r). Plain text would put the application's identity in the rule's
 * own voice, which is what `R-COL-003` separates. The brackets separate it
 * without a colour, as they do for a chip (C17 I25) and a button (C09 I102).
 * They take the two cells the ground's padding takes, so every threshold below
 * is the same at every depth.
 */
function labelSpansOf(
  label: Label | null,
  width: number,
  deps: PaintDeps,
): readonly Span[] | null {
  if (label === null || width <= MIN_COLUMNS) return null;
  const unpainted = deps.capabilities.colourDepth === 1;
  const glyph = glyphs(deps.capabilities).horizontal;
  const ambiguous = deps.capabilities.ambiguousWidth;
  const glyphCells = cells(glyph, ambiguous);
  if (glyphCells <= 0) return null;

  // ` <label> ` between the rule and its one trailing glyph — the fixture's
  // `──── calcium ─`, whose two spaces are what keep the name off the dashes.
  const text = unpainted ? `[${label.text}]` : ` ${label.text} `;
  const used = cells(text, ambiguous) + glyphCells;
  const left = width - used;
  if (left < glyphCells) return null;
  const lead = glyph.repeat(Math.floor(left / glyphCells));
  // The remainder when the glyph is two cells wide — spaces rather than a
  // half glyph, and on the left where the rule is, not against the label.
  const pad = left - cells(lead, ambiguous);

  const muted = tone("muted", deps.theme, deps.capabilities);
  // **No span takes a style at 1-bit, the dashes included.** The bare rule is
  // plain text there (`rule`), and `muted` at 1-bit is dim, so a styled dash
  // would make the labelled rule a different rule from the one beside it. A hue
  // has nothing to paint with (I114), and the brackets are the carrier.
  if (unpainted) return [{ text: lead + " ".repeat(pad) }, { text }, { text: glyph }];
  // **The hue the application named, or `bgElev` when it named none** (I114,
  // §070, C10 I55). Both the band and its ink come from the hue, because the
  // ink on a band is a property of the band — a label whose ink is guessed is
  // the failure `R-THM-005` exists to prevent. A name no theme carries paints
  // the untinted ground rather than nothing: the name arrives from a config
  // file where a person typed it, so the reachable wrong input is a misspelling.
  const band = label.hue === undefined ? null : resolveHueBand(deps.theme, label.hue, deps.capabilities);
  // **The ink is resolved against the ground it lands on** (C10 I48): `tone`'s
  // fourth argument is the composition step, so a theme that repaints `default`
  // on `bgElev` is honoured here rather than measured elsewhere and drawn flat.
  const ink = band === null ? tone("default", deps.theme, deps.capabilities, "bgElev") : band.ink;
  const ground = withBackground(ink, band === null
    ? background("surface.bgElev", deps.theme, deps.capabilities)
    : band.ground);
  return [
    { text: lead + " ".repeat(pad), style: muted },
    { text, style: ground },
    { text: glyph, style: muted },
  ];
}

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
  role: ChromeRole,
): readonly string[] {
  if (n <= 0) return [];
  const render = (b: readonly Block[], w: number): readonly string[] =>
    renderSequenceToLines(deps.registry, b, w, {
      theme: deps.theme,
      capabilities: deps.capabilities,
      ...(deps.motion === undefined ? {} : { motion: deps.motion }),
      ...(deps.probe === undefined ? {} : { probe: deps.probe }),
    });
  // **Once per content** (C22 I102): the chrome's blocks are rebuilt every
  // frame and are the same document nearly every frame; the cache keys on
  // the structure and hands the held lines back.
  const lines =
    blocks.length === 0
      ? []
      : deps.chrome === undefined
        ? render(blocks, width)
        : deps.chrome.lines(role, blocks, width, deps.theme.name, render);

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
  caps: EchoCaps,
  /**
   * The line's chips (C04 I152). **Where they describe `command`, the echo is
   * the prompt's walk** (I153): a chip is one wrap unit drawn as its label,
   * and its content's line breaks never reach the frame. Absent, or a range
   * that does not lie in `command`, and the rows below are unchanged.
   */
  echo?: readonly EchoChip[],
): readonly string[] {
  if (command === "") return [];
  const walked = echoRows(command, echo, width, caps);
  if (walked !== null) return walked.rows;
  const body = Math.max(1, width - PROMPT_GUTTER.first);
  // **Line by line, and no row holds a break** (C22 I33, amended). A paste or a
  // resolved chip puts `\n` in the command, `hardWrapCells` measures it as
  // nothing, and written raw inside a row it moved the terminal down mid-row —
  // near the bottom, scrolling the alternate screen. Each line is wrapped on
  // its own, as the prompt draws the same buffer. A blank line keeps its row
  // because `hardWrapCells("")` is `[""]`, not `[]`.
  //
  // **Neutralised before it is wrapped** (I33 amended, C17 I36, F1401). The
  // command is the reader's line and this row is not a block, so C09 I127's
  // resolve never sees it: a bidi override typed at the prompt was written raw
  // here and reordered the echo. Before the wrap, so the `<U+202E>` form's
  // eight cells are in the height the measurer takes from this same function.
  // `entry.doc.command` keeps the character; only the row shows it.
  const wrapped = command
    .split(/\r\n|\r|\n/u)
    .flatMap((line) => hardWrapCells(neutraliseControl(line), body));
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

/** A cell range of a squared-off row and the style it takes. */
type StyledRange = Readonly<{ from: number; to: number; style: Style }>;

/**
 * A squared-off row with its grounds applied, in one pass (entry 23, C17 §5c,
 * `R-STA-002`).
 *
 * **After `exact`, and that is where the full-row half comes from.** The row is
 * already padded to `width`, so a span running to `width` washes the padding
 * too — *selected* rather than *highlighted*. Applying this before the pad would
 * stop at the last cluster, pass every assertion about which characters are in
 * the region, and only be visible in a frame-read.
 *
 * **Reverse video is the 1-bit rung and it is in `selectionStyle` rather than in
 * the theme.** `resolveBackground` answers `NO_STYLE` where there is no colour,
 * so a wash alone would fall straight from a background to nothing. `inverse`
 * needs no colour at all and is supported essentially everywhere, which is what
 * stops the ladder having a hole in the middle.
 *
 * **One pass, because `sliceCells` cannot read a row it has already painted.**
 * This was `washed` and took a single span; the chip's ground made a second,
 * and applying it by calling the old function twice would have measured SGR
 * bytes as cells the second time round — the later range landing in the wrong
 * place, with a frame-read the only thing that would show it. So the row is cut
 * once at every boundary.
 *
 * **The ranges arrive resolved, not overlapping**, and resolving them is the
 * caller's because the precedence is `R-STA-002`'s and belongs where the facts
 * are known: a copy selection outranks a structural surface, so a chip under a
 * selection is washed and not double-painted.
 */
function styled(row: string, ranges: readonly StyledRange[], caps: Pick<TerminalCapabilities, "ambiguousWidth">): string {
  if (ranges.length === 0) return row;
  const width = cells(row, caps.ambiguousWidth);
  const order = [...ranges].sort((a, b) => a.from - b.from);
  let out = "";
  let at = 0;
  for (const range of order) {
    const from = Math.max(at, range.from);
    if (range.to <= from) continue;
    out += sliceCells(row, at, from);
    out += paintSpans([{ text: sliceCells(row, from, range.to), style: range.style }]);
    at = range.to;
  }
  return out + sliceCells(row, at, width);
}

/**
 * A chip is a well (`R-BLK-628`) in the meta tone (`R-BLK-116`), resolved
 * against the ground it lands on (C10 I48) rather than measured flat. The
 * prompt's and the echo's (C22 I153), so the two cannot draw one chip two ways.
 */
function chipWell(theme: ResolvedTheme, capabilities: TerminalCapabilities): Style {
  return withBackground(
    tone("meta", theme, capabilities, "bgDeep"),
    background("surface.bgDeep", theme, capabilities),
  );
}

/**
 * The echo's rows with each chip painted as the prompt paints it (C22 I153,
 * I154; §6t.2 rows 7, 8).
 *
 * At rest a chip is the prompt's well; **focused, it takes the box shape's
 * treatment** (C09 I137) — `meta` over `focusGround`, whole-shape inversion
 * where no ground resolves — and the resting ground does not outlive focus.
 * At 1 bit the well resolves to nothing and the bracketed label carries it
 * (C17 I25). `focused` is the index into the echo's chips, or `null`.
 *
 * Rows without a chip come back as they went in, so an echo holding none is
 * byte for byte what `commandRows` drew.
 */
export function paintEchoRows(
  rows: readonly string[],
  chips: readonly CellSpan[],
  focused: number | null,
  theme: ResolvedTheme,
  capabilities: TerminalCapabilities,
): readonly string[] {
  if (chips.length === 0) return rows; // cells-ok — a chip count
  const well = chipWell(theme, capabilities);
  const focus = { ...tone("meta", theme, capabilities, "focusGround"), ...focusShapeStyle(theme, capabilities) };
  return rows.map((row, at) => {
    const ranges = chips.flatMap((span, i) =>
      span.row === at ? [{ from: span.from, to: span.to, style: i === focused ? focus : well }] : [],
    );
    return ranges.length === 0 ? row : styled(row, ranges, capabilities); // cells-ok — a range count
  });
}

/**
 * The chip grounds a row takes, minus any the selection has claimed (`R-STA-002`).
 *
 * **The precedence is the design's: a copy selection outranks a structural
 * surface, and one cell takes one ground.** So a chip the wash reaches gives up
 * its ground entirely.
 *
 * **Entirely, and that is a property rather than a simplification.** The first
 * version subtracted the wash from the chip and emitted the pieces either side,
 * on the reading that a chip could be half selected. It cannot: **a chip is one
 * grapheme** (C17 I25), so a region endpoint is either before it or after it and
 * `selectionSpans` can only ever produce a wash that covers the whole label or
 * none of it. The two-piece branch was a rule with nothing to be wrong about,
 * and the row that was written to exercise it could not construct the input.
 * T1.68 asserts the property the simplification rests on instead.
 */
function chipRanges(
  spans: readonly CellSpan[],
  wash: CellSpan | undefined,
  style: Style,
): readonly StyledRange[] {
  const out: StyledRange[] = [];
  for (const span of spans) {
    const overlaps = wash !== undefined && wash.from < span.to && wash.to > span.from;
    if (!overlaps) out.push({ from: span.from, to: span.to, style });
  }
  return out;
}

/**
 * Which rendered rows take the selection ground (C14 I39).
 *
 * **One row per selected block, at the block's first row** — `R-SEL-003`'s
 * third clause, *never on every cell of its body*. Pure and here rather than
 * inside the render loop so the claim has an artefact: the session's screen
 * model drops SGR, so a frame read one layer up can see a row move and cannot
 * see a ground, which is why `session-paint.test.ts` reads `paint()`'s return
 * rather than the modelled screen.
 *
 * `from` is the window's first row in the entry's own space, so a block whose
 * first row is above the window contributes nothing: the ground goes on the
 * first row, and a window beginning below it is showing the body.
 */
export function washedRowsOf(
  spans: readonly Readonly<{ key: string; from: number; to: number }>[],
  selected: ReadonlySet<string>,
  entryId: string,
  from: number,
  lineCount: number,
): ReadonlySet<number> {
  const rows = new Set<number>();
  for (const sp of spans) {
    if (!selected.has(sp.key)) continue;
    if (sp.key.slice(0, sp.key.indexOf("\u0000")) !== entryId) continue;
    const at = sp.from - from;
    if (at >= 0 && at < lineCount) rows.add(at);
  }
  return rows;
}

/**
 * The rows the rail leads, as a set (C14 I57, I58, T1.77): the washed rows —
 * one per selected block — unioned with each selected element's first row.
 *
 * One function because the union is the claim: a block selection and an
 * element selection in the same window both take the rail, and a frame that
 * consults only one of them draws the other's rows blank-led.
 */
export function railRowsOf(washed: ReadonlySet<number>, elements: ReadonlySet<number>): ReadonlySet<number> {
  return elements.size === 0 ? washed : washed.size === 0 ? elements : new Set([...washed, ...elements]);
}

/**
 * The first rows of an entry's **selected elements** (C14 I58, C26 I16).
 *
 * `focus.selected` is drawn by the block that holds each element — C11 washes
 * a table row with no knowledge of the frame — so the rail beside it is the
 * frame's, placed from the entry's elements. `placed` is `elementsOfEntry` at
 * the transcript's width, whose rows are in the entry's block space, as `from`
 * is. The first row only: a wrapped row's continuation carries nothing in the
 * gutter (`R-SEL-016`).
 */
export function selectedElementRowsOf(
  placed: readonly Readonly<{ blockId: string; element: Readonly<{ id: string; rows: Readonly<{ from: number }> }> }>[],
  selected: readonly Readonly<{ blockId: string; rowId: string }>[],
  from: number,
  lineCount: number,
): ReadonlySet<number> {
  const rows = new Set<number>();
  if (selected.length === 0) return rows;
  const wanted = new Set(selected.map((s) => `${s.blockId}\u0000${s.rowId}`));
  for (const p of placed) {
    if (!wanted.has(`${p.blockId}\u0000${p.element.id}`)) continue;
    const at = p.element.rows.from - from;
    if (at >= 0 && at < lineCount) rows.add(at);
  }
  return rows;
}

/**
 * The rail's cell (C14 I58, ruling 68) — `▌` in `accent` on the selection
 * ground, or `|` where the rung is ASCII.
 *
 * **Never `inverse`, and that is why it is not the wash.** `selectionStyle`
 * answers `inverse` where there is no colour, and an inverted `▌` is a
 * right-half block: the mark would say a different thing at 1-bit than at every
 * other rung. So the rail takes the selection ground only where the ground is a
 * background, and at 1-bit it is the glyph upright beside an inverted row.
 *
 * **The ink through `tone(…, "selection")`**, the one path every renderer uses,
 * so a banded theme's rail is the band's ink (C10 I45, C14 I53) with nothing
 * here knowing which themes band.
 */
export function railCell(theme: ResolvedTheme, capabilities: TerminalCapabilities): string {
  const ground = selectionStyle(theme, capabilities);
  const style: Style = {
    ...tone("accent", theme, capabilities, "selection"),
    ...(ground.background === undefined ? {} : { background: ground.background }),
  };
  return paintSpans([{ text: glyphs(capabilities).rail, style }]);
}

/** Column 0 of a transcript row that carries no rail (C14 I57). */
export const RAIL_BLANK = " ";

/**
 * The frame's copy of an entry's lines, with the selected rows grounded
 * (C14 I40).
 *
 * **Returns a new array and never touches the one it was given**, which is the
 * whole of I40: the caller has already written `lines` into the render cache,
 * and the cache keys on nine axes of which the selection is none. A wash baked
 * into the stored lines would serve a selected frame to a later unselected
 * read — C22 I71's *correct frame, previous state*, the symptom whose report
 * says *it froze*.
 *
 * A tenth cache axis would also be correct, and would bust an entry's whole
 * slot on every keystroke in the mode: one rung coarser than the cost C22 I103
 * split `tick` out to avoid.
 */
export function washSelectedRows(
  lines: readonly string[],
  rows: ReadonlySet<number>,
  theme: ResolvedTheme,
  capabilities: TerminalCapabilities,
  width: number,
): readonly string[] {
  if (rows.size === 0) return lines;
  return lines.map((row, i) => (rows.has(i) ? washRow(row, theme, capabilities, width) : row));
}

/**
 * The rectangle's cells under the selection ground, on the frame's copy of an
 * entry's lines (C14 I60, I40).
 *
 * `rect`'s rows are the entry's block rows and `from` is the window's first, as
 * in {@link washedRowsOf}; its columns are entry-line cells, inclusive. **The
 * wash is {@link washRow} over the cells alone**, so the precedence and the
 * 1-bit rung are the block wash's and nothing here decides them; the cells
 * either side keep the style they were drawn in, because `sliceCells` opens a
 * tail with the style in effect where it starts. Returns the lines unchanged
 * where the rectangle has no row in the window, and never touches the array it
 * was given (I40).
 */
export function washRectCells(
  lines: readonly string[],
  rect: Readonly<{ fromRow: number; toRow: number; fromColumn: number; toColumn: number }>,
  from: number,
  theme: ResolvedTheme,
  capabilities: TerminalCapabilities,
): readonly string[] {
  const lo = rect.fromRow - from;
  const hi = rect.toRow - from;
  if (hi < 0 || lo >= lines.length) return lines;
  const amb = capabilities.ambiguousWidth;
  const left = rect.fromColumn;
  const right = rect.toColumn + 1;
  return lines.map((row, i) => {
    if (i < lo || i > hi) return row;
    const before = fitStyled(sliceCells(row, 0, left, amb), left, SGR_RESET, amb);
    const inner = washRow(sliceCells(row, left, right, amb), theme, capabilities, right - left);
    return `${before}${SGR_RESET}${inner}${sliceCells(row, right, Number.MAX_SAFE_INTEGER, amb)}`;
  });
}

/**
 * A whole row under the selection ground (C14 I39, I41, `R-SEL-003`,
 * `R-SEL-006`).
 *
 * **Over the finished line, which is what makes the precedence an order.** The
 * focus mark and a patch's own inks are already in the text; this changes the
 * ground under them, so *selection wins the ground while focus keeps its mark*
 * is the sequence of two operations rather than a case in a table.
 *
 * L1's ladder, not a private copy: the wash, else `inverse` where there is no
 * colour (C09 §paint) — so 1-bit needs no rung of its own here either.
 */
export function washRow(
  row: string,
  theme: ResolvedTheme,
  capabilities: TerminalCapabilities,
  width: number,
): string {
  // **A band's ink is total** (C14 I53, C10 I45): on a theme that bands its
  // selection, the wash carries the band's ink as well as its ground, so a
  // page ink never lands on the band. `tone(…, "selection")` is the one path
  // to that ink — `inkOn` answers the band before any slot.
  const band = isBand(theme, "selection", capabilities) ? tone("default", theme, capabilities, "selection") : {};
  const wash = sgr({ ...selectionStyle(theme, capabilities), ...band });
  // **Fitted by display cells, escapes whole** (C09 I63). `cells` counts an
  // escape's bytes, so a styled row measured wider than it was and got no pad —
  // the ground stopped at the text on every row that carried a colour.
  const fitted = fitStyled(row, width, SGR_RESET, capabilities.ambiguousWidth);
  if (wash === "") return fitted;
  // **Re-opened after every sequence, not laid once under the row** (C14 I52).
  // Each span of a finished line closes with a reset, so one opening lasted to
  // the first of them; and a span opening its own ground — a focused row's —
  // displaced the wash, which is the precedence inverted. `based` re-asserts
  // only after a reset because what sits above a base may displace it; the
  // selection is the top ground, so nothing may.
  return `${wash}${fitted.replace(sgrPattern(), (seq) => `${seq}${wash}`)}${SGR_RESET}`;
}

/** The wash, or reverse video where there is no colour to wash with (§4b). */
function promptRegion(frame: Composed, deps: PaintDeps, width: number): readonly string[] {
  // **Inside `body`, and separate from it** (C28 §2). `deps.promptRows()` and
  // `deps.promptCursor()` below are both `editor.layout(width, gutter)` behind
  // a thunk with no memo, so the prompt's cost is the one part of `body` a
  // reader has a specific question about and no span could answer.
  using _s = deps.probe?.span("prompt") ?? NO_SPAN;
  const cap = frame.promptRows;
  const replaced = deps.promptReplaced();
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

  // **The chips, mapped through the same window** (I62) — a ground on a row the
  // window does not show is a ground on someone else's row.
  const chips = new Map<number, CellSpan[]>();
  for (const span of deps.promptChips()) {
    if (!shows(window, span.row)) continue;
    const at = span.row - window.first + window.offset;
    (chips.get(at) ?? chips.set(at, []).get(at) ?? []).push(span);
  }
  const chipStyle = chips.size === 0 ? undefined : chipWell(deps.theme, deps.capabilities);

  const out: string[] = [];
  for (let i = 0; i < cap; i += 1) {
    const body = windowed[i] ?? "";
    const gutter = replaced
      ? ""
      : i === 0
        ? promptFor(deps.capabilities)
        : " ".repeat(PROMPT_GUTTER.cont); // cells-ok — the gutter's own width
    const squared = exact(gutter + body, width);
    const span = spans.get(i);
    const onRow = chips.get(i);
    if (span === undefined && onRow === undefined) {
      out.push(squared);
      continue;
    }
    // **One pass over the row, because the two grounds meet on it.** Painting
    // the wash and then the chips would measure SGR bytes as cells the second
    // time round; `styled` cuts the row once at every boundary, and
    // `chipRanges` has already given the selection its cells (`R-STA-002`).
    const ranges = [
      ...(onRow === undefined || chipStyle === undefined ? [] : chipRanges(onRow, span, chipStyle)),
      ...(span === undefined ? [] : [{ from: span.from, to: span.to, style: selectionStyle(deps.theme, deps.capabilities) }]),
    ];
    out.push(styled(squared, ranges, deps.capabilities));
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
  // **Not over a question** (C23 I74): the spinner marks the token being
  // completed at the caret, and there is no caret while the prompt is replaced.
  if (row !== undefined && !replaced && deps.spinning()) {
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
 * C15's placed layers, bracketed (C28 I39).
 *
 * **One layout per frame, shared by the rows and the cursor** (C22 I96). The
 * caller lays the overlays out once and hands the result to both `paint` and
 * `cursorFor`; each defaults to laying them out itself only so a caller holding
 * one and not the other still gets an answer. It used to run twice per frame —
 * once for the composite and once for the cursor — which C28 T1.61 asserted on
 * purpose as the disagreement P11 named, and the two layouts were of the same
 * region against the same overlay set, so the second could only ever agree
 * with the first or be a defect.
 *
 * **One wrapper for every call site**, so `spans.overlays.count` is the number
 * of times the layout actually ran: a per-call-site span would report two
 * names each firing once, which is the same fact written so that nobody
 * notices it.
 */
export function placedLayers(deps: PaintDeps): readonly Placed[] {
  using _s = deps.probe?.span("overlays") ?? NO_SPAN;
  return deps.overlays();
}

/** The screen's base, or the empty string where nothing is painted. */
function baseSequence(deps: PaintDeps): string {
  if (deps.suppressBackground()) return "";
  return sgr(resolveBase(deps.theme, deps.capabilities));
}

export function paint(
  frame: Composed,
  deps: PaintDeps,
  placed: readonly Placed[] = placedLayers(deps),
): readonly string[] {
  // **The `draw` phase, and `using` is fine here** (C28 I39). F867's argument
  // against `using` is about a wrapper entered once per block — an array
  // allocation is invisible beside a 2 ms plot and dominates a rule's 220 ns
  // measure. This runs once per frame.
  using _paint = deps.probe?.span("paint") ?? NO_SPAN;
  if (!heightsSum(frame)) {
    throw new FrameError(
      `frame heights do not sum to ${String(frame.size.rows)} rows: ` +
        `header ${String(HEADER_ROWS)} + rule ${String(HEADER_RULE_ROWS)} + viewport ${String(frame.region.height)} + ` +
        `rules 2 + prompt ${String(frame.promptRows)} + footer ${String(frame.footerRows)}`,
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
  // **`assemble` covers building the rows as well as compositing them**, because
  // the region calls below are arguments and run inside it either way. Naming it
  // for the narrower half would put the wider cost under a name that denies it.
  using _assemble = deps.probe?.span("assemble") ?? NO_SPAN;

  // **The parts, named** (C28 §2, F936). `assemble` was 58 % of a frame's work
  // with nothing under it, which is a measurement that names the file and not
  // the work. The arguments below are hoisted into locals for no reason but
  // that: an argument evaluated inside a call cannot be bracketed separately
  // from it, so the split is what makes the three costs distinguishable at all.
  let rows: readonly string[];
  {
    using _body = deps.probe?.span("body") ?? NO_SPAN;
    rows = [
      ...region(frame.header, HEADER_ROWS, width, deps, "header"),
      // **The header's rule** (I87, §6l.7) — the same row the prompt's two are,
      // so the header and the region's first row do not read as one block.
      rule(width, deps),
      ...transcript(frame, deps, width),
      // **Two rules, always** (I81) — the row above the prompt and the row
      // below it, whatever the footer holds. The lower one is drawn with a
      // footer of zero rows too: a frame whose bottom edge moved with whether
      // the app returned a block would flicker on content (§6l.2 row 3).
      // **The upper rule carries the label; the other two stay bare** (I111,
      // §6l.10) — *two rules with two labels is a header, and the header
      // already exists*.
      rule(width, deps, frame.label),
      ...promptRegion(frame, deps, width),
      rule(width, deps),
      // **The composed height, not `1`** (I80, I82). `region()` truncates to it
      // and pads to it, so a footer taller than `MAX_FOOTER_ROWS` shows its top
      // (§6l.2 row 5) and one of zero rows takes nothing.
      ...region(frame.footer, frame.footerRows, width, deps, "footer"),
    ];
  }

  let lines: readonly string[];
  {
    using _composite = deps.probe?.span("composite") ?? NO_SPAN;
    lines = composite(rows, placed, {
      registry: deps.registry,
      theme: deps.theme,
      capabilities: deps.capabilities,
      ...(deps.chrome === undefined ? {} : { chrome: deps.chrome }),
      regionTop: frame.region.top,
      region: frame.overlayRegion,
      // The frame's width, not the region's (I109): the rows come back padded
      // to what the paint built them at.
      columns: width,
      ...(deps.scratch === undefined ? {} : { scratch: deps.scratch }),
      ...(deps.layerScroll === undefined ? {} : { layerScroll: deps.layerScroll }),
      ...(deps.layerView === undefined ? {} : { layerView: deps.layerView }),
    });
  }

  let painted: readonly string[];
  {
    using _based = deps.probe?.span("based") ?? NO_SPAN;
    painted = based(lines, baseSequence(deps));
  }

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
export function cursorFor(
  frame: Composed,
  deps: PaintDeps,
  placed: readonly Placed[] = placedLayers(deps),
): Cell | null {
  // **The layout the rows were composited from** (C22 I96) — the top layer
  // here is the top layer `composite` drew, by identity and not by agreement.
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

  // **Below the upper rule** (I81) — `promptTop` is the one place that adds it.
  return { row: promptTop(frame) + within, col: cell.col };
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
  // **Two spans, because splitting `assemble` left 48 % sitting in `body`**
  // (C28 §2, F936). `visible` is the work — C14 selecting and C09 rendering —
  // and this function's own self time is then the `exact()` loop below, which
  // is a styled-width fit per row per frame. Measured apart from what it pads
  // at last: 69 ms of self time over 34 frames after F938, 60 µs a row, and
  // the row was the reason — one `│` in every patch gutter sent the whole
  // row through the segmenter; 14 ms once C09 I63 asked it only for clusters
  // (F955).
  using _t = deps.probe?.span("transcript") ?? NO_SPAN;
  let rows: readonly string[];
  {
    using _v = deps.probe?.span("visible") ?? NO_SPAN;
    rows = deps.transcriptRows();
  }

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
  return withTranscriptBar(out, frame, deps, width);
}

/**
 * The transcript's bar, on the margin column (C14 I62, `R-BLK-164`).
 *
 * **The margin is the one column no row writes** (C22 I109), so the bar costs
 * no reflow and no measurement: each region row is already `width` cells, and
 * its last cell is replaced. `scrollbarColumn` answers `null` for a transcript
 * that fits — *a bar that cannot move is decoration* — and nothing changes.
 * The set and the arithmetic are a `scroll` box's own (C09 §7f), and the thumb
 * takes `accent` while focus is in the transcript, `muted` otherwise
 * (`R-BLK-160`), the whole column at one tone as §021 draws it.
 */
function withTranscriptBar(
  rows: string[],
  frame: Composed,
  deps: PaintDeps,
  width: number,
): string[] {
  const scroll = deps.transcriptBar?.();
  if (scroll === undefined || width < 2) return rows;
  const column = scrollbarColumn(frame.region.height, scroll.totalRows, scroll.topRow, scrollbarSet(deps.capabilities));
  if (column === null) return rows;
  const ink = sgr(resolveTone(scroll.focused ? "accent" : "muted", deps.theme, deps.capabilities));
  const amb = deps.capabilities.ambiguousWidth;
  const inner = width - 1; // cells-ok — a width less its margin column
  // `fitStyled` after the cut: a wide cluster straddling the margin is cut
  // whole and padded, so the bar is always the row's last cell.
  return rows.map(
    (row, i) =>
      `${fitStyled(sliceCells(row, 0, inner, amb), inner, SGR_RESET, amb)}${SGR_RESET}${ink}${column[i] ?? ""}${SGR_RESET}`,
  );
}
