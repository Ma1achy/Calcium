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

import { renderSequenceToLines } from "../testing/index.js";
import { fitStyled, hardWrapCells } from "../presentation/text.js";
import { SGR_RESET } from "../terminal/escapes.js";
import { PROMPT, PROMPT_GUTTER } from "./config.js";
import { composite } from "./composite.js";
import { heightsSum, type Composed } from "./frame.js";
import type { Block } from "../data/viewmodel/index.js";
import type { Placed } from "../viewport/overlay/index.js";
import type { Cell } from "../interaction/editor/index.js";
import type { BlockRegistry } from "../presentation/blocks/index.js";
import type { ResolvedTheme } from "../presentation/theme/index.js";
import type { TerminalCapabilities } from "../terminal/capabilities.js";

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
  /** Whether the prompt is where keys are going — C16's derived focus. */
  promptFocused: () => boolean;
}>;

/** The elision marker S01 §3 puts on a windowed prompt's edges. */
const ELISION = "⋯";

export class FrameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FrameError";
  }
}

/**
 * Pad or truncate to exactly `width` **display** cells.
 *
 * **Both directions matter and only one is obvious.** A short line leaves the
 * previous frame's cells showing at the end of the row, which reads as
 * corruption; a long one wraps, which *is* corruption.
 *
 * **`displayCells`, not `cells`, and the difference was a live defect.** These
 * lines come from Ink and carry SGR. `stripControl` drops the ESC byte and
 * keeps `[38;5;241m`, which is printable text — so `cells()` measured every
 * themed chrome row eleven cells too wide per colour change, padded to 80
 * counted-with-escapes, and left a visible row of about 38 with the previous
 * frame showing across the rest. Truncating with it would have been worse: the
 * cut lands inside an escape and the colour bleeds down every row below.
 *
 * Delegated to C09 rather than solved here — that is where display width is
 * decided, and a second answer is C09 I1's divergence in the place that moves
 * the whole frame.
 */
export function exact(text: string, width: number): string {
  return fitStyled(text, width, SGR_RESET);
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
export function commandRows(command: string, width: number): readonly string[] {
  if (command === "") return [];
  const body = Math.max(1, width - PROMPT_GUTTER.first);
  const wrapped = hardWrapCells(command, body);
  return wrapped.map((row, i) =>
    (i === 0 ? PROMPT : " ".repeat(PROMPT_GUTTER.cont)) + row,
  );
}

function promptWindow(frame: Composed, rows: readonly string[]): PromptWindow {
  const cap = frame.promptRows;

  // **A cap of one shows the last row and no marker** (S01 §3, commitment 14).
  // The window below is the marker plus the rows after it, and at `cap = 1`
  // there are none: the slice is empty and the prompt paints as `⋯` alone, with
  // the typed command nowhere on the screen. An elision that elides everything
  // annotates nothing, and one row of the command beats a marker reporting that
  // a command exists.
  if (rows.length <= cap) return { rows, first: 0, offset: 0 };
  if (cap === 1) return { rows: [rows[rows.length - 1] ?? ""], first: rows.length - 1, offset: 0 };

  // Around the end rather than around the cursor, until C17's `cursorCell` is
  // threaded through: the cursor is at the end for every case but a mid-buffer
  // edit, and showing the wrong window is worse than showing the last rows.
  // Named here so it is a known simplification rather than a silent one.
  const first = rows.length - (cap - 1);
  return { rows: [ELISION, ...rows.slice(first)], first, offset: 1 };
}

/**
 * Which of the editor's rows the prompt is showing, and where they land.
 *
 * `first` is the index in the editor's full layout of the first *content* row
 * in the window, and `offset` is how many painted rows precede it — one when
 * the elision marker is drawn, zero otherwise. The cursor needs both and the
 * paint needs neither, which is why they are returned rather than inlined.
 */
type PromptWindow = Readonly<{
  rows: readonly string[];
  first: number;
  offset: number;
}>;

function promptRegion(frame: Composed, deps: PaintDeps, width: number): readonly string[] {
  const cap = frame.promptRows;
  const windowed = promptWindow(frame, deps.promptRows()).rows;

  const out: string[] = [];
  for (let i = 0; i < cap; i += 1) {
    const body = windowed[i] ?? "";
    const gutter = i === 0 ? PROMPT : " ".repeat(PROMPT_GUTTER.cont);
    out.push(exact(gutter + body, width));
  }
  return out;
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
export function paint(frame: Composed, deps: PaintDeps): readonly string[] {
  if (!heightsSum(frame)) {
    throw new FrameError(
      `frame heights do not sum to ${String(frame.size.rows)} rows: ` +
        `header 1 + viewport ${String(frame.region.height)} + prompt ${String(frame.promptRows)} + footer 1`,
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
    },
  );

  if (lines.length !== frame.size.rows) {
    throw new FrameError(
      `frame is ${String(lines.length)} rows for a ${String(frame.size.rows)}-row terminal`,
    );
  }
  return Object.freeze(lines);
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
    if (top.cursor === undefined) return null;
    return {
      row: frame.region.top + top.top + top.cursor.row,
      col: top.left + top.cursor.col,
    };
  }

  if (!deps.promptFocused()) return null;

  const cell = deps.promptCursor();
  const window = promptWindow(frame, deps.promptRows());
  const within = cell.row - window.first + window.offset;
  if (within < 0 || within >= frame.promptRows) return null;

  return { row: frame.region.top + frame.region.height + within, col: cell.col };
}

/** C14 selected these at this width; they are padded, never re-measured. */
function transcript(frame: Composed, deps: PaintDeps, width: number): readonly string[] {
  const rows = deps.transcriptRows();
  const out: string[] = [];
  // Bottom-aligned: a half-full transcript sits above the prompt, not under the
  // header, because the prompt is where the eye is and content should grow
  // towards it.
  const blank = Math.max(0, frame.region.height - rows.length);
  for (let i = 0; i < blank; i += 1) out.push(" ".repeat(width));
  for (let i = 0; i < frame.region.height - blank; i += 1) {
    out.push(exact(rows[i] ?? "", width));
  }
  return out;
}
