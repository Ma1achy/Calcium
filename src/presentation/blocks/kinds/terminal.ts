/**
 * C09 §4, §5 — a child's screen (C04 §3i).
 *
 * **The one kind that emits its text without stripping** (C09 I56), and the one
 * carrying literal colour. Both are paid for by C04 I110's gate rather than
 * assumed: a `Terminal` whose line text holds a control is refused at
 * construction and at the far side, so what reaches here is safe to write.
 */
import type { ReactElement } from "react";

import { atLeastOne, normaliseWidth } from "../../../data/viewmodel/index.js";
import type { Terminal, TerminalLine } from "../../../data/viewmodel/index.js";
import { cells, truncate } from "../../text.js";
import { degradeColour } from "../../theme/colormap.js";
import { NO_STYLE } from "../../theme/index.js";
import type { Style } from "../../theme/types.js";
import { glyphs } from "../glyphs.js";
import { paint, rows, tone, type Span } from "../paint.js";
import type { BlockDefinition, RenderContext, Windowed } from "../types.js";

/**
 * The marker row a capped screen draws, as its first line (C04 §3i.1).
 *
 * **The lead is the residue slot, resolved** (C09 I22): the same mark the
 * container's own residue row uses, so a screen's *gone for good* and a box's
 * *scroll to see* read as one family, and both flatten together at ASCII.
 */
const markerText = (dropped: number, caps: RenderContext["capabilities"]): string =>
  `${glyphs(caps).residue} ${dropped.toLocaleString("en-GB")} lines dropped at the cap`;

/** A run's style, with the child's colours brought down C10's ladder (C10 I38). */
function styleOf(
  run: NonNullable<TerminalLine["runs"]>[number],
  ctx: RenderContext,
): Style {
  const fg = run.fg === undefined ? undefined : degradeColour(run.fg, ctx.capabilities);
  const bg = run.bg === undefined ? undefined : degradeColour(run.bg, ctx.capabilities);
  return {
    ...(fg === undefined ? {} : { colour: fg }),
    ...(bg === undefined ? {} : { background: bg }),
    ...(run.bold === true ? { bold: true } : {}),
    ...(run.dim === true ? { dim: true } : {}),
    ...(run.italic === true ? { italic: true } : {}),
    ...(run.underline === true ? { underline: true } : {}),
    ...(run.inverse === true ? { inverse: true } : {}),
    // C10 has no strikethrough channel; the attribute is carried in the block
    // and dropped here rather than silently mapped onto another mark.
  };
}

/**
 * One screen line as spans: the runs, the gaps between them, and the cursor.
 *
 * **The cursor is drawn `inverse` at every arm including 1-bit** (C09 I56): it
 * is the one thing a static log cannot show, so it survives where a colour does
 * not. It is appearance and never geometry — `measure` does not see it.
 */
function spansOf(
  line: TerminalLine,
  cursorCol: number | null,
  ctx: RenderContext,
): readonly Span[] {
  const out: Span[] = [];
  const push = (text: string, style: Style | undefined): void => {
    if (text === "") return;
    out.push(style === undefined ? { text } : { text, style });
  };
  let at = 0;
  for (const run of line.runs ?? []) {
    push(line.text.slice(at, run.from), NO_STYLE);
    push(line.text.slice(run.from, run.to), styleOf(run, ctx));
    at = run.to;
  }
  push(line.text.slice(at), NO_STYLE);
  if (cursorCol === null) return out;

  // The cursor's cell, re-split out of whichever span holds it. A cell past the
  // end of the text is a space: a child that has just returned is writing at a
  // column no character occupies yet.
  const marked: Span[] = [];
  let offset = 0;
  let placed = false;
  for (const span of out) {
    const start = offset;
    const end = offset + span.text.length; // cells-ok — a code-unit offset: the cursor's column indexes the emulator's cells and the runs are code-unit addressed (C04 I111)
    offset = end;
    if (placed || cursorCol < start || cursorCol >= end) {
      marked.push(span);
      continue;
    }
    const before = span.text.slice(0, cursorCol - start); // cells-ok — code units, as above
    const cell = span.text.slice(cursorCol - start, cursorCol - start + 1);
    const after = span.text.slice(cursorCol - start + 1);
    if (before !== "") marked.push(span.style === undefined ? { text: before } : { text: before, style: span.style });
    marked.push({ text: cell, style: { ...(span.style ?? {}), inverse: true } });
    if (after !== "") marked.push(span.style === undefined ? { text: after } : { text: after, style: span.style });
    placed = true;
  }
  if (!placed) {
    const gap = cursorCol - offset;
    if (gap > 0) marked.push({ text: " ".repeat(gap), style: NO_STYLE });
    marked.push({ text: " ", style: { inverse: true } });
  }
  return marked;
}

export const terminalDefinition: BlockDefinition<Terminal> = {
  kind: "terminal",

  /**
   * C09 I55 — one row per line, plus the marker row when the cap has bitten.
   *
   * **Never wrapped**: the child chose its wrap points against a width the
   * emulator was told, and re-wrapping them would double-wrap a screen already
   * laid out — the row that is one line of a program's output would silently
   * become two, and a tail that reflows is a tail nobody can read.
   */
  measure: (block: Terminal): number =>
    atLeastOne(block.lines.length + (block.dropped === undefined ? 0 : 1)), // cells-ok

  /**
   * C09 §6b — rows `[from, to)`, as a smaller screen.
   *
   * **The kind that most needs a window**: a 2,000-line scrollback painted whole
   * is F423's 913 ms. A line is a line and nothing is derived from lines outside
   * the slice, so the window is exact rather than merely the right height — and
   * the marker row is content, so a window that starts at 0 includes it.
   */
  window: (block: Terminal, _width: number, from: number, to: number): Windowed => {
    const marker = block.dropped === undefined ? 0 : 1;
    const total = block.lines.length + marker; // cells-ok
    const lo = Math.max(0, Math.min(Math.trunc(from), total)); // cells-ok
    const hi = Math.max(lo + 1, Math.min(Math.trunc(to), total)); // cells-ok
    // A window below the marker row drops it, and the block that results has no
    // `dropped`: the count belongs to the row, and a slice that cannot show the
    // row must not report the count either.
    const keepsMarker = marker === 1 && lo === 0;
    const sliceFrom = Math.max(0, lo - marker);
    const sliceTo = Math.max(sliceFrom, hi - marker);
    // The marker's count belongs to its row: a slice that cannot show the row
    // must not report the count either, so `dropped` is rebuilt rather than
    // spread — `dropped: undefined` is still a key, and *declared by presence*
    // is what the renderer and C04's gate both read (C04 I113).
    const { dropped: _dropped, cursor: _cursor, ...rest } = block;
    const windowed: Terminal = {
      ...rest,
      lines: block.lines.slice(sliceFrom, sliceTo),
      ...(keepsMarker && block.dropped !== undefined ? { dropped: block.dropped } : {}),
      // The cursor indexes the block's own lines, and a window re-bases them.
      ...(block.cursor === undefined
        ? {}
        : { cursor: { line: block.cursor.line - sliceFrom, col: block.cursor.col } }),
    };
    return Object.freeze({ block: windowed, skipRows: 0, dropRows: 0 });
  },

  render(block: Terminal, ctx: RenderContext): ReactElement {
    ctx.probe?.gauge("terminal.lines", block.lines.length); // cells-ok — a count of items, not a display width
    const width = normaliseWidth(ctx.width);
    const painted: string[] = [];

    if (block.dropped !== undefined) {
      painted.push(
        paint([
          {
            text: truncate(markerText(block.dropped, ctx.capabilities), width, ctx.capabilities),
            style: tone("meta", ctx.theme, ctx.capabilities),
          },
        ]),
      );
    }

    block.lines.forEach((line, index) => {
      const cursorCol =
        block.cursor !== undefined && block.cursor.line === index ? block.cursor.col : null;
      const spans = spansOf(line, cursorCol, ctx);
      // Truncation, never wrapping (I55). A line longer than the box loses its
      // tail, which is what `logs` does and for the same reason.
      let room = width;
      const fitted: Span[] = [];
      for (const span of spans) {
        if (room <= 0) break;
        const measured = cells(span.text, ctx.capabilities.ambiguousWidth);
        if (measured <= room) {
          fitted.push(span);
          room -= measured;
          continue;
        }
        const cut = truncate(span.text, room, ctx.capabilities);
        fitted.push(span.style === undefined ? { text: cut } : { text: cut, style: span.style });
        room = 0;
      }
      painted.push(paint(fitted));
    });

    return rows(painted);
  },
};
